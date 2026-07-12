// Pure geometry for the full-stage native-landscape goods auction.
//
// This module is the single source of truth for the auction SVG's viewBox
// regions: every lane consumer (arena, dock, status layer) reads its bounds
// from here instead of hardcoding coordinates. A later mock-measurement pass
// may retune these constants; this file is where that retuning lands, not
// scattered literals across the consuming components.
//
// The runway's horizontal price axis reuses `priceToTrackY` from
// `auction_tween.ts` rather than duplicating its band-fraction math: the
// vertical track math (floor at the far edge, ceiling at the near edge,
// clamped, zero-width safe) is identical to the horizontal one, just walked
// along x instead of y.

import { priceToTrackY } from "./auction_tween";

/**
 * A rectangular region of the auction viewBox, in SVG user units.
 */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * A horizontal band of the auction viewBox: a vertical span with no x bounds,
 * in SVG user units. Used for the lane occupant bands and the label gutters
 * between them, where the whole runway width is in play.
 */
export interface Band {
  top: number;
  bottom: number;
}

// The auction stage renders into one fixed 16:10 viewBox; every region below
// is defined in these units regardless of the SVG's on-screen scaled size.
export const VIEW_BOX_WIDTH = 960;
export const VIEW_BOX_HEIGHT = 600;

// Top band: title, big going price, tick readout, FAST indicator. 80 units, not
// the 88 it was: 8 units were handed down to the price runway to pay for the
// pennant band (see PENNANT_BAND_REGION below). The going price is the largest
// glyph on the stage and stays that way -- at 44 units of type on an 80-unit
// band, its ink still clears the band's top edge by ~14 units and its caption
// clears the bottom by ~9, so the headline keeps its air while the market's own
// two prices get a home that no avatar can walk into.
export const TOP_BAND_REGION: Rect = { left: 0, top: 0, right: VIEW_BOX_WIDTH, bottom: 80 };

// Left player dock: one row per lane (swatch, role, money, units, traded).
export const DOCK_REGION: Rect = { left: 0, top: 80, right: 150, bottom: 536 };

// Store buy rail: the cheap wall buyers walk toward.
export const BUY_RAIL_REGION: Rect = { left: 150, top: 80, right: 190, bottom: 536 };

// Price runway: the dominant region. Its X axis is the price axis (`priceToX`);
// its height is split between the pennant band (the market's header) and the
// lane field (the players' floor), both derived below.
export const RUNWAY_REGION: Rect = { left: 190, top: 80, right: 910, bottom: 536 };

// Store sell rail: the expensive wall sellers walk toward.
export const SELL_RAIL_REGION: Rect = { left: 910, top: 80, right: 950, bottom: 536 };

// Timer bar: drains with the auction window's remaining ticks.
export const TIMER_REGION: Rect = { left: 0, top: 544, right: VIEW_BOX_WIDTH, bottom: 576 };

// Fixed lane row count: this engine always seats four players.
export const LANE_COUNT = 4;

// ---------------------------------------------------------------------------
// THE PENNANT BAND: THE MARKET'S TWO LIVE PRICES, ABOVE THE WALKING FLOOR
// ---------------------------------------------------------------------------
// The BID and ASK pennants name the two prices the whole auction turns on, and
// they used to sit INSIDE the runway, in a gutter between two lane rows. That
// worked -- the gutters are provably avatar-free -- but it put market-level
// information into the players' space and made the safety of the placement a
// RESULT of arithmetic (occupant bands, gutter derivation) rather than a
// property of the composition.
//
// They now live in a band ACROSS THE TOP OF THE RUNWAY, above every lane. The
// pennants' x still marks their price -- that is the entire point of the screen
// -- and each is tethered to its own dashed price line, which now runs DOWN out
// of the band, through the lanes, to the floor. What this buys is not a smaller
// collision probability but a different KIND of guarantee: an avatar cannot
// reach the band at any price, in any lane, because avatars live in the lane
// field and the band is not in it. The two regions are disjoint by construction,
// and `tests/test_auction_geometry.mjs` asserts that disjointness directly
// rather than re-checking a y-band computation.
//
// The height comes from the top band (8 units) and from the lane rows (32), and
// the lane rows are what makes it a real trade: four rows of 112 become four of
// 104, so each label gutter between them narrows from 28 to 20. The banner that
// lives in a gutter already DERIVES its plate height from the gutter it is in
// (auction_trade_fx.ts), so it follows the change instead of overflowing it.

