# Walkthrough guide

Operating manual for the browser walkthrough harness under `tests/e2e/`. The
harness drives a complete seeded game, start to finish, through the real
rendered UI in headless Chromium: the human seat (player 0) is played
actively by the game's own `src/ai/` decide functions, not by a scripted or
passive fallback. A green run is direct evidence the game is playable end to
end through the actual DOM a player would use, not just through the engine
reducer in isolation.

Built by `docs/archive/walkthrough_harness_plan.md`; see that plan for the
milestone history (M1-M8) and work-package rationale behind each design
choice referenced below.

## Layers

Six modules, each with one job, wired together by the orchestrator:

| Layer | File | Owns |
| --- | --- | --- |
| Projection | `src/ui/walker_debug.ts` | Read-only `window.muleGameState()` snapshot: `state` (full `GameState`, deep-frozen) plus convenience fields (`phaseKind`, `activePlayerId`, `humanMoney`, `sweepRow`, `sweepCol`). Coupling contract: the orchestrator reads only the convenience fields; only the strategy adapter reads `state`. |
| Strategy adapter | `tests/e2e/walkthrough_strategy.mjs` | Re-hydrates the JSON-transported projection into an engine `GameState` (`marshalProjection`), then wraps the four `src/ai/*` decide functions (`decideLandGrantAction`, `decideLandAuctionAction`, `decideDevelopAction`, `decideAuctionActions`) into gesture plans over the closed `PLAN_KINDS` vocabulary. |
| Gesture drivers | `tests/e2e/walkthrough_land.mjs`, `walkthrough_auction.mjs`, `walkthrough_town.mjs`, `walkthrough_overworld.mjs`, plus spatial helpers in `walkthrough_helpers.mjs` | Turn one gesture plan into real DOM interaction: click a plot, hold an arrow key, click a `data-action` button, verify the projection actually changed. |
| Orchestrator | `tests/e2e/e2e_walkthrough.mjs` | The phase loop: waits for `phaseKind` to change, times each phase, calls the matching active driver once per phase entry, drives the develop phase's own per-turn re-decide loop, and enforces the per-phase and whole-run wall-clock budgets. |
| Dispatcher / invariants | `tests/e2e/walkthrough_exec.mjs` | `executePlan` (the one place a plan is checked against `PLAN_KINDS`), `runActivePhaseDriver` (reclassifies a driver's "unexpected plan kind" throw into a real `unknown_plan_kind` report failure), and `assertActiveInvariants` (the active-mode participation checks run once scoring is reached). |
| Report | `tests/e2e/walkthrough_report.mjs` | The closed `FAILURE_KINDS` taxonomy, run counters, phase timings, severity-tagged log, Playwright error collectors, screenshot-on-phase-transition, and `playthrough_report.json` serialization. |

Strategy and mechanics stay separate on purpose: the strategy adapter only
ever asks "what would the human AI do here", and the gesture drivers only
ever ask "how do I click that in the DOM". A parameter change in `src/ai/` or
`src/engine/` (a price curve, a tick budget, an AI threshold) costs zero
walker edits, because the adapter calls the same decide functions the real
game runs. Only a genuinely new action kind needs a change here, and it is a
single, localized one: add the kind to `PLAN_KINDS`, add its
decision-wrapper mapping in `walkthrough_strategy.mjs`, and add its DOM
handler in the matching driver.

## Run commands

| Command | Purpose |
| --- | --- |
| `bash tests/e2e/e2e_run_all.sh` | Routine path. Runs every routine non-browser E2E script in order, including a single-seed active walkthrough (`--seed 3 --mode beginner`) as its last step. |
| `node --import tsx tests/e2e/e2e_walkthrough.mjs --seed 3 --mode beginner` | One run, directly. `--mode` is `beginner` or `standard`; `--speed` overrides the calibrated `WALKER_SPEED`; `--screenshots <dir>` overrides the default screenshots directory; `--passive` restores the M2 baseline (passive fallbacks for every phase) instead of active play; `--bootstrap-only` just proves the game reaches the first `land_grant` phase. |
| `node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs` | Release gate. Runs the recorded seed x mode matrix sequentially and checks cross-matrix coverage (see Sweep coverage below). |
| `node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs --find-seeds` | Deterministic forward scan (seeds 1-100) for a replacement seed set, used only when the recorded set stops satisfying coverage. |

`--import tsx` is required on every one of these: the walker modules import
sibling `.ts` engine and AI files by extensionless specifier, which tsx's
resolver follows and Node's own type-stripping resolver does not.

## Output files

| File | Written by | Contents |
| --- | --- | --- |
| `test-results/walker/playthrough_report.json` | `e2e_walkthrough.mjs` (every run, success or failure, via a `try`/`finally` wrapping the whole bootstrap/phase-loop/invariant-check sequence) | `run` (seed, mode, speed, timestamps, `finalRound`, `colonyFailed`), `log` (severity-tagged entries), `phaseTimings`, `failure` (`null` on a clean run), `counters`. |
| `test-results/walker/sweep/sweep_summary.json` | `e2e_walkthrough_sweep.mjs` | Per-run report copies, a worst-first table, per-run pass/fail against the release rules, `matrixCoverage` (the five coverage booleans, combined with OR across the whole matrix), and `matrixCoverageSatisfied`. |
| `test-results/walker/phase_NN_<kind>.png`, `initial_state.png` | `e2e_walkthrough.mjs` | One screenshot per phase-kind transition, diagnostic only (never asserted on). |

## Budgets

- **Per-act budget** (`PER_ACT_BUDGET_MS`, `walkthrough_helpers.mjs`): 1000ms,
  sized from the calibration winner's worst measured single act (roughly
  250ms, the west-exit walk) with about a 4x margin above the auto-computed
  2x, so a loaded machine's slow act still fits while a genuine multi-second
  stall (the rejected speed=8/tap=180 config spun for roughly 11s) is still
  caught.
