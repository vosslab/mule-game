// Inline-SVG board as a SolidJS component.
//
// Renders the same board markup the imperative renderMap (src/ui/map_render.ts)
// produced, attribute for attribute, so the Playwright selector contract holds
// across the port: `.map-svg`, per-cell `g[data-row][data-col][data-terrain]`
// with `data-owner` when owned, and the placed-M.U.L.E. `g[data-outfit]` group.
// The `.plot-cursor` class the input layer toggles on a cell group still
// applies unchanged, since the cell groups keep their shape.
//
// The legacy renderMap stays in place for the game driver during M1; this
// component drives the Solid-rendered screens (the ?demo=map fixture screen in
// M1, every screen in M2). The shared sprite <defs> markup is reused verbatim
// via innerHTML so the sprite source stays single (src/ui/sprites.ts).
//
// Solid discipline: run-once component, props read through the props object,
// <For> for the row and column lists, and createMemo for the derived viewBox
// dimensions.
//
// Ambient animation: the river tile's `<use>` carries a
// `.terrain-tile-use` class and the installed M.U.L.E.'s `<use>` carries a
// `.mule-installed-glyph` class, purely as CSS hooks -- the shimmer/idle-bob
// keyframes themselves live in src/style.css, gated behind `@media
// (prefers-reduced-motion: no-preference)`. No signal or state lives here;
// this file only supplies the selector to hang the animation on.

