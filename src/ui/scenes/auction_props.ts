// Prop contracts for the goods-auction lane components.
//
// The full-stage auction is built by four independent lanes -- the arena SVG
// (auction_arena.tsx), the player dock (auction_dock.tsx), the status layer
// (auction_status.tsx), and the shell that composes them
// (../solid/auction_screen.tsx). This module is the one place their prop
// shapes are declared, so a lane can import the contract it implements
// without importing (and without editing) the shell or its siblings. Types
// only: nothing here imports a component, so no lane creates an import cycle.
//
// Every prop is an ACCESSOR, not a plain value. Solid components run once, so
// a plain value snapshot would freeze at mount; passing the getter lets each
// lane subscribe to exactly the fields its own JSX reads.
//
// Why the dock takes `players` and `good` rather than pre-chewed numbers: an
// `AuctionParticipant` carries only playerId/role/price/intent -- NOT money and
// NOT units held (see docs/active_plans/decisions/auction_readout_variant.md).
// The dock's money column and units column therefore have to come from the
// players themselves (`player.money`, `player.goods[good]`), which is why the
// live `players` array and the good under auction are part of its contract.

import type {
  AuctionParticipant,
  AuctionPayload,
  AuctionStatus,
  AuctionTrade,
} from "../../engine/game_state";
import type { Player, Resource } from "../../engine/player";

/**
 * Props for the auction arena: the single full-slot SVG that owns the price
 * runway, the store rails, the lane rows, and the avatar tween loop. It reads
 * the whole payload because nearly every field is spatial (prices place
 * avatars, quotes place the rails, stock scales the crates, ticksRemaining
 * drains the timer).
 */
export interface AuctionArenaProps {
  /** Accessor for the current good's auction payload. */
  readonly payload: () => AuctionPayload;
  /** Accessor for the reduced-motion preference; true means snap, never tween. */
  readonly reducedMotion: () => boolean;
}

/**
 * Props for the player dock: the left column of per-lane rows carrying who
 * each player is and what they hold (swatch, species head, role, money, units
 * of the good, units traded).
 */
export interface AuctionDockProps {
  /** Accessor for the live participant standings (role and price per player). */
  readonly participants: () => readonly AuctionParticipant[];
  /** Accessor for the window's trade log; the TRADED counters sum from it. */
  readonly trades: () => readonly AuctionTrade[];
  /** Accessor for the live players, the only source of money and units held. */
  readonly players: () => readonly Player[];
  /** Accessor for the good under auction, which unit column the dock reads. */
  readonly good: () => Resource;
  /**
   * Accessor for the engine's own skipped flag (`AuctionPayload.skipped`),
   * which the ROLE column reads. On a skipped window every participant still
   * carries a buyer/seller role, because the engine assigns roles before it
   * runs the skip check -- so those roles are placeholders with no market
   * behind them, and printing them would be the same lie the arena already
   * suppresses avatars and bid/ask markers to avoid. The dock's money and
   * units columns are unaffected: a player's cash and holdings are true
   * whether or not the good trades.
   */
  readonly skipped: () => boolean;
}

/**
 * Props for the status layer: the pre-auction accounting beat (per-player
 * usage bars from the recorded round ledger, the crate accounting, and the
 * colony SURPLUS/SHORTAGE verdict) that renders over the live arena at tick 0.
 */
export interface AuctionStatusProps {
  /** Accessor for the recorded accounting snapshot (`AuctionPayload.status`). */
  readonly status: () => AuctionStatus;
  /** Accessor for the reduced-motion preference; true means bars snap to size. */
  readonly reducedMotion: () => boolean;
}