- **Per-phase budget** (`PHASE_BUDGET_MS`): 60,000ms. Generous at the
  calibrated `WALKER_SPEED=4` so one slow phase (a develop turn with several
  ticks) never trips a false timeout.
- **Per-round budget** (`ROUND_BUDGET_MS`): 51,000ms, summed from the worst
  measured per-phase-kind durations across recorded runs -- auction 12-18s
  (the dominant cost: `AUCTION_POLL_INTERVAL_MS=120` times real window
  ticks), land_auction 3-7s, develop 2-7s, land_grant under 1s, production
  under 0.5s -- for a worst-case sum of about 33.5s, with a 1.5x headroom
  margin rounding up to 51s.
- **Whole-run budget** (`RUN_BUDGET_MS_BY_MODE`): `ROUND_BUDGET_MS` times the
  mode's round count (`ROUND_COUNT_BY_MODE`, `src/engine/constants.ts`; 6 for
  beginner, 12 for standard) plus a `RUN_FIXED_OVERHEAD_MS=10,000` fixed
  overhead (the scoring phase plus poll-interval slack around every
  phase-kind transition). Beginner: 316,000ms. Standard: 622,000ms.
  Bootstrap (build, serve, navigate to a fresh game) runs before this
  deadline starts, so it is not part of the budget.

## Failure taxonomy

Every `FAILURE_KINDS` value (`tests/e2e/walkthrough_report.mjs`), what it
means, and the first response:

| Kind | Meaning | First response |
| --- | --- | --- |
| `phase_timeout` | The current phase exceeded `PHASE_BUDGET_MS` without ending. | Check `phaseTimings` in the written report for which phase stalled, then that phase's own driver for a stuck precondition. |
| `act_did_not_advance` | A gesture click (e.g. develop-end-turn) did not change the observed state within its wait window. | Check for a detached or stale DOM handle, or a UI precondition the driver did not satisfy before clicking. |
| `walk_stall` | The avatar's per-frame transform (or a coarse cell/door attribute) did not change across a bounded-tap walk within `stallTaps`. | Confirm the target door/cell is actually reachable from the avatar's current position; check for a BFS routing gap around a town cell. |
| `decision_gesture_mismatch` | The land-grant sweep cursor has not yet reached the plot the strategy adapter wants to claim. | Usually benign and self-resolving (the sweep advances every tick); a growing `mismatchCount` across many ticks without resolution indicates a stuck sweep. |
| `unknown_plan_kind` | A decide-wrapper produced a `plan.kind` outside the closed `PLAN_KINDS` vocabulary -- a drift bug between the adapter and the vocabulary, not a new move to guess at. | Add the missing kind to `PLAN_KINDS`, its mapping in `walkthrough_strategy.mjs`, and its handler in the matching driver. |
| `console_error` | The page emitted a `console.error` not matched by `EXPECTED_NOISE`. | Fix the app-origin console error at its source; do not grow the noise allowlist beyond the documented favicon case. |
| `page_error` | An uncaught `pageerror` fired in the browser. | Read the message for the throwing module and fix the underlying bug; this always indicates a real app or harness defect. |
| `network_error` | A request failed outright, or a response returned a non-2xx/3xx status. | Check whether `dist/` is stale (see stale-dist rebuild below) or a genuinely broken asset reference. |
| `run_stalled` | The whole-run wall-clock budget (`RUN_BUDGET_MS_BY_MODE`) elapsed before scoring was reached. | Check the last logged phase transition; a single slow phase inside budget is fine, but a full round consistently exceeding `ROUND_BUDGET_MS` warrants re-measuring the gesture constants against the composed street (see Calibration record below). |
| `invariant_violation` | `assertActiveInvariants` found `humanTurnsCompleted` did not equal the rounds reached at scoring -- the one hard active-mode invariant. | This is deterministic; treat any occurrence as a real bug in the turn-counting or phase-loop logic, not test flake. |
| `auction_stalled` | `driveAuction` exceeded `MAX_TICKS_PER_AUCTION`, its defensive tick ceiling. | Check for a role-panel click on a tick where the panel no longer renders (see the tick-0 role gate below), or a genuinely stuck auction window. |

