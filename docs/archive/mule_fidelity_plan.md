# Plan: M.U.L.E. original-fidelity upgrade (standard mode, spatial play, retro SVG art)

## Context

The remake at `mule-game` has a solid core-loop v1: pure reducer engine (`src/engine/`), pure AI
(`src/ai/`), DOM+SVG UI (`src/ui/`), 6-round beginner game, menu-driven interaction, flat-color
placeholder art. The user wants it substantially closer to the original 1983 M.U.L.E.: full
standard-mode mechanics, the original's real-time spatial interaction (walk an avatar through
town, lead M.U.L.E.s to plots, position-based auction), and custom retro-inspired SVG artwork.

Two decisive reference finds this session:

- `OTHER_REPOS/mule_document.html` - Kroah's M.U.L.E. decompilation document v0.41 (2009), a
  reverse-engineering writeup of the original 1983 Atari 800 binary, with exact formulas for
  pricing, production, events, timers, wampus, pub, crystite, and scoring, paired with the
  annotated 6502 disassembly at `OTHER_REPOS/MULE-assembly/MULE-Disassembled_Memory.asm`
  (symbol-labeled: `goodsPrice`, `calcMuleReq`, `roundEventsProb`, `wampusTime`, ...). This is
  the strongest 1983 primary source short of the ROM.
- `OTHER_REPOS/planet_mule/data_decompiled/` - the decompiled Java model of Planet M.U.L.E.
  (Turborilla's licensed 2009 remake), the best-developed and most-tested modern reference.
  Cross-checking shows Planet M.U.L.E. matches the 1983 formulas almost everywhere (mule price,
  mule cap and rebuild, food table, event chance and money curve, pub payout, wampus bounty,
  crystite blooms, spoilage, scoring); the known divergence is its colony-rating threshold.

Emulation target (user, 2026-07-08): Planet M.U.L.E. is the game we emulate - its values,
behaviors, and modern presentation - at the classic core feature set (no lab items, no assay
bot, no player land selling). The 1983 material serves as heritage cross-check. Rule authority
order: (1) planet_mule decompiled Java (primary; verified against the local files), (2) Kroah
decompilation doc + 1983 disassembly (heritage cross-check; adjudicates when the Java is
ambiguous), (3) TSavo-mule-game `reference/*.md` audits (transcriptions of the same Planet
M.U.L.E. decompilation; cross-check only), (4) planetmule.com/how-to-play, (5) C64-Wiki /
Atari manual, including the saved prose writeup `OTHER_REPOS/mule_rules.md` (rules narrative,
event lists, platform-difference notes). Each constant in
`src/engine/constants.ts` keeps a source comment naming which. Reference use: treat the
reference repos as data - extract rules, formulas, and numeric constants, and write fresh
TypeScript and fresh SVG art in this repo's own style. `OTHER_REPOS/` now holds exactly the
useful set: `planet_mule/` (primary), `MULE-assembly/` + `mule_document.html` (1983
cross-check), `TSavo-mule-game/` (audit cross-check; its own TypeScript implementation
self-reports 30 unfixed issues, so `reference/*.md` is the useful part), and `mule_rules.md`
(prose rules companion). The low-fidelity student repos, the unrelated nik0kin engine, and
the binary OpenMULE build were assessed this session and deleted by the user.

## Objectives

- Engine implements standard-mode M.U.L.E. per Planet M.U.L.E. behavior at the classic core
  feature set, cross-checked against 1983 sources: 12 rounds, crystite, dynamic store pricing,
  mule economy, land auctions, personal and colony events, wampus, pub gambling, assay,
  food-scaled develop timer, rank-ordered turns, colony rating.
- UI is ported to SolidJS and becomes real-time spatial: avatar walks town and overworld, buys
  and tows M.U.L.E.s, gambles at the pub, hunts the wampus, and trades in a position-based
  auction arena.
- All artwork replaced with original retro-inspired SVG (chunky pixel-feel, Atari-era palette)
  covering terrain, 8 species avatars, M.U.L.E.s, town buildings, auction arena, events, title.
- Determinism preserved: same seed plus same action log replays to an identical GameState,
  proven by a replay harness from M1 onward.
- Every milestone gate is machine-verifiable (typecheck/lint/tests/build, Playwright at fixed
  seed and speed, balance sim, headless playthrough harness), so the manager and subagents can
  complete the whole plan end to end.

## Design philosophy

Fidelity by formula, not by feel: every gameplay number is lifted from the Kroah 1983
decompilation or the planet_mule Java and recorded with a citation - accepting the cost of a
formal source-adjudication artifact (`docs/RULE_SOURCES.md`) over quicker hand-tuning. Where a
value is genuinely tunable (auction tick mapping, AI thresholds, colony pass band), use the
scientific method: the balance sim is the experiment, candidate constants compete on gate
metrics, and the winner is kept with its sim numbers recorded. The engine stays a pure reducer
and all real-time spatial motion lives UI-side as presentation state that emits semantic
Actions; the rejected alternative (avatar physics inside the engine) would sacrifice the purity
gate, serialization, and test surface for no rules benefit. Eleven thin milestones across three
contract-bounded lanes (engine, Solid UI, art) prove the riskiest architecture promises first
(Solid build path, replay determinism, single-scheduler ticks, headless UI driving) and keep
3-4 subagents busy in parallel; the rejected alternative (fewer, fatter milestones) hides
integration risk until late.

## Scope

- Extend `src/engine/` to standard-mode rules with planet_mule-sourced constants and formulas.
- Add crystite as a fourth resource with hidden bloom levels and assay reveal.
- Port `src/ui/` to SolidJS (store + `reconcile`, phase-router component, per-phase scenes) and
  rework interaction to scene-based real-time spatial play on a rAF fixed-timestep loop.
- Replace all placeholder art with an original retro-inspired SVG sprite and tile set, gated by
  per-scene visual-readability fixtures.
- Extend `src/ai/` for every new decision point (land bids, pub, wampus, assay, crystite), each
  with a cannot-stall test.
- Write `docs/RULE_SOURCES.md` in M1: every known rule conflict with chosen value, source file,
  secondary source, and reason; the extraction workflow (read formula, record constant, write
  behavior from scratch, test behavior); and the 1983 values recorded for excluded options
  (species handicaps, tournament) so future toggles are data changes.
- Write `docs/REFERENCE_REPOS.md` in M1: how to read each relevant `OTHER_REPOS/` codebase
  (planet_mule Java class map, Kroah doc + disassembly grep guide, TSavo audit caveats).
- Finish with an excellence milestone: autosave/resume + replay viewer, three AI
  personalities, tutorial hints, ambient animation, PWA install, and an HTML balance
  dashboard.
- Add enforcement tooling: constant-metadata audit test, per-milestone placeholder audit,
  action-log replay harness (M1), tick-ownership invariant test (M2), headless UI harness
  (scripted one-phase flow in M2, full-game by M7), per-module negative-economy invariants.
- Offer a title mode picker: beginner (6 rounds) and standard (12 rounds). Beginner differs
  from standard in round count only; every economy constant is the PM value in both modes
  (the 1983 per-mode beginner tables are recorded in `docs/RULE_SOURCES.md`, unused).
- Add `OTHER_REPOS/` and `mule.nes` to `.gitignore` (reference material stays local-only).

## Non-goals

This version succeeds as a complete single-player standard-mode M.U.L.E. without the items
below; each is excluded deliberately so the plan ships a finished game rather than a broader
unfinished one.

- Lab items (Depot / Water Tank / Mining Tower / Power Plant) and the hireling system: Planet
  M.U.L.E. additions; the 1983 ruleset is the target.
- Per-species gameplay bonuses: species are cosmetic at flat $1000 (user decision); the 1983
  handicap values (Flapper $1600 / Humanoid $600, PTU modifiers) are recorded in
  `docs/RULE_SOURCES.md` as a future data toggle.
- Tournament as a selectable ruleset: standard mode delivers the full mechanics; the 1983
  tournament deltas (variance amplitude 2, pirates steal crystite, AI +$200) are recorded in
  `docs/RULE_SOURCES.md` for a later data-only addition.
- Multiple human players (hotseat or online): the driver, auction, and develop flows assume
  1 human + 3 AI; multiplayer would change the interaction model, not the rules.
- Deserts and player-to-player land selling: Planet M.U.L.E. toggles beyond the 1983 game.
- Sound and music: a separate later pass with its own asset pipeline.

## Current state summary

> Status note (M10 docs sweep, 2026-07-09): this section describes the
> pre-M1 kickoff baseline the plan was written against, not the current
> tree. M1-M9 have since shipped (see the Milestone plan table's Status
> column below); the Solid port, rAF scheduler, and the events/land-auction/
> crystite/wampus mechanics this section calls "not yet built" are all live.
> The working-tree note below is resolved: `src/ui/auction_screen.ts` was
> deleted and replaced by `src/ui/solid/auction_screen.tsx` during the M1
> WS-U-solid port.

- Engine: reducer `applyAction` (`src/engine/game_state.ts`, `turn.ts` 659 lines), seeded Rng,
  6 rounds, 3 resources, snake-draft land grant, flat store prices, unlimited mules, tick
  auction (`AUCTION_TICKS=20`, known 0.79 dead-window rate), flat 50-tick develop timer.
- UI: vanilla TS; `game_driver.ts` (637 lines) sequences phases on setTimeout chains;
  full-rebuild SVG map; menu store screen; auction price track. No rAF, no animation, no avatar.
- Art: five procedural flat SVG symbols, flat terrain fills, bare title screen.
- Build chain (`docs/TYPESCRIPT_STYLE.md`): `npx tsc --noEmit` type gate + esbuild CLI bundle
  from `build_github_pages.sh`; the doc already sanctions the esbuild JS-API path
  (`pipeline/build.mjs` + `esbuild-plugin-solid`) for Solid apps - the `pseudo-code-mapper`
  precedent. `check_codebase.sh` is the five-step gate; `devel/setup_typescript.sh` owns setup.
- Tests: node --test engine units, Playwright selector-contract specs, headless balance-sim
  pattern (scratchpad `balance_sim.mjs`).
- Working-tree note: `src/ui/auction_screen.ts` carries an uncommitted edit; M1 contains an
  explicit task (WS-U-solid) to inspect it, classify it as intended behavior or discardable
  drift, and record the decision in the changelog, so the Solid port has a named source of
  truth for auction UI behavior (validated by a focused Playwright selector test before and
  after the port).
- Reference inventory (`OTHER_REPOS/`, trimmed by the user to the useful set): `planet_mule/`
  decompiled Java (primary rule authority), `MULE-assembly/MULE-Disassembled_Memory.asm` +
  `mule_document.html` (Kroah 1983 decompilation, heritage cross-check), `TSavo-mule-game/`
  (`reference/*.md` audits as cross-check), `mule_rules.md` (prose rules companion),
  `repos.txt`.
- UI framework decision (user, 2026-07-08): adopt SolidJS. Reducer's immutable GameState
  snapshots feed a Solid store via `reconcile`; screens/HUD/panels become Solid components;
  per-frame avatar motion stays imperative (refs + transform writes in the rAF loop) so 60fps
  movement bypasses reactivity. Toolchain: `pipeline/build.mjs` (esbuild JS-API +
  `esbuild-plugin-solid`) wired into `build_github_pages.sh` / `run_web_server.sh`; `tsconfig`
  gains `jsx: preserve` + `jsxImportSource: solid-js`; `solid-js` and `esbuild-plugin-solid`
  land in `package.json` in M1's first UI patch (version-pinned `allowScripts` entries updated
  per `docs/TYPESCRIPT_STYLE.md`). UI subagents follow the `solid-js-expert` skill (run-once
  components, access props through the props object, `<For>` for lists, `createMemo` for
  derived state, stores + `reconcile`) and each Solid patch states in its notes how it handled
  store boundary, props, list rendering, and derived state.

