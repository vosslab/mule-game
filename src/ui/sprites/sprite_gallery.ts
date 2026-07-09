/**
 * Avatar-visibility + outfit-clarity fixture for the art
 * patch (docs/active_plans/active/mule_fidelity_plan.md,
 * docs/active_plans/active/mule_art_style_spec.md "Readability criteria").
 *
 * Renders every species avatar in all 4 player colors on both `bgDeep` and
 * `terrainPlain` backgrounds, every mule pose on the same two backgrounds,
 * and the 4-slot outfit-badge system, so a reviewer (human or a Playwright
 * spec) can eyeball or query the whole M3 sprite set in one page.
 *
 * This module is standalone: it does not import or touch `src/ui/main.ts`
 * (owned by the concurrent Solid-port UI workstream). `tests/playwright/
 * sprite_gallery.spec.mjs` bundles this file directly with esbuild and
 * injects it into the built `dist/index.html` shell, rather than adding a
 * `?demo=sprites` hook to `main.ts`.
 *
 * Fixture layout revision: see terrain_gallery.ts's module doc
 * comment for why `styleGalleryContainer()` makes the passed-in container a
 * full-viewport, opaque, fixed-position sheet.
 */

import { PALETTE } from "./palette";
import {
  SPECIES_NAMES,
  speciesSymbolId,
  buildSpeciesSpriteDefsMarkup,
  type SpeciesName,
} from "./sprites_species";
import {
  buildMuleSpriteDefsMarkup,
  muleOutfitSymbolId,
  MULE_WALK_FRAME_1_ID,
  MULE_TOWED_ID,
  MULE_INSTALLED_ID,
  MULE_ESCAPE_ID,
} from "./sprites_mule";
import { RESOURCES } from "../../engine/player";
import type { Resource } from "../../engine/player";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** The 4 player tint colors, in player-index order. */
const PLAYER_TINT_COLORS: readonly [string, string, string, string] = [
  PALETTE.player0,
  PALETTE.player1,
  PALETTE.player2,
  PALETTE.player3,
];

const AVATAR_CELL_SIZE = 32;
const BADGE_SIZE = 12;

/**
 * Render the full gallery into `container`, replacing any existing
 * content.
 *
 * @param container - Element to mount the gallery into.
 */
export function renderSpriteGallery(container: HTMLElement): void {
  container.innerHTML = "";
  styleGalleryContainer(container);
  container.appendChild(buildDefsHost());
  container.appendChild(buildSectionLabel("Species avatars (8 species x 4 player colors)"));
  container.appendChild(buildSpeciesSection());
  container.appendChild(buildSectionLabel("Mule poses and outfit badges"));
  container.appendChild(buildMuleSection());
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
  defsHost.innerHTML = buildSpeciesSpriteDefsMarkup() + buildMuleSpriteDefsMarkup();
  return defsHost;
}

//============================================
// 8 species x 4 colors = 32 `[data-species-avatar]` wrapper instances.
// Each wrapper holds 2 swatches (bgDeep, terrainPlain) so both backgrounds
// are covered without doubling the counted instance total.
function buildSpeciesSection(): HTMLElement {
  const section = document.createElement("div");
  section.setAttribute("data-gallery-section", "species");
  section.style.display = "flex";
  section.style.flexWrap = "wrap";
  section.style.gap = "8px";
  for (const species of SPECIES_NAMES) {
    for (const [colorIndex, tintColor] of PLAYER_TINT_COLORS.entries()) {
      section.appendChild(buildSpeciesAvatarInstance(species, colorIndex, tintColor));
    }
  }
  return section;
}

//============================================
function buildSpeciesAvatarInstance(
  species: SpeciesName,
  colorIndex: number,
  tintColor: string,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-species-avatar", species);
  wrapper.setAttribute("data-player-color-index", String(colorIndex));
  wrapper.style.display = "inline-block";
  wrapper.appendChild(buildTintedAvatarSwatch(species, tintColor, PALETTE.bgDeep));
  wrapper.appendChild(buildTintedAvatarSwatch(species, tintColor, PALETTE.terrainPlain));
  return wrapper;
}

