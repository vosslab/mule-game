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
import { actAndWaitProgress, clickIfPresent, clickRequired } from "./walkthrough_helpers.mjs";

/** The human seat this driver plays. */
const HUMAN_SEAT = 0;

/** Delay between decision ticks while an auction good is still live. */
const AUCTION_POLL_INTERVAL_MS = 120;

/**
 * Bounded wait for the auction clock to leave tick 0 (or the window to
 * finish outright, which a quiescent window can do without tick ever
 * exceeding 0) after a successful required role-commit click. Sized many
 * times over AUCTION_TICK_MS (scene_manager.ts, 500ms base cadence scaled by
 * `?speed=`), so a normal commit is proven within a couple of ticks, while a
 * genuinely stalled engine still fails in seconds -- not the ~8 minutes
 * MAX_TICKS_PER_AUCTION below previously took to surface the same stall.
 */
const AUCTION_COMMIT_VERIFY_BUDGET_MS = 5_000;

/**
 * Defensive tick cap for the auction phase as a whole (every good's window
 * combined), so a stuck engine somewhere other than the tick-0 commit gate
 * (already caught fast by AUCTION_COMMIT_VERIFY_BUDGET_MS above) still fails
 * loud with a clear message instead of hanging the walkthrough forever.
 * Comfortably above any real auction phase's tick count.
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
 * Snapshot of the current good's auction CLOCK, read fresh off the live
 * page: `payload.tick` (advances once the engine unblocks the clock) and
 * `payload.finished` (a quiescent window can jump straight from tick 0 to
 * finished without tick itself ever exceeding 0), plus `payload.good` (a
 * good-transition is also legitimate progress). Used as
 * actAndWaitProgress's before/after comparison around the required
 * role-commit click, so a field changing proves the commit actually
 * UNBLOCKED THE CLOCK -- not just that the click itself resolved.
 *
 * Deliberately does NOT include the human participant's role. The role
 * button's own onClick handler (auction_screen.tsx's `choose`) makes TWO
 * separate calls -- `dispatch({type:"set_auction_role",...})` (the engine
 * reducer field this function would read) and `notifyAuctionCommit()` (the
 * scene-manager flag that actually unblocks `isAuctionTickable`,
 * scene_manager.ts) -- so a role-field change alone does not prove the
 * clock unblocked; a future bug that drops the second call while keeping
 * the first would flip the role but leave the clock stalled, and a
 * role-inclusive comparison would misreport that as progress, masking
 * exactly the wiring bug this verification exists to catch.
 *
 * @param readProjection - `deps.readProjection`.
 * @param page - The Playwright page.
 * @returns `{ phaseKind, good, tick, finished }` while still in the auction
 *   phase, or `{ phaseKind }` if the phase itself moved on (also legitimate
 *   progress).
 */
