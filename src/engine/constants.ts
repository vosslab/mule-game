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
import type { GameMode, Terrain } from "./game_state";

/**
 * Number of rounds per game mode. `beginner` matches this engine's original
 * fixed-6-round game; `standard` is 12 rounds. Modes share every other
 * economy constant in this file (starting money, goods, store stock); round
 * count is the only difference (see docs/RULE_SOURCES.md, "Standard round
 * count" and "1983 beginner stock tables: recorded-but-unused").
 * Source: OTHER_REPOS/mule_rules.md line 46 ("Standard: The game ends after
 * 12 rounds"), corroborated by the Kroah 1983 doc's PTU/level modifier
 * tables; beginner=6 per StrategyWiki's beginner-game walkthrough (unchanged
 * from this engine's prior fixed `ROUND_COUNT`). User decision recorded in
 * `mule_fidelity_plan.md`'s Resolved decisions.
 */
export const ROUND_COUNT_BY_MODE: Readonly<Record<GameMode, number>> = {
  beginner: 6,
  standard: 12,
};

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
 * 2 energy, 0 smithore, and 0 crystite, since land has not yet been granted
 * and no production has happened.
 * Source: planetmule.com/how-to-play, per-player starting goods.
 * Prior source conflict (kept for history): the original manual gives every
 * player $300 worth of food and energy instead of a fixed unit count; an
 * earlier revision of this engine used zero for all three goods.
 */
export const STARTING_GOODS: Readonly<Record<Resource, number>> = {
  food: 4,
  energy: 2,
  smithore: 0,
  crystite: 0,
};

/**
 * Seed value for `StoreState.mulePrice` at game start only. The live
 * M.U.L.E. price is dynamic (`store.mulePrice`,
 * recomputed by `rebuildMules` in store.ts each round boundary); this
 * constant no longer prices a purchase directly (see `applyBuyMule` in
 * turn.ts). It happens to equal planet_mule's own opening price
 * (`GameData.data.shopMuleInitialPrice = 100`,
 * `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Shop.java`
 * line 30), so no seed-value change was needed when the dynamic pricing
 * landed. `src/ui/store_screen.ts` still reads this constant for its buy
 * button's label, which is now stale once the price moves off the seed
 * value -- a known UI follow-on outside this workstream's scope (see
 * docs/RULE_SOURCES.md, "Mule economy: buildMules semantics").
 * Prior source (kept for history): StrategyWiki walkthrough / C64-Wiki store
 * price table, which happened to agree with PM's own value.
 */
export const MULE_BASE_PRICE = 100;

/**
 * Cost to outfit a M.U.L.E. for each resource. Smithore-mining outfits cost
 * the most of the three tradable goods because smithore equipment is the
 * most complex; food outfits cost the least. Crystite is priced highest of
 * all four (matching its historical rarity) but is not yet offered in the
 * store UI (see the `Resource` doc comment in player.ts); it is defined here
 * only so `Record<Resource, ...>` sites compile. This same per-good cost is
 * also the "outfit price" term end-of-game scoring adds for each installed
 * M.U.L.E. (`Resource.equipmentCost`, see scoring.ts and `POINTS_PER_MULE`).
 * Source: planet_mule `GameData.java` lines 37-43 (`foodEquipmentCost = 25`,
 * `smithoreEquipmentCost = 75`, `crystiteEquipmentCost = 100`,
 * `energyEquipmentCost = 50`), fed into each `Resource` enum constant's
 * `equipmentCost` field
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Resource.java`
 * lines 10-13). Matches planetmule.com/how-to-play's outfit cost table
 * (food $25, energy $50, smithore $75) and C64-Wiki's equipment cost table
 * for all four values, including crystite $100.
 */
