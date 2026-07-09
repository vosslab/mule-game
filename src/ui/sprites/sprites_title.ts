/**
 * SVG title-screen sprite defs: the M.U.L.E. wordmark, a planet backdrop
 * with rings, a reusable starfield star, a landing-ship silhouette, and a
 * species-select portrait plate, following the shape language, stroke
 * policy, and depth-and-shading policy in
 * docs/active_plans/active/mule_art_style_spec.md.
 *
 * Domain: `title`, ratified in the spec doc's symbol-id
 * naming convention. None of the fixed domains that existed before this
 * patch (`terrain`, `species`, `mule`, `town`, `event`, `icon`) fit a
 * backdrop-scale composite scene element like a planet disc or a wordmark;
 * `icon` specifically implies the 16x16 icon-scale ViewBox convention,
 * which these assets do not follow. See the spec doc's naming-convention
 * section for the one-line domain rationale and the per-shape viewBox
 * table this module follows (there is no single fixed ViewBox for `title`,
 * matching the precedent `sprites_arena.ts` set for `arena` chrome: each
 * shape gets the viewBox its own composition needs).
 *
 * The wordmark is drawn as a 5x7 dot-matrix pixel font (the same
 * technique classic LED/scoreboard displays use), not SVG `<text>`: every
 * other sprite module in this set builds shapes from the primitive
 * vocabulary (rects, circles, polygons) in the style spec's Shape language
 * section, and a blocky pixel font keeps the wordmark in that same family
 * while reading as a deliberate retro (Atari-era) accent rather than a
 * plain system font.
 *
 * This module also provides the plan's "HUD chrome + timer bar styling"
 * deliverable: a panel-corner accent and a timer-bar frame/fill-cap pair.
 * These are symbols/decorative elements only -- no `style.css` edits, per
 * this workstream's scope -- for a later scene workstream to wire in.
 * Domain: `icon`, reusing the precedent `sprites_arena.ts` set for HUD
 * chrome (a custom per-shape viewBox under the `icon` domain rather than
 * the strict 16x16 icon-scale ViewBox convention), since these are small
 * decorative UI marks, not backdrop-scale scene elements like the title
 * assets above.
 */

import { PALETTE } from "./palette";

//============================================
// Wordmark: 5x7 dot-matrix pixel font, one glyph per M.U.L.E. character
// (the 4 letters plus the acronym's own periods).
type LogoChar = "M" | "U" | "L" | "E" | ".";
type PixelGlyph = readonly [string, string, string, string, string, string, string];

const PIXEL_FONT: Readonly<Record<LogoChar, PixelGlyph>> = {
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
};

/** The full wordmark, character by character, including the acronym's periods. */
const LOGO_CHARS: readonly LogoChar[] = ["M", ".", "U", ".", "L", ".", "E", "."];

const LOGO_PIXEL_UNIT = 4;
const LOGO_GLYPH_COLS = 5;
const LOGO_GLYPH_ROWS = 7;
const LOGO_GLYPH_WIDTH = LOGO_GLYPH_COLS * LOGO_PIXEL_UNIT;
const LOGO_GLYPH_HEIGHT = LOGO_GLYPH_ROWS * LOGO_PIXEL_UNIT;
const LOGO_GLYPH_GAP = 6;
const LOGO_CHAR_ADVANCE = LOGO_GLYPH_WIDTH + LOGO_GLYPH_GAP;
const LOGO_MARGIN = 4;
const LOGO_SHADOW_OFFSET = 2;
const LOGO_VIEWBOX_WIDTH =
  LOGO_MARGIN * 2 + LOGO_CHARS.length * LOGO_CHAR_ADVANCE - LOGO_GLYPH_GAP + LOGO_SHADOW_OFFSET;
const LOGO_VIEWBOX_HEIGHT = LOGO_MARGIN * 2 + LOGO_GLYPH_HEIGHT + LOGO_SHADOW_OFFSET;

/** Symbol id for the M.U.L.E. wordmark. */
export const TITLE_LOGO_SYMBOL_ID = "sprite-title-logo";

