// Touch d-pad: visibility gating and movement dispatch.
//
// Selector contract: this spec depends on src/ui/scenes/dpad.tsx's
// `.dpad[data-dpad]` container and per-direction
// `.dpad-button[data-dpad-direction]` buttons, plus the shared
// `#new-game-button` and `#land-grant-pass-button` phase controls
// (src/ui/solid/*). `hasTouch: true` makes Chromium's `(pointer: coarse)`
// media feature match, the same condition style.css gates `.dpad`'s display
// behind. Player 0 is always the human and always picks first in round 1
// (src/engine/land_grant.ts).
//
// Town-first navigation (WP-4B): every human develop turn now starts IN TOWN
// at the corral. The `<Dpad />` control mounts once in
// human_develop_layer.tsx alongside both the town and overworld scenes (it
// only ever dispatches synthetic arrow-key events), so the mouse-pointer
// hidden check needs nothing past the town scene mounting. The touch-pointer
// movement check proves the d-pad moves the overworld avatar specifically
// (matching overworld_scene.spec.mjs's own movement assertions), so it walks
// the town avatar out the left exit first (a pure horizontal hold never
// crosses a door threshold, per town_street.spec.mjs).

import { test, expect } from "@playwright/test";

/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;

/**
 * Claim whichever plot the land-grant sweep cursor is currently on, then pass
 * through the rest of land grant (see game_flow.spec.mjs's identical helper),
 * and wait for the town scene to mount (every human develop turn starts there).
 */
async function reachTownDevelopTurn(page) {
  await page.locator("#game-map .map-svg g[data-row][data-col]").first().waitFor();
  await page.keyboard.press("Enter");
  const passButton = page.locator("#land-grant-pass-button");
  for (let i = 0; i < MAX_PASS_ITERATIONS; i++) {
    if (!(await passButton.isVisible().catch(() => false))) {
      break;
    }
    await passButton.click().catch(() => undefined);
    await page.waitForTimeout(30);
  }
  await expect(page.locator("#town-scene")).toBeVisible({ timeout: 30_000 });
}

test.describe("touch pointer", () => {
  test.use({ hasTouch: true });

  test("d-pad is visible on a touch pointer and moves the avatar", async ({ page }) => {
    await page.goto("/?speed=8");
    await page.locator("#new-game-button").click();
    await reachTownDevelopTurn(page);

    // Walk out the left exit to reach the overworld avatar this test moves.
    await page.keyboard.down("ArrowLeft");
    const avatar = page.locator(".overworld-svg [data-actor='player-0']");
    await expect(avatar).toHaveCount(1, { timeout: 20_000 });
    await page.keyboard.up("ArrowLeft");

    const dpad = page.locator(".dpad[data-dpad]");
    await expect(dpad).toBeVisible();
    const upButton = page.locator(".dpad-button[data-dpad-direction='up']");
    await expect(upButton).toBeVisible();

    const before = await avatar.getAttribute("transform");
    // Hold the up button long enough for a walker frame to move the avatar.
    await upButton.dispatchEvent("pointerdown");
    await page.waitForTimeout(400);
    await upButton.dispatchEvent("pointerup");

    await expect.poll(async () => avatar.getAttribute("transform")).not.toBe(before);
  });
});

test.describe("mouse pointer", () => {
  test.use({ hasTouch: false });

  test("d-pad is hidden on a fine (mouse) pointer", async ({ page }) => {
    await page.goto("/?speed=8");
    await page.locator("#new-game-button").click();
    await reachTownDevelopTurn(page);

    await expect(page.locator(".dpad[data-dpad]")).toBeHidden();
  });
});
