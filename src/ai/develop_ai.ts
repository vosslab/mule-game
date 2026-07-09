/**
 * Development-phase AI strategy for the M.U.L.E. engine.
 *
 * Pure decision function: given the current game state and the AI's player
 * id, choose the next develop-phase action. The AI buys and outfits a
 * M.U.L.E. toward the colony's scarcest resource (the resource with the
 * smallest total inventory summed across every player), places an outfitted
 * M.U.L.E. on the first owned empty plot, and always keeps a food-safety
 * money reserve so it never spends down to a position where it cannot
 * afford emergency food at auction.
 *
 * DOM-free by design: no mutation, no randomness, no module-level state.
 */

import type { Action, GameState, Plot } from "../engine/game_state";
import type { Resource } from "../engine/player";
import { RESOURCES } from "../engine/player";
import { canBuyMule, hasPlaceablePlot } from "../engine/turn";
import { MULE_BASE_PRICE, OUTFIT_COST, STORE_BASE_PRICE } from "../engine/constants";

/**
 * Money the AI keeps in reserve at all times, so it can always afford an
 * emergency food purchase from the store during an auction even after
 * buying and outfitting a M.U.L.E. Sized to ten units of store-price food.
 */
const AI_MONEY_RESERVE = STORE_BASE_PRICE.food * 10;

/**
 * Find the colony's scarcest resource: the resource with the smallest total
 * inventory summed across every player. Ties break to the fixed `RESOURCES`
 * order (food, energy, smithore), so the result is deterministic.
 *
 * @param state - Current game state.
 * @returns The scarcest resource across the colony.
 */
function scarcestResource(state: GameState): Resource {
  let best: Resource = RESOURCES[0] as Resource;
  let bestTotal = Number.POSITIVE_INFINITY;
  for (const resource of RESOURCES) {
    let total = 0;
    for (const player of state.players) {
      total += player.goods[resource];
    }
    if (total < bestTotal) {
      bestTotal = total;
      best = resource;
    }
  }
  return best;
}

/**
 * Choose an outfit resource the player can afford without dipping below the
 * money reserve, preferring `preferred` when it fits within that budget.
 * Falls back to any affordable resource within the reserve, then to any
 * resource the player can afford at all, so the AI never strands a carried
 * M.U.L.E. it cannot outfit.
 *
 * @param money - Player's current money.
 * @param preferred - The colony's scarcest resource.
 * @returns An affordable resource, or null if none can be afforded at all.
 */
function chooseOutfitResource(money: number, preferred: Resource): Resource | null {
  if (money - OUTFIT_COST[preferred] >= AI_MONEY_RESERVE) {
    return preferred;
  }
  let fallbackWithinReserve: Resource | null = null;
  let fallbackAffordable: Resource | null = null;
  for (const resource of RESOURCES) {
    const cost = OUTFIT_COST[resource];
    if (money - cost >= AI_MONEY_RESERVE && fallbackWithinReserve === null) {
      fallbackWithinReserve = resource;
    }
    if (money >= cost && fallbackAffordable === null) {
      fallbackAffordable = resource;
    }
  }
  if (fallbackWithinReserve !== null) {
    return fallbackWithinReserve;
  }
  return fallbackAffordable;
}

/**
 * Find the first owned, empty plot in row-major order, so placement is
 * deterministic.
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param playerId - Player whose owned plots to search.
 * @returns The plot position, or null if the player owns no empty plot.
 */
function firstOwnedEmptyPlot(
  plots: readonly (readonly Plot[])[],
  playerId: number,
): { row: number; col: number } | null {
  for (const [row, rowPlots] of plots.entries()) {
    for (const [col, plot] of rowPlots.entries()) {
      if (plot.owner === playerId && plot.muleOutfit === null) {
        return { row, col };
      }
    }
  }
  return null;
}

/**
 * Decide the next develop-phase action for `playerId`. Always returns a
 * terminal action for the current situation (`end_turn` when nothing
 * productive can be done), so the AI can never softlock the sequencer.
 *
 * @param state - Current game state.
 * @param playerId - AI player id deciding.
 * @returns The next action for this player.
 */
export function decideDevelopAction(state: GameState, playerId: number): Action {
  if (state.phase.kind !== "develop") {
    return { type: "end_turn", playerId };
  }
  const payload = state.phase.payload;
  if (payload.activePlayer !== playerId) {
    return { type: "end_turn", playerId };
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return { type: "end_turn", playerId };
  }

  if (payload.carriedMule === "none") {
    const scarcest = scarcestResource(state);
    const totalCost = MULE_BASE_PRICE + OUTFIT_COST[scarcest];
    if (canBuyMule(state, playerId) && player.money - totalCost >= AI_MONEY_RESERVE) {
      return { type: "buy_mule", playerId };
    }
    return { type: "end_turn", playerId };
  }

  if (payload.carriedMule === "unoutfitted") {
    const scarcest = scarcestResource(state);
    const resource = chooseOutfitResource(player.money, scarcest);
    if (resource === null) {
      return { type: "end_turn", playerId };
    }
    return { type: "outfit_mule", playerId, resource };
  }

  // carriedMule is an outfitted Resource: place it if a plot is available.
  if (!hasPlaceablePlot(state, playerId)) {
    return { type: "end_turn", playerId };
  }
  const spot = firstOwnedEmptyPlot(state.plots, playerId);
  if (spot === null) {
    return { type: "end_turn", playerId };
  }
  return { type: "place_mule", playerId, row: spot.row, col: spot.col };
}
