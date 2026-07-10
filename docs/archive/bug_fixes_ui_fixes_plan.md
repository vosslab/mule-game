# Plan: bug fixes and human-requested UI fixes from ROADMAP, TODO, and HUMAN_GUIDANCE

## Work package status

| WP | Status | Notes |
| --- | --- | --- |
| WP-1A | completed | traversal summary + RULE_SOURCES citation landed inside WP-1B's patch |
| WP-1B | completed | ranked matcher landed; reviewer PASS 2026-07-10; RULE_SOURCES traversal subsection added |
| WP-1C | completed | 6 fallthrough cases + exact-count re-strengthening; reviewer PASS 2026-07-10; suite 486/486 |
| WP-1D | completed | dead-window 0.7%/0.8% at 100 seeds/mode, gate holds; TODO+RULE_SOURCES figures refreshed |
| WP-2A | completed | `WALKER_SPEED_PX_PER_SEC` 80->320; reviewer PASS; audit doc `mule_trip_timing.md` status Applied; M2 closed on calibration evidence + unit/e2e gates, sweep demoted per USER DECISION (see `docs/active_plans/decisions/sweep_gate_demotion.md`) |
| WP-3A | completed | collision + town_layout.ts source of truth; reviewer PASS 2026-07-10; 8/8 unit + town spec 3/3 at review time |
| WP-3B | completed | door-opens-on-approach + walk-in trigger landed; reviewer PASS; Enter/Space door-entry removed |
| WP-3C | completed | walker town executors converted to walk-in-trigger; reviewer PASS; 133/133 unit tests, e2e_run_all 5/5, sweep 6/6 |
| WP-3D | completed | town_doors.spec.mjs + 6 converted specs landed; reviewer PASS |
| WP-4A | completed | Corral purchase screen component; reviewer PASS; `corral_purchase_panel.tsx` |
| WP-4B | completed | Wired to walk-in trigger; reviewer PASS; old notice-only path removed |
| WP-4C | completed | `corral_purchase.spec.mjs` (5 tests); reviewer PASS; out_of_stock/insufficient_funds documented as impractical-through-play, accepted |
| WP-5A | completed | flex-slot 16:10 stage; fix round -> option (b) redesign; reviewer PASS 2026-07-10; M5 exit criterion amended (scroll discovery) |
| WP-6A | completed | landscape horizontal track landed; reviewer PASS 2026-07-10; readout decision recorded in decisions/auction_readout_variant.md; 2 predicted-red specs await WP-6C |
| WP-6B | completed | full-canvas CSS landed; reviewer PASS; 76.6%/84.5% honest screen-only coverage |
| WP-6C | completed | specs converted to data-x/data-y; reviewer PASS; visual acceptance filed, zero clipping at 1200x1000 |
| WP-7A | completed | Split the shared narrow-panel CSS rule; reviewer PASS; pixel-identical seam split |
| WP-7B | completed | Land grant panel canvas-fill; reviewer PASS; `.land-grant-panel` 92cqw |
| WP-7C | completed | Land auction panel canvas-fill; reviewer PASS; `.land-auction-panel` min(92cqw, 1400px) |
| WP-7D | completed | Production panel canvas-fill; reviewer PASS; `.production-panel` 92cqw, grid list |
| WP-7E | completed | scoring panel merged rule, 94cqw / 84cqh; reviewer PASS; new parametrized containment test in scoring_screen.spec.mjs |
| WP-7F | completed | Phase-panel visual acceptance ACCEPTED across all four panels x 2 viewports; report filed |
| WP-8A | completed | Extract shared seek core and dedupe MAX_WALK_TAPS. 133/133 walkthrough unit tests green; reviewer PASS 2026-07-10; shared seekAvatarToTarget core in tests/e2e/walkthrough_helpers.mjs; MAX_WALK_TAPS single exported definition |
| WP-8B | completed | hunt_wampus and assay_plot spatial executors landed (executeHuntWampus/executeAssayPlot/executeArmAssay); skipOpportunisticDevelopPlan removed; reviewer PASS; 507/507 units |
| WP-8C | completed with deferral | Executor unit coverage complete (20/20 overworld, 13/13 town); sweep-counter/single-seed natural-occurrence proof deferred with the sweep gate demotion (USER DECISION); forced-plan-hook follow-up recorded in `docs/TODO.md` |
| WP-D1 | completed | HUMAN_GUIDANCE entries verified (source-of-truth hierarchy, town interaction) plus new visual-acceptance-vs-painter entry; ROADMAP/TODO/WALKTHROUGH_GUIDE final consistency sweep; three deferred addenda filed as ROADMAP near-term; plan archived |

## Context

The walkthrough-harness plan closed 2026-07-10 with a green release sweep, and it surfaced a set of
documented-but-unfixed items: an auction engine matching bug (insolvent top bidder blocks solvent
trades), a town interaction model that diverges from the user's stated NES M.U.L.E. target
(no collision, keypress-to-enter shops, one-line corral feedback), a walk-speed tuning
recommendation that was recorded but never applied, and two user-requested layout reworks
(landscape full-canvas auction screen; full-16:10 audit of the other phase screens). These live in
`docs/ROADMAP.md` ("Known bugs and gaps", verified file:line refs dated 2026-07-10),
`docs/TODO.md`, and `docs/HUMAN_GUIDANCE.md`. This plan turns them into dispatchable milestones.
The user additionally opted to include both low-urgency test-debt items (walker seek-core refactor
and the hunt_wampus/assay_plot spatial executors) and to keep the release cut out of scope.

Exploration (2026-07-10) confirmed every ROADMAP line reference against the current tree, plus:
the store's standing offers already sit inside `bestBid`/`bestAsk` offer lists; the town has zero
obstacle collision (`town_scene.tsx:229` passes obstacle factor `1`); the auction screen and four
phase panels share a narrow-centered 480px CSS rule (`src/style.css:271-282`, `:928-936`);
`OTHER_REPOS/planet_mule` auction matching lives in `AuctionController.java` / `Auction.java` /
`AuctionPhase.java` (not `Shop.java`, which is store pricing only).

## Objectives

- Auction engine executes an eligible crossed pair each tick whenever one exists: an insolvent
  best-priced bidder no longer blocks lower solvent bidders or the store's standing offer
  (clearing stays one unit per tick, as today).
- Town matches the user's NES-target interaction model: solid buildings, doors that open on
  approach, walk-in triggers the shop interaction with no action-key press.
- Corral purchases always land on a dedicated purchase screen showing price, stock, and funds,
  for success and every failure case.
- The goods-auction screen fills the full 16:10 canvas as a landscape price track; the four
  narrow phase panels (land grant, land auction, production, scoring) fill the canvas too.
- The walker speed constant is calibrated so a food-starved develop turn reaches a far-corner
  plot within the starved-minimum tick budget.
- Walker test debt is paid: one shared seek core, one `MAX_WALK_TAPS` constant, and spatial
  executors for `hunt_wampus` / `assay_plot` develop plans.

## Design philosophy

Many small, independently verifiable milestones over few broad ones (explicit user instruction
this session): each milestone is one component seam with its own gate, so progress stays visible
and a stall in one lane never hides another. Engine correctness (M1) is fixed at the design level
-- ranked offer lists replacing single-best selection -- rather than patching the symptom with a
retry special-case, per "fix the design, not the symptom" from `docs/REPO_STYLE.md`. UI work
follows the standing rules-vs-UI split in `docs/HUMAN_GUIDANCE.md`: mechanics untouched,
presentation and gesture layers rebuilt. The rejected alternative was one combined
"town overhaul" milestone (collision + doors + purchase screen + walker updates); it was split
into M3/M4 plus the M8 walker lane because the purchase screen and the walker executors are
separately testable and separately staffable. Scientific method over guessing (user instruction
this session): the plan does not pretend to know every answer -- where a question is open, the
owning work package runs a small experiment and selects from evidence (WP-2A calibrates
candidate speeds against measured trips; WP-1A extracts traversal behavior from sources before
WP-1B commits; WP-3A validates its collision geometry against reachability and wall-slide
measurements; WP-8C discovers which seeds exercise each plan kind by trial runs). Owners are
encouraged to prototype competing approaches when the comparison is cheap and keep the winner;
record a losing result in `docs/CHANGELOG.md` Decisions and Failures only when it materially
changed the selected design, exposed a risk, or explains a non-obvious decision -- routine
cheap experiments stay out of the log. Provisional designs in
this plan are labeled as such; the goal is the best result, not a lucky first guess.

## Scope

- Fix `bestBid`/`bestAsk`/`resolveTrade` to walk ranked offer lists until a solvent pair executes.
- Re-strengthen `tests/test_auction_termination.mjs` third case to an exact trade count.
- Re-verify the dead-auction-window rate via the balance sim after the matching change.
- Record the planet_mule matching citation in `docs/RULE_SOURCES.md`.
- Raise `WALKER_SPEED_PX_PER_SEC` from 80, calibrating from 120 upward with the walk-calibration
  and starved-turn checks.
