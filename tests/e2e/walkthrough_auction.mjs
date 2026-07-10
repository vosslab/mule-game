// Goods-auction driver for the browser walkthrough harness.
//
// Drives the human seat (player 0) through an entire "auction" phase --
// every good in AUCTION_GOOD_ORDER (see src/engine/turn.ts), one after
// another -- by re-deciding each tick with the seat-0 strategy adapter
// (walkthrough_strategy.mjs's decideAuctionIntent): choose a role, walk the
// price intent toward the adapter's target, and click Continue once the
// engine marks the good's window finished. This file owns only that
// driving loop; it does not touch e2e_walkthrough.mjs (the orchestrator
// wires this driver into the passive phase loop) nor
// walkthrough_helpers.mjs / walkthrough_strategy.mjs, which it only
// imports from.
//
// Per docs/E2E_TESTS.md (non-browser tier, tests/e2e/, self-contained, run
// directly rather than via pytest).
//
// aiTargetPrice is always recorded as null in the outcome tuple: the
// buyer/seller price target `auction_ai.ts` walks toward
// (`auctionResourceCritical`/`desiredIntent`) is internal to that module and
// never exported, so there is no target price for this driver to read or
// duplicate. The tuple's `priceBefore`/`priceAfter` instead read the one
// price figure AuctionPayload does expose: the midpoint of the store's live
// buy/sell quotes (`priceFloor`/`priceCeiling`), which moves as trades
// consume store stock over the good's window.
//
// A finished good's whole outcome (role, price band, human goods/money
// delta) is fully determined by the tick where `payload.finished` first
// becomes true, before the Continue click: finishing means no further
// trades happen, so the click is a pure UI advance and never needs a
// second, post-click read.

import { marshalProjection } from "./walkthrough_strategy.mjs";
import { clickIfPresent } from "./walkthrough_helpers.mjs";

/** The human seat this driver plays. */
const HUMAN_SEAT = 0;

/** Delay between decision ticks while an auction good is still live. */
const AUCTION_POLL_INTERVAL_MS = 120;

/**
 * Defensive tick cap so a stuck engine (a bug elsewhere) fails loud with a
 * clear message instead of hanging the walkthrough forever. Comfortably
 * above any real auction phase's tick count.
 */
const MAX_TICKS_PER_AUCTION = 4000;

//============================================
/**
 * A single representative market price for the outcome tuple: the midpoint
 * of the store's live buy/sell quotes. `AuctionPayload` carries no single
 * unified "price" field (see its doc comment in src/engine/game_state.ts);
 * `priceFloor`/`priceCeiling` are the store's buy/sell quotes for the good,
 * so their midpoint is the least-derived, always-available stand-in for
 * "where the market sits" that does not require picking a side.
 *
 * @param payload - The current good's `AuctionPayload`.
 * @returns The midpoint of `priceFloor` and `priceCeiling`.
 */
function marketPrice(payload) {
  return (payload.priceFloor + payload.priceCeiling) / 2;
}

//============================================
/**
 * The human seat's declared role for the current good, or null if the
 * engine has not recorded a participant entry for it (should not happen in
 * practice; every player gets a participant entry on phase entry).
 *
 * @param payload - The current good's `AuctionPayload`.
 * @returns "buyer" | "seller" | "out" | null.
 */
function findHumanRole(payload) {
  const participant = payload.participants.find((entry) => entry.playerId === HUMAN_SEAT);
  return participant === undefined ? null : participant.role;
}

//============================================
/**
 * Snapshot the state needed to compute one good's outcome tuple, taken the
 * first tick a new good is seen (before any role/intent decision for it).
 *
 * @param state - The marshalled `GameState`, with `phase.kind === "auction"`.
 * @returns `{ good, priceBefore, goodsBefore, moneyBefore }`.
 */
function snapshotGoodStart(state) {
  const payload = state.phase.payload;
  const human = state.players[HUMAN_SEAT];
  return {
    good: payload.good,
    priceBefore: marketPrice(payload),
    goodsBefore: human.goods[payload.good],
    moneyBefore: human.money,
  };
}

