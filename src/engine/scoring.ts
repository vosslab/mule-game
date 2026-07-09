/**
 * End-of-game scoring, colony rating, and colony-failure detection for the
 * M.U.L.E. engine, matching planet_mule's `Player.calcPoints` and
 * `SummaryPhase2` (see docs/RULE_SOURCES.md, "Endgame scoring: per-plot and
 * per-mule terms", "Colony rating: Planet M.U.L.E. formula vs 1983", and
 * "Colony failure: food-production gate").
 *
 * A player's score is money on hand, plus `LAND_VALUE_PER_PLOT` for every
 * plot they own, plus `POINTS_PER_MULE` and that outfit's `OUTFIT_COST` for
 * every M.U.L.E. they have installed, plus their goods inventory valued at
 * the store's current prices.
 */

import type { GameState, ScoreBreakdown, ScoringPayload } from "./game_state";
import type { Player } from "./player";
import { RESOURCES } from "./player";
import {
  COLONY_FAILURE_MESSAGE_ENERGY,
  COLONY_FAILURE_MESSAGE_FOOD,
  COLONY_RATING_MESSAGES,
  COLONY_RATING_ROUND_BASE,
  COLONY_RATING_TIER_SPAN,
  LAND_VALUE_PER_PLOT,
  OUTFIT_COST,
  POINTS_PER_MULE,
  ROUND_COUNT_BY_MODE,
} from "./constants";

/**
 * Clamp an integer into `[lo, hi]`.
 */
function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Compute one player's score breakdown: land value and installed-M.U.L.E.
 * value from a single pass over the board, plus goods value at the store's
 * current prices.
 *
 * @param state - Current game state.
 * @param player - Player to score.
 * @returns The player's score breakdown.
 */
function computePlayerBreakdown(state: GameState, player: Player): ScoreBreakdown {
  let landValue = 0;
  let muleValue = 0;
  for (const row of state.plots) {
    for (const plot of row) {
      if (plot.owner !== player.id) {
        continue;
      }
      landValue += LAND_VALUE_PER_PLOT;
      if (plot.muleOutfit !== null) {
        muleValue += POINTS_PER_MULE + OUTFIT_COST[plot.muleOutfit];
      }
    }
  }
  let goodsValue = 0;
  for (const resource of RESOURCES) {
    goodsValue += player.goods[resource] * state.store.prices[resource];
  }
  const total = player.money + landValue + muleValue + goodsValue;
  return { playerId: player.id, money: player.money, landValue, muleValue, goodsValue, total };
}

/**
 * Compute the score breakdown for every player, in `state.players` order.
 *
 * @param state - Current game state.
 * @returns One breakdown per player.
 */
export function computeScoreBreakdowns(state: GameState): ScoreBreakdown[] {
  return state.players.map((player) => computePlayerBreakdown(state, player));
}

/**
 * Compute the final score for every player, in `state.players` order.
 *
 * @param state - Current game state.
 * @returns One score per player.
 */
export function computeScores(state: GameState): number[] {
  return computeScoreBreakdowns(state).map((breakdown) => breakdown.total);
}

/**
 * Determine the index of the leading player within a scores array: the
 * highest score, with ties broken by lowest player index. Matches
 * planet_mule's `Player.OrderByPoints` (`Player.java` lines 594-611).
 *
 * @param scores - Scores in player-index order.
 * @returns Index of the leading player.
 */
