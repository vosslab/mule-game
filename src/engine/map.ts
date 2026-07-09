/**
 * Map generation for the M.U.L.E. engine.
 *
 * Builds the seeded PLOT_ROWS x PLOT_COLS board: the center column is the
 * river, except the exact center plot which is the town; every other plot is
 * plain or mountain, scattered deterministically from the supplied `Rng`.
 *
 * DOM-free by design: this module only touches the `Rng` and plot types.
 */

import type { Rng } from "./rng";
import { CRYSTITE_BLOOM_COUNT, CRYSTITE_BLOOM_MAX_LEVEL, PLOT_COLS, PLOT_ROWS } from "./constants";
import type { Plot, Terrain } from "./game_state";

/** Column index of the river/town spine (center column of PLOT_COLS). */
const RIVER_COL = Math.floor(PLOT_COLS / 2);
/** Row index of the town plot (center row of PLOT_ROWS). */
const TOWN_ROW = Math.floor(PLOT_ROWS / 2);

/** Fraction of non-river plots that become mountains. */
const MOUNTAIN_CHANCE = 0.35;

/**
 * Mountain crag density tiers, weighted toward the lightest tier
 * (`mountain1`) so heavier crags stay rarer.
 */
const MOUNTAIN_TIERS: readonly Terrain[] = [
  "mountain1",
  "mountain1",
  "mountain1",
  "mountain2",
  "mountain2",
  "mountain3",
];

/**
 * Pick a terrain for a non-river, non-town plot: mostly plain, with a
 * weighted chance of one of the three mountain tiers.
 *
 * @param rng - Shared generator; each call advances its state.
 * @returns The chosen terrain for the plot.
 */
function pickLandTerrain(rng: Rng): Terrain {
  if (rng.next() >= MOUNTAIN_CHANCE) {
    return "plain";
  }
  const tierIndex = rng.nextInt(MOUNTAIN_TIERS.length);
  const tier = MOUNTAIN_TIERS[tierIndex];
  if (tier === undefined) {
    throw new Error(`pickLandTerrain: tierIndex ${tierIndex} out of range`);
  }
  return tier;
}

/**
 * Determine the terrain for a single plot position.
 *
 * @param rng - Shared generator; only advanced for non-river, non-town plots.
 * @param row - Zero-based row index.
 * @param col - Zero-based column index.
 * @returns The terrain for the given position.
 */
function pickTerrain(rng: Rng, row: number, col: number): Terrain {
  if (col === RIVER_COL) {
    return row === TOWN_ROW ? "town" : "river";
  }
  return pickLandTerrain(rng);
}

/**
 * Generate a seeded PLOT_ROWS x PLOT_COLS board.
 *
 * Column `RIVER_COL` is the river, except the center plot which is the town.
 * All other plots are plain or mountain, chosen deterministically from `rng`.
 * Every plot starts unowned with no installed M.U.L.E. Crystite blooms are
 * then seeded (`seedCrystiteBlooms`) with `crystiteRevealed: false`
 * everywhere -- the bloom levels are hidden until a player assays a plot
 * (the `assay_plot` action in turn.ts).
 *
 * @param rng - Seeded generator driving terrain scatter and bloom placement;
 *   advancing it further after this call continues the same deterministic
 *   sequence.
 * @returns A read-only PLOT_ROWS x PLOT_COLS grid, indexed `plots[row][col]`.
 */
export function generateMap(rng: Rng): Plot[][] {
  const plots: Plot[][] = [];
  for (let row = 0; row < PLOT_ROWS; row++) {
    const plotRow: Plot[] = [];
    for (let col = 0; col < PLOT_COLS; col++) {
      const terrain = pickTerrain(rng, row, col);
      plotRow.push({
        terrain,
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      });
    }
    plots.push(plotRow);
  }
  seedCrystiteBlooms(rng, plots);
  return plots;
}

/**
 * Clamp a computed crystite level into the `Plot.crystiteLevel` union,
 * failing loudly if a caller ever passes a value outside the expected
 * range. This engine seeds no level-4 blooms yet -- that tier only comes
 * from the meteorite colony event, out of scope for this workstream (see
 * `CRYSTITE_BLOOM_MAX_LEVEL`'s doc comment in constants.ts).
 *
 * @param level - Computed level, expected in [0, CRYSTITE_BLOOM_MAX_LEVEL].
 * @returns The same value, narrowed to the `Plot.crystiteLevel` union.
 */
function toCrystiteLevel(level: number): Plot["crystiteLevel"] {
  if (level < 0 || level > CRYSTITE_BLOOM_MAX_LEVEL) {
    throw new Error(`toCrystiteLevel: ${level} out of range [0, ${CRYSTITE_BLOOM_MAX_LEVEL}]`);
  }
  return level as Plot["crystiteLevel"];
}

/**
 * Pick a random land plot (not river, not town) to be a crystite bloom's
 * center, rerolling if the chosen plot's crystite level has already hit
 * `CRYSTITE_BLOOM_MAX_LEVEL`. Mirrors the retry-until-valid loop in
 * planet_mule's `PlanetMapGenerator.generateCrystite`, which rerolls only on
 * the picked tile's own crystite level (Source:
 * `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/PlanetMapGenerator.java`
 * lines 172-190: `while ((planetTile = ...).getCrystite() >= 3) {}`). This
 * engine also excludes river and town from the candidate set up front: PM's
 * `PlanetTileType.allow` (`PlanetTile.java` lines 322-329) already denies
 * crystite yield on river tiles, and this engine additionally denies it on
 * town (see `zeroRiverAndTownCrystite` below), so centering a bloom on
 * either would only waste seeded area whose readings get zeroed anyway. See
 * docs/RULE_SOURCES.md, "Crystite bloom seeding" for the full adjudication.
 *
 * @param rng - Shared generator; each reroll advances its state.
 * @param plots - Board grid being generated, indexed as `plots[row][col]`.
 * @returns The chosen center's row and column.
 */
