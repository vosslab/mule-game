# Town spacing and travel-budget experiment (WP-6B)

## Status: applied and locked (WP-6B, 2026-07-10)

Live-measured evidence for the WP-6B spacing/travel-budget arm and the gesture
retune. Outcome: town spacing is LOCKED at its current provisional values
(unchanged), and the E2E walker gesture constants are locked at their
geometry-derived values. Companion to
[mule_trip_timing.md](mule_trip_timing.md) (the WP-2A base-speed calibration
this builds on).

## Decision that framed this experiment

User decision, 2026-07-10: "Accept as difficulty -- no code change." The town
spacing constants, the base walk speed, and the facade widths all stay as-is.
The food-starved minimum-tick player legitimately cannot complete a full
shopping errand; that is the intended M.U.L.E. starvation penalty, not a bug.
So the travel-budget arm is scored against a REALISTIC NON-STARVED develop
budget (a sufficiently-fed player), not the 5-tick starvation floor.

## The non-starved (sufficient-food) budget, from the engine

A develop turn's tick budget is food-scaled. `computeFoodUsage`
(`src/engine/turn.ts:500-511`): when a player holds at least the round's food
requirement, they receive the FULL budget `DEVELOP_TICKS_FULL`; when short,
the budget scales linearly down to `DEVELOP_TICKS_MIN`.

| Constant | Value | Source |
| --- | --- | --- |
| `DEVELOP_TICKS_FULL` | 50 ticks | `src/engine/constants.ts:669` (planet_mule `developmentMaxTime` 47.5s) |
| `DEVELOP_TICKS_MIN` | 5 ticks | `src/engine/constants.ts:680` (planet_mule `developmentMinTime` 5.0s) |
| `DEVELOP_TICK_MS` | 950 ms/tick | `src/ui/scenes/scene_manager.ts:60` |

At speed multiplier 1 (live pacing):

- Non-starved (sufficient food, `foodHave >= required`): 50 x 950 = 47500 ms.
  10% margin threshold = 42750 ms.
- Starvation floor (zero food): 5 x 950 = 4750 ms. 10% threshold = 4275 ms.

Seed 33's round-1 human develop turn is naturally fed (starting food 4 vs
round-1 requirement 3), so the errand runs under a real 50-tick budget in
engine; each run below started at ticks=50 and ended at ticks 44-45.

## Errand definitions

Two errands, both held-arrow input at speed multiplier 1, reference desktop
viewport, seed 33 (its row 2 is all-plains east and west of the town cell, so
overworld travel is a clean straight line that isolates town travel).

- REALISTIC mule swap to a close plot (the acceptance bar, user 2026-07-10):
  corral spawn -> buy at the corral -> outfit at the NEAREST outfitter (Farm,
  adjacent-left of the corral) -> exit at the NEAREST endpoint (left) -> place
  on the CLOSEST owned plot (the town's west neighbor (2, 3), where the left
  exit respawns). A normal mule swap to a nearby plot.
- MAXIMAL traversal (informational only): corral spawn -> buy -> walk to the
  farthest facade (Mining, leftmost) -> outfit -> walk to the farthest exit
  (right) -> place on the farthest owned plot (2, 8). The deliberately harsh
  full-street trip; not a gate.

## Travel-budget arm result (three tiers, 5 runs per mode)

The acceptance bar is tier (a). Tiers (b) and (c) are recorded for context.

### (a) Realistic errand vs non-starved budget -- PASS (the acceptance bar)

| Mode | Errand avg | Errand worst | Margin vs FED 47500 ms (worst) | Ticks used |
| --- | --- | --- | --- | --- |
| beginner | 2640 ms | 2681 ms | +94.4% PASS | 2 (50 -> 48) |
| standard | 2653 ms | 2683 ms | +94.4% PASS | 2 (50 -> 48) |

A routine mule swap to a nearby plot completes in ~2.65 s, clearing the >= 10%
margin with ~94% headroom, 5/5 runs each mode, at the current (locked) spacing.
Requirement MET. The two modes are near-identical because a close swap never
traverses the full street. Run-to-run spread was ~30-60 ms, so the timing is
effectively deterministic.

### (b) Maximal traversal errand vs non-starved budget -- informational PASS

| Mode | Errand avg | Errand worst | Margin vs FED 47500 ms (worst) |
| --- | --- | --- | --- |
| beginner | 5263 ms | 5276 ms | +88.9% PASS |
| standard | 5795 ms | 5845 ms | +87.7% PASS |

Even the deliberately harsh full-street trip clears the non-starved budget by
~88% in both modes. Not a gate; recorded to show the fed player has ample room.

### (c) Maximal traversal errand vs starvation-floor budget -- intended penalty

| Mode | Errand worst | Margin vs STARVED 4750 ms (worst) |
| --- | --- | --- |
| beginner | 5276 ms | -11.1% (intentional, not required) |
| standard | 5845 ms | -23.1% (intentional, not required) |

A fully food-starved player (5-tick floor, 4750 ms) cannot complete the maximal
full-street shopping trip. This is documented as the intended M.U.L.E.
starvation penalty (user decision 2026-07-10, "accept as difficulty"), NOT a
target the town is required to satisfy. A starved player is a rough, limited
edge case; the meaningful guarantee is tier (a).

## Why spacing is not the travel lever (candidate ladder, supporting evidence)

This ladder concerns the MAXIMAL trip (tiers b/c); the acceptance-bar realistic
errand at ~2.65 s is far inside budget at any spacing. The maximal errand's
walking is dominated by the corral -> Mining -> right-exit traversal. Measured
pure held-arrow traversal at the current spacing:

