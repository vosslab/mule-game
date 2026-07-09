/**
 * Terrain-distinguishability fixture for the art patch
 * (docs/active_plans/active/mule_fidelity_plan.md,
 * docs/active_plans/active/mule_art_style_spec.md "Readability criteria").
 *
 * Renders every terrain tile in a side-by-side adjacency strip, plus a 3x3
 * patch where every orthogonally adjacent pair of cells is a different
 * terrain (mirroring the "no two same-terrain tiles necessarily touch"
 * shape a real generated map can produce), so a reviewer (human or a
 * Playwright spec) can eyeball or query tile-to-tile distinguishability in
 * one page.
 *
 * This module is standalone: it does not import or touch `src/ui/main.ts`
 * (owned by the concurrent Solid-port UI workstream, and the map-renderer
 * reskin wiring is deferred to a follow-up patch per this workstream's
 * ticket). `tests/playwright/terrain_gallery.spec.mjs` bundles this file
 * directly with esbuild and injects it into the already-built
 * `dist/index.html` shell, following the same pattern as
 * `src/ui/sprites/sprite_gallery.ts` / `tests/playwright/sprite_gallery.spec.mjs`.
 *
 * Fixture layout revision: the capture script injects this
 * gallery's container as a plain appended <div>, sitting alongside the live
 * title screen's `#app` root rather than replacing it. Earlier revisions
 * left that container unstyled, so its content rendered wherever normal
 * document flow put it -- crammed small, behind the title screen's text.
 * `styleGalleryContainer()` now makes the passed-in container a full-
 * viewport, opaque, fixed-position sheet so a reviewer or a screenshot sees
 * only this gallery's own content.
 */

import { PALETTE } from "./palette";
import {
  TERRAIN_NAMES,
  terrainSymbolId,
  buildTerrainSpriteDefsMarkup,
  type TerrainName,
} from "./sprites_terrain";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const TILE_CELL_SIZE = 64;

/**
 * 3x3 mixed-neighbor patch layout. Every orthogonally adjacent pair (every
 * horizontal and vertical neighbor) uses a different terrain, so the fixture
 * can assert shape/symbol-based distinguishability between tiles that can
 * actually sit next to each other on a rendered map -- including the
 * mountain-tier pairs the style spec flags as needing a non-color signal.
 */
const MIXED_PATCH_GRID: readonly (readonly TerrainName[])[] = [
  ["plain", "river", "mountain1"],
  ["town", "crater", "mountain2"],
  ["mountain3", "plain", "river"],
];

/**
 * Render the full gallery into `container`, replacing any existing content.
 *
 * @param container - Element to mount the gallery into.
 */
export function renderTerrainGallery(container: HTMLElement): void {
  container.innerHTML = "";
  styleGalleryContainer(container);
  container.appendChild(buildDefsHost());
  container.appendChild(buildSectionLabel("Terrain adjacency strip"));
  container.appendChild(buildAdjacencyStrip());
  container.appendChild(buildSectionLabel("Mixed-neighbor 3x3 patch"));
  container.appendChild(buildMixedNeighborPatch());
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
// One hidden host <svg> holding the terrain module's <defs>, shared by every
// <use> reference the gallery draws below.
function buildDefsHost(): SVGSVGElement {
  const defsHost = document.createElementNS(SVG_NAMESPACE, "svg");
  defsHost.setAttribute("width", "0");
  defsHost.setAttribute("height", "0");
  defsHost.setAttribute("aria-hidden", "true");
  defsHost.style.position = "absolute";
  defsHost.innerHTML = buildTerrainSpriteDefsMarkup();
  return defsHost;
}

//============================================
// Row 1: all 7 tiles side by side, so adjacency readability can be eyeballed
// across the whole tile set in one strip.
function buildAdjacencyStrip(): HTMLElement {
  const strip = document.createElement("div");
  strip.setAttribute("data-gallery-section", "terrain-adjacency-strip");
  strip.style.display = "flex";
  strip.style.flexWrap = "wrap";
  strip.style.gap = "8px";
  for (const terrain of TERRAIN_NAMES) {
    strip.appendChild(buildTerrainTile(terrain));
  }
  return strip;
}

//============================================
// Row 2: the 3x3 mixed-neighbor patch defined in MIXED_PATCH_GRID.
function buildMixedNeighborPatch(): HTMLElement {
  const patch = document.createElement("div");
  patch.setAttribute("data-gallery-section", "terrain-mixed-patch");
  patch.style.display = "grid";
  patch.style.gridTemplateColumns = `repeat(3, ${TILE_CELL_SIZE}px)`;
  for (const row of MIXED_PATCH_GRID) {
    for (const terrain of row) {
      patch.appendChild(buildTerrainTile(terrain));
    }
  }
  return patch;
}

//============================================
function buildTerrainTile(terrain: TerrainName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", `0 0 ${TILE_CELL_SIZE} ${TILE_CELL_SIZE}`);
  svg.setAttribute("width", String(TILE_CELL_SIZE));
  svg.setAttribute("height", String(TILE_CELL_SIZE));
  svg.setAttribute("data-terrain", terrain);
  svg.innerHTML = `<use href="#${terrainSymbolId(terrain)}" />`;
  return svg;
}
