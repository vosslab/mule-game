/**
 * Title-screen / species-select / event-vignette readability fixture for
 * the art patch
 * (docs/active_plans/active/mule_fidelity_plan.md,
 * docs/active_plans/active/mule_art_style_spec.md "Readability criteria").
 *
 * Renders the title-screen hero elements (wordmark, planet backdrop, a
 * tiled starfield, landing ship), all 8 species portraits mounted in the
 * portrait plate, all 11 event vignettes (9 colony events + 2 personal-
 * event polarity badges), and the HUD chrome / timer-bar pieces, so a
 * reviewer (human or a Playwright spec) can eyeball or query the whole M8
 * sprite set in one page.
 *
 * This module is standalone: it does not import or touch `src/ui/main.tsx`
 * (owned by the concurrent Solid-port UI workstream). `tests/playwright/
 * title_gallery.spec.mjs` bundles this file directly with esbuild and
 * injects it into the built `dist/index.html` shell, following the same
 * pattern as `town_gallery.ts` / `town_gallery.spec.mjs`.
 *
 * Fixture layout revision: see terrain_gallery.ts's module doc
 * comment for why `styleGalleryContainer()` makes the passed-in container a
 * full-viewport, opaque, fixed-position sheet.
 */

import { PALETTE } from "./palette";
import {
  TITLE_LOGO_SYMBOL_ID,
  TITLE_PLANET_SYMBOL_ID,
  TITLE_STAR_SYMBOL_ID,
  TITLE_SHIP_SYMBOL_ID,
  TITLE_PORTRAIT_PLATE_SYMBOL_ID,
  PORTRAIT_PLATE_SIZE,
  PORTRAIT_PLATE_AVATAR_OFFSET,
  HUD_PANEL_CORNER_SYMBOL_ID,
  TIMER_BAR_FRAME_SYMBOL_ID,
  TIMER_BAR_FILL_CAP_SYMBOL_ID,
  buildTitleSpriteDefsMarkup,
} from "./sprites_title";
import {
  SPECIES_NAMES,
  speciesSymbolId,
  buildSpeciesSpriteDefsMarkup,
  type SpeciesName,
} from "./sprites_species";
import {
  COLONY_EVENT_NAMES,
  PERSONAL_EVENT_BADGE_NAMES,
  colonyEventSymbolId,
  personalEventBadgeSymbolId,
  EVENT_VIGNETTE_SIZE,
  buildEventSpriteDefsMarkup,
  type ColonyEventName,
  type PersonalEventBadgeName,
} from "./sprites_events";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const STAR_TILE_COUNT = 12;
const AVATAR_SIZE = 32;
const HUD_CORNER_SWATCH_SIZE = 20;
const TIMER_CAP_SWATCH_SIZE = 18;

/**
 * Render the full gallery into `container`, replacing any existing
 * content.
 *
 * @param container - Element to mount the gallery into.
 */
export function renderTitleGallery(container: HTMLElement): void {
  container.innerHTML = "";
  styleGalleryContainer(container);
  container.appendChild(buildDefsHost());
  container.appendChild(buildSectionLabel("Title hero: wordmark, planet, starfield, ship"));
  container.appendChild(buildTitleHeroSection());
  container.appendChild(buildSectionLabel("Species-select portraits"));
  container.appendChild(buildSpeciesSelectSection());
  container.appendChild(buildSectionLabel("Event vignettes"));
  container.appendChild(buildEventVignetteSection());
  container.appendChild(buildSectionLabel("HUD chrome"));
  container.appendChild(buildHudChromeSection());
}

//============================================
// Makes the passed-in container a full-viewport, opaque, fixed-position
// sheet (see module doc comment "Fixture layout") so gallery content never
// competes with whatever page it was injected into.
function styleGalleryContainer(container: HTMLElement): void {
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.zIndex = "9999";
  container.style.background = PALETTE.bgDeep;
  container.style.color = PALETTE.textPrimary;
  container.style.fontFamily = "sans-serif";
  container.style.overflow = "auto";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "16px";
  container.style.padding = "24px";
  container.style.boxSizing = "border-box";
}

//============================================
// A section-heading label, shown above each gallery section's row of
// swatches so a reviewer can tell sections apart on a scrolled screenshot.
function buildSectionLabel(labelText: string): HTMLElement {
  const label = document.createElement("h2");
  label.textContent = labelText;
  label.style.margin = "0";
  label.style.fontSize = "1rem";
  return label;
}

//============================================
// One hidden host <svg> holding all 3 modules' <defs>, shared by every
// <use> reference the gallery draws below.
function buildDefsHost(): SVGSVGElement {
  const defsHost = document.createElementNS(SVG_NAMESPACE, "svg");
  defsHost.setAttribute("width", "0");
  defsHost.setAttribute("height", "0");
  defsHost.setAttribute("aria-hidden", "true");
  defsHost.style.position = "absolute";
  defsHost.innerHTML =
    buildTitleSpriteDefsMarkup() + buildSpeciesSpriteDefsMarkup() + buildEventSpriteDefsMarkup();
  return defsHost;
}

//============================================
// Section 1: the title-screen hero elements -- wordmark, planet backdrop,
// a tiled starfield, and the landing ship.
function buildTitleHeroSection(): HTMLElement {
  const section = document.createElement("div");
  section.setAttribute("data-gallery-section", "title-hero");
  section.style.display = "flex";
  section.style.flexWrap = "wrap";
  section.style.gap = "8px";
  section.style.alignItems = "flex-start";
  section.appendChild(buildTitleElementSvg("logo", TITLE_LOGO_SYMBOL_ID, 210, 40));
  section.appendChild(buildTitleElementSvg("planet", TITLE_PLANET_SYMBOL_ID, 200, 200));
  section.appendChild(buildStarfield());
  section.appendChild(buildTitleElementSvg("ship", TITLE_SHIP_SYMBOL_ID, 64, 40));
  return section;
}