- Add town wall/building collision, door-opens-on-approach, and walk-in shop triggering; retire
  the Enter/Space press and its stopgap hint strings.
- Add a dedicated corral purchase screen (price, stock, funds; success and all failure cases).
- Establish a real 16:10 stage container: exploration found no aspect-ratio container exists in
  the CSS, so "fill the 16:10 canvas" currently has no canvas -- build the letterboxed stage all
  screens render inside, making the HUMAN_GUIDANCE layout rule mechanically checkable.
- Rework `src/ui/solid/auction_screen.tsx` to a landscape, full-16:10 horizontal price track,
  preserving the sit-out sideline spectator slot.
- Apply the full-16:10 layout principle to land grant, land auction, production, and scoring
  panels.
- Update the E2E walker's town executors from press-to-trigger to walk-in-trigger.
- Extract the shared overshoot-correcting seek core; dedupe `MAX_WALK_TAPS`.
- Implement `hunt_wampus` / `assay_plot` spatial executors with unit coverage.
- Update `docs/CHANGELOG.md`, `docs/TODO.md`, `docs/ROADMAP.md`, `docs/RULE_SOURCES.md` as each
  milestone closes.

## Non-goals

- Cut the release (VERSION bump, tag): stays a separate human decision per user answer this
  session.
- Build species handicap or tournament-ruleset data toggles (ROADMAP "Later").
- Add sound and music (separate pass with its own asset pipeline).
- Support multiple human players, lab items, hirelings, deserts, or land selling (ROADMAP
  "Explicitly out of scope").
- Change any economy formula, phase mechanic, or auction pricing rule: M1 changes matching
  fallthrough only; UI milestones are presentation/gesture only.
- Replicate the 1983/1990 console input scheme: modern mouse/arrow-key control stays, per
  `docs/HUMAN_GUIDANCE.md`.
- Fix the characterized behaviors listed in ROADMAP (seed-7 colony failure, seed-3 variance,
  held-role-no-trade windows): documented as not-bugs.

## Current state summary

- `bestBid` (`src/engine/auction.ts:432-451`) and `bestAsk` (`:461-484`) each return a single
  best `Offer`; `resolveTrade` (`:669-722`) calls `canExecute` (`:514-534`) once and falls to the
  "nothing crossed" branch when the single pair is insolvent. Store offers are already in the
  candidate lists (store buy always; store sell when `storeStock >= 1`).
- `tests/test_auction_termination.mjs:163` is weakened to `trades.length >= 1` because of this
  bug (comment at lines 160-162).
- `WALKER_SPEED_PX_PER_SEC = 80` at `src/ui/scenes/walker.ts:60`; consumed by town, overworld,
  and AI actor layers, always multiplied by `readSpeedMultiplier()`.
- Town: no obstacle collision (`src/ui/scenes/town_scene.tsx:222-238`, factor `1` at line 229);
  Enter/Space handling at `:301-330`; `buyAtCorral` `setNotice` feedback at `:383-399`; hint
  strings naming Enter/Space at `:515` and `:358`; door markers `[data-door-for]` at `:698`.
- Auction screen: vertical 280x400 track in a 480px centered column
  (`src/ui/solid/auction_screen.tsx:64-66`, `src/style.css:928-936`, `:967-971`). Sit-out
  sideline slot implemented at `sidelineSpot` (`auction_screen.tsx:156-162`), named in a doc
  comment (`:139-151`) as the single seam a landscape rotation must preserve.
- Land grant / land auction / production / scoring panels share the narrow-centered rule at
  `src/style.css:271-282` (`max-width: 480px`). Overworld and town scenes are already
  full-canvas SVG.
- Walker harness: `skipOpportunisticDevelopPlan` (`tests/e2e/e2e_walkthrough.mjs:383-390`)
  skips `hunt_wampus`/`assay_plot` (dispatch at `:431-441`); `walkTownAvatarToDoor`
  (`tests/e2e/walkthrough_helpers.mjs:826-892`) and `walkOverworldAvatarToCell` (`:935-1005`)
  duplicate ~60 lines of seek logic; `MAX_WALK_TAPS = 60` duplicated at
  `walkthrough_helpers.mjs:510` and `e2e_walk_calibration.mjs:88`.
- Test lanes: unit engine tests via `node --import tsx --test 'tests/test_*.mjs'` (and
  `./check_codebase.sh`); browser specs via `./run_playwright_tests.sh` (30 specs under
  `tests/playwright/`); non-browser E2E via `bash tests/e2e/e2e_run_all.sh`; release gate is
  the sweep `tests/e2e/e2e_walkthrough_sweep.mjs` (6/6 green as of 2026-07-10).

## Architecture boundaries and ownership

- Engine (`src/engine/`): rules and matching. Only M1 touches it, and only `auction.ts`
  matching-selection code. No pricing, band, or timing constants change.
- UI scenes (`src/ui/scenes/`): gesture layer (walking, doors, collision). M2 and M3 touch it.
- UI solid components (`src/ui/solid/`) and `src/style.css`: presentation. M4, M6, M7.
- Walkthrough harness (`tests/e2e/`): strategy/mechanics separation holds; only gesture-layer
  executors change (M3 follow-through, M8).
- Playwright specs (`tests/playwright/`): per-feature browser verification; updated alongside
  the feature milestone that changes the behavior they pin.
- Reference repos (`OTHER_REPOS/`, read-only): `mule_rules.md` and `mule_document.html` are the
  RULE authority; `planet_mule` is the VISUAL-style reference and implementation aid, subordinate
  on any mechanics question. Citations land in `docs/RULE_SOURCES.md`.
- Shared resource ownership: the shared panel CSS rule (`src/style.css:271-282`) is split by
  exactly one work package (WP-7A) before per-panel work proceeds; the seek core
  (`tests/e2e/walkthrough_helpers.mjs`) is refactored by exactly one work package (WP-8A)
  before new executors build on it.

Implementation skills for doers: `/typescript-engineer` for M1 engine types (ranked readonly
lists), `/solid-js-expert` for M3/M4/M6/M7 SolidJS components and reactivity, `/ui-ux-engineer`
for M4/M6/M7 layout and interaction quality. Every UI milestone applies the full-16:10 rule and
the rules-vs-UI split from `docs/HUMAN_GUIDANCE.md`.

Standing design direction (user, 2026-07-10, to be recorded in `docs/HUMAN_GUIDANCE.md` by
WP-D1): visual style follows Planet M.U.L.E. (use `OTHER_REPOS/planet_mule` painters --
`AuctionPainter.java`, `ShopPainter.java` -- as the visual reference for M4/M6/M7 screens);
the ruleset follows 1983/1990 M.U.L.E.; the interface uses mouse + arrow keys + Enter where
possible (Enter stays the confirm key in dialogs; door entry is walk-in per M3).

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream | Component | Expected patches |
| --- | --- | --- |
| M1 / WS-1-engine | `src/engine/auction.ts` matching | 1-2 (ranked offers; fallthrough) |
| M1 / WS-1-verify | `tests/test_*.mjs`, balance sim, `docs/RULE_SOURCES.md` | 2 (tests; sim + citation) |
| M2 / WS-2-speed | `src/ui/scenes/walker.ts`, calibration runs | 1 |
| M3 / WS-3-collision | `src/ui/scenes/town_scene.tsx` collision + doors | 2 (walls; door triggers) |
| M3 / WS-3-walker | `tests/e2e/walkthrough_town.mjs` + helpers | 1 |
| M3 / WS-3-specs | `tests/playwright/town_scene.spec.mjs` (+ new spec) | 1 |
| M4 / WS-4-screen | new corral purchase component under `src/ui/solid/` | 1-2 |
| M4 / WS-4-specs | `tests/playwright/` corral spec | 1 |
| M5 / WS-5-stage | 16:10 stage container (`src/ui/solid/game_screen.tsx`, `src/style.css`) | 1 |
| M6 / WS-6-arena | `src/ui/solid/auction_screen.tsx`, `src/style.css` | 2 (rotation; full-canvas CSS) |
| M6 / WS-6-accept | playwright spec + visual acceptance | 1 |
| M7 / WS-7-css | `src/style.css` shared-rule split | 1 |
| M7 / WS-7-panels | four `src/ui/solid/*_panel.tsx` | 2-4 (one per panel, mergeable) |
| M7 / WS-7-accept | visual acceptance | 1 |
| M8 / WS-8-core | `tests/e2e/walkthrough_helpers.mjs`, `e2e_walk_calibration.mjs` | 1 |
| M8 / WS-8-exec | `tests/e2e/e2e_walkthrough.mjs` + scene executor modules | 1-2 |
| M8 / WS-8-tests | `tests/test_walkthrough_plan_exec.mjs`, sweep run | 1 |
| Docs / WP-D1 | `docs/HUMAN_GUIDANCE.md` + final doc sweep | 1 |