/** Clearance between the pennant band's top edge and the pennant plate. */
const PENNANT_BAND_PAD = 4;

/** Height of a BID/ASK pennant plate, in viewBox units. */
export const PENNANT_PLATE_HEIGHT = 26;

/** Drop from the pennant plate's bottom edge to the horizontal leader rail. */
const PENNANT_LEADER_DROP = 5;

/**
 * Clearance between the leader rail -- the band's LOWEST drawn element -- and
 * the lane field below it. The band's bottom edge already cannot be reached by
 * an avatar's sprite, but a lane-0 avatar's head decoration (its price tag or
 * OUT chip) is budgeted right up to that edge by `laneOccupantBand`, so the
 * leader is held this far above it and the pennants' ink is further still.
 */
const PENNANT_LEADER_CLEARANCE = 5;

/** Total height of the pennant band: pad, plate, leader drop, and clearance. */
export const PENNANT_BAND_HEIGHT =
  PENNANT_BAND_PAD + PENNANT_PLATE_HEIGHT + PENNANT_LEADER_DROP + PENNANT_LEADER_CLEARANCE;

/**
 * The market's header strip: spans the runway's full x range (so a pennant's x
 * still reads as a price against the same axis the avatars walk) and sits above
 * every lane.
 */
export const PENNANT_BAND_REGION: Rect = {
  left: RUNWAY_REGION.left,
  top: RUNWAY_REGION.top,
  right: RUNWAY_REGION.right,
  bottom: RUNWAY_REGION.top + PENNANT_BAND_HEIGHT,
};

/**
 * The walking floor: the part of the runway the four lane rows divide up. Every
 * avatar, at every price, is inside this rect and nowhere else, which is what
 * makes the pennant band above it collision-free by construction.
 */
export const LANE_FIELD_REGION: Rect = {
  left: RUNWAY_REGION.left,
  top: PENNANT_BAND_REGION.bottom,
  right: RUNWAY_REGION.right,
  bottom: RUNWAY_REGION.bottom,
};

/**
 * Compute the width of a region rect.
 *
 * @param region - Region to measure.
 * @returns The region's width in viewBox units.
 */
export function rectWidth(region: Rect): number {
  const width = region.right - region.left;
  return width;
}

/**
 * Compute the height of a region rect.
 *
 * @param region - Region to measure.
 * @returns The region's height in viewBox units.
 */
export function rectHeight(region: Rect): number {
  const height = region.bottom - region.top;
  return height;
}

/**
 * The height of one lane row: the LANE FIELD's height (the runway less its
 * pennant band), split `LANE_COUNT` ways. The dock reads this too, so its rows
 * and the runway's rows stay one height.
 *
 * @returns The lane row height in viewBox units.
 */
export function laneHeight(): number {
  const height = rectHeight(LANE_FIELD_REGION) / LANE_COUNT;
  return height;
}

/**
 * The vertical center y of a lane row, given its 0-based slot index. The LANE
 * FIELD's height is split into `LANE_COUNT` equal rows and the returned value is
 * the row's midline, so avatars and dock rows for the same slot align on one
 * horizontal line.
 *
 * Derived from `LANE_FIELD_REGION`, not from `RUNWAY_REGION`: the runway's top
 * strip is the market's pennant band, and a lane centered against the runway
 * would walk its avatars straight up into it.
 *
 * @param slot - 0-based lane index, `0` through `LANE_COUNT - 1`.
 * @returns The lane's center y coordinate in viewBox units.
 */
export function laneCenterY(slot: number): number {
  const y = LANE_FIELD_REGION.top + (slot + 0.5) * laneHeight();
  return y;
}

/**
 * The center y of a BID/ASK pennant plate: seated at the top of the pennant
 * band, a pad below its edge.
 *
 * @returns The pennant plate's center y in viewBox units.
 */
export function pennantPlateCenterY(): number {
  const y = PENNANT_BAND_REGION.top + PENNANT_BAND_PAD + PENNANT_PLATE_HEIGHT / 2;
  return y;
}

