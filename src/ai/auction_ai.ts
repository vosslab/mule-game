/**
 * Auction-phase AI strategy for the M.U.L.E. engine.
 *
 * Pure decision function: given the current game state and the AI's player
 * id, choose the next auction action (role or intent), or null when the
 * player already sits in its desired role and intent this tick.
 *
 * Role and target price both derive from planet_mule's per-resource critical
 * threshold (`auctionResourceCritical`): a player holding less than the good's
 * critical amount buys, walking its bid up toward the store's sell price (never
 * overpaying versus the store) so it crosses a seller's ask; a player holding
 * more than critical sells, walking its ask down toward the store's buy price
 * (never underselling versus the store) so it crosses a buyer's bid -- and
 * since smithore and crystite are never critical (target 0), any holder sells
 * every unit. A player already at its critical target sits the good out. The AI
 * also keeps a food-safety money reserve: it never declares a buyer role that
 * could spend it below the reserve.
 *
 * The buyer's price ceiling also scales by the deciding player's persona
 * buyer-price factor (see `personas.ts`), capped at 1
 * for every personality so a personality can only ever buy more cautiously
 * than the baseline, never pay past the store's sell price.
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
import { auctionResourceCritical } from "../engine/auction";
import { STORE_BASE_PRICE } from "../engine/constants";
import { personaParamsForPlayer } from "./personas";

/**
 * Money the AI keeps in reserve at all times, matching the develop-phase
 * reserve so a player never bids away the cash it needs for emergency food.
 */
const AI_MONEY_RESERVE = STORE_BASE_PRICE.food * 10;

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
 * Decide the desired role for `playerId` given the good's critical target and
 * the player's money reserve: sell when holding more than the target, buy when
 * holding less (only when affording it keeps the reserve intact), otherwise sit
 * out. Smithore and crystite have a critical target of 0, so any holder sells
 * every unit and a non-holder sits out.
 *
 * @param holdings - Player's current inventory of the auctioned good.
 * @param target - The good's critical target for the player.
 * @param money - Player's current money.
 * @param storeBuyPrice - Store's buy price, used as a worst-case buy cost.
 * @returns The desired auction role.
 */
function desiredRole(
  holdings: number,
  target: number,
  money: number,
  storeBuyPrice: number,
): AuctionRole {
  if (holdings > target) {
    return "seller";
  }
  if (holdings < target) {
    if (money - storeBuyPrice >= AI_MONEY_RESERVE) {
      return "buyer";
    }
    return "out";
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
 * highest bid meets the lowest ask, so buyers must raise their bid and sellers
 * must lower their ask to cross. A buyer walks its price up toward a limit (the
 * cheaper of the store's sell price, so it never overpays versus buying from the
 * store, and what it can afford while keeping its money reserve). A seller walks
 * its price down toward a floor (the store's buy price, so it never undersells
 * versus selling to the store). A player already at its target price holds.
 *
 * @param role - The player's current or desired role.
 * @param price - The player's current price.
 * @param priceFloor - Auction price floor.
 * @param priceCeiling - Auction price ceiling.
 * @param storeBuyPrice - Store's buy price (the seller's floor target).
 * @param storeSellPrice - Store's sell price (the buyer's ceiling target).
 * @param money - The player's current money, used to bound the buyer's limit.
 * @param buyerLimitFactor - The deciding player's persona buyer-price factor
 *   (see `personas.ts`), capped at 1 for every
 *   personality so this never raises the buyer's ceiling above
 *   `storeSellPrice` -- only ever holds it at or below the plain baseline.
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
  buyerLimitFactor: number,
): AuctionIntent {
  if (role === "buyer") {
    const limit = clampToBand(
      Math.min(storeSellPrice * buyerLimitFactor, money - AI_MONEY_RESERVE),
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
 * Decide the next auction action for `playerId`. Returns null when no action
 * is needed this tick: the game is not in the auction phase, the auction has
 * finished (or was skipped), the player has no participant entry, or the
 * player's role and intent already match the desired values. Always resolves to
 * a role of `out` (never buyer/seller) in every degenerate case, so the AI can
 * never softlock the sequencer.
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

  const target = auctionResourceCritical(payload.good, playerId, state.plots, state.round);
  const holdings = player.goods[payload.good];
  const role = desiredRole(holdings, target, player.money, payload.storeBuyPrice);

  if (participant.role !== role) {
    return { type: "set_auction_role", playerId, role };
  }

  // The deciding player's persona buyer-price factor, or
  // 1 (identical to pre-persona behavior) for the human seat.
  const persona = personaParamsForPlayer(state, playerId);
  const intent = desiredIntent(
    role,
    participant.price,
    payload.priceFloor,
    payload.priceCeiling,
    payload.storeBuyPrice,
    payload.storeSellPrice,
    player.money,
    persona.auctionBuyerLimitFactor,
  );
  if (participant.intent !== intent) {
    return { type: "set_auction_intent", playerId, intent };
  }

  return null;
}