export const OUTFIT_COST: Readonly<Record<Resource, number>> = {
  food: 25,
  energy: 50,
  smithore: 75,
  crystite: 100,
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
 * The store also opens with 14 M.U.L.E. units per planetmule.com/how-to-play;
 * that opening count is `STORE_MULE_STOCK_INITIAL` below and feeds
 * `StoreState.muleStock`, capped and rebuilt each round by `MULE_STOCK_CAP`
 * (see the mule economy section near the end of this file and `rebuildMules`
 * in store.ts). Crystite opens at 0 stock BY DESIGN, not because it is
 * untradable: the store never accumulates crystite stock at all, even from
 * player auction sales (see docs/RULE_SOURCES.md, "Crystite: store-only-buyer
 * and post-auction zeroing").
 */
export const STORE_OPENING_STOCK: Readonly<Record<Resource, number>> = {
  food: 8,
  energy: 8,
  smithore: 8,
  crystite: 0,
};

/**
 * Store opening base price (dollars per unit, planet_mule's `ResourcePrices.price`
 * field) for each good at the start of a game. This is the central price the
 * dynamic-pricing recalc (`updateStoreForNewRound` in store.ts) multiplies by
 * the supply/demand factor each round; the store's live buy and sell quotes are
 * derived from it per good (see `deriveGoodQuote` in store.ts), so this is no
 * longer a flat fixed price. Previously this constant held hand-tuned flat
 * anchors (food 20 / energy 15 / smithore 40); it now carries planet_mule's
 * initial prices so the dynamic recalc starts from the emulation target's own
 * seed values.
 * Source: planet_mule `GameData.java` lines 26-29
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/GameData.java`):
 * `shopFoodInitialPrice = 30`, `shopEnergyInitialPrice = 25`,
 * `shopSmithoreInitialPrice = 50`, `shopCrystiteInitialPrice = 50`, each fed to
 * the matching `ResourcePrices.setXPrice` in `Shop`'s constructor (lines 70-73).
 */
export const STORE_BASE_PRICE: Readonly<Record<Resource, number>> = {
  food: 30,
  energy: 25,
  smithore: 50,
  crystite: 50,
};

/**
 * Land value per plot used only for end-of-game scoring, representing the
 * dollar value of owned but otherwise unliquidated land. Added once per
 * owned plot regardless of whether that plot carries an installed M.U.L.E.
 * (a M.U.L.E.'s own value is `POINTS_PER_MULE` plus its `OUTFIT_COST`, added
 * separately -- see scoring.ts).
 * Source: planet_mule `GameData.java` line 44, `pointsPerLand = 500`,
 * consumed by `Player.calcPoints`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Player.java`
 * lines 411-426): `this.landPoints += GameData.data.pointsPerLand;` once per
 * entry in `ownedTiles`. This project's prior work-package-spec anchor
 * ($500/plot) already matched exactly; no value change was needed, only this
 * source citation. See docs/RULE_SOURCES.md, "Endgame scoring: per-plot and
 * per-mule terms".
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
 * Number of crystite blooms seeded per game map.
 * Source: planet_mule `PlanetMapGenerator.generate()`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/PlanetMapGenerator.java`
 * lines 88-90), which calls `generateCrystite` exactly four times per map.
 */
export const CRYSTITE_BLOOM_COUNT = 4;

/**
 * Crystite level at a bloom's center plot, decreasing by 1 per manhattan-
 * distance ring outward (center 3, ring 1 = 2, ring 2 = 1, ring 3+ = 0);
 * overlapping blooms keep the higher of the two levels per plot.
 * Source: `PlanetMapGenerator.generateCrystite`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/PlanetMapGenerator.java`
 * lines 172-190): `n7 = max(3 - manhattanDistance, 0)`, with the center's
 * `n7 == 3` case remapped to the `n3` parameter (always 3 for the four
 * map-generation calls at lines 88-90); `planetTile.setCrystite(n7)` only
 * when `n7 > planetTile.getCrystite()` (the overlap-keeps-max rule). PM's
 * `n3` parameter also supports a rarer level-4 bloom, reachable only via the
 * meteorite colony event (out of scope for this workstream).
 */
export const CRYSTITE_BLOOM_MAX_LEVEL = 3;

/**
 * Base crystite production yield by terrain: correctly zero on EVERY
 * terrain, unlike the other three resources' yield tables. Crystite yield is
 * not terrain-derived at all; it is the plot's own bloom deposit level
 * (`Plot.crystiteLevel`), read directly by `economy.ts`'s `baseYield`
 * rather than through this table.
 * `YIELD_TABLE_BY_RESOURCE.crystite` still points at this all-zero table
 * only so that Record<Resource, ...> call sites (for example `land_ai.ts`'s
 * best-terrain-yield heuristic) compile and correctly score crystite's
 * terrain-only potential as 0 for every terrain.
 * Source: planet_mule `PlanetTile.getYieldPotential`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/PlanetTile.java`
 * lines 73-89): the `Crystite` case returns `getCrystite()` (the deposit
 * level) directly, with no terrain-type term at all, confirming crystite has
 * no terrain-based yield component distinct from its bloom level.
 */
export const CRYSTITE_YIELD_BY_TERRAIN: Readonly<Partial<Record<Terrain, number>>> = {
  plain: 0,
  river: 0,
  mountain1: 0,
  mountain2: 0,
  mountain3: 0,
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
  crystite: CRYSTITE_YIELD_BY_TERRAIN,
};

/**
 * Extra yield (units) added to a plot's production when at least one
 * orthogonally adjacent plot is owned by the same player and outfitted for
 * the same resource. This is a FLAT bonus (applied once per plot, not once
 * per matching neighbor): a plot with one matching neighbor and a plot with
 * four matching neighbors both get the same `+1`.
 * Source: planet_mule `Building.calcBonuses`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/Building.java`
 * lines 68-77): `n5` counts matching orthogonal neighbors, but the code only
 * branches on `n5 <= 0` (no match) versus `n5 > 0` (any match), applying
 * `factory.setBonus(factory.getBonus() + 1)` in the latter case regardless
 * of `n5`'s exact value. This corrects this engine's earlier "work package
 * spec, no exact historical figure documented" reading (M1-M6), which had
 * multiplied this constant by the matching-neighbor count instead of
 * applying it once.
 */
export const ADJACENCY_BONUS_PER_NEIGHBOR = 1;

/**
 * Retired: `ENERGY_UPKEEP_BASE`/`ENERGY_UPKEEP_PER_ROUND` and
 * `FOOD_UPKEEP_BASE`/`FOOD_UPKEEP_PER_ROUND` were this engine's flat, v1
 * stand-ins for planet_mule's real per-round resource usage. Food usage now
 * happens at the develop-phase timer (`FOOD_REQUIREMENTS_BY_ROUND`,
 * `DEVELOP_TICKS_FULL`/`DEVELOP_TICKS_MIN` above, consumed in turn.ts's
 * `beginDevelopTurn`); energy usage is the real per-powered-mule cost
 * `economy.ts`'s `computeProduction` already gated production on but did not
 * yet deduct (now applied in turn.ts's `enterProduction`). Keeping a separate
 * flat energy upkeep on top of that real per-mule cost would double-count
 * energy consumption, so it is removed rather than kept alongside. See
 * docs/RULE_SOURCES.md, "Upkeep consolidation" for the before/after example.
 */

/**
 * Divisor applied to a player's food (after production) to compute the amount
 * LOST to spoilage; the remainder (food - floor(food / divisor)) is kept.
 * Source: planet_mule `Player.calcSpoilage`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Player.java`
 * lines 372-391): `case Food: return this.food / 2;` (integer division,
 * i.e. `floor(food / 2)`). The caller subtracts this from the player's
 * current amount (`CollectionPhase.java` lines 188-191:
 * `player.setResource(resource, current - calcSpoilage(resource))`), so
 * `calcSpoilage` returns the LOST amount, not the kept amount.
 */
export const FOOD_SPOILAGE_DIVISOR = 2;

/**
 * Divisor applied to a player's energy (after production) to compute the
 * amount LOST to spoilage, mirroring `FOOD_SPOILAGE_DIVISOR`.
 * Source: `Player.calcSpoilage` (`Player.java` lines 372-391):
 * `case Energy: return this.energy / 4;` (integer division).
 */
export const ENERGY_SPOILAGE_DIVISOR = 4;

/**
 * Maximum smithore or crystite a player may carry between rounds without
 * loss; any amount above this cap is lost to spoilage each round. Smithore
 * and crystite are raw ore and do not spoil below the cap.
 * Source: `Player.calcSpoilage` (`Player.java` lines 372-391):
 * `case Crystite: return this.crystite > 50 ? this.crystite - 50 : 0;` and
 * the identical `case Smithore` branch, both applied via the same
 * current-minus-loss subtraction in `CollectionPhase.java` lines 188-191.
 */
export const ORE_SPOILAGE_CAP = 50;

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

/*
 * Retired: the v1 auction tunables `AUCTION_TICKS` (20),
 * `AUCTION_PRICE_STEP` (1), `AUCTION_PRICE_FLOOR` (5), `AUCTION_PRICE_CEILING`
 * (100), and `AUCTION_STORE_SPREAD` (5) modeled the auction as a fixed number
 * of ticks inside one global [5, 100] price band. That single global band
 * collapsed once dynamic store prices pushed a good's live
 * buy/sell quotes above 100: both clamped to 100, the store's spread vanished,
 * and windows died with no trade (the 55%/76% dead-window rate the M4 gate
 * fixes). The replacements live in the "goods-auction fidelity" section at the
 * end of this file: per-good bands derived from the live store quotes (band =
 * [buyQuote, sellQuote], always spread-wide, never collapsing), a per-good
 * price step (crystite 4, others 1), a quiet-tick countdown with an
 * idle-timeout early end, and a tick-mapped transfer-rate curve. See
 * docs/RULE_SOURCES.md, "Goods auction: bands, roles, timing, transfer".
 */

/**
 * Retired: the flat `DEVELOP_TICKS_PER_TURN` (50) v1 tick
 * budget is replaced by the food-scaled `DEVELOP_TICKS_FULL`/
 * `DEVELOP_TICKS_MIN` pair below (see turn.ts `computeFoodUsage`), matching
 * planet_mule's real per-player develop timer instead of a flat anchor. The
 * numeric FULL case (50) is unchanged, so this is a widening, not a retuning.
 */

/**
 * Ticks the `assay_plot` action deducts from the active develop player's
 * `ticksRemaining` budget (see turn.ts `applyAssayPlot`). Mapped from
 * `developmentAssayTime` (2.5s) via this engine's established FULL-budget
 * anchor (`DEVELOP_TICKS_FULL` = 50 ticks = `developmentMaxTime` 47.5s):
 *   ticksPerSecond = 50 / 47.5; assayTicks = 2.5 * (50 / 47.5) = 2.6316...,
 *   rounded to the nearest whole tick: 3. This replaces an earlier work-
 *   ticket placeholder of 5 ticks proposed before this arithmetic was run;
 *   see docs/RULE_SOURCES.md, "Assay tick cost".
 * Source: `GameData.data.developmentAssayTime = 2.5f` and
 * `developmentMaxTime = 47.5f`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/GameData.java`
 * lines 73, 76).
 */
export const ASSAY_TICK_COST = 3;

// ============================================================
// --- store pricing ---
//
// Dynamic store pricing per planet_mule. Each round boundary the store recalcs
// every good's base price from colony supply and demand, then derives buy/sell
// quotes from it. The controlling formula for food/energy/smithore is
// `price *= STORE_PRICE_RATIO_BASE + STORE_PRICE_RATIO_SLOPE * ratio`, where
// `ratio = demand / supply` (NOT supply/demand -- see the ratio-direction note
// in docs/RULE_SOURCES.md; the plan's key-formulas summary had it inverted).
// Crystite is priced independently each round as a floored random draw.
// See store.ts `updateStoreForNewRound`, `computeColonyStats`, `deriveGoodQuote`.
// ============================================================

/**
 * Food required per player per round, a direct copy of planet_mule's own
 * `foodRequirements` array (index-for-index, PM's round-number index equals
 * this array's index -- PM's round counter is 1-based during play, see
 * "muleCurve round base" in docs/RULE_SOURCES.md). Three lanes read it at two
 * different offsets from this engine's own 1-based round number, because
 * they answer two different questions, and all three are now derived from the
 * same 1-based premise (PM's `getRound()` equals this engine's round number
 * directly, with no shift, throughout that round's phases):
 *
 * - Store pricing (`computeColonyStats` in store.ts) predicts
 *   the UPCOMING round's food demand at the CURRENT round's auction, reading
 *   `FOOD_REQUIREMENTS_BY_ROUND[min(nextRound, 12)]` where `nextRound =
 *   state.round + 1`. This lane's index was already correct under the
 *   1-based premise: `nextRound` is computed structurally (`state.round +
 *   1`), not via a round-offset formula, so it needed no change.
 * - Auction role assignment (`auctionResourceCritical` in
 *   auction.ts) likewise predicts the UPCOMING round's food demand at the
 *   CURRENT round's auction, reading
 *   `FOOD_REQUIREMENTS_BY_ROUND[min(round + 1, 12)]` (PM's
 *   `Player.getResourceCritical(resource, gameModel.getRound(), lastRound)`,
 *   called from `AbstractAuctionPhase.begin`, reads `foodRequirements[n + 1]`
 *   with `n = getRound()` during this engine's round `R`, no shift).
 * - The develop-phase food timer (`beginDevelopTurn` in turn.ts)
 *   consumes the CURRENT round's own requirement at that round's develop
 *   turn, reading `FOOD_REQUIREMENTS_BY_ROUND[min(state.round, 12)]` (PM's
 *   `Player.useFood(getRound())` runs during this engine's round `R` while
 *   `getRound() === R`, no shift).
 *
 * See docs/RULE_SOURCES.md, "Food requirement index: two offsets from one
 * table" for the full worked trace, the resolved round-base fix (re-verified),
 * and worked examples for round 1 and the round-4/5 boundary.
 * Source: planet_mule `GameData.java` line 36
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/GameData.java`):
 * `foodRequirements = {0, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0}` (the trailing
 * index-13 zero is a bounds guard, dropped here since all three lanes
 * clamp/bound their own index); consumed by `Shop.calcBuySellPrice` (Shop.java
 * line 318) for pricing, `Player.getResourceCritical` (Player.java line 464)
 * for auction role assignment, and `Player.useFood` (Player.java lines
 * 166-183, called from `PlayerEventPhase.begin`/`end`, Player.java lines 95,
 * 127) for consumption.
 */
export const FOOD_REQUIREMENTS_BY_ROUND: readonly number[] = [
  0, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5,
];

/**
 * M.U.L.E. units the store stocks at the start of a game. This constant is
 * read only as the `muleStock` seed feeding the smithore mules-available
 * figure; the mule economy (rebuild, cap, buy-side decrement) is a separate
 * concern (see `rebuildMules` in store.ts).
 * Source: planet_mule `GameData.java` line 24, `shopStartNumMules = 14`.
 */
export const STORE_MULE_STOCK_INITIAL = 14;

/**
 * The supply/demand price factor is `RATIO_BASE + RATIO_SLOPE * ratio`, so a
 * good in perfect balance (ratio 1) reprices to the full base and a glut
 * (ratio -> 0) floors the factor at `RATIO_BASE` (0.25).
 * Source: planet_mule `ResourcePrices.java` lines 21, 37, 54
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/ResourcePrices.java`):
 * `f = 0.25f + 0.75f * ratio` in `calcFoodPrice`/`calcEnergyPrice`/`calcSmithorePrice`.
 */
export const STORE_PRICE_RATIO_BASE = 0.25;
export const STORE_PRICE_RATIO_SLOPE = 0.75;

/**
 * Smithore clamps its mules-needed / mules-available ratio into this band
 * before applying the price factor, so a single round can at most cut the
 * price factor to 0.4375 or raise it to 2.5. Food and energy leave their ratio
 * unclamped (only the final price is clamped).
 * Source: planet_mule `ResourcePrices.java` line 53, `calcSmithorePrice`:
 * `f = MuleMath.clamp(n2 / n, 0.25f, 3.0f)`.
 */
export const STORE_SMITHORE_RATIO_MIN = 0.25;
export const STORE_SMITHORE_RATIO_MAX = 3.0;

/**
 * Smithore's post-factor price is floored to this minimum before the random
 * jitter is added, keeping smithore from collapsing to near-zero in a glut.
 * Source: planet_mule `ResourcePrices.java` line 56, `calcSmithorePrice`:
 * `n4 = StrictMath.max(n4, 50)`.
 */
export const STORE_SMITHORE_PRICE_FLOOR = 50;

/**
 * Amplitude of the gaussian jitter added to the smithore price each round:
 * `round(normalDistributed(rng) * 7)`, roughly +/- 7 dollars of noise so
 * smithore does not settle to a perfectly predictable value.
 * Source: planet_mule `Shop.java` line 311, `calcBuySellPrice` (Smithore):
 * `Math.round(1.0f * MuleMath.normalDistributed(random) * 7.0f)`.
 */
export const STORE_SMITHORE_JITTER_AMPLITUDE = 7;

/**
 * Maximum mules-needed figure the smithore demand calculation reports, so a
 * sprawling colony never demands more than a full board's worth of mules.
 * Source: planet_mule `Shop.java` lines 307-309, `calcBuySellPrice` (Smithore):
 * `if (n4 > 8) n4 = 8` (mirrored in `Shop.getMuleNeed`, lines 370-372).
 */
export const STORE_MULE_NEED_CAP = 8;

/**
 * Crystite's per-round price is `shopCrystiteInitialPrice + randInt(0, 100)`,
 * so this is the exclusive upper bound of that random draw (values 0..99).
 * Source: planet_mule `GameData.java` line 35, `shopCrystitePriceDeviance =
 * 100`, drawn as `random.nextInt(shopCrystitePriceDeviance)` in `Shop.java`
 * line 285.
 */
export const STORE_CRYSTITE_PRICE_DEVIANCE = 100;

/**
 * Crystite prices are floored to a multiple of this value (its trade unit).
 * Source: planet_mule `ResourcePrices.java` line 72, `setCrystitePrice`:
 * `this.buyPrice = this.price = n - n % 4`.
 */
export const STORE_CRYSTITE_PRICE_MULTIPLE = 4;

/**
 * Upper clamp shared by food, energy, and smithore base prices; crystite is
 * unclamped (its own random-draw range already bounds it).
 * Source: planet_mule `ResourcePrices.java` lines 28, 44, 62
 * (`MuleMath.clamp(n, floor, 230)` in each `setXPrice`).
 */
export const STORE_PRICE_CEILING = 230;

/**
 * Lower clamp on each good's base price (dollars). Crystite is intentionally
 * absent: PM does not clamp its price.
 * Source: planet_mule `ResourcePrices.java` `setFoodPrice`/`setEnergyPrice`/
 * `setSmithorePrice` (lines 28, 44, 62): `clamp(n, 30, 230)` food,
 * `clamp(n, 25, 230)` energy, `clamp(n, 20, 230)` smithore.
 */
export const STORE_PRICE_FLOOR_BY_GOOD: Readonly<Partial<Record<Resource, number>>> = {
  food: 30,
  energy: 25,
  smithore: 20,
};

/**
 * Dollars subtracted from a good's base price to get the store's buy quote
 * (what it pays a player selling to it). Food and energy carry a 15-dollar
 * margin below base; smithore and crystite set buy equal to base (margin 0).
 * Source: planet_mule `ResourcePrices.java`: `buyPrice = price - 15` in
 * `setFoodPrice`/`setEnergyPrice` (lines 29, 45); `buyPrice = price` in
 * `setSmithorePrice`/`setCrystitePrice` (lines 62, 72).
 */
export const STORE_BUY_MARGIN_BY_GOOD: Readonly<Record<Resource, number>> = {
  food: 15,
  energy: 15,
  smithore: 0,
  crystite: 0,
};

/**
 * Dollars added to a good's buy quote to get its sell quote (what it charges a
 * player buying from it): the store's market-making spread per good.
 * Source: planet_mule `GameData.java` lines 31-34: `shopFoodPriceRange = 35`,
 * `shopEnergyPriceRange = 35`, `shopSmithorePriceRange = 35`,
 * `shopCrystitePriceRange = 140`, applied as `sellPrice = buyPrice + range` in
 * each `ResourcePrices.setXPrice`.
 */
export const STORE_SELL_SPREAD_BY_GOOD: Readonly<Record<Resource, number>> = {
  food: 35,
  energy: 35,
  smithore: 35,
  crystite: 140,
};

/**
 * Maximum units of any one good the store may hold; a sale to the store that
 * would exceed this is capped (excess is sunk). The cap is far above the units
 * that change hands in a normal game, so it effectively never binds; it is
 * present for fidelity with planet_mule's store setters.
 * Source: planet_mule `Shop.java` lines 213-239, every `setX` setter:
 * `this.food = Math.min(n, 255)` (and identically for energy, smithore,
 * crystite). Settles the 32-vs-255 discrepancy in TSavo's audit in favor of
 * 255 -- see docs/RULE_SOURCES.md, "Store stock cap".
 */
export const STORE_STOCK_CAP = 255;

// ============================================================
// --- mule economy + develop timer ---
//
// M.U.L.E. stock cap, smithore-to-mule rebuild, and dynamic mule pricing
// (see store.ts `rebuildMules`); the food-scaled develop-phase tick budget
// (see turn.ts `computeFoodUsage`/`beginDevelopTurn`); and the rank-ordered
// turn queue with mule-shortage reversal (see turn.ts `computeTurnQueue`).
// ============================================================

/**
 * M.U.L.E. units the store rebuilds toward each round boundary, and the most
 * M.U.L.E.s a single rebuild call may add. Both PM fields share the same
 * literal value, so this project uses one constant for both roles.
 * Source: planet_mule `GameData.java` lines 24-25
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/GameData.java`):
 * `shopStartNumMules = 14`, `shopMaxBuildMules = 14`, both read by
 * `Shop.buildMules` (`Shop.java` lines 483-497).
 */
export const MULE_STOCK_CAP = 14;

/**
 * Smithore units the store consumes to rebuild one M.U.L.E.
 * Source: `Shop.buildMules` (`Shop.java` line 484): `int n = 2;`, the
 * smithore-to-mule conversion rate.
 */
export const SMITHORE_PER_MULE = 2;

/**
 * A rebuilt M.U.L.E.'s price is this multiple of the store's current
 * smithore price, before flooring to `MULE_PRICE_FLOOR_STEP`.
 * Source: `Shop.buildMules` (`Shop.java` line 493): `this.mulePrice =
 * this.smithorePrices.price * 2;`.
 */
export const MULE_PRICE_SMITHORE_MULT = 2;

/**
 * A rebuilt M.U.L.E.'s price floors to this dollar step.
 * Source: `Shop.buildMules` (`Shop.java` line 494): `this.mulePrice -=
 * this.mulePrice % 10;`.
 */
export const MULE_PRICE_FLOOR_STEP = 10;

/**
 * Store M.U.L.E. stock at or below which the develop-phase turn order
 * reverses (worst rank first, so scarcity does not always favor the leader).
 * Source: planet_mule `Development.setPlayerOrder`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Development.java`
 * lines 28-39): `if (this.model.getShop().numMules() <= 7) { ... reverse ... }`.
 * Already spot-checked once in docs/RULE_SOURCES.md's "1983 vs PM formula
 * agreement" list; this constant gives that check a named home.
 */
export const DEVELOP_ORDER_REVERSAL_MULE_THRESHOLD = 7;

/**
 * Full develop-phase tick budget for a player who holds enough food to cover
 * that round's requirement. Numerically identical to the retired flat
 * `DEVELOP_TICKS_PER_TURN` (50) so a fully-fed turn's timing is unchanged by
 * this patch; the difference is that a food-short player now gets fewer
 * ticks (see `DEVELOP_TICKS_MIN`) instead of always getting this full budget.
 * Source: `GameData.data.developmentMaxTime = 47.5f`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/GameData.java`
 * line 76), the same FULL-budget anchor `ASSAY_TICK_COST` already maps ticks
 * from (`ticksPerSecond = 50 / 47.5`).
 */
export const DEVELOP_TICKS_FULL = 50;

/**
 * Minimum develop-phase tick budget for a player with zero food toward that
 * round's requirement (the `f = 0` case of PM's `developmentTime = f *
 * developmentMaxTime + (1 - f) * developmentMinTime`).
 * Source: `GameData.data.developmentMinTime = 5.0f`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/GameData.java`
 * line 75), mapped onto this engine's tick scale via the same anchor as
 * `DEVELOP_TICKS_FULL`: `round(5.0 * (50 / 47.5)) = round(5.263...) = 5`.
 */
export const DEVELOP_TICKS_MIN = 5;

// ============================================================
// --- goods-auction fidelity ---
//
// Replaces the retired v1 [5, 100] global band (see the retirement note near
// the top of this file). Each good's auction now derives its price band from
// the store's live buy/sell quotes for that good (band = [buyQuote, sellQuote],
// always spread-wide so it never collapses), auto-assigns buyer/seller roles
// from planet_mule's per-resource critical thresholds, steps prices by a
// per-good amount (crystite 4, others 1), and runs a quiet-tick countdown with
// an idle-timeout early end plus a tick-mapped transfer-rate curve. planet_mule
// is a real-time animated market (GameData.data.auctionTime = 10s, a per-frame
// timer that runs slow while avatars walk and pauses during a transaction), so
// the second-based timings below map onto this engine's discrete tick scale by
// sim experiment; the winning values are recorded in docs/RULE_SOURCES.md,
// "Goods auction: bands, roles, timing, transfer".
// ============================================================

/**
 * Price step per tick for each good's auction: the dollars a participant's
 * bid/ask moves per tick when walking up or down. Crystite steps by 4, every
 * other good by 1.
 * Source: planet_mule `Auction.java` lines 25-30
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Auction.java`):
 * `tickSetupLow = new TickSetup(2, 10, 40, 1)` (priceStep 1) is used for food,
 * energy, and smithore; `tickSetupHigh = new TickSetup(2, 10, 40, 4)`
 * (priceStep 4) is used for crystite (`beginAuction`: `resource ==
 * Resource.Crystite ? tickSetupHigh : tickSetupLow`). The land auction also
 * uses the step-4 setup (out of this workstream's scope).
 */
export const AUCTION_PRICE_STEP_BY_GOOD: Readonly<Record<Resource, number>> = {
  food: 1,
  energy: 1,
  smithore: 1,
  crystite: 4,
};

/**
 * Quiet-tick countdown budget: the number of "quiet" ticks (no participant
 * moved a price and no transaction is in progress) a trading window runs before
 * it closes. planet_mule's phase timer only advances while the auction is idle
 * -- it runs slow (10% speed) while any avatar walks the price axis and pauses
 * entirely during a transaction -- so this engine advances the countdown only
 * on fully quiet ticks, mapping GameData.data.auctionTime (10s) plus that
 * slow/pause behavior onto a discrete quiet-tick budget.
 * Source: planet_mule `GameData.java` lines 101-105 (`auctionTime = 10.0f`,
 * `auctionTimerSlowSpeed = 0.1f`, `auctionTimerFastSpeed = 3.0f`) and
 * `AbstractAuctionPhase.apply(BeginTransactionMessage)`/`(EndTransactionMessage)`
 * (`phaseTimer.pause(true/false)`); the tick value is chosen by the M4 balance
 * sim (see docs/RULE_SOURCES.md, sim-experiment record).
 */
export const AUCTION_QUIET_TICK_BUDGET = 8;

/**
 * Idle-timeout: consecutive quiet ticks (no movement, no transaction) after
 * which a trading window ends early, so a settled or one-sided window does not
 * burn its whole quiet-tick budget doing nothing. Maps planet_mule's
 * out-of-auction drift limit (a participant who stops engaging leaves the price
 * line) onto a whole-window early end.
 * Source: planet_mule `AuctionLimits.TickSetup` `maxOutOfAuction = 40`
 * (`Auction.java` lines 25-26, the fourth-from-last TickSetup arg) as the
 * disengagement concept; the tick value is chosen by the M4 balance sim (see
 * docs/RULE_SOURCES.md, sim-experiment record).
 */
export const AUCTION_IDLE_TIMEOUT = 3;

/**
 * Absolute per-window tick ceiling: a hard safety cap that force-finishes a
 * trading window no matter what, so the AI-vs-AI auction can never spin
 * forever (the cannot-stall watchdog invariant). Set far above the ticks any
 * real window needs (the widest walk is a crystite band of 140 dollars at step
 * 4 = 35 ticks, plus transfer cooldowns), so it never binds in normal play and
 * only catches a pathological non-terminating case.
 * Source: this engine's cannot-stall test requirement (plan's "AI cannot-stall
 * tests ... watchdog ticks"); no planet_mule analog (PM's real-time timer
 * always terminates), value chosen as a safe ceiling above the widest band walk.
 */
export const AUCTION_MAX_TICKS = 400;

/**
 * Transfer-rate curve (in ticks) for successive units within one contiguous
 * transaction run: the cooldown after the first traded unit is the fast
 * `AUCTION_TRANSFER_START_TICKS`; each later unit's cooldown starts from
 * `AUCTION_TRANSFER_BASE_TICKS` and shrinks by `AUCTION_TRANSFER_DECREASE_TICKS`
 * per unit, floored at `AUCTION_TRANSFER_MIN_TICKS`. Cooldown ticks count as
 * "in transaction" (they pause the quiet-tick countdown and reset the idle
 * timer), matching planet_mule's timer pause during a transaction.
 * Source: planet_mule `GameData.java` lines 111-114 (`transactionTimeStart =
 * 225`, `transactionTime = 650`, `transactionTimeDecrease = 75`,
 * `transactionMinTime = 125`, milliseconds) consumed by
 * `AbstractAuctionPhase.doTransactions` (first unit uses `transactionTimeStart`,
 * later units `transactionTime - unitsTraded * transactionTimeDecrease`, floored
 * at `transactionMinTime`); the millisecond values are mapped to whole ticks by
 * the M4 balance sim (see docs/RULE_SOURCES.md, sim-experiment record).
 */
// Source (all four): planet_mule `GameData.java` lines 111-114, ms transfer
// timings mapped to ticks by the M4 balance sim (see the block comment above).
export const AUCTION_TRANSFER_START_TICKS = 1;
export const AUCTION_TRANSFER_BASE_TICKS = 3;
export const AUCTION_TRANSFER_DECREASE_TICKS = 1;
export const AUCTION_TRANSFER_MIN_TICKS = 1;

// ============================================================
// --- colony land-auction fidelity ---
//
// One unowned, non-town plot is offered per land-auction phase entry,
// gated by `LAND_AUCTION_COLONY_PROBABILITIES` (up to three plots per
// round; a later slot only rolls when the previous slot's plot sold --
// see `PlotSeller.generateNextColonyAuction`/`AbstractLandAuctionPhase
// .goToNextPhase`, `landBought && plotSeller.generateNextColonyAuction(...)`).
// planet_mule sells the plot through the same real-time avatar
// price-axis-walk `AuctionController` the goods auction uses
// (`Auction.beginLandAuction` -> `tickSetupHigh`, step 4, band
// `[landPrice, landPrice + landAuctionPriceRange]`, `landAuctionTime =
// 34.25f` seconds real time); this engine maps that onto a discrete
// `bid_land` action (a player raises their own standing bid to the
// current asking level) plus a going-once/going-twice idle countdown,
// the tick-based analog documented in `land_auction.ts`'s module doc and
// docs/RULE_SOURCES.md, "Colony land auction: pricing, bidding, tie-break".
// ============================================================

/**
 * Probability a colony land-auction slot offers a plot, indexed 0, 1, 2 for
 * the first, second, and third possible plot this round. A later index only
 * rolls when the previous slot's plot actually sold, so the effective
 * expected count per round is well under the naive sum of these three.
 * Source: planet_mule `PlotSeller.java` line 25, `colonyAuctionProbabilities
 * = new float[]{0.691462f, 0.446211f, 0.216528f}`, consumed by
 * `generateNextColonyAuction`'s `f2 <= f` roll.
 */
export const LAND_AUCTION_COLONY_PROBABILITIES: readonly number[] = [0.691462, 0.446211, 0.216528];

/**
 * Starting price for the very first colony land auction of the game, before
 * any plot has ever sold or drifted (so no running average exists yet).
 * Source: planet_mule `GameData.java` line 133, `landAuctionPrice = 160`,
 * read once into `PlotSeller.landPrice` at construction.
 */
export const LAND_AUCTION_START_PRICE = 160;

/**
 * Dollars subtracted when seeding a new auction's starting price from a
 * reference price (either the previous round's average sale, or the
 * previous individual sale/drift within the same round's chain).
 * Source: planet_mule `PlotSeller.beginAuction` (`PlotSeller.java` lines
 * 118-136): `this.landPrice = this.landPriceAccumulator / this.auctionSetSize
 * - 60` for a new round's first slot, `this.landPrice = this.landSellPrice -
 * 60` for a later slot in the same round's chain.
 */
export const LAND_AUCTION_PRICE_DROP = 60;

/**
 * Minimum a seeded starting price is ever allowed to fall to.
 * Source: planet_mule `PlotSeller.beginAuction` (`PlotSeller.java` line 132):
 * `this.landPrice = Math.max(this.landPrice, 80)`.
 */
export const LAND_AUCTION_PRICE_FLOOR = 80;

/**
 * A seeded starting price is rounded to the nearest multiple of this amount
 * (round-half-down, matching `MuleMath.closest`), after the floor clamp.
 * Source: planet_mule `PlotSeller.beginAuction` (`PlotSeller.java` line 133):
 * `this.landPrice = MuleMath.closest(this.landPrice, 4)`; `MuleMath.closest`
 * (`MuleMath.java` lines 10-16) rounds to the nearest multiple, ties down.
 */
export const LAND_AUCTION_PRICE_MULTIPLE = 4;

/**
 * Width of the price band a colony land auction's bids may climb through,
 * added to the seeded starting price to get the hard price ceiling.
 * Source: planet_mule `GameData.java` line 134, `landAuctionPriceRange =
 * 140`, consumed as `n2 = n + GameData.data.landAuctionPriceRange` in
 * `AbstractLandAuctionPhase.begin` (line 206) and passed to
 * `Auction.beginLandAuction` as the auction's upper price tick bound.
 */
export const LAND_AUCTION_PRICE_RANGE = 140;

/**
 * Dollars added to half the auction's starting price to get the drifted
 * price when a colony land-auction slot ends with no bidder at all. This
 * drifted price feeds the running average/last-sale memory the same way a
 * real sale price would, so a string of no-sale plots still pulls future
 * seed prices down over time.
 * Source: planet_mule `PlotSeller.finishAuction` (`PlotSeller.java` line
 * 153): `this.landSellPrice = this.landPrice / 2 + 52;` (integer division;
 * `landPrice` is always a multiple of `LAND_AUCTION_PRICE_MULTIPLE`, so the
 * division is always exact).
 */
export const LAND_AUCTION_FAILED_SALE_OFFSET = 52;

/**
 * Dollars a `bid_land` action raises the calling player's own standing bid
 * by, above their previous bid (a first bid instead commits at the seeded
 * `startPrice`, no step added). Matches planet_mule's per-tick land-auction
 * price-axis step, reused here as this engine's discrete bid increment.
 * Source: planet_mule `Auction.java` line 26, `tickSetupHigh = new
 * TickSetup(2, 10, 40, 4)` (`beginLandAuction` always uses `tickSetupHigh`,
 * the same step-4 setup crystite uses in the goods auction).
 */
export const LAND_AUCTION_BID_STEP = 4;

/**
 * Consecutive idle ticks (no new `bid_land`) a colony land auction waits at
 * each stage before advancing: `LAND_AUCTION_GOING_TICKS` idle ticks reach
 * "going once", twice that reach "going twice", and three times that
 * finalizes the auction (sold to the current leader, or a failed sale if no
 * one ever bid).
 * Source: planet_mule `Auction.java` line 26, `tickSetupHigh`'s
 * `maxOutOfAuction = 40` (the same disengagement-timer concept
 * `AUCTION_IDLE_TIMEOUT` maps for the goods auction), mapped onto this
 * engine's discrete going-tick stages by the M5 balance sim (see
 * docs/RULE_SOURCES.md, sim-experiment record).
 */
export const LAND_AUCTION_GOING_TICKS = 3;

/**
 * Absolute per-auction tick ceiling: a hard safety cap that force-finishes a
 * colony land auction no matter what, mirroring `AUCTION_MAX_TICKS`'s
 * cannot-stall watchdog role. The going-tick countdown plus the bounded
 * number of possible bids (the price band is `LAND_AUCTION_PRICE_RANGE /
 * LAND_AUCTION_BID_STEP` steps wide per player) already guarantees
 * termination well under this ceiling in normal play.
 * Source: this engine's cannot-stall test requirement (plan's "AI
 * cannot-stall tests ... watchdog ticks"); no planet_mule analog (PM's
 * real-time timer always terminates), value chosen as a safe ceiling above
 * the widest possible bid sequence.
 */
export const LAND_AUCTION_MAX_TICKS = 400;

// ============================================================
// --- events: personal + colony ---
//
// Personal events (per develop turn, 27.5% chance, shuffled 22-event deck) and
// colony events (one per round from a pre-shuffled weighted deck, split A/B
// around production) per planet_mule's PlayerEvent(Generator) and
// ColonyEvent(Generator). The per-event money factors, deck composition, and
// message table live in events.ts (they are tuple/record data keyed by the
// event-name unions defined there); this section holds the scalar rule
// constants and the two derived-RNG salts. See docs/RULE_SOURCES.md,
// "Personal events" and "Colony events".
// ============================================================

/**
 * Upper clamp (and floor of 0) on a single M.U.L.E.'s per-round production,
 * applied in `computeProduction` after any category-A colony temporary bonus.
 * Source: planet_mule `GameData.java` line 88, `productionMaxProduction = 8`,
 * enforced by `Factory.setProduction`/`Factory.calcCapacity`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/Factory.java`
 * lines 62, 134).
 */
export const PRODUCTION_MAX_YIELD = 8;

/**
 * Probability that a player's develop turn (round 2 onward) fires a personal
 * event; the per-turn `rng.next()` roll fires when it is at or below this.
 * Source: planet_mule `GameData.java` line 135, `playerEventChance = 0.275f`,
 * consumed by `PlayerEventGenerator.nextEvent` (`PlayerEventGenerator.java`
 * line 70: `if (f > GameData.data.playerEventChance) return null`).
 */
export const PLAYER_EVENT_CHANCE = 0.275;

/**
 * Salts mixed with the game seed to derive the two event sub-RNG streams,
 * isolating personal-event and colony-event randomness from the core
 * economy/auction RNG stream so adding events does not perturb the pre-event
 * replay sequence (planet_mule uses a separate `Random` for personal events;
 * this engine extends that isolation to colony events too).
 * Source: this engine's event-RNG isolation design; no planet_mule numeric
 * analog (arbitrary distinct 32-bit mixing constants). See
 * docs/RULE_SOURCES.md, "Event RNG isolation".
 */
export const PLAYER_EVENT_RNG_SALT = 0x9e3779b1;
export const COLONY_EVENT_RNG_SALT = 0x85ebca6b;

/**
 * Rounds that draw their colony event from the early deck only (pirates, acid
 * rain, sunspot, fire); rounds after this draw from the late deck too. The
 * game's final round is always forced to the ship-return event, overriding the
 * deck.
 * Source: planet_mule `ColonyEventGenerator.generate` (`ColonyEventGenerator.java`
 * lines 45-48): `int n2 = 2; for (i=0; i<n2; i++) events.add(early.get(i))`,
 * so the first two post-round-0 slots (rounds 1 and 2) come from the early
 * deck.
 */
export const COLONY_DECK_EARLY_ROUND_COUNT = 2;

/**
 * Acid-rain temporary production bonus for food M.U.L.E.s: `STRUCK` on the
 * randomly struck row, `OFF` on every other row. Applied as a per-plot
 * temporary bonus before production.
 * Source: planet_mule `ColonyEvent.applyEvent` ACID_RAIN_STORM
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/ColonyEvent.java`
 * lines 220-226): struck-row food `temporaryBonus + 4`, off-row `+ 1`.
 */
export const ACID_RAIN_STRUCK_FOOD_BONUS = 4;
export const ACID_RAIN_OFF_FOOD_BONUS = 1;

/**
 * Acid-rain temporary production penalty for energy M.U.L.E.s: `STRUCK` on the
 * struck row, `OFF` elsewhere (both negative).
 * Source: planet_mule `ColonyEvent.applyEvent` ACID_RAIN_STORM
 * (`ColonyEvent.java` lines 229-233): struck-row energy `temporaryBonus - 2`,
 * off-row `- 1`.
 */
export const ACID_RAIN_STRUCK_ENERGY_PENALTY = -2;
export const ACID_RAIN_OFF_ENERGY_PENALTY = -1;

/**
 * Sunspot temporary production bonus added to every energy M.U.L.E.
 * Source: planet_mule `ColonyEvent.applyEvent` SUNSPOT_ACTIVITY
 * (`ColonyEvent.java` line 209): `factory.setTemporaryBonus(getTemporaryBonus()
 * + 3)`.
 */
export const SUNSPOT_ENERGY_BONUS = 3;

/**
 * Probability that a planetquake, in addition to halving mining production,
 * also degrades a mountain and heaves up an adjacent plain.
 * Source: planet_mule `ColonyEvent` PLANET_QUAKE constructor (`ColonyEvent.java`
 * line 94): `if (random.nextFloat() < 0.5f)`.
 */
export const PLANETQUAKE_DEGRADE_CHANCE = 0.5;

/**
 * Crystite level a meteorite strike sets on the plot it craters (the only
 * source of the top crystite tier in the game).
 * Source: planet_mule `ColonyEvent.applyEvent` METEORITE_STRIKE
 * (`ColonyEvent.java` line 188): `this.tile.setCrystite(4)`.
 */
export const METEORITE_CRYSTITE_LEVEL = 4;

/**
 * Highest existing crystite level a plot may already carry to be eligible for a
 * meteorite strike (a plot already richer than this is skipped).
 * Source: planet_mule `ColonyEvent` METEORITE_STRIKE constructor
 * (`ColonyEvent.java` line 88): the reject loop continues while
 * `planetTile.getCrystite() > 2`, so only plots with crystite <= 2 qualify.
 */
export const METEORITE_MAX_ELIGIBLE_CRYSTITE = 2;

// ============================================================
// Production formula completion
//
// Completes `economy.ts`'s `computeProduction`: the learning-curve count
// bonus, unconditional gaussian variance, the flat adjacency bonus (whose
// constant lives with the other yield-table constants above, corrected in
// place), the verified energy-shortfall model, and crystite yield going
// live (crystite reads `Plot.crystiteLevel` directly, see
// `CRYSTITE_YIELD_BY_TERRAIN`'s doc comment above -- no new yield constant
// needed for that). See docs/RULE_SOURCES.md, "Production: variance and the
// energy-shortfall model" and "Production: adjacency and learning-curve
// bonuses" for the full adjudication record.
// ============================================================

/**
 * Divisor for the learning-curve production bonus: every one of a player's
 * factories outfitted for a given resource gets
 * `floor(thatPlayersFactoryCountForThatResource / PRODUCTION_LEARNING_CURVE_DIVISOR)`
 * added to its capacity, regardless of adjacency.
 * Source: planet_mule `Building.calcBonuses`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/Building.java`
 * lines 83-111): per-player, per-resource factory counts (`n`/`n2`/`n3`/`n4`)
 * are tallied first, then every owned factory of that resource gets
 * `factory.setBonus(factory.getBonus() + n / 3 + n6)` (integer division;
 * `n6`, a hireling-related term, is always 0 in this project's classic-1983
 * scope -- no lab items or hirelings).
 */
export const PRODUCTION_LEARNING_CURVE_DIVISOR = 3;

// ============================================================
// --- wampus + pub gambling ---
//
// A colony-wide wampus creature spawns once per round on an unowned mountain
// during the develop phase, blinks in and out of visibility, moves between
// mountains, and awards a cash bounty to whoever catches it (see wampus.ts,
// game_state.ts's WampusState). Pub gambling is a develop-turn action that
// pays out from a per-round bonus table plus a time-scaled random amount,
// capped, and ends the turn (see turn.ts applyGamble). See
// docs/RULE_SOURCES.md, "Wampus: spawn, blink, and move timing" and "Pub
// payout array" for the full adjudication.
// ============================================================

/**
 * This round's wampus bounty is `WAMPUS_BOUNTY_BASE *
 * floor((round + WAMPUS_BOUNTY_ROUND_OFFSET) / WAMPUS_BOUNTY_ROUND_DIVISOR)`.
 * Already spot-checked in docs/RULE_SOURCES.md's "1983 vs PM formula
 * agreement" list (1983 and PM agree).
 * Source: planet_mule `Wampus` constructor
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Wampus.java`
 * line 59): `this.moneyReward = 100 * ((n + 4) / 4);` (integer division),
 * `n` the round the wampus was created for.
 */
export const WAMPUS_BOUNTY_BASE = 100;
export const WAMPUS_BOUNTY_ROUND_OFFSET = 4;
export const WAMPUS_BOUNTY_ROUND_DIVISOR = 4;

/**
 * Ticks before the wampus's first blink of the round: a base delay plus a
 * discrete draw in `[0, WAMPUS_INITIAL_DELAY_RAND_TICKS]`, mapped from PM's
 * continuous `12.0 + 3.0 * random.nextFloat()` seconds via this engine's
 * established develop-tick anchor (`ticksPerSecond = DEVELOP_TICKS_FULL /
 * 47.5`, the same ratio `ASSAY_TICK_COST` uses): `round(12.0 * 50/47.5) =
 * round(12.6316) = 13`; `round(3.0 * 50/47.5) = round(3.1579) = 3`.
 * Source: planet_mule `Wampus` constructor (`Wampus.java` line 56):
 * `this.blinkTimer = ... 12.0f + 3.0f * random.nextFloat();`.
 */
export const WAMPUS_INITIAL_DELAY_BASE_TICKS = 13;
export const WAMPUS_INITIAL_DELAY_RAND_TICKS = 3;

/**
 * Ticks the wampus stays visible per blink, and ticks it stays hidden
 * between blinks, mapped from PM's continuous 0.75s/4.25s via the same
 * develop-tick anchor as `WAMPUS_INITIAL_DELAY_BASE_TICKS`:
 * `round(0.75 * 50/47.5) = round(0.7895) = 1`;
 * `round(4.25 * 50/47.5) = round(4.4737) = 4`.
 * Source: planet_mule `Wampus.update` (`Wampus.java` lines 65-91): the
 * non-`easyToCatchWampus` branches add `0.75f` (becoming visible) or
 * `4.25f` (becoming hidden) to `blinkTimer` on each toggle.
 */
export const WAMPUS_VISIBLE_TICKS = 1;
export const WAMPUS_HIDDEN_TICKS = 4;

/**
 * Number of visible blinks the wampus makes at one mountain site before
 * moving to a new one.
 * Source: planet_mule `Wampus.update` (`Wampus.java` line 80): `this.numBlinks
 * = 2;`, set each time a new site is chosen (`numBlinks == 0`).
 */
export const WAMPUS_BLINKS_PER_SITE = 2;

/**
 * Salt mixed with the game seed to derive the isolated wampus sub-RNG
 * stream, distinct from `PLAYER_EVENT_RNG_SALT`/`COLONY_EVENT_RNG_SALT`. No
 * PM numeric analog (arbitrary distinct 32-bit mixing constant); the
 * isolation design itself matches planet_mule's own: `Wampus`'s constructor
 * seeds a fresh `Random` derived from, but independent of, the main stream.
 * Source: `Wampus` constructor (`Wampus.java` line 60): `this.random = new
 * Random(random.nextLong());`. See docs/RULE_SOURCES.md, "Wampus RNG
 * isolation" for the full adjudication.
 */
export const WAMPUS_RNG_SALT = 0xc2b2ae3d;

/**
 * Per-round pub gambling bonus, added to a random time-scaled amount (see
 * `PUB_MAX_RANDOM_AMOUNT`). Index 0 is unused (rounds are 1-based); indices
 * 1-12 are the per-round bonus. Settles a transcription conflict in a
 * third-party audit in favor of this direct extraction -- see
 * docs/RULE_SOURCES.md, "Pub payout array: TSavo transcription error".
 * Source: planet_mule `GameData.java` line 78:
 * `developmentPubRoundBonus = {0, 50, 50, 50, 100, 100, 100, 100, 150, 150,
 * 150, 150, 200}`.
 */
export const PUB_ROUND_BONUS_BY_ROUND: readonly number[] = [
  0, 50, 50, 50, 100, 100, 100, 100, 150, 150, 150, 150, 200,
];

/**
 * Upper bound of the random amount added to a gamble's per-round bonus,
 * scaled by how much of the develop turn's tick budget remains
 * (`payload.ticksRemaining / DEVELOP_TICKS_FULL`, this engine's tick analog
 * of PM's `timeLeft / developmentMaxTime`).
 * Source: planet_mule `GameData.java` line 79, `developmentPubMaxRandomAmount
 * = 200`, consumed by `GameModel.gamble` (`GameModel.java` lines 431-443):
 * `n += (int)(random.nextFloat() * f3 * developmentPubMaxRandomAmount)`.
 */
export const PUB_MAX_RANDOM_AMOUNT = 200;

/**
 * Hard cap on a single gamble's total payout.
 * Source: planet_mule `GameModel.gamble` (`GameModel.java` line 443):
 * `n = Math.min(n, 250);`.
 */
export const PUB_PAYOUT_CAP = 250;

// ============================================================
// --- endgame: scoring, colony rating, colony failure ---
//
// The scoring phase (turn.ts enterScoring, scoring.ts) totals each player's
// money, land value, installed-M.U.L.E. value, and goods inventory at current
// store prices into a colony total, rates that total against the 7
// Federation message tiers below (scaled by the game's round count), checks
// for a colony-wide resource failure at every non-final round boundary, and
// awards First Founder to the rank-1 player when the colony survives to its
// final round. See docs/RULE_SOURCES.md, "Endgame scoring: per-plot and
// per-mule terms" and "Colony failure: food-production gate" for the full
// adjudication.
// ============================================================

/**
 * Points added to a player's score for each M.U.L.E. installed and outfitted
 * on their land, on top of that outfit's `OUTFIT_COST`. Applies once per
 * installed M.U.L.E., independent of `LAND_VALUE_PER_PLOT` (which every
 * owned plot earns regardless of whether it carries a M.U.L.E.).
 * Source: planet_mule `GameData.java` line 45, `pointsPerMule = 35`,
 * consumed by `Player.calcPoints` (`Player.java` lines 411-426):
 * `this.goodsPoints += GameData.data.pointsPerMule;` once per owned tile
 * whose `Factory` is non-null (an installed, outfitted M.U.L.E.).
 */
export const POINTS_PER_MULE = 35;

/**
 * The seven Federation outcome messages a completed game's colony rating
 * indexes into, worst first. Verbatim text from the emulation target.
 * Source: planet_mule `SummaryPhase2.java` line 58 (`colonyMessages`),
 * `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/controller/phase/SummaryPhase2.java`.
 */
export const COLONY_RATING_MESSAGES: readonly string[] = [
  "Overall, the Colony failed... Dismally. The Federation debtors' prison is your next home!",
  "Overall, the Colony failed... The Federation will no longer send trade ships. You are on your own!",
  "Overall, the Colony survived... Barely. You will be living in tents. Few trading ships will come your way!",
  "Overall, the Colony was a success. You have met the minimum standards set by the Federation, but your life will not be easy!",
  "Overall, the Colony succeeded. The Federation is pleased by your efforts. You will live comfortably!",
  "Overall, the Colony succeeded... Extremely well. You can now retire in elegant estates!",
  "Overall, the Colony delighted the Federation with your exceptional achievement. Your retirement will be luxurious!",
];

/**
 * Colony-total dollars spanning one rating tier in a
 * `COLONY_RATING_ROUND_BASE`-round game. The actual span this game rates
 * against scales with the game's own round count (`COLONY_RATING_TIER_SPAN *
 * roundCount / COLONY_RATING_ROUND_BASE`), so a shorter beginner game does
 * not demand the same colony total as a full standard game to reach the same
 * tier. Rated tier = `clamp(colonyTotal / span, 0, COLONY_RATING_MESSAGES.length - 1)`.
 * Source: planet_mule `SummaryPhase2.getColonyMessage` (`SummaryPhase2.java`
 * lines 282-289): `n2 = 20000 * n / 12; n3 = MuleMath.clamp(colonyTotal / n2,
 * 0, colonyMessages.length - 1);`, `n` the game's `getLastRound()`. See
 * docs/RULE_SOURCES.md, "Colony rating: Planet M.U.L.E. formula vs 1983".
 */
export const COLONY_RATING_TIER_SPAN = 20000;
export const COLONY_RATING_ROUND_BASE = 12;

/**
 * Colony-failure shortage messages, shown when a non-final round ends with
 * one of these resources totaling zero across the store and every player,
 * with no player owning a food-outfitted M.U.L.E. (see scoring.ts
 * `checkColonyFailure`). A failed colony skips straight to scoring: no
 * rating tier or First Founder is awarded.
 * Source: planet_mule `SummaryPhase2.checkShortageMessage` (`SummaryPhase2.java`
 * lines 133-141).
 */
export const COLONY_FAILURE_MESSAGE_FOOD = "The Colony Failed because of a Total Lack of Food!";
export const COLONY_FAILURE_MESSAGE_ENERGY = "The Colony Failed because of a Total Lack of Energy!";