//============================================
/**
 * Build and record one good's outcome tuple once its window is finished,
 * incrementing `report.counters.trades` when the human's goods actually
 * moved. `intentsPushed` carries this window's participation evidence: the
 * count of "auction_intent" plans the driver actually applied while the good
 * was live (see the `intentsPushedThisGood` counter in `driveAuction`), so a
 * caller can tell a held role that genuinely walked its price target apart
 * from a held role that never got a click in (a legitimate outcome too --
 * the window can close on quiescence, src/engine/auction.ts's `auctionTick`,
 * before an intent ever needs to move).
 *
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param goodStart - The entry snapshot from `snapshotGoodStart`.
 * @param state - The marshalled `GameState` at the tick `payload.finished`
 *   first became true for this good.
 * @param intentsPushed - Count of "auction_intent" plans applied this window.
 */
function recordOutcome(report, goodStart, state, intentsPushed) {
  const payload = state.phase.payload;
  const human = state.players[HUMAN_SEAT];
  const tuple = {
    role: findHumanRole(payload),
    aiTargetPrice: null,
    priceBefore: goodStart.priceBefore,
    priceAfter: marketPrice(payload),
    humanGoodsDelta: human.goods[goodStart.good] - goodStart.goodsBefore,
    humanMoneyDelta: human.money - goodStart.moneyBefore,
    intentsPushed,
  };
  report.log("info", "auction_outcome", tuple);
  if (tuple.humanGoodsDelta !== 0) {
    report.counters.trades += 1;
  }
}

//============================================
/**
 * Apply one seat-0 gesture plan to the live page: click the role button, the
 * matching intent button, or do nothing for the legitimate no-click
 * "auction_continue" (role and intent already match the adapter's target
 * this tick). Any other plan kind is fatal (see the "unexpected plan kind"
 * throw shape shared with driveLandGrant/driveLandAuction, matched by
 * walkthrough_exec.mjs's UNEXPECTED_PLAN_KIND_PATTERN into a real
 * unknown_plan_kind report failure), so a coverage gap surfaces instead of
 * silently no-opping.
 *
 * @param page - The Playwright page.
 * @param plan - The plan returned by `decideAuctionIntent`.
 * @param report - The walk report (see walkthrough_report.mjs), passed through
 *   to `clickIfPresent` for its warn-on-real-rejection log.
 */
async function applyPlan(page, plan, report) {
  if (plan.kind === "auction_role") {
    await clickIfPresent(page, `[data-action="auction-role"][data-role="${plan.role}"]`, report);
    return;
  }
  if (plan.kind === "auction_intent") {
    if (plan.direction === "up") {
      await clickIfPresent(page, '[data-action="auction-intent-up"]', report);
    } else if (plan.direction === "down") {
      await clickIfPresent(page, '[data-action="auction-intent-down"]', report);
    }
    return;
  }
  if (plan.kind === "auction_continue") {
    // Role and intent already match the adapter's target this tick: hold,
    // no click.
    return;
  }
  throw new Error(`driveAuction: unexpected plan kind "${plan.kind}"`);
}

//============================================
/**
 * Drive the human seat through an entire goods-auction phase: for every
 * good in turn, choose a role, walk the price intent toward the adapter's
 * target, and click Continue once the window finishes, recording one
 * outcome tuple per good along the way. Returns once the phase advances to
 * something other than "auction".
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param deps - `{ readProjection, decideAuctionIntent }`: `readProjection(page)`
 *   returns the raw walker projection (see walkthrough_helpers.mjs's
 *   readGameState), and `decideAuctionIntent(state)` is the seat-0 strategy
 *   adapter (walkthrough_strategy.mjs).
 */
