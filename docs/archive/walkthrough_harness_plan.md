# Plan: full-game browser walkthrough harness for mule-game

## Context

The user wants proof that the game is playable from beginning to end through the real browser UI,
modeled on the walkthrough system in
`/Users/vosslab/nsh/TYPESCRIPT/virtual-lab-protocol-simulation/docs/specs/WALKTHROUGH_GUIDE.md`.
Today `tests/e2e/e2e_full_game.mjs` completes games only passively (pass land grant, skip every
develop turn, sit out every auction), so the hardest human paths -- realtime avatar walking, mule
buy/outfit/place, auction buy/sell, land-auction bidding, pub gambling -- are never exercised
end to end. A pending follow-up project will shift gameplay rules toward the 1983 original, so the
walker separates strategy from mechanics: the engine's own AI decision functions choose the human
seat's actions, and the walker executes them through real DOM clicks and key presses.

## Objectives

- A walker completes a full seeded game (title screen to scoring panel) playing the human seat
  actively: claims land, bids in land auctions, walks the town, buys/outfits/places M.U.L.E.s,
  buys and sells in goods auctions, and gambles at the pub.
- Every run emits a JSON report (state assertions, failure taxonomy, per-phase log) and
  diagnostic screenshots under `test-results/walker/`. JSON assertions are the gate; screenshots
  are diagnostic artifacts only, never a review gate.
- A single-seed active walkthrough joins `tests/e2e/e2e_run_all.sh`; a multi-seed both-modes sweep is
  its own explicit command and the release gate.
- Positive abstraction rule (testable): every walker choice comes from a strategy plan produced by
  the adapter; every UI execution uses a durable `data-*` selector plus a projection precondition.
  A closed plan-kind vocabulary is enforced by a unit test; an unrecognized plan kind is fatal.

## Design philosophy

Strategy and mechanics are separated: the engine AI (`src/ai/`) decides WHAT the human seat does;
the walker only translates decisions into visible gestures. The rejected alternative -- a scripted
hardcoded policy -- is cheaper today but breaks the moment gameplay rules change, and proves fewer
paths. Rule-tolerance claim, stated narrowly: parameter and formula changes (prices, budgets,
probabilities, yields, timers) require zero walker edits because the AI adapts; phase-order changes
or brand-new action kinds require only adapter mapping updates, never gesture-driver rewrites.
Timing values (speed multiplier, tap length, budgets) are chosen by a runnable calibration
experiment, not guessed. This is "long-term over short-term" and "fix the design, not the
symptom": when the walker cannot express a decision, the fix is a missing affordance, selector, or
projection field, never a walker branch.

## Scope

- Add a read-only frozen plain-data `window.muleGameState` projection installed by the UI driver,
  plus durable `data-action` selectors on walker-critical controls.
- Build `tests/e2e/e2e_walkthrough.mjs` (playwright-core, own static server on a random port),
  a shared helper module, a strategy adapter module, reporting with a failure taxonomy, and
  screenshots.
- Implement gesture drivers for every phase: land grant claim, land auction bid, develop-phase
  town/overworld keyboard walking (corral buy, counter outfit, plot placement, pub gamble),
  goods-auction role/intent/continue with before/after outcome recording.
- Run a scripted, re-runnable timing calibration experiment and record chosen constants.
- Add a sweep runner with evidence-based seed selection, wire the single-seed run into
  `tests/e2e/e2e_run_all.sh`, and write `docs/WALKTHROUGH_GUIDE.md` for this repo.

## Non-goals

- Do not implement the 1983-gameplay rule shift; that is its own follow-up plan. This plan
  succeeds without it because parameter-level rule changes cost the walker nothing (see Design
  philosophy for the narrowed claim).
- Do not replace or delete `e2e_full_game.mjs` (passive baseline stays as a fast regression) or
  `e2e_balance_sim.mjs` (engine-level balance gate).
- Do not add golden-screenshot pixel comparison to the walker; `visual_render.spec.mjs` already
  owns pixel evidence, and duplicating baselines would double re-baselining cost.
- Do not add a headed mode, fixed ports, or per-seed walker branches.
- Do not drive the wampus hunt or mule-escape recovery as required paths; they are probabilistic
  per seed. The adapter maps them as known-optional plan kinds executed opportunistically when
  present; the existing `wampus_hunt.spec.mjs` / `mule_escape.spec.mjs` keep deterministic
  coverage.

## Current state summary

- Phases: `title, land_grant, land_auction, develop, production, auction, scoring`
  (`src/engine/game_state.ts:451-458`); cycle documented at `src/engine/turn.ts:5-13`; 6/12 rounds
  by mode (`src/engine/constants.ts:39-42`).
- Human is always player 0 (`src/ui/game_driver.ts:37`). AI seats 1-3 act on the single rAF tick
  loop (`src/ui/scenes/scene_manager.ts:331-396`) -- the walker just waits during their turns.
- No `window.gameState` exists; only `window.__tickOwnership`. UI state lives in one SolidJS store
  over immutable `GameState` snapshots (`src/ui/game_store.ts:50-67`), exposed via
  `currentGameStore()` (`src/ui/game_driver.ts:80-100`). SolidJS store proxies do not guarantee
  deep-freeze semantics, so the projection must serialize to frozen plain data rather than expose
  the store object.
- Determinism hooks already exist: `?seed=`, `?speed=`, `?mode=`, `?timer=relaxed`
  (`src/ui/main.tsx:79-186`).