/**
 * The y of the horizontal leader rail: the line a displaced pennant runs along
 * to reach its own price line, and the y each dashed price line STARTS at, so
 * the tether and the line read as one continuous path from the plate down to the
 * floor. It is the band's lowest drawn element, held `PENNANT_LEADER_CLEARANCE`
 * above the lane field.
 *
 * @returns The leader rail's y in viewBox units.
 */
export function pennantLeaderY(): number {
  const y = PENNANT_BAND_REGION.bottom - PENNANT_LEADER_CLEARANCE;
  return y;
}

// ---------------------------------------------------------------------------
// LANE OCCUPANT BANDS AND THE LABEL GUTTERS BETWEEN THEM
// ---------------------------------------------------------------------------
// A label drawn anywhere an avatar can stand WILL eventually collide with one,
// because avatars sweep the entire runway width by construction: a buyer starts
// at the cheap wall and walks to the crossing price, so "usually misses" is not
// a placement, it is a bug waiting for the right price. Every label the arena
// draws over the LANE FIELD therefore derives its y from the bands below instead
// of nudging a constant until one frame looks clean. (A label that does not have
// to be over the floor at all is better still: that is why the BID and ASK
// pennants left for the pennant band above.)
//
// Vertically, an avatar owns MORE than its sprite box: it also carries a head
// decoration (its live price tag, or the OUT chip when benched) floating above
// its head. `laneOccupantBand` returns that FULL extent. What is left between
// two neighboring occupant bands is a gutter that no avatar in any lane can
// reach at any price -- the only safe home for a label that must stay readable
// while the market converges.
//
//   ==== pennant band ==== [ 80, 120]   BID / ASK pennants, above the floor
//   lane 0 occupant band   [120, 204]   avatar + head tag
//   ---- gutter 0 -------- [204, 224]   (empty: the pennants used to sit here)
//   lane 1 occupant band   [224, 308]
//   ---- gutter 1 -------- [308, 328]   UNITS TRADED banner, CHEAP / EXPENSIVE
//   lane 2 occupant band   [328, 412]
//   ---- gutter 2 -------- [412, 432]   CLOSING / CROSSED caption
//   lane 3 occupant band   [432, 516]
//   ---- rail foot ------- [516, 536]   store stock number (on the rails only)
//
// Lane 0's occupant band starts EXACTLY at the lane field's top edge: a lane row
// is 104 units, an occupant is 84, so the half-row above the first lane center
// (52) is spent entirely on the sprite and its head tag. That is not a coincidence
// to be nudged, it is the tightest the four rows can be packed, and it is why the
// pennant band's own drawn elements are held clear of the field's edge rather than
// merely inside the band.
//
// The gutters are assigned to label classes by the named constants below rather
// than by each consumer picking one, because the consumers live in different
// modules (the caption in auction_arena.tsx, the banner in auction_trade_fx.ts)
// and two of them silently choosing the same band would reintroduce exactly the
// overlap this structure exists to prevent. Gutter 0 is now unclaimed -- the
// pennants vacated it -- and stays that way on purpose: it is the breathing room
// under the top lane, not a slot looking for an occupant.

/** Rendered size of a species avatar on the runway, in viewBox units. */
export const AVATAR_SIZE = 64;

/**
 * Height of the head decoration an avatar carries ABOVE its sprite box: the
 * live price tag for an active trader, or the OUT chip for a benched one. Sized
 * to the taller of the two (the 14-unit price tag's ink plus its baseline
 * offset, and the 16-unit OUT chip plus its offset), so the occupant band
 * covers whichever one a lane happens to be rendering.
 */
export const AVATAR_TAG_HEIGHT = 20;

/** Number of gutters between the lane rows: one fewer than the lanes. */
export const LABEL_GUTTER_COUNT = LANE_COUNT - 1;

/**
 * Gutter carrying the transient "UNITS TRADED n" banner AND the CHEAP /
 * EXPENSIVE wall labels. These two share a band safely because they can never
 * share an x: the banner is centered on the runway and the wall labels are
 * pinned to its two extreme edges. `tests/test_auction_geometry.mjs` asserts
 * that disjointness rather than leaving it to inspection.
 */
