// Sweep runner for the active walkthrough harness. Spawns
// e2e_walkthrough.mjs once per (seed, mode) pair in a matrix, copies each
// run's playthrough_report.json out of the way before the next run
// overwrites it, then aggregates the copies into one sweep_summary.json:
// per-run pass/fail against the release rules (no failure, at least one
// verified placement, and no majority-truncated develop turns), a
// failureKind taxonomy count, and the release gate's cross-matrix coverage
// check (at least one land auction entered, one human buy, one human sell,
// one pub gamble, one verified placement, somewhere in the whole matrix).
// A run that ends early via a documented colony failure (see
// evaluateRunOutcome) is exempt from the per-run placement rule; the
// matrix-level coverage check above still applies unchanged.
//
// The default sweep uses the recorded seed set (seeds {1, 3, 7} x modes
// {beginner, standard}). Pass --find-seeds to instead run the deterministic
// forward scan (seeds 1..100 ascending, first three per mode whose combined
// coverage satisfies the table) and use its result as the matrix for that
// run. The scan is opt-in because each candidate seed costs a full ~1-2
// minute walkthrough run; when a scan finds a better set than the recorded
// one, a human updates RECORDED_SEEDS below by hand (the scan never writes
// back to this file on its own).
//
// Per docs/E2E_TESTS.md (non-browser tier, tests/e2e/, e2e_ prefix,
// self-contained, run directly rather than via pytest).
//
// Run the default recorded-seed sweep:
//   node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs
// Run the deterministic seed-discovery scan instead:
//   node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs --find-seeds

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { REPO_ROOT } from "./walkthrough_helpers.mjs";

/** Recorded default seed set per mode. Updated by hand after a --find-seeds run finds a better set. */
export const RECORDED_SEEDS = { beginner: [1, 3, 7], standard: [1, 3, 7] };

/** Modes covered by the default sweep matrix. */
export const SWEEP_MODES = ["beginner", "standard"];

/** Directory the sweep writes its per-run report copies and sweep_summary.json into. */
const SWEEP_DIR = path.join(REPO_ROOT, "test-results", "walker", "sweep");

/** The playthrough_report.json path e2e_walkthrough.mjs writes on every run (default location). */
const RUN_REPORT_PATH = path.join(REPO_ROOT, "test-results", "walker", "playthrough_report.json");

/** Bounds for the deterministic forward seed-discovery scan. */
const SCAN_START_SEED = 1;
const SCAN_END_SEED = 100;
const SCAN_NEEDED_SEEDS = 3;

//============================================
/**
 * A coverage object with every flag false. The five flags mirror the
 * release gate's cross-matrix coverage criteria exactly: one land auction
 * entered, one human buy, one human sell, one pub gamble, one verified
 * placement.
 *
 * @returns A fresh all-false coverage object.
 */
export function emptyCoverage() {
  return {
    landAuctionEntered: false,
    humanBuy: false,
    humanSell: false,
    gamble: false,
    placement: false,
  };
}

//============================================
/**
 * Derive one run's coverage flags from its playthrough_report.json shape.
 * landAuctionEntered comes from the phase-begin log line (present even if
 * the run fails mid-phase); humanBuy/humanSell come from the sign of every
 * auction_outcome tuple's humanGoodsDelta; gamble/placement come straight
 * from the run's own counters.
 *
 * @param report - A parsed playthrough_report.json object.
 * @returns This run's coverage flags.
 */
export function deriveCoverage(report) {
  const log = Array.isArray(report.log) ? report.log : [];
  const counters = report.counters ?? {};
  const landAuctionEntered = log.some((entry) => entry.message === "phase begin: land_auction");
  const auctionOutcomes = log.filter((entry) => entry.message === "auction_outcome");
  const humanBuy = auctionOutcomes.some((entry) => (entry.extra?.humanGoodsDelta ?? 0) > 0);
  const humanSell = auctionOutcomes.some((entry) => (entry.extra?.humanGoodsDelta ?? 0) < 0);
  return {
    landAuctionEntered,
    humanBuy,
    humanSell,
    gamble: (counters.gambles ?? 0) > 0,
    placement: (counters.verifiedPlacements ?? 0) > 0,
  };
}