- Develop phase is realtime-keyboard only (no click-to-buy): held-arrow walking plus an action key
  (`src/ui/solid/town_scene.tsx:301-421`, `overworld_scene.tsx:331-405`). Proven bounded-tap
  walking helpers exist in `tests/playwright/town_scene.spec.mjs:137-149` and
  `pub_gamble.spec.mjs:97-158` but are spec-local, not shared.
- Several walker-critical controls currently use class/ID selectors that are incidental styling,
  not contract (`#land-grant-pass-button`, `#land-bid-button`, `.auction-screen-role-button`,
  `.auction-screen-intent-up/-down`, `.auction-screen-continue-button`,
  `.develop-end-turn-button`); rich `data-*` contract exists for avatars, doors, plots, HUD.
- `tests/e2e/e2e_full_game.mjs` is the launch template: builds `dist/`, serves on `listen(0)`
  random port, playwright-core, polls `.scoring-panel`. The naming-convention test mandates
  playwright-core (not `@playwright/test`) for browser `.mjs` under `tests/e2e/`.
- Engine and AI modules already import cleanly in Node (`e2e_balance_sim.mjs` imports
  `decideLandGrantAction`, `decideDevelopAction`, `decideAuctionActions`, `applyAction`).

## Architecture boundaries and ownership

- `src/ui/walker_debug.ts` (new) owns the projection. `window.muleGameState()` returns a
  `structuredClone`d, deep-frozen plain-data snapshot: the full `GameState` (the strategy adapter
  needs exactly what the AI decide functions take) plus convenience fields
  `{phaseKind, activePlayerId, humanMoney, sweepRow, sweepCol}`. Coupling contract: the walker
  ORCHESTRATOR may read only the convenience fields; everything else flows through the strategy
  adapter, which imports engine types anyway. This bounds shape-drift exposure to one module.
- WP-P1 also adds durable `data-action="..."` attributes to the six walker-critical controls
  listed above (additive; existing classes/IDs and specs untouched). These are the only src
  changes in the plan.
- `tests/e2e/walkthrough_helpers.mjs` (new) owns gesture mechanics: selector resolution
  (`data-action` / `data-*` only), bounded-tap walking, act-and-wait-for-progress, screenshots,
  report writer with failure taxonomy.
- `tests/e2e/walkthrough_strategy.mjs` (new) owns the seat-0 strategy adapter: projected state in,
  engine-AI decision out, closed-vocabulary gesture plan out. It imports `src/ai/*` and
  `src/engine/*` read-only.
- `tests/e2e/e2e_walkthrough.mjs` (new) owns orchestration: server, browser, phase loop, budgets,
  exit code. `tests/e2e/e2e_walkthrough_sweep.mjs` (new) owns the seed/mode matrix.
  `tests/e2e/e2e_walk_calibration.mjs` (new) owns the re-runnable timing matrix.
- Shared-file rule: only WP-P1 touches `src/`; only WP-D4 touches `e2e_run_all.sh` and docs indexes,
  so parallel lanes never collide on a file.

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream | Component | Expected patches |
| --- | --- | --- |
| M1 / WS-projection | `src/ui/walker_debug.ts` + unit test (WP-P1); `data-action` attrs (WP-P2) | 2 |
| M2 / WS-harness | launch bootstrap (WP-H1); report/taxonomy/screenshots (WP-H2); passive loop + baseline audit (WP-H3) | 3 |
| M3 / WS-strategy | marshalling round-trip (WP-A1); decision wrappers + `PLAN_KINDS` (WP-A2) | 2 |
| M4 / WS-economy | land drivers (WP-E1); goods-auction driver (WP-E2); invariants (WP-E3) | 3 |
| M5 / WS-spatial | `e2e_walk_calibration.mjs` + constants (WP-S1) | 1 |
| M6 / WS-spatial | walkTo helper (WP-S2); town commerce (WP-S3); overworld placement (WP-S4) | 3 |
| M7 / WS-gate | sweep runner (WP-G1); run_all wiring (WP-G2) | 2 |
| M8 / WS-gate | `docs/WALKTHROUGH_GUIDE.md` + pointers (WP-G3) | 1 |

## Milestone plan

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| M1 | Projection + selectors | Frozen state projection and durable `data-action` selectors | Walker reads engine truth and clicks contract selectors |
| M2 | Walker skeleton | Passive-completing harness with report, taxonomy, screenshots | Evidence pipeline proven before active play |
| M3 | Strategy adapter | Seat-0 decisions from engine AI as closed-vocabulary plans | Decisions available to all drivers |
| M4 | Economy play | Land claim/bid and goods buy/sell driven by adapter plans | Human seat actively trades end to end |
| M5 | Walk calibration | Runnable timing matrix picks speed/tap/budget constants | Spatial constants measured, not guessed |
| M6 | Spatial play | Keyboard town/overworld walking: buy, outfit, place, gamble | Hardest realtime UI proven playable |
| M7 | Sweep gate | Evidence-based seed/mode sweep + run_all wiring | One-command automated playability gate |
| M8 | Guide doc | Repo walkthrough guide + doc pointers | Durable operating manual |

### Milestone: M1 projection and selectors

- Depends on: none
- Workstreams: WS-projection
- Entry criteria: none
- Exit criteria: `window.muleGameState()` returns a deep-frozen plain-data clone (mutation throws
  in strict mode; store unaffected) with the convenience fields; six walker-critical controls
  carry `data-action` attributes; node unit test asserts frozenness and field presence;
  `./check_codebase.sh` and `./run_playwright_tests.sh` pass (existing specs use old selectors,
  additive change must not break them); `docs/CHANGELOG.md` entry written.
- Parallel-plan ready: no -- one package; M2 and M3 both branch from it.

### Milestone: M2 walker skeleton

