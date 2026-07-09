/**
 * Development-phase AI strategy for the M.U.L.E. engine.
 *
 * Pure decision function: given the current game state and the AI's player
 * id, choose the next develop-phase action. The AI buys and outfits a
 * M.U.L.E. toward the colony's scarcest resource (the resource with the
 * smallest total inventory summed across every player) -- or toward crystite
 * when it already owns an empty plot with a revealed, high-level deposit --
 * places an outfitted M.U.L.E. on the first owned
 * empty plot (preferring its own best revealed crystite plot for a crystite
 * mule), always keeps a food-safety money reserve so it never spends down to
 * a position where it cannot afford emergency food at auction, and, once
 * flush with spare cash, spends idle ticks assaying a promising
 * mountain-adjacent plot to scout for crystite before it ever spends on a
 * M.U.L.E. Whenever this round's wampus is visible and catchable, it hunts
 * it first (free and strictly beneficial in this engine's
 * non-spatial model, so the AI always takes it rather than weighing it
 * probabilistically the way planet_mule's spatial AI does). Whenever it
 * would otherwise end its turn with nothing else to do, it gambles at the
 * pub instead: a gamble's payout is always non-negative,
 * so its expected value always beats idling.
 *
 * The scarcest-resource pick, the crystite-vs-scarcest outfit comparison, and
 * the assay rich-surplus gate all read a persona parameter set
 * (see `personas.ts`), layering the deciding player's
 * assigned personality over these same heuristics rather than branching new
 * logic.
 *
 * DOM-free by design: no mutation, no randomness, no module-level state.
 */

import type { Action, GameState, Plot } from "../engine/game_state";
import { visibleCrystite } from "../engine/game_state";
import type { Resource } from "../engine/player";
import { RESOURCES } from "../engine/player";
import { canBuyMule, hasPlaceablePlot } from "../engine/turn";
import { ASSAY_TICK_COST, OUTFIT_COST, STORE_BASE_PRICE } from "../engine/constants";
import { personaParamsForPlayer } from "./personas";
import type { PersonaParams } from "./personas";

/**
 * Money the AI keeps in reserve at all times, so it can always afford an
 * emergency food purchase from the store during an auction even after
 * buying and outfitting a M.U.L.E. Sized to ten units of store-price food.
 */
const AI_MONEY_RESERVE = STORE_BASE_PRICE.food * 10;

/**
 * Additional money surplus, on top of `AI_MONEY_RESERVE`, the AI requires
 * before it will spend develop ticks assaying instead of buying a M.U.L.E.
 * Sized well above a fresh game's starting money minus the reserve
 * (`STARTING_MONEY - AI_MONEY_RESERVE`), so a brand-new game never triggers
 * this branch; it only fires once the AI has genuinely accumulated wealth
 * from selling goods across a few rounds.
 */
const AI_ASSAY_RICH_SURPLUS = STORE_BASE_PRICE.food * 30;

/**
 * Minimum revealed crystite level (see `visibleCrystite`) worth outfitting a
 * M.U.L.E. for over the colony's scarcest resource, or preferring for
 * placement once a crystite M.U.L.E. is carried.
 */
const CRYSTITE_OUTFIT_MIN_LEVEL = 2;

/** Mountain terrain tiers the assay heuristic treats as crystite-promising. */
const MOUNTAIN_TERRAINS: ReadonlySet<Plot["terrain"]> = new Set([
  "mountain1",
  "mountain2",
  "mountain3",
]);

/**
 * Find the colony's scarcest resource: the resource with the smallest total
 * inventory summed across every player, each divided by the deciding
 * player's persona `resourceWeight` -- a weight of 1
 * (every resource, absent a persona) leaves the comparison exactly as it was
 * before personas existed; a weight above 1 makes that resource read as
 * scarcer, biasing the pick toward the personality's preferred goods without
 * ever hiding genuine colony scarcity. Ties break to the fixed `RESOURCES`
 * order (food, energy, smithore), so the result is deterministic.
 *
 * @param state - Current game state.
 * @param resourceWeight - The deciding player's persona preference weights.
 * @returns The scarcest resource across the colony.
 */
