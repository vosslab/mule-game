/**
 * Tick-based goods-auction engine for the M.U.L.E. engine.
 *
 * One good is auctioned per window, in planet_mule's fixed order smithore,
 * crystite, food, energy (see `AUCTION_GOOD_ORDER` in turn.ts). Each window is
 * a spatial price line bounded by the good's live store quotes: the band runs
 * from the store's buy quote (`priceFloor`, where the store bids for units) up
 * to the store's sell quote (`priceCeiling`, where the store offers its stock).
 * Because the band is always exactly the store's spread wide, it can never
 * collapse the way the retired global [5, 100] band did once dynamic prices
 * climbed past 100.
 *
 * At window start every player is auto-assigned a role from planet_mule's
 * per-resource critical threshold: a player holding more of the good than its
 * critical amount is a seller, everyone else a buyer (crystite and smithore are
 * never critical, so any holder sells; food critical is next develop turn's
 * requirement, energy critical is that player's powered-M.U.L.E. count plus
 * one). Buyers enter at the band floor and walk up; sellers enter at the ceiling
 * and walk down. A player (human) may override its role and intent mid-window.
 *
 * Each tick every participant's price steps by the good's `priceStep` in its
 * intent's direction (crystite 4, others 1), clamped to the band, then at most
 * one unit trades between the highest buyer and the lowest seller while the
 * market is crossed. The store participates on both sides: it sells its
 * remaining stock at the ceiling and buys unlimited units at the floor. A trade
 * executes at the seller's resting ask. Money moves from buyer to seller and one
 * unit the other way, so player money and total goods (players plus store stock)
 * are conserved -- except crystite sold to the store, which the store sinks
 * (its crystite stock stays zero, matching planet_mule's store-only-buyer
 * crystite market).
 *
 * The window's clock maps planet_mule's real-time auction timer (which runs
 * slow while avatars walk and pauses during a transaction) onto quiet ticks:
 * `ticksRemaining` decrements only on a tick where no participant moved and no
 * transaction is in progress. A run of `AUCTION_IDLE_TIMEOUT` consecutive quiet
 * ticks ends the window early, and `AUCTION_MAX_TICKS` is a hard safety ceiling.
 * When the window is unavailable (no stock and no holder) or it is the last
 * round, the window is created already `skipped` and `finished`, matching
 * planet_mule's `skipAuction`. The driver dispatches `end_auction` on finish so
 * the turn sequencer advances to the next good, round, or scoring.
 *
 * This module never mutates its inputs; every function returns fresh state. The
 * engine is DOM-free by design.
 */

import type { Player, Resource } from "./player";
import type {
  AuctionIntent,
  AuctionParticipant,
  AuctionPayload,
  AuctionRole,
  AuctionTrade,
  GameState,
  Plot,
} from "./game_state";
import type { StoreState } from "./store";
import { applyBuyFromStore, applySellToStore, storeBuyQuote, storeSellQuote } from "./store";
import {
  AUCTION_IDLE_TIMEOUT,
  AUCTION_MAX_TICKS,
  AUCTION_PRICE_STEP_BY_GOOD,
  AUCTION_QUIET_TICK_BUDGET,
  AUCTION_TRANSFER_BASE_TICKS,
  AUCTION_TRANSFER_DECREASE_TICKS,
  AUCTION_TRANSFER_MIN_TICKS,
  AUCTION_TRANSFER_START_TICKS,
  FOOD_REQUIREMENTS_BY_ROUND,
  ROUND_COUNT_BY_MODE,
} from "./constants";

/**
 * Sentinel participant id used in an `AuctionTrade` when the store is the
 * buyer or seller. It sits above every real player id (0..3) so players win
 * price ties against the store when offers are ranked.
 */
export const AUCTION_STORE_ID = 4;

/** Number of players in the game. */
const PLAYER_COUNT = 4;

/**
 * The planet_mule food-requirements index has an upper bound of 12 (a
 * 12-round standard game); a longer game clamps to the last entry.
 */
const FOOD_REQ_MAX_INDEX = 12;

