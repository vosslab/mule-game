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
import type {
  ColonyEventResult,
  ColonyEventType,
  EventHistoryEntry,
  PersonalEventName,
  PersonalEventResult,
} from "./events";
import { applyTurnAction } from "./turn";

// Board dimensions live in constants.ts (the numeric-rule source of truth) and
// are re-exported here for callers that reach for them alongside the board
// types. Keeping map.ts pointed at constants.ts avoids a value-import cycle
// between this module and turn.ts.
export { PLOT_ROWS, PLOT_COLS } from "./constants";

/**
 * Terrain type for a plot. `mountain1`..`mountain3` distinguish the three
 * mountain crag densities that affect smithore yield; `town` is the central
 * non-ownable square. `crater` is the scorched terrain a meteorite colony
 * event leaves behind (`events.ts`); it appears in no yield table, so a
 * cratered plot produces nothing until crystite-bloom production lands (M7).
 * Source: planet_mule `ColonyEvent.applyEvent` METEORITE_STRIKE
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/ColonyEvent.java`
 * line 191): `this.tile.setType(PlanetTile.PlanetTileType.Crater)`.
 */
export type Terrain =
  "plain" | "river" | "mountain1" | "mountain2" | "mountain3" | "town" | "crater";

/**
 * A single board plot.
 *
 * `owner` is the index of the owning player within `GameState.players`, or
 * null when the plot is unclaimed. `muleOutfit` is the resource the plot's
 * installed M.U.L.E. is outfitted to produce, or null when no M.U.L.E. is
 * installed. `crystiteLevel` is the hidden crystite bloom tier (0 = none,
 * up to `CRYSTITE_BLOOM_MAX_LEVEL`), seeded once at map generation
 * (`map.ts`); `crystiteRevealed` is whether any player has assayed the plot
 * (an `assay_plot` action) and can see that level. Code outside this module
 * must read crystite through the `visibleCrystite` selector below rather
 * than `crystiteLevel` directly, so an unrevealed level is never leaked.
 */
export interface Plot {
  readonly terrain: Terrain;
  readonly owner: number | null;
  readonly muleOutfit: Resource | null;
  readonly crystiteLevel: 0 | 1 | 2 | 3 | 4;
  readonly crystiteRevealed: boolean;
}

/**
 * The only sanctioned way to read a plot's crystite level outside this
 * module (in particular, the only way the UI may render it): returns the
 * level only once the plot has been assayed, `null` otherwise. Reading
 * `plot.crystiteLevel` directly bypasses this gate and leaks hidden bloom
 * data the player has not earned by assaying -- an information leak that
 * would let the UI (or an AI) see crystite through the fog the assay
 * mechanic exists to lift.
 *
 * @param plot - The plot to read.
 * @returns The crystite level if revealed, `null` if not yet assayed.
 */
