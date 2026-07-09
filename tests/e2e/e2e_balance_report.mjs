// E2E check for the balance-sim HTML dashboard:
// runs the real `tests/e2e/e2e_balance_sim.mjs --report` command as a real
// subprocess at a tiny seed count and reads the report file it writes under
// output_smoke/, confirming every required section anchor is present. This
// is non-browser whole-system E2E per docs/E2E_TESTS.md (real subprocess,
// real file I/O), so it lives under tests/e2e/ with the e2e_ prefix rather
// than in the fast pytest-speed tests/test_*.mjs lane. Run directly:
//
//   node --import tsx tests/e2e/e2e_balance_report.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** Repo root, resolved via git so the harness runs from any cwd. */
const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const REPORT_FILE = path.join(REPO_ROOT, "output_smoke", "balance_report", "index.html");

// One section id per mode this report always renders (see
// tools/balance_report_generator.mjs's renderModeSection): the gate table,
// every chart, and the event-frequency stat tiles.
const REQUIRED_SECTION_PREFIXES = [
  "gate-table",
  "price-curves",
  "trade-volumes",
  "persona-win-rates",
  "win-rate-per-seed",
  "colony-outcomes",
  "seat-spread",
  "event-frequencies",
];

//============================================
/**
 * Run the balance-sim report command at a tiny seed count and assert the
 * written report carries every required section anchor.
 */
function checkBalanceReport() {
  // A tiny seed count keeps this fast; the release-gate rows only fire at
  // RELEASE_GATE_MIN_SEEDS (100+), so this run only exercises the always-on
  // liveness/safety gates, which is enough to prove the report pipeline
  // works.
  execFileSync(
    process.execPath,
    ["--import", "tsx", "tests/e2e/e2e_balance_sim.mjs", "2", "--report"],
    {
      cwd: REPO_ROOT,
      stdio: "pipe",
    },
  );

  const html = fs.readFileSync(REPORT_FILE, "utf8");
  assert.match(html, /<!DOCTYPE html>/);
  for (const mode of ["beginner", "standard"]) {
    for (const prefix of REQUIRED_SECTION_PREFIXES) {
      const anchor = `id="${prefix}-${mode}"`;
      assert.ok(html.includes(anchor), `report missing section anchor: ${anchor}`);
    }
  }
}

//============================================
/**
 * Run the check, printing a PASS/FAIL line and exiting with the matching
 * status code.
 */
function main() {
  try {
    checkBalanceReport();
    console.log("e2e_balance_report: PASS");
  } catch (error) {
    console.error(`e2e_balance_report: FAIL - ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

main();