- Depends on: M1 (projection shape and selectors). Runs concurrently with M3.
- Workstreams: WS-harness
- Entry criteria: M1 merged
- Exit criteria: `node tests/e2e/e2e_walkthrough.mjs --seed 3 --mode beginner` completes a game
  using passive fallbacks, writes `test-results/walker/playthrough_report.json` with the failure
  taxonomy fields and per-phase log, saves per-phase-transition screenshots, and exits nonzero on
  any fatal condition; error policy implemented: `console.error` and `pageerror` fatal,
  `console.warn` recorded nonfatal; same-origin failed requests fatal except favicon; any benign
  error surfaced by the baseline run is fixed at its source in this milestone, not allowlisted;
  `localStorage.clear()` + reload precede every run; `./check_codebase.sh` passes; changelog
  entry written.
- Parallel-plan ready: yes -- concurrent with M3 (no shared files).

### Milestone: M3 strategy adapter

- Depends on: M1 (projection shape). Runs concurrently with M2.
- Workstreams: WS-strategy
- Entry criteria: M1 merged
- Exit criteria: adapter module lands with closed `PLAN_KINDS` vocabulary and its unit test
  covering land-grant, develop, and auction phase states generated by driving the engine reducer
  in-test; projection JSON round-trips losslessly into engine types (deep-equality test);
  `./check_codebase.sh` passes; changelog entry written.
- Parallel-plan ready: yes -- concurrent with M2 (no shared files).

### Milestone: M4 economy play

- Depends on: M2 (harness), M3 (adapter)
- Workstreams: WS-economy
- Entry criteria: M2 and M3 merged
- Exit criteria: land grant claims execute at the adapter-chosen plot only when the sweep cursor
  matches (guarded precondition); land-auction bids execute while the adapter says bid and price
  is below its ceiling; goods auctions record per-good `{role, aiTargetPrice, priceBefore,
  priceAfter, humanGoodsDelta, humanMoneyDelta}` in the report; report summary asserts the
  active-participation invariants (see Acceptance criteria and gates); unknown plan kinds abort
  the run with `unknown_plan_kind`; `./check_codebase.sh` passes; changelog entry written.
- Parallel-plan ready: yes -- runs concurrently with M5 and M6 (economy and spatial drivers touch
  different helper sections and different orchestrator branches; merge order irrelevant).

### Milestone: M5 walk calibration

- Depends on: M2 (harness). Independent of M3 and M4.
- Workstreams: WS-spatial
- Entry criteria: M2 merged
- Exit criteria: `node tests/e2e/e2e_walk_calibration.mjs` runs the timing matrix (at most 5
  configurations, 2 success metrics), writes `test-results/walker/calibration.json`, and a rerun
  reproduces the recorded winning row within noise; chosen constants land in the helpers
  constants block with a comment naming the winning row; `./check_codebase.sh` passes; changelog
  entry names chosen constants and rejected rows.
- Parallel-plan ready: yes -- concurrent with M4 (different files).

### Milestone: M6 spatial play

- Depends on: M3 (develop plan shape), M5 (constants)
- Workstreams: WS-spatial
- Entry criteria: M3 and M5 merged
- Exit criteria: during human develop turns the walker enters town, buys at the corral (verified
  via `data-carrying`), outfits at the adapter-decided counter, exits town, walks to the
  adapter-decided plot, places (verified via projection mule count + plot outfit), and on at
  least one turn per run visits the pub and completes a gamble (verified via `[data-pub-banner]`
  and money delta); near tick-budget exhaustion the walker ends the turn via the end-turn control
  and records `develop_plan_truncated`; `./check_codebase.sh` passes; changelog entry written.
- Parallel-plan ready: yes -- concurrent with M4 (different helper sections and orchestrator
  branches).

### Milestone: M7 sweep gate

- Depends on: M4, M6
- Workstreams: WS-gate
- Entry criteria: M4 and M6 merged
- Exit criteria: sweep runner executes the seed/mode matrix sequentially, writes
  `sweep_summary.json` with per-run taxonomy counts, prints worst-first, exits nonzero on any
  failure; seed selection is evidence-based: across the matrix at least one land auction entered,
  one human buy, one human sell, one pub gamble, and one verified placement -- if the starting
  seeds {1, 3, 7} x {beginner, standard} miss any, scan forward through seeds per the documented
  procedure and record the chosen set with its coverage table; `e2e_run_all.sh` gains the single-seed
  active walkthrough (routine path) while the full sweep stays an explicit command (release
  gate); full sweep green; `./run_playwright_tests.sh` green; changelog entry written.
- Parallel-plan ready: yes -- WP-G1 then WP-G2 inside the lane; M8 follows.

### Milestone: M8 guide doc

- Depends on: M7 (the guide quotes the final calibration and sweep coverage tables; landing
  after M7 writes them once with no backfill churn)
- Workstreams: WS-gate
- Entry criteria: M7 merged
- Exit criteria: `docs/WALKTHROUGH_GUIDE.md` written (purpose, layers table, run commands, output
  files, budgets, failure taxonomy, edge-case triage table, calibration table with regenerate
  command, sweep coverage table); `docs/USAGE.md` and `docs/E2E_TESTS.md` gain pointers;
  `pytest tests/test_markdown_links.py` green; changelog entry written.
- Parallel-plan ready: no -- single closing package, serial after M7 by decision (write the
  tables once).

## Workstream breakdown

### Workstream: WS-projection

- Owner: coder
- Needs: nothing
- Provides: frozen projection + durable `data-action` selectors for all later lanes
- Expected patches: 2 (WP-P1, WP-P2, dispatchable in parallel)

### Workstream: WS-harness