export const BANNER_GUTTER = 1;

/** Gutter carrying the CLOSING / CROSSED crossing caption. */
export const CAPTION_GUTTER = 2;

/**
 * Width of the "UNITS TRADED n" banner plate, in viewBox units. Shared here,
 * not private to auction_trade_fx.ts, because it is half of the proof that the
 * banner and the wall labels can share `BANNER_GUTTER`: the test asserts the
 * banner's centered span leaves at least `WALL_LABEL_MAX_WIDTH` clear at each
 * runway edge, which is only checkable if both figures live in one place.
 */
export const BANNER_WIDTH = 260;

/**
 * Width budget for a CHEAP / EXPENSIVE wall label, in viewBox units. Sized for
 * the longer of the two ("EXPENSIVE" at 12 units with 2 units of letter
 * spacing) with headroom, since SVG text width is not computable here.
 */
export const WALL_LABEL_MAX_WIDTH = 96;

/**
 * The full vertical extent an avatar in a lane can occupy: its sprite box plus
 * the head decoration (price tag or OUT chip) floating above it. This is the
 * region a label must stay out of, at every price, for that lane.
 *
 * @param slot - 0-based lane index, `0` through `LANE_COUNT - 1`.
 * @returns The lane's occupied vertical band in viewBox units.
 */
export function laneOccupantBand(slot: number): Band {
  const centerY = laneCenterY(slot);
  const top = centerY - AVATAR_SIZE / 2 - AVATAR_TAG_HEIGHT;
  const bottom = centerY + AVATAR_SIZE / 2;
  return { top, bottom };
}

/**
 * The collision-free band between two neighboring lanes' occupant bands. No
 * avatar, at any price, in any lane, can reach into it -- which is the whole
 * point: a label placed here is safe by construction rather than by luck.
 *
 * @param index - 0-based gutter index, `0` through `LABEL_GUTTER_COUNT - 1`.
 * @returns The gutter's vertical band in viewBox units.
 */
export function labelGutterBand(index: number): Band {
  const above = laneOccupantBand(index);
  const below = laneOccupantBand(index + 1);
  return { top: above.bottom, bottom: below.top };
}

/**
 * The center y of a label gutter: the baseline a label centers itself on.
 *
 * @param index - 0-based gutter index, `0` through `LABEL_GUTTER_COUNT - 1`.
 * @returns The gutter's center y in viewBox units.
 */
export function labelGutterCenterY(index: number): number {
  const band = labelGutterBand(index);
  const y = (band.top + band.bottom) / 2;
  return y;
}

/**
 * Compute the height of a band.
 *
 * @param band - Band to measure.
 * @returns The band's height in viewBox units.
 */
export function bandHeight(band: Band): number {
  const height = band.bottom - band.top;
  return height;
}

/**
 * Place two labels of equal width so they never overlap each other AND stay
 * inside a region, given the two x positions they would each PREFER to sit at.
 *
 * This is the pair version of `clampLabelX`, and it exists because clamping two
 * labels INDEPENDENTLY destroys the separation between them at a region edge:
 * the BID and ASK pennants are held `minSeparation` apart around the market
 * midpoint, but when the market clears at the band ceiling both want the same
 * edge, each clamps to it on its own, and the two plates land 74% on top of
 * each other -- measured, at the exact moment the screen is supposed to be
 * announcing the trade. Shifting the PAIR as a unit keeps the separation the
 * caller asked for and satisfies the region bound at the same time.
 *
 * A pair whose own span (`minSeparation + labelWidth`) exceeds the region is
 * unplaceable; it pins to the region's left edge, the same degenerate-case
 * choice `clampLabelX` makes, rather than returning a negative remainder.
 *
 * @param lowX - Preferred center x for the left-hand label.
 * @param highX - Preferred center x for the right-hand label.
 * @param labelWidth - Rendered width of each label, in viewBox units.
 * @param minSeparation - Minimum distance between the two label CENTERS.
 * @param region - Region both labels must stay within.
 * @returns The two final center x positions, left-hand one first.
 */
