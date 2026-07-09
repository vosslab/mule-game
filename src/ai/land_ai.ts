/**
 * Land AI strategy for the M.U.L.E. engine: land-grant picks and colony
 * land-auction bidding.
 *
 * Both decision functions are pure: given the current game state and the
 * AI's player id, choose the next action (or null when nothing to do). The
 * land-grant AI scores every unowned, non-town plot by its best expected
 * single-resource yield (the highest base terrain yield among food, energy,
 * and smithore) and claims the highest-scoring plot; when no plot is
 * claimable it passes so the sequencer never stalls.
 *
 * The land-auction AI (`decideLandAuctionAction`) values the offered plot by
 * a conservative fraction of `LAND_VALUE_PER_PLOT` (the same intrinsic
 * per-plot value the scoring formula credits any owned plot, scaled down so
 * one plot never devours a whole round's budget), plus its best terrain
 * yield, an adjacency bonus for each orthogonally-touching plot this player
 * already owns, and a bonus for any revealed crystite -- then bids up to
 * whichever is lower of that value and a fraction of its money, always
 * leaving `LAND_AUCTION_MONEY_RESERVE` untouched. It never bids past the auction's
 * price ceiling and never bids against itself when it already holds the
 * highest active price, so a fixed-seed
 * stress run always reaches a bid or an explicit pass (the cannot-stall
 * invariant) and never proposes a bid it cannot afford (the affordability
 * invariant).
 *
 * The land-auction valuation also reads the deciding player's persona
 * bid-aggressiveness factor (see `personas.ts`),
 * applied on top of (never instead of) the rank-dampening factor below; the
 * affordability and price-ceiling checks in `decideLandAuctionAction` stay
 * personality-independent.
 *
 * DOM-free by design: no mutation, no randomness, no module-level state.
 */

import type { Action, GameState, LandAuctionPayload, Plot } from "../engine/game_state";
import { visibleCrystite } from "../engine/game_state";
import { currentPicker } from "../engine/land_grant";
import { rankOrder } from "../engine/events";
import { RESOURCES } from "../engine/player";
import {
  LAND_AUCTION_BID_STEP,
  LAND_VALUE_PER_PLOT,
  STORE_BASE_PRICE,
  YIELD_TABLE_BY_RESOURCE,
} from "../engine/constants";
import { personaParamsForPlayer } from "./personas";

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

/**
 * Money the land AI keeps in reserve when bidding, smaller than the
 * develop-phase and goods-auction reserve (`STORE_BASE_PRICE.food * 10`,
 * `auction_ai.ts`'s `AI_MONEY_RESERVE`) because a missed land bid is
 * opportunity cost, not an emergency: missing an opportunistic land
 * purchase costs nothing, unlike missing an emergency food buy, so the land
 * AI can safely dip closer to empty. Sim-tuned (see docs/RULE_SOURCES.md,
 * sim-experiment record).
 */
const LAND_AUCTION_MONEY_RESERVE = STORE_BASE_PRICE.food * 3;

/**
 * Fraction of `LAND_VALUE_PER_PLOT` (the scoring formula's intrinsic
 * per-plot value) used as the flat baseline willingness-to-pay. A full-value
 * baseline would let the AI spend its whole early-game budget on one plot in
 * round 1, starving later rounds; this conservative slice keeps land bids
 * proportionate to a multi-round budget while still crediting land as
 * inherently worth bidding on. Sim-tuned (see docs/RULE_SOURCES.md,
 * sim-experiment record).
 */
const LAND_VALUE_BASELINE_FRACTION = 0.3;

/** Dollars of willingness-to-pay per point of the plot's best terrain yield. */
const LAND_VALUE_PER_YIELD_POINT = 20;

/** Dollars of willingness-to-pay per orthogonally-adjacent plot already owned. */
const LAND_VALUE_PER_OWNED_NEIGHBOR = 15;

/** Dollars of willingness-to-pay per revealed crystite tier. */
const LAND_VALUE_PER_CRYSTITE_LEVEL = 40;

/** Largest fraction of current money the AI will ever commit to one plot. */
const LAND_VALUE_MONEY_FRACTION = 0.4;

/**
 * Rank-aware land-bid dampening (sim-tuned). Multiplies a
 * bidder's money cap by a factor keyed on its current rank (index into
 * `rankOrder`: 0 = leader, 3 = last), mirroring the leader-penalized,
 * trailer-favored fairness pattern `events.ts` already applies to personal
 * events -- but for land bids, the score component that actually decides who
 * wins (owned land is ~92-94% of final score; see docs/RULE_SOURCES.md, the
 * M10 leader-win-rate probe). The round's leader bids a smaller slice of its
 * money and the bottom two ranks a larger slice, so the leader's money-driven
 * land-auction dominance (winning ~54% of plots at baseline) shrinks toward a
 * fair share. Touches no PM-sourced constant; the land-auction tie-break and
 * scoring formula are unchanged. Sim-tuned (see docs/RULE_SOURCES.md,
 * sim-experiment record).
 */
const LAND_BID_RANK_FACTORS: readonly number[] = [0.7, 1.0, 1.2, 1.2];

/**
 * Count orthogonally-adjacent plots owned by `playerId` around (row, col).
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param row - Row of the plot being scored.
 * @param col - Column of the plot being scored.
 * @param playerId - Owner to match against neighbors.
 * @returns Number of matching neighbors (0 to 4).
 */
