/**
 * Personal and colony event systems for the M.U.L.E. engine.
 *
 * This module is a pure, DOM-free rules layer that mirrors planet_mule's two
 * event subsystems:
 *
 * - Personal events (`PlayerEvent`/`PlayerEventGenerator`): one per player per
 *   develop turn, gated by a 27.5% roll, drawn from a shuffled 22-event deck
 *   with no repeat until the deck is exhausted, blocked by rank and round so
 *   the leader only ever gets bad events and the trailing players only good
 *   ones, with a zero-food pity package. Amount = event factor * muleCurve.
 * - Colony events (`ColonyEvent`/`ColonyEventGenerator`): one per round, drawn
 *   from a pre-shuffled weighted deck assigned at game start, split into a
 *   category-A group that fires before production (setting per-plot temporary
 *   bonuses) and a category-B group that fires after production (adjusting the
 *   computed per-plot yields, store stock, and terrain).
 *
 * Determinism design: rather than interleave event randomness with the core
 * economy/auction RNG stream (planet_mule uses the main `Random` for colony
 * shuffles and a separate `Random` for personal events), this engine gives BOTH
 * event subsystems their own derived sub-streams, seeded from the game seed via
 * `PLAYER_EVENT_RNG_SALT`/`COLONY_EVENT_RNG_SALT`. This isolates event
 * randomness so adding events does not perturb the pre-event economy/auction
 * replay stream (see docs/RULE_SOURCES.md, "Event RNG isolation").
 *
 * Source root:
 * `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/`
 * (`PlayerEvent.java`, `PlayerEventGenerator.java`, `ColonyEvent.java`,
 * `ColonyEventGenerator.java`) plus `controller/phase/PlayerEventPhase.java`
 * and `controller/phase/ColonyEventPhase.java` for the scheduling/A-B split.
 */

import type { GameState, Plot, Terrain } from "./game_state";
import type { Player, Resource } from "./player";
import type { PlotProduction } from "./economy";
import type { Rng } from "./rng";
import { createRng } from "./rng";
import { plotKey } from "./economy";
import { computeScores } from "./scoring";
import { muleCurve } from "./round_scale";
import {
  ACID_RAIN_OFF_ENERGY_PENALTY,
  ACID_RAIN_OFF_FOOD_BONUS,
  ACID_RAIN_STRUCK_ENERGY_PENALTY,
  ACID_RAIN_STRUCK_FOOD_BONUS,
  COLONY_DECK_EARLY_ROUND_COUNT,
  COLONY_EVENT_RNG_SALT,
  METEORITE_CRYSTITE_LEVEL,
  METEORITE_MAX_ELIGIBLE_CRYSTITE,
  PLANETQUAKE_DEGRADE_CHANCE,
  PLAYER_EVENT_CHANCE,
  PLAYER_EVENT_RNG_SALT,
  PLOT_COLS,
  PLOT_ROWS,
  ROUND_COUNT_BY_MODE,
  SUNSPOT_ENERGY_BONUS,
} from "./constants";

// ============================================================
// Colony deck composition
// ============================================================

/**
 * The early colony deck: rounds 1 and 2 draw only from these types, and its
 * remainder seeds the late deck. Source: planet_mule `ColonyEventGenerator
 * .generate` (`ColonyEventGenerator.java` lines 37-40): pirate ship x2, acid
 * rain x3, sunspot x3, fire x2. Held here (not constants.ts) because the tuple
 * keys are `ColonyEventType` values that live in this module.
 */
const COLONY_DECK_EARLY: readonly (readonly [ColonyEventType, number])[] = [
  ["pirate_ship", 2],
  ["acid_rain", 3],
  ["sunspot", 3],
  ["fire_in_store", 2],
];

/**
 * The late colony deck additions (joined with the early deck's remainder):
 * rounds 3 onward can draw these too. Source: `ColonyEventGenerator.generate`
 * (`ColonyEventGenerator.java` lines 54-57): pest x3, planetquake x3,
 * meteorite x2, radiation x2.
 */
const COLONY_DECK_LATE: readonly (readonly [ColonyEventType, number])[] = [
  ["pest_attack", 3],
  ["planet_quake", 3],
  ["meteorite", 2],
  ["radiation", 2],
];

// ============================================================
// Shared types
// ============================================================

/**
 * The 22 personal (player) events, one identifier per `PlayerEvent` subclass
 * in planet_mule's `PlayerEvent.java`. Slugs are snake_case renders of the
 * Java class names.
 */
export type PersonalEventName =
  | "home_world_package"
  | "wandering_space_traveler"
  | "best_built_mule"
  | "tap_dancing_mule"
  | "agriculture_award"
  | "worm_infestation"
  | "museum_bought_computer"
  | "swamp_eel_eating"
  | "charity"
  | "artificial_dumbness"
  | "relative_died"
  | "dead_moose_rat"
  | "extra_plot"
  | "mischievous_elves"
  | "mule_lost_bolt"
  | "mules_deteriorated"
  | "dirty_solar_collectors"
  | "gypsy_inlaws"
  | "flying_cat_bugs"
  | "kazinga_races"
  | "bat_lizard"
  | "lost_plot";

/**
 * The 9 colony events, one per `ColonyEvent.Type` enum value in planet_mule's
 * `ColonyEvent.java`.
 */
export type ColonyEventType =
  | "pest_attack"
  | "pirate_ship"
  | "acid_rain"
  | "planet_quake"
  | "sunspot"
  | "meteorite"
  | "radiation"
  | "fire_in_store"
  | "ship_returns";

/** A board cell reference for UI event highlighting. */
export interface EventCell {
  readonly row: number;
  readonly col: number;
}

/**
 * A resolved personal event, carried on the develop payload for the turn it
 * fired and appended to `GameState.eventHistory`. UI-friendly: the banner text
 * is `message`, `good` selects the good/bad styling, and `moneyDelta` is the
 * net money change actually applied (after the clamp-at-0).
 */
export interface PersonalEventResult {
  readonly kind: "personal";
  readonly name: PersonalEventName;
  readonly playerId: number;
  readonly good: boolean;
  readonly round: number;
  readonly message: string;
  readonly moneyDelta: number;
}

/**
 * A resolved colony event, carried on the production payload for the round it
 * fired and appended to `GameState.eventHistory`. `categoryA` is true for the
 * pre-production group (acid rain, sunspot, meteorite, radiation), false for
 * the post-production group (pest, pirates, planetquake, fire, ship return).
 * `cells` lists the board tiles the event touched, for UI highlighting.
 */
export interface ColonyEventResult {
  readonly kind: "colony";
  readonly type: ColonyEventType;
  readonly categoryA: boolean;
  readonly round: number;
  readonly name: string;
  readonly description: string;
  readonly message: string;
  readonly cells: readonly EventCell[];
}

/** One entry in `GameState.eventHistory`: a personal or colony event result. */
export type EventHistoryEntry = PersonalEventResult | ColonyEventResult;

// ============================================================
// Immutable helpers
// ============================================================