function scarcestResource(
  state: GameState,
  resourceWeight: Readonly<Record<Resource, number>>,
): Resource {
  let best: Resource = RESOURCES[0] as Resource;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const resource of RESOURCES) {
    let total = 0;
    for (const player of state.players) {
      total += player.goods[resource];
    }
    const score = total / resourceWeight[resource];
    if (score < bestScore) {
      bestScore = score;
      best = resource;
    }
  }
  return best;
}

/**
 * Choose an outfit resource the player can afford without dipping below the
 * money reserve, preferring `preferred` when it fits within that budget.
 * Falls back to any affordable resource within the reserve, then to any
 * resource the player can afford at all, so the AI never strands a carried
 * M.U.L.E. it cannot outfit.
 *
 * @param money - Player's current money.
 * @param preferred - The colony's scarcest resource.
 * @returns An affordable resource, or null if none can be afforded at all.
 */
function chooseOutfitResource(money: number, preferred: Resource): Resource | null {
  if (money - OUTFIT_COST[preferred] >= AI_MONEY_RESERVE) {
    return preferred;
  }
  let fallbackWithinReserve: Resource | null = null;
  let fallbackAffordable: Resource | null = null;
  for (const resource of RESOURCES) {
    const cost = OUTFIT_COST[resource];
    if (money - cost >= AI_MONEY_RESERVE && fallbackWithinReserve === null) {
      fallbackWithinReserve = resource;
    }
    if (money >= cost && fallbackAffordable === null) {
      fallbackAffordable = resource;
    }
  }
  if (fallbackWithinReserve !== null) {
    return fallbackWithinReserve;
  }
  return fallbackAffordable;
}

/**
 * Find the first owned, empty plot in row-major order, so placement is
 * deterministic.
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param playerId - Player whose owned plots to search.
 * @returns The plot position, or null if the player owns no empty plot.
 */
function firstOwnedEmptyPlot(
  plots: readonly (readonly Plot[])[],
  playerId: number,
): { row: number; col: number } | null {
  for (const [row, rowPlots] of plots.entries()) {
    for (const [col, plot] of rowPlots.entries()) {
      if (plot.owner === playerId && plot.muleOutfit === null) {
        return { row, col };
      }
    }
  }
  return null;
}

/**
 * Find the player's own empty plot with the highest revealed crystite level
 * at or above `CRYSTITE_OUTFIT_MIN_LEVEL`, if any. Used both to decide
 * whether crystite is worth outfitting toward and, once a crystite M.U.L.E.
 * is carried, where to place it -- placing on the richest KNOWN deposit
 * rather than `firstOwnedEmptyPlot`'s first-in-row-major-order plot, which
 * could otherwise waste the outfit on an unassayed or empty plot.
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param playerId - Player whose owned plots to search.
 * @returns The best candidate plot and its level, or null if the player owns
 *   no empty plot with a revealed level at or above the minimum.
 */
function bestOwnedEmptyCrystitePlot(
  plots: readonly (readonly Plot[])[],
  playerId: number,
): { row: number; col: number; level: number } | null {
  let best: { row: number; col: number; level: number } | null = null;
  for (const [row, rowPlots] of plots.entries()) {
    for (const [col, plot] of rowPlots.entries()) {
      if (plot.owner !== playerId || plot.muleOutfit !== null) {
        continue;
      }
      const level = visibleCrystite(plot);
      if (level === null || level < CRYSTITE_OUTFIT_MIN_LEVEL) {
        continue;
      }
      if (best === null || level > best.level) {
        best = { row, col, level };
      }
    }
  }
  return best;
}

