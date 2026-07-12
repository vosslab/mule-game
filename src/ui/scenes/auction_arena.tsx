// The goods-auction arena: the full-stage market floor where position IS price.
//
// COMPOSITION (the whole 16:10 stage, viewBox 960x600 -- auction_geometry.ts
// owns every coordinate below; nothing here hardcodes a region):
//
//   +----------------------------------------------------------------+
//   |  TOP BAND: emblem | GOOD | going price | tick | FAST            |
//   +--------+---+------------------------------------------+---+----+
//   | DOCK   | B |  PENNANT BAND: [BID $52]      [ASK $83]  | S |    |
//   |        | U |  - - - - - - - - -:- - - - - - - -:- - - | E |    |
//   | (dock, | Y |   lane 0  ... buyers walk right -->      | L |    |
//   | drawn  | * |   lane 1  ... <-- sellers walk left      | L |    |
//   | inside | R |   lane 2      : bid          ask :       | * |    |
//   | this   | A |   lane 3      : dashed    dashed :       | R |    |
//   | svg)   | I |                                          | A |    |
//   |        | L |                                          | I |    |
//   |        |[8]|                                          |[8]| L  |
//   +--------+---+------------------------------------------+---+----+
//   |  TIMER BAR (drains with ticksRemaining)                        |
//   +----------------------------------------------------------------+
//
// The market story is carried by GEOMETRY, not by text: price runs left (cheap)
// to right (expensive) across the runway, each player owns a horizontal lane
// row, and the two store rails ARE the band's edges. That last identity is
// exact, not decorative -- the engine's `rankedBids` always seats the store as a
// standing bid at `storeBuyPrice` (the band floor, so the LEFT rail) and
// `rankedAsks` seats it as a standing ask at `storeSellPrice` (the ceiling, so
// the RIGHT rail) whenever it holds stock (src/engine/auction.ts). So a buyer
// walking right until they touch the sell rail has literally crossed the store's
// ask, and the trade fires. Buying from the store IS your bid reaching the rail.
//
// GRAPHIC TREATMENT: the Planet-inspired modern look the town facades already
// use (docs/CHANGELOG.md 2026-07-10) -- flat plates, a light keyline, low-opacity
// worn texture, soft depth bands. Deliberately NOT an NES pixel-art copy: the NES
// screens are this screen's LAYOUT and information-hierarchy reference, not its
// material reference (docs/active_plans/active/auction_native_recompose.md).
//
// MOTION: reactivity owns STATE (rail crates, price pegs, the bid/ask lines);
// the scene-manager rAF owns MOTION (avatar transforms, walk frames). An
// avatar's `data-x` is its live tweened price position and `data-y` its
// fixed lane, both polled by tests/playwright/auction_scene.spec.mjs. Trade
// feedback (flying goods, flash, "UNITS TRADED n" banner) is its own
// imperative layer owned by auction_trade_fx.ts, driven from here: this
// component resolves each trade's buyer/seller arena positions (the only
// thing it alone knows) and hands the rest to that controller.
//
// ---------------------------------------------------------------------------
// WHY THE BID AND ASK LINES ARE NOT JUST TWO DASHED LINES
// ---------------------------------------------------------------------------
// The two lines converge, meet, and can even pass through each other, and the
// drawing breaks down exactly when the market gets interesting. The bounds below
// are measured against the engine, not estimated:
//
//   - One price step is the SAME distance on this runway for every good. The
//     store's sell spread (`STORE_SELL_SPREAD_BY_GOOD`) is 35x the good's
//     `AUCTION_PRICE_STEP_BY_GOOD` in every case (35 and 1 for food, energy, and
//     smithore; 140 and 4 for crystite) and the spread is a constant, not a
//     function of stock, so the band is always 35 steps wide and one step is
//     always `rectWidth(RUNWAY_REGION) / 35` = 20.6 viewBox units. A gap of one
//     step is therefore perfectly legible against a 2-unit stroke. (An earlier
//     version of this comment claimed 1.8 units per step; that figure was
//     measured on the retired vertical track and is off by more than 10x here.)
//   - What is NOT drawable is the CROSS itself. The engine trades when
//     `bid.price >= ask.price` (`selectTrade`, src/engine/auction.ts), and every
//     participant steps in the SAME tick before matching (`auctionTick` maps them
//     all through `stepParticipantPrice`), so the gap `ask - bid` at the instant
//     of a trade is bounded by `(-2 * priceStep, 0]` -- NOT pinned at zero:
//       * Against the STORE it is exactly zero. A player's price is clamped to
//         the band edge and that edge IS the store's quote, so bid and ask land
//         on one x and the lines are exactly coincident (measured: smithore
//         $85/$85, crystite $188/$188).
//       * Between TWO PLAYERS the cross OVERSHOOTS, because both sides moved this
//         tick. The lines can INVERT -- the ask ends up LEFT of the bid (measured:
//         crystite bid $120 vs ask $116, a 4-dollar inversion; smithore $68 vs
//         $67). `resolveTrade` never rewinds a participant's price after a match,
//         so the payload really does carry the overshot pair.
//   - Stroke width cannot rescue either case: it is in viewBox USER UNITS, so a
//     bigger monitor magnifies the gap and the stroke together. No viewport
//     rescues it, forever.
//
// So a coincident or inverted pair is not an edge case to mitigate; it is the
// state of the market at the single most dramatic moment in the auction. The
// treatment therefore CHANGES REPRESENTATION as the gap closes instead of
// fighting the geometry:
//
//   - The two dashed lines always render at their true x. They tell the truth,
//     including the truth that they have converged or crossed over.
//   - The two LABEL PENNANTS are pinned to a MINIMUM SEPARATION around the
//     market midpoint (`PENNANT_MIN_HALF_SEPARATION`). While the market is open
//     they sit exactly on their own line; as it tightens they splay apart, each
//     tethered to its line by a leader, so BID and ASK never merge and the player
//     can always read which side is which and at what price. They ride the
//     PENNANT BAND above the lanes (auction_geometry.ts), not a gutter between
//     them: the market's two live prices are a header over the floor, the floor
//     belongs to the players, and no splay or clamp can ever put a pennant where
//     an avatar stands, because avatars are not in the band. The dashed lines
//     start at the band's leader rail and run down through the lanes to the
//     floor, so plate, tether, and line are one path.
//   - Inside `CROSS_ALERT_STEPS` price steps the arena promotes the pair into an
//     explicit CROSSING MARKER: a glowing band spanning the gap at a guaranteed
//     minimum width (`CROSS_BAND_MIN_WIDTH`), captioned CLOSING and then CROSSED.
//     `bandWidth` measures the gap with `Math.abs`, so an INVERTED pair still
//     spans the right ground, and `gapSteps` normalizes by the good's own
//     `priceStep`, so the step-count threshold means the same thing for crystite
//     as it does for food.
//
// The result is legible at the binding 1024x640 viewport at a one-price-step gap
// AND at a zero-gap cross, and it makes the market's convergence the intentional
// climax of the screen rather than a rendering collision.

