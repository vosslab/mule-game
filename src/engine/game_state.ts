/**
 * Core game state and reducer for the M.U.L.E. engine.
 *
 * This module defines the load-bearing `GameState` shape that every engine,
 * AI, and UI package consumes, plus the reducer entry point.
 *
 * Reducer signature:
 *
 *   applyAction(state: GameState, action: Action): GameState
 *
 * `applyAction` is a pure function: given the current state and an action, it
 * returns the next state and never mutates its input. It is the single entry
 * point through which every state transition flows. The switch below is a stub;
 * each phase package will implement its branches, and unimplemented branches
 * throw so a missing implementation fails loudly rather than silently.
 *
 * The engine is DOM-free by design; nothing here imports browser types.
 */

import type { Player, Resource } from "./player";
import type { StoreState } from "./store";
import type { ResourceRecord } from "./economy";
import { applyTurnAction } from "./turn";

// Board dimensions live in constants.ts (the numeric-rule source of truth) and
// are re-exported here for callers that reach for them alongside the board
// types. Keeping map.ts pointed at constants.ts avoids a value-import cycle
// between this module and turn.ts.
export { PLOT_ROWS, PLOT_COLS } from "./constants";

/**
 * Terrain type for a plot. `mountain1`..`mountain3` distinguish the three
 * mountain crag densities that affect smithore yield; `town` is the central
 * non-ownable square.
 */
export type Terrain = "plain" | "river" | "mountain1" | "mountain2" | "mountain3" | "town";

/**
 * A single board plot.
 *
 * `owner` is the index of the owning player within `GameState.players`, or
 * null when the plot is unclaimed. `muleOutfit` is the resource the plot's
 * installed M.U.L.E. is outfitted to produce, or null when no M.U.L.E. is
 * installed.
 */
export interface Plot {
  readonly terrain: Terrain;
  readonly owner: number | null;
  readonly muleOutfit: Resource | null;
}

/**
 * What a player is carrying during their development turn: `none` when they
 * hold no M.U.L.E., `unoutfitted` after buying but before outfitting, or a
 * `Resource` once the M.U.L.E. is outfitted and ready to place. A carried
 * M.U.L.E. is lost if the turn's tick budget expires before it is placed.
 */
export type CarriedMule = "none" | "unoutfitted" | Resource;

/**
 * Land-grant phase payload: the snake-order sequence of player ids picking
 * this round and the index of whose pick is current. When `pickIndex` reaches
 * `pickOrder.length` the phase advances to development.
 */
export interface LandGrantPayload {
  readonly pickOrder: readonly number[];
  readonly pickIndex: number;
}

/**
 * Development phase payload: the player whose turn it is, the ticks left in
 * their time budget, and the M.U.L.E. they are currently carrying. Players
 * take develop turns in fixed id order 0..3; when player 3's turn ends the
 * phase advances to production.
 */
export interface DevelopPayload {
  readonly activePlayer: number;
  readonly ticksRemaining: number;
  readonly carriedMule: CarriedMule;
}

/**
 * Production phase payload: a snapshot of each player's computed production
 * yields (before spoilage), in `players` order, kept for UI display. The
 * yields have already been applied to player inventories by the time this
 * phase is entered.
 */
export interface ProductionPayload {
  readonly yields: readonly ResourceRecord[];
}

/**
 * A participant's side in the current good's auction. `buyer` wants to
 * acquire units, `seller` wants to unload them, and `out` sits the good out.
 * Roles are declared per good via the `set_auction_role` action before and
 * during the auction.
 */
export type AuctionRole = "buyer" | "seller" | "out";

/**
 * A participant's per-tick price intent. `up` raises their price by
 * `AUCTION_PRICE_STEP`, `down` lowers it, and `hold` leaves it unchanged.
 * The human sets this via `set_auction_intent`; AI sets it programmatically
 * via `decideAuctionActions` in `auction_ai.ts`.
 */
export type AuctionIntent = "up" | "down" | "hold";

/**
 * One player's live standing in the current good's auction: the side they
 * declared, the price they currently sit at, and the direction they are
 * moving it this tick. Every player has exactly one entry, in `players`
 * order.
 */
export interface AuctionParticipant {
  readonly playerId: number;
  readonly role: AuctionRole;
  readonly price: number;
  readonly intent: AuctionIntent;
}

/**
 * A single executed unit trade, recorded on the tick it happened. `buyerId`
 * and `sellerId` are player ids, or `AUCTION_STORE_ID` when the store is the
 * counterparty. Quantity is always one unit (the auction streams units, one
 * per tick, while the market is crossed). `price` is the dollars per unit the
 * buyer paid and the seller received.
 */
