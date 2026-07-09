/**
 * Pure production and spoilage functions for the M.U.L.E. engine.
 *
 * Everything here is a pure function over its arguments: no mutation, no
 * DOM, no module-level state. Callers pass in the current board and player
 * list and get back new per-player resource records.
 */

import type { Player, Resource } from "./player";
import type { Plot } from "./game_state";
import type { Rng } from "./rng";
import { normalDistributed } from "./rng";
import {
  ADJACENCY_BONUS_PER_NEIGHBOR,
  ENERGY_PER_MULE,
  ENERGY_SPOILAGE_DIVISOR,
  FOOD_SPOILAGE_DIVISOR,
  ORE_SPOILAGE_CAP,
  PRODUCTION_LEARNING_CURVE_DIVISOR,
  PRODUCTION_MAX_YIELD,
  YIELD_TABLE_BY_RESOURCE,
} from "./constants";

/** Per-player resource totals, keyed the same way as `Player.goods`. */
export type ResourceRecord = Record<Resource, number>;

/**
 * The production output of a single installed, powered M.U.L.E., recorded per
 * plot so callers that need per-plot resolution (the colony events in
 * `events.ts`: pest zeroing one plot, planetquake halving each mining plot,
 * pirates zeroing every crystite plot) can adjust individual plots after
 * production. `amount` is the final, clamped ([0, `PRODUCTION_MAX_YIELD`])
 * yield the plot contributed to its owner. Unpowered or unowned/unoutfitted
 * plots produce no entry.
 */
export interface PlotProduction {
  readonly row: number;
  readonly col: number;
  readonly owner: number;
  readonly resource: Resource;
  readonly amount: number;
}

/**
 * Optional per-plot production modifiers a colony event injects BEFORE
 * production is computed. Currently only the pre-production (category A)
 * temporary bonus: a signed per-plot yield adjustment keyed `"row,col"`, added
 * to a plot's capacity before the [0, `PRODUCTION_MAX_YIELD`] clamp. This is
 * the acid-rain (`+4`/`+1` food, `-2`/`-1` energy) and sunspot (`+3` energy)
 * effect, matching planet_mule's `Factory.temporaryBonus` consumed and reset
 * each round in `Factory.calcCapacity` (`Factory.java` lines 123, 127). Post-
 * production (category B) effects are applied by `events.ts` to the returned
 * `perPlot` list, mirroring PM's post-production `Factory.setProduction`.
 */
export interface ProductionModifiers {
  readonly tempBonusByPlot?: ReadonlyMap<string, number>;
}

/**
 * Key a plot's `(row, col)` for the `tempBonusByPlot` modifier map.
 *
 * @param row - Zero-based row index.
 * @param col - Zero-based column index.
 * @returns The `"row,col"` string key.
 */
export function plotKey(row: number, col: number): string {
  return `${row},${col}`;
}

/**
 * Count of orthogonally adjacent plots (up/down/left/right) that are owned
 * by `owner` and outfitted for the same `resource` as the plot at
 * (row, col). Used to compute the adjacency clustering bonus.
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param row - Row of the plot being scored.
 * @param col - Column of the plot being scored.
 * @param owner - Owning player index to match against neighbors.
 * @param resource - Outfit resource to match against neighbors.
 * @returns Number of matching same-owner, same-outfit neighbors (0 to 4).
 */