/**
 * Whether any plot orthogonally adjacent to `(row, col)` is a mountain tier
 * (`mountain1`-`mountain3`), the cheap heuristic this AI uses to guess a
 * plot is crystite-promising (crystite blooms are seeded independently of
 * terrain in this engine's map generation, see `docs/RULE_SOURCES.md`,
 * "Crystite bloom seeding" -- this is the AI's own belief, not perfect
 * information, matching the plan's "cheap heuristic" instruction).
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param row - Row of the plot being checked.
 * @param col - Column of the plot being checked.
 * @returns True if at least one orthogonal neighbor is a mountain tier.
 */
function hasMountainNeighbor(
  plots: readonly (readonly Plot[])[],
  row: number,
  col: number,
): boolean {
  const deltas: readonly [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [rowDelta, colDelta] of deltas) {
    const neighborRowPlots = plots[row + rowDelta];
    if (neighborRowPlots === undefined) {
      continue;
    }
    const neighbor = neighborRowPlots[col + colDelta];
    if (neighbor === undefined) {
      continue;
    }
    if (MOUNTAIN_TERRAINS.has(neighbor.terrain)) {
      return true;
    }
  }
  return false;
}

/**
 * Find a promising plot to assay: not already revealed, not the town tile,
 * and mountain-adjacent (see `hasMountainNeighbor`). Prefers a plot the
 * player already owns (assaying it also informs a later outfit decision via
 * `bestOwnedEmptyCrystitePlot`) over an unowned one, each in row-major order,
 * so the result is deterministic.
 *
 * @param plots - Full board grid, indexed as `plots[row][col]`.
 * @param playerId - Player considering the assay.
 * @returns The candidate plot position, or null if none qualifies.
 */
function bestAssayCandidate(
  plots: readonly (readonly Plot[])[],
  playerId: number,
): { row: number; col: number } | null {
  let ownedCandidate: { row: number; col: number } | null = null;
  let unownedCandidate: { row: number; col: number } | null = null;
  for (const [row, rowPlots] of plots.entries()) {
    for (const [col, plot] of rowPlots.entries()) {
      if (plot.terrain === "town" || plot.crystiteRevealed) {
        continue;
      }
      if (!hasMountainNeighbor(plots, row, col)) {
        continue;
      }
      if (plot.owner === playerId && ownedCandidate === null) {
        ownedCandidate = { row, col };
      } else if (plot.owner === null && unownedCandidate === null) {
        unownedCandidate = { row, col };
      }
    }
  }
  return ownedCandidate ?? unownedCandidate;
}

/**
 * Fall back to gambling at the pub instead of ending the turn outright,
 * whenever the AI has genuinely run out of productive options this turn.
 * A gamble's payout is always non-negative (see
 * `PUB_ROUND_BONUS_BY_ROUND`/`PUB_MAX_RANDOM_AMOUNT` in constants.ts), so its
 * expected value always beats idling out the remaining ticks. By design this
 * stays simple: gambling is always preferred over idling once nothing else is
 * affordable or placeable; it does not weigh the exact expected payout
 * against anything.
 *
 * @param playerId - AI player id deciding.
 * @returns A `gamble` action for this player.
 */
function gambleInsteadOfEndTurn(playerId: number): Action {
  return { type: "gamble", playerId };
}

/**
 * Decide the next develop-phase action for `playerId`. Always returns a
 * terminal action for the current situation (`gamble` when nothing
 * productive can be done but the turn has not started, `end_turn` only for
 * out-of-turn/degenerate guard cases), so the AI can never softlock the
 * sequencer.
 *
 * @param state - Current game state.
 * @param playerId - AI player id deciding.
 * @returns The next action for this player.
 */