## Key formulas (extraction summary)

Recorded here for planning; `docs/RULE_SOURCES.md` (M1) becomes the durable home. All from the
planet_mule Java (the emulation target); the Kroah 1983 doc confirms nearly all of them and is
noted where the two differ.

- Store pricing: `price *= 0.25 + 0.75 * ratio` (ratio = supply/required; smithore/mule ratio
  clamped ]0.25, 3.0]); smithore adds binomial jitter (about +-7 amplitude); crystite price =
  `50 + randInt(0..99)`; buy/sell spreads: food/energy sell = buy + 35 (buy = price - 15),
  smithore sell = buy + 35, crystite sell = buy + 140 (buy floored to multiple of 4).
- Mule economy: store cap 14 (standard; 25 beginner), rebuilt 2 smithore -> 1 mule, price =
  2 * smithore price floored to a multiple of 10.
- Starting position: money $1000, food 4, energy 2, store stock 8/8/8/0 + 14 mules (PM values;
  the 1983 per-mode beginner tables are recorded in RULE_SOURCES.md, unused).
- Develop timer: `time = f * FULL + (1 - f) * MIN` with `f = min(1, food/required)`, FULL/MIN
  tick analogs of 47.5s/5s; `foodRequirements = [3,3,3,3,4,4,4,4,5,5,5,5]`; turn order = rank
  order, reversed when store mules <= 7.
- Personal events: 27.5% per player turn, each of ~22 events once per game, good never to
  rank 1, bad never to the bottom two ranks; amount = `x * m` or `x * m * plotCount` with
  `m = muleCurve(round) = 25 * (floor(round/4) + 1)`.
- Colony events (PM model): pre-shuffled weighted deck assigned per round (pirates x2, acid
  rain x3, sunspot x3, fire x2 seeded early; pest x3, planetquake x3, meteorite x2, radiation
  x2 added after round 2), split A/B around the develop/production phases, none in round 0,
  last round forced ship return; effects: acid rain +4 food/-2 energy struck row (+-1
  elsewhere), pirates wipe crystite, planetquake halves mining and may degrade a mountain,
  sunspot +3 energy, meteorite sets a plot to crystite 4 + crater, radiation strips a
  leader factory, fire wipes store food/energy/smithore.
- Production: `capacity = terrainYield + adjacencyBonus + floor(sameResourceCount/3) +
  tempBonus + round(normalDistributed())`, clamp [0,8]; energy shortfall: no power -> 0,
  partial power -> halved (min 1); energy mules consume 0.
- Crystite: 4 high-quality deposits placed randomly, expanded as manhattan stars
  (high/medium/low by distance, overlaps keep max); very-high only via meteorite; assay
  reveals a plot.
- Wampus: bounty `100 * floor((round+4)/4)`; spawn delay and blink cadence per Kroah timings.
- Pub: `cash = pubBonus[round] + randInt(0, 2 * ticksLeft)`, bonus
  `[50,50,50,100,100,100,100,150,150,150,150,200]` by round, cap $250 (settles the TSavo
  transcription conflict in favor of our direct extraction).
- Land: grant cursor sweep (collision -> worst rank wins); land auctions from standard mode,
  count ~ normal around 1 per round, first-ever start $160, subsequent = previous - 60, floor
  80ish, unsold -> price/2 + 52, price steps of 4.
- Auction: declaration then trading windows (1983: 30 + 70 ATU); auto-role by surplus
  (holders of surplus default seller, others buyer, player may override); traded good's next
  base price = average trade price; store crystite zeroed after its auction.
- Scoring: money + per-plot (500 + outfit price) + 35 per mule + goods at current prices;
  colony rating = `clamp(colonyTotal / (20000 * rounds / 12), 0, 6)` indexing 7 Federation
  messages (PM formula; scales with game length); First Founder to rank 1 when the colony
  succeeds (~60000 at 12 rounds). The 1983 variant `round((total - 10000)/20000)` is recorded
  in RULE_SOURCES.md.

## Architecture boundaries and ownership

- `src/engine/` - pure rules; new modules `events.ts`, `land_auction.ts`, `round_scale.ts`
  (bloom seeding in `map.ts`). ESLint purity gate stays authoritative.
- `src/ai/` - pure decisions; extended per new Action. AI issues the same Actions as the human.
- `src/ui/` - SolidJS layer: `game_store.ts` (Solid store fed by the reducer via `reconcile`;
  `dispatch` is the only writer), phase router as a `<Switch>` over `state.phase.kind`.
