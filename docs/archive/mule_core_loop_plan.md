# Plan: M.U.L.E. core-loop remake in TypeScript

## Context

Repo `mule-game` was reset to the base TypeScript template (REPO_TYPE=typescript, no `src/` yet). Goal: reimplement M.U.L.E. (classic economic strategy game; `mule.nes` at repo root is reference only) as a browser game built per `docs/TYPESCRIPT_STYLE.md`, deployed via `build_github_pages.sh` to GitHub Pages. The ROM is not decompiled or asset-mined: game rules come from published fan documentation of M.U.L.E. mechanics, and art is original SVG.

Rule source of truth: before WS-1C starts, WP-1C1's first step is a short research pass that fixes the canonical constants from published M.U.L.E. references (the Atari 8-bit manual's beginner game description, the World of M.U.L.E. wiki's production/price tables, and Bunten's documented formulas as relayed in fan disassembly write-ups). The chosen values land in one exported `src/engine/constants.ts` table with a source comment per constant; where sources conflict, prefer the Atari 8-bit beginner game and record the conflict in the constant's comment. `constants.ts` is the single rule authority for engine, AI, and docs.

User decisions (2026-07-08): original art as simple SVG graphics, visually similar to the original game's look (no ROM extraction); 1 human + 3 AI opponents; v1 scope is the core loop only (beginner-style 6-round game: land grant, development, production, auction) with events/crystite/wampus/gambling excluded from v1.

## Objectives

- A playable single-player M.U.L.E. core loop in the browser: 6 rounds, 1 human + 3 AI, food/energy/smithore economy, land auctions, M.U.L.E. placement, production, and the signature real-time resource auction.
- All game logic lives in pure TypeScript modules (no DOM imports) so it is unit-testable via `node --import tsx --test`.
- `./check_codebase.sh` passes (tsc strict, ESLint max-warnings 0, Prettier, node unit tests) and `./build_github_pages.sh` produces a working `dist/`.
- End-of-game scoring and winner declaration reproducing M.U.L.E.'s rank formula (money + goods value + land value).

## Design philosophy

Engine/UI split is the load-bearing trade-off: game state, economy math, and turn sequencing are pure modules under `src/engine/`, with a thin canvas/DOM layer under `src/ui/` reading state and dispatching actions. The rejected alternative - building logic directly into UI handlers, faster for a first screen - was rejected because M.U.L.E.'s economy (production formulas, auction price dynamics, AI valuation) is exactly the code that needs deterministic seeded unit tests ("fix the design, not the symptom"). Real-time elements (development-phase timer, auction movement) are modeled as engine ticks driven by the UI clock, keeping the engine headless-simulatable.

## Scope

- Build seeded deterministic engine: map generation (5x9 grid, river column, mountains), player state, 6-round turn sequencer.
- Implement land grant phase (one free plot per player per round, simplified from lottery to snake-order pick for v1).
- Implement development phase: store (buy M.U.L.E., outfit food/energy/smithore), place M.U.L.E. on owned plot, per-turn time budget.
- Implement production phase: canonical M.U.L.E. production formulas (terrain-based yields, energy shortage penalties, food spoilage, energy decay).
- Implement resource auction phase: real-time price-convergence auction (buyers move up, sellers move down, transfer while price bands overlap), store as participant with buy/sell prices.
- Implement 3 AI opponents: land valuation, outfit choice (fill scarcest resource), auction target-price strategy.
- Build SVG UI: map view, HUD (money, goods per player), store screen, placement flow, auction screen with keyboard + touch controls; simple flat SVG sprites visually similar to the original game (M.U.L.E. walker silhouette, terrain tiles, player figures).
- Implement scoring screen and winner declaration after round 6.
- Ship node unit tests for engine modules and at least one Playwright smoke walkthrough.
- Update `docs/CHANGELOG.md`, `README.md` first paragraph, and add `docs/CODE_ARCHITECTURE.md`.

## Non-goals