export function decideDevelopAction(state: GameState, playerId: number): Action {
  if (state.phase.kind !== "develop") {
    return { type: "end_turn", playerId };
  }
  const payload = state.phase.payload;
  if (payload.activePlayer !== playerId) {
    return { type: "end_turn", playerId };
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return { type: "end_turn", playerId };
  }
  // The deciding player's parameter set, or
  // BASELINE_PERSONA_PARAMS (identical to pre-persona behavior) for the
  // human seat.
  const persona: PersonaParams = personaParamsForPlayer(state, playerId);

  // Free and strictly beneficial in this engine's non-spatial model: always
  // hunt this round's wampus first when it is visible and catchable.
  const wampus = payload.wampus;
  if (wampus.visible && !wampus.dead && !wampus.caught) {
    return { type: "hunt_wampus", playerId };
  }

  if (payload.carriedMule === "none") {
    // Once flush with spare cash, scout a promising mountain-adjacent plot
    // before ever spending on a M.U.L.E.: cheap (a few ticks, no money) and
    // informs later outfit/placement decisions via
    // `bestOwnedEmptyCrystitePlot`.
    if (
      payload.ticksRemaining >= ASSAY_TICK_COST &&
      player.money >= AI_MONEY_RESERVE + AI_ASSAY_RICH_SURPLUS * persona.assayRichSurplusFactor
    ) {
      const assayTarget = bestAssayCandidate(state.plots, playerId);
      if (assayTarget !== null) {
        return { type: "assay_plot", playerId, row: assayTarget.row, col: assayTarget.col };
      }
    }
    const scarcest = scarcestResource(state, persona.resourceWeight);
    // Estimate against the store's live, dynamic M.U.L.E. price (the price is
    // dynamic; the flat MULE_BASE_PRICE is only the game-start seed).
    const totalCost = state.store.mulePrice + OUTFIT_COST[scarcest];
    if (canBuyMule(state, playerId) && player.money - totalCost >= AI_MONEY_RESERVE) {
      return { type: "buy_mule", playerId };
    }
    return gambleInsteadOfEndTurn(playerId);
  }

  if (payload.carriedMule === "unoutfitted") {
    const scarcest = scarcestResource(state, persona.resourceWeight);
    // Prefer crystite over the scarcest resource when this player already
    // owns an empty plot with a revealed, high-level deposit worth more (by
    // level times the live crystite price) than a round of the alternative.
    // Both sides are scaled by the same persona resourceWeight table, so a
    // personality that favors both goods equally (ore_speculator: smithore
    // and crystite) leaves the comparison direction unchanged, and a
    // personality neutral on crystite (land_baron, farmer) reduces to the
    // exact pre-persona comparison.
    let preferred: Resource = scarcest;
    const crystiteCandidate = bestOwnedEmptyCrystitePlot(state.plots, playerId);
    if (crystiteCandidate !== null) {
      const crystiteScore =
        crystiteCandidate.level * state.store.prices.crystite * persona.resourceWeight.crystite;
      const alternativeScore = state.store.prices[scarcest] * persona.resourceWeight[scarcest];
      if (crystiteScore > alternativeScore) {
        preferred = "crystite";
      }
    }
    const resource = chooseOutfitResource(player.money, preferred);
    if (resource === null) {
      return gambleInsteadOfEndTurn(playerId);
    }
    return { type: "outfit_mule", playerId, resource };
  }

  // carriedMule is an outfitted Resource: place it if a plot is available.
  if (!hasPlaceablePlot(state, playerId)) {
    return gambleInsteadOfEndTurn(playerId);
  }
  // A carried crystite M.U.L.E. goes on the richest KNOWN deposit, not
  // whichever empty plot comes first in row-major order.
  const crystiteSpot =
    payload.carriedMule === "crystite" ? bestOwnedEmptyCrystitePlot(state.plots, playerId) : null;
  const spot = crystiteSpot ?? firstOwnedEmptyPlot(state.plots, playerId);
  if (spot === null) {
    return { type: "end_turn", playerId };
  }
  return { type: "place_mule", playerId, row: spot.row, col: spot.col };
}
