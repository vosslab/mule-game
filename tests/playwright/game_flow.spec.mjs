// Selector contract: this spec depends on src/ui/main.tsx's #new-game-button
// wiring, src/ui/solid/game_screen.tsx's #screen-game / #game-hud / #game-map /
// #game-panel containers and phase panels (land-grant-pass-button,
// auction-screen-*), src/ui/solid/map_layer.tsx's data-row / data-col plot
// attributes, src/ui/scenes/overworld_scene.tsx's overworld avatar
// (.overworld-svg g[data-actor="player-0"]), src/ui/scenes/town_scene.tsx's
// #town-scene container and its .town-end-turn-button
// (data-action="develop-end-turn"), and src/ui/solid/hud.tsx's .hud-player
// markup. Buying, outfitting, and placing a M.U.L.E. moved to the walkable
// town scene (tests/playwright/town_street.spec.mjs and its sibling town
// specs own that loop); this spec covers the broad phase flow. Player 0 is
// always the human and always picks first in round 1 (src/engine/land_grant.ts).
//
// Town-first navigation (WP-4B/WP-4C): every human develop turn now starts IN
// TOWN at the corral (human_develop_layer.tsx), so the human's End turn
// control at turn start is the town scene's .town-end-turn-button, not
// DevelopPanel's .develop-end-turn-button (game_screen.tsx renders
// DevelopPanel only once the human has walked out to the overworld).

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
 * the develop phase takes over), or throw if it never does within
 * MAX_PASS_ITERATIONS attempts.
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

test("game flow: start a game and reach the land grant map", async ({ page }) => {
  await page.goto("/");

  const newGameButton = page.locator("#new-game-button");
  await expect(newGameButton).toBeEnabled();
  await newGameButton.click();

  const gameScreen = page.locator("#screen-game");
  await expect(gameScreen).toHaveClass(/active/);

  // HUD shows all 4 players once the first game state renders.
  const hudPlayers = page.locator("#game-hud .hud-player");
  await expect(hudPlayers).toHaveCount(4);

  // Land grant panel is up, waiting on the human (player 0 picks first).
  await expect(page.locator(".land-grant-hint")).toBeVisible();
  await expect(page.locator("#land-grant-pass-button")).toBeVisible();

  // The board is rendered with plot cells to pick from.
  const plots = page.locator("#game-map .map-svg g[data-row][data-col]");
  await expect(plots.first()).toBeVisible();
  expect(await plots.count()).toBeGreaterThan(0);
});

test("game flow: claim a plot, reach the human develop turn, and end it", async ({ page }) => {
  // A random seed sometimes draws a round-1 colony land auction, which runs on
  // its own real-time cadence (src/ui/scenes/scene_manager.ts); speed=8 keeps
  // the develop turn well inside this test's default timeout regardless.
  await page.goto("/?speed=8");
  await page.locator("#new-game-button").click();

  // Claim whichever plot the sweep cursor lands on, as the human (player 0
  // picks first).
  await claimCurrentLandGrantPlot(page);

  await passThroughLandGrant(page);

  // The human's develop turn now starts in town at the corral (WP-4B): the
  // town scene mounts with its own small End turn control.
  const townScene = page.locator("#town-scene");
  await expect(townScene).toBeVisible({ timeout: 30_000 });
  const endTurnButton = page.locator(".town-end-turn-button");
  await expect(endTurnButton).toBeVisible();

  // Ending the turn tears down the develop overlay (the town scene unmounts).
  await endTurnButton.click();
  await expect(townScene).toHaveCount(0, { timeout: 30_000 });
});