## Milestone plan

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| M1 | Auction solvent fallthrough | Ranked offer lists so an insolvent top bidder no longer blocks solvent trades or the store's standing offer | Each tick clears an eligible crossed pair when one exists |
| M2 | Walk-speed calibration | Raise the walker speed constant with calibration evidence | Starved develop turn reaches a far-corner plot in budget |
| M3 | Town collision and doors | Solid buildings, doors open on approach, walk-in triggers shops | Town matches the NES-target interaction model |
| M4 | Corral purchase screen | Dedicated purchase screen with price, stock, funds for every outcome | No more one-line corral notices |
| M5 | 16:10 stage foundation | Explicit letterboxed 16:10 stage container every screen renders inside | "Fill the canvas" becomes mechanically checkable |
| M6 | Landscape auction screen | Horizontal full-16:10 price track, buyers left, sellers right | Auction screen fills the canvas |
| M7 | Phase-panel canvas fill | The four narrow phase panels spread to the full 16:10 canvas | No narrow centered columns remain |
| M8 | Walker harness debt | Shared seek core, one tap constant, wampus/assay executors | Walker debt paid, sweep coverage widens |

Milestone numbers are labels; ordering comes only from `Depends on` at the work-package level.
M1, M2, M5, M6's WP-6A, and M8's WS-8-core lane are mutually independent and can start
immediately; M6's CSS package and all M7 panel packages depend on the M5 stage container.

### Milestone: M1 auction solvent fallthrough

- Depends on: none.
- Workstreams: WS-1-engine, WS-1-verify.
- Entry criteria: none.
- Exit criteria: new fallthrough unit test green; `tests/test_auction_termination.mjs` third
  case re-strengthened to an exact trade count and green; full unit suite green
  (`./check_codebase.sh`); balance sim dead-window gate re-verified (< 0.2, expect ~0.0) at
  100 seeds/mode; planet_mule citation recorded in `docs/RULE_SOURCES.md`; `docs/TODO.md`
  "Auction fidelity" bullets for this bug and the store fallback marked shipped;
  `docs/ROADMAP.md` known-bug entry updated; `docs/CHANGELOG.md` entry written. Obvious
  follow-ons: fix any unit test that pinned the old single-offer behavior; rerun the failed
  gate after each fix.
- Parallel-plan ready: yes (WS-1-engine and the citation half of WS-1-verify run concurrently;
  max 2 doers, then tests/sim after the engine patch).

### Milestone: M2 walk-speed calibration

- Depends on: none.
- Workstreams: WS-2-speed (single lane -- inherently serial: one constant, one
  calibrate-measure-adjust loop; parallel doers would race the same measurement).
- Entry criteria: none.
- Exit criteria: `WALKER_SPEED_PX_PER_SEC` raised to the lowest evidenced passing value
  (expected in [120, 160]; measurements may lead outside that range, with the reason recorded);
  `tests/e2e/e2e_walk_calibration.mjs` rerun and its table regenerated; starved-minimum
  far-corner check passes; sweep still 6/6 green;
  `docs/active_plans/audits/mule_trip_timing.md` updated from "recommendation" to "applied";
  `docs/ROADMAP.md` near-term bullet closed; `docs/CHANGELOG.md` entry. Obvious follow-ons:
  if 120 fails the far-corner check, step to 140 then 160 and rerun before reporting.
- Parallel-plan ready: no (single calibration loop; documented serial exception).

### Milestone: M3 town collision and doors

- Depends on: none (WP-level: walker/spec lanes depend on the door-trigger package).
- Workstreams: WS-3-collision, WS-3-walker, WS-3-specs.
- Entry criteria: none.
- Exit criteria: walls block walking (no wall-through movement); doors open on approach and
  closed doors block entry; walking through the open doorway IS the complete entry action and
  fires the shop interaction with no key press (fixed requirement, not an experiment); Enter
  remains only for confirmations inside dialogs or panels after entry; Enter/Space stopgap hint
  strings replaced; walker town executors converted to
  walk-in-trigger; new/updated playwright specs green; sweep 6/6 green; `docs/TODO.md`
  "UI and layout" door-model bullet and `docs/ROADMAP.md` town gap (a)+(b) closed;
  `docs/CHANGELOG.md` entry. Obvious follow-ons: update every `tests/playwright/` spec that
  pressed Enter/Space at a door; rerun the sweep after executor conversion.
- Parallel-plan ready: yes (WS-3-collision runs first as two sequenced packages; WS-3-walker
  and WS-3-specs run concurrently once the door-trigger package lands; max 3 doers).

### Milestone: M4 corral purchase screen

- Depends on: WP-3B (walk-in trigger is the entry path the screen wires into).
- Workstreams: WS-4-screen, WS-4-specs.
- Entry criteria: WP-4A (component build) may start immediately; only the wiring package waits
  on WP-3B.
- Exit criteria: walking into the corral always opens the purchase panel, which distinguishes
  three outcome states -- (1) eligible-purchase state before confirmation (price, stock, funds,
  confirm-buy and leave actions), (2) completed-purchase result after an explicit confirm
  (mule in tow, updated funds and stock), (3) failure states where confirmation is unavailable
  (mule already in tow, out of stock, insufficient funds: same figures plus the reason);
  existing `ErrorBoundary`/notice floor retained beneath it; that is five observable panel
  states reached through four entry scenarios -- the success scenario exercises states (1) then
  (2), and each failure scenario shows its state-(3) variant; the playwright
  spec covers all four entry scenarios with both mouse and Enter confirmation and arrow-key
  focus movement; `docs/TODO.md` corral bullet and `docs/ROADMAP.md` town gap
  (c) closed; `docs/CHANGELOG.md` entry. Obvious follow-ons: route `outfitAtCounter` and pub
  confirm flows' notice strings through the same screen pattern only if they already break;
  otherwise leave them and note it in TODO.
- Parallel-plan ready: yes (WS-4-screen and WS-4-specs overlap after wiring; max 2 doers).

### Milestone: M5 stage foundation for 16:10 layouts

- Depends on: none.
- Workstreams: WS-5-stage (single lane -- inherently serial: one container, one CSS seam;
  documented serial exception).
- Entry criteria: none.
- Exit criteria: an explicit letterboxed 16:10 stage container wraps the game screen
  (`#game-hud`/`#game-map`/`#game-panel` render inside it); overworld and town scenes render
  identically inside the stage (they were already full-cover); a playwright assertion proves
  the stage bounding box is 16:10 at multiple viewport sizes; no existing spec regresses;
  `docs/CHANGELOG.md` entry. Obvious follow-ons: record the stage selector (`#game-stage`) in
  the plan copy so M6/M7 packages assert against it.
- Parallel-plan ready: no (single container package; M6/M7 lanes fan out from it).

### Milestone: M6 landscape auction screen

- Depends on: none for WP-6A (arena geometry); WP-6B depends on WP-5A (canvas-fill CSS needs
  the stage to fill).
- Workstreams: WS-6-arena, WS-6-accept.
- Entry criteria: none.
- Exit criteria: horizontal price track fills the 16:10 canvas -- buyers advance from the left,
  sellers from the right, trades fire in the middle, store buy/sell prices anchor the ends,
  participant readouts above and below; sit-out sideline "line judge" slot preserved
  (`sidelineSpot` behavior intact); `tests/playwright/auction_scene.spec.mjs` updated and
  green; visual acceptance pass records full-canvas fill at 16:10; `docs/TODO.md` auction
  rework bullet closed; `docs/CHANGELOG.md` entry. Obvious follow-ons: update any other spec
  asserting on the vertical track geometry; keep `AuctionPainter.java` citation comment
  accurate.
- Parallel-plan ready: yes (rotation and CSS packages sequence; acceptance lane independent
  once rendering lands; max 2 doers).

### Milestone: M7 phase-panel canvas fill

- Depends on: WP-5A (every panel package fills the stage container; M7 cannot close and panel
  packages cannot start until the stage foundation exists). WP-7A (the seam split) is the only
  M7 package that may start before WP-5A lands.
- Workstreams: WS-7-css, WS-7-panels, WS-7-accept.
- Entry criteria: none.
- Exit criteria: land grant, land auction, production, and scoring panels each use the full
  16:10 width/height with no narrow centered column; shared 480px rule split so panels style
  independently; all existing playwright specs green; visual acceptance pass per screen;
  `docs/TODO.md` phase-screen audit bullet closed; `docs/CHANGELOG.md` entry. Obvious
  follow-ons: apply the same treatment to any smaller dialog found sharing the 480px rule;
  rerun `./run_playwright_tests.sh` after each panel patch.
- Parallel-plan ready: yes (four panel packages fully independent after WS-7-css; max 5 doers).

### Milestone: M8 walker harness debt

- Depends on: none for the seek-core lane; WP-8B depends on WP-8A and firmly on WP-3C (the
  town-side executor path uses the walk-in trigger -- single execution path, matching the work
  package).
- Workstreams: WS-8-core, WS-8-exec, WS-8-tests.
- Entry criteria: none.
- Exit criteria: one shared overshoot-correcting seek core used by both town and overworld
  walkers; one `MAX_WALK_TAPS` constant; `hunt_wampus` and `assay_plot` develop plans execute
  spatially (dispatch table no longer routes them to skip); unit coverage added in
  `tests/test_walkthrough_plan_exec.mjs`; sweep run shows completed `hunt_wampus`/`assay_plot`
  plans in `report.counters` rather than only skips; sweep 6/6 green; `docs/TODO.md`
  "Developer and testing" bullets closed; `docs/CHANGELOG.md` entry. Obvious follow-ons:
  update `docs/WALKTHROUGH_GUIDE.md` executor/coverage tables to match.