export function visibleCrystite(plot: Plot): 0 | 1 | 2 | 3 | 4 | null {
  return plot.crystiteRevealed ? plot.crystiteLevel : null;
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
 *
 * `sweepRow`/`sweepCol` are an engine-ticked cursor position that sweeps over
 * the round's free (unowned, non-town) plots: a `tick` action while this
 * phase is active advances it to the next free plot in raster order,
 * wrapping around. `claim_current_plot` claims whichever plot the cursor
 * currently sits on for the current picker, matching planet_mule's land-grant
 * presentation (see docs/RULE_SOURCES.md "Land grant: engine-driven sweep
 * cursor"). The turn-sequential picker gating (`pickOrder`/`pickIndex`,
 * `currentPicker`) is unchanged; the sweep only changes how a claim's target
 * plot is chosen, not who may claim.
 */
export interface LandGrantPayload {
  readonly pickOrder: readonly number[];
  readonly pickIndex: number;
  readonly sweepRow: number;
  readonly sweepCol: number;
}

/**
 * One tick-stamped wampus occurrence, appended to `WampusState.events` for
 * the UI to animate without diffing every tick (the same "append-only log"
 * pattern `AuctionPayload.trades` uses). `spawn` marks the wampus appearing
 * at a new mountain site (the first appearance, or after moving); `blink`
 * marks it re-appearing at the SAME site partway through its two-blink
 * stay; `catch` marks a successful `hunt_wampus`, with `playerId` set to the
 * catching player. `row`/`col` are the site the event happened at.
 */
export interface WampusEvent {
  readonly tick: number;
  readonly kind: "spawn" | "blink" | "catch";
  readonly row: number;
  readonly col: number;
  readonly playerId?: number;
}

/**
 * Round-scoped wampus state, carried on `DevelopPayload.wampus` and threaded
 * across every develop turn in the round (a fresh wampus is created once
 * per round, when the develop phase is entered; see `wampus.ts`
 * `createWampusState`). `row`/`col`/`visible` are the UI-facing snapshot
 * (`row`/`col` are `null` before the wampus's first appearance); the
 * remaining fields are engine bookkeeping the UI does not need to read
 * directly, mirroring how `AuctionPayload` mixes UI-facing fields
 * (`participants`, `trades`) with bookkeeping ones (`idleTicks`,
 * `tradeCooldown`, `runUnits`) in one flat payload.
 *
 * `dead` is true once no unowned mountain remained at round start, or once
 * the wampus has been caught this round (`caught`); either way it can never
 * appear again this round. `mountains` is the fixed candidate site list for
 * the round (see `wampus.ts`'s module doc: this engine never claims land
 * during develop, so the candidate set does not need to shrink mid-round the
 * way planet_mule's `Wampus.landClaimed` does). `blinkTicks` and
 * `blinksRemainingAtSite` are the blink-timer state machine's countdown and
 * per-site blink counter (see `wampus.ts` `tickWampus`). `tick` is a
 * round-local, monotonically increasing counter used only to stamp `events`.
 *
 * Source: planet_mule `Wampus`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Wampus.java`);
 * see docs/RULE_SOURCES.md, "Wampus: spawn, blink, and move timing" for the
 * full tick-mapping derivation.
 */
export interface WampusState {
  readonly row: number | null;
  readonly col: number | null;
  readonly visible: boolean;
  readonly dead: boolean;
  readonly caught: boolean;
  /** This round's bounty: `100 * floor((round + 4) / 4)`. */
  readonly moneyReward: number;
  readonly blinkTicks: number;
  readonly blinksRemainingAtSite: number;
  readonly mountains: readonly { readonly row: number; readonly col: number }[];
  readonly tick: number;
  readonly events: readonly WampusEvent[];
}

/**
 * Development phase payload: the player whose turn it is, the ticks left in
 * their time budget, and the M.U.L.E. they are currently carrying.
 *
 * `turnQueue` is the fixed player-id order develop turns run in for this
 * round, computed once when the phase is entered (`computeTurnQueue` in
 * turn.ts): rank order (highest score first, tied players broken by lowest
 * id), reversed to worst-rank-first when the store's M.U.L.E. stock is at or
 * below `DEVELOP_ORDER_REVERSAL_MULE_THRESHOLD`. `queueIndex` is the current
 * position within it; `activePlayer` is `turnQueue[queueIndex]`, kept as its
 * own field so existing call sites reading `payload.activePlayer` are
 * unaffected by the queue's addition. When `queueIndex` reaches
 * `turnQueue.length - 1` and that player's turn ends, the phase advances to
 * production.
 */
export interface DevelopPayload {
  readonly turnQueue: readonly number[];
  readonly queueIndex: number;
  readonly activePlayer: number;
  readonly ticksRemaining: number;
  readonly carriedMule: CarriedMule;
  /**
   * Player ids in rank order (leader first), snapshotted once when the develop
   * phase is entered (before any turn's purchases shift scores), matching
   * planet_mule's `Development.setPlayerOrder`. The personal-event system reads
   * a player's 1-based rank from this to block good events for the leader and
   * bad events for the trailing players. Distinct from `turnQueue`, which is
   * this same order but reversed under a M.U.L.E. shortage.
   */
  readonly rankOrder: readonly number[];
  /**
   * The personal event that fired when this player's develop turn began, or
   * `undefined` when no event fired (round 1, a failed 27.5% roll, or no
   * eligible event in the deck). UI-friendly: the banner reads `event.message`
   * and styles on `event.good`. Consumed by the event banner.
   */
  readonly event?: PersonalEventResult;
  /**
   * This round's wampus, created once when the develop phase is entered and
   * carried unchanged (except by ticking/catching) across every player's
   * turn in the round. See `WampusState`'s doc comment and `wampus.ts`.
   */
  readonly wampus: WampusState;
}

/**
 * Production phase payload: a snapshot of each player's computed production
 * yields (before spoilage), in `players` order, kept for UI display. The
 * yields have already been applied to player inventories by the time this
 * phase is entered.
 */
export interface ProductionPayload {
  readonly yields: readonly ResourceRecord[];
  /**
   * The colony event that fired this round, or `undefined` when none did (the
   * round-0/never-played slot, or a scheduled event that was not applicable).
   * A category-A event (acid rain, sunspot, meteorite, radiation) has already
   * shaped the `yields` snapshot through pre-production temporary bonuses; a
   * category-B event (pest, pirates, planetquake, fire, ship return) has
   * already reduced them / burned store stock / reshaped terrain. UI-friendly:
   * the banner reads `colonyEvent.message` and highlights `colonyEvent.cells`.
   * Consumed by the event banner.
   */
  readonly colonyEvent?: ColonyEventResult;
}

/**
 * A participant's side in the current good's auction. `buyer` wants to
 * acquire units, `seller` wants to unload them, and `out` sits the good out.
 * Roles are declared per good via the `set_auction_role` action before and
 * during the auction.
 */
export type AuctionRole = "buyer" | "seller" | "out";

/**
 * A participant's per-tick price intent. `up` raises their price by the good's
 * `AUCTION_PRICE_STEP_BY_GOOD` amount (crystite 4, others 1), `down` lowers it,
 * and `hold` leaves it unchanged. The human sets this via `set_auction_intent`;
 * AI sets it programmatically via `decideAuctionActions` in `auction_ai.ts`.
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
 * One player's per-good accounting for the pre-auction STATUS beat: the amounts
 * recorded AS APPLIED at every seam that moved the good between round start and
 * this good's auction-window creation.
 *
 * - `previous`: the player's holding of the good at round start.
 * - `usage`: the amount consumed -- develop-turn food consumption for food, the
 *   per-mule energy actually drawn at production for energy, zero otherwise.
 * - `spoilage`: the amount lost to end-of-round decay.
 * - `production`: the gross yield produced this round (already reflecting any
 *   colony event that reshaped per-plot yields, since it is the applied amount).
 * - `eventDelta`: the net change from events that move a HOLDING directly (the
 *   home-world food/energy package, the wandering traveler's smithore, the
 *   Glac-Elves halving food, the space pirates wiping crystite inventory).
 * - `held`: the holding at this good's window creation.
 *
 * Because every mutating seam records, the identity
 * `previous - usage - spoilage + production + eventDelta === held` holds
 * exactly, and a missed seam shows up as a broken reconciliation rather than a
 * plausible-but-wrong number. Observational only: nothing here feeds a rule.
 */
export interface AuctionStatusEntry {
  readonly playerId: number;
  readonly previous: number;
  readonly usage: number;
  readonly spoilage: number;
  readonly production: number;
  readonly eventDelta: number;
  readonly held: number;
}

/**
 * The colony's supply-vs-need verdict for the good being auctioned, derived
 * from `computeColonyStats`: `"surplus"` when colony supply meets or exceeds
 * colony need, `"shortage"` when it falls short. Always `null` for smithore and
 * crystite -- the ores carry no modeled colony need, so they show no verdict
 * (user decision 2026-07-11).
 */
export type ColonyVerdict = "surplus" | "shortage" | null;

/**
 * Pre-auction status/accounting snapshot for the good up for auction, mirroring
 * the NES STATUS screen that runs before each good's auction floor: one
 * accounting entry per player (in `players` order) plus the colony verdict.
 * Assembled at window creation from the recorded round ledger
 * (`GameState.roundLedger`) and `computeColonyStats`. Purely observational, so
 * it is additive to `AuctionPayload` and changes no auction rule.
 */
export interface AuctionStatus {
  readonly good: Resource;
  readonly accounting: readonly AuctionStatusEntry[];
  readonly verdict: ColonyVerdict;
}

/**
 * Auction phase sub-state and per-tick snapshot for the UI. Carries the good
 * up for auction, the tick clock, the per-good price band, the store's live
 * buy/sell quotes and remaining stock for the good, every player's live
 * participant standing, the running trade log, the pre-auction status snapshot,
 * and whether the auction has finished. The fixed good order is smithore,
 * crystite, food, energy (planet_mule's `Phase`/collection chaining order -- see
 * docs/RULE_SOURCES.md).
 *
 * These fields are all additive, so existing UI reads of `good`,
 * `tick`, `ticksRemaining`, `priceFloor`, `priceCeiling`, `storeBuyPrice`,
 * `storeSellPrice`, `storeStock`, `participants`, `trades`, and `finished`
 * keep working: `skipped` (the window ran no trading phase because the good was
 * unavailable or it was the last round), `priceStep` (the good's per-tick price
 * step, crystite 4 / others 1), the trading-clock internals `idleTicks`,
 * `tradeCooldown`, and `runUnits`, and `status` (the observational accounting
 * beat; see `AuctionStatus`). `priceFloor`/`priceCeiling` are now the
 * good's live store buy/sell quotes (band = [buyQuote, sellQuote]) rather than a
 * global [5, 100] band, so `priceFloor === storeBuyPrice` and
 * `priceCeiling === storeSellPrice`.
 */
export interface AuctionPayload {
  readonly good: Resource;
  /** Ticks elapsed so far in this good's auction (0-based). */
  readonly tick: number;
  /**
   * Quiet-tick countdown left before the window closes. Decrements only on a
   * quiet tick (no participant moved a price and no transaction is in
   * progress); an active or trading tick leaves it unchanged.
   */
  readonly ticksRemaining: number;
  /** Lowest price in the band; the store's live buy quote for `good`. */
  readonly priceFloor: number;
  /** Highest price in the band; the store's live sell quote for `good`. */
  readonly priceCeiling: number;
  /** Dollars per unit the store pays players selling to it (equals `priceFloor`). */
  readonly storeBuyPrice: number;
  /** Dollars per unit the store charges players buying from it (equals `priceCeiling`). */
  readonly storeSellPrice: number;
  /** Remaining store stock of `good` the store can still sell. */
  readonly storeStock: number;
  /** Dollars a participant's price moves per tick (crystite 4, others 1). */
  readonly priceStep: number;
  /** Consecutive quiet ticks so far; the window ends early at the idle timeout. */
  readonly idleTicks: number;
  /** Ticks until the next unit may trade within a transaction run (0 when idle). */
  readonly tradeCooldown: number;
  /** Units traded in the current contiguous transaction run (0 when no run is active). */
  readonly runUnits: number;
  readonly participants: readonly AuctionParticipant[];
  readonly trades: readonly AuctionTrade[];
  /**
   * True once the window has run no trading phase at all: the good was
   * unavailable (no store stock and no player holds any) or it is the last
   * round, matching planet_mule's `skipAuction`. A skipped window is created
   * already `finished`, so the driver advances immediately with no trades.
   */
  readonly skipped: boolean;
  /** True once the window has ended; the driver then dispatches end_auction. */
  readonly finished: boolean;
  /**
   * The pre-auction accounting beat for this good: what every player started
   * the round with, what the round did to it, what they hold now, and whether
   * the colony is in surplus or shortage. Recorded, not reconstructed; see
   * `AuctionStatus`. Present on every window, including a skipped one.
   */
  readonly status: AuctionStatus;
}

/**
 * One player's final-score breakdown, in `players` order. `landValue` is
 * `LAND_VALUE_PER_PLOT` per owned plot regardless of whether it carries a
 * M.U.L.E.; `muleValue` is `POINTS_PER_MULE` plus that outfit's
 * `OUTFIT_COST` for each installed, outfitted M.U.L.E.; `goodsValue` is the
 * player's goods inventory valued at the store's current (not historical)
 * prices. `total` is `money + landValue + muleValue + goodsValue`, the same
 * value carried at that player's index in `ScoringPayload.scores`. See
 * scoring.ts `computeScoreBreakdowns`.
 */
export interface ScoreBreakdown {
  readonly playerId: number;
  readonly money: number;
  readonly landValue: number;
  readonly muleValue: number;
  readonly goodsValue: number;
  readonly total: number;
}

/**
 * Scoring phase payload: the final score for every player (in `players`
 * order), the index of the winning player, and the PM-faithful endgame
 * summary (colony rating, colony failure, First Founder) so the UI can
 * render the full summary without recomputing it.
 *
 * `colonyTotal` is the sum of every player's `scores` entry. `colonyRatingTier`
 * indexes `COLONY_RATING_MESSAGES` (`colonyRatingMessage` is that tier's
 * text); both are still computed on a failed colony (the formula is well
 * defined either way), but planet_mule never surfaces a rating on failure --
 * see `colonyFailed`. `colonyFailed` is true when a non-final round ended
 * with a total resource shortage and no food production anywhere (see
 * scoring.ts `checkColonyFailure`); `failureMessage` then carries the
 * shortage text and `firstFounderId` is null (no founder is awarded on
 * failure). When the colony does not fail, `firstFounderId` is the id of the
 * rank-1 player (`players[winnerIndex].id`).
 */
export interface ScoringPayload {
  readonly scores: readonly number[];
  readonly winnerIndex: number;
  readonly breakdowns: readonly ScoreBreakdown[];
  readonly colonyTotal: number;
  readonly colonyRatingTier: number;
  readonly colonyRatingMessage: string;
  readonly colonyFailed: boolean;
  readonly failureMessage: string | null;
  readonly firstFounderId: number | null;
}

/**
 * One player's live standing in the current colony land auction: whether
 * they have placed at least one bid (`active`) and their current bid price
 * (only meaningful once `active`; otherwise it previews the entry price a
 * first bid would commit to). Mirrors `AuctionParticipant`'s per-player shape
 * so a future `LandAuctionScene` can reuse the goods-auction's per-player
 * price-row rendering pattern.
 */
export interface LandAuctionParticipant {
  readonly playerId: number;
  readonly active: boolean;
  readonly price: number;
}

/**
 * Colony land-auction phase sub-state and per-tick snapshot for the UI. One
 * unowned, non-town plot is offered per land-auction phase entry. `bid_land`
 * raises the calling player's own standing bid to the current asking level
 * (the seeded `startPrice` for a first bid, or `LAND_AUCTION_BID_STEP` above
 * their last bid otherwise), capped at `priceCeiling`; this is the tick-based
 * analog of planet_mule's real-time price-axis walk (see `land_auction.ts`'s
 * module doc and docs/RULE_SOURCES.md for the fidelity adjudication).
 * `goingTicks` counts consecutive ticks since the last bid; the auction
 * finalizes once it reaches three times `LAND_AUCTION_GOING_TICKS` (going
 * once, going twice, sold/no sale) or the `LAND_AUCTION_MAX_TICKS` safety
 * ceiling. `auctionsRemaining` is how many further colony-auction slots this
 * round's chain could still roll after this one (see
 * `LAND_AUCTION_COLONY_PROBABILITIES`); the chain only continues when this
 * slot sold. `finished` marks the countdown as complete; `sold`, `winnerId`,
 * and `finalPrice` are set only once `finished` is true (`winnerId` stays
 * null and `finalPrice` holds the drifted no-sale price when nobody bid).
 */
export interface LandAuctionPayload {
  readonly row: number;
  readonly col: number;
  /** Seeded starting ask for this plot, fixed for the auction's duration. */
  readonly startPrice: number;
  /** Highest price any bid may reach: `startPrice + LAND_AUCTION_PRICE_RANGE`. */
  readonly priceCeiling: number;
  readonly participants: readonly LandAuctionParticipant[];
  readonly goingTicks: number;
  /** Ticks elapsed so far in this plot's auction (0-based). */
  readonly tick: number;
  readonly auctionsRemaining: number;
  readonly finished: boolean;
  readonly sold: boolean;
  readonly winnerId: number | null;
  readonly finalPrice: number | null;
}

/**
 * The current game phase, as a discriminated union keyed on `kind`. The title
 * screen carries no payload; every gameplay phase carries the payload shape
 * defined below for that phase (`LandGrantPayload`, `LandAuctionPayload`,
 * `DevelopPayload`, `ProductionPayload`, `AuctionPayload`, `ScoringPayload`).
 */
export type Phase =
  | { readonly kind: "title" }
  | { readonly kind: "land_grant"; readonly payload: LandGrantPayload }
  | { readonly kind: "land_auction"; readonly payload: LandAuctionPayload }
  | { readonly kind: "develop"; readonly payload: DevelopPayload }
  | { readonly kind: "production"; readonly payload: ProductionPayload }
  | { readonly kind: "auction"; readonly payload: AuctionPayload }
  | { readonly kind: "scoring"; readonly payload: ScoringPayload };

/**
 * Which round-count configuration a game is playing under. `beginner` runs
 * `ROUND_COUNT_BY_MODE.beginner` rounds; `standard` runs
 * `ROUND_COUNT_BY_MODE.standard`. See constants.ts for the round counts and
 * their source. Every other economy constant (starting money, goods, store
 * stock) is shared between modes; round count is the only difference this
 * engine models (see docs/RULE_SOURCES.md, "1983 beginner stock tables").
 */
export type GameMode = "beginner" | "standard";

/**
 * Cross-round memory the colony land auction reads to seed each new
 * auction's starting price, mirroring planet_mule's `PlotSeller` running
 * state (`landPriceAccumulator`/`auctionSetSize`/`landSellPrice`).
 * `priceAccumulator`/`setSize` accumulate every individual plot auction's
 * outcome price (the sold price, or the drifted no-sale price) since the
 * last time a new round's first colony-auction slot consumed the average;
 * `lastSellPrice` is the most recent individual outcome, used to seed a
 * later slot within the same round's chain (`previous - LAND_AUCTION_PRICE_DROP`).
 */
export interface LandMarketState {
  readonly priceAccumulator: number;
  readonly setSize: number;
  readonly lastSellPrice: number;
}

/**
 * One player's accumulating ledger cell for one good, for the round in flight.
 * `previous` is snapshotted from that player's holding when the develop phase
 * is entered -- the round's first goods-mutating seam, since land grant and
 * land auction move money and land but never goods, so the develop-entry
 * holding IS the round-start holding. The four deltas start at zero and
 * accumulate as each seam applies its change (develop food consumption and
 * personal events; production yields, per-mule energy draw, spoilage, and the
 * pirate crystite wipe). Read at each good's auction-window creation to build
 * that good's `AuctionStatusEntry`. Serializable; observational only.
 */
export interface RoundLedgerCell {
  readonly previous: number;
  readonly usage: number;
  readonly spoilage: number;
  readonly production: number;
  readonly eventDelta: number;
}

/** One player's round ledger: a `RoundLedgerCell` per good. */
export type PlayerRoundLedger = Record<Resource, RoundLedgerCell>;

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
  readonly mode: GameMode;
  /** Current round, 1-based, through `ROUND_COUNT_BY_MODE[mode]`. */
  readonly round: number;
  readonly phase: Phase;
  readonly plots: readonly (readonly Plot[])[];
  readonly players: readonly [Player, Player, Player, Player];
  readonly store: StoreState;
  readonly landMarket: LandMarketState;
  /**
   * The round-in-flight goods ledger, one `PlayerRoundLedger` per player in
   * `players` order. Reset when the develop phase is entered and written at
   * every seam that moves a player's goods during the round, so the auction's
   * STATUS beat reports what the round ACTUALLY did rather than recomputing it
   * from rule constants (a recomputation would diverge under clamped
   * consumption and event effects). Read-only from the rules' point of view:
   * `createAuctionPayload` reads it to build `AuctionPayload.status`, and no
   * engine rule branches on it.
   */
  readonly roundLedger: readonly PlayerRoundLedger[];
  /**
   * The colony-event schedule, indexed by round: `colonyEventSchedule[round]`
   * is the event type scheduled for that round, or null when none is (index 0
   * is the never-played round-0 slot). Assigned once at game start from a
   * pre-shuffled weighted deck with the final round forced to `ship_returns`
   * (see events.ts `generateColonySchedule`). Serializable.
   */
  readonly colonyEventSchedule: readonly (ColonyEventType | null)[];
  /**
   * The personal-event deck: the 22 event names in their current shuffled
   * order. Events at indices below `playerEventCursor` have already fired this
   * game (no repeat until the deck is exhausted); the cursor and this order are
   * both advanced by `drawPersonalEvent`. Serializable.
   */
  readonly playerEventDeck: readonly PersonalEventName[];
  /** How many personal-event deck entries have been consumed (the draw cursor). */
  readonly playerEventCursor: number;
  /**
   * Serialized state of the personal-event sub-RNG (derived from the seed,
   * isolated from the core stream). Advanced by each personal-event roll/draw.
   */
  readonly playerEventRngState: number;
  /**
   * Serialized state of the colony-event sub-RNG (derived from the seed,
   * isolated from the core stream). Advanced by schedule generation and each
   * round's colony-event tile selection.
   */
  readonly colonyEventRngState: number;
  /**
   * Append-only log of every personal and colony event that has fired, in
   * fire order, for the UI history view and the fairness property tests.
   */
  readonly eventHistory: readonly EventHistoryEntry[];
  /**
   * Serialized state of the isolated wampus sub-RNG (derived from the seed,
   * isolated from the core economy/auction stream, matching planet_mule's own
   * design: `Wampus`'s constructor seeds `this.random = new
   * Random(random.nextLong())`, a stream derived from but independent of the
   * main `Random`). Re-consumed and re-advanced by `wampus.ts` each round;
   * unlike the personal/colony event streams, this project does not
   * re-derive a fresh sub-seed per round (PM re-derives one per `createWampus()`
   * call) -- see docs/RULE_SOURCES.md, "Wampus RNG isolation" for the full
   * adjudication.
   */
  readonly wampusRngState: number;
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
  | { readonly type: "claim_current_plot"; readonly playerId: number }
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
  | {
      readonly type: "assay_plot";
      readonly playerId: number;
      readonly row: number;
      readonly col: number;
    }
  | { readonly type: "end_turn"; readonly playerId: number }
  | { readonly type: "hunt_wampus"; readonly playerId: number }
  | { readonly type: "gamble"; readonly playerId: number }
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
  | { readonly type: "end_auction" }
  | { readonly type: "bid_land"; readonly playerId: number }
  | { readonly type: "end_land_auction" };

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
