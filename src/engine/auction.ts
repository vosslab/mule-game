/**
 * Tick-based auction engine for the M.U.L.E. engine.
 *
 * One good (food, then energy, then smithore) is auctioned per window. Before
 * and during a good's auction each player declares a role (buyer, seller, or
 * out) and a per-tick price intent (up, down, or hold). Every tick, each
 * participant's price moves by `AUCTION_PRICE_STEP` in the direction of its
 * intent, clamped to the price band, and then at most one unit trades between
 * the highest buyer and the lowest seller while the market is crossed (highest
 * buyer price >= lowest seller price). The store participates on both sides
 * with a fixed band: it sells its remaining stock at `storeSellPrice` and buys
 * unlimited units at the lower `storeBuyPrice`.
 *
 * A trade executes at the seller's asking price (the resting ask). Money moves
 * from buyer to seller and one unit moves the other way, so player money is
 * conserved across player-to-player trades and total goods (players plus store
 * stock) are conserved across every trade, store trades included. The store
 * has no money field, so it acts as an external money source/sink; goods it
 * trades are conserved through its stock.
 *
 * The auction ends by timeout: after `AUCTION_TICKS` ticks the payload is
 * marked `finished`, and the driver (UI or AI loop) dispatches `end_auction`
 * so the turn sequencer advances to the next good, round, or scoring. This
 * module never mutates its inputs; every function returns fresh state.
 *
 * The engine is DOM-free by design.
 */

import type { Player, Resource } from "./player";
import type {
  AuctionIntent,
  AuctionParticipant,
  AuctionPayload,
  AuctionRole,
  AuctionTrade,
  GameState,
} from "./game_state";
import type { StoreState } from "./store";
import { applyBuyFromStore, applySellToStore } from "./store";
import {
  AUCTION_PRICE_CEILING,
  AUCTION_PRICE_FLOOR,
  AUCTION_PRICE_STEP,
  AUCTION_STORE_SPREAD,
  AUCTION_TICKS,
} from "./constants";

/**
 * Sentinel participant id used in an `AuctionTrade` when the store is the
 * buyer or seller. It sits above every real player id (0..3) so players win
 * price ties against the store when offers are ranked.
 */
export const AUCTION_STORE_ID = 4;

/** Number of players in the beginner game. */
const PLAYER_COUNT = 4;

/**
 * Clamp a price into the auction band `[AUCTION_PRICE_FLOOR,
 * AUCTION_PRICE_CEILING]`.
 *
 * @param price - Raw price to clamp.
 * @returns The price bounded to the auction band.
 */
function clampPrice(price: number): number {
  if (price < AUCTION_PRICE_FLOOR) {
    return AUCTION_PRICE_FLOOR;
  }
  if (price > AUCTION_PRICE_CEILING) {
    return AUCTION_PRICE_CEILING;
  }
  return price;
}

/**
 * Build the initial auction sub-state for a good. Every player starts `out`
 * with a `hold` intent, sitting at the store band midpoint so an untouched
 * auction crosses nothing and times out with no trade. The store buy/sell
 * band is derived from the store's per-good prices widened by
 * `AUCTION_STORE_SPREAD` and clamped to the price band.
 *
 * @param state - Current game state (its store supplies prices and stock).
 * @param good - Good being auctioned.
 * @returns A fresh auction payload ready for its first tick.
 */
export function createAuctionPayload(state: GameState, good: Resource): AuctionPayload {
  const store = state.store;
  const storeBuyPrice = clampPrice(store.buyPrice[good] - AUCTION_STORE_SPREAD);
  const storeSellPrice = clampPrice(store.sellPrice[good] + AUCTION_STORE_SPREAD);
  const startPrice = clampPrice(Math.round((storeBuyPrice + storeSellPrice) / 2));
  const participants: AuctionParticipant[] = [];
  for (let playerId = 0; playerId < PLAYER_COUNT; playerId += 1) {
    participants.push({ playerId, role: "out", price: startPrice, intent: "hold" });
  }
  return {
    good,
    tick: 0,
    ticksRemaining: AUCTION_TICKS,
    priceFloor: AUCTION_PRICE_FLOOR,
    priceCeiling: AUCTION_PRICE_CEILING,
    storeBuyPrice,
    storeSellPrice,
    storeStock: store.stock[good],
    participants,
    trades: [],
    finished: false,
  };
}

/**
 * Narrow the current phase to its auction payload, throwing if the game is
 * not in the auction phase.
 *
 * @param state - Current game state.
 * @returns The auction payload.
 */
function requireAuction(state: GameState): AuctionPayload {
  if (state.phase.kind !== "auction") {
    throw new Error(`expected auction phase, got ${state.phase.kind}`);
  }
  return state.phase.payload;
}

/**
 * Replace the participant entry for `playerId`, returning a new participants
 * array. Throws if the player has no entry, so a bad id fails loudly.
 *
 * @param participants - Current participants array.
 * @param playerId - Player whose entry to replace.
 * @param updater - Pure function returning the replacement entry.
 * @returns A new participants array.
 */
