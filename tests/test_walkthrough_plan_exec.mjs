// Node unit tests for the generic plan-kind dispatcher
// (tests/e2e/walkthrough_exec.mjs). Covers the negative path required
// by the walkthrough harness: a fabricated plan kind outside the closed
// PLAN_KINDS vocabulary is rejected with a "unknown_plan_kind" report
// failure, which the CLI's exit-code rule then classifies as nonzero; also
// covers the positive dispatch path and the distinct "recognized kind, no
// handler registered" caller-bug case.
//
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  executePlan,
  exitCodeForFailure,
  runActivePhaseDriver,
  assertActiveInvariants,
} from "../tests/e2e/walkthrough_exec.mjs";
import { createWalkReport } from "../tests/e2e/walkthrough_report.mjs";

//============================================
/**
 * Create a fresh temp directory for a single test's write() output.
 *
 * @returns Absolute path of the created temp directory.
 */
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "walkthrough-plan-exec-"));
}

//============================================
test("executePlan routes a recognized plan kind to its handler", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const calls = [];
  const handlers = {
    pass_land_grant: (plan) => {
      calls.push(plan);
      return "handled";
    },
  };

  const result = await executePlan({ kind: "pass_land_grant" }, report, handlers);

  assert.equal(result, "handled");
  assert.equal(calls.length, 1);
  assert.equal(report.hasFailed(), false);
});

//============================================
test("executePlan rejects a fabricated plan kind as unknown_plan_kind", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const handlers = {};

  const result = await executePlan({ kind: "totally_made_up_plan_kind" }, report, handlers);

  assert.equal(result, undefined);
  assert.equal(report.hasFailed(), true);
});

//============================================
test("a fabricated plan kind classifies the run as nonzero exit, same as the CLI", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  await executePlan({ kind: "totally_made_up_plan_kind" }, report, {});

  const written = JSON.parse(fs.readFileSync(report.write(makeTempDir()), "utf8"));

  assert.equal(written.failure.failureKind, "unknown_plan_kind");
  assert.equal(exitCodeForFailure(written.failure), 1);
});

//============================================
test("exitCodeForFailure returns 0 for a clean run", () => {
  assert.equal(exitCodeForFailure(null), 0);
});

//============================================
test("executePlan throws when a recognized plan kind has no registered handler", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });

  await assert.rejects(
    executePlan({ kind: "pass_land_grant" }, report, {}),
    /no handler registered for plan kind "pass_land_grant"/,
  );
  // A missing handler is a caller bug, not an out-of-taxonomy plan, so it
  // must not be recorded as a report failure.
  assert.equal(report.hasFailed(), false);
});

// ============================================================
// runActivePhaseDriver: the real orchestrator call site (e2e_walkthrough.mjs)
// ============================================================

test("runActivePhaseDriver reclassifies a driver's unexpected-plan-kind throw as unknown_plan_kind", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const driver = async () => {
    // Mirrors driveLandGrant/driveLandAuction's own defensive throw shape
    // (walkthrough_land.mjs) when the seat-0 strategy adapter drifts
    // outside PLAN_KINDS.
    throw new Error('driveLandGrant: unexpected plan kind "totally_made_up_plan_kind"');
  };

  await runActivePhaseDriver(driver, null, report, {});

  assert.equal(report.hasFailed(), true);
  const dir = makeTempDir();
  const written = JSON.parse(fs.readFileSync(report.write(dir), "utf8"));
  assert.equal(written.failure.failureKind, "unknown_plan_kind");
});

test("runActivePhaseDriver re-throws driveAuction's tick-ceiling failure unchanged after it classifies auction_stalled", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const driver = async () => {
    // Mirrors driveAuction's own tick-ceiling guard (walkthrough_auction.mjs):
    // classify via report.fail("auction_stalled", ...) before throwing, so
    // the failure is already recorded by the time it reaches this wrapper.
    const message =
      'driveAuction: exceeded 4000 ticks without the auction phase ending (stalled on good "food")';
    report.fail("auction_stalled", message);
    throw new Error(message);
  };

  await assert.rejects(runActivePhaseDriver(driver, null, report, {}), /exceeded 4000 ticks/);
  assert.equal(report.hasFailed(), true);
  const dir = makeTempDir();
  const written = JSON.parse(fs.readFileSync(report.write(dir), "utf8"));
  assert.equal(written.failure.failureKind, "auction_stalled");
});

