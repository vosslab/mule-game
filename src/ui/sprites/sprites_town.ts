/**
 * SVG town-scene sprite defs: 4 buildings (store, pub, assay, corral), a
 * reusable door-highlight overlay, 4 edge-exit markers, and a walkable
 * ground tile, following the shape language, stroke policy, and viewBox
 * conventions in docs/active_plans/active/mule_art_style_spec.md.
 *
 * Building viewBox sizing follows the spec's "Town building" row: multiples
 * of the shared 64x64 tile unit, anchored bottom-center so buildings of
 * different footprints (`pub`/`assay` at one tile, `store`/`corral` at two)
 * sit on a common ground line when placed side by side in a walkable scene.
 *
 * The store's 4 outfit counters (food/energy/smithore/crystite) are drawn
 * as their own standalone symbols (`sprite-town-store-counter-<resource>`)
 * nested into the store symbol via `<use>`, not inlined as anonymous
 * shapes. This lets a fixture (see `town_gallery.ts`) reference and verify
 * each counter independently, the same "own symbol, referenced by `<use>`"
 * pattern `sprites_mule.ts` uses for its outfit badges. Each counter's
 * glyph (diamond/bolt/ore-chunk/gem) reuses that same shape vocabulary at
 * counter scale, so a store counter and an installed mule's outfit marker
 * read as the same resource by shape, not fill color alone -- the style
 * spec's "outfit clarity" readability criterion.
 *
 * The door marker (`sprite-town-door`) is a single shared overlay symbol,
 * not one per building: the walkable scene positions an instance at each
 * building's entry point and attaches its trigger there, per the ticket's
 * "usable as an overlay" requirement.
 */

import { PALETTE } from "./palette";
import { RESOURCES } from "../../engine/player";
import type { Resource } from "../../engine/player";

/** Shared tile edge length, matching the terrain module's grid unit. */
export const TOWN_TILE_UNIT = 64;

/** Every building's viewBox height, per the bottom-center anchoring rule. */
export const TOWN_BUILDING_HEIGHT = TOWN_TILE_UNIT;

/** Fixed set of town buildings this module draws. */
export const TOWN_BUILDING_NAMES = ["store", "pub", "assay", "corral"] as const;

export type TownBuildingName = (typeof TOWN_BUILDING_NAMES)[number];

/**
 * Each building's viewBox width, in multiples of `TOWN_TILE_UNIT`. `store`
 * and `corral` need the extra tile width to fit their counters/fence.
 */
const TOWN_BUILDING_WIDTHS: Readonly<Record<TownBuildingName, number>> = {
  store: TOWN_TILE_UNIT * 2,
  pub: TOWN_TILE_UNIT,
  assay: TOWN_TILE_UNIT,
  corral: TOWN_TILE_UNIT * 2,
};

/** Fixed set of walkable-scene edge exits this module draws. */
export const TOWN_EXIT_DIRECTIONS = ["north", "south", "east", "west"] as const;

export type TownExitDirection = (typeof TOWN_EXIT_DIRECTIONS)[number];

/** Shared door-highlight overlay symbol id, one instance reused per building. */
export const TOWN_DOOR_SYMBOL_ID = "sprite-town-door";

/** Walkable-scene ground tile symbol id. */
export const TOWN_GROUND_SYMBOL_ID = "sprite-town-ground";

/**
 * Build the symbol id for one town building, per the naming convention
 * `sprite-<domain>-<name>[-frameN]` in
 * docs/active_plans/active/mule_art_style_spec.md.
 *
 * @param building - Which building symbol to look up.
 * @returns The `<defs>` symbol id for that building.
 */
export function townBuildingSymbolId(building: TownBuildingName): string {
  return `sprite-town-${building}`;
}

/**
 * Look up a building's viewBox width, so a caller can lay out the
 * bottom-center anchor point for buildings of different footprints without
 * hardcoding the tile-multiple math itself.
 *
 * @param building - Which building's width to look up.
 * @returns The building's viewBox width in the shared tile-unit grid.
 */