- Parallel-plan ready: yes (WS-8-core independent; WS-8-exec and WS-8-tests overlap after it;
  max 2-3 doers).

## Workstream breakdown

### Workstream: WS-1-engine

- Owner: expert_coder (design-sensitive matching change; use /typescript-engineer).
- Needs: planet_mule reference findings from WP-1A.
- Provides: ranked-offer matching engine for WS-1-verify.
- Expected patches: 1-2.

### Workstream: WS-1-verify

- Owner: tester (tests, sim) + coder (citation doc).
- Needs: WS-1-engine patch for test/sim halves; nothing for the citation half.
- Provides: green gates and rule citation closing M1.
- Expected patches: 2.

### Workstream: WS-2-speed

- Owner: coder.
- Needs: nothing.
- Provides: calibrated walker speed for all scenes.
- Expected patches: 1.

### Workstream: WS-3-collision

- Owner: expert_coder (gesture-layer geometry + interaction redesign; use /solid-js-expert).
- Needs: nothing.
- Provides: collision map and door-trigger seam consumed by WS-3-walker, WS-3-specs, WS-4-screen.
- Expected patches: 2.

### Workstream: WS-3-walker

- Owner: coder.
- Needs: door-trigger package (WP-3B).
- Provides: walk-in-trigger town executors for the sweep gate.
- Expected patches: 1.

### Workstream: WS-3-specs

- Owner: tester.
- Needs: door-trigger package (WP-3B).
- Provides: browser proof of collision and door model.
- Expected patches: 1.

### Workstream: WS-4-screen

- Owner: coder (use /solid-js-expert and /ui-ux-engineer).
- Needs: WP-3B only for final wiring; component builds standalone.
- Provides: corral purchase screen component and wiring.
- Expected patches: 1-2.

### Workstream: WS-4-specs

- Owner: tester.
- Needs: wired screen (WP-4B).
- Provides: four-outcome browser coverage.
- Expected patches: 1.

### Workstream: WS-5-stage

- Owner: expert_coder (cross-screen container seam; use /ui-ux-engineer).
- Needs: nothing.
- Provides: the `#game-stage` 16:10 container M6/M7 canvas-fill packages assert against.
- Expected patches: 1.

### Workstream: WS-6-arena

- Owner: expert_coder (SVG geometry rotation with a preserved seam; use /solid-js-expert and
  /ui-ux-engineer).
- Needs: nothing.
- Provides: landscape arena for WS-6-accept.
- Expected patches: 2.

### Workstream: WS-6-accept

- Owner: tester + playwright_operator/image_evaluator pair for visual acceptance.
- Needs: WS-6-arena rendering.
- Provides: spec updates and visual acceptance record.
- Expected patches: 1.

### Workstream: WS-7-css

- Owner: coder.
- Needs: nothing.
- Provides: per-panel style seams for WS-7-panels.
- Expected patches: 1.

### Workstream: WS-7-panels

- Owner: coder x4 (one per panel; use /ui-ux-engineer).
- Needs: WS-7-css split.
- Provides: four full-canvas panels.
- Expected patches: 2-4.

### Workstream: WS-7-accept

- Owner: playwright_operator + image_evaluator.
- Needs: each panel patch as it lands.
- Provides: per-screen visual acceptance records.
- Expected patches: 1.

### Workstream: WS-8-core

- Owner: coder.
- Needs: nothing.
- Provides: shared seek core and single `MAX_WALK_TAPS` for WS-8-exec.
- Expected patches: 1.

### Workstream: WS-8-exec

- Owner: coder.
- Needs: WS-8-core.
- Provides: wampus/assay spatial executors.
- Expected patches: 1-2.

### Workstream: WS-8-tests

- Owner: tester.
- Needs: WS-8-exec.
- Provides: unit coverage and sweep counter proof.
- Expected patches: 1.

## Work packages

### Work package: WP-1A verify matching traversal against the rule sources and draft citation

- Owner: coder.
- Touch points: `OTHER_REPOS/mule_rules.md` (trading stage) and `OTHER_REPOS/mule_document.html`
  ("Goods auctions": Declaring, Trading, "The Store": Purchase and sale price, Store setup) as
  the PRIMARY authority for intended auction behavior;
  `OTHER_REPOS/planet_mule/data_decompiled/.../controller/AuctionController.java`,
  `.../controller/phase/AuctionPhase.java`, `.../model/Auction.java`, `.../model/AuctionState.java`
  as SUPPORTING implementation evidence only (read-only); `docs/RULE_SOURCES.md` (draft entry).
- Depends on: none.
- Acceptance criteria: ranked solvent fallthrough is strongly supported by the rule sources and
  adopted by user decision (2026-07-10) -- the 1983 rules establish that the store participates
  as both buyer and seller within price limits, sells only available stock, and that a trade run
  continues until
  the buyer runs out of money, the seller runs out of goods, or a participant withdraws; an
  insolvent participant therefore must not block other eligible traders. This package answers
  only the narrower open question: how the original selects the NEXT eligible buyer/seller when
  the current one cannot complete a trade (traversal order, tie handling, store position in the
  queue), using planet_mule's controllers as implementation evidence where the prose is silent.
  A valid conclusion of this package is that NO direct analogue exists -- the original's figures
  physically move and withdraw rather than being discretely matched -- and that the modern
  discrete matcher therefore needs a documented house rule; evidence gathering, not forcing a
  historical answer, is the deliverable.
  Authority hierarchy (user, 2026-07-10, recorded in `docs/HUMAN_GUIDANCE.md` by WP-D1): game
  RULES follow the 1983/1990 documents (`mule_rules.md`, `mule_document.html`); planet_mule
  guides VISUAL style and supplies implementation ideas only -- treat its code as presentation
  reference, subordinate to the original rule documents on any mechanics question.
  Deliverable: a written traversal summary plus a draft RULE_SOURCES entry citing
  `mule_document.html` "Purchase and sale price" (store spreads: food/energy buy = current -
  $15, sell = buy + $35; smithore sell = buy + $35; crystite sell = buy + $140) and "Trading"
  (auction runs while a seller exists OR store stock >= 1; closing price = average of units
  sold), and `mule_rules.md` trading stage. Cite planet_mule's auction controllers
  (`AuctionController.java`, `Auction.java`) for matching evidence; `Shop.java` documents store
  pricing.
- Verification commands: none (reading task); deliverable reviewed in the WP-1B patch.
- Obvious follow-ons: hand the traversal summary directly to WP-1B owner; only escalate to the
  manager if the sources give NO evidence for a traversal order (then WP-1B uses ranked
  price-then-lowest-playerId as the documented house rule).

### Work package: WP-1B ranked offer lists and solvent fallthrough

- Owner: expert_coder.
- Touch points: `src/engine/auction.ts` (`bestBid` :432-451, `bestAsk` :461-484, `resolveTrade`
  :669-722, `canExecute` :514-534, `Offer` type :417-422).
- Depends on: WP-1A (reference behavior informs the walk order).
- Acceptance criteria: authority hierarchy for behavior questions is `mule_rules.md` /
  `mule_document.html` first, planet_mule decompiled source second, current project code third
  (user decision 2026-07-10). `bestBid`/`bestAsk` (or successors, e.g. `rankedBids`/`rankedAsks`)
  return ordered offer lists preserving current tie-break (lowest `playerId`) and store
  participation rules (store buy always present; store sell only when `storeStock >= 1`).
  Provisional traversal design -- the documented house rule, used unless WP-1A's traversal
  summary supplies stronger evidence: bids
  ordered by price descending then lowest `playerId`; asks ordered by price ascending then
  lowest `playerId`; `resolveTrade` scans bid-major, ask-minor, skipping store-to-store pairs,
  and executes the FIRST pair that both crosses (`bid.price >= ask.price`) and passes
  `canExecute` -- i.e. the executed trade maximizes bid price, then minimizes ask price, then
  prefers lowest playerIds; one unit per tick as today. Whichever traversal is chosen, pin this
  invariant in tests: a trade executes exactly when at least one crossed solvent pair exists
  (an insolvent or out-of-stock participant is skipped and the next eligible offer trades). Store standing offers with limited
  stock act as the natural seller-out-of-goods fallback (resolved decision, user 2026-07-10);
  the store rules stay exactly as they are today. `npx tsc --noEmit` clean; tests that pinned
  the old single-offer behavior are updated in this package.
- Verification commands (task-level fast proof): `npx tsc --noEmit`;
  `node --import tsx --test tests/test_auction_termination.mjs` plus the auction-related
  `tests/test_*.mjs`; full `./check_codebase.sh` at milestone gate, not per iteration.
- Obvious follow-ons: finalize the WP-1A RULE_SOURCES entry in this patch; update the
  `docs/CHANGELOG.md` draft bullet; fix any newly failing unit test that encoded the quirk.

