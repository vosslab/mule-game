/**
 * Colony land-auction phase engine for the M.U.L.E. engine.
 *
 * planet_mule offers up to three colony-owned plots per round, each gated by
 * its own probability (`LAND_AUCTION_COLONY_PROBABILITIES`), and only rolls a
 * later slot when the previous slot's plot actually sold
 * (`PlotSeller.generateNextColonyAuction`, `AbstractLandAuctionPhase
 * .goToNextPhase`). Each offered plot is sold through the same real-time
 * avatar price-axis-walk auction the goods auction uses
 * (`Auction.beginLandAuction`), a mechanic this project's goods auction
 * (`auction.ts`) already discretized into ticks for a headless engine.
 *
 * This module maps the land auction onto a simpler discrete analog rather
 * than reusing `auction.ts`'s continuous per-tick walking model, because a
 * land auction sells exactly one indivisible item (no buyer/seller roles, no
 * streamed unit trades): every player carries a `LandAuctionParticipant`
 * entry (`active`, `price`), starting inactive. A `bid_land` action raises
 * the calling player's own standing bid to the current asking level -- the
 * seeded `startPrice` for a first bid, or `LAND_AUCTION_BID_STEP` above their
 * own last bid otherwise -- capped at `priceCeiling` and gated by an upfront
 * affordability check (fail loudly, matching `applyBuyMule`'s pattern, rather
 * than planet_mule's settle-time affordability check). `goingTicks` counts
 * consecutive ticks since the last bid; the auction finalizes at three times
 * `LAND_AUCTION_GOING_TICKS` (going once, going twice, sold/no sale) or the
 * `LAND_AUCTION_MAX_TICKS` safety ceiling, whichever comes first. The winner
 * is the highest bidder; a tie (two or more players resting at the same top
 * price when the countdown expires) breaks to a uniformly random candidate in
 * round 1, otherwise to the worst-ranked candidate by current score -- both
 * matching `AbstractLandAuctionPhase.auctionEndStateTimer`'s tie-break.
 *
 * Settlement (money transfer, plot ownership, and the cross-round
 * `LandMarketState` price memory) happens inside this module's tick function
 * the moment an auction finalizes; phase sequencing (deciding whether the
 * round's colony-auction chain rolls another slot, or the round moves on to
 * develop) is `turn.ts`'s responsibility, mirroring the `auction.ts`/`turn.ts`
 * split for goods auctions.
 *
 * This module never mutates its inputs; every function returns fresh state.
 * See docs/RULE_SOURCES.md, "Colony land auction: pricing, bidding, tie-break"
 * for the full fidelity adjudication record.
 */

import type {
  GameState,
  LandAuctionParticipant,
  LandAuctionPayload,
  LandMarketState,
  Plot,
} from "./game_state";
import type { Player } from "./player";
import { claimPlotOnBoard } from "./land_grant";
import { createRng, type Rng } from "./rng";
import { computeScores } from "./scoring";
import {
  LAND_AUCTION_BID_STEP,
  LAND_AUCTION_COLONY_PROBABILITIES,
  LAND_AUCTION_FAILED_SALE_OFFSET,
  LAND_AUCTION_GOING_TICKS,
  LAND_AUCTION_MAX_TICKS,
  LAND_AUCTION_PRICE_DROP,
  LAND_AUCTION_PRICE_FLOOR,
  LAND_AUCTION_PRICE_MULTIPLE,
  LAND_AUCTION_PRICE_RANGE,
  LAND_AUCTION_START_PRICE,
} from "./constants";

/** Number of colony-auction slots offered per round, at most. */
export const LAND_AUCTION_SLOT_COUNT = LAND_AUCTION_COLONY_PROBABILITIES.length;

/** Total idle ticks (three going-stages) after which a land auction finalizes. */
const FINALIZE_TICKS = LAND_AUCTION_GOING_TICKS * 3;

/**
 * Round a price to the nearest multiple of `step`, ties rounding down.
 * Matches planet_mule's `MuleMath.closest(int, int)`.
 *
 * @param price - Raw price to round.
 * @param step - Multiple to round to.
 * @returns The nearest multiple of `step`, ties broken downward.
 */
function roundToNearestMultiple(price: number, step: number): number {
  const remainder = price % step;
  if (remainder <= step / 2) {
    return price - remainder;
  }
  return price + step - remainder;
}

/**
 * Clamp a raw seed price to the land-auction floor, then round to the
 * nearest price multiple. Matches `PlotSeller.beginAuction`'s
 * `Math.max(landPrice, 80)` followed by `MuleMath.closest(landPrice, 4)`.
 *
 * @param rawPrice - Unclamped, unrounded seed price.
 * @returns The floored, rounded seed price.
 */