## Edge-case triage table

| Edge case | What happens | Why it is not a failure |
| --- | --- | --- |
| Auction clock-hold and role-commit gate | `auction_role` plans are gated on `payload.tick === 0` (the `RolePanel` only renders at tick 0); a later-tick role decision is logged once per good as deferred instead of clicked. | Clicking a role button on a tick where the panel does not exist used to hang on Playwright's roughly 30s actionability timeout (root-caused on seed 7); gating on tick 0 is the fix, not a workaround. |
| Colony-failure early scoring and placement waiver | `checkColonyFailure` (`src/engine/scoring.ts`) can end the game before its final round; the sweep's per-run rule exempts `verifiedPlacements >= 1` on any run where `run.colonyFailed === true`, recording `"placement waived: colony failure at round N"` instead of failing the run. | A colony that fails early legitimately never reaches a placement opportunity; the matrix-level coverage check (`matrixCoverage.placement`) still requires at least one verified placement somewhere across the whole sweep, so this waiver cannot hide a real placement regression. |
| Truncation accounting (only budget-committing cuts count) | `maybeTruncateTurn` ends a develop turn at the tick-budget reserve, but only *counts* it in `truncatedTurns` when the cut plan commits the budget to a buy/outfit/place gesture. A turn-ending `gamble_pub`/`end_turn`, or a free `hunt_wampus`/`assay_plot` skip, is the develop turn's own natural end. | The develop AI (`src/ai/develop_ai.ts`) emits `gamble` (which ends the turn), never a bare `end_turn`, when it is out of productive moves; a plan-blind counter previously reclassified every out-of-work turn as truncated. |
| Participation warning (demoted from hard invariant) | For a run where the human held a buyer/seller role in a goods auction, `assertActiveInvariants` looks for at least one window with a pushed non-hold `intentsPushed` or a nonzero `humanGoodsDelta`. If none of the held-role windows show either, it logs a `warn` line instead of failing the run. | Seed 3 beginner runs flake on this branch about two-thirds of the time even on otherwise-clean runs: a held-role participant whose AI-desired price already matches the opening tick pushes no intents and may never cross, and standing at your limit price is legitimate real-time-auction participation, not a stuck driver. Trade-occurrence proof across the seed matrix stays the sole owner of that guarantee (`matrixCoverage.humanBuy`/`humanSell`). |
| Stale-dist rebuild guard | `buildSiteIfStale` (`walkthrough_helpers.mjs`) rebuilds `dist/` whenever `dist/index.html` is older than the newest source input (`BUILD_SOURCE_INPUTS`), rather than only when `dist/` is missing. | Fixes a silent stale-bundle trap hit twice in practice: a walkthrough run against a stale `dist/` exercises old code and reports false-clean or false-broken results with no indication the bundle was out of date. |
| `hunt_wampus`/`assay_plot` spatial executors (M8, WP-8B) | These two opportunistic develop plans now have dedicated spatial executors -- `executeHuntWampus`/`executeAssayPlot` (`walkthrough_overworld.mjs`) and `executeArmAssay` (`walkthrough_town.mjs`) -- that walk the avatar to the wampus/plot and fire the interaction. The old log-and-end `skipOpportunisticDevelopPlan` fallback was removed. | Both are free, strictly-beneficial scouting moves the develop AI slips in opportunistically. WP-8C's sweep-counter natural-occurrence proof for them is deferred with the sweep gate demotion (a forced-plan hook, recorded in `docs/TODO.md`), so a given sweep run may still show zero of these plans without indicating a regression. |
| Town commerce door-executors walk in rather than key-press | `buy_mule`, `outfit_mule`, and `gamble_pub` x-seek to the target door's street column, wait for `data-door-state="open"`, then press north via `walkTownAvatarNorthUntil` until the door's interaction fires. `buy_mule` walks into the corral, which always opens the corral purchase panel (`[data-corral-panel]`, WP-4A/4B); the executor reads `data-corral-outcome` and presses Enter to confirm the buy only when the outcome is buyable. `walkBackToStreet` returns the avatar to the street row after a successful buy/outfit. | Matches the WP-3B walk-in-triggers-shop door model (no separate action-key press to enter) and the attempt-then-confirm town-transaction rule (walk-in opens the panel with no side effects; Enter confirms). The pub still keys Enter/Space for the turn-ending gamble CONFIRM dialog, a distinct in-dialog confirm, not door entry. |

