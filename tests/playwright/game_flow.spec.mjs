// Selector contract: this spec depends on src/ui/main.ts's #new-game-button
// wiring, src/ui/game_driver.ts's #screen-game/#game-hud/#game-map/#game-panel
// containers and phase panels (land-grant-pass-button, store-screen-*,
// auction-screen-*), src/ui/map_render.ts's data-row/data-col/data-outfit
// plot attributes, and src/ui/hud.ts's .hud-player markup. Player 0 is always
// the human and always picks first in round 1 (src/engine/land_grant.ts).

import { test, expect } from "@playwright/test";

/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;

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

test("game flow: claim a plot, buy and outfit a M.U.L.E., and place it", async ({ page }) => {
  await page.goto("/");
  await page.locator("#new-game-button").click();

  // Claim the first unowned, non-town plot as the human (player 0 picks first).
  const claimablePlot = page
    .locator("#game-map .map-svg g[data-row][data-col]:not([data-terrain='town'])")
    .first();
  await expect(claimablePlot).toBeVisible();
  await claimablePlot.click();

  // Pass on any further land-grant turns until AI turns finish and the
  // develop phase reaches the human's turn with the store screen enabled.
  await passThroughLandGrant(page);

  // Wait for the human's develop turn: the buy button becomes enabled once
  // the store screen renders for player 0.
  const buyButton = page.locator(".store-screen-buy-button");
  await expect(buyButton).toBeVisible({ timeout: 30_000 });
  await expect(buyButton).toBeEnabled({ timeout: 30_000 });
  await buyButton.click();

  // Outfit panel appears next; pick the first resource outfit offered.
  const outfitButton = page.locator(".store-screen-outfit-button").first();
  await expect(outfitButton).toBeVisible();
  await expect(outfitButton).toBeEnabled();
  await outfitButton.click();

  // Placement panel appears; place on the first available owned plot button.
  const plotButton = page.locator(".store-screen-plot-button").first();
  await expect(plotButton).toBeVisible();
  await plotButton.click();

  // A M.U.L.E. glyph now renders on the map for the placed plot.
  const muleGlyphs = page.locator("#game-map .map-svg g[data-outfit]");
  await expect(muleGlyphs.first()).toBeVisible();
  expect(await muleGlyphs.count()).toBeGreaterThan(0);
});

test("game flow: buy role in the auction moves the human token on the price track", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-game-button").click();

  // Claim a plot, then pass through the remainder of land grant.
  const claimablePlot = page
    .locator("#game-map .map-svg g[data-row][data-col]:not([data-terrain='town'])")
    .first();
  await expect(claimablePlot).toBeVisible();
  await claimablePlot.click();

  await passThroughLandGrant(page);

  // Skip the human's develop turn immediately (Enter ends the turn); the
  // remaining AI develop turns and production interstitial run on timers.
  const buyMuleButton = page.locator(".store-screen-buy-button");
  await expect(buyMuleButton).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Enter");

  // Wait through production into the auction's role-choice panel.
  const roleButtons = page.locator(".auction-screen-role-button");
  await expect(roleButtons.first()).toBeVisible({ timeout: 30_000 });

  // Choose Buy (first role button, per buildRoleChoicePanel's role order).
  await roleButtons.first().click();

  // The price track renders once the human has committed a role.
  const track = page.locator(".auction-track-svg");
  await expect(track).toBeVisible({ timeout: 10_000 });

  // Record the human's token starting position, then hold ArrowUp to push
  // price intent up across several auction ticks (AUCTION_TICK_MS = 500ms).
  const humanToken = track.locator(".auction-track-token").first();
  await expect(humanToken).toBeVisible();
  const startY = await humanToken.getAttribute("cy");

  await page.keyboard.down("ArrowUp");
  await expect
    .poll(
      async () => {
        const currentY = await track.locator(".auction-track-token").first().getAttribute("cy");
        return currentY !== startY;
      },
      { timeout: 15_000, message: "human auction token never moved from its starting y" },
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

test("keyboard nav: arrow keys move the land-grant cursor and Enter claims a plot", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-game-button").click();

  const plots = page.locator("#game-map .map-svg g[data-row][data-col]");
  await expect(plots.first()).toBeVisible();

  // The cursor starts at plot (0, 0); it is a town, so ArrowRight moves onto
  // the next unowned, non-town plot before Enter claims it.
  await page.keyboard.press("ArrowRight");
  const cursoredPlot = page.locator("#game-map .map-svg g.plot-cursor");
  await expect(cursoredPlot).toHaveCount(1);
  await expect(cursoredPlot).toHaveAttribute("data-row", "0");
  await expect(cursoredPlot).toHaveAttribute("data-col", "1");

  const targetRow = await cursoredPlot.getAttribute("data-row");
  const targetCol = await cursoredPlot.getAttribute("data-col");
  await page.keyboard.press("Enter");

  const claimedPlot = page.locator(
    `#game-map .map-svg g[data-row="${targetRow}"][data-col="${targetCol}"]`,
  );
  await expect(claimedPlot).toHaveAttribute("data-owner", "0");
});

test("keyboard nav: arrow keys rove store-screen button focus", async ({ page }) => {
  await page.goto("/");
  await page.locator("#new-game-button").click();

  const claimablePlot = page
    .locator("#game-map .map-svg g[data-row][data-col]:not([data-terrain='town'])")
    .first();
  await expect(claimablePlot).toBeVisible();
  await claimablePlot.click();

  await passThroughLandGrant(page);

  const buyButton = page.locator(".store-screen-buy-button");
  const endTurnButton = page.locator(".store-screen-end-turn-button");
  await expect(buyButton).toBeVisible({ timeout: 30_000 });
  await expect(buyButton).toBeEnabled({ timeout: 30_000 });
  await expect(buyButton).toBeFocused();

  // The buy panel's roving group is [buy, end turn]; ArrowDown advances to
  // end turn, and a second ArrowDown wraps back to buy.
  await page.keyboard.press("ArrowDown");
  await expect(endTurnButton).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(buyButton).toBeFocused();

  // Enter activates whichever button is focused (buy).
  await page.keyboard.press("Enter");

  const outfitButton = page.locator(".store-screen-outfit-button").first();
  await expect(outfitButton).toBeVisible();
  await expect(outfitButton).toBeFocused();
});