function countMatchingNeighbors(
  plots: readonly (readonly Plot[])[],
  row: number,
  col: number,
  owner: number,
  resource: Resource,
): number {
  const deltas: readonly [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  let matches = 0;
  for (const [rowDelta, colDelta] of deltas) {
    const neighborRow = row + rowDelta;
    const neighborCol = col + colDelta;
    const neighborRowPlots = plots[neighborRow];
    if (neighborRowPlots === undefined) {
      continue;
    }
    const neighbor = neighborRowPlots[neighborCol];
    if (neighbor === undefined) {
      continue;
    }
    if (neighbor.owner === owner && neighbor.muleOutfit === resource) {
      matches += 1;
    }
  }
  return matches;
}

/**
 * Base yield (before adjacency/count/temp bonus and variance) of a single
 * installed M.U.L.E. outfitted for `resource` on `plot`. Crystite is a
 * special case: its base yield is the plot's own deposit level
 * (`plot.crystiteLevel`), not a terrain-type lookup -- verified against
 * `PlanetTile.getYieldPotential`'s `Crystite` case, which returns
 * `getCrystite()` directly
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/PlanetTile.java`
 * lines 84-86). This reads the true level regardless of `crystiteRevealed`:
 * production is a real gameplay mechanic, not a UI concern, and PM's own
 * `yieldVisible` flag only gates the production-digit sprite, never the
 * actual yield (see docs/RULE_SOURCES.md, "Crystite production" and
 * `game_state.ts`'s `visibleCrystite` doc comment, which reserves its gate
 * for code rendering to the player). River and town plots are already forced
 * to `crystiteLevel = 0` at map generation (see `CRYSTITE_BLOOM_MAX_LEVEL`'s
 * doc comment in `constants.ts`), so no separate terrain check is needed
 * here. Every other resource keeps the terrain-type yield table; pairs
 * absent from that table (for example smithore on a river plot) produce
 * zero.
 *
 * @param plot - Plot the installed M.U.L.E. sits on.
 * @param resource - Resource the installed M.U.L.E. is outfitted for.
 * @returns Base yield in units for one round.
 */
function baseYield(plot: Plot, resource: Resource): number {
  if (resource === "crystite") {
    return plot.crystiteLevel;
  }
  const yieldTable = YIELD_TABLE_BY_RESOURCE[resource];
  const terrainYield = yieldTable[plot.terrain];
  if (terrainYield === undefined) {
    return 0;
  }
  return terrainYield;
}

/**
 * Fisher-Yates shuffle of a copy of `items`, driven by `rng` in the same
 * back-to-front direction as Java's `Collections.shuffle` (swap index i-1
 * with a random index in [0, i)). Returns a new array; `items` is not
 * mutated. Mirrors `events.ts`'s private `shuffle` helper (kept as a
 * separate copy here rather than a shared export: `events.ts` is a
 * workstream boundary this patch does not touch).
 *
 * @param rng - Seeded generator (advanced once per swap).
 * @param items - Items to shuffle.
 * @returns A shuffled copy.
 */
function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length; i > 1; i -= 1) {
    const j = rng.nextInt(i);
    const a = out[i - 1];
    const b = out[j];
    if (a === undefined || b === undefined) {
      throw new Error("shuffle: index out of range");
    }
    out[i - 1] = b;
    out[j] = a;
  }
  return out;
}

/** All-zero counts, one entry per `Resource`, used for the per-player
 * per-resource outfitted-factory tally the learning-curve bonus reads. */
function zeroCounts(): Record<Resource, number> {
  return { food: 0, energy: 0, smithore: 0, crystite: 0 };
}

/**
 * Result of `computeProduction`: each player's produced yields (gross, for
 * UI display via `ProductionPayload.yields`) and the energy actually spent
 * powering mules this round, in `players` order.
 */
export interface ProductionResult {
  readonly yields: readonly ResourceRecord[];
  readonly energyConsumed: readonly number[];
  /**
   * Per-plot production detail, grouped by owner (players in `players`
   * order) and, within an owner, in that owner's random per-round
   * processing order (see `computeProduction`'s energy-shortfall doc), not
   * board row-major order. Callers that adjust individual plots after
   * production (the colony events in `events.ts`) should match by
   * `(row, col)`, not by list position. Summing `perPlot` by owner/resource
   * reproduces `yields`.
   */
  readonly perPlot: readonly PlotProduction[];
}