## Calibration record

The old speed x `WALK_TAP_MS` sweep harness (`e2e_walk_calibration.mjs`) was
retired with the town street rebuild. Its grid-town, Space-key-entry model no
longer matched the shipped composed street, and a fixed tap length no longer fit
a world whose facade spacing is derived from geometry rather than a cell grid.

The walker's gesture timing is now geometry-derived: `tapMsForStepPx`
(`tests/e2e/walkthrough_helpers.mjs`) sizes each tap from the pixel distance the
avatar must still cover, so the same seek logic self-corrects at any composed
world width instead of leaning on a hand-tuned constant. The locked spacing and
gesture constants and the measurement behind them live in the audit doc
[docs/active_plans/audits/town_spacing_experiment.md](active_plans/audits/town_spacing_experiment.md):

- spacing (`town_world.ts`): facade gap 44, world padding 80, door width 64
- gesture (`walkthrough_helpers.mjs`): `WALK_TAP_MS` 25, `MIN_WALK_TAP_MS` 20,
  door-align tolerance +-8 px, both derived through `tapMsForStepPx`
- `WALKER_SPEED = 4` and `PER_ACT_BUDGET_MS = 1000` are unchanged

At the locked constants the door-reach probe (`walkTownAvatarToDoorX` across
every composed door) reaches every door with zero overshoot in both modes:

| Mode | Door-reach | Tolerance | Overshoot failures |
| --- | --- | --- | --- |
| beginner | 25/25 (100%) | +-8 px | 0 |
| standard | 30/30 (100%) | +-8 px | 0 |

Revert trigger: a door-reach overshoot regression across a sweep warrants
re-measuring the gesture constants against the composed street per that audit
doc, not a rerun of the retired calibration script.

## Sweep coverage table

Release-gate run (`node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs`)
against the recorded matrix, seeds `{1, 3, 7}` times modes
`{beginner, standard}` (six runs total), most recently generated
2026-07-10T04:03Z: exit code 0, 6/6 runs passed the per-run release rules
(no failure, at least one verified placement or a documented colony-failure
placement waiver, and no majority-truncated develop turns).

Per-mode combined coverage (`matrixCoverage`, unioned with logical OR across
that mode's three seeds):

| Flag | Beginner | Standard | Meaning |
| --- | --- | --- | --- |
| `landAuctionEntered` | true | true | At least one run entered the `land_auction` phase. |
| `humanBuy` | true | true | At least one auction outcome recorded a positive `humanGoodsDelta`. |
| `humanSell` | true | true | At least one auction outcome recorded a negative `humanGoodsDelta`. |
| `gamble` | true | true | At least one run's `counters.gambles` was nonzero. |
| `placement` | true | true | At least one run's `counters.verifiedPlacements` was nonzero. |

`matrixCoverageSatisfied` was true for both modes. One seed-7 leg carried a
`"placement waived: colony failure at round 2"` reason in the worst-first
table -- an early colony failure legitimately ended that run before any
placement opportunity, exempted from the per-run placement rule while the
matrix-level `placement` flag above stayed satisfied from the other seeds.

A representative single seed's counters, from a real
`playthrough_report.json` (seed 3, beginner, active, `finalRound: 6`,
`colonyFailed: false`, `failure: null`):

```json
{
  "humanTurnsCompleted": 6,
  "plansAttempted": 11,
  "plansCompleted": 11,
  "verifiedPlacements": 2,
  "trades": 1,
  "gambles": 1,
  "truncatedTurns": 1
}
```

`humanTurnsCompleted` equals `finalRound` here, satisfying the hard
`assertActiveInvariants` rule.

If the recorded seed set ever stops satisfying coverage, run the
deterministic forward scan and update `RECORDED_SEEDS` in
`tests/e2e/e2e_walkthrough_sweep.mjs` by hand:

```bash
node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs --find-seeds
```

The scan never writes back to the sweep script on its own; a human copies
the result in.
