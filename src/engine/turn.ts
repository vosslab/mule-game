/**
 * Turn sequencer for the M.U.L.E. engine: the phase state machine and the
 * reducer that every action flows through.
 *
 * Phase cycle per round:
 *
 *   land_grant (snake-order picks)
 *     -> land_auction x0-3 colony plots (skipped cleanly when the round's
 *        probability rolls yield no plot, or none remains unclaimed)
 *     -> develop x4 players (buy, outfit, place a M.U.L.E. on a tick budget)
 *     -> production (apply yields + spoilage, snapshot)
 *     -> auction x3 goods in fixed order food, energy, smithore
 *     -> next round's land_grant, or scoring after the final round.
 *
 * Everything here is pure and deterministic: no mutation of inputs, no DOM, no
 * clock. `game_state.ts` delegates its `applyAction` entry point to
 * `applyTurnAction` below. The auction and land-auction phases only handle
 * good/round and slot-chain progression here; the auction engines
 * (src/engine/auction.ts, src/engine/land_auction.ts) own tick-based
 * matching/settlement, and the UI driver dispatches `end_auction`/
 * `end_land_auction` once a window finishes.
 */

import type { Player, Resource, Species } from "./player";
import { SPECIES } from "./player";
import type {
  Action,
  DevelopPayload,
  GameMode,
  GameState,
  LandGrantPayload,
  LandMarketState,
  Plot,
  ProductionPayload,
  WampusState,
} from "./game_state";
import { createRng } from "./rng";
import { generateMap } from "./map";
import { catchWampus, createWampusState, tickWampus } from "./wampus";
import {
  applyAverageTradePrice,
  applyMulePurchase,
  computeColonyStats,
  computeOutfitCost,
  createInitialStoreState,
  rebuildMules,
  spoilStoreFood,
  updateStoreForNewRound,
} from "./store";
import { computeProduction, applySpoilage } from "./economy";
import type { PlotProduction, ProductionModifiers, ResourceRecord } from "./economy";
import { buildScoringPayload, checkColonyFailure } from "./scoring";
import {
  applyPersonalEvent,
  createPlayerEventDeck,
  drawPersonalEvent,
  generateColonySchedule,
  isCategoryAColony,
  rankOrder,
  resolveColonyPostProduction,
  resolveColonyPreProduction,
  scheduledColonyType,
} from "./events";
import type { ColonyEventResult, PersonalEventResult } from "./events";
import { ROUND_COUNT_BY_MODE, STARTING_GOODS, STARTING_MONEY } from "./constants";
import {
  ASSAY_TICK_COST,
  DEVELOP_ORDER_REVERSAL_MULE_THRESHOLD,
  DEVELOP_TICKS_FULL,
  DEVELOP_TICKS_MIN,
  FOOD_REQUIREMENTS_BY_ROUND,
  PUB_MAX_RANDOM_AMOUNT,
  PUB_PAYOUT_CAP,
  PUB_ROUND_BONUS_BY_ROUND,
  WAMPUS_RNG_SALT,
} from "./constants";
import {
  advancePick,
  advanceSweepCursor,
  claimPlotOnBoard,
  createLandGrantPayload,
  currentPicker,
  isFreePlot,
  isLandGrantComplete,
  worstRankedClaimant,
} from "./land_grant";
import {
  applySetAuctionIntent,
  applySetAuctionRole,
  auctionTick,
  createAuctionPayload,
} from "./auction";
import {
  applyBidLand,
  createLandAuctionPayload,
  LAND_AUCTION_SLOT_COUNT,
  landAuctionTick,
  rollColonySlot,
  unownedNonTownPlots,
} from "./land_auction";

/** Number of players in the beginner game (one human, three AI). */
const PLAYER_COUNT = 4;

/**
 * Fixed order goods are auctioned in each round: smithore, crystite, food,
 * energy. This is planet_mule's runtime collection/auction chaining order
 * (`ColonyEventPhase`/`GameLobbyPhase` set the first collection to
 * COLLECTION_SMITHORE, then each auction's outro chains smithore -> crystite ->
 * food -> energy -> summary), which differs from the `Phase` enum's declaration
 * order (crystite, smithore, energy, food) -- the runtime chaining is
 * authoritative. Kept as a separate explicit constant rather than derived from
 * `RESOURCES` so the auction order is not coupled to the resource-type order.
 * See docs/RULE_SOURCES.md, "Goods auction: bands, roles, timing, transfer".
 */
const AUCTION_GOOD_ORDER: readonly Resource[] = ["smithore", "crystite", "food", "energy"];

// ============================================================
// Immutable player/board helpers
// ============================================================

/**
 * Apply `updater` to the player with `playerId`, returning a new four-player
 * tuple with every other player shared unchanged.
 *
 * @param players - Current players tuple.
 * @param playerId - Id of the player to replace.
 * @param updater - Pure function returning the replacement player.
 * @returns A new players tuple.
 */
