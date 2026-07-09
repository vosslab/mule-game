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
import { PLOT_COLS, PLOT_ROWS } from "./constants";
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
 * Every plot starts unowned with no installed M.U.L.E.
 *
 * @param rng - Seeded generator driving terrain scatter; advancing it further
 *   after this call continues the same deterministic sequence.
 * @returns A read-only PLOT_ROWS x PLOT_COLS grid, indexed `plots[row][col]`.
 */
export function generateMap(rng: Rng): Plot[][] {
  const plots: Plot[][] = [];
  for (let row = 0; row < PLOT_ROWS; row++) {
    const plotRow: Plot[] = [];
    for (let col = 0; col < PLOT_COLS; col++) {
      const terrain = pickTerrain(rng, row, col);
      plotRow.push({ terrain, owner: null, muleOutfit: null });
    }
    plots.push(plotRow);
  }
  return plots;
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