/** Symbol id for the planet backdrop disc (with rings). */
export const TITLE_PLANET_SYMBOL_ID = "sprite-title-planet";

/** Symbol id for one reusable starfield star, tiled by the caller. */
export const TITLE_STAR_SYMBOL_ID = "sprite-title-star";

/** Symbol id for the landing-ship silhouette. */
export const TITLE_SHIP_SYMBOL_ID = "sprite-title-ship";

/**
 * Symbol id for the species-select portrait plate: a frame sized to hold
 * one `sprites_species.ts` avatar (32x32), nested via a caller's own
 * `<use>` at `PORTRAIT_PLATE_AVATAR_OFFSET`.
 */
export const TITLE_PORTRAIT_PLATE_SYMBOL_ID = "sprite-title-portrait-plate";

/** Plate viewBox edge length (32 avatar + 4px frame margin on each side). */
export const PORTRAIT_PLATE_SIZE = 40;

/** Offset + size a caller uses to nest a 32x32 species avatar inside the plate. */
export const PORTRAIT_PLATE_AVATAR_OFFSET = 4;

/** Symbol id for one HUD panel-corner accent, tiled at all 4 corners by the caller. */
export const HUD_PANEL_CORNER_SYMBOL_ID = "sprite-icon-hud-corner";

/** Symbol id for the timer-bar's stretchable outer frame. */
export const TIMER_BAR_FRAME_SYMBOL_ID = "sprite-icon-timer-frame";

/** Symbol id for the timer-bar fill's rounded leading-edge cap. */
export const TIMER_BAR_FILL_CAP_SYMBOL_ID = "sprite-icon-timer-cap";

/**
 * Build the shared `<defs>` markup for the title-screen sprite set: the
 * wordmark, planet backdrop, one starfield star, the landing ship, the
 * species-select portrait plate, and the HUD chrome / timer-bar pieces.
 *
 * @returns Raw SVG markup for a single `<defs>` element.
 */
export function buildTitleSpriteDefsMarkup(): string {
  let markup = "<defs>";
  markup += buildLogoSymbol();
  markup += buildPlanetSymbol();
  markup += buildStarSymbol();
  markup += buildShipSymbol();
  markup += buildPortraitPlateSymbol();
  markup += buildHudPanelCornerSymbol();
  markup += buildTimerBarFrameSymbol();
  markup += buildTimerBarFillCapSymbol();
  markup += "</defs>";
  return markup;
}

//============================================
// Wordmark: a drop-shadow layer (one shadow step, per the depth-and-
// shading policy) in a darkened tone, then the gold pixel glyphs on top.
function buildLogoSymbol(): string {
  let markup = `<symbol id="${TITLE_LOGO_SYMBOL_ID}" viewBox="0 0 ${LOGO_VIEWBOX_WIDTH} ${LOGO_VIEWBOX_HEIGHT}">`;
  markup += buildWordmarkLayerMarkup(LOGO_SHADOW_OFFSET, LOGO_SHADOW_OFFSET, PALETTE.bgTrackAxis);
  markup += buildWordmarkLayerMarkup(0, 0, PALETTE.gold);
  markup += "</symbol>";
  return markup;
}

//============================================
function buildWordmarkLayerMarkup(offsetX: number, offsetY: number, fill: string): string {
  let markup = "";
  for (const [charIndex, char] of LOGO_CHARS.entries()) {
    const glyphX = LOGO_MARGIN + offsetX + charIndex * LOGO_CHAR_ADVANCE;
    const glyphY = LOGO_MARGIN + offsetY;
    markup += buildGlyphMarkup(char, glyphX, glyphY, fill);
  }
  return markup;
}

//============================================
function buildGlyphMarkup(char: LogoChar, glyphX: number, glyphY: number, fill: string): string {
  let markup = "";
  const rows = PIXEL_FONT[char];
  for (const [row, rowBits] of rows.entries()) {
    for (const [col, bit] of rowBits.split("").entries()) {
      if (bit !== "1") {
        continue;
      }
      const pixelX = glyphX + col * LOGO_PIXEL_UNIT;
      const pixelY = glyphY + row * LOGO_PIXEL_UNIT;
      markup += `<rect x="${pixelX}" y="${pixelY}" width="${LOGO_PIXEL_UNIT}" height="${LOGO_PIXEL_UNIT}" fill="${fill}" />`;
    }
  }
  return markup;
}