- Owner: coder
- Needs: WS-projection
- Provides: orchestrator + helpers + report/screenshot pipeline with passive fallbacks and the
  failure taxonomy
- Expected patches: 3 (WP-H1 and WP-H2 in parallel, then WP-H3)

### Workstream: WS-strategy

- Owner: expert_coder
- Needs: WS-projection (state shape); file-disjoint from WS-harness
- Provides: seat-0 decision adapter over `src/ai/` decide functions, serialized-state marshalling,
  closed plan-kind vocabulary with mapping table
- Expected patches: 2 (WP-A1 then WP-A2)

### Workstream: WS-economy

- Owner: coder
- Needs: WS-harness, WS-strategy
- Provides: land-grant claim, land-auction bid, goods-auction role/intent gesture drivers with
  outcome recording and invariant wiring
- Expected patches: 3 (WP-E1 and WP-E2 in parallel, then WP-E3)

### Workstream: WS-spatial

- Owner: expert_coder
- Needs: WS-harness, WS-strategy; calibration constants from its own WP-S1
- Provides: calibration script + shared bounded-tap walking helper (generalized from
  `town_scene.spec.mjs` / `pub_gamble.spec.mjs` patterns), door/cell pathing,
  corral/counter/pub/place drivers
- Expected patches: 4 (WP-S1, then WP-S2, then WP-S3 and WP-S4 in parallel)

### Workstream: WS-gate

- Owner: coder
- Needs: everything merged
- Provides: sweep runner with coverage-based seed selection, run_all wiring, walkthrough guide
  doc, doc pointers
- Expected patches: 3 (WP-G1 then WP-G2; WP-G3 in parallel with both)

## Work packages

### Work package: WP-P1 state projection module (M1)

- Owner: coder
- Touch points: `src/ui/walker_debug.ts` (new), `src/ui/game_driver.ts` (install call),
  `tests/test_walker_debug.mjs` (new)
- Depends on: none
- Acceptance criteria: `window.muleGameState()` returns `structuredClone`d, recursively
  `Object.freeze`d plain data `{state, phaseKind, activePlayerId, humanMoney, sweepRow, sweepCol}`;
  unit test proves mutation throws in strict mode and a second call reflects post-dispatch state;
  module doc comment states the orchestrator/adapter coupling contract.
- Verification commands: `./check_codebase.sh`
- Obvious follow-ons: changelog entry; confirm `tick_ownership.spec.mjs` still passes.

### Work package: WP-P2 durable selector contract (M1)

- Owner: coder
- Touch points: `land_grant_panel.tsx`, `land_auction_panel.tsx`, `auction_screen.tsx`,
  `game_screen.tsx`, `town_scene.tsx` (additive `data-action` attributes only)
- Depends on: none (parallel with WP-P1)
- Acceptance criteria: seven `data-action` values live: `land-grant-pass`, `land-bid`,
  `auction-role`, `auction-intent-up`, `auction-intent-down`, `auction-continue`,
  `develop-end-turn`; each of the three role buttons additionally carries
  `data-role="buy" | "sell" | "sit_out"` so the driver selects roles by durable value, never by
  index; existing classes, IDs, and specs keep working unchanged.
- Verification commands: `./check_codebase.sh`; `./run_playwright_tests.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-H1 launch bootstrap (M2)

- Owner: coder
- Touch points: `tests/e2e/e2e_walkthrough.mjs` (new), `tests/e2e/walkthrough_helpers.mjs`
  (new, startup section)
- Depends on: WP-P1
- Acceptance criteria: CLI flags `--seed --mode --speed --screenshots`; startup contract =
  build-if-missing dist, random port, goto `?seed&mode&speed`, wait for `window.muleGameState`,
  `localStorage.clear()`, reload, click new-game, save `initial_state.png`; clean shutdown of
  server and browser on both success and failure paths; a `--bootstrap-only` flag exits zero
  once the first land-grant phase is reached, so this package has a green verification of its
  own while full-game completion remains WP-H3's gate.
- Verification commands: `node --import tsx tests/e2e/e2e_walkthrough.mjs --seed 3 --mode
  beginner --bootstrap-only` exits zero; `./check_codebase.sh`
- Obvious follow-ons: changelog entry; confirm `test-results/` is gitignored.

### Work package: WP-H2 report + taxonomy + screenshots (M2)

- Owner: coder
- Touch points: `tests/e2e/walkthrough_helpers.mjs` (evidence section)
- Depends on: none within M2 (parallel with WP-H1; pure module, exercised by WP-H3)
- Acceptance criteria: report writer produces `playthrough_report.json` with timestamped
  severity-tagged log entries, per-phase timings, `failureKind` drawn from the closed taxonomy
  {`phase_timeout`, `act_did_not_advance`, `walk_stall`, `decision_gesture_mismatch`,
  `unknown_plan_kind`, `console_error`, `page_error`, `network_error`, `run_stalled`}, and
  summary counters {`humanTurnsCompleted`, `plansAttempted`, `plansCompleted`,
  `verifiedPlacements`, `trades`, `gambles`, `truncatedTurns`}; counter definitions are pinned
  to the phase model: `humanTurnsCompleted` counts completed human develop turns (one per round;
  at scoring it equals `state.round` reached, which also handles early colony-failure scoring);
  screenshot helper writes phase-transition PNGs; error collectors implement the policy
  (`console.error`/`pageerror`/same-origin request failures fatal, `console.warn` recorded
  nonfatal); noise policy: app-origin noise is fixed at source; provably external browser-origin
  noise (favicon being the known case) goes in a narrowly-matched `EXPECTED_NOISE` list, each
  entry carrying a justification comment.
- Verification commands: `node --import tsx --test tests/test_walkthrough_report.mjs` (new small
  unit test for writer shape); `./check_codebase.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-H3 passive phase loop + baseline audit (M2)

