// Single requestAnimationFrame scheduler for the live game.
//
// This module replaces every setTimeout chain the old imperative driver used to
// sequence phases. One rAF loop runs a fixed-timestep accumulator: each frame's
// real elapsed time is scaled by the speed multiplier and consumed in fixed
// 16.67ms (60Hz) steps, so pacing is speed-scalable and frame-rate independent.
//
// Per-phase tick accumulators own the engine clock: the loop dispatches
// `{ type: "tick" }` (and AI decisions) at each phase's cadence, and NOTHING
// else in the app dispatches ticks. That single-owner property is the tick
// ownership invariant (recorded on `window.__tickOwnership` for the Playwright
// spec): with the setTimeout chains gone, the scene manager is structurally the
// only scheduler, so ticks stay monotonic and phases advance in order.
//
// The store is the live path: the loop reads the current immutable snapshot
// through `store.state` each frame (a plain read, no reactive subscription) and
// mutates only by calling `store.dispatch`, which funnels every transition
// through the pure reducer. AI turns still decide via the `decide*` functions;
// only their timing moved onto this loop.

import type { GameStore } from "../game_store";
import type { AuctionPayload, GameState, LandAuctionPayload } from "../../engine/game_state";
import type { Resource } from "../../engine/player";
import { currentPicker } from "../../engine/land_grant";
import { decideLandGrantAction, decideLandAuctionAction } from "../../ai/land_ai";
import { decideDevelopAction } from "../../ai/develop_ai";
import { decideAuctionActions } from "../../ai/auction_ai";
import { PERSONAL_EVENT_BANNER_HOLD_MS } from "../solid/event_banner";

/** Player id of the single human player; ids 1..3 are AI. */
const HUMAN_ID = 0;

/** Fixed simulation step: 60Hz. Real elapsed time is consumed in these units. */
const STEP_MS = 1000 / 60;

/** Largest real frame delta consumed per frame, so a backgrounded tab does not
 * fast-forward an unbounded number of steps when it regains focus. */
const MAX_FRAME_MS = 100;

/** Delay between successive AI decision steps (land grant and develop). */
const AI_STEP_MS = 400;

/**
 * Dwell time before the land-grant sweep cursor advances to the next free
 * plot, matching planet_mule's `GameData.landGrantPlotDuration` (18 frames at
 * `Properties.framesPerSecond` = 60fps = 300ms; see docs/RULE_SOURCES.md
 * "Land grant: engine-driven sweep cursor"). Scaled by the relaxed-timer
 * multiplier alongside `DEVELOP_TICK_MS`, since the same reflex-timing
 * concern applies to both.
 */
const LAND_GRANT_SWEEP_TICK_MS = 300;

/**
 * Delay between human develop-turn ticks. Anchored to the engine's PM-fidelity
 * mapping (`DEVELOP_TICKS_FULL` = 50 ticks = planet_mule's `developmentMaxTime`
 * 47.5s; see `docs/RULE_SOURCES.md`): 47.5s / 50 ticks = 950ms/tick, so a
 * fully-fed turn drains in 47.5s real time, matching PM. `?speed=` scales this
 * (for example `speed=8` -> ~119ms/tick, used by the Playwright/E2E suites).
 */
const DEVELOP_TICK_MS = 950;

/** How long the production yields interstitial stays up before auto-advancing. */
const PRODUCTION_PAUSE_MS = 2000;

/** Delay between auction ticks (price movement plus trade matching). */
const AUCTION_TICK_MS = 500;

/** Pause on the finished auction panel before auto-advancing to the next good. */
const AUCTION_FINISHED_PAUSE_MS = 1500;

/** Dev-only tick-ownership record, exposed for the invariant Playwright spec. */
interface TickOwnershipDebug {
  /** Distinct scheduler names that have dispatched a tick (must stay length 1). */
  readonly owners: string[];
  /** Total ticks dispatched so far (monotonic non-decreasing). */
  ticks: number;
  /** Ordered list of distinct phase kinds observed, in the order entered. */
  readonly phaseSequence: string[];
}

declare global {
  interface Window {
    __tickOwnership?: TickOwnershipDebug;
  }
}

/** The store the loop drives; null when no loop is running. */
let activeStore: GameStore | null = null;

