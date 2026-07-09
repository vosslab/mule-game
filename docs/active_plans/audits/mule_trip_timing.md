# Human develop-turn errand timing (live measurement)

Live wall-clock timing of the human develop-turn errand -- get a mule, get
equipped, and walk to a plot -- against the engine's real tick budget, per the
question "we will probably need to time how long it takes to get a mule, get
equipped, and go to plot, live time with character movement."

No production code was changed to produce this report. All numbers come from
a scratch Playwright harness (`_temp_trip_timing.mjs`, deleted after this
report was written) that drives the real, built UI over HTTP at `?speed=1`
(live pacing, not the test-suite's accelerated `speed=8`), on the fixed
`seed=33` board (5x9, town at (2,4), row 2 all plains -- the same board
`tests/playwright/town_scene.spec.mjs` uses).

## Headline table

| Scenario | Errand total | Full-fed budget (47.5s) margin | Starved-min budget (4.75s) margin |
| --- | --- | --- | --- |
| Adjacent-to-town | 1.69s (avg of 2 runs) | +45.8s | +3.06s |
| Mid-distance | 4.72s | +42.8s | +0.03s (razor-thin) |
| Far-corner (worst case) | 6.56s | +40.9s | -1.81s (FAILS) |
| Adjacent, `?timer=relaxed` | 1.67s | +93.3s (95s budget) | +7.83s (9.5s budget) |

**Recommendation:** the faithful full-fed tick budget (47.5s) is comfortably
playable at the current walk speed for every distance tested (40+ seconds of
margin even in the worst case). The problem is the food-starved minimum
(4.75s): a starved player's errand is only guaranteed to fit if their plot is
essentially adjacent to town. A mid-distance plot leaves ~30ms of margin
(not reliably completable once human reaction time and any jitter are
counted), and the worst-case far corner overruns the starved budget by 1.8
seconds outright. Since the tick budget is PM-anchored and not a knob to
turn, the fix is the UI-side walk speed: **raise `WALKER_SPEED_PX_PER_SEC`
from 80 to roughly 120 px/s (1.5x)** would cut `exitToArrival` proportionally
(far-corner's 4.85s of walking becomes ~3.2s, bringing the far-corner total
to about 4.9s -- still slightly over the 4.75s starved budget) or to **160
px/s (2x)** to comfortably clear the far corner within the starved budget
(far-corner total drops to about 3.4s, leaving ~1.3s of margin). This is a
recommendation only; no timing constant was changed by this report. See
`src/ui/scenes/walker.ts:60` for the constant.

## Method

- Harness: bare Playwright (`playwright-core`) library script, built on the
  same pattern as `tests/e2e/e2e_full_game.mjs` (build `dist/` via
  `build_github_pages.sh`, serve it on a random loopback port, drive
  Chromium headless).
- URL: `?seed=33&speed=1` (live pacing) for all scenarios, plus
  `&timer=relaxed` for the relaxed-timer scenario.
- Every human develop turn resets `HumanDevelopLayer`'s `spawnCell` signal to
  `undefined`, and `OverworldScene`'s `defaultSpawnCell` falls back to the
  town cell's west neighbor `(2, 3)` whenever no `spawnCell` prop is passed
  (`src/ui/scenes/human_develop_layer.tsx`, `src/ui/scenes/overworld_scene.tsx`).
  So every scenario's turn starts and (after exiting west) returns to the
  same fixed cell `(2, 3)`; only the claimed target plot varies, which
  isolates the walk-distance variable cleanly.
- Land-grant claiming requires the sweep cursor to actually be on the target
  cell when clicked (`src/ui/solid/game_screen.tsx`'s `handlePlotClick` is a
  no-op off-cursor). The harness polls the cursor (`g.plot-cursor` class) and
  clicks only once matched, confirming `data-owner="0"` afterward. This
  differs from `tests/playwright/town_scene.spec.mjs`'s `reachHumanDevelop`,
  which clicks immediately without waiting for the cursor -- a check of that
  existing spec (via a throwaway repro, not committed) shows its claim click
  is in fact a no-op in every case tried (the cursor is still on `(0,0)` a
  few tens of ms after "New Game"), and its own owner-list dump was empty. The
  spec still passes because its final assertion only checks that *some* mule
  glyph exists anywhere on the board, which an AI player's own placement
  earlier in the game also satisfies. This is an existing-test gap, not
  something this report's lane fixes (scenes/specs are out of scope here);
  flagging it because it means claim timing needed independent verification
  rather than copying that spec's pattern.
- The claim-wait (how long the harness waits for the sweep cursor to reach
  the target plot) is one-time land-grant setup, not part of the develop-turn
  errand, so it is reported separately and excluded from the totals above.
- Walking path: sequential Manhattan (row axis fully, then column axis),
  not diagonal. This is conservative (slightly longer than a human cutting
  corners), so it does not understate real travel time.
- Segments timestamped: (1) turn start -> town entry, (2) town entry -> mule
  bought at the corral, (3) buy -> outfitted at the food counter, (4) outfit
  -> town exit, (5) exit -> arrival at the target plot, (6) install
  (place the M.U.L.E., confirmed via that cell's own `data-outfit` badge, not
  just any glyph on the board).
- Board terrain (row, col), from the seed-33 `data-terrain` grid:

  ```
  row0: P P P M R P M P P
  row1: M M P P R P M M M
  row2: P P P P T P P P P
  row3: P P P P R P P M M
  row4: P M P P R P P P M
  ```

  (P=plains, M=mountain, R=river, T=town at (2,4).) River carries no walker
  slowdown in this engine (`slowdownForTerrain` only special-cases mountain,
  `src/ui/scenes/walker.ts:108`); only mountain applies the 0.4x factor.

## Scenarios and target plots

| Scenario | Target plot | Path notes |
| --- | --- | --- |
| Adjacent-to-town | (2, 3) | The turn's own start/return cell; 0-cell walk after exit. |
| Mid-distance | (0, 1) | 4-cell Manhattan walk from (2,3); crosses one mountain cell (1,1). |
| Far-corner | (4, 8) | 7-cell Manhattan walk from (2,3), the board's farthest corner from the return cell; lands on a mountain plot. |

## Segment breakdown (ms)

| Segment | Adjacent (run1) | Adjacent (run2) | Mid-distance | Far-corner | Relaxed (adjacent) |
| --- | --- | --- | --- | --- | --- |
| Turn start -> town entry | 412 | 414 | 406 | 420 | 416 |
| Town entry -> bought | 3 | 4 | 6 | 5 | 5 |
| Bought -> outfitted | 433 | 419 | 442 | 442 | 416 |
| Outfitted -> town exit | 834 | 848 | 848 | 846 | 823 |
| Exit -> arrival at plot | 5 | 3 | 3,013 | 4,848 | 3 |
| Install | 3 | 3 | 3 | 1 | 2 |
| **Total** | **1,690** | **1,691** | **4,718** | **6,562** | **1,665** |
| Claim wait (setup, excluded) | 6,327 | 6,311 | 322 | 12,908 | 12,660 |

The two adjacent-to-town runs (1,690ms and 1,691ms) confirm the harness is
stable: a 1ms spread across runs.

The town-side segments (turn start -> town entry, buy, outfit, exit) are
identical across all scenarios (~1.65-1.7s total) since they never depend on
the claimed plot -- only the "exit -> arrival" segment scales with distance:
5ms (already there) -> 3.01s (mid, 4 cells incl. one mountain) -> 4.85s (far,
7 cells incl. a mountain landing). "Install" is uniformly trivial (1-3ms) in
every scenario; it is never the bottleneck.

## Budget comparison

Tick-budget anchors (`src/engine/constants.ts:668,679`,
`src/ui/scenes/scene_manager.ts:60,110`): `DEVELOP_TICKS_FULL` = 50 ticks,
`DEVELOP_TICKS_MIN` = 5 ticks, `DEVELOP_TICK_MS` = 950ms/tick,
`RELAXED_TIMER_MULTIPLIER` = 2x (applies to the tick cadence only, not to
`WALKER_SPEED_PX_PER_SEC` -- confirmed empirically: the relaxed-timer run's
errand total, 1.665s, is the same as the non-relaxed runs within noise, so
relaxed timer only doubles the available budget, it does not change how long
the errand itself takes).

| Scenario | Errand total | Full-fed 47.5s | Starved-min 4.75s | Relaxed full 95s | Relaxed starved-min 9.5s |
| --- | --- | --- | --- | --- | --- |
| Adjacent-to-town | 1.69s | +45.81s | +3.06s | n/a (same errand) | n/a |
| Mid-distance | 4.72s | +42.78s | +0.03s | n/a | n/a |
| Far-corner | 6.56s | +40.94s | -1.81s | n/a | n/a |
| Adjacent (measured relaxed) | 1.67s | n/a | n/a | +93.33s | +7.83s |

Intermediate rounds (per `FOOD_REQUIREMENTS_BY_ROUND`,
`src/engine/constants.ts:426-463`) give a partially-fed player a tick budget
between the 5-tick minimum and 50-tick full budget
(`developmentTime = f * 50 + (1 - f) * 5` ticks, where `f` is the fraction of
that round's food requirement held). This report does not compute every
intermediate value -- the fed fraction depends on a specific player's food
stock at a specific round, which this harness does not simulate -- but the
two endpoints already bracket the risk: any real-time budget below roughly
4.75s + errand-total is where a plot distance stops being safely reachable,
and the mid/far scenarios above show that threshold sits close to (mid) or
inside (far) the achievable plot distances on this board.

## Caveats

- `PERSONAL_EVENT_BANNER_HOLD_MS` (1.8s, `src/ui/solid/event_banner.tsx:44`)
  holds the tick clock at turn start when a personal event fires, adding a
  real-time bonus buffer not counted here (it is conditional on an event
  firing that round, so it is not a reliable cushion to plan around).
- Manhattan (non-diagonal) walking is a conservative upper bound; a player
  moving both axes at once would arrive somewhat faster, so real starved-turn
  margins may be slightly better than shown here, not worse.
- Buying and outfitting cost only money, not ticks
  (`applyBuyMule`/`applyOutfitMule`, `src/engine/turn.ts:1041,1072`); only
  the develop turn's own tick-draining clock and the walking/interaction time
  it takes matter for this budget question.
- These are single-run (or 2-run, for the primary scenario) live
  measurements in a headless Chromium instance; real player timing will vary
  with reaction time, but the ~1ms spread between the two adjacent-to-town
  runs suggests the walker/engine timing itself is deterministic and not a
  source of the variance a real playtest would see.