export function townBuildingWidth(building: TownBuildingName): number {
  return TOWN_BUILDING_WIDTHS[building];
}

/**
 * Build the symbol id for one edge-exit marker.
 *
 * @param direction - Which edge of the walkable scene the marker sits on.
 * @returns The `<defs>` symbol id for that exit marker.
 */
export function townExitSymbolId(direction: TownExitDirection): string {
  return `sprite-town-exit-${direction}`;
}

/**
 * Build the symbol id for one store outfit-counter station.
 *
 * @param resource - Which resource's counter to look up.
 * @returns The `<defs>` symbol id for that counter.
 */
export function townStoreCounterSymbolId(resource: Resource): string {
  return `sprite-town-store-counter-${resource}`;
}

/**
 * Build the shared `<defs>` markup for the whole town scene: ground tile,
 * door overlay, 4 store-counter stations, 4 buildings, and 4 exit markers.
 *
 * @returns Raw SVG markup for a single `<defs>` element.
 */
export function buildTownSpriteDefsMarkup(): string {
  let markup = "<defs>";
  markup += buildGroundSymbol();
  markup += buildDoorSymbol();
  markup += buildStoreCounterSymbols();
  markup += buildStoreSymbol();
  markup += buildPubSymbol();
  markup += buildAssaySymbol();
  markup += buildCorralSymbol();
  markup += buildExitSymbols();
  markup += "</defs>";
  return markup;
}

