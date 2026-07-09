// Spatial auction scene: keyboard-playability and reduced-motion contracts.
//
// Selector contract: this spec depends on the ?seed= / ?speed= hooks in
// src/ui/main.tsx, the #new-game-button title control, the
// #land-grant-pass-button and #game-map plot cells (src/ui/solid/map_layer.tsx),
// the .overworld-svg develop-turn avatar (src/ui/scenes/overworld_scene.tsx,
// M7's walkable overworld/town replaced the interim store overlay), and the M4
// auction scene in src/ui/solid/auction_screen.tsx:
//   - .auction-screen-role-button   (role choice; first is Buy)
//   - .auction-track-svg            (the spatial arena)
//   - .auction-avatar[data-actor]   (per-player species avatar group)
//   - the group's data-role and per-frame data-y attributes
//   - .auction-screen[data-reduced-motion]  (emulated-preference readback)
//   - .auction-trade-layer[data-flash-count] (monotonic trade-animation counter)
// Player 0 is always the human and always picks first in round 1
// (src/engine/land_grant.ts).
//
// Seed 1234 is fixed (matching tick_ownership.spec.mjs) and reaches a smithore
// window whose store holds stock, so a human Buyer holding ArrowUp walks up to
// the store's sell quote and a store trade fires -- a deterministic trade the
// animation counter records.

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
 * Click the land-grant Pass button until it disappears (AI turns finish and the
 * develop phase takes over), or throw if it never does.
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

/**
 * Drive a fresh game from the title screen to the auction's role-choice bar:
 * claim a plot, pass the rest of land grant, and wait for the role buttons. The
 * human's own develop turn drains on its tick-budget timer with no action
 * required (no store overlay to skip through); the remaining AI develop turns
 * and the production interstitial autoplay on their own timers too. Returns
 * once the first role button is visible.
 */
async function reachAuctionRoleChoice(page) {
  await page.locator("#new-game-button").click();

  await claimCurrentLandGrantPlot(page);

  await passThroughLandGrant(page);

  const roleButtons = page.locator(".auction-screen-role-button");
  await expect(roleButtons.first()).toBeVisible({ timeout: 30_000 });
}

test("auction scene: held ArrowUp walks the human avatar and a trade animates", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  // Choose Buy (first role button), which starts the auction clock; the spatial
  // arena renders once the human has committed a role.
  await page.locator(".auction-screen-role-button").first().click();
  const arena = page.locator(".auction-track-svg");
  await expect(arena).toBeVisible({ timeout: 10_000 });

  // Every player has a species avatar, tagged by actor and role. The human
  // (player 0) is the buyer we just chose.
  await expect(page.locator(".auction-avatar")).toHaveCount(4);
  const humanAvatar = page.locator('.auction-avatar[data-actor="player-0"]');
  await expect(humanAvatar).toHaveAttribute("data-role", "buyer");

  // Holding ArrowUp pushes the human's price intent up; the avatar's derived y
  // (written to data-y each frame) rises off its starting position.
  const startY = await humanAvatar.getAttribute("data-y");
  await page.keyboard.down("ArrowUp");
  await expect
    .poll(async () => (await humanAvatar.getAttribute("data-y")) !== startY, {
      timeout: 15_000,
      message: "human avatar data-y never changed while ArrowUp was held",
    })
    .toBe(true);

  // A trade fires as the human buyer meets the store's sell quote; the trade
  // layer's monotonic counter records that the animation path ran.
  const tradeLayer = page.locator(".auction-trade-layer");
  await expect
    .poll(async () => Number((await tradeLayer.getAttribute("data-flash-count")) ?? "0"), {
      timeout: 20_000,
      message: "no trade animation fired within the auction window",
    })
    .toBeGreaterThan(0);
  await page.keyboard.up("ArrowUp");

  expect(pageErrors).toEqual([]);
});

test("auction scene: reduced motion snaps avatars with no tween transitions", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // Emulate the reduced-motion preference before the scene mounts, so it reads
  // the preference at creation and renders in snap mode from the first frame.
  await page.emulateMedia({ reducedMotion: "reduce" });

  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  await page.locator(".auction-screen-role-button").first().click();
  await expect(page.locator(".auction-track-svg")).toBeVisible({ timeout: 10_000 });

  // The emulated preference reached the scene.
  await expect(page.locator(".auction-screen")).toHaveAttribute("data-reduced-motion", "true");

  // The avatars still render, one per player.
  await expect(page.locator(".auction-avatar")).toHaveCount(4);
  const humanAvatar = page.locator('.auction-avatar[data-actor="player-0"]');
  await expect(humanAvatar).toBeVisible();

  // No CSS transition drives avatar motion, so a reduced-motion render carries
  // no tween artifacts: motion is pure per-frame transform writes, snapped.
  const transitionDuration = await humanAvatar.evaluate(
    (el) => getComputedStyle(el).transitionDuration,
  );
  expect(transitionDuration).toBe("0s");

  // Snap invariant: the avatar's rendered center y equals its price-derived
  // target, so it coincides with its price-marker token dot (no interpolation
  // lag). Poll to let any pending frame settle after a price step.
  const humanToken = page.locator(".auction-track-token").first();
  await expect
    .poll(
      async () => {
        const dataY = Number(await humanAvatar.getAttribute("data-y"));
        const cy = Number(await humanToken.getAttribute("cy"));
        return Math.abs(dataY - cy);
      },
      { timeout: 10_000, message: "reduced-motion avatar did not snap to its token position" },
    )
    .toBeLessThan(1);

  // A trade still animates under reduced motion (an instant flash, no travel).
  const tradeLayer = page.locator(".auction-trade-layer");
  await expect
    .poll(async () => Number((await tradeLayer.getAttribute("data-flash-count")) ?? "0"), {
      timeout: 20_000,
      message: "no trade animation fired under reduced motion",
    })
    .toBeGreaterThan(0);

  expect(pageErrors).toEqual([]);
});
