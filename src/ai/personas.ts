/**
 * AI personality profiles.
 *
 * Three named profiles -- land baron, ore speculator, farmer -- are parameter
 * SETS layered over the existing develop/land/auction heuristics in this
 * directory: no new decision branches, just different constants feeding the
 * same comparisons `develop_ai.ts`, `land_ai.ts`, and `auction_ai.ts` already
 * make. A profile is assigned once per AI player, derived purely from the
 * game's `seed` and the player's id (see `personalityForPlayer`), so the same
 * seed always assigns the same personalities (replay-safe) with no dependency
 * on evaluation order and no extra field on `GameState`. The human seat
 * (`Player.isHuman`) never receives a personality.
 *
 * This project's own design element, not a planet_mule extraction --
 * planet_mule's AI has no notion of named personalities (see
 * docs/RULE_SOURCES.md, "AI personalities").
 *
 * A profile never touches the M10 rank-aware land-bid dampening
 * (`LAND_BID_RANK_FACTORS` in `land_ai.ts`): that factor is the fairness
 * mechanism keeping the round's leader from dominating the land auction, and
 * every persona's own bid-aggressiveness factor multiplies on top of it
 * rather than replacing it. Likewise, no persona ever touches a
 * personality-independent safety invariant (the develop/auction money
 * reserves, the land-auction reserve, the "never overpay versus the store"
 * ceiling): those stay identical for every player regardless of personality.
 *
 * DOM-free by design: no mutation, no module-level state beyond the fixed
 * parameter tables below.
 */

import { createRng } from "../engine/rng";
import type { GameState } from "../engine/game_state";
import type { Resource } from "../engine/player";

/** The three named AI personality profiles this project defines. */
export type Personality = "land_baron" | "ore_speculator" | "farmer";

/** Fixed set of the three personalities, useful for iteration. */
export const PERSONALITIES: readonly Personality[] = ["land_baron", "ore_speculator", "farmer"];

/**
 * Salt distinguishing the persona-assignment draw from every other derived
 * sub-stream, matching the established pattern of `PLAYER_EVENT_RNG_SALT` /
 * `COLONY_EVENT_RNG_SALT` / `WAMPUS_RNG_SALT` in `constants.ts`. Kept local to
 * this module (rather than added to `constants.ts`) because persona
 * assignment only ever reads `GameState.seed` -- it never advances or
 * serializes any RNG stream, so it needs no entry alongside those
 * state-carrying salts.
 */
const PERSONA_RNG_SALT = 0x27d4eb2f;

/**
 * Large odd mixing constant separating one player id's persona draw from the
 * next, so adjacent player ids (0-3) do not produce adjacent seeds. Reuses
 * mulberry32's own additive constant (see `rng.ts`) for consistency.
 */
const PERSONA_PLAYER_ID_MULTIPLIER = 0x6d2b79f5;

/**
 * Parameter set a personality layers over the existing heuristics.
 *
 * `landBidFactor` multiplies the land-auction AI's final willingness-to-pay
 * (`land_ai.ts` `valueCap`), on top of (never instead of) the rank-dampening
 * factor. `resourceWeight` biases the develop-phase scarcest-resource pick
 * and the crystite-vs-scarcest outfit comparison toward the personality's
 * preferred goods (a weight of 1 leaves a resource exactly as scarce as the
 * no-persona baseline; only ever `>= 1`, so a personality can make a resource
 * look no less scarce than baseline, never more). `assayRichSurplusFactor`
 * scales the rich-surplus gate before the develop AI will spend ticks
 * assaying instead of buying a M.U.L.E. `auctionBuyerLimitFactor` scales the
 * auction AI's buyer price ceiling, itself already capped at the store's sell
 * price (`auction_ai.ts` `desiredIntent`) -- capped at `1` for every
 * personality so no personality ever pays more than a plain buyer would.
 */
export interface PersonaParams {
  readonly landBidFactor: number;
  readonly resourceWeight: Readonly<Record<Resource, number>>;
  readonly assayRichSurplusFactor: number;
  readonly auctionBuyerLimitFactor: number;
}