import { For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import type { GameState, Plot } from "../../engine/game_state";
import { PLOT_COLS, PLOT_ROWS, visibleCrystite } from "../../engine/game_state";
import { TERRAIN_FILLS, buildSpriteDefsMarkup, playerColor } from "../sprites";
import { buildTerrainSpriteDefsMarkup, terrainSymbolId } from "../sprites/sprites_terrain";
import {
  MULE_INSTALLED_ID,
  muleOutfitSymbolId,
  buildMuleSpriteDefsMarkup,
} from "../sprites/sprites_mule";

/** Pixel size of one board cell in the rendered SVG's viewBox units. */
const CELL_SIZE = 60;
/** Stroke width for a plot's ownership border. */
const OWNER_BORDER_WIDTH = 4;

/** A board cursor position, or null when no cursor is shown. */
export interface MapCursor {
  readonly row: number;
  readonly col: number;
}

/** Props for the map layer. */
export interface MapLayerProps {
  /** Game state supplying the plot grid to render. */
  readonly state: GameState;
  /**
   * Highlighted cell during a human land-grant pick, or null/undefined when no
   * cursor is shown. Exactly one cell carries the `plot-cursor` class.
   */
  readonly cursor?: MapCursor | null;
  /**
   * Optional plot-click handler (land-grant claim delegation). Fires with the
   * clicked cell's row and col; the caller decides legality.
   */
  readonly onPlotClick?: (row: number, col: number) => void;
}

//============================================
/**
 * Render the board as one inline `<svg>`: the shared sprite defs, then one cell
 * group per plot.
 *
 * @param props - Carries the reactive game state.
 * @returns The board `<svg>` element.
 */
export function MapLayer(props: MapLayerProps): JSX.Element {
  const width = createMemo(() => PLOT_COLS * CELL_SIZE);
  const height = createMemo(() => PLOT_ROWS * CELL_SIZE);
  return (
    <svg class="map-svg" viewBox={`0 0 ${width()} ${height()}`} role="img" aria-label="Colony map">
      {/* All sprite defs mount once here, not per cell: buildSpriteDefsMarkup
          (legacy mule/resource-icon glyphs), buildTerrainSpriteDefsMarkup (the
          7 terrain tiles), and buildMuleSpriteDefsMarkup (the installed-mule
          pose plus its 4 outfit badges) each build one flat markup string, so
          concatenating and setting innerHTML once is a single DOM write
          regardless of board size. */}
      <g
        innerHTML={
          buildSpriteDefsMarkup() + buildTerrainSpriteDefsMarkup() + buildMuleSpriteDefsMarkup()
        }
      />
      <For each={props.state.plots}>
        {(plotRow, row) => (
          <For each={plotRow}>
            {(plot, col) => (
              <PlotCell
                plot={plot}
                row={row()}
                col={col()}
                cursor={props.cursor ?? null}
                onPlotClick={props.onPlotClick}
              />
            )}
          </For>
        )}
      </For>
    </svg>
  );
}

/** Props for one plot cell. */
interface PlotCellProps {
  /** Plot to render. */
  readonly plot: Plot;
  /** Zero-based row index, written as `data-row`. */
  readonly row: number;
  /** Zero-based col index, written as `data-col`. */
  readonly col: number;
  /** Board cursor, or null; this cell is highlighted when it matches. */
  readonly cursor: MapCursor | null;
  /** Optional click handler firing with this cell's row and col. */
  readonly onPlotClick?: (row: number, col: number) => void;
}

//============================================
/**
 * Render one plot's cell group: the terrain tile art, an ownership border when
 * owned, and a M.U.L.E. glyph when a M.U.L.E. is installed.
 *
 * The terrain `<use>` draws first (the visible tile texture -- grass tufts,
 * river ripples, mountain peak count, town buildings, or crater glints, per
 * `sprites_terrain.ts`), then the same `data-row`/`data-col`/`data-terrain`
 * `<rect>` the Playwright selector contract (`map_render.spec.mjs`) has always
 * depended on draws on top with `fill-opacity={0}`: its `fill` attribute still
 * carries the terrain's flat color (so `g[data-terrain] > rect`'s fill
 * assertion is unaffected), but the attribute is invisible at render time so
 * the terrain art beneath shows through, while its `stroke` -- the ownership
 * border -- paints fully opaque on top exactly as before.
 *
 * @param props - Carries the plot and its grid position.
 * @returns The plot's `<g>` group.
 */
function PlotCell(props: PlotCellProps): JSX.Element {
  const x = (): number => props.col * CELL_SIZE;
  const y = (): number => props.row * CELL_SIZE;
  const strokeColor = (): string =>
    props.plot.owner === null ? "#000000" : playerColor(props.plot.owner);
  const strokeWidth = (): number => (props.plot.owner === null ? 1 : OWNER_BORDER_WIDTH);
  // The cursor highlight is a class so it survives fine-grained reconciles: it
  // is toggled reactively as the cursor moves without recreating the cell.
  const isCursor = (): boolean =>
    props.cursor !== null && props.cursor.row === props.row && props.cursor.col === props.col;
  const handleClick = (): void => props.onPlotClick?.(props.row, props.col);
  return (
    <g
      data-row={props.row}
      data-col={props.col}
      data-terrain={props.plot.terrain}
      data-owner={props.plot.owner ?? undefined}
      classList={{ "plot-cursor": isCursor() }}
      onClick={handleClick}
    >
      <use
        href={`#${terrainSymbolId(props.plot.terrain)}`}
        class="terrain-tile-use"
        x={x()}
        y={y()}
        width={CELL_SIZE}
        height={CELL_SIZE}
      />
      <rect
        x={x()}
        y={y()}
        width={CELL_SIZE}
        height={CELL_SIZE}
        fill={TERRAIN_FILLS[props.plot.terrain]}
        fill-opacity={0}
        stroke={strokeColor()}
        stroke-width={strokeWidth()}
      />
      <Show when={props.plot.muleOutfit !== null}>
        <MuleGlyph plot={props.plot} x={x()} y={y()} />
      </Show>
      <Show when={visibleCrystite(props.plot) !== null}>
        <CrystiteBadge level={visibleCrystite(props.plot)!} x={x()} y={y()} />
      </Show>
    </g>
  );
}

/** Props for a revealed-crystite badge. */
interface CrystiteBadgeProps {
  /** The assayed crystite level to show (0 = none, up to 4). */
  readonly level: 0 | 1 | 2 | 3 | 4;
  /** Cell's left edge in viewBox units. */
  readonly x: number;
  /** Cell's top edge in viewBox units. */
  readonly y: number;
}

//============================================
/**
 * Render an assayed plot's crystite badge in the cell's top-left corner: a
 * crystite-tinted disc with the revealed level number. Only shown once a plot
 * has been assayed (the `visibleCrystite` gate), so it never leaks hidden bloom
 * data; a revealed level of 0 reads as "assayed, no crystite here".
 *
 * @param props - Carries the revealed level and the cell origin.
 * @returns The badge `<g data-crystite>` group.
 */
function CrystiteBadge(props: CrystiteBadgeProps): JSX.Element {
  const radius = CELL_SIZE * 0.15;
  const cx = (): number => props.x + radius + 3;
  const cy = (): number => props.y + radius + 3;
  return (
    <g data-crystite={props.level} class="plot-crystite-badge">
      <circle cx={cx()} cy={cy()} r={radius} fill="#7b2ff7" stroke="#0f0f1e" stroke-width={1} />
      <text
        x={cx()}
        y={cy()}
        text-anchor="middle"
        dominant-baseline="central"
        font-size={`${radius * 1.4}`}
        fill="#ffffff"
      >
        {props.level}
      </text>
    </g>
  );
}

/** Props for a placed M.U.L.E.'s glyph. */
interface MuleGlyphProps {
  /** Plot carrying the M.U.L.E.; its `muleOutfit` must be set. */
  readonly plot: Plot;
  /** Cell's left edge in viewBox units. */
  readonly x: number;
  /** Cell's top edge in viewBox units. */
  readonly y: number;
}

//============================================
/**
 * Render a placed M.U.L.E.'s installed-pose glyph plus its outfit badge,
 * centered in the cell. The walker is tinted with the owning player's color
 * (via the `color` CSS property, since `sprites_mule.ts` fills every shape
 * with `currentColor`) so ownership reads at map scale even without the
 * border, and the outfit badge -- one of the 4 distinct resource silhouettes
 * from `sprites_mule.ts`'s outfit-marker system -- stays visible once the
 * M.U.L.E. is placed, not only while it is towed (the art-gate round-2
 * MARGINAL finding this closes: installed mules previously carried no
 * visible outfit signal at all).
 *
 * @param props - Carries the plot and its cell origin.
 * @returns The glyph `<g data-outfit>` group.
 */
function MuleGlyph(props: MuleGlyphProps): JSX.Element {
  const outfit = props.plot.muleOutfit;
  if (outfit === null) {
    throw new Error("MuleGlyph: plot has no muleOutfit");
  }
  const muleSize = CELL_SIZE * 0.6;
  const badgeSize = CELL_SIZE * 0.24;
  const muleX = (): number => props.x + (CELL_SIZE - muleSize) / 2;
  const muleY = (): number => props.y + (CELL_SIZE - muleSize) / 2;
  const muleColor = (): string =>
    props.plot.owner === null ? "#e6e6e6" : playerColor(props.plot.owner);
  const badgeX = (): number => props.x + CELL_SIZE - badgeSize - 2;
  const badgeY = (): number => props.y + 2;
  return (
    <g data-outfit={outfit}>
      <use
        href={`#${MULE_INSTALLED_ID}`}
        class="mule-installed-glyph"
        x={muleX()}
        y={muleY()}
        width={muleSize}
        height={muleSize}
        style={{ color: muleColor() }}
      />
      <use
        href={`#${muleOutfitSymbolId(outfit)}`}
        x={badgeX()}
        y={badgeY()}
        width={badgeSize}
        height={badgeSize}
      />
    </g>
  );
}