export function separateLabelPair(
  lowX: number,
  highX: number,
  labelWidth: number,
  minSeparation: number,
  region: Rect,
): { readonly low: number; readonly high: number } {
  // Splay the pair around its own midpoint until it clears the minimum
  // separation, keeping each label at its preferred x when it already does.
  const midpoint = (lowX + highX) / 2;
  const halfSeparation = minSeparation / 2;
  let low = Math.min(lowX, midpoint - halfSeparation);
  let high = Math.max(highX, midpoint + halfSeparation);

  // Slide the pair as ONE unit until both plates sit inside the region. The
  // right edge is corrected first, then the left, so a pair too wide for the
  // region pins left rather than overflowing both ways.
  const halfWidth = labelWidth / 2;
  const rightOverflow = high + halfWidth - region.right;
  if (rightOverflow > 0) {
    low -= rightOverflow;
    high -= rightOverflow;
  }
  const leftOverflow = region.left - (low - halfWidth);
  if (leftOverflow > 0) {
    low += leftOverflow;
    high += leftOverflow;
  }
  return { low, high };
}

/**
 * Map a price within a good's band to an x coordinate on the horizontal
 * runway. The band floor sits at the runway's left edge (the buy rail) and
 * the ceiling at the right edge (the sell rail), so a rising price walks an
 * avatar rightward toward the more expensive wall. This mirrors the old
 * vertical-track scene's `priceToX = trackLength - priceToTrackY(...)`
 * composition, just applied to the runway's width instead of a bespoke
 * track length: `priceToTrackY` already clamps out-of-band prices and
 * centers a degenerate zero-width band, so this function inherits both
 * safeguards for free.
 *
 * @param price - Price to place.
 * @param priceFloor - Band floor (the store's buy quote for the good).
 * @param priceCeiling - Band ceiling (the store's sell quote for the good).
 * @returns The x coordinate in viewBox units, within the runway region.
 */
export function priceToX(price: number, priceFloor: number, priceCeiling: number): number {
  const runwayWidth = rectWidth(RUNWAY_REGION);
  const trackPosition = priceToTrackY(price, priceFloor, priceCeiling, runwayWidth);
  const x = RUNWAY_REGION.left + (runwayWidth - trackPosition);
  return x;
}

// ---------------------------------------------------------------------------
// STORE RAIL STOCK: THE NUMBER AND THE CRATES IT COUNTS
// ---------------------------------------------------------------------------
// A rail shows the store's stock twice: as a stack of crates (a picture, always
// approximate, since `stockToCrateCount` scales and clamps it) and as the raw
// integer (the ground truth). Those are two halves of ONE statement -- "this
// many" -- and they only read as one if they are drawn as one. The number used
// to sit up in a label gutter at roughly lane-2 height with the crates stacked
// ~200 units below it, which made them two unrelated facts on the same wall.
//
// The number now sits at the FOOT of its own stack, and both are derived from
// one anchor: the avatar-free strip below the last lane's occupant band
// (`railFootBand`). That strip is where the number goes, the crates stack
// upward from just above it, and the rail's two rotated texts start above a
// FULL stack. So the whole rail is one bottom-anchored column with nothing
// hand-placed in it.
//
// The strip matters for more than tidiness. A rail is NOT out of an avatar's
// reach: a band-edge price puts an avatar's center on the rail's runway edge and
// its sprite overhangs the wall (see the rail-text section below -- that overhang
// is the point). Above the strip, the crates really can be sat on by a lane-2 or
// lane-3 trader at an extreme price, and that costs nothing: they are the
// picture. The number is the fact, so it is placed where no avatar reaches --
// below every lane -- and stays on the rail plate it was contrast-measured
// against rather than sliding onto a crate.
//
// Stock scales into a bounded crate count so a large stockpile never overflows
// the rail's pixel budget.
export const MAX_RAIL_CRATES = 8;
export const CRATE_GLYPH_SIZE = 16;

/**
 * Font size of a rail's stock integer, in viewBox units. Mirrors
 * `.auction-store-rail-stock` in style.css, and is needed here because the
 * number's ink height is what the crate stack is seated above.
 */
export const RAIL_STOCK_FONT_SIZE = 15;

/** Gap between the stock number's ink and the bottom crate it counts. */
export const RAIL_STOCK_CRATE_GAP = 6;

