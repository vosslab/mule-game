// Goods-auction player dock: the left column of per-lane rows carrying who
// each player is and what they hold.
//
// This component renders INSIDE the arena's <svg viewBox="0 0 960 600">
// (src/ui/scenes/auction_geometry.ts), not as a standalone DOM overlay. Every
// size below is a plain viewBox-unit number, not a CSS container unit: the
// whole SVG already scales by one uniform factor with the stage (viewBox and
// stage are both exactly 16:10, see auction_geometry.ts's module doc), so a
// number set here scales identically at every supported viewport, matching
// the existing `.town-facade-label` precedent (src/style.css) rather than the
// `cqh`/`cqw` convention the shell's DOM overlays use (those live OUTSIDE the
// SVG's coordinate system and need a different scaling mechanism).
//
// One dock block per lane row, vertically centered on `laneCenterY(slot)` so
// a row's numbers line up with that same slot's avatar in the arena: every
// value stays visually connected to its owner. A player's lane also carries a
// thin left-edge accent bar in that player's identity color
// (`playerColor(slot)`), the strongest available "this whole row is yours"
// cue given the swatch alone is small.
//
// Real-data limitation, recorded here rather than hidden: `AuctionDockProps`
// exposes `participants`, `trades`, `players`, and `good` -- it carries no
// live store stock or buy/sell quote fields (those render on the arena's
// rails, auction_arena.tsx's territory; see the acceptance criteria in
// docs/active_plans/active/auction_native_recompose.md). The store row below
// therefore shows only what is derivable from `trades()` -- a TRADED count
// for trades where the store was either party -- and does not fabricate a
// money or stock figure it was not given.
//
// SELECTOR CONTRACT: `.auction-dock-row[data-player=N]` addresses one player's
// lane row by PLAYER, not by render position, and `data-col="money"|"units"|
// "traded"` on each numeric `<text>` (lane rows, header row, and the store
// row) names which column that value is, since money, units-held, and
// units-traded all share the base `.auction-dock-data-text` class with no
// other distinguishing mark. tests/playwright/auction_scene.spec.mjs reads
// values through this pair (`[data-player][data-col]`) rather than a
// DOM-index selector; renaming either attribute breaks that suite.

import { Index } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import { AUCTION_STORE_ID } from "../../engine/auction";
import type { AuctionParticipant, AuctionRole, AuctionTrade } from "../../engine/game_state";
import type { Player, Resource } from "../../engine/player";
import { playerColor } from "../sprites";
import { speciesSymbolId } from "../sprites/sprites_species";
import { DOCK_REGION, laneCenterY, laneHeight } from "./auction_geometry";
import type { AuctionDockProps } from "./auction_props";

/** Side length of the swatch-and-species-head badge, in viewBox units. */
const BADGE_SIZE = 24;
/** Left inset of the badge from the dock's left edge. */
const BADGE_X = 4;
/** Left-edge accent bar width, marking a lane's whole row with its player color. */
const LANE_ACCENT_WIDTH = 3;
/** Right edge (text-anchor="end") of the $money column. */
const MONEY_RIGHT_X = 98;
/** Right edge of the units-held column. */
const UNITS_RIGHT_X = 124;
/** Right edge of the units-traded column. */
const TRADED_RIGHT_X = 146;
/** Baseline y for the one-time column-header row, near the dock's top edge. */
const HEADER_Y = DOCK_REGION.top + 11;
/** Baseline y for the compact store indicator, below the headers. */
const STORE_ROW_Y = DOCK_REGION.top + 29;
/** Baseline y offset (below a lane's center) for its role-label line. */
const ROLE_TEXT_Y_OFFSET = 20;
/** Baseline y offset (below a lane's center) for its numeric data row. */
const DATA_TEXT_Y_OFFSET = 5;

/**
 * What the role column reads on a SKIPPED window: a dash, not a role. See
 * `dockRoleLabel` for why, and `AuctionDockProps.skipped` for the engine
 * behavior that makes it necessary.
 */
const NO_ROLE_LABEL = "--";

//============================================
/**
 * The short label for a role, matching the declare overlay's own wording
 * (auction_screen.tsx's ROLE_CHOICES) but tightened to fit the dock's role
 * column ("Sit Out" -> "Out").
 *
 * @param role - The participant's declared role.
 * @returns The role's dock label.
 */
function roleLabel(role: AuctionRole): string {
  if (role === "buyer") {
    return "Buy";
  }
  if (role === "seller") {
    return "Sell";
  }
  return "Out";
}