//============================================
// Planet backdrop: a large rocky disc (two shade steps: a sunlit
// highlight crescent, a shadow crescent) with a ring arcing across, drawn
// as a back-arc behind the disc and a front-arc in front of it so the
// ring reads as passing through 3D space, not just decorating the surface.
const PLANET_VIEWBOX_SIZE = 200;
const PLANET_CENTER = PLANET_VIEWBOX_SIZE / 2;
const PLANET_RADIUS = 70;

function buildPlanetSymbol(): string {
  let markup = `<symbol id="${TITLE_PLANET_SYMBOL_ID}" viewBox="0 0 ${PLANET_VIEWBOX_SIZE} ${PLANET_VIEWBOX_SIZE}">`;
  markup += buildPlanetRingArcMarkup(0.82);
  markup += `<circle cx="${PLANET_CENTER}" cy="${PLANET_CENTER}" r="${PLANET_RADIUS}" fill="${PALETTE.terrainMountain2}" stroke="${PALETTE.bgTrackAxis}" stroke-width="3" />`;
  markup += `<path d="M ${PLANET_CENTER - 30},${PLANET_CENTER - 45} a 40,40 0 0 1 55,10 a 55,55 0 0 0 -55,-10 Z" fill="${PALETTE.terrainMountain1}" opacity="0.6" />`;
  markup += `<path d="M ${PLANET_CENTER + 15},${PLANET_CENTER + 25} a 45,45 0 0 1 -50,15 a 60,60 0 0 0 50,-15 Z" fill="${PALETTE.bgDeep}" opacity="0.35" />`;
  markup += buildPlanetRingArcMarkup(1.0);
  markup += "</symbol>";
  return markup;
}

//============================================
// One ring arc; `opacityScale` distinguishes the back arc (behind the
// disc, drawn first and dimmer) from the front arc (in front, full
// opacity), so the two calls compose a single ring passing "through" the
// planet without a filter or gradient.
function buildPlanetRingArcMarkup(opacityScale: number): string {
  const ringOpacity = (0.55 * opacityScale).toFixed(2);
  return `<ellipse cx="${PLANET_CENTER}" cy="${PLANET_CENTER}" rx="${PLANET_RADIUS + 28}" ry="18" fill="none" stroke="${PALETTE.gold}" stroke-width="4" opacity="${ringOpacity}" />`;
}

//============================================
// Starfield star: a small 4-point sparkle, icon-scale and strokeless per
// the stroke policy, meant to be tiled at random positions/sizes by the
// caller (`<use>` with per-instance `x`/`y`/`opacity`).
const STAR_VIEWBOX_SIZE = 8;
const STAR_CENTER = STAR_VIEWBOX_SIZE / 2;