/** Clearance between the top of a FULL crate stack and the rail's rotated texts. */
export const RAIL_TEXT_CRATE_CLEARANCE = 12;

/**
 * The avatar-free strip at a store rail's foot: everything below the last lane's
 * occupant band. Both rails share one vertical extent, so this is computed once
 * from the buy rail.
 *
 * @returns The foot strip's vertical band in viewBox units.
 */
export function railFootBand(): Band {
  const top = laneOccupantBand(LANE_COUNT - 1).bottom;
  const bottom = BUY_RAIL_REGION.bottom;
  return { top, bottom };
}

/**
 * Baseline y for a rail's stock integer: its ink centered in the rail's foot
 * strip, so the number is provably beyond an overhanging avatar's reach and
 * still hard against the crates it counts.
 *
 * @returns The stock number's baseline y in viewBox units.
 */
export function railStockBaselineY(): number {
  const band = railFootBand();
  const slack = bandHeight(band) - RAIL_STOCK_FONT_SIZE;
  const y = band.top + slack / 2 + RAIL_STOCK_FONT_SIZE;
  return y;
}

/**
 * The bottom edge of a rail's crate stack: seated a gap above the top of the
 * stock number's ink, so the count and the crates read as one statement.
 *
 * @returns The crate stack's base y in viewBox units.
 */
export function railCrateBaseY(): number {
  const inkTop = railStockBaselineY() - RAIL_STOCK_FONT_SIZE;
  const y = inkTop - RAIL_STOCK_CRATE_GAP;
  return y;
}

/**
 * The top edge of one crate in a rail's stack, counting up from the base, so a
 * draining stock visibly sinks toward the number.
 *
 * @param indexFromBottom - 0-based crate index, `0` at the foot of the stack.
 * @returns The crate glyph's top y in viewBox units.
 */
export function railCrateY(indexFromBottom: number): number {
  const y = railCrateBaseY() - (indexFromBottom + 1) * CRATE_GLYPH_SIZE;
  return y;
}

/**
 * The top edge of a FULL crate stack (`MAX_RAIL_CRATES` crates): the highest a
 * stack can ever reach, and therefore the ceiling everything else on the rail
 * has to clear.
 *
 * @returns The full stack's top y in viewBox units.
 */
export function railCrateStackTop(): number {
  const y = railCrateY(MAX_RAIL_CRATES - 1);
  return y;
}

/**
 * The y a rail's rotated texts (the live quote and the STORE BUYS / STORE SELLS
 * caption) translate to. They run UPWARD from here under `rotate(-90)`, so this
 * is their lower end, placed clear of a full crate stack rather than at a
 * hand-tuned offset from the rail's foot.
 *
 * @returns The rotated texts' baseline anchor y in viewBox units.
 */
export function railTextBaselineY(): number {
  const y = railCrateStackTop() - RAIL_TEXT_CRATE_CLEARANCE;
  return y;
}

// ---------------------------------------------------------------------------
// STORE RAIL TEXT COLUMNS
// ---------------------------------------------------------------------------
// Each rail carries two texts rotated up its face: the store's LIVE quote for
// the good, and a static STORE BUYS / STORE SELLS caption. They sit in two
// side-by-side columns across the rail's 40-unit width, and WHICH of them is
// nearest the runway is not a cosmetic choice.
//
// An avatar is centered on its price, and a band-edge price puts its center ON
// the rail's runway edge -- that overhang is the point (a buyer touching the
// sell rail has literally reached the store's ask, see auction_arena.tsx's
// header). So the sprite spills roughly half its width into the rail, and
// whichever column sits innermost gets sat on. That column must therefore be
// the one whose occlusion costs nothing: the static caption, a word the player
// learns once, redundant with the quote beside it and with the CHEAP/EXPENSIVE
// hints. The live quote goes outboard of it, out of an avatar's reach.
//
// The two rails are consequently MIRROR IMAGES, read outward from the runway:
//
//     runway | label | quote      (buy rail, outward = -x)
//     quote | label | runway      (sell rail, outward = +x)
//
// They were NOT mirrored before: both rails ran quote-then-label in raw +x
// order, which put the buy rail's caption innermost (fine) and the sell rail's
// LIVE QUOTE innermost (not fine). Its box began ~2 units inside the runway,
// in the strip where avatars provably stand, and it measured 96.4% covered by
// an avatar on the status and declare beats -- a live market number erased by
// a robot's shoulder. Deriving both rails from one outward-facing function is
// what makes that class of bug unrepresentable rather than re-fixable.