function clampAndRoundSeedPrice(rawPrice: number): number {
  const floored = Math.max(rawPrice, LAND_AUCTION_PRICE_FLOOR);
  return roundToNearestMultiple(floored, LAND_AUCTION_PRICE_MULTIPLE);
}

/**
 * Seed the starting price for a colony land auction at `slotIndex` within the
 * current round's chain. Slot 0 (a new round's first offered plot) seeds from
 * the running average of every outcome price since the last time an average
 * was consumed (or `LAND_AUCTION_START_PRICE` if none has ever been
 * recorded); a later slot in the same round's chain seeds from the previous
 * slot's own outcome price. Matches `PlotSeller.beginAuction`.
 *
 * @param landMarket - Current cross-round land-market memory.
 * @param slotIndex - Which colony-auction slot this round (0-based).
 * @returns The seeded starting price for this auction.
 */
export function seedStartPrice(landMarket: LandMarketState, slotIndex: number): number {
  if (slotIndex === 0) {
    if (landMarket.setSize > 0) {
      // Integer division, matching Java's `int / int` truncation.
      const average = Math.trunc(landMarket.priceAccumulator / landMarket.setSize);
      return clampAndRoundSeedPrice(average - LAND_AUCTION_PRICE_DROP);
    }
    return LAND_AUCTION_START_PRICE;
  }
  return clampAndRoundSeedPrice(landMarket.lastSellPrice - LAND_AUCTION_PRICE_DROP);
}

/**
 * The drifted outcome price recorded when a land-auction slot ends with no
 * bidder at all. Matches `PlotSeller.finishAuction`'s no-sale branch:
 * `landSellPrice = landPrice / 2 + 52` (integer division; `startPrice` is
 * always a multiple of `LAND_AUCTION_PRICE_MULTIPLE`, so this is exact).
 *
 * @param startPrice - The auction's seeded starting price.
 * @returns The drifted no-sale outcome price.
 */
export function failedSalePrice(startPrice: number): number {
  return Math.trunc(startPrice / 2) + LAND_AUCTION_FAILED_SALE_OFFSET;
}

/**
 * List every unowned, non-town plot on the board, in row-major order.
 * Matches `PlotSeller.generateNextColonyAuction`'s candidate scan (skips an
 * owned tile or the shop/town tile).
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @returns Positions of every plot the colony could offer for auction.
 */
export function unownedNonTownPlots(
  plots: readonly (readonly Plot[])[],
): { row: number; col: number }[] {
  const candidates: { row: number; col: number }[] = [];
  for (const [row, rowPlots] of plots.entries()) {
    for (const [col, plot] of rowPlots.entries()) {
      if (plot.owner === null && plot.terrain !== "town") {
        candidates.push({ row, col });
      }
    }
  }
  return candidates;
}

/**
 * Roll whether a colony land-auction slot offers a plot this round, against
 * `LAND_AUCTION_COLONY_PROBABILITIES[slotIndex]`. Advances `rng` by one draw.
 * Matches `PlotSeller.generateNextColonyAuction`'s `f2 <= f` roll.
 *
 * @param rng - Seeded generator to draw from (advanced by one step).
 * @param slotIndex - Which colony-auction slot this round (0-based).
 * @returns True when this slot offers a plot.
 */
export function rollColonySlot(rng: Rng, slotIndex: number): boolean {
  const probability = LAND_AUCTION_COLONY_PROBABILITIES[slotIndex];
  if (probability === undefined) {
    throw new Error(`rollColonySlot: slotIndex ${slotIndex} out of range`);
  }
  return rng.next() <= probability;
}

/**
 * Build the initial land-auction payload for a plot: every player starts an
 * inactive participant previewing the seeded start price, the tick clock at
 * zero, and outcome fields unset.
 *
 * @param state - Current game state (its `landMarket` seeds the price).
 * @param row - Zero-based row index of the plot being offered.
 * @param col - Zero-based column index of the plot being offered.
 * @param slotIndex - Which colony-auction slot this round (0-based).
 * @returns A fresh land-auction payload ready for its first tick.
 */
export function createLandAuctionPayload(
  state: GameState,
  row: number,
  col: number,
  slotIndex: number,
): LandAuctionPayload {
  const startPrice = seedStartPrice(state.landMarket, slotIndex);
  const priceCeiling = startPrice + LAND_AUCTION_PRICE_RANGE;
  const participants: LandAuctionParticipant[] = state.players.map((player) => ({
    playerId: player.id,
    active: false,
    price: startPrice,
  }));
  return {
    row,
    col,
    startPrice,
    priceCeiling,
    participants,
    goingTicks: 0,
    tick: 0,
    auctionsRemaining: LAND_AUCTION_SLOT_COUNT - 1 - slotIndex,
    finished: false,
    sold: false,
    winnerId: null,
    finalPrice: null,
  };
}