- `src/ui/scenes/` - per-phase scene components (`TownScene.tsx`, `OverworldScene.tsx`,
  `AuctionScene.tsx`, `LandGrantScene.tsx`, `ProductionScene.tsx`) plus non-component modules:
  `scene_manager.ts` (rAF fixed timestep + speed multiplier), `walker.ts` + `zones.ts` (pure
  kinematics/geometry, node-testable), `ai_actor.ts` (AI avatar presentation), `Dpad.tsx`
  (touch). Continuous per-frame motion writes transforms through refs inside the rAF loop;
  everything state-derived renders reactively from the store.
- `src/ui/sprites/` - art modules split by domain (`sprites_terrain.ts`, `sprites_species.ts`,
  `sprites_mule.ts`, `sprites_town.ts`, `sprites_events.ts`, `palette.ts`); inline `<symbol>`
  defs (single-file static export stays possible).
- Engine-UI contract: UI-side continuous state (avatar x/y, tweening) stays unserialized;
  engine Actions fire on semantic events; every random roll happens inside the reducer via the
  seeded Rng. New payload fields carry tick-stamped event lists (pattern: existing auction
  `trades`). Action logs are valid within one build/version only; the replay fixture is
  regenerated when the Action schema changes (documented in `docs/RULE_SOURCES.md`).

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream | Component | Expected patches |
| --- | --- | --- |
| M1 / WS-U-solid | ui: Solid proof, then store + first screens | 3-4 |
| M1 / WS-E-foundation | engine: mode enum, round scale, crystite widening, replay harness | 4 |
| M1 / WS-E-sources | docs+tests: RULE_SOURCES.md, constant-metadata audit | 1-2 |
| M1 / WS-A-spec | art: style spec, palette tokens, gitignore housekeeping | 1-2 |
| M2 / WS-U-port | ui: remaining screen ports, rAF scene manager, tick ownership, mini harness | 4 |
| M2 / WS-E-blooms | engine: crystite blooms, assay action, spoilage caps | 2 |
| M2 / WS-A-terrain | art: terrain tile set, map reskin, readability fixture | 2 |
| M3 / WS-E-prices | engine: dynamic store pricing | 2-3 |
| M3 / WS-E-mules | engine: mule economy, develop timer, turn order, mode tables | 2-3 |
| M3 / WS-A-actors | art: species avatars, mule sprite set, readability fixture | 2-3 |
| M4 / WS-U-auction | ui: spatial auction scene + keyboard/reduced-motion gates | 2-3 |
| M4 / WS-E-auction | engine: goods-auction fidelity | 2-3 |
| M5 / WS-E-land | engine: land auction phase + AI | 2-3 |
| M5 / WS-U-overworld | ui: walkable overworld + keyboard/reduced-motion gates | 2-3 |
| M5 / WS-A-town | art: town buildings, auction arena, readability fixture | 2-3 |
| M6 / WS-E-events | engine: personal + colony events | 3-4 |
| M6 / WS-U-events | ui: event banners, vignette presentation | 2 |
| M7 / WS-E-production | engine: variance, scale bonus, energy gate polish | 2 |
| M7 / WS-U-town | ui: town scene, store/pub/assay zones, full-game harness | 3-4 |
| M8 / WS-E-critters | engine: wampus, pub, assay wiring, species/mode config | 2-3 |
| M8 / WS-U-critters | ui: wampus hunt, mule escape, AI actors, species/mode select | 3 |
| M8 / WS-A-title | art: title screen, species select, event vignettes | 2-3 |
| M9 / WS-E-endgame | engine: scoring, colony rating, colony failure | 2 |
| M9 / WS-U-polish | ui: land-grant sweep, production anim, touch, a11y audit | 2-3 |
| M10 / WS-balance | engine+ai: sim-gate experiment sweep and tuning | 2-3 |
| M10 / WS-release | docs, screenshots, placeholder audit, harness fixes | 1-2 |
| M11 / WS-E-replay | engine+ui: autosave/resume + replay viewer | 2-3 |
| M11 / WS-AI-personas | ai: three named AI personalities + win-band gate | 2 |
| M11 / WS-U-delight | ui: tutorial hints, ambient animation, PWA install | 3 |
| M11 / WS-balance-report | tooling: HTML balance dashboard from sim output | 1-2 |

## Milestone plan

**Closure (2026-07-09):** All 11 milestones are DONE, review-gated, spanning 2026-07-08
to 2026-07-09. Final gates are green: 338/338 node tests, 65/65 Playwright specs,
the 6/6 headless full-game matrix (beginner+standard x seeds 1/3/7) across repeated
runs, and the balance-sim release GATE PASS across 120+ seeds. The six-pass audit
sweep (art gate rounds 1-3, docs-drift audit, leader win-rate probe, mule-trip-timing
probe) is complete with every finding closed or explicitly deferred. Remaining work is
human-owned: committing this batch of changes, the `VERSION` CalVer bump for the
release cut, and the pending root `LICENSE` decision. This plan is archived to
`docs/archive/mule_fidelity_plan.md` as of this closure.

| M | Title | Summary | Goal | Status |
| --- | --- | --- | --- | --- |
| M1 | Proofs and foundations | Solid build proof + first screens; mode enum, crystite widening, replay harness; RULE_SOURCES.md; style spec | Riskiest promises proven; game plays exactly as today | DONE, review-gated (2026-07-08 to 2026-07-09) |
| M2 | Port completion and terrain | All screens on Solid; rAF scheduler owns ticks (proven); mini headless harness; crystite blooms + assay; terrain reskin | Old UI fully retired; map looks retro | DONE, review-gated (2026-07-09) |
| M3 | Living economy | Dynamic prices, mule scarcity, food-scaled timer, mode tables; species and mule art | Prices move, mules run out, food matters | DONE, review-gated (2026-07-09) |
| M4 | Spatial auction | Auction becomes avatars on a price axis; engine auction fidelity; keyboard + reduced-motion gates | Auction plays like the original | DONE, review-gated (2026-07-09); `AuctionScene.tsx` shipped as `src/ui/solid/auction_screen.tsx` (not under `scenes/`) -- functionally complete, naming/location diverges from this section's original spec |
| M5 | Land and overworld | Land auction phase; walkable overworld with spatial mule placement; town art | Player walks the map; land goes under the hammer | DONE, review-gated (2026-07-09) |
| M6 | Events | Full personal + colony event system with PM fairness rules and presentation | Rounds feel like M.U.L.E. | DONE, review-gated (2026-07-09) |
| M7 | Production and town | Production variance and bonuses; walkable town replaces the store menu; full-game harness | Town is a place, yields breathe | DONE, review-gated (2026-07-09) |
| M8 | Creatures and identity | Wampus, pub gamble, assay flow, species + mode select screens, AI avatars | All standard-mode mechanics playable | DONE, review-gated (2026-07-09); pub gamble shipped 2026-07-09 (WS-E-critters, `gamble` action) |
| M9 | Endgame | PM scoring and colony rating, land-grant sweep, production animation, touch + a11y audit | Complete game loop with original presentation | DONE, review-gated (2026-07-09) |
| M10 | Balance and release | Sim-gate tuning experiments, headless playthroughs, docs and screenshots | Balanced, releasable | DONE (2026-07-09, review PASS) |
| M11 | Excellence and durability | Autosave/resume, replay viewer, AI personalities, tutorial hints, ambient animation, PWA install, balance dashboard | The best version: durable, welcoming, replayable | DONE (2026-07-09, final review PASS-WITH-FIXES, docs fixes underway) |

Status dates are drawn from the `docs/CHANGELOG.md` day blocks carrying each
milestone's explicit workstream tag (for example "M6 WS-E-events"); "review-gated"
records that the milestone's exit criteria and integration gate passed, per this
plan's [Acceptance criteria and gates](#acceptance-criteria-and-gates), not that a
human sign-off pass has separately occurred. This table is the plan's own status
record so a reader does not need to cross-reference the changelog by hand; update it
in place as later milestones close out.

