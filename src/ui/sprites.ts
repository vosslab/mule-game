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
  "#ff5a5f", // player 0: coral red, ~5.6:1 on #1a1a2e
  "#4fd8ff", // player 1: cyan, ~10.2:1 on #1a1a2e
  "#3aaa18", // player 2: green, ~5.6:1 on #1a1a2e (moved off shared gold hex)
  "#f872e8", // player 3: orchid, ~7.0:1 on #1a1a2e
];

/**
 * Look up a player's identity color, so callers do not index `PLAYER_COLORS`
 * directly (which `noUncheckedIndexedAccess` types as possibly `undefined`).
 *
 * @param id - Player id, expected in range `[0, PLAYER_COLORS.length)`.
 * @returns The player's hex color string.
 */
export function playerColor(id: number): string {
  const color = PLAYER_COLORS[id];
  if (color === undefined) {
    throw new Error(`no player color for id ${id}`);
  }
  return color;
}

/** Fill color for each board terrain, chosen for mutual hue separation. */
export const TERRAIN_FILLS: Readonly<Record<Terrain, string>> = {
  plain: "#7c9a4e",
  river: "#3a7ca5",
  mountain1: "#a68a6d",
  mountain2: "#8a6f52",
  mountain3: "#5c4736",
  town: "#d9a441",
  // Scorched meteorite-crater terrain (M6 events widened the engine Terrain
  // union). Reuses the palette's dark slate token, hue-separated from the
  // mountain browns and the town gold; the art lane owns the final crater tile
  // in sprites_terrain.ts.
  crater: "#4a4a68",
};

/**
 * Fill color for each resource's outfit icon, distinct per resource.
 * Crystite temporarily reuses the smithore icon shape (see
 * `buildCrystiteIconSymbol`) with this distinct fill until a dedicated
 * crystite sprite lands with the art pass.
 */
export const RESOURCE_ICON_FILLS: Readonly<Record<Resource, string>> = {
  food: "#8fd14f",
  energy: "#ffe066",
  smithore: "#c0c0c0",
  crystite: "#ff6ec7",
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
 * - `sprite-icon-crystite`: reuses the smithore ore-chunk shape (a distinct
 *   `RESOURCE_ICON_FILLS` color tells it apart) as a placeholder until a
 *   dedicated crystite sprite lands with the art pass.
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
  markup += buildCrystiteIconSymbol();
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

//============================================
function buildCrystiteIconSymbol(): string {
  // Placeholder: same ore-chunk silhouette as smithore, distinguished by
  // RESOURCE_ICON_FILLS's fill color, until a dedicated crystite sprite
  // lands with the art pass.
  let markup = '<symbol id="sprite-icon-crystite" viewBox="0 0 16 16">';
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