//============================================
/**
 * Combine two coverage objects field-by-field with logical OR.
 *
 * @param a - First coverage object.
 * @param b - Second coverage object.
 * @returns A new coverage object where each flag is true if either input has it true.
 */
export function unionCoverage(a, b) {
  return {
    landAuctionEntered: a.landAuctionEntered || b.landAuctionEntered,
    humanBuy: a.humanBuy || b.humanBuy,
    humanSell: a.humanSell || b.humanSell,
    gamble: a.gamble || b.gamble,
    placement: a.placement || b.placement,
  };
}

//============================================
/**
 * Fold unionCoverage over a list of coverage objects, starting from
 * emptyCoverage().
 *
 * @param coverages - A list of per-run coverage objects.
 * @returns The combined coverage across every entry.
 */
export function combineCoverage(coverages) {
  return coverages.reduce(unionCoverage, emptyCoverage());
}

//============================================
/**
 * Check whether every release-gate coverage flag is satisfied.
 *
 * @param coverage - A coverage object (typically already combined across runs).
 * @returns True only if every flag is true.
 */
export function coverageSatisfied(coverage) {
  return (
    coverage.landAuctionEntered &&
    coverage.humanBuy &&
    coverage.humanSell &&
    coverage.gamble &&
    coverage.placement
  );
}

//============================================
/**
 * Check the truncation release rule: a run fails when more than half of its
 * completed human develop turns ended develop_plan_truncated. A run with
 * zero completed turns cannot have truncated more than half of nothing, so
 * it passes this specific rule (other rules still apply).
 *
 * @param report - A parsed playthrough_report.json object.
 * @returns True if the truncation rule is violated (the run should fail).
 */
export function truncationRuleFailed(report) {
  const counters = report.counters ?? {};
  const humanTurnsCompleted = counters.humanTurnsCompleted ?? 0;
  const truncatedTurns = counters.truncatedTurns ?? 0;
  if (humanTurnsCompleted === 0) {
    return false;
  }
  return truncatedTurns > humanTurnsCompleted / 2;
}

//============================================
/**
 * Evaluate one run's report against every release rule: no recorded
 * failure, at least one verified placement, and the truncation rule above.
 * Collects a human-readable reason for each violated rule so the worst-first
 * table can explain a failing run at a glance.
 *
 * The per-run placement rule assumed full-length games; a run whose game
 * terminated via colony failure (src/engine/scoring.ts `checkColonyFailure`,
 * surfaced as `run.colonyFailed` on the written report -- true only on a
 * non-final round, per `checkColonyFailure`'s own round guard) before the
 * mode's full round count is exempt from `verifiedPlacements >= 1`: the
 * human never got a further develop turn to place in. This waiver is
 * recorded as a non-blocking entry in `reasons` (so the worst-first table
 * stays honest about why placements were zero) without failing the run;
 * `reasons` therefore is not purely a list of failures, and `passed` is
 * tracked independently rather than derived from `reasons.length === 0`.
 * The matrix-level coverage check (`coverageSatisfied`) is unaffected and
 * still requires placement coverage somewhere across the whole sweep.
 *
 * @param report - A parsed playthrough_report.json object.
 * @returns `{ passed, reasons }`: reasons may be non-empty even when passed
 *   is true (a waived rule still leaves an explanatory entry).
 */
