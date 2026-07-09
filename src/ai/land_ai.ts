/**
 * Land-grant AI strategy for the M.U.L.E. engine.
 *
 * Pure decision function: given the current game state and the AI's player
 * id, choose the next land-grant action. The AI scores every unowned,
 * non-town plot by its best expected single-resource yield (the highest
 * base terrain yield among food, energy, and smithore) and claims the
 * highest-scoring plot. When no plot is claimable (none unowned, or it is
 * not this player's pick), the AI passes so the sequencer never stalls.
 *
 * DOM-free by design: no mutation, no randomness, no module-level state.
 */

import type { Action, GameState, Plot } from "../engine/game_state";
import { currentPicker } from "../engine/land_grant";
import { RESOURCES } from "../engine/player";
import { YIELD_TABLE_BY_RESOURCE } from "../engine/constants";

/**
 * Score a plot by its best possible single-resource base yield: the highest
 * value across food, energy, and smithore yield tables for the plot's
 * terrain. Terrain/resource combinations absent from a yield table score 0
 * for that resource.
 *
 * @param plot - Candidate plot.
 * @returns The plot's best-resource base yield.
 */
function scorePlot(plot: Plot): number {
  let best = 0;
  for (const resource of RESOURCES) {
    const yieldTable = YIELD_TABLE_BY_RESOURCE[resource];
    const terrainYield = yieldTable[plot.terrain];
    if (terrainYield !== undefined && terrainYield > best) {
      best = terrainYield;
    }
  }
  return best;
}

/**
 * Find the highest-scoring unowned, non-town plot on the board. Ties break
 * to the first plot found in row-major order, so the result is deterministic.
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @returns The best plot's position, or null if no plot is claimable.
 */
function bestClaimablePlot(
  plots: readonly (readonly Plot[])[],
): { row: number; col: number } | null {
  let bestScore = -1;
  let bestSpot: { row: number; col: number } | null = null;
  for (const [row, rowPlots] of plots.entries()) {
    for (const [col, plot] of rowPlots.entries()) {
      if (plot.owner !== null || plot.terrain === "town") {
        continue;
      }
      const score = scorePlot(plot);
      if (score > bestScore) {
        bestScore = score;
        bestSpot = { row, col };
      }
    }
  }
  return bestSpot;
}

/**
 * Decide the next land-grant action for `playerId`. Passes when the game is
 * not in the land-grant phase, when it is not this player's pick, or when
 * no plot remains to claim, so the AI always returns a terminal action and
 * can never softlock the sequencer.
 *
 * @param state - Current game state.
 * @param playerId - AI player id deciding.
 * @returns The next action for this player: `claim_plot` or `pass`.
 */
export function decideLandGrantAction(state: GameState, playerId: number): Action {
  if (state.phase.kind !== "land_grant") {
    return { type: "pass", playerId };
  }
  const payload = state.phase.payload;
  if (currentPicker(payload) !== playerId) {
    return { type: "pass", playerId };
  }
  const spot = bestClaimablePlot(state.plots);
  if (spot === null) {
    return { type: "pass", playerId };
  }
  return { type: "claim_plot", playerId, row: spot.row, col: spot.col };
}