/**
 * Narrow the current phase to its land-auction payload, throwing if the game
 * is not in the land-auction phase.
 *
 * @param state - Current game state.
 * @returns The land-auction payload.
 */
function requireLandAuction(state: GameState): LandAuctionPayload {
  if (state.phase.kind !== "land_auction") {
    throw new Error(`expected land_auction phase, got ${state.phase.kind}`);
  }
  return state.phase.payload;
}

/**
 * Read a participant by player id, throwing if the id has no entry.
 *
 * @param participants - Current land-auction participants.
 * @param playerId - Player id to find.
 * @returns The matching participant.
 */
function participantAt(
  participants: readonly LandAuctionParticipant[],
  playerId: number,
): LandAuctionParticipant {
  const participant = participants.find((entry) => entry.playerId === playerId);
  if (participant === undefined) {
    throw new Error(`no land-auction participant with id ${playerId}`);
  }
  return participant;
}

/**
 * Read a player by id, throwing if the id is out of range.
 *
 * @param players - Current players tuple.
 * @param playerId - Player id to read.
 * @returns The player.
 */
function playerAt(players: readonly Player[], playerId: number): Player {
  const player = players[playerId];
  if (player === undefined) {
    throw new Error(`no player with id ${playerId}`);
  }
  return player;
}

/**
 * Apply `bid_land`: raise `playerId`'s own standing bid to the current
 * asking level. A first bid commits at the auction's seeded `startPrice`; a
 * later bid from the same player steps up by `LAND_AUCTION_BID_STEP`. Throws
 * if the auction already finished, the ask would exceed `priceCeiling`, or
 * the player cannot afford it -- fail loudly rather than silently clamping or
 * ignoring an illegal bid, matching `applyBuyMule`'s affordability pattern.
 *
 * @param state - Current game state (must be in the land-auction phase).
 * @param playerId - Player placing the bid.
 * @returns State with the player's bid raised and the going-tick countdown reset.
 */
export function applyBidLand(state: GameState, playerId: number): GameState {
  const payload = requireLandAuction(state);
  if (payload.finished) {
    throw new Error(`bid_land: land auction already finished`);
  }
  const participant = participantAt(payload.participants, playerId);
  const askPrice = participant.active
    ? participant.price + LAND_AUCTION_BID_STEP
    : payload.startPrice;
  if (askPrice > payload.priceCeiling) {
    throw new Error(
      `player ${playerId} cannot bid beyond the price ceiling ($${payload.priceCeiling})`,
    );
  }
  const player = playerAt(state.players, playerId);
  if (player.money < askPrice) {
    throw new Error(
      `player ${playerId} cannot afford a $${askPrice} land bid (has $${player.money})`,
    );
  }
  const participants = payload.participants.map((entry) =>
    entry.playerId === playerId ? { ...entry, active: true, price: askPrice } : entry,
  );
  return {
    ...state,
    phase: { kind: "land_auction", payload: { ...payload, participants, goingTicks: 0 } },
  };
}

/**
 * Find the winning bidder among active participants: the highest price,
 * tie-broken to a uniformly random candidate in round 1 or the worst-ranked
 * candidate by current score otherwise. Returns null when no participant
 * ever bid. Matches `AbstractLandAuctionPhase.auctionEndStateTimer`.
 *
 * @param participants - This auction's participants.
 * @param state - Current game state (used for round and rank-order ties).
 * @returns The winning player id and the possibly-advanced `rngState`.
 */
function pickWinner(
  participants: readonly LandAuctionParticipant[],
  state: GameState,
): { winnerId: number | null; rngState: number } {
  let bestPrice = -1;
  let candidates: number[] = [];
  for (const entry of participants) {
    if (!entry.active) {
      continue;
    }
    if (entry.price > bestPrice) {
      bestPrice = entry.price;
      candidates = [entry.playerId];
    } else if (entry.price === bestPrice) {
      candidates.push(entry.playerId);
    }
  }
  if (candidates.length === 0) {
    return { winnerId: null, rngState: state.rngState };
  }
  const first = candidates[0] as number;
  if (candidates.length === 1) {
    return { winnerId: first, rngState: state.rngState };
  }
  if (state.round === 1) {
    const rng = createRng(state.rngState);
    const index = rng.nextInt(candidates.length);
    return { winnerId: candidates[index] as number, rngState: rng.getState() };
  }
  return { winnerId: worstRanked(candidates, state), rngState: state.rngState };
}

