# Leader win-rate probe (M10 balance lane)

Large-sample evidence for the M10 release gate's round-6-leader-win-rate
check ("round-6 leader wins < ~50% (event fairness works)" for standard
mode). Prior readings from 30-seed runs of
[../../../tests/e2e/e2e_balance_sim.mjs](../../../tests/e2e/e2e_balance_sim.mjs)
were noisy (58.3%, 63.3%, 40.0% across different runs). This probe reruns at
200 seeds standard / 100 seeds beginner to get a stable estimate with a
confidence interval, then instruments the sim loop to find what drives
leader lock-in.

No production code was changed to produce this report. All numbers come
from a scratch fork of the harness's `playGame` loop
(`_temp_leader_probe.mjs`, deleted after this report was written) that
replays the same deterministic engine/AI code paths and adds read-only
instrumentation.

## Headline number

| Mode | n | Round-6 leader wins | Rate | Wilson 95% CI |
| --- | --- | --- | --- | --- |
| standard | 200 | 113/200 | 56.5% | 49.6% - 63.2% |
| beginner | 100 | 77/100 | 77.0% | 67.8% - 84.2% |

Standard mode's true rate is about 56-57%, moderately above the plan's
"< ~50%" M10 gate target; the confidence interval's lower bound sits just
under 50%, so the gate is not clearly met yet, but it is close, not wildly
off (the earlier 63.3%/40.0% single-run readings were both within normal
sampling noise of this range at n=30). Beginner mode's leader-win rate is
much higher (77%) but is not gated by the plan (beginner mode's final round
IS round 6, so "the round-6 leader" and "the game winner" are closer to the
same measurement by construction; treat this row as reference only, not a
target to hit 50%).

## Win rate by round-6 rank

| Mode | rank 1 (leader) | rank 2 | rank 3 | rank 4 |
| --- | --- | --- | --- | --- |
| standard | 56.5% | 22.5% | 13.5% | 7.5% |
| beginner | 77.0% | 16.0% | 6.0% | 1.0% |

A fair (rank-independent) outcome would put all four columns near 25%.
Standard mode's rank-1 win share is more than double a fair share; rank-4
almost never wins.

## Round-6 lead size vs eventual win (standard mode)

| Lead size bucket | n | Leader win rate |
| --- | --- | --- |
| < 20 | 7 | 42.9% |
| 20-50 | 18 | 38.9% |
| 50-100 | 21 | 28.6% |
| 100+ | 154 | 63.0% |

("Lead size" is the score gap between round-6 rank 1 and rank 2, using the
same score formula as final scoring.) The overwhelming majority of games
(154/200) already have a 100+ point lead by round 6, and that bucket alone
carries a 63% leader-win rate -- close to the overall headline number
because it dominates the sample. Small leads (under 100 points) actually
show the leader winning LESS than half the time (29-43%), meaning a close
round-6 race is genuinely competitive; the imbalance is concentrated in
games where a big lead has already formed by round 6. This points at an
early-game snowball (rounds 1-5), not a late-game rubber-band failure.

## Final score composition

| Mode | mean | stdev | min | max |
| --- | --- | --- | --- | --- |
| standard | 5844 | 731 | 4610 | 16122 |
| beginner | 4209 | 617 | 3271 | 6717 |

Winner's score, averaged across all games, broken into its three summands
(money on hand, goods inventory at store prices, land value at
`LAND_VALUE_PER_PLOT` per owned plot):

| Mode | money | goods | land |
| --- | --- | --- | --- |
| standard | $343 (5.3%) | $42 (0.6%) | $6120 (94.1%) |
| beginner | $348 (7.1%) | $45 (0.9%) | $4520 (92.0%) |

Land value is 92-94% of the winner's final score. Money and goods are
nearly irrelevant to who wins. This is the single most important fact in
this probe: whichever balance lever moves land ownership share moves the
win rate; a lever that only touches money (like the personal-event system)
has limited leverage on the outcome even if it works exactly as designed.

