// Selector contract: this spec depends on src/ui/sprites/town_gallery.ts's
// renderTownGallery() DOM output -- specifically the `[data-building]`,
// `[data-door-for]`, `[data-counter]`, `[data-exit]`, and
// `[data-arena-chrome]` attributes, plus `<symbol id="...">` ids emitted by
// src/ui/sprites/sprites_town.ts's buildTownSpriteDefsMarkup() and
// src/ui/sprites/sprites_arena.ts's buildArenaSpriteDefsMarkup(). The
// gallery module is intentionally standalone (does not touch
// src/ui/main.ts or src/ui/auction_screen.ts), so this spec bundles it
// directly with esbuild and injects it into the already-built
// dist/index.html shell, following the same pattern as
// tests/playwright/terrain_gallery.spec.mjs.

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "./repo_root.mjs";

const GALLERY_ENTRY = path.join(REPO_ROOT, "src", "ui", "sprites", "town_gallery.ts");
// Bundle to the OS temp dir, not test-results/: see sprite_gallery.spec.mjs
// for why (test-results/ is only prettier-ignored, not eslint-ignored).
const BUNDLE_OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "town-gallery-bundle-"));
const BUNDLE_OUT_FILE = path.join(BUNDLE_OUT_DIR, "town_gallery_bundle.js");
const GALLERY_GLOBAL_NAME = "TownGalleryModule";

// Fixed domain set from docs/active_plans/active/mule_art_style_spec.md's
// symbol id naming convention: sprite-<domain>-<name>[-frameN]. `arena` was
// ratified there; sprites_arena.ts ids were renamed from
// sprite-icon-auction-* to sprite-arena-* to match.
const SPRITE_DOMAINS = ["terrain", "species", "mule", "town", "event", "icon", "arena"];

// The 4 town buildings this workstream's scope covers (store, pub, assay,
// corral) -- see sprites_town.ts's TOWN_BUILDING_NAMES.
const EXPECTED_BUILDING_NAMES = ["store", "pub", "assay", "corral"];
const EXPECTED_RESOURCES = ["food", "energy", "smithore", "crystite"];
const EXPECTED_EXIT_DIRECTIONS = ["north", "south", "east", "west"];
const EXPECTED_ARENA_CHROME_NAMES = [
  "backdrop",
  "axis-bar",
  "axis-tick",
  "store-band",
  "trade-flash",
];

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
  // esbuild --bundle inlines the sprites_town.ts / sprites_arena.ts /
  // palette.ts imports, so the resulting IIFE is fully self-contained;
  // --global-name exposes the module's named exports as
  // window.TownGalleryModule for page.evaluate to call into.
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

test("town gallery: buildings, doors, counters, exits, arena chrome, symbol ids", async ({
  page,
}) => {
  await page.goto("/");

  await page.addScriptTag({ path: BUNDLE_OUT_FILE });
  await page.evaluate((globalName) => {
    const container = document.createElement("div");
    container.id = "town-gallery";
    document.body.appendChild(container);
    const galleryModule = window[globalName];
    galleryModule.renderTownGallery(container);
  }, GALLERY_GLOBAL_NAME);

  // All 4 building types render with data-building.
  const buildingValues = await page
    .locator("[data-building]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-building")));
  expect(new Set(buildingValues)).toEqual(new Set(EXPECTED_BUILDING_NAMES));
  expect(buildingValues.length).toBe(EXPECTED_BUILDING_NAMES.length);

  // Each building has an associated door marker (data-door-for matches a
  // data-building value 1:1).
  const doorForValues = await page
    .locator("[data-door-for]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-door-for")));
  expect(new Set(doorForValues)).toEqual(new Set(EXPECTED_BUILDING_NAMES));
  for (const building of EXPECTED_BUILDING_NAMES) {
    await expect(
      page.locator(`[data-building="${building}"] [data-door-for="${building}"]`),
    ).toHaveCount(1);
  }

  // 4 outfit counters, distinct fills, one per resource.
  const counterFills = await page.locator("[data-counter]").evaluateAll((els) =>
    els.map((el) => ({
      resource: el.getAttribute("data-counter"),
      fill: el.getAttribute("fill"),
    })),
  );
  expect(counterFills.map((entry) => entry.resource).sort()).toEqual(
    [...EXPECTED_RESOURCES].sort(),
  );
  const distinctFills = new Set(counterFills.map((entry) => entry.fill));
  expect(distinctFills.size).toBe(EXPECTED_RESOURCES.length);

  // 4 edge-exit markers.
  const exitValues = await page
    .locator("[data-exit]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-exit")));
  expect(new Set(exitValues)).toEqual(new Set(EXPECTED_EXIT_DIRECTIONS));

  // Arena chrome: axis-bar, store-band, and trade-flash all present
  // (backdrop and axis-tick round out the full chrome set).
  const arenaChromeValues = await page
    .locator("[data-arena-chrome]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-arena-chrome")));
  expect(new Set(arenaChromeValues)).toEqual(new Set(EXPECTED_ARENA_CHROME_NAMES));
  for (const chromeName of ["axis-bar", "store-band", "trade-flash"]) {
    expect(arenaChromeValues).toContain(chromeName);
  }

  // Every symbol id in the gallery's <defs> follows the naming convention.
  // Scoped to #town-gallery: the built app page (title screen) mounts its
  // own <symbol> defs, so an unscoped page-wide query would double-count.
  const symbolIds = await page
    .locator("#town-gallery symbol")
    .evaluateAll((symbols) => symbols.map((s) => s.id));
  expect(symbolIds.length).toBeGreaterThan(0);
  const invalidIds = symbolIds.filter((id) => !isConventionalSpriteSymbolId(id));
  expect(invalidIds).toEqual([]);
});
