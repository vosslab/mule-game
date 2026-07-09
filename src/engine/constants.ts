/**
 * Single source of truth for every numeric game rule: round structure,
 * starting resources, production yield tables, store prices and stock,
 * M.U.L.E. and outfit costs, land value, and spoilage/decay rates.
 *
 * Every exported constant carries a source comment. Sources consulted:
 *
 * - PlaNetMULE "How to Play" reference (primary for starting resources and
 *   store opening stock): https://www.planetmule.com/how-to-play/
 * - Atari 8-bit M.U.L.E. (1983) manual, Internet Archive scans:
 *   https://archive.org/details/Mule_atari8 and https://archive.org/details/agm_mule
 * - StrategyWiki M.U.L.E. guide (production, land grants, store):
 *   https://strategywiki.org/wiki/M.U.L.E./Walkthrough
 *   https://strategywiki.org/wiki/M.U.L.E./Land_and_land_grants
 * - C64-Wiki M.U.L.E. page: https://www.c64-wiki.com/wiki/M.U.L.E.
 * - Data Driven Gamer analysis of M.U.L.E. mechanics:
 *   https://datadrivengamer.blogspot.com/2021/05/game-256-mule.html
 *
 * Where sources conflict, planetmule.com/how-to-play is preferred as the
 * most authoritative single reference; remaining conflicts are recorded in
 * the constant's own comment.
 */

import type { Resource } from "./player";
import type { Terrain } from "./game_state";

/**
 * Number of rounds in the beginner game. The full game runs 12 rounds;
 * the beginner configuration used by this engine is fixed at 6.
 * Source: StrategyWiki walkthrough, beginner game length.
 */
export const ROUND_COUNT = 6;

/**
 * Board dimensions: 5 rows by 9 columns. The center column is the river/town
 * spine, giving four ownable columns on each side.
 * Source: StrategyWiki land-and-land-grants map layout for the beginner board.
 */
export const PLOT_ROWS = 5;
export const PLOT_COLS = 9;

/**
 * Starting money for every player in the beginner game.
 * Source: planetmule.com/how-to-play, per-player starting cash of $1000.
 * Prior source conflict (kept for history): the original manual gives
 * different starting money per species (for example Flapper $1600, Humanoid
 * $600, per C64-Wiki). This engine has no species selection, so it uses the
 * flat $1000 anchor, which now matches planetmule.com directly.
 */
export const STARTING_MONEY = 1000;

/**
 * Starting inventory for each resource. Every player begins with 4 food,
 * 2 energy, and 0 smithore, since land has not yet been granted and no
 * production has happened.
 * Source: planetmule.com/how-to-play, per-player starting goods.
 * Prior source conflict (kept for history): the original manual gives every
 * player $300 worth of food and energy instead of a fixed unit count; an
 * earlier revision of this engine used zero for all three goods.
 */
export const STARTING_GOODS: Readonly<Record<Resource, number>> = {
  food: 4,
  energy: 2,
  smithore: 0,
};

/**
 * Base cost to purchase a M.U.L.E. unit (before outfit cost) from the store.
 * Source: StrategyWiki walkthrough / C64-Wiki store price table.
 */
export const MULE_BASE_PRICE = 100;

/**
 * Cost to outfit a M.U.L.E. for each resource. Smithore-mining outfits cost
 * the most because smithore equipment is the most complex; food outfits cost
 * the least.
 * Source: planetmule.com/how-to-play outfit cost table (food $25, energy
 * $50, smithore $75), which matches C64-Wiki's equipment cost table
 * (crystite $100 excluded since this beginner game has no crystite).
 */
export const OUTFIT_COST: Readonly<Record<Resource, number>> = {
  food: 25,
  energy: 50,
  smithore: 75,
};

/**
 * Store opening stock (units) for each resource at the start of a game.
 * Source: planetmule.com/how-to-play store starting inventory (8 food,
 * 8 energy, 8 smithore).
 * Prior source conflict (kept for history): C64-Wiki gives an opening stock
 * of 16 food / 16 energy / 0 smithore for the full game; an earlier revision
 * of this engine used a work-package-spec anchor of roughly 30 food / 25
 * energy / 50 smithore so the store had enough smithore to sell early
 * outfits.
 *
 * The store also opens with 14 M.U.L.E. units per planetmule.com/how-to-play,
 * but this engine's store model (see store.ts) sells M.U.L.E.s on demand at
 * `MULE_BASE_PRICE` plus outfit cost with no stock limit, so there is no
 * `MULE_OPENING_STOCK` constant to wire in; unlimited M.U.L.E. purchasing is
 * a documented v1 gap rather than a design change made here.
 */
