# CHANGELOG.md

## 2026-07-11

### Fixes and Maintenance

- Testing: fixed a walker-harness gesture bug and two stale
  E2E scripts surfaced by the sweep re-triage. The post-panel walk-back
  (`walkBackToStreet`, `tests/e2e/walkthrough_helpers.mjs`) overshot the street
  lane past the next door's open radius; a new converging
  `walkTownAvatarToStreetLaneY` seeks the lane with the same gap-proportional,
  self-correcting logic the horizontal approach already used. `e2e_mini_flow`
  and `e2e_full_game` (`tests/e2e/`) were updated off the earlier
  overworld-start turn assumption to the corral-spawn town-first start. The dead
  `walkTownAvatarToDoor` helper and its four tests were deleted. The
  environmental (non-town) parallel-load flake in
  `tests/playwright/corral_purchase.spec.mjs` was filed to
  [docs/TODO.md](TODO.md) rather than masked.

### Removals and Deprecations

- Testing: removed `tests/e2e/e2e_walk_calibration.mjs`. Its
  grid-town, Space-key entry model and speed x tap-length sweep were superseded
  by the geometry-derived gesture constants (`tapMsForStepPx` in
  `tests/e2e/walkthrough_helpers.mjs`); the locked-constant door-reach
  measurement now lives in the audit doc
  [docs/active_plans/audits/town_spacing_experiment.md](active_plans/audits/town_spacing_experiment.md).

### Decisions and Failures

- Testing: locked the town spacing constants (unchanged: gap
  44, pad 80, door 64; derived worlds 964 beginner / 1136 standard) and the
  geometry-derived gesture constants (WALK_TAP_MS 25, minimum 20, door-align
  +-8px, door-seek 50/11ms), removing the provisional markers. Per the user
  decision (accept-as-difficulty, 2026-07-11) the travel-budget bar is a
  realistic mule-swap-to-close-plot errand measured against the non-starved fed
  budget (50 ticks x 950ms = 47500ms); only the food-starved 5-tick floor cannot
  finish the maximal full-street trip, and that is accepted as a starvation
  penalty rather than a spacing defect. Evidence:
  [docs/active_plans/audits/town_spacing_experiment.md](active_plans/audits/town_spacing_experiment.md).
- Testing: the walkthrough sweep was re-triaged and RESTORED
  to release-gate status -- 6/6 across seeds {1,3,7} x modes {beginner,standard}
  after the harness and script fixes above. Every failure was triaged by cause;
  the only residual is the environmental (non-town) parallel-load flake filed in
  [docs/TODO.md](TODO.md), so no town-caused failure remains and the sweep is a
  green release gate again.

### Developer Tests and Notes

- Testing: the spacing/travel-budget experiment measured the
  arms behind the accept-as-difficulty decision above. Against the fed budget
  (47500ms), the realistic mule-swap errand passes with a +94% margin in both
  modes and the maximal full-street trip clears +88% (informational); door-reach
  was 100%. Only the food-starved 5-tick floor cannot complete the maximal trip.
  Full arms:
  [docs/active_plans/audits/town_spacing_experiment.md](active_plans/audits/town_spacing_experiment.md).

## 2026-07-10

### Additions and New Features

- UI: town facades rebuilt in `src/ui/scenes/town_scene.tsx`
  and `src/style.css` -- full-height Planet-inspired industrial storefronts on a
  shared baseline, each with an integrated per-facade door (animated open/closed
  via `data-door-state`), a resource emblem, and a persistent label, over a worn
  street surface with no editor-grid lines for a unique modern look. The renderer
  is catalog-driven, so the beginner mode's 5 facades and the standard mode's 6
  facades render correctly. On-palette (`test_sprite_palette` 2/2); the
  `town_street.spec.mjs` browser suite stays 7/7.
- UI: town facades now show live ambient economics in
  `src/ui/scenes/town_scene.tsx` -- corral mule price and stock, per-outfitter
  outfit prices, a pub "Ends turn" label, and truthful neutral Land and Assay
  labels (Land Office pricing deferred). Every value reads from the SAME
  store selectors the corral and outfit panels use, so there is a single source of
  truth (`store.state.store.mulePrice` and `muleStock`, `computeOutfitCost` and
  `OUTFIT_COST`), surfaced through `data-ambient-price` and `data-ambient-stock`
  hooks. Verified live: corral $100 / Stock 14, mining outfit $75.
- Docs: new `docs/SCREEN_FLOWCHART.md` and `docs/SCREEN_DESIGNS.md` map the
  game's screen flow and per-screen content across three references -- the 1983
  original (Kroah disassembly writeup + `MULE-Disassembled_Memory.asm`, whose
  `round:` driver is the authoritative state machine), the 1990 NES port
  (studied from screenshots), and 2011 Planet M.U.L.E. (decompiled Java
  `controller/phase/*` + `view/*Painter` classes). `SCREEN_FLOWCHART.md` gives
  the whole-game and per-round flow (ASCII plus a Mermaid round-loop graph) and
  a transition-trigger table; `SCREEN_DESIGNS.md` is a screen-by-screen
  compare-and-contrast plus a "Shared visual vocabulary" section framed around the
  information each element conveys (identity tokens, resource emblems, price axis,
  store rails, time bar, persistent HUD, map glyphs) and a use-of-space and scale
  analysis: no wasted screen space, the colonist token about a quarter of a land
  tile, and scale chosen per screen (town looms, map surveys, auction abstracts).
  The dedicated auction walkthrough matches the captured NES/Planet frames to
  `mule_rules.md` with labeled ASCII anatomies of the status and floor screens,
  the three auction stages (status accounting -> binary buyer/seller declaration
  -> real-time floor), the walk mechanic (seller high walking price down, buyer
  low walking bid up, unit-by-unit accelerating transactions, exit conditions,
  collusion), and the store's role in price formation (guaranteed counterparty
  bounding the band, intermediary that only resells what it bought, round-to-round
  repricing on scarcity). Confirmed the auction is a vertical price axis in all
  three (buyers rise, sellers fall, trade where lines meet); our repo's horizontal
  track is the deliberate departure. Reference
  screenshots are copyrighted, so they are linked to external sources
  (c64-wiki, MobyGames, carpeludum) rather than committed.
