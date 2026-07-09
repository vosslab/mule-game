// Selector contract: this spec depends on the ?demo=map hook in
// src/ui/main.tsx, the "screen-map" id it defines, and the
// data-terrain/data-owner attributes written by src/ui/solid/map_layer.tsx's
// plot-cell rendering (intentionally preserved across the Solid port).

import { test, expect } from "@playwright/test";

test("fixture map: terrain fills, owner borders, and M.U.L.E. glyphs render", async ({ page }) => {
  await page.goto("/?demo=map");

  const mapScreen = page.locator("#screen-map");
  await expect(mapScreen).toHaveClass(/active/);

  const svg = page.locator(".map-svg");
  await expect(svg).toBeVisible();

  // At least 3 distinct terrain fills present on the fixture board.
  const terrainFills = await page
    .locator(".map-svg g[data-terrain] > rect")
    .evaluateAll((rects) => Array.from(new Set(rects.map((el) => el.getAttribute("fill")))));
  expect(terrainFills.length).toBeGreaterThanOrEqual(3);

  // 4 distinct owner border colors on the fixture (one owned plot per player).
  const ownerStrokes = await page
    .locator(".map-svg g[data-owner] > rect")
    .evaluateAll((rects) => Array.from(new Set(rects.map((el) => el.getAttribute("stroke")))));
  expect(ownerStrokes.length).toBe(4);

  // M.U.L.E. glyph count matches the fixture: one per owned plot.
  const muleGlyphCount = await page.locator(".map-svg g[data-outfit]").count();
  expect(muleGlyphCount).toBe(4);

  // HUD shows all 4 players.
  const hudPlayers = page.locator(".hud-player");
  await expect(hudPlayers).toHaveCount(4);
});