//============================================
function buildTintedAvatarSwatch(
  species: SpeciesName,
  tintColor: string,
  backgroundFill: string,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", `0 0 ${AVATAR_CELL_SIZE} ${AVATAR_CELL_SIZE}`);
  svg.setAttribute("width", String(AVATAR_CELL_SIZE));
  svg.setAttribute("height", String(AVATAR_CELL_SIZE));
  const backgroundRect = `<rect width="${AVATAR_CELL_SIZE}" height="${AVATAR_CELL_SIZE}" fill="${backgroundFill}" />`;
  const avatarUse = `<use href="#${speciesSymbolId(species, 1)}" style="color: ${tintColor}" />`;
  svg.innerHTML = backgroundRect + avatarUse;
  return svg;
}

//============================================
// Every mule pose (on both backgrounds) plus the 4-slot outfit-badge row.
function buildMuleSection(): HTMLElement {
  const section = document.createElement("div");
  section.setAttribute("data-gallery-section", "mule");
  section.style.display = "flex";
  section.style.flexWrap = "wrap";
  section.style.gap = "8px";
  section.style.alignItems = "flex-start";
  section.appendChild(buildMulePoseInstance("walk", MULE_WALK_FRAME_1_ID));
  section.appendChild(buildMulePoseInstance("towed", MULE_TOWED_ID));
  section.appendChild(buildMulePoseInstance("installed", MULE_INSTALLED_ID));
  section.appendChild(buildMulePoseInstance("escape", MULE_ESCAPE_ID));
  section.appendChild(buildOutfitBadgeRow());
  return section;
}

//============================================
function buildMulePoseInstance(poseName: string, symbolId: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-mule-pose", poseName);
  wrapper.style.display = "inline-block";
  wrapper.appendChild(buildMulePoseSwatch(symbolId, PALETTE.bgDeep));
  wrapper.appendChild(buildMulePoseSwatch(symbolId, PALETTE.terrainPlain));
  return wrapper;
}

//============================================
function buildMulePoseSwatch(symbolId: string, backgroundFill: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", `0 0 ${AVATAR_CELL_SIZE} ${AVATAR_CELL_SIZE}`);
  svg.setAttribute("width", String(AVATAR_CELL_SIZE));
  svg.setAttribute("height", String(AVATAR_CELL_SIZE));
  const backgroundRect = `<rect width="${AVATAR_CELL_SIZE}" height="${AVATAR_CELL_SIZE}" fill="${backgroundFill}" />`;
  const muleUse = `<use href="#${symbolId}" style="color: ${PALETTE.player0}" />`;
  svg.innerHTML = backgroundRect + muleUse;
  return svg;
}

//============================================
// 4 outfit-badge swatches, one per resource. The `data-outfit`/`fill` rect
// lives in light DOM so a test can query it directly; the actual badge
// shape is only reachable through <use>'s shadow-cloned content, which
// DOM/CSS queries cannot select into, so the rect's `fill` is the ground
// truth the outfit-clarity assertion reads.
function buildOutfitBadgeRow(): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("data-gallery-section", "mule-outfit-badges");
  row.style.display = "flex";
  row.style.gap = "8px";
  for (const resource of RESOURCES) {
    row.appendChild(buildOutfitBadgeSwatch(resource));
  }
  return row;
}

//============================================
function buildOutfitBadgeSwatch(resource: Resource): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", `0 0 ${BADGE_SIZE} ${BADGE_SIZE}`);
  svg.setAttribute("width", String(BADGE_SIZE));
  svg.setAttribute("height", String(BADGE_SIZE));
  const fillColor = resourceBadgeFill(resource);
  const swatchRect = `<rect data-outfit="${resource}" width="${BADGE_SIZE}" height="${BADGE_SIZE}" fill="${fillColor}" />`;
  const badgeUse = `<use href="#${muleOutfitSymbolId(resource)}" width="${BADGE_SIZE}" height="${BADGE_SIZE}" />`;
  svg.innerHTML = swatchRect + badgeUse;
  return svg;
}

//============================================
function resourceBadgeFill(resource: Resource): string {
  const fills: Record<Resource, string> = {
    food: PALETTE.resourceFood,
    energy: PALETTE.resourceEnergy,
    smithore: PALETTE.resourceSmithore,
    crystite: PALETTE.resourceCrystite,
  };
  return fills[resource];
}
