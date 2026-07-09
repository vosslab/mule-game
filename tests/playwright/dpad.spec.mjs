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

import { test, expect } from "@playwright/test";

/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;

/**
 * Claim whichever plot the land-grant sweep cursor is currently on, then pass
 * through the rest of land grant (see game_flow.spec.mjs's identical helper).
 */
async function reachHumanDevelopTurn(page) {
  await page.locator("#game-map .map-svg g[data-row][data-col]").first().waitFor();
  await page.keyboard.press("Enter");
  const passButton = page.locator("#land-grant-pass-button");
  for (let i = 0; i < MAX_PASS_ITERATIONS; i++) {
    if (!(await passButton.isVisible().catch(() => false))) {
      return;
    }
    await passButton.click().catch(() => undefined);
    await page.waitForTimeout(30);
  }
}

test.describe("touch pointer", () => {
  test.use({ hasTouch: true });

  test("d-pad is visible on a touch pointer and moves the avatar", async ({ page }) => {
    await page.goto("/?speed=8");
    await page.locator("#new-game-button").click();
    await reachHumanDevelopTurn(page);

    const avatar = page.locator(".overworld-svg [data-actor='player-0']");
    await expect(avatar).toHaveCount(1, { timeout: 30_000 });

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
    await reachHumanDevelopTurn(page);

    await expect(page.locator(".overworld-svg [data-actor='player-0']")).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(page.locator(".dpad[data-dpad]")).toBeHidden();
  });
});