test("runActivePhaseDriver passes through a clean driver call unchanged", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const calls = [];
  const driver = async (page, driverReport, deps) => {
    calls.push({ page, driverReport, deps });
  };

  await runActivePhaseDriver(driver, "fake-page", report, { some: "deps" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].page, "fake-page");
  assert.equal(calls[0].driverReport, report);
  assert.deepEqual(calls[0].deps, { some: "deps" });
  assert.equal(report.hasFailed(), false);
});

// ============================================================
// assertActiveInvariants: humanTurnsCompleted/round is a hard invariant;
// the participation-proven contract is a warn-and-continue log as of the
// second amendment (2026-07-10; see the function's doc comment). Trades
// themselves are not required per-run either way.
// ============================================================

test("assertActiveInvariants passes with a held role, a pushed intent, and zero trades", () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  report.counters.humanTurnsCompleted = 2;
  report.log("info", "auction_outcome", { role: "buyer", intentsPushed: 1 });

  assert.doesNotThrow(() => assertActiveInvariants(report, 2));
});

test("assertActiveInvariants throws when humanTurnsCompleted does not match the final round", () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  report.counters.humanTurnsCompleted = 1;
  report.log("info", "auction_outcome", { role: "buyer", intentsPushed: 1 });

  assert.throws(() => assertActiveInvariants(report, 2), /humanTurnsCompleted/);
  // The throw must not leave the report unclassified: fail() records
  // "invariant_violation" before the error propagates.
  assert.equal(report.hasFailed(), true);
  const dir = makeTempDir();
  const written = JSON.parse(fs.readFileSync(report.write(dir), "utf8"));
  assert.equal(written.failure.failureKind, "invariant_violation");
});

test("assertActiveInvariants passes when every auction window recorded the human as out", () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  report.counters.humanTurnsCompleted = 2;
  report.log("info", "auction_outcome", { role: "out" });
  report.log("info", "auction_outcome", { role: "out" });

  assert.doesNotThrow(() => assertActiveInvariants(report, 2));
  // The all-out save is logged so a sweep can count how often it fires.
  const savedEntry = report
    .getLog()
    .find((entry) => entry.message.includes("trades invariant satisfied"));
  assert.notEqual(savedEntry, undefined);
});

test("assertActiveInvariants passes with zero auction windows (vacuous all-out branch)", () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  report.counters.humanTurnsCompleted = 2;

  assert.doesNotThrow(() => assertActiveInvariants(report, 2));
});

test("assertActiveInvariants warns (does not throw) when a held-role window shows zero intents pushed and no trade", () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  report.counters.humanTurnsCompleted = 2;
  report.log("info", "auction_outcome", { role: "out" });
  report.log("info", "auction_outcome", { role: "buyer", intentsPushed: 0, humanGoodsDelta: 0 });

  // Second amendment (2026-07-10): the participation branch is a
  // warn-and-continue log, not a hard per-run invariant.
  assert.doesNotThrow(() => assertActiveInvariants(report, 2));
  assert.equal(report.hasFailed(), false);
  const warnEntry = report
    .getLog()
    .find((entry) => entry.severity === "warn" && entry.message.includes("proven participation"));
  assert.notEqual(warnEntry, undefined);
  assert.equal(warnEntry.extra.heldRoleWindows, 1);
});

test("assertActiveInvariants passes with a held role, zero intents pushed, but a cleared trade", () => {
  // Mirrors real seed 3 evidence: a held "seller" window traded at the
  // engine's auto-assigned opening price with zero intent pushes needed.
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  report.counters.humanTurnsCompleted = 2;
  report.log("info", "auction_outcome", { role: "seller", intentsPushed: 0, humanGoodsDelta: -1 });

  assert.doesNotThrow(() => assertActiveInvariants(report, 2));
});