### Work package: WP-1C fallthrough unit tests and termination re-strengthening

- Owner: tester.
- Touch points: new `tests/test_auction_solvent_fallthrough.mjs`;
  `tests/test_auction_termination.mjs:144-164`.
- Depends on: WP-1B.
- Acceptance criteria: buyer-side cases -- a test seats an insolvent bidder above a solvent
  second bidder and above the store's standing bid in one auction tick and asserts the solvent
  trade executes (both the player-pair case and the store-fallback case); seller-side cases --
  a test seats a best-priced ask that cannot execute (seller out of inventory) above a stocked
  second seller and the store-ask variant, and asserts the stocked trade executes, proving
  invalid-ask traversal symmetrically; the termination test's third case asserts an
  exact expected trade count again (weakening comment at :160-162 removed); suite green.
- Verification commands: `node --import tsx --test tests/test_auction_solvent_fallthrough.mjs
  tests/test_auction_termination.mjs`; then the full unit suite.
- Obvious follow-ons: if the exact count differs from the pre-bug expectation, derive it from the
  engine rules and document the derivation in the test comment.

### Work package: WP-1D balance-sim dead-window re-verification

- Owner: tester.
- Touch points: `tests/e2e/e2e_balance_sim.mjs` (run only); `docs/TODO.md` (gambling-section
  re-verify bullet); `docs/RULE_SOURCES.md` (figure refresh).
- Depends on: WP-1B.
- Acceptance criteria: dead-auction-window rate re-measured at 100 seeds/mode in both modes
  post-fix; gate `< 0.2` holds; measured figures replace the stale ones in TODO/RULE_SOURCES.
- Verification commands: `node --import tsx tests/e2e/e2e_balance_sim.mjs` (per its header);
  `bash tests/e2e/e2e_run_all.sh`.
- Obvious follow-ons: if the rate regresses above gate, file the failure in `docs/CHANGELOG.md`
  Decisions and Failures and block M1 closure.

### Work package: WP-2A calibrate walker speed

- Owner: coder.
- Touch points: `src/ui/scenes/walker.ts:60`; `tests/e2e/e2e_walk_calibration.mjs` (run);
  `docs/active_plans/audits/mule_trip_timing.md`; `docs/ROADMAP.md`.
- Depends on: none.
- Acceptance criteria: this is an intended GAMEPLAY TIMING change, not presentation. Target
  behavior: a fully food-starved develop turn (budget
  `DEVELOP_TICKS_MIN`, speed multiplier 1x) starting at the town exit can reach the
  farthest-corner overworld plot with taps to spare. Exact pass rule: measured trip taps <=
  starved budget with >= 10% margin, measured by `e2e_walk_calibration.mjs` against the real
  browser (its existing method), start and destination as defined in the audit doc
  (`mule_trip_timing.md`). Run as a calibration experiment: the audit's [120, 160] range is a
  hypothesis, not a proven bound -- try 120, then 140, then 160, select the LOWEST value whose
  evidence passes, and follow the evidence outside the range if the browser measurements
  require it (recording why); final value and evidence recorded in the audit doc; sweep 6/6
  green afterward (the seed-3 economy-variance note in ROADMAP is the expected side effect
  channel to watch, not a failure by itself).
- Verification commands: `node --import tsx tests/e2e/e2e_walk_calibration.mjs`;
  `node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs`.
- Obvious follow-ons: regenerate the calibration table in `docs/WALKTHROUGH_GUIDE.md` if it
  embeds speed-derived numbers; update `docs/CHANGELOG.md`.

### Work package: WP-3A town building collision

- Owner: expert_coder.
- Touch points: `src/ui/scenes/town_scene.tsx` (movement `:222-238`, bounds/exit `:242-247`);
  possibly `src/ui/scenes/walker.ts` (`stepPosition` obstacle handling).