- UI: town interior now has solid building collision -- new
  `src/ui/scenes/town_layout.ts` is the single source of truth for building
  footprints and doorway gaps, consumed by both the renderer and a new
  collide-and-slide movement clamp (`resolveTownWalk`). Buildings block
  walking outside their doorway gaps (gap width specified in avatar-widths);
  the street stays open so every shop door and edge exit remains reachable;
  the store's central smithore bay is its walk-in doorway aligned to the
  north/south cross-street. Covered by `tests/test_town_layout.mjs`
  (flood-fill reachability from spawn to all 7 doors and 4 exits, wall-slide
  monotonicity, solid-outside-gap, renderer no-drift).
- UI: added an explicit letterboxed 16:10 game stage
  (`#game-stage`) that every in-game surface (`#game-hud`/`#game-map`/
  `#game-panel`) renders inside; the stage is the largest 16:10 box that fits
  the viewport, centered with letterbox bars, and is a
  `container-type: size` query container. The board is a flex slot
  (`#game-map.game-map-filled`) that fills the space between HUD and panel on
  board-showing phases, so each phase renders the largest board that fits
  with no scroll or clip. New `tests/playwright/game_stage.spec.mjs` (3
  tests: 16:10 aspect at wide and tall viewports, content containment,
  board-slot fill). Makes the `HUMAN_GUIDANCE` "fill the canvas" rule
  mechanically checkable for M6/M7.
- Testing: new `tests/e2e/e2e_run_all.sh` step-runs mini_flow,
  full_game, balance_sim (`--import tsx`), balance_report, and the
  single-seed active walkthrough; calibration and sweep are excluded as
  explicit commands (sweep is documented as the release gate). Named
  `e2e_run_all.sh` rather than the plan's originally proposed `run_all.sh`
  because `tests/test_test_naming_conventions.py` enforces the `e2e_*.sh`
  prefix; `docs/E2E_TESTS.md` and the plan doc updated to match.
- Docs: new `docs/WALKTHROUGH_GUIDE.md` covering the harness
  layers, run commands, tick budgets with derivation, the 11-kind failure
  taxonomy with triage steps, an edge-case table, the calibration table plus
  its regenerate command, the sweep coverage table, and the
  strategy/mechanics separation and rule-change tolerance the harness relies
  on. Pointers added from `docs/USAGE.md` and `docs/E2E_TESTS.md`.
- UI: new `src/ui/solid/corral_purchase_panel.tsx`, an
  attempt-then-confirm corral purchase panel replacing the old notice-only
  `buyAtCorral` path. Walking in opens a modal (`[data-corral-panel]`,
  `role="dialog"`) covering all five outcomes
  (buyable/purchased/carrying/out_of_stock/insufficient_funds, exposed via
  `data-corral-outcome`) with price, stock, and funds read live from engine
  store state; `buy_mule` dispatches only on explicit confirm (Enter on the
  auto-focused Buy button, or a mouse click), arrow keys move roving focus
  (reusing `bindRovingFocus`), Escape dismisses, and movement is frozen while
  the panel is open. `.corral-purchase-*` CSS is sized off `#game-stage`
  cqw/cqh. Implementation bug caught during development: `justPurchased` had
  to be a `createSignal` set before dispatch -- a plain `let` let the outcome
  memo recompute too early and showed the wrong panel state.
- Testing: `hunt_wampus` and `assay_plot` develop plans now
  execute spatially instead of logging and ending the turn --
  `executeHuntWampus`/`executeAssayPlot` (`tests/e2e/walkthrough_overworld.mjs`)
  walk the avatar to the wampus or target plot and press the action key
  within budget; `executeArmAssay` (`tests/e2e/walkthrough_town.mjs`) drives
  the town-side assay-office arming leg as a walk-in-trigger door use;
  `e2e_walkthrough.mjs` gained `executeHuntWampusFromTown`/
  `executeAssayPlotFromTown` orchestration wrappers that own the
  town-to-overworld transition for each plan. `skipOpportunisticDevelopPlan`
  is removed -- no develop-plan kind is skipped anymore -- and the turn loop
  no longer force-ends after an opportunistic plan (only `end_turn` or
  `gamble_pub` end the turn now, matching the strategy layer's actual
  intent). The hunt_wampus wampus-blink race (the creature can despawn
  between plan decision and execution) is downgraded from a run failure to a
  re-decide, since it is a legitimate timing window rather than a walker
  bug. `walkBackToStreet`'s arrival check converted from the coarse
  `data-at-door` cell rect to a positional street-y predicate (the coarse
  check let the avatar stop short of the actual street row); `executeBuyMule`
  converted to drive the corral panel's confirm gesture instead of
  the retired direct-buy path. Reviewer PASS; 507/507 unit tests including
  new y-tracking gesture fakes.
- UI: new `src/ui/scenes/town_world.ts` replaces the
  9x5 town grid with a mode-composed world model. A storefront catalog plus
  NES-order street composition (`composeTownStreet`/`composeTownStreetForMode`/
  `townCapabilitiesForMode`) builds the town per game mode from town-layer
  capability flags (`landOfficeVisible`/`assayVisible`/`miningOutfits`):
  beginner composes Mining/Energy/Farm/Corral/Pub (5 facades, derived world
  width 964), standard adds the Land Office (6 facades, width 1136), and
  tournament is a catalog-ready entry (adds Assay, plus crystite in Mining)
  rendered by no current engine mode. World width, facade positions, the corral
  spawn, camera bounds, and the two endpoint exits all derive from the composed
  list. Movement uses solid-facade plus bounded-threshold collision
  (`resolveTownWalk`/`isTownPointBlocked`, collide-and-slide) and door-open
  hysteresis with single-fire threshold entry (`computeOpenDoors`/
  `townDoorAtThreshold`/`townExitAt`). The change is presentation-only and
  alters no engine mechanics; it corrects the retired grid, whose pass-through
  buildings and four exits modeled the wrong space (per
  `docs/THE_TOWN_ANALYSIS.md`). `src/ui/scenes/zones.ts` retired its
  town-interior constants (overworld helpers kept); `src/ui/scenes/town_scene.tsx`
  carries a fenced tsc-green shim with inert collision pending the
  camera cutover (see Decisions and Failures).