This plan's PascalCase scene names (`AuctionScene`, and similar names elsewhere in
this document) map repo-wide to snake_case files split across `src/ui/scenes/` (the
imperative rAF layer) and `src/ui/solid/` (reactive Solid components), per
`docs/CODE_ARCHITECTURE.md`. The M4 row's `AuctionScene.tsx` ->
`src/ui/solid/auction_screen.tsx` callout above is one instance of this general
naming/location pattern, not a one-off deviation specific to M4.

All milestone gates are machine-verifiable (`check_codebase.sh`, node tests, Playwright at
fixed seed and speed, balance sim, headless harnesses), so the manager and subagents drive the
plan start to finish; the human reviews at leisure.

### Milestone: M1 Proofs and foundations

- Depends on: none.
- Workstreams: WS-U-solid, WS-E-foundation, WS-E-sources, WS-A-spec.
- Entry criteria: plan copied to `docs/active_plans/active/mule_fidelity_plan.md`.
- Exit criteria: Solid proof patch green (one existing screen - title - runs through
  `pipeline/build.mjs` + `game_store.ts` with unchanged behavior, verified by
  `check_codebase.sh`, `build_github_pages.sh`, and one Playwright smoke) before any further
  porting; HUD and map screens ported with selectors intact; `auction_screen.ts` pending edit
  classified and recorded; replay harness green on the current v1 flow (same seed + recorded
  actions -> deep-equal final GameState, node test); 12-round standard mode behind a constant;
  crystite typed with zero gameplay change; `docs/RULE_SOURCES.md` written with every known
  conflict decided; constant-metadata audit test green; style spec + palette merged;
  `.gitignore` covers `OTHER_REPOS/` and `mule.nes`. Obvious follow-ons: fix
  `Record<Resource, ...>` call sites the compiler flags, changelog entry, rerun any failed
  gate.
- M1 integration owner: the WS-U-solid expert_coder reconciles cross-lane changes to the
  load-bearing shared files (`package.json`, `tsconfig.json`, build scripts stay in the UI
  lane; `game_state.ts` and `constants.ts` stay in the engine lane; the integration owner
  merges and re-runs `check_codebase.sh` when both lanes land in the same window).
- Parallel-plan ready: yes (four workstreams, disjoint files; max 4 doers).

### Milestone: M2 Port completion and terrain

- Depends on: M1 (Solid proof, palette, crystite type, replay harness).
- Workstreams: WS-U-port, WS-E-blooms, WS-A-terrain.
- Entry criteria: M1 gates green.
- Exit criteria: every screen is a Solid component and the legacy `store_screen` /
  `auction_screen` / `hud` / `map_render` modules are deleted; all setTimeout phase chains
  replaced by the rAF scene manager + tick accumulators, with a tick-ownership invariant test
  proving exactly one scheduler drives engine ticks (fixed-seed phase-progression test under
  `?speed=`); `?seed=` / `?speed=` hooks live; mini headless harness green (Playwright starts
  a game, advances through at least one phase transition, observes state, zero page errors);
  full Playwright suite green; crystite blooms seeded (4 blooms, manhattan rings, river 0),
  `assay_plot` action reveals levels, smithore/crystite spoil above 50; terrain tiles rendered
  from `sprites_terrain.ts` with a terrain-distinguishability fixture (distinct fills, owned
  vs unowned clarity). Obvious follow-ons: delete orphaned CSS, changelog.
- Parallel-plan ready: yes (3 independent lanes; max 3-4 doers).

### Milestone: M3 Living economy

- Depends on: M2 (crystite in engine; Solid screens for store data).
- Workstreams: WS-E-prices, WS-E-mules, WS-A-actors.
- Entry criteria: M2 gates green.
- Exit criteria: store prices recalc per the PM formula (`price *= 0.25 + 0.75*ratio` with
  per-good floors and clamps, smithore jitter, crystite `50 + randInt(0..99)`, spreads
  food/energy/smithore +35 and crystite +140, average-trade-price feedback); store food halves
  after round 1; mule stock cap 14 rebuilt 2 smithore -> 1 mule at price = 2 * smithore price
  floored to 10; develop timer food-scaled with `foodRequirements` table; turn order = rank
  order, reversed when store mules <= 7; both modes share the PM constants (beginner differs
  in round count only). Negative-economy invariants land here for buy/outfit/timer
  paths (every money-changing action has an affordability or clamp rule, unit-tested). Sim
  gate: no deadlock, no negative money over 30 seeded games at 12 rounds. Species/mule sprites
  pass the automated style checks and an avatar-visibility fixture. Obvious follow-ons: retune
  `develop_ai.ts` budgets, changelog.
- Parallel-plan ready: yes (WS-E-prices and WS-E-mules touch disjoint modules -
  `store.ts`+`economy.ts` vs `turn.ts`; art independent; max 3 doers).

### Milestone: M4 Spatial auction

- Depends on: M3 (dynamic prices feed bands; species sprites for tokens).
- Workstreams: WS-U-auction, WS-E-auction.
- Entry criteria: M3 gates green.
- Exit criteria: `AuctionScene.tsx` replaces the price track - species avatars at
  `priceToY(price)` with inter-tick tweening, store band lines, trade-unit animation; scene is
  fully keyboard-playable and honors emulated `prefers-reduced-motion` (specs, not promises);
  engine: declaration-then-trading windows, initial roles auto-assigned by surplus (override
  allowed), per-good bands from live prices, crystite price step 4 (others 1), crystite window
  store-only-buyer with store crystite zeroed after its auction, idle-timeout ending,
  transfer-rate speedup tick-mapped with constants chosen by sim experiment and recorded;
  auction money paths covered by negative-economy invariants. Sim gate: dead-auction-window
  rate < 0.2 over 30 seeded games; auction AI cannot-stall test (watchdog ticks). Obvious
  follow-ons: `auction_ai.ts` retune, spec migration to `g[data-actor]` polling at `?speed=8`.
- Parallel-plan ready: yes (UI scene consumes existing payloads first, engine fidelity lands
  behind it; max 2-3 doers).

### Milestone: M5 Land and overworld

- Depends on: M4 (auction machinery reused for land bids; avatars walk).
- Workstreams: WS-E-land, WS-U-overworld, WS-A-town.
- Entry criteria: M4 gates green.
- Exit criteria: `land_auction` phase per the PM PlotSeller rules - count ~ normal around 1 per round from
  standard mode, first-ever start $160, subsequent = previous - 60, unsold -> price/2 + 52,
  price steps of 4, `bid_land` with going once/twice idle countdown, tie-break worst-ranked
  wins; `decideLandAuctionAction` with cannot-stall test and bid-affordability invariant;
  `OverworldScene.tsx` - real-time avatar, tick budget drains via accumulator, HUD timer bar,
  spatial `place_mule`, town cell opens the store menu as interim overlay; overworld scene
  keyboard-playable with reduced-motion spec; town/arena art passes style checks and a
  building/zone-readability fixture. Obvious follow-ons: money-conservation unit tests,
  changelog.
- Parallel-plan ready: yes (3 lanes; max 3-4 doers).

### Milestone: M6 Events

- Depends on: M5 (crystite, store stock, and rank order feed event effects).
- Workstreams: WS-E-events, WS-U-events.
- Entry criteria: M5 gates green.
- Exit criteria: `events.ts` per the PM model - personal events (27.5% per player turn, ~22
  events each once per game, good never to rank 1, bad never to the bottom two, condition
  checks, amount = factor * muleCurve, per-plot variants, zero-food pity package); colony
  events (pre-shuffled weighted deck assigned per round, A/B split around develop/production,
  none in round 0, last round forced ship return; effects per the extraction summary); event
  money deltas
  clamped by the negative-economy invariants; payload event lists animated as banners in the
  UI (vignette art arrives M8). Sim gate: event frequency in expected band; leader win-rate
  drops vs no-events baseline. Obvious follow-ons: fairness property tests, changelog.
- Parallel-plan ready: yes (engine tables vs UI presentation; max 2-3 doers).

### Milestone: M7 Production and town