export const STORE_OPENING_STOCK: Readonly<Record<Resource, number>> = {
  food: 8,
  energy: 8,
  smithore: 8,
};

/**
 * Store base buy price (dollars per unit) the store pays a player, before
 * any stock-scarcity adjustment.
 * Source: work package spec beginner-game anchors; consistent with
 * C64-Wiki's "low price" band (food $15, energy $10, smithore $36-43).
 * This engine keeps prices fixed rather than dynamic, so it anchors near
 * the middle of the observed historical bands.
 */
export const STORE_BASE_PRICE: Readonly<Record<Resource, number>> = {
  food: 20,
  energy: 15,
  smithore: 40,
};

/**
 * Land value per plot used only for end-of-game scoring, representing the
 * dollar value of owned but otherwise unliquidated land.
 * Source: work package spec beginner-game anchor of $500 per owned plot.
 */
export const LAND_VALUE_PER_PLOT = 500;

/**
 * Base food production yield (units per M.U.L.E. per round) by terrain,
 * before any adjacency bonus. River plots produce the most food, mountains
 * the least; smithore-mining terrain cannot be outfitted for food at all
 * in the source material, but this engine does not forbid the outfit
 * combination, it simply yields the low mountain rate.
 * Source: StrategyWiki / Data Driven Gamer summary -- food averages 4 on
 * river, 2 on plains, 1 on mountains.
 */
export const FOOD_YIELD_BY_TERRAIN: Readonly<Partial<Record<Terrain, number>>> = {
  river: 4,
  plain: 2,
  mountain1: 1,
  mountain2: 1,
  mountain3: 1,
};

/**
 * Base energy production yield (units per M.U.L.E. per round) by terrain.
 * Plains produce the most energy, mountains the least.
 * Source: StrategyWiki / Data Driven Gamer summary -- energy averages 3 on
 * plains, 2 on river, 1 on mountains.
 */
export const ENERGY_YIELD_BY_TERRAIN: Readonly<Partial<Record<Terrain, number>>> = {
  plain: 3,
  river: 2,
  mountain1: 1,
  mountain2: 1,
  mountain3: 1,
};

/**
 * Base smithore production yield (units per M.U.L.E. per round) by terrain.
 * Mountain density (mountain1 through mountain3) scales yield up; river
 * plots cannot be mined for smithore at all (0), matching the source
 * material's "no mining in the river valley" rule.
 * Source: work package spec anchors (mountain1 2, mountain2 3, mountain3 4,
 * plain 1, river 0), consistent with StrategyWiki's "more mountain, more
 * smithore" and C64-Wiki's river mining restriction.
 */
export const SMITHORE_YIELD_BY_TERRAIN: Readonly<Partial<Record<Terrain, number>>> = {
  plain: 1,
  river: 0,
  mountain1: 2,
  mountain2: 3,
  mountain3: 4,
};

/**
 * Per-resource lookup of the terrain yield table above, so production code
 * can select the correct table by the resource a M.U.L.E. is outfitted for
 * without a switch statement.
 */
export const YIELD_TABLE_BY_RESOURCE: Readonly<
  Record<Resource, Readonly<Partial<Record<Terrain, number>>>>
> = {
  food: FOOD_YIELD_BY_TERRAIN,
  energy: ENERGY_YIELD_BY_TERRAIN,
  smithore: SMITHORE_YIELD_BY_TERRAIN,
};

/**
 * Extra yield (units) added to a plot's production for each orthogonally
 * adjacent plot owned by the same player and outfitted for the same
 * resource. Represents the "clustering" bonus described in fan write-ups
 * of Bunten's formulas, where grouping same-outfit M.U.L.E.s together
 * raises regional efficiency.
 * Source: work package spec, adjacency bonus for same-outfit neighbors;
 * no exact historical figure is documented, so this engine uses a modest
 * flat +1 per matching neighbor.
 */