/**
 * Compute each player's total production for one round:
 * `capacity = terrainYield + adjacencyBonus + floor(sameResourceCount /
 * PRODUCTION_LEARNING_CURVE_DIVISOR) + tempBonus + round(normalDistributed(rng))`,
 * clamped to `[0, PRODUCTION_MAX_YIELD]`, then zeroed entirely if the mule
 * goes unpowered. Matches `Factory.calcCapacity`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/Factory.java`
 * lines 121-136): `capacity = yieldPotential + bonus + temporaryBonus +
 * round(normalDistributed(random))`, gated and clamped by the private
 * `calcCapacity(int)` overload. `bonus` itself is `Building.calcBonuses`'s
 * sum of the adjacency and count terms below.
 *
 * - `terrainYield`: `baseYield` above -- the terrain yield table, or the
 *   plot's own crystite deposit level for a crystite mule.
 * - `adjacencyBonus`: a FLAT `ADJACENCY_BONUS_PER_NEIGHBOR` (not
 *   per-neighbor) when at least one orthogonally adjacent plot is owned by
 *   the same player and outfitted for the same resource, `0` otherwise.
 *   Verified against `Building.calcBonuses`
 *   (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/Building.java`
 *   lines 68-77): `n5` counts matching neighbors but the bonus applied is a
 *   flat `+1` once `n5 > 0`, never `+1` per neighbor. This corrects this
 *   engine's prior per-neighbor-count reading, which predated this
 *   verification pass (see the constant's own doc comment in
 *   `constants.ts`).
 * - Learning-curve count bonus: `floor(sameResourceCount /
 *   PRODUCTION_LEARNING_CURVE_DIVISOR)`, where `sameResourceCount` is this
 *   player's TOTAL outfitted-factory count for this resource across the
 *   whole board (not just neighbors), added to EVERY one of that player's
 *   factories of that resource. Verified against the same `calcBonuses`
 *   method (`Building.java` lines 83-111): per-player, per-resource totals
 *   (`n`/`n2`/`n3`/`n4`) are tallied first, then `factory.setBonus(...+ n/3
 *   + n6)` (integer division) is applied to every owned factory of that
 *   resource; `n6` (a hireling-related term) is always 0 in this project's
 *   scope (no lab items/hirelings).
 * - `tempBonus`: `modifiers.tempBonusByPlot`, unchanged from the M6
 *   category-A colony-event plumbing (see the doc comment below).
 * - Variance: `round(normalDistributed(rng))`, drawn UNCONDITIONALLY for
 *   every owned, outfitted plot -- not mode-scaled, matching resolved
 *   decision (a) in `docs/RULE_SOURCES.md` ("Production: variance and the
 *   energy-shortfall model"); the 1983 mode-scaled variant is heritage-only.
 *   The draw happens even for a plot that ends up unpowered (see below), so
 *   the RNG draw count per player is independent of which mules are
 *   powered, matching `Factory.calcCapacity`'s own unconditional draw ahead
 *   of its power gate.
 *
 * Energy-shortfall gating: a non-energy mule only produces if its owner
 * still has `ENERGY_PER_MULE` banked energy when the mule is processed;
 * energy mules draw no power and are never gated (`Resource.energyCost`,
 * `GameData.java` lines 38-42). Each player's owned, outfitted plots are
 * processed in a RANDOM per-round order (a Fisher-Yates `shuffle` driven by
 * `rng`), not board order, so which mule loses power on a shortfall is not
 * fixed by board position -- matching `Player.useEnergy`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Player.java`
 * lines 185-201): `Collections.shuffle(ownedTiles, random)`, then
 * `power = min(remainingEnergy, energyNeeded)` per tile, consuming energy in
 * that shuffled order before the per-factory `calcCapacity` draw. The energy
 * budget itself is read from each player's PRE-production inventory
 * (matching planet_mule's per-round order: usage draws from the previous
 * round's leftover energy, before this round's yields are added).
 *
 * `Factory.calcCapacity`'s power gate also has a "partial power, halved
 * (minimum 1)" branch for a mule needing more than one energy unit. This
 * project implements no such mule (`ENERGY_PER_MULE` is a flat 1 for every
 * non-energy resource, food/energy/smithore/crystite alike -- no lab items,
 * out of this project's classic-1983-core scope per `REFERENCE_REPOS.md`),
 * so `power` can only ever be `0` or `ENERGY_PER_MULE` per mule and that
 * branch is unreachable even in PM itself under these inputs; this project
 * implements the branch that IS reachable -- full power or zero -- and does
 * not encode the unreachable one. See `docs/RULE_SOURCES.md`, "Production:
 * variance and the energy-shortfall model" for the full adjudication.
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param players - All players in the game.
 * @param _round - Current round number (reserved for round-scaled yield
 *   rules; the beginner-game yield tables are round-independent and the
 *   variance draw is unconditional -- not mode-scaled -- so this is
 *   currently unused but kept in the signature per the API contract).
 * @param rng - Seeded generator, advanced by each player's shuffle plus one
 *   variance draw (12 sub-draws) per owned, outfitted plot.
 * @param modifiers - Optional pre-production per-plot temporary bonuses from a
 *   category-A colony event; omitted in a normal (no-event) round.
 * @returns Each player's yields, energy consumed, and per-plot detail
 *   (grouped by owner, then by that owner's shuffled processing order).
 */
