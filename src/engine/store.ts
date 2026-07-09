/**
 * Store state and pure pricing/cost helpers for the M.U.L.E. engine.
 *
 * The store buys and sells food, energy, and smithore, and sells M.U.L.E.
 * units with a resource-specific outfit. Everything here is a pure data
 * shape plus pure functions over it; nothing mutates in place.
 */

import type { Player, Resource } from "./player";
import type { AuctionTrade, Plot } from "./game_state";
import type { Rng } from "./rng";
import { RESOURCES } from "./player";
import { normalDistributed } from "./rng";
import {
  FOOD_REQUIREMENTS_BY_ROUND,
  MULE_BASE_PRICE,
  MULE_PRICE_FLOOR_STEP,
  MULE_PRICE_SMITHORE_MULT,
  MULE_STOCK_CAP,
  OUTFIT_COST,
  SMITHORE_PER_MULE,
  STORE_BASE_PRICE,
  STORE_BUY_MARGIN_BY_GOOD,
  STORE_CRYSTITE_PRICE_DEVIANCE,
  STORE_CRYSTITE_PRICE_MULTIPLE,
  STORE_MULE_NEED_CAP,
  STORE_MULE_STOCK_INITIAL,
  STORE_OPENING_STOCK,
  STORE_PRICE_CEILING,
  STORE_PRICE_FLOOR_BY_GOOD,
  STORE_PRICE_RATIO_BASE,
  STORE_PRICE_RATIO_SLOPE,
  STORE_SELL_SPREAD_BY_GOOD,
  STORE_SMITHORE_JITTER_AMPLITUDE,
  STORE_SMITHORE_PRICE_FLOOR,
  STORE_SMITHORE_RATIO_MAX,
  STORE_SMITHORE_RATIO_MIN,
  STORE_STOCK_CAP,
} from "./constants";

/**
 * Current store state: units in stock, the M.U.L.E. count and price, the
 * central base price per good, and the live buy/sell quotes derived from it.
 *
 * `prices` is planet_mule's `ResourcePrices.price` field per good: the central
 * price the round-boundary recalc (`updateStoreForNewRound`) multiplies by the
 * supply/demand factor. `buyPrice` (what the store pays a seller) and
 * `sellPrice` (what it charges a buyer) are always derived from `prices` via
 * `deriveGoodQuote`, so they carry planet_mule's per-good spread and never
 * start equal. `muleStock` feeds the smithore mules-available figure and is
 * the live M.U.L.E. inventory `applyBuyMule` (turn.ts) and `rebuildMules`
 * mutate; `mulePrice` is the live dollar cost of one
 * M.U.L.E., recomputed each round boundary by `rebuildMules` from the current
 * smithore price.
 */
export interface StoreState {
  readonly stock: Readonly<Record<Resource, number>>;
  /** M.U.L.E. units the store holds; decremented by purchase, rebuilt each round. */
  readonly muleStock: number;
  /** Current dollar cost of one M.U.L.E. unit (before outfit cost). */
  readonly mulePrice: number;
  /** Central base price per good (planet_mule `ResourcePrices.price`). */
  readonly prices: Readonly<Record<Resource, number>>;
  /** Price per unit the store charges a player buying from it. */
  readonly sellPrice: Readonly<Record<Resource, number>>;
  /** Price per unit the store pays a player selling to it. */
  readonly buyPrice: Readonly<Record<Resource, number>>;
}

/**
 * Build the store's opening state for a new game: `STORE_OPENING_STOCK` units
 * of each good, `STORE_MULE_STOCK_INITIAL` M.U.L.E.s at `MULE_BASE_PRICE`
 * (planet_mule's `shopMuleInitialPrice` seed), base prices seeded from
 * `STORE_BASE_PRICE` (planet_mule's initial prices), and buy/sell quotes
 * derived from those bases per good.
 *
 * @returns Fresh store state.
 */
export function createInitialStoreState(): StoreState {
  const derived = deriveStorePrices({ ...STORE_BASE_PRICE });
  return {
    stock: { ...STORE_OPENING_STOCK },
    muleStock: STORE_MULE_STOCK_INITIAL,
    mulePrice: MULE_BASE_PRICE,
    prices: derived.prices,
    sellPrice: derived.sellPrice,
    buyPrice: derived.buyPrice,
  };
}

