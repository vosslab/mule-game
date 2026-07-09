// Selector contract: this spec depends on src/ui/solid/game_screen.tsx's
// AiActorLayer mount (in place of the retired text-only WaitingPanel) inside
// #game-map during an AI player's develop turn
// (`g[data-actor="player-N"]`, `[data-ai-actor-status]`,
// `[data-ai-skip-button]`), and the species-avatar wiring in
// src/ui/scenes/overworld_scene.tsx (the human avatar's `<use>` href now
// follows `state.players[0].species`, not a hardcoded player-slot index).
// Player 0 is always the human and always picks first in round 1
// (src/engine/land_grant.ts).

import { test, expect } from "@playwright/test";

/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;

/**
 * Claim whichever plot the land-grant sweep cursor (src/engine/land_grant.ts)
 * is currently on, via the same Enter key `claim_current_plot` binds to
 * (land_grant_panel.tsx). The cursor's position is engine-driven and
 * timing-dependent, so this is the robust way to claim a plot in a spec --
 * clicking a specific locator would race the sweep and could miss.
 */
async function claimCurrentLandGrantPlot(page) {
  await page.locator("#game-map .map-svg g[data-row][data-col]").first().waitFor();
  await page.keyboard.press("Enter");
}

/**
 * Click the land-grant Pass button until it disappears (AI turns finish and
 * the develop phase takes over), or throw if it never does.
 */
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

test("AI actor mounts live in place of the old WaitingPanel, and Skip advances the turn", async ({
  page,
}) => {
  await page.goto("/?speed=8");
  await page.locator("#new-game-button").click();

  await claimCurrentLandGrantPlot(page);
  await passThroughLandGrant(page);

  // The human's own turn: end it immediately so the next (AI) player's
  // develop turn begins.
  const endTurnButton = page.locator(".develop-end-turn-button");
  await expect(endTurnButton).toBeVisible({ timeout: 30_000 });
  await endTurnButton.click();

  // The AI actor layer mounts in #game-map: its avatar and Skip control are
  // live, and the old text-only WaitingPanel never appears anywhere.
  const aiAvatar = page.locator("#game-map [data-ai-actor-player]");
  await expect(aiAvatar).toBeVisible({ timeout: 30_000 });
  const skipButton = page.locator("[data-ai-skip-button]");
  await expect(skipButton).toBeVisible();
  await expect(page.locator(".waiting-panel")).toHaveCount(0);

  // Skip fast-forwards this AI player's turn to its end: the layer unmounts
  // (a fresh one mounts for the next AI turn, or the human's turn resumes).
  const firstAiPlayer = await aiAvatar.getAttribute("data-ai-actor-player");
  await skipButton.click();
  await expect(page.locator(`[data-ai-actor-player="${firstAiPlayer}"]`)).toHaveCount(0, {
    timeout: 10_000,
  });
});

test("species select: the human avatar's sprite reflects the title-screen pick", async ({
  page,
}) => {
  await page.goto("/?speed=8&species=flapper");
  await page.locator("#new-game-button").click();

  await claimCurrentLandGrantPlot(page);
  await passThroughLandGrant(page);

  const avatarUse = page.locator(".overworld-svg [data-actor='player-0'] use").first();
  await expect(avatarUse).toBeVisible({ timeout: 30_000 });
  await expect(avatarUse).toHaveAttribute("href", "#sprite-species-flapper-frame1");
});
