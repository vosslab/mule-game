// Visual-render art gate (docs/archive/mule_fidelity_plan.md,
// "Acceptance criteria and gates" > Art gate). The existing sprite/terrain/
// town/title gallery specs and map_render.spec.mjs prove DOM/attribute
// contracts (symbol ids, data-* attributes, fill-attribute presence); none
// of them prove the pixels a user actually sees are non-blank and on the
// shared palette. This spec closes that gap with programmatic pixel
// invariants (coverage band, distinct-color band, palette-conformance
// ratio, pairwise region distinctness) computed by tests/pixel_metrics.mjs
// over real page.screenshot()/locator.screenshot() PNG buffers.
//
// Why invariants, not golden-image byte diffs: docs/PLAYWRIGHT_TEST_STYLE.md
// prefers behavior/visibility assertions over raw pixel checks, because a
// golden-image diff breaks on font, anti-aliasing, and Chromium-version
// drift with no signal about what actually broke. The invariants here were
// re-measured twice locally (see the comment beside each threshold) and
// stayed stable across both runs, so they are used instead of a golden
// image: they catch the real failure modes (blank canvas, solid-color
// smear, off-palette fill) while tolerating renderer-level noise.
//
// Selector/fixture contract: this spec depends on the four gallery modules'
// styleGalleryContainer() full-viewport opaque bgDeep sheet (src/ui/sprites/
// sprite_gallery.ts, terrain_gallery.ts, town_gallery.ts, title_gallery.ts),
// the ?demo=map fixture's deterministic terrain layout (src/ui/solid/
// map_demo.tsx: PLOT_ROWS=5, PLOT_COLS=9, river at col 4, town at row 2,
// mountain1 wherever (row+col)%3===0), the default "/" title screen, and the
// ?demo=town fixture (src/ui/solid/town_demo.tsx). Every screenshot emulates
// prefers-reduced-motion: reduce so ambient/idle animation cannot make a
// screenshot flaky.

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "./repo_root.mjs";
import {
  decodePng,
  hexToRgb,
  computeCoverageRatio,
  countDistinctColors,
  computePaletteConformanceRatio,
  meanColor,
  deltaEBetweenRgb,
} from "../pixel_metrics.mjs";

/** Screenshot viewport, fixed so pixel-count-derived metrics stay comparable run to run. */
const VIEWPORT = { width: 1280, height: 800 };
/** deltaE below which a pixel counts as "the background color", not content. */
const BACKGROUND_DELTA_E_TOLERANCE = 8;
/** Channel quantization bucket width for the distinct-color count. */
const COLOR_QUANTIZE_STEP = 24;
/** Sample every Nth pixel in both dimensions for full-viewport screenshots (speed). */
const FULL_PAGE_STRIDE = 3;
/**
 * deltaE below which a pixel counts as "on" a given palette token.
 *
 * Below-100% conformance in these galleries is provably anti-aliasing/
 * shading noise, not an off-palette fill regression: tests/test_sprite_
 * palette.mjs mechanically enforces that every fill/stroke literal in
 * src/ui/sprites/*.ts is either a real PALETTE hex or "none"/"currentColor"
 * (its LEGACY_HEX_ALLOWLIST is empty today), so no code path in these
 * modules can paint a solid off-palette color. A diagnostic sweep (ranking
 * every off-palette pixel by frequency, run against the render-fix lane's
 * final art) confirmed this structurally: the offenders are dozens of
 * distinct, low-count, grayish/muddy quantized buckets (for example
 * #787888, #808088, #587040) that each sit roughly midway between two real
 * tokens (bgTrackAxis-vs-resourceSmithore gray blends; terrainMountain-vs-
 * terrainPlain shading blends), never one dominant solid block -- exactly
 * the signature of SVG edge anti-aliasing and terrain-tile shading, not a
 * fill bug.
 */
const PALETTE_CONFORMANCE_MAX_DELTA_E = 20;