/**
 * Per-frame visual subscribers invoked once every rAF frame the loop runs.
 * These drive presentation-only motion (auction avatar tweening, sprite frame
 * swaps) at the display refresh rate, decoupled from the fixed-timestep sim
 * clock. They never dispatch engine ticks, so the tick-ownership invariant
 * (this module is the sole tick owner) is untouched.
 */
const frameSubscribers = new Set<(now: number) => void>();

/** Speed multiplier: real elapsed time is scaled by this before consumption. */
let speedMultiplier = 1;

/**
 * Multiplier applied to the human-reflex-timing cadences (develop ticks, the
 * land-grant sweep) when the relaxed-timer option is on. UI-side pacing only:
 * engine tick budgets (`DEVELOP_TICKS_FULL`/`DEVELOP_TICKS_MIN`) are
 * unchanged, so a relaxed game still spends the same tick counts, just over
 * more real time. Chosen value: 2x is a generous, easy-to-reason-about
 * doubling of both cadences, not sim-tuned.
 */
const RELAXED_TIMER_MULTIPLIER = 2;

/** Whether the relaxed-timer option is on for the running game. */
let relaxedTimerEnabled = false;

/** rAF handle for the running loop, or 0 when stopped. */
let rafHandle = 0;

/** Timestamp of the previous frame, for computing real elapsed time. */
let lastFrameTime = 0;

/** Leftover scaled sim-time not yet consumed into a whole fixed step. */
let stepAccumulator = 0;

/** Sim-time elapsed in the current phase signature, drives per-phase cadence. */
let phaseTimerMs = 0;

/** The phase signature at the last step; a change resets `phaseTimerMs`. */
let lastPhaseSignature = "";

/** The good whose auction the human last saw, so role commitment resets per good. */
let lastAuctionGood: Resource | null = null;

/** True once the human has declared a role for `lastAuctionGood`. */
let humanAuctionCommitted = false;

/**
 * Sim-time elapsed since the land-grant sweep cursor last advanced,
 * decoupled from `phaseTimerMs` (which resets on every picker change, see
 * `phaseSignature`'s land_grant case) so the sweep keeps a steady cadence
 * across pick transitions instead of restalling on every claim/pass.
 */
let landGrantSweepTimerMs = 0;

//============================================
/**
 * The develop-tick cadence, scaled by the relaxed-timer multiplier when on.
 *
 * @returns The current develop-tick interval in milliseconds.
 */
function developTickMs(): number {
  return relaxedTimerEnabled ? DEVELOP_TICK_MS * RELAXED_TIMER_MULTIPLIER : DEVELOP_TICK_MS;
}

//============================================
/**
 * The land-grant sweep dwell cadence, scaled by the relaxed-timer multiplier
 * when on.
 *
 * @returns The current sweep-cursor interval in milliseconds.
 */
function landGrantSweepTickMs(): number {
  return relaxedTimerEnabled
    ? LAND_GRANT_SWEEP_TICK_MS * RELAXED_TIMER_MULTIPLIER
    : LAND_GRANT_SWEEP_TICK_MS;
}

//============================================
/**
 * Start (or restart) the single rAF loop driving `store`. Any previously
 * running loop is stopped first, so exactly one loop and one tick owner ever
 * exist. Resets all per-phase accumulators and the auction commitment.
 *
 * @param store - The live game store the loop reads and dispatches into.
 * @param speed - Speed multiplier for the fixed-timestep clock (default 1).
 * @param relaxedTimer - Whether the relaxed-timer option is on (default false).
 */
export function startSceneLoop(store: GameStore, speed = 1, relaxedTimer = false): void {
  stopSceneLoop();
  activeStore = store;
  speedMultiplier = speed > 0 ? speed : 1;
  relaxedTimerEnabled = relaxedTimer;
  stepAccumulator = 0;
  phaseTimerMs = 0;
  landGrantSweepTimerMs = 0;
  lastPhaseSignature = "";
  lastAuctionGood = null;
  humanAuctionCommitted = false;
  resetTickOwnership();
  lastFrameTime = performance.now();
  rafHandle = requestAnimationFrame(onFrame);
}

//============================================
/**
 * Stop the running loop, if any. Safe to call when no loop is active.
 */