function updateParticipant(
  participants: readonly AuctionParticipant[],
  playerId: number,
  updater: (participant: AuctionParticipant) => AuctionParticipant,
): AuctionParticipant[] {
  let found = false;
  const next = participants.map((participant) => {
    if (participant.playerId !== playerId) {
      return participant;
    }
    found = true;
    return updater(participant);
  });
  if (!found) {
    throw new Error(`no auction participant with id ${playerId}`);
  }
  return next;
}

/**
 * Set a player's auction role (buyer, seller, or out). Valid only in the
 * auction phase.
 *
 * @param state - Current game state (must be in the auction phase).
 * @param playerId - Player declaring a role.
 * @param role - Role to set.
 * @returns State with the player's role updated.
 */
export function applySetAuctionRole(
  state: GameState,
  playerId: number,
  role: AuctionRole,
): GameState {
  const payload = requireAuction(state);
  const participants = updateParticipant(payload.participants, playerId, (participant) => ({
    ...participant,
    role,
  }));
  return { ...state, phase: { kind: "auction", payload: { ...payload, participants } } };
}

/**
 * Set a player's per-tick price intent (up, down, or hold). Valid only in the
 * auction phase.
 *
 * @param state - Current game state (must be in the auction phase).
 * @param playerId - Player setting an intent.
 * @param intent - Intent to set.
 * @returns State with the player's intent updated.
 */
export function applySetAuctionIntent(
  state: GameState,
  playerId: number,
  intent: AuctionIntent,
): GameState {
  const payload = requireAuction(state);
  const participants = updateParticipant(payload.participants, playerId, (participant) => ({
    ...participant,
    intent,
  }));
  return { ...state, phase: { kind: "auction", payload: { ...payload, participants } } };
}

/**
 * Move a participant's price one step in its intent's direction, clamped to
 * the price band. A `hold` intent leaves the price unchanged.
 *
 * @param participant - Participant to move.
 * @returns The participant with an updated price.
 */
function stepParticipantPrice(participant: AuctionParticipant): AuctionParticipant {
  if (participant.intent === "hold") {
    return participant;
  }
  const delta = participant.intent === "up" ? AUCTION_PRICE_STEP : -AUCTION_PRICE_STEP;
  return { ...participant, price: clampPrice(participant.price + delta) };
}

/**
 * A ranked offer on one side of the market: a bid (buy) or an ask (sell).
 * `playerId` is a real player id or `AUCTION_STORE_ID`; `isStore` marks the
 * store's fixed-band offer so execution knows to move store stock instead of
 * a player's inventory.
 */
interface Offer {
  readonly playerId: number;
  readonly price: number;
  readonly isStore: boolean;
}

/**
 * Best (highest) bid among player buyers plus the store's standing buy offer.
 * Ties break to the lowest id, so a player at the store's price wins over the
 * store. The store always bids, since it buys unlimited units.
 *
 * @param payload - Current auction payload.
 * @returns The highest bid offer.
 */
function bestBid(payload: AuctionPayload): Offer {
  const offers: Offer[] = [
    { playerId: AUCTION_STORE_ID, price: payload.storeBuyPrice, isStore: true },
  ];
  for (const participant of payload.participants) {
    if (participant.role === "buyer") {
      offers.push({ playerId: participant.playerId, price: participant.price, isStore: false });
    }
  }
  let best = offers[0] as Offer;
  for (const offer of offers) {
    if (
      offer.price > best.price ||
      (offer.price === best.price && offer.playerId < best.playerId)
    ) {
      best = offer;
    }
  }
  return best;
}

/**
 * Best (lowest) ask among player sellers plus the store's standing sell offer.
 * Ties break to the lowest id. The store only offers to sell when it still has
 * stock of the good.
 *
 * @param payload - Current auction payload.
 * @returns The lowest ask offer, or null when no one is selling.
 */