- UI: new `src/ui/scenes/town_camera.ts` -- a pure horizontal
  camera. `townCameraOffset(avatarWorldX, worldWidth, viewportWidth)` gives a
  soft-zone centered follow, clamps at both world ends, and returns offset 0
  (no scroll) when the composed world fits the viewport. Covered by
  `tests/test_town_camera.mjs` (8 cases).
- UI: new `src/ui/solid/town_chrome.tsx` -- a dedicated town
  HUD strip (draining time bar plus accessible numeric `Ticks left`, money, tow
  state, and nearest-storefront label) mounted while in town, so the
  development clock stays visible for the whole town visit (previously
  `DevelopPanel`, and thus `Ticks left`, was hidden in town). Sources match
  `DevelopPanel`/corral panel (single source of truth). The nearest-storefront
  label is a stub pending wiring.
- UI: `src/ui/scenes/town_scene.tsx` replaced the scattered
  `confirmingGamble`/`corralPanelOpen` booleans with one explicit
  `TownInteractionState` machine (street / door-opening / at-threshold /
  panel-open / leaving). Movement freezes structurally while a panel is open,
  and dismissing a panel repositions the avatar street-side of its door and
  re-arms the walk-in. The immediate `outfit_mule` dispatch is removed and gated
  behind a placeholder confirm panel; land and assay route to
  placeholder/confirm panels. Adds `data-town-state`. Reviewed
  PASS: attempt-then-confirm is enforced structurally, with no economic dispatch
  on entry anywhere.
- UI: shipped the town's Land Office and Assay Office
  transaction panels, replacing the retired placeholder action-panel
  path. New `src/ui/solid/land_office_panel.tsx` is a purely informational
  in-stage modal (`role="dialog"`, roving focus, focused Dismiss, Escape
  dismiss) that dispatches nothing on entry or Dismiss -- its single
  `informational` `LandOfficeOutcome` truthfully describes that new land
  arrives through the colony-wide Land Grant and Land Auction phases, not a
  per-town sale, and it composes only in standard mode and up (where
  `landOfficeVisible` is true). New `src/ui/solid/assay_office_panel.tsx` is an
  attempt-then-confirm modal with `idle`/`armed`/`sample_ready` states whose
  `onArmAssay` fires only on an explicit Arm confirm; its facade turns on in no
  shipped mode, so it is built ahead of a future mode (like the door and
  arm-and-reveal flow before it). `src/ui/scenes/town_scene.tsx` now routes the
  Land Office and Assay Office doors to these panels.

### Behavior or Interface Changes

- UI: rotated the goods-auction arena
  (`src/ui/solid/auction_screen.tsx`) to a landscape horizontal price track --
  buyers advance rightward from the left as bids rise, sellers leftward from
  the right as asks fall, meeting mid-track where trades fire; store buy/sell
  prices anchor the left/right track ends. Players now occupy stacked
  horizontal lanes (price drives the x axis, was y); the sit-out "line judge"
  sideline moved to the bottom edge. Presentation-only: engine intents
  unchanged. New arena geometry (`TRACK_LENGTH` 480 x `TRACK_BREADTH` 260)
  handed to the canvas-fill CSS work; avatars expose per-frame `data-x`
  (moving price coord) alongside `data-y` (fixed lane). Readout-variant
  decision recorded in `docs/active_plans/decisions/auction_readout_variant.md`.
  Two predicted-red playwright motion polls await the spec update.
- UI: town doors now open on approach and close on
  retreat, and walking through an open doorway is the complete entry action
  -- new `computeOpenDoors`/`resolveTownWalkWithDoors` in
  `src/ui/scenes/town_layout.ts` (hysteresis: opens within 48px of the door,
  closes past 68px) and `refreshDoors`/`detectWalkIn` (edge-triggered at
  `DOOR_ENTER_Y`) in `src/ui/scenes/town_scene.tsx`. Enter/Space door-entry
  handling is removed; Enter remains only to confirm the pub gamble dialog.
  Doors expose `data-door-state="open"|"closed"`; hint strings rewritten to
  describe walk-in entry. The land-office counters are entered by walking
  north into the podium; the corral's smithore bay only outfits a mule when
  the player is carrying an unoutfitted one.
- UI: the goods-auction screen now fills the 16:10 stage
  -- `.auction-screen` sized to `min(94cqw, 1400px)`, `.auction-track-svg`
  to `min(92cqw, calc(37cqh * 480 / 260))` preserving the track's
  aspect ratio, the price readout's width cap removed, and the players grid
  switched to `auto-fit minmax(11rem, 1fr)` (`src/style.css`). Measured
  honest screen-only height coverage is 76.6%/84.5%; the visual pass
  accepted this with a content-based rationale rather than chasing a
  coverage threshold.
- Testing (colony-failure placement waiver): the sweep gate waives
  the per-run `verifiedPlacements >= 1` invariant when the game ended via the
  engine's colony-failure rule (`ScoringPayload.colonyFailed` threaded
  through `report.write` into sweep evaluation); the waiver is recorded
  honestly in the run's reasons (`"placement waived: colony failure at round
  N"`), and matrix-level placement coverage is unchanged. Files:
  `tests/e2e/e2e_walkthrough.mjs`, `walkthrough_report.mjs`,
  `e2e_walkthrough_sweep.mjs`, `tests/test_walkthrough_sweep.mjs`.
