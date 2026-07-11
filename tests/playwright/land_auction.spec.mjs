// Land-auction phase: the colony land auction has no explicit human gate (not
// bidding IS passing), so before this spec's UI landed, the phase's tick
// scheduling was missing entirely and the scene loop stalled with an empty
// #game-panel. Seed 1234 deterministically draws a round-1 land auction after
// the human's land-grant turn (confirmed against src/engine/turn.ts directly),
// so this spec fixes that seed to reliably exercise the phase.
//
// Selector contract: this spec depends on src/ui/solid/land_auction_panel.tsx's
// [data-land-auction] panel root, #land-bid-button, and [data-high-bidder], plus
// the shared #new-game-button and #land-grant-pass-button controls from earlier
// phases, the #town-scene develop-turn avatar (src/ui/scenes/town_scene.tsx;
// every human develop turn now starts in town at the corral, WP-4B), and
// window.__tickOwnership from src/ui/scenes/scene_manager.ts.

import { test, expect } from "@playwright/test";

/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;

/**
 * Click the land-grant Pass button until it disappears (AI turns finish and
 * the next phase takes over), or throw if it never does.
 */
async function passThroughLandGrant(page) {
  const passButton = page.locator("#land-grant-pass-button");
  for (let i = 0; i < MAX_PASS_ITERATIONS; i++) {
    if (!(await passButton.isVisible().catch(() => false))) {
      return;
    }
    await passButton.click();
    await page.waitForTimeout(30);
  }
  if (await passButton.isVisible().catch(() => false)) {
    throw new Error(`land-grant Pass button still visible after ${MAX_PASS_ITERATIONS} clicks`);
  }
}

/** Read the dev-only tick-ownership ledger from the page, or null before start. */
async function readTickOwnership(page) {
  return page.evaluate(() => window.__tickOwnership ?? null);
}

test("land auction: panel renders, ticks advance, and develop eventually begins", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?seed=1234&speed=8");
  await page.locator("#new-game-button").click();
  await passThroughLandGrant(page);

  // The land-auction panel is up instead of a stalled empty #game-panel.
  const panel = page.locator("[data-land-auction]");
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#land-bid-button")).toBeVisible();
  await expect(page.locator("[data-high-bidder]")).toBeVisible();

  // The plot under the hammer is highlighted on the board via the shared
  // plot-cursor affordance (proves MapLayer's highlight, not just the panel).
  await expect(page.locator("#game-map .map-svg g.plot-cursor")).toHaveCount(1);

  // Ticks are actively advancing (the stall this spec exists to catch: before
  // the fix, the ledger's tick count froze the moment land_auction began).
  const baseline = (await readTickOwnership(page))?.ticks ?? 0;
  await expect
    .poll(async () => (await readTickOwnership(page))?.ticks ?? 0, {
      timeout: 10_000,
      message: "tick count did not advance during the land auction",
    })
    .toBeGreaterThan(baseline);

  // The land-auction phase (all colony slots in this round's chain) settles on
  // its own and the round reaches development, with no human action required:
  // the human's develop turn mounts in town at the corral.
  const developAvatar = page.locator("#town-scene [data-actor='player-0']");
  await expect(developAvatar).toHaveCount(1, { timeout: 30_000 });

  expect(pageErrors).toEqual([]);
});

test("land auction: the human can bid and the price and high bidder update", async ({ page }) => {
  await page.goto("/?seed=1234&speed=1");
  await page.locator("#new-game-button").click();
  await passThroughLandGrant(page);

  const bidButton = page.locator("#land-bid-button");
  await expect(bidButton).toBeVisible({ timeout: 10_000 });

  const priceText = page.locator(".land-auction-price");
  const startingPrice = await priceText.textContent();

  await expect(bidButton).toBeEnabled({ timeout: 10_000 });
  await bidButton.click();

  // The human's bid raises their own standing bid, so they become the high
  // bidder (player id 0) and the displayed ask price steps up.
  await expect(page.locator("[data-high-bidder]")).toHaveAttribute("data-high-bidder", "0");
  await expect(priceText).not.toHaveText(startingPrice ?? "");
});
