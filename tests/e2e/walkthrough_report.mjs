// Evidence/report module for the full-game walkthrough harness. Owns the
// closed failureKind taxonomy, the run-summary counters, phase timing,
// severity-tagged log entries, playwright error collectors, and the
// screenshot-on-phase-transition helper. Intentionally imports nothing from
// walkthrough_helpers.mjs (the startup/plumbing module, owned separately);
// the orchestrator (e2e_walkthrough.mjs) wires the two together into the
// phase loop.
//
// Pure Node module: attachErrorCollectors() takes any event-emitter-shaped
// "page" (an object with an `on(event, handler)` method), so this file is
// importable and testable without launching a real browser.

import fs from "node:fs";
import path from "node:path";

/**
 * Closed set of failureKind values a walkthrough run can report. Any other
 * string passed to fail() is a bug in the caller, not a new failure mode, so
 * it throws immediately instead of silently widening the taxonomy.
 */
export const FAILURE_KINDS = Object.freeze([
  "phase_timeout",
  "act_did_not_advance",
  "walk_stall",
  "decision_gesture_mismatch",
  "unknown_plan_kind",
  "console_error",
  "page_error",
  "network_error",
  "run_stalled",
  "invariant_violation",
  "auction_stalled",
]);

/**
 * Browser-origin noise that is provably external to this app and therefore
 * safe to ignore rather than fail the run on. Each entry names the noise and
 * carries a one-line justification; app-origin noise must be fixed at the
 * source instead of added here.
 */
const EXPECTED_NOISE = [
  {
    label: "favicon",
    // Browsers request /favicon.ico automatically; the game ships no
    // favicon asset, and the resulting 404 is not an app bug.
    matches: (detail) => typeof detail.url === "string" && detail.url.endsWith("/favicon.ico"),
  },
];

//============================================
/**
 * Check whether an error-collector detail matches a known expected-noise
 * entry.
 *
 * @param detail - The console/pageerror/network detail object being tested.
 * @returns True when the detail matches an EXPECTED_NOISE entry.
 */
function isExpectedNoise(detail) {
  return EXPECTED_NOISE.some((entry) => entry.matches(detail));
}

//============================================
/**
 * Build a zeroed-out summary counters object matching the phase model:
 * humanTurnsCompleted counts completed human develop turns (one per round;
 * at scoring it equals state.round reached, which also covers early
 * colony-failure scoring). It is bumped by e2e_walkthrough.mjs's
 * createHumanDevelopTurnCounter, which counts from observed engine-state
 * transitions (the human seat's develop turn closing), NOT from the walker's
 * own end-turn click -- so a turn that ends by truncation, a gamble, or the
 * engine exhausting the tick budget still counts. See that factory's comment
 * for the full counting contract.
 *
 * @returns A fresh counters object with every field at zero.
 */
function zeroCounters() {
  return {
    humanTurnsCompleted: 0,
    plansAttempted: 0,
    plansCompleted: 0,
    verifiedPlacements: 0,
    trades: 0,
    gambles: 0,
    truncatedTurns: 0,
  };
}

//============================================
/**
 * Create a walkthrough evidence report: a log, phase timings, a closed-set
 * failureKind, run counters, playwright error collectors, and a screenshot
 * helper, all scoped to one run.
 *
 * @param options - `{ seed, mode, speed }` identifying the run being reported.
 * @returns The report handle with log/beginPhase/endPhase/fail/counters/
 *   attachErrorCollectors/screenshot/write.
 */