/**
 * Return a new four-player tuple with `playerId` replaced by `updater`'s
 * result, sharing every other player unchanged.
 */
function updatePlayer(
  players: readonly [Player, Player, Player, Player],
  playerId: number,
  updater: (player: Player) => Player,
): [Player, Player, Player, Player] {
  return [
    players[0].id === playerId ? updater(players[0]) : players[0],
    players[1].id === playerId ? updater(players[1]) : players[1],
    players[2].id === playerId ? updater(players[2]) : players[2],
    players[3].id === playerId ? updater(players[3]) : players[3],
  ];
}

/**
 * Add `delta` dollars to a player's money, clamping the result at 0 so a
 * penalty never drives money negative. Matches planet_mule's `Player.setMoney`
 * (`Player.java` lines 138-145), which reassigns any negative result to $0.
 */
function addMoneyClamped(player: Player, delta: number): Player {
  const money = Math.max(0, player.money + delta);
  return { ...player, money };
}

/** Add `delta` to one of a player's goods, keeping every other good unchanged. */
function addGood(player: Player, resource: Resource, delta: number): Player {
  return { ...player, goods: { ...player.goods, [resource]: player.goods[resource] + delta } };
}

/**
 * Return a new board grid with the plot at `(row, col)` replaced by `updater`'s
 * result, sharing every other plot unchanged.
 */
function updatePlot(
  plots: readonly (readonly Plot[])[],
  row: number,
  col: number,
  updater: (plot: Plot) => Plot,
): Plot[][] {
  return plots.map((plotRow, rowIndex) => {
    if (rowIndex !== row) {
      return plotRow.slice();
    }
    return plotRow.map((plot, colIndex) => (colIndex === col ? updater(plot) : plot));
  });
}

// ============================================================
// Rank order
// ============================================================

/**
 * Player ids in current rank order (rank 1 = leader first): descending score
 * (`computeScores`), ties broken by ascending player id. Mirrors planet_mule's
 * `Player.OrderByPoints` (`Player.java` lines 594-611) feeding
 * `GameModel.getPlayersInRankOrder`. A player's 1-based rank is their index in
 * this list plus one.
 *
 * @param state - Current game state.
 * @returns Player ids sorted leader-first.
 */
export function rankOrder(state: GameState): number[] {
  const scores = computeScores(state);
  const order = state.players.map((player) => player.id);
  order.sort((a, b) => {
    const scoreA = scores[a] ?? 0;
    const scoreB = scores[b] ?? 0;
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return a - b;
  });
  return order;
}

// ============================================================
// Personal events: spec table
// ============================================================

/**
 * A resolved personal-event effect: the state after the event's changes are
 * applied, plus the human-readable banner message and the net money delta.
 */
interface PersonalEffect {
  readonly state: GameState;
  readonly message: string;
  readonly moneyDelta: number;
}

/**
 * One personal event's definition: polarity, an optional firing condition
 * (defaults to always-true), and an `apply` that produces the effect given the
 * round-scaled amount `m = muleCurve(round)`.
 */
interface PersonalEventSpec {
  readonly name: PersonalEventName;
  readonly good: boolean;
  readonly condition?: (state: GameState, playerId: number) => boolean;
  readonly apply: (state: GameState, playerId: number, m: number) => PersonalEffect;
}

/** Count a player's owned plots that hold an installed M.U.L.E. (a "factory"). */
function countFactories(
  state: GameState,
  playerId: number,
  predicate: (plot: Plot) => boolean,
): number {
  let count = 0;
  for (const row of state.plots) {
    for (const plot of row) {
      if (plot.owner === playerId && plot.muleOutfit !== null && predicate(plot)) {
        count += 1;
      }
    }
  }
  return count;
}

/** True when the player owns at least one plot with no installed M.U.L.E. */
function ownsEmptyPlot(state: GameState, playerId: number): boolean {
  for (const row of state.plots) {
    for (const plot of row) {
      if (plot.owner === playerId && plot.muleOutfit === null) {
        return true;
      }
    }
  }
  return false;
}

/** True when the player owns at least one plot that holds a M.U.L.E. */
function ownsFactory(state: GameState, playerId: number): boolean {
  return countFactories(state, playerId, () => true) > 0;
}

/** Apply a flat money delta of `sign * factor * m` and build the effect. */
function flatMoney(
  state: GameState,
  playerId: number,
  amount: number,
  message: string,
): PersonalEffect {
  const before = state.players[playerId];
  if (before === undefined) {
    throw new Error(`flatMoney: no player ${playerId}`);
  }
  const players = updatePlayer(state.players, playerId, (p) => addMoneyClamped(p, amount));
  const after = players[playerId];
  if (after === undefined) {
    throw new Error(`flatMoney: no player ${playerId}`);
  }
  const moneyDelta = after.money - before.money;
  return { state: { ...state, players }, message, moneyDelta };
}

