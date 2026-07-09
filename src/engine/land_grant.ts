/**
 * Land-grant phase helpers for the M.U.L.E. engine.
 *
 * v1 models the land grant as a snake-order draft: each round every player
 * picks one plot (or passes) in an order that reverses each successive round.
 * The original game's simultaneous land lottery moves to a future fidelity
 * plan (see the plan's Resolved decisions). An engine-driven sweep cursor
 * layers on top of this same turn-sequential picker
 * order (see `advanceSweepCursor`/`worstRankedClaimant` below): the cursor's
 * position is real engine state, but who may act each moment is still
 * governed by `pickOrder`/`pickIndex`/`currentPicker`, unchanged.
 *
 * Everything here is a pure function over its arguments: no mutation, no DOM,
 * no module-level state. Phase advancement (when the pick order is exhausted)
 * is owned by turn.ts, which calls these helpers.
 */

import type { GameState, Plot } from "./game_state";
import type { LandGrantPayload } from "./game_state";
import { rankOrder } from "./events";

/**
 * Build the snake-order pick sequence for a land-grant round. Player ids run
 * forward (0..3) on odd rounds and reverse (3..0) on even rounds, so the draft
 * order alternates each round.
 *
 * @param round - Current round number (1-based).
 * @param playerCount - Number of players in the game.
 * @returns The ordered list of player ids picking this round.
 */
export function landGrantPickOrder(round: number, playerCount: number): number[] {
  const order: number[] = [];
  for (let playerId = 0; playerId < playerCount; playerId += 1) {
    order.push(playerId);
  }
  // Even rounds reverse the order so successive rounds snake back and forth.
  if (round % 2 === 0) {
    order.reverse();
  }
  return order;
}

/**
 * Build a fresh land-grant payload for the start of a round: the round's pick
 * order at index zero, plus the sweep cursor seeded at the first free
 * (unowned, non-town) plot in raster order.
 *
 * @param round - Current round number (1-based).
 * @param playerCount - Number of players in the game.
 * @param plots - Current board grid, to seed the sweep cursor's start position.
 * @returns Payload with the round's pick order, pick index at zero, and the
 *   seeded sweep cursor.
 */
export function createLandGrantPayload(
  round: number,
  playerCount: number,
  plots: readonly (readonly Plot[])[],
): LandGrantPayload {
  const pickOrder = landGrantPickOrder(round, playerCount);
  const start = firstFreePlot(plots);
  return { pickOrder, pickIndex: 0, sweepRow: start.row, sweepCol: start.col };
}

/**
 * True when the plot at (row, col) exists, is unowned, and is not the town --
 * the same legality a land-grant claim requires.
 *
 * @param plots - Current board grid, indexed as `plots[row][col]`.
 * @param row - Zero-based row index.
 * @param col - Zero-based col index.
 * @returns True when the plot may be claimed.
 */
export function isFreePlot(plots: readonly (readonly Plot[])[], row: number, col: number): boolean {
  const plot = plots[row]?.[col];
  return plot !== undefined && plot.owner === null && plot.terrain !== "town";
}

/**
 * The first free plot in raster (row-major) order, or `{row: 0, col: 0}` when
 * the board has no free plot at all (a degenerate board; `advanceSweepCursor`
 * is likewise a no-op in that case, and `claim_current_plot` would throw when
 * attempted, matching every other illegal-claim path in this module).
 *
 * @param plots - Current board grid.
 * @returns The first free plot's position, raster order.
 */
function firstFreePlot(plots: readonly (readonly Plot[])[]): { row: number; col: number } {
  for (let row = 0; row < plots.length; row += 1) {
    const plotRow = plots[row];
    if (plotRow === undefined) {
      continue;
    }
    for (let col = 0; col < plotRow.length; col += 1) {
      if (isFreePlot(plots, row, col)) {
        return { row, col };
      }
    }
  }
  return { row: 0, col: 0 };
}

/**
 * Advance the sweep cursor to the next free plot after (row, col) in raster
 * order, wrapping from the last cell back to (0, 0). Skips over any plot
 * claimed since the cursor last visited it (a plot claimed by an earlier
 * picker this round), so the cursor never dwells on a now-owned cell. Returns
 * the same position unchanged if the board has no free plot left to sweep to
 * (every position revisited without finding one) -- this only happens on a
 * fully-claimed board, at which point the land-grant round is ending via
 * `pickOrder` exhaustion regardless.
 *
 * @param plots - Current board grid.
 * @param row - Cursor's current row.
 * @param col - Cursor's current col.
 * @returns The next sweep position.
 */