export interface AuctionTrade {
  readonly tick: number;
  readonly buyerId: number;
  readonly sellerId: number;
  readonly price: number;
  readonly quantity: number;
}

/**
 * Auction phase sub-state and per-tick snapshot for the UI. Carries the good
 * up for auction, the tick clock, the clamped price band, the store's fixed
 * buy/sell band and remaining stock for the good, every player's live
 * participant standing, the running trade log, and whether the auction has
 * timed out. The fixed good order is food, energy, smithore.
 */
export interface AuctionPayload {
  readonly good: Resource;
  /** Ticks elapsed so far in this good's auction (0-based). */
  readonly tick: number;
  /** Ticks left before the auction times out and ends. */
  readonly ticksRemaining: number;
  readonly priceFloor: number;
  readonly priceCeiling: number;
  /** Dollars per unit the store pays players selling to it. */
  readonly storeBuyPrice: number;
  /** Dollars per unit the store charges players buying from it. */
  readonly storeSellPrice: number;
  /** Remaining store stock of `good` the store can still sell. */
  readonly storeStock: number;
  readonly participants: readonly AuctionParticipant[];
  readonly trades: readonly AuctionTrade[];
  /** True once the tick budget is spent; the driver then dispatches end_auction. */
  readonly finished: boolean;
}

/**
 * Scoring phase payload: the final score for every player (in `players`
 * order) and the index of the winning player.
 */
export interface ScoringPayload {
  readonly scores: readonly number[];
  readonly winnerIndex: number;
}

/**
 * The current game phase, as a discriminated union keyed on `kind`. The title
 * screen carries no payload; every gameplay phase carries the payload shape
 * defined below for that phase (`LandGrantPayload`, `DevelopPayload`,
 * `ProductionPayload`, `AuctionPayload`, `ScoringPayload`).
 */
export type Phase =
  | { readonly kind: "title" }
  | { readonly kind: "land_grant"; readonly payload: LandGrantPayload }
  | { readonly kind: "develop"; readonly payload: DevelopPayload }
  | { readonly kind: "production"; readonly payload: ProductionPayload }
  | { readonly kind: "auction"; readonly payload: AuctionPayload }
  | { readonly kind: "scoring"; readonly payload: ScoringPayload };

/**
 * The complete, serializable game state.
 *
 * `seed` is the original seed the game was created with; `rngState` is the
 * current serialized generator accumulator (see rng.ts `getState`) so a saved
 * game resumes the exact random sequence. `plots` is a PLOT_ROWS x PLOT_COLS
 * grid indexed as `plots[row][col]`. `players` is a fixed tuple of four.
 */
export interface GameState {
  readonly seed: number;
  readonly rngState: number;
  /** Current round, 1 through 6 in the beginner game. */
  readonly round: number;
  readonly phase: Phase;
  readonly plots: readonly (readonly Plot[])[];
  readonly players: readonly [Player, Player, Player, Player];
  readonly store: StoreState;
}

/**
 * Actions the reducer accepts, as a discriminated union keyed on `type`.
 *
 * `tick` is the engine clock action that advances timers; the rest are player
 * intents. `end_auction` is the seam the auction engine (`auction.ts`) uses to
 * signal that the current good's auction has finished so the sequencer can
 * move on to the next good or round.
 */
export type Action =
  | { readonly type: "start_game" }
  | { readonly type: "tick" }
  | {
      readonly type: "claim_plot";
      readonly playerId: number;
      readonly row: number;
      readonly col: number;
    }
  | { readonly type: "pass"; readonly playerId: number }
  | { readonly type: "buy_mule"; readonly playerId: number }
  | { readonly type: "outfit_mule"; readonly playerId: number; readonly resource: Resource }
  | {
      readonly type: "place_mule";
      readonly playerId: number;
      readonly row: number;
      readonly col: number;
    }
  | { readonly type: "cancel_placement"; readonly playerId: number }
  | { readonly type: "end_turn"; readonly playerId: number }
  | {
      readonly type: "set_auction_role";
      readonly playerId: number;
      readonly role: AuctionRole;
    }
  | {
      readonly type: "set_auction_intent";
      readonly playerId: number;
      readonly intent: AuctionIntent;
    }
  | { readonly type: "end_auction" };

/**
 * Apply an action to the current state and return the next state.
 *
 * Pure function: it does not mutate `state`. This is the single entry point for
 * every state transition; the transition logic lives in `turn.ts` and
 * `land_grant.ts` and is dispatched by `applyTurnAction`.
 *
 * @param state - Current game state.
 * @param action - The action to apply.
 * @returns The next game state.
 */
export function applyAction(state: GameState, action: Action): GameState {
  return applyTurnAction(state, action);
}
