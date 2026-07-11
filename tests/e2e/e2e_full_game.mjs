// Full-game headless playthrough harness (matrix extended for
// M10's "headless playthrough harness green at both modes and three seeds"
// rollout checklist row, docs/archive/mule_fidelity_plan.md): the
// automated stand-in for a complete human playthrough, per docs/E2E_TESTS.md
// (non-browser tier, tests/e2e/, e2e_ prefix, self-contained, run directly
// rather than via pytest). It grows the M2 mini harness (e2e_mini_flow.mjs)
// from a single-phase smoke into a whole seeded game.
//
// It builds the production bundle once, serves dist/ on a random loopback
// port once, and then drives a complete seeded game (New Game -> all rounds
// -> scoring) through the real UI at high speed (?speed=8) for every cell of
// a MODES x SEEDS matrix -- both "beginner" and "standard", three fixed seeds
// each, six cells total. The three AI seats play themselves; for the human
// seat it scripts the minimal viable turns via an event loop that acts on
// whichever control is live: pass every land grant, end every develop turn
// immediately, and sit out every goods auction. Each cell asserts the game
// reached the scoring screen with four ranked players, that the tick ledger
// advanced through develop / production / auction, and that no page error
// fired.
//
// The three seeds (1, 3, 7) were chosen because they terminate reliably
// within budget in both modes with this harness's passive-human strategy
// (spot-checked directly against this script; the engine-level termination
// guarantee across a much larger seed range is separately covered by
// e2e_balance_sim.mjs's all-AI sim). Standard mode plays double the rounds of
// beginner (ROUND_COUNT_BY_MODE in src/engine/constants.ts: 12 vs 6), so its
// per-cell wall-clock budget is doubled to match.
//
// Uses playwright-core (not the "playwright" / "@playwright/test" packages) so
// this browser-driving .mjs may live under tests/e2e/ without tripping the
// tests/playwright-only import rule (tests/test_test_naming_conventions.py).
//
// Run the full matrix (default, and what CI/the rollout checklist expects):
//   node tests/e2e/e2e_full_game.mjs
// Run a single cell while debugging one mode/seed combination:
//   node tests/e2e/e2e_full_game.mjs standard 7

import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { REPO_ROOT, startServer } from "./walkthrough_helpers.mjs";

/** Game modes exercised by the default full-matrix run. */
const MODES = ["beginner", "standard"];

/** Fixed seeds exercised by the default full-matrix run, both modes each. */
const SEEDS = [1, 3, 7];

/** Speed multiplier applied to every cell so the matrix stays fast. */
const SPEED = 8;

/**
 * Per-mode wall-clock playthrough budget in ms. Standard mode plays
 * ROUND_COUNT_BY_MODE.standard (12) rounds against beginner's 6 (see
 * src/engine/constants.ts), so its budget is doubled to match.
 */
const PLAYTHROUGH_BUDGET_MS_BY_MODE = {
  beginner: 60_000,
  standard: 120_000,
};

/** Tick-bearing phases the ledger must have advanced through by the end. */
const REQUIRED_TICK_PHASES = ["develop", "production", "auction"];

/**
 * Wait this long once the develop panel is visible before ending the turn,
 * so at least one develop-phase tick fires first (see actForCurrentPhase).
 */
const DEVELOP_TICK_SETTLE_MS = 200;

//============================================
/**
 * Build the production bundle into dist/ via the canonical build script.
 * Always rebuilds (unlike walkthrough_helpers.mjs's buildSiteIfStale) so
 * this matrix harness never runs against a stale bundle.
 */
