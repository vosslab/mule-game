// Node unit tests for the walkthrough sweep runner's pure aggregation and
// coverage logic (tests/e2e/e2e_walkthrough_sweep.mjs). Every case
// uses fabricated playthrough_report.json-shaped objects built inline; none
// launch a browser or spawn e2e_walkthrough.mjs.
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  emptyCoverage,
  deriveCoverage,
  unionCoverage,
  combineCoverage,
  coverageSatisfied,
  truncationRuleFailed,
  evaluateRunOutcome,
  buildRunRecord,
  sortWorstFirst,
  taxonomyCounts,
  aggregateSweep,
  selectSeedsForMode,
} from "../tests/e2e/e2e_walkthrough_sweep.mjs";

//============================================
/**
 * Build a minimal playthrough_report.json-shaped object with sane defaults,
 * overridable per test.
 *
 * @param overrides - Partial fields to merge over the defaults.
 * @returns A fabricated report object.
 */
function makeReport(overrides = {}) {
  return {
    failure: null,
    log: [],
    run: { finalRound: 4, colonyFailed: false },
    counters: {
      humanTurnsCompleted: 4,
      plansAttempted: 4,
      plansCompleted: 4,
      verifiedPlacements: 1,
      trades: 0,
      gambles: 0,
      truncatedTurns: 0,
    },
    ...overrides,
  };
}

// ============================================================
// deriveCoverage
// ============================================================

test("deriveCoverage reports false across the board for a bare report", () => {
  const coverage = deriveCoverage(makeReport());
  assert.deepEqual(coverage, {
    landAuctionEntered: false,
    humanBuy: false,
    humanSell: false,
    gamble: false,
    placement: true,
  });
});

test("deriveCoverage sees landAuctionEntered from the phase-begin log line", () => {
  const report = makeReport({ log: [{ message: "phase begin: land_auction" }] });
  assert.equal(deriveCoverage(report).landAuctionEntered, true);
});

test("deriveCoverage sees humanBuy and humanSell from auction_outcome sign", () => {
  const report = makeReport({
    log: [
      { message: "auction_outcome", extra: { humanGoodsDelta: 5 } },
      { message: "auction_outcome", extra: { humanGoodsDelta: -3 } },
    ],
  });
  const coverage = deriveCoverage(report);
  assert.equal(coverage.humanBuy, true);
  assert.equal(coverage.humanSell, true);
});

test("deriveCoverage reads gamble and placement straight from counters", () => {
  const report = makeReport({ counters: { gambles: 2, verifiedPlacements: 0 } });
  const coverage = deriveCoverage(report);
  assert.equal(coverage.gamble, true);
  assert.equal(coverage.placement, false);
});

// ============================================================
// unionCoverage / combineCoverage / coverageSatisfied
// ============================================================

test("unionCoverage ORs each flag independently", () => {
  const a = {
    landAuctionEntered: true,
    humanBuy: false,
    humanSell: false,
    gamble: false,
    placement: false,
  };
  const b = {
    landAuctionEntered: false,
    humanBuy: true,
    humanSell: false,
    gamble: false,
    placement: false,
  };
  const combined = unionCoverage(a, b);
  assert.equal(combined.landAuctionEntered, true);
  assert.equal(combined.humanBuy, true);
  assert.equal(combined.humanSell, false);
});

test("combineCoverage of an empty list equals emptyCoverage", () => {
  assert.deepEqual(combineCoverage([]), emptyCoverage());
});

test("coverageSatisfied is true only when every flag is true", () => {
  const all = {
    landAuctionEntered: true,
    humanBuy: true,
    humanSell: true,
    gamble: true,
    placement: true,
  };
  assert.equal(coverageSatisfied(all), true);
  assert.equal(coverageSatisfied({ ...all, gamble: false }), false);
});

// ============================================================
// truncationRuleFailed
// ============================================================

test("truncationRuleFailed is false when zero turns completed", () => {
  const report = makeReport({ counters: { humanTurnsCompleted: 0, truncatedTurns: 0 } });
  assert.equal(truncationRuleFailed(report), false);
});