- Depends on: M6 (event modifiers plumb through production; overworld exists for the portal).
- Workstreams: WS-E-production, WS-U-town.
- Entry criteria: M6 gates green.
- Exit criteria: production per the PM formula - terrain yield + adjacency + learning curve
  `floor(sameResourceCount/3)` + tempBonus + gaussian variance, clamp [0,8]; energy shortfall:
  no power 0, partial halved (min 1); energy mules consume 0; `TownScene.tsx` with walk-in
  zones - corral (`buy_mule`),
  outfit counters (`outfit_mule`), pub and assay doors, exits; mule tow follower; store
  overlay deleted; `?demo=town` fixture + full-loop spec (buy -> outfit -> exit -> place);
  headless playthrough harness (`tests/e2e/e2e_full_game.mjs`) grows from the M2 mini harness
  to drive a complete seeded game through the real UI at high speed, asserting a scoring
  screen with zero page errors. Obvious follow-ons: `develop_ai.ts` clustering incentive,
  changelog.
- Parallel-plan ready: yes (engine vs town scene; max 2-3 doers).

### Milestone: M8 Creatures and identity

- Depends on: M7 (town zones for pub/assay; develop tick semantics).
- Workstreams: WS-E-critters, WS-U-critters, WS-A-title.
- Entry criteria: M7 gates green.
- Exit criteria: wampus spawns/blinks on unowned mountains (PM `Wampus.java` timings), `hunt_wampus`
  catch with bounty `100 * floor((round+4)/4)`; `gamble` action (`pubBonus[round] +
  randInt(0, 2 * ticksLeft)`, cap 250, ends turn); assay flow costs ticks; species select
  (cosmetic, flat $1000) and mode picker (beginner 6 / standard 12) at title; AI develop turns
  rendered as fast-forwarded avatars with skip, proven by the skip-equivalence spec;
  mule-escape animation from engine events; pub/wampus AI heuristics with cannot-stall tests;
  gamble payout covered by economy invariants. Title/species-select/event-vignette art passes
  style checks and fixture specs. Obvious follow-ons: seeded wampus spec, changelog.
- Parallel-plan ready: yes (3 lanes; max 3 doers).

### Milestone: M9 Endgame

- Depends on: M8 (all mechanics in place).
- Workstreams: WS-E-endgame, WS-U-polish.
- Entry criteria: M8 gates green.
- Exit criteria: scoring = money + per-plot (500 + outfit price) + 35 per mule + goods at
  current prices; colony rating = `clamp(colonyTotal / (20000 * rounds / 12), 0, 6)` with 7
  message tiers (PM formula); First Founder when the colony succeeds; colony-failure check
  (total food or
  energy zero with no production); land-grant engine-driven sweep cursor +
  `claim_current_plot` (collision -> worst rank wins; `claim_plot` stays for AI and tests);
  production yield-pop animation; touch d-pad; relaxed-timer option; full accessibility audit
  pass (every scene keyboard-playable, reduced-motion honored, aria-live HUD - extending the
  per-scene gates from M4/M5). Obvious follow-ons: threshold edge tests, changelog.
- Parallel-plan ready: yes (2 lanes; max 2-3 doers).

### Milestone: M10 Balance and release

- Depends on: M9.
- Workstreams: WS-balance, WS-release.
- Entry criteria: M9 gates green.
- Exit criteria: baseline sweep run first (100+ seeded 12-round games), then the colony-rating
  pass band set from that baseline and held as the final gate - a two-step decision recorded
  in the changelog; all final sim gates green; headless playthrough harness green at both
  modes and three seeds; `./build_github_pages.sh` build plays a headless full game with no
  page errors; per-milestone placeholder audit swept repo-wide (new docs, tests, fixtures real
  and exercised; grep for placeholder language); screenshots + README refreshed;
  `docs/USAGE.md`, `docs/CODE_ARCHITECTURE.md`, `docs/FILE_STRUCTURE.md` updated; plan file
  moved to `docs/archive/` with closure notes. Obvious follow-ons: changelog close-out
  summarizing adopted vs adjusted values with sim numbers.
- Parallel-plan ready: yes (tuning vs docs; max 2 doers).

### Milestone: M11 Excellence and durability

- Depends on: M10 (balanced, complete game as the base).
- Workstreams: WS-E-replay, WS-AI-personas, WS-U-delight, WS-balance-report.
- Entry criteria: M10 gates green.
- Exit criteria: autosave/resume works - the driver persists (buildVersion, seed, action log)
  to localStorage after every dispatch and offers Resume on load when the build matches; a
  saved game from another build shows a brief "saved game unavailable for this version"
  notice on the title screen (same-build replay stays the only compatibility guarantee) -
  proven by a Playwright reload-mid-game spec; replay viewer (`ReplayScene.tsx`) loads a
  recorded log and plays it back at any `?speed=`, reusing the determinism harness; three
  named AI personalities (land baron, ore speculator, farmer) as parameterized heuristic
  profiles assigned randomly per game, with a sim gate that every personality stays inside
  the win band; first-run tutorial hints per phase (dismissible, stored in localStorage,
  keyboard accessible); ambient animation pass within `prefers-reduced-motion` discipline
  (river shimmer, mule idle, auction trade pop, title starfield drift); PWA install (manifest
  + icons + offline cache of the static bundle) verified by a Lighthouse-installable check in
  Playwright; balance dashboard - the sim emits an HTML report (price curves per round, win
  rates per seed and personality, trade volumes) into `output_smoke/balance_report/`,
  regenerated by one command. Obvious follow-ons: README feature list update, changelog.
- Parallel-plan ready: yes (4 independent lanes; max 4 doers).

## Workstream breakdown

### Workstream: WS-U-solid (M1)

- Owner: expert_coder (framework bootstrap is design-sensitive).
- Needs: `solid-js` + `esbuild-plugin-solid` install (first patch; version-pinned
  `allowScripts` entries updated).
- Provides: Patch 1 = the Solid proof: `pipeline/build.mjs`, `tsconfig` JSX fields,
  `game_store.ts`, one minimal root component hosting the existing title screen - validated by
  `check_codebase.sh`, `build_github_pages.sh`, one Playwright smoke, before any further
  porting. Then: phase-router `<Switch>`; HUD and map ports preserving every Playwright data
  attribute; the `auction_screen.ts` pending-edit classification (intended behavior vs drift,
  recorded, selector test before/after).
- Expected patches: 3-4.

### Workstream: WS-E-foundation (M1)

- Owner: coder.
- Needs: none.
- Provides: `GameMode` enum + `ROUND_COUNT_BY_MODE {beginner: 6, standard: 12}`;
  `round_scale.ts` with `muleCurve`; `Resource` widened to include `crystite` with all
  `Record<Resource, ...>` sites updated (lands alone as Patch 1 of the effort);
  `Plot.crystiteLevel` + `crystiteRevealed` fields; the action-log replay harness (node test:
  fixed seed + recorded action list -> deep-equal final GameState on the current v1 flow),
  with a versioned replay fixture regenerated on Action-schema changes.
- Expected patches: 4.

### Workstream: WS-E-sources (M1)

- Owner: coder.
- Needs: none (reads reference repos and the extraction summaries).
- Provides: `docs/RULE_SOURCES.md` - every known rule conflict with chosen value, source file,
  secondary source, and reason (including: colony rating PM vs 1983, colony-event model PM
  deck vs 1983 remaining/slots, pub array TSavo transcription error, standard round count,
  species handicaps recorded-but-cosmetic, 1983 beginner stock tables recorded-but-unused,
  smithore floor details, replay-validity-per-build policy); the extraction workflow section;
  `docs/REFERENCE_REPOS.md` - a reading guide for `OTHER_REPOS/`: planet_mule Java layout
  (where `GameData`, `Properties`, `model/`, `model/map/` live, which classes own which
  system, how to verify a constant), the Kroah doc + disassembly (BTU/PTU/ATU units, how to
  grep the labeled `.asm`: `goodsPrice`, `calcMuleReq`, `roundEventsProb`, `wampusTime`),
  TSavo audit caveats, and `mule_rules.md` as the prose companion; the constant-metadata
  audit test (node test asserting every exported rule constant in `constants.ts` carries a
  source comment).