function countOwnedNeighbors(
  plots: readonly (readonly Plot[])[],
  row: number,
  col: number,
  playerId: number,
): number {
  const deltas: readonly [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  let matches = 0;
  for (const [rowDelta, colDelta] of deltas) {
    const neighborRowPlots = plots[row + rowDelta];
    if (neighborRowPlots === undefined) {
      continue;
    }
    const neighbor = neighborRowPlots[col + colDelta];
    if (neighbor !== undefined && neighbor.owner === playerId) {
      matches += 1;
    }
  }
  return matches;
}

/**
 * The most this player is willing to pay for the offered plot: the same
 * intrinsic `LAND_VALUE_PER_PLOT` the scoring formula credits any owned
 * plot, plus dollars from its best terrain yield, an adjacency bonus for
 * each owned neighbor, and a bonus for any revealed crystite -- capped at
 * `LAND_VALUE_MONEY_FRACTION` of the player's current money so a rich
 * player never empties its bank on one plot, then scaled by the deciding
 * player's persona `landBidFactor` (see
 * `personas.ts`; a factor of 1, absent a persona, leaves the result
 * unchanged). The persona factor is a flat multiplier applied after the
 * rank-dampening `Math.min`, so it always layers on top of the M10 fairness
 * mechanism rather than replacing it: `min(value, moneyCap) * factor` still
 * shrinks by the same `rankFactor` the leader/trailer dampening applies
 * inside `moneyCap`.
 *
 * @param state - Current game state.
 * @param payload - The active land-auction payload.
 * @param playerId - AI player id valuing the plot.
 * @param money - The player's current money.
 * @returns The player's maximum willingness-to-pay for this plot.
 */
function valueCap(
  state: GameState,
  payload: LandAuctionPayload,
  playerId: number,
  money: number,
): number {
  const targetRow = state.plots[payload.row];
  const plot = targetRow?.[payload.col];
  if (plot === undefined) {
    throw new Error(`valueCap: plot (${payload.row}, ${payload.col}) out of range`);
  }
  const yieldScore = scorePlot(plot);
  const neighbors = countOwnedNeighbors(state.plots, payload.row, payload.col, playerId);
  const crystiteLevel = visibleCrystite(plot) ?? 0;
  const value =
    LAND_VALUE_PER_PLOT * LAND_VALUE_BASELINE_FRACTION +
    yieldScore * LAND_VALUE_PER_YIELD_POINT +
    neighbors * LAND_VALUE_PER_OWNED_NEIGHBOR +
    crystiteLevel * LAND_VALUE_PER_CRYSTITE_LEVEL;
  // Rank-aware dampening: the leader commits a smaller slice of its money to a
  // plot, trailing players a larger slice, shrinking the leader's land-auction
  // dominance toward a fair share.
  const rank = rankOrder(state).indexOf(playerId);
  const rankFactor = LAND_BID_RANK_FACTORS[rank] ?? 1.0;
  const moneyCap = money * LAND_VALUE_MONEY_FRACTION * rankFactor;
  const persona = personaParamsForPlayer(state, playerId);
  return Math.min(value, moneyCap) * persona.landBidFactor;
}

/**
 * Whether `playerId` already holds the highest active bid among every
 * participant, so bidding again would only raise its own price for no
 * competitive reason.
 *
 * @param payload - The active land-auction payload.
 * @param playerId - Player to test.
 * @returns True when `playerId` is the sole current price leader.
 */
function isCurrentLeader(payload: LandAuctionPayload, playerId: number): boolean {
  let bestPrice = -1;
  let leaderId: number | null = null;
  for (const participant of payload.participants) {
    if (!participant.active) {
      continue;
    }
    if (participant.price > bestPrice) {
      bestPrice = participant.price;
      leaderId = participant.playerId;
    } else if (participant.price === bestPrice) {
      // A tie means no sole leader yet, so bidding again can still help.
      leaderId = null;
    }
  }
  return leaderId === playerId;
}

/**
 * Decide the next colony land-auction action for `playerId`. Returns null
 * when no bid is needed this tick: the game is not in the land-auction
 * phase, the auction has finished, the player already holds the sole
 * highest bid, the next ask would exceed the price ceiling, or the next ask
 * would exceed this player's value cap or dip below its money reserve.
 * Never proposes a bid it cannot afford (the affordability invariant) and
 * always resolves to null rather than throwing in every degenerate case (the
 * cannot-stall invariant).
 *
 * @param state - Current game state.
 * @param playerId - AI player id deciding.
 * @returns A `bid_land` action, or null if no bid is needed.
 */
export function decideLandAuctionAction(state: GameState, playerId: number): Action | null {
  if (state.phase.kind !== "land_auction") {
    return null;
  }
  const payload = state.phase.payload;
  if (payload.finished) {
    return null;
  }
  const participant = payload.participants.find((entry) => entry.playerId === playerId);
  if (participant === undefined) {
    return null;
  }
  if (isCurrentLeader(payload, playerId)) {
    return null;
  }
  const askPrice = participant.active
    ? participant.price + LAND_AUCTION_BID_STEP
    : payload.startPrice;
  if (askPrice > payload.priceCeiling) {
    return null;
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return null;
  }
  if (player.money - askPrice < LAND_AUCTION_MONEY_RESERVE) {
    return null;
  }
  const cap = valueCap(state, payload, playerId, player.money);
  if (askPrice > cap) {
    return null;
  }
  return { type: "bid_land", playerId };
}