/** Which store rail: the cheap wall (buy) or the expensive wall (sell). */
export type RailSide = "buy" | "sell";

/** Which of a rail's two rotated texts: the live quote, or the static caption. */
export type RailTextElement = "quote" | "label";

/** Font size of a rail's rotated live quote, in viewBox units. */
export const RAIL_QUOTE_FONT_SIZE = 17;

/**
 * Font size of a rail's rotated STORE BUYS / STORE SELLS caption, in viewBox
 * units. 12, not 11, and the extra unit is a deliberate call, not a nudge: the
 * project's 12px text floor is a RENDERED floor, and the stage scales this
 * 960-unit viewBox up to the viewport, so the smallest scale in play is the
 * binding 1024x640 minimum (1024 / 960 = 1.0667). At 11 units the caption
 * rendered 11.73px -- the only element on the whole screen under the floor, and
 * under it by accident. At 12 units it renders 12.80px, the same margin the
 * dock's smallest text already carries and clears the floor at every supported
 * viewport, since every larger stage only scales it up.
 */
export const RAIL_LABEL_FONT_SIZE = 12;

/**
 * Ink a rotated rail text hangs below its baseline (descenders and the font's
 * own descent metric), as a fraction of font size. Under `rotate(-90)` a
 * glyph's ink lies on the -x side of its baseline (the ascender direction) and
 * its descent spills to +x, so a rotated text's column spans
 * `fontSize * (1 + RAIL_TEXT_DESCENT_FRACTION)` across the rail. Measured off
 * the rendered DOM at 0.17-0.22 for these two texts; 0.25 is the rounded-up
 * budget, so the columns stay disjoint rather than merely usually disjoint.
 */
export const RAIL_TEXT_DESCENT_FRACTION = 0.25;

/** Clearance between the runway edge and the innermost rail text's ink. */
export const RAIL_TEXT_RUNWAY_INSET = 4;

/** Gap between a rail's two text columns. */
export const RAIL_TEXT_COLUMN_GAP = 2;

/**
 * One rotated text column on a store rail: where to put its baseline, how big
 * to draw it, and the x span its ink actually occupies.
 */
export interface RailTextColumn {
  /** Baseline x to translate the rotated text to. */
  readonly baselineX: number;
  /** Font size to render it at, in viewBox units. */
  readonly fontSize: number;
  /** Left edge of the column's ink. */
  readonly left: number;
  /** Right edge of the column's ink. */
  readonly right: number;
  /** Distance from the rail's runway edge to the column's nearest ink edge. */
  readonly runwayInset: number;
}

//============================================
/**
 * The width a rotated rail text's ink occupies across the rail: its font size
 * (ascender to baseline) plus the descent budget below the baseline.
 *
 * @param fontSize - The text's font size in viewBox units.
 * @returns The column's width in viewBox units.
 */
function railTextColumnWidth(fontSize: number): number {
  const width = fontSize * (1 + RAIL_TEXT_DESCENT_FRACTION);
  return width;
}

//============================================
/**
 * Place one of a rail's two rotated texts. Both rails are laid out by walking
 * OUTWARD from the runway edge -- caption first, then quote -- so the two rails
 * come out mirrored by construction and no live price is ever placed where an
 * avatar can reach it. See this section's header for why that ordering is the
 * whole point.
 *
 * The returned `baselineX` accounts for the rotation: under `rotate(-90)` a
 * glyph's ink hangs on the -x side of its baseline, so on the buy rail (whose
 * outward direction is -x) the baseline sits at the column's INNER edge, while
 * on the sell rail (outward +x) it sits at the column's OUTER edge.
 *
 * @param side - Which rail.
 * @param element - The live quote, or the static caption.
 * @returns The column's baseline, font size, ink span, and runway clearance.
 */