test("game flow: buy role in the auction moves the human token on the price track", async ({
  page,
}) => {
  // A random seed sometimes draws a round-1 colony land auction, which runs on
  // its own real-time cadence (src/ui/scenes/scene_manager.ts); speed=8 keeps
  // the full develop -> production -> auction run well inside this test's
  // default timeout regardless.
  await page.goto("/?speed=8");
  await page.locator("#new-game-button").click();

  // Claim a plot, then pass through the remainder of land grant.
  await claimCurrentLandGrantPlot(page);

  await passThroughLandGrant(page);

  // End the human's develop turn immediately from its town-first start
  // (WP-4B: the turn opens in town at the corral, with its own small End
  // turn control); the remaining AI develop turns and the production
  // interstitial run on timers into the auction.
  const endTurnButton = page.locator(".town-end-turn-button");
  await expect(endTurnButton).toBeVisible({ timeout: 30_000 });
  await endTurnButton.click();

  // Wait through production into the auction's role-choice panel.
  const roleButtons = page.locator(".auction-screen-role-button");
  await expect(roleButtons.first()).toBeVisible({ timeout: 30_000 });

  // Choose Buy (first role button, per buildRoleChoicePanel's role order).
  await roleButtons.first().click();

  // The price track renders once the human has committed a role.
  const track = page.locator(".auction-track-svg");
  await expect(track).toBeVisible({ timeout: 10_000 });

  // Record the human's token starting price position, then hold ArrowUp to
  // push price intent up across several auction ticks (AUCTION_TICK_MS =
  // 500ms). The landscape track's price axis is x: a buyer raising its bid
  // moves rightward toward the store-sell end (src/ui/solid/auction_screen.tsx
  // priceToX), so cx should rise, not just change.
  const humanToken = track.locator(".auction-track-token").first();
  await expect(humanToken).toBeVisible();
  const startX = await humanToken.getAttribute("cx");

  await page.keyboard.down("ArrowUp");
  await expect
    .poll(
      async () => {
        const currentX = await track.locator(".auction-track-token").first().getAttribute("cx");
        return Number(currentX) > Number(startX);
      },
      { timeout: 15_000, message: "human auction token never moved rightward from its starting x" },
    )
    .toBe(true);
  await page.keyboard.up("ArrowUp");

  // Store buy/sell band lines are present on the track for reference. These
  // are zero-area SVG <line> strokes, so assert count rather than
  // toBeVisible (a bounding-box check that always reports lines as hidden).
  await expect(page.locator(".auction-track-store-buy-line")).toHaveCount(1);
  await expect(page.locator(".auction-track-store-sell-line")).toHaveCount(1);

  // A trade may or may not fire within this window depending on AI pricing;
  // assert the trade log panel renders regardless (either an empty message
  // or a populated list), since the token-movement assertion above already
  // proves the auction clock and human intent are wired end to end.
  const tradeLog = page.locator(".auction-screen-trade-log");
  await expect(tradeLog).toBeVisible();
});

test("keyboard nav: the land-grant sweep cursor animates and Enter claims its plot", async ({
  page,
}) => {
  // ?speed= scales the scene-manager clock, including the land-grant sweep
  // cadence, so the cursor advances quickly enough for this spec to observe
  // it moving without a long real-time wait.
  await page.goto("/?speed=8");
  await page.locator("#new-game-button").click();

  const plots = page.locator("#game-map .map-svg g[data-row][data-col]");
  await expect(plots.first()).toBeVisible();

  // The sweep cursor is engine-driven (src/engine/land_grant.ts): exactly one
  // plot carries the highlight at all times, and it moves on its own.
  const cursoredPlot = page.locator("#game-map .map-svg g.plot-cursor");
  await expect(cursoredPlot).toHaveCount(1);
  const startRow = await cursoredPlot.getAttribute("data-row");
  const startCol = await cursoredPlot.getAttribute("data-col");

  await expect
    .poll(async () => {
      const row = await cursoredPlot.getAttribute("data-row");
      const col = await cursoredPlot.getAttribute("data-col");
      return `${row},${col}`;
    })
    .not.toBe(`${startRow},${startCol}`);

  // Enter claims whichever plot the cursor sits on right now.
  const targetRow = await cursoredPlot.getAttribute("data-row");
  const targetCol = await cursoredPlot.getAttribute("data-col");
  await page.keyboard.press("Enter");

  const claimedPlot = page.locator(
    `#game-map .map-svg g[data-row="${targetRow}"][data-col="${targetCol}"]`,
  );
  await expect(claimedPlot).toHaveAttribute("data-owner", "0");
});