- Expected patches: 2.

### Workstream: WS-A-spec (M1)

- Owner: coder.
- Needs: none.
- Provides: written style spec (`docs/active_plans/active/mule_art_style_spec.md`): clean
  modern SVG in the spirit of Planet M.U.L.E.'s presentation (smooth shapes, readable
  silhouettes, subtle depth) with retro palette accents - the user's "modern stylings"
  direction - and ~20 named palette tokens in `palette.ts` (Atari-era hues, WCAG-checked per
  `docs/COLOR_CONTRAST_ACCESSIBILITY.md`, colorblind-distinct player colors); the automated
  style check (sprites use palette tokens only); behavior-focused readability criteria for
  later fixtures (terrain distinguishability, avatar visibility, ownership clarity, outfit
  clarity, price readability); `.gitignore` entries for `OTHER_REPOS/` and `mule.nes`.
- Expected patches: 1-2.

### Workstream: WS-U-port (M2)

- Owner: expert_coder.
- Needs: WS-U-solid.
- Provides: remaining screen ports (land grant, store menu, auction track, production,
  scoring); `scene_manager.ts` rAF fixed-timestep loop + tick accumulators replacing every
  setTimeout chain; the tick-ownership invariant test; KeyState poller in `input.ts`;
  `?seed=` / `?speed=` params replacing the `Date.now()` seed; deletion of legacy renderer
  modules; the mini headless harness (scripted one-phase flow through the real UI).
- Expected patches: 4.

### Workstream: WS-E-blooms (M2)

- Owner: coder.
- Needs: WS-E-foundation.
- Provides: bloom seeding in `map.ts` (4 blooms, manhattan rings, river 0, meteorite can set
  4); `assay_plot` action; spoilage update (food half, energy quarter, smithore/crystite keep
  max 50); `visibleCrystite` selector so the UI renders only revealed levels.
- Expected patches: 2.

### Workstream: WS-A-terrain (M2)

- Owner: coder.
- Needs: WS-A-spec.
- Provides: `sprites_terrain.ts` tile set (plains, river, 3 mountain tiers, town, crater -
  crater added for the meteorite event; original river-column map layout kept) and map reskin
  keeping `data-terrain` selectors; terrain-readability fixture spec.
- Expected patches: 2.

### Workstream: WS-E-prices (M3)

- Owner: expert_coder.
- Needs: WS-E-blooms.
- Provides: `StoreState.prices` + `updateStoreForNewRound` per the PM pricing formulas (M3
  exit criteria); store food spoilage; average-price feedback; stock caps; pricing unit tests
  incl. clamp and floor edges.
- Expected patches: 2-3.

### Workstream: WS-E-mules (M3)

- Owner: coder.
- Needs: WS-E-foundation.
- Provides: mule stock cap + smithore rebuild + price coupling; food-scaled develop timer;
  rank-ordered turn queue with mule-shortage reversal; mid-game rank exposure; per-mode
  starting-goods and store-stock tables; negative-economy invariants for buy/outfit paths.
- Expected patches: 2-3.

### Workstream: WS-A-actors (M3)

- Owner: coder.
- Needs: WS-A-spec.
- Provides: `sprites_species.ts` (8 avatars, 2-dir walk, 2-3 frame swap, player-color tint,
  reduced-motion snap); `sprites_mule.ts` (walk, towed, installed, outfit markers, escape
  pose); avatar-visibility + outfit-clarity fixture spec.
- Expected patches: 2-3.

### Workstream: WS-U-auction (M4)

- Owner: expert_coder.
- Needs: WS-U-port, WS-A-actors.
- Provides: `AuctionScene.tsx` (avatars on price axis, tweening, band lines, trade animation,
  role controls); keyboard-playability + reduced-motion specs for the scene; price-readability
  fixture; auction bookkeeping moves out of `game_driver.ts`; spec migration.
- Expected patches: 2-3.

### Workstream: WS-E-auction (M4)

- Owner: coder.
- Needs: WS-E-prices.
- Provides: goods-auction fidelity per M4 exit criteria; `auction_ai.ts` retune with sim
  evidence; auction cannot-stall watchdog test; auction-transfer economy invariants.
- Expected patches: 2-3.

### Workstream: WS-E-land (M5)

- Owner: coder.
- Needs: WS-E-auction (machinery), WS-E-mules (rank).
- Provides: `land_auction.ts` + phase + `bid_land` per M5 exit criteria; `land_ai.ts` bids
  with cannot-stall test and affordability invariant.
- Expected patches: 2-3.

### Workstream: WS-U-overworld (M5)

- Owner: expert_coder.
- Needs: WS-U-port, WS-A-actors.
- Provides: `OverworldScene.tsx` + `walker.ts` / `zones.ts` (pure, node-tested); spatial
  placement; interim store overlay; `data-cell-*` / `data-carrying` selector contract;
  keyboard-playability + reduced-motion specs.
- Expected patches: 2-3.

### Workstream: WS-A-town (M5)

- Owner: coder.
- Needs: WS-A-spec.
- Provides: `sprites_town.ts` (buildings: store with outfit counters, pub, assay, corral,
  exits - fresh layout serving the same walk-in flow the original town delivers); auction
  arena backdrop and axis chrome; building/zone-readability fixture spec.
- Expected patches: 2-3.

### Workstream: WS-E-events (M6)

- Owner: expert_coder.
- Needs: WS-E-blooms, WS-E-prices, WS-E-mules.
- Provides: `events.ts` personal + colony systems per M6 exit criteria; `eventHistory` state;
  payload event lists; production modifier plumbing into `economy.ts`; event-money economy
  invariants; fairness property tests.
- Expected patches: 3-4.

### Workstream: WS-U-events (M6)

- Owner: coder.
- Needs: WS-U-port (vignette art arrives M8; text banners carry M6).
- Provides: event banner/vignette presentation components consuming payload event lists.
- Expected patches: 2.

### Workstream: WS-E-production (M7)

- Owner: coder.
- Needs: WS-E-events (modifier plumbing).
- Provides: mode-scaled gaussian variance, learning-curve bonus `floor(n/3)`, adjacency,
  random-order energy shortfall zeroing, clamp [0,8].
- Expected patches: 2.

### Workstream: WS-U-town (M7)

- Owner: expert_coder.
- Needs: WS-U-overworld, WS-A-town.
- Provides: `TownScene.tsx` per M7 exit criteria; store overlay deletion; full-loop spec;
  full-game headless harness `tests/e2e/e2e_full_game.mjs` (grown from the M2 mini harness).
- Expected patches: 3-4.

### Workstream: WS-E-critters (M8)

- Owner: coder.
- Needs: WS-E-events (payload pattern), WS-E-mules (tick semantics).
- Provides: wampus state + `hunt_wampus`; `gamble`; assay tick costs; species (cosmetic) +
  mode config in `createInitialGameState`; AI gamble/hunt/assay/crystite heuristics with
  cannot-stall tests; gamble economy invariant.
- Expected patches: 2-3.

### Workstream: WS-U-critters (M8)

- Owner: coder.
- Needs: WS-U-town, WS-E-critters.
- Provides: wampus render/blink/catch; mule-escape animation; `ai_actor.ts` fast-forward +
  skip with skip-equivalence spec; species/mode select screens.
- Expected patches: 3.

### Workstream: WS-A-title (M8)

- Owner: coder.
- Needs: WS-A-spec, WS-A-actors.
- Provides: title screen (logo, planet backdrop, starfield), species-select art, event
  vignette icons (`sprites_events.ts`), HUD chrome + timer bar styling; fixture specs.
- Expected patches: 2-3.

### Workstream: WS-E-endgame (M9)

- Owner: coder.
- Needs: WS-E-prices (goods valuation), WS-E-critters.
- Provides: scoring, PM colony rating, First Founder, colony-failure check per M9 exit
  criteria; threshold edge tests.
- Expected patches: 2.

### Workstream: WS-U-polish (M9)

- Owner: coder.
- Needs: WS-U-port (loop), WS-E-endgame.
- Provides: `LandGrantScene.tsx` sweep cursor (`claim_current_plot`), `ProductionScene.tsx`
  yield pops, `Dpad.tsx`, relaxed timers, full a11y audit pass, scoring screen.