/**
 * Pick the worst-ranked player (lowest current score, ties broken to the
 * highest player id) among a set of candidate ids. Matches
 * `AbstractLandAuctionPhase.auctionEndStateTimer`'s tie-break: iterating
 * `getPlayersInRankOrder()` (best to worst, equal scores breaking to the
 * lowest id first) and taking the last-added tied candidate.
 *
 * @param candidateIds - Tied player ids to choose among.
 * @param state - Current game state (scored to rank the candidates).
 * @returns The worst-ranked candidate id.
 */
function worstRanked(candidateIds: readonly number[], state: GameState): number {
  const scores = computeScores(state);
  const first = candidateIds[0] as number;
  let worst = first;
  for (const id of candidateIds) {
    const score = scores[id] ?? 0;
    const worstScore = scores[worst] ?? 0;
    if (score < worstScore || (score === worstScore && id > worst)) {
      worst = id;
    }
  }
  return worst;
}

/**
 * Add money delta to one player, returning a new four-player tuple with
 * every other player shared unchanged.
 *
 * @param players - Current players tuple.
 * @param playerId - Player whose money changes.
 * @param delta - Amount to add (negative to spend).
 * @returns A new players tuple.
 */
function applyMoneyDelta(
  players: readonly [Player, Player, Player, Player],
  playerId: number,
  delta: number,
): [Player, Player, Player, Player] {
  return [
    players[0].id === playerId ? { ...players[0], money: players[0].money + delta } : players[0],
    players[1].id === playerId ? { ...players[1], money: players[1].money + delta } : players[1],
    players[2].id === playerId ? { ...players[2], money: players[2].money + delta } : players[2],
    players[3].id === playerId ? { ...players[3], money: players[3].money + delta } : players[3],
  ];
}

/**
 * Finalize a land auction whose going-tick countdown (or the safety
 * ceiling) has elapsed: determine the winner (or a failed sale), transfer
 * money and plot ownership on a sale, and fold the outcome price into the
 * cross-round `landMarket` memory. Sets `finished`, `sold`, `winnerId`, and
 * `finalPrice` on the payload; phase sequencing (whether the round's chain
 * rolls another slot) is `turn.ts`'s responsibility.
 *
 * @param state - Current game state (must be in the land-auction phase).
 * @param payload - The payload with its final tick counters already applied.
 * @returns The settled state, still in the land-auction phase with `finished: true`.
 */
function finalizeLandAuction(state: GameState, payload: LandAuctionPayload): GameState {
  const { winnerId, rngState } = pickWinner(payload.participants, state);
  let players = state.players;
  let plots = state.plots;
  let sold: boolean;
  let finalPrice: number;
  if (winnerId !== null) {
    const winner = participantAt(payload.participants, winnerId);
    finalPrice = winner.price;
    sold = true;
    players = applyMoneyDelta(players, winnerId, -finalPrice);
    plots = claimPlotOnBoard(plots, winnerId, payload.row, payload.col);
  } else {
    sold = false;
    finalPrice = failedSalePrice(payload.startPrice);
  }
  const landMarket: LandMarketState = {
    priceAccumulator: state.landMarket.priceAccumulator + finalPrice,
    setSize: state.landMarket.setSize + 1,
    lastSellPrice: finalPrice,
  };
  return {
    ...state,
    players,
    plots,
    rngState,
    landMarket,
    phase: {
      kind: "land_auction",
      payload: { ...payload, finished: true, sold, winnerId, finalPrice },
    },
  };
}

/**
 * Advance the current land auction by one tick: increment the going-tick
 * countdown (and the tick clock), finalizing once the countdown reaches
 * three times `LAND_AUCTION_GOING_TICKS` or the tick clock reaches
 * `LAND_AUCTION_MAX_TICKS`. A finished auction is a no-op. Pure: returns
 * fresh state and never mutates its input.
 *
 * @param state - Current game state (must be in the land-auction phase).
 * @returns The next game state after one land-auction tick.
 */
export function landAuctionTick(state: GameState): GameState {
  const payload = requireLandAuction(state);
  if (payload.finished) {
    return state;
  }
  const goingTicks = payload.goingTicks + 1;
  const tick = payload.tick + 1;
  const stepped: LandAuctionPayload = { ...payload, goingTicks, tick };
  if (goingTicks >= FINALIZE_TICKS || tick >= LAND_AUCTION_MAX_TICKS) {
    return finalizeLandAuction(state, stepped);
  }
  return { ...state, phase: { kind: "land_auction", payload: stepped } };
}
