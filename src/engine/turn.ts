/**
 * Turn sequencer for the M.U.L.E. engine: the phase state machine and the
 * reducer that every action flows through.
 *
 * Phase cycle per round:
 *
 *   land_grant (snake-order picks)
 *     -> develop x4 players (buy, outfit, place a M.U.L.E. on a tick budget)
 *     -> production (apply yields + spoilage, snapshot)
 *     -> auction x3 goods in fixed order food, energy, smithore
 *     -> next round's land_grant, or scoring after the final round.
 *
 * Everything here is pure and deterministic: no mutation of inputs, no DOM, no
 * clock. `game_state.ts` delegates its `applyAction` entry point to
 * `applyTurnAction` below. The auction phase only handles good/round
 * progression here; the auction engine (src/engine/auction.ts) owns
 * tick-based matching, and the UI driver dispatches `end_auction` once a
 * good's auction finishes.
 */

import type { Player, Resource } from "./player";
import type { Action, DevelopPayload, GameState, LandGrantPayload, Plot } from "./game_state";
import { createRng } from "./rng";
import { generateMap } from "./map";
import { createInitialStoreState, computeOutfitCost } from "./store";
import { computeProduction, applySpoilage } from "./economy";
import type { ResourceRecord } from "./economy";
import { computeScores, computeWinnerIndex } from "./scoring";
import { MULE_BASE_PRICE, ROUND_COUNT, STARTING_GOODS, STARTING_MONEY } from "./constants";
import { DEVELOP_TICKS_PER_TURN } from "./constants";
import {
  advancePick,
  claimPlotOnBoard,
  createLandGrantPayload,
  currentPicker,
  isLandGrantComplete,
} from "./land_grant";
import {
  applySetAuctionIntent,
  applySetAuctionRole,
  auctionTick,
  createAuctionPayload,
} from "./auction";

/** Number of players in the beginner game (one human, three AI). */
const PLAYER_COUNT = 4;

/** Fixed order goods are auctioned in each round. */
const AUCTION_GOOD_ORDER: readonly Resource[] = ["food", "energy", "smithore"];

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

// ============================================================
// Initial state and phase entry
// ============================================================

/**
 * Build a fresh game in the title phase. The seeded map is generated up front
 * so the board is fixed for the game; `rngState` captures the generator after
 * map generation so any later randomness continues the same sequence.
 *
 * @param seed - Seed for the deterministic generator.
 * @returns A new game state on the title screen.
 */
export function createInitialGameState(seed: number): GameState {
  const rng = createRng(seed);
  const plots = generateMap(rng);
  const players: [Player, Player, Player, Player] = [
    createStartingPlayer(0),
    createStartingPlayer(1),
    createStartingPlayer(2),
    createStartingPlayer(3),
  ];
  return {
    seed,
    rngState: rng.getState(),
    round: 1,
    phase: { kind: "title" },
    plots,
    players,
    store: createInitialStoreState(),
  };
}

/**
 * Build a starting player: id 0 is the human, 1..3 are AI. Every player begins
 * with `STARTING_MONEY` and `STARTING_GOODS`.
 *
 * @param id - Player id and color slot (0..3).
 * @returns A new player in their starting state.
 */
