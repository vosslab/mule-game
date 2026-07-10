// Node unit tests for the land-grant and land-auction walkthrough drivers
// (tests/e2e/walkthrough_land.mjs). Exercises the driver logic against
// a fake page (recording clicks/keypresses, no real browser) and a fake
// strategy, proving: (a) a claim only fires once the sweep cursor matches the
// decided plot, (b) a cursor mismatch logs a "decision_gesture_mismatch"
// entry and retries, and (c) the land-auction bid loop stops as soon as the
// strategy adapter flips to pass_land_auction.
//
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { driveLandGrant, driveLandAuction } from "../tests/e2e/walkthrough_land.mjs";
import { createWalkReport } from "../tests/e2e/walkthrough_report.mjs";

/** Minimal 4-player tuple satisfying marshalProjection's shape check. */
const FOUR_PLAYERS = [{}, {}, {}, {}];

// Build a valid land-grant projection: state.phase.kind must match the
// top-level phaseKind convenience field (marshalProjection cross-checks this).
function landGrantProjection({ activePlayerId, sweepRow, sweepCol }) {
  return {
    state: {
      phase: { kind: "land_grant", payload: { sweepRow, sweepCol } },
      players: FOUR_PLAYERS,
      round: 1,
    },
    phaseKind: "land_grant",
    activePlayerId,
    humanMoney: 100,
    sweepRow,
    sweepCol,
  };
}

// Build a valid land-auction projection with a minimal payload.
function landAuctionProjection({ askPrice }) {
  return {
    state: {
      phase: { kind: "land_auction", payload: { askPrice, row: 1, col: 1 } },
      players: FOUR_PLAYERS,
      round: 1,
    },
    phaseKind: "land_auction",
    activePlayerId: null,
    humanMoney: 100,
    sweepRow: null,
    sweepCol: null,
  };
}

// A fake page recording every click selector and keypress. waitForTimeout
// resolves immediately (no real timer), keeping tests fast.
function fakePage() {
  const page = {
    clicks: [],
    keypresses: [],
    async click(selector) {
      page.clicks.push(selector);
    },
    keyboard: {
      async press(key) {
        page.keypresses.push(key);
      },
    },
    async waitForTimeout() {
      // no-op: tests drive progress through the scripted projection queue,
      // not real elapsed time.
    },
  };
  return page;
}

/**
 * Build a fake `readProjection` simulating an engine-driven sweep cursor: on
 * each call it reports the next position in `cursorSequence` (holding at the
 * last entry once exhausted), unless a prior Enter/pass action set `claimed`,
 * in which case it reports the post-claim picker-exhausted projection
 * instead. Mirrors the real game: the cursor keeps sweeping independently of
 * this driver's polls, and only the driver's own action changes the picker.
 *
 * @param cursorSequence - Ordered `[row, col]` positions the cursor visits.
 * @param isClaimed - Returns true once the driver's action has landed.
 * @returns `readProjection(page)`.
 */
function makeSweepingReadProjection(cursorSequence, isClaimed) {
  let step = 0;
  return async () => {
    if (isClaimed()) {
      // The claim landed and the land-grant order is exhausted; the phase
      // moves on, exactly as it would once the last picker claims or passes.
      return {
        ...landGrantProjection({ activePlayerId: null, sweepRow: null, sweepCol: null }),
        phaseKind: "develop",
      };
    }
    const [row, col] = cursorSequence[Math.min(step, cursorSequence.length - 1)];
    step += 1;
    return landGrantProjection({ activePlayerId: 0, sweepRow: row, sweepCol: col });
  };
}

//============================================
test("driveLandGrant: claim only fires once the sweep cursor matches the decided plot", async () => {
  // Cursor sweeps (0,0) -> (1,2) -> (2,3); the strategy always wants (2, 3),
  // so Enter must not fire until the cursor's third position.
  let claimed = false;
  const readProjection = makeSweepingReadProjection(
    [
      [0, 0],
      [1, 2],
      [2, 3],
    ],
    () => claimed,
  );
  const decideLandGrant = () => ({ kind: "claim_plot", row: 2, col: 3 });

  const page = fakePage();
  page.keyboard.press = async (key) => {
    page.keypresses.push(key);
    claimed = true;
  };
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  await driveLandGrant(page, report, { readProjection, decideLandGrant });

  assert.deepEqual(page.keypresses, ["Enter"]);
  assert.deepEqual(page.clicks, []);
});

//============================================
test("driveLandGrant: a cursor mismatch logs decision_gesture_mismatch and retries", async () => {
  // Cursor sweeps two mismatched positions before reaching the decided plot
  // (1, 1), so exactly two mismatch entries must be logged before Enter fires.
  let claimed = false;
  const readProjection = makeSweepingReadProjection(
    [
      [0, 0],
      [5, 5],
      [6, 6],
      [1, 1],
    ],
    () => claimed,
  );
  const decideLandGrant = () => ({ kind: "claim_plot", row: 1, col: 1 });

  const page = fakePage();
  page.keyboard.press = async (key) => {
    page.keypresses.push(key);
    claimed = true;
  };
  const logged = [];
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const originalLog = report.log;
  report.log = (severity, message, extra) => {
    logged.push({ severity, message, extra });
    originalLog(severity, message, extra);
  };

  await driveLandGrant(page, report, { readProjection, decideLandGrant });

  const mismatchEntries = logged.filter((entry) =>
    entry.message.includes("decision_gesture_mismatch"),
  );
  assert.equal(mismatchEntries.length, 2);
  assert.deepEqual(page.keypresses, ["Enter"]);
});

//============================================
test("driveLandAuction: bid loop stops once the strategy flips to pass", async () => {
  let askPrice = 100;
  const decisions = ["bid_land", "bid_land", "pass_land_auction"];
  let decisionIndex = 0;
  const readProjection = async () => landAuctionProjection({ askPrice });
  const decideLandAuction = () => {
    const kind = decisions[Math.min(decisionIndex++, decisions.length - 1)];
    return { kind };
  };

  const page = fakePage();
  page.click = async (selector) => {
    page.clicks.push(selector);
    askPrice += 50;
  };
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });

  await driveLandAuction(page, report, { readProjection, decideLandAuction });

  assert.deepEqual(page.clicks, ['[data-action="land-bid"]', '[data-action="land-bid"]']);
});