export function computeProduction(
  plots: readonly (readonly Plot[])[],
  players: readonly Player[],
  _round: number,
  rng: Rng,
  modifiers?: ProductionModifiers,
): ProductionResult {
  const tempBonusByPlot = modifiers?.tempBonusByPlot;

  // Group every owned, outfitted plot by owner (row-major discovery order;
  // the per-player shuffle below is what actually determines processing
  // order), and tally each owner's per-resource outfitted-factory count for
  // the learning-curve bonus. Both are order-independent aggregates, so a
  // single row-major scan is enough for them regardless of shuffle order.
  const outfittedByOwner: { row: number; col: number; plot: Plot }[][] = players.map(() => []);
  const resourceCounts: Record<Resource, number>[] = players.map(() => zeroCounts());
  for (const [row, rowPlots] of plots.entries()) {
    for (const [col, plot] of rowPlots.entries()) {
      if (plot.owner === null || plot.muleOutfit === null) {
        continue;
      }
      const ownerPlots = outfittedByOwner[plot.owner];
      const ownerCounts = resourceCounts[plot.owner];
      if (ownerPlots === undefined || ownerCounts === undefined) {
        continue;
      }
      ownerPlots.push({ row, col, plot });
      ownerCounts[plot.muleOutfit] += 1;
    }
  }

  // Track remaining energy budget per player, starting from their current
  // (pre-production) inventory.
  const remainingEnergy = players.map((player) => player.goods.energy);
  const energyConsumed = players.map(() => 0);
  const totals: ResourceRecord[] = players.map(() => ({
    food: 0,
    energy: 0,
    smithore: 0,
    crystite: 0,
  }));
  const perPlot: PlotProduction[] = [];

  for (const [owner, ownerPlots] of outfittedByOwner.entries()) {
    // Random per-round processing order for this player's own plots, so a
    // board-position advantage never determines who loses power on a
    // shortfall (see this function's doc comment).
    const order = shuffle(rng, ownerPlots);
    for (const { row, col, plot } of order) {
      const resource = plot.muleOutfit;
      if (resource === null) {
        continue;
      }

      // Energy-shortfall penalty: a non-energy mule only produces (and only
      // draws power) if the owner still has enough banked energy to run it,
      // consumed in this player's shuffled order. An energy M.U.L.E. draws
      // no power itself and is never gated by its owner's energy.
      let powered = true;
      if (resource !== "energy") {
        const ownerRemainingEnergy = remainingEnergy[owner];
        if (ownerRemainingEnergy === undefined || ownerRemainingEnergy < ENERGY_PER_MULE) {
          powered = false;
        } else {
          remainingEnergy[owner] = ownerRemainingEnergy - ENERGY_PER_MULE;
          const ownerEnergyConsumed = energyConsumed[owner];
          if (ownerEnergyConsumed !== undefined) {
            energyConsumed[owner] = ownerEnergyConsumed + ENERGY_PER_MULE;
          }
        }
      }

      const matchingNeighbors = countMatchingNeighbors(plots, row, col, owner, resource);
      const adjacencyBonus = matchingNeighbors > 0 ? ADJACENCY_BONUS_PER_NEIGHBOR : 0;
      const ownerCounts = resourceCounts[owner];
      const sameResourceCount = ownerCounts === undefined ? 0 : ownerCounts[resource];
      const countBonus = Math.floor(sameResourceCount / PRODUCTION_LEARNING_CURVE_DIVISOR);
      // Pre-production temporary bonus from a category-A colony event, if any.
      const tempBonus = tempBonusByPlot?.get(plotKey(row, col)) ?? 0;
      // Variance is drawn unconditionally, even for a plot that turns out
      // unpowered below, so the RNG draw count never depends on power state
      // (see this function's doc comment).
      const variance = Math.round(normalDistributed(rng));

      const rawCapacity =
        baseYield(plot, resource) + adjacencyBonus + countBonus + tempBonus + variance;
      // Clamp per plot to planet_mule's [0, productionMaxProduction] band,
      // then zero it entirely if unpowered (`Factory.calcCapacity`'s
      // `power == 0 -> n = 0` branch).
      const clamped = Math.max(0, Math.min(rawCapacity, PRODUCTION_MAX_YIELD));
      const produced = powered ? clamped : 0;

      const ownerTotals = totals[owner];
      if (ownerTotals === undefined) {
        continue;
      }
      ownerTotals[resource] += produced;
      perPlot.push({ row, col, owner, resource, amount: produced });
    }
  }

  return { yields: totals, energyConsumed, perPlot };
}