/**
 * Clamp a price into a good's live band `[priceFloor, priceCeiling]`.
 *
 * @param price - Raw price to clamp.
 * @param priceFloor - Band floor (the store's buy quote for the good).
 * @param priceCeiling - Band ceiling (the store's sell quote for the good).
 * @returns The price bounded to the band.
 */
function clampToBand(price: number, priceFloor: number, priceCeiling: number): number {
  if (price < priceFloor) {
    return priceFloor;
  }
  if (price > priceCeiling) {
    return priceCeiling;
  }
  return price;
}

/**
 * Count the M.U.L.E.s a player has installed that draw power (every outfit
 * except energy), which is that player's energy requirement -- the input to
 * their energy critical threshold.
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param playerId - Player whose installed M.U.L.E.s to count.
 * @returns The count of the player's powered (non-energy) M.U.L.E.s.
 */
function poweredMuleCount(plots: readonly (readonly Plot[])[], playerId: number): number {
  let count = 0;
  for (const row of plots) {
    for (const plot of row) {
      if (plot.owner === playerId && plot.muleOutfit !== null && plot.muleOutfit !== "energy") {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * The critical amount of a good a player wants to hold going into the next
 * develop turn, from planet_mule's `Player.getResourceCritical(resource, n,
 * n2)` (`Player.java` lines 456-467), called with `n = gameModel.getRound()`
 * from `AbstractAuctionPhase.begin` (`AbstractAuctionPhase.java` line 118:
 * `player.getResourceCritical(resource, this.model)`) once per player at the
 * start of each good's auction window. Food critical reads
 * `foodRequirements[n + 1]` (`Player.java` line 464). Under this engine's
 * corrected 1-based `getRound()` premise (see docs/RULE_SOURCES.md, "Food
 * requirement index"), PM's round counter equals this engine's round `R`
 * throughout round `R`'s auction windows with no shift, so `n = R` and the
 * index is `min(R + 1, 12)`: this engine's round `R` auction anticipates round
 * `R + 1`'s develop-turn requirement, one round ahead. Energy critical is the
 * player's powered-M.U.L.E. count plus one; smithore and crystite are never
 * critical (0), so any holder sells.
 *
 * @param good - Good being auctioned.
 * @param playerId - Player whose critical to compute.
 * @param plots - Full board grid (energy critical reads it).
 * @param round - This engine's 1-based current round.
 * @returns The player's critical holding for the good.
 */
export function auctionResourceCritical(
  good: Resource,
  playerId: number,
  plots: readonly (readonly Plot[])[],
  round: number,
): number {
  if (good === "food") {
    const index = Math.min(round + 1, FOOD_REQ_MAX_INDEX);
    return FOOD_REQUIREMENTS_BY_ROUND[index] ?? 0;
  }
  if (good === "energy") {
    return poweredMuleCount(plots, playerId) + 1;
  }
  // Smithore and crystite are never critical: any holder defaults to seller.
  return 0;
}

/**
 * Auto-assign a player's role for a good: seller when they hold more than the
 * good's critical amount, buyer otherwise. Matches planet_mule's
 * `AbstractAuctionPhase.begin` (start buyer, flip to seller when
 * `getResource(resource) > getResourceCritical(resource, model)`).
 *
 * @param good - Good being auctioned.
 * @param player - Player being assigned.
 * @param plots - Full board grid (energy critical reads it).
 * @param round - This engine's 1-based current round.
 * @returns The player's initial role.
 */
function initialRole(
  good: Resource,
  player: Player,
  plots: readonly (readonly Plot[])[],
  round: number,
): AuctionRole {
  const critical = auctionResourceCritical(good, player.id, plots, round);
  return player.goods[good] > critical ? "seller" : "buyer";
}

/**
 * Whether any trade is possible in a good's window, so it is worth running a
 * trading phase. A trade needs a supplier and a demander:
 *
 * - A seller (a player holding more than critical) can always trade, since the
 *   store is a standing buyer -- so any seller makes trade possible.
 * - Otherwise a real buyer (a player holding strictly less than critical, so it
 *   genuinely needs the good) can only trade when the store holds stock to sell.
 *
 * planet_mule skips a window whose supply side is empty (`goodsForSale`: no
 * store stock and no seller). This engine skips a superset: it also skips a
 * window whose demand side is empty (store stock but no seller and no
 * below-critical buyer), because those windows -- most often a smithore or
 * crystite window where nobody mined and the store holds leftover stock nobody
 * needs -- can only ever time out with no trade. The extra demand-side skip is
 * a deliberate quality extension beyond planet_mule's supply-only skip (PM lets
 * such windows run and quietly expire); it keeps the sim's dead-window rate
 * measuring windows where a wanted trade actually failed. See
 * docs/RULE_SOURCES.md, "Goods auction: bands, roles, timing, transfer".
 *
 * @param state - Current game state.
 * @param good - Good being auctioned.
 * @param roles - Each player's auto-assigned role for this window, by id.
 * @param round - This engine's 1-based current round.
 * @returns True when at least one trade could happen.
 */
function tradePossible(
  state: GameState,
  good: Resource,
  roles: readonly AuctionRole[],
  round: number,
): boolean {
  for (const role of roles) {
    if (role === "seller") {
      return true;
    }
  }
  if (state.store.stock[good] <= 0) {
    return false;
  }
  for (const player of state.players) {
    if (player.goods[good] < auctionResourceCritical(good, player.id, state.plots, round)) {
      return true;
    }
  }
  return false;
}

/**
 * Build the initial auction sub-state for a good. The band runs from the
 * store's live buy quote (floor) to its sell quote (ceiling). When the good is
 * unavailable or it is the last round, the window is created already `skipped`
 * and `finished` (planet_mule's `skipAuction`), with every player left out.
 * Otherwise each player is auto-assigned a role from its critical threshold,
 * buyers seated at the floor walking up and sellers at the ceiling walking down.
 *
 * @param state - Current game state (its store supplies prices and stock).
 * @param good - Good being auctioned.
 * @returns A fresh auction payload ready for its first tick.
 */
export function createAuctionPayload(state: GameState, good: Resource): AuctionPayload {
  const store = state.store;
  const storeBuyPrice = storeBuyQuote(store, good);
  const storeSellPrice = storeSellQuote(store, good);
  const priceFloor = storeBuyPrice;
  const priceCeiling = storeSellPrice;
  const priceStep = AUCTION_PRICE_STEP_BY_GOOD[good];
  // Auto-assign every player's role from its critical threshold first: the
  // roles decide whether anything is for sale, hence whether the window skips.
  const roles: AuctionRole[] = [];
  for (let playerId = 0; playerId < PLAYER_COUNT; playerId += 1) {
    const player = playerAt(state.players, playerId);
    roles.push(initialRole(good, player, state.plots, state.round));
  }
  const isLastRound = state.round >= ROUND_COUNT_BY_MODE[state.mode];
  const skipped = isLastRound || !tradePossible(state, good, roles, state.round);

  const participants: AuctionParticipant[] = [];
  for (let playerId = 0; playerId < PLAYER_COUNT; playerId += 1) {
    const role = roles[playerId] as AuctionRole;
    if (role === "seller") {
      participants.push({ playerId, role, price: priceCeiling, intent: "down" });
    } else {
      participants.push({ playerId, role, price: priceFloor, intent: "up" });
    }
  }

  return {
    good,
    tick: 0,
    ticksRemaining: skipped ? 0 : AUCTION_QUIET_TICK_BUDGET,
    priceFloor,
    priceCeiling,
    storeBuyPrice,
    storeSellPrice,
    storeStock: store.stock[good],
    priceStep,
    idleTicks: 0,
    tradeCooldown: 0,
    runUnits: 0,
    participants,
    trades: [],
    skipped,
    finished: skipped,
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
 * Move a participant's price one step (the good's `priceStep`) in its intent's
 * direction, clamped to the band. A `hold` intent leaves the price unchanged.
 * An `out` participant never moves regardless of intent: sitting the good out
 * freezes their price so a stale intent set before they went out cannot drift
 * it. This mirrors planet_mule, where a non-participating player is off the
 * price track entirely (`AuctionState.inAuction=false`,
 * view/AuctionPainter.java:188-215), so their figure is never a live price.
 *
 * @param participant - Participant to move.
 * @param step - The good's per-tick price step.
 * @param priceFloor - Band floor.
 * @param priceCeiling - Band ceiling.
 * @returns The participant with an updated price.
 */
function stepParticipantPrice(
  participant: AuctionParticipant,
  step: number,
  priceFloor: number,
  priceCeiling: number,
): AuctionParticipant {
  // An out participant is not trading, so their price is frozen by construction.
  if (participant.role === "out" || participant.intent === "hold") {
    return participant;
  }
  const delta = participant.intent === "up" ? step : -step;
  return {
    ...participant,
    price: clampToBand(participant.price + delta, priceFloor, priceCeiling),
  };
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
 * A crossed, executable buyer/seller pair chosen by the matcher for one tick.
 */
interface MatchedPair {
  readonly bid: Offer;
  readonly ask: Offer;
}

/**
 * Order two bids best-first: higher price wins, then the lower playerId. A
 * player resting at the store's price therefore ranks above the store, since
 * `AUCTION_STORE_ID` sits above every real player id.
 *
 * @param a - First bid.
 * @param b - Second bid.
 * @returns Negative when `a` should rank before `b`.
 */
function compareBids(a: Offer, b: Offer): number {
  if (a.price !== b.price) {
    // Higher price is the better bid, so it sorts first (descending price).
    return b.price - a.price;
  }
  return a.playerId - b.playerId;
}

/**
 * Order two asks best-first: lower price wins, then the lower playerId.
 *
 * @param a - First ask.
 * @param b - Second ask.
 * @returns Negative when `a` should rank before `b`.
 */
function compareAsks(a: Offer, b: Offer): number {
  if (a.price !== b.price) {
    // Lower price is the better ask, so it sorts first (ascending price).
    return a.price - b.price;
  }
  return a.playerId - b.playerId;
}

/**
 * Every bid (player buyers plus the store's standing buy offer) ranked
 * best-first by price descending, then lowest playerId. The store always bids,
 * since it buys unlimited units, so the list is never empty.
 *
 * @param payload - Current auction payload.
 * @returns Bids ordered best-first.
 */
function rankedBids(payload: AuctionPayload): Offer[] {
  const offers: Offer[] = [
    { playerId: AUCTION_STORE_ID, price: payload.storeBuyPrice, isStore: true },
  ];
  for (const participant of payload.participants) {
    if (participant.role === "buyer") {
      offers.push({ playerId: participant.playerId, price: participant.price, isStore: false });
    }
  }
  offers.sort(compareBids);
  return offers;
}

/**
 * Every ask (player sellers plus the store's standing sell offer) ranked
 * best-first by price ascending, then lowest playerId. The store only offers to
 * sell when it still holds stock of the good (so it never sells crystite, which
 * it holds zero of). The list is empty when no one is selling.
 *
 * @param payload - Current auction payload.
 * @returns Asks ordered best-first (possibly empty).
 */
function rankedAsks(payload: AuctionPayload): Offer[] {
  const offers: Offer[] = [];
  if (payload.storeStock >= 1) {
    offers.push({ playerId: AUCTION_STORE_ID, price: payload.storeSellPrice, isStore: true });
  }
  for (const participant of payload.participants) {
    if (participant.role === "seller") {
      offers.push({ playerId: participant.playerId, price: participant.price, isStore: false });
    }
  }
  offers.sort(compareAsks);
  return offers;
}

/**
 * Select the one unit trade to execute this tick, or `null` when no crossed,
 * solvent pair exists. Scans bid-major (best bid first) and ask-minor (best ask
 * first), so the executed pair maximizes bid price, then minimizes ask price,
 * then prefers the lowest playerIds -- degenerating to the top bid/top ask pair
 * whenever that pair is itself solvent.
 *
 * An insolvent or out-of-goods participant does not block the market: it is
 * skipped and the scan continues to the next eligible offer, matching the
 * original's self-withdrawal (an out-of-money buyer or out-of-goods seller
 * leaves the live set rather than stalling every trade behind it). A
 * store-to-store crossing is never a real trade, so it is skipped.
 *
 * @param payload - Current auction payload (participants already stepped).
 * @param players - Current players tuple.
 * @param good - Good being traded.
 * @returns The chosen crossed, executable pair, or `null` when none exists.
 */
function selectTrade(
  payload: AuctionPayload,
  players: readonly Player[],
  good: Resource,
): MatchedPair | null {
  const bids = rankedBids(payload);
  const asks = rankedAsks(payload);
  for (const bid of bids) {
    for (const ask of asks) {
      // Asks are ranked cheapest-first, so once this bid fails to cross the
      // current ask it cannot cross any later (pricier) ask either.
      if (bid.price < ask.price) {
        break;
      }
      // A store-to-store crossing is never a real trade; try the next ask.
      if (bid.isStore && ask.isStore) {
        continue;
      }
      if (canExecute(bid, ask, ask.price, players, good)) {
        return { bid, ask };
      }
      // canExecute failed. Buyer solvency is the only price-dependent check,
      // and remaining asks only get pricier, so a buyer that cannot afford this
      // ask cannot afford any later one: withdraw it and move to the next bid.
      // Otherwise the seller is out of goods -- skip that ask and keep scanning
      // cheaper-first for this bid.
      if (!bid.isStore && playerAt(players, bid.playerId).money < ask.price) {
        break;
      }
    }
  }
  return null;
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
 * buying a unit raises it -- except crystite bought from a player, which the
 * store sinks (its crystite stock stays zero, planet_mule's store-only-buyer
 * crystite market). Returns the store unchanged when neither side is the store.
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
    if (good === "crystite") {
      // The store buys crystite from players but never accumulates it.
      return store;
    }
    return applySellToStore(store, good, 1);
  }
  return store;
}

/**
 * Cooldown (in ticks) imposed after trading a unit before the next unit may
 * trade in the same contiguous transaction run: the first unit's cooldown is
 * the fast `AUCTION_TRANSFER_START_TICKS`; each later unit starts from
 * `AUCTION_TRANSFER_BASE_TICKS` and shrinks by `AUCTION_TRANSFER_DECREASE_TICKS`
 * per unit, floored at `AUCTION_TRANSFER_MIN_TICKS`. Maps planet_mule's
 * transaction transfer-rate curve onto ticks.
 *
 * @param unitsTradedInRun - Units traded so far in the current run (>= 1).
 * @returns Ticks until the next unit may trade.
 */
function transferCooldown(unitsTradedInRun: number): number {
  if (unitsTradedInRun <= 1) {
    return AUCTION_TRANSFER_START_TICKS;
  }
  const decayed =
    AUCTION_TRANSFER_BASE_TICKS - (unitsTradedInRun - 1) * AUCTION_TRANSFER_DECREASE_TICKS;
  return Math.max(decayed, AUCTION_TRANSFER_MIN_TICKS);
}

/**
 * The outcome of one tick's trade attempt: the possibly-updated players, store,
 * trade log, transaction-run counters, and whether a unit traded this tick.
 */
interface TradeOutcome {
  readonly players: readonly [Player, Player, Player, Player];
  readonly store: StoreState;
  readonly trades: readonly AuctionTrade[];
  readonly tradeCooldown: number;
  readonly runUnits: number;
  readonly traded: boolean;
}

/**
 * Resolve one tick's trade: decrement an active transaction cooldown, or (when
 * off cooldown) execute at most one unit while the market is crossed, or reset
 * the run when nothing crosses. A store-to-store crossing is never a real
 * trade, so it is excluded.
 *
 * @param payload - The stepped payload (participants already moved this tick).
 * @param players - Current players tuple.
 * @param store - Current store state.
 * @param trades - Running trade log.
 * @returns The trade outcome for this tick.
 */
function resolveTrade(
  payload: AuctionPayload,
  players: readonly [Player, Player, Player, Player],
  store: StoreState,
  trades: readonly AuctionTrade[],
): TradeOutcome {
  if (payload.tradeCooldown > 0) {
    // Mid-transaction: metering the transfer rate, no unit trades this tick.
    return {
      players,
      store,
      trades,
      tradeCooldown: payload.tradeCooldown - 1,
      runUnits: payload.runUnits,
      traded: false,
    };
  }

  const match = selectTrade(payload, players, payload.good);
  if (match !== null) {
    const bid = match.bid;
    const ask = match.ask;
    const price = ask.price;
    const nextPlayers = applyTradeToPlayers(players, bid, ask, price, payload.good);
    const nextStore = applyTradeToStore(store, bid, ask, payload.good);
    const trade: AuctionTrade = {
      tick: payload.tick,
      buyerId: bid.playerId,
      sellerId: ask.playerId,
      price,
      quantity: 1,
    };
    const runUnits = payload.runUnits + 1;
    return {
      players: nextPlayers,
      store: nextStore,
      trades: [...trades, trade],
      tradeCooldown: transferCooldown(runUnits),
      runUnits,
      traded: true,
    };
  }

  // Nothing crossed: end any active transaction run.
  return {
    players,
    store,
    trades,
    tradeCooldown: 0,
    runUnits: 0,
    traded: false,
  };
}

/**
 * Whether any participant's price changed between the pre- and post-step
 * arrays this tick (a clamped participant does not count as moving).
 *
 * @param before - Participants before stepping.
 * @param after - Participants after stepping.
 * @returns True when at least one participant's price changed.
 */
function anyMoved(
  before: readonly AuctionParticipant[],
  after: readonly AuctionParticipant[],
): boolean {
  for (let index = 0; index < after.length; index += 1) {
    const previous = before[index];
    const current = after[index];
    if (previous !== undefined && current !== undefined && previous.price !== current.price) {
      return true;
    }
  }
  return false;
}

/**
 * Advance the current good's auction by one tick: move every participant's
 * price by the good's step, resolve at most one unit trade (respecting the
 * transfer-rate cooldown), then advance the clock. The quiet-tick countdown
 * decrements only on a tick where nothing moved and no transaction is in
 * progress; the window finishes on a spent countdown, an idle-timeout run of
 * quiet ticks, or the hard tick ceiling. A skipped or finished window is a
 * no-op. Pure: returns fresh state and never mutates its input.
 *
 * @param state - Current game state (must be in the auction phase).
 * @returns The next game state after one auction tick.
 */
export function auctionTick(state: GameState): GameState {
  const payload = requireAuction(state);
  if (payload.finished) {
    return state;
  }

  // Step every participant's price first, then match on the new prices.
  const steppedParticipants = payload.participants.map((participant) =>
    stepParticipantPrice(participant, payload.priceStep, payload.priceFloor, payload.priceCeiling),
  );
  const moved = anyMoved(payload.participants, steppedParticipants);
  const stepped: AuctionPayload = { ...payload, participants: steppedParticipants };

  const outcome = resolveTrade(stepped, state.players, state.store, payload.trades);

  // A tick is "active" (not quiet) when someone moved, a unit traded, or a
  // transaction cooldown is still running -- mapping planet_mule's timer, which
  // runs slow while avatars walk and pauses during a transaction.
  const inTransaction = outcome.traded || outcome.tradeCooldown > 0;
  const quiet = !moved && !inTransaction;

  const tick = payload.tick + 1;
  const idleTicks = quiet ? payload.idleTicks + 1 : 0;
  const ticksRemaining = quiet ? payload.ticksRemaining - 1 : payload.ticksRemaining;
  const finished =
    ticksRemaining <= 0 || idleTicks >= AUCTION_IDLE_TIMEOUT || tick >= AUCTION_MAX_TICKS;

  const working: AuctionPayload = {
    ...stepped,
    tick,
    ticksRemaining,
    idleTicks,
    tradeCooldown: outcome.tradeCooldown,
    runUnits: outcome.runUnits,
    storeStock: outcome.store.stock[payload.good],
    trades: outcome.trades,
    finished,
  };

  return {
    ...state,
    players: outcome.players,
    store: outcome.store,
    phase: { kind: "auction", payload: working },
  };
}