function winnerIndexFromScores(scores: readonly number[]): number {
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

/**
 * Determine the index of the winning player: the highest score, with ties
 * broken by lowest player index (earliest in `state.players`).
 *
 * @param state - Current game state.
 * @returns Index of the winning player within `state.players`.
 */
export function computeWinnerIndex(state: GameState): number {
  return winnerIndexFromScores(computeScores(state));
}

/**
 * A completed game's colony rating: the tier index into
 * `COLONY_RATING_MESSAGES` and that tier's message text.
 */
export interface ColonyRating {
  readonly tier: number;
  readonly message: string;
}

/**
 * Rate a colony total against the 7 Federation message tiers, scaled by the
 * game's own round count so a shorter beginner game does not demand the same
 * colony total as a full standard game.
 *
 * @param state - Current game state (its `mode` sets the round-count scale).
 * @param colonyTotal - Sum of every player's score.
 * @returns The rated tier and its message.
 */
export function computeColonyRating(state: GameState, colonyTotal: number): ColonyRating {
  const roundCount = ROUND_COUNT_BY_MODE[state.mode];
  const tierSpan = Math.trunc((COLONY_RATING_TIER_SPAN * roundCount) / COLONY_RATING_ROUND_BASE);
  const rawTier = Math.trunc(colonyTotal / tierSpan);
  const tier = clampInt(rawTier, 0, COLONY_RATING_MESSAGES.length - 1);
  const message = COLONY_RATING_MESSAGES[tier];
  if (message === undefined) {
    throw new Error(`computeColonyRating: no message for tier ${tier}`);
  }
  return { tier, message };
}

/** Result of a colony-failure check: whether the colony failed, and why. */
export interface ColonyFailureResult {
  readonly failed: boolean;
  readonly message: string | null;
}

/**
 * True if any player has a M.U.L.E. installed and outfitted for food
 * anywhere on the board. Both failure branches below gate on food
 * production specifically, not the resource that ran out -- a literal
 * planet_mule quirk, not this project's own design; see
 * docs/RULE_SOURCES.md, "Colony failure: food-production gate".
 *
 * @param state - Current game state.
 * @returns True if at least one food M.U.L.E. is installed.
 */
function anyFoodMuleInstalled(state: GameState): boolean {
  for (const row of state.plots) {
    for (const plot of row) {
      if (plot.muleOutfit === "food") {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check whether the colony has failed at the end of the current round: the
 * store plus every player's holdings of food or energy totals zero, with no
 * player producing any food anywhere on the board. Only checked on non-final
 * rounds (planet_mule's `checkShortageMessage` skips the check on the last
 * round, since the game is ending there regardless -- `SummaryPhase2.java`
 * lines 116-120).
 *
 * @param state - Current game state.
 * @returns Whether the colony failed this round, and the shortage message.
 */
export function checkColonyFailure(state: GameState): ColonyFailureResult {
  if (state.round >= ROUND_COUNT_BY_MODE[state.mode]) {
    return { failed: false, message: null };
  }
  let totalFood = state.store.stock.food;
  let totalEnergy = state.store.stock.energy;
  for (const player of state.players) {
    totalFood += player.goods.food;
    totalEnergy += player.goods.energy;
  }
  const noFoodProduction = !anyFoodMuleInstalled(state);
  if (totalFood === 0 && noFoodProduction) {
    return { failed: true, message: COLONY_FAILURE_MESSAGE_FOOD };
  }
  if (totalEnergy === 0 && noFoodProduction) {
    return { failed: true, message: COLONY_FAILURE_MESSAGE_ENERGY };
  }
  return { failed: false, message: null };
}

/**
 * Build the full scoring-phase payload: per-player breakdowns and scores,
 * the winner, the colony rating, colony-failure state, and First Founder.
 * The single entry point `turn.ts` `enterScoring` uses to populate
 * `Phase.scoring.payload`.
 *
 * @param state - Current game state.
 * @returns The scoring payload.
 */
export function buildScoringPayload(state: GameState): ScoringPayload {
  const breakdowns = computeScoreBreakdowns(state);
  const scores = breakdowns.map((breakdown) => breakdown.total);
  const winnerIndex = winnerIndexFromScores(scores);
  const colonyTotal = scores.reduce((sum, score) => sum + score, 0);
  const failure = checkColonyFailure(state);
  const rating = computeColonyRating(state, colonyTotal);
  const winner = state.players[winnerIndex];
  const firstFounderId = failure.failed || winner === undefined ? null : winner.id;
  return {
    scores,
    winnerIndex,
    breakdowns,
    colonyTotal,
    colonyRatingTier: rating.tier,
    colonyRatingMessage: rating.message,
    colonyFailed: failure.failed,
    failureMessage: failure.message,
    firstFounderId,
  };
}
