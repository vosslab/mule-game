/**
 * SVG terrain-tile sprite defs: one 64x64 `<symbol>` per board terrain,
 * following the shape language, stroke policy, and depth-and-shading policy
 * in docs/active_plans/active/mule_art_style_spec.md.
 *
 * `TerrainName` is a local 7-value set (adds `crater` to the engine's
 * current `Terrain` union in src/engine/game_state.ts), not an import of
 * that engine type. `crater` is the meteorite-event scar tile named in this
 * workstream's ticket; the engine does not seed it yet (that lands with the
 * meteorite colony event's own workstream), so this module intentionally
 * does not couple to `Terrain` until the engine catches up. This is the
 * forward-looking `data-terrain` selector contract the ticket references:
 * `terrainSymbolId` and `buildTerrainSpriteDefsMarkup` are ready for a
 * future map-renderer wiring patch to consume without another rename.
 *
 * Every fill/stroke is a `PALETTE` token (see palette.ts); no new hex
 * literals are introduced (`tests/test_sprite_palette.mjs` enforces this).
 * Tile-to-tile distinguishability (the spec's "terrain distinguishability"
 * readability criterion) comes from shape, not color alone: the three
 * mountain tiers are told apart by countable peaks (1/2/3), town by a
 * building cluster silhouette, crater by its rim-and-glint silhouette, river
 * by ripple bands, and plain by grass-tuft texture -- so two adjacent tiles
 * of similar lightness (for example `terrainMountain2` next to
 * `terrainMountain3`) still read as different tiles by outline alone.
 */

import { PALETTE } from "./palette";

/** Tile edge length in the shared 64x64 terrain viewBox. */
const TILE_SIZE = 64;

/**
 * Fixed set of terrain tile names this module draws. See the module
 * doc comment for why this does not reuse the engine's `Terrain` union.
 */
export const TERRAIN_NAMES = [
  "plain",
  "river",
  "mountain1",
  "mountain2",
  "mountain3",
  "town",
  "crater",
] as const;

export type TerrainName = (typeof TERRAIN_NAMES)[number];

/**
 * Build the symbol id for one terrain tile, per the naming convention
 * `sprite-<domain>-<name>[-frameN]` in
 * docs/active_plans/active/mule_art_style_spec.md.
 *
 * @param terrain - Which terrain symbol to look up.
 * @returns The `<defs>` symbol id for that terrain.
 */
export function terrainSymbolId(terrain: TerrainName): string {
  return `sprite-terrain-${terrain}`;
}

/**
 * Build the shared `<defs>` markup for every terrain tile: 7 symbols, each a
 * flat, stroke-outlined 64x64 tile.
 *
 * @returns Raw SVG markup for a single `<defs>` element.
 */
export function buildTerrainSpriteDefsMarkup(): string {
  let markup = "<defs>";
  markup += buildPlainSymbol();
  markup += buildRiverSymbol();
  markup += buildMountainSymbol(1);
  markup += buildMountainSymbol(2);
  markup += buildMountainSymbol(3);
  markup += buildTownSymbol();
  markup += buildCraterSymbol();
  markup += "</defs>";
  return markup;
}