//============================================
/**
 * What a lane's role column says, given the window's own skipped flag.
 *
 * On a skipped window it says nothing about a role, because there is no role to
 * say anything about. The engine assigns every participant a buyer/seller role
 * BEFORE it runs the skip check (createAuctionPayload, src/engine/auction.ts),
 * so the roles on a skipped window are fabricated placeholders with no market
 * behind them -- nobody declared them, and nobody can act on them. The arena
 * already refuses to draw the avatars, bid/ask markers, and timer that derive
 * from those same fabricated values; a "Buy" in this column is the identical
 * claim, one column over, and it is just as false.
 *
 * A dash rather than a blank, for the same reason the bench shows an OUT chip
 * where a benched player's price would be: the player is shown a positive
 * "nothing here" in the place he already looks, instead of being asked to
 * notice an absence.
 *
 * @param skipped - The engine's own `AuctionPayload.skipped` flag.
 * @param role - The participant's role entry, real only when not skipped.
 * @returns The role column's text for this lane.
 */
function dockRoleLabel(skipped: boolean, role: AuctionRole): string {
  if (skipped) {
    return NO_ROLE_LABEL;
  }
  const label = roleLabel(role);
  return label;
}

//============================================
/**
 * Look up one player's live participant entry. Every player has exactly one
 * entry (AuctionParticipant's own doc comment), so a miss is a genuine bug --
 * this throws rather than silently rendering a blank row.
 *
 * @param participants - The window's live participant standings.
 * @param playerId - The player id to find.
 * @returns That player's participant entry.
 */
function findParticipant(
  participants: readonly AuctionParticipant[],
  playerId: number,
): AuctionParticipant {
  const participant = participants.find((entry) => entry.playerId === playerId);
  if (participant === undefined) {
    throw new Error(`no auction participant entry for player ${playerId}`);
  }
  return participant;
}

//============================================
/**
 * Sum the units one side traded this window: every trade where `sideId` was
 * either the buyer or the seller. Used for both a player's TRADED count and
 * the store row's TRADED count (`AUCTION_STORE_ID`).
 *
 * @param trades - The window's trade log.
 * @param sideId - A player id, or `AUCTION_STORE_ID` for the store's side.
 * @returns Total units traded by that side.
 */
function sumTradedUnits(trades: readonly AuctionTrade[], sideId: number): number {
  let total = 0;
  for (const trade of trades) {
    if (trade.buyerId === sideId || trade.sellerId === sideId) {
      total += trade.quantity;
    }
  }
  return total;
}

//============================================
/**
 * The one-time column-header row: short labels over the three numeric
 * columns every lane row (and the store row) shares. Rendered once, not per
 * lane, since the columns themselves carry the per-row meaning.
 *
 * @returns The header row's group element.
 */
function DockHeaderRow(): JSX.Element {
  return (
    <g class="auction-dock-header">
      <text
        class="auction-dock-header-text"
        data-col="money"
        x={MONEY_RIGHT_X}
        y={HEADER_Y}
        text-anchor="end"
      >
        $
      </text>
      <text
        class="auction-dock-header-text"
        data-col="units"
        x={UNITS_RIGHT_X}
        y={HEADER_Y}
        text-anchor="end"
      >
        Qty
      </text>
      <text
        class="auction-dock-header-text"
        data-col="traded"
        x={TRADED_RIGHT_X}
        y={HEADER_Y}
        text-anchor="end"
      >
        Trd
      </text>
    </g>
  );
}

/** Props for the store's compact indicator row. */
interface DockStoreRowProps {
  /** Accessor for the window's trade log. */
  readonly trades: () => readonly AuctionTrade[];
}

//============================================
/**
 * The store's compact indicator row: a gold swatch, a "Store" label, and a
 * TRADED count summed from trades where the store was either party. The
 * money and units columns stay blank rather than showing a fabricated value:
 * `AuctionDockProps` carries no live store stock or quote field (see this
 * file's module doc).
 *
 * @param props - Carries the trades accessor.
 * @returns The store row's group element.
 */
function DockStoreRow(props: DockStoreRowProps): JSX.Element {
  const tradedUnits = (): number => sumTradedUnits(props.trades(), AUCTION_STORE_ID);
  return (
    <g class="auction-dock-store-row">
      <rect
        class="auction-dock-store-swatch"
        x={BADGE_X}
        y={STORE_ROW_Y - 8}
        width={10}
        height={10}
        rx={2}
      />
      <text class="auction-dock-store-label" x={BADGE_X + 14} y={STORE_ROW_Y}>
        Store
      </text>
      <text
        class="auction-dock-data-text"
        data-col="traded"
        x={TRADED_RIGHT_X}
        y={STORE_ROW_Y}
        text-anchor="end"
      >
        {tradedUnits()}
      </text>
    </g>
  );
}

/** Props for one lane's row. */
interface DockLaneRowProps {
  /** Accessor for the player at this lane's slot (Index gives a signal). */
  readonly player: Accessor<Player>;
  /** 0-based lane slot; equals the player's stable id (Player.id's own doc). */
  readonly slot: number;
  /** Accessor for the live participant standings. */
  readonly participants: () => readonly AuctionParticipant[];
  /** Accessor for the window's trade log. */
  readonly trades: () => readonly AuctionTrade[];
  /** Accessor for the good under auction, selecting the units-held column. */
  readonly good: () => Resource;
  /** Accessor for the window's skipped flag; blanks the role column (dockRoleLabel). */
  readonly skipped: () => boolean;
}