- Owner: coder
- Touch points: `tests/e2e/e2e_walkthrough.mjs` (phase loop)
- Depends on: WP-H1, WP-H2
- Acceptance criteria: phase loop with per-phase and whole-run budgets completes a beginner game
  via passive fallbacks (pass land grant, end develop turn, sit out auctions) and exits zero
  with a full report and screenshots; a baseline audit run confirms zero console/network noise --
  any noise found is fixed at its source inside this package; helpers stay phase-agnostic and
  seed-agnostic.
- Verification commands: `node --import tsx tests/e2e/e2e_walkthrough.mjs --seed 3 --mode
  beginner`; `./check_codebase.sh`
- Obvious follow-ons: changelog entry; record baseline findings in the report log.

### Work package: WP-A1 state marshalling round-trip (M3)

- Owner: expert_coder
- Touch points: `tests/e2e/walkthrough_strategy.mjs` (new, marshalling section),
  `tests/test_walkthrough_strategy.mjs` (new)
- Depends on: WP-P1 (state shape)
- Acceptance criteria: `walker_debug.ts` exports its projection-builder function so the test
  consumes the exact serialization the browser installs (one code path, no parallel test-only
  shape); projection JSON round-trips losslessly into engine types; test drives the engine
  reducer in-test to a mid-game state, serializes through the exported builder, and asserts
  deep-equality after applying one reducer step to both copies; the test also calls every
  imported `src/ai/` decide function on the projected copy and asserts it returns without error,
  proving `structuredClone` plain data is sufficient input for the whole AI surface.
- Verification commands: `node --import tsx --test tests/test_walkthrough_strategy.mjs`;
  `./check_codebase.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-A2 decision wrappers + plan vocabulary (M3)

- Owner: expert_coder
- Touch points: `tests/e2e/walkthrough_strategy.mjs` (adapter section),
  `tests/test_walkthrough_strategy.mjs` (extend)
- Depends on: WP-A1
- Acceptance criteria: `decideLandGrant(state)`, `decideLandAuction(state)`,
  `decideDevelopPlan(state)`, `decideAuctionIntent(state)` wrap the `src/ai/` decide functions
  for player 0 and return plans from the closed exported `PLAN_KINDS` vocabulary (e.g.
  `{kind:"place_mule", row, col}`); `hunt_wampus` and `assay` are marked opportunistic; tests
  reach real land-grant, develop, and auction states by driving the engine reducer in-test and
  assert each adapter returns a valid in-vocabulary plan; decision-to-gesture mapping table in
  the module doc comment.
- Verification commands: `node --import tsx --test tests/test_walkthrough_strategy.mjs`;
  `./check_codebase.sh`
- Obvious follow-ons: changelog entry; export `PLAN_KINDS` for the orchestrator's fatal
  unknown-kind check; record in the module doc comment whether a narrower serialized AI input
  than full `GameState` emerged as sufficient, so the projection can shrink in a follow-up.

### Work package: WP-E1 land grant + land auction drivers (M4)

- Owner: coder
- Touch points: `tests/e2e/walkthrough_helpers.mjs` (land section),
  `tests/e2e/e2e_walkthrough.mjs` (land wiring)
- Depends on: WP-H3, WP-A2
- Acceptance criteria: selectors use `data-action`/`data-*`; land-grant claim fires only when
  the sweep cursor matches the adapter-decided plot (projection precondition re-checked at
  execution time; a mismatch increments `decision_gesture_mismatch` and retries within budget);
  land-auction bid loop respects the adapter ceiling; each act uses act-and-wait-for-progress.
- Verification commands: `node tests/e2e/e2e_walkthrough.mjs --seed 3 --mode beginner` (report
  shows a claim entry); `./check_codebase.sh`
- Obvious follow-ons: changelog entry; log each executed decision with severity `info`.

### Work package: WP-E2 goods auction driver + outcome recording (M4)

- Owner: coder
- Touch points: `tests/e2e/walkthrough_helpers.mjs` (auction section),
  `tests/e2e/e2e_walkthrough.mjs` (auction wiring)
- Depends on: WP-H3, WP-A2 (parallel with WP-E1; disjoint sections)
- Acceptance criteria: role chosen per adapter decision, intent moved toward the adapter target,
  continue clicked when finished; per-good outcome tuple `{role, aiTargetPrice, priceBefore,
  priceAfter, humanGoodsDelta, humanMoneyDelta}` recorded in the report.
- Verification commands: `node tests/e2e/e2e_walkthrough.mjs --seed 3 --mode beginner` (report
  shows outcome tuples for all four goods each round); `./check_codebase.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-E3 invariant wiring (M4)

- Owner: coder
- Touch points: `tests/e2e/e2e_walkthrough.mjs` (end-of-run assertions)
- Depends on: WP-E1, WP-E2
- Acceptance criteria: end-of-run assertions enforce the active-participation invariants
  (`humanTurnsCompleted` equals rounds reached at scoring, `trades >= 1`, scoring reached,
  `failureKind` absent) and unknown plan kinds abort with `unknown_plan_kind`; negative-path
  test included: a unit test feeds a plan with a fabricated kind through the plan executor and
  asserts the run classifies `unknown_plan_kind` and exits nonzero.
