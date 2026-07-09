/**
 * Wampus subsystem for the M.U.L.E. engine: a colony-wide creature that
 * spawns once per round on an unowned mountain plot during the develop
 * phase, blinks in and out of visibility, moves between mountains, and
 * awards a cash bounty to whichever develop-turn player catches it while
 * visible. One wampus exists per round; catching it (or starting the round
 * with no unowned mountain left) despawns it for the rest of that round.
 *
 * Ported from planet_mule's `Wampus` model class
 * (OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Wampus.java),
 * mapped onto this engine's discrete develop-phase tick clock. See
 * docs/RULE_SOURCES.md, "Wampus: spawn, blink, and move timing" for the full
 * tick-mapping derivation.
 *
 * This engine's develop phase never claims land mid-round (land grant and
 * land auctions both run before develop each round), so the set of
 * candidate unowned mountains is fixed for the whole round -- unlike PM's
 * single continuous real-time phase, this engine has no analog to
 * `Wampus.landClaimed`'s mid-round candidate removal, and intentionally
 * omits it (see docs/RULE_SOURCES.md, "Wampus: spawn, blink, and move
 * timing").
 *
 * DOM-free, pure: no mutation, all state threaded through GameState.
 */

import type { GameState, Plot, WampusEvent, WampusState } from "./game_state";
import type { Rng } from "./rng";
import { createRng } from "./rng";
import {
  WAMPUS_BLINKS_PER_SITE,
  WAMPUS_BOUNTY_BASE,
  WAMPUS_BOUNTY_ROUND_DIVISOR,
  WAMPUS_BOUNTY_ROUND_OFFSET,
  WAMPUS_HIDDEN_TICKS,
  WAMPUS_INITIAL_DELAY_BASE_TICKS,
  WAMPUS_INITIAL_DELAY_RAND_TICKS,
  WAMPUS_VISIBLE_TICKS,
} from "./constants";

/** Mountain terrain tiers the wampus can spawn on. */
const WAMPUS_MOUNTAIN_TERRAINS: ReadonlySet<Plot["terrain"]> = new Set([
  "mountain1",
  "mountain2",
  "mountain3",
]);

/**
 * Every unowned mountain plot on the board, in row-major order -- the
 * wampus's candidate site list for the round. Fixed for the whole develop
 * phase (see the module doc: land is never claimed during develop in this
 * engine).
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @returns Every unowned mountain plot's coordinates, row-major order.
 */
function unownedMountains(plots: readonly (readonly Plot[])[]): { row: number; col: number }[] {
  const mountains: { row: number; col: number }[] = [];
  for (const [row, rowPlots] of plots.entries()) {
    for (const [col, plot] of rowPlots.entries()) {
      if (plot.owner === null && WAMPUS_MOUNTAIN_TERRAINS.has(plot.terrain)) {
        mountains.push({ row, col });
      }
    }
  }
  return mountains;
}

/**
 * This round's bounty: `WAMPUS_BOUNTY_BASE *
 * floor((round + WAMPUS_BOUNTY_ROUND_OFFSET) / WAMPUS_BOUNTY_ROUND_DIVISOR)`.
 *
 * @param round - The round the wampus is created for (1-based).
 * @returns The dollar bounty for catching this round's wampus.
 */
function computeBounty(round: number): number {
  return (
    WAMPUS_BOUNTY_BASE *
    Math.floor((round + WAMPUS_BOUNTY_ROUND_OFFSET) / WAMPUS_BOUNTY_ROUND_DIVISOR)
  );
}

/**
 * Create a fresh wampus for the round now entering development. Dead
 * immediately when no unowned mountain remains on the board, matching
 * `Wampus`'s constructor: `this.dead = this.mountains.isEmpty()`.
 *
 * @param state - Current game state, about to enter the develop phase.
 * @returns The new wampus state and the advanced isolated wampus rng state.
 */
export function createWampusState(state: GameState): {
  wampus: WampusState;
  wampusRngState: number;
} {
  const mountains = unownedMountains(state.plots);
  const rng = createRng(state.wampusRngState);
  const delayDraw = rng.nextInt(WAMPUS_INITIAL_DELAY_RAND_TICKS + 1);
  const wampus: WampusState = {
    row: null,
    col: null,
    visible: false,
    dead: mountains.length === 0,
    caught: false,
    moneyReward: computeBounty(state.round),
    blinkTicks: WAMPUS_INITIAL_DELAY_BASE_TICKS + delayDraw,
    blinksRemainingAtSite: 0,
    mountains,
    tick: 0,
    events: [],
  };
  return { wampus, wampusRngState: rng.getState() };
}