## Personal events by rank (fairness mechanism check)

`src/engine/events.ts`'s `drawPersonalEvent` blocks bad events for the
bottom two ranks and blocks good events for rank 1 (source-verified against
`PlayerEventGenerator.java`; see
[../../RULE_SOURCES.md](../../RULE_SOURCES.md)). The instrumented totals
confirm this fires exactly as designed and is doing real redistributive
work in dollar terms:

| Mode | rank | good | bad | net $ | avg $/game |
| --- | --- | --- | --- | --- | --- |
| standard | 1 (leader) | 0 | 512 | -66,088 | -330.4 |
| standard | 2 | 425 | 193 | 38,438 | 192.2 |
| standard | 3 | 588 | 0 | 106,500 | 532.5 |
| standard | 4 | 577 | 0 | 104,225 | 521.1 |
| beginner | 1 (leader) | 0 | 70 | -6,625 | -66.3 |
| beginner | 2 | 124 | 20 | 9,036 | 90.4 |
| beginner | 3 | 148 | 0 | 15,975 | 159.8 |
| beginner | 4 | 136 | 0 | 15,550 | 155.5 |

Rank 1 gets 100% bad events (0 good, as designed) and loses money on
average every game; ranks 3-4 get 100% good events and gain roughly 500-530
dollars/game on average in standard mode. This is a real, working
redistribution -- but it is redistributing money, which is only ~5% of the
final score. It cannot move the win rate much on its own.

## Land-auction wins by rank (the dominant driver)

| Mode | rank 1 (leader) | rank 2 | rank 3 | rank 4 | total sold |
| --- | --- | --- | --- | --- | --- |
| standard | 949 (54.1%) | 429 (24.5%) | 249 (14.2%) | 126 (7.2%) | 1753 |
| beginner | 400 (59.1%) | 166 (24.5%) | 86 (12.7%) | 25 (3.7%) | 677 |