- Implement crystite, random events, wampus hunting, pub gambling, or collusion rules (future plan).
- Support multiple human players (hotseat/network).
- Extract or ship any ROM-derived assets, sprites, or sound.
- Reproduce NES timing, difficulty variants (nomad species, ship day counts), or 12-round tournament mode.
- Add sound/music in v1.

## Current state summary

Template-only repo: `package.json` (type: module, tsc/esbuild/eslint/prettier/playwright pinned), strict `tsconfig.json`, shell front doors (`check_codebase.sh`, `build_github_pages.sh`, `run_web_server.sh`, `run_playwright_tests.sh`), pytest hygiene suite in `tests/`, `tests/playwright/repo_root.mjs` helper. No `src/`. Empty `docs/CHANGELOG.md` and `README.md`. Known gotcha: `tsc -p tsconfig.lint.json` fails TS18003 if `tests/`/`tools/` contain no `.ts` files - first patch must verify and seed a stub or adjust include if needed.

## Architecture boundaries and ownership

- `src/engine/` - pure TS, no DOM types. Modules: `rng.ts` (seeded PRNG), `map.ts`, `player.ts`, `economy.ts` (production/spoilage), `store.ts` (prices, inventory), `auction.ts` (tick-based price convergence), `land_grant.ts`, `turn.ts` (phase sequencer), `scoring.ts`, `game_state.ts` (single state type + action reducers).
- `src/ai/` - pure TS on top of engine state: `land_ai.ts`, `develop_ai.ts`, `auction_ai.ts`.
- `src/ui/` - DOM/SVG only: `main.ts` entry, `map_render.ts` (inline SVG map), `sprites.ts` (SVG symbol defs: M.U.L.E., player figures, terrain, resource icons - simple flat shapes echoing the original's silhouettes), `hud.ts`, `store_screen.ts`, `auction_screen.ts`, `input.ts` (keyboard + touch), `screen_router.ts`. Rendering is inline SVG (`<svg>` DOM elements, `<use>` referencing symbol defs), not canvas - crisp scaling, CSS-stylable, easy Playwright assertions.
- `src/index.html`, `src/style.css` - template-required host files.
- `tests/test_*.mjs` - node unit tests for engine/ai; `tests/playwright/` - browser smoke spec.
- `src/engine/constants.ts` - single rule authority: round structure, starting money/inventory, yield tables, store prices and stock, land value, spoilage/decay rates, tick budgets, auction tunables. Engine, AI, UI, and docs all read from here.
- Boundary pattern: engine and AI modules are pure TypeScript operating on `GameState` values; only `src/ui/` touches the DOM. Enforced in review and by the headless full-game test importing engine+AI under node.

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream | Component | Expected patches |
| --- | --- | --- |
| M1 / WS-1A scaffold | src/index.html, style.css, main.ts, screen_router.ts | 1 |
| M1 / WS-1B state core | src/engine/{rng,map,player,game_state}.ts | 1-2 |
| M1 / WS-1C economy | src/engine/{economy,store,scoring}.ts | 1-2 |
| M2 / WS-2A phases | src/engine/{turn,land_grant,auction}.ts | 2 |
| M2 / WS-2B AI | src/ai/*.ts | 1-2 |
| M2 / WS-2C engine tests | tests/test_*.mjs | 1-2 |
| M3 / WS-3A map+HUD UI | src/ui/{map_render,hud}.ts | 1-2 |
| M3 / WS-3B screens | src/ui/{store_screen,auction_screen,input}.ts | 2 |
| M4 / WS-4A integration | src/ui/main.ts wiring, full game flow | 1 |
| M4 / WS-4B QA+docs | tests/playwright/, docs/, README | 1-2 |

## Milestone plan

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| M1 | Engine foundation | Repo scaffold plus headless game state, map, and economy math | Deterministic engine core exists and is unit-tested |
| M2 | Phases and AI | Turn sequencer, land grant, auction engine, AI opponents | Full 6-round game simulatable headless, AI vs AI |
| M3 | UI layer | SVG map + sprites, HUD, store, placement, auction screens | Human can see and drive every phase |
| M4 | Integration and release | Wire flow end-to-end, Playwright smoke, docs, Pages build | Playable deployed game, all gates green |

### Milestone: M1 engine foundation

- Depends on: none
- Workstreams: WS-1A, WS-1B, WS-1C
- Entry criteria: plan approved.
- Exit criteria: `./check_codebase.sh` passes; `npx tsc --noEmit` clean; seeded map generation and production math covered by `tests/test_*.mjs`; TS18003 lint-config gotcha resolved; `docs/CHANGELOG.md` day block added. Obvious follow-ons: fix any lint/format failures immediately, add missing type exports consumers need.
- Parallel-plan ready: yes (WS-1A, WS-1B, WS-1C independent; WS-1C consumes only type signatures from WS-1B, defined up front in WP-1B1).

### Milestone: M2 phases and AI

- Depends on: D-M1 (engine types and economy must exist).
- Workstreams: WS-2A, WS-2B, WS-2C
- Entry criteria: M1 exit criteria met.
- Exit criteria: headless script simulates a full 6-round 4-AI game to a scored winner with a fixed seed; auction conserves money+goods (property test); tests green. Obvious follow-ons: tune any AI that softlocks the sequencer, changelog entry.
- Parallel-plan ready: yes (WS-2A and WS-2B share only engine state types; WS-2C tests each module as it lands).

### Milestone: M3 UI layer

- Depends on: D-M2 (phase state machines drive the screens).
- Workstreams: WS-3A, WS-3B
- Entry criteria: M2 exit criteria met.
- Exit criteria: each screen renders from a hand-built state fixture via `run_web_server.sh`; keyboard and touch inputs dispatch engine actions; big touch targets per `docs/FUN_VIBES_DESIGN_STYLE.md` layer 1; automated fixture-render readability assertions pass (see WP-3A1) - no human gate blocks milestone close; changelog entry. Obvious follow-ons: contrast fixes per `docs/COLOR_CONTRAST_ACCESSIBILITY.md`.
- Parallel-plan ready: yes (map/HUD vs interactive screens are separate canvases/DOM regions).

### Milestone: M4 integration and release

- Depends on: D-M3.
- Workstreams: WS-4A, WS-4B
- Entry criteria: M3 exit criteria met.
- Exit criteria: full game playable start-to-scoring in browser; `./run_playwright_tests.sh` smoke passes; `./build_github_pages.sh` emits dist/ with `.nojekyll`; README first paragraph written (<250 chars, pure prose); `docs/CODE_ARCHITECTURE.md` added; changelog entry. Obvious follow-ons: human moves `deploy-pages.yml` into `.github/workflows/` (human-owned), human commits.
- Parallel-plan ready: yes (integration wiring vs QA/docs).

## Workstream breakdown

### Workstream: WS-1A scaffold

- Owner: coder
- Needs: nothing
- Provides: `src/index.html`, `src/style.css`, `src/ui/main.ts` stub, `screen_router.ts`, lint-config TS18003 fix
- Expected patches: 1

### Workstream: WS-1B state core

- Owner: expert_coder (state type design is load-bearing)
- Needs: nothing
- Provides: `GameState` type, seeded `rng.ts`, `map.ts` terrain generation, `player.ts`, action-reducer pattern in `game_state.ts`
- Expected patches: 1-2

### Workstream: WS-1C economy

- Owner: coder
- Needs: type signatures from WP-1B1 (published first)
- Provides: `economy.ts` (yield tables, energy shortfall, spoilage), `store.ts` (prices, M.U.L.E. stock), `scoring.ts`
- Expected patches: 1-2

### Workstream: WS-2A phase engines

- Owner: expert_coder (auction tick model is the hardest design)
- Needs: M1 engine
- Provides: `turn.ts` sequencer, `land_grant.ts`, tick-based `auction.ts`
- Expected patches: 2

### Workstream: WS-2B AI

- Owner: coder
- Needs: M1 engine types; auction interface from WP-2A2
- Provides: `land_ai.ts`, `develop_ai.ts`, `auction_ai.ts`
- Expected patches: 1-2

### Workstream: WS-2C engine tests

- Owner: tester-style coder
- Needs: modules as they land
- Provides: `tests/test_economy.mjs`, `tests/test_auction.mjs`, `tests/test_map.mjs`, headless full-game simulation test
- Expected patches: 1-2

### Workstream: WS-3A map and HUD

- Owner: coder
- Needs: `GameState`
- Provides: `sprites.ts` SVG symbol library, `map_render.ts` (SVG terrain grid, ownership borders, M.U.L.E. icons), `hud.ts`
- Expected patches: 1-2

### Workstream: WS-3B interactive screens

- Owner: coder
- Needs: phase engines
- Provides: `store_screen.ts`, `auction_screen.ts` (vertical price movement UI), placement flow, `input.ts`
- Expected patches: 2

### Workstream: WS-4A integration

- Owner: expert_coder
- Needs: all M3
- Provides: full wiring in `main.ts`, phase transitions, new-game/scoring screens
- Expected patches: 1

### Workstream: WS-4B QA and docs

- Owner: coder
- Needs: WS-4A playable build
- Provides: Playwright smoke spec, `docs/CODE_ARCHITECTURE.md`, README first paragraph, changelog
- Expected patches: 1-2

## Work packages

### Work package: WP-1A1 scaffold and host files

- Owner: coder
- Touch points: `src/index.html`, `src/style.css`, `src/ui/main.ts`, `src/ui/screen_router.ts`, possibly `tsconfig.lint.json`
- Depends on: none
- Acceptance criteria: `./run_web_server.sh` serves a page titled "M.U.L.E."; `./check_codebase.sh` passes including the TS18003 gotcha.
- Verification commands: `./check_codebase.sh`; `./build_github_pages.sh`
- Obvious follow-ons: changelog entry; fix Prettier drift.

### Work package: WP-1B1 game state types and RNG

- Owner: expert_coder
- Touch points: `src/engine/game_state.ts`, `src/engine/rng.ts`, `src/engine/player.ts`
- Depends on: none
- Acceptance criteria: exported `GameState`, `Player`, `Plot`, `Resource` types; mulberry32-style seeded PRNG with same-seed-same-sequence test hook; reducer signature `applyAction(state, action) -> state` documented in module docblock.
- Verification commands: `npx tsc --noEmit`
- Obvious follow-ons: publish types so WS-1C starts; changelog entry.

### Work package: WP-1B2 map generation

- Owner: coder
- Touch points: `src/engine/map.ts`
- Depends on: WP-1B1 (types)
- Acceptance criteria: seeded 5x9 grid with center river column, town center plot, mountain plots; terrain enum drives yield lookups.
- Verification commands: `node --import tsx --test tests/test_map.mjs` (test lands in WP-2C1; self-check via temporary assertion script until then)
- Obvious follow-ons: changelog entry.

### Work package: WP-1C1 economy and store

- Owner: coder
- Touch points: `src/engine/constants.ts`, `src/engine/economy.ts`, `src/engine/store.ts`, `src/engine/scoring.ts`
- Depends on: WP-1B1 (types)
- Acceptance criteria: first step is the rule-source research pass (see Context) producing `constants.ts` with per-constant source comments: round structure, starting money and inventory, yield tables (river food bonus, plains energy bonus, mountain smithore bonus, adjacency bonus), store base prices and stock, M.U.L.E. and outfit costs, land value, spoilage/decay rates. Production formula uses those tables; energy-shortfall penalty (unpowered M.U.L.E. produces nothing); food spoilage and energy decay between rounds; score = money + goods at store prices + land value per plot.
- Verification commands: `npx tsc --noEmit`; `./check_codebase.sh`
- Obvious follow-ons: constants in one exported table for AI reuse; changelog entry.

### Work package: WP-2A1 turn sequencer and land grant

- Owner: expert_coder
- Touch points: `src/engine/turn.ts`, `src/engine/land_grant.ts`
- Depends on: D-M1
- Acceptance criteria: phase state machine (land_grant -> develop x4 players -> production -> auction x3 goods in fixed order food, energy, smithore -> next round); snake-order land pick with pass allowed; development-phase time budget as tick counter. Edge transitions defined and tested: timer expiry mid-store or mid-placement ends the player's develop turn (unplaced M.U.L.E. is lost, per original); player who cannot afford a M.U.L.E. or owns no un-outfitted plot can still end turn; placement cancel returns to store with M.U.L.E. in tow until timer expires.
- Verification commands: `node --import tsx --test tests/test_turn.mjs`
- Obvious follow-ons: changelog entry.

### Work package: WP-2A2 auction engine

- Owner: expert_coder
- Touch points: `src/engine/auction.ts`
- Depends on: WP-2A1 (phase hooks)
- Acceptance criteria: tick-based auction where each participant holds a current price that moves up (buyer) or down (seller) by intent; transfers execute while highest buyer >= lowest seller at the crossing price; store participates with fixed buy/sell band; auction ends on timer ticks; money and goods conserved. Behavior tests required before M3 UI work: price movement per tick, crossing-price trade execution, store participation, zero-buyer and zero-seller auctions end cleanly, timeout ends auction with no trade, and one fixed-seed AI-vs-AI auction trace asserted tick-by-tick (stable interface for the UI).
- Verification commands: `node --import tsx --test tests/test_auction.mjs`
- Obvious follow-ons: expose per-tick snapshot for UI; changelog entry.

### Work package: WP-2B1 AI strategies

- Owner: coder
- Touch points: `src/ai/land_ai.ts`, `src/ai/develop_ai.ts`, `src/ai/auction_ai.ts`
- Depends on: WP-1C1 (economy constants), WP-2A2 (auction interface)
- Acceptance criteria: land AI scores plots by expected yield; develop AI outfits toward colony-scarcest resource; auction AI sets target price from need/surplus and walks toward it per tick; AI keeps a food-safety money reserve. Every AI decision function returns a terminal action in bounded ticks under degenerate states (no money, no owned plots, store out of M.U.L.E.s, no valid auction role -> AI passes/ends turn); tested explicitly so AI can never softlock the sequencer.
- Verification commands: `node --import tsx --test tests/test_ai.mjs`
- Obvious follow-ons: changelog entry.

### Work package: WP-2C1 engine test suite and headless sim

- Owner: coder
- Touch points: `tests/test_map.mjs`, `tests/test_economy.mjs`, `tests/test_turn.mjs`, `tests/test_auction.mjs`, `tests/test_ai.mjs`, `tests/test_full_game.mjs`
- Depends on: WP-1B2, WP-1C1, WP-2A2, WP-2B1 (tests land per module as each merges)
- Acceptance criteria: fixed-seed full 4-AI game runs 6 rounds to a scored winner with no thrown errors; economy tests assert documented yields; auction test asserts conservation invariant.
- Verification commands: `node --import tsx --test 'tests/test_*.mjs'`; `./check_codebase.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-3A1 SVG sprites, map render, and HUD

- Owner: coder
- Touch points: `src/ui/sprites.ts`, `src/ui/map_render.ts`, `src/ui/hud.ts`, `src/style.css`
- Depends on: D-M2
- Acceptance criteria: `sprites.ts` exports SVG symbol defs (M.U.L.E. walker, player figure, mountain, river, town, resource icons) as original, simple, silhouette-inspired flat shapes; art target is mechanical readability, not imitation - terrain types visually distinct, ownership borders unambiguous per player color, outfit glyphs distinguishable at map scale, contrast per `docs/COLOR_CONTRAST_ACCESSIBILITY.md`. Map renders as inline SVG grid with terrain fills, river column, town, ownership borders, placed M.U.L.E. outfit glyphs; HUD shows money and goods for all 4 players; renders from a hand-built fixture state. Automated check: a fixture-render Playwright assertion counts distinct terrain fill values and per-player border colors in the SVG DOM (no human sign-off required to close the package; human aesthetic review can happen later).
- Verification commands: `./run_web_server.sh` + manual screenshot; `./check_codebase.sh`
- Obvious follow-ons: contrast check per `docs/COLOR_CONTRAST_ACCESSIBILITY.md`; changelog entry.

### Work package: WP-3B1 store and placement screens

- Owner: coder
- Touch points: `src/ui/store_screen.ts`, `src/ui/input.ts`, `src/ui/screen_router.ts`
- Depends on: D-M2
- Acceptance criteria: human can buy M.U.L.E., pick outfit, select owned plot to install, all within the tick budget; keyboard arrows/enter plus tap targets >= 44px.
- Verification commands: `./run_web_server.sh` manual walkthrough; `./check_codebase.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-3B2 auction screen

- Owner: coder
- Touch points: `src/ui/auction_screen.ts`
- Depends on: WP-2A2, WP-3A1 (HUD shell)
- Acceptance criteria: vertical price track with 4 player tokens moving per tick; human holds up/down (key or touch) to move price; live trade indicator when bands cross; buy/sell role choice before each good's auction.
- Verification commands: `./run_web_server.sh` manual walkthrough; `./check_codebase.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-4A1 full game wiring

- Owner: expert_coder
- Touch points: `src/ui/main.ts`, `src/ui/screen_router.ts`
- Depends on: D-M3 (all screens)
- Acceptance criteria: new game -> 6 rounds of all phases -> scoring screen -> play again; no dead-end states; requestAnimationFrame (or interval) drives engine ticks and SVG updates.
- Verification commands: full manual playthrough via `./run_web_server.sh`; `./check_codebase.sh`
- Obvious follow-ons: changelog entry.

### Work package: WP-4B1 Playwright smoke and docs

- Owner: coder
- Touch points: `tests/playwright/`, `docs/CODE_ARCHITECTURE.md`, `README.md`, `docs/CHANGELOG.md`
- Depends on: WP-4A1
- Acceptance criteria: Playwright specs cover (a) load page, start game, reach map, assert HUD text; (b) one scripted develop-phase path: buy M.U.L.E., outfit, place on owned plot, assert map glyph appears; (c) one auction interaction: hold price key, assert player token moves and a trade indicator can fire against the store band. README first paragraph pure prose <250 chars; `docs/CODE_ARCHITECTURE.md` records actual implemented boundaries and the actual constants source, written from the code, not copied from this plan.
- Verification commands: `./run_playwright_tests.sh`; `source source_me.sh && pytest tests/` (markdown-link and hygiene checks); `./build_github_pages.sh`
- Obvious follow-ons: hand off `deploy-pages.yml` install and `git commit` to human.

## Acceptance criteria and gates

- Per-patch gate: `./check_codebase.sh` green (tsc strict, ESLint --max-warnings 0, Prettier, node unit tests); engine patches add or update a `tests/test_*.mjs`; `docs/CHANGELOG.md` updated.
- Integration gate (per milestone): milestone exit criteria above; `source source_me.sh && pytest tests/` green (hygiene suite).
- Manual review gate: human playthrough and aesthetic review are advisory, not milestone blockers - the M4 automated gate is the Playwright walkthrough plus headless full-game sim. Human owns all `git commit` and workflow-file installation.

## Test and verification strategy

- Engine: node built-in test runner via `node --import tsx --test 'tests/test_*.mjs'`. Deterministic seeded tests only: fixed-seed map snapshot properties (river present, plot counts), yield-table assertions against documented M.U.L.E. values, auction conservation invariant (sum of money and sum of each good constant across an auction), full-game headless simulation to completion.
- AI: property tests (AI keeps food reserve, auction AI price stays within legal band), not brittle exact-value assertions.
- UI: Playwright smoke in `tests/playwright/` per `docs/PLAYWRIGHT_TEST_STYLE.md`; manual visual pass with screenshots for map/auction screens.
- Hygiene: existing pytest suite guards naming, ASCII, markdown links.

## Migration and compatibility policy

- Additive rollout: greenfield; each milestone leaves `main` buildable (`./build_github_pages.sh` succeeds even when the game is a stub screen).
- Backward compatibility: none owed externally; if a save schema lands (v2 scope), it starts versioned per `docs/FUN_VIBES_DESIGN_STYLE.md` layer 1.
- Legacy deletion criteria: none (no legacy code); `mule.nes` stays untouched at root as reference.
- Rollback strategy: git revert of the offending patch; engine/UI split keeps reverts single-component.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| Auction tick model feels wrong vs original | Core fun lost | Manual playtest at M3 | expert_coder | Isolate tunables (tick rate, price step) in one constants module; playtest early with headless AI-vs-AI price traces |
| Documented M.U.L.E. formulas conflict across sources | Economy imbalance | WS-1C research | coder | Prefer Atari 8-bit documented tables; record chosen values in `economy.ts` comments and CODE_ARCHITECTURE.md |
| Real-time phases vs turn-based engine mismatch | Rework in M3 | UI wiring | expert_coder | Tick-counter design decided in WP-2A1 before any UI work |
| AI softlocks sequencer (never finishes develop phase) | Game hangs | Full-game sim test | coder | WP-2C1 headless sim with watchdog tick limit fails loudly |
| TS18003 lint config failure on empty tests/tools | Gate red from day one | First `./check_codebase.sh` | coder | WP-1A1 explicitly resolves it |

## Rollout and release checklist

- [ ] All four milestone exit criteria met.
- [ ] `./check_codebase.sh` and `source source_me.sh && pytest tests/` green.
- [ ] `./run_playwright_tests.sh` green.
- [ ] `./build_github_pages.sh` dist/ verified locally via `run_web_server.sh`.
- [ ] Human installs `deploy-pages.yml` into `.github/workflows/` and commits.
- [ ] README first paragraph ready for GitHub About field.

## Documentation close-out requirements

- Active plan / progress tracker: copy this plan to `docs/active_plans/active/mule_core_loop_plan.md` at kickoff; move to `docs/archive/` via `git mv` at close.
- docs/CHANGELOG.md entry: per patch, under the day block, correct category headings.
- Archive / closure notes: final entry records chosen economy constants and auction tunables as "Decisions".

## Patch plan and reporting format

- Patch 1: WP-1A1 scaffold (host files, lint fix).
- Patch 2: WP-1B1 state types + RNG.
- Patch 3: WP-1B2 map generation.
- Patch 4: WP-1C1 economy/store/scoring.
- Patch 5-6: WP-2A1 sequencer + WP-2A2 auction.
- Patch 7: WP-2B1 AI.
- Patch 8: WP-2C1 tests + headless sim.
- Patch 9-11: WP-3A1, WP-3B1, WP-3B2 UI screens.
- Patch 12: WP-4A1 wiring.
- Patch 13: WP-4B1 Playwright + docs.
- Report each as "Patch N" in changelog and status updates. Max parallel doers: 3 (M1/M2), 2 (M3/M4).

## Resolved decisions

- Development-phase time budget: fixed ticks per player for v1 (original's money-scaled timer moves to a future fidelity plan).
- Land grant: snake-order pick for v1 (original simultaneous lottery moves to a future fidelity plan).
- Auction goods order fixed: food, energy, smithore.
- Art target: original, simple, silhouette-inspired SVG judged on readability (terrain distinction, ownership clarity, auction usability), not on imitation of the original assets.
- Rule constants: Atari 8-bit beginner game values win conflicts; all constants live in `src/engine/constants.ts` with source comments.
- Player palette: chosen during WP-3A1 within `docs/COLOR_CONTRAST_ACCESSIBILITY.md` constraints.

## Open questions and decisions needed

- None blocking. Any constant a coder cannot source from the named references gets a plan-consistent placeholder plus a source-needed comment and a changelog "Decisions and Failures" note.