- Depends on: none.
- Acceptance criteria: treat the geometry as an experiment judged by measurable results
  (reachability and wall-slide checks below), not by matching the proposed shape -- simple
  rectangles with doorway gaps is the starting design; if it produces sticky or unnatural
  movement in measurement, iterate the geometry (rounded corner insets, wider gaps) and keep
  the winner. Building footprints live in one source-of-truth module (new
  `src/ui/scenes/town_layout.ts` exporting building rects AND passable doorway gaps) consumed
  by BOTH the renderer and the movement clamp, so drawn walls and solid walls can never drift
  apart; collision testing accounts for the avatar radius (`AVATAR_SIZE/2`, matching
  `stepPosition`'s existing radius argument) so the doorway gap width is specified in
  avatar-widths, not raw pixels; buildings are solid outside their doorway gap; wall-slide
  behavioral threshold: holding a diagonal input into a wall produces sustained movement
  parallel to the wall for the full hold duration, with the parallel coordinate strictly
  monotonic frame-over-frame (no position lock, no oscillation) -- measurable in the WP-3D spec
  or a unit check against the clamp function; town edge exits unchanged; reachability evidence required:
  a check (unit-level against `town_layout.ts` geometry, or the WP-3D spec) proving every
  `[data-door-for]` shop is reachable from the town spawn point; verify the AI actor layer's
  movement surface and keep it working (it moves on the overworld map).
- Verification commands: `npx tsc --noEmit`; `./run_playwright_tests.sh` (existing town specs).
  Optional review aid: manual `./run_web_server.sh` walkaround.
- Obvious follow-ons: expose collision rectangles as data attributes if the playwright spec
  (WP-3D) needs them for assertions.

### Work package: WP-3B door-opens-on-approach and walk-in trigger

- Owner: expert_coder.
- Touch points: `src/ui/scenes/town_scene.tsx` (`ACTION_KEYS`/`handleActionKey` :112,:301-330,
  `useDoor` :334-352, hint strings :515/:358, door markers :698, `data-at-door` :496).
- Depends on: WP-3A (door zones sit in the collision geometry).
- Acceptance criteria: approaching a shop opens its door (visible open state); closed door is
  solid; walking through the open doorway fires the same interactions `useDoor` routes today
  (corral, pub confirm, assay, counters) with no Enter/Space press; pub gamble keeps its
  confirm step (confirm dialog appears on walk-in; Enter/Space may confirm the dialog -- the
  removal target is press-to-enter, not dialog confirmation); Enter/Space door-entry handling
  and stopgap hint strings removed/replaced; `[data-door-for]` markers kept and each door
  exposes `data-door-state="open" | "closed"` for tests and the walker (WP-3C/WP-3D assert on
  this attribute).
- Verification commands: `npx tsc --noEmit`; `./run_playwright_tests.sh`.
- Obvious follow-ons: update the default town notice string to describe walk-in doors; keep
  `data-at-door` publishing if the walker still reads it, else remove with the walker update.

### Work package: WP-3C convert walker town executors to walk-in-trigger

- Owner: coder.
- Touch points: `tests/e2e/walkthrough_town.mjs` (`walkToDoor` :215-220, action-key presses);
  `tests/e2e/walkthrough_helpers.mjs` (`walkTownAvatarToDoor` :826-892).
- Depends on: WP-3B.
- Acceptance criteria: town executors walk to and through the open door instead of pressing the
  action key; single-seed active walkthrough passes; sweep 6/6 green.
- Verification commands: `bash tests/e2e/e2e_run_all.sh`;
  `node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs`.
- Obvious follow-ons: update `docs/WALKTHROUGH_GUIDE.md` door-executor description; if WP-8A has
  already landed, use the shared seek core rather than the old helper shape.

### Work package: WP-3D collision and door playwright specs

- Owner: tester.
- Touch points: `tests/playwright/town_scene.spec.mjs` (or a new `town_doors.spec.mjs`).
- Depends on: WP-3B.
- Acceptance criteria: spec walks the avatar into a wall and asserts position stops (no
  wall-through); walks to a closed door and asserts no entry; walks through an open door and
  asserts the shop interaction fires without any key press; specs green in the full run.
- Verification commands: `./run_playwright_tests.sh`.
- Obvious follow-ons: retire any existing spec steps that pressed Enter/Space at doors.

### Work package: WP-4A corral purchase screen component

- Owner: coder.
- Touch points: new component under `src/ui/solid/` (e.g. `corral_purchase_panel.tsx`);
  `src/style.css`; `src/ui/scenes/town_scene.tsx` (`buyAtCorral` :383-399 state sourcing).
- Depends on: none (builds against the existing Enter-trigger while WP-3B is in flight).
- Acceptance criteria: user flow is attempt-then-confirm, the CHOSEN modern interface design
  (a design decision of this plan under the mouse/arrows/Enter guidance, not a behavior of the
  1983 original, which showed ambient counter prices) -- walking into the corral opens the
  purchase panel; the `buy_mule` dispatch fires ONLY on an explicit confirm inside the panel
  (success case shows price, stock, and funds with confirm-buy and leave actions; each failure
  case shows the same figures plus the reason with a dismiss action); dismissal returns the
  player to the town scene at the door. Keyboard model per the mouse/arrows/Enter guidance:
  arrow keys (left/right or up/down, matching the panel's action layout) move focus between the
  Buy and Leave actions, Enter activates the focused action, and mouse click activates directly;
  the focused action is visibly highlighted. Presentation is an in-stage modal transaction panel
  layered over the town scene (a full-stage phase replacement is rejected as oversized for a
  town transaction); the panel is sized generously within the stage rather than to the old
  480px habit; existing notice/`ErrorBoundary` floor retained beneath it;
  1983-ambient price/stock precedent from `OTHER_REPOS/mule_rules.md` town section consulted for
  content; corral figures shown must come from the engine's store state, whose 1983 rules are
  documented in `OTHER_REPOS/mule_document.html` "Corral mules building and pricing" (14-mule
  stock cap, 2 smithore per rebuilt mule, mule price = 2x smithore price rounded down to a
  multiple of 10) -- cite in the screen's doc comment if the display echoes them.
- Verification commands: `npx tsc --noEmit`; `./run_playwright_tests.sh`. Optional review aid:
  manual `./run_web_server.sh` check of all four outcomes.
- Obvious follow-ons: replace the `setNotice` calls in `buyAtCorral` with screen routing behind
  a single dispatch point so WP-4B wiring is one seam.

### Work package: WP-4B wire purchase screen to walk-in trigger

- Owner: coder.
- Touch points: `src/ui/scenes/town_scene.tsx` corral door path.
- Depends on: WP-4A, WP-3B.
- Acceptance criteria: walking into the corral always opens the purchase screen (success and
  every failure case -- user requirement: "even if no mules or insufficient funds it should go
  to screen and tell me that"); the panel is the SINGLE corral-entry feedback path -- the old
  notice-only path is deleted in the same patch.
- Verification commands: `./run_playwright_tests.sh`; sweep single-seed run.
- Obvious follow-ons: confirm the walker's corral executor (post-WP-3C) dismisses the screen
  correctly; update hint strings that mention the corral.

### Work package: WP-4C corral purchase playwright spec

- Owner: tester.
- Touch points: new `tests/playwright/corral_purchase.spec.mjs`.
- Depends on: WP-4B.
- Acceptance criteria: spec covers success, already-in-tow, out-of-stock, and
  insufficient-funds outcomes, asserting price/stock/funds render and the correct message per
  case; input coverage proves the mouse/arrows/Enter guidance -- at least one case confirms the
  purchase by mouse click, one confirms by Enter keypress, and one moves focus with an arrow
  key before Enter (asserting the visible focus highlight moved); green in the full run.
- Verification commands: `./run_playwright_tests.sh`.
- Obvious follow-ons: none beyond doc bullets (closed at milestone exit).

### Work package: WP-5A letterboxed 16:10 stage container

- Owner: expert_coder.
- Touch points: `src/ui/solid/game_screen.tsx`; `src/style.css` (`.screen` :8-19, `#screen-game`
  :264-269); `src/ui/solid/app.tsx:95` if the wrapper moves.
- Depends on: none.
- Acceptance criteria: a `#game-stage` element with `aspect-ratio: 16 / 10`, centered and
  letterboxed within the viewport (max width/height constrained, background bars outside it);
  `#game-hud`/`#game-map`/`#game-panel` lay out inside the stage; overworld and town scenes
  render visually unchanged inside it; a new playwright assertion checks
  `boundingBox.width / boundingBox.height` is 1.6 within tolerance at two viewport sizes
  (wide-window and tall-window letterbox cases); all 30 existing specs green.
- Verification commands: `npx tsc --noEmit`; `./run_playwright_tests.sh`. Optional review aid:
  manual `./run_web_server.sh` resize check.
- Obvious follow-ons: document the stage selector in the active plan copy; fix any spec that
  hardcoded viewport-relative positions.

### Work package: WP-6A rotate auction arena to landscape

- Owner: expert_coder.
- Touch points: `src/ui/solid/auction_screen.tsx` (`PriceArena` :445, track constants :64-66,
  `sidelineSpot` :156-162, avatar target :455-458, out-avatar snap :620-632, doc comment
  :139-151).
- Depends on: none.
- Acceptance criteria: horizontal track -- buyers advance rightward from the left as bids rise,
  sellers advance leftward from the right as asks fall, trades fire where they meet; store buy
  and sell prices anchor left and right track ends; participant readouts above and below the
  track -- for the readout arrangement, mock one or two inexpensive variants (e.g. names-above/
  log-below vs split readouts) and pick by the measurable readability criteria in the gates
  section rather than committing to the first layout; sit-out sideline slot preserved with
  equivalent "line judge" placement; this package
  edits presentation code only -- engine imports and dispatched intents stay exactly as they
  are; `AuctionPainter.java` stays the cited visual reference (per the planet_mule visual-style
  guidance) and its citation comment kept accurate.
- Verification commands: `npx tsc --noEmit`; `./run_playwright_tests.sh` (auction specs will
  need WP-6C updates -- coordinate, run unaffected specs meanwhile).
- Obvious follow-ons: hand the new geometry constants to WP-6B for the canvas-fill CSS.

### Work package: WP-6B auction screen full-canvas CSS

- Owner: coder.
- Touch points: `src/style.css` (`.auction-screen` :928-936, `.auction-track-svg` :967-971,
  related panel rules).
- Depends on: WP-6A; WP-5A (the stage container is the canvas being filled).
- Acceptance criteria: auction screen fills `#game-stage` (assert against the stage box, not
  the viewport); no 480px or
  280px max-width caps remain on the auction path; readouts/track/log spread per WP-6A layout;
  no other screen's styling regresses (the shared rules are also touched by WP-7A -- coordinate
  ownership: WP-7A owns the shared-rule split, this package owns auction-specific rules only).
- Verification commands: `./run_playwright_tests.sh`. Optional review aid: visual check at
  16:10 viewport.
- Obvious follow-ons: none.

### Work package: WP-6C auction spec update and visual acceptance

- Owner: tester (+ playwright_operator/image_evaluator for the visual pass).
- Touch points: `tests/playwright/auction_scene.spec.mjs`; visual acceptance report under
  `docs/active_plans/reports/`.
- Depends on: WP-6A, WP-6B.
- Acceptance criteria: spec assertions updated from vertical to horizontal geometry (buyer
  tokens move rightward, seller tokens leftward, sideline slot present); visual acceptance
  report records full-canvas fill and readability at 16:10; specs green.
- Verification commands: `./run_playwright_tests.sh`.
- Obvious follow-ons: file the report in `docs/active_plans/reports/` per the active-plans
  folder rules.

### Work package: WP-7A split the shared narrow-panel CSS rule

- Owner: coder.
- Touch points: `src/style.css:271-282` (shared `max-width: 480px` rule).
- Depends on: none.
- Acceptance criteria: each of the four panels (land grant, land auction, production, scoring)
  gets its own style seam; rendering is pixel-identical before any panel package changes it
  (pure seam split); auction rules untouched (owned by WP-6B).
- Verification commands: `./run_playwright_tests.sh` (all specs still green, unchanged
  rendering).
- Obvious follow-ons: list every other selector sharing the rule and note them for the
  milestone exit audit.

### Work package: WP-7B..WP-7E panel canvas-fill (one per panel)

- Owner: coder (one per panel; four packages: WP-7B land grant, WP-7C land auction,
  WP-7D production, WP-7E scoring).
- Touch points: `src/ui/solid/land_grant_panel.tsx` / `land_auction_panel.tsx` /
  `production_panel.tsx` / `scoring_panel.tsx`; their split CSS seams.
- Depends on: WP-7A and WP-5A (each; independent of each other).
- Acceptance criteria: the panel fills `#game-stage` -- HUD/panels/play area spread per
  `docs/HUMAN_GUIDANCE.md` ("treat a narrow centered single-column layout with large dead
  margins as a defect"); information hierarchy preserved; that panel's playwright specs green.
- Verification commands: `./run_playwright_tests.sh`. Optional review aid: visual check at
  16:10.
- Obvious follow-ons: apply the same fix to any sub-dialog of that panel found on the WP-7A
  shared-selector list.

### Work package: WP-7F phase-panel visual acceptance

- Owner: playwright_operator + image_evaluator.
- Touch points: screenshots + report under `docs/active_plans/reports/`.
- Depends on: WP-7B, WP-7C, WP-7D, WP-7E (evaluates each as it lands; final report after all).
- Acceptance criteria: per-screen 16:10 screenshot evidence; report judges canvas fill and
  readability per screen; failures loop back to the owning panel package.
- Verification commands: screenshot capture via existing playwright patterns.
- Obvious follow-ons: none.

### Work package: WP-8A extract shared seek core and dedupe MAX_WALK_TAPS

- Owner: coder.
- Touch points: `tests/e2e/walkthrough_helpers.mjs` (`walkTownAvatarToDoor` :826-892,
  `walkOverworldAvatarToCell` :935-1005, `MAX_WALK_TAPS` :510);
  `tests/e2e/e2e_walk_calibration.mjs:88`.
- Depends on: none.
- Acceptance criteria: one overshoot-correcting seek core (per-tap side recompute, overshoot
  halving, stall counter) parameterized for 1D door seek and 2D cell seek; both walkers use it;
  calibration script imports the helpers' `MAX_WALK_TAPS` instead of redefining it; walker unit
  tests green; single-seed walkthrough passes.
- Verification commands: `node --import tsx --test tests/test_walkthrough_overworld.mjs
  tests/test_walkthrough_plan_exec.mjs`; `bash tests/e2e/e2e_run_all.sh`.
- Obvious follow-ons: none.

### Work package: WP-8B hunt_wampus and assay_plot spatial executors

- Owner: coder.
- Touch points: `tests/e2e/e2e_walkthrough.mjs` (`skipOpportunisticDevelopPlan` :383-390,
  dispatch table :431-441); `tests/e2e/walkthrough_overworld.mjs` / `walkthrough_town.mjs`
  (executor pattern of `executePlaceMule`/`executeOutfitMule`).
- Depends on: WP-8A (executors build on the shared seek core); WP-3C (firm -- the town-side
  assay-office leg uses the walk-in-trigger executor shape; one single implementation).
- Acceptance criteria: `hunt_wampus` walks to the wampus location and fires the interaction;
  `assay_plot` walks to the plot and fires assay; dispatch table routes both to real executors;
  keep the skip function only for genuinely unreachable plans (remove it if none remain).
- Verification commands: `bash tests/e2e/e2e_run_all.sh`; single-seed walkthrough log shows
  executed (not skipped) plans.
- Obvious follow-ons: update `docs/WALKTHROUGH_GUIDE.md` failure-taxonomy/coverage tables.

### Work package: WP-8C executor unit coverage and sweep counter proof

- Owner: tester.
- Touch points: `tests/test_walkthrough_plan_exec.mjs`; sweep run.
- Depends on: WP-8B.
- Acceptance criteria: unit tests cover both new executors (happy path + stall/skip fallback);
  deterministic execution proof is the PRIMARY gate -- identify (by trial single-seed runs) one
  seed/mode per plan kind that reliably produces a `hunt_wampus` plan and one that produces an
  `assay_plot` plan, and record those seed/mode invocations in the work package's evidence; if
  no seed among {1, 3, 7} x {beginner, standard} reliably produces a plan kind, add a
  forced-plan hook to the harness's develop-plan layer (strategy layer only) so the executor is
  provably exercised -- and verify the hook drives the SAME production path as a naturally
  generated plan (identical dispatch-table entry and executor code; the hook may only override
  which plan the strategy proposes, never how it executes). The sweep counter check (`plansAttempted`/`plansCompleted` including the
  new kinds) is SECONDARY evidence, valid only for the seeds that produce those plans; sweep
  6/6 green.
- Verification commands: `node --import tsx --test tests/test_walkthrough_plan_exec.mjs`; the
  two recorded single-seed walkthrough invocations;
  `node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs`.
- Obvious follow-ons: none beyond milestone doc close-out.

### Work package: WP-D1 record standing guidance and own the doc close-out

- Owner: planner.
- Touch points: `docs/HUMAN_GUIDANCE.md` (new entries); final-sweep edits to `docs/ROADMAP.md`,
  `docs/TODO.md`, `docs/WALKTHROUGH_GUIDE.md`; the active plan copy in
  `docs/active_plans/active/`.
- Depends on: none for the HUMAN_GUIDANCE entries (write immediately); the final ROADMAP/TODO
  sweep depends on all milestone closures.
- Acceptance criteria: `docs/HUMAN_GUIDANCE.md` gains two entries with Why/How-to-apply
  sections: (1) the source-of-truth hierarchy -- visual style follows planet_mule; game rules
  follow the 1983/1990 documents (`OTHER_REPOS/mule_rules.md`,
  `OTHER_REPOS/mule_document.html`); interface uses mouse + arrow keys + Enter where practical;
  (2) the attempt-then-confirm town transaction flow (walk-in opens the panel, Enter confirms).
  Document authority split, recorded in the same entry so future agents route updates
  correctly: `docs/RULE_SOURCES.md` owns formulas/constants and their citations;
  `docs/HUMAN_GUIDANCE.md` owns durable user preferences and decision records;
  `docs/ROADMAP.md` owns priority ordering and known-bug writeups; `docs/TODO.md` owns the
  small-task backlog. Per-milestone doc updates remain owned by the work packages that name
  them; this package owns only the guidance entries and the final consistency sweep.
- Verification commands: `pytest tests/test_markdown_links.py`.
- Obvious follow-ons: none.

## Acceptance criteria and gates

Three gate tiers; a patch needs only its tier-1 proof, milestones run tier 2, the plan closes
on tier 3. Broad suites are milestone gates, not per-iteration gates.

- Tier 1, per-patch fast proof: `npx tsc --noEmit` clean plus the targeted tests the work
  package names (specific `tests/test_*.mjs` files or specific playwright specs);
  `docs/CHANGELOG.md` bullet drafted in the same patch.
- Tier 2, milestone integration gate: `./check_codebase.sh` full pass once at milestone close
  (it is the TS/unit integration net; for CSS-only or spec-only packages inside a milestone,
  tier-1 `npx tsc --noEmit` plus the named specs suffice between patches); plus
  `./run_playwright_tests.sh` for UI milestones (M3-M7) and
  `bash tests/e2e/e2e_run_all.sh` for engine/walker milestones (M1, M2, M8).
- Tier 3, regression / release gate (closing M1, M2, M3, M8 -- anything touching engine, speed,
  or walker -- and once at plan close):
  `node --import tsx tests/e2e/e2e_walkthrough_sweep.mjs` exits 0 with 6/6 runs green and
  `matrixCoverageSatisfied` in both modes.
- Review gate: every patch audited by `reviewer` (an agent) before closure; M6/M7 additionally
  pass the image_evaluator visual acceptance (also agents). These agent reviews complete
  autonomously. The human owns all `git commit` runs and may review staged work at any time;
  manual walkarounds and resize checks named in work packages are optional review aids, and
  their automated counterparts (specs, geometry checks) are the completion requirement.
- Stage validation (M5 only -- the stage has no "main content" to fill): stage bounding box
  aspect ratio is 1.6 within tolerance at a wide-window and a tall-window viewport; all game
  content is contained inside the stage box; letterbox bars sit outside it; no scrollbars or
  clipped content at either viewport.
- Measurable visual acceptance (M6, M7 content fill): (a) the screen's main content bounding box covers
  >= 90% of `#game-stage` width and >= 85% of its height -- these coverage numbers are STARTING
  HYPOTHESES, not established design truths: a sparse screen may adopt a lower per-screen
  threshold when stretching content to hit the number would hurt it, with the adopted threshold
  and rationale recorded in that screen's visual acceptance report; (b) zero `max-width: 480px`
  (or 280px) caps remain on the screen's element path; (c) no horizontal overflow of the stage
  (no scrollbars, no clipped content); (d) layout stable (same assertions pass) at both a
  wide-window and a tall-window letterboxed viewport; (e) participant identity, quantity,
  funds/stock, bid/ask, and trade state readable without covering the track (M6). The
  image_evaluator judges residual aesthetics; these properties are the pass bar.
- Failure semantics: a red gate blocks that milestone's closure only; independent milestones
  proceed. A sweep regression blocks M1/M2/M3/M8 closures until triaged per
  `docs/WALKTHROUGH_GUIDE.md`.

## Test and verification strategy

- Unit (fast lane): new `tests/test_auction_solvent_fallthrough.mjs`; re-strengthened
  `tests/test_auction_termination.mjs`; extended `tests/test_walkthrough_plan_exec.mjs`;
  existing suite as regression net. Runner: `node --import tsx --test`.
- Browser (playwright): new door/collision assertions and `corral_purchase.spec.mjs`; updated
  `auction_scene.spec.mjs` horizontal geometry; existing 30 specs as regression net. Runner:
  `./run_playwright_tests.sh`.
- Non-browser E2E: `bash tests/e2e/e2e_run_all.sh` (mini_flow, full_game, balance_sim,
  balance_report, single-seed walkthrough); the sweep as the deep regression gate.
- Sim evidence: WP-1D re-measures the dead-window rate post-matching-change so the recorded
  figure stops being stale (TODO explicitly asks for this re-verify).
- Visual: playwright_operator captures at 16:10, image_evaluator judges canvas fill (M6, M7);
  reports filed under `docs/active_plans/reports/`.
- Failure triage: fresh failures assumed caused by current work first, per
  `docs/PYTEST_STYLE.md` triage; walkthrough failures triaged via the 11-kind taxonomy in
  `docs/WALKTHROUGH_GUIDE.md`.

## Migration and compatibility policy

- Additive rollout: WP-4A builds the purchase screen against the existing trigger before WP-3B
  lands; WP-7A splits shared CSS with pixel-identical rendering before any panel changes.
- Backward compatibility: engine save/state shapes unchanged (matching is tick-internal);
  `report.counters` keys unchanged (values grow as executors complete plans); test selectors
  (`[data-door-for]`, `data-at-door`, `data-cell-row/col`) preserved or migrated in the same
  patch as their consumers.
- Legacy deletion criteria: Enter/Space door-entry code and stopgap hint strings delete in
  WP-3B (their replacement lands in the same patch); the weakened `trades.length >= 1`
  assertion deletes in WP-1C; the duplicated seek logic and second `MAX_WALK_TAPS` delete in
  WP-8A; `skipOpportunisticDevelopPlan` deletes in WP-8B if no unreachable plan kind remains.
- Rollback strategy: each milestone is independently revertable (constants revert for M2;
  component/CSS patches revert cleanly for M4-M7). For M1, the old single-offer behavior is
  intentionally not preserved behind a flag -- the ranked walk must degenerate to today's
  outcome whenever the top pair is solvent, and WP-1C pins that equivalence.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| Ranked fallthrough changes trade counts, breaking sim gates or tests that encoded the quirk | M1 blocked | Unit suite or WP-1D sim red after WP-1B | expert_coder (WP-1B) | WP-1C derives exact counts from rules; WP-1D re-measures; equivalence pinned for solvent-top case |
| Door model breaks the walker sweep (executors press keys at doors) | Sweep red, M3 blocked | Sweep run after WP-3B without WP-3C | coder (WP-3C) | Sequence WP-3C before the M3 sweep gate; strategy/mechanics separation limits change to gesture layer |
| Collision geometry strands the avatar or AI pathing | Town unplayable in spots | Playwright walkaround failures | expert_coder (WP-3A) | Slide-along-walls requirement; WP-3D wall specs; manual walkaround |
| Landscape rotation regresses sit-out sideline behavior (fresh fix) | M6 rework | `auction_scene.spec` sideline assertions fail | expert_coder (WP-6A) | Sideline slot named in acceptance criteria; doc comment at :139-151 marks the seam |
| Shared CSS rule split leaks into other screens | Unrelated visual regressions | Any spec red after WP-7A | coder (WP-7A) | Pixel-identical seam-split requirement before panel edits; full spec run gates WP-7A |
| Walk-speed raise shifts economy timing (gesture timing affects trades, per seed-3 variance) | Sweep flake rate rises | Sweep variance after WP-2A | coder (WP-2A) | Sweep gate at each candidate value; characterized-variance notes in ROADMAP prevent misdiagnosis |
| Plan drift: patches land without doc close-out | Docs stale, next manager misled | CHANGELOG missing milestone bullets | manager | Per-patch gate requires the CHANGELOG bullet; milestone exits list doc updates explicitly |

## Rollout and release checklist

- [x] M1 closed: fallthrough tests green, sim re-verified, RULE_SOURCES cited.
- [x] M2 closed: calibrated speed applied (320 px/s), audit doc updated to
      Applied; sweep demoted to diagnostic per USER DECISION 2026-07-10
      ("the deterministic walker is suspect, do not keep as a gate" -- see
      `docs/active_plans/decisions/sweep_gate_demotion.md`); closed on
      `check_codebase.sh` 5/5, Playwright 78+1-known-flake, `e2e_run_all`
      4/5, and the WP-2A calibration evidence table instead.
- [x] M3 closed: collision + door model live, walker converted, specs green, sweep green.
- [x] M4 closed: purchase screen wired for all four outcomes, spec green.
- [x] M5 closed: 16:10 stage container live, aspect assertions green, no spec regressions.
- [x] M6 closed: landscape auction screen live, spec updated, visual acceptance filed.
- [x] M7 closed: four panels full-canvas, specs green, visual acceptance filed.
- [x] M8 closed: seek core shared, executors live; sweep-counter coverage
      proof deferred with the sweep gate demotion (USER DECISION
      2026-07-10) -- unit executor coverage (20/20 overworld, 13/13 town)
      substitutes; forced-plan-hook follow-up recorded in `docs/TODO.md`.
- [x] Final full pass (sweep demoted per USER DECISION 2026-07-10, see
      `docs/active_plans/decisions/sweep_gate_demotion.md`):
      `./check_codebase.sh` 5/5 GREEN (507/507 units); `./run_playwright_tests.sh`
      78 pass + 1 known parallel-load flake; `bash tests/e2e/e2e_run_all.sh`
      4/5 (`e2e_walkthrough` red, deterministic seed-1/3 stall, diagnostic
      in flight); sweep 2/6 (not a release blocker under the demoted gate).
- [x] `docs/ROADMAP.md` and `docs/TODO.md` reflect every closed item; stale bullets removed
      (WP-D1 final consistency sweep, 2026-07-10).
- [x] Release cut intentionally NOT performed (out of scope; human decision).

## Documentation close-out requirements

- Active plan / progress tracker: copied to
  `docs/active_plans/active/bug_fixes_ui_fixes_plan.md` as the first execution patch (plan mode
  forbids writing it now); per-WP status tracked inline; `git mv`'d to this
  `docs/archive/bug_fixes_ui_fixes_plan.md` on closure (WP-D1, 2026-07-10).
- docs/CHANGELOG.md entry: one bullet per patch under the day's heading, using "Patch N" labels,
  correct category sections; failures recorded under Decisions and Failures.
- Archive / closure notes: WP-D1 owns the final consistency sweep across `docs/ROADMAP.md`
  (remove fixed known-bugs entries, close near-term bullets) and `docs/TODO.md` (mark shipped);
  per-milestone owners update `docs/RULE_SOURCES.md` (WP-1A/WP-1B/WP-1D),
  `docs/WALKTHROUGH_GUIDE.md` (WP-2A/WP-3C/WP-8B), and
  `docs/active_plans/audits/mule_trip_timing.md` (WP-2A). WP-D1 also writes the standing
  guidance entries in `docs/HUMAN_GUIDANCE.md` at plan start.

## Patch plan and reporting format

- Patch 1: [engine] ranked offers + solvent fallthrough (WP-1B, includes WP-1A citation).
- Patch 2: [engine tests] fallthrough unit test + termination re-strengthening (WP-1C).
- Patch 3: [sim/docs] dead-window re-verify + figure refresh (WP-1D).
- Patch 4: [walker] speed calibration + audit doc (WP-2A).
- Patch 5: [town] building collision (WP-3A).
- Patch 6: [town] door-approach + walk-in trigger + hint strings (WP-3B).
- Patch 7: [walker harness] walk-in town executors (WP-3C).
- Patch 8: [specs] collision/door playwright coverage (WP-3D).
- Patch 9: [ui] corral purchase screen component (WP-4A).
- Patch 10: [ui] purchase screen wiring (WP-4B).
- Patch 11: [specs] corral purchase spec (WP-4C).
- Patch 12: [ui] letterboxed 16:10 stage container (WP-5A).
- Patch 13: [ui] landscape auction arena (WP-6A).
- Patch 14: [ui] auction full-canvas CSS (WP-6B).
- Patch 15: [specs/visual] auction spec update + acceptance (WP-6C).
- Patch 16: [css] shared-rule seam split (WP-7A).
- Patches 17-20: [ui] one per panel canvas-fill (WP-7B..WP-7E).
- Patch 21: [visual] phase-panel acceptance report (WP-7F).
- Patch 22: [test debt] shared seek core + tap-constant dedupe (WP-8A).
- Patch 23: [walker harness] wampus/assay executors (WP-8B).
- Patch 24: [tests] executor unit coverage + sweep proof (WP-8C).
- Patch 25: [docs] HUMAN_GUIDANCE entries + final ROADMAP/TODO consistency sweep (WP-D1).
- Patch N: tests, migration, docs -- doc close-out bullets ride each patch.
- Patch numbers are REPORTING LABELS, not acceptance requirements: doers may merge or split
  adjacent patches along natural component seams when each resulting patch keeps its own
  verification evidence; renumber in the status table rather than forcing the planned
  boundaries.
- Reporting: milestone status table maintained in the active plan copy; "Patch N" labels in all
  summaries and changelog entries.

## Open questions and decisions needed

- Resolved (user, 2026-07-10): store fallback = existing store rules (buys low, sells high,
  limited stock) acting through ranked fallthrough; no new step-in mechanism.
- Resolved (user, 2026-07-10): include both test-debt items; exclude release cut; calibrate
  walk speed in-plan starting at 120.
- Resolved (user, 2026-07-10): `OTHER_REPOS/mule_rules.md` and `OTHER_REPOS/mule_document.html`
  are the primary authority for intended auction behavior; planet_mule decompiled source is
  supporting implementation evidence only. Ranked solvent fallthrough is adopted on the strength
  of those rules ("trading continues until the buyer runs out of money"); WP-1A verifies only
  the precise next-eligible-participant traversal, with the bid-major/ask-minor house rule as
  the labeled fallback design.
- Open (WP-1A closes it): the exact traversal order for selecting the next eligible
  buyer/seller when the current one cannot trade; falls back to ranked
  price-then-lowest-playerId as the documented house rule if the sources are silent.
- Open (M6, minor): exact readout split above/below the horizontal track -- WP-6A owner decides
  with /ui-ux-engineer guidance; visual acceptance judges the result.
