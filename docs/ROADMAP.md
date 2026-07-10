# Roadmap

Planned work for this M.U.L.E. engine, in priority order, plus what stays
intentionally out of scope. See [CHANGELOG.md](CHANGELOG.md) for what has
already shipped and [TODO.md](TODO.md) for the smaller task backlog.

## Near term

- Goods-auction rebuild to the Planet M.U.L.E. `AuctionPainter` composition:
  the user rejected the horizontal landscape track (2026-07-10) and wants the
  auction rebuilt to match the reference painter's layout -- a vertical price
  axis, per-player lanes, a buyer/seller meet line, a store price/stock meter,
  and a bottom player dock. See [SCREEN_DESIGNS.md](SCREEN_DESIGNS.md), "Goods
  Auction (the trading floor)."
- Town rework toward the NES / Planet M.U.L.E. entry model: replace the current
  street-of-doors town with the reference entry model -- walk INTO buildings
  (rooms/facades) and per-resource labeled outfitting shops. This also fixes
  the reproduced glide-auto-outfit bug and the post-buy stranding surfaced in
  the 2026-07-10 investigation. See [SCREEN_DESIGNS.md](SCREEN_DESIGNS.md),
  "Town / store interior."
- Species and color selection screen after New Game: add a human-only pick of
  species (cosmetic) and color between starting a new game and the first phase.
  Requires decoupling `playerColor` from player id via a `colorSlot` at roughly
  11 render sites so a human can hold a color that does not match seat order.
  See [SCREEN_DESIGNS.md](SCREEN_DESIGNS.md), "Setup: color" and
  "Setup: species."
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

### Auction engine: insolvent top bidder blocks solvent trades -- shipped

Fixed by M1 (WP-1B, 2026-07-10). `bestBid`/`bestAsk` were replaced with
ranked offer lists and `resolveTrade` now walks them until it finds a
crossed solvent pair, so an insolvent best-priced bidder no longer blocks
a lower solvent bidder or the store's standing offer; the store's limited
stock is the natural seller-out-of-goods fallback. The
`tests/test_auction_termination.mjs` third case was re-strengthened from
`trades.length >= 1` back to an exact trade count, and
`tests/test_auction_solvent_fallthrough.mjs` pins the buyer- and
seller-side traversal. The dead-auction-window rate was re-measured at 100
seeds/mode (0.7% beginner, 0.8% standard, gate < 0.2), and the traversal
citation landed in [RULE_SOURCES.md](RULE_SOURCES.md). See
`docs/CHANGELOG.md` 2026-07-10 (WP-1A/WP-1B/WP-1C/WP-1D).

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

### Walker harness: deterministic stall at 320 px/s (harness, not game)

Symptom: after the WP-2A walk-speed raise (`WALKER_SPEED_PX_PER_SEC` 80 to
320, `src/ui/scenes/walker.ts:60`), the walkthrough sweep stalls
deterministically on seeds 1 and 3 at the counter-smithore door, logged as
"town avatar left the street." Seed 7 passes both modes. This is a
walker-harness artifact, not a product bug: the seek/gesture constants
(`WALK_TAP_MS`, overshoot correction in
`tests/e2e/walkthrough_helpers.mjs`) were tuned for the old 80 px/s speed
and were never retuned for 320. On this evidence the user demoted the
sweep from a release gate to a diagnostic (2026-07-10, "the deterministic
walker is suspect, do not keep as a gate").

Suggested approach: root-cause the seed-1/3 counter-smithore stall, then
add speed-aware tap sizing so the tap length scales with
`WALKER_SPEED_PX_PER_SEC` instead of being a fixed 120ms. See
[active_plans/decisions/sweep_gate_demotion.md](active_plans/decisions/sweep_gate_demotion.md)
and `docs/TODO.md` ("Developer and testing").

Note: the older "hunt_wampus/assay_plot have no spatial executor" gap
shipped in M8 (WP-8B, 2026-07-10): `executeHuntWampus`/`executeAssayPlot`/
`executeArmAssay` replaced the log-and-end fallback and
`skipOpportunisticDevelopPlan` was removed. WP-8C's sweep-counter
natural-occurrence proof for those executors is deferred with the sweep
demotion (a forced-plan hook, recorded in `docs/TODO.md`).

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