export function evaluateRunOutcome(report) {
  const reasons = [];
  let passed = true;

  if (report.failure !== null && report.failure !== undefined) {
    reasons.push(`failureKind=${report.failure.failureKind}`);
    passed = false;
  }

  const verifiedPlacements = report.counters?.verifiedPlacements ?? 0;
  if (verifiedPlacements < 1) {
    if (report.run?.colonyFailed === true) {
      const round = report.run?.finalRound ?? "unknown";
      reasons.push(`placement waived: colony failure at round ${round}`);
    } else {
      reasons.push("verifiedPlacements<1");
      passed = false;
    }
  }

  if (truncationRuleFailed(report)) {
    reasons.push("majority of develop turns truncated");
    passed = false;
  }

  return { passed, reasons };
}

//============================================
/**
 * Build one sweep-summary run record from a completed run's report.
 *
 * @param seed - The seed the run used.
 * @param mode - The mode the run used ("beginner" or "standard").
 * @param report - The run's parsed playthrough_report.json object.
 * @returns A flat record combining outcome, coverage, and the counters that
 *   justify them, ready to sort and print.
 */
export function buildRunRecord(seed, mode, report) {
  const { passed, reasons } = evaluateRunOutcome(report);
  return {
    seed,
    mode,
    passed,
    reasons,
    failureKind: report.failure?.failureKind ?? null,
    coverage: deriveCoverage(report),
    counters: report.counters ?? {},
  };
}

//============================================
/**
 * Sort run records worst-first: every failed run before every passed run,
 * with failed runs grouped by failureKind (alphabetically, "none" last)
 * so repeated failure modes cluster together, and seed ascending within
 * each group.
 *
 * @param records - Run records built by buildRunRecord.
 * @returns A new, sorted array (the input array is not mutated).
 */
export function sortWorstFirst(records) {
  function sortKey(record) {
    const passedRank = record.passed ? 1 : 0;
    const failureKindKey = record.failureKind ?? "zzz_none";
    return [passedRank, failureKindKey, record.mode, record.seed];
  }
  return [...records].sort((a, b) => {
    const keyA = sortKey(a);
    const keyB = sortKey(b);
    for (let index = 0; index < keyA.length; index += 1) {
      if (keyA[index] < keyB[index]) {
        return -1;
      }
      if (keyA[index] > keyB[index]) {
        return 1;
      }
    }
    return 0;
  });
}

//============================================
/**
 * Render a worst-first plain-text table of every run record: one line per
 * run, PASS/FAIL first, then seed, mode, failureKind, and reasons.
 *
 * @param records - Run records, expected to already be worst-first sorted.
 * @returns The rendered table as a single multi-line string.
 */
export function formatWorstFirstTable(records) {
  const lines = ["status  seed  mode      failureKind          reasons"];
  for (const record of records) {
    const status = record.passed ? "PASS" : "FAIL";
    const seedCol = String(record.seed).padEnd(4);
    const modeCol = record.mode.padEnd(8);
    const failureKindCol = String(record.failureKind ?? "none").padEnd(20);
    const reasonsCol = record.reasons.join("; ") || "-";
    lines.push(`${status}    ${seedCol}  ${modeCol}  ${failureKindCol} ${reasonsCol}`);
  }
  return lines.join("\n");
}

//============================================
/**
 * Count how many run records recorded each failureKind (passed runs are
 * excluded).
 *
 * @param records - Run records built by buildRunRecord.
 * @returns Map of failureKind string to occurrence count.
 */