- Expected patches: 2-3.

### Workstream: WS-balance (M10)

- Owner: expert_coder.
- Needs: all engine workstreams.
- Provides: baseline sweep, then the colony pass band set from baseline (two-step decision,
  recorded); tuning experiments to pass final sim gates - candidate constants compared by sim
  metrics, winners kept with before/after numbers in the changelog.
- Expected patches: 2-3.

### Workstream: WS-release (M10)

- Owner: coder.
- Needs: WS-balance.
- Provides: docs refresh, screenshot refresh, repo-wide placeholder audit, changelog
  close-out, plan archive via `git mv`.
- Expected patches: 1-2.

### Workstream: WS-E-replay (M11)

- Owner: expert_coder.
- Needs: M10 (stable Action schema).
- Provides: localStorage autosave of (buildVersion, seed, action log) after every dispatch;
  Resume-on-load when the build matches (silently discarded otherwise, honoring the
  same-build replay policy); `ReplayScene.tsx` playback of recorded logs at any speed.
  Files: `src/ui/game_store.ts`, `src/ui/scenes/ReplayScene.tsx`, `src/ui/save_log.ts`.
  Validation: Playwright reload-mid-game spec; replay-viewer spec on a committed fixture log.
- Expected patches: 2-3.

### Workstream: WS-AI-personas (M11)

- Owner: coder.
- Needs: M10 (tuned baseline AI).
- Provides: three named personality profiles (land baron, ore speculator, farmer) as
  parameter sets over the existing heuristics in `src/ai/`, random assignment per game with
  seed-deterministic choice. Validation: sim gate - each personality's win rate inside the
  M10 band over 100 seeded games; cannot-stall tests rerun per personality.
- Expected patches: 2.

### Workstream: WS-U-delight (M11)

- Owner: coder.
- Needs: M10.
- Provides: first-run tutorial hints per phase (dismissible, localStorage-backed, keyboard
  accessible); ambient animation pass (river shimmer, mule idle, auction trade pop, title
  starfield) gated by `prefers-reduced-motion`; PWA manifest + icons + offline cache wired
  into `build_github_pages.sh`. Validation: hint-dismissal spec, reduced-motion spec,
  Playwright installability check.
- Expected patches: 3.

### Workstream: WS-balance-report (M11)

- Owner: coder.
- Needs: WS-balance (sim metrics).
- Provides: the balance sim emits an HTML dashboard (price curves per round, win rates per
  seed and personality, trade volumes, event frequencies) into
  `output_smoke/balance_report/`, regenerated by one command documented in `docs/USAGE.md`.
  Validation: report generated in the M11 gate run; node test asserts report sections exist.
- Expected patches: 1-2.

## Work packages

Work packages are the workstream deliverables split on natural seams; each workstream lists its
patch range and every patch is a work package sized for one coder with one clear outcome and
one verification step. Dependencies are the workstream `Needs:` lines; packages within a
workstream are serial for that owner, packages across workstreams run in parallel.
Shared-file ownership per milestone keeps lanes conflict-free: `constants.ts` and
`game_state.ts` belong to the engine lane; `style.css`, `index.html`, and `pipeline/build.mjs`
to the UI lane; `palette.ts` and `sprites_*.ts` to the art lane. Verification commands for
every package: `./check_codebase.sh`, `node --test tests/`, the targeted Playwright spec, and
(engine packages) the balance-sim run.

## Acceptance criteria and gates

- Per-patch gate: `./check_codebase.sh` passes (typecheck, lint incl. purity gate, unit tests,
  build); new constants carry source comments (enforced by the constant-metadata audit test);
  `docs/CHANGELOG.md` updated; every extraction patch names in its notes the source consulted,
  the chosen behavior, and the independent test that verifies it - the visible evidence that
  the formula was re-expressed as fresh TypeScript; Solid
  patches state store boundary, props handling, list rendering, and derived-state pattern in
  their notes, with component behavior tests where a stale-DOM bug would pass typecheck.
- Integration gate (per milestone): full Playwright suite green at `?speed=8` with fixed
  seeds; balance sim (30+ seeded AI-vs-AI games) shows no crash, no negative money, game
  terminates; placeholder audit clean for the milestone's new files.
- Automated play gate: mini harness from M2, full-game harness from M7, both green.
- Accessibility gate: from the first spatial scene (M4), each scene ships keyboard-playable
  with an emulated reduced-motion spec; M9 runs the full audit.
- Art gate: automated style checks plus per-scene visual-readability fixtures (terrain
  distinguishability, avatar visibility, ownership clarity, outfit clarity, price
  readability); screenshots regenerated for review.
- Final release gates (M10, 100+ seeded 12-round sims): dead-auction-window rate < 0.2; colony
  success rate inside the band set by the two-step baseline decision; round-6 leader wins
  < ~50% (event fairness works); median game trades all four goods; no player ends below $0;
  replay determinism (same seed + action log -> identical final state).

## Test and verification strategy

- Node unit tests per engine module (pricing clamps and floors, curve values, event fairness
  properties, bloom seeding, timer proportionality, turn-order reversal at mule stock 7/8,
  bounty and pub caps, scoring and rating edges) following the existing `tests/*.mjs` pattern.
- Negative-economy invariants: every money-changing action (buy, outfit, bid, gamble, event
  penalty, auction transfer, land auction) has an affordability or clamp rule with a unit
  test, landing with the module that introduces it.
- AI cannot-stall tests: for land bids, auction, develop, wampus, pub, assay, and crystite
  selling, a fixed-seed stress test with watchdog ticks proves the AI always returns a legal
  action or an explicit pass/end-turn.
- Constant-metadata audit test (M1): every exported rule constant carries a source comment.
- Action-log replay harness (M1): fixed seed + recorded actions -> deep-equal final GameState;
  fixture versioned per build - action logs are valid within one build only, regenerated on
  Action-schema changes. Every later mechanic that adds a random roll or a new Action extends
  the replay fixture in the same patch, keeping replay coverage current.
- Tick-ownership invariant test (M2): exactly one scheduler drives engine ticks; fixed-seed
  phase progression under `?speed=`.
- Headless harnesses: M2 mini (one phase transition through the real UI), M7 full game (New
  Game -> scoring, both modes, fixed seeds, zero page errors) - the automated stand-in for a
  human playthrough.
- Balance sim promoted from scratchpad to `tests/e2e/e2e_balance_sim.mjs` (outside the pytest
  fast lane per `docs/E2E_TESTS.md`); rerun after any economy/AI change - the lesson from the
  auction-direction bug; doubles as the experiment harness for tunable constants.
- Playwright: selector-contract specs per scene (`data-actor`, `data-cell-*`, `data-carrying`,
  `data-zone`, `[data-wampus]`), driven by `?seed` / `?speed` / `?demo=` hooks; held-key
  movement via `page.keyboard.down/up` + `expect.poll`; skip-equivalence spec; emulated
  `prefers-reduced-motion` specs per spatial scene.
- Pure UI-math unit tests for `walker.ts`, `zones.ts`, tick accumulator (no DOM).
- Placeholder audit per milestone: new docs, tests, fixtures, and scenes are real and
  exercised (hygiene test + targeted grep for placeholder language).
- Solid-specific: granular-update checks per `solid-js-expert` testing guidance where a
  reactivity bug would be silent (store `reconcile` keeps DOM nodes stable across dispatch).

## Migration and compatibility policy

- Additive rollout: each milestone leaves the game fully playable; the one interim hybrid
  (store menu overlay, M5-M6) is explicit and replaced at M7.
- Backward compatibility: no cross-version saves owed; `Phase` union and payloads may change
  freely between milestones. The guarantee is same-build replay: action logs are deterministic
  within one build/version, which powers the M11 autosave/resume and replay viewer; a saved
  log from a different build surfaces a brief "unavailable for this version" notice; the
  versioned replay fixture is regenerated when the Action schema changes.
- Legacy deletion criteria: legacy vanilla renderers deleted at M2 as their Solid ports pass
  specs; store overlay deleted at M7; setTimeout chains deleted at M2; placeholder sprites
  deleted as each art module replaces them; every deletion lands in the same patch as its
  replacement's passing specs.