//============================================
/**
 * Regex-extract every "key: "#hex"" entry from src/ui/sprites/palette.ts,
 * the same text-parsing approach tests/test_sprite_palette.mjs and
 * tests/test_player_color_distinct.mjs use to read the palette without a
 * TypeScript loader (Playwright's .mjs specs run under plain Node, so a
 * direct `import ... from "../../src/ui/sprites/palette.ts"` is not
 * available here).
 *
 * @returns {Record<string, string>} Palette token name -> hex color.
 */
function readPaletteTokens() {
  const paletteFile = path.join(REPO_ROOT, "src", "ui", "sprites", "palette.ts");
  const sourceText = fs.readFileSync(paletteFile, "utf8");
  const tokenPattern = /^\s*(\w+):\s*"(#[0-9a-fA-F]{6})"/gm;
  const tokens = {};
  for (const match of sourceText.matchAll(tokenPattern)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

const PALETTE_TOKENS = readPaletteTokens();

//============================================
/**
 * Every palette token's RGB value except the ones named in `excludeNames`.
 * Callers exclude whichever background token a given screenshot already
 * treats as "background" via computeCoverageRatio/computePaletteConformance
 * Ratio's own backgroundRgb argument, so that token cannot trivially count
 * as "on palette" for every anti-aliased background-adjacent pixel.
 *
 * @param {readonly string[]} excludeNames - Palette token names to omit.
 * @returns {Array<[number, number, number]>} The remaining tokens' RGB values.
 */
function paletteRgbListExcluding(excludeNames) {
  const excluded = new Set(excludeNames);
  return Object.entries(PALETTE_TOKENS)
    .filter(([name]) => !excluded.has(name))
    .map(([, hex]) => hexToRgb(hex));
}

const BG_DEEP_RGB = hexToRgb(PALETTE_TOKENS.bgDeep);
// Sprite/terrain/town/title galleries and the title screen all render on the
// bgDeep full-viewport sheet; the remaining tokens are what a rendered
// sprite pixel should conform to. textOnLight is also excluded: palette.ts's
// own comment says it deliberately mirrors bgDeep's hex, so leaving it in
// would let a background-adjacent pixel "conform" under a second name after
// already being excluded as background under the first.
const NON_BG_PALETTE_RGB_LIST = paletteRgbListExcluding(["bgDeep", "textOnLight"]);

//============================================
/**
 * Screenshot the full viewport as a decoded pixel image.
 *
 * @param {import("@playwright/test").Page} page - The page to screenshot.
 * @returns {Promise<{width: number, height: number, data: Buffer}>} Decoded image.
 */
async function screenshotPage(page) {
  const buffer = await page.screenshot();
  return decodePng(buffer);
}

//============================================
/**
 * Screenshot one locator's rendered box as a decoded pixel image.
 *
 * @param {import("@playwright/test").Locator} locator - Element to screenshot.
 * @returns {Promise<{width: number, height: number, data: Buffer}>} Decoded image.
 */
async function screenshotLocator(locator) {
  const buffer = await locator.screenshot();
  return decodePng(buffer);
}

//============================================
/**
 * Bundle a gallery entry module with esbuild into a self-contained IIFE, the
 * same technique tests/playwright/sprite_gallery.spec.mjs (and its terrain/
 * town/title siblings) use: the gallery modules are standalone (do not touch
 * src/ui/main.tsx), so this spec bundles one directly and injects it into
 * the already-built dist/index.html shell rather than adding a demo hook.
 *
 * @param {string} entryRelPath - Repo-root-relative path to the gallery entry.
 * @param {string} globalName - Global name esbuild exposes the module under.
 * @returns {string} Absolute path to the bundled output file.
 */
function bundleGalleryModule(entryRelPath, globalName) {
  const entryFile = path.join(REPO_ROOT, entryRelPath);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "visual-render-bundle-"));
  const outFile = path.join(outDir, "bundle.js");
  execFileSync("npx", [
    "esbuild",
    entryFile,
    "--bundle",
    "--format=iife",
    `--global-name=${globalName}`,
    "--target=es2020",
    "--platform=browser",
    `--outfile=${outFile}`,
  ]);
  return outFile;
}