export function advanceSweepCursor(
  plots: readonly (readonly Plot[])[],
  row: number,
  col: number,
): { row: number; col: number } {
  const totalRows = plots.length;
  const totalCols = totalRows > 0 ? (plots[0]?.length ?? 0) : 0;
  const totalCells = totalRows * totalCols;
  if (totalCells === 0) {
    return { row, col };
  }
  let index = row * totalCols + col;
  for (let step = 0; step < totalCells; step += 1) {
    index = (index + 1) % totalCells;
    const nextRow = Math.floor(index / totalCols);
    const nextCol = index % totalCols;
    if (isFreePlot(plots, nextRow, nextCol)) {
      return { row: nextRow, col: nextCol };
    }
  }
  return { row, col };
}

/**
 * Resolve a plot claim among simultaneous candidates by picking the
 * worst-ranked (lowest current score) contender. Mirrors planet_mule's
 * `LandGrantPhase.checkDone` (`LandGrantPhase.java` lines 281-315): among
 * players who pressed within the same plot's dwell window, the one with the
 * worse `Player.getRank()` (`player2.getRank() < player.getRank()` keeps the
 * already-selected, higher/worse rank number) is granted the plot -- the
 * worst-placed player gets priority, helping them catch up.
 *
 * This engine's land-grant round stays turn-sequential (one active picker at
 * a time, gated by `currentPicker`; see the module doc above), so
 * `claim_current_plot` only ever calls this with a single candidate today.
 * The tie-break is implemented and independently tested here so a future
 * simultaneous-picking mode (the "future fidelity plan" the module doc
 * already flags) can reuse it without re-deriving the rule.
 *
 * @param candidateIds - Player ids contending for the same plot.
 * @param state - Current game state (ranked via `rankOrder`).
 * @returns The worst-ranked candidate id.
 * @throws If `candidateIds` is empty.
 */
export function worstRankedClaimant(candidateIds: readonly number[], state: GameState): number {
  if (candidateIds.length === 0) {
    throw new Error("worstRankedClaimant: no candidates");
  }
  const order = rankOrder(state);
  let worst = candidateIds[0] as number;
  let worstPosition = order.indexOf(worst);
  for (const id of candidateIds) {
    const position = order.indexOf(id);
    if (position > worstPosition) {
      worst = id;
      worstPosition = position;
    }
  }
  return worst;
}

/**
 * The player id whose pick is current, or null when every pick has been made.
 *
 * @param payload - Current land-grant payload.
 * @returns The current picker's player id, or null if the order is exhausted.
 */
export function currentPicker(payload: LandGrantPayload): number | null {
  if (payload.pickIndex >= payload.pickOrder.length) {
    return null;
  }
  const picker = payload.pickOrder[payload.pickIndex];
  if (picker === undefined) {
    return null;
  }
  return picker;
}

/**
 * Advance the pick order by one (after a claim or a pass).
 *
 * @param payload - Current land-grant payload.
 * @returns A new payload with `pickIndex` incremented by one.
 */
export function advancePick(payload: LandGrantPayload): LandGrantPayload {
  return { ...payload, pickIndex: payload.pickIndex + 1 };
}

/**
 * Return true when the land-grant pick order has been exhausted and the phase
 * should advance to development.
 *
 * @param payload - Current land-grant payload.
 * @returns True if every player has taken their pick or pass.
 */
export function isLandGrantComplete(payload: LandGrantPayload): boolean {
  return payload.pickIndex >= payload.pickOrder.length;
}

/**
 * Claim an unowned, non-town plot for a player, returning a new board grid.
 * Throws if the target position is out of range, is the town, or is already
 * owned, so an illegal claim fails loudly rather than silently no-op.
 *
 * @param plots - Current board grid, indexed as `plots[row][col]`.
 * @param playerId - Player claiming the plot.
 * @param row - Zero-based row index of the target plot.
 * @param col - Zero-based column index of the target plot.
 * @returns A new board grid with the target plot's owner set to `playerId`.
 */
export function claimPlotOnBoard(
  plots: readonly (readonly Plot[])[],
  playerId: number,
  row: number,
  col: number,
): Plot[][] {
  const targetRow = plots[row];
  if (targetRow === undefined) {
    throw new Error(`claimPlotOnBoard: row ${row} out of range`);
  }
  const target = targetRow[col];
  if (target === undefined) {
    throw new Error(`claimPlotOnBoard: col ${col} out of range`);
  }
  if (target.terrain === "town") {
    throw new Error(`claimPlotOnBoard: cannot claim the town plot at (${row}, ${col})`);
  }
  if (target.owner !== null) {
    throw new Error(`claimPlotOnBoard: plot (${row}, ${col}) already owned by ${target.owner}`);
  }
  // Rebuild only the changed row and plot; other rows are shared unchanged.
  return plots.map((plotRow, rowIndex) => {
    if (rowIndex !== row) {
      return plotRow.slice();
    }
    return plotRow.map((plot, colIndex) => {
      if (colIndex !== col) {
        return plot;
      }
      return { ...plot, owner: playerId };
    });
  });
}
