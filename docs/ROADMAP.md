# Roadmap

Planned work for this M.U.L.E. engine, in priority order, plus what stays
intentionally out of scope. See [CHANGELOG.md](CHANGELOG.md) for what has
already shipped and [TODO.md](TODO.md) for the smaller task backlog.

## Near term

- Auction seller-out-of-goods store fallback: when a human or AI seller runs
  out of a good mid-auction, decide whether the store should step in as a
  fallback counterparty rather than leaving the window to time out. See
  [TODO.md](TODO.md).
- Walk-speed tuning (WP-2A, applied 2026-07-10): `WALKER_SPEED_PX_PER_SEC`
  raised from 80 to 320 px/s (well outside the originally hypothesized
  120-160 range -- the corral purchase panel and the no-longer-turn-ending
  hunt_wampus/assay_plot develop plans both added real wall-clock to the
  develop-turn errand after that range was first estimated). The starved-min
  margin at 320 is thin (~10-11%, noise-bound around the pass line); 340+
  px/s starts failing the walk-in door-reach reliability check itself
  (`WALK_TAP_MS` in `tests/e2e/walkthrough_helpers.mjs` is a fixed 120ms tap
  length, out of this package's touch points) rather than the timing margin,
  so 320 is the practical ceiling until that tap length is retuned. See
  [active_plans/audits/mule_trip_timing.md](active_plans/audits/mule_trip_timing.md)
  for the full evidence table, and the WP-8A follow-on note there for
  widening the margin further via the tap-length constant.
- Release cut: bump `VERSION` (CalVer) and cut the first tagged release now
  that the M1-M11 fidelity plan's gates are green. Human decision, not yet
  made. See [archive/mule_fidelity_plan.md](archive/mule_fidelity_plan.md).

## Later

- 1983/1990 gameplay-fidelity follow-up: further fidelity work (species
  handicaps, tournament ruleset, and any other RULE_SOURCES.md items below)
  targets the original game's RULES -- formulas, economy, and phase mechanics
  -- not its UI or input scheme. Mouse and arrow-key control stays preferred
  over the original console/joystick bindings, and a time-based land-selection
  UI stays an acceptable modernization of the original turn-based land-claim
  screen (user clarification 2026-07-09). See
  [HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md), "Rule fidelity targets game
  mechanics, not input devices."
- Sound and music: a separate pass with its own asset pipeline, deliberately
  excluded from the fidelity plan so it could ship a finished game first. See
  [archive/mule_fidelity_plan.md](archive/mule_fidelity_plan.md).
- Species handicaps as a data toggle: the 1983 starting-money handicaps
  (Flapper $1600, Humanoid $600) and PTU speed modifiers are recorded but
  unused; species stay cosmetic at flat $1000 until this toggle is built. See
  [RULE_SOURCES.md](RULE_SOURCES.md).
- Tournament ruleset as a data toggle: the 1983 tournament deltas (higher
  variance amplitude, pirates steal all crystite, AI +$200 starting money)
  are recorded but unimplemented. See [RULE_SOURCES.md](RULE_SOURCES.md).

## Known bugs and gaps (2026-07-10)

Open items for a future manager agent to pick up cold, with file:line
references verified against the current tree. See
[TODO.md](TODO.md) for the short backlog pointers these expand on.

### Auction engine: insolvent top bidder blocks solvent trades

Symptom: when the best-priced bidder in a goods auction cannot afford the
trade, the engine does not fall through to the next solvent bidder (or to
the store's own standing bid), so a trade that should clear is blocked
instead.

Evidence: `bestBid` (`src/engine/auction.ts:432-451`) and `bestAsk`
(`src/engine/auction.ts:461-484`) each select a single best offer and
return it, with no ranked list of runner-up offers. `resolveTrade`
(`src/engine/auction.ts:669-722`) calls `canExecute` (`src/engine/
auction.ts:514-534`) once against that single `bid`/`ask` pair; when
`canExecute` returns false because the bidder is insolvent, `resolveTrade`
falls straight to the "nothing crossed" branch (lines 713-721) and resets
the transaction run, rather than retrying with the next-best solvent
bidder. Documented at the time the bug was found: `docs/CHANGELOG.md`
(2026-07-09, Decisions and Failures, walkthrough-harness Patch 9 fix
round) and `docs/TODO.md` ("Auction fidelity" section).

Suggested approach: change `bestBid`/`bestAsk` to return an ordered list of
offers (best first) instead of a single best offer, and have
`resolveTrade` walk that list until it finds a pair where `canExecute`
succeeds, or exhausts the list. Before implementing, check
`OTHER_REPOS/planet_mule/data_decompiled/` (see
[REFERENCE_REPOS.md](REFERENCE_REPOS.md), "planet_mule (primary rule
authority)", which points at `Shop.java` for store/auction state) for the
reference matching/fallthrough behavior, and record the citation in
[RULE_SOURCES.md](RULE_SOURCES.md) once the fix lands.

Verify: add an engine unit test that seats an insolvent bidder above a
solvent second bidder (and above the store's standing bid) in the same
auction tick, and assert the solvent trade still executes. Then
re-strengthen `tests/test_auction_termination.mjs`'s third case ("a
sold-out seller with no store stock terminates instead of spinning",
`tests/test_auction_termination.mjs:144-164`) from its current
termination-only assertion (`trades.length >= 1`, line 163) back to an
exact expected trade count, since the weakening was a direct symptom of
this bug (see the comment at lines 160-162 and `docs/CHANGELOG.md`
2026-07-09 Patch 9 fix-round entry).

### Town interaction model diverges from the NES M.U.L.E. target -- shipped

User decision (2026-07-09, recorded in `docs/TODO.md` "UI and layout"
section) set the target model: buildings are solid (walls block walking),
each shop has a door that opens when the player walks up to it and stays
closed otherwise, walking through the open door triggers the shop
interaction directly (no separate action-key press), and a corral
purchase attempt always shows an explicit screen with price, stock, and
funds. All of it has shipped: collision, the walk-in trigger, and the
corral purchase modal (`src/ui/solid/corral_purchase_panel.tsx`). See
`docs/CHANGELOG.md` 2026-07-10 (WP-3A/WP-3B/WP-3C/WP-3D, WP-4A/WP-4B/WP-4C).

### Walker gaps: hunt_wampus/assay_plot develop plans have no spatial executor

Symptom: when the develop AI proposes a `hunt_wampus` or `assay_plot`
plan, the E2E walkthrough harness does not execute it spatially; it logs
the skip and ends the turn instead. This was an agreed fallback during the
walkthrough-harness plan, not an accidental gap.

Evidence: `skipOpportunisticDevelopPlan`
(`tests/e2e/e2e_walkthrough.mjs:383-390`) logs `"develop plan ... is
opportunistic with no spatial executor yet; ending the turn"` and calls
`endDevelopTurn`. `executeDevelopPlan`'s dispatch table
(`tests/e2e/e2e_walkthrough.mjs:431-441`) routes both `hunt_wampus` and
`assay_plot` (lines 438-439) to that skip function, unlike `buy_mule`,
`outfit_mule`, `place_mule`, and `gamble_pub`, which each have a real
spatial executor. Recorded follow-up: `docs/TODO.md` ("Developer and
testing" section, last bullet).

Suggested approach: implement spatial executors for both plan kinds
(walking the avatar to the wampus/plot location and firing the matching
interaction), matching the pattern of the existing `executePlaceMule`/
`executeOutfitMule` executors in `tests/e2e/walkthrough_town.mjs` and
`tests/e2e/walkthrough_overworld.mjs`. This is currently a "nice to have,
not urgent" item: the deterministic wampus/assay-plot coverage the
walker's sweep otherwise cannot reach already lives in dedicated
`tests/playwright/` specs, so only implement the spatial executors if
sweep placement/coverage thins in a future run.

Verify: run the sweep (`tests/e2e/e2e_walkthrough_sweep.mjs`) and confirm
`plansAttempted`/`plansCompleted` counters (see
`tests/e2e/e2e_walkthrough.mjs`'s `report.counters`) include completed
`hunt_wampus`/`assay_plot` plans rather than only skip-and-end-turn
entries; also add unit coverage in `tests/test_walkthrough_plan_exec.mjs`
for the new executors.

### Characterized behaviors: not bugs

A future manager should not mistake these for regressions; each is an
already-understood engine rule or legitimate variance, not something to
fix.

- Seed 7 always colony-fails at round 2. This is the engine's colony
  failure rule firing as designed: `endAuctionGood`
  (`src/engine/turn.ts:708-720`) calls `checkColonyFailure` (imported from
  `src/engine/scoring.ts`, `src/engine/turn.ts:52`) after the last good of
  each round and routes straight to scoring when it fails. The sweep gate
  waives the `verifiedPlacements >= 1` invariant for such runs and records
  the waiver honestly (`"placement waived: colony failure at round N"`,
  see `docs/CHANGELOG.md` 2026-07-10, Patch 28 entry).
- Seed 3 beginner legitimately varies run-to-run between a full 6-round
  game and an early colony failure at round 2, because wall-clock gesture
  timing shifts which goods actually trade and therefore the economy;
  both shapes pass the release sweep's gates (`docs/CHANGELOG.md`
  2026-07-10, Decisions and Failures entry).
- Held-role-no-trade auction windows are normal market outcomes, not a
  bug: a held-role participant whose AI price already matches the opening
  tick legitimately pushes no intents and may never trade. The
  per-run auction-participation check is a logged warning, not a hard
  invariant, for exactly this reason (`docs/CHANGELOG.md` 2026-07-10,
  Patch 30 entry); trade-occurrence proof lives in the sweep's
  `matrixCoverage`, not the per-run check.

## Explicitly out of scope

- Multiple human players (hotseat or online): the driver, auction, and
  develop flows assume 1 human plus 3 AI; multiplayer would change the
  interaction model, not the rules.
- Lab items (Depot, Water Tank, Mining Tower, Power Plant) and the hireling
  system: Planet M.U.L.E. additions beyond the 1983 ruleset this project
  targets.
- Deserts and player-to-player land selling: Planet M.U.L.E. toggles beyond
  the 1983 game.