/** Neutral parameters: exactly the pre-persona baseline behavior. */
export const BASELINE_PERSONA_PARAMS: PersonaParams = {
  landBidFactor: 1,
  resourceWeight: { food: 1, energy: 1, smithore: 1, crystite: 1 },
  assayRichSurplusFactor: 1,
  auctionBuyerLimitFactor: 1,
};

/**
 * Per-personality parameter tables (sim-tuned, see docs/RULE_SOURCES.md, "AI
 * personalities"):
 *
 * - `land_baron` bids a little harder for land (1.03x) and is otherwise
 *   neutral -- deliberately mild: an early 1.25x draft pushed its standard-
 *   mode win rate past the fair band's 35% ceiling in the 120-seed release
 *   run, so the factor was sim-tuned down until the win rate landed inside
 *   the band.
 * - `ore_speculator` weighs smithore and crystite equally and above baseline
 *   in develop/assay choices (1.3x), and assays a little sooner once rich
 *   (0.8x the surplus gate -- deliberately gentler than the M10 all-AI
 *   crystite-scout experiment that weakened colony robustness, since here at
 *   most one of three AI seats carries this bias in a given game).
 * - `farmer` weighs food and energy above baseline (1.3x / 1.15x), bids
 *   softer for land (0.94x), and buys more cautiously at auction (0.95x the
 *   store-price ceiling), matching a risk-averse, production-focused
 *   identity.
 */
const PERSONA_PARAMS: Readonly<Record<Personality, PersonaParams>> = {
  land_baron: {
    landBidFactor: 1.03,
    resourceWeight: { food: 1, energy: 1, smithore: 1, crystite: 1 },
    assayRichSurplusFactor: 1,
    auctionBuyerLimitFactor: 1,
  },
  ore_speculator: {
    landBidFactor: 1,
    resourceWeight: { food: 1, energy: 1, smithore: 1.3, crystite: 1.3 },
    assayRichSurplusFactor: 0.8,
    auctionBuyerLimitFactor: 1,
  },
  farmer: {
    landBidFactor: 0.94,
    resourceWeight: { food: 1.3, energy: 1.15, smithore: 1, crystite: 1 },
    assayRichSurplusFactor: 1,
    auctionBuyerLimitFactor: 0.95,
  },
};

/**
 * The personality assigned to `playerId` for this game, or null for the
 * human seat. Pure function of `(state.seed, playerId)`: no state field, no
 * RNG stream advanced, so calling it any number of times (from any decision
 * function, in any order) always agrees -- the replay-safety property the
 * workstream requires.
 *
 * @param state - Current game state (only `seed` and `players` are read).
 * @param playerId - Player id to look up.
 * @returns The assigned personality, or null for the human seat or an
 *   out-of-range id.
 */
export function personalityForPlayer(state: GameState, playerId: number): Personality | null {
  const player = state.players[playerId];
  if (player === undefined || player.isHuman) {
    return null;
  }
  const salted = (state.seed ^ PERSONA_RNG_SALT) >>> 0;
  const mixed = (salted + playerId * PERSONA_PLAYER_ID_MULTIPLIER) >>> 0;
  const rng = createRng(mixed);
  const index = rng.nextInt(PERSONALITIES.length);
  return PERSONALITIES[index] ?? null;
}

/**
 * The parameter set `playerId` should decide with this game: the assigned
 * personality's table, or `BASELINE_PERSONA_PARAMS` (identical to pre-persona
 * behavior) for the human seat.
 *
 * @param state - Current game state.
 * @param playerId - Player id deciding.
 * @returns The parameter set to layer over the existing heuristics.
 */
export function personaParamsForPlayer(state: GameState, playerId: number): PersonaParams {
  const personality = personalityForPlayer(state, playerId);
  if (personality === null) {
    return BASELINE_PERSONA_PARAMS;
  }
  return PERSONA_PARAMS[personality];
}