import { For, Index, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";

import type { AuctionParticipant, AuctionPayload, AuctionTrade } from "../../engine/game_state";
import type { Player } from "../../engine/player";
import { AuctionDock } from "./auction_dock";
import type { RailTextColumn, Rect } from "./auction_geometry";
import {
  AVATAR_SIZE,
  BUY_RAIL_REGION,
  CAPTION_GUTTER,
  CRATE_GLYPH_SIZE,
  DOCK_REGION,
  LANE_FIELD_REGION,
  BANNER_GUTTER,
  PENNANT_BAND_REGION,
  PENNANT_PLATE_HEIGHT,
  RUNWAY_REGION,
  SELL_RAIL_REGION,
  TIMER_REGION,
  TOP_BAND_REGION,
  VIEW_BOX_HEIGHT,
  VIEW_BOX_WIDTH,
  clampLabelX,
  labelGutterCenterY,
  laneCenterY,
  laneHeight,
  pennantLeaderY,
  pennantPlateCenterY,
  priceToX,
  railCrateY,
  railStockBaselineY,
  railTextBaselineY,
  railTextColumn,
  rectHeight,
  rectWidth,
  separateLabelPair,
  stockToCrateCount,
} from "./auction_geometry";
import type { AuctionArenaProps } from "./auction_props";
import { attachTradeFx } from "./auction_trade_fx";
import type { TradeFxHandle } from "./auction_trade_fx";
import { easeToward } from "./auction_tween";
import { isAuctionFastForward, onSceneFrame } from "./scene_manager";
import {
  buildSpriteDefsMarkup,
  playerColor,
  resourceIconFill,
  resourceIconSymbolId,
} from "../sprites";
import { buildArenaSpriteDefsMarkup } from "../sprites/sprites_arena";
import type { SpeciesName } from "../sprites/sprites_species";
import {
  buildSpeciesSpriteDefsMarkup,
  pickSpeciesFrameId,
  speciesSymbolId,
} from "../sprites/sprites_species";

/** The store's sentinel participant id in a trade (matches AUCTION_STORE_ID). */
const STORE_ID = 4;
/** Avatar easing rate per second; larger converges to the target x faster. */
const TWEEN_RATE = 11;
/** Snap-to-target threshold (viewBox units) below which an avatar has arrived. */
const ARRIVAL_EPSILON = 0.8;
/** Walk-cycle frame-swap cadence in milliseconds while an avatar is moving. */
const WALK_FRAME_MS = 140;

/**
 * Fixed slot -> species map, mirroring the shell's own map until species
 * selection lands. Slots are playerIds 0..3.
 */
const SPECIES_BY_SLOT: readonly SpeciesName[] = ["humanoid", "gollumer", "mechtron", "packer"];

/** Number of labeled price gridlines drawn across the runway, floor to ceiling. */
const PRICE_GRIDLINE_COUNT = 5;

/** Width of a BID/ASK pennant plate, sized to hold a label plus a 4-digit price. */
const PENNANT_WIDTH = 92;

/**
 * Minimum half-separation, in viewBox units, between the market midpoint and
 * each of the BID and ASK label pennants. This is the guarantee that makes a
 * converged market readable: however close the two lines get -- including
 * exactly coincident at a cross -- the pennant CENTERS stay
 * `2 * PENNANT_MIN_HALF_SEPARATION` apart.
 *
 * It is sized against `PENNANT_WIDTH`, not guessed: what the eye reads is the
 * GAP BETWEEN THE PLATES, which is `2 * halfSeparation - PENNANT_WIDTH`. At 70
 * that clear gap is 140 - 92 = 48 viewBox units, about 51 CSS px at the binding
 * 1024x640 viewport. An earlier value of 46 guaranteed the centers were 92 apart
 * while the plates themselves were 78 wide, leaving a 14-unit slit -- the
 * measurement caught it, which is exactly why the separation is measured rather
 * than asserted.
 */
const PENNANT_MIN_HALF_SEPARATION = 70;

/**
 * How near, in PRICE STEPS, the best bid and best ask must come before the
 * arena promotes them into the explicit crossing marker. Two steps is the exact
 * reach of one tick: a buyer and a seller each move one step per tick, so a pair
 * two steps apart can cross on the VERY NEXT tick. The marker therefore lights up
 * on the last tick where a trade is still avoidable, which is the tick worth
 * warning about. It also covers every overshoot: a player-vs-player cross lands
 * strictly above `-2` steps (see the header comment), so no crossed market can
 * skip past this window unmarked.
 */
const CROSS_ALERT_STEPS = 2;

/**
 * Minimum width, in viewBox units, of the crossing band drawn between the bid
 * and ask lines once they are inside `CROSS_ALERT_STEPS`. The true gap really is
 * zero whenever the counterparty is the store (a player's price clamps onto the
 * rail, which IS the store's quote), so without a floor the band would collapse
 * to nothing at exactly the moment it matters most.
 */
const CROSS_BAND_MIN_WIDTH = 14;

/**
 * Half-width budget for an avatar's floating price tag, in viewBox units, used
 * to keep the tag inside the runway. The avatar sprite itself is ALLOWED to
 * overhang a store rail -- a buyer touching the sell rail has literally reached
 * the store's ask, which is the point -- but its price TAG is a label, and a
 * label that slides onto the rail lands on the rail's own rotated quote. Sized
 * for a four-digit figure at the tag's 14-unit font.
 */
const PRICE_TAG_HALF_WIDTH = 18;

/** Width of the benched player's OUT chip plate, in viewBox units. */
const OUT_CHIP_WIDTH = 44;
/** Height of the benched player's OUT chip plate, in viewBox units. */
const OUT_CHIP_HEIGHT = 16;
/**
 * The OUT chip's top edge in avatar-local coordinates (the avatar sprite's own
 * box starts at local 0). Kept within `AVATAR_TAG_HEIGHT` of the sprite's top,
 * so a benched lane occupies no more vertical space than an active one and the
 * label gutters stay valid (auction_geometry.ts's `laneOccupantBand`).
 */
const OUT_CHIP_TOP = -19;
/** Height of the bench plate a sat-out player stands on, in viewBox units. */
const BENCH_HEIGHT = 12;
/** How far the bench plate extends past the avatar sprite on each side. */
const BENCH_OVERHANG = 6;

/** A point in arena viewBox coordinates. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The live market's two best prices, in dollars. `bid` is always present -- the
 * engine seats the store as a standing bid at its buy quote on every tick -- but
 * `ask` is absent when nobody is selling and the store's shelf is empty, in
 * which case no trade can happen and no ask line is drawn.
 */
interface MarketQuotes {
  readonly bid: number;
  readonly ask: number | undefined;
}

/**
 * Props for the arena. Extends the frozen `AuctionArenaProps` contract with the
 * live `players` accessor, which the arena does not read itself but must hand to
 * the player dock it composes: an `AuctionParticipant` carries only
 * role/price/intent, so money and units-held can only come from the players
 * themselves (docs/active_plans/decisions/auction_readout_variant.md). The dock
 * is drawn INSIDE this SVG, at `DOCK_REGION`, per its own contract.
 */
export interface AuctionArenaComponentProps extends AuctionArenaProps {
  /** Accessor for the live players, the dock's only source of money and units. */
  readonly players: () => readonly Player[];
}

//============================================
/**
 * The species a player slot renders until species selection lands.
 *
 * @param slot - Player slot (playerId, 0..3).
 * @returns The slot's fixed species.
 */
function speciesForSlot(slot: number): SpeciesName {
  return SPECIES_BY_SLOT[slot] ?? "humanoid";
}

//============================================
/**
 * The best bid and best ask currently standing in the market, computed the same
 * way the engine's matcher ranks them (src/engine/auction.ts `rankedBids` /
 * `rankedAsks`) so the drawn lines are the real decision boundary rather than a
 * lookalike: the store is always a bid at its buy quote, and is an ask at its
 * sell quote only while it still holds stock.
 *
 * @param payload - The current good's auction payload.
 * @returns The best bid, and the best ask when one exists.
 */
function marketQuotes(payload: AuctionPayload): MarketQuotes {
  let bid = payload.storeBuyPrice;
  let ask: number | undefined = payload.storeStock >= 1 ? payload.storeSellPrice : undefined;
  for (const participant of payload.participants) {
    if (participant.role === "buyer" && participant.price > bid) {
      bid = participant.price;
    }
    if (participant.role === "seller" && (ask === undefined || participant.price < ask)) {
      ask = participant.price;
    }
  }
  return { bid, ask };
}

//============================================
/**
 * The going price shown large in the top band: the price of the most recent
 * trade if this window has traded, otherwise the midpoint of the store's quotes
 * (the market's standing "worth about this much" before anyone has committed).
 *
 * @param payload - The current good's auction payload.
 * @returns The dollar figure to display.
 */
function goingPrice(payload: AuctionPayload): number {
  const lastTrade = payload.trades[payload.trades.length - 1];
  if (lastTrade !== undefined) {
    return lastTrade.price;
  }
  const midpoint = (payload.storeBuyPrice + payload.storeSellPrice) / 2;
  return Math.round(midpoint);
}

//============================================
/**
 * Where an out participant parks: on a BENCH at the runway's cheap edge, in its
 * own lane, with no price peg. It cannot park in the dock (auction_dock.tsx's rows
 * fill that region to x=146) nor in a store rail (a crate stack of `MAX_RAIL_CRATES`
 * glyphs is taller than the spacing between lane centers, so it would always
 * collide with some lane's parked avatar), so it stays on the floor -- which
 * means the "I am not trading" cue has to be carried by the RENDERING, not by
 * the position. planet_mule likewise draws a non-participant off the price track
 * with no price figure (view/AuctionPainter.java:188-215).
 *
 * The x offset includes `BENCH_OVERHANG` so the bench plate -- which is wider
 * than the avatar it seats -- sits flush INSIDE the runway's cheap edge instead
 * of spilling onto the buy rail.
 *
 * @param slot - Player slot (playerId, 0..3).
 * @returns The parking spot center in viewBox units.
 */
function outParkingSpot(slot: number): Point {
  const x = RUNWAY_REGION.left + BENCH_OVERHANG + AVATAR_SIZE / 2;
  const y = laneCenterY(slot);
  return { x, y };
}

//============================================
/**
 * Write an avatar group's transform so its center sits at (`centerX`,
 * `centerY`), and mirror both center coordinates onto `data-x` and `data-y` for
 * browser tests to poll. Price drives `centerX`, so `data-x` is the moving
 * coordinate and `data-y` the fixed lane.
 *
 * @param group - The avatar group element.
 * @param centerX - The avatar's center x in viewBox units.
 * @param centerY - The avatar's center y in viewBox units.
 */
function writeAvatarTransform(group: SVGGElement, centerX: number, centerY: number): void {
  const x = centerX - AVATAR_SIZE / 2;
  const y = centerY - AVATAR_SIZE / 2;
  group.setAttribute("transform", `translate(${x.toFixed(2)}, ${y.toFixed(2)})`);
  group.setAttribute("data-x", centerX.toFixed(1));
  group.setAttribute("data-y", centerY.toFixed(1));
}

//============================================
/**
 * Hold an avatar's floating price tag inside the runway, in avatar-LOCAL
 * coordinates (the tag is a child of the group `writeAvatarTransform` moves, so
 * its local x has to absorb the group's own translation).
 *
 * The sprite may overhang a store rail; the tag may not. At the band floor a
 * buyer's center sits exactly on the runway's left edge, so a tag centered on
 * the sprite spills onto the buy rail and lands on the rail's rotated STORE
 * BUYS quote. Clamping the tag -- not the avatar -- keeps "x is price" exact
 * for the thing that carries the price while stopping the label from leaving
 * the region it belongs to.
 *
 * @param tag - The avatar's price-tag text element.
 * @param centerX - The avatar's live center x in viewBox units.
 */
function writePriceTagX(tag: SVGTextElement, centerX: number): void {
  const minX = RUNWAY_REGION.left + PRICE_TAG_HALF_WIDTH;
  const maxX = RUNWAY_REGION.right - PRICE_TAG_HALF_WIDTH;
  const clampedX = centerX < minX ? minX : centerX > maxX ? maxX : centerX;
  const localX = clampedX - centerX + AVATAR_SIZE / 2;
  tag.setAttribute("x", localX.toFixed(2));
}

//============================================
/**
 * Render the auction arena: the full-stage SVG market floor. Composes the player
 * dock (auction_dock.tsx) into its own coordinate system, tweens the avatars along
 * the price runway, and drives the trade-fx controller (auction_trade_fx.ts) that owns
 * the flash/glyph/banner layer.
 *
 * @param props - The arena contract plus the `players` accessor the dock needs.
 * @returns The arena `<svg>` element.
 */
export function AuctionArena(props: AuctionArenaComponentProps): JSX.Element {
  const priceX = (price: number): number =>
    priceToX(price, props.payload().priceFloor, props.payload().priceCeiling);

  // The market's two live decision boundaries, recomputed whenever the payload
  // ticks. Every bid/ask visual below reads from this one memo-shaped accessor.
  const quotes = (): MarketQuotes => marketQuotes(props.payload());

  // The FAST indicator tracks a plain scene-manager flag rather than reactive
  // state, so it is sampled on the frame loop and mirrored into a signal.
  const [fastForward, setFastForward] = createSignal(isAuctionFastForward());

  // The timer bar needs a reference maximum and the payload does not carry one:
  // the quiet-tick budget is whatever `ticksRemaining` started at. A running
  // maximum is safe HERE, because ticksRemaining only ever counts DOWN, so the
  // maximum is captured on the first frame and never moves again.
  const [ticksFull, setTicksFull] = createSignal(0);

  createEffect(() => {
    const remaining = props.payload().ticksRemaining;
    if (remaining > ticksFull()) {
      setTicksFull(remaining);
    }
  });

  const timerFraction = (): number => {
    const full = ticksFull();
    if (full <= 0) {
      return 1;
    }
    return props.payload().ticksRemaining / full;
  };

  // The crate stack's reference maximum: the stock this window OPENED with,
  // read once here (the shell keys the arena on the good, so a new window is a
  // new component instance and this captures its opening stock).
  //
  // This was a running maximum, and that was a measurable lie. Store stock,
  // unlike ticksRemaining, GROWS when players sell into the store -- so a
  // running maximum kept RAISING the scale mid-window, which means one stack
  // height stood for different quantities at different moments and a stack
  // could hold steady while stock actually fell. On a screen whose whole job is
  // making quantity visible, a quantity scale that redefines itself under the
  // player teaches the inverse of the lesson. Pinned to the opening stock, one
  // crate means one fixed quantity for the entire window. Stock that climbs
  // above the opening level saturates the stack at MAX_RAIL_CRATES, which is
  // why the rail also prints the raw integer (`StoreRail`): the number is
  // ground truth, and the stack is decoration that can no longer lie.
  const openingStock = props.payload().storeStock;

  const crateCount = (): number => stockToCrateCount(props.payload().storeStock, openingStock);

  // An avatar's target: an out participant is benched at the runway's cheap
  // edge; a buyer or seller stands in its lane at its price.
  const avatarTarget = (participant: AuctionParticipant): Point =>
    participant.role === "out"
      ? outParkingSpot(participant.playerId)
      : { x: priceX(participant.price), y: laneCenterY(participant.playerId) };

  // Imperative avatar state, indexed by player slot. The price pegs stay
  // reactive (they snap to the engine's price); only the avatars tween.
  const avatarGroups: (SVGGElement | undefined)[] = [];
  const avatarSprites: (SVGUseElement | undefined)[] = [];
  const avatarTags: (SVGTextElement | undefined)[] = [];
  const avatarX: number[] = [];

  //------------------------------------------
  // Register (or re-register) a slot's price-tag element. `<Show>` rebuilds this
  // text node whenever the slot flips between an active role and OUT, so this
  // fires again with the fresh node rather than once at mount.
  const registerPriceTag = (slot: number, tag: SVGTextElement): void => {
    avatarTags[slot] = tag;
  };

  // Trade-animation layer: the SVG ref is set by the `<g>` below; the fx
  // controller itself is attached in onMount once that ref exists, and
  // driven from here (spawnTrade on each new trade, advance every frame,
  // teardown on unmount) by auction_trade_fx.ts.
  let tradeLayer: SVGGElement | undefined;
  let tradeFx: TradeFxHandle | undefined;
  let lastTradeCount = props.payload().trades.length;

  // Frame-loop bookkeeping for the shared walk-cycle clock.
  let lastNow = 0;
  let walkClockMs = 0;
  let walkFrame: 1 | 2 = 1;

  //------------------------------------------
  // Register an avatar's refs and snap it to its current price-derived x, so it
  // never flashes at the SVG origin before the first frame runs.
  const registerAvatar = (slot: number, group: SVGGElement, sprite: SVGUseElement): void => {
    avatarGroups[slot] = group;
    avatarSprites[slot] = sprite;
    const participant = props.payload().participants[slot];
    if (participant === undefined) {
      return;
    }
    const target = avatarTarget(participant);
    avatarX[slot] = target.x;
    writeAvatarTransform(group, target.x, target.y);
  };

  //------------------------------------------
  // The store's edge for a store-side trade: the store buys at the floor (the
  // left rail) and sells at the ceiling (the right rail).
  const storePosition = (side: "buy" | "sell"): Point => {
    const payload = props.payload();
    const price = side === "sell" ? payload.storeSellPrice : payload.storeBuyPrice;
    const y = LANE_FIELD_REGION.top + rectHeight(LANE_FIELD_REGION) / 2;
    return { x: priceX(price), y };
  };

  //------------------------------------------
  // A trade participant's current position: a player's tweened avatar position,
  // or the store's rail for the store sentinel id.
  const actorPosition = (id: number, side: "buy" | "sell"): Point => {
    if (id === STORE_ID) {
      return storePosition(side);
    }
    const participant = props.payload().participants[id];
    const fallbackX = participant === undefined ? storePosition(side).x : priceX(participant.price);
    return { x: avatarX[id] ?? fallbackX, y: laneCenterY(id) };
  };

  //------------------------------------------
  // Spawn the animation for one executed trade: resolve the trading pair's
  // current arena positions (only this component knows avatar and
  // store-rail coordinates) and hand the rest to auction_trade_fx.ts.
  const spawnTradeAnimation = (trade: AuctionTrade): void => {
    if (tradeFx === undefined) {
      return;
    }
    tradeFx.spawnTrade({
      good: props.payload().good,
      buyerPos: actorPosition(trade.buyerId, "buy"),
      sellerPos: actorPosition(trade.sellerId, "sell"),
      reducedMotion: props.reducedMotion(),
      runUnits: props.payload().runUnits,
    });
  };

  //------------------------------------------
  // One animation frame: ease each avatar toward its price-derived x (or snap
  // under reduced motion), swap walk frames while moving, advance goods, and
  // sample the scene manager's fast-forward flag.
  const onFrameTick = (now: number): void => {
    const deltaMs = lastNow === 0 ? 0 : now - lastNow;
    lastNow = now;
    const deltaSeconds = deltaMs / 1000;
    const payload = props.payload();
    const reduced = props.reducedMotion();

    const fast = isAuctionFastForward();
    if (fast !== fastForward()) {
      setFastForward(fast);
    }

    // Advance the shared walk-cycle clock, toggling the stride frame.
    walkClockMs += deltaMs;
    if (walkClockMs >= WALK_FRAME_MS) {
      walkClockMs = 0;
      walkFrame = walkFrame === 1 ? 2 : 1;
    }

    for (const participant of payload.participants) {
      const slot = participant.playerId;
      const target = avatarTarget(participant);
      const group = avatarGroups[slot];
      const sprite = avatarSprites[slot];

      // A benched participant is a static spectator: snap to its parking spot
      // and stand still (frame 1, no walk cycle).
      if (participant.role === "out") {
        avatarX[slot] = target.x;
        if (group !== undefined) {
          writeAvatarTransform(group, target.x, target.y);
        }
        if (sprite !== undefined) {
          const frameId = `#${pickSpeciesFrameId(speciesForSlot(slot), 1, reduced)}`;
          if (sprite.getAttribute("href") !== frameId) {
            sprite.setAttribute("href", frameId);
          }
        }
        continue;
      }

      // A buyer or seller keeps its lane y and eases horizontally toward its
      // price. Reduced motion snaps instead of easing.
      const current = avatarX[slot] ?? target.x;
      const next = reduced
        ? target.x
        : easeToward(current, target.x, deltaSeconds, TWEEN_RATE, ARRIVAL_EPSILON);
      avatarX[slot] = next;
      const moving = !reduced && next !== target.x;

      if (group !== undefined) {
        writeAvatarTransform(group, next, target.y);
      }
      // The tag rides the group, so its clamp has to be re-applied every frame
      // against the avatar's live x, not once at mount.
      const tag = avatarTags[slot];
      if (tag !== undefined) {
        writePriceTagX(tag, next);
      }
      if (sprite !== undefined) {
        const desiredFrame: 1 | 2 = moving ? walkFrame : 1;
        const frameId = `#${pickSpeciesFrameId(speciesForSlot(slot), desiredFrame, reduced)}`;
        if (sprite.getAttribute("href") !== frameId) {
          sprite.setAttribute("href", frameId);
        }
      }
    }

    tradeFx?.advance(deltaMs);
  };

  onMount(() => {
    if (tradeLayer !== undefined) {
      tradeFx = attachTradeFx(tradeLayer);
    }
    const unsubscribe = onSceneFrame(onFrameTick);
    onCleanup(() => {
      unsubscribe();
      tradeFx?.teardown();
    });
  });

  // Trades are additive within a window; when the log grows, animate each
  // newly-appended trade.
  createEffect(() => {
    const trades = props.payload().trades;
    if (trades.length > lastTradeCount) {
      for (let index = lastTradeCount; index < trades.length; index += 1) {
        const trade = trades[index];
        if (trade !== undefined) {
          spawnTradeAnimation(trade);
        }
      }
      lastTradeCount = trades.length;
    }
  });

  return (
    <svg
      class="auction-arena-svg"
      viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
      role="img"
      aria-label={`${props.payload().good} auction floor: price runs cheap on the left to expensive on the right`}
      data-reduced-motion={props.reducedMotion() ? "true" : "false"}
    >
      <g
        innerHTML={
          buildSpriteDefsMarkup() + buildSpeciesSpriteDefsMarkup() + buildArenaSpriteDefsMarkup()
        }
      />
      <rect
        class="auction-arena-backdrop"
        x={0}
        y={0}
        width={VIEW_BOX_WIDTH}
        height={VIEW_BOX_HEIGHT}
      />
      <TopBand payload={props.payload} fastForward={fastForward} />
      <RunwayFloor payload={props.payload} priceX={priceX} />
      <StoreRail side="buy" payload={props.payload} crateCount={crateCount} />
      <StoreRail side="sell" payload={props.payload} crateCount={crateCount} />
      <AuctionDock
        participants={() => props.payload().participants}
        trades={() => props.payload().trades}
        players={props.players}
        good={() => props.payload().good}
        skipped={() => props.payload().skipped}
      />
      {/* A skipped window (`payload.skipped`, the engine's own flag -- never
          inferred from prices or stock) has no market: `tradePossible` was
          false, but the engine still auto-assigns every participant a
          buyer/seller role and a band-edge price regardless, because role
          assignment runs before the skip check (createAuctionPayload,
          src/engine/auction.ts). Rendering the bid/ask lines, their pennants,
          and the avatars at those prices would show a live auction for a good
          the engine has already ruled untradeable -- the exact defect the
          finished overlay's "NO <GOOD> TO TRADE THIS ROUND." message exists to
          prevent. Both are suppressed together so the runway reads as an
          intentionally empty floor, not a paused market: only the store
          rails' real stock and quotes survive, per this file's header. */}
      <Show when={!props.payload().skipped}>
        <PriceMarkers payload={props.payload} priceX={priceX} quotes={quotes} />
        {/* `<For>` keys by object identity, and the ENGINE rebuilds the auction
            payload immutably every tick (`auctionTick` maps a fresh participant
            array of fresh objects), so this looks like it should unmount and
            remount every avatar per tick -- which would defeat the tween, because
            each remount runs `registerAvatar` and snaps `avatarX` onto the new
            target. It does not, and the reason is the seam in between: the store
            applies each snapshot with `setState(reconcile(next))` (src/ui/game_store.ts),
            and `reconcile` diffs the snapshot INTO the existing store rather than
            swapping it in. The participants array carries no `id` field, so Solid's
            keyless path matches the four entries POSITIONALLY and writes only the
            properties that changed, leaving the store proxies these rows are keyed
            on intact. Verified in a browser at frame granularity: the avatar `<g>`
            nodes are never replaced, and `data-x` ramps across ~15 distinct values
            within a single 250ms tick instead of stepping straight to the target.
            The tween depends on that identity holding: if the store ever swapped
            participant identities per tick, these rows would remount and every
            avatar would teleport. */}
        <For each={props.payload().participants}>
          {(participant) => (
            <Avatar
              slot={participant.playerId}
              participant={participant}
              species={speciesForSlot(participant.playerId)}
              register={registerAvatar}
              registerPriceTag={registerPriceTag}
            />
          )}
        </For>
      </Show>
      <g
        class="auction-trade-layer"
        data-flash-count="0"
        ref={(el) => {
          tradeLayer = el;
        }}
      />
      {/* The timer bar drains real quiet-tick budget; a skipped window opens
          with `ticksRemaining: 0` and no budget was ever spent counting it
          down, so a draining bar here would read as a live clock rather than
          the truth -- there is no clock, because there is no window. */}
      <Show when={!props.payload().skipped}>
        <TimerBar fraction={timerFraction} />
      </Show>
    </svg>
  );
}

//============================================
/** Side margin of the top band's outermost ink, in viewBox units. */
const TOP_BAND_MARGIN = 16;

/** Radius of the good's emblem badge, in viewBox units. */
const EMBLEM_RADIUS = 24;

/** Rendered size of the good's icon glyph inside its badge, in viewBox units. */
const EMBLEM_GLYPH_SIZE = 28;

/** Width of the FAST indicator's plate, in viewBox units. */
const FAST_PLATE_WIDTH = 70;

//============================================
/**
 * The top band: the good's emblem and title on the left, the big going price at
 * the center (the number the whole floor is arguing about), the tick clock on
 * the right, and the FAST indicator that appears while the sit-out fast-forward
 * is running the window at speed.
 *
 * THE RIGHT-HAND EMBLEM IS GONE, and its absence is the point. The band used to
 * carry the good's icon TWICE, once beside the good's name (where it identifies
 * what is being traded, which is the emblem's whole job) and once beside the
 * tick readout, where it was the same glyph repeated for symmetry. A duplicated
 * MEANINGFUL icon is worse than a meaningless shape: a reader who has learned
 * that the badge names the good goes looking for what the second one names, and
 * finds nothing. Nothing replaces it. The right side is now carried by the tick
 * readout's own type weight, and the two ends of the band balance on the ink they
 * actually need -- the good on the left, the clock on the right, the price they
 * are arguing about biggest, in the middle.
 *
 * @param props - Carries the payload accessor and the fast-forward flag.
 * @returns The top band group.
 */
function TopBand(props: {
  readonly payload: () => AuctionPayload;
  readonly fastForward: () => boolean;
}): JSX.Element {
  const bandMidY = TOP_BAND_REGION.top + rectHeight(TOP_BAND_REGION) / 2;
  const centerX = VIEW_BOX_WIDTH / 2;

  // The left emblem's outer edge and the right-hand ink's outer edge, one margin
  // in from each side, so the band's two ends are hung on the same rule.
  const emblemCenterX = TOP_BAND_REGION.left + TOP_BAND_MARGIN + EMBLEM_RADIUS;
  const rightEdge = TOP_BAND_REGION.right - TOP_BAND_MARGIN;
  const titleX = emblemCenterX + EMBLEM_RADIUS + 14;

  return (
    <g class="auction-top-band">
      <rect
        class="auction-top-band-plate"
        x={TOP_BAND_REGION.left}
        y={TOP_BAND_REGION.top}
        width={rectWidth(TOP_BAND_REGION)}
        height={rectHeight(TOP_BAND_REGION)}
      />
      {/* The good's emblem, badged like the town's facade emblems: the one place
          on the stage that says WHAT is on the block. The resource symbols carry
          no fill of their own (src/ui/sprites.ts), so every `<use>` of one must
          supply the good's palette color or the glyph renders as a black
          silhouette. */}
      <circle class="auction-emblem-badge" cx={emblemCenterX} cy={bandMidY} r={EMBLEM_RADIUS} />
      <use
        href={`#${resourceIconSymbolId(props.payload().good)}`}
        fill={resourceIconFill(props.payload().good)}
        x={emblemCenterX - EMBLEM_GLYPH_SIZE / 2}
        y={bandMidY - EMBLEM_GLYPH_SIZE / 2}
        width={EMBLEM_GLYPH_SIZE}
        height={EMBLEM_GLYPH_SIZE}
      />
      <text class="auction-good-title" x={titleX} y={bandMidY - 8}>
        {props.payload().good.toUpperCase()}
      </text>
      <text class="auction-good-subtitle" x={titleX} y={bandMidY + 16}>
        AUCTION
      </text>
      {/* The going price: last trade if this window has traded, else the quote
          midpoint. The single biggest number on the screen, on purpose. */}
      <text class="auction-going-price" x={centerX} y={bandMidY + 6} text-anchor="middle">
        {`$${goingPrice(props.payload())}`}
      </text>
      <text class="auction-going-price-caption" x={centerX} y={bandMidY + 28} text-anchor="middle">
        {props.payload().trades.length > 0 ? "LAST TRADE" : "GOING PRICE"}
      </text>
      <text class="auction-tick-readout" x={rightEdge} y={bandMidY - 8} text-anchor="end">
        {`TICK ${props.payload().tick}`}
      </text>
      <Show
        when={props.fastForward()}
        fallback={
          <text class="auction-tick-caption" x={rightEdge} y={bandMidY + 16} text-anchor="end">
            {`${props.payload().ticksRemaining} LEFT`}
          </text>
        }
      >
        <g class="auction-fast-indicator" data-fast="true">
          <rect
            class="auction-fast-plate"
            x={rightEdge - FAST_PLATE_WIDTH}
            y={bandMidY + 2}
            width={FAST_PLATE_WIDTH}
            height={20}
            rx={4}
          />
          <text class="auction-fast-text" x={rightEdge - FAST_PLATE_WIDTH / 2} y={bandMidY + 16}>
            FAST
          </text>
        </g>
      </Show>
    </g>
  );
}

//============================================
/**
 * The price runway: the dominant region. Draws the floor plate, the market's
 * pennant band across its head, the four lane rows (one per player, alternating
 * so the eye can track a row across the full width), and the labeled price
 * gridlines that turn horizontal position into a readable dollar figure.
 *
 * The band's plate and its keyline are FLOOR FURNITURE, drawn here rather than
 * with the pennants themselves, for the same reason the store rails are: they
 * are part of the room, present whether or not a market is running in it. A
 * skipped window suppresses the pennants and the price lines but still shows the
 * rails, the ruler, and this header -- an empty floor, not a paused one.
 *
 * The gridlines stop at the lane field's top edge, so the static ruler stays out
 * of the band. Only the two LIVE price lines pierce it, which is exactly the
 * distinction the band exists to draw.
 *
 * @param props - Carries the payload accessor and the price-to-x mapper.
 * @returns The runway group.
 */
function RunwayFloor(props: {
  readonly payload: () => AuctionPayload;
  readonly priceX: (price: number) => number;
}): JSX.Element {
  const rowHeight = laneHeight();

  // Evenly spaced prices from the band floor to the band ceiling, used for the
  // gridlines. The endpoints land exactly on the two store rails, which is the
  // point: the rails ARE the band's edges.
  const gridPrices = (): number[] => {
    const payload = props.payload();
    const span = payload.priceCeiling - payload.priceFloor;
    const prices: number[] = [];
    for (let index = 0; index < PRICE_GRIDLINE_COUNT; index += 1) {
      const fraction = index / (PRICE_GRIDLINE_COUNT - 1);
      prices.push(Math.round(payload.priceFloor + span * fraction));
    }
    return prices;
  };

  return (
    <g class="auction-runway">
      <rect
        class="auction-runway-plate"
        x={RUNWAY_REGION.left}
        y={RUNWAY_REGION.top}
        width={rectWidth(RUNWAY_REGION)}
        height={rectHeight(RUNWAY_REGION)}
      />
      <rect
        class="auction-pennant-band-plate"
        x={PENNANT_BAND_REGION.left}
        y={PENNANT_BAND_REGION.top}
        width={rectWidth(PENNANT_BAND_REGION)}
        height={rectHeight(PENNANT_BAND_REGION)}
      />
      <line
        class="auction-pennant-band-edge"
        x1={PENNANT_BAND_REGION.left}
        y1={PENNANT_BAND_REGION.bottom}
        x2={PENNANT_BAND_REGION.right}
        y2={PENNANT_BAND_REGION.bottom}
      />
      <Index each={[0, 1, 2, 3]}>
        {(_slot, index) => (
          <g class="auction-lane-row" data-lane={index}>
            <Show when={index % 2 === 1}>
              <rect
                class="auction-lane-stripe"
                x={LANE_FIELD_REGION.left}
                y={LANE_FIELD_REGION.top + index * rowHeight}
                width={rectWidth(LANE_FIELD_REGION)}
                height={rowHeight}
              />
            </Show>
            <line
              class="auction-lane-separator"
              x1={LANE_FIELD_REGION.left}
              y1={LANE_FIELD_REGION.top + index * rowHeight}
              x2={LANE_FIELD_REGION.right}
              y2={LANE_FIELD_REGION.top + index * rowHeight}
            />
          </g>
        )}
      </Index>
      {/* Price gridlines: the runway's own ruler. Without them "position is
          price" is a claim; with them it is readable. */}
      <For each={gridPrices()}>
        {(price, index) => (
          <g class="auction-price-gridline">
            <line
              x1={props.priceX(price)}
              y1={LANE_FIELD_REGION.top}
              x2={props.priceX(price)}
              y2={LANE_FIELD_REGION.bottom}
            />
            <text
              class="auction-price-gridline-label"
              x={clampLabelX(props.priceX(price) - 14, 28, LANE_FIELD_REGION)}
              y={LANE_FIELD_REGION.bottom - 6}
            >
              {`$${price}`}
            </text>
            {/* The wall labels sit in a label GUTTER, not at the runway's top
                edge. At the top edge they were inside lane 0's head-tag band,
                so a lane-0 buyer -- which every buyer is at tick 0, since
                buyers START at the cheap wall -- printed its price straight
                through CHEAP. They share BANNER_GUTTER with the trade banner,
                which is safe by construction and asserted in the geometry test:
                the banner is centered on the runway and these are pinned to its
                two extreme edges, so the three can never share an x. */}
            <Show when={index() === 0}>
              <text
                class="auction-runway-hint"
                x={RUNWAY_REGION.left + 10}
                y={labelGutterCenterY(BANNER_GUTTER) + 4}
              >
                CHEAP
              </text>
            </Show>
            <Show when={index() === PRICE_GRIDLINE_COUNT - 1}>
              <text
                class="auction-runway-hint"
                x={RUNWAY_REGION.right - 10}
                y={labelGutterCenterY(BANNER_GUTTER) + 4}
                text-anchor="end"
              >
                EXPENSIVE
              </text>
            </Show>
          </g>
        )}
      </For>
    </g>
  );
}

//============================================
/**
 * One store rail: the wall that bounds the runway at a band edge. The left (buy)
 * rail is where the store pays you its buy quote; the right (sell) rail is where
 * it charges you its sell quote. Both carry the SAME crate stack, because there
 * is one store warehouse: the stack drains as the store sells units to players
 * and refills as players sell units into it, so the supply side of the market is
 * visible as a physical quantity rather than a number.
 *
 * @param props - Carries the side, the payload accessor, and the crate count.
 * @returns The rail group.
 */
function StoreRail(props: {
  readonly side: "buy" | "sell";
  readonly payload: () => AuctionPayload;
  readonly crateCount: () => number;
}): JSX.Element {
  const region = (): Rect => (props.side === "buy" ? BUY_RAIL_REGION : SELL_RAIL_REGION);
  const quote = (): number =>
    props.side === "buy" ? props.payload().storeBuyPrice : props.payload().storeSellPrice;
  const centerX = (): number => region().left + rectWidth(region()) / 2;

  // The two rotated texts' columns, mirrored across the two rails by
  // auction_geometry.ts (see the JSX comment below and that module's rail-text
  // section). Nothing about their placement is decided in this component.
  const quoteColumn = (): RailTextColumn => railTextColumn(props.side, "quote");
  const labelColumn = (): RailTextColumn => railTextColumn(props.side, "label");

  // Crates stack up from the rail's foot, so a draining stock visibly sinks
  // toward the number that counts them. `stockToCrateCount` has already clamped
  // the count to MAX_RAIL_CRATES, so building exactly that many crates cannot
  // overflow the rail.
  const crateIndices = (): number[] =>
    Array.from({ length: props.crateCount() }, (_unused, index) => index);

  return (
    <g class="auction-store-rail" data-side={props.side}>
      <rect
        class="auction-store-rail-plate"
        x={region().left}
        y={region().top}
        width={rectWidth(region())}
        height={rectHeight(region())}
      />
      {/* Worn-surface texture: the same low-opacity seam language the town
          facades use, so the rail reads as a built wall and not a flat swatch. */}
      <g class="auction-store-rail-texture">
        <Index each={[0, 1, 2, 3, 4, 5]}>
          {(_seam, index) => (
            <line
              x1={region().left}
              y1={region().top + 40 + index * 68}
              x2={region().right}
              y2={region().top + 40 + index * 68}
            />
          )}
        </Index>
      </g>
      {/* The store's stock, as crates: the supply side of the market rendered as
          a physical quantity that drains as the store sells and refills as
          players sell into it.

          The crates carry the good's own palette fill for the same reason the
          town's ore/food/crystite glyphs do: the resource symbols in
          src/ui/sprites.ts define a SHAPE and no fill, so an unfilled `<use>`
          paints them black. On this rail that rendered them at 1.42:1 against
          the plate -- featureless black blobs where the screen's only quantity
          display should be. */}
      <For each={crateIndices()}>
        {(index) => (
          <use
            class="auction-rail-crate"
            href={`#${resourceIconSymbolId(props.payload().good)}`}
            fill={resourceIconFill(props.payload().good)}
            x={centerX() - CRATE_GLYPH_SIZE / 2}
            y={railCrateY(index)}
            width={CRATE_GLYPH_SIZE}
            height={CRATE_GLYPH_SIZE}
          />
        )}
      </For>
      {/* The stock as a NUMBER, at the FOOT OF ITS OWN STACK. The crate stack is
          a scaled picture and a scaled picture can only ever be approximate; this
          integer is the ground truth. They are two halves of one statement --
          "this many" -- and they only read that way if they are drawn as one
          thing. The number used to float in a label gutter at roughly lane-2
          height, some 200 units above the crates it was counting, which is a
          number and a picture, not a count.

          Both now hang off one anchor: `railFootBand`, the strip below the last
          lane's occupant band. The number sits in that strip and the crates stack
          up from just above it (auction_geometry.ts). The strip is not decoration:
          a rail is NOT out of an avatar's reach -- an avatar at a band-edge price
          presses its sprite against the wall it has just crossed, and that
          overhang is the point (see this file's header) -- so the crates above the
          strip really can be sat on, at no cost, because they are the picture. The
          fact goes where no avatar can reach it, and stays on the rail plate it
          was contrast-measured against (13.5:1) instead of sliding onto a crate. */}
      <text
        class="auction-store-rail-stock"
        data-stock={props.payload().storeStock}
        x={centerX()}
        y={railStockBaselineY()}
        text-anchor="middle"
      >
        {props.payload().storeStock}
      </text>
      {/* The quote and its caption, both rotated up the rail, in two side-by-side
          columns across its width. Which column each one gets is NOT chosen here:
          `railTextColumn` walks outward from the runway edge and hands back the
          baseline and the font size, so the two rails come out mirrored -- static
          caption innermost where an overhanging sprite can sit on it harmlessly,
          live quote outboard where it cannot be touched. This rail used to place
          both texts at hand-tuned offsets from its own center, which put the SELL
          rail's live quote innermost and got it measured 96.4% covered by an
          avatar. See auction_geometry.ts's rail-text section for the full story.
          Both run upward from `railTextBaselineY`, which clears the top of a FULL
          crate stack, so neither can collide with the crates at any stock level.
          That y was a literal offset from the rail's foot until the stack moved
          under it; deriving it is what keeps the two facts in step. */}
      <text
        class="auction-store-rail-quote"
        font-size={`${quoteColumn().fontSize}`}
        transform={`translate(${quoteColumn().baselineX}, ${railTextBaselineY()}) rotate(-90)`}
        text-anchor="start"
      >
        {`$${quote()}`}
      </text>
      <text
        class="auction-store-rail-label"
        font-size={`${labelColumn().fontSize}`}
        transform={`translate(${labelColumn().baselineX}, ${railTextBaselineY()}) rotate(-90)`}
        text-anchor="start"
      >
        {props.side === "buy" ? "STORE BUYS" : "STORE SELLS"}
      </text>
    </g>
  );
}

//============================================
/**
 * The best-bid and best-ask lines, their label pennants, and the crossing
 * marker. This is the component that solves the merge described at the top of
 * this file: the lines render at their true x (they may coincide), while the
 * pennants are held apart by `PENNANT_MIN_HALF_SEPARATION` around the midpoint
 * and tethered back to their lines by leaders, so BID and ASK stay separately
 * readable at any gap -- including zero.
 *
 * @param props - Carries the payload accessor, the price mapper, and the quotes.
 * @returns The price-marker group.
 */
function PriceMarkers(props: {
  readonly payload: () => AuctionPayload;
  readonly priceX: (price: number) => number;
  readonly quotes: () => MarketQuotes;
}): JSX.Element {
  const bidX = (): number => props.priceX(props.quotes().bid);

  // The ask side is carried as an OBJECT, not a bare number, so `<Show>` gates on
  // its presence rather than on its truthiness: a legitimate ask of $0 is falsy
  // and would otherwise erase the ask line entirely.
  const askMarker = (): { readonly price: number; readonly x: number } | undefined => {
    const ask = props.quotes().ask;
    if (ask === undefined) {
      return undefined;
    }
    return { price: ask, x: props.priceX(ask) };
  };

  // The gap between the two best prices, in PRICE STEPS -- the unit the player
  // actually moves in. Undefined when nobody is selling (no ask exists).
  const gapSteps = (): number | undefined => {
    const marker = askMarker();
    if (marker === undefined) {
      return undefined;
    }
    const step = props.payload().priceStep;
    const gap = marker.price - props.quotes().bid;
    if (step <= 0) {
      return gap;
    }
    return gap / step;
  };

  const crossing = (): boolean => {
    const steps = gapSteps();
    return steps !== undefined && steps <= CROSS_ALERT_STEPS;
  };

  const crossed = (): boolean => {
    const steps = gapSteps();
    return steps !== undefined && steps <= 0;
  };

  // The pennant anchors: on their own lines while the market is open, splayed to
  // the minimum separation as it closes. This is the guarantee -- these two
  // never merge, whatever the lines underneath them do.
  //
  // They are placed as a PAIR, and that is the whole point. Each pennant used to
  // splay around the midpoint and then clamp itself into the runway
  // INDEPENDENTLY, which quietly cancelled the guarantee at the one moment it
  // exists for: when the market clears against the store, bid and ask both land
  // on a band EDGE, both pennants clamp to that same edge on their own, and the
  // measured result was the BID plate 74% buried under the ASK plate, reading
  // "BI" with its price gone. `separateLabelPair` slides the two as one unit, so
  // the separation survives the clamp (auction_geometry.ts, and the edge cases
  // are pinned in tests/test_auction_geometry.mjs).
  const pennantCenters = (): { readonly low: number; readonly high: number } => {
    const marker = askMarker();
    if (marker === undefined) {
      // Nobody is selling: the lone bid pennant just sits on its own line.
      const solo = clampLabelX(bidX() - PENNANT_WIDTH / 2, PENNANT_WIDTH, PENNANT_BAND_REGION);
      const center = solo + PENNANT_WIDTH / 2;
      return { low: center, high: center };
    }
    return separateLabelPair(
      bidX(),
      marker.x,
      PENNANT_WIDTH,
      2 * PENNANT_MIN_HALF_SEPARATION,
      PENNANT_BAND_REGION,
    );
  };

  const bidPennantX = (): number => pennantCenters().low;
  const askPennantX = (): number => pennantCenters().high;

  // The pennants ride the PENNANT BAND, above every lane, and the leader rail is
  // the band's own floor. They used to sit in a label gutter BETWEEN two lane
  // rows: safe, but only because a derivation said so, and it put the market's
  // two prices inside the players' space. Now they cannot collide with an avatar
  // for a structural reason instead of an arithmetic one -- avatars live in the
  // lane field, and the band is not in it (auction_geometry.ts).
  const plateY = pennantPlateCenterY();
  const leaderY = pennantLeaderY();
  const plateBottomY = plateY + PENNANT_PLATE_HEIGHT / 2;

  // The crossing band spans the true gap, floored at CROSS_BAND_MIN_WIDTH so it
  // stays visible when the gap is zero -- which is exactly when a trade fires.
  const bandWidth = (): number => {
    const marker = askMarker();
    if (marker === undefined) {
      return CROSS_BAND_MIN_WIDTH;
    }
    const gap = Math.abs(marker.x - bidX());
    return Math.max(gap, CROSS_BAND_MIN_WIDTH);
  };

  const bandLeft = (): number => {
    const marker = askMarker();
    if (marker === undefined) {
      return bidX();
    }
    const center = (bidX() + marker.x) / 2;
    return center - bandWidth() / 2;
  };

  return (
    <g class="auction-price-markers">
      <Show when={crossing()}>
        <rect
          class="auction-cross-band"
          data-crossed={crossed() ? "true" : "false"}
          x={bandLeft()}
          y={RUNWAY_REGION.top}
          width={bandWidth()}
          height={rectHeight(RUNWAY_REGION)}
        />
      </Show>

      {/* The two lines, at their TRUE x. They are allowed to converge and even
          coincide; the pennants above carry the legibility. Each STARTS at the
          leader rail inside the band -- not at the runway's top edge -- so it is
          visibly the continuation of its own pennant's tether rather than a
          separate mark that happens to be nearby, and it runs down from there
          through every lane to the floor. */}
      <line
        class="auction-bid-line"
        data-marker="bid"
        x1={bidX()}
        y1={leaderY}
        x2={bidX()}
        y2={LANE_FIELD_REGION.bottom}
      />
      <Show when={askMarker()}>
        {(marker) => (
          <line
            class="auction-ask-line"
            data-marker="ask"
            x1={marker().x}
            y1={leaderY}
            x2={marker().x}
            y2={LANE_FIELD_REGION.bottom}
          />
        )}
      </Show>

      {/* Leaders: once a pennant has been pushed off its own line, this tether
          keeps the association honest rather than silently misplacing the price
          it names. It drops out of the plate's underside, turns along the band's
          leader rail, and hands off to the dashed line at exactly the price x --
          plate, tether, and line are one continuous path, entirely inside the
          band until the line leaves it. When the market is open and a pennant
          already sits on its own line, the elbow degenerates to a short vertical
          stub and the path reads as one straight drop. */}
      <polyline
        class="auction-pennant-leader"
        points={`${bidPennantX()},${plateBottomY} ${bidPennantX()},${leaderY} ${bidX()},${leaderY}`}
      />
      <Show when={askMarker()}>
        {(marker) => (
          <polyline
            class="auction-pennant-leader"
            points={
              `${askPennantX()},${plateBottomY} ${askPennantX()},${leaderY} ` +
              `${marker().x},${leaderY}`
            }
          />
        )}
      </Show>

      <PricePennant
        kind="bid"
        x={bidPennantX()}
        y={plateY}
        label="BID"
        price={props.quotes().bid}
        alert={crossing()}
      />
      <Show when={askMarker()}>
        {(marker) => (
          <PricePennant
            kind="ask"
            x={askPennantX()}
            y={plateY}
            label="ASK"
            price={marker().price}
            alert={crossing()}
          />
        )}
      </Show>

      {/* The crossing caption: the market's headline at the moment it matters.
          CLOSING while the two sides are within CROSS_ALERT_STEPS, CROSSED once
          bid >= ask, which is the exact condition the engine trades on.

          Its y comes from a label gutter, not from an offset above the runway's
          floor. The caption's x is the crossing price BY CONSTRUCTION, and the
          crossing price is exactly where the avatars have converged -- so the
          old placement (26 units up from the runway's bottom edge, squarely
          inside lane 3's avatar box) did not merely risk a collision, it
          guaranteed one with any lane-3 trader, and the measured frame showed
          "CROSSED" cut through by an avatar's body. A gutter is the only y that
          no avatar can reach at any price. */}
      <Show when={crossing()}>
        <text
          class="auction-cross-caption"
          data-crossed={crossed() ? "true" : "false"}
          x={clampLabelX(bandLeft() + bandWidth() / 2 - 48, 96, LANE_FIELD_REGION) + 48}
          y={labelGutterCenterY(CAPTION_GUTTER) + 5}
          text-anchor="middle"
        >
          {crossed() ? "CROSSED" : "CLOSING"}
        </text>
      </Show>
    </g>
  );
}

//============================================
/**
 * One labeled price pennant: the readable half of the bid/ask pair. Carries its
 * side's name and dollar figure on a plate, so the two sides stay distinguishable
 * by TEXT and by COLOR even when their underlying lines have merged into one.
 *
 * @param props - Carries the side, position, label, price, and alert state.
 * @returns The pennant group.
 */
function PricePennant(props: {
  readonly kind: "bid" | "ask";
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly price: number;
  readonly alert: boolean;
}): JSX.Element {
  // The plate width is the SHARED constant the minimum separation is computed
  // against; the two must never drift apart, or the pennants silently re-merge.
  // The HEIGHT is likewise shared, with auction_geometry.ts, because the pennant
  // band's own height is built from it: a plate that grew here without the band
  // growing with it would push its own ink out of the band it is guaranteed by.
  const plateWidth = PENNANT_WIDTH;
  const plateHeight = PENNANT_PLATE_HEIGHT;
  const left = (): number => clampLabelX(props.x - plateWidth / 2, plateWidth, PENNANT_BAND_REGION);
  return (
    <g
      class="auction-price-pennant"
      data-kind={props.kind}
      data-alert={props.alert ? "true" : "false"}
    >
      <rect
        class="auction-pennant-plate"
        x={left()}
        y={props.y - plateHeight / 2}
        width={plateWidth}
        height={plateHeight}
        rx={5}
      />
      <text class="auction-pennant-label" x={left() + 8} y={props.y + 5}>
        {props.label}
      </text>
      <text
        class="auction-pennant-price"
        x={left() + plateWidth - 8}
        y={props.y + 5}
        text-anchor="end"
      >
        {`$${props.price}`}
      </text>
    </g>
  );
}

//============================================
/**
 * The window's timer bar, draining left to right with `ticksRemaining` against
 * the quiet-tick budget this window opened with.
 *
 * @param props - Carries the remaining fraction, 0..1.
 * @returns The timer group.
 */
function TimerBar(props: { readonly fraction: () => number }): JSX.Element {
  const trackLeft = RUNWAY_REGION.left;
  const trackWidth = rectWidth(RUNWAY_REGION);
  const clamped = (): number => {
    const value = props.fraction();
    return value < 0 ? 0 : value > 1 ? 1 : value;
  };
  return (
    <g class="auction-timer">
      <rect
        class="auction-timer-track"
        x={trackLeft}
        y={TIMER_REGION.top}
        width={trackWidth}
        height={rectHeight(TIMER_REGION)}
        rx={6}
      />
      <rect
        class="auction-timer-fill"
        data-fraction={clamped().toFixed(2)}
        x={trackLeft}
        y={TIMER_REGION.top}
        width={trackWidth * clamped()}
        height={rectHeight(TIMER_REGION)}
        rx={6}
      />
      <text
        class="auction-timer-label"
        x={DOCK_REGION.left + 8}
        y={TIMER_REGION.top + rectHeight(TIMER_REGION) / 2 + 5}
      >
        TIME
      </text>
    </g>
  );
}

/** Props for one avatar. */
interface AvatarProps {
  /** Player slot (playerId, 0..3): lane, species, and ref index. */
  readonly slot: number;
  /** The participant whose role tags the group and places its price peg. */
  readonly participant: AuctionParticipant;
  /** The species silhouette to render. */
  readonly species: SpeciesName;
  /** Called on mount with the group and sprite refs for the tween loop. */
  readonly register: (slot: number, group: SVGGElement, sprite: SVGUseElement) => void;
  /** Called with the price-tag element, so the loop can hold it in the runway. */
  readonly registerPriceTag: (slot: number, tag: SVGTextElement) => void;
}

//============================================
/**
 * One player's avatar on the runway: a `<g>` carrying the test hooks
 * (`data-actor`, reactive `data-role`, and the per-frame `data-x` / `data-y` the
 * tween loop writes) around a tintable `<use>` of the species walk symbol. An
 * out participant renders dimmed and tagged OUT, with no price. The group's
 * transform and the sprite's href are written imperatively by the tween loop, so
 * nothing here binds them reactively.
 *
 * @param props - Carries the slot, participant, species, and register callback.
 * @returns The avatar `<g>` group.
 */
function Avatar(props: AvatarProps): JSX.Element {
  let groupEl: SVGGElement | undefined;
  let spriteEl: SVGUseElement | undefined;
  const color = playerColor(props.participant.playerId);
  onMount(() => {
    if (groupEl !== undefined && spriteEl !== undefined) {
      props.register(props.slot, groupEl, spriteEl);
    }
  });
  return (
    <g
      ref={(el) => {
        groupEl = el;
      }}
      class="auction-avatar"
      data-actor={`player-${props.participant.playerId}`}
      data-role={props.participant.role}
    >
      {/* The BENCH. Drawn before the sprite, so the benched player stands ON it.
          This is the positive half of the sit-out cue and the reason it works: a
          bench is an OBJECT the player can see, where "dimmed, no price tag" is
          an ABSENCE the player has to notice -- and an absence is exactly what
          gets lost next to a floor-priced buyer standing one lane away, who is
          also parked at the cheap wall. No active trader ever has a bench. */}
      <Show when={props.participant.role === "out"}>
        <rect
          class="auction-avatar-bench"
          x={-BENCH_OVERHANG}
          y={AVATAR_SIZE - BENCH_HEIGHT}
          width={AVATAR_SIZE + BENCH_OVERHANG * 2}
          height={BENCH_HEIGHT}
          rx={3}
          stroke={color}
        />
      </Show>
      <use
        ref={(el) => {
          spriteEl = el;
        }}
        class="auction-avatar-sprite"
        href={`#${speciesSymbolId(props.species, 1)}`}
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
        style={{ color }}
      />
      {/* An active player carries its live price above its head, so a row can be
          read without tracing it back to a gridline. A benched player carries an
          OUT chip instead -- never a price, which would read as a live offer.

          The chip is a PLATE, not bare text, for a measured reason: the old bare
          tag inherited the group's dim and rendered at 2.31:1, below even the AA
          floor, so the one cue that a player was out was the least readable text
          on the screen. Only the sprite dims now (see style.css); the chip and
          the bench keep full opacity and carry their own contrast. */}
      <Show
        when={props.participant.role !== "out"}
        fallback={
          <g class="auction-avatar-out-chip">
            <rect
              class="auction-avatar-out-chip-plate"
              x={AVATAR_SIZE / 2 - OUT_CHIP_WIDTH / 2}
              y={OUT_CHIP_TOP}
              width={OUT_CHIP_WIDTH}
              height={OUT_CHIP_HEIGHT}
              rx={4}
              stroke={color}
            />
            <text
              class="auction-avatar-out-tag"
              x={AVATAR_SIZE / 2}
              y={OUT_CHIP_TOP + OUT_CHIP_HEIGHT - 4}
              text-anchor="middle"
            >
              OUT
            </text>
          </g>
        }
      >
        <text
          ref={(el) => {
            props.registerPriceTag(props.slot, el);
          }}
          class="auction-avatar-price"
          x={AVATAR_SIZE / 2}
          y={-4}
          text-anchor="middle"
        >
          {`$${props.participant.price}`}
        </text>
      </Show>
    </g>
  );
}