export function taxonomyCounts(records) {
  const counts = {};
  for (const record of records) {
    if (record.passed) {
      continue;
    }
    const key = record.failureKind ?? "unknown_no_failureKind";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

//============================================
/**
 * Aggregate a whole sweep's run records into the sweep_summary.json shape:
 * worst-first records, the failureKind taxonomy, per-mode combined coverage,
 * the cross-matrix combined coverage, and the process exit code the sweep
 * should use (nonzero on any failed run or unsatisfied matrix coverage).
 *
 * @param records - Run records built by buildRunRecord, any order.
 * @returns The full aggregate object written into sweep_summary.json.
 */
export function aggregateSweep(records) {
  const sorted = sortWorstFirst(records);
  const coverageByMode = {};
  for (const mode of new Set(records.map((record) => record.mode))) {
    const modeRecords = records.filter((record) => record.mode === mode);
    const combined = combineCoverage(modeRecords.map((record) => record.coverage));
    coverageByMode[mode] = { coverage: combined, satisfied: coverageSatisfied(combined) };
  }
  const matrixCoverage = combineCoverage(records.map((record) => record.coverage));
  const matrixCoverageSatisfied = coverageSatisfied(matrixCoverage);
  const anyRunFailed = records.some((record) => !record.passed);
  const exitCode = anyRunFailed || !matrixCoverageSatisfied ? 1 : 0;
  return {
    runs: sorted,
    taxonomyCounts: taxonomyCounts(records),
    coverageByMode,
    matrixCoverage,
    matrixCoverageSatisfied,
    exitCode,
  };
}

//============================================
/**
 * Deterministic forward seed-discovery scan for one mode: evaluate seeds
 * ascending from `start`, adding a seed to the selected set only when it
 * contributes at least one coverage flag the selected set does not already
 * have, until `needed` useful seeds are selected. If `end` is reached with
 * fewer than `needed` useful seeds, the remaining slots are filled with the
 * next ascending not-yet-selected seeds (still bounded and deterministic,
 * even though their coverage contribution is redundant).
 *
 * @param mode - The mode being scanned ("beginner" or "standard").
 * @param evaluateSeed - `async (seed, mode) => coverage`, injected so tests
 *   can fabricate coverage without running a real browser.
 * @param options - `{ start, end, needed }`, all optional (defaults 1, 100, 3).
 * @returns `{ seeds, coverage, satisfied }`: the chosen seed list (ascending,
 *   length `needed`), the combined coverage those seeds produce, and whether
 *   that combined coverage satisfies coverageSatisfied().
 */
export async function selectSeedsForMode(mode, evaluateSeed, options = {}) {
  const start = options.start ?? SCAN_START_SEED;
  const end = options.end ?? SCAN_END_SEED;
  const needed = options.needed ?? SCAN_NEEDED_SEEDS;
  const selected = [];
  let combined = emptyCoverage();
  const fallback = [];
  for (let seed = start; seed <= end && selected.length < needed; seed += 1) {
    // Scan is intentionally sequential (one browser run at a time).
    const coverage = await evaluateSeed(seed, mode);
    const candidateCombined = unionCoverage(combined, coverage);
    const isUseful = JSON.stringify(candidateCombined) !== JSON.stringify(combined);
    if (isUseful) {
      selected.push(seed);
      combined = candidateCombined;
    } else {
      fallback.push(seed);
    }
  }
  // If the scan ran out of useful seeds before reaching `needed`, pad the
  // set with the next ascending redundant seeds so the returned set is
  // always exactly `needed` seeds long.
  while (selected.length < needed && fallback.length > 0) {
    selected.push(fallback.shift());
  }
  selected.sort((a, b) => a - b);
  return { seeds: selected, coverage: combined, satisfied: coverageSatisfied(combined) };
}

//============================================
/**
 * Spawn one e2e_walkthrough.mjs run for the given seed and mode, wait for it
 * to finish, then copy its playthrough_report.json out to
 * test-results/walker/sweep/seed<N>_<mode>.json before the next run
 * overwrites the shared default report path.
 *
 * @param seed - The seed to run with.
 * @param mode - The mode to run with ("beginner" or "standard").
 * @returns The parsed report object copied out of this run.
 */
function runOneWalkthrough(seed, mode) {
  const walkthroughScript = path.join(REPO_ROOT, "tests", "e2e", "e2e_walkthrough.mjs");
  console.log(`\n=== e2e_walkthrough_sweep: running seed=${seed} mode=${mode} ===`);
  spawnSync(
    "node",
    ["--import", "tsx", walkthroughScript, "--seed", String(seed), "--mode", mode],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
  if (!fs.existsSync(RUN_REPORT_PATH)) {
    throw new Error(
      `seed=${seed} mode=${mode}: e2e_walkthrough.mjs did not write ${RUN_REPORT_PATH}`,
    );
  }
  const report = JSON.parse(fs.readFileSync(RUN_REPORT_PATH, "utf8"));
  fs.mkdirSync(SWEEP_DIR, { recursive: true });
  const copyPath = path.join(SWEEP_DIR, `seed${seed}_${mode}.json`);
  fs.copyFileSync(RUN_REPORT_PATH, copyPath);
  return report;
}

//============================================
/**
 * Parse the sweep's own CLI flags.
 *
 * @param argv - `process.argv.slice(2)`.
 * @returns `{ findSeeds }`.
 */
function parseArgs(argv) {
  const options = { findSeeds: false };
  for (const flag of argv) {
    if (flag === "--find-seeds") {
      options.findSeeds = true;
    } else {
      throw new Error(`unknown flag "${flag}"`);
    }
  }
  return options;
}

//============================================
/**
 * Resolve the seed matrix for one mode: either the recorded default set, or
 * (with --find-seeds) the result of the deterministic forward scan, run
 * against a real evaluateSeed backed by runOneWalkthrough.
 *
 * @param mode - The mode to resolve seeds for.
 * @param findSeeds - True to run the scan instead of using RECORDED_SEEDS.
 * @returns `{ seeds, usedScan, scanResult }`: scanResult is null when
 *   usedScan is false.
 */
async function resolveSeedsForMode(mode, findSeeds) {
  if (!findSeeds) {
    return { seeds: RECORDED_SEEDS[mode], usedScan: false, scanResult: null };
  }
  async function evaluateSeed(seed, evalMode) {
    const report = runOneWalkthrough(seed, evalMode);
    return deriveCoverage(report);
  }
  const scanResult = await selectSeedsForMode(mode, evaluateSeed);
  return { seeds: scanResult.seeds, usedScan: true, scanResult };
}

//============================================
/**
 * Entry point: resolve the seed matrix per mode, run every (seed, mode)
 * pair sequentially, aggregate the results, print the worst-first table,
 * write sweep_summary.json, and exit nonzero on any failure or unsatisfied
 * matrix coverage.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const seedSelection = {};
  const records = [];

  for (const mode of SWEEP_MODES) {
    // Resolving seeds for each mode may itself run a scan.
    const resolved = await resolveSeedsForMode(mode, options.findSeeds);
    seedSelection[mode] = resolved;
    for (const seed of resolved.seeds) {
      const report = runOneWalkthrough(seed, mode);
      records.push(buildRunRecord(seed, mode, report));
    }
  }

  const summary = aggregateSweep(records);
  summary.generatedAt = new Date().toISOString();
  summary.seedSelection = seedSelection;

  console.log("\n=== e2e_walkthrough_sweep: worst-first results ===");
  console.log(formatWorstFirstTable(summary.runs));
  console.log(`\ntaxonomyCounts: ${JSON.stringify(summary.taxonomyCounts)}`);
  console.log(`matrixCoverageSatisfied: ${summary.matrixCoverageSatisfied}`);

  fs.mkdirSync(SWEEP_DIR, { recursive: true });
  const summaryPath = path.join(SWEEP_DIR, "sweep_summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\nwrote ${summaryPath}`);

  if (summary.exitCode !== 0) {
    console.error("e2e_walkthrough_sweep: FAIL (see worst-first table and sweep_summary.json)");
  } else {
    console.log("e2e_walkthrough_sweep: PASS");
  }
  process.exitCode = summary.exitCode;
}

// Only run main() when this file is executed directly (node
// e2e_walkthrough_sweep.mjs), not when its pure functions are imported for
// unit testing (tests/test_walkthrough_sweep.mjs).
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  await main();
}
