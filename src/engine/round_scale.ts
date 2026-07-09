/**
 * Round-scaled money curve shared by colony/player event payouts.
 *
 * DOM-free by design: this module is a single pure function with no other
 * dependencies.
 */

/**
 * The base dollar amount used to scale a round-triggered money event (for
 * example a personal/colony event payout), for the given round.
 *
 * Source: `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/PlayerEventGenerator.java`
 * line 101, `apply()`: `n = 25 * (gameModel.getRound() / 4 + 1)` (integer
 * division), confirmed by Kroah's 1983 decompilation doc's event-amount
 * multiplier.
 *
 * Indexing: planet_mule's played rounds are 1-based, exactly like this
 * engine's `GameState.round`, so the PM round value substitutes directly with
 * no offset. `Properties.firstRound = 0` is only the pre-game lobby value:
 * `GameLobbyPhase.begin` calls `GameModel.beginNextRound` (which does
 * `++this.round`) once before the first played round, so `getRound()` is 1
 * during round 1 and 12 during the final round, never 0 during play (verified
 * in `GameModel.java` line 684 `beginNextRound`, `GameLobbyPhase.java` line
 * 575, and the `developmentPubRoundBonus`/`foodRequirements` arrays being
 * indexed `[round]` with a dummy index-0 entry). The formula therefore is
 * `25 * (Math.floor(round / 4) + 1)`, producing 25 for rounds 1-3, 50 for
 * rounds 4-7, 75 for rounds 8-11, and 100 for round 12 -- matching PM's
 * `n = 25 * (round / 4 + 1)` for its 1-based played rounds. See
 * docs/RULE_SOURCES.md, "muleCurve round base (off-by-one fix)".
 *
 * @param round - 1-based round number (this engine's `GameState.round`
 *   convention).
 * @returns The round-scaled base dollar amount.
 */
export function muleCurve(round: number): number {
  return 25 * (Math.floor(round / 4) + 1);
}