//============================================
function buildTitleElementSvg(
  elementName: string,
  symbolId: string,
  viewBoxWidth: number,
  viewBoxHeight: number,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("data-title-element", elementName);
  svg.setAttribute("viewBox", `0 0 ${viewBoxWidth} ${viewBoxHeight}`);
  svg.setAttribute("width", String(viewBoxWidth));
  svg.setAttribute("height", String(viewBoxHeight));
  svg.innerHTML = `<use href="#${symbolId}" />`;
  return svg;
}

//============================================
// A tiled starfield: STAR_TILE_COUNT instances of the single star symbol
// at varied positions, all inside one [data-title-element="starfield"]
// host so a fixture can count star instances without depending on layout.
function buildStarfield(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("data-title-element", "starfield");
  svg.setAttribute("viewBox", "0 0 200 80");
  svg.setAttribute("width", "200");
  svg.setAttribute("height", "80");
  let markup = "";
  for (let i = 0; i < STAR_TILE_COUNT; i++) {
    const x = (i * 37) % 192;
    const y = (i * 23) % 72;
    markup += `<use href="#${TITLE_STAR_SYMBOL_ID}" x="${x}" y="${y}" width="6" height="6" />`;
  }
  svg.innerHTML = markup;
  return svg;
}

//============================================
// Section 2: all 8 species portraits, each mounted inside the
// selection-frame portrait plate at the offset the plate's own module
// documents.
function buildSpeciesSelectSection(): HTMLElement {
  const section = document.createElement("div");
  section.setAttribute("data-gallery-section", "species-select");
  section.style.display = "flex";
  section.style.flexWrap = "wrap";
  section.style.gap = "8px";
  for (const species of SPECIES_NAMES) {
    section.appendChild(buildSpeciesPortraitInstance(species));
  }
  return section;
}

//============================================
function buildSpeciesPortraitInstance(species: SpeciesName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("data-species-portrait", species);
  svg.setAttribute("viewBox", `0 0 ${PORTRAIT_PLATE_SIZE} ${PORTRAIT_PLATE_SIZE}`);
  svg.setAttribute("width", String(PORTRAIT_PLATE_SIZE));
  svg.setAttribute("height", String(PORTRAIT_PLATE_SIZE));
  const plateUse = `<use href="#${TITLE_PORTRAIT_PLATE_SYMBOL_ID}" />`;
  const avatarUse = `<use href="#${speciesSymbolId(species, 1)}" x="${PORTRAIT_PLATE_AVATAR_OFFSET}" y="${PORTRAIT_PLATE_AVATAR_OFFSET}" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" style="color: ${PALETTE.player0}" />`;
  svg.innerHTML = plateUse + avatarUse;
  return svg;
}

//============================================
// Section 3: all 9 colony-event vignettes plus the 2 personal-event
// polarity badges, 11 instances total.
function buildEventVignetteSection(): HTMLElement {
  const section = document.createElement("div");
  section.setAttribute("data-gallery-section", "event-vignettes");
  section.style.display = "flex";
  section.style.flexWrap = "wrap";
  section.style.gap = "8px";
  for (const eventName of COLONY_EVENT_NAMES) {
    section.appendChild(buildEventVignetteSvg(eventName, colonyEventSymbolId(eventName)));
  }
  for (const badgeName of PERSONAL_EVENT_BADGE_NAMES) {
    section.appendChild(buildEventVignetteSvg(badgeName, personalEventBadgeSymbolId(badgeName)));
  }
  return section;
}

//============================================
function buildEventVignetteSvg(
  eventName: ColonyEventName | PersonalEventBadgeName,
  symbolId: string,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("data-event", eventName);
  svg.setAttribute("viewBox", `0 0 ${EVENT_VIGNETTE_SIZE} ${EVENT_VIGNETTE_SIZE}`);
  svg.setAttribute("width", String(EVENT_VIGNETTE_SIZE));
  svg.setAttribute("height", String(EVENT_VIGNETTE_SIZE));
  svg.innerHTML = `<use href="#${symbolId}" />`;
  return svg;
}

//============================================
// Section 4: HUD chrome -- the panel corner accent and the timer-bar
// frame/fill-cap pair.
function buildHudChromeSection(): HTMLElement {
  const section = document.createElement("div");
  section.setAttribute("data-gallery-section", "hud-chrome");
  section.style.display = "flex";
  section.style.flexWrap = "wrap";
  section.style.gap = "8px";
  section.style.alignItems = "flex-start";
  section.appendChild(
    buildHudChromeSvg("panel-corner", HUD_PANEL_CORNER_SYMBOL_ID, HUD_CORNER_SWATCH_SIZE),
  );
  section.appendChild(buildTimerBarSvg());
  section.appendChild(
    buildHudChromeSvg("timer-fill-cap", TIMER_BAR_FILL_CAP_SYMBOL_ID, TIMER_CAP_SWATCH_SIZE),
  );
  return section;
}

//============================================
function buildHudChromeSvg(chromeName: string, symbolId: string, size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("data-hud-chrome", chromeName);
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.innerHTML = `<use href="#${symbolId}" />`;
  return svg;
}

//============================================
function buildTimerBarSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("data-hud-chrome", "timer-frame");
  svg.setAttribute("viewBox", "0 0 120 14");
  svg.setAttribute("width", "120");
  svg.setAttribute("height", "14");
  svg.innerHTML = `<use href="#${TIMER_BAR_FRAME_SYMBOL_ID}" />`;
  return svg;
}
