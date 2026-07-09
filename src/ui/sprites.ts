/**
 * SVG sprite defs and shared color palettes for the map and HUD renderers.
 *
 * Every sprite is an original, simple, silhouette-inspired flat shape --
 * mechanical readability is the goal, not imitation of any specific game's
 * art. All sprites live in one `<defs>` block (`buildSpriteDefsMarkup`) so
 * `map_render.ts` can inline them once and reference them by id with
 * `<use href="#sprite-id">`.
 */

import type { Resource } from "../engine/player";
import type { Terrain } from "../engine/game_state";

/**
 * Fixed 4-player color palette. Chosen for hue separation from each other
 * and from every terrain fill in `TERRAIN_FILLS`, and checked against
 * `docs/COLOR_CONTRAST_ACCESSIBILITY.md`'s 5.5:1 house target when drawn as
 * text on the `#1a1a2e` app background (see the ratios noted per color
 * below; ratios computed via the WCAG relative-luminance formula).
 */
export const PLAYER_COLORS: readonly [string, string, string, string] = [
  "#ff5a5f", // player 0: coral red, ~5.7:1 on #1a1a2e
  "#4fd8ff", // player 1: cyan, ~10.9:1 on #1a1a2e
  "#ffd23f", // player 2: gold, ~13.9:1 on #1a1a2e
  "#c77dff", // player 3: violet, ~6.4:1 on #1a1a2e
];

/** Fill color for each board terrain, chosen for mutual hue separation. */
export const TERRAIN_FILLS: Readonly<Record<Terrain, string>> = {
  plain: "#7c9a4e",
  river: "#3a7ca5",
  mountain1: "#a68a6d",
  mountain2: "#8a6f52",
  mountain3: "#5c4736",
  town: "#d9a441",
};

/** Fill color for each resource's outfit icon, distinct per resource. */
export const RESOURCE_ICON_FILLS: Readonly<Record<Resource, string>> = {
  food: "#8fd14f",
  energy: "#ffe066",
  smithore: "#c0c0c0",
};

/**
 * Build the shared `<defs>` markup: one reusable symbol per sprite, keyed by
 * id so callers reference them with `<use href="#sprite-...">`.
 *
 * - `sprite-mule`: M.U.L.E. walker, a boxy quadruped silhouette on short legs.
 * - `sprite-player`: standing player figure, a round head over a triangular
 *   body, used for the HUD player badges.
 * - `sprite-icon-food`, `sprite-icon-energy`, `sprite-icon-smithore`: small
 *   glyphs (leaf, bolt, ore chunk) distinguishable at map scale.
 *
 * @returns Raw SVG markup for a single `<defs>` element.
 */
export function buildSpriteDefsMarkup(): string {
  let markup = "<defs>";
  markup += buildMuleSymbol();
  markup += buildPlayerSymbol();
  markup += buildFoodIconSymbol();
  markup += buildEnergyIconSymbol();
  markup += buildSmithoreIconSymbol();
  markup += "</defs>";
  return markup;
}

//============================================
function buildMuleSymbol(): string {
  // Boxy body on four short legs with two ear triangles: a flat silhouette
  // read as "pack animal" at small map scale without literal imitation.
  let markup = '<symbol id="sprite-mule" viewBox="0 0 32 32">';
  markup += '<rect x="6" y="12" width="20" height="10" rx="2" />';
  markup += '<polygon points="24,10 30,13 24,16" />';
  markup += '<polygon points="9,7 12,12 6,12" />';
  markup += '<polygon points="13,7 16,12 10,12" />';
  markup += '<rect x="8" y="21" width="3" height="7" />';
  markup += '<rect x="14" y="21" width="3" height="7" />';
  markup += '<rect x="20" y="21" width="3" height="7" />';
  markup += "</symbol>";
  return markup;
}

//============================================
function buildPlayerSymbol(): string {
  // Round head over a triangular body: a flat, genderless standing figure.
  let markup = '<symbol id="sprite-player" viewBox="0 0 24 32">';
  markup += '<circle cx="12" cy="7" r="6" />';
  markup += '<polygon points="12,14 22,30 2,30" />';
  markup += "</symbol>";
  return markup;
}

//============================================
function buildFoodIconSymbol(): string {
  // Simple leaf: two curved-looking triangles forming a pointed oval.
  let markup = '<symbol id="sprite-icon-food" viewBox="0 0 16 16">';
  markup += '<polygon points="8,1 15,8 8,15 1,8" />';
  markup += "</symbol>";
  return markup;
}

//============================================
function buildEnergyIconSymbol(): string {
  // Lightning bolt: a jagged zigzag polygon.
  let markup = '<symbol id="sprite-icon-energy" viewBox="0 0 16 16">';
  markup += '<polygon points="9,0 3,9 7,9 6,16 13,6 9,6" />';
  markup += "</symbol>";
  return markup;
}

//============================================
function buildSmithoreIconSymbol(): string {
  // Ore chunk: an irregular hexagon reading as a rough mineral nugget.
  let markup = '<symbol id="sprite-icon-smithore" viewBox="0 0 16 16">';
  markup += '<polygon points="8,0 14,4 16,11 10,16 3,14 0,6" />';
  markup += "</symbol>";
  return markup;
}

/**
 * Look up the resource-icon symbol id for a resource, so callers building a
 * `<use>` reference do not hardcode the `sprite-icon-...` naming scheme.
 *
 * @param resource - Resource to look up.
 * @returns The `<defs>` symbol id for that resource's icon.
 */
export function resourceIconSymbolId(resource: Resource): string {
  return `sprite-icon-${resource}`;
}
