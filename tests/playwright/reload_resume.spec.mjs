// Selector contract: depends on src/ui/solid/title_screen.tsx's
// #new-game-button and #resume-game-button, src/ui/solid/game_screen.tsx's
// #screen-game / #game-map / .develop-end-turn-button, and
// src/ui/solid/map_layer.tsx's data-row / data-col / data-owner plot attributes.
// The autosave lives under localStorage key "mule-game-save-v1"
// (src/ui/save_log.ts SAVE_STORAGE_KEY).
//
// Proves reload-mid-game resume: a seeded game is driven a few actions in until
// the human's develop turn, its board state is snapshotted, the page is
// reloaded (dropping all in-memory state), and Resume replays the autosaved
// action log through the reducer back to the same state -- the plots the human
// claimed are still owned after the reload.

import { test, expect } from "@playwright/test";

/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;

// Claim whichever plot the land-grant sweep cursor is on, via the Enter key
// (src/ui/solid/land_grant_panel.tsx), the robust way to claim under the
// timing-dependent sweep (see game_flow.spec.mjs's note).
async function claimCurrentLandGrantPlot(page) {
  await page.locator("#game-map .map-svg g[data-row][data-col]").first().waitFor();
  await page.keyboard.press("Enter");
}

// Click the land-grant Pass button until it disappears (the develop phase takes
// over), or throw if it never does.
async function passThroughLandGrant(page) {
  const passButton = page.locator("#land-grant-pass-button");
  for (let i = 0; i < MAX_PASS_ITERATIONS; i++) {
    if (!(await passButton.isVisible().catch(() => false))) {
      return;
    }
    await passButton.click();
    await page.waitForTimeout(50);
  }
  if (await passButton.isVisible().catch(() => false)) {
    throw new Error(`land-grant Pass button still visible after ${MAX_PASS_ITERATIONS} clicks`);
  }
}

// The set of "row,col" plots currently owned by the human (player 0).
async function humanOwnedPlots(page) {
  return page.$$eval('#game-map .map-svg g[data-owner="0"]', (nodes) =>
    nodes.map((node) => `${node.getAttribute("data-row")},${node.getAttribute("data-col")}`),
  );
}

test("reload mid-game and Resume restores the same board state", async ({ page }) => {
  // Fixed seed for a repeatable game; speed=4 keeps the develop turn's tick
  // budget draining slowly enough that the reload lands back inside it.
  await page.goto("/?seed=7&speed=4");
  await page.locator("#new-game-button").click();

  // Human (player 0) claims a plot, then we pass through the rest of land grant
  // to reach the human's develop turn, where the board is stably shown.
  await claimCurrentLandGrantPlot(page);
  await passThroughLandGrant(page);

  const endTurnButton = page.locator(".develop-end-turn-button");
  await expect(endTurnButton).toBeVisible({ timeout: 30_000 });

  // Snapshot the plots the human owns right now.
  const ownedBefore = await humanOwnedPlots(page);
  expect(ownedBefore.length).toBeGreaterThan(0);

  // Reload: every in-memory store and scene loop is dropped. Only the autosave
  // in localStorage survives.
  await page.reload();

  // The title screen now offers Resume (a matching-build save exists).
  const resumeButton = page.locator("#resume-game-button");
  await expect(resumeButton).toBeVisible();
  await resumeButton.click();

  // Resume replays the log back to the human's develop turn (the board is up
  // again), and every plot claimed before the reload is still owned by player 0.
  await expect(page.locator("#screen-game")).toHaveClass(/active/);
  await expect(page.locator(".develop-end-turn-button")).toBeVisible({ timeout: 30_000 });
  const ownedAfter = await humanOwnedPlots(page);
  for (const plot of ownedBefore) {
    expect(ownedAfter).toContain(plot);
  }
});