function buildSite() {
  console.log("==> building dist/ (build_github_pages.sh)");
  execFileSync("bash", [path.join(REPO_ROOT, "build_github_pages.sh")], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

//============================================
/**
 * Whether a selector currently resolves to a visible element.
 *
 * @param page - The Playwright page.
 * @param selector - CSS selector to test.
 * @returns True when at least one matching element is visible.
 */
async function isVisible(page, selector) {
  const handle = await page.$(selector);
  if (handle === null) {
    return false;
  }
  return handle.isVisible().catch(() => false);
}

//============================================
/**
 * Take the human's scripted action for the current phase, if any control is
 * live: pass a land grant, end a develop turn, or sit out a goods auction. A
 * detached element between the check and the click is ignored (the phase
 * advanced on its own).
 *
 * @param page - The Playwright page.
 */
async function actForCurrentPhase(page) {
  if (await isVisible(page, "#land-grant-pass-button")) {
    await page.click("#land-grant-pass-button").catch(() => undefined);
    return;
  }
  // The End turn control's data-action hook is shared by the town chrome
  // strip's button (town_chrome.tsx, where a develop turn now starts, WP-4B)
  // and the overworld DevelopPanel's button, so this one selector holds
  // whichever location the develop phase currently renders it in.
  if (await isVisible(page, "[data-action='develop-end-turn']")) {
    // Give the develop phase's own tick timer (DEVELOP_TICK_MS in
    // scene_manager.ts, ~119ms at speed=8) one chance to fire before ending
    // the turn, so the tick-ownership ledger actually records a "develop"
    // phase entry instead of racing straight past it (the poll interval
    // below is close enough to that tick cadence that clicking on the very
    // first visibility check can otherwise end the turn with zero develop
    // ticks recorded).
    await page.waitForTimeout(DEVELOP_TICK_SETTLE_MS);
    await page.click("[data-action='develop-end-turn']").catch(() => undefined);
    return;
  }
  if (await isVisible(page, ".auction-screen-role-button")) {
    // Sit Out is the third role button (Buy, Sell, Sit Out); this keeps the
    // human out of trading while the auction clock still runs to completion.
    const roleButtons = await page.$$(".auction-screen-role-button");
    const sitOut = roleButtons[2] ?? roleButtons[0];
    if (sitOut !== undefined) {
      await sitOut.click().catch(() => undefined);
    }
  }
}

//============================================
/**
 * Drive one complete seeded game to the scoring screen, asserting phase
 * progression, four ranked players, and zero page errors.
 *
 * @param baseUrl - The origin the site is served from.
 * @param mode - Which game mode to start (`"beginner"` or `"standard"`).
 * @param seed - The fixed seed to start the game with.
 */
async function runFullGame(baseUrl, mode, seed) {
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") {
        pageErrors.push(`console.error: ${message.text()}`);
      }
    });

    await page.goto(`${baseUrl}/?mode=${mode}&seed=${seed}&speed=${SPEED}`);
    await page.click("#new-game-button");
    await page.waitForSelector("#screen-game.active", { state: "visible", timeout: 30_000 });

    // Event loop: act on whichever control is live until the scoring screen
    // appears or the wall-clock budget runs out.
    const deadline = Date.now() + PLAYTHROUGH_BUDGET_MS_BY_MODE[mode];
    let reachedScoring = false;
    while (Date.now() < deadline) {
      if (await isVisible(page, ".scoring-panel")) {
        reachedScoring = true;
        break;
      }
      await actForCurrentPhase(page);
      await page.waitForTimeout(120);
    }

    if (!reachedScoring) {
      throw new Error("game never reached the scoring screen within the time budget");
    }

    // Four players are ranked on the scoring screen.
    const rankedCount = await page.locator(".scoring-row").count();
    if (rankedCount !== 4) {
      throw new Error(`expected 4 ranked players on the scoring screen, got ${rankedCount}`);
    }

    // The tick ledger advanced through the core per-round cycle.
    const phaseSequence = await page.evaluate(() => window.__tickOwnership?.phaseSequence ?? []);
    for (const phase of REQUIRED_TICK_PHASES) {
      if (!phaseSequence.includes(phase)) {
        throw new Error(
          `tick phase sequence never reached ${phase} (saw: ${phaseSequence.join(", ")})`,
        );
      }
    }

    if (pageErrors.length > 0) {
      throw new Error(`page errors during playthrough: ${pageErrors.join("; ")}`);
    }
  } finally {
    await browser.close();
  }
}

//============================================
/**
 * Parse an optional `mode seed` positional pair from the CLI args into a
 * single-cell matrix override, for debugging one combination at a time.
 *
 * @param argv - `process.argv.slice(2)`.
 * @returns The single requested cell, or `null` when no override was given
 *   (the caller then runs the full default matrix).
 */
function parseSingleCellArg(argv) {
  if (argv.length === 0) {
    return null;
  }
  const [mode, seedText] = argv;
  if (!MODES.includes(mode)) {
    throw new Error(`unknown mode "${mode}" (expected one of: ${MODES.join(", ")})`);
  }
  const seed = Number.parseInt(seedText, 10);
  if (Number.isNaN(seed)) {
    throw new Error(`invalid seed "${seedText}"`);
  }
  return { mode, seed };
}

//============================================
/**
 * Build, serve, and drive every mode x seed cell of the matrix (or a single
 * requested cell), printing one PASS/FAIL line per cell plus an overall
 * summary, and exiting with the matching status code.
 */
async function main() {
  const singleCell = parseSingleCellArg(process.argv.slice(2));
  const cells =
    singleCell !== null
      ? [singleCell]
      : MODES.flatMap((mode) => SEEDS.map((seed) => ({ mode, seed })));

  buildSite();
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  let allPassed = true;
  try {
    for (const { mode, seed } of cells) {
      const label = `mode=${mode} seed=${seed}`;
      try {
        await runFullGame(baseUrl, mode, seed);
        console.log(`e2e_full_game: PASS (${label})`);
      } catch (error) {
        allPassed = false;
        console.error(
          `e2e_full_game: FAIL (${label}) - ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  } finally {
    server.close();
  }

  if (allPassed) {
    console.log(`e2e_full_game: PASS (${cells.length}/${cells.length} cells)`);
  } else {
    console.error("e2e_full_game: FAIL (see cell results above)");
    process.exitCode = 1;
  }
}

await main();
