// Ambient animation reduced-motion gate.
//
// Confirms the river-tile shimmer, installed-M.U.L.E. idle bob, and
// auction-trade-pop keyframes (src/style.css) are each wrapped in
// `@media (prefers-reduced-motion: no-preference)`: under emulated reduced
// motion, `getComputedStyle(...).animationName` reads "none" for all three;
// under no-preference motion, each resolves to its real keyframe name. This
// is a direct test of the actual gating mechanism (the media query), rather
// than a `data-reduced-motion` attribute that could drift from the CSS it is
// meant to describe.
//
// Selector/fixture contract: depends on the `?demo=map` fixture
// (src/ui/solid/map_demo.tsx: river tile at row 1 / col 4, a placed
// M.U.L.E. at row 0 / col 0 -- see visual_render.spec.mjs's identical anchor
// comment) and map_layer.tsx's `.terrain-tile-use` / `.mule-installed-glyph`
// CSS hook classes. The trade-pop case does not drive a live auction (that is
// a slow, multi-phase path already covered by auction_scene.spec.mjs); it
// injects one `.auction-trade-flash-burst` element directly, which is enough
// to exercise the global CSS rule the real trade-flash burst also matches.

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

/** Append a throwaway SVG `<use class="auction-trade-flash-burst">` to the page. */
async function injectTradeFlashBurst(page) {
  await page.evaluate(() => {
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("id", "ambient-spec-trade-flash-host");
    const use = document.createElementNS(svgNs, "use");
    use.setAttribute("class", "auction-trade-flash-burst");
    svg.appendChild(use);
    document.body.appendChild(svg);
  });
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

  await injectTradeFlashBurst(page);
  const tradeAnimation = await animationNameOf(page, ".auction-trade-flash-burst");
  expect(tradeAnimation).toBe("auction-trade-pop");
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

  await injectTradeFlashBurst(page);
  const tradeAnimation = await animationNameOf(page, ".auction-trade-flash-burst");
  expect(tradeAnimation).toBe("none");
});
