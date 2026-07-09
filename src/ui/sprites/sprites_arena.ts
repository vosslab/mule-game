/**
 * SVG auction-arena chrome sprite defs: backdrop panel, vertical
 * price-axis styling elements (axis bar, tick, store-band bracket), and a
 * trade-flash burst, following the shape language, stroke policy, and
 * depth-and-shading policy in docs/active_plans/active/mule_art_style_spec.md.
 *
 * Domain: `arena`, ratified in
 * docs/active_plans/active/mule_art_style_spec.md's symbol-id naming
 * convention (originally fixed to `terrain`, `species`, `mule`, `town`,
 * `event`, `icon` with no `arena`/`auction` entry; this module shipped its
 * symbols as `sprite-icon-auction-<name>` under the `icon` domain until
 * that ratification landed). Every id here is now `sprite-arena-<name>`.
 *
 * Viewbox sizing is kept separate from a shared module-level constant:
 * these chrome pieces are not one of the spec's 4 documented sprite
 * classes (icon/actor/terrain/building), so this module chooses a viewBox
 * per shape that keeps composition simple for a caller layering it behind
 * the existing `.auction-track-*` markup in `src/ui/auction_screen.ts`
 * (`TRACK_WIDTH = 280`, `TRACK_HEIGHT = 400`, echoed here so the backdrop
 * and axis bar line up with that panel's own dimensions). This module does
 * NOT edit `auction_screen.ts` or `style.css`; it only supplies symbols a
 * later scene workstream can wire in.
 */

import { PALETTE } from "./palette";

/** Matches `TRACK_WIDTH` in src/ui/auction_screen.ts, so the backdrop lines up. */
const ARENA_TRACK_WIDTH = 280;

/** Matches `TRACK_HEIGHT` in src/ui/auction_screen.ts, so the axis bar lines up. */
const ARENA_TRACK_HEIGHT = 400;

/** Fixed set of arena chrome pieces this module draws. */
export const ARENA_CHROME_NAMES = [
  "backdrop",
  "axis-bar",
  "axis-tick",
  "store-band",
  "trade-flash",
] as const;

export type ArenaChromeName = (typeof ARENA_CHROME_NAMES)[number];

/**
 * Build the symbol id for one arena chrome piece, per the naming
 * convention `sprite-<domain>-<name>[-frameN]` in
 * docs/active_plans/active/mule_art_style_spec.md, using the `arena`
 * domain ratified there.
 *
 * @param chromeName - Which arena chrome symbol to look up.
 * @returns The `<defs>` symbol id for that chrome piece.
 */
export function arenaSymbolId(chromeName: ArenaChromeName): string {
  return `sprite-arena-${chromeName}`;
}

/**
 * Build the shared `<defs>` markup for the arena chrome set: backdrop,
 * axis bar, axis tick, store-band bracket, and trade-flash burst.
 *
 * @returns Raw SVG markup for a single `<defs>` element.
 */
export function buildArenaSpriteDefsMarkup(): string {
  let markup = "<defs>";
  markup += buildBackdropSymbol();
  markup += buildAxisBarSymbol();
  markup += buildAxisTickSymbol();
  markup += buildStoreBandSymbol();
  markup += buildTradeFlashSymbol();
  markup += "</defs>";
  return markup;
}

//============================================
// Backdrop: a rounded panel sized to match the live track's own viewBox,
// with a faint top highlight and bottom shadow band (the spec's two-shade
// budget, as flat overlay rects rather than a gradient).
function buildBackdropSymbol(): string {
  let markup = `<symbol id="${arenaSymbolId("backdrop")}" viewBox="0 0 ${ARENA_TRACK_WIDTH} ${ARENA_TRACK_HEIGHT}">`;
  markup += `<rect x="2" y="2" width="${ARENA_TRACK_WIDTH - 4}" height="${ARENA_TRACK_HEIGHT - 4}" rx="10" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  markup += `<rect x="2" y="2" width="${ARENA_TRACK_WIDTH - 4}" height="20" fill="${PALETTE.textPrimary}" opacity="0.05" />`;
  markup += `<rect x="2" y="${ARENA_TRACK_HEIGHT - 22}" width="${ARENA_TRACK_WIDTH - 4}" height="20" fill="${PALETTE.bgDeep}" opacity="0.25" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Axis bar: a slim rounded vertical bar, the chrome version of the plain
// `.auction-track-axis` line, sized to the same track height.
function buildAxisBarSymbol(): string {
  let markup = `<symbol id="${arenaSymbolId("axis-bar")}" viewBox="0 0 16 ${ARENA_TRACK_HEIGHT}">`;
  markup += `<rect x="6" y="0" width="4" height="${ARENA_TRACK_HEIGHT}" rx="2" fill="${PALETTE.bgTrackAxis}" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Axis tick: a small reusable dash, stamped along the axis bar at each
// price gridline by the caller.
function buildAxisTickSymbol(): string {
  let markup = `<symbol id="${arenaSymbolId("axis-tick")}" viewBox="0 0 24 8">`;
  markup += `<rect x="0" y="3" width="24" height="2" fill="${PALETTE.bgTrackAxis}" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Store-band bracket: a full-width band marking the store buy/sell price
// zone, echoing the dashed `.auction-track-store-buy-line` /
// `-sell-line` pair as a single stretchable bracket a caller positions
// between those two y-coordinates and scales to the band height.
function buildStoreBandSymbol(): string {
  let markup = `<symbol id="${arenaSymbolId("store-band")}" viewBox="0 0 ${ARENA_TRACK_WIDTH} 40">`;
  markup += `<rect x="0" y="0" width="${ARENA_TRACK_WIDTH}" height="2" fill="${PALETTE.textPrimary}" opacity="0.6" />`;
  markup += `<rect x="0" y="38" width="${ARENA_TRACK_WIDTH}" height="2" fill="${PALETTE.textPrimary}" opacity="0.6" />`;
  markup += `<rect x="0" y="0" width="3" height="40" fill="${PALETTE.textPrimary}" opacity="0.4" />`;
  markup += `<rect x="${ARENA_TRACK_WIDTH - 3}" y="0" width="3" height="40" fill="${PALETTE.textPrimary}" opacity="0.4" />`;
  markup += `<rect x="0" y="0" width="${ARENA_TRACK_WIDTH}" height="40" fill="${PALETTE.gold}" opacity="0.06" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Trade-flash: an 8-point starburst in `gold`, matching
// `.auction-screen-trade-flash`'s existing gold text color, for a caller
// to flash briefly around a token when a trade executes.
function buildTradeFlashSymbol(): string {
  let markup = `<symbol id="${arenaSymbolId("trade-flash")}" viewBox="0 0 32 32">`;
  markup += `<polygon points="16,0 20,12 32,16 20,20 16,32 12,20 0,16 12,12" fill="${PALETTE.gold}" />`;
  markup += `<circle cx="16" cy="16" r="6" fill="${PALETTE.gold}" opacity="0.8" />`;
  markup += "</symbol>";
  return markup;
}
