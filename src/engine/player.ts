/**
 * Player and resource types for the M.U.L.E. engine.
 *
 * These are the fundamental, DOM-free data shapes shared by every engine, AI,
 * and UI package. Structures are declared readonly so the pure-function engine
 * can treat state as immutable and produce new state rather than mutating in
 * place.
 */

/**
 * The four tradable goods in the standard game. Crystite is the fourth
 * resource per the M.U.L.E. original/planet_mule standard-mode ruleset. Map
 * generation now seeds hidden crystite blooms and the `assay_plot` action
 * reveals them (see `map.ts`, `game_state.ts`'s `visibleCrystite`), but this
 * engine still produces and stocks zero crystite everywhere else (yield
 * tables, starting goods, and store stock all zero it out): reading bloom
 * levels into production and giving crystite its own auction window are
 * later workstreams (see docs/active_plans/active/mule_fidelity_plan.md).
 */
export type Resource = "food" | "energy" | "smithore" | "crystite";

/** Fixed set of the four tradable goods, useful for iteration. */
export const RESOURCES: readonly Resource[] = ["food", "energy", "smithore", "crystite"];

/**
 * Player color slot (0-3). Slot index selects the player color and, in the
 * original game, the species; the engine treats it purely as a fixed slot id.
 */
export type ColorSlot = 0 | 1 | 2 | 3;

/**
 * The eight playable species. Purely cosmetic in this project (flat
 * `STARTING_MONEY` regardless of species, user decision -- see
 * docs/RULE_SOURCES.md, "Species handicaps: recorded-but-cosmetic"); no
 * economy code branches on `Player.species`. Names and order match
 * `SPECIES_NAMES` in `src/ui/sprites/sprites_species.ts` so a player's
 * `species` field selects that sprite directly, but this is a distinct,
 * independently-declared union: the engine stays DOM/UI-free and does not
 * import from `src/ui/`.
 * Source: planet_mule `Race.races`
 * (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Race.java`
 * lines 12): `{humanoid, gollumer, mechtron, packer, leggite, bonzoid,
 * spheroid, flapper}`.
 */
export type Species =
  "humanoid" | "gollumer" | "mechtron" | "packer" | "leggite" | "bonzoid" | "spheroid" | "flapper";

/** Fixed set of the eight playable species, useful for iteration and defaults. */
export const SPECIES: readonly Species[] = [
  "humanoid",
  "gollumer",
  "mechtron",
  "packer",
  "leggite",
  "bonzoid",
  "spheroid",
  "flapper",
];

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
  /** Cosmetic species selection; no economic effect (see `Species`'s doc comment). */
  readonly species: Species;
  /** Current money on hand. */
  readonly money: number;
  /** Inventory count for each resource. */
  readonly goods: Readonly<Record<Resource, number>>;
}
