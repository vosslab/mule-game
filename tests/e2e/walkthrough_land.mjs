// Land-grant and land-auction drivers for the browser walkthrough harness.
// Each driver owns the full human-seat gesture loop for one phase:
//
// - driveLandGrant claims the sweep-cursor plot the strategy adapter decided
//   on, or passes. The sweep cursor is engine-driven and keeps moving on its
//   own (src/engine/land_grant.ts's advanceSweepCursor), so the decided plot
//   and the live cursor position can drift apart between the decision and
//   the Enter press; this driver re-checks that precondition on every poll
//   right up to the moment it presses Enter (see waitForSweepCursorMatch),
//   the same "wait for the cursor, then Enter" pattern
//   tests/playwright/pub_gamble.spec.mjs's claimLandGrantPlotAt proves out.
//   A mismatch is not an error by itself -- it is expected while the cursor
//   sweeps past other plots -- so each one only logs and retries; running out
//   the retry budget without a match is the actual failure, reported via the
//   closed "decision_gesture_mismatch" failureKind (walkthrough_report.mjs).
//
// - driveLandAuction bids while the strategy adapter still returns
//   `bid_land`, re-deciding on every tick, and returns as soon as the adapter
//   flips to `pass_land_auction`. The plan intentionally carries no bid
//   ceiling: the AI's price cap lives inside src/ai/land_ai.ts and is never
//   exported, so "respecting the ceiling" means re-asking the adapter every
//   tick and trusting its answer, never a re-derived local cap. Not bidding a
//   plot already passes it (src/ui/solid/land_auction_panel.tsx), so no
//   further gesture is needed once the adapter holds.
//
// `deps = { readProjection(page), decideLandGrant(state), decideLandAuction(state) }`
// lets the orchestrator (e2e_walkthrough.mjs) inject the real strategy
// adapter (walkthrough_strategy.mjs) while tests/test_walkthrough_land.mjs
// injects fakes. `marshalProjection` itself is not injected: it is fixed
// plumbing (the validated projection-to-GameState seam), not a strategy
// choice.
//
// Both drivers use the generic actAndWaitProgress helper (walkthrough_helpers.mjs)
// for every act: snapshot a small slice of live state, perform the
// click/keypress, then poll the same snapshot until it changes or the budget
// expires, so a dead click or a stale precondition surfaces as a reported
// failure instead of an infinite loop.

import { marshalProjection } from "./walkthrough_strategy.mjs";
import { actAndWaitProgress } from "./walkthrough_helpers.mjs";

/** Seat 0 is always the human seat (matches src/ui/game_driver.ts HUMAN_ID). */
const HUMAN_PLAYER_ID = 0;

/** Poll delay while waiting for the land-grant picker to become the human. */
const LAND_GRANT_POLL_INTERVAL_MS = 100;

/** Wall-clock budget to wait for the sweep cursor to reach the decided plot. */
const CLAIM_CURSOR_BUDGET_MS = 10_000;

/** Poll delay while waiting for the sweep cursor to reach the decided plot. */
const CLAIM_CURSOR_POLL_INTERVAL_MS = 50;

//============================================
/**
 * Snapshot the land-grant fields an act's progress check needs: the current
 * picker and the sweep cursor position. A change in either means the
 * click/keypress advanced the phase.
 *
 * @param readProjection - `deps.readProjection`.
 * @param page - The Playwright page.
 * @returns `{ activePlayerId, sweepRow, sweepCol }`.
 */
async function landGrantSnapshot(readProjection, page) {
  const projection = await readProjection(page);
  return {
    activePlayerId: projection.activePlayerId,
    sweepRow: projection.sweepRow,
    sweepCol: projection.sweepCol,
  };
}

//============================================
/**
 * Wait for the sweep cursor to reach the decided plot, re-reading the live
 * projection on every poll rather than trusting the decision snapshot. Each
 * poll that finds the cursor elsewhere logs a "decision_gesture_mismatch"
 * entry and retries; exhausting the budget without a match reports that
 * failure kind.
 *
 * @param page - The Playwright page.
 * @param report - The walk report.
 * @param readProjection - `deps.readProjection`.
 * @param plan - The `claim_plot` plan (`{ row, col }`).
 * @param budgetMs - Wall-clock budget to wait for a match.
 * @param pollIntervalMs - Delay between polls.
 * @returns True once the cursor matched the plan's plot.
 */
