/**
 * Building/zone-readability fixture for the art patch
 * (docs/active_plans/active/mule_fidelity_plan.md,
 * docs/active_plans/active/mule_art_style_spec.md "Readability criteria").
 *
 * Renders a town layout mock (all 4 buildings plus their door markers and
 * the ground tile), a standalone store-counter swatch row, the 4 edge-exit
 * markers, and the auction arena chrome strip, so a reviewer (human or a
 * Playwright spec) can eyeball or query the whole M5 sprite set in one
 * page.
 *
 * This module is standalone: it does not import or touch `src/ui/main.ts`
 * or `src/ui/auction_screen.ts` (the walkable-scene and auction-scene
 * wiring are later workstreams' concern). `tests/playwright/
 * town_gallery.spec.mjs` bundles this file directly with esbuild and
 * injects it into the built `dist/index.html` shell, following the same
 * pattern as `terrain_gallery.ts` / `terrain_gallery.spec.mjs`.
 *
 * Fixture layout revision: see terrain_gallery.ts's module doc
 * comment for why `styleGalleryContainer()` makes the passed-in container a
 * full-viewport, opaque, fixed-position sheet.
 */

import { PALETTE } from "./palette";
import {
  TOWN_BUILDING_NAMES,
  TOWN_EXIT_DIRECTIONS,
  TOWN_BUILDING_HEIGHT,
  TOWN_DOOR_SYMBOL_ID,
  TOWN_GROUND_SYMBOL_ID,
  townBuildingSymbolId,
  townBuildingWidth,
  townExitSymbolId,
  townStoreCounterSymbolId,
  buildTownSpriteDefsMarkup,
  type TownBuildingName,
  type TownExitDirection,
} from "./sprites_town";
import { ARENA_CHROME_NAMES, arenaSymbolId, buildArenaSpriteDefsMarkup } from "./sprites_arena";
import { RESOURCES } from "../../engine/player";
import type { Resource } from "../../engine/player";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DOOR_MARKER_SIZE = 24;
const COUNTER_SWATCH_SIZE = 40;
const EXIT_MARKER_SIZE = 32;

/**
 * Render the full gallery into `container`, replacing any existing
 * content.
 *
 * @param container - Element to mount the gallery into.
 */
export function renderTownGallery(container: HTMLElement): void {
  container.innerHTML = "";
  styleGalleryContainer(container);
  container.appendChild(buildDefsHost());
  container.appendChild(buildSectionLabel("Town layout: buildings and door markers"));
  container.appendChild(buildTownLayoutSection());
  container.appendChild(buildSectionLabel("Store outfit counters"));
  container.appendChild(buildStoreCounterSection());
  container.appendChild(buildSectionLabel("Edge exits"));
  container.appendChild(buildExitSection());
  container.appendChild(buildSectionLabel("Auction arena chrome"));
  container.appendChild(buildArenaChromeSection());
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
// One hidden host <svg> holding both modules' <defs>, shared by every
// <use> reference the gallery draws below.
function buildDefsHost(): SVGSVGElement {
  const defsHost = document.createElementNS(SVG_NAMESPACE, "svg");
  defsHost.setAttribute("width", "0");
  defsHost.setAttribute("height", "0");
  defsHost.setAttribute("aria-hidden", "true");
  defsHost.style.position = "absolute";
  defsHost.innerHTML = buildTownSpriteDefsMarkup() + buildArenaSpriteDefsMarkup();
  return defsHost;
}

//============================================
// Section 1: a mocked town layout -- ground tile, all 4 buildings, each
// paired with its own door-marker overlay instance.
function buildTownLayoutSection(): HTMLElement {
  const section = document.createElement("div");
  section.setAttribute("data-gallery-section", "town-layout");
  section.style.display = "flex";
  section.style.flexWrap = "wrap";
  section.style.gap = "8px";
  section.style.alignItems = "flex-start";
  section.appendChild(buildGroundTile());
  for (const building of TOWN_BUILDING_NAMES) {
    section.appendChild(buildBuildingInstance(building));
  }
  return section;
}

//============================================
function buildGroundTile(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("width", "64");
  svg.setAttribute("height", "64");
  svg.innerHTML = `<use href="#${TOWN_GROUND_SYMBOL_ID}" />`;
  return svg;
}

//============================================
function buildBuildingInstance(building: TownBuildingName): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-building", building);
  wrapper.style.display = "inline-block";
  wrapper.appendChild(buildBuildingSvg(building));
  wrapper.appendChild(buildDoorMarkerSvg(building));
  return wrapper;
}