/**
 * Total cost to buy one M.U.L.E. unit outfitted for `resource`: the store's
 * current, dynamic M.U.L.E. price (`store.mulePrice`) plus the
 * resource-specific outfit cost.
 *
 * @param store - Current store state.
 * @param resource - Resource the M.U.L.E. will be outfitted for.
 * @returns Total dollar cost.
 */
export function computeMulePurchaseCost(store: StoreState, resource: Resource): number {
  return store.mulePrice + OUTFIT_COST[resource];
}

/**
 * Decrement the store's M.U.L.E. stock by one after a completed purchase.
 * Callers must ensure `store.muleStock > 0` first (mirrors how
 * `applyBuyFromStore`/`applyBuyFromStore`-style stock functions do not clamp
 * on their own); turn.ts's `applyBuyMule` checks stock before calling this,
 * matching its existing fail-loudly money check.
 *
 * @param store - Current store state.
 * @returns A new store with `muleStock` reduced by one.
 */
export function applyMulePurchase(store: StoreState): StoreState {
  return { ...store, muleStock: store.muleStock - 1 };
}

/**
 * Rebuild the store's M.U.L.E. stock toward `MULE_STOCK_CAP`, spending
 * `SMITHORE_PER_MULE` smithore per M.U.L.E. built (floored to an even
 * multiple of `SMITHORE_PER_MULE` when smithore-limited, so a lone leftover
 * unit is never spent), then reprices the next M.U.L.E. at
 * `MULE_PRICE_SMITHORE_MULT` times the store's current smithore price,
 * floored to `MULE_PRICE_FLOOR_STEP`. Matches planet_mule's `Shop.buildMules`
 * (Shop.java lines 483-497); called once per round boundary, after the
 * round's price recalc so the new mule price reflects the fresh smithore
 * price (see turn.ts `advanceToNextRound`).
 *
 * @param store - Current store state (its smithore stock and price feed the rebuild).
 * @returns A new store with rebuilt `muleStock`, spent `stock.smithore`, and
 *   a recomputed `mulePrice`.
 */