test("truncationRuleFailed is false at exactly half truncated", () => {
  const report = makeReport({ counters: { humanTurnsCompleted: 4, truncatedTurns: 2 } });
  assert.equal(truncationRuleFailed(report), false);
});

test("truncationRuleFailed is true when more than half truncated", () => {
  const report = makeReport({ counters: { humanTurnsCompleted: 4, truncatedTurns: 3 } });
  assert.equal(truncationRuleFailed(report), true);
});

// ============================================================
// evaluateRunOutcome
// ============================================================

test("evaluateRunOutcome passes a clean report with a verified placement", () => {
  const { passed, reasons } = evaluateRunOutcome(makeReport());
  assert.equal(passed, true);
  assert.deepEqual(reasons, []);
});

test("evaluateRunOutcome fails on a recorded failure", () => {
  const report = makeReport({ failure: { failureKind: "page_error", message: "boom" } });
  const { passed, reasons } = evaluateRunOutcome(report);
  assert.equal(passed, false);
  assert.equal(
    reasons.some((reason) => reason.includes("page_error")),
    true,
  );
});

test("evaluateRunOutcome fails when verifiedPlacements is zero even with no failure", () => {
  const report = makeReport({ counters: { verifiedPlacements: 0 } });
  const { passed, reasons } = evaluateRunOutcome(report);
  assert.equal(passed, false);
  assert.equal(reasons.includes("verifiedPlacements<1"), true);
});

test("evaluateRunOutcome waives the placement rule on an early colony failure", () => {
  const report = makeReport({
    run: { finalRound: 2, colonyFailed: true },
    counters: { humanTurnsCompleted: 2, verifiedPlacements: 0 },
  });
  const { passed, reasons } = evaluateRunOutcome(report);
  assert.equal(passed, true);
  assert.equal(reasons.includes("placement waived: colony failure at round 2"), true);
});

test("evaluateRunOutcome still fails a full-length run with zero placements", () => {
  const report = makeReport({
    run: { finalRound: 4, colonyFailed: false },
    counters: { verifiedPlacements: 0 },
  });
  const { passed, reasons } = evaluateRunOutcome(report);
  assert.equal(passed, false);
  assert.equal(reasons.includes("verifiedPlacements<1"), true);
});

test("evaluateRunOutcome fails on the majority-truncated rule", () => {
  const report = makeReport({
    counters: { humanTurnsCompleted: 4, truncatedTurns: 3, verifiedPlacements: 1 },
  });
  const { passed } = evaluateRunOutcome(report);
  assert.equal(passed, false);
});

// ============================================================
// sortWorstFirst / taxonomyCounts / aggregateSweep
// ============================================================

test("sortWorstFirst puts every failed run before every passed run", () => {
  const passedReport = makeReport();
  const failedReport = makeReport({ failure: { failureKind: "walk_stall", message: "stuck" } });
  const records = [
    buildRunRecord(3, "beginner", passedReport),
    buildRunRecord(1, "beginner", failedReport),
  ];
  const sorted = sortWorstFirst(records);
  assert.equal(sorted[0].passed, false);
  assert.equal(sorted[1].passed, true);
});

test("taxonomyCounts counts only failed runs, keyed by failureKind", () => {
  const records = [
    buildRunRecord(
      1,
      "beginner",
      makeReport({ failure: { failureKind: "walk_stall", message: "a" } }),
    ),
    buildRunRecord(
      2,
      "beginner",
      makeReport({ failure: { failureKind: "walk_stall", message: "b" } }),
    ),
    buildRunRecord(3, "beginner", makeReport()),
  ];
  assert.deepEqual(taxonomyCounts(records), { walk_stall: 2 });
});

test("aggregateSweep reports exitCode 0 when every run passes and matrix coverage is full", () => {
  const fullCoverageLog = [
    { message: "phase begin: land_auction" },
    { message: "auction_outcome", extra: { humanGoodsDelta: 5 } },
    { message: "auction_outcome", extra: { humanGoodsDelta: -5 } },
  ];
  const report = makeReport({
    log: fullCoverageLog,
    counters: { verifiedPlacements: 1, gambles: 1 },
  });
  const records = [buildRunRecord(1, "beginner", report)];
  const summary = aggregateSweep(records);
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.matrixCoverageSatisfied, true);
});