Unlike personal events, land-auction wins carry NO rank-based fairness
mechanism -- the winner is simply whoever bids highest, tie-broken to the
worst-ranked bidder (PM-faithful, see `land_auction.ts`'s `worstRanked`).
The current rank-1 player wins land auctions at more than double a fair
25% share (54-59%), because `src/ai/land_ai.ts`'s `decideLandAuctionAction`
caps every bid at `LAND_VALUE_MONEY_FRACTION` (0.4) of the bidder's CURRENT
money, and the leader has more money on average, so the leader can
out-bid trailing players for the plots that are 92-94% of final score. This
is the land-value equivalent of a rich-get-richer loop, and it has no
counterbalancing mechanism the way personal events do.

## Crystite auction seller income by rank (secondary driver)

| Mode | rank 1 | rank 2 | rank 3 | rank 4 |
| --- | --- | --- | --- | --- |
| standard | $14,700 / 144u | $6,540 / 73u | $3,772 / 38u | $752 / 9u |
| beginner | $4,708 / 42u | $3,328 / 35u | $1,852 / 18u | $292 / 4u |

Crystite income also skews heavily toward rank 1, consistent with owning
more (and better-outfitted) plots. This is a downstream effect of the land
imbalance above (more land -> more mining plots -> more crystite to sell),
not an independent driver, but it compounds the same loop: land -> money ->
more land.

## Lever recommendations for M10

Ranked by predicted impact on the round-6-leader-win-rate gate. All three
touch `src/ai/land_ai.ts` heuristics, which `docs/RULE_SOURCES.md` (line
851, "Land AI valuation and sim-tuning record") explicitly documents as
"this engine's own choices ... sim-tuned," not decompiled from
`LandAuctionActuator` -- these are tunables, not PM-fidelity-bound
constants. None of the three touch a PM-sourced constant (event chance,
event money factors, the land-auction tie-break rule, or the scoring
formula itself).

1. **Rank-aware land-bid dampening (highest predicted impact, new
   behavior, not just a constant tweak).** Scale `land_ai.ts`'s
   `LAND_VALUE_MONEY_FRACTION` (and/or the flat `LAND_VALUE_PER_PLOT`
   baseline term inside `valueCap`) down for the current round's rank-1
   player and up for the bottom two ranks, mirroring the fairness pattern
   `events.ts` already uses for personal events (leader-penalized,
   trailer-favored). Predicted direction: shrinks rank 1's land-auction win
   share from ~54-59% toward the ~25% fair share, which -- because land is
   92-94% of final score -- should move the round-6-leader-win rate down
   toward and likely under the 50% gate. Largest predicted effect of the
   three because it targets the score component that actually determines
   who wins. Risk: needs re-verification against the M4/M5 gates
   (dead-land-auction rate < 0.2, mid-game clear-price-at-floor), since the
   land AI was already tuned once to avoid a 95-97% dead-auction regime
   (see `RULE_SOURCES.md`'s "Before tuning" note); a rank-based cut to the
   leader's ceiling could plausibly leave some plots unsold in games where
   the leader is the only bidder with money to spare.

2. **Lower `LAND_VALUE_MONEY_FRACTION` uniformly (moderate impact, lowest
   risk, one-line tune).** The cap is currently 0.4 of current money for
   every player regardless of rank. Since the leader carries more money on
   average, a uniform cut (for example to 0.3) shrinks the leader's
   absolute land-bidding edge without adding new rank-conditional logic.
   Smaller predicted effect than lever 1 (it does not specifically target
   the leader), but it is a pure constant change against an
   already-documented sim-tuned value, so it is easy to test and revert.
   Same gate-regression risk as lever 1, at smaller magnitude.

3. **Lower `LAND_VALUE_PER_OWNED_NEIGHBOR` (currently 15) (smallest,
   most surgical, lowest risk).** This adjacency bonus specifically rewards
   a player for bidding on land next to plots they already own -- which,
   by construction, favors whoever already owns the most land (usually the
   leader). Shrinking this term (or removing it) targets only the
   compounding piece of the land-bid formula, leaving the yield-based and
   flat-baseline terms untouched, so it should have the smallest effect on
   the dead-land-auction-rate gate of the three options while still
   softening the land-ownership snowball loop.

**Not recommended for M10 tuning:** `LAND_VALUE_PER_PLOT` (500, in
`constants.ts`) is the constant that makes land worth ~94% of final score
in the first place, and is the single biggest lever available by raw
leverage -- but its source comment marks it as "work package spec
beginner-game anchor," i.e. a plan-level calibration anchor rather than an
AI-only heuristic. Changing it would be a scoring-formula change, not an
AI-behavior tune, and needs explicit plan-level sign-off (per the plan's
"fidelity beats balance" rule) before M10 touches it, not a probe-driven
recommendation. `PLAYER_EVENT_CHANCE` (0.275) and every personal-event
money factor are PM-decompiled constants (`PlayerEventGenerator.java`) and
must not move for balance reasons.

## Methodology notes

- Wilson score interval used for the 95% CI (more accurate than a normal
  approximation at these sample sizes and win rates).
- "Round-6 lead size" and "round-6 rank of the eventual winner" are taken
  at the first game tick where `state.round >= 6`, matching the existing
  harness's `LEADER_SNAPSHOT_ROUND` definition exactly.
- Land-auction winner rank and crystite-trade seller rank are read from
  game state at the tick the auction/window is observed as finished, which
  is after that auction's own settlement (money/plot transfer) has already
  applied. This is a small (single-auction) skew toward the just-settled
  outcome and does not materially change the rank buckets reported here.
- All 300 games (200 standard + 100 beginner) terminated; this probe did
  not re-check the dead-window/dead-land-auction/negative-money gates
  (those are already covered by the existing 30-seed
  `e2e_balance_sim.mjs` gate run) -- this probe is scoped to the
  leader-win-rate signal and its drivers only.