- Rollback strategy: work lands as reviewable patch series on agent branches with each
  milestone's integration gate green before merge preparation; a milestone that fails its gate
  is fixed forward on its branch.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| Source conflict between 1983 and planet_mule values | Fidelity drift | Constant review | WS-E-sources | Authority order + `docs/RULE_SOURCES.md` decisions + metadata audit test |
| React-habit Solid bugs (destructured props, `map` for lists, effects for derived state) | Silent reactivity breakage | Stale UI in review | UI lane | `solid-js-expert` on every UI package; patch notes name the patterns used; behavior tests where stale DOM passes typecheck |
| Solid port regresses screens (M1-M2) | Playwright failures, delayed foundation | Port patch review | WS-U-solid/port owner | Proof patch first (one screen end to end); port screen-by-screen; specs stay green per patch; data-attribute contract frozen |
| Mixed timing regimes during M2 (setTimeout vs rAF) double-tick engine | Corrupted game flow | Tick-ownership test fires | WS-U-port owner | Convert all scheduling in M2 ahead of any spatial feature; invariant test in CI |
| Resource-union widening breaks many call sites at once | Big-bang patch | M1 WS-E-foundation | engine lane | Lands alone as Patch 1, compiler-driven sweep, zero behavior change |
| Economy retune re-breaks auction liveness | Dead auctions return | Sim gate regression | engine lane | Balance sim gate enforced on every economy/AI patch |
| Money paths cross zero via events/gambling/auctions | Negative-balance states | Invariant test failure | engine lane | Per-module negative-economy invariants land with each mechanic |
| AI stalls on a new decision point | Game hangs | Watchdog test failure | AI lane | Cannot-stall test per decision point, fixed-seed stress runs |
| Real-time Playwright flakiness | CI churn | Spec timeouts | UI lane | `?seed` + `?speed` + poll-only assertions on data attrs |
| Art inconsistency or unreadable scenes | Visual mishmash | Style/readability fixture failures | art lane | Style spec + palette + automated checks land first; per-scene readability fixtures |
| Spatial rework degrades accessibility | Keyboard/AT users locked out | Per-scene a11y spec failures | UI lane | Keyboard + reduced-motion gates from the first spatial scene (M4), full audit M9 |
| Reference-code influence beyond rules | License exposure | Code review | all | Formulas and constants cited as data; fresh TypeScript and fresh art authored in-repo |

## Rollout and release checklist

- [x] M1-M11 integration gates green in order. (every per-milestone gate below is green; all
      milestone reviews PASS, final gates green)
- [x] Final sim gates green (100+ seeded games) with the two-step colony band recorded (see
      `docs/RULE_SOURCES.md` "M10 balance sim record"; standard round-6-leader win 38.6-38.8%,
      colony 93.3-96.7%).
- [x] Headless playthrough harness green at both modes, three seeds. (`tests/e2e/e2e_full_game.mjs`
      now runs a beginner+standard x seeds 1/3/7 matrix, 6/6 PASS x3 consecutive runs, 2026-07-09)
- [x] `./build_github_pages.sh` build plays a headless full game with no page errors
      (`e2e_full_game.mjs`).
- [x] Repo-wide placeholder audit clean (see `docs/CHANGELOG.md` 2026-07-09, Developer Tests and
      Notes: only the documented benign `tools/generate_pwa_icons.mjs` comment and two harmless
      false positives).
- [x] Screenshots + README refreshed; `docs/USAGE.md`, `docs/CODE_ARCHITECTURE.md`,
      `docs/FILE_STRUCTURE.md` updated (Solid layer + new modules documented).
- [ ] `VERSION` bump prepared (CalVer) for the release cut. (human release-cut decision, not yet
      made)

## Documentation close-out requirements

- Active plan / progress tracker: copy this plan to
  `docs/active_plans/active/mule_fidelity_plan.md` at kickoff; per-milestone status updates in
  place; `git mv` to `docs/archive/` at completion.
- docs/CHANGELOG.md entry: every patch adds a bullet under the day block; milestone
  completions, rule adjudications, and sim-experiment outcomes noted under Decisions and
  Failures.
- `docs/RULE_SOURCES.md`: kept current as conflicts are settled; final pass at M10.
- Archive / closure notes: final entry summarizing adopted vs adjusted values and final
  sim-gate numbers.

## Patch plan and reporting format

- Patches reported as "Patch 1", "Patch 2", ... numbered lane-locally per workstream (lanes
  run in parallel, so each workstream counts its own patches) in changelog and status updates
  (1-2 reviewable patches per coder per week; split any patch touching more than two
  components).
- WS-E-foundation Patch 1: Resource-union widening (mechanical, zero behavior change) - lands
  alone and first within the engine lane.
- WS-U-solid Patch 1: the Solid proof (build path + store + one screen).
- Each milestone's last patch: tests, docs, changelog sweep for that milestone.

## Execution notes for implementers

- Dispatch: `delegate-manager-to-subagents` / `parallel-plan` per milestone; each work package
  goes to a fresh subagent with a self-contained prompt, one outcome, one verification step.
- Type-system work (Resource union widening, Action/payload discriminated unions, strict-mode
  sweeps) invokes the `typescript-engineer` skill; all UI component work invokes
  `solid-js-expert`; the game overlay workflow follows `html-game-parallel-builder`.
- Rule adjudication procedure (standing, no external input needed): consult the Kroah doc
  first; verify numerically against `OTHER_REPOS/planet_mule/data_decompiled/` Java; for
  remaining doubt, grep the labeled disassembly (`goodsPrice`, `calcMuleReq`,
  `roundEventsProb`, `wampusTime`, ...); record the decision in `docs/RULE_SOURCES.md` and the
  constant's source comment.

## Resolved decisions

- Emulation target is Planet M.U.L.E. - its values, behaviors, and modern presentation - at
  the classic core feature set; lab items, assay bot, and player land selling stay out
  (user, 2026-07-08).
- Adopt SolidJS for the UI layer (user, 2026-07-08); toolchain via the sanctioned
  `pipeline/build.mjs` + `esbuild-plugin-solid` path in `docs/TYPESCRIPT_STYLE.md`.
- Standard mode = 12 rounds (user; PM and the Kroah doc agree - TSavo's "standard = 8" claim
  was wrong).
- Species starting money flat $1000, species cosmetic (user; PM standard behavior); 1983
  handicaps recorded in `docs/RULE_SOURCES.md` as a future data toggle.
- Title mode picker offering beginner (6 rounds) and standard (12) (user).
- Wampus stays in scope (present in both PM and the 1983 original).
- Art direction: clean modern SVG in PM's presentational spirit with retro palette accents
  (user: "more of the modern stylings").
- Pub payout array `[50,50,...,200]` + `randInt(0, 2*ticksLeft)`, cap 250 (PM extraction,
  confirmed by Kroah; TSavo transcription rejected).
- Colony rating uses the PM formula `clamp(total / (20000 * rounds/12), 0, 6)`; the 1983
  variant recorded in `docs/RULE_SOURCES.md`.
- Colony events: PM pre-shuffled weighted deck with A/B split; the 1983 remaining/slots model
  recorded in `docs/RULE_SOURCES.md`.
- Land grant presentation: engine-driven sweep cursor at M9; `claim_plot` retained for AI and
  tests.
- Terrain: crater added for the meteorite event; original river-column map layout kept;
  planet_mule water/small-water/desert variants excluded.
- Auction transfer-rate constants: tick-mapped values chosen by sim experiment, recorded with
  sim numbers (the sim is the decision procedure).
- `OTHER_REPOS/` and `mule.nes` enter `.gitignore` in M1 (reference material stays
  local-only).
- Rule-source conflicts are settled by the documented authority order and recorded in
  `docs/RULE_SOURCES.md`; the plan carries no open adjudications.

## Open questions and decisions needed

- None. Every previously open item is resolved above or converted into an in-plan decision
  procedure (sim experiments for tunables, authority order + RULE_SOURCES.md for source
  conflicts, two-step baseline decision for the colony pass band).