export function railTextColumn(side: RailSide, element: RailTextElement): RailTextColumn {
  const region = side === "buy" ? BUY_RAIL_REGION : SELL_RAIL_REGION;

  // The rail edge that touches the runway, and the direction that walks away
  // from it. These two lines are the mirror: everything below is written once,
  // in runway-relative terms, and comes out reflected for the sell rail.
  const runwayEdge = side === "buy" ? region.right : region.left;
  const outward = side === "buy" ? -1 : 1;

  const labelWidth = railTextColumnWidth(RAIL_LABEL_FONT_SIZE);
  const fontSize = element === "quote" ? RAIL_QUOTE_FONT_SIZE : RAIL_LABEL_FONT_SIZE;

  // The caption hugs the runway; the quote sits one caption-width plus a gap
  // further out, which puts its ink beyond the reach of an overhanging sprite.
  const runwayInset =
    element === "quote"
      ? RAIL_TEXT_RUNWAY_INSET + labelWidth + RAIL_TEXT_COLUMN_GAP
      : RAIL_TEXT_RUNWAY_INSET;

  const innerInkX = runwayEdge + outward * runwayInset;
  const outerInkX = runwayEdge + outward * (runwayInset + railTextColumnWidth(fontSize));
  const left = Math.min(innerInkX, outerInkX);
  const right = Math.max(innerInkX, outerInkX);

  // Ink hangs toward -x of the baseline under `rotate(-90)`, with only the
  // descent spilling to +x -- so whichever of the two edges above is the RIGHT
  // one, the baseline sits a descent short of it. Written this way the same
  // line serves both rails; a `side` branch here would be the mirror bug all
  // over again, one level down.
  const descent = fontSize * RAIL_TEXT_DESCENT_FRACTION;
  const baselineX = right - descent;

  return { baselineX, fontSize, left, right, runwayInset };
}

/**
 * Map a stock quantity to a crate count for the rail's stacked crate glyphs,
 * clamped to `MAX_RAIL_CRATES` so a large stockpile renders as a full stack
 * rather than overflowing the rail. A non-positive `maxStock` (no known
 * ceiling) renders zero crates rather than dividing by zero.
 *
 * @param stock - Current store stock for the good.
 * @param maxStock - Reference stock level that fills the stack.
 * @returns Whole crate count, `0` through `MAX_RAIL_CRATES`.
 */
export function stockToCrateCount(stock: number, maxStock: number): number {
  if (maxStock <= 0) {
    return 0;
  }
  const fraction = stock / maxStock;
  const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  const count = Math.round(clamped * MAX_RAIL_CRATES);
  return count;
}

// Status-layer usage bars: recorded round-ledger amounts scale into a bar
// width budget so previous/usage/spoilage/production/held steps stay
// legible side by side.
export const USAGE_BAR_MAX_WIDTH = 120;

/**
 * Map a recorded ledger amount to a usage-bar pixel width, clamped to
 * `USAGE_BAR_MAX_WIDTH`. A non-positive `maxAmount` (nothing to compare
 * against) renders a zero-width bar rather than dividing by zero.
 *
 * @param amount - Recorded amount for this bar's step (usage, spoilage, etc).
 * @param maxAmount - Reference amount that fills the bar.
 * @returns Bar width in viewBox units, `0` through `USAGE_BAR_MAX_WIDTH`.
 */
export function usageToBarWidth(amount: number, maxAmount: number): number {
  if (maxAmount <= 0) {
    return 0;
  }
  const fraction = amount / maxAmount;
  const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  const width = clamped * USAGE_BAR_MAX_WIDTH;
  return width;
}

/**
 * Clamp a label's left x so its full rendered width stays inside a region,
 * preventing long text (a four-digit money label, a long good name) from
 * spilling past the region's edge. When the label is wider than the region
 * itself, the label pins to the region's left edge rather than producing a
 * negative-width remainder.
 *
 * @param x - Proposed left x for the label.
 * @param labelWidth - The label's rendered width in viewBox units.
 * @param region - Region the label must stay within.
 * @returns The clamped left x for the label.
 */
export function clampLabelX(x: number, labelWidth: number, region: Rect): number {
  const minX = region.left;
  const maxX = region.right - labelWidth;
  if (maxX < minX) {
    return minX;
  }
  const clamped = x < minX ? minX : x > maxX ? maxX : x;
  return clamped;
}