//============================================
// Ground: reuses the overworld's terrainTown fill so the walkable scene
// reads as "the same town" the player saw on the map, plus a light cobble
// texture (the spec's "at most two shade steps" budget, spent as flat
// low-opacity rect overlays rather than a gradient).
function buildGroundSymbol(): string {
  let markup = `<symbol id="${TOWN_GROUND_SYMBOL_ID}" viewBox="0 0 ${TOWN_TILE_UNIT} ${TOWN_TILE_UNIT}">`;
  markup += `<rect x="0" y="0" width="${TOWN_TILE_UNIT}" height="${TOWN_TILE_UNIT}" fill="${PALETTE.terrainTown}" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  markup += cobbleMarkup(14, 44);
  markup += cobbleMarkup(34, 20);
  markup += cobbleMarkup(48, 50);
  markup += "</symbol>";
  return markup;
}

//============================================
function cobbleMarkup(x: number, y: number): string {
  return `<rect x="${x}" y="${y}" width="8" height="5" rx="2" fill="${PALETTE.bgDeep}" opacity="0.2" />`;
}

//============================================
// Door: an arch-shaped threshold glyph in `gold`, the palette's existing
// "focus rings, selection highlights" accent -- exactly the role an
// interactive entry-point marker needs. A dark inner strip suggests
// doorway depth (one shadow step, per the depth-and-shading policy).
function buildDoorSymbol(): string {
  let markup = `<symbol id="${TOWN_DOOR_SYMBOL_ID}" viewBox="0 0 24 24">`;
  markup += `<path d="M4,22 L4,10 A8,8 0 0 1 20,10 L20,22 Z" fill="${PALETTE.gold}" opacity="0.85" />`;
  markup += `<rect x="9" y="12" width="6" height="10" fill="${PALETTE.bgDeep}" opacity="0.35" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Store outfit counters: 4 small podium-plus-glyph stations, one per
// resource. See the module doc comment for why each is its own symbol.
function buildStoreCounterSymbols(): string {
  let markup = "";
  for (const resource of RESOURCES) {
    markup += buildStoreCounterSymbol(resource);
  }
  return markup;
}

//============================================
function buildStoreCounterSymbol(resource: Resource): string {
  const fillToken = resourceStationFill(resource);
  let markup = `<symbol id="${townStoreCounterSymbolId(resource)}" viewBox="0 0 20 20">`;
  markup += `<rect x="1" y="8" width="18" height="11" rx="2" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  markup += resourceGlyphMarkup(resource, 10, 8, fillToken);
  markup += "</symbol>";
  return markup;
}

//============================================
function resourceStationFill(resource: Resource): string {
  const fills: Record<Resource, string> = {
    food: PALETTE.resourceFood,
    energy: PALETTE.resourceEnergy,
    smithore: PALETTE.resourceSmithore,
    crystite: PALETTE.resourceCrystite,
  };
  return fills[resource];
}

//============================================
// Small resource glyph centered at (cx, cy): diamond, lightning bolt, ore
// chunk, gem -- the same shape vocabulary sprites_mule.ts's outfit badges
// use, recentered at counter scale, so the two contexts read as the same
// resource by shape, not fill color alone.
function resourceGlyphMarkup(
  resource: Resource,
  cx: number,
  cy: number,
  fillToken: string,
): string {
  const glyphPoints: Record<Resource, string> = {
    food: `${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`,
    energy: `${cx + 2},${cy - 6} ${cx - 3},${cy + 1} ${cx},${cy + 1} ${cx - 1},${cy + 6} ${cx + 4},${cy - 1} ${cx + 1},${cy - 1}`,
    smithore: `${cx},${cy - 6} ${cx + 5},${cy - 3} ${cx + 6},${cy + 3} ${cx + 2},${cy + 6} ${cx - 4},${cy + 5} ${cx - 6},${cy - 1}`,
    crystite: `${cx},${cy - 6} ${cx + 4},${cy - 1} ${cx},${cy + 6} ${cx - 4},${cy - 1}`,
  };
  return `<polygon points="${glyphPoints[resource]}" fill="${fillToken}" />`;
}

//============================================
// Store: 2-tile-wide building whose facade carries all 4 outfit-counter
// stations, evenly spaced.
function buildStoreSymbol(): string {
  let markup = `<symbol id="${townBuildingSymbolId("store")}" viewBox="0 0 128 ${TOWN_BUILDING_HEIGHT}">`;
  markup += `<rect x="6" y="20" width="116" height="40" rx="3" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  markup += `<polygon points="2,20 64,4 126,20" fill="${PALETTE.bgTrackAxis}" />`;
  markup += storeCounterUseMarkup("food", 14);
  markup += storeCounterUseMarkup("energy", 40);
  markup += storeCounterUseMarkup("smithore", 66);
  markup += storeCounterUseMarkup("crystite", 92);
  markup += "</symbol>";
  return markup;
}

//============================================
function storeCounterUseMarkup(resource: Resource, x: number): string {
  return `<use href="#${townStoreCounterSymbolId(resource)}" x="${x}" y="30" width="22" height="22" />`;
}

//============================================
// Pub: single-tile building with a hanging mug-shaped sign in `gold`, per
// the ticket's "readable signage silhouette" requirement.
function buildPubSymbol(): string {
  let markup = `<symbol id="${townBuildingSymbolId("pub")}" viewBox="0 0 ${TOWN_TILE_UNIT} ${TOWN_BUILDING_HEIGHT}">`;
  markup += `<rect x="8" y="24" width="48" height="36" rx="3" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  markup += `<polygon points="4,24 32,8 60,24" fill="${PALETTE.bgTrackAxis}" />`;
  markup += `<rect x="24" y="30" width="16" height="16" rx="2" fill="${PALETTE.gold}" />`;
  markup += `<path d="M40,33 a5,5 0 0 1 0,10" fill="none" stroke="${PALETTE.gold}" stroke-width="3" />`;
  markup += `<rect x="24" y="30" width="16" height="4" fill="${PALETTE.bgDeep}" opacity="0.3" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Assay: single-tile building with a balance-scale sign, a crystite gem
// (reusing the store's crystite glyph shape) sitting on one pan, per the
// ticket's "crystal/scales motif" requirement.
//
// Art gate round 3 POLISH: the pans previously sat flush against the beam
// (two lens-shaped arcs directly on a straight crossbar), reading as a pair
// of glasses rather than a scale. Each pan now hangs from its own drop line
// below the beam -- the vertical gap and visible strings are what a balance
// scale actually looks like, and what a pair of glasses (lenses on the
// bridge, no hanging strings) cannot be confused for.
function buildAssaySymbol(): string {
  let markup = `<symbol id="${townBuildingSymbolId("assay")}" viewBox="0 0 ${TOWN_TILE_UNIT} ${TOWN_BUILDING_HEIGHT}">`;
  markup += `<rect x="8" y="24" width="48" height="36" rx="3" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  markup += `<polygon points="4,24 32,8 60,24" fill="${PALETTE.bgTrackAxis}" />`;
  markup += `<rect x="31" y="26" width="2" height="8" fill="${PALETTE.bgTrackAxis}" />`;
  markup += `<line x1="20" y1="28" x2="44" y2="28" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  markup += `<line x1="20" y1="28" x2="20" y2="38" stroke="${PALETTE.bgTrackAxis}" stroke-width="1.5" />`;
  markup += `<line x1="44" y1="28" x2="44" y2="38" stroke="${PALETTE.bgTrackAxis}" stroke-width="1.5" />`;
  markup += `<path d="M14,38 a6,4 0 0 0 12,0 Z" fill="none" stroke="${PALETTE.bgTrackAxis}" stroke-width="1.5" />`;
  markup += `<path d="M38,38 a6,4 0 0 0 12,0 Z" fill="none" stroke="${PALETTE.bgTrackAxis}" stroke-width="1.5" />`;
  markup += resourceGlyphMarkup("crystite", 42, 34, PALETTE.resourceCrystite);
  markup += "</symbol>";
  return markup;
}

//============================================
// Corral: open 2-tile fence pen (no roof) with a neutral, un-tinted mule
// silhouette standing inside -- reuses sprites_mule.ts's boxy-body,
// short-legs read at corral scale, but stays un-tinted since a corral mule
// is not yet owned by any player.
function buildCorralSymbol(): string {
  let markup = `<symbol id="${townBuildingSymbolId("corral")}" viewBox="0 0 128 ${TOWN_BUILDING_HEIGHT}">`;
  markup += `<line x1="4" y1="60" x2="124" y2="60" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  markup += `<line x1="4" y1="36" x2="124" y2="36" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  markup += `<line x1="4" y1="46" x2="124" y2="46" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  for (let postX = 4; postX <= 124; postX += 20) {
    markup += `<rect x="${postX - 2}" y="30" width="4" height="30" fill="${PALETTE.bgTrackAxis}" />`;
  }
  markup += `<rect x="52" y="34" width="24" height="14" rx="2" fill="${PALETTE.terrainMountain1}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1.5" />`;
  markup += `<polygon points="76,32 84,36 76,40" fill="${PALETTE.terrainMountain1}" />`;
  markup += `<polygon points="56,28 59,34 53,34" fill="${PALETTE.terrainMountain1}" />`;
  markup += `<polygon points="60,28 63,34 57,34" fill="${PALETTE.terrainMountain1}" />`;
  markup += `<rect x="55" y="48" width="3" height="9" fill="${PALETTE.terrainMountain1}" />`;
  markup += `<rect x="62" y="48" width="3" height="9" fill="${PALETTE.terrainMountain1}" />`;
  markup += `<rect x="69" y="48" width="3" height="9" fill="${PALETTE.terrainMountain1}" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Exit markers: 4 direction-pointing chevrons on a translucent disc,
// distinguishable from each other purely by pointing direction (shape),
// not color, so all 4 stay legible for colorblind players.
function buildExitSymbols(): string {
  let markup = "";
  markup += buildExitSymbol("north", "16,4 26,24 6,24");
  markup += buildExitSymbol("south", "16,28 6,8 26,8");
  markup += buildExitSymbol("east", "28,16 8,6 8,26");
  markup += buildExitSymbol("west", "4,16 24,6 24,26");
  return markup;
}

//============================================
function buildExitSymbol(direction: TownExitDirection, arrowPoints: string): string {
  let markup = `<symbol id="${townExitSymbolId(direction)}" viewBox="0 0 32 32">`;
  markup += `<circle cx="16" cy="16" r="15" fill="${PALETTE.bgPanel}" opacity="0.7" />`;
  markup += `<polygon points="${arrowPoints}" fill="${PALETTE.textPrimary}" />`;
  markup += "</symbol>";
  return markup;
}
