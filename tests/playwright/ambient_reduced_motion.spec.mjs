// Ambient animation reduced-motion gate.
//
// Confirms the river-tile shimmer and installed-M.U.L.E. idle bob keyframes
// (src/style.css) are each wrapped in `@media (prefers-reduced-motion:
// no-preference)`: under emulated reduced motion,
// `getComputedStyle(...).animationName` reads "none" for both; under
// no-preference motion, each resolves to its real keyframe name. This is a
// direct test of the actual gating mechanism (the media query), rather than a
// `data-reduced-motion` attribute that could drift from the CSS it is meant
// to describe.
//
// Selector/fixture contract: depends on the `?demo=map` fixture
// (src/ui/solid/map_demo.tsx: river tile at row 1 / col 4, a placed
// M.U.L.E. at row 0 / col 0 -- see visual_render.spec.mjs's identical anchor
// comment) and map_layer.tsx's `.terrain-tile-use` / `.mule-installed-glyph`
// CSS hook classes.
//
// The trade-flash burst is deliberately NOT covered here. Its entrance pop
// used to be a CSS keyframe this file could probe the same way, but
// auction_trade_fx.ts now drives the pop from a per-frame JS-written SVG
// `transform` attribute instead (see that module's addFlash/advance and the
// bug-fix comment in src/style.css above .auction-trade-flash-burst), and
// only a live `attachTradeFx` handle -- mounted by auction_arena.tsx during a
// real auction -- ever writes that attribute. This file's `?demo=map`
// fixture has no such handle, so an element injected here can never pop, by
// construction, regardless of what is asserted about it. The reduced-motion
// half of that behavior (the flash and banner appear instantly, with no
// flying-goods glyph) is already covered against a real trade in
// auction_scene.spec.mjs ("reduced motion shows the trade flash and banner
// instantly, with no flying goods glyph").

import { test, expect } from "@playwright/test";

/**
 * Read `getComputedStyle(...).animationName` for the first element matching
 * `selector`, throwing if no such element exists.
 */
async function animationNameOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) {
      throw new Error(`animationNameOf: no element matches ${sel}`);
    }
    return getComputedStyle(el).animationName;
  }, selector);
}

test("ambient animations run under no-preference motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?demo=map");
  await expect(page.locator("#screen-map")).toHaveClass(/active/);

  const riverAnimation = await animationNameOf(
    page,
    '.map-svg g[data-row="1"][data-col="4"] .terrain-tile-use',
  );
  expect(riverAnimation).toBe("river-shimmer");

  const muleAnimation = await animationNameOf(
    page,
    '.map-svg g[data-row="0"][data-col="0"] .mule-installed-glyph',
  );
  expect(muleAnimation).toBe("mule-idle-bob");
});

test("ambient animations are static under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?demo=map");
  await expect(page.locator("#screen-map")).toHaveClass(/active/);

  const riverAnimation = await animationNameOf(
    page,
    '.map-svg g[data-row="1"][data-col="4"] .terrain-tile-use',
  );
  expect(riverAnimation).toBe("none");

  const muleAnimation = await animationNameOf(
    page,
    '.map-svg g[data-row="0"][data-col="0"] .mule-installed-glyph',
  );
  expect(muleAnimation).toBe("none");
});