//============================================
/**
 * Mount a bundled gallery renderer into a fresh container on the page.
 *
 * @param {import("@playwright/test").Page} page - The page to mount into.
 * @param {string} bundleFile - Absolute path to the esbuild bundle.
 * @param {string} globalName - Global name the bundle exposes its exports under.
 * @param {string} containerId - Element id to create and mount into.
 * @param {string} renderFnName - Exported render function name to call.
 * @returns {Promise<void>}
 */
async function mountGallery(page, bundleFile, globalName, containerId, renderFnName) {
  await page.addScriptTag({ path: bundleFile });
  await page.evaluate(
    ({ globalName: name, containerId: id, renderFnName: fnName }) => {
      const container = document.createElement("div");
      container.id = id;
      document.body.appendChild(container);
      const galleryModule = window[name];
      galleryModule[fnName](container);
    },
    { globalName, containerId, renderFnName },
  );
}

/** One test case per sprite gallery: entry file, global name, container id, render fn. */
const GALLERY_CASES = [
  {
    label: "sprite gallery (species avatars, mule poses/outfits)",
    entryRelPath: "src/ui/sprites/sprite_gallery.ts",
    globalName: "VisualSpriteGalleryModule",
    containerId: "visual-sprite-gallery",
    renderFnName: "renderSpriteGallery",
    // Measured (2 consecutive local runs, byte-identical, stride=3,
    // 1280x800 viewport): coverage 0.0538; distinct colors 151; palette
    // conformance 0.9205. Conformance sits lowest of the 4 galleries: this
    // page packs many small (32px) avatar cells, each showing a player tint
    // against a contrasting terrainPlain/bgDeep backdrop, so a larger share
    // of its edge pixels are AA blends between two strongly different
    // palette colors rather than a blend toward one nearby token.
    coverageMin: 0.02,
    coverageMax: 0.15,
    distinctColorsMin: 50,
    distinctColorsMax: 250,
    conformanceMin: 0.85,
  },
  {
    label: "terrain gallery (7 tiles, adjacency strip, mixed patch)",
    entryRelPath: "src/ui/sprites/terrain_gallery.ts",
    globalName: "VisualTerrainGalleryModule",
    containerId: "visual-terrain-gallery",
    renderFnName: "renderTerrainGallery",
    // Measured (2 consecutive local runs, byte-identical): coverage 0.0585;
    // distinct colors 49; palette conformance 0.9924.
    coverageMin: 0.02,
    coverageMax: 0.15,
    distinctColorsMin: 15,
    distinctColorsMax: 90,
    conformanceMin: 0.95,
  },
  {
    label: "town gallery (buildings, counters, exits, arena chrome)",
    entryRelPath: "src/ui/sprites/town_gallery.ts",
    globalName: "VisualTownGalleryModule",
    containerId: "visual-town-gallery",
    renderFnName: "renderTownGallery",
    // Measured (2 consecutive local runs, byte-identical): coverage 0.0235;
    // distinct colors 46; palette conformance 0.9776.
    coverageMin: 0.008,
    coverageMax: 0.08,
    distinctColorsMin: 15,
    distinctColorsMax: 90,
    conformanceMin: 0.93,
  },
  {
    label: "title gallery (hero elements, species portraits, event vignettes, HUD chrome)",
    entryRelPath: "src/ui/sprites/title_gallery.ts",
    globalName: "VisualTitleGalleryModule",
    containerId: "visual-title-gallery",
    renderFnName: "renderTitleGallery",
    // Measured (2 consecutive local runs, byte-identical): coverage 0.0369;
    // distinct colors 83; palette conformance 0.9774.
    coverageMin: 0.012,
    coverageMax: 0.12,
    distinctColorsMin: 25,
    distinctColorsMax: 150,
    conformanceMin: 0.93,
  },
];

