/**
 * Auction-phase AI strategy for the M.U.L.E. engine.
 *
 * Pure decision function: given the current game state and the AI's player
 * id, choose the next auction action (role or intent), or null when the
 * player already sits in its desired role and intent this tick.
 *
 * Role and target price are both derived from need/surplus: a player short
 * of the auctioned good relative to a fixed target stock buys, raising its
 * bid toward the store's sell price (never overpaying versus the store) so
 * it crosses a seller's ask; a player with surplus sells, lowering its ask
 * toward the store's buy price (never underselling versus the store) so it
 * crosses a buyer's bid. A player at its target sits the good out. The AI
 * also keeps a food-safety money reserve: it never declares a buyer role
 * that could spend it below the reserve.
 *
 * DOM-free by design: no mutation, no randomness, no module-level state.
 */

import type {
  Action,
  AuctionIntent,
  AuctionParticipant,
  AuctionRole,
  GameState,
} from "../engine/game_state";
import type { Resource } from "../engine/player";
import { ENERGY_UPKEEP_BASE, FOOD_UPKEEP_BASE, STORE_BASE_PRICE } from "../engine/constants";

/**
 * Money the AI keeps in reserve at all times, matching the develop-phase
 * reserve so a player never bids away the cash it needs for emergency food.
 */
const AI_MONEY_RESERVE = STORE_BASE_PRICE.food * 10;

/**
 * Target stock level per resource: the inventory a player tries to hold
 * going into the next round. Food and energy targets are three rounds of
 * upkeep at the base rate, a comfortable buffer; smithore targets a flat
 * stockpile for future outfit purchases, since it has no upkeep of its own.
 */
const AUCTION_TARGET_STOCK: Readonly<Record<Resource, number>> = {
  food: FOOD_UPKEEP_BASE * 3,
  energy: ENERGY_UPKEEP_BASE * 3,
  smithore: 5,
};

/**
 * Find `playerId`'s participant entry, or null if the id has no entry.
 *
 * @param participants - Current auction participants.
 * @param playerId - Player id to find.
 * @returns The matching participant, or null.
 */
function findParticipant(
  participants: readonly AuctionParticipant[],
  playerId: number,
): AuctionParticipant | null {
  for (const participant of participants) {
    if (participant.playerId === playerId) {
      return participant;
    }
  }
  return null;
}

/**
 * Decide the desired role for `playerId` given the good's target stock and
 * the player's money reserve: buy when short of target and affording it
 * would not dip below the reserve, sell when in surplus, otherwise sit out.
 *
 * @param stock - Player's current inventory of the auctioned good.
 * @param target - Target stock level for the good.
 * @param money - Player's current money.
 * @param storeBuyPrice - Store's buy price, used as a worst-case buy cost.
 * @returns The desired auction role.
 */
function desiredRole(
  stock: number,
  target: number,
  money: number,
  storeBuyPrice: number,
): AuctionRole {
  if (stock < target) {
    if (money - storeBuyPrice >= AI_MONEY_RESERVE) {
      return "buyer";
    }
    return "out";
  }
  if (stock > target) {
    return "seller";
  }
  return "out";
}

/**
 * Clamp `value` into the auction price band.
 *
 * @param value - Raw value to clamp.
 * @param priceFloor - Auction price floor.
 * @param priceCeiling - Auction price ceiling.
 * @returns The value bounded to `[priceFloor, priceCeiling]`.
 */
function clampToBand(value: number, priceFloor: number, priceCeiling: number): number {
  return Math.max(priceFloor, Math.min(priceCeiling, value));
}

/**
 * Decide the desired price intent for a role: a trade only executes once the
 * highest bid meets the lowest ask, so buyers must raise their bid and
 * sellers must lower their ask to cross. A buyer walks its price up toward a
 * limit (the cheaper of the store's sell price, so it never overpays versus
 * just buying from the store, and what it can afford while keeping its money
 * reserve). A seller walks its price down toward a floor (the store's buy
 * price, so it never undersells versus just selling to the store). A player
 * already at its target price holds.
 *
 * @param role - The player's current or desired role.
 * @param price - The player's current price.
 * @param priceFloor - Auction price floor.
 * @param priceCeiling - Auction price ceiling.
 * @param storeBuyPrice - Store's buy price (the seller's floor target).
 * @param storeSellPrice - Store's sell price (the buyer's ceiling target).
 * @param money - The player's current money, used to bound the buyer's limit.
 * @returns The desired price intent.
 */
function desiredIntent(
  role: AuctionRole,
  price: number,
  priceFloor: number,
  priceCeiling: number,
  storeBuyPrice: number,
  storeSellPrice: number,
  money: number,
): AuctionIntent {
  if (role === "buyer") {
    const limit = clampToBand(
      Math.min(storeSellPrice, money - AI_MONEY_RESERVE),
      priceFloor,
      priceCeiling,
    );
    return price < limit ? "up" : "hold";
  }
  if (role === "seller") {
    const floorTarget = clampToBand(storeBuyPrice, priceFloor, priceCeiling);
    return price > floorTarget ? "down" : "hold";
  }
  return "hold";
}

/**
 * Decide the next auction action for `playerId`. Returns null when no
 * action is needed this tick: the game is not in the auction phase, the
 * player has no participant entry, the auction has already finished, or the
 * player's role and intent already match the desired values. Always
 * resolves to a role of `out` (never buyer/seller) in every degenerate case,
 * so the AI can never softlock the sequencer.
 *
 * @param state - Current game state.
 * @param playerId - AI player id deciding.
 * @returns The next action for this player, or null if nothing to do.
 */
export function decideAuctionActions(state: GameState, playerId: number): Action | null {
  if (state.phase.kind !== "auction") {
    return null;
  }
  const payload = state.phase.payload;
  if (payload.finished) {
    return null;
  }
  const participant = findParticipant(payload.participants, playerId);
  if (participant === null) {
    return null;
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return null;
  }

  const target = AUCTION_TARGET_STOCK[payload.good];
  const stock = player.goods[payload.good];
  const role = desiredRole(stock, target, player.money, payload.storeBuyPrice);

  if (participant.role !== role) {
    return { type: "set_auction_role", playerId, role };
  }

  const intent = desiredIntent(
    role,
    participant.price,
    payload.priceFloor,
    payload.priceCeiling,
    payload.storeBuyPrice,
    payload.storeSellPrice,
    player.money,
  );
  if (participant.intent !== intent) {
    return { type: "set_auction_intent", playerId, intent };
  }

  return null;
}