/**
 * Apply planet_mule's end-of-round spoilage rule to a single player's
 * resource record, independent of round number. Food loses
 * `floor(food / FOOD_SPOILAGE_DIVISOR)`; energy loses
 * `floor(energy / ENERGY_SPOILAGE_DIVISOR)`; smithore and crystite are each
 * capped at `ORE_SPOILAGE_CAP`, losing any amount above it. Call this after
 * production (and after the real per-mule energy deduction; see turn.ts
 * `enterProduction`), matching planet_mule's `CollectionPhase`, where
 * spoilage is computed from each player's current post-usage resource count.
 * The flat, round-scaled `applyUpkeep` this function used to pair with is
 * retired: food usage now happens at the develop-phase
 * timer and energy usage is the real per-mule cost `computeProduction`
 * reports above, so a separate flat upkeep step would double-count both.
 * See docs/RULE_SOURCES.md, "Upkeep consolidation".
 *
 * @param goods - Player's resource record before spoilage (post-production,
 *   post-energy-deduction).
 * @returns New resource record after spoilage is applied.
 */
export function applySpoilage(goods: ResourceRecord): ResourceRecord {
  const foodLoss = Math.floor(goods.food / FOOD_SPOILAGE_DIVISOR);
  const energyLoss = Math.floor(goods.energy / ENERGY_SPOILAGE_DIVISOR);
  const smithoreLoss = Math.max(0, goods.smithore - ORE_SPOILAGE_CAP);
  const crystiteLoss = Math.max(0, goods.crystite - ORE_SPOILAGE_CAP);

  return {
    food: goods.food - foodLoss,
    energy: goods.energy - energyLoss,
    smithore: goods.smithore - smithoreLoss,
    crystite: goods.crystite - crystiteLoss,
  };
}