function bestAsk(payload: AuctionPayload): Offer | null {
  const offers: Offer[] = [];
  if (payload.storeStock >= 1) {
    offers.push({ playerId: AUCTION_STORE_ID, price: payload.storeSellPrice, isStore: true });
  }
  for (const participant of payload.participants) {
    if (participant.role === "seller") {
      offers.push({ playerId: participant.playerId, price: participant.price, isStore: false });
    }
  }
  if (offers.length === 0) {
    return null;
  }
  let best = offers[0] as Offer;
  for (const offer of offers) {
    if (
      offer.price < best.price ||
      (offer.price === best.price && offer.playerId < best.playerId)
    ) {
      best = offer;
    }
  }
  return best;
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
 * Whether one unit can actually change hands between the chosen buyer and
 * seller at `price`: the buyer must be able to pay and the seller must hold a
 * unit. The store is unbounded on money (buying) and bounded only by stock
 * (selling, already checked when the ask was formed).
 *
 * @param bid - Winning buy offer.
 * @param ask - Winning sell offer.
 * @param price - Execution price (the ask price).
 * @param players - Current players tuple.
 * @param good - Good being traded.
 * @returns True when the unit trade can execute this tick.
 */
function canExecute(
  bid: Offer,
  ask: Offer,
  price: number,
  players: readonly Player[],
  good: Resource,
): boolean {
  if (!bid.isStore) {
    const buyer = playerAt(players, bid.playerId);
    if (buyer.money < price) {
      return false;
    }
  }
  if (!ask.isStore) {
    const seller = playerAt(players, ask.playerId);
    if (seller.goods[good] < 1) {
      return false;
    }
  }
  return true;
}

/**
 * Apply one unit trade to the players tuple: the buyer loses `price` dollars
 * and gains one unit; the seller gains `price` dollars and loses one unit. The
 * store side is skipped here (its stock is adjusted separately).
 *
 * @param players - Current players tuple.
 * @param bid - Winning buy offer.
 * @param ask - Winning sell offer.
 * @param price - Execution price.
 * @param good - Good being traded.
 * @returns A new players tuple with the trade applied.
 */
function applyTradeToPlayers(
  players: readonly [Player, Player, Player, Player],
  bid: Offer,
  ask: Offer,
  price: number,
  good: Resource,
): [Player, Player, Player, Player] {
  return [
    tradePlayer(players[0], bid, ask, price, good),
    tradePlayer(players[1], bid, ask, price, good),
    tradePlayer(players[2], bid, ask, price, good),
    tradePlayer(players[3], bid, ask, price, good),
  ];
}

/**
 * Return `player` with its money and goods adjusted if it is the buyer or
 * seller in the trade, otherwise unchanged.
 *
 * @param player - Player to consider.
 * @param bid - Winning buy offer.
 * @param ask - Winning sell offer.
 * @param price - Execution price.
 * @param good - Good being traded.
 * @returns The player, updated if involved in the trade.
 */
function tradePlayer(
  player: Player,
  bid: Offer,
  ask: Offer,
  price: number,
  good: Resource,
): Player {
  if (!bid.isStore && player.id === bid.playerId) {
    return {
      ...player,
      money: player.money - price,
      goods: { ...player.goods, [good]: player.goods[good] + 1 },
    };
  }
  if (!ask.isStore && player.id === ask.playerId) {
    return {
      ...player,
      money: player.money + price,
      goods: { ...player.goods, [good]: player.goods[good] - 1 },
    };
  }
  return player;
}

/**
 * Adjust store stock for a store-side trade: selling a unit lowers stock,
 * buying a unit raises it. Returns the store unchanged when neither side is
 * the store.
 *
 * @param store - Current store state.
 * @param bid - Winning buy offer.
 * @param ask - Winning sell offer.
 * @param good - Good being traded.
 * @returns The store with stock adjusted for any store-side trade.
 */
function applyTradeToStore(store: StoreState, bid: Offer, ask: Offer, good: Resource): StoreState {
  if (ask.isStore) {
    return applyBuyFromStore(store, good, 1);
  }
  if (bid.isStore) {
    return applySellToStore(store, good, 1);
  }
  return store;
}

/**
 * Advance the current good's auction by one tick: move every participant's
 * price by its intent, execute at most one unit trade while the market is
 * crossed, decrement the tick clock, and mark the auction finished when the
 * budget is spent. Pure: returns fresh state and never mutates its input.
 *
 * @param state - Current game state (must be in the auction phase).
 * @returns The next game state after one auction tick.
 */
export function auctionTick(state: GameState): GameState {
  const payload = requireAuction(state);
  // Step every participant's price first, then match on the new prices.
  const steppedParticipants = payload.participants.map(stepParticipantPrice);
  let working: AuctionPayload = { ...payload, participants: steppedParticipants };

  let players = state.players;
  let store = state.store;
  let trades = payload.trades;

  const bid = bestBid(working);
  const ask = bestAsk(working);
  // A trade happens only while the highest bid meets the lowest ask.
  if (ask !== null && bid.price >= ask.price) {
    const price = ask.price;
    if (canExecute(bid, ask, price, players, working.good)) {
      players = applyTradeToPlayers(players, bid, ask, price, working.good);
      store = applyTradeToStore(store, bid, ask, working.good);
      const trade: AuctionTrade = {
        tick: working.tick,
        buyerId: bid.playerId,
        sellerId: ask.playerId,
        price,
        quantity: 1,
      };
      trades = [...trades, trade];
    }
  }

  const tick = working.tick + 1;
  const ticksRemaining = working.ticksRemaining - 1;
  const finished = ticksRemaining <= 0;
  working = {
    ...working,
    tick,
    ticksRemaining,
    storeStock: store.stock[working.good],
    trades,
    finished,
  };

  return { ...state, players, store, phase: { kind: "auction", payload: working } };
}