export function rebuildMules(store: StoreState): StoreState {
  const deficit = Math.max(0, MULE_STOCK_CAP - store.muleStock);
  const smithoreNeeded = deficit * SMITHORE_PER_MULE;
  const smithoreSpent =
    smithoreNeeded > store.stock.smithore
      ? store.stock.smithore - (store.stock.smithore % SMITHORE_PER_MULE)
      : smithoreNeeded;
  const mulesBuilt = smithoreSpent / SMITHORE_PER_MULE;
  const rawMulePrice = store.prices.smithore * MULE_PRICE_SMITHORE_MULT;
  const mulePrice = rawMulePrice - (rawMulePrice % MULE_PRICE_FLOOR_STEP);
  return {
    ...store,
    muleStock: store.muleStock + mulesBuilt,
    stock: { ...store.stock, smithore: store.stock.smithore - smithoreSpent },
    mulePrice,
  };
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
 * `resource` increases by `quantity`, capped at `STORE_STOCK_CAP` (planet_mule
 * caps every store setter, so a sale past the cap sinks the excess). Returns a
 * new store state; does not mutate `store`.
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
      [resource]: Math.min(store.stock[resource] + quantity, STORE_STOCK_CAP),
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

// ============================================================
// Dynamic pricing
// ============================================================

/**
 * A good's quoted prices: the central base price and the store's buy (pays a
 * seller) and sell (charges a buyer) quotes derived from it.
 */
export interface GoodQuote {
  readonly price: number;
  readonly buyPrice: number;
  readonly sellPrice: number;
}

/**
 * Colony-wide supply and demand figures for one round's price recalc, computed
 * from the whole game state by `computeColonyStats`. `foodNeed`, `energyNeed`,
 * and `muleNeed` are the demand terms; `foodSupply`, `energySupply`, and
 * `muleSupply` the supply terms. The price factor for a good is
 * `RATIO_BASE + RATIO_SLOPE * (need / supply)` (demand over supply -- see the
 * ratio-direction note in docs/RULE_SOURCES.md).
 */
export interface ColonyStats {
  readonly foodSupply: number;
  readonly foodNeed: number;
  readonly energySupply: number;
  readonly energyNeed: number;
  readonly muleSupply: number;
  readonly muleNeed: number;
}

/**
 * Clamp an integer into `[lo, hi]`.
 */
function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Clamp a float into `[lo, hi]`.
 */
function clampFloat(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Derive a good's clamped base price and buy/sell quotes from a raw (possibly
 * fractional) price. Food, energy, and smithore round the raw price then clamp
 * it to the good's `[floor, STORE_PRICE_CEILING]` band; crystite floors the raw
 * price to a multiple of `STORE_CRYSTITE_PRICE_MULTIPLE` and is not clamped
 * (its own random-draw range bounds it). The buy quote subtracts the good's
 * buy margin from the base and the sell quote adds the good's spread, matching
 * planet_mule's `ResourcePrices.setXPrice` methods.
 *
 * @param good - Good being priced.
 * @param rawPrice - Raw price to derive from (pre-round, pre-clamp).
 * @returns The good's base price and buy/sell quotes.
 */
export function deriveGoodQuote(good: Resource, rawPrice: number): GoodQuote {
  let price: number;
  if (good === "crystite") {
    // Crystite floors to a trade-unit multiple with no band clamp.
    const rounded = Math.round(rawPrice);
    price = rounded - (rounded % STORE_CRYSTITE_PRICE_MULTIPLE);
  } else {
    const floor = STORE_PRICE_FLOOR_BY_GOOD[good];
    if (floor === undefined) {
      throw new Error(`deriveGoodQuote: no price floor for good ${good}`);
    }
    price = clampInt(Math.round(rawPrice), floor, STORE_PRICE_CEILING);
  }
  const buyPrice = price - STORE_BUY_MARGIN_BY_GOOD[good];
  const sellPrice = buyPrice + STORE_SELL_SPREAD_BY_GOOD[good];
  return { price, buyPrice, sellPrice };
}

/**
 * Derive base prices and buy/sell quotes for every good from a raw-price
 * record, returning parallel records ready to drop into a `StoreState`.
 *
 * @param rawPrices - Raw base price per good.
 * @returns Derived `prices`, `buyPrice`, and `sellPrice` records.
 */
function deriveStorePrices(rawPrices: Readonly<Record<Resource, number>>): {
  prices: Record<Resource, number>;
  buyPrice: Record<Resource, number>;
  sellPrice: Record<Resource, number>;
} {
  const prices = {} as Record<Resource, number>;
  const buyPrice = {} as Record<Resource, number>;
  const sellPrice = {} as Record<Resource, number>;
  for (const good of RESOURCES) {
    const quote = deriveGoodQuote(good, rawPrices[good]);
    prices[good] = quote.price;
    buyPrice[good] = quote.buyPrice;
    sellPrice[good] = quote.sellPrice;
  }
  return { prices, buyPrice, sellPrice };
}

/**
 * The store's current buy quote for a good (dollars per unit it pays a player
 * selling to it). The single sanctioned accessor for the auction band, so the
 * auction reads the live derived quote rather than reconstructing it.
 *
 * @param store - Current store state.
 * @param good - Good to quote.
 * @returns The store's buy price for the good.
 */
export function storeBuyQuote(store: StoreState, good: Resource): number {
  return store.buyPrice[good];
}

/**
 * The store's current sell quote for a good (dollars per unit it charges a
 * player buying from it).
 *
 * @param store - Current store state.
 * @param good - Good to quote.
 * @returns The store's sell price for the good.
 */
export function storeSellQuote(store: StoreState, good: Resource): number {
  return store.sellPrice[good];
}

/**
 * Compute the colony-wide supply and demand figures the round-boundary price
 * recalc needs, from the current players, board, and store.
 *
 * Supply is everything currently in play: store stock plus every player's
 * holdings for food and energy; store mules plus half the store's smithore for
 * the smithore/mule market. Demand is planet_mule's per-market figure:
 *
 * - Food: `numPlayers * FOOD_REQUIREMENTS_BY_ROUND[min(nextRound, 12)]`
 *   (`Shop.calcBuySellPrice` Food case, Shop.java line 318).
 * - Energy: `sum over players (energyRequirement + 1)`, where a player's
 *   energyRequirement is the count of their installed M.U.L.E.s NOT outfitted
 *   for energy (each draws one unit of power; energy M.U.L.E.s draw none) --
 *   `Shop.calcBuySellPrice` Energy case (Shop.java lines 330-333), with
 *   per-mule energy cost from `Resource.energyCost`/`Factory.getEnergyNeeded`.
 * - Mules: `min(min(freeLands, numPlayers) + ownedUndeveloped, STORE_MULE_NEED_CAP)`
 *   (`Shop.getMuleNeed`, Shop.java lines 353-374).
 *
 * The town plot is excluded from the land counts (it is never ownable land).
 *
 * @param players - All players in the game.
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param store - Current store state (its stock and mule count feed supply).
 * @param nextRound - 1-based round the prices are being computed for.
 * @returns The colony supply/demand figures.
 */
export function computeColonyStats(
  players: readonly Player[],
  plots: readonly (readonly Plot[])[],
  store: StoreState,
  nextRound: number,
): ColonyStats {
  const numPlayers = players.length;

  // Food and energy supply: store stock plus every player's holdings.
  let playerFood = 0;
  let playerEnergy = 0;
  for (const player of players) {
    playerFood += player.goods.food;
    playerEnergy += player.goods.energy;
  }
  const foodSupply = store.stock.food + playerFood;
  const energySupply = store.stock.energy + playerEnergy;

  // Food demand scales with the upcoming round's per-player requirement.
  const reqIndex = Math.min(nextRound, 12);
  const foodReq = FOOD_REQUIREMENTS_BY_ROUND[reqIndex] ?? 0;
  const foodNeed = numPlayers * foodReq;

  // One board pass gathers the energy-mule count and the land tallies.
  let nonEnergyMules = 0;
  let freeLands = 0;
  let ownedUndeveloped = 0;
  for (const row of plots) {
    for (const plot of row) {
      if (plot.terrain === "town") {
        continue;
      }
      if (plot.owner === null) {
        freeLands += 1;
        continue;
      }
      if (plot.muleOutfit === null) {
        ownedUndeveloped += 1;
        continue;
      }
      if (plot.muleOutfit !== "energy") {
        nonEnergyMules += 1;
      }
    }
  }
  // Each non-energy mule draws one unit of power; each player draws one more.
  const energyNeed = nonEnergyMules + numPlayers;

  const muleSupply = store.muleStock + Math.floor(store.stock.smithore / 2);
  const muleNeed = Math.min(
    Math.min(freeLands, numPlayers) + ownedUndeveloped,
    STORE_MULE_NEED_CAP,
  );

  return { foodSupply, foodNeed, energySupply, energyNeed, muleSupply, muleNeed };
}

/**
 * Recompute every good's base price and buy/sell quotes for a new round from
 * the colony supply/demand figures, matching planet_mule's per-good pricing:
 *
 * - Food and energy: `price *= RATIO_BASE + RATIO_SLOPE * (need / supply)`,
 *   with `supply` floored at 1, then clamp the rounded result to the good's band.
 * - Smithore: clamp the mule need/supply ratio to `[MIN, MAX]`, apply the same
 *   factor form, floor the result at `STORE_SMITHORE_PRICE_FLOOR`, add
 *   `round(normalDistributed(rng) * STORE_SMITHORE_JITTER_AMPLITUDE)` of
 *   gaussian jitter, then clamp.
 * - Crystite: ignore the previous price entirely and draw a fresh
 *   `STORE_BASE_PRICE.crystite + rng.nextInt(STORE_CRYSTITE_PRICE_DEVIANCE)`,
 *   floored to a trade-unit multiple.
 *
 * Advances `rng` in a fixed order (smithore jitter, then crystite draw) so the
 * result is deterministic for a given state and seed. Pure over its inputs
 * apart from the intended `rng` advance; returns a new store.
 *
 * @param store - Current store state.
 * @param stats - Colony supply/demand figures for the upcoming round.
 * @param rng - Seeded generator (advanced by the smithore and crystite draws).
 * @returns A new store with recomputed base prices and buy/sell quotes.
 */
export function updateStoreForNewRound(
  store: StoreState,
  stats: ColonyStats,
  rng: Rng,
): StoreState {
  // Food: unclamped demand/supply ratio scales the current base price.
  const foodFactor =
    STORE_PRICE_RATIO_BASE +
    STORE_PRICE_RATIO_SLOPE * (stats.foodNeed / Math.max(1, stats.foodSupply));
  const foodRaw = store.prices.food * foodFactor;

  // Energy: same factor form as food.
  const energyFactor =
    STORE_PRICE_RATIO_BASE +
    STORE_PRICE_RATIO_SLOPE * (stats.energyNeed / Math.max(1, stats.energySupply));
  const energyRaw = store.prices.energy * energyFactor;

  // Smithore: clamp the ratio, floor the factored price, add gaussian jitter.
  const smithoreRatio = clampFloat(
    stats.muleNeed / Math.max(1, stats.muleSupply),
    STORE_SMITHORE_RATIO_MIN,
    STORE_SMITHORE_RATIO_MAX,
  );
  const smithoreFactor = STORE_PRICE_RATIO_BASE + STORE_PRICE_RATIO_SLOPE * smithoreRatio;
  const smithoreFloored = Math.max(
    Math.round(store.prices.smithore * smithoreFactor),
    STORE_SMITHORE_PRICE_FLOOR,
  );
  const smithoreJitter = Math.round(normalDistributed(rng) * STORE_SMITHORE_JITTER_AMPLITUDE);
  const smithoreRaw = smithoreFloored + smithoreJitter;

  // Crystite: an independent random draw, not a function of the old price.
  const crystiteRaw = STORE_BASE_PRICE.crystite + rng.nextInt(STORE_CRYSTITE_PRICE_DEVIANCE);

  const rawPrices: Record<Resource, number> = {
    food: foodRaw,
    energy: energyRaw,
    smithore: smithoreRaw,
    crystite: crystiteRaw,
  };
  const derived = deriveStorePrices(rawPrices);
  return {
    ...store,
    prices: derived.prices,
    buyPrice: derived.buyPrice,
    sellPrice: derived.sellPrice,
  };
}

/**
 * Halve the store's food stock (integer floor) to model end-of-round store
 * spoilage, leaving a lone unit untouched. Matches planet_mule's
 * `Shop.spoil(Food, food)`: `if (food > 1) setFood(food / 2)` (Shop.java lines
 * 378-382); see docs/RULE_SOURCES.md for the argument-reading verdict.
 *
 * @param store - Current store state.
 * @returns A new store with food halved, or the same store when food <= 1.
 */
export function spoilStoreFood(store: StoreState): StoreState {
  if (store.stock.food <= 1) {
    return store;
  }
  return {
    ...store,
    stock: { ...store.stock, food: Math.floor(store.stock.food / 2) },
  };
}

/**
 * Feed a finished good's auction back into its base price: set the good's base
 * to the average price at which units traded (`floor(totalPrice / units)`),
 * re-deriving its buy/sell quotes. A no-op when nothing traded, so a dead
 * auction leaves the price untouched. Matches planet_mule's
 * `Shop.setAveragePrice` (Shop.java lines 527-549).
 *
 * @param store - Current store state.
 * @param good - Good whose auction just finished.
 * @param trades - The finished auction's executed unit trades.
 * @returns A new store with the good's price set to the average, or the same
 *   store when no units traded.
 */
export function applyAverageTradePrice(
  store: StoreState,
  good: Resource,
  trades: readonly AuctionTrade[],
): StoreState {
  let totalPrice = 0;
  let totalUnits = 0;
  for (const trade of trades) {
    totalPrice += trade.price * trade.quantity;
    totalUnits += trade.quantity;
  }
  if (totalUnits <= 0) {
    return store;
  }
  const average = Math.floor(totalPrice / totalUnits);
  const quote = deriveGoodQuote(good, average);
  return {
    ...store,
    prices: { ...store.prices, [good]: quote.price },
    buyPrice: { ...store.buyPrice, [good]: quote.buyPrice },
    sellPrice: { ...store.sellPrice, [good]: quote.sellPrice },
  };
}