async function waitForSweepCursorMatch(
  page,
  report,
  readProjection,
  plan,
  budgetMs,
  pollIntervalMs,
) {
  const deadline = Date.now() + budgetMs;
  let mismatchCount = 0;
  while (Date.now() < deadline) {
    const projection = await readProjection(page);
    if (projection.phaseKind !== "land_grant") {
      // The phase moved on without this driver claiming anything; nothing
      // left to wait for here.
      return false;
    }
    if (projection.sweepRow === plan.row && projection.sweepCol === plan.col) {
      return true;
    }
    mismatchCount += 1;
    report.log(
      "warn",
      `decision_gesture_mismatch: sweep cursor at (${projection.sweepRow}, ${projection.sweepCol}), ` +
        `waiting for (${plan.row}, ${plan.col})`,
      { mismatchCount },
    );
    await page.waitForTimeout(pollIntervalMs);
  }
  report.fail(
    "decision_gesture_mismatch",
    `sweep cursor never reached decided plot (${plan.row}, ${plan.col}) within budget`,
  );
  return false;
}

//============================================
/**
 * Claim the plot the strategy adapter decided on: wait for the sweep cursor
 * to actually match that plot, then press Enter (the same binding
 * land_grant_panel.tsx gives `claim_current_plot`) and confirm the picker or
 * cursor advanced.
 *
 * @param page - The Playwright page.
 * @param report - The walk report.
 * @param readProjection - `deps.readProjection`.
 * @param plan - The `claim_plot` plan (`{ row, col }`).
 * @param timing - `{ claimCursorBudgetMs, claimCursorPollIntervalMs,
 *   actProgressBudgetMs, actProgressPollIntervalMs }`.
 * @returns True once the claim was pressed and progress was confirmed.
 */
async function claimDecidedPlot(page, report, readProjection, plan, timing) {
  const matched = await waitForSweepCursorMatch(
    page,
    report,
    readProjection,
    plan,
    timing.claimCursorBudgetMs,
    timing.claimCursorPollIntervalMs,
  );
  if (!matched) {
    return false;
  }
  return actAndWaitProgress(page, report, {
    snapshot: (currentPage) => landGrantSnapshot(readProjection, currentPage),
    act: () => page.keyboard.press("Enter"),
    failureKind: "act_did_not_advance",
    failureMessage: `claim_plot(${plan.row}, ${plan.col}) Enter press did not advance the land grant`,
    budgetMs: timing.actProgressBudgetMs,
    pollIntervalMs: timing.actProgressPollIntervalMs,
  });
}

//============================================
/**
 * Pass the human's land-grant turn by clicking the Pass control.
 *
 * @param page - The Playwright page.
 * @param report - The walk report.
 * @param readProjection - `deps.readProjection`.
 * @param timing - `{ actProgressBudgetMs, actProgressPollIntervalMs }`.
 * @returns True once the pass click was confirmed to advance the picker.
 */
async function passLandGrant(page, report, readProjection, timing) {
  return actAndWaitProgress(page, report, {
    snapshot: (currentPage) => landGrantSnapshot(readProjection, currentPage),
    act: () => page.click('[data-action="land-grant-pass"]'),
    failureKind: "act_did_not_advance",
    failureMessage: "land-grant-pass click did not advance the picker",
    budgetMs: timing.actProgressBudgetMs,
    pollIntervalMs: timing.actProgressPollIntervalMs,
  });
}

//============================================
/**
 * Drive the human seat through the whole land-grant phase: on every tick,
 * wait out AI-controlled picks, then either claim the sweep-cursor plot the
 * strategy adapter decided on (re-checked at Enter-press time) or pass,
 * looping until the phase kind changes away from "land_grant". Returns early
 * (without throwing) the moment an act reports a failure, since a stuck
 * phase will never advance on its own and the caller's own phase-level
 * budget is the right place to notice the run stalled.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param deps - `{ readProjection(page), decideLandGrant(state),
 *   landGrantPollIntervalMs, claimCursorBudgetMs, claimCursorPollIntervalMs,
 *   actProgressBudgetMs, actProgressPollIntervalMs }`. Only `readProjection`
 *   and `decideLandGrant` are required; the timing fields default to this
 *   module's own constants (or actAndWaitProgress's own defaults).
 */