//============================================
/**
 * One player's lane row: a swatch-and-species-head badge, a role label, and
 * the three numeric columns (money, units held, units traded), vertically
 * centered on the slot's `laneCenterY` so it lines up with that player's
 * avatar in the arena. The human's money text carries a scoped `aria-live`
 * region (never the AI rows, which would be a firehose for a screen-reader
 * player), replacing the hidden HUD's own money announcements.
 *
 * Every field that can change over time is read through an accessor call
 * inside its own JSX position (`props.player()`, `participant()`,
 * `tradedUnits()`), not cached in a local const: this function runs once per
 * lane slot (Index's per-item callback), so a cached read would freeze at
 * mount instead of tracking future updates.
 *
 * @param props - Carries the lane's player accessor, slot, and the dock's
 *   shared participants/trades/good accessors.
 * @returns The lane row's group element.
 */
function DockLaneRow(props: DockLaneRowProps): JSX.Element {
  const centerY = laneCenterY(props.slot);
  const rowHeight = laneHeight();
  const color = playerColor(props.slot);
  const participant = (): AuctionParticipant => findParticipant(props.participants(), props.slot);
  const tradedUnits = (): number => sumTradedUnits(props.trades(), props.slot);
  const liveMode = (): "polite" | "off" => (props.player().isHuman ? "polite" : "off");
  const playerLabel = (): string => (props.player().isHuman ? "You" : `Player ${props.slot + 1}`);

  return (
    <g class="auction-dock-row" data-player={props.slot}>
      <title>{playerLabel()}</title>
      <rect
        class="auction-dock-lane-accent"
        x={DOCK_REGION.left}
        y={centerY - rowHeight / 2}
        width={LANE_ACCENT_WIDTH}
        height={rowHeight}
        fill={color}
      />
      <rect
        class="auction-dock-badge"
        x={BADGE_X}
        y={centerY - 16}
        width={BADGE_SIZE}
        height={BADGE_SIZE}
        rx={4}
        fill={color}
      />
      <use
        class="auction-dock-badge-icon"
        href={`#${speciesSymbolId(props.player().species, 1)}`}
        x={BADGE_X + 3}
        y={centerY - 13}
        width={18}
        height={18}
      />
      <text
        class="auction-dock-role-text"
        x={BADGE_X + BADGE_SIZE / 2}
        y={centerY + ROLE_TEXT_Y_OFFSET}
        text-anchor="middle"
      >
        {dockRoleLabel(props.skipped(), participant().role)}
      </text>
      <text
        class="auction-dock-money-text"
        data-col="money"
        x={MONEY_RIGHT_X}
        y={centerY + DATA_TEXT_Y_OFFSET}
        text-anchor="end"
        aria-live={liveMode()}
      >
        {`$${props.player().money}`}
      </text>
      <text
        class="auction-dock-data-text"
        data-col="units"
        x={UNITS_RIGHT_X}
        y={centerY + DATA_TEXT_Y_OFFSET}
        text-anchor="end"
      >
        {props.player().goods[props.good()]}
      </text>
      <text
        class="auction-dock-data-text"
        data-col="traded"
        x={TRADED_RIGHT_X}
        y={centerY + DATA_TEXT_Y_OFFSET}
        text-anchor="end"
      >
        {tradedUnits()}
      </text>
    </g>
  );
}

//============================================
/**
 * Render the goods-auction player dock: the panel background, the one-time
 * column headers, the store's compact indicator row, and one lane row per
 * player. Composed into the arena's `<svg>` by `auction_arena.tsx` at
 * `DOCK_REGION`'s bounds.
 *
 * @param props - Carries the participants, trades, players, and good
 *   accessors (`AuctionDockProps`, src/ui/scenes/auction_props.ts).
 * @returns The dock's group element.
 */
export function AuctionDock(props: AuctionDockProps): JSX.Element {
  return (
    <g class="auction-dock">
      <rect
        class="auction-dock-panel"
        x={DOCK_REGION.left}
        y={DOCK_REGION.top}
        width={DOCK_REGION.right - DOCK_REGION.left}
        height={DOCK_REGION.bottom - DOCK_REGION.top}
      />
      <DockHeaderRow />
      <DockStoreRow trades={props.trades} />
      <Index each={props.players()}>
        {(player, slot) => (
          <DockLaneRow
            player={player}
            slot={slot}
            participants={props.participants}
            trades={props.trades}
            good={props.good}
            skipped={props.skipped}
          />
        )}
      </Index>
    </g>
  );
}
