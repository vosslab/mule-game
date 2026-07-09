/**
 * Pure production and spoilage functions for the M.U.L.E. engine.
 *
 * Everything here is a pure function over its arguments: no mutation, no
 * DOM, no module-level state. Callers pass in the current board and player
 * list and get back new per-player resource records.
 */

import type { Player, Resource } from "./player";
import type { Plot } from "./game_state";
import {
  ADJACENCY_BONUS_PER_NEIGHBOR,
  ENERGY_DECAY_RATE,
  ENERGY_PER_MULE,
  ENERGY_UPKEEP_BASE,
  ENERGY_UPKEEP_PER_ROUND,
  FOOD_SPOILAGE_RATE,
  FOOD_UPKEEP_BASE,
  FOOD_UPKEEP_PER_ROUND,
  SMITHORE_DECAY_RATE,
  YIELD_TABLE_BY_RESOURCE,
} from "./constants";

/** Per-player resource totals, keyed the same way as `Player.goods`. */
export type ResourceRecord = Record<Resource, number>;

/**
 * Count of orthogonally adjacent plots (up/down/left/right) that are owned
 * by `owner` and outfitted for the same `resource` as the plot at
 * (row, col). Used to compute the adjacency clustering bonus.
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param row - Row of the plot being scored.
 * @param col - Column of the plot being scored.
 * @param owner - Owning player index to match against neighbors.
 * @param resource - Outfit resource to match against neighbors.
 * @returns Number of matching same-owner, same-outfit neighbors (0 to 4).
 */
function countMatchingNeighbors(
  plots: readonly (readonly Plot[])[],
  row: number,
  col: number,
  owner: number,
  resource: Resource,
): number {
  const deltas: readonly [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  let matches = 0;
  for (const [rowDelta, colDelta] of deltas) {
    const neighborRow = row + rowDelta;
    const neighborCol = col + colDelta;
    const neighborRowPlots = plots[neighborRow];
    if (neighborRowPlots === undefined) {
      continue;
    }
    const neighbor = neighborRowPlots[neighborCol];
    if (neighbor === undefined) {
      continue;
    }
    if (neighbor.owner === owner && neighbor.muleOutfit === resource) {
      matches += 1;
    }
  }
  return matches;
}

/**
 * Base yield (before adjacency bonus) of a single installed M.U.L.E.
 * outfitted for `resource` on the given `terrain`. Terrain/resource pairs
 * absent from the yield table (for example smithore on a river plot)
 * produce zero.
 *
 * @param terrain - Plot terrain.
 * @param resource - Resource the installed M.U.L.E. is outfitted for.
 * @returns Base yield in units for one round.
 */
function baseYield(terrain: Plot["terrain"], resource: Resource): number {
  const yieldTable = YIELD_TABLE_BY_RESOURCE[resource];
  const terrainYield = yieldTable[terrain];
  if (terrainYield === undefined) {
    return 0;
  }
  return terrainYield;
}

/**
 * Compute each player's total production for one round, applying terrain
 * base yields, the same-outfit adjacency bonus, and the energy-shortfall
 * penalty (a player who cannot power every installed M.U.L.E. leaves the
 * unpowered ones idle for the round, contributing zero).
 *
 * Unpowered plots are chosen deterministically: plots are powered in
 * row-major board order until the player's available energy runs out, so
 * the same board and player state always yields the same result.
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param players - All players in the game.
 * @param _round - Current round number (reserved for round-scaled yield
 *   rules; the beginner-game yield tables are round-independent, so this
 *   is currently unused but kept in the signature per the API contract).
 * @returns One resource record per player, in `players` order.
 */
export function computeProduction(
  plots: readonly (readonly Plot[])[],
  players: readonly Player[],
  _round: number,
): ResourceRecord[] {
  // Track remaining energy budget per player, starting from their current
  // inventory, so mules are powered in board order until energy runs out.
  const remainingEnergy = players.map((player) => player.goods.energy);

  const totals: ResourceRecord[] = players.map(() => ({
    food: 0,
    energy: 0,
    smithore: 0,
  }));

  for (const [row, rowPlots] of plots.entries()) {
    for (const [col, plot] of rowPlots.entries()) {
      if (plot.owner === null || plot.muleOutfit === null) {
        continue;
      }
      const owner = plot.owner;
      const resource = plot.muleOutfit;

      // Energy-shortfall penalty: this mule only produces if the owner
      // still has enough banked energy to power it this round.
      const ownerRemainingEnergy = remainingEnergy[owner];
      if (ownerRemainingEnergy === undefined || ownerRemainingEnergy < ENERGY_PER_MULE) {
        continue;
      }
      remainingEnergy[owner] = ownerRemainingEnergy - ENERGY_PER_MULE;

      const neighborBonus =
        countMatchingNeighbors(plots, row, col, owner, resource) * ADJACENCY_BONUS_PER_NEIGHBOR;
      const produced = baseYield(plot.terrain, resource) + neighborBonus;
      const ownerTotals = totals[owner];
      if (ownerTotals === undefined) {
        continue;
      }
      ownerTotals[resource] += produced;
    }
  }

  return totals;
}

/**
 * Apply per-round upkeep consumption, then spoilage/decay to any surplus
 * left over, for a single player's resource record. Upkeep is deducted
 * first and never goes negative (a shortfall is simply zero remaining, not
 * a debt); spoilage/decay then reduces whatever surplus remains above what
 * upkeep needed.
 *
 * @param goods - Player's resource record before upkeep and spoilage.
 * @param round - Current round number, since food and energy upkeep both
 *   grow with round number.
 * @returns New resource record after upkeep and spoilage are applied.
 */
export function applySpoilage(goods: ResourceRecord, round: number): ResourceRecord {
  const foodUpkeep = FOOD_UPKEEP_BASE + FOOD_UPKEEP_PER_ROUND * round;
  const energyUpkeep = ENERGY_UPKEEP_BASE + ENERGY_UPKEEP_PER_ROUND * round;

  const foodAfterUpkeep = Math.max(0, goods.food - foodUpkeep);
  const energyAfterUpkeep = Math.max(0, goods.energy - energyUpkeep);

  const foodAfterSpoilage = Math.floor(foodAfterUpkeep * (1 - FOOD_SPOILAGE_RATE));
  const energyAfterDecay = Math.floor(energyAfterUpkeep * (1 - ENERGY_DECAY_RATE));
  const smithoreAfterDecay = Math.floor(goods.smithore * (1 - SMITHORE_DECAY_RATE));

  return {
    food: foodAfterSpoilage,
    energy: energyAfterDecay,
    smithore: smithoreAfterDecay,
  };
}