export async function driveLandGrant(page, report, deps) {
  const {
    readProjection,
    decideLandGrant,
    landGrantPollIntervalMs = LAND_GRANT_POLL_INTERVAL_MS,
    claimCursorBudgetMs = CLAIM_CURSOR_BUDGET_MS,
    claimCursorPollIntervalMs = CLAIM_CURSOR_POLL_INTERVAL_MS,
    actProgressBudgetMs,
    actProgressPollIntervalMs,
  } = deps;
  const timing = {
    claimCursorBudgetMs,
    claimCursorPollIntervalMs,
    actProgressBudgetMs,
    actProgressPollIntervalMs,
  };

  while (true) {
    const projection = await readProjection(page);
    if (projection.phaseKind !== "land_grant") {
      return;
    }
    if (projection.activePlayerId !== HUMAN_PLAYER_ID) {
      // Not the human's pick; let the engine-driven AI picks and sweep
      // cursor keep moving and check again next poll.
      await page.waitForTimeout(landGrantPollIntervalMs);
      continue;
    }

    const plan = decideLandGrant(marshalProjection(projection));
    if (plan.kind === "pass_land_grant") {
      const advanced = await passLandGrant(page, report, readProjection, timing);
      if (!advanced) {
        return;
      }
      continue;
    }
    if (plan.kind === "claim_plot") {
      const advanced = await claimDecidedPlot(page, report, readProjection, plan, timing);
      if (!advanced) {
        return;
      }
      continue;
    }
    throw new Error(`driveLandGrant: unexpected plan kind "${plan.kind}"`);
  }
}

//============================================
/**
 * Snapshot the land-auction fields an act's progress check needs: the
 * human's money and the full auction payload (ask prices, participants,
 * going-tick stage). A change in either means the click advanced the
 * auction.
 *
 * @param readProjection - `deps.readProjection`.
 * @param page - The Playwright page.
 * @returns `{ humanMoney, payload }`.
 */
async function landAuctionSnapshot(readProjection, page) {
  const projection = await readProjection(page);
  return {
    humanMoney: projection.humanMoney,
    payload: projection.phaseKind === "land_auction" ? projection.state.phase.payload : null,
  };
}

//============================================
/**
 * Drive the human seat through the colony land-auction phase: bid while the
 * strategy adapter still returns `bid_land`, re-deciding on every tick, and
 * return as soon as the adapter flips to `pass_land_auction`. Returns early
 * (without throwing) if a bid click reports a failure, for the same reason
 * driveLandGrant does.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param deps - `{ readProjection(page), decideLandAuction(state),
 *   actProgressBudgetMs, actProgressPollIntervalMs }`. Only `readProjection`
 *   and `decideLandAuction` are required.
 */
export async function driveLandAuction(page, report, deps) {
  const { readProjection, decideLandAuction, actProgressBudgetMs, actProgressPollIntervalMs } =
    deps;

  while (true) {
    const projection = await readProjection(page);
    if (projection.phaseKind !== "land_auction") {
      return;
    }

    const plan = decideLandAuction(marshalProjection(projection));
    if (plan.kind === "pass_land_auction") {
      // Not bidding a plot already passes it; nothing further to do here.
      return;
    }
    if (plan.kind === "bid_land") {
      const advanced = await actAndWaitProgress(page, report, {
        snapshot: (currentPage) => landAuctionSnapshot(readProjection, currentPage),
        act: () => page.click('[data-action="land-bid"]'),
        failureKind: "act_did_not_advance",
        failureMessage: "land-bid click did not advance the auction",
        budgetMs: actProgressBudgetMs,
        pollIntervalMs: actProgressPollIntervalMs,
      });
      if (!advanced) {
        return;
      }
      continue;
    }
    throw new Error(`driveLandAuction: unexpected plan kind "${plan.kind}"`);
  }
}
