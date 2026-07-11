// Selector contract: this spec depends on src/ui/sprites/title_gallery.ts's
// renderTitleGallery() DOM output -- specifically the `[data-title-element]`,
// `[data-species-portrait]`, `[data-event]`, and `[data-hud-chrome]`
// attributes, plus `<symbol id="...">` ids emitted by
// src/ui/sprites/sprites_title.ts's buildTitleSpriteDefsMarkup(),
// src/ui/sprites/sprites_species.ts's buildSpeciesSpriteDefsMarkup(), and
// src/ui/sprites/sprites_events.ts's buildEventSpriteDefsMarkup(). The
// gallery module is intentionally standalone (does not touch
// src/ui/main.tsx), so this spec bundles it directly with esbuild and
// injects it into the already-built dist/index.html shell, following the
// same pattern as tests/playwright/sprite_gallery.spec.mjs.

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "./repo_root.mjs";

const GALLERY_ENTRY = path.join(REPO_ROOT, "src", "ui", "sprites", "title_gallery.ts");
// Bundle to the OS temp dir, not test-results/: see sprite_gallery.spec.mjs
// for why (test-results/ is only prettier-ignored, not eslint-ignored).
const BUNDLE_OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "title-gallery-bundle-"));
const BUNDLE_OUT_FILE = path.join(BUNDLE_OUT_DIR, "title_gallery_bundle.js");
const GALLERY_GLOBAL_NAME = "TitleGalleryModule";

// Fixed domain set from docs/active_plans/active/mule_art_style_spec.md's
// symbol id naming convention: sprite-<domain>-<name>[-frameN]. `arena` and
// `title` were both ratified there.
const SPRITE_DOMAINS = ["terrain", "species", "mule", "town", "event", "icon", "arena", "title"];

const EXPECTED_TITLE_ELEMENTS = ["logo", "planet", "starfield", "ship"];
const EXPECTED_SPECIES_NAMES = [
  "humanoid",
  "gollumer",
  "mechtron",
  "packer",
  "leggite",
  "bonzoid",
  "spheroid",
  "flapper",
];
const EXPECTED_COLONY_EVENT_NAMES = [
  "acid-rain",
  "sunspot",
  "meteorite",
  "radiation",
  "pest",
  "pirate-ship",
  "planetquake",
  "fire",
  "ship-return",
];
const EXPECTED_PERSONAL_EVENT_BADGE_NAMES = ["good-news", "bad-news"];
const EXPECTED_EVENT_NAMES = [
  ...EXPECTED_COLONY_EVENT_NAMES,
  ...EXPECTED_PERSONAL_EVENT_BADGE_NAMES,
];
const EXPECTED_HUD_CHROME_NAMES = ["panel-corner", "timer-frame", "timer-fill-cap"];

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
  // esbuild --bundle inlines the sprites_title.ts / sprites_species.ts /
  // sprites_events.ts / palette.ts imports, so the resulting IIFE is fully
  // self-contained; --global-name exposes the module's named exports as
  // window.TitleGalleryModule for page.evaluate to call into.
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

test("title gallery: hero elements, species portraits, event vignettes, HUD chrome, symbol ids", async ({
  page,
}) => {
  await page.goto("/");

  await page.addScriptTag({ path: BUNDLE_OUT_FILE });
  await page.evaluate((globalName) => {
    const container = document.createElement("div");
    container.id = "title-gallery";
    document.body.appendChild(container);
    const galleryModule = window[globalName];
    galleryModule.renderTitleGallery(container);
  }, GALLERY_GLOBAL_NAME);

  // Logo, planet, starfield, and ship all render.
  const titleElementValues = await page
    .locator("[data-title-element]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-title-element")));
  expect(new Set(titleElementValues)).toEqual(new Set(EXPECTED_TITLE_ELEMENTS));
  expect(titleElementValues.length).toBe(EXPECTED_TITLE_ELEMENTS.length);

  // The starfield host contains multiple star <use> instances (not just
  // one static star), so it actually reads as a field, not a single dot.
  const starUseCount = await page.locator('[data-title-element="starfield"] use').count();
  expect(starUseCount).toBeGreaterThan(1);

  // All 8 species portraits render, each inside its own plate.
  const portraitValues = await page
    .locator("[data-species-portrait]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-species-portrait")));
  expect(new Set(portraitValues)).toEqual(new Set(EXPECTED_SPECIES_NAMES));
  expect(portraitValues.length).toBe(EXPECTED_SPECIES_NAMES.length);
  // Every portrait wraps exactly 2 <use> instances: the plate, then the avatar.
  for (const species of EXPECTED_SPECIES_NAMES) {
    await expect(page.locator(`[data-species-portrait="${species}"] use`)).toHaveCount(2);
  }

  // All 9 colony events + 2 personal-event badges render (11 total,
  // distinct symbol ids).
  const eventElements = await page.locator("[data-event]").elementHandles();
  expect(eventElements.length).toBe(EXPECTED_EVENT_NAMES.length);
  const eventValues = [];
  const eventSymbolHrefs = [];
  for (const handle of eventElements) {
    eventValues.push(await handle.getAttribute("data-event"));
    const href = await handle.$eval("use", (useEl) => useEl.getAttribute("href"));
    eventSymbolHrefs.push(href);
  }
  expect(new Set(eventValues)).toEqual(new Set(EXPECTED_EVENT_NAMES));
  expect(new Set(eventSymbolHrefs).size).toBe(EXPECTED_EVENT_NAMES.length);

  // HUD chrome: panel corner, timer frame, timer fill cap all present.
  const hudChromeValues = await page
    .locator("[data-hud-chrome]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-hud-chrome")));
  expect(new Set(hudChromeValues)).toEqual(new Set(EXPECTED_HUD_CHROME_NAMES));

  // Every symbol id in the gallery's <defs> follows the naming convention.
  // Scoped to #title-gallery: the built app page (title screen) mounts its
  // own <symbol> defs (buildTitleSpriteDefsMarkup in title_screen.tsx), so
  // an unscoped page-wide query would double-count.
  const symbolIds = await page
    .locator("#title-gallery symbol")
    .evaluateAll((symbols) => symbols.map((s) => s.id));
  expect(symbolIds.length).toBeGreaterThan(0);
  const invalidIds = symbolIds.filter((id) => !isConventionalSpriteSymbolId(id));
  expect(invalidIds).toEqual([]);
});
