/**
 * Inline-SVG map renderer for the M.U.L.E. board.
 *
 * Renders a `GameState`'s plot grid as one `<svg>` inside the given
 * container: terrain fills, ownership borders, and placed M.U.L.E. outfit
 * glyphs. Every plot cell carries `data-row`, `data-col`, `data-terrain`, and
 * (when owned) `data-owner` attributes so tests and later input code can
 * query the DOM directly instead of recomputing layout.
 */

import type { GameState, Plot } from "../engine/game_state";
import {
  PLAYER_COLORS,
  TERRAIN_FILLS,
  buildSpriteDefsMarkup,
  resourceIconSymbolId,
} from "./sprites";

/** Pixel size of one board cell in the rendered SVG's viewBox units. */
const CELL_SIZE = 60;
/** Stroke width for a plot's ownership border. */
const OWNER_BORDER_WIDTH = 4;

/** Optional rendering knobs; reserved for future callers, currently unused. */
export interface MapRenderOptions {
  readonly cellSize?: number;
}

/**
 * Render `state`'s board into `container` as an inline `<svg>`, replacing
 * any prior content.
 *
 * @param container - Element to render into; its existing children are
 *   cleared first.
 * @param state - Game state supplying the plot grid to render.
 * @param opts - Optional rendering knobs (cell size).
 */
export function renderMap(container: Element, state: GameState, opts?: MapRenderOptions): void {
  const cellSize = opts?.cellSize ?? CELL_SIZE;
  const rows = state.plots.length;
  const cols = rows > 0 ? state.plots[0]!.length : 0;
  const width = cols * cellSize;
  const height = rows * cellSize;

  let markup = "";
  markup += `<svg class="map-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Colony map">`;
  markup += buildSpriteDefsMarkup();
  for (let row = 0; row < rows; row++) {
    const plotRow = state.plots[row]!;
    for (let col = 0; col < cols; col++) {
      const plot = plotRow[col]!;
      markup += renderPlotCell(plot, row, col, cellSize);
    }
  }
  markup += "</svg>";

  container.innerHTML = markup;
}

/**
 * Render one plot's cell group: a terrain-filled rect, an ownership border
 * when owned, and a M.U.L.E. glyph plus outfit icon when a M.U.L.E. is
 * installed.
 *
 * @param plot - Plot to render.
 * @param row - Zero-based row index, also written as `data-row`.
 * @param col - Zero-based col index, also written as `data-col`.
 * @param cellSize - Pixel size of one cell.
 * @returns Raw SVG markup for the plot's `<g>` group.
 */
function renderPlotCell(plot: Plot, row: number, col: number, cellSize: number): string {
  const x = col * cellSize;
  const y = row * cellSize;
  const fill = TERRAIN_FILLS[plot.terrain];
  const ownerAttr = plot.owner === null ? "" : ` data-owner="${plot.owner}"`;
  const strokeColor = plot.owner === null ? "#000000" : PLAYER_COLORS[plot.owner]!;
  const strokeWidth = plot.owner === null ? 1 : OWNER_BORDER_WIDTH;

  let markup = `<g data-row="${row}" data-col="${col}" data-terrain="${plot.terrain}"${ownerAttr}>`;
  markup += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" `;
  markup += `fill="${fill}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`;
  if (plot.muleOutfit !== null) {
    markup += renderMuleGlyph(plot, x, y, cellSize);
  }
  markup += "</g>";
  return markup;
}

/**
 * Render a placed M.U.L.E.'s walker glyph plus its outfit icon, centered in
 * the cell. The walker is tinted with the owning player's color so ownership
 * reads at map scale even without the border.
 *
 * @param plot - Plot carrying the M.U.L.E. (must have `muleOutfit` set).
 * @param x - Cell's left edge in viewBox units.
 * @param y - Cell's top edge in viewBox units.
 * @param cellSize - Pixel size of one cell.
 * @returns Raw SVG markup for the glyph group.
 */
function renderMuleGlyph(plot: Plot, x: number, y: number, cellSize: number): string {
  if (plot.muleOutfit === null) {
    throw new Error("renderMuleGlyph: plot has no muleOutfit");
  }
  const muleSize = cellSize * 0.6;
  const muleX = x + (cellSize - muleSize) / 2;
  const muleY = y + (cellSize - muleSize) / 2;
  const muleColor = plot.owner === null ? "#e6e6e6" : PLAYER_COLORS[plot.owner]!;

  const iconSize = cellSize * 0.22;
  const iconX = x + cellSize - iconSize - 2;
  const iconY = y + 2;

  let markup = `<g data-outfit="${plot.muleOutfit}">`;
  markup += `<use href="#sprite-mule" x="${muleX}" y="${muleY}" width="${muleSize}" height="${muleSize}" fill="${muleColor}" />`;
  markup += `<use href="#${resourceIconSymbolId(plot.muleOutfit)}" x="${iconX}" y="${iconY}" `;
  markup += `width="${iconSize}" height="${iconSize}" />`;
  markup += "</g>";
  return markup;
}