function updatePlayerById(
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
 * Install a M.U.L.E. outfitted for `resource` on a plot the player owns,
 * returning a new board grid. Throws if the plot is out of range, not owned by
 * the player, or already holds a M.U.L.E., so an illegal placement fails loudly.
 *
 * @param plots - Current board grid, indexed as `plots[row][col]`.
 * @param playerId - Player placing the M.U.L.E.
 * @param row - Zero-based row index of the target plot.
 * @param col - Zero-based column index of the target plot.
 * @param resource - Resource the M.U.L.E. is outfitted for.
 * @returns A new board grid with the target plot's `muleOutfit` set.
 */
function placeMuleOnBoard(
  plots: readonly (readonly Plot[])[],
  playerId: number,
  row: number,
  col: number,
  resource: Resource,
): Plot[][] {
  const targetRow = plots[row];
  if (targetRow === undefined) {
    throw new Error(`placeMuleOnBoard: row ${row} out of range`);
  }
  const target = targetRow[col];
  if (target === undefined) {
    throw new Error(`placeMuleOnBoard: col ${col} out of range`);
  }
  if (target.owner !== playerId) {
    throw new Error(`placeMuleOnBoard: plot (${row}, ${col}) not owned by ${playerId}`);
  }
  if (target.muleOutfit !== null) {
    throw new Error(`placeMuleOnBoard: plot (${row}, ${col}) already has a M.U.L.E.`);
  }
  return plots.map((plotRow, rowIndex) => {
    if (rowIndex !== row) {
      return plotRow.slice();
    }
    return plotRow.map((plot, colIndex) => {
      if (colIndex !== col) {
        return plot;
      }
      return { ...plot, muleOutfit: resource };
    });
  });
}

/**
 * Reveal a plot's hidden crystite level, returning a new board grid. Throws
 * if the plot is out of range or is the town, so an illegal assay fails
 * loudly. Unlike `placeMuleOnBoard`, ownership is not checked: planet_mule
 * allows assaying any plot, owned or not (verified in
 * `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/ai/DevelopmentAction.java`
 * `Assay`, which carries no ownership precondition), so scouting unclaimed
 * land is legal here too.
 *
 * @param plots - Current board grid, indexed as `plots[row][col]`.
 * @param row - Zero-based row index of the target plot.
 * @param col - Zero-based column index of the target plot.
 * @returns A new board grid with the target plot's `crystiteRevealed` set.
 */
function assayPlotOnBoard(plots: readonly (readonly Plot[])[], row: number, col: number): Plot[][] {
  const targetRow = plots[row];
  if (targetRow === undefined) {
    throw new Error(`assayPlotOnBoard: row ${row} out of range`);
  }
  const target = targetRow[col];
  if (target === undefined) {
    throw new Error(`assayPlotOnBoard: col ${col} out of range`);
  }
  if (target.terrain === "town") {
    throw new Error(`assayPlotOnBoard: cannot assay the town plot at (${row}, ${col})`);
  }
  return plots.map((plotRow, rowIndex) => {
    if (rowIndex !== row) {
      return plotRow.slice();
    }
    return plotRow.map((plot, colIndex) => {
      if (colIndex !== col) {
        return plot;
      }
      return { ...plot, crystiteRevealed: true };
    });
  });
}

// ============================================================
// Initial state and phase entry
// ============================================================

/**
 * Build a fresh game in the title phase. The seeded map is generated up front
 * so the board is fixed for the game; `rngState` captures the generator after
 * map generation so any later randomness continues the same sequence.
 *
 * `mode` defaults to `"beginner"` so every existing caller (tests, the UI)
 * keeps today's 6-round behavior unchanged; `"standard"` is reachable but
 * nothing selects it yet (the mode picker is a later milestone).
 *
 * `species` assigns each player's cosmetic species (see `Species`'s doc
 * comment: purely cosmetic, no economic effect). Defaults to the first four
 * entries of `SPECIES` in order, so every existing caller keeps a
 * deterministic assignment without needing to pass one; a title-screen
 * species picker (a later milestone) supplies its own choice here.
 *
 * @param seed - Seed for the deterministic generator.
 * @param mode - Game mode controlling round count. Defaults to `"beginner"`.
 * @param species - Per-player species assignment (id 0..3). Defaults to the
 *   first four entries of `SPECIES`.
 * @returns A new game state on the title screen.
 */
export function createInitialGameState(
  seed: number,
  mode: GameMode = "beginner",
  species: readonly [Species, Species, Species, Species] = [
    SPECIES[0] as Species,
    SPECIES[1] as Species,
    SPECIES[2] as Species,
    SPECIES[3] as Species,
  ],
): GameState {
  const rng = createRng(seed);
  const plots = generateMap(rng);
  const players: [Player, Player, Player, Player] = [
    createStartingPlayer(0, species[0]),
    createStartingPlayer(1, species[1]),
    createStartingPlayer(2, species[2]),
    createStartingPlayer(3, species[3]),
  ];
  const landMarket: LandMarketState = { priceAccumulator: 0, setSize: 0, lastSellPrice: 0 };
  // Event and wampus subsystems are seeded from derived sub-streams (see
  // events.ts's determinism note and constants.ts's WAMPUS_RNG_SALT), so they
  // consume none of the core generator above -- adding them leaves the
  // pre-existing economy/auction RNG sequence untouched.
  const colony = generateColonySchedule(seed, ROUND_COUNT_BY_MODE[mode]);
  const playerEvents = createPlayerEventDeck(seed);
  return {
    seed,
    rngState: rng.getState(),
    mode,
    round: 1,
    phase: { kind: "title" },
    plots,
    players,
    store: createInitialStoreState(),
    landMarket,
    colonyEventSchedule: colony.schedule,
    colonyEventRngState: colony.rngState,
    playerEventDeck: playerEvents.deck,
    playerEventCursor: 0,
    playerEventRngState: playerEvents.rngState,
    eventHistory: [],
    wampusRngState: (seed ^ WAMPUS_RNG_SALT) >>> 0,
  };
}

/**
 * Build a starting player: id 0 is the human, 1..3 are AI. Every player begins
 * with `STARTING_MONEY` and `STARTING_GOODS` regardless of species (species is
 * purely cosmetic, see `Species`'s doc comment).
 *
 * @param id - Player id and color slot (0..3).
 * @param species - This player's cosmetic species.
 * @returns A new player in their starting state.
 */
function createStartingPlayer(id: number, species: Species): Player {
  return {
    id,
    isHuman: id === 0,
    colorSlot: id as Player["colorSlot"],
    species,
    money: STARTING_MONEY,
    goods: { ...STARTING_GOODS },
  };
}

/**
 * Enter the land-grant phase for a given round, seeding the snake-order pick
 * sequence.
 *
 * @param state - Current game state.
 * @param round - Round number to enter (1-based).
 * @returns State in the land-grant phase for `round`.
 */
export function enterLandGrant(state: GameState, round: number): GameState {
  const payload = createLandGrantPayload(round, PLAYER_COUNT, state.plots);
  return { ...state, round, phase: { kind: "land_grant", payload } };
}

/**
 * Enter the development phase: compute this round's turn queue (rank order,
 * reversed on M.U.L.E. shortage), spawn this round's wampus, and begin the
 * first player's turn.
 *
 * @param state - Current game state.
 * @returns State in the development phase for the first player in queue.
 */
export function enterDevelop(state: GameState): GameState {
  const order = rankOrder(state);
  const turnQueue =
    state.store.muleStock <= DEVELOP_ORDER_REVERSAL_MULE_THRESHOLD ? [...order].reverse() : order;
  const created = createWampusState(state);
  const withWampusRng: GameState = { ...state, wampusRngState: created.wampusRngState };
  return beginDevelopTurn(withWampusRng, turnQueue, order, 0, created.wampus);
}

/**
 * Attempt to offer a colony land auction at `slotIndex` within this round's
 * chain (0-based, at most `LAND_AUCTION_SLOT_COUNT` slots): roll the slot's
 * probability, and when it succeeds and an unowned non-town plot remains,
 * enter the land-auction phase for a randomly chosen one. Skips cleanly to
 * development when the slot roll fails, no plot remains, or every slot has
 * already been tried this round -- matching `PlotSeller
 * .generateNextColonyAuction`'s "colony doesn't sell a plot" outcome.
 *
 * @param state - Current game state.
 * @param slotIndex - Which colony-auction slot to attempt (0-based).
 * @returns State in the land-auction phase for a chosen plot, or the
 *   development phase when this round offers no (further) plot.
 */
function attemptLandAuctionSlot(state: GameState, slotIndex: number): GameState {
  if (slotIndex >= LAND_AUCTION_SLOT_COUNT) {
    return enterDevelop(state);
  }
  const rollRng = createRng(state.rngState);
  const offered = rollColonySlot(rollRng, slotIndex);
  const afterRoll: GameState = { ...state, rngState: rollRng.getState() };
  if (!offered) {
    return enterDevelop(afterRoll);
  }
  const candidates = unownedNonTownPlots(afterRoll.plots);
  if (candidates.length === 0) {
    return enterDevelop(afterRoll);
  }
  const pickRng = createRng(afterRoll.rngState);
  const target = candidates[pickRng.nextInt(candidates.length)];
  if (target === undefined) {
    throw new Error("attemptLandAuctionSlot: plot index out of range");
  }
  const afterPick: GameState = { ...afterRoll, rngState: pickRng.getState() };
  const payload = createLandAuctionPayload(afterPick, target.row, target.col, slotIndex);
  return { ...afterPick, phase: { kind: "land_auction", payload } };
}

/**
 * Begin a develop turn for the player at `queueIndex` in `turnQueue`. First
 * resolve that player's personal event (matching planet_mule's
 * `PlayerEventPhase`, which runs before each player's development turn), THEN
 * consume their food for the round (`Player.useFood`) and set their tick
 * budget. The event resolves before food consumption because PM selects the
 * event using the player's pre-consumption food (the zero-food pity check) and
 * applies the event's effect (which may add food, as the pity package does)
 * before `useFood` runs, so a starving player's package still lifts their
 * develop budget this turn.
 *
 * @param state - Current game state.
 * @param turnQueue - This round's develop-turn player-id order (rank order,
 *   reversed under a M.U.L.E. shortage).
 * @param order - This round's rank order (leader first), for the event system.
 * @param queueIndex - Position within `turnQueue` for the turn beginning now.
 * @param wampus - This round's wampus state, carried forward from the ending
 *   turn (or freshly created by `enterDevelop` for the round's first turn).
 * @returns State in the development phase for that player, with the personal
 *   event applied and food consumed.
 */
function beginDevelopTurn(
  state: GameState,
  turnQueue: readonly number[],
  order: readonly number[],
  queueIndex: number,
  wampus: WampusState,
): GameState {
  const activePlayer = turnQueue[queueIndex];
  if (activePlayer === undefined) {
    throw new Error(
      `beginDevelopTurn: queueIndex ${queueIndex} out of range for turnQueue length ${turnQueue.length}`,
    );
  }
  // Resolve the personal event first, reading pre-consumption food for the
  // pity check (see the function doc). `order` gives the player's 1-based rank.
  const rank = order.indexOf(activePlayer) + 1;
  const preFoodPlayer = playerById(state, activePlayer);
  const resolved = resolvePersonalEventForTurn(state, activePlayer, rank, preFoodPlayer.goods.food);
  const afterEvent = resolved.state;
  const player = playerById(afterEvent, activePlayer);
  const required = FOOD_REQUIREMENTS_BY_ROUND[Math.min(afterEvent.round, 12)] ?? 0;
  const { foodUsage, ticksRemaining } = computeFoodUsage(player.goods.food, required);
  const players = updatePlayerById(afterEvent.players, activePlayer, (current) => ({
    ...current,
    goods: { ...current.goods, food: current.goods.food - foodUsage },
  }));
  const basePayload: DevelopPayload = {
    turnQueue,
    queueIndex,
    activePlayer,
    ticksRemaining,
    carriedMule: "none",
    rankOrder: order,
    wampus,
  };
  const payload: DevelopPayload =
    resolved.event === undefined ? basePayload : { ...basePayload, event: resolved.event };
  return {
    ...afterEvent,
    players,
    phase: { kind: "develop", payload },
  };
}

/**
 * Draw and apply this player's personal event for their develop turn. Always
 * writes back the advanced deck/cursor/sub-rng (even when no event fires, so
 * the 27.5% roll's RNG advance is not lost), and applies the event effect when
 * one is drawn.
 *
 * @param state - Current game state.
 * @param playerId - The player taking their turn.
 * @param rank - The player's 1-based rank (from the rank-order snapshot).
 * @param food - The player's pre-consumption food (for the pity check).
 * @returns The updated state and the fired event result (if any).
 */
function resolvePersonalEventForTurn(
  state: GameState,
  playerId: number,
  rank: number,
  food: number,
): { state: GameState; event?: PersonalEventResult } {
  const draw = drawPersonalEvent(state, playerId, rank, food);
  const afterDraw: GameState = {
    ...state,
    playerEventDeck: draw.deck,
    playerEventCursor: draw.cursor,
    playerEventRngState: draw.rngState,
  };
  if (draw.name === null) {
    return { state: afterDraw };
  }
  const applied = applyPersonalEvent(afterDraw, playerId, draw.name);
  return { state: applied.state, event: applied.result };
}

/**
 * Consume food for one player's develop turn and derive their tick budget,
 * matching planet_mule's `Player.useFood` (`Player.java` lines 166-183).
 * When the player holds enough food to cover `required`, they consume
 * exactly `required` and get the full `DEVELOP_TICKS_FULL` budget (this also
 * covers the degenerate `required === 0` case, since `0 <= foodHave` always
 * holds -- not reachable in normal play, since every round from round 1
 * onward requires 3+ food, see `FOOD_REQUIREMENTS_BY_ROUND`). When short,
 * they consume everything they have and their budget scales linearly
 * between `DEVELOP_TICKS_MIN` and `DEVELOP_TICKS_FULL` by how much of the
 * requirement they could cover.
 *
 * @param foodHave - Player's food on hand before this turn.
 * @param required - Food required this round (`FOOD_REQUIREMENTS_BY_ROUND`).
 * @returns Food actually consumed and the resulting tick budget.
 */
function computeFoodUsage(
  foodHave: number,
  required: number,
): { foodUsage: number; ticksRemaining: number } {
  if (required > foodHave) {
    const foodUsage = foodHave;
    const f = foodUsage / required;
    const ticksRemaining = Math.round(f * DEVELOP_TICKS_FULL + (1 - f) * DEVELOP_TICKS_MIN);
    return { foodUsage, ticksRemaining };
  }
  return { foodUsage: required, ticksRemaining: DEVELOP_TICKS_FULL };
}

/**
 * Enter the production phase: compute each player's yields, add them to
 * inventory, deduct the energy actually spent powering mules, and apply
 * spoilage; snapshot the pre-spoilage yields for display. The snapshot is
 * what the UI shows; the players already hold the post-spoilage totals. Food
 * usage does not happen here: it was already consumed at each player's
 * develop-turn start (see `beginDevelopTurn`), matching planet_mule's model
 * where develop-phase usage and end-of-round spoilage are independent
 * systems (see docs/RULE_SOURCES.md, "Upkeep consolidation").
 *
 * `computeProduction` draws from the core
 * `state.rngState` stream -- the same stream `updateStoreForNewRound` and the
 * land auction draw from -- for its per-player shuffle and per-plot gaussian
 * variance, so the returned state's `rngState` is advanced here, distinct
 * from `colonyEventRngState` below (an isolated sub-stream; see
 * docs/RULE_SOURCES.md, "Event RNG isolation").
 *
 * @param state - Current game state.
 * @returns State in the production phase with updated player inventories.
 */
export function enterProduction(state: GameState): GameState {
  const type = scheduledColonyType(state);

  // --- Category A (pre-production): reshape the board and build the per-plot
  // temporary bonus fed into production (meteorite crater, radiation mule
  // removal, acid rain, sunspot). Category A and B are mutually exclusive per
  // round (one scheduled type), so only one branch runs. ---
  let plots = state.plots;
  let modifiers: ProductionModifiers | undefined;
  let colonyEvent: ColonyEventResult | undefined;
  let colonyEventRngState = state.colonyEventRngState;
  if (type !== null && isCategoryAColony(type)) {
    const pre = resolveColonyPreProduction(state, type);
    colonyEventRngState = pre.rngState;
    if (pre.applicable) {
      plots = pre.plots;
      modifiers = { tempBonusByPlot: pre.tempBonusByPlot };
      colonyEvent = pre.result ?? undefined;
    }
  }

  const productionRng = createRng(state.rngState);
  const production = computeProduction(plots, state.players, state.round, productionRng, modifiers);
  let perPlot = production.perPlot;
  let store = state.store;
  let zeroCrystiteInventory = false;

  // --- Category B (post-production): adjust the computed per-plot yields and
  // any side effects (pest, pirates, planetquake, fire, ship return). ---
  if (type !== null && !isCategoryAColony(type)) {
    const post = resolveColonyPostProduction({ ...state, plots }, type, perPlot);
    colonyEventRngState = post.rngState;
    if (post.applicable) {
      perPlot = post.perPlot;
      plots = post.plots;
      if (post.storeStock !== null) {
        store = { ...store, stock: post.storeStock };
      }
      zeroCrystiteInventory = post.zeroCrystiteInventory;
      colonyEvent = post.result ?? undefined;
    }
  }

  // Sum the (possibly event-adjusted) per-plot production into per-player
  // yields; this snapshot is what the production payload reports.
  const yields = sumPerPlot(perPlot, state.players.length);
  const updatedPlayers = mapPlayers(state.players, (player, index) => {
    const produced = yields[index] ?? emptyResourceRecord();
    const consumed = production.energyConsumed[index] ?? 0;
    const combined: ResourceRecord = {
      food: player.goods.food + produced.food,
      energy: player.goods.energy + produced.energy - consumed,
      smithore: player.goods.smithore + produced.smithore,
      // Pirates wipe every player's crystite: zero the total, so this round's
      // (already-zeroed) crystite production and any prior holdings both go.
      crystite: zeroCrystiteInventory ? 0 : player.goods.crystite + produced.crystite,
    };
    const afterSpoilage = applySpoilage(combined);
    return { ...player, goods: afterSpoilage };
  });

  const payload: ProductionPayload =
    colonyEvent === undefined ? { yields } : { yields, colonyEvent };
  return {
    ...state,
    plots,
    players: updatedPlayers,
    store,
    rngState: productionRng.getState(),
    colonyEventRngState,
    phase: { kind: "production", payload },
  };
}

/** An all-zero resource record. */
function emptyResourceRecord(): ResourceRecord {
  return { food: 0, energy: 0, smithore: 0, crystite: 0 };
}

/**
 * Sum per-plot production into per-player yield records, in player-index order.
 *
 * @param perPlot - Per-plot production (possibly adjusted by a colony event).
 * @param playerCount - Number of players.
 * @returns One yield record per player.
 */
function sumPerPlot(perPlot: readonly PlotProduction[], playerCount: number): ResourceRecord[] {
  const totals: ResourceRecord[] = [];
  for (let index = 0; index < playerCount; index += 1) {
    totals.push(emptyResourceRecord());
  }
  for (const entry of perPlot) {
    const record = totals[entry.owner];
    if (record === undefined) {
      continue;
    }
    record[entry.resource] += entry.amount;
  }
  return totals;
}

/**
 * Enter the auction phase for a specific good.
 *
 * @param state - Current game state.
 * @param good - Good up for auction.
 * @returns State in the auction phase for `good`.
 */
export function enterAuction(state: GameState, good: Resource): GameState {
  return { ...state, phase: { kind: "auction", payload: createAuctionPayload(state, good) } };
}

/**
 * Enter the scoring phase with the full PM-faithful endgame payload: final
 * scores, the winner, the colony rating, colony-failure state, and First
 * Founder (see scoring.ts `buildScoringPayload`).
 *
 * @param state - Current game state.
 * @returns State in the scoring phase.
 */
export function enterScoring(state: GameState): GameState {
  return { ...state, phase: { kind: "scoring", payload: buildScoringPayload(state) } };
}

/**
 * Map every player to a replacement, preserving the four-player tuple type.
 *
 * @param players - Current players tuple.
 * @param updater - Pure function returning the replacement for each player.
 * @returns A new players tuple.
 */
function mapPlayers(
  players: readonly [Player, Player, Player, Player],
  updater: (player: Player, index: number) => Player,
): [Player, Player, Player, Player] {
  return [
    updater(players[0], 0),
    updater(players[1], 1),
    updater(players[2], 2),
    updater(players[3], 3),
  ];
}

// ============================================================
// Phase-advance helpers
// ============================================================

/**
 * End the active develop player's turn: any carried-but-unplaced M.U.L.E. is
 * lost. Advance to the next player in the turn queue, or to production after
 * the last player.
 *
 * @param state - Current game state (must be in the develop phase).
 * @param payload - The develop payload for the turn that is ending.
 * @returns State for the next develop turn, or the production phase.
 */
function endDevelopTurn(state: GameState, payload: DevelopPayload): GameState {
  const nextIndex = payload.queueIndex + 1;
  if (nextIndex < payload.turnQueue.length) {
    return beginDevelopTurn(state, payload.turnQueue, payload.rankOrder, nextIndex, payload.wampus);
  }
  return enterProduction(state);
}

/**
 * Advance the auction from the finished good to the next good, or end the
 * round after smithore. A finished round starts the next round's land grant,
 * unless it was the final round or the colony failed this round (a total
 * food or energy shortage with no food production anywhere -- see scoring.ts
 * `checkColonyFailure`), either of which sends the game straight to scoring.
 *
 * @param state - Current game state (must be in the auction phase).
 * @param good - The good whose auction just finished.
 * @returns State for the next good, next round, or scoring.
 */
function endAuctionGood(state: GameState, good: Resource): GameState {
  const goodIndex = AUCTION_GOOD_ORDER.indexOf(good);
  const nextGood = AUCTION_GOOD_ORDER[goodIndex + 1];
  if (nextGood !== undefined) {
    return enterAuction(state, nextGood);
  }
  // All three goods auctioned: the round is over.
  const isLastRound = state.round >= ROUND_COUNT_BY_MODE[state.mode];
  if (!isLastRound && !checkColonyFailure(state).failed) {
    return advanceToNextRound(state);
  }
  return enterScoring(state);
}

/**
 * Advance from a finished round into the next round's land grant, recomputing
 * store prices at the boundary.
 *
 * Seam mapping: planet_mule recalcs each good's price at the start of that
 * good's Collection phase (`CollectionPhase.begin` -> `Shop.calcBuySellPrice`,
 * right before the good's auction) and feeds the average trade price back at
 * the end of each auction (`AbstractAuctionPhase.end` -> `setAveragePrice`).
 * This engine has a single production phase then three back-to-back auctions,
 * so it collapses PM's per-good Collection recalcs into one round-boundary
 * recalc that reprices every good for the upcoming round; the per-auction
 * average-price feedback stays per good (see `applyEndAuction`). Store food
 * spoilage (halving) also lands here, at the round boundary. See
 * docs/RULE_SOURCES.md, "Store price recalc seam".
 *
 * Threads the seeded generator through the price recalc (smithore jitter and
 * the crystite draw consume randomness) and captures the advanced `rngState`.
 *
 * The M.U.L.E. rebuild (`rebuildMules`) runs after the price
 * recalc, using the freshly recomputed smithore price to set next round's
 * M.U.L.E. price, matching planet_mule's own ordering: `Shop.buildMules`
 * (`SummaryPhase2.java` line 73) runs after that round's price/trade/average
 * steps (see docs/RULE_SOURCES.md, "Store price recalc seam").
 *
 * @param state - Current game state at the end of the last good's auction.
 * @returns State in the next round's land-grant phase with recomputed prices
 *   and a rebuilt M.U.L.E. stock.
 */
function advanceToNextRound(state: GameState): GameState {
  const nextRound = state.round + 1;
  const spoiledStore = spoilStoreFood(state.store);
  const stats = computeColonyStats(state.players, state.plots, spoiledStore, nextRound);
  const rng = createRng(state.rngState);
  const pricedStore = updateStoreForNewRound(spoiledStore, stats, rng);
  const rebuiltStore = rebuildMules(pricedStore);
  const advanced = { ...state, store: rebuiltStore, rngState: rng.getState() };
  return enterLandGrant(advanced, nextRound);
}

// ============================================================
// Phase guards
// ============================================================

/**
 * Narrow to the land-grant payload, throwing if the phase does not match.
 */
function requireLandGrant(state: GameState): LandGrantPayload {
  if (state.phase.kind !== "land_grant") {
    throw new Error(`expected land_grant phase, got ${state.phase.kind}`);
  }
  return state.phase.payload;
}

/**
 * Narrow to the develop payload, throwing if the phase does not match.
 */
function requireDevelop(state: GameState): DevelopPayload {
  if (state.phase.kind !== "develop") {
    throw new Error(`expected develop phase, got ${state.phase.kind}`);
  }
  return state.phase.payload;
}

/**
 * Confirm it is `playerId`'s develop turn, throwing otherwise.
 */
function requireActivePlayer(payload: DevelopPayload, playerId: number): void {
  if (payload.activePlayer !== playerId) {
    throw new Error(`player ${playerId} acted out of turn (active: ${payload.activePlayer})`);
  }
}

// ============================================================
// Query helpers (used by AI and UI to avoid softlocks)
// ============================================================

/**
 * True when it is `playerId`'s develop turn, they carry no M.U.L.E., the
 * store has M.U.L.E.s in stock, and they can afford the store's current
 * M.U.L.E. price. UI and AI check this before dispatching `buy_mule`.
 *
 * @param state - Current game state.
 * @param playerId - Player to test.
 * @returns Whether a `buy_mule` action would succeed.
 */
export function canBuyMule(state: GameState, playerId: number): boolean {
  if (state.phase.kind !== "develop") {
    return false;
  }
  const payload = state.phase.payload;
  if (payload.activePlayer !== playerId || payload.carriedMule !== "none") {
    return false;
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return false;
  }
  if (state.store.muleStock <= 0) {
    return false;
  }
  return player.money >= state.store.mulePrice;
}

/**
 * True when `playerId` owns at least one plot with no installed M.U.L.E., so a
 * carried M.U.L.E. could be placed. AI uses this to decide whether placing is
 * even possible before ending its turn.
 *
 * @param state - Current game state.
 * @param playerId - Player to test.
 * @returns Whether the player has a placeable plot.
 */
export function hasPlaceablePlot(state: GameState, playerId: number): boolean {
  for (const row of state.plots) {
    for (const plot of row) {
      if (plot.owner === playerId && plot.muleOutfit === null) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================
// Reducer
// ============================================================

/**
 * Apply an action to the current state and return the next state. Pure: never
 * mutates `state`. Invalid actions for the current phase or out-of-turn actions
 * throw so caller bugs surface immediately.
 *
 * @param state - Current game state.
 * @param action - Action to apply.
 * @returns The next game state.
 */
export function applyTurnAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "start_game":
      return applyStartGame(state);
    case "tick":
      return applyTick(state);
    case "claim_plot":
      return applyClaimPlot(state, action.playerId, action.row, action.col);
    case "claim_current_plot":
      return applyClaimCurrentPlot(state, action.playerId);
    case "pass":
      return applyPass(state, action.playerId);
    case "buy_mule":
      return applyBuyMule(state, action.playerId);
    case "outfit_mule":
      return applyOutfitMule(state, action.playerId, action.resource);
    case "place_mule":
      return applyPlaceMule(state, action.playerId, action.row, action.col);
    case "cancel_placement":
      return applyCancelPlacement(state, action.playerId);
    case "assay_plot":
      return applyAssayPlot(state, action.playerId, action.row, action.col);
    case "end_turn":
      return applyEndTurn(state, action.playerId);
    case "hunt_wampus":
      return applyHuntWampus(state, action.playerId);
    case "gamble":
      return applyGamble(state, action.playerId);
    case "set_auction_role":
      return applySetAuctionRole(state, action.playerId, action.role);
    case "set_auction_intent":
      return applySetAuctionIntent(state, action.playerId, action.intent);
    case "end_auction":
      return applyEndAuction(state);
    case "bid_land":
      return applyBidLand(state, action.playerId);
    case "end_land_auction":
      return applyEndLandAuction(state);
    default: {
      // Exhaustiveness guard: a new Action variant without a case fails to compile.
      const _exhaustive: never = action;
      throw new Error(`applyTurnAction: unhandled action ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Start the game: leave the title screen and enter the first land grant.
 */
function applyStartGame(state: GameState): GameState {
  if (state.phase.kind !== "title") {
    throw new Error(`start_game only valid on the title screen, got ${state.phase.kind}`);
  }
  return enterLandGrant(state, state.round);
}

/**
 * Advance the engine clock. In development this spends one tick of the active
 * player's budget and ends their turn (losing any carried M.U.L.E.) when the
 * budget hits zero. In production it advances to the first good's auction.
 * In every other phase a tick is a no-op.
 */
function applyTick(state: GameState): GameState {
  if (state.phase.kind === "land_grant") {
    // The sweep cursor advances every land-grant tick, independent of whose
    // pick is current -- it is a continuous, always-running animation the
    // current picker's claim_current_plot reads from (see land_grant.ts's
    // advanceSweepCursor doc comment).
    const payload = state.phase.payload;
    const next = advanceSweepCursor(state.plots, payload.sweepRow, payload.sweepCol);
    return {
      ...state,
      phase: {
        kind: "land_grant",
        payload: { ...payload, sweepRow: next.row, sweepCol: next.col },
      },
    };
  }
  if (state.phase.kind === "develop") {
    const payload = state.phase.payload;
    // The wampus advances every develop-phase tick, independent of whose
    // turn it is or how many player-budget ticks remain, matching
    // planet_mule's continuous real-time Wampus.update() (see wampus.ts).
    const wampusAdvance = tickWampus(payload.wampus, state.wampusRngState, payload.wampus.tick + 1);
    const stateWithWampus: GameState = { ...state, wampusRngState: wampusAdvance.wampusRngState };
    const payloadWithWampus: DevelopPayload = { ...payload, wampus: wampusAdvance.wampus };
    const ticksRemaining = payload.ticksRemaining - 1;
    if (ticksRemaining <= 0) {
      // Budget exhausted: end the turn, discarding any carried M.U.L.E.
      return endDevelopTurn(stateWithWampus, payloadWithWampus);
    }
    return {
      ...stateWithWampus,
      phase: { kind: "develop", payload: { ...payloadWithWampus, ticksRemaining } },
    };
  }
  if (state.phase.kind === "production") {
    return enterAuction(state, AUCTION_GOOD_ORDER[0] as Resource);
  }
  if (state.phase.kind === "auction") {
    // The auction engine owns tick-based price movement and trade matching;
    // it marks the payload finished on timeout, and the driver then dispatches
    // end_auction so the sequencer advances the good/round.
    return auctionTick(state);
  }
  if (state.phase.kind === "land_auction") {
    // The land-auction engine owns the going-tick countdown and settlement;
    // it marks the payload finished at timeout, and the driver then dispatches
    // end_land_auction so the sequencer advances the slot chain/round.
    return landAuctionTick(state);
  }
  return state;
}

/**
 * Claim a plot for the current picker during the land grant, then advance the
 * pick order (entering development once every player has picked or passed).
 */
function applyClaimPlot(state: GameState, playerId: number, row: number, col: number): GameState {
  const payload = requireLandGrant(state);
  requireCurrentPicker(payload, playerId);
  const plots = claimPlotOnBoard(state.plots, playerId, row, col);
  return advanceLandGrant({ ...state, plots }, payload);
}

/**
 * Claim whichever plot the land-grant sweep cursor currently sits on, for the
 * current picker, then advance the pick order. `worstRankedClaimant` resolves
 * the claimant among candidates (see its doc comment): only the current
 * picker is ever a legal candidate under this engine's turn-sequential
 * picker gating, so the resolver here always receives a single candidate.
 */
function applyClaimCurrentPlot(state: GameState, playerId: number): GameState {
  const payload = requireLandGrant(state);
  requireCurrentPicker(payload, playerId);
  if (!isFreePlot(state.plots, payload.sweepRow, payload.sweepCol)) {
    throw new Error(
      `applyClaimCurrentPlot: sweep cursor is not on a free plot (${payload.sweepRow}, ${payload.sweepCol})`,
    );
  }
  const claimant = worstRankedClaimant([playerId], state);
  const plots = claimPlotOnBoard(state.plots, claimant, payload.sweepRow, payload.sweepCol);
  return advanceLandGrant({ ...state, plots }, payload);
}

/**
 * Pass the current picker's land-grant turn without claiming a plot.
 */
function applyPass(state: GameState, playerId: number): GameState {
  const payload = requireLandGrant(state);
  requireCurrentPicker(payload, playerId);
  return advanceLandGrant(state, payload);
}

/**
 * Confirm `playerId` is the current land-grant picker, throwing otherwise.
 */
function requireCurrentPicker(payload: LandGrantPayload, playerId: number): void {
  const picker = currentPicker(payload);
  if (picker !== playerId) {
    throw new Error(`player ${playerId} picked out of turn (current picker: ${picker})`);
  }
}

/**
 * Advance the land-grant pick order after a claim or pass, attempting this
 * round's first colony land-auction slot (or, when none is offered,
 * development directly) when the order is exhausted.
 */
function advanceLandGrant(state: GameState, payload: LandGrantPayload): GameState {
  const nextPayload = advancePick(payload);
  if (isLandGrantComplete(nextPayload)) {
    return attemptLandAuctionSlot(state, 0);
  }
  return { ...state, phase: { kind: "land_grant", payload: nextPayload } };
}

/**
 * Buy an unoutfitted M.U.L.E. for the active develop player: pay the store's
 * current dynamic price (`store.mulePrice`) and carry it, decrementing store
 * stock. Throws if the store is out of stock or the player cannot afford it,
 * mirroring `applyOutfitMule`'s fail-loudly affordability check below.
 */
function applyBuyMule(state: GameState, playerId: number): GameState {
  const payload = requireDevelop(state);
  requireActivePlayer(payload, playerId);
  if (payload.carriedMule !== "none") {
    throw new Error(`player ${playerId} already carries a M.U.L.E.`);
  }
  if (state.store.muleStock <= 0) {
    throw new Error(`player ${playerId} cannot buy a M.U.L.E.: the store is out of stock`);
  }
  const player = playerById(state, playerId);
  const price = state.store.mulePrice;
  if (player.money < price) {
    throw new Error(`player ${playerId} cannot afford a M.U.L.E. (${player.money} < ${price})`);
  }
  const players = updatePlayerById(state.players, playerId, (current) => ({
    ...current,
    money: current.money - price,
  }));
  const store = applyMulePurchase(state.store);
  return {
    ...state,
    players,
    store,
    phase: { kind: "develop", payload: { ...payload, carriedMule: "unoutfitted" } },
  };
}

/**
 * Outfit the carried M.U.L.E. for a resource, paying the outfit cost. Throws
 * if the player carries no M.U.L.E. or cannot afford the outfit.
 */
function applyOutfitMule(state: GameState, playerId: number, resource: Resource): GameState {
  const payload = requireDevelop(state);
  requireActivePlayer(payload, playerId);
  if (payload.carriedMule === "none") {
    throw new Error(`player ${playerId} has no M.U.L.E. to outfit`);
  }
  const cost = computeOutfitCost(resource);
  const player = playerById(state, playerId);
  if (player.money < cost) {
    throw new Error(
      `player ${playerId} cannot afford the ${resource} outfit (${player.money} < ${cost})`,
    );
  }
  const players = updatePlayerById(state.players, playerId, (current) => ({
    ...current,
    money: current.money - cost,
  }));
  return {
    ...state,
    players,
    phase: { kind: "develop", payload: { ...payload, carriedMule: resource } },
  };
}

/**
 * Place the carried, outfitted M.U.L.E. on an owned empty plot. Throws if the
 * carried M.U.L.E. is not yet outfitted.
 */
function applyPlaceMule(state: GameState, playerId: number, row: number, col: number): GameState {
  const payload = requireDevelop(state);
  requireActivePlayer(payload, playerId);
  const resource = payload.carriedMule;
  if (resource === "none" || resource === "unoutfitted") {
    throw new Error(`player ${playerId} has no outfitted M.U.L.E. to place`);
  }
  const plots = placeMuleOnBoard(state.plots, playerId, row, col, resource);
  return {
    ...state,
    plots,
    phase: { kind: "develop", payload: { ...payload, carriedMule: "none" } },
  };
}

/**
 * Cancel an in-progress placement: the player keeps the carried M.U.L.E. in
 * tow (conceptually returning to the store) until the turn's tick budget
 * expires. State is unchanged; only the turn ownership is validated.
 */
function applyCancelPlacement(state: GameState, playerId: number): GameState {
  const payload = requireDevelop(state);
  requireActivePlayer(payload, playerId);
  return state;
}

/**
 * Assay a plot for the active develop player: reveal its hidden crystite
 * level and deduct `ASSAY_TICK_COST` from the turn's tick budget. Any plot
 * may be assayed regardless of ownership (see `assayPlotOnBoard`). Throws if
 * it is not `playerId`'s develop turn or if too few ticks remain to afford
 * the assay, matching the fail-loudly convention `applyBuyMule` and
 * `applyOutfitMule` already use for insufficient money. If paying the cost
 * exhausts the tick budget, the turn ends immediately, mirroring how
 * `applyTick` ends a turn when `ticksRemaining` reaches zero.
 */
function applyAssayPlot(state: GameState, playerId: number, row: number, col: number): GameState {
  const payload = requireDevelop(state);
  requireActivePlayer(payload, playerId);
  if (payload.ticksRemaining < ASSAY_TICK_COST) {
    throw new Error(
      `player ${playerId} cannot afford to assay (${payload.ticksRemaining} ticks < ${ASSAY_TICK_COST})`,
    );
  }
  const plots = assayPlotOnBoard(state.plots, row, col);
  const ticksRemaining = payload.ticksRemaining - ASSAY_TICK_COST;
  const nextState = { ...state, plots };
  if (ticksRemaining <= 0) {
    return endDevelopTurn(nextState, payload);
  }
  return { ...nextState, phase: { kind: "develop", payload: { ...payload, ticksRemaining } } };
}

/**
 * End the active develop player's turn. Always valid regardless of money or
 * whether they own a placeable plot; any carried M.U.L.E. is lost.
 */
function applyEndTurn(state: GameState, playerId: number): GameState {
  const payload = requireDevelop(state);
  requireActivePlayer(payload, playerId);
  return endDevelopTurn(state, payload);
}

/**
 * Catch this round's wampus for the active develop player: award its money
 * bounty and mark it caught (despawning it for the rest of the round). Does
 * not end the turn or cost ticks (no PM analog: catching is instantaneous
 * once in range in planet_mule's real-time model). Throws if it is not
 * `playerId`'s develop turn, or if the wampus is not currently catchable
 * (dead, already caught, or not visible) -- this also enforces "catchable
 * once per round", since a caught wampus is immediately dead. Proximity to
 * the wampus's site is a UI-scene concern (the spatial overworld/town scene
 * enforces it); the engine only enforces visible-and-alive, matching this
 * repo's reducer fail-loudly convention.
 */
function applyHuntWampus(state: GameState, playerId: number): GameState {
  const payload = requireDevelop(state);
  requireActivePlayer(payload, playerId);
  const wampus = payload.wampus;
  if (wampus.dead || wampus.caught || !wampus.visible) {
    throw new Error(
      `player ${playerId} cannot hunt the wampus: not visible or already caught this round`,
    );
  }
  const caught = catchWampus(wampus, playerId);
  const players = updatePlayerById(state.players, playerId, (current) => ({
    ...current,
    money: current.money + wampus.moneyReward,
  }));
  return {
    ...state,
    players,
    phase: { kind: "develop", payload: { ...payload, wampus: caught } },
  };
}

/**
 * Gamble at the pub for the active develop player: pay out
 * `PUB_ROUND_BONUS_BY_ROUND[round] + floor(random * fraction *
 * PUB_MAX_RANDOM_AMOUNT)`, capped at `PUB_PAYOUT_CAP`, where `fraction` is
 * how much of the turn's tick budget remains (this engine's tick analog of
 * planet_mule's `timeLeft / developmentMaxTime`). Always ends the turn
 * (matching `GameModel.gamble`'s caller, which never lets a player act again
 * after gambling), discarding any carried M.U.L.E. like any other turn end.
 */
function applyGamble(state: GameState, playerId: number): GameState {
  const payload = requireDevelop(state);
  requireActivePlayer(payload, playerId);
  const rng = createRng(state.rngState);
  const bonus = PUB_ROUND_BONUS_BY_ROUND[Math.min(state.round, 12)] ?? 0;
  const fraction = Math.min(payload.ticksRemaining / DEVELOP_TICKS_FULL, 1);
  const rawPayout = bonus + Math.floor(rng.next() * fraction * PUB_MAX_RANDOM_AMOUNT);
  const payout = Math.min(rawPayout, PUB_PAYOUT_CAP);
  const players = updatePlayerById(state.players, playerId, (current) => ({
    ...current,
    money: current.money + payout,
  }));
  const gambled: GameState = { ...state, players, rngState: rng.getState() };
  return endDevelopTurn(gambled, payload);
}

/**
 * End the current good's auction and advance to the next good, next round, or
 * scoring. Before advancing, feed the good's average trade price back into its
 * store base price (planet_mule `AbstractAuctionPhase.end` -> `setAveragePrice`),
 * except on the last round, where no later round consumes it. After the crystite
 * auction, zero the store's crystite stock: the store is a crystite-only-buyer
 * that sinks the crystite it buys, so its crystite stock stays zero
 * (planet_mule never adds bought crystite to the shop, `shopStartCrystite = 0`).
 */
function applyEndAuction(state: GameState): GameState {
  if (state.phase.kind !== "auction") {
    throw new Error(`end_auction only valid in the auction phase, got ${state.phase.kind}`);
  }
  const payload = state.phase.payload;
  const isLastRound = state.round >= ROUND_COUNT_BY_MODE[state.mode];
  let store = state.store;
  if (!isLastRound) {
    store = applyAverageTradePrice(store, payload.good, payload.trades);
  }
  if (payload.good === "crystite" && store.stock.crystite !== 0) {
    store = { ...store, stock: { ...store.stock, crystite: 0 } };
  }
  return endAuctionGood({ ...state, store }, payload.good);
}

/**
 * End the current land auction and advance to the next colony-auction slot,
 * or to development when this round's chain is done. Matches
 * `AbstractLandAuctionPhase.goToNextPhase`: a later slot only rolls when
 * this slot's plot sold; a failed sale (or the last slot) ends the round's
 * colony-auction chain.
 */
function applyEndLandAuction(state: GameState): GameState {
  if (state.phase.kind !== "land_auction") {
    throw new Error(
      `end_land_auction only valid in the land_auction phase, got ${state.phase.kind}`,
    );
  }
  const payload = state.phase.payload;
  if (!payload.finished) {
    throw new Error("end_land_auction: land auction has not finished yet");
  }
  if (payload.sold && payload.auctionsRemaining > 0) {
    const nextSlotIndex = LAND_AUCTION_SLOT_COUNT - payload.auctionsRemaining;
    return attemptLandAuctionSlot(state, nextSlotIndex);
  }
  return enterDevelop(state);
}

/**
 * Look up a player by id, failing loudly if the id is out of range.
 */
function playerById(state: GameState, playerId: number): Player {
  const player = state.players[playerId];
  if (player === undefined) {
    throw new Error(`no player with id ${playerId}`);
  }
  return player;
}