export function stopSceneLoop(): void {
  if (rafHandle !== 0) {
    cancelAnimationFrame(rafHandle);
    rafHandle = 0;
  }
  activeStore = null;
}

//============================================
/**
 * Subscribe a callback to every rAF frame the scene loop runs, for
 * presentation-only visual updates (auction avatar tweening, sprite frame
 * swaps) that must run at display refresh rate independent of the sim clock.
 * The callback receives the high-resolution frame timestamp. Returns an
 * unsubscribe function; call it on scene teardown.
 *
 * Subscribers never dispatch engine ticks, so the single-owner tick invariant
 * is preserved: this module stays the only caller of
 * `store.dispatch({ type: "tick" })`.
 *
 * @param callback - Invoked once per animation frame with the frame timestamp.
 * @returns A function that removes the subscription.
 */
export function onSceneFrame(callback: (now: number) => void): () => void {
  frameSubscribers.add(callback);
  return () => {
    frameSubscribers.delete(callback);
  };
}

//============================================
/**
 * Note that the human has declared a role for the current good's auction, so
 * the auction clock may start running even if that role is "sit out". The
 * auction UI calls this when a role button is pressed.
 */
export function notifyAuctionCommit(): void {
  humanAuctionCommitted = true;
}

//============================================
/**
 * rAF frame callback: consume the real elapsed time (scaled by speed) in fixed
 * steps, then queue the next frame.
 *
 * @param now - High-resolution timestamp supplied by requestAnimationFrame.
 */
function onFrame(now: number): void {
  if (activeStore === null) {
    return;
  }
  const realDelta = Math.min(now - lastFrameTime, MAX_FRAME_MS);
  lastFrameTime = now;
  stepAccumulator += realDelta * speedMultiplier;
  // Consume whole fixed steps; each advances the phase clock and may fire the
  // current phase's scheduled action.
  while (stepAccumulator >= STEP_MS) {
    stepAccumulator -= STEP_MS;
    step(activeStore);
  }
  // Drive presentation-only per-frame subscribers (avatar tweening) after the
  // sim steps, so they read the freshest state. These never dispatch ticks.
  for (const subscriber of frameSubscribers) {
    subscriber(now);
  }
  rafHandle = requestAnimationFrame(onFrame);
}

//============================================
/**
 * Advance the simulation by one fixed step: reset the phase clock when the
 * phase signature changes, then run the current phase's scheduling policy.
 *
 * @param store - The live game store.
 */
function step(store: GameStore): void {
  const state = store.state;
  const signature = phaseSignature(state);
  if (signature !== lastPhaseSignature) {
    lastPhaseSignature = signature;
    phaseTimerMs = 0;
  }
  phaseTimerMs += STEP_MS;
  // The sweep-cursor accumulator runs independently of phaseTimerMs (see its
  // declaration comment) for as long as land_grant is the active phase, and
  // clears the moment the phase changes so a later round starts fresh.
  if (state.phase.kind === "land_grant") {
    landGrantSweepTimerMs += STEP_MS;
  } else {
    landGrantSweepTimerMs = 0;
  }
  schedulePhase(store, state);
}

//============================================
/**
 * A per-phase signature that changes whenever the scheduling context changes
 * (a new picker, a new active develop player, a new auction good or tick, or a
 * finished flag). A change resets the phase clock so each scheduled action
 * waits a full cadence from the state it acts on. The auction signature omits
 * price and intent so held-key intent dispatches do not reset the tick clock.
 *
 * @param state - Current game state.
 * @returns The scheduling signature string.
 */
function phaseSignature(state: GameState): string {
  const phase = state.phase;
  switch (phase.kind) {
    case "land_grant":
      return `land_grant|${currentPicker(phase.payload)}`;
    case "land_auction":
      return `land_auction|${phase.payload.row}|${phase.payload.col}|${phase.payload.tick}|${phase.payload.finished}`;
    case "develop":
      return `develop|${phase.payload.queueIndex}|${phase.payload.activePlayer}`;
    case "production":
      return "production";
    case "auction":
      return `auction|${phase.payload.good}|${phase.payload.tick}|${phase.payload.finished}`;
    case "scoring":
      return "scoring";
    default:
      return phase.kind;
  }
}