for (const galleryCase of GALLERY_CASES) {
  test(`gallery renders on-palette: ${galleryCase.label}`, async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const bundleFile = bundleGalleryModule(galleryCase.entryRelPath, galleryCase.globalName);
    await mountGallery(
      page,
      bundleFile,
      galleryCase.globalName,
      galleryCase.containerId,
      galleryCase.renderFnName,
    );

    const image = await screenshotPage(page);

    // Not blank and not a solid smear: the fraction of pixels that differ
    // from the gallery's bgDeep sheet sits inside a calibrated band.
    const coverage = computeCoverageRatio(
      image,
      BG_DEEP_RGB,
      BACKGROUND_DELTA_E_TOLERANCE,
      FULL_PAGE_STRIDE,
    );
    expect(coverage, `coverage ratio ${coverage}`).toBeGreaterThanOrEqual(galleryCase.coverageMin);
    expect(coverage, `coverage ratio ${coverage}`).toBeLessThanOrEqual(galleryCase.coverageMax);

    // Multiple deliberate fill colors render, not one flat block.
    const distinctColors = countDistinctColors(
      image,
      BG_DEEP_RGB,
      BACKGROUND_DELTA_E_TOLERANCE,
      COLOR_QUANTIZE_STEP,
      FULL_PAGE_STRIDE,
    );
    expect(distinctColors, `distinct color count ${distinctColors}`).toBeGreaterThanOrEqual(
      galleryCase.distinctColorsMin,
    );
    expect(distinctColors, `distinct color count ${distinctColors}`).toBeLessThanOrEqual(
      galleryCase.distinctColorsMax,
    );

    // The large majority of rendered (non-background) pixels land within
    // anti-aliasing tolerance of a real palette token; see each case's
    // conformanceMin comment for its measured value and margin.
    const conformance = computePaletteConformanceRatio(
      image,
      BG_DEEP_RGB,
      BACKGROUND_DELTA_E_TOLERANCE,
      NON_BG_PALETTE_RGB_LIST,
      PALETTE_CONFORMANCE_MAX_DELTA_E,
      FULL_PAGE_STRIDE,
    );
    expect(conformance, `palette conformance ratio ${conformance}`).toBeGreaterThanOrEqual(
      galleryCase.conformanceMin,
    );
  });
}

test("overworld map fixture: river, plains, and mountain terrain render distinctly", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?demo=map");
  await expect(page.locator("#screen-map")).toHaveClass(/active/);

  // Anchor cells chosen from map_demo.tsx's deterministic fixture layout
  // (PLOT_ROWS=5, PLOT_COLS=9, river/town at col 4, mountain1 wherever
  // (row+col)%3===0), each away from the fixture's corner mule glyphs and
  // ownership borders so the sampled cell is pure terrain tile art.
  const anchors = {
    plains: { row: 1, col: 1 },
    river: { row: 1, col: 4 },
    mountain: { row: 0, col: 3 },
  };
  const meanColors = {};
  for (const [terrainName, cell] of Object.entries(anchors)) {
    const cellLocator = page.locator(`.map-svg g[data-row="${cell.row}"][data-col="${cell.col}"]`);
    await expect(cellLocator).toBeVisible();
    const cellImage = await screenshotLocator(cellLocator);
    meanColors[terrainName] = meanColor(cellImage);
  }

  // The 3 terrain regions read as pairwise distinct colors.
  const pairs = [
    ["plains", "river"],
    ["plains", "mountain"],
    ["river", "mountain"],
  ];
  // Measured (2 consecutive local runs, byte-identical): plains-vs-river
  // deltaE=58.41, plains-vs-mountain=30.90, river-vs-mountain=42.01. The
  // threshold below carries comfortable margin under the tightest pair
  // (plains-vs-mountain).
  const MIN_PAIRWISE_DELTA_E = 15;
  for (const [nameA, nameB] of pairs) {
    const pairDeltaE = deltaEBetweenRgb(meanColors[nameA], meanColors[nameB]);
    expect(pairDeltaE, `${nameA} vs ${nameB} deltaE ${pairDeltaE}`).toBeGreaterThan(
      MIN_PAIRWISE_DELTA_E,
    );
  }

  // Each region's mean color lands near its expected palette token.
  const expectedTokens = {
    plains: hexToRgb(PALETTE_TOKENS.terrainPlain),
    river: hexToRgb(PALETTE_TOKENS.terrainRiver),
    mountain: hexToRgb(PALETTE_TOKENS.terrainMountain1),
  };
  // Measured (2 consecutive local runs, byte-identical): plains deltaE=7.88,
  // river=4.51, mountain=8.46 from their tokens (tile art adds grass tufts/
  // ripples/peak shading on top of the flat fill, so this stays looser than
  // the AA-only tolerance used for flat sprite fills above). The threshold
  // below carries comfortable margin over the largest of the three.
  const MAX_TERRAIN_TOKEN_DELTA_E = 16;
  for (const [terrainName, expectedRgb] of Object.entries(expectedTokens)) {
    const tokenDeltaE = deltaEBetweenRgb(meanColors[terrainName], expectedRgb);
    expect(tokenDeltaE, `${terrainName} vs its palette token deltaE ${tokenDeltaE}`).toBeLessThan(
      MAX_TERRAIN_TOKEN_DELTA_E,
    );
  }
});