export const ADJACENCY_BONUS_PER_NEIGHBOR = 1;

/**
 * Energy required per player per round just to keep the colony running,
 * scaling up as the game progresses (later rounds need more energy). This
 * engine models it as a flat per-round base plus a per-round increment.
 * Source: work package spec, "food usage per round grows with round
 * number"; this engine applies the same growth shape to energy upkeep,
 * since energy is the "unpowered M.U.L.E." resource, while food upkeep is
 * modeled separately below.
 */
export const ENERGY_UPKEEP_BASE = 2;
export const ENERGY_UPKEEP_PER_ROUND = 1;

/**
 * Food consumed per player per round, scaling up as the game progresses.
 * Source: work package spec, "food usage per round grows with round
 * number".
 */
export const FOOD_UPKEEP_BASE = 2;
export const FOOD_UPKEEP_PER_ROUND = 1;

/**
 * Fraction of a player's surplus food (inventory above what upkeep
 * consumes) that spoils between rounds.
 * Source: work package spec anchor, "roughly half surplus food spoils".
 */
export const FOOD_SPOILAGE_RATE = 0.5;

/**
 * Fraction of a player's surplus energy (inventory above what upkeep
 * consumes) that decays between rounds.
 * Source: work package spec anchor, "energy ~25% decay".
 */
export const ENERGY_DECAY_RATE = 0.25;

/**
 * Fraction of smithore that decays between rounds. Smithore is a raw ore
 * and does not spoil.
 * Source: work package spec anchor, "smithore no decay".
 */
export const SMITHORE_DECAY_RATE = 0;

/**
 * Energy units a single installed M.U.L.E. consumes from its owner's
 * inventory to run for one round. A player who does not hold enough energy
 * to power every installed M.U.L.E. leaves the unpowered ones idle for the
 * round (the "energy-shortfall penalty" in the work package spec).
 * Source: planetmule.com/how-to-play, 1 unit of energy per non-Energy
 * M.U.L.E. per round; confirms the work package spec's "energy-shortfall
 * penalty (unpowered M.U.L.E. produces nothing)" flat rate of 1.
 */
export const ENERGY_PER_MULE = 1;

/**
 * Auction tunables (v1). These are isolated together per the plan's risk
 * register so a future auction-fidelity pass can retune the trading floor
 * without touching production, store, or scoring numbers. No historical
 * figure pins these exactly; the original M.U.L.E. auction is a real-time
 * animated market, so this engine models it as a fixed number of discrete
 * ticks with a per-tick price step inside a clamped price band.
 * Source: work package plan, "auction v1 tunables per risk register --
 * isolate tunables".
 */

/**
 * Number of engine ticks each good's auction runs before it times out and
 * ends. One good (food, then energy, then smithore) is auctioned per window.
 */
export const AUCTION_TICKS = 20;

/**
 * Amount a participant's asking/bidding price moves per tick when their
 * intent is up or down. A hold intent leaves the price unchanged.
 */
export const AUCTION_PRICE_STEP = 1;

/**
 * Lowest price any participant (or the store band) may sit at. Prices are
 * clamped to `[AUCTION_PRICE_FLOOR, AUCTION_PRICE_CEILING]` every tick.
 */
export const AUCTION_PRICE_FLOOR = 5;

/**
 * Highest price any participant (or the store band) may sit at.
 */
export const AUCTION_PRICE_CEILING = 100;

/**
 * Half-width of the store's fixed buy/sell band around each good's store
 * base price: the store sells its remaining stock at `base + spread` and
 * buys unlimited units at `base - spread`, so store buy is always below
 * store sell (a market-maker's spread). Idle players sit at the band
 * midpoint, so an auction with no active roles crosses nothing and times
 * out with no trade.
 */
export const AUCTION_STORE_SPREAD = 5;

/**
 * Fixed number of engine ticks each player gets for their development turn.
 * The original game scales the development timer by the player's money (poorer
 * players get more time); v1 uses a flat tick budget per the plan's Resolved
 * decisions, and the money-scaled timer moves to a future fidelity plan.
 * Source: work package plan, "Development-phase time budget: fixed ticks per
 * player for v1".
 */
export const DEVELOP_TICKS_PER_TURN = 50;
