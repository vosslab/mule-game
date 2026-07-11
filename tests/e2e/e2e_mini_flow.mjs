// Mini headless flow harness: the automated stand-in for a short human
// playthrough, per docs/E2E_TESTS.md (non-browser tier lives under tests/e2e/,
// e2e_ prefix, self-contained, run directly rather than via pytest).
//
// It builds the production bundle, serves dist/ on a random loopback port, and
// drives one real UI flow through Chromium: New Game -> claim a land-grant plot
// -> reach the human develop turn (every human develop turn now spawns in town
// at the corral, WP-4B, so the walkable town avatar mounts) and the develop
// panel offers End turn -> assert the game advanced with zero page errors.
// Exits non-zero on any failure so a broken UI flow fails a CI run loudly. The
// full seeded playthrough lives in e2e_full_game.mjs.
//
// Uses playwright-core (not the "playwright" / "@playwright/test" packages) so
// this browser-driving .mjs may live under tests/e2e/ without tripping the
// tests/playwright-only import rule (tests/test_test_naming_conventions.py).
//
// Run: node tests/e2e/e2e_mini_flow.mjs

import { execFileSync } from "node:child_process";
import path from "node:path";
import { REPO_ROOT, startServer, launchBrowser } from "./walkthrough_helpers.mjs";

/** Fixed seed and high speed so the flow is deterministic and fast. */
const GAME_URL_QUERY = "?seed=99&speed=8";

//============================================
/**
 * Build the production bundle into dist/ via the canonical build script.
 * Always rebuilds (unlike walkthrough_helpers.mjs's buildSiteIfStale) so
 * this smoke harness never runs against a stale bundle.
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
 * Drive the mini flow through Chromium and assert it advanced without errors.
 *
 * @param baseUrl - The origin the site is served from.
 */
async function runFlow(baseUrl) {
  const browser = await launchBrowser();
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") {
        pageErrors.push(`console.error: ${message.text()}`);
      }
    });

    await page.goto(`${baseUrl}/${GAME_URL_QUERY}`);

    // Start a game and confirm the game screen and HUD came up.
    await page.click("#new-game-button");
    await page.waitForSelector("#screen-game.active", { state: "visible", timeout: 30_000 });
    await page.waitForSelector("#game-hud .hud-player", { state: "visible", timeout: 30_000 });

    // Claim whichever plot the land-grant sweep cursor (src/engine/land_grant.ts)
    // is currently on, as the human (player 0 picks first): Enter is the same
    // claim_current_plot binding land_grant_panel.tsx wires, and is robust
    // against the cursor's timing-dependent position, unlike clicking a
    // specific plot locator.
    await page.waitForSelector("#game-map .map-svg g[data-row][data-col]", {
      state: "visible",
      timeout: 30_000,
    });
    await page.keyboard.press("Enter");

    // Pass any further land-grant turns until the develop phase takes over.
    await passThroughLandGrant(page);

    // Reach the human's develop turn: every human develop turn now spawns in
    // town at the corral (WP-4B), so the walkable town avatar mounts, and the
    // develop panel's End turn button appears, proving the develop phase
    // reached the human through the reducer and scene manager.
    await page.waitForSelector("#town-scene [data-actor='player-0']", {
      state: "visible",
      timeout: 30_000,
    });
    // The End turn control's `data-action` hook is shared by the town chrome
    // strip's button (town_chrome.tsx, where a turn now starts) and the
    // overworld DevelopPanel's button, so this selector holds in either
    // location the develop phase currently renders it.
    await page.waitForSelector("[data-action='develop-end-turn']", {
      state: "visible",
      timeout: 30_000,
    });

    if (pageErrors.length > 0) {
      throw new Error(`page errors during flow: ${pageErrors.join("; ")}`);
    }
  } finally {
    await browser.close();
  }
}

//============================================
/**
 * Click the land-grant Pass button until it disappears (AI turns finish and the
 * develop phase takes over).
 *
 * @param page - The Playwright page.
 */
async function passThroughLandGrant(page) {
  for (let i = 0; i < 50; i++) {
    const passButton = await page.$("#land-grant-pass-button");
    if (passButton === null || !(await passButton.isVisible())) {
      return;
    }
    await passButton.click();
    await page.waitForTimeout(30);
  }
}

//============================================
/**
 * Build, serve, and drive the mini flow, printing PASS/FAIL and exiting with
 * the matching status code.
 */
async function main() {
  buildSite();
  const { server, port } = await startServer();
  try {
    await runFlow(`http://127.0.0.1:${port}`);
    console.log("e2e_mini_flow: PASS");
  } catch (error) {
    console.error(`e2e_mini_flow: FAIL - ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

await main();
