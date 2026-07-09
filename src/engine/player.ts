/**
 * Player and resource types for the M.U.L.E. engine.
 *
 * These are the fundamental, DOM-free data shapes shared by every engine, AI,
 * and UI package. Structures are declared readonly so the pure-function engine
 * can treat state as immutable and produce new state rather than mutating in
 * place.
 */

/** The three tradable goods in the beginner game. */
export type Resource = "food" | "energy" | "smithore";

/** Fixed set of the three tradable goods, useful for iteration. */
export const RESOURCES: readonly Resource[] = ["food", "energy", "smithore"];

/**
 * Player color slot (0-3). Slot index selects the player color and, in the
 * original game, the species; the engine treats it purely as a fixed slot id.
 */
export type ColorSlot = 0 | 1 | 2 | 3;

/**
 * A single player. Exactly four exist per game (one human, three AI in the
 * beginner configuration). `goods` carries the current inventory count for
 * every resource so the auction and production phases can read and rewrite it.
 */
export interface Player {
  /** Stable index of this player within `GameState.players` (0-3). */
  readonly id: number;
  /** True for the single human player, false for the AI players. */
  readonly isHuman: boolean;
  /** Color slot assigned to this player. */
  readonly colorSlot: ColorSlot;
  /** Current money on hand. */
  readonly money: number;
  /** Inventory count for each resource. */
  readonly goods: Readonly<Record<Resource, number>>;
}