//============================================
/**
 * Run the current phase's scheduling policy: fire the phase's next timed action
 * once its cadence has elapsed. Human decision points (a human land-grant pick,
 * an uncommitted auction role) leave the clock idle and wait for input.
 *
 * @param store - The live game store to dispatch into.
 * @param state - Current game state.
 */
function schedulePhase(store: GameStore, state: GameState): void {
  const phase = state.phase;
  switch (phase.kind) {
    case "land_grant": {
      // The sweep cursor advances continuously while the phase is active,
      // independent of whose pick is current (see landGrantSweepTimerMs's
      // declaration comment).
      if (landGrantSweepTimerMs >= landGrantSweepTickMs()) {
        dispatchTick(store, "land_grant");
        landGrantSweepTimerMs = 0;
      }
      const picker = currentPicker(phase.payload);
      if (picker === null || picker === HUMAN_ID) {
        return;
      }
      if (phaseTimerMs >= AI_STEP_MS) {
        store.dispatch(decideLandGrantAction(state, picker));
        phaseTimerMs = 0;
      }
      return;
    }
    case "land_auction":
      scheduleLandAuction(store, phase.payload);
      return;
    case "develop": {
      const active = phase.payload.activePlayer;
      if (active === HUMAN_ID) {
        // A personal event fired for the human's own turn (turn.ts's
        // beginDevelopTurn resolves it before this phase is ever scheduled, so
        // it is already fixed on payload.event for the whole turn): hold the
        // tick clock for PERSONAL_EVENT_BANNER_HOLD_MS so the human sees the
        // event_banner.tsx banner before their tick budget starts draining.
        // phaseTimerMs was reset to 0 when this develop turn began (the
        // signature change in step()), so this only holds at the turn's
        // start -- once the hold elapses the very next check below already
        // clears DEVELOP_TICK_MS and ticking resumes on its normal cadence.
        if (phase.payload.event !== undefined && phaseTimerMs < PERSONAL_EVENT_BANNER_HOLD_MS) {
          return;
        }
        // The human develops interactively; the tick budget drains on a timer.
        if (phaseTimerMs >= developTickMs()) {
          dispatchTick(store, "develop");
          phaseTimerMs = 0;
        }
        return;
      }
      if (phaseTimerMs >= AI_STEP_MS) {
        store.dispatch(decideDevelopAction(state, active));
        phaseTimerMs = 0;
      }
      return;
    }
    case "production":
      if (phaseTimerMs >= PRODUCTION_PAUSE_MS) {
        dispatchTick(store, "production");
        phaseTimerMs = 0;
      }
      return;
    case "auction":
      scheduleAuction(store, phase.payload);
      return;
    default:
      // title and scoring have no automatic next step.
      return;
  }
}

//============================================
/**
 * Auction scheduling: a finished auction auto-advances after a pause; an
 * uncommitted human role holds the clock; otherwise the auction ticks (AI
 * intents, then a price/trade tick) on the auction cadence.
 *
 * @param store - The live game store to dispatch into.
 * @param payload - The current auction payload.
 */
function scheduleAuction(store: GameStore, payload: AuctionPayload): void {
  resetAuctionCommitmentIfGoodChanged(payload.good);
  if (payload.finished) {
    if (phaseTimerMs >= AUCTION_FINISHED_PAUSE_MS) {
      store.dispatch({ type: "end_auction" });
      phaseTimerMs = 0;
    }
    return;
  }
  if (!isAuctionTickable(payload)) {
    // Wait for the human to declare a side for this good before the clock runs.
    phaseTimerMs = 0;
    return;
  }
  if (phaseTimerMs >= AUCTION_TICK_MS) {
    auctionStep(store);
    phaseTimerMs = 0;
  }
}

//============================================
/**
 * Whether the auction clock may run. At the opening tick the auction holds for
 * the human to confirm or override the engine's auto-assigned role (the
 * role-choice bar); once committed, or once any tick has advanced, the clock
 * runs freely.
 *
 * @param payload - The current auction payload.
 * @returns True when the auction may tick.
 */
function isAuctionTickable(payload: AuctionPayload): boolean {
  return payload.tick > 0 || humanAuctionCommitted;
}

