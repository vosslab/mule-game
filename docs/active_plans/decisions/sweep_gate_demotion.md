# Decision: walkthrough sweep demoted from release gate to diagnostic

## Update (WP-6C, 2026-07-11): sweep RESTORED to release-gate status

Per the town street rebuild plan's Acceptance criteria and gates ("WP-6C
town gate"): the walkthrough sweep (`{1, 3, 7} x {beginner, standard}`, six
runs) was re-run after the mode-composed street rebuild (WP-1A-WP-6B) and
its walker executor rebuild (WP-6A). Result: **6/6 GREEN**, zero town-kind
failures, `matrixCoverageSatisfied: true`.

One town-kind failure surfaced and was fixed to green during this triage
(both seed-1 legs, beginner and standard, identically): `walk_stall`, "town
door mining never reported data-door-state=\"open\"". Root cause: the
post-panel walk-back (`walkBackToStreet`, `tests/e2e/walkthrough_town.mjs`)
used a fixed-tap, one-way south walk with no overshoot correction (`walkTo`
plus the retired grid-cell-derived `WALK_BACK_TAP_MS`), which could overshoot
the street lane far enough south that the next door's approach fell outside
`DOOR_OPEN_RADIUS_PX`'s vertical reach -- reproduced directly (avatar landed
at world y=250 against a lane center of 220, more than the door's 70px open
radius away from the door's street-level y=168). Fixed by converging the
walk-back onto the lane with the same gap-proportional, self-correcting seek
`walkTownAvatarToDoorX` already uses horizontally (new
`walkTownAvatarToStreetLaneY`, `tests/e2e/walkthrough_helpers.mjs`); the now-
dead `WALK_BACK_TAP_MS` constant was removed. This is a walker-harness gesture
fix, not a town production change -- the town geometry itself (spacing,
facade widths, door radii) is unchanged and stays WP-6B-locked.

Two more town-caused gaps surfaced (both walker-level test tooling, not
production) and were fixed to green in the same pass, both traced to
`tests/e2e/e2e_mini_flow.mjs` and `tests/e2e/e2e_full_game.mjs` never having
been updated for WP-4B's "human develop turn starts in town" change: they
waited on `.overworld-svg [data-actor='player-0']` (never mounts at turn
start now) and clicked the class-scoped `.develop-end-turn-button` (now
overworld-only; town uses a chrome-strip button with the same
`data-action="develop-end-turn"` hook). Both now wait on `#town-scene
[data-actor='player-0']` and the shared `[data-action='develop-end-turn']`
selector, which resolves correctly whether the human is in town or has
walked out to the overworld.

Non-town items found during this triage, filed as separate follow-up work in
`docs/TODO.md` rather than fixed here (see that file for full detail):

- `tests/e2e/e2e_walk_calibration.mjs` is stale against the composed-street
  model (pre-rebuild grid assumptions throughout); out of this triage's
  required verification surface and a rewrite on the scale of WP-6B's own
  calibration work. Left for a decision alongside the WP-6D doc close-out
  (rewrite vs retire, plus a matching refresh of
  `docs/WALKTHROUGH_GUIDE.md`'s now-stale Calibration table).
- `tests/playwright/corral_purchase.spec.mjs:267` intermittently fails under
  full parallel-suite load (reproduced twice in a row) but passes 5/5 in
  isolation; root-caused to the shared `claimLandGrantPlotAt` bootstrap
  helper's land-grant sweep-cursor animation timing out under CPU
  contention -- a non-town, environmental parallel-load flake, not a race in
  this test's own waits, so it is documented rather than "fixed" by loosening
  a timeout or touching production code.

Verification: `node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs` exit 0
(6/6); `bash tests/e2e/e2e_run_all.sh` 5/5; `bash check_codebase.sh` 5/5
(508/508 unit tests); full `npx playwright test tests/playwright/` green in
isolation (the one flake above is environmental, not a town-caused defect).
The sweep is therefore restored as a release gate: the town gate defined by
the rebuild plan (zero town-kind sweep failures, all town-caused legs green)
is met, and no residual non-town red remains attached to it.

## Original decision record (2026-07-10, superseded above for the rebuilt town)

## Date

2026-07-10

## Decision

User ruling, verbatim: "the deterministic walker is suspect, do not keep as
a gate."

The walkthrough sweep (`tests/e2e/e2e_walkthrough_sweep.mjs`) is demoted from
a release gate to a diagnostic. `docs/archive/bug_fixes_ui_fixes_plan.md`
tier-3 gate language and the M2/M8 exit criteria that named "sweep 6/6 green"
are closed against the evidence below instead.

## Why

After the WP-2A walk-speed change (`WALKER_SPEED_PX_PER_SEC` 80 to 320,
`src/ui/scenes/walker.ts:60`), the sweep's earlier scattered
non-deterministic stalls turned into a deterministic stall on seeds 1 and 3
at the counter-smithore door, logged as "town avatar left the street." Seed
7 passes both modes. The stall pattern (same door, same failure text, same
seeds every run) points at a walker-harness artifact rather than a product
bug: the seek/gesture constants (`WALK_TAP_MS`, overshoot correction in
`tests/e2e/walkthrough_helpers.mjs`) were tuned against the old 80 px/s
walker speed and have never been retuned for 320 -- WP-2A's own calibration
audit (`docs/active_plans/audits/mule_trip_timing.md`, "Applied calibration"
section) already flagged this as an open follow-on before the sweep
regression was even observed.

## What M2 and M8 closed on instead

- `check_codebase.sh` 5/5 GREEN (507/507 unit tests) on the committed tree.
- Playwright suite green: 78 pass plus 1 known parallel-load flake
  (`town_doors.spec.mjs`, sweep-cursor timing under full parallel load;
  passes isolated and repeated).
- `tests/e2e/e2e_run_all.sh` 4/5 (`e2e_walkthrough` red, the same
  deterministic stall as the sweep).
- WP-2A's calibration evidence table (`mule_trip_timing.md`): five runs at
  320 px/s clear the starved-turn budget with 9.5-13.9% margin, and 320 is
  the lowest speed that stays reliable for door-reach (340+ starts failing
  door-reach outright).
- WP-8B executor unit coverage: 20/20 overworld tests (including catch/
  reveal verification, budget-exhaust, and the hunt_wampus blink-race
  re-decide) and 13/13 town tests, all green.

## What stays open

- Root-cause diagnosis of the seed-1/3 counter-smithore stall, continuing as
  a non-blocking follow-up (see `docs/TODO.md`, "Developer and testing").
- Speed-aware tap sizing in `tests/e2e/walkthrough_helpers.mjs` once the
  root cause is confirmed.
- WP-8C's deferred sweep-counter/single-seed natural-occurrence proof for
  `hunt_wampus`/`assay_plot`; the forced-plan-hook follow-up (strategy layer
  only) is recorded in `docs/TODO.md` to provide that proof once the
  harness stall is resolved.

## References

- `docs/CHANGELOG.md`, 2026-07-10 entries: Patch 49 (WP-2A), Patch 50
  (WP-8B), Patch 51 (WP-8C disposition), and the Decisions and Failures
  bullet recording this ruling.
- `docs/active_plans/audits/mule_trip_timing.md`.
- `docs/archive/bug_fixes_ui_fixes_plan.md` (tracker; M2/M8 rows
  and the rollout checklist).