test("title screen renders non-blank and on-palette", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  const image = await screenshotPage(page);
  // Measured (2 consecutive local runs, byte-identical): coverage 0.1638;
  // palette conformance 0.9790 (a starfield of small stars over a mostly
  // empty planet backdrop leaves a large share of the viewport as bgDeep).
  const coverage = computeCoverageRatio(
    image,
    BG_DEEP_RGB,
    BACKGROUND_DELTA_E_TOLERANCE,
    FULL_PAGE_STRIDE,
  );
  expect(coverage, `coverage ratio ${coverage}`).toBeGreaterThanOrEqual(0.06);
  expect(coverage, `coverage ratio ${coverage}`).toBeLessThanOrEqual(0.35);

  const conformance = computePaletteConformanceRatio(
    image,
    BG_DEEP_RGB,
    BACKGROUND_DELTA_E_TOLERANCE,
    NON_BG_PALETTE_RGB_LIST,
    PALETTE_CONFORMANCE_MAX_DELTA_E,
    FULL_PAGE_STRIDE,
  );
  expect(conformance, `palette conformance ratio ${conformance}`).toBeGreaterThanOrEqual(0.95);
});

test("town scene fixture renders non-blank and on-palette", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?demo=town");
  await expect(page.locator("#town-scene")).toBeVisible();

  const image = await screenshotPage(page);
  // Recalibrated per docs/active_plans/reports/town_street_visual_acceptance.md
  // (WP-3C): the old 9x5 grid town measured coverage 0.7363, which set the
  // prior 0.4 floor. That grid town was retired and rebuilt as a
  // mode-composed scrolling street with a dark night-industrial palette.
  // Measured on the new town: fixture (this test) ~0.3064, in-game ~0.341.
  // The sky band, town container, and facade plate all sit within the
  // deltaE-8 background tolerance of bgDeep, so they register as
  // "background" even though they are painted content; a dark side-view
  // street will never approach the old grid town's fill. The floor is set
  // to 0.24, about 20% margin below the measured 0.3064, still catching a
  // blank or collapsed render while admitting the real scene.
  const coverage = computeCoverageRatio(
    image,
    BG_DEEP_RGB,
    BACKGROUND_DELTA_E_TOLERANCE,
    FULL_PAGE_STRIDE,
  );
  expect(coverage, `coverage ratio ${coverage}`).toBeGreaterThanOrEqual(0.24);
  expect(coverage, `coverage ratio ${coverage}`).toBeLessThanOrEqual(0.9);

  const conformance = computePaletteConformanceRatio(
    image,
    BG_DEEP_RGB,
    BACKGROUND_DELTA_E_TOLERANCE,
    NON_BG_PALETTE_RGB_LIST,
    PALETTE_CONFORMANCE_MAX_DELTA_E,
    FULL_PAGE_STRIDE,
  );
  expect(conformance, `palette conformance ratio ${conformance}`).toBeGreaterThanOrEqual(0.95);
});