//============================================
/**
 * Advance the auction one tick: let each AI participant take its single role or
 * intent adjustment, then dispatch the engine tick that moves prices and
 * matches trades.
 *
 * @param store - The live game store to dispatch into.
 */
function auctionStep(store: GameStore): void {
  const state = store.state;
  if (state.phase.kind !== "auction") {
    return;
  }
  for (const player of state.players) {
    if (player.id === HUMAN_ID) {
      continue;
    }
    const aiAction = decideAuctionActions(store.state, player.id);
    if (aiAction !== null) {
      store.dispatch(aiAction);
    }
  }
  dispatchTick(store, "auction");
}

//============================================
/**
 * Colony land-auction scheduling: unlike the goods auction, there is no
 * human role-commitment gate -- not bidding a plot is itself a pass, so the
 * clock always runs. A finished auction auto-advances (to the next slot or
 * develop) after a pause; otherwise the auction ticks (AI bids, then a
 * going-tick/settlement tick) on the goods-auction cadence, since the land
 * auction has no cadence constant of its own.
 *
 * @param store - The live game store to dispatch into.
 * @param payload - The current land-auction payload.
 */
function scheduleLandAuction(store: GameStore, payload: LandAuctionPayload): void {
  if (payload.finished) {
    if (phaseTimerMs >= AUCTION_FINISHED_PAUSE_MS) {
      store.dispatch({ type: "end_land_auction" });
      phaseTimerMs = 0;
    }
    return;
  }
  if (phaseTimerMs >= AUCTION_TICK_MS) {
    landAuctionStep(store);
    phaseTimerMs = 0;
  }
}

//============================================
/**
 * Advance the land auction one tick: let each AI participant bid if it wants
 * to, then dispatch the engine tick that advances the going-tick countdown
 * (and settles the auction once it elapses).
 *
 * @param store - The live game store to dispatch into.
 */
function landAuctionStep(store: GameStore): void {
  const state = store.state;
  if (state.phase.kind !== "land_auction") {
    return;
  }
  for (const player of state.players) {
    if (player.id === HUMAN_ID) {
      continue;
    }
    const aiAction = decideLandAuctionAction(state, player.id);
    if (aiAction !== null) {
      store.dispatch(aiAction);
    }
  }
  dispatchTick(store, "land_auction");
}

//============================================
/**
 * Reset the per-good human role commitment when the auctioned good changes, so
 * the human is prompted to choose a side for each good in turn.
 *
 * @param good - The good currently under auction.
 */
function resetAuctionCommitmentIfGoodChanged(good: Resource): void {
  if (good !== lastAuctionGood) {
    lastAuctionGood = good;
    humanAuctionCommitted = false;
  }
}

//============================================
/**
 * Dispatch an engine tick and record it on the tick-ownership ledger. Every
 * tick in the app flows through here, so the ledger's owner list stays length
 * one and its phase sequence stays ordered.
 *
 * @param store - The live game store to dispatch into.
 * @param phaseKind - The phase the tick is applied in, for the phase sequence.
 */
function dispatchTick(store: GameStore, phaseKind: string): void {
  recordTick("scene_manager", phaseKind);
  store.dispatch({ type: "tick" });
}

//============================================
/**
 * Initialize the dev-only tick-ownership ledger on `window` for the invariant
 * spec, clearing any prior game's record.
 */
function resetTickOwnership(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.__tickOwnership = { owners: [], ticks: 0, phaseSequence: [] };
}

//============================================
/**
 * Record one tick against the ledger: register the owner (first time only),
 * bump the count, and append the phase kind when it differs from the last one.
 *
 * @param owner - Name of the scheduler dispatching the tick.
 * @param phaseKind - The phase the tick is applied in.
 */
function recordTick(owner: string, phaseKind: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const ledger = window.__tickOwnership;
  if (ledger === undefined) {
    return;
  }
  if (!ledger.owners.includes(owner)) {
    ledger.owners.push(owner);
  }
  ledger.ticks += 1;
  const lastPhase = ledger.phaseSequence[ledger.phaseSequence.length - 1];
  if (lastPhase !== phaseKind) {
    ledger.phaseSequence.push(phaseKind);
  }
}
