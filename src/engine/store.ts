/**
 * Store state and pure pricing/cost helpers for the M.U.L.E. engine.
 *
 * The store buys and sells food, energy, and smithore, and sells M.U.L.E.
 * units with a resource-specific outfit. Everything here is a pure data
 * shape plus pure functions over it; nothing mutates in place.
 */

import type { Resource } from "./player";
import { MULE_BASE_PRICE, OUTFIT_COST, STORE_BASE_PRICE, STORE_OPENING_STOCK } from "./constants";

/**
 * Current store state: units in stock and the buy/sell price per unit for
 * each resource. This engine uses fixed prices (see `STORE_BASE_PRICE`), so
 * `sellPrice` and `buyPrice` start equal; a future dynamic-pricing pass can
 * diverge them without changing this shape.
 */
export interface StoreState {
  readonly stock: Readonly<Record<Resource, number>>;
  /** Price per unit the store charges a player buying from it. */
  readonly sellPrice: Readonly<Record<Resource, number>>;
  /** Price per unit the store pays a player selling to it. */
  readonly buyPrice: Readonly<Record<Resource, number>>;
}

/**
 * Build the store's opening state for a new game: `STORE_OPENING_STOCK`
 * units of each resource, priced at `STORE_BASE_PRICE`.
 *
 * @returns Fresh store state.
 */
export function createInitialStoreState(): StoreState {
  return {
    stock: { ...STORE_OPENING_STOCK },
    sellPrice: { ...STORE_BASE_PRICE },
    buyPrice: { ...STORE_BASE_PRICE },
  };
}

/**
 * Total cost to buy one M.U.L.E. unit outfitted for `resource`: the flat
 * `MULE_BASE_PRICE` plus the resource-specific outfit cost.
 *
 * @param resource - Resource the M.U.L.E. will be outfitted for.
 * @returns Total dollar cost.
 */
export function computeMulePurchaseCost(resource: Resource): number {
  return MULE_BASE_PRICE + OUTFIT_COST[resource];
}

/**
 * Cost to re-outfit an already-purchased M.U.L.E. for `resource`, without
 * paying the base M.U.L.E. price again.
 *
 * @param resource - Resource to outfit the M.U.L.E. for.
 * @returns Dollar cost of the outfit alone.
 */
export function computeOutfitCost(resource: Resource): number {
  return OUTFIT_COST[resource];
}

/**
 * Total dollars a player receives for selling `quantity` units of
 * `resource` to the store, at the store's current buy price. Does not
 * clamp to store stock, since the store has no stock ceiling on buying.
 *
 * @param store - Current store state.
 * @param resource - Resource being sold.
 * @param quantity - Units being sold.
 * @returns Total dollar proceeds.
 */
export function computeSellProceeds(
  store: StoreState,
  resource: Resource,
  quantity: number,
): number {
  return store.buyPrice[resource] * quantity;
}

/**
 * Total dollars a player must pay to buy `quantity` units of `resource`
 * from the store, at the store's current sell price. Callers are
 * responsible for checking `quantity` against `store.stock[resource]`
 * before completing a purchase.
 *
 * @param store - Current store state.
 * @param resource - Resource being bought.
 * @param quantity - Units being bought.
 * @returns Total dollar cost.
 */
export function computeBuyCost(store: StoreState, resource: Resource, quantity: number): number {
  return store.sellPrice[resource] * quantity;
}

/**
 * Apply a completed sale from a player to the store: store stock for
 * `resource` increases by `quantity`. Returns a new store state; does not
 * mutate `store`.
 *
 * @param store - Current store state.
 * @param resource - Resource being sold to the store.
 * @param quantity - Units being sold.
 * @returns New store state with updated stock.
 */
export function applySellToStore(
  store: StoreState,
  resource: Resource,
  quantity: number,
): StoreState {
  return {
    ...store,
    stock: {
      ...store.stock,
      [resource]: store.stock[resource] + quantity,
    },
  };
}

/**
 * Apply a completed purchase from the store to a player: store stock for
 * `resource` decreases by `quantity`. Returns a new store state; does not
 * mutate `store`. Callers must ensure `quantity` does not exceed current
 * stock, since this function does not clamp.
 *
 * @param store - Current store state.
 * @param resource - Resource being bought from the store.
 * @param quantity - Units being bought.
 * @returns New store state with updated stock.
 */
export function applyBuyFromStore(
  store: StoreState,
  resource: Resource,
  quantity: number,
): StoreState {
  return {
    ...store,
    stock: {
      ...store.stock,
      [resource]: store.stock[resource] - quantity,
    },
  };
}