- Verification commands: `node tests/e2e/e2e_walkthrough.mjs --seed 3 --mode beginner` exits
  zero with invariants asserted; `node --import tsx --test tests/test_walkthrough_plan_exec.mjs`;
  `./check_codebase.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-S1 timing calibration experiment (M5)

- Owner: expert_coder
- Touch points: `tests/e2e/e2e_walk_calibration.mjs` (new),
  `tests/e2e/walkthrough_helpers.mjs` (constants block)
- Depends on: WP-H3
- Acceptance criteria: runnable script drives a seeded town walk over a matrix of at most 5
  configurations of `speed x WALK_TAP_MS x per-act budget`, with 2 success metrics (door-reach
  success rate over 20 attempts; full develop-turn plan completion within the tick budget),
  prints the table, and writes `test-results/walker/calibration.json`; chosen constants land in
  the helpers constants block with a comment naming the winning row; the measured table goes
  into `docs/WALKTHROUGH_GUIDE.md`'s calibration section at M8 with the regenerate command;
  revert criteria: >5% walk failure across a sweep triggers a rerun.
- Verification commands: `node tests/e2e/e2e_walk_calibration.mjs` reproduces the recorded
  winning row within noise; `./check_codebase.sh`
- Obvious follow-ons: changelog entry naming chosen constants and rejected rows.

### Work package: WP-S2 shared walking helper (M6)

- Owner: expert_coder
- Touch points: `tests/e2e/walkthrough_helpers.mjs` (spatial section)
- Depends on: WP-S1 (constants)
- Acceptance criteria: opens with a selector audit confirming every spatial target the M6
  drivers need already carries durable `data-*` (doors `data-door-for`, buildings
  `data-building`, exits `data-exit`, cells `data-cell-row/col`, avatar `data-actor` /
  `data-at-door` / `data-carrying`, pub `data-pub-banner`); any gap found is closed with an
  additive attribute patch before driver work continues; single generalized
  `walkTo(page, scope, predicate, dir, budget)` bounded-tap helper (pattern generalized from
  `town_scene.spec.mjs` / `pub_gamble.spec.mjs`); town enter/exit drivers verified by
  `#town-scene` visibility and `data-exit` state; stalls classified `walk_stall`; all waits
  state-based.
- Verification commands: targeted run reaching town entry on seed 33 (the proven all-plains
  walk seed from `pub_gamble.spec.mjs`); `./check_codebase.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-S3 town commerce drivers (M6)

- Owner: expert_coder
- Touch points: `tests/e2e/walkthrough_helpers.mjs` (town section),
  `tests/e2e/e2e_walkthrough.mjs` (develop wiring, town half)
- Depends on: WP-S2, WP-A2
- Acceptance criteria: corral buy verified via `data-carrying`; counter outfit at the
  adapter-decided resource verified via projection outfit state; pub visit + gamble confirm on
  at least one turn per run verified via `[data-pub-banner]` and money delta.
- Verification commands: `node tests/e2e/e2e_walkthrough.mjs --seed 3 --mode beginner` (report
  shows buy/outfit/gamble entries); `./check_codebase.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-S4 overworld placement driver (M6)

- Owner: expert_coder
- Touch points: `tests/e2e/walkthrough_helpers.mjs` (overworld section),
  `tests/e2e/e2e_walkthrough.mjs` (develop wiring, overworld half)
- Depends on: WP-S2, WP-A2 (parallel with WP-S3; disjoint sections)
- Acceptance criteria: overworld path to the adapter-decided plot cell via `data-cell-row/col`;
  placement via action key verified through projection mule count + plot outfit
  (`verifiedPlacements` incremented); near tick-budget exhaustion the driver ends the turn via
  `data-action="develop-end-turn"` and records `develop_plan_truncated`.
- Verification commands: `node tests/e2e/e2e_walkthrough.mjs --seed 3 --mode beginner` (report
  shows `verifiedPlacements >= 1`, zero stalls); `./check_codebase.sh`
- Obvious follow-ons: changelog entry; add truncation and stall counters to the report summary.

### Work package: WP-G1 sweep runner (M7)

- Owner: coder
- Touch points: `tests/e2e/e2e_walkthrough_sweep.mjs` (new)
- Depends on: WP-E3, WP-S3, WP-S4
- Acceptance criteria: sweep runs the matrix sequentially, aggregates reports into
  `sweep_summary.json` with taxonomy counts, worst-first table, nonzero exit on any failure;
  coverage check per M7 exit criteria; the seed-replacement procedure is deterministic and
  bounded: scan seeds ascending from 1 through 100, keep the first three per mode whose combined
  coverage satisfies the table, record the chosen set and each seed's coverage in
  `sweep_summary.json`; truncation release rule: a run where more than half of human develop
  turns end `develop_plan_truncated` fails the sweep even when scoring is reached, and
  `verifiedPlacements >= 1` remains required per run. 2026-07-09 refinement (approved): a run
  whose game ended via colony failure (src/engine/turn.ts `checkColonyFailure`) before the
  mode's full round count is exempt from the per-run `verifiedPlacements >= 1` rule, since the
  human never reached a further placement opportunity; the matrix-level coverage check is
  unchanged, and the waiver is recorded in the run's sweep record for auditability.
- Verification commands: `node tests/e2e/e2e_walkthrough_sweep.mjs`; `./check_codebase.sh`
- Obvious follow-ons: changelog entry with sweep numbers.

### Work package: WP-G2 run_all wiring (M7)

- Owner: coder
- Touch points: `tests/e2e/e2e_run_all.sh`
- Depends on: WP-G1
- Acceptance criteria: `e2e_run_all.sh` gains the single-seed walkthrough as the routine path and
  documents the sweep as the explicit release-gate command; pre-existing e2e scripts run
  unchanged.