- Testing (participation invariant second amendment): the per-run
  auction-participation check is demoted from a hard invariant to a logged
  warning -- a held-role participant whose AI price matches from the opening
  tick legitimately pushes no intents and may never trade (seed 3 flaked
  around 2/3 of runs); `humanTurnsCompleted` stays a hard invariant, and
  trade-occurrence proof is owned by the sweep's `matrixCoverage`. Files:
  `tests/e2e/walkthrough_exec.mjs`, `tests/test_walkthrough_plan_exec.mjs`,
  the plan doc.
- UI: `.land-grant-panel` widened to `92cqw` with
  `box-sizing: border-box`; the hint text and Pass button are grouped into a
  new `.land-grant-status-row`.
- UI: `.land-auction-panel` widened to `min(92cqw, 1400px)`;
  `land_auction_panel.tsx` regrouped into three columns
  (`.land-auction-info`/`.land-auction-status`/`.land-auction-side`), with
  all selectors, ids, and `data-` attributes preserved.
- UI: `.production-panel` widened to `92cqw` with
  `box-sizing: border-box`; `.production-list` switched to a grid
  (`repeat(auto-fit, minmax(260px, 1fr))`). The same fix round added the
  missing `box-sizing: border-box` to both the land-grant and production blocks
  (the claimed coverage had been an accidental overshoot without it).
- UI: `.scoring-panel` merged into a single rule, widened
  to `94cqw`, `min-height` tuned from `86cqh` to `84cqh` after measuring the
  86 value exactly flush (0.00px margin) against `#game-stage`'s
  `overflow: hidden` at 1200x1000 (ladder: 86 -> 0.00px, 85 -> 0.50px,
  84 -> 8.00px); `84cqh` buys 8px of real margin. New parametrized
  containment test in `tests/playwright/scoring_screen.spec.mjs` (a
  `playToScoring` helper extracted; `#game-panel` inside `#game-stage` at
  1600x900 and 1200x1000, 1px slack). The honest 84% height result versus
  the 85% starting hypothesis is accepted per the thresholds-are-proxies
  directive.