//============================================
// Full-tile base rect shared by every terrain symbol: fills the whole 64x64
// viewBox with the tile's own color and outlines the tile edge with
// `bgTrackAxis`, the same fixed structural stroke color the actor-scale
// species/mule sprites already use for their outer silhouette (the spec's
// "darkened variant of the shape's own fill hue" guidance has no per-terrain
// dark variant available in PALETTE, so this reuses that established
// fixed-stroke idiom rather than inventing a new hex).
function tileBaseRectMarkup(fillToken: string): string {
  return `<rect x="0" y="0" width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${fillToken}" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
}

//============================================
// Plain: grass-tuft texture. Each tuft pairs a dark shadow blade
// (`bgDeep` at low opacity) with a light highlight blade (`textPrimary` at
// low opacity) -- the spec's "at most two shade steps" budget, spent here as
// small flat polygon overlays rather than a gradient.
function buildPlainSymbol(): string {
  let markup = `<symbol id="${terrainSymbolId("plain")}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}">`;
  markup += tileBaseRectMarkup(PALETTE.terrainPlain);
  markup += grassTuftMarkup(10, 46);
  markup += grassTuftMarkup(28, 20);
  markup += grassTuftMarkup(46, 50);
  markup += grassTuftMarkup(52, 16);
  markup += "</symbol>";
  return markup;
}

//============================================
function grassTuftMarkup(x: number, y: number): string {
  let markup = "";
  markup += `<polygon points="${x - 4},${y + 6} ${x},${y - 6} ${x + 1},${y + 6}" fill="${PALETTE.bgDeep}" opacity="0.3" />`;
  markup += `<polygon points="${x},${y + 6} ${x + 4},${y - 5} ${x + 5},${y + 6}" fill="${PALETTE.textPrimary}" opacity="0.15" />`;
  return markup;
}

//============================================
// River: flowing-water suggestion via thin wavy bands (flat polygons, not
// stroked paths, to stay inside the shape-overlay depth policy). Single
// frame only -- the spec calls the 2-frame shimmer optional, and this
// workstream's scope is the tile art plus fixture, not animation wiring.
function buildRiverSymbol(): string {
  let markup = `<symbol id="${terrainSymbolId("river")}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}">`;
  markup += tileBaseRectMarkup(PALETTE.terrainRiver);
  markup += rippleBandMarkup(16);
  markup += rippleBandMarkup(34);
  markup += rippleBandMarkup(50);
  markup += "</symbol>";
  return markup;
}

//============================================
function rippleBandMarkup(y: number): string {
  const points =
    `4,${y} 20,${y - 3} 36,${y} 52,${y - 3} 60,${y} ` +
    `60,${y + 2} 52,${y - 1} 36,${y + 2} 20,${y - 1} 4,${y + 2}`;
  return `<polygon points="${points}" fill="${PALETTE.textPrimary}" opacity="0.25" />`;
}

//============================================
// Mountain tiers: the density-tier fill (`terrainMountain1/2/3`) covers the
// tile as the dominant color, and the peak count (1/2/3, matching the
// engine's `pickLandTerrain` tier ordering in src/engine/map.ts) is the
// second, color-independent signal the spec's terrain-distinguishability
// criterion asks for. Known risk (per the style spec's contrast table):
// `terrainMountain3` fails the 3:1 non-text minimum against `bgDeep`, but
// map tiles render edge-to-edge against other tiles, not against the app
// background, so the 3-peak silhouette is what keeps a mountain3 tile
// distinguishable from a mountain2 or plain neighbor, not fill contrast
// alone.
const MOUNTAIN_FILLS: Readonly<Record<1 | 2 | 3, string>> = {
  1: PALETTE.terrainMountain1,
  2: PALETTE.terrainMountain2,
  3: PALETTE.terrainMountain3,
};

const MOUNTAIN_PEAK_X_POSITIONS: Readonly<Record<1 | 2 | 3, readonly number[]>> = {
  1: [32],
  2: [22, 42],
  3: [16, 32, 48],
};

//============================================
function buildMountainSymbol(tier: 1 | 2 | 3): string {
  const terrainName = `mountain${tier}` as TerrainName;
  const fillToken = MOUNTAIN_FILLS[tier];
  let markup = `<symbol id="${terrainSymbolId(terrainName)}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}">`;
  markup += tileBaseRectMarkup(fillToken);
  for (const peakX of MOUNTAIN_PEAK_X_POSITIONS[tier]) {
    markup += mountainPeakMarkup(peakX, fillToken);
  }
  markup += "</symbol>";
  return markup;
}

//============================================
function mountainPeakMarkup(peakX: number, fillToken: string): string {
  let markup = "";
  markup += `<polygon points="${peakX - 12},52 ${peakX},14 ${peakX + 12},52" fill="${fillToken}" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  // Shadow facet on the right slope, highlight facet on the left slope near
  // the peak -- the spec's one-shadow-plus-one-highlight budget.
  markup += `<polygon points="${peakX},14 ${peakX + 12},52 ${peakX + 4},52 ${peakX - 2},22" fill="${PALETTE.bgDeep}" opacity="0.25" />`;
  markup += `<polygon points="${peakX - 6},30 ${peakX},14 ${peakX + 2},22 ${peakX - 4},34" fill="${PALETTE.textPrimary}" opacity="0.2" />`;
  return markup;
}

//============================================
// Town: a small building cluster (three rounded structures of different
// heights) plus a landing-pad badge, reading as "settlement" without
// literal detail.
function buildTownSymbol(): string {
  let markup = `<symbol id="${terrainSymbolId("town")}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}">`;
  markup += tileBaseRectMarkup(PALETTE.terrainTown);
  markup += buildingMarkup(10, 30, 14, 26);
  markup += buildingMarkup(26, 20, 16, 36);
  markup += buildingMarkup(44, 34, 12, 22);
  markup += `<circle cx="32" cy="58" r="4" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
function buildingMarkup(x: number, y: number, width: number, height: number): string {
  let markup = "";
  markup += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="2" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  const roofPeakX = x + width / 2;
  markup += `<polygon points="${x - 2},${y} ${roofPeakX},${y - 10} ${x + width + 2},${y}" fill="${PALETTE.bgTrackAxis}" />`;
  return markup;
}

//============================================
// Crater: meteorite scar. A dark rim-and-bowl silhouette (reusing the
// structural `bgPanel`/`bgDeep`/`bgTrackAxis` tokens, since no dedicated
// crater fill exists in PALETTE) with small crystite-colored glint diamonds
// scattered in the bowl -- the "subtle crystite glint" the ticket asks for,
// tying the tile visually to the meteorite event that creates it.
function buildCraterSymbol(): string {
  let markup = `<symbol id="${terrainSymbolId("crater")}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}">`;
  markup += tileBaseRectMarkup(PALETTE.bgPanel);
  markup += `<circle cx="32" cy="32" r="22" fill="none" stroke="${PALETTE.bgTrackAxis}" stroke-width="3" opacity="0.6" />`;
  markup += `<circle cx="32" cy="32" r="16" fill="${PALETTE.bgDeep}" opacity="0.5" />`;
  markup += crystiteGlintMarkup(26, 28);
  markup += crystiteGlintMarkup(38, 36);
  markup += crystiteGlintMarkup(30, 40);
  markup += "</symbol>";
  return markup;
}

//============================================
function crystiteGlintMarkup(x: number, y: number): string {
  return `<polygon points="${x},${y - 3} ${x + 3},${y} ${x},${y + 3} ${x - 3},${y}" fill="${PALETTE.resourceCrystite}" opacity="0.8" />`;
}