function buildStarSymbol(): string {
  let markup = `<symbol id="${TITLE_STAR_SYMBOL_ID}" viewBox="0 0 ${STAR_VIEWBOX_SIZE} ${STAR_VIEWBOX_SIZE}">`;
  markup += `<polygon points="${STAR_CENTER},0 ${STAR_CENTER + 1},${STAR_CENTER - 1} ${STAR_VIEWBOX_SIZE},${STAR_CENTER} ${STAR_CENTER + 1},${STAR_CENTER + 1} ${STAR_CENTER},${STAR_VIEWBOX_SIZE} ${STAR_CENTER - 1},${STAR_CENTER + 1} 0,${STAR_CENTER} ${STAR_CENTER - 1},${STAR_CENTER - 1}" fill="${PALETTE.textPrimary}" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Landing-ship silhouette: a sleek wedge hull in a dark neutral fill (a
// silhouette, not a player-tinted actor), with a gold thruster-flame
// accent -- the "retro palette accent" the spec calls for.
function buildShipSymbol(): string {
  let markup = `<symbol id="${TITLE_SHIP_SYMBOL_ID}" viewBox="0 0 64 40">`;
  markup += `<polygon points="4,30 40,30 60,20 40,10 4,10 14,20" fill="${PALETTE.bgTrackAxis}" stroke="${PALETTE.bgDeep}" stroke-width="2" />`;
  markup += `<rect x="30" y="16" width="14" height="8" rx="2" fill="${PALETTE.textPrimary}" opacity="0.5" />`;
  markup += `<polygon points="2,22 10,20 10,26" fill="${PALETTE.gold}" opacity="0.85" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Portrait plate: a rounded frame sized to hold one species avatar, with
// a small gold corner accent (selection affordance a scene can highlight
// via a CSS class on the `<use>` instance, not a second baked-in state).
function buildPortraitPlateSymbol(): string {
  let markup = `<symbol id="${TITLE_PORTRAIT_PLATE_SYMBOL_ID}" viewBox="0 0 ${PORTRAIT_PLATE_SIZE} ${PORTRAIT_PLATE_SIZE}">`;
  markup += `<rect x="1" y="1" width="${PORTRAIT_PLATE_SIZE - 2}" height="${PORTRAIT_PLATE_SIZE - 2}" rx="4" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  markup += `<polygon points="1,1 9,1 1,9" fill="${PALETTE.gold}" opacity="0.9" />`;
  markup += `<polygon points="${PORTRAIT_PLATE_SIZE - 1},${PORTRAIT_PLATE_SIZE - 1} ${PORTRAIT_PLATE_SIZE - 9},${PORTRAIT_PLATE_SIZE - 1} ${PORTRAIT_PLATE_SIZE - 1},${PORTRAIT_PLATE_SIZE - 9}" fill="${PALETTE.gold}" opacity="0.9" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// HUD panel corner: a small L-shaped bracket accent, icon-scale and
// strokeless, meant to be placed (and mirrored via CSS transforms) at
// each of a HUD panel's 4 corners by the caller.
const HUD_CORNER_SIZE = 16;

function buildHudPanelCornerSymbol(): string {
  let markup = `<symbol id="${HUD_PANEL_CORNER_SYMBOL_ID}" viewBox="0 0 ${HUD_CORNER_SIZE} ${HUD_CORNER_SIZE}">`;
  markup += `<path d="M2,14 L2,4 A2,2 0 0 1 4,2 L14,2" fill="none" stroke="${PALETTE.gold}" stroke-width="2.5" opacity="0.85" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Timer-bar frame: a stretchable rounded outline the caller scales to the
// live timer bar's width, matching `sprites_arena.ts`'s "chrome piece with
// a custom, non-16x16 viewBox" pattern.
const TIMER_FRAME_WIDTH = 120;
const TIMER_FRAME_HEIGHT = 14;

function buildTimerBarFrameSymbol(): string {
  let markup = `<symbol id="${TIMER_BAR_FRAME_SYMBOL_ID}" viewBox="0 0 ${TIMER_FRAME_WIDTH} ${TIMER_FRAME_HEIGHT}">`;
  markup += `<rect x="1" y="1" width="${TIMER_FRAME_WIDTH - 2}" height="${TIMER_FRAME_HEIGHT - 2}" rx="${TIMER_FRAME_HEIGHT / 2 - 1}" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="2" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Timer-bar fill cap: a small rounded cap for the leading edge of the
// timer-bar fill, so a caller composes `cap + stretched fill rect` instead
// of needing a second fill-specific symbol per bar length.
const TIMER_CAP_SIZE = 14;

function buildTimerBarFillCapSymbol(): string {
  let markup = `<symbol id="${TIMER_BAR_FILL_CAP_SYMBOL_ID}" viewBox="0 0 ${TIMER_CAP_SIZE} ${TIMER_CAP_SIZE}">`;
  markup += `<circle cx="${TIMER_CAP_SIZE / 2}" cy="${TIMER_CAP_SIZE / 2}" r="${TIMER_CAP_SIZE / 2 - 1}" fill="${PALETTE.gold}" />`;
  markup += "</symbol>";
  return markup;
}