function pickCrystiteBloomCenter(rng: Rng, plots: readonly Plot[][]): { row: number; col: number } {
  for (;;) {
    const row = rng.nextInt(PLOT_ROWS);
    const col = rng.nextInt(PLOT_COLS);
    const plotRow = plots[row];
    if (plotRow === undefined) {
      throw new Error(`pickCrystiteBloomCenter: row ${row} out of range`);
    }
    const plot = plotRow[col];
    if (plot === undefined) {
      throw new Error(`pickCrystiteBloomCenter: col ${col} out of range`);
    }
    if (plot.terrain === "river" || plot.terrain === "town") {
      continue;
    }
    if (plot.crystiteLevel >= CRYSTITE_BLOOM_MAX_LEVEL) {
      continue;
    }
    return { row, col };
  }
}

/**
 * Raise every plot's crystite level toward a bloom centered at
 * `(centerRow, centerCol)`: `level = max(CRYSTITE_BLOOM_MAX_LEVEL -
 * manhattanDistance, 0)`, only overwriting when the new level is higher than
 * what the plot already carries, so overlapping blooms keep the max rather
 * than stacking additively. Mutates `plots` in place; callers own the
 * board's brief mutability window during generation (see `generateMap`).
 * Source: `PlanetMapGenerator.generateCrystite`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/PlanetMapGenerator.java`
 * lines 172-190): `n7 = max(3 - manhattanDistance, 0)`;
 * `if (n7 <= planetTile.getCrystite()) continue; planetTile.setCrystite(n7)`.
 *
 * Exported so tests can exercise the ring math directly against a
 * controlled board, without depending on RNG-driven center placement.
 *
 * @param plots - Board grid being generated, mutated in place.
 * @param centerRow - Row of the bloom's center plot.
 * @param centerCol - Column of the bloom's center plot.
 */
export function applyCrystiteBloomRing(
  plots: Plot[][],
  centerRow: number,
  centerCol: number,
): void {
  for (let row = 0; row < PLOT_ROWS; row++) {
    for (let col = 0; col < PLOT_COLS; col++) {
      const distance = Math.abs(row - centerRow) + Math.abs(col - centerCol);
      const level = toCrystiteLevel(Math.max(CRYSTITE_BLOOM_MAX_LEVEL - distance, 0));
      const plotRow = plots[row];
      if (plotRow === undefined) {
        throw new Error(`applyCrystiteBloomRing: row ${row} out of range`);
      }
      const plot = plotRow[col];
      if (plot === undefined) {
        throw new Error(`applyCrystiteBloomRing: col ${col} out of range`);
      }
      if (level > plot.crystiteLevel) {
        plotRow[col] = { ...plot, crystiteLevel: level };
      }
    }
  }
}

/**
 * Zero the crystite level on every river and town plot, regardless of what
 * bloom seeding computed for them. planet_mule gates crystite yield off on
 * river tiles at the terrain-type level (`PlanetTile.PlanetTileType.allow`,
 * `PlanetTile.java` lines 322-329) rather than zeroing the stored field, and
 * does not gate the town/Shop tile at all (`allow` defaults to true there).
 * This engine has no parallel per-type yield gate, so it zeroes both river
 * and town directly at generation time to match PM's effective behavior:
 * river never yields crystite, and town is never developed, so a nonzero
 * reading there would be a display-only artifact with no gameplay meaning.
 * See docs/RULE_SOURCES.md, "Crystite bloom seeding" for the full
 * adjudication.
 *
 * @param plots - Board grid being generated, mutated in place.
 */
function zeroRiverAndTownCrystite(plots: Plot[][]): void {
  for (const plotRow of plots) {
    for (let col = 0; col < plotRow.length; col++) {
      const plot = plotRow[col];
      if (plot === undefined) {
        continue;
      }
      if ((plot.terrain === "river" || plot.terrain === "town") && plot.crystiteLevel !== 0) {
        plotRow[col] = { ...plot, crystiteLevel: 0 };
      }
    }
  }
}

/**
 * Seed `CRYSTITE_BLOOM_COUNT` crystite blooms onto a generated board,
 * mutating `plots` in place. Called once, after terrain generation, from
 * `generateMap`. See `pickCrystiteBloomCenter`, `applyCrystiteBloomRing`,
 * and `zeroRiverAndTownCrystite` for the per-step source citations.
 *
 * @param rng - Shared generator driving bloom center selection.
 * @param plots - Board grid being generated, mutated in place.
 */
function seedCrystiteBlooms(rng: Rng, plots: Plot[][]): void {
  for (let bloomIndex = 0; bloomIndex < CRYSTITE_BLOOM_COUNT; bloomIndex++) {
    const center = pickCrystiteBloomCenter(rng, plots);
    applyCrystiteBloomRing(plots, center.row, center.col);
  }
  zeroRiverAndTownCrystite(plots);
}

/**
 * Look up the terrain of a plot at a given position.
 *
 * @param plots - Grid returned by `generateMap`.
 * @param row - Zero-based row index.
 * @param col - Zero-based column index.
 * @returns The terrain at `plots[row][col]`.
 */
export function terrainOf(plots: readonly (readonly Plot[])[], row: number, col: number): Terrain {
  const plotRow = plots[row];
  if (plotRow === undefined) {
    throw new Error(`terrainOf: row ${row} out of range`);
  }
  const plot = plotRow[col];
  if (plot === undefined) {
    throw new Error(`terrainOf: col ${col} out of range`);
  }
  return plot.terrain;
}
