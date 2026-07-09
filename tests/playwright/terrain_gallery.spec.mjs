// Selector contract: this spec depends on src/ui/sprites/terrain_gallery.ts's
// renderTerrainGallery() DOM output -- specifically the `[data-terrain]` tile
// attribute, the `[data-gallery-section="terrain-adjacency-strip"]` /
// `[data-gallery-section="terrain-mixed-patch"]` section wrappers, and
// `<symbol id="...">` ids emitted by src/ui/sprites/sprites_terrain.ts's
// buildTerrainSpriteDefsMarkup(). The gallery module is intentionally
// standalone (does not touch src/ui/main.ts; the map-renderer reskin wiring
// is deferred to a follow-up patch), so this spec bundles it directly with
// esbuild and injects it into the already-built dist/index.html shell,
// following the same pattern as tests/playwright/sprite_gallery.spec.mjs.

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "./repo_root.mjs";

const GALLERY_ENTRY = path.join(REPO_ROOT, "src", "ui", "sprites", "terrain_gallery.ts");
// Bundle to the OS temp dir, not test-results/: see sprite_gallery.spec.mjs
// for why (test-results/ is only prettier-ignored, not eslint-ignored).
const BUNDLE_OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "terrain-gallery-bundle-"));
const BUNDLE_OUT_FILE = path.join(BUNDLE_OUT_DIR, "terrain_gallery_bundle.js");
const GALLERY_GLOBAL_NAME = "TerrainGalleryModule";

// Fixed domain set from docs/active_plans/active/mule_art_style_spec.md's
// symbol id naming convention: sprite-<domain>-<name>[-frameN].
const SPRITE_DOMAINS = ["terrain", "species", "mule", "town", "event", "icon"];

/**
 * Validate one symbol id against the naming convention. The name segment
 * (between the domain and an optional trailing "-frameN") may itself be
 * hyphenated, so this splits from both ends rather than assuming a fixed
 * segment count.
 */
function isConventionalSpriteSymbolId(id) {
  const parts = id.split("-");
  if (parts.length < 3 || parts[0] !== "sprite") {
    return false;
  }
  if (!SPRITE_DOMAINS.includes(parts[1])) {
    return false;
  }
  const nameParts = parts.slice(2);
  const lastPart = nameParts[nameParts.length - 1];
  const hasFrameSuffix = /^frame[0-9]+$/.test(lastPart);
  const nonFrameParts = hasFrameSuffix ? nameParts.slice(0, -1) : nameParts;
  return nonFrameParts.length >= 1 && nonFrameParts.every((part) => /^[a-z0-9]+$/.test(part));
}

test.beforeAll(() => {
  // esbuild --bundle inlines the sprites_terrain.ts / palette.ts imports, so
  // the resulting IIFE is fully self-contained; --global-name exposes the
  // module's named exports as window.TerrainGalleryModule for
  // page.evaluate to call into.
  execFileSync("npx", [
    "esbuild",
    GALLERY_ENTRY,
    "--bundle",
    "--format=iife",
    `--global-name=${GALLERY_GLOBAL_NAME}`,
    "--target=es2020",
    "--platform=browser",
    `--outfile=${BUNDLE_OUT_FILE}`,
  ]);
});

test("terrain gallery: adjacency strip, mixed-neighbor patch, and symbol ids", async ({ page }) => {
  await page.goto("/");

  await page.addScriptTag({ path: BUNDLE_OUT_FILE });
  await page.evaluate((globalName) => {
    const container = document.createElement("div");
    container.id = "terrain-gallery";
    document.body.appendChild(container);
    const galleryModule = window[globalName];
    galleryModule.renderTerrainGallery(container);
  }, GALLERY_GLOBAL_NAME);

  // 7 distinct terrain tiles: plain, river, mountain1/2/3, town, crater.
  const allTerrainTiles = page.locator("[data-terrain]");
  const terrainValues = await allTerrainTiles.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-terrain")),
  );
  expect(new Set(terrainValues).size).toBe(7);

  // The adjacency strip alone carries all 7, one instance each.
  const stripTiles = page.locator(
    '[data-gallery-section="terrain-adjacency-strip"] [data-terrain]',
  );
  await expect(stripTiles).toHaveCount(7);

  // Mixed-neighbor 3x3 patch: every orthogonally adjacent pair uses a
  // different terrain, and therefore a different symbol-id reference,
  // satisfying shape-based distinguishability even where fill lightness
  // alone might read close (for example the mountain tiers).
  const patchValues = await page
    .locator('[data-gallery-section="terrain-mixed-patch"] [data-terrain]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-terrain")));
  expect(patchValues.length).toBe(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const index = row * 3 + col;
      const current = patchValues[index];
      if (col < 2) {
        expect(current).not.toBe(patchValues[index + 1]);
      }
      if (row < 2) {
        expect(current).not.toBe(patchValues[index + 3]);
      }
    }
  }

  // Every symbol id in the gallery's <defs> follows the naming convention
  // and lives in the "terrain" domain. Scoped to #terrain-gallery: the
  // built app page (title screen) mounts its own <symbol> defs, so an
  // unscoped page-wide query would double-count.
  const symbolIds = await page
    .locator("#terrain-gallery symbol")
    .evaluateAll((symbols) => symbols.map((s) => s.id));
  expect(symbolIds.length).toBe(7);
  const invalidIds = symbolIds.filter((id) => !isConventionalSpriteSymbolId(id));
  expect(invalidIds).toEqual([]);
  for (const id of symbolIds) {
    expect(id.startsWith("sprite-terrain-")).toBe(true);
  }
});
