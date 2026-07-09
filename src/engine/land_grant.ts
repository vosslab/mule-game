/**
 * Land-grant phase helpers for the M.U.L.E. engine.
 *
 * v1 models the land grant as a snake-order draft: each round every player
 * picks one plot (or passes) in an order that reverses each successive round.
 * The original game's simultaneous land lottery moves to a future fidelity
 * plan (see the plan's Resolved decisions).
 *
 * Everything here is a pure function over its arguments: no mutation, no DOM,
 * no module-level state. Phase advancement (when the pick order is exhausted)
 * is owned by turn.ts, which calls these helpers.
 */

import type { Plot } from "./game_state";
import type { LandGrantPayload } from "./game_state";

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
 * Build a fresh land-grant payload for the start of a round.
 *
 * @param round - Current round number (1-based).
 * @param playerCount - Number of players in the game.
 * @returns Payload with the round's pick order and the pick index at zero.
 */
export function createLandGrantPayload(round: number, playerCount: number): LandGrantPayload {
  const pickOrder = landGrantPickOrder(round, playerCount);
  return { pickOrder, pickIndex: 0 };
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
  return { pickOrder: payload.pickOrder, pickIndex: payload.pickIndex + 1 };
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