/** First unowned, non-town plot found (row-major), or null when the board is full. */
function firstUnownedPlot(state: GameState, rng: Rng): { row: number; col: number } | null {
  const candidates: { row: number; col: number }[] = [];
  for (let row = 0; row < state.plots.length; row += 1) {
    const plotRow = state.plots[row];
    if (plotRow === undefined) {
      continue;
    }
    for (let col = 0; col < plotRow.length; col += 1) {
      const plot = plotRow[col];
      if (plot !== undefined && plot.owner === null && plot.terrain !== "town") {
        candidates.push({ row, col });
      }
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  const pick = candidates[rng.nextInt(candidates.length)];
  return pick ?? null;
}

/**
 * The 22 personal events with their planet_mule factors, polarities,
 * conditions, and effects (Source: `PlayerEvent.java`; each subclass's
 * `isGood`, `condition`, and `action`). Factor `x` means the money change is
 * `x * m` (positive for a good event, negative for a bad one), where
 * `m = muleCurve(round)`. Per-plot events multiply by a plot count. The four
 * non-money events (`wandering_space_traveler` +2 smithore,
 * `home_world_package` +3 food/+2 energy, `mischievous_elves` food/2,
 * plus the plot grant/loss pair) carry their own effect.
 */
const PERSONAL_EVENTS: readonly PersonalEventSpec[] = [
  // --- Good events ---
  {
    // HomeWorldPackage: +3 food, +2 energy (the zero-food pity package).
    name: "home_world_package",
    good: true,
    apply: (state, playerId): PersonalEffect => {
      const players = updatePlayer(state.players, playerId, (p) =>
        addGood(addGood(p, "food", 3), "energy", 2),
      );
      return {
        state: { ...state, players },
        message: "A package from your home-world relatives arrived: 3 food and 2 energy units.",
        moneyDelta: 0,
      };
    },
  },
  {
    // WanderingSpaceTraveler: +2 smithore.
    name: "wandering_space_traveler",
    good: true,
    apply: (state, playerId): PersonalEffect => {
      const players = updatePlayer(state.players, playerId, (p) => addGood(p, "smithore", 2));
      return {
        state: { ...state, players },
        message: "A wandering space traveler left you two bars of smithore.",
        moneyDelta: 0,
      };
    },
  },
  {
    // BestBuiltMule: +2*m; requires an installed M.U.L.E.
    name: "best_built_mule",
    good: true,
    condition: ownsFactory,
    apply: (state, playerId, m) =>
      flatMoney(
        state,
        playerId,
        2 * m,
        'Your M.U.L.E. was judged "Best Built" at the colony fair.',
      ),
  },
  {
    // TapDancingMule: +4*m; requires an installed M.U.L.E.
    name: "tap_dancing_mule",
    good: true,
    condition: ownsFactory,
    apply: (state, playerId, m) =>
      flatMoney(state, playerId, 4 * m, "Your M.U.L.E. won the colony tap-dancing contest."),
  },
  {
    // AgricultureAward: +2*m per developed food plot.
    name: "agriculture_award",
    good: true,
    condition: (state, playerId) =>
      countFactories(state, playerId, (plot) => plot.muleOutfit === "food") > 0,
    apply: (state, playerId, m): PersonalEffect => {
      const foodPlots = countFactories(state, playerId, (plot) => plot.muleOutfit === "food");
      return flatMoney(
        state,
        playerId,
        2 * m * foodPlots,
        "The agriculture council awarded you a grant for each developed food plot.",
      );
    },
  },
  {
    // WormInfestation: +4*m.
    name: "worm_infestation",
    good: true,
    apply: (state, playerId, m) =>
      flatMoney(
        state,
        playerId,
        4 * m,
        "The colony rewarded you for stopping the Wart Worm infestation.",
      ),
  },
  {
    // MuseumBoughtComputer: +8*m (the largest good money event).
    name: "museum_bought_computer",
    good: true,
    apply: (state, playerId, m) =>
      flatMoney(state, playerId, 8 * m, "The museum bought your antique personal computer."),
  },
  {
    // SwampEelEating: +2*m.
    name: "swamp_eel_eating",
    good: true,
    apply: (state, playerId, m) =>
      flatMoney(state, playerId, 2 * m, "You won the colony Swamp Eel eating contest (Yuck!)."),
  },
  {
    // Charity: +3*m.
    name: "charity",
    good: true,
    apply: (state, playerId, m) =>
      flatMoney(state, playerId, 3 * m, "A home-world charity took pity on you and sent aid."),
  },
  {
    // ArtificialDumbness: +6*m.
    name: "artificial_dumbness",
    good: true,
    apply: (state, playerId, m) =>
      flatMoney(
        state,
        playerId,
        6 * m,
        "Your offworld Artificial Dumbness investments paid dividends.",
      ),
  },
  {
    // RelativeDied: +4*m.
    name: "relative_died",
    good: true,
    apply: (state, playerId, m) =>
      flatMoney(
        state,
        playerId,
        4 * m,
        "A distant relative died and left you a fortune (after taxes).",
      ),
  },
  {
    // DeadMooseRat: +2*m.
    name: "dead_moose_rat",
    good: true,
    apply: (state, playerId, m) =>
      flatMoney(state, playerId, 2 * m, "You found a dead Moose Rat and sold the hide."),
  },
  {
    // ExtraPlot: grant a random unowned plot; requires an unowned non-town plot.
    name: "extra_plot",
    good: true,
    apply: (state, playerId): PersonalEffect => {
      // ExtraPlot's random draw is threaded on the personal-event sub-rng,
      // continuing the same stream the selection roll advanced.
      const rng = createRng(state.playerEventRngState);
      const target = firstUnownedPlot(state, rng);
      const rngState = rng.getState();
      if (target === null) {
        // Condition guaranteed a target; reaching here means the board filled
        // between the condition check and apply, so no plot changes hands.
        return {
          state: { ...state, playerEventRngState: rngState },
          message: "You were promised an extra plot, but no unclaimed land remained.",
          moneyDelta: 0,
        };
      }
      const plots = updatePlot(state.plots, target.row, target.col, (plot) => ({
        ...plot,
        owner: playerId,
      }));
      return {
        state: { ...state, plots, playerEventRngState: rngState },
        message: "You received an extra plot of land to encourage colony development.",
        moneyDelta: 0,
      };
    },
  },
  // --- Bad events ---
  {
    // MischievousElves: lose half your food (integer division).
    name: "mischievous_elves",
    good: false,
    apply: (state, playerId): PersonalEffect => {
      const player = state.players[playerId];
      if (player === undefined) {
        throw new Error(`mischievous_elves: no player ${playerId}`);
      }
      const kept = Math.floor(player.goods.food / 2);
      const players = updatePlayer(state.players, playerId, (p) => ({
        ...p,
        goods: { ...p.goods, food: kept },
      }));
      return {
        state: { ...state, players },
        message: "Mischievous Glac-Elves broke into your shed and stole half your food.",
        moneyDelta: 0,
      };
    },
  },
  {
    // MuleLostBolt: -3*m; requires an installed M.U.L.E.
    name: "mule_lost_bolt",
    good: false,
    condition: ownsFactory,
    apply: (state, playerId, m) =>
      flatMoney(state, playerId, -3 * m, "One of your M.U.L.E.s lost a bolt; repairs cost you."),
  },
  {
    // MulesDeteriorated: -2*m per crystite/smithore mining plot.
    name: "mules_deteriorated",
    good: false,
    condition: (state, playerId) =>
      countFactories(
        state,
        playerId,
        (plot) => plot.muleOutfit === "smithore" || plot.muleOutfit === "crystite",
      ) > 0,
    apply: (state, playerId, m): PersonalEffect => {
      const miningPlots = countFactories(
        state,
        playerId,
        (plot) => plot.muleOutfit === "smithore" || plot.muleOutfit === "crystite",
      );
      return flatMoney(
        state,
        playerId,
        -2 * m * miningPlots,
        "Your mining M.U.L.E.s deteriorated from heavy use and cost you repairs.",
      );
    },
  },
  {
    // DirtySolarCollectors: -2*m per energy plot.
    name: "dirty_solar_collectors",
    good: false,
    condition: (state, playerId) =>
      countFactories(state, playerId, (plot) => plot.muleOutfit === "energy") > 0,
    apply: (state, playerId, m): PersonalEffect => {
      const energyPlots = countFactories(state, playerId, (plot) => plot.muleOutfit === "energy");
      return flatMoney(
        state,
        playerId,
        -2 * m * energyPlots,
        "The solar collectors on your energy M.U.L.E.s needed costly cleaning.",
      );
    },
  },
  {
    // GypsyInlaws: -6*m (the largest bad money event).
    name: "gypsy_inlaws",
    good: false,
    apply: (state, playerId, m) =>
      flatMoney(state, playerId, -6 * m, "Your Space Gypsy in-laws made a mess of the town."),
  },
  {
    // FlyingCatBugs: -4*m.
    name: "flying_cat_bugs",
    good: false,
    apply: (state, playerId, m) =>
      flatMoney(state, playerId, -4 * m, "Flying Cat-Bugs ate the roof off your house."),
  },
  {
    // KazingaRaces: -4*m.
    name: "kazinga_races",
    good: false,
    apply: (state, playerId, m) =>
      flatMoney(state, playerId, -4 * m, "You lost a bet on the two-legged Kazinga races."),
  },
  {
    // BatLizard: -4*m.
    name: "bat_lizard",
    good: false,
    apply: (state, playerId, m) =>
      flatMoney(
        state,
        playerId,
        -4 * m,
        "Your child was bitten by a Bat-Lizard; the hospital bill hurt.",
      ),
  },
  {
    // LostPlot: lose an undeveloped owned plot; requires an owned empty plot.
    name: "lost_plot",
    good: false,
    condition: ownsEmptyPlot,
    apply: (state, playerId): PersonalEffect => {
      // First owned empty plot in board order (deterministic; PM keeps the last,
      // this engine keeps the first -- either is an arbitrary empty plot).
      for (let row = 0; row < state.plots.length; row += 1) {
        const plotRow = state.plots[row];
        if (plotRow === undefined) {
          continue;
        }
        for (let col = 0; col < plotRow.length; col += 1) {
          const plot = plotRow[col];
          if (plot !== undefined && plot.owner === playerId && plot.muleOutfit === null) {
            const plots = updatePlot(state.plots, row, col, (p) => ({ ...p, owner: null }));
            return {
              state: { ...state, plots },
              message: "You lost a plot of land because the claim was never recorded.",
              moneyDelta: 0,
            };
          }
        }
      }
      // Condition guaranteed an empty owned plot; unreachable in practice.
      return {
        state,
        message: "A land claim of yours went unrecorded, but every plot was already developed.",
        moneyDelta: 0,
      };
    },
  },
];

/** Lookup of personal-event spec by name. */
const PERSONAL_EVENT_BY_NAME: ReadonlyMap<PersonalEventName, PersonalEventSpec> = new Map(
  PERSONAL_EVENTS.map((spec) => [spec.name, spec]),
);

/** Every personal-event name, used to build a fresh shuffled deck. */
const ALL_PERSONAL_EVENT_NAMES: readonly PersonalEventName[] = PERSONAL_EVENTS.map(
  (spec) => spec.name,
);

// ============================================================
// Shuffle
// ============================================================

/**
 * Fisher-Yates shuffle of a copy of `items`, driven by `rng` in the same
 * back-to-front direction as Java's `Collections.shuffle` (swap index i-1 with
 * a random index in [0, i)). Returns a new array; `items` is not mutated.
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

// ============================================================
// Personal event deck + selection
// ============================================================

/**
 * Build the personal-event sub-rng seed and the initial shuffled 22-event
 * deck for a new game, derived from the game seed so the deck never touches the
 * core RNG stream (see the module doc's determinism note).
 *
 * @param seed - The game seed.
 * @returns The initial deck order and the sub-rng state after shuffling.
 */
export function createPlayerEventDeck(seed: number): {
  deck: PersonalEventName[];
  rngState: number;
} {
  const rng = createRng((seed ^ PLAYER_EVENT_RNG_SALT) >>> 0);
  const deck = shuffle(rng, ALL_PERSONAL_EVENT_NAMES);
  return { deck, rngState: rng.getState() };
}

/**
 * Result of drawing a personal event for one develop turn: the chosen event
 * name (or null when no event fires), plus the advanced deck order, cursor, and
 * sub-rng state to write back into `GameState`.
 */
export interface PersonalDraw {
  readonly name: PersonalEventName | null;
  readonly deck: readonly PersonalEventName[];
  readonly cursor: number;
  readonly rngState: number;
}

/**
 * Draw the next personal event for a player's develop turn, mirroring
 * planet_mule's `PlayerEventGenerator.nextEvent` (`PlayerEventGenerator.java`
 * lines 59-98):
 *
 * - Round 1 never fires an event (no RNG consumed).
 * - Otherwise roll `f = rng.next()`; `f > PLAYER_EVENT_CHANCE` fires nothing.
 * - Rank `n` is the player's 1-based rank; a solo colony treats it as 2.
 * - Zero-food pity: when `n > 1` and the player holds no food, the first
 *   `home_world_package` at or after the cursor is swapped to the cursor so it
 *   is drawn first (the starving player gets the food package).
 * - Scan from the cursor for the first event that is not blocked: bad events
 *   are blocked in the last two rounds (`round > lastRound - 2`) and for the
 *   bottom two ranks (`n >= 3`); good events are blocked for the leader
 *   (`n == 1`); and the event's own condition must hold. The chosen event is
 *   swapped to the cursor and the cursor advances (no repeat until the deck is
 *   exhausted).
 *
 * @param state - Current game state (for condition checks).
 * @param playerId - The player taking their develop turn.
 * @param rank - The player's 1-based rank (from `rankOrder`).
 * @param food - The player's food BEFORE this turn's food consumption (the
 *   pity check reads pre-consumption food, matching PM's ordering).
 * @returns The drawn event name (or null) and the advanced deck/cursor/rng.
 */
export function drawPersonalEvent(
  state: GameState,
  playerId: number,
  rank: number,
  food: number,
): PersonalDraw {
  const lastRound = ROUND_COUNT_BY_MODE[state.mode];
  const baseline: PersonalDraw = {
    name: null,
    deck: state.playerEventDeck,
    cursor: state.playerEventCursor,
    rngState: state.playerEventRngState,
  };
  if (state.round === 1) {
    return baseline;
  }
  const rng = createRng(state.playerEventRngState);
  const roll = rng.next();
  const rngState = rng.getState();
  if (roll > PLAYER_EVENT_CHANCE) {
    return { ...baseline, rngState };
  }
  // This engine always has four players, so PM's solo-colony rank guard (set
  // rank to 2 when only one player is ranked) never applies; the player's own
  // rank is used directly.
  const effectiveRank = rank;
  const deck = state.playerEventDeck.slice();
  const cursor = state.playerEventCursor;
  // Zero-food pity: bring the first home_world_package to the cursor.
  if (effectiveRank > 1 && food === 0) {
    for (let i = cursor; i < deck.length; i += 1) {
      if (deck[i] === "home_world_package") {
        swapInPlace(deck, i, cursor);
        break;
      }
    }
  }
  // Scan for the first unblocked, condition-satisfied event.
  for (let i = cursor; i < deck.length; i += 1) {
    const name = deck[i];
    if (name === undefined) {
      continue;
    }
    const spec = PERSONAL_EVENT_BY_NAME.get(name);
    if (spec === undefined) {
      throw new Error(`drawPersonalEvent: unknown event ${name}`);
    }
    const lastTwoRounds = state.round > lastRound - 2;
    if (lastTwoRounds && !spec.good) {
      continue;
    }
    if (effectiveRank === 1 && spec.good) {
      continue;
    }
    if (effectiveRank >= 3 && !spec.good) {
      continue;
    }
    if (spec.condition !== undefined && !spec.condition(state, playerId)) {
      continue;
    }
    swapInPlace(deck, i, cursor);
    return { name, deck, cursor: cursor + 1, rngState };
  }
  // No suitable event found; the deck may have been reordered by the pity swap.
  return { name: null, deck, cursor, rngState };
}

/** Swap two array elements in place, failing loudly on an out-of-range index. */
function swapInPlace<T>(items: T[], i: number, j: number): void {
  const a = items[i];
  const b = items[j];
  if (a === undefined || b === undefined) {
    throw new Error("swapInPlace: index out of range");
  }
  items[i] = b;
  items[j] = a;
}

/**
 * Apply a drawn personal event to the state, returning the updated state and
 * the UI/history result. Amount scaling uses `muleCurve(round)`
 * (`PlayerEventGenerator.apply`, `PlayerEventGenerator.java` line 101).
 *
 * @param state - State with the drawn deck/cursor already written back.
 * @param playerId - The player the event fires for.
 * @param name - The drawn event name.
 * @returns The updated state and the personal-event result.
 */
export function applyPersonalEvent(
  state: GameState,
  playerId: number,
  name: PersonalEventName,
): { state: GameState; result: PersonalEventResult } {
  const spec = PERSONAL_EVENT_BY_NAME.get(name);
  if (spec === undefined) {
    throw new Error(`applyPersonalEvent: unknown event ${name}`);
  }
  const m = muleCurve(state.round);
  const effect = spec.apply(state, playerId, m);
  const result: PersonalEventResult = {
    kind: "personal",
    name,
    playerId,
    good: spec.good,
    round: state.round,
    message: effect.message,
    moneyDelta: effect.moneyDelta,
  };
  const nextState: GameState = {
    ...effect.state,
    eventHistory: [...effect.state.eventHistory, result],
  };
  return { state: nextState, result };
}

// ============================================================
// Colony events: deck (schedule) generation
// ============================================================

/**
 * Human-readable name and one-line description per colony event type, rendered
 * from planet_mule's `ColonyEvent.Type` enum (`ColonyEvent.java` lines
 * 305-314). `categoryA` selects the pre-production (true) vs post-production
 * (false) phase (the enum's first constructor argument).
 */
const COLONY_EVENT_INFO: Readonly<
  Record<ColonyEventType, { name: string; description: string; categoryA: boolean }>
> = {
  acid_rain: {
    name: "Acid Rain",
    description: "Acid Rain - increases food but decreases energy production",
    categoryA: true,
  },
  sunspot: {
    name: "Sunspot Activity",
    description: "Sunspot Activity - increases all energy production",
    categoryA: true,
  },
  meteorite: {
    name: "Meteorite Strike",
    description: "Meteorite Strike - enriches a plot with crystite",
    categoryA: true,
  },
  radiation: {
    name: "Radiation",
    description: "Radiation - causes a M.U.L.E. to go crazy",
    categoryA: true,
  },
  pest_attack: {
    name: "Planetary Pest",
    description: "Planetary Pest - eats all food at one plot",
    categoryA: false,
  },
  pirate_ship: {
    name: "Space Pirates",
    description: "Space Pirates - steal all the colony's crystite",
    categoryA: false,
  },
  planet_quake: {
    name: "Planetquake",
    description: "Planetquake - halves all production of crystite and smithore",
    categoryA: false,
  },
  fire_in_store: {
    name: "Fire in Store",
    description: "Fire in Store - the whole stock is burned",
    categoryA: false,
  },
  ship_returns: {
    name: "Return of the Colonial Ship",
    description: "Return of the Colonial Ship",
    categoryA: false,
  },
};

/** True for the pre-production colony events (acid rain, sunspot, meteorite, radiation). */
export function isCategoryAColony(type: ColonyEventType): boolean {
  return COLONY_EVENT_INFO[type].categoryA;
}

/** Expand a weighted deck spec (type -> count) into a flat list of types. */
function expandDeck(spec: readonly (readonly [ColonyEventType, number])[]): ColonyEventType[] {
  const out: ColonyEventType[] = [];
  for (const [type, count] of spec) {
    for (let i = 0; i < count; i += 1) {
      out.push(type);
    }
  }
  return out;
}

/**
 * Generate the per-round colony-event schedule for a game, mirroring
 * planet_mule's `ColonyEventGenerator.generate` (`ColonyEventGenerator.java`
 * lines 34-65):
 *
 * - Build the early deck (`COLONY_DECK_EARLY`: pirates x2, acid rain x3,
 *   sunspot x3, fire x2), double-shuffle, and assign its first
 *   `COLONY_DECK_EARLY_ROUND_COUNT` (2) entries to rounds 1 and 2.
 * - Move the early deck's remainder into the late deck, add the late types
 *   (`COLONY_DECK_LATE`: pest x3, planetquake x3, meteorite x2, radiation x2),
 *   double-shuffle, and assign to rounds 3 onward.
 * - Force the final round to `ship_returns`.
 *
 * The returned array is indexed by round (index 0 is the never-played round-0
 * slot, held as null); indices past the last round are not populated.
 *
 * @param seed - The game seed (the colony sub-rng is derived from it).
 * @param lastRound - The game's final round (`ROUND_COUNT_BY_MODE[mode]`).
 * @returns The schedule array and the colony sub-rng state after generation.
 */
export function generateColonySchedule(
  seed: number,
  lastRound: number,
): { schedule: (ColonyEventType | null)[]; rngState: number } {
  const rng = createRng((seed ^ COLONY_EVENT_RNG_SALT) >>> 0);
  let early = expandDeck(COLONY_DECK_EARLY);
  early = shuffle(rng, shuffle(rng, early));
  const schedule: (ColonyEventType | null)[] = [null];
  for (let i = 0; i < COLONY_DECK_EARLY_ROUND_COUNT; i += 1) {
    const type = early[i];
    if (type === undefined) {
      throw new Error("generateColonySchedule: early deck too short");
    }
    schedule.push(type);
  }
  const late: ColonyEventType[] = early.slice(COLONY_DECK_EARLY_ROUND_COUNT);
  for (const type of expandDeck(COLONY_DECK_LATE)) {
    late.push(type);
  }
  const lateShuffled = shuffle(rng, shuffle(rng, late));
  for (const type of lateShuffled) {
    schedule.push(type);
  }
  // Force the final round to the colonial ship's return.
  if (lastRound < schedule.length) {
    schedule[lastRound] = "ship_returns";
  } else {
    while (schedule.length <= lastRound) {
      schedule.push(null);
    }
    schedule[lastRound] = "ship_returns";
  }
  return { schedule, rngState: rng.getState() };
}

/** This round's scheduled colony event type, or null when none is scheduled. */
export function scheduledColonyType(state: GameState): ColonyEventType | null {
  return state.colonyEventSchedule[state.round] ?? null;
}

// ============================================================
// Colony events: category A (pre-production)
// ============================================================

/**
 * Result of resolving a category-A colony event before production: the updated
 * board (meteorite crater, radiation mule removal), the per-plot temporary
 * bonus map fed to `computeProduction`, the colony sub-rng state, and the UI
 * result. `applicable` is false when the event cannot fire (for example
 * sunspot with no energy M.U.L.E. or radiation with no leader factory), in
 * which case the round runs with no colony event.
 */
export interface ColonyPreResult {
  readonly applicable: boolean;
  readonly plots: readonly (readonly Plot[])[];
  readonly tempBonusByPlot: ReadonlyMap<string, number>;
  readonly rngState: number;
  readonly result: ColonyEventResult | null;
}

/** Build the standard colony result payload for a resolved event. */
function colonyResult(
  state: GameState,
  type: ColonyEventType,
  cells: readonly EventCell[],
  messageSuffix: string,
): ColonyEventResult {
  const info = COLONY_EVENT_INFO[type];
  return {
    kind: "colony",
    type,
    categoryA: info.categoryA,
    round: state.round,
    name: info.name,
    description: info.description,
    message: `${info.name}: ${messageSuffix}`,
    cells,
  };
}

/**
 * Resolve a category-A colony event (acid rain, sunspot, meteorite, radiation)
 * before production runs. Source: `ColonyEvent.java` constructor + `applyEvent`
 * for each type.
 *
 * @param state - Current game state (before production).
 * @param type - The scheduled category-A event type.
 * @returns The board/tempBonus/rng changes and the UI result.
 */
export function resolveColonyPreProduction(
  state: GameState,
  type: ColonyEventType,
): ColonyPreResult {
  const rng = createRng(state.colonyEventRngState);
  const empty: ReadonlyMap<string, number> = new Map();
  const notApplicable: ColonyPreResult = {
    applicable: false,
    plots: state.plots,
    tempBonusByPlot: empty,
    rngState: rng.getState(),
    result: null,
  };
  switch (type) {
    case "acid_rain":
      return resolveAcidRain(state, rng);
    case "sunspot":
      return resolveSunspot(state, rng);
    case "meteorite":
      return resolveMeteorite(state, rng);
    case "radiation":
      return resolveRadiation(state, rng);
    default:
      return notApplicable;
  }
}

/**
 * Acid rain: a randomly struck row gets +`ACID_RAIN_STRUCK_FOOD_BONUS` food /
 * `ACID_RAIN_STRUCK_ENERGY_PENALTY` energy temporary bonus; every other row
 * gets +`ACID_RAIN_OFF_FOOD_BONUS` / `ACID_RAIN_OFF_ENERGY_PENALTY`. Applied to
 * developed food and energy plots only. Source: `ColonyEvent.java` lines
 * 76-82 (row pick) and 214-236 (`applyEvent`).
 */
function resolveAcidRain(state: GameState, rng: Rng): ColonyPreResult {
  const struckRow = rng.nextInt(PLOT_ROWS);
  const tempBonus = new Map<string, number>();
  for (let row = 0; row < state.plots.length; row += 1) {
    const plotRow = state.plots[row];
    if (plotRow === undefined) {
      continue;
    }
    for (let col = 0; col < plotRow.length; col += 1) {
      const plot = plotRow[col];
      if (plot === undefined || plot.muleOutfit === null) {
        continue;
      }
      if (plot.muleOutfit === "food") {
        tempBonus.set(
          plotKey(row, col),
          row === struckRow ? ACID_RAIN_STRUCK_FOOD_BONUS : ACID_RAIN_OFF_FOOD_BONUS,
        );
      } else if (plot.muleOutfit === "energy") {
        tempBonus.set(
          plotKey(row, col),
          row === struckRow ? ACID_RAIN_STRUCK_ENERGY_PENALTY : ACID_RAIN_OFF_ENERGY_PENALTY,
        );
      }
    }
  }
  const cells: EventCell[] = [];
  for (let col = 0; col < PLOT_COLS; col += 1) {
    cells.push({ row: struckRow, col });
  }
  return {
    applicable: true,
    plots: state.plots,
    tempBonusByPlot: tempBonus,
    rngState: rng.getState(),
    result: colonyResult(state, "acid_rain", cells, `acid fell hardest on row ${struckRow + 1}.`),
  };
}

/**
 * Sunspot: every developed energy plot gets a +`SUNSPOT_ENERGY_BONUS`
 * temporary bonus. Applicable only when at least one energy M.U.L.E. exists.
 * Source: `ColonyEvent.java` lines 134-149 (applicability) and 204-213
 * (`applyEvent`).
 */
function resolveSunspot(state: GameState, rng: Rng): ColonyPreResult {
  const tempBonus = new Map<string, number>();
  const cells: EventCell[] = [];
  for (let row = 0; row < state.plots.length; row += 1) {
    const plotRow = state.plots[row];
    if (plotRow === undefined) {
      continue;
    }
    for (let col = 0; col < plotRow.length; col += 1) {
      const plot = plotRow[col];
      if (plot !== undefined && plot.muleOutfit === "energy") {
        tempBonus.set(plotKey(row, col), SUNSPOT_ENERGY_BONUS);
        cells.push({ row, col });
      }
    }
  }
  if (tempBonus.size === 0) {
    return {
      applicable: false,
      plots: state.plots,
      tempBonusByPlot: new Map(),
      rngState: rng.getState(),
      result: null,
    };
  }
  return {
    applicable: true,
    plots: state.plots,
    tempBonusByPlot: tempBonus,
    rngState: rng.getState(),
    result: colonyResult(state, "sunspot", cells, "energy production surged colony-wide."),
  };
}

/**
 * Meteorite: a random eligible plot (not town, not river, crystite level
 * <= `METEORITE_MAX_ELIGIBLE_CRYSTITE`) is cratered -- its M.U.L.E. destroyed,
 * crystite set to `METEORITE_CRYSTITE_LEVEL`, terrain set to crater. Source:
 * `ColonyEvent.java` lines 83-92 (tile pick) and 186-197 (`applyEvent`). PM's
 * reject-until-valid random loop is replaced by picking uniformly from the
 * eligible set (same distribution, no unbounded loop).
 */
function resolveMeteorite(state: GameState, rng: Rng): ColonyPreResult {
  const candidates: EventCell[] = [];
  for (let row = 0; row < state.plots.length; row += 1) {
    const plotRow = state.plots[row];
    if (plotRow === undefined) {
      continue;
    }
    for (let col = 0; col < plotRow.length; col += 1) {
      const plot = plotRow[col];
      if (
        plot !== undefined &&
        plot.terrain !== "town" &&
        plot.terrain !== "river" &&
        plot.crystiteLevel <= METEORITE_MAX_ELIGIBLE_CRYSTITE
      ) {
        candidates.push({ row, col });
      }
    }
  }
  if (candidates.length === 0) {
    return {
      applicable: false,
      plots: state.plots,
      tempBonusByPlot: new Map(),
      rngState: rng.getState(),
      result: null,
    };
  }
  const target = candidates[rng.nextInt(candidates.length)];
  if (target === undefined) {
    throw new Error("resolveMeteorite: target out of range");
  }
  const plots = updatePlot(state.plots, target.row, target.col, (plot) => ({
    ...plot,
    terrain: "crater",
    muleOutfit: null,
    crystiteLevel: METEORITE_CRYSTITE_LEVEL,
    crystiteRevealed: true,
  }));
  return {
    applicable: true,
    plots,
    tempBonusByPlot: new Map(),
    rngState: rng.getState(),
    result: colonyResult(
      state,
      "meteorite",
      [target],
      `a meteorite cratered a plot and enriched it with crystite.`,
    ),
  };
}

/**
 * Radiation ("M.U.L.E. goes crazy"): a random plot owned by the rank-1 leader
 * that holds a M.U.L.E. loses that M.U.L.E. Applicable only when the leader
 * owns at least one developed plot. Source: `ColonyEvent.java` lines 57-75
 * (leader's factory tiles, `Math.min(1, size)` = leader only) and 198-203
 * (`applyEvent` removeBuildings).
 */
function resolveRadiation(state: GameState, rng: Rng): ColonyPreResult {
  const order = rankOrder(state);
  const leader = order[0];
  const candidates: EventCell[] = [];
  if (leader !== undefined) {
    for (let row = 0; row < state.plots.length; row += 1) {
      const plotRow = state.plots[row];
      if (plotRow === undefined) {
        continue;
      }
      for (let col = 0; col < plotRow.length; col += 1) {
        const plot = plotRow[col];
        if (plot !== undefined && plot.owner === leader && plot.muleOutfit !== null) {
          candidates.push({ row, col });
        }
      }
    }
  }
  if (candidates.length === 0) {
    return {
      applicable: false,
      plots: state.plots,
      tempBonusByPlot: new Map(),
      rngState: rng.getState(),
      result: null,
    };
  }
  const target = candidates[rng.nextInt(candidates.length)];
  if (target === undefined) {
    throw new Error("resolveRadiation: target out of range");
  }
  const plots = updatePlot(state.plots, target.row, target.col, (plot) => ({
    ...plot,
    muleOutfit: null,
  }));
  return {
    applicable: true,
    plots,
    tempBonusByPlot: new Map(),
    rngState: rng.getState(),
    result: colonyResult(
      state,
      "radiation",
      [target],
      "radiation sent one of the leader's M.U.L.E.s crazy and it fled.",
    ),
  };
}

// ============================================================
// Colony events: category B (post-production)
// ============================================================

/**
 * Result of resolving a category-B colony event after production: the modified
 * per-plot production (pest zeroing, planetquake halving, pirate crystite
 * zeroing), any board change (planetquake terrain), any store change (fire),
 * whether player crystite inventory is wiped (pirates), the advanced colony
 * sub-rng state, and the UI result. `applicable` is false when the event
 * cannot fire (for example pest with no leader food production), in which case
 * production stands unmodified with no colony event.
 */
export interface ColonyPostResult {
  readonly applicable: boolean;
  readonly perPlot: readonly PlotProduction[];
  readonly plots: readonly (readonly Plot[])[];
  readonly storeStock: Readonly<Record<Resource, number>> | null;
  readonly zeroCrystiteInventory: boolean;
  readonly rngState: number;
  readonly result: ColonyEventResult | null;
}

/**
 * Resolve a category-B colony event (pest, pirates, planetquake, fire, ship
 * return) after production runs, adjusting the computed `perPlot` yields and,
 * where applicable, the board, store stock, or player crystite inventory.
 * Source: `ColonyEvent.java` `applyEvent` for each type.
 *
 * @param state - Current game state (board reflects any category-A change).
 * @param type - The scheduled category-B event type.
 * @param perPlot - Per-plot production from `computeProduction`.
 * @returns The modified production and side effects, plus the UI result.
 */
export function resolveColonyPostProduction(
  state: GameState,
  type: ColonyEventType,
  perPlot: readonly PlotProduction[],
): ColonyPostResult {
  const rng = createRng(state.colonyEventRngState);
  switch (type) {
    case "pest_attack":
      return resolvePest(state, perPlot, rng);
    case "pirate_ship":
      return resolvePirates(state, perPlot, rng);
    case "planet_quake":
      return resolvePlanetquake(state, perPlot, rng);
    case "fire_in_store":
      return resolveFire(state, perPlot, rng);
    case "ship_returns":
      return resolveShipReturn(state, perPlot, rng);
    default:
      return {
        applicable: false,
        perPlot,
        plots: state.plots,
        storeStock: null,
        zeroCrystiteInventory: false,
        rngState: rng.getState(),
        result: null,
      };
  }
}

/** Build the "no change" post-result (used when an event is not applicable). */
function postNotApplicable(
  state: GameState,
  perPlot: readonly PlotProduction[],
  rng: Rng,
): ColonyPostResult {
  return {
    applicable: false,
    perPlot,
    plots: state.plots,
    storeStock: null,
    zeroCrystiteInventory: false,
    rngState: rng.getState(),
    result: null,
  };
}

/**
 * Pest: one random food plot owned by the rank-1 leader, whose food production
 * is positive, produces nothing. Source: `ColonyEvent.java` lines 37-56 (tile
 * pick: leader's food plots with `production > 0`) and 238-242 (`applyEvent`
 * setProduction 0).
 */
function resolvePest(
  state: GameState,
  perPlot: readonly PlotProduction[],
  rng: Rng,
): ColonyPostResult {
  const leader = rankOrder(state)[0];
  const eligible = perPlot.filter(
    (entry) => entry.owner === leader && entry.resource === "food" && entry.amount > 0,
  );
  if (eligible.length === 0) {
    return postNotApplicable(state, perPlot, rng);
  }
  const target = eligible[rng.nextInt(eligible.length)];
  if (target === undefined) {
    throw new Error("resolvePest: target out of range");
  }
  const modified = perPlot.map((entry) =>
    entry.row === target.row && entry.col === target.col ? { ...entry, amount: 0 } : entry,
  );
  return {
    applicable: true,
    perPlot: modified,
    plots: state.plots,
    storeStock: null,
    zeroCrystiteInventory: false,
    rngState: rng.getState(),
    result: colonyResult(
      state,
      "pest_attack",
      [{ row: target.row, col: target.col }],
      "a planetary pest devoured a food plot's harvest.",
    ),
  };
}

/**
 * Pirates: every crystite plot produces nothing and every player's crystite
 * inventory is wiped. Source: `ColonyEvent.java` lines 167-178 (`applyEvent`:
 * setCrystite 0 for each player without a depot, and crystite factory
 * setProduction 0). This engine has no depot, so all players are affected.
 */
function resolvePirates(
  state: GameState,
  perPlot: readonly PlotProduction[],
  rng: Rng,
): ColonyPostResult {
  const modified = perPlot.map((entry) =>
    entry.resource === "crystite" ? { ...entry, amount: 0 } : entry,
  );
  const cells: EventCell[] = perPlot
    .filter((entry) => entry.resource === "crystite")
    .map((entry) => ({ row: entry.row, col: entry.col }));
  return {
    applicable: true,
    perPlot: modified,
    plots: state.plots,
    storeStock: null,
    zeroCrystiteInventory: true,
    rngState: rng.getState(),
    result: colonyResult(
      state,
      "pirate_ship",
      cells,
      "space pirates stole every crystite bar in the colony.",
    ),
  };
}

/**
 * Planetquake: every smithore and crystite plot's production is halved
 * (integer division per plot), and with `PLANETQUAKE_DEGRADE_CHANCE` a mountain
 * (unowned or leader-owned) with an adjacent plain erodes one tier while the
 * neighboring plain heaves up into a mountain1, both losing any M.U.L.E.
 * Source: `ColonyEvent.java` lines 93-133 (tile pick) and 243-267 (`applyEvent`
 * halving + terrain change).
 */
function resolvePlanetquake(
  state: GameState,
  perPlot: readonly PlotProduction[],
  rng: Rng,
): ColonyPostResult {
  const cells: EventCell[] = perPlot
    .filter((entry) => entry.resource === "smithore" || entry.resource === "crystite")
    .map((entry) => ({ row: entry.row, col: entry.col }));

  let plots = state.plots;
  // With 50% chance, degrade a mountain and heave up an adjacent plain; the
  // M.U.L.E.s on both tiles are destroyed (their production this round is
  // lost, matching PM's post-production removeBuildings).
  const destroyed = new Set<string>();
  if (rng.next() < PLANETQUAKE_DEGRADE_CHANCE) {
    const degrade = pickQuakeDegrade(state, rng);
    if (degrade !== null) {
      const { mountain, plain } = degrade;
      plots = updatePlot(plots, mountain.row, mountain.col, (plot) => ({
        ...plot,
        terrain: erodeMountain(plot.terrain),
        muleOutfit: null,
      }));
      plots = updatePlot(plots, plain.row, plain.col, (plot) => ({
        ...plot,
        terrain: "mountain1",
        muleOutfit: null,
      }));
      destroyed.add(plotKey(mountain.row, mountain.col));
      destroyed.add(plotKey(plain.row, plain.col));
      cells.push({ row: mountain.row, col: mountain.col });
      cells.push({ row: plain.row, col: plain.col });
    }
  }
  // Halve mining production per plot (floor, matching setProduction(prod/2)),
  // and zero any plot whose M.U.L.E. the quake just destroyed.
  const modified = perPlot.map((entry) => {
    if (destroyed.has(plotKey(entry.row, entry.col))) {
      return { ...entry, amount: 0 };
    }
    if (entry.resource === "smithore" || entry.resource === "crystite") {
      return { ...entry, amount: Math.floor(entry.amount / 2) };
    }
    return entry;
  });
  return {
    applicable: true,
    perPlot: modified,
    plots,
    storeStock: null,
    zeroCrystiteInventory: false,
    rngState: rng.getState(),
    result: colonyResult(state, "planet_quake", cells, "a planetquake halved every mine's output."),
  };
}

/** Erode a mountain one tier: mountain3 -> mountain2 -> mountain1 -> plain. */
function erodeMountain(terrain: Terrain): Terrain {
  if (terrain === "mountain3") {
    return "mountain2";
  }
  if (terrain === "mountain2") {
    return "mountain1";
  }
  if (terrain === "mountain1") {
    return "plain";
  }
  return terrain;
}

/**
 * Pick a mountain (unowned or leader-owned) that has an adjacent plain to heave
 * up, preferring an unowned plain, mirroring `ColonyEvent.java` lines 93-129.
 * Returns the chosen mountain and plain cells, or null when none qualifies.
 */
function pickQuakeDegrade(
  state: GameState,
  rng: Rng,
): { mountain: EventCell; plain: EventCell } | null {
  const leader = rankOrder(state)[0];
  const mountains: EventCell[] = [];
  for (let row = 0; row < state.plots.length; row += 1) {
    const plotRow = state.plots[row];
    if (plotRow === undefined) {
      continue;
    }
    for (let col = 0; col < plotRow.length; col += 1) {
      const plot = plotRow[col];
      if (plot === undefined) {
        continue;
      }
      const isMountain =
        plot.terrain === "mountain1" ||
        plot.terrain === "mountain2" ||
        plot.terrain === "mountain3";
      if (!isMountain) {
        continue;
      }
      // Eligible: unowned, or owned by the leader (PM skips non-leader owners).
      if (plot.owner !== null && plot.owner !== leader) {
        continue;
      }
      mountains.push({ row, col });
    }
  }
  const shuffled = shuffle(rng, mountains);
  let bestMountain: EventCell | null = null;
  let bestPlain: EventCell | null = null;
  for (const mountain of shuffled) {
    // Horizontal spill direction, randomly left-or-right first (PM's n5).
    const dir = rng.next() < 0.5 ? -1 : 1;
    const neighbors = [
      { row: mountain.row, col: mountain.col - dir },
      { row: mountain.row, col: mountain.col + dir },
    ];
    let foundUnowned = false;
    for (const neighbor of neighbors) {
      const plotRow = state.plots[neighbor.row];
      if (plotRow === undefined) {
        continue;
      }
      const plot = plotRow[neighbor.col];
      if (plot === undefined || plot.terrain !== "plain") {
        continue;
      }
      bestMountain = mountain;
      bestPlain = neighbor;
      if (plot.owner === null) {
        foundUnowned = true;
        break;
      }
    }
    if (foundUnowned) {
      break;
    }
  }
  if (bestMountain === null || bestPlain === null) {
    return null;
  }
  return { mountain: bestMountain, plain: bestPlain };
}

/**
 * Fire in the store: the store's food, energy, and smithore stock all burn to
 * zero (crystite store stock is always zero). Source: `ColonyEvent.java` lines
 * 180-185 (`applyEvent`: shop food/energy/smithore set to 0).
 */
function resolveFire(
  state: GameState,
  perPlot: readonly PlotProduction[],
  rng: Rng,
): ColonyPostResult {
  const storeStock: Record<Resource, number> = {
    ...state.store.stock,
    food: 0,
    energy: 0,
    smithore: 0,
  };
  return {
    applicable: true,
    perPlot,
    plots: state.plots,
    storeStock,
    zeroCrystiteInventory: false,
    rngState: rng.getState(),
    result: colonyResult(
      state,
      "fire_in_store",
      [],
      "a fire gutted the store's food, energy, and smithore stock.",
    ),
  };
}

/**
 * Return of the colonial ship: the forced final-round event has no mechanical
 * effect, only the narrative banner. Source: `ColonyEvent.java` lines 150-154
 * (constructor) and 268-269 (`applyEvent` no-op).
 */
function resolveShipReturn(
  state: GameState,
  perPlot: readonly PlotProduction[],
  rng: Rng,
): ColonyPostResult {
  return {
    applicable: true,
    perPlot,
    plots: state.plots,
    storeStock: null,
    zeroCrystiteInventory: false,
    rngState: rng.getState(),
    result: colonyResult(
      state,
      "ship_returns",
      [],
      "the colonial ship returned to collect the colony's tally.",
    ),
  };
}
