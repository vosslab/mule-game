/**
 * End-of-game scoring for the M.U.L.E. engine.
 *
 * A player's score is money on hand, plus their goods inventory valued at
 * current store prices, plus land value for every plot they own.
 */

import type { GameState } from "./game_state";
import type { Player } from "./player";
import { RESOURCES } from "./player";
import { LAND_VALUE_PER_PLOT, STORE_BASE_PRICE } from "./constants";

/**
 * Count the number of plots owned by `playerId` across the full board.
 *
 * @param state - Current game state.
 * @param playerId - Player index to count owned plots for.
 * @returns Number of plots owned by that player.
 */
function countOwnedPlots(state: GameState, playerId: number): number {
  let count = 0;
  for (const row of state.plots) {
    for (const plot of row) {
      if (plot.owner === playerId) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * Score a single player: money on hand, plus goods inventory valued at
 * `STORE_BASE_PRICE`, plus `LAND_VALUE_PER_PLOT` for each plot they own.
 *
 * @param state - Current game state.
 * @param player - Player to score.
 * @returns Total score in dollars.
 */
function computePlayerScore(state: GameState, player: Player): number {
  let goodsValue = 0;
  for (const resource of RESOURCES) {
    goodsValue += player.goods[resource] * STORE_BASE_PRICE[resource];
  }
  const landValue = countOwnedPlots(state, player.id) * LAND_VALUE_PER_PLOT;
  return player.money + goodsValue + landValue;
}

/**
 * Compute the final score for every player, in `state.players` order.
 *
 * @param state - Current game state.
 * @returns One score per player.
 */
export function computeScores(state: GameState): number[] {
  return state.players.map((player) => computePlayerScore(state, player));
}

/**
 * Determine the index of the winning player: the highest score, with ties
 * broken by lowest player index (earliest in `state.players`).
 *
 * @param state - Current game state.
 * @returns Index of the winning player within `state.players`.
 */
export function computeWinnerIndex(state: GameState): number {
  const scores = computeScores(state);
  let winnerIndex = 0;
  for (let playerId = 1; playerId < scores.length; playerId += 1) {
    const currentScore = scores[playerId];
    const bestScore = scores[winnerIndex];
    if (currentScore !== undefined && bestScore !== undefined && currentScore > bestScore) {
      winnerIndex = playerId;
    }
  }
  return winnerIndex;
}
