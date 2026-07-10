# Decision: walkthrough sweep demoted from release gate to diagnostic

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