export async function driveAuction(page, report, deps) {
  const { readProjection, decideAuctionIntent } = deps;
  let goodStart = null;
  // The good (by name) for which the human seat's one required role-commit
  // click has already fired, or null before that click has happened for the
  // good currently on screen. Reset alongside goodStart on every good change.
  let committedGood = null;
  // The good (by name) for which the "adapter wants a role change the UI
  // cannot express mid-window" info log has already fired, or null before
  // that log has happened for the good currently on screen. Reset alongside
  // goodStart/committedGood on every good change, so a strategy that keeps
  // wanting the same unreachable role every tick logs once per good, not
  // once per tick.
  let deferredRoleInfoGood = null;
  // Count of "auction_intent" plans applied for the good currently on
  // screen -- the driver's own participation evidence, reset alongside
  // goodStart on every good change.
  let intentsPushedThisGood = 0;

  for (let tick = 0; ; tick += 1) {
    if (tick > MAX_TICKS_PER_AUCTION) {
      const goodLabel = goodStart === null ? "unknown" : goodStart.good;
      const message =
        `driveAuction: exceeded ${MAX_TICKS_PER_AUCTION} ticks without the auction phase ` +
        `ending (stalled on good "${goodLabel}")`;
      report.fail("auction_stalled", message);
      throw new Error(message);
    }

    const projection = await readProjection(page);
    const state = marshalProjection(projection);
    if (state.phase.kind !== "auction") {
      return;
    }
    const payload = state.phase.payload;

    if (goodStart === null || goodStart.good !== payload.good) {
      goodStart = snapshotGoodStart(state);
      committedGood = null;
      deferredRoleInfoGood = null;
      intentsPushedThisGood = 0;
    }

    if (payload.finished) {
      recordOutcome(report, goodStart, state, intentsPushedThisGood);
      goodStart = null;
      committedGood = null;
      deferredRoleInfoGood = null;
      intentsPushedThisGood = 0;
      await clickIfPresent(page, '[data-action="auction-continue"]', report);
      await page.waitForTimeout(AUCTION_POLL_INTERVAL_MS);
      continue;
    }

    const plan = decideAuctionIntent(state);
    // The engine holds the auction clock at each good's opening tick until the
    // human seat clicks a role button (scene_manager.ts's isAuctionTickable /
    // humanAuctionCommitted), exactly as a real human always picks a side
    // before the clock runs. The strategy adapter only returns an
    // "auction_role" plan when its desired role DIFFERS from the engine's
    // auto-assigned one; when they already match it returns
    // "auction_intent"/"auction_continue" instead, which never clicks a role
    // button on its own. So the driver commits unconditionally here: if the
    // good has not been committed yet and the plan itself is not a role
    // click, click the currently-assigned role explicitly before doing
    // anything else, emulating the human's explicit commit rather than
    // waiting for a role change that may never come.
    if (committedGood !== payload.good && plan.kind !== "auction_role") {
      const assignedRole = findHumanRole(payload);
      await clickIfPresent(
        page,
        `[data-action="auction-role"][data-role="${assignedRole}"]`,
        report,
      );
    }
    if (committedGood !== payload.good) {
      committedGood = payload.good;
    }

    // The role buttons only render at the good's opening tick (payload.tick
    // === 0; see auction_screen.tsx's mode() switch), because the engine
    // holds the human's role fixed once the clock starts -- matching a real
    // human who picks a side once and then trades it. The adapter still
    // recomputes its desired role from live holdings every tick, though, so
    // it can keep proposing an "auction_role" plan after tick 0 (a good's
    // critical target crossed mid-window). The UI cannot express that
    // change, so treat it as a no-op here rather than attempting a click on
    // a selector that no longer exists (a doomed attempt is exactly what
    // used to hang on Playwright's default actionability timeout). Reported
    // once per good, not once per tick, via deferredRoleInfoGood.
    if (plan.kind === "auction_role" && payload.tick !== 0) {
      if (deferredRoleInfoGood !== payload.good) {
        report.log("info", "auction_role_deferred", {
          good: payload.good,
          requestedRole: plan.role,
          tick: payload.tick,
        });
        deferredRoleInfoGood = payload.good;
      }
    } else {
      // Only "up"/"down" is a genuine price-walking click; "auction_intent"
      // with direction "hold" (the AI's desired intent already matches, most
      // commonly for a held "out" role, where desiredIntent always resolves
      // to "hold") applies no click and is not participation evidence.
      if (plan.kind === "auction_intent" && plan.direction !== "hold") {
        intentsPushedThisGood += 1;
      }
      await applyPlan(page, plan, report);
    }
    await page.waitForTimeout(AUCTION_POLL_INTERVAL_MS);
  }
}