/**
 * Pick a random mountain site from the candidate list, avoiding the
 * currently-occupied site when more than one candidate exists (falling back
 * to the next index by modulo increment on a same-index draw). Mirrors
 * `Wampus.randomMountain` (`Wampus.java` lines 131-147).
 *
 * @param rng - Generator to draw the site index from; advances its state.
 * @param mountains - Candidate mountain sites for the round.
 * @param currentRow - Row of the wampus's current site, or null if none yet.
 * @param currentCol - Column of the wampus's current site, or null if none yet.
 * @returns The chosen site's coordinates.
 */
function pickMountain(
  rng: Rng,
  mountains: readonly { row: number; col: number }[],
  currentRow: number | null,
  currentCol: number | null,
): { row: number; col: number } {
  if (mountains.length === 0) {
    throw new Error("pickMountain: no candidate mountains (wampus should already be dead)");
  }
  let index = rng.nextInt(mountains.length);
  const current = mountains[index];
  if (current !== undefined && current.row === currentRow && current.col === currentCol) {
    index = (index + 1) % mountains.length;
  }
  const picked = mountains[index];
  if (picked === undefined) {
    throw new Error(`pickMountain: index ${index} out of range`);
  }
  return picked;
}

/**
 * Advance the wampus by one develop-phase tick, mirroring `Wampus.update`'s
 * per-frame body (see docs/RULE_SOURCES.md for the full derivation). Runs on
 * every `tick` action in the develop phase, independent of whose turn it is
 * or how many player-budget ticks remain, matching PM's continuous
 * real-time update.
 *
 * @param wampus - Current wampus state.
 * @param wampusRngState - Current isolated wampus rng accumulator.
 * @param tickCounter - The round-wide tick counter this advance lands on
 *   (stamped onto the wampus state and any emitted event).
 * @returns The advanced wampus state and rng accumulator.
 */
export function tickWampus(
  wampus: WampusState,
  wampusRngState: number,
  tickCounter: number,
): { wampus: WampusState; wampusRngState: number } {
  if (wampus.dead || wampus.caught) {
    return { wampus, wampusRngState };
  }
  const blinkTicksAfterCountdown = wampus.blinkTicks - 1;
  if (blinkTicksAfterCountdown > 0) {
    return {
      wampus: { ...wampus, blinkTicks: blinkTicksAfterCountdown, tick: tickCounter },
      wampusRngState,
    };
  }
  if (wampus.visible) {
    // Toggle to hidden: stays at the same site, blink count unchanged.
    return {
      wampus: {
        ...wampus,
        blinkTicks: blinkTicksAfterCountdown + WAMPUS_HIDDEN_TICKS,
        visible: false,
        tick: tickCounter,
      },
      wampusRngState,
    };
  }
  // Toggle to visible: pick a new site once the current site's blinks are
  // exhausted (or on first appearance), otherwise re-blink at the same site.
  let row = wampus.row;
  let col = wampus.col;
  let rngState = wampusRngState;
  let blinksRemainingAtSite = wampus.blinksRemainingAtSite;
  let eventKind: WampusEvent["kind"] = "blink";
  if (blinksRemainingAtSite <= 0) {
    const rng = createRng(wampusRngState);
    const picked = pickMountain(rng, wampus.mountains, wampus.row, wampus.col);
    row = picked.row;
    col = picked.col;
    rngState = rng.getState();
    blinksRemainingAtSite = WAMPUS_BLINKS_PER_SITE;
    eventKind = "spawn";
  }
  blinksRemainingAtSite -= 1;
  if (row === null || col === null) {
    throw new Error("tickWampus: wampus site coordinates unresolved on appearance");
  }
  const event: WampusEvent = { tick: tickCounter, kind: eventKind, row, col };
  return {
    wampus: {
      ...wampus,
      row,
      col,
      visible: true,
      blinkTicks: blinkTicksAfterCountdown + WAMPUS_VISIBLE_TICKS,
      blinksRemainingAtSite,
      tick: tickCounter,
      events: [...wampus.events, event],
    },
    wampusRngState: rngState,
  };
}

/**
 * Catch the wampus for `playerId`: mark it dead and caught, keep the site
 * coordinates for the UI's catch animation, and append a "catch" event.
 * Caller (`turn.ts`'s `applyHuntWampus`) validates visibility/liveness first
 * and applies the money reward to the player; this function only updates
 * wampus bookkeeping. Mirrors `Wampus.setCaughtBy`/`die`.
 *
 * @param wampus - Current wampus state (must be visible, not dead, not caught).
 * @param playerId - The catching player's id, recorded on the event.
 * @returns The wampus state after being caught.
 */
export function catchWampus(wampus: WampusState, playerId: number): WampusState {
  if (wampus.row === null || wampus.col === null) {
    throw new Error("catchWampus: wampus has no site to catch it at");
  }
  const event: WampusEvent = {
    tick: wampus.tick,
    kind: "catch",
    row: wampus.row,
    col: wampus.col,
    playerId,
  };
  return {
    ...wampus,
    dead: true,
    caught: true,
    visible: false,
    events: [...wampus.events, event],
  };
}