function createStartingPlayer(id: number): Player {
  return {
    id,
    isHuman: id === 0,
    colorSlot: id as Player["colorSlot"],
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
  const payload = createLandGrantPayload(round, PLAYER_COUNT);
  return { ...state, round, phase: { kind: "land_grant", payload } };
}

/**
 * Enter the development phase at the first player's turn with a full tick
 * budget and no carried M.U.L.E.
 *
 * @param state - Current game state.
 * @returns State in the development phase for player 0.
 */
export function enterDevelop(state: GameState): GameState {
  return { ...state, phase: { kind: "develop", payload: developTurnFor(0) } };
}

/**
 * Build a fresh development payload for a player's turn.
 *
 * @param activePlayer - Player whose turn it is.
 * @returns A develop payload with a full tick budget and no carried M.U.L.E.
 */
function developTurnFor(activePlayer: number): DevelopPayload {
  return { activePlayer, ticksRemaining: DEVELOP_TICKS_PER_TURN, carriedMule: "none" };
}

/**
 * Enter the production phase: compute each player's yields, add them to
 * inventory, apply upkeep and spoilage, and snapshot the pre-spoilage yields
 * for display. The snapshot is what the UI shows; the players already hold the
 * post-spoilage totals.
 *
 * @param state - Current game state.
 * @returns State in the production phase with updated player inventories.
 */
export function enterProduction(state: GameState): GameState {
  const yields = computeProduction(state.plots, state.players, state.round);
  const updatedPlayers = mapPlayers(state.players, (player, index) => {
    const produced = yieldFor(yields, index);
    const combined: ResourceRecord = {
      food: player.goods.food + produced.food,
      energy: player.goods.energy + produced.energy,
      smithore: player.goods.smithore + produced.smithore,
    };
    const afterSpoilage = applySpoilage(combined, state.round);
    return { ...player, goods: afterSpoilage };
  });
  return {
    ...state,
    players: updatedPlayers,
    phase: { kind: "production", payload: { yields } },
  };
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
 * Enter the scoring phase with final scores and the winner.
 *
 * @param state - Current game state.
 * @returns State in the scoring phase.
 */
export function enterScoring(state: GameState): GameState {
  const scores = computeScores(state);
  const winnerIndex = computeWinnerIndex(state);
  return { ...state, phase: { kind: "scoring", payload: { scores, winnerIndex } } };
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

/**
 * Read the yield record for a player index, failing loudly if it is missing.
 *
 * @param yields - Per-player yield records from `computeProduction`.
 * @param index - Player index.
 * @returns The yield record for that player.
 */
function yieldFor(yields: readonly ResourceRecord[], index: number): ResourceRecord {
  const produced = yields[index];
  if (produced === undefined) {
    throw new Error(`enterProduction: missing yields for player ${index}`);
  }
  return produced;
}

// ============================================================
// Phase-advance helpers
// ============================================================

/**
 * End the active develop player's turn: any carried-but-unplaced M.U.L.E. is
 * lost. Advance to the next player, or to production after the last player.
 *
 * @param state - Current game state (must be in the develop phase).
 * @param activePlayer - The player whose turn is ending.
 * @returns State for the next develop turn, or the production phase.
 */
function endDevelopTurn(state: GameState, activePlayer: number): GameState {
  const nextPlayer = activePlayer + 1;
  if (nextPlayer < PLAYER_COUNT) {
    return { ...state, phase: { kind: "develop", payload: developTurnFor(nextPlayer) } };
  }
  return enterProduction(state);
}

/**
 * Advance the auction from the finished good to the next good, or end the
 * round after smithore. A finished round starts the next round's land grant,
 * or the scoring phase after the final round.
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
  if (state.round < ROUND_COUNT) {
    return enterLandGrant(state, state.round + 1);
  }
  return enterScoring(state);
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
 * True when it is `playerId`'s develop turn, they carry no M.U.L.E., and they
 * can afford one. UI and AI check this before dispatching `buy_mule`.
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
  return player.money >= MULE_BASE_PRICE;
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
    case "end_turn":
      return applyEndTurn(state, action.playerId);
    case "set_auction_role":
      return applySetAuctionRole(state, action.playerId, action.role);
    case "set_auction_intent":
      return applySetAuctionIntent(state, action.playerId, action.intent);
    case "end_auction":
      return applyEndAuction(state);
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
  if (state.phase.kind === "develop") {
    const payload = state.phase.payload;
    const ticksRemaining = payload.ticksRemaining - 1;
    if (ticksRemaining <= 0) {
      // Budget exhausted: end the turn, discarding any carried M.U.L.E.
      return endDevelopTurn(state, payload.activePlayer);
    }
    return {
      ...state,
      phase: { kind: "develop", payload: { ...payload, ticksRemaining } },
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
 * Advance the land-grant pick order after a claim or pass, entering
 * development when the order is exhausted.
 */
function advanceLandGrant(state: GameState, payload: LandGrantPayload): GameState {
  const nextPayload = advancePick(payload);
  if (isLandGrantComplete(nextPayload)) {
    return enterDevelop(state);
  }
  return { ...state, phase: { kind: "land_grant", payload: nextPayload } };
}

/**
 * Buy an unoutfitted M.U.L.E. for the active develop player: pay the base
 * price and carry it. Throws if the player cannot afford it.
 */
function applyBuyMule(state: GameState, playerId: number): GameState {
  const payload = requireDevelop(state);
  requireActivePlayer(payload, playerId);
  if (payload.carriedMule !== "none") {
    throw new Error(`player ${playerId} already carries a M.U.L.E.`);
  }
  const player = playerById(state, playerId);
  if (player.money < MULE_BASE_PRICE) {
    throw new Error(
      `player ${playerId} cannot afford a M.U.L.E. (${player.money} < ${MULE_BASE_PRICE})`,
    );
  }
  const players = updatePlayerById(state.players, playerId, (current) => ({
    ...current,
    money: current.money - MULE_BASE_PRICE,
  }));
  return {
    ...state,
    players,
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
 * End the active develop player's turn. Always valid regardless of money or
 * whether they own a placeable plot; any carried M.U.L.E. is lost.
 */
function applyEndTurn(state: GameState, playerId: number): GameState {
  const payload = requireDevelop(state);
  requireActivePlayer(payload, playerId);
  return endDevelopTurn(state, payload.activePlayer);
}

/**
 * End the current good's auction and advance to the next good, next round, or
 * scoring.
 */
function applyEndAuction(state: GameState): GameState {
  if (state.phase.kind !== "auction") {
    throw new Error(`end_auction only valid in the auction phase, got ${state.phase.kind}`);
  }
  return endAuctionGood(state, state.phase.payload.good);
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