test("aggregateSweep reports exitCode 1 when matrix coverage is incomplete", () => {
  const records = [buildRunRecord(1, "beginner", makeReport())];
  const summary = aggregateSweep(records);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.matrixCoverageSatisfied, false);
});

test("aggregateSweep reports exitCode 1 when any run failed, even with full coverage", () => {
  const fullCoverageLog = [
    { message: "phase begin: land_auction" },
    { message: "auction_outcome", extra: { humanGoodsDelta: 5 } },
    { message: "auction_outcome", extra: { humanGoodsDelta: -5 } },
  ];
  const passing = makeReport({
    log: fullCoverageLog,
    counters: { verifiedPlacements: 1, gambles: 1 },
  });
  const failing = makeReport({ failure: { failureKind: "page_error", message: "boom" } });
  const records = [buildRunRecord(1, "beginner", passing), buildRunRecord(2, "beginner", failing)];
  const summary = aggregateSweep(records);
  assert.equal(summary.exitCode, 1);
});

// ============================================================
// selectSeedsForMode
// ============================================================

test("selectSeedsForMode stops early once needed useful seeds satisfy coverage", async () => {
  // Fabricated per-seed coverage: seed 1 covers land auction + buy, seed 2
  // covers sell + gamble, seed 3 covers placement. The scan should stop at
  // seed 3 (never evaluating seed 4+) because all three are useful.
  const coverageBySeed = {
    1: {
      landAuctionEntered: true,
      humanBuy: true,
      humanSell: false,
      gamble: false,
      placement: false,
    },
    2: {
      landAuctionEntered: false,
      humanBuy: false,
      humanSell: true,
      gamble: true,
      placement: false,
    },
    3: {
      landAuctionEntered: false,
      humanBuy: false,
      humanSell: false,
      gamble: false,
      placement: true,
    },
    4: {
      landAuctionEntered: false,
      humanBuy: false,
      humanSell: false,
      gamble: false,
      placement: false,
    },
  };
  const evaluatedSeeds = [];
  async function evaluateSeed(seed) {
    evaluatedSeeds.push(seed);
    return coverageBySeed[seed];
  }
  const result = await selectSeedsForMode("beginner", evaluateSeed, {
    start: 1,
    end: 10,
    needed: 3,
  });
  assert.deepEqual(result.seeds, [1, 2, 3]);
  assert.equal(result.satisfied, true);
  assert.deepEqual(evaluatedSeeds, [1, 2, 3]);
});

test("selectSeedsForMode skips redundant seeds and pads with fallback seeds when needed", async () => {
  // Seed 1 is useful; seed 2 is fully redundant with seed 1; seed 3 adds a
  // new flag. With needed=3 the scan must still return exactly 3 seeds by
  // padding with the redundant seed 2 once the scan window (1..3) is spent.
  const coverageBySeed = {
    1: {
      landAuctionEntered: true,
      humanBuy: false,
      humanSell: false,
      gamble: false,
      placement: false,
    },
    2: {
      landAuctionEntered: true,
      humanBuy: false,
      humanSell: false,
      gamble: false,
      placement: false,
    },
    3: {
      landAuctionEntered: false,
      humanBuy: true,
      humanSell: false,
      gamble: false,
      placement: false,
    },
  };
  async function evaluateSeed(seed) {
    return coverageBySeed[seed];
  }
  const result = await selectSeedsForMode("beginner", evaluateSeed, {
    start: 1,
    end: 3,
    needed: 3,
  });
  assert.deepEqual(result.seeds, [1, 2, 3]);
  assert.equal(result.satisfied, false);
});

test("selectSeedsForMode is bounded by end even if coverage never becomes satisfied", async () => {
  async function evaluateSeed() {
    return emptyCoverage();
  }
  const result = await selectSeedsForMode("beginner", evaluateSeed, {
    start: 1,
    end: 5,
    needed: 3,
  });
  assert.equal(result.seeds.length, 3);
  assert.equal(result.satisfied, false);
});