- UI: `WALKER_SPEED_PX_PER_SEC` raised from 80 to 320
  (`src/ui/scenes/walker.ts:60`) -- a gameplay timing change, not
  presentation. The plan's `[120, 160]` hypothesis failed by 60-110% against
  the food-starved-minimum tick budget once measured live: the corral
  purchase panel (walk-in -> confirm -> Escape -> walk-back-to-street) and
  the no-longer-turn-ending hunt_wampus/assay_plot develop plans both added
  real wall-clock to the develop-turn errand after the original 80 px/s
  mapping was chosen, and this is the mechanism behind the sweep's
  degradation from 6/6 to 2/6 (a starved or partial-fed develop turn's
  `ticksRemaining` now hits 0 mid-walk, tearing the scene out from under the
  walker and surfacing as a `walk_stall` at an arbitrary door). Calibrated
  by measuring the far-corner errand live (`?speed=1`, seed 33) at 80/120/
  160/240/280/320/340/360/400 px/s: 320 is the lowest value clearing the
  plan's 10% starved-budget margin rule (thin, ~10-11% across 5 runs) while
  keeping walk-in door-reach reliable; 340+ starts failing door-reach itself
  (`WALK_TAP_MS`'s fixed 120ms tap overshoots at that speed, a harder
  failure than a thin margin, and out of this package's touch points).
  Evidence table and the tap-length follow-on recorded in
  `docs/active_plans/audits/mule_trip_timing.md`.
- UI: `src/ui/scenes/town_scene.tsx` rewritten to render the
  mode-composed street from `town_world.ts` through `town_camera.ts` -- a fixed
  576-wide camera-window viewBox with a per-frame imperative world-group
  translate. The interim tsc-green shim is removed, so real collision, door
  hysteresis, single-fire walk-in, and two-endpoint exits are live (closing the
  no-collision window). The scene exposes world-coord data attributes
  (`data-town-avatar-x`/`-y`, `data-town-camera-offset`, `data-town-world-width`);
  door markers keep `data-door-for`/`data-door-state`. Outfit doors keep
  immediate dispatch, the Land Office is a neutral notice, and endpoint exits
  map left->west/right->east for now. Reviewed
  PASS: camera and SolidJS reactivity verified leak-free (imperative transforms
  on plain refs, no `createEffect`, correct `onMount`/`onCleanup`).
- UI: human develop turns now START in town at the corral
  street position with the timer running (was: on the overworld beside town),
  matching the original NES loop -- `src/ui/scenes/human_develop_layer.tsx`
  (`inTown` defaults true). The two endpoint exits map to `overworldReturnCell`
  on the matching side.
- UI: relocated the town `End turn` control out of
  `src/ui/scenes/town_scene.tsx`'s own footer and into the town chrome strip
  (`src/ui/solid/town_chrome.tsx`) as a small secondary control, so the Pub
  door stays the primary walk-in-plus-confirm turn-end destination and the
  button no longer competes with it as "the" way to end a turn. The
  `[data-action="develop-end-turn"]` hook and the `.town-end-turn-button` class
  are both preserved (a new `.town-chrome-end-turn-button` layers the smaller
  chrome-scale sizing on top), so the existing Playwright and E2E specs that
  locate the old town-scene button keep finding it in the chrome strip.

### Fixes and Maintenance

- UI (town modularization): split the two largest town modules into
  focused siblings, a behavior-preserving pure extraction. `town_scene.tsx`
  (1414 -> 745 lines, now the shell) split into `town_scene_render.tsx`
  (presentational SVG) and `town_interaction.ts` (`TownInteractionState` plus
  pure transition helpers); `town_world.ts` (1030 -> 588) split into
  `town_collision.ts` (movement clamp plus door-open hysteresis). No new signals
  or effects; the imperative transforms and the disposed-rAF guard are intact.
  The town suites stayed byte-for-byte green before and after (98 playwright / 36
  town unit). `town_scene.tsx` stays at 745, an irreducible shell -- going lower
  needs relocating the rAF/camera writes, out of scope.
- Testing (M3 gate): M3 milestone gate green -- `check_codebase.sh`
  5/5 checks pass after a prettier `--write` fix round on
  `tests/e2e/walkthrough_town.mjs`; Playwright 73/74 with the one failure
  (`town_doors.spec.mjs` "open door fires interaction", sweep-cursor timing)
  confirmed flaky via a 9/9 `--repeat-each=3` rerun.
- UI: the shared narrow-panel CSS rule in `src/style.css`
  split into four per-panel blocks (land grant, land auction, production,
  scoring), a pixel-identical seam split ahead of the per-panel
  edits.
- Testing (M1/M8 gate follow-up): prettier formatting applied to
  `tests/e2e/walkthrough_helpers.mjs` and
  `tests/test_auction_solvent_fallthrough.mjs` (flagged by
  `check_codebase.sh` `format:check` during the M1 milestone gate;
  whitespace-only).
- Engine: the goods-auction matcher (`src/engine/auction.ts`)
  now ranks all bids (price desc, lowest playerId) and asks (price asc,
  lowest playerId) and scans bid-major/ask-minor for the first crossed,
  solvent pair, skipping store-to-store. An insolvent buyer or out-of-goods
  seller withdraws from that tick's scan instead of blocking solvent lower
  bidders and the store's standing offer (replaces the single-best
  bestBid/bestAsk that treated a crossed-but-insolvent top pair as "nothing
  crossed"). Behavior is unchanged whenever the top pair is solvent.
  Documented in `docs/RULE_SOURCES.md` (new "Traversal and matching"
  subsection).
- Testing (truncation accounting fix): `activeDriveDevelop` now
  decides the plan before the tick-reserve guard runs; a turn cut at the
  reserve counts as truncated only when the cut plan commits budget
  (buy/outfit/place, via a new `planCommitsBudget` predicate) -- a
  `gamble_pub`/`end_turn`/`hunt`/`assay` cut is the natural end of the turn.
  Root cause of the earlier 5/6-11/12 truncation rates was miscounting turns
  that were ending anyway (the develop AI returns `gamble`, not `end_turn`,
  when out of moves); zero gameplay change. Files:
  `tests/e2e/walkthrough_overworld.mjs`, `e2e_walkthrough.mjs`,
  `tests/test_walkthrough_overworld.mjs`.
- Testing (stale run-command headers): `tests/e2e/e2e_balance_sim.mjs`
  and `e2e_walkthrough.mjs` header comments corrected to `node --import tsx`
  (plain `node` fails on extensionless `.ts` sibling imports).
- Testing (attribution correction): the 2 predicted-red motion
  polls in `auction_scene.spec.mjs`/`game_flow.spec.mjs` were caused by the
  auction's landscape rotation (price axis moved from `cy` to `cx`), not by the
  later CSS stage-fill work as earlier notes suggested.
- Docs: `docs/THE_TOWN_ANALYSIS.md` amended from a fixed
  seven-facade street to the mode-composed model (storefront catalog plus
  per-mode composition, derived width, no inactive facades), citing the
  2026-07-10 user decision, so the analysis doc and the rebuild plan give coders
  one consistent geometry authority.
- UI: fixed a resource leak in
  `src/ui/scenes/town_scene.tsx` -- the rAF loop could outlive scene teardown
  when an endpoint exit synchronously unmounted the scene mid-frame, leaving an
  uncancellable zombie loop; a `disposed` flag set in `onCleanup` and checked
  before each reschedule closes it.
- UI: rewrote the stale develop and in-town tutorial hints to
  describe the walk-in-then-confirm model -- `DevelopPanel` in
  `src/ui/solid/game_screen.tsx` and the in-town `TutorialHint` in
  `src/ui/scenes/human_develop_layer.tsx` now say a shop door opens as you
  approach, walking through it opens the shop panel, and you confirm inside the
  panel (Enter, or click the focused action) to buy or outfit -- walking through
  alone changes nothing. Both name the Pub as the turn-end destination and the
  small chrome-strip `End turn` control. Removed the resolved walk-in-hint TODO
  comment from `game_screen.tsx`.

### Removals and Deprecations

- UI: deleted `src/ui/scenes/town_layout.ts` and
  `tests/test_town_layout.mjs`, superseded by `src/ui/scenes/town_world.ts` and
  `tests/test_town_world.mjs`.
- Testing: retired the obsolete grid-topology specs
  `tests/playwright/town_doors.spec.mjs` and
  `tests/playwright/town_gallery.spec.mjs`, superseded by
  `tests/playwright/town_street.spec.mjs`.
- Testing: retired (deleted)
  `tests/playwright/town_scene.spec.mjs` after re-homing its 3 skipped cases --
  the corral-buy-plus-outfit-plus-place errand moved to
  `tests/playwright/town_street.spec.mjs` and was un-skipped; the pub
  confirm-plus-Escape case was dropped as superseded by `pub_gamble.spec.mjs`;
  and the assay arm-plus-reveal case was dropped (assay is unreachable in every
  shipped mode, covered instead by door-absence assertions).

### Decisions and Failures

- UI: recalibrated the `visual_render` "town scene fixture"
  coverage floor from 0.4 (calibrated to the retired gold-grid town's 0.7363) to
  0.24, because the mode-composed scrolling street with its dark night-industrial
  palette honestly measures ~0.306 (fixture) / ~0.341 (in-game): its sky, plate,
  and container colors sit within deltaE-8 of `bgDeep` and read as background.
  Rather than weaken the palette gate, registered the town street colors `#26241e`
  and `#1c1a16` as `palette.ts` tokens (`townStreet`, `townStreetWorn`) so palette
  conformance passes at 0.9962 (floor 0.95) -- fix-the-design over hiding the
  symptom. `visual_render` now 7/7.
- UI (polish): non-blocking items logged rather than blocking the
  town rebuild -- door-panel-fill vs plate contrast (1.99:1) and emblem badge
  stroke (1.61:1) fall below the 3:1 non-text bar, but door state stays legible via
  a passing stroke (3.61:1) plus the open/close animation; the chrome
  nearest-storefront label remains an empty stub deferred to a later polish pass;
  and the town camera is a stateless 1:1 tracker, with a stateful dead-zone "feel"
  option noted for a later rollout.
- Docs: the user rejected an agent-proposed "Visual acceptance is a
  side-by-side against the planet_mule painter" review rule as unapproved
  ("I did not approve that rule, remove it"); the entry is removed from
  `docs/HUMAN_GUIDANCE.md`. The approved standing guidance is unchanged:
  visual style follows Planet M.U.L.E.
- UI (M5): discovery that changed the design -- the pre-stage layout
  never actually fit HUD+board+panel in the viewport on big-panel phases; it
  overflowed by ~56px and relied on `#screen-game` scrolling. Inside a fixed
  16:10 no-scroll stage, the plan's "overworld and town scenes render
  identically" criterion was therefore unachievable alongside "no clipped
  content"; a first fixed-reserve attempt (360px) shrank the board ~18% at
  common viewports and a corrected 280px reserve clipped the HUD by 56px at
  every tested viewport. Resolution: flex-slot design -- the board fills the
  space HUD+panel leave free, equal to the old render only where the old
  render already fit without scrolling. M5's exit criterion is amended to
  "largest board that fits with no scroll/clip". Follow-up filed: slim the
  develop panel (~90px of duplicate hint + padding) after the town-door work
  lands to grow the develop-phase board.
- Testing: final release sweep GREEN 2026-07-10T05:03Z -- exit 0, 6/6 runs
  pass across `{1, 3, 7} x {beginner, standard}`, `matrixCoverageSatisfied`
  in both modes, seed-7 legs pass with colony-failure placement waivers;
  seed 3 beginner shows legitimate run-to-run variance between a full
  6-round game and an early colony failure at round 2 (wall-clock gesture
  timing affects the economy), and both shapes pass the gates. The
  walkthrough harness plan (M1-M8, 17 work packages, 33 patches) is
  complete; during execution the harness surfaced and drove fixes for real
  product bugs: the SolidJS stale-`Show` silent crash, the auction
  commit-gate stall, the documented `bestBid`/insolvent-bidder engine bug
  (see `docs/TODO.md` follow-up), sit-out incoherence, and the corral
  hint-string trap.
- Testing (fix round): a contract change -- the corral walk-in no
  longer buys directly -- broke the E2E walker's `executeBuyMule`. Fixing it
  unmasked a latent bug: `walkBackToStreet`'s arrival check used
  `data-at-door`, whose coarse cell rect includes interior positions, so the
  avatar never actually returned to the street row and the next door seek
  stalled against a wall jamb (deterministic, reproduced on 4 of 6 seed/mode
  combos). Fix in flight at the walker layer (a positional street-y
  predicate replacing the `data-at-door` check); tracked under M8.
- Testing (USER DECISION, closure): "the deterministic walker is
  suspect, do not keep as a gate" -- the walkthrough sweep
  (`tests/e2e/e2e_walkthrough_sweep.mjs`) is demoted from a release gate to a
  diagnostic. After the speed change (80 to 320 px/s), the sweep's
  earlier scattered non-deterministic stalls became a deterministic stall on
  seeds 1 and 3 at the counter-smithore door ("town avatar left the street"),
  suspected to be a walker-harness artifact -- the seek/gesture constants
  (`WALK_TAP_MS`, overshoot correction) were tuned against the old 80 px/s
  speed and have not been retuned for 320, which the audit doc already
  flagged as a follow-on. Seed 7 passes both modes. M2 and M8 close on unit
  suite (`check_codebase.sh` 5/5, 507/507 units), Playwright suite (78 pass +
  1 known parallel-load flake), `e2e_run_all` 4/5, and the calibration
  evidence table instead of the sweep; the sweep sits at 2/6 with root-cause
  diagnosis continuing as a non-blocking follow-up (see `docs/TODO.md`
  "Developer and testing").
- Docs: the bug-fixes and UI-fixes plan is CLOSED. All eight
  milestones M1-M8 are done (M2 and M8 closed under the recorded sweep-gate
  demotion above, see
  `docs/active_plans/decisions/sweep_gate_demotion.md`). `docs/HUMAN_GUIDANCE.md`
  kept the verified source-of-truth-hierarchy and town-interaction entries; a
  close-out agent's proposed "Visual acceptance is a side-by-side against the
  planet_mule painter" entry (from the 2026-07-10 "polish a turd" escalation)
  was not user-approved and was removed (see the 2026-07-10 Decisions and
  Failures entry below). Final consistency
  sweep across `docs/ROADMAP.md`, `docs/TODO.md`, and `docs/WALKTHROUGH_GUIDE.md`
  closed the fixed known-bug entries (auction fallthrough, town gaps, walker
  executors) and refreshed the walker executor descriptions. Three deferred,
  user-requested addenda are filed as ROADMAP near-term entries, not part of
  this plan's closure: goods-auction rebuild to the `AuctionPainter`
  composition, town rework to the NES/planet_mule walk-into-buildings entry
  model, and a species + color selection screen. The tracker moved from
  `docs/active_plans/active/` to `docs/archive/bug_fixes_ui_fixes_plan.md`.
- UI (interim state): retiring the 9x5 model left
  `src/ui/scenes/town_scene.tsx` on a fenced shim with inert
  collision to keep `tsc` green until the camera cutover lands; the interim
  state is accepted and tracked to the camera cutover.
- UI (HIGH review finding): a quality review caught an
  open-door entry-zone overshoot -- the entry band extended about 6px past the
  shallow threshold notch into the street lane, firing walk-in entry
  prematurely. Fixed by capping the entry zone at the notch's own depth
  (`Math.min(DOOR_ENTRY_BAND_PX, facade.thresholdRect.height)`) and reading the
  notch top from the per-facade rect, then pinned by a regression case.
- Testing (removal, bounded dual-window): deleting `town_layout.ts`
  orphaned the E2E walker helper imports, so 8 `tests/test_walkthrough_*.mjs`
  fail to load until the walker is migrated -- an accepted bounded
  dual-window. Full `check_codebase.sh` 5/5 is an M6 gate; M1-M5 gate on the
  affected town suites (green).
- UI (follow-up, tunable coherence): `DOOR_ENTRY_BAND_PX` (30) currently
  exceeds `TOWN_THRESHOLD_DEPTH` (24), so the `min()` cap above is actively
  engaged; reconcile the two so they express one intent.
- UI: the town camera ships as a stateless 1:1 centered
  tracker; a stateful dead-zone camera (nicer feel) is a noted follow-up for the
  M3 visual review and rollout, not implemented now.
- Testing: the facade-label legibility ladder is scoped to the
  game's supported viewport widths (1200x750 minimum and up); 320/480/768 are
  not included because they fall below the supported minimum (user, 2026-07-10).
  This is the supported-target scope, not a defect.
- UI: the `at-threshold` state is modeled but effectively
  unobservable -- the walk-in latches `panel-open` on the same frame -- so it is
  kept for completeness and the specs do not assert it.
- Testing: the six-spec town-first navigation fix used
  per-spec edits (no shared helper), matching earlier precedent, because the
  land-claim and post-turn steps differ across specs; a shared `develop_nav.mjs`
  helper is a possible future refactor.
- Testing: `corral_purchase`'s occasional full-parallel flake
  is a pre-existing land-grant sweep-cursor timing race under CPU contention,
  not town-caused.
- UI: modeled the Land Office as a one-member `informational`
  outcome union because no per-town land-sale engine state exists -- new land
  arrives only through the colony-wide Land Grant and Land Auction phases, so
  the panel truthfully describes that instead of inventing a storefront sale,
  and the one-member shape keeps the same outcome-driven form as the corral and
  outfit panels so a later engine change only adds a member. The Assay Office
  panel is built ahead of an unshipped mode: its facade turns on in no shipped
  engine mode today, so the panel exists but is not yet reachable in live play.

### Developer Tests and Notes

- Testing: rebuilt the E2E walker town executors
  (`tests/e2e/walkthrough_town.mjs`, `walkthrough_helpers.mjs`) to DISCOVER the
  active mode-composed street via `composeTownStreetForMode` and drive the
  shipped world-coordinate town DOM: `data-town-avatar-x`/`-y` door seeking,
  gap-proportional convergence, panel-confirm gestures, corral-spawn turn start,
  and absent-destination skips. Retired the old `town_layout.ts` / `TOWN_CELL_PX`
  / `data-at-door` grid model from the harness. `tests/test_walkthrough_town.mjs`
  is 12/12 and both single-seed town legs are green.
- Testing: filed an automated visual-acceptance report at
  `docs/active_plans/reports/town_street_visual_acceptance.md` covering both game
  modes at the supported viewports (1200x750 and 1280x800) with the avatar at
  spawn, mid, and endpoint positions. Three-second-read PASS: composition confirmed
  (beginner street genuinely shorter, no dead gap where the Land Office sits, zero
  grid lines) and contrast passes (labels 13.5:1, prices 8.9:1).
- Testing (M1 milestone gate): M1 closed GREEN -- `npx tsc --noEmit` clean;
  `check_codebase.sh` typecheck/lint pass; `e2e_run_all` 5/5 (mini_flow,
  full_game, balance_sim with all M9/M10/M11 bands satisfied,
  balance_report, walkthrough); walkthrough sweep 6/6 seeds/modes, empty
  failure taxonomy, `matrixCoverageSatisfied` in both modes.
- Testing: added `tests/test_auction_solvent_fallthrough.mjs`
  pinning `selectTrade`'s crossed+solvent fallthrough invariant on both buyer
  and seller sides (player-pair and store-fallback variants), plus an
  equivalence case and a bid-id tie-break case; strengthened
  `tests/test_auction_termination.mjs`'s sold-out-seller case to assert an
  exact derived trade count (2) instead of `>= 1`, removing the stale
  bestBid-matching-quirk comment.
- Testing: re-verified the goods-auction dead-window rate at
  100 seeds/mode post ranked-offer matcher -- 0.7% beginner, 0.8% standard,
  both well under the 0.2 gate, dead-land-auction rate still 0.0% in both
  modes; timing constants unchanged. Updated the stale figures in
  `docs/TODO.md` and `docs/RULE_SOURCES.md`.
- Testing: extracted the shared overshoot-correcting seek
  core `seekAvatarToTarget` in `tests/e2e/walkthrough_helpers.mjs`
  (`walkTownAvatarToDoor` and `walkOverworldAvatarToCell` are now thin
  spec-object wrappers, external signatures unchanged); `MAX_WALK_TAPS` is a
  single exported constant imported by `tests/e2e/e2e_walk_calibration.mjs`
  instead of a redefined copy. 133/133 walkthrough unit tests green.
- Testing: new `tests/playwright/town_doors.spec.mjs`
  covers wall-stop collision (held against a building via SVG transform
  polling), a far door staying closed, and open-door entry firing with no
  keypress; converted 6 existing door-entry cases in `town_scene.spec.mjs`
  and `pub_gamble.spec.mjs` from a Space-press-at-door step to a held-
  ArrowUp walk-in, matching the walk-in interaction model.
- Testing: `auction_scene.spec.mjs` and
  `game_flow.spec.mjs` motion polls converted from predicted-red pixel
  guesses to `data-x` reads with strict directional assertions, plus a new
  sideline `data-y` assertion; visual acceptance filed at
  `docs/active_plans/reports/auction_landscape_visual_acceptance.md` --
  zero clipping pixel-verified at 1200x1000, top-anchored coverage
  83.7%/93.1% including the HUD, no threshold-chasing artifacts; a ~16%
  trailing gap below the intent buttons at 1600x900 flagged as
  non-blocking polish.
- Testing: the walker's town commerce executors
  (`buy_mule`, `outfit_mule`, `gamble_pub`) converted from action-key
  presses to the walk-in gesture -- x-seek to the door's street
  column, wait for `data-door-state="open"`, then a new
  `walkTownAvatarNorthUntil` helper (built on the shared
  `seekAvatarToTarget` core) presses north until the door's interaction
  fires; a new `walkBackToStreet` returns the avatar to the street row
  after a successful buy/outfit, fixing a live-found stall where a
  neighboring building's jamb blocked the horizontal x-seek while the
  avatar was still north of the street. The pub keeps Enter/Space only for
  the turn-ending gamble CONFIRM dialog. Files:
  `tests/e2e/walkthrough_town.mjs`, `walkthrough_helpers.mjs`,
  `tests/test_walkthrough_town.mjs` (fake-page gesture model updated), plus
  `tests/e2e/e2e_walk_calibration.mjs` (now imports the exported
  `MAX_WALK_TAPS` instead of a local copy). Evidence: 133/133 unit tests
  pass, `e2e_run_all` 5/5, sweep 6/6 with `matrixCoverageSatisfied`.
- Testing: new `tests/playwright/corral_purchase.spec.mjs`
  (5 tests: panel figures render with the exact per-outcome message; before/
  after stock and funds deltas on a confirmed purchase; input coverage for
  mouse-click confirm, Enter-on-prefocused confirm, and arrow-moves-focus-
  then-Enter-declines with a `toBeFocused` proof); the existing corral test
  in `town_scene.spec.mjs` converted from a notice check to the confirm
  gesture. `out_of_stock` and `insufficient_funds` are documented as
  impractical to reach through play (`MULE_STOCK_CAP` 14, `MULE_BASE_PRICE`
  100 vs `STARTING_MONEY` 1000 needs roughly 10-14 buy cycles, and there is
  no test-only state hook) -- accepted as an honest documented gap since the
  untested branches share the same tested render path as the covered ones.
- Testing: phase-panel visual acceptance ACCEPTED across
  the four phase panels at two viewports each; report filed at
  `docs/active_plans/reports/phase_panels_visual_acceptance.md`. Land grant,
  land auction, and production are judged as board phases (the map is the
  fill surface, so slim panel strips are by design); scoring is judged as
  the full-panel phase (94%/84% coverage). No dead-margin pathology and no
  threshold-chasing artifacts found; three non-blocking polish candidates
  recorded (see `docs/TODO.md`).
- Testing (disposition): executor unit coverage is complete
  -- 20/20 `tests/e2e/walkthrough_overworld.mjs`-side tests including
  catch/reveal verification, budget-exhaust, and the hunt_wampus blink-race
  re-decide; 13/13 town-side tests covering `executeArmAssay`. The
  sweep-counter/single-seed natural-occurrence proof (identifying one
  seed/mode per plan kind that reliably produces `hunt_wampus`/`assay_plot`)
  is deferred alongside the sweep gate demotion recorded above; a
  forced-plan-hook follow-up (strategy-layer only, so it drives the same
  production dispatch/executor path as a naturally generated plan) is
  recorded in `docs/TODO.md`.
- Testing: new `tests/test_town_world.mjs` (16 cases):
  per-mode presence/absence composition, NES order, derived world width greater
  than the viewport, corral spawn, two-exit topology, street-lane reachability
  flood-fill, facade-jamb/closed-door/open-door collision bounds, door
  hysteresis, single-fire entry, composition purity, a catalog-level totality
  property test over capability-flag combinations, the negative
  regression "the avatar cannot walk through or behind any storefront" against
  the retired 9x5 walk-through bug, and an open-door entry-zone boundary
  regression. `tests/test_zones.mjs` trimmed to overworld-only cases (7) after
  `zones.ts` retired its town constants.
- Testing: new `tests/playwright/town_street.spec.mjs` (7
  cases): camera-offset change plus both-end clamp, per-mode facade composition
  and NES order for beginner and standard, exactly two endpoint exits, chrome
  timer visible and decreasing, and facade-label legibility at supported
  viewport widths. The three interaction cases in
  `tests/playwright/town_scene.spec.mjs` are marked `test.skip`.
  Known bounded windows at M2: 8 `tests/test_walkthrough_*.mjs`
  still fail to load pending the walker migration; `pub_gamble.spec.mjs`
  interaction specs stay red until re-homed; the `visual_render.spec.mjs` town
  coverage floor is pending recalibration once real facade art ships.
  `corral_purchase.spec.mjs` PASSES (it never depended on the retired
  door-column topology), correcting the plan's earlier known-red assumption.
- Testing: added 8 entry-state-machine specs to
  `tests/playwright/town_street.spec.mjs` (single-fire walk-in, corral/outfit
  attempt-then-confirm no-dispatch-on-entry, Escape returns street-side, inert
  street Enter/Space, corral spawn, two endpoint exits, and hold-Up
  behind-facade negatives in both modes), taking `town_street` to 17/17. Fixed
  town-first develop-turn navigation across the Playwright suite
  (`town_street`/`corral_purchase`/`pub_gamble`/`game_flow`, plus follow-on
  `ai_actor_live`/`dpad`/`event_banner`/`land_auction`/`overworld_scene`/
  `reload_resume`): each now reaches `#town-scene` before ending the turn or
  walking to an overworld exit, replacing the retired `.overworld-svg`
  overworld-avatar wait and `.develop-end-turn-button` with
  `.town-end-turn-button`; `pub_gamble`'s dead `data-at-door` walk became a
  DOM-derived door-center homing walk. Full Playwright suite green: 89 passed /
  3 skipped (old topology cases awaiting re-homing) / 0 failed.
- Testing: rewrote the
  `tests/playwright/town_street.spec.mjs` transaction-panel specs against the
  real outfit and Land Office panels, replacing the retired
  `[data-town-action-panel]` placeholder locators. Added per-mode (beginner and
  standard) side-effect-free-until-confirm coverage for the corral, the
  mining/energy/farm outfitters, and the standard-only Land Office, plus
  office-absence door assertions and a non-brittle hint-contract assertion. Full
  Playwright suite after the re-home: 98 passed, 0 failed, 0 skipped
  (`town_street.spec.mjs` 26 passed).