//============================================
function buildBuildingSvg(building: TownBuildingName): SVGSVGElement {
  const width = townBuildingWidth(building);
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${TOWN_BUILDING_HEIGHT}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(TOWN_BUILDING_HEIGHT));
  svg.innerHTML = `<use href="#${townBuildingSymbolId(building)}" />`;
  return svg;
}

//============================================
// The door marker is a separate `[data-door-for]` instance next to its
// building, not baked into the building's own symbol, matching the
// ticket's "usable as an overlay" requirement for the shared door symbol.
function buildDoorMarkerSvg(building: TownBuildingName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("data-door-for", building);
  svg.setAttribute("viewBox", `0 0 ${DOOR_MARKER_SIZE} ${DOOR_MARKER_SIZE}`);
  svg.setAttribute("width", String(DOOR_MARKER_SIZE));
  svg.setAttribute("height", String(DOOR_MARKER_SIZE));
  svg.innerHTML = `<use href="#${TOWN_DOOR_SYMBOL_ID}" />`;
  return svg;
}

//============================================
// Section 2: standalone store-counter swatches. A `<use>`'s shadow-cloned
// content isn't reachable by DOM/CSS queries, so a `[data-counter]` rect
// carries the ground-truth fill for the outfit-clarity assertion, the same
// pattern `sprite_gallery.ts`'s outfit-badge fixture uses.
function buildStoreCounterSection(): HTMLElement {
  const section = document.createElement("div");
  section.setAttribute("data-gallery-section", "town-store-counters");
  section.style.display = "flex";
  section.style.gap = "8px";
  for (const resource of RESOURCES) {
    section.appendChild(buildStoreCounterSwatch(resource));
  }
  return section;
}

//============================================
function buildStoreCounterSwatch(resource: Resource): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", `0 0 ${COUNTER_SWATCH_SIZE} ${COUNTER_SWATCH_SIZE}`);
  svg.setAttribute("width", String(COUNTER_SWATCH_SIZE));
  svg.setAttribute("height", String(COUNTER_SWATCH_SIZE));
  const fillColor = resourceCounterFill(resource);
  const groundTruthRect = `<rect data-counter="${resource}" width="${COUNTER_SWATCH_SIZE}" height="${COUNTER_SWATCH_SIZE}" fill="${fillColor}" />`;
  const counterUse = `<use href="#${townStoreCounterSymbolId(resource)}" width="${COUNTER_SWATCH_SIZE}" height="${COUNTER_SWATCH_SIZE}" />`;
  svg.innerHTML = groundTruthRect + counterUse;
  return svg;
}

//============================================
function resourceCounterFill(resource: Resource): string {
  const fills: Record<Resource, string> = {
    food: PALETTE.resourceFood,
    energy: PALETTE.resourceEnergy,
    smithore: PALETTE.resourceSmithore,
    crystite: PALETTE.resourceCrystite,
  };
  return fills[resource];
}

//============================================
// Section 3: the 4 edge-exit markers.
function buildExitSection(): HTMLElement {
  const section = document.createElement("div");
  section.setAttribute("data-gallery-section", "town-exits");
  section.style.display = "flex";
  section.style.gap = "8px";
  for (const direction of TOWN_EXIT_DIRECTIONS) {
    section.appendChild(buildExitInstance(direction));
  }
  return section;
}

//============================================
function buildExitInstance(direction: TownExitDirection): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("data-exit", direction);
  svg.setAttribute("viewBox", `0 0 ${EXIT_MARKER_SIZE} ${EXIT_MARKER_SIZE}`);
  svg.setAttribute("width", String(EXIT_MARKER_SIZE));
  svg.setAttribute("height", String(EXIT_MARKER_SIZE));
  svg.innerHTML = `<use href="#${townExitSymbolId(direction)}" />`;
  return svg;
}

//============================================
// Section 4: the auction arena chrome strip.
function buildArenaChromeSection(): HTMLElement {
  const section = document.createElement("div");
  section.setAttribute("data-gallery-section", "arena-chrome");
  section.style.display = "flex";
  section.style.flexWrap = "wrap";
  section.style.gap = "8px";
  for (const chromeName of ARENA_CHROME_NAMES) {
    section.appendChild(buildArenaChromeInstance(chromeName));
  }
  return section;
}

//============================================
function buildArenaChromeInstance(chromeName: (typeof ARENA_CHROME_NAMES)[number]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("data-arena-chrome", chromeName);
  svg.setAttribute("viewBox", "0 0 60 60");
  svg.setAttribute("width", "60");
  svg.setAttribute("height", "60");
  svg.innerHTML = `<use href="#${arenaSymbolId(chromeName)}" />`;
  return svg;
}
