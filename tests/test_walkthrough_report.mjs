// Node unit tests for the walkthrough evidence/report writer
// (tests/e2e/walkthrough_report.mjs). Covers the report JSON shape,
// closed-set failureKind validation, zeroed counter initialization, and
// timestamp+severity log entries, all without launching a browser.
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createWalkReport, FAILURE_KINDS } from "../tests/e2e/walkthrough_report.mjs";

//============================================
/**
 * Create a fresh temp directory for a single test's write() output.
 *
 * @returns Absolute path of the created temp directory.
 */
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "walkthrough-report-"));
}

//============================================
/**
 * Build a minimal event-emitter-shaped fake "page" so attachErrorCollectors
 * can be exercised without a real browser.
 *
 * @returns `{ page, emit }` where emit(event, ...args) invokes the handler
 *   registered for that event.
 */
function makeFakePage() {
  const handlers = new Map();
  const page = {
    on(event, handler) {
      handlers.set(event, handler);
    },
  };
  function emit(event, ...args) {
    const handler = handlers.get(event);
    handler(...args);
  }
  return { page, emit };
}

// ============================================================
// Report JSON shape and write()
// ============================================================

test("write() produces playthrough_report.json with the expected top-level shape", () => {
  const report = createWalkReport({ seed: 2026, mode: "standard", speed: "fast" });
  report.log("info", "run started");
  report.beginPhase("land_grant");
  report.endPhase("land_grant");

  const dir = makeTempDir();
  const reportPath = report.write(dir);
  const written = JSON.parse(fs.readFileSync(reportPath, "utf8"));

  assert.equal(written.run.seed, 2026);
  assert.equal(written.run.mode, "standard");
  assert.equal(written.run.speed, "fast");
  assert.equal(typeof written.run.startedAt, "string");
  assert.equal(typeof written.run.finishedAt, "string");
  assert.equal(written.failure, null);
  assert.equal(Array.isArray(written.log), true);
  assert.equal(Array.isArray(written.phaseTimings), true);
  assert.equal(written.phaseTimings[0].kind, "land_grant");
  assert.equal(typeof written.phaseTimings[0].durationMs, "number");
});

// ============================================================
// Closed-set failureKind validation
// ============================================================

test("fail() accepts every closed-taxonomy failureKind", () => {
  for (const failureKind of FAILURE_KINDS) {
    const report = createWalkReport({ seed: 1, mode: "standard", speed: "normal" });
    report.fail(failureKind, `example ${failureKind}`);
    const dir = makeTempDir();
    const written = JSON.parse(fs.readFileSync(report.write(dir), "utf8"));
    assert.equal(written.failure.failureKind, failureKind);
  }
});

test("fail() rejects a failureKind outside the closed taxonomy", () => {
  const report = createWalkReport({ seed: 1, mode: "standard", speed: "normal" });
  assert.throws(() => {
    report.fail("totally_made_up_kind", "should not be accepted");
  }, /unknown failureKind/);
});

test("fail() keeps the first-recorded failure even when called again", () => {
  const report = createWalkReport({ seed: 1, mode: "standard", speed: "normal" });
  report.fail("act_did_not_advance", "the real root cause");
  report.fail("console_error", "a later, benign teardown event");

  const dir = makeTempDir();
  const written = JSON.parse(fs.readFileSync(report.write(dir), "utf8"));

  assert.equal(written.failure.failureKind, "act_did_not_advance");
  assert.equal(written.failure.message, "the real root cause");
  // Both calls still log, so the full event sequence stays visible even
  // though only the first call's failure was kept.
  assert.equal(written.log.filter((entry) => entry.severity === "error").length, 2);
});

test("getLog() returns a live-readable copy that does not alias the report's own log", () => {
  const report = createWalkReport({ seed: 1, mode: "standard", speed: "normal" });
  report.log("info", "first entry");

  const snapshot = report.getLog();
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].message, "first entry");

  // Mutating the returned array must not affect the report's own log.
  snapshot.push({ severity: "info", message: "injected", timestamp: "x" });
  report.log("info", "second entry");
  assert.equal(report.getLog().length, 2);
});

// ============================================================
// Counters initialize to zero
// ============================================================

test("counters initialize to zero for every summary field", () => {
  const report = createWalkReport({ seed: 1, mode: "standard", speed: "normal" });

  assert.equal(report.counters.humanTurnsCompleted, 0);
  assert.equal(report.counters.plansAttempted, 0);
  assert.equal(report.counters.plansCompleted, 0);
  assert.equal(report.counters.verifiedPlacements, 0);
  assert.equal(report.counters.trades, 0);
  assert.equal(report.counters.gambles, 0);
  assert.equal(report.counters.truncatedTurns, 0);
});

// ============================================================
// Log entries carry timestamp and severity
// ============================================================

test("log() records a timestamp and the requested severity", () => {
  const report = createWalkReport({ seed: 1, mode: "standard", speed: "normal" });
  report.log("warn", "a nonfatal warning", { detail: "extra" });

  const dir = makeTempDir();
  const written = JSON.parse(fs.readFileSync(report.write(dir), "utf8"));
  const entry = written.log[0];

  assert.equal(entry.severity, "warn");
  assert.equal(entry.message, "a nonfatal warning");
  assert.equal(typeof entry.timestamp, "string");
  assert.equal(entry.extra.detail, "extra");
});

// ============================================================
// attachErrorCollectors: fatal vs nonfatal, and expected-noise filtering
// ============================================================

test("attachErrorCollectors treats console.error as fatal and console.warn as nonfatal", () => {
  const report = createWalkReport({ seed: 1, mode: "standard", speed: "normal" });
  const { page, emit } = makeFakePage();
  report.attachErrorCollectors(page);

  emit("console", { type: () => "warning", text: () => "just a warning" });
  const dir = makeTempDir();
  const afterWarn = JSON.parse(fs.readFileSync(report.write(dir), "utf8"));
  assert.equal(afterWarn.failure, null);

  emit("console", { type: () => "error", text: () => "boom" });
  const afterError = JSON.parse(fs.readFileSync(report.write(makeTempDir()), "utf8"));
  assert.equal(afterError.failure.failureKind, "console_error");
});

test("attachErrorCollectors filters the favicon 404 as expected noise", () => {
  const report = createWalkReport({ seed: 1, mode: "standard", speed: "normal" });
  const { page, emit } = makeFakePage();
  report.attachErrorCollectors(page);

  emit("response", { status: () => 404, url: () => "http://127.0.0.1:9999/favicon.ico" });

  const dir = makeTempDir();
  const written = JSON.parse(fs.readFileSync(report.write(dir), "utf8"));
  assert.equal(written.failure, null);
});

test("attachErrorCollectors fails on a same-origin non-favicon 404 response", () => {
  const report = createWalkReport({ seed: 1, mode: "standard", speed: "normal" });
  const { page, emit } = makeFakePage();
  report.attachErrorCollectors(page);

  emit("response", { status: () => 404, url: () => "http://127.0.0.1:9999/app.js" });

  const dir = makeTempDir();
  const written = JSON.parse(fs.readFileSync(report.write(dir), "utf8"));
  assert.equal(written.failure.failureKind, "network_error");
});
