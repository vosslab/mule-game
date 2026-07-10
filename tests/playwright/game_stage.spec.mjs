// Selector contract: this spec depends on src/ui/main.tsx's #new-game-button
// wiring and src/ui/solid/game_screen.tsx's #game-stage / #game-hud / #game-map
// / #game-panel containers, plus the letterbox layout in src/style.css. It pins
// the M5 stage foundation: #game-stage is a 16:10 letterboxed box, centered in
// the viewport, and every in-game surface lays out inside it. Downstream auction
// (M6) and phase-panel (M7) work asserts against this same box.

import { test, expect } from "@playwright/test";

// Target 16:10 aspect ratio and the slack the assertions allow. `aspect-ratio:
// 16 / 10` pins the box to 1.6 at the CSS level; the tolerance only absorbs
// sub-pixel rounding in the reported bounding box, not layout drift.
const TARGET_ASPECT = 16 / 10;
const ASPECT_TOLERANCE = 0.02;

// Two viewport shapes that exercise both letterbox axes. The wide window is
// wider than 16:10 (side bars, height binds); the tall window is taller than
// 16:10 (top/bottom bars, width binds). The tall case stays wide enough in
// absolute pixels that the 16:10 stage still has room for the in-game column.
const WIDE_VIEWPORT = { width: 1600, height: 900 };
const TALL_VIEWPORT = { width: 1200, height: 1000 };

/**
 * Start a new game from the title screen and wait for the game screen and its
 * stage to render. The stage exists from the first game state (land grant), so
 * no phase advance is needed.
 */
async function startGame(page) {
  await page.goto("/");
  const newGameButton = page.locator("#new-game-button");
  await expect(newGameButton).toBeEnabled();
  await newGameButton.click();
  await expect(page.locator("#screen-game")).toHaveClass(/active/);
  await expect(page.locator("#game-stage")).toBeVisible();
}

/**
 * Assert `inner`'s bounding box sits within `outer`'s, allowing a small pixel
 * slack for anti-aliased borders. Proves game content is contained in the stage.
 */
function expectContained(inner, outer, slack = 1) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - slack);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - slack);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + slack);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + slack);
}

for (const viewportCase of [
  { label: "wide window (side letterbox)", viewport: WIDE_VIEWPORT },
  { label: "tall window (top/bottom letterbox)", viewport: TALL_VIEWPORT },
]) {
  test(`game stage is 16:10 and contains game content: ${viewportCase.label}`, async ({ page }) => {
    await page.setViewportSize(viewportCase.viewport);
    await startGame(page);

    const stage = await page.locator("#game-stage").boundingBox();
    expect(stage, "stage bounding box").not.toBeNull();

    // Core deliverable: the stage box is 16:10 within tolerance.
    const aspect = stage.width / stage.height;
    expect(Math.abs(aspect - TARGET_ASPECT), `stage aspect ${aspect}`).toBeLessThanOrEqual(
      ASPECT_TOLERANCE,
    );

    // The stage fits inside the viewport (letterbox, never overflow): neither
    // dimension exceeds the viewport, and it sits within the visible area.
    expect(stage.width).toBeLessThanOrEqual(viewportCase.viewport.width + 1);
    expect(stage.height).toBeLessThanOrEqual(viewportCase.viewport.height + 1);

    // Every game container lays out inside the stage box.
    for (const containerId of ["#game-hud", "#game-map", "#game-panel"]) {
      const container = await page.locator(containerId).boundingBox();
      expect(container, `${containerId} bounding box`).not.toBeNull();
      expectContained(container, stage);
    }

    // No page-level scrollbars: the document never scrolls past the viewport.
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }));
    expect(overflow.x, "horizontal document overflow").toBeLessThanOrEqual(1);
    expect(overflow.y, "vertical document overflow").toBeLessThanOrEqual(1);
  });
}

// The board slot (#game-map) fills the vertical space between the HUD and the
// panel on a map-showing phase, so the board is as large as the phase allows
// with no dead margin (docs/HUMAN_GUIDANCE.md "Fill the full 16:10 canvas"). A
// small tolerance above the slot absorbs #game-map's 16px timer reserve.
test("board slot fills the space between HUD and panel", async ({ page }) => {
  await page.setViewportSize(WIDE_VIEWPORT);
  await startGame(page);
  await page.locator("#game-map .map-svg g[data-row][data-col]").first().waitFor();
  const gaps = await page.evaluate(() => {
    const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
    const hud = rect("#game-hud");
    const map = rect("#game-map");
    const panel = rect("#game-panel");
    return { above: map.top - hud.bottom, below: panel.top - map.bottom };
  });
  // Gap above allows the timer reserve (~16px); gap below must be near zero.
  expect(gaps.above, `gap above slot ${gaps.above}`).toBeLessThanOrEqual(20);
  expect(gaps.below, `gap below slot ${gaps.below}`).toBeLessThanOrEqual(4);
});
