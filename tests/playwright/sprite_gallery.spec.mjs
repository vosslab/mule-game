// Selector contract: this spec depends on src/ui/sprites/sprite_gallery.ts's
// renderSpriteGallery() DOM output -- specifically the `[data-species-avatar]`
// wrapper attribute, `[data-outfit]` badge-swatch rect attribute/fill, and
// `<symbol id="...">` ids emitted by src/ui/sprites/sprites_species.ts and
// src/ui/sprites/sprites_mule.ts's buildSpeciesSpriteDefsMarkup() /
// buildMuleSpriteDefsMarkup(). The gallery module is intentionally standalone
// (does not touch src/ui/main.ts, owned by the concurrent Solid-port
// workstream), so this spec bundles it directly with esbuild and injects it
// into the already-built dist/index.html shell rather than adding a
// ?demo=sprites hook to main.ts.

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "./repo_root.mjs";

const GALLERY_ENTRY = path.join(REPO_ROOT, "src", "ui", "sprites", "sprite_gallery.ts");
// Bundle to the OS temp dir, not test-results/: test-results/ is only
// prettier-ignored, not eslint-ignored, so a generated bundle left there
// gets picked up by check_codebase.sh's repo-wide eslint glob and fails the
// lint gate on unbundled browser globals. os.tmpdir() sits outside the repo
// tree entirely, so no repo-rooted glob can ever reach it.
const BUNDLE_OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sprite-gallery-bundle-"));
const BUNDLE_OUT_FILE = path.join(BUNDLE_OUT_DIR, "sprite_gallery_bundle.js");
const GALLERY_GLOBAL_NAME = "SpriteGalleryModule";

// Fixed domain set from docs/active_plans/active/mule_art_style_spec.md's
// symbol id naming convention: sprite-<domain>-<name>[-frameN].
const SPRITE_DOMAINS = ["terrain", "species", "mule", "town", "event", "icon"];

/**
 * Validate one symbol id against the naming convention. The name segment
 * (between the domain and an optional trailing "-frameN") may itself be
 * hyphenated (for example "outfit-food"), so this splits from both ends
 * rather than assuming a fixed segment count.
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
  // esbuild --bundle inlines the sprites_species.ts / sprites_mule.ts /
  // palette.ts / engine/player.ts imports, so the resulting IIFE is fully
  // self-contained; --global-name exposes the module's named exports as
  // window.SpriteGalleryModule for page.evaluate to call into.
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

test("sprite gallery: species avatars, outfit badges, and symbol ids", async ({ page }) => {
  await page.goto("/");

  await page.addScriptTag({ path: BUNDLE_OUT_FILE });
  await page.evaluate((globalName) => {
    const container = document.createElement("div");
    container.id = "sprite-gallery";
    document.body.appendChild(container);
    const galleryModule = window[globalName];
    galleryModule.renderSpriteGallery(container);
  }, GALLERY_GLOBAL_NAME);

  // 8 species x 4 player colors = 32 avatar instances, each covering both
  // bgDeep and terrainPlain backgrounds internally (see sprite_gallery.ts).
  const speciesAvatars = page.locator("[data-species-avatar]");
  await expect(speciesAvatars).toHaveCount(32);

  // 4 outfit badges (food/energy/smithore/crystite), each a distinct fill.
  const outfitBadges = page.locator("[data-outfit]");
  await expect(outfitBadges).toHaveCount(4);
  const badgeFills = await outfitBadges.evaluateAll((rects) =>
    rects.map((el) => el.getAttribute("fill")),
  );
  expect(new Set(badgeFills).size).toBe(4);

  // Every symbol id in the gallery's <defs> follows the naming convention.
  // Scoped to #sprite-gallery: the built app page (title screen) mounts its
  // own <symbol> defs, so an unscoped page-wide query would double-count.
  const symbolIds = await page
    .locator("#sprite-gallery symbol")
    .evaluateAll((symbols) => symbols.map((s) => s.id));
  expect(symbolIds.length).toBeGreaterThan(0);
  const invalidIds = symbolIds.filter((id) => !isConventionalSpriteSymbolId(id));
  expect(invalidIds).toEqual([]);
});