- Verification commands: `bash tests/e2e/e2e_run_all.sh`; `./run_playwright_tests.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-G3 walkthrough guide doc (M8)

- Owner: coder
- Touch points: `docs/WALKTHROUGH_GUIDE.md` (new), `docs/USAGE.md`, `docs/E2E_TESTS.md`,
  `docs/CHANGELOG.md`
- Depends on: WP-G2 (documents finished behavior and quotes the final calibration and sweep
  coverage tables once, with no backfill churn)
- Acceptance criteria: guide doc complete per M8 exit criteria (purpose, layers table, run
  commands, output files, budgets, failure taxonomy, edge-case triage table, calibration table
  with regenerate command, sweep coverage table); pointers added to `docs/USAGE.md` and
  `docs/E2E_TESTS.md`.
- Verification commands: `pytest tests/test_markdown_links.py`; `./check_codebase.sh`
- Obvious follow-ons: final changelog entry.

## Acceptance criteria and gates

- Per-patch gate: `./check_codebase.sh` (tsc x2, eslint, prettier, node unit tests) green.
- Integration gate: single-seed active walkthrough green after M4 and M6 merge; report invariants
  hold: `humanTurnsCompleted` equals the mode's round count, `plansCompleted >= plansAttempted -
  truncatedTurns`, `verifiedPlacements >= 1`, `trades >= 1`, `gambles >= 1`, scoring panel
  reached, `failureKind` absent.
- Release gate: full sweep green with the coverage table satisfied.
- Manual review gate: none -- all gates are commands. Changelog and plan-archive updates are agent
  tasks inside work packages; the human's own commit review happens outside the plan and blocks
  nothing.

## Test and verification strategy

- Unit lane (`check_codebase.sh`): projection frozenness test; adapter round-trip, AI-surface,
  per-phase plan-validity, and unknown-plan-kind tests with reducer-generated states.
  `check_codebase.sh` runs `node --import tsx --test tests/test_*.mjs` as a glob, so every new
  `tests/test_*.mjs` file joins the gate automatically the moment it lands.
- Walker lane (`tests/e2e/`): single-run walkthrough (routine, in `e2e_run_all.sh`), sweep (release
  gate, explicit command). Progress detection is state-based (projection or `data-*` change);
  the taxonomy classifies every failure; screenshots are diagnostic only.
- Calibration experiment (WP-S1) is the plan's explicit scientific-method step, kept re-runnable
  as a committed script so the recorded table can never silently go stale.
- Regression safety: `tests/playwright/` specs and `e2e_full_game.mjs` remain untouched and must
  stay green (`./run_playwright_tests.sh` at M1 and M7).
- Evidence: `playthrough_report.json`, `calibration.json`, `sweep_summary.json`, screenshots.
  Nonzero exits everywhere, so the whole path runs unattended.

## Migration and compatibility policy

- Additive rollout: new files plus two additive src touches (projection install, `data-action`
  attributes); behavior-neutral for players.
- Backward compatibility: `e2e_full_game.mjs`, `e2e_balance_sim.mjs`, and all `tests/playwright/`
  specs keep passing unmodified.
- Legacy deletion criteria: none in this plan; if the walkthrough later fully subsumes
  `e2e_full_game.mjs`, its removal is a separate one-line decision recorded in the changelog.
- Rollback strategy: revert is per-patch; removing the walker files, the install line, and the
  `data-action` attributes restores the prior state exactly.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| Realtime walking flaky under headless rAF throttling (`MAX_FRAME_MS=100`) | M4 gate red | walk-stall rate >5% in calibration | expert_coder (WP-S1) | runnable calibration matrix; bounded-tap not continuous hold; graceful truncation path |
| Develop tick budget (50 ticks) too short for buy+outfit+walk+place at chosen speed | placements never complete | `develop_plan_truncated` on every turn | expert_coder (WP-S2) | calibration picks speed; plan orders actions nearest-first; truncation reported, run completes |
| Serialized projection drifts from engine types, breaking the adapter | wrong decisions | round-trip unit test fails | expert_coder (WP-A1) | deep-equality round-trip test pinned to reducer-generated states |
| Decision/gesture race: state changes between decide and execute | rejected gestures | `decision_gesture_mismatch` grows | coder (WP-E1) | re-decide each iteration; projection precondition guards every gesture |
| Sweep wall time too long for routine use | gate skipped in practice | sweep >15 min | coder (WP-D4) | routine path = single-seed run in `e2e_run_all.sh`; sweep is the explicit release gate |
| AI decides an action the UI cannot express | walker abort | `unknown_plan_kind` fatal | expert_coder (WP-A1) | closed `PLAN_KINDS` vocabulary + unit test; known-optional kinds mapped opportunistically; fatal-by-default surfaces coverage gaps instead of hiding them |
| Baseline app emits benign console noise, poisoning the fatal-error gate | flaky harness | errors on a clean passive run | coder (WP-H1) | baseline audit inside WP-H1; fix at source, no allowlist growth beyond favicon |

## Rollout and release checklist

- [ ] M1 merged: projection + selectors live, `check_codebase.sh` and `run_playwright_tests.sh` green
- [ ] M2 merged: passive walkthrough green with report, taxonomy, screenshots; baseline
      console/network noise zero
- [ ] M3 merged: adapter unit tests green (round-trip + per-phase plan validity)
- [ ] M4 + M6 merged: active-play single run green with all report invariants
- [ ] M5 merged: calibration script committed and reproducible
- [ ] M7 merged: sweep green with coverage table, `e2e_run_all.sh` wired
- [ ] M8 merged: guide doc linked from `docs/USAGE.md` and `docs/E2E_TESTS.md`
- [ ] `./run_playwright_tests.sh` green (no regression in existing specs)
- [ ] `pytest tests/` green (markdown links, naming conventions)
- [ ] All changelog entries present (agent-written; human commits on their own schedule)

## Documentation close-out requirements

- Active plan / progress tracker: this plan lands as
  `docs/active_plans/active/walkthrough_harness_plan.md` at execution start; the executing agent
  moves it to `docs/archive/` via `git mv` when M7 and M8 close (agent task, not a human gate).
- docs/CHANGELOG.md entry: one bullet per patch, "Patch 1..N" labels, including chosen
  calibration constants and final sweep numbers.
- Archive / closure notes: calibration table lives durably in `docs/WALKTHROUGH_GUIDE.md`; the
  raw experiment output stays reproducible via `e2e_walk_calibration.mjs`.

## Patch plan and reporting format

Seventeen patches across 17 work packages, one patch per package. Parallel dispatch groups
(each group's patches are independent and can move at the same time):

- Group 1: Patch 1 (WP-P1), Patch 2 (WP-P2)
- Group 2: Patch 3 (WP-H1), Patch 4 (WP-H2), Patch 5 (WP-A1)
- Group 3: Patch 6 (WP-A2, requires Patch 5), Patch 7 (WP-H3, requires Patches 3+4)
- Group 4: Patch 8 (WP-E1), Patch 9 (WP-E2), Patch 11 (WP-S1)
- Group 5: Patch 10 (WP-E3, requires Patches 8+9), Patch 12 (WP-S2, requires Patch 11)
- Group 6: Patch 13 (WP-S3), Patch 14 (WP-S4)
- Group 7: Patch 15 (WP-G1)
- Group 8: Patch 16 (WP-G2, requires Patch 15)
- Group 9: Patch 17 (WP-G3, requires Patch 16)

Within a group every listed patch starts together unless it names a `requires` -- those start
the moment their prerequisite merges. Maximum concurrent doers: 3 (Groups 2 and 4). Reports
cite patch labels; changelog bullets map one-to-one to patches.

## Resolved decisions

- Projection is a frozen plain-data clone, never the live store object (SolidJS proxies give no
  deep-freeze guarantee).
- Projection carries the full `GameState` because the adapter needs exactly what the AI decide
  functions take; drift exposure is bounded by the orchestrator/adapter coupling contract.
- Rule-tolerance claim narrowed to parameter/formula changes; structural changes cost adapter
  mapping updates only.
- WP-A1 promoted to its own milestone (M3, parallel with M2) so economy (M4) and spatial
  (M5-M6) lanes are genuinely parallel (the reviewer-flagged dependency
  conflict).
- Unknown plan kinds are fatal everywhere; hiding them behind warnings would mask coverage gaps.
- `console.warn` nonfatal-but-recorded; `console.error`/`pageerror`/same-origin network failures
  fatal; benign baseline noise is fixed at source, not allowlisted (favicon excepted).
- Routine gate = single-seed walkthrough in `e2e_run_all.sh`; release gate = explicit sweep command.
- Screenshots are diagnostic artifacts; JSON assertions are the only gate.
- Seed matrix is evidence-based via the sweep coverage table, with a documented forward-scan
  replacement procedure.
- Walker-critical controls get durable `data-action` selectors instead of relying on styling
  classes/IDs; auction role buttons additionally carry `data-role` values so selection is by
  meaning, never by index.
- M8 runs serially after M7 so the guide writes the calibration and coverage tables exactly
  once (reviewer round 2, doc-churn concern).
- Truncation release rule: >50% truncated human develop turns fails a sweep run even when
  scoring is reached; `verifiedPlacements >= 1` stays required per run.
- 2026-07-09: colony-failure carve-out (approved) -- a run that ended via colony failure before
  the mode's full round count is exempt from the per-run `verifiedPlacements >= 1` rule (the
  matrix-level coverage check is unaffected); early colony-failure games are valuable coverage
  of the early-scoring path and the waiver keeps that seed instead of forcing a replacement.
- Seed replacement is deterministic and bounded: ascending scan 1-100, first satisfying set
  recorded with coverage in `sweep_summary.json`.
- Noise escape hatch: app-origin noise fixed at source; provably external browser-origin noise
  narrowly matched in `EXPECTED_NOISE` with a justification comment per entry.
- `structuredClone` sufficiency for the AI surface is proven by WP-A1's test calling every
  imported decide function on the projected copy, and the projection builder is a single
  exported code path shared by browser install and tests.
- 2026-07-10: second amendment to the active-participation invariant (approved) -- demotes the
  participation-proven branch in `assertActiveInvariants` from a hard per-run throw to a
  `report.log("warn", ...)`, because seed 3 beginner runs flake about 2/3 of the time on that
  branch even though other runs of the same seed pass with trades=1; a held-role participant
  whose AI-desired price already matches the opening tick pushes no intents and may never cross,
  which is legitimate M.U.L.E. real-time-auction participation, not a stuck driver. Per-run
  economic outcomes are not deterministic under wall-clock gesture timing. Trade-occurrence
  proof stays owned at sweep level by `e2e_walkthrough_sweep.mjs`'s `matrixCoverage`
  (humanBuy/humanSell); the `humanTurnsCompleted` branch is unaffected and stays a hard
  invariant. (First amendment was the participation-proven change itself, requiring either a
  pushed intent or a cleared trade instead of a pushed intent alone.)

## Open questions and decisions needed

- None. All scope choices resolved with the user (full active play, engine-AI strategy,
  `tests/e2e/` + playwright-core) or as manager decisions recorded above. The 1983-gameplay
  shift is explicitly out of scope and will get its own plan.