| Mode | corral -> Mining | Mining -> right exit | traversal total |
| --- | --- | --- | --- |
| beginner | 1599 ms | 2440 ms | 4039 ms |
| standard | 1612 ms | 2959 ms | 4571 ms |

That traversal is ~756 px of FIXED facade widths crossed ~1.5x, plus ~1235 ms
of spacing-INDEPENDENT overhead (buy/outfit panel dwell, walk-backs, exit,
overworld walk, place). A validated distance model (predicts the measured
current-spacing full errand within ~35 ms) sweeps the spacing ladder
`traversal = 1027 + pad + 8*gap` (standard) / `899 + pad + 7*gap` (beginner),
plus the measured ~1235 ms overhead:

| Candidate (gap, pad) | world (beg / std) | full errand vs STARVED floor (std / beg) |
| --- | --- | --- |
| C1 current (44, 80) | 964 / 1136 | -22% / -11% |
| C2 (28, 56) | 852 / 1008 | -12% / -2% |
| C3 (16, 40) | 772 / 916 | -5% / +5% |
| C4 facades touching (0, 44) | 716 / 844 | +3.5% (still fail) / +12% |

Even facades-touching (gap 0, visually unacceptable and it would break the
pinned world-width unit test and the WP-3C visuals) leaves STANDARD failing the
10% starvation-floor bar. No in-scope spacing lifts the starved floor to a full
errand at the fixed 320 px/s base walk speed, and every candidate clears the
non-starved (fed) budget by ~87%+. Spacing is therefore not the lever;
narrowing it is neither necessary (fed bar already passes) nor sufficient
(starved floor is intended to fail). Spacing stays LOCKED, keeping
`tests/test_town_world.mjs` (964 / 1136) and the WP-3C visuals green.

## Readability arm result

`npx playwright test tests/playwright/town_street.spec.mjs` -- 26 passed,
including the facade-label legibility ladder at the two supported viewports
[1200x750, 1280x800]: label positive width/height, in-viewport, and contrast
checked against the WCAG AA floor. The narrow 320/480/768 widths are dropped
(settled user decision); the ladder runs at the two supported viewports only.

## Locked constants

### Spacing and geometry (`src/ui/scenes/town_world.ts`, UNCHANGED, locked)

| Constant | Locked value | Note |
| --- | --- | --- |
| `TOWN_FACADE_GAP` | 44 px | inter-facade gap |
| `TOWN_STREET_END_PADDING` | 80 px | per-end street padding (holds the exit zone) |
| `TOWN_DOOR_WIDTH` | 64 px | door opening; door-entry half-window is 64/2 - 22 radius = 10 px |
| `TOWN_REFERENCE_VIEWPORT_WIDTH` | 576 px | camera-scroll floor; both worlds exceed it |

Derived world width (unchanged): beginner 964 px, standard 1136 px. Corral door
center 658 px, Mining door center 146 px, in both modes.

### Gesture constants (`tests/e2e/walkthrough_helpers.mjs`, derived, locked)

Derived from the current town geometry and the effective walk speed
(`WALKER_SPEED_PX_PER_SEC` 320 x harness `WALKER_SPEED` 4 = 1280 px/s). No
hand-set magic numbers; all fall out of `tapMsForStepPx` / the door-entry
window.

| Constant | Locked value | Derivation |
| --- | --- | --- |
| `WALK_TAP_MS` | 25 ms | half a cell (32 px) / 1280 px/s |
| `WALK_BACK_TAP_MS` | 20 ms (REMOVED, WP-6C) | quarter cell (16 px) / 1280, floored at the 20 ms frame-safe minimum. Update (WP-6C, 2026-07-11): this fixed-tap constant was removed when `walkBackToStreet` switched from a one-way south walk to the converging, gap-proportional `walkTownAvatarToStreetLaneY` seek (see [sweep_gate_demotion.md](../decisions/sweep_gate_demotion.md)). No `WALK_BACK_TAP_MS` remains in `tests/e2e/`. |
| `MIN_WALK_TAP_MS` | 20 ms | quarter cell (16 px) / 1280, floored at 20 ms |
| `TOWN_DOOR_ALIGN_TOLERANCE_PX` | 8 px | door half-width 32 - avatar radius 22 - 2 px jamb margin |
| `DOOR_SEEK_MAX_TAP_MS` | 50 ms | one door width (64 px) / 1280 px/s |
| `DOOR_SEEK_MIN_TAP_MS` | 11 ms | just under twice the 8 px tolerance / 1280, floored at 10 ms |

The "Provisional; WP-6B locks the final value" markers are removed from both
files; the values above are the locked final values.

## Door-reach reliability (no overshoot at the locked constants)

`walkTownAvatarToDoorX` (the gap-proportional door x-seek) approached every
composed door, 5 rounds per door, out-and-back, at the calibrated speed:

| Mode | Door-reach | Alignment window | Stalls |
| --- | --- | --- | --- |
| beginner | 25/25 (100%) | +-8 px | 0 |
| standard | 30/30 (100%) | +-8 px | 0 |

Zero door-reach overshoot at the locked gesture constants, in both modes.

## Method and harnesses

Measured with three scratch harnesses under `tests/e2e/` (playwright-core,
built dist over a random loopback port, seed 33), deleted after this report:

- traversal probe: pure held-arrow town traversal, ?speed=1.
- full-errand harness: the complete worst-case errand, ?speed=1, 5 runs per
  mode, reporting errand ms + in-engine ticks-remaining.
- door-reach probe: `walkTownAvatarToDoorX` across every composed door,
  speed-parameterized.

All values here come from real runs, not estimates; the candidate-ladder model
is the sole projection and is validated against the measured current-spacing
full errand within ~35 ms.