export function createWalkReport({ seed, mode, speed }) {
  const startedAt = new Date().toISOString();
  const log = [];
  const phaseTimings = [];
  const openPhases = new Map();
  const counters = zeroCounters();
  let failure = null;

  //============================================
  /**
   * Append a timestamped, severity-tagged entry to the run log.
   *
   * @param severity - One of "info", "warn", or "error".
   * @param message - Human-readable log message.
   * @param extra - Optional extra structured detail to attach to the entry.
   */
  function logEntry(severity, message, extra = undefined) {
    const entry = { timestamp: new Date().toISOString(), severity, message };
    if (extra !== undefined) {
      entry.extra = extra;
    }
    log.push(entry);
  }

  //============================================
  /**
   * Mark the start of a named phase, recording its start time so endPhase()
   * can compute the elapsed duration.
   *
   * @param kind - The phase kind beginning (e.g. "land_grant").
   */
  function beginPhase(kind) {
    openPhases.set(kind, Date.now());
    logEntry("info", `phase begin: ${kind}`);
  }

  //============================================
  /**
   * Mark the end of a named phase, recording its elapsed duration in
   * phaseTimings. A phase ended without a matching beginPhase() records a
   * null startedAtMs/durationMs rather than throwing, so a caller reporting
   * a late-discovered phase boundary is not lost.
   *
   * @param kind - The phase kind ending (must match a prior beginPhase()
   *   call to compute a duration).
   */
  function endPhase(kind) {
    const startMs = openPhases.get(kind);
    const endMs = Date.now();
    openPhases.delete(kind);
    phaseTimings.push({
      kind,
      durationMs: startMs === undefined ? null : endMs - startMs,
    });
    logEntry("info", `phase end: ${kind}`);
  }

  //============================================
  /**
   * Record the run's terminal failure. failureKind must be one of the
   * closed FAILURE_KINDS values; any other value is a caller bug and throws
   * immediately rather than silently widening the taxonomy. First failure
   * wins: once a failure is recorded, later calls still log their message
   * (so the full sequence of events stays visible) but do not overwrite the
   * stored failure, so a benign teardown event occurring after the real
   * root cause can never clobber it.
   *
   * @param failureKind - One of FAILURE_KINDS.
   * @param message - Human-readable failure message.
   * @param extra - Optional extra structured detail.
   */
  function fail(failureKind, message, extra = undefined) {
    if (!FAILURE_KINDS.includes(failureKind)) {
      throw new Error(
        `unknown failureKind "${failureKind}"; must be one of: ${FAILURE_KINDS.join(", ")}`,
      );
    }
    if (failure === null) {
      failure = { failureKind, message };
    }
    logEntry("error", message, extra);
  }

  //============================================
  /**
   * Report whether the run has recorded a terminal failure yet. Lets the
   * orchestrator (e2e_walkthrough.mjs) check the report's failure state
   * right after a phase driver call returns, instead of waiting for a later
   * timeout to notice the driver already gave up.
   *
   * @returns True once fail() has been called at least once for this run.
   */
  function hasFailed() {
    return failure !== null;
  }

  //============================================
  /**
   * A shallow copy of the run's log entries so far. Lets the orchestrator
   * (e2e_walkthrough.mjs) inspect specific logged events -- for example the
   * auction_outcome tuples driveAuction records -- while a run is still
   * live, without waiting for write() to persist the report to disk.
   * Returns a copy, not the internal array, so a caller cannot mutate the
   * report's own log.
   *
   * @returns A new array containing every log entry recorded so far.
   */
  function getLog() {
    return [...log];
  }

  //============================================
  /**
   * Wire console, pageerror, and same-origin network-failure listeners onto
   * a playwright page (or any event-emitter-shaped object exposing `on`).
   * console.error, pageerror, and same-origin request failures are fatal
   * (recorded via fail()); console.warn is recorded as a nonfatal log entry.
   * Provably external noise (see EXPECTED_NOISE) is filtered out entirely.
   *
   * @param page - The Playwright page, or any object with an `on` method.
   */
  function attachErrorCollectors(page) {
    page.on("console", (message) => {
      const type = message.type();
      const text = typeof message.text === "function" ? message.text() : String(message);
      if (type === "warning") {
        logEntry("warn", `console.warn: ${text}`);
        return;
      }
      if (type !== "error") {
        return;
      }
      if (isExpectedNoise({ text })) {
        return;
      }
      fail("console_error", `console.error: ${text}`);
    });

    page.on("pageerror", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (isExpectedNoise({ text: message })) {
        return;
      }
      fail("page_error", `pageerror: ${message}`);
    });

    page.on("requestfailed", (request) => {
      const url = typeof request.url === "function" ? request.url() : String(request);
      if (isExpectedNoise({ url })) {
        return;
      }
      const failureText = request.failure?.()?.errorText ?? "unknown network failure";
      fail("network_error", `requestfailed: ${url} (${failureText})`);
    });

    page.on("response", (response) => {
      const status = typeof response.status === "function" ? response.status() : null;
      if (status === null || status < 400) {
        return;
      }
      const url = typeof response.url === "function" ? response.url() : String(response);
      if (isExpectedNoise({ url })) {
        return;
      }
      fail("network_error", `response ${status}: ${url}`);
    });
  }

  //============================================
  /**
   * Save a full-page screenshot at a phase transition, naming the file with
   * the given tag so screenshots sort alongside the log by phase.
   *
   * @param page - The Playwright page.
   * @param name - File name (including extension) for the screenshot.
   * @param screenshotsDir - Absolute directory to save the screenshot into.
   */
  async function screenshot(page, name, screenshotsDir) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotsDir, name) });
  }

  //============================================
  /**
   * Write playthrough_report.json into the given directory, assembling the
   * final report shape from the run's log, phase timings, failure, and
   * counters. `outcome.finalRound` and `outcome.colonyFailed` are folded
   * into `run` so a scoring-reached run records its explicit colony-failure
   * signal (src/engine/scoring.ts `checkColonyFailure`, surfaced on
   * `ScoringPayload.colonyFailed`) alongside the round it reached. Both
   * default to null when scoring was never reached.
   *
   * @param dir - Absolute directory to write playthrough_report.json into.
   * @param outcome - Optional `{ finalRound, colonyFailed }` from the run's
   *   phase loop.
   * @returns The absolute path of the written report file.
   */
  function write(dir, outcome = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const finalRound = outcome.finalRound ?? null;
    const colonyFailed = outcome.colonyFailed ?? null;
    const report = {
      run: {
        seed,
        mode,
        speed,
        startedAt,
        finishedAt: new Date().toISOString(),
        finalRound,
        colonyFailed,
      },
      log,
      phaseTimings,
      failure,
      counters,
    };
    const reportPath = path.join(dir, "playthrough_report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
  }

  return {
    log: logEntry,
    beginPhase,
    endPhase,
    fail,
    hasFailed,
    getLog,
    counters,
    attachErrorCollectors,
    screenshot,
    write,
  };
}