async function auctionClockSnapshot(readProjection, page) {
  const projection = await readProjection(page);
  const state = marshalProjection(projection);
  if (state.phase.kind !== "auction") {
    return { phaseKind: state.phase.kind };
  }
  const payload = state.phase.payload;
  return {
    phaseKind: "auction",
    good: payload.good,
    tick: payload.tick,
    finished: payload.finished,
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
 * Apply one seat-0 gesture plan to the live page: click the matching intent
 * button, or do nothing for the legitimate no-click "auction_continue" (role
 * and intent already match the adapter's target this tick). "auction_role"
 * is deliberately NOT handled here: the required opening commit and the
 * optional mid-window role-change request are both owned directly by
 * driveAuction (the former needs the asserted clickRequired path, the latter
 * its own once-per-good logging), so a plan of that kind reaching this
 * function is a dispatch bug in the caller, not a normal case -- it falls
 * through to the "unexpected plan kind" throw below like any other
 * out-of-taxonomy kind (matched by walkthrough_exec.mjs's
 * UNEXPECTED_PLAN_KIND_PATTERN into a real unknown_plan_kind report
 * failure), so a coverage gap surfaces instead of silently no-opping.
 *
 * @param page - The Playwright page.
 * @param plan - The plan returned by `decideAuctionIntent`.
 * @param report - The walk report (see walkthrough_report.mjs), passed through
 *   to `clickIfPresent` for its warn-on-real-rejection log.
 */
async function applyPlan(page, plan, report) {
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
 * The opening role commit for each good is a REQUIRED, verified action, not
 * an optional gesture: the engine holds the auction clock at tick 0 until
 * the human seat commits a role (scene_manager.ts's isAuctionTickable), so a
 * missed or silently-discarded commit click stalls the whole auction. The two
 * ways this commit can fail are reported, worded, AND PROPAGATED differently
 * on purpose, so a failing run points at the right owner immediately -- see
 * docs/WALKTHROUGH_GUIDE.md's failure taxonomy:
 *   - A missing/unclickable role control (the screen never presented the
 *     control this driver's documented selector contract calls for -- a UI
 *     defect) THROWS: clickRequired records `required_control_missing` via
 *     report.fail, then throws, and nothing between it and this driver's own
 *     `await actAndWaitProgress(...)` call catches that throw, so it
 *     propagates out of driveAuction uncaught and ends the run. It does NOT
 *     return early.
 *   - A commit click that lands but never unblocks the clock fails via
 *     `act_did_not_advance`, with a message naming the engine's tick gate,
 *     not the UI, as the suspect. This is the one case that returns early
 *     without throwing: actAndWaitProgress's budget expiry calls report.fail
 *     and returns false rather than throwing, so this driver sees
 *     `committed === false` and returns plainly (the orchestrator checks
 *     report.hasFailed() the moment this driver returns), the same pattern
 *     driveLandGrant/driveLandAuction use for a failed act.
 *
 * A later-tick "adapter wants a different role than the one already
 * committed" request is a genuinely optional, best-effort click
 * (clickIfPresent): this driver does not know or assert whether a given
 * screen's role control still exists once a good's window is underway, so a
 * missing control there is a normal no-op, not a reported failure or a
 * documented UI limitation.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param deps - `{ readProjection, decideAuctionIntent, commitVerifyBudgetMs }`:
 *   `readProjection(page)` returns the raw walker projection (see
 *   walkthrough_helpers.mjs's readGameState), `decideAuctionIntent(state)` is
 *   the seat-0 strategy adapter (walkthrough_strategy.mjs), and
 *   `commitVerifyBudgetMs` overrides AUCTION_COMMIT_VERIFY_BUDGET_MS (a unit
 *   test injects a short budget so a genuine-stall test case does not have to
 *   wait out the full production budget in real wall-clock time). Only
 *   `readProjection` and `decideAuctionIntent` are required.
 */
export async function driveAuction(page, report, deps) {
  const {
    readProjection,
    decideAuctionIntent,
    commitVerifyBudgetMs = AUCTION_COMMIT_VERIFY_BUDGET_MS,
  } = deps;
  let goodStart = null;
  // The good (by name) for which the human seat's one required role-commit
  // click has already landed and been verified, or null before that for the
  // good currently on screen. Reset alongside goodStart on every good change.
  let committedGood = null;
  // The good (by name) for which a mid-window "adapter wants a different
  // role" request has already been logged once, or null before that. Reset
  // alongside goodStart/committedGood on every good change, so a strategy
  // that keeps proposing the same role every tick logs once per good, not
  // once per tick.
  let roleChangeNoticedGood = null;
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
      roleChangeNoticedGood = null;
      intentsPushedThisGood = 0;
    }

    if (payload.finished) {
      recordOutcome(report, goodStart, state, intentsPushedThisGood);
      goodStart = null;
      committedGood = null;
      roleChangeNoticedGood = null;
      intentsPushedThisGood = 0;
      await clickIfPresent(page, '[data-action="auction-continue"]', report);
      await page.waitForTimeout(AUCTION_POLL_INTERVAL_MS);
      continue;
    }

    const plan = decideAuctionIntent(state);

    if (committedGood !== payload.good) {
      // First sighting of this good's (not-yet-finished) window: the engine
      // holds the clock at tick 0 until the human commits, so this is always
      // reached at tick 0. Commit whichever role is on the table this tick --
      // the adapter's own choice when it already wants one, else the engine's
      // auto-assigned role -- matching a real human who always picks a side
      // before the clock runs. This click is REQUIRED and its effect is
      // verified below (see the doc comment above for the two ways it can
      // fail and why they are reported differently).
      const roleToCommit = plan.kind === "auction_role" ? plan.role : findHumanRole(payload);
      const commitContext = {
        phaseKind: "auction",
        good: payload.good,
        tick: payload.tick,
        finished: payload.finished,
        humanRoleAssigned: findHumanRole(payload),
        roleBeingCommitted: roleToCommit,
      };
      const committed = await actAndWaitProgress(page, report, {
        // Computed synchronously from the payload the main loop already
        // fetched this tick (no extra read): the engine holds the clock at
        // tick 0 until commit, so this is always the true pre-commit clock
        // state, and skipping a redundant round trip here also keeps every
        // readProjection call meaningful (see the deps.readProjection
        // contract other drivers document).
        beforeSnapshot: {
          phaseKind: "auction",
          good: payload.good,
          tick: payload.tick,
          finished: payload.finished,
        },
        snapshot: (currentPage) => auctionClockSnapshot(readProjection, currentPage),
        act: () =>
          clickRequired(page, `[data-action="auction-role"][data-role="${roleToCommit}"]`, report, {
            detail: `human role commit for good "${payload.good}"`,
            extra: commitContext,
          }),
        failureKind: "act_did_not_advance",
        // ENGINE EVIDENCE, not an assertion: lastSnapshot is the ACTUAL observed
        // tick/finished/role read after the verified click landed, so this
        // failure names the engine's tick gate as the suspect with the state
        // that proves it, distinguishing this from a missing UI control (which
        // clickRequired above would already have failed on before this poll
        // ever started).
        failureMessage: (lastSnapshot) =>
          `driveAuction: the role commit click for good "${payload.good}" (role ` +
          `"${roleToCommit}") landed, but the auction clock never advanced within ` +
          `${commitVerifyBudgetMs}ms. Observed state after the click: ` +
          `${JSON.stringify(lastSnapshot)}. This is engine evidence, not a UI defect: the ` +
          "click was verified to land, yet isAuctionTickable/auctionStep " +
          "(src/ui/scenes/scene_manager.ts) never unblocked the clock -- suspect an engine " +
          "stall, not the UI.",
        budgetMs: commitVerifyBudgetMs,
        pollIntervalMs: AUCTION_POLL_INTERVAL_MS,
      });
      if (!committed) {
        return;
      }
      committedGood = payload.good;
      // The click above already applied this tick's whole decision (the
      // commit); re-decide fresh on the next tick rather than reusing a plan
      // computed against a payload the commit has now moved past.
      continue;
    }

    if (plan.kind === "auction_role") {
      // A mid-window role-change request: optional and best-effort (see the
      // doc comment above). Logged once per good purely for visibility.
      if (roleChangeNoticedGood !== payload.good) {
        report.log("info", "auction_role_change_requested", {
          good: payload.good,
          requestedRole: plan.role,
          tick: payload.tick,
        });
        roleChangeNoticedGood = payload.good;
      }
      await clickIfPresent(page, `[data-action="auction-role"][data-role="${plan.role}"]`, report);
      await page.waitForTimeout(AUCTION_POLL_INTERVAL_MS);
      continue;
    }

    // Only "up"/"down" is a genuine price-walking click; "auction_intent"
    // with direction "hold" (the AI's desired intent already matches, most
    // commonly for a held "out" role, where desiredIntent always resolves
    // to "hold") applies no click and is not participation evidence.
    if (plan.kind === "auction_intent" && plan.direction !== "hold") {
      intentsPushedThisGood += 1;
    }
    await applyPlan(page, plan, report);
    await page.waitForTimeout(AUCTION_POLL_INTERVAL_MS);
  }
}
