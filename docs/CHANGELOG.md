# CHANGELOG.md

## 2026-07-09

### Additions and New Features

- Docs: added `docs/ROADMAP.md`, drawn from the auction seller-out-of-goods
  gap (`docs/TODO.md`), the walk-speed tuning recommendation
  (`docs/active_plans/audits/mule_trip_timing.md`), the fidelity plan's
  unchecked release-cut checklist item, and the recorded-but-unbuilt species
  handicap / tournament data toggles plus the excluded sound-and-music pass
  (`docs/RULE_SOURCES.md`, `docs/archive/mule_fidelity_plan.md`).
- Docs: refreshed `docs/RELATED_PROJECTS.md` with a sourced, confidence-tiered
  map of related M.U.L.E. projects. Confirmed tier: the 1983 original,
  Planet M.U.L.E. (cross-linked to `docs/REFERENCE_REPOS.md` for its role as
  this project's primary rule-and-formula source rather than duplicating
  that file-by-file breakdown), M.U.L.E. Returns, `LionsPhil/mewl`, plus two
  new entries drawn from `OTHER_REPOS/repos.txt`: `TSavo/mule-game` (audit
  cross-check only) and Kroah's M.U.L.E. reverse-engineering page (heritage
  cross-check). Possible tier: `eric108/MULE`, `nik0kin/mule`, `parasj/MULE`,
  and the osgameclones.com directory entry, from one bounded two-round web
  search pass.
- Docs (docset refresh, conditional docs audit): added `docs/TROUBLESHOOTING.md`
  with four symptom-first entries backed by real repo evidence -- a build
  failure right after `devel/dist_clean.sh` deletes `node_modules/` alongside
  `dist/`, the `npm install` passthrough stall for autonomous agents (fixed by
  `bash devel/setup_typescript.sh` instead), the continuous-hold walk-helper
  race behind `town_scene.spec.mjs`/`pub_gamble.spec.mjs` door-walk flakes
  under parallel Playwright workers, and the "Saved game unavailable for this
  version." title-screen notice from `save_log.ts`'s build-version-gated
  resume. Skipped `docs/DEVELOPMENT.md` (the dev loop is already documented
  with concrete commands in `docs/USAGE.md` and `docs/E2E_TESTS.md`; a pointer
  doc would only duplicate them), `docs/COOKBOOK.md` and `docs/FAQ.md` (no
  repo evidence of recurring extended scenarios or misconceptions beyond what
  `docs/USAGE.md` already covers), and a file-I/O doc
  (`INPUT_FORMATS`/`OUTPUT_FORMATS`/`FILE_FORMATS`; the game's only data
  interfaces are a `localStorage` save slot and a generated HTML balance
  report, neither a user-facing file format).
- AI (M11 WS-AI-personas): three named AI personality profiles -- land baron,
  ore speculator, farmer -- as parameter sets layered over the existing
  develop/land/auction heuristics (new `src/ai/personas.ts`), not new
  decision branches. `personalityForPlayer(state, playerId)` is a pure
  function of `(state.seed, playerId)` only (no RNG stream, no new
  `GameState` field), so the same seed always assigns the same personalities
  regardless of call order (replay-safe); the human seat is always excluded.
  `develop_ai.ts`'s scarcest-resource pick and crystite-vs-scarcest outfit
  comparison, `land_ai.ts`'s land-bid valuation, and `auction_ai.ts`'s buyer
  price ceiling each read the deciding player's persona parameters, always
  layered on top of (never instead of) the personality-independent M10
  rank-aware land-bid dampening and every money-safety reserve/ceiling. New
  `tests/test_personas.mjs` (9 cases: assignment determinism, human-seat
  exclusion, full-coverage across seeds, and one full-game cannot-stall
  watchdog run per named personality). `tests/e2e/e2e_balance_sim.mjs` gains
  a per-personality win-rate report and a 100+-seed, standard-mode release
  gate (each personality's win rate inside 15-35%, centered on the M10
  ~25%-per-seat baseline); the 120-seed release run reports land_baron 30.8%,
  ore_speculator 27.9%, farmer 20.3%, all inside the band, alongside every
  other M10 release gate passing. See docs/RULE_SOURCES.md, "AI
  personalities".
- UI (M11 WS-U-delight): first-run tutorial hints, an ambient animation pass,
  and PWA install. New `src/ui/hint_store.ts` owns a localStorage-backed
  dismissed-hint set (`mule-game-hints-dismissed-v1`, deliberately separate
  from `save_log.ts`'s autosave key -- a standing UI preference, not part of
  a resumable game), with a `?hints=off` escape hatch. New
  `src/ui/solid/tutorial_hint.tsx` renders one dismissible `[data-tutorial-
hint]` notice per phase kind (Escape or its "Got it" button dismisses;
  Escape uses `stopImmediatePropagation` since SolidJS delegates `keydown`
  through a single document dispatcher, so an ordinary `stopPropagation`
  would not stop a sibling panel's own raw `document.addEventListener`
  Escape binding -- see the component's own doc comment), mounted in
  `land_grant_panel.tsx` (human's turn), `land_auction_panel.tsx` (while
  open), `game_screen.tsx`'s develop panel (human's turn), `auction_screen.
tsx`, and `human_develop_layer.tsx` (on entering town, without touching
  town_scene.tsx itself). Ambient animation: a river-tile shimmer and
  installed-M.U.L.E. idle bob (`map_layer.tsx`'s new `.terrain-tile-use` /
  `.mule-installed-glyph` CSS hook classes) and an auction trade-flash pop,
  all pure CSS gated behind `@media (prefers-reduced-motion: no-preference)`
  -- no DOM/attribute changes under reduced motion, so the calibrated
  `visual_render.spec.mjs` thresholds (measured with reduced motion emulated)
  are unaffected. PWA install: `src/manifest.json` + `src/sw.js` (a
  cache-first offline cache of the static bundle, `self.clients.claim()` on
  activate) copied into `dist/` by `build_github_pages.sh`, plus two
  generated icon PNGs (`tools/generate_pwa_icons.mjs`, a pngjs-rasterized
  ringed-planet badge reusing the title screen's own planet/ring palette
  tokens) written to `dist/icons/`; `src/ui/pwa_register.ts` registers the
  worker once from `main.tsx`. New tests: Playwright specs
  `tutorial_hint` (dismiss-once, Escape, reload persistence, `?hints=off`),
  `ambient_reduced_motion` (asserts `getComputedStyle(...).animationName`
  directly, not a duplicated `data-reduced-motion` attribute), and
  `pwa_install` (manifest fields + icon fetch, service-worker registration,
  and an offline reload -- the pragmatic installability proxy in place of a
  full Lighthouse audit).

- Engine+UI (M11 WS-E-replay): autosave/resume and a replay viewer, built
  entirely on the existing pure-reducer/Action seam (no engine changes). New
  `src/ui/save_log.ts` owns the saved representation -- `(buildVersion, seed,
mode/species selection, relaxedTimer, speed, action log)` in a single
  localStorage slot (`mule-game-save-v1`) -- plus the reducer-replay helpers
  (`initialStateFromSave`, `replayToState`) shared by resume and the viewer, and
  a shared `buildSpeciesTuple`. `game_store.ts`'s `createGameStore` gains an
  optional `onDispatch` recorder hook (default off), keeping "dispatch is the
  sole writer" while leaving the store ignorant of seed/selection/buildVersion.
  `game_driver.ts` wraps every game (new and resumed) in an autosaving store
  that appends each dispatched action to the log and rewrites the save after
  every dispatch, so the persisted log stays exactly one action behind live
  state; `resumeSavedGame` replays the log through the reducer to rebuild the
  exact state before live play continues. The title screen (`title_screen.tsx`)
  offers Resume for a matching-build save (`#resume-game-button`), shows a brief
  "Saved game unavailable for this version." notice for a save from another
  build (`[data-saved-game-notice]`, discarded on sight, honoring the same-build
  replay policy), and adds a keyboard-accessible "Watch demo replay" control
  (`#watch-replay-button`). New `src/ui/scenes/replay_scene.tsx` plays a
  committed fixture log (`src/ui/scenes/replay_fixture.ts`, a full seed-2026
  6-round game, 1298 actions) back through the ordinary `GameScreen` on an rAF
  stepper at any `?speed=`, with play/pause, restart, and a speed radiogroup
  transport (`[data-replay-transport]` exposing step/total/phase/done);
  entered via `?replay=fixture` or the title control. Build id: `pipeline/
build.mjs` injects `__MULE_BUILD_VERSION__` (a 12-char sha256 of the `src/`
  tree) via esbuild `define`, single-pass, changing whenever any source and
  therefore possibly the reducer changes -- the granularity same-build replay
  needs. New tests: `tests/test_save_log.mjs` (10 cases: round-trip, corrupt/
  wrong-shape rejection, build-match gating, fixture replay to scoring) and
  Playwright specs `reload_resume`, `replay_viewer`, `build_mismatch_notice`.

- Tooling (M11 WS-balance-report): new `tools/balance_report_generator.mjs`
  renders every `e2e_balance_sim.mjs` metric into one self-contained HTML
  dashboard (hand-drawn inline SVG, no charting library) -- a per-round price
  curve per good, win rates broken out by seed and by AI personality,
  per-good trade volumes, and a gate-vs-target table pairing each release
  gate with the value the run measured. `e2e_balance_sim.mjs` gains a
  `--report` flag: after its usual gate run it writes
  `output_smoke/balance_report/index.html` via the new `buildReportData`
  helper (pure aggregation over the sim's existing per-seed results, no new
  sim-tuning constants). New `tests/test_balance_report.mjs` runs the real
  `e2e_balance_sim.mjs --report` command at a tiny seed count (fast enough
  for the node test lane) and asserts the written HTML carries every
  required section anchor (gate table, every chart, event-frequency stat
  tiles). See [docs/USAGE.md](USAGE.md) for the one-command regeneration.
- Sim harness (M10 WS-balance): `tests/e2e/e2e_balance_sim.mjs` gains three
  report metrics for the M10 baseline and final gates -- per-good trade
  volumes with the per-good median trade count and the share of games that
  trade each good (the "median game trades all four goods" signal), the
  winner-seat spread (wins per player index 0-3, a seat-fairness check), and
  the round-6-leader-final-win correlation retained from before. The colony
  success rate and rating-tier histogram (M9) stay reported. See
  docs/RULE_SOURCES.md "M10 balance sim record".
- Engine+UI (M9 WS-U-polish, land grant): `LandGrantPayload` gains an
  engine-driven sweep cursor (`sweepRow`/`sweepCol`), seeded at the first
  free plot each round (`land_grant.ts` `createLandGrantPayload`/
  `firstFreePlot`) and advanced by one free plot per `tick` while the phase
  is active (`advanceSweepCursor`, wrapping; `turn.ts` `applyTick`'s new
  `land_grant` branch), matching planet_mule's continuous sweep-and-claim
  presentation (300ms dwell per plot, from `GameData.landGrantPlotDuration`
  = 18 frames at 60fps; see docs/RULE_SOURCES.md "Land grant: engine-driven
  sweep cursor"). New `claim_current_plot` action claims whichever plot the
  cursor sits on for the current picker; `claim_plot` (explicit row/col) is
  unchanged and stays the path `land_ai.ts` and every existing engine test
  use. `worstRankedClaimant` implements PM's worst-rank-wins collision
  tie-break as a pure, independently unit-tested function (not yet
  reachable through normal play, since this engine's picker order stays
  turn-sequential -- see the RULE_SOURCES entry for why). UI:
  `land_grant_panel.tsx` drops manual arrow-key cursor movement in favor of
  reading the engine's sweep position; Enter/Space now dispatch
  `claim_current_plot`, and `game_screen.tsx`'s board cursor and plot-click
  handler read the sweep position straight from the payload. 5 new
  `tests/test_turn.mjs` cases; `tests/playwright/game_flow.spec.mjs`'s
  keyboard-nav spec rewritten for the animated cursor; a shared
  `claimCurrentLandGrantPlot` helper (Enter-key claim, robust against the
  cursor's timing-dependent position) replaces the old "click the first
  unowned plot" pattern across `ai_actor_live`, `auction_scene`,
  `event_banner`, `game_flow`, and `e2e_mini_flow` specs, which raced the
  sweep and intermittently stalled full-game playthroughs under parallel
  worker load.
- UI (M9 WS-U-polish): the scoring screen (`scoring_panel.tsx`) now renders
  the full `ScoringPayload` the M9 engine lane built: a per-player
  score-breakdown table (money/land/mules/goods/total, ranked, winner
  marked), a colony status banner (the failure message when the colony
  failed, otherwise the colony total plus its Federation rating tier
  message), and a First Founder callout when one was awarded. Selector
  contract: `.scoring-panel[data-colony-failed]`, `.scoring-colony-status
[data-colony-total][data-colony-rating-tier]`, `.scoring-first-founder
[data-first-founder]`, and per-row `.scoring-row[data-player][data-money]
[data-land][data-mules][data-goods][data-total]`. New
  `tests/playwright/scoring_screen.spec.mjs` drives a full seeded beginner
  game to the scoring screen and asserts every field renders and the
  breakdown sums to the total.
- UI (M9 WS-U-polish): `production_panel.tsx` gains a yield-pop entrance
  animation -- each resource value scales/fades in with a per-resource
  stagger (`YIELD_POP_STAGGER_MS`) as the panel mounts, gated off under
  `prefers-reduced-motion` (values render at rest immediately), matching
  `event_banner.tsx`'s established reduced-motion pattern. The engine's
  `ProductionPayload` carries only player-level totals (this workstream's
  engine edits stay scoped to the land-grant sweep cursor, per the plan's
  lane boundary), so the pop animates the existing player-level numbers
  rather than a new per-plot map overlay, which would need a new engine
  field this workstream does not own.
- UI (M9 WS-U-polish): `src/ui/scenes/dpad.tsx`, a touch d-pad for avatar
  movement. Four direction buttons dispatch synthetic `ArrowUp`/`Down`/
  `Left`/`Right` `keydown`/`keyup` `KeyboardEvent`s on `document` -- the
  same input path `OverworldScene`'s and `TownScene`'s existing
  `createKeyState()` pollers already listen to, so one mount in
  `human_develop_layer.tsx` covers movement in both scenes with no
  scene-side change, and keyboard input is completely unaffected. Hidden on
  non-touch pointers via `@media (pointer: coarse)` in `style.css`. New
  `tests/playwright/dpad.spec.mjs` (2 specs, using Playwright's `hasTouch`
  context option to emulate a coarse pointer) covers visibility gating and
  that a held d-pad button actually moves the avatar.
- UI (M9 WS-U-polish): a relaxed-timer option (`?timer=relaxed`, plus a
  title-screen `RelaxedTimerToggle` switch) doubles the develop-tick and
  land-grant-sweep real-time pacing (`scene_manager.ts`'s
  `RELAXED_TIMER_MULTIPLIER`) for players who find the default reflex
  timing tight, without changing any engine tick budget -- UI-side pacing
  only. Threaded through `NewGameSelection`/`NewGameConfig` alongside
  mode/species, so Play Again preserves the choice like the others.
- UI (M9 WS-U-polish, a11y audit): `hud.tsx` gains `aria-live="polite"` on
  the human player's own money/goods spans only (not AI players', to avoid
  a constant-update firehose for a screen-reader user watching AI turns
  play out). `game_screen.tsx` gains focus management on phase transitions:
  `#game-panel` carries `tabIndex={-1}` and a phase-name `aria-label`, and a
  `createEffect` reading only `state().phase.kind` (so it fires once per
  genuine phase change, not per tick) moves focus there, giving keyboard
  and screen-reader users a cue that a structurally new panel replaced the
  old one.
- Art (M9 WS-U-polish, art-gate round-3 POLISH carryovers): a proper
  wampus creature sprite (`src/ui/sprites/sprites_wampus.ts`, palette
  tokens only) replaces the inline ellipse-plus-two-dots glyph
  `overworld_scene.tsx` drew directly -- a furry rounded body, pointed
  ears, a muzzle with fang accents, gold eyes, and a light keyline halo for
  legibility against mountain terrain. The assay-office sign
  (`sprites_town.ts` `buildAssaySymbol`) now hangs its two pans from
  visible drop-lines below the beam instead of sitting flush against it,
  so it reads as a balance scale rather than a pair of glasses (the round-3
  "least self-evident building icon" finding).

- UI (M8 WS-U-critters, Phase B close-out): `AiActorLayer` is now mounted
  live in `src/ui/solid/game_screen.tsx`'s `#game-map`, in place of the old
  text-only `WaitingPanel` (removed, along with its now-orphaned
  `.waiting-panel` CSS rule). Keyed on a per-turn string (`ai-turn-<queueIndex>`)
  rather than the raw `DevelopPayload` object or an unkeyed `<Show>`: `reconcile`
  can reuse the same underlying payload object reference across an AI turn
  boundary (every turn has the same field set, so there is nothing
  structurally forcing a new object), and `AiActorLayer` captures its
  species/tint/spawn once at mount, so consecutive AI players' turns each
  need a genuinely fresh mount, not just a truthy/falsy edge -- confirmed via
  the `solid-js-expert` skill's guidance on `<Show keyed>` semantics before
  writing it. Also folded in the residual flagged from Phase A: the board
  avatar's species now reads `state.players[id].species` (the title-screen
  pick) instead of the placeholder `SPECIES_NAMES[playerId % 8]` indexing, in
  `overworld_scene.tsx`, `town_scene.tsx`, and `ai_actor_layer.tsx` alike (all
  three had the same hardcoded pattern). New
  `tests/playwright/ai_actor_live.spec.mjs` (2 specs, against the real live
  game rather than a fixture): ending the human's turn mounts the AI actor
  with a working Skip button and zero `.waiting-panel` anywhere in the DOM;
  `?species=flapper` makes the human's own overworld avatar render the
  flapper sprite. This closes out every M8 WS-U-critters scope item.
- UI (M8 WS-U-critters, Phase A): title screen gained a mode picker
  (`src/ui/solid/title_screen.tsx`'s `ModePicker` -- beginner 6 rounds /
  standard 12) and a species picker (`SpeciesPicker` -- 8 species from
  `sprites_species.ts`, labeled "all species start with $1000"), both ARIA
  radiogroups with roving `tabindex` and Left/Right (and Up/Down) arrow
  navigation, `data-mode-option` / `data-species-option` selectors.
  `src/ui/main.tsx` parses `?mode=` / `?species=` into the picker's initial
  selection (silently falling back to beginner/first-species on a bad value),
  alongside the existing `?seed=` / `?speed=` hooks; `src/ui/game_driver.ts`'s
  `NewGameConfig` gained a `selection: NewGameSelection` field threaded into
  `createInitialGameState(seed, mode, speciesTuple)` (human's pick in slot 0,
  `SPECIES[1..3]` filling the three AI slots -- cosmetic, so a repeat is
  harmless); `playAgain` reuses the last selection. `src/ui/solid/hud.tsx`
  gained a `data-mode` attribute on `.hud` so mode selection is verifiable
  end to end without a round-count display of its own. Defaults (beginner,
  first species) match every existing caller's prior behavior exactly, so
  every pre-existing `#new-game-button` spec needed no change.
  `tests/playwright/species_mode_select.spec.mjs` (7 specs): defaults,
  click-to-select, arrow-key roving, `?mode=`/`?species=` pinning, bad-value
  fallback, and New Game threading the chosen mode into `#game-hud`'s
  `data-mode`.
- UI (M8 WS-U-critters, Phase A): added `src/ui/scenes/ai_actor.ts`, the pure
  AI develop-turn presentation module (DOM-free, `walker.ts`/`zones.ts`
  pattern): `aiActorTarget` decides where the AI's avatar should be walking
  (town while carrying a M.U.L.E. through the buy/outfit steps, the plot it
  just placed one on the instant `carriedMule` clears, found via
  `findPlacedPlot`'s before/after board diff); and `runAiTurnToCompletion`,
  the Skip control's implementation -- it dispatches the exact same
  `decideDevelopAction` sequence the scene manager's `AI_STEP_MS` cadence
  would, just without waiting between steps, guarded by an
  `AI_TURN_WATCHDOG_STEPS` cannot-stall cap. It dispatches no `{type:"tick"}`
  actions, so it sits entirely outside the tick-ownership invariant.
  `src/ui/solid/ai_actor_layer.tsx` renders the walking avatar plus a Skip
  button, reusing `overworld_scene.tsx`'s rAF/ref-transform motion pattern.
  `src/ui/solid/ai_actor_demo.tsx` (`?demo=ai_actor`) is a standalone fixture
  (player 1 develops first, one plot pre-granted) that exercises Skip without
  needing the live game screen. `tests/test_ai_actor.mjs` (13 node tests,
  including an engine-level skip-equivalence test: fast-forwarding every
  develop turn with `runAiTurnToCompletion` reaches a `deepEqual` identical
  final `GameState` to stepping `decideDevelopAction` one action at a time)
  and `tests/playwright/ai_actor_skip.spec.mjs` (2 specs, including a
  browser-level skip-equivalence check: watching a turn play out vs.
  clicking Skip immediately reach byte-identical HUD money/goods and
  board owner/outfit for the same seed). Not yet wired into the live game
  screen (`WaitingPanel` still shows during AI turns there) -- that mount
  needs `src/ui/solid/game_screen.tsx`, reserved by the concurrent
  ws-u-render-fix lane during this session.
- UI (M8 WS-U-critters, Phase B): wampus render/blink/catch landed directly
  in `src/ui/scenes/overworld_scene.tsx` (not a reserved file this session,
  unlike `map_layer.tsx`/`game_screen.tsx`/`human_develop_layer.tsx`), so it
  is live in the real human develop turn today. Added
  `src/ui/scenes/wampus_presentation.ts`, a pure UI-side minimum-visible-time
  buffer (800ms, within the plan's 600-1000ms range) over the engine's
  single-tick visible window: it diffs `WampusState.events` by tick (the
  `AuctionPayload.trades` diffing pattern) and holds the sprite up for at
  least that long after a spawn/blink event, while the actual hunt
  affordance stays gated on the engine's own `visible && !dead && !caught`
  (the buffer is reaction time only, never eligibility) -- 7 node tests in
  `tests/test_wampus_presentation.mjs`. `walker.ts` gained a `manhattanDistance`
  helper (3 new tests in `tests/test_walker.mjs`) for the "walk-adjacent"
  proximity check: pressing the action key while standing on or one
  orthogonal step from the wampus's site dispatches `hunt_wampus`, checked
  ahead of assay/place (matching `decideDevelopAction`'s own "hunt first"
  priority). No dedicated wampus sprite art exists yet, so the wampus renders
  as a simple `PALETTE`-colored inline glyph (`WampusGlyph`) rather than a
  `sprites_*.ts` symbol; a catch fires a brief bounty banner
  (`[data-wampus-catch-banner]`), styled after the event-banner pattern.
  `src/ui/solid/wampus_hunt_demo.tsx` (`?demo=wampus`) is a standalone
  fixture (avatar spawned directly on a pre-set visible, catchable wampus)
  backing `tests/playwright/wampus_hunt.spec.mjs` (3 specs: glyph renders at
  the avatar's site, the action key catches it and awards the bounty, the
  banner self-dismisses) -- catching the wampus in a live random-seed game is
  not reliably reproducible on demand, so this fixture is the deterministic
  path.
- UI (M8 WS-U-critters, Phase B): added `src/ui/solid/mule_escape_vignette.tsx`
  to `production_panel.tsx` (not reserved this session): radiation is the one
  colony event that always destroys an installed M.U.L.E. when it fires (see
  `resolveRadiation`'s doc comment in `events.ts` -- it only returns an
  applicable result once it has actually cleared the leader's factory plot),
  so `colonyEvent.type === "radiation"` is a fully deterministic "a mule just
  fled" signal needing no board diffing. Reuses `sprites_mule.ts`'s existing
  `MULE_ESCAPE_ID` pose (already shipped by the art lane); self-dismisses on
  the same timed pattern as `EventBanner`; reduced motion renders a static
  pose for the same duration (a snap, not a tween) via the same
  `@media (prefers-reduced-motion: no-preference)` CSS gate the event banner
  uses. `src/ui/solid/mule_escape_demo.tsx` (`?demo=mule_escape`) fixture plus
  `tests/playwright/mule_escape.spec.mjs` (3 specs: renders alongside the
  radiation event banner, reduced motion applies no animated styles, self-
  dismisses).
- Retroactive entry: the M6 (WS-U-events) event-banner UI -- personal and
  colony event banners consuming `DevelopPayload.event` /
  `ProductionPayload.colonyEvent` and self-dismissing on a timer -- landed in
  `src/ui/solid/event_banner.tsx` earlier this session but never got a
  changelog bullet of its own. Recorded here now, under today's date, so the
  changelog's record of that work is not permanently missing: `EventBanner`
  (M6, WS-U-events) renders one shared component for both personal and
  colony events (icon via `sprites_events.ts`, title from the event's own
  `message`, an effect line for a personal event's money delta), holding the
  develop tick clock via `PERSONAL_EVENT_BANNER_HOLD_MS` only for the
  human's own personal event (every other case -- an AI's personal event, or
  a colony event during production -- is a non-blocking overlay using the
  shorter `PASSIVE_EVENT_BANNER_HOLD_MS`), with reduced motion skipping only
  the CSS entrance animation, not the JS-driven timing.
- Engine (M8 WS-E-critters): added the wampus and pub-gambling subsystems in a
  new `src/engine/wampus.ts`. One wampus spawns per round when the develop
  phase is entered (`enterDevelop` -> `createWampusState`), on an unowned
  mountain plot, dead immediately if none remains; it blinks (visible 1 tick /
  hidden 4 ticks, two blinks per site before moving to a new one, `13-16` tick
  initial delay) every develop-phase `tick` action regardless of whose turn it
  is, mapped from planet_mule's real-time `Wampus.update` timings onto this
  engine's develop-tick scale (`WAMPUS_*` constants in `constants.ts`; full
  derivation in `docs/RULE_SOURCES.md`, "Wampus: spawn, blink, and move
  timing"). New `hunt_wampus` action awards the round's bounty (`100 *
floor((round + 4) / 4)`, pinned $100/$200/$300/$400 by round band) and
  despawns the wampus for the round (catchable once); proximity is left to the
  UI scene, the engine only enforces visible-and-alive. New `gamble` action
  pays `PUB_ROUND_BONUS_BY_ROUND[round] + floor(random * fraction *
PUB_MAX_RANDOM_AMOUNT)` capped at `$250` and always ends the turn. Wampus
  randomness draws from a new isolated `wampusRngState` stream (matching
  planet_mule's own design: `Wampus`'s constructor derives its own `Random`
  from the main stream); gambling draws from the core stream like every other
  player action. `DevelopPayload` gained a `wampus: WampusState` field
  (UI-facing `row`/`col`/`visible` plus bookkeeping, and a tick-stamped
  `events` log of spawn/blink/catch occurrences, mirroring the auction
  `trades` pattern). Added an engine-owned `Species` union (8 species,
  name-matched to `sprites_species.ts`'s `SPECIES_NAMES`) and `Player.species`
  field, purely cosmetic (flat `STARTING_MONEY` regardless); `
createInitialGameState` gained an optional per-player `species` parameter,
  defaulting to the first four `SPECIES` entries. Verified PM's AI actually
  does hunt the wampus (contrary to this workstream's initial dispatch
  wording); since this engine's `hunt_wampus` has no travel cost to weigh, the
  new `decideDevelopAction` heuristic hunts unconditionally whenever visible,
  ahead of every other decision, and gambles instead of a bare `end_turn`
  whenever nothing else is affordable/placeable (updated the two
  `tests/test_ai.mjs` cases that previously asserted a plain `end_turn` in
  those situations). Added `tests/test_wampus_pub.mjs` (27 tests: bounty
  table, spawn-only-on-unowned-mountains, catch-once-per-round semantics,
  gamble payout bounds/cap/turn-ending, species economy-neutrality, mode
  config). `tests/e2e/e2e_balance_sim.mjs` gained report-only wampus-catches
  and pub-gambles per-game metrics (beginner 2.63/20.13, standard 2.70/42.97
  over 30 seeds/mode); every existing gate held with standard mode's 12-round
  game confirmed fully playable end to end (30/30 terminated, zero negative
  money). `tests/test_replay_determinism.mjs`'s fixture hash was re-pinned
  (new serialized fields plus the wampus subsystem consuming its own isolated
  stream every develop tick; the recorded action log itself is unchanged, see
  the file's regeneration note). Full adjudication record in
  `docs/RULE_SOURCES.md`: "Wampus: spawn, blink, and move timing", "Wampus RNG
  isolation", "Pub gambling: engine implementation", "AI wampus hunting", and
  "Species select and mode picker".
- UI (M7 WS-U-town): replaced the menu store with a walkable town interior.
  Added `src/ui/scenes/town_scene.tsx`: stepping onto the overworld town cell
  enters a self-contained walkable town (`#town-scene`) where the avatar walks
  (reusing `walker.ts`), tows a bought M.U.L.E., and uses building doors -- the
  corral dispatches `buy_mule`, the four outfit counters dispatch
  `outfit_mule(<resource>)`, the pub shows a "The pub opens soon" notice (its
  gamble action lands in M8), the assay office arms an overworld assay, and the
  four edge exits return to the overworld. Added the town layout geometry to
  `src/ui/scenes/zones.ts` (compact 9x5 interior, one street of doors, edge
  exits, and `overworldReturnCell` for the exit-adjacent respawn) with node
  tests, and `src/ui/scenes/human_develop_layer.tsx` to swap the overworld and
  town scenes without a separate engine phase -- the engine stays in `develop`,
  so the scene manager keeps draining the turn's tick budget while the player is
  in town (documented in the scene). The assay flow: the assay door arms an
  assay that the overworld action key spends on the next assayable plot, and
  `src/ui/solid/map_layer.tsx` now renders a `[data-crystite]` badge on assayed
  plots via `visibleCrystite`. Added a `?demo=town` fixture
  (`src/ui/solid/town_demo.tsx`) and the full-loop Playwright spec
  `tests/playwright/town_scene.spec.mjs` (buy -> outfit -> exit -> place, pub
  notice, assay end-to-end). Grew the M2 mini harness into
  `tests/e2e/e2e_full_game.mjs`, which drives a complete seeded beginner game
  (New Game through all 6 rounds to the scoring screen) at `?speed=8`, asserting
  four ranked players, tick-ledger phase progression, and zero page errors.
- Engine (M6 WS-E-events): added the personal and colony event systems in a new
  `src/engine/events.ts`. Personal events: the 22 `PlayerEvent` types with their
  planet_mule money factors, polarities, conditions, and effects (including the
  `extra_plot`/`lost_plot` land grant/loss and the non-money grants), a shuffled
  22-event deck with no repeat until exhausted, a 27.5% per-develop-turn chance,
  rank/round blocking (leader gets only bad, the bottom two only good, the last
  two rounds only good), and the zero-food pity package; amount = factor *
  `muleCurve(round)`, resolved at each develop turn's start before food is
  consumed (matching `PlayerEventPhase`). Colony events: the 9 `ColonyEvent`
  types drawn from a pre-shuffled weighted deck assigned per round at game start
  (rounds 1-2 from pirates/acid rain/sunspot/fire; pest/planetquake/meteorite/
  radiation join from round 3; double-shuffled; round-0 null slot; final round
  forced to ship-return), split A/B around production (category A -- acid rain,
  sunspot, meteorite, radiation -- fires pre-production and sets per-plot
  temporary bonuses; category B -- pest, pirates, planetquake, fire, ship --
  fires post-production and adjusts the computed yields, store stock, and
  terrain). `GameState` gained `colonyEventSchedule`, `playerEventDeck`,
  `playerEventCursor`, two isolated event-RNG states, and an append-only
  `eventHistory`; the develop payload carries the fired personal event and the
  production payload the fired colony event, both UI-friendly (name, message,
  polarity/category, affected cells) for WS-U-events. `economy.ts`'s
  `computeProduction` now accepts a category-A temporary-bonus modifier and
  emits per-plot detail, with every plot clamped to `[0, PRODUCTION_MAX_YIELD]`;
  `enterProduction` orchestrates the colony event around production. Added a
  `crater` terrain (meteorite) to the engine `Terrain` union.
- UI (M1 WS-U-solid, Patches 1-3): adopted SolidJS for the UI, ported in three
  verified steps. Patch 1 (the Solid proof): added `pipeline/build.mjs` (esbuild
  JS-API + `esbuild-plugin-solid`, the doc-sanctioned second build path for
  Solid JSX; produces the same single ESM bundle the CLI does -- es2020,
  browser, minified, with sourcemap -- into `dist/main.js`) and wired
  `build_github_pages.sh` to `node pipeline/build.mjs` (`run_web_server.sh` runs
  it through that script, so it needed no edit); added `src/ui/game_store.ts`
  (`createGameStore(snapshot)` = `createStore` plus a `dispatch` that runs the
  pure `applyAction` then `setState(reconcile(next))`, with `dispatch` the sole
  writer and `state` the read accessor); ported the title screen to
  `src/ui/solid/title_screen.tsx` mounted into `#screen-title` (New Game button
  preserved); renamed `src/ui/main.ts` to `main.tsx`. Patch 2: added the
  phase-router `src/ui/solid/app.tsx` (`<Switch>`/`<Match>` on a reactive
  active-screen signal) and rewrote `src/ui/screen_router.ts` from DOM
  class-toggling to a `createSignal`-backed registry (same
  `registerScreen`/`showScreen` interface, adds `currentScreen()`); `src/index.html`
  became a single `#app` root; ported the HUD to `src/ui/solid/hud.tsx` (`<For>`
  over players and resources, identical `.hud`/`.hud-player[data-player]`/
  `.hud-good[data-resource]` markup). Patch 3: ported the board to
  `src/ui/solid/map_layer.tsx` (`<For>` cells plus `<Show>` mule glyph, identical
  `.map-svg` and `g[data-row][data-col][data-terrain]`/`data-owner`/`data-outfit`
  attributes; the shared `<defs>` sprite markup is reused verbatim via
  `innerHTML` so `src/ui/sprites.ts` stays the single sprite source). The
  `?demo=map` fixture screen became `src/ui/solid/map_demo.tsx` (the fixture
  builders moved here from `main.ts`) and now renders the Solid `<Hud>` +
  `<MapLayer>`. Seam: `game_driver.ts` is unchanged and keeps sequencing
  gameplay; App renders the `#game-hud`/`#game-map`/`#game-panel` containers as
  always-mounted inert shells (never gated behind a `<Match>`, because
  `startNewGame` resolves them by id before it calls `showScreen` and Solid
  batches signal writes inside event handlers), and the driver populates them
  imperatively -- the driver-to-Solid rendering handoff is M2's WS-U-port. No
  `package.json` `allowScripts` entries were needed (`solid-js` and
  `esbuild-plugin-solid` have no install scripts). Verified: `check_codebase.sh`
  green except the two known colorblind tests in
  `tests/test_player_color_distinct.mjs` (typecheck/typecheck:lint/eslint/prettier
  all pass; node 109/111); `build_github_pages.sh` succeeds; Playwright
  `game_flow.spec.mjs` (5/5, including the auction token-movement test) and
  `map_render.spec.mjs` (1/1) pass against the ported Solid screens.
- UI (M2 WS-U-port): completed the Solid port and retired the imperative driver.
  Added `src/ui/scenes/scene_manager.ts`, a single `requestAnimationFrame`
  fixed-timestep loop (16.67ms/60Hz steps, real frame time scaled by a speed
  multiplier and consumed in whole steps) that replaces every setTimeout chain:
  per-phase accumulators dispatch `{ type: "tick" }` and AI decisions at each
  phase's cadence (land-grant/develop AI 400ms, human develop tick 250ms,
  production 2000ms, auction 500ms, finished-auction 1500ms), preserving the old
  driver's pacing. The store is now the live path: `game_driver.ts` shrank from a
  637-line DOM renderer to a thin session controller (a `createSignal`-backed
  `GameStore` the app routes on, `startNewGame`/`playAgain`, and the scene-loop
  wiring) that renders nothing itself; every transition flows through
  `store.dispatch` (the pure reducer + `reconcile`), whether from a human control
  or the scene manager's AI/tick scheduling. Ported the remaining five screens to
  `src/ui/solid/`: `game_screen.tsx` (the reactive `#game-hud`/`#game-map`/
  `#game-panel` host, phase-routed by a `<Switch>` over typed per-phase payload
  accessors, owning the shared land-grant board cursor signal),
  `land_grant_panel.tsx` (hint + Pass, arrow-key cursor nav, plot-click claim
  delegated through `MapLayer`), `store_screen.tsx` (buy/outfit/place with the
  ticks-left text as its own reactive node so a tick never disturbs the buttons
  or focus, roving focus + Enter/Escape preserved), `auction_screen.tsx` (role
  bar, live `auction-track-svg` with reactive token `cy`, store band lines, trade
  log, held-arrow + press-and-hold intent controls), `production_panel.tsx`, and
  `scoring_panel.tsx` (`#play-again-button`). `map_layer.tsx` gained optional
  `cursor` (reactive `plot-cursor` highlight) and `onPlotClick` props. Added a
  held-key `KeyState` poller to `src/ui/input.ts` (keydown/keyup set sampled by
  scenes each frame, cleared on blur) alongside the unchanged `bindKeys`/
  `bindRovingFocus`. Added `?seed=` (deterministic RNG seed) and `?speed=` (scene
  clock multiplier) URL params in `main.tsx`, replacing the `Date.now()` seed.
  Added the tick-ownership invariant: the scene manager records every tick's
  owner and phase on a dev-only `window.__tickOwnership` ledger, and
  `tests/playwright/tick_ownership.spec.mjs` drives a fixed seed at `?speed=8` and
  asserts a single owner (`scene_manager`), monotonic tick counts, and a tick
  phase sequence that only advances through the develop -> production -> auction
  cycle. Added the mini headless harness `tests/e2e/e2e_mini_flow.mjs` (builds
  dist/, serves it on a random loopback port, drives New Game -> land-grant claim
  -> human develop turn -> buy a M.U.L.E. through real Chromium via
  `playwright-core`, asserting zero page errors; exits non-zero on failure).
  Solid discipline: run-once components, props read through the props object
  (never destructured), `<For>` for every list, typed payload accessors feeding
  each `<Match>`, listeners bound in `onMount`/released in `onCleanup`, and
  `reconcile` keeping node identity stable so held focus and in-flight keyboard
  interactions survive across ticks. Verified: `check_codebase.sh` green (5/5;
  typecheck/typecheck:lint/eslint/prettier + 133 node tests), `build_github_pages.sh`
  succeeds, and the FULL Playwright suite passes 11/11: game_flow 5/5 UNMODIFIED
  (including the auction token-movement test), map_render 1/1, all four galleries,
  and the new `tick_ownership.spec.mjs`. `node tests/e2e/e2e_mini_flow.mjs` exits 0. WS-U-port touches no engine files; the only red items in the shared
  `check_codebase.sh` at hand-off are concurrent in-flight work in other lanes
  (the engine lane's M4 auction: `test_auction.mjs` failures and an unformatted
  `auction.ts`; an art-lane scratch file `_capture_art_gate_v2.mjs`).
- UI (M2 WS-U-port, auction role-choice): the auction screen now shows the
  role-choice bar at every good's opening tick (tick 0), not only when the human
  is "out". The concurrent M4 engine change auto-assigns each player a role at
  auction entry (`initialRole` by surplus), so the old "role-choice only when
  out" gate skipped the bar and broke the frozen `game_flow` auction selector
  contract. Showing the bar at tick 0 lets the human confirm or override the
  auto-assigned default ("override allowed" per the M4 plan) and keeps
  `game_flow.spec.mjs` passing unmodified; the scene manager holds the auction
  clock until the human commits (`notifyAuctionCommit`), then ticks advance the
  clock and swap the panel to the live track.
- Engine (M1 WS-E-foundation, Patches 2-4): added `GameMode = "beginner" |
"standard"` (`src/engine/game_state.ts`) and `GameState.mode`, plus
  `ROUND_COUNT_BY_MODE = { beginner: 6, standard: 12 }` in
  `src/engine/constants.ts` (source: `OTHER_REPOS/mule_rules.md` line 46 and
  the Kroah 1983 doc's level tables; user decision recorded in
  `mule_fidelity_plan.md`), replacing the old fixed `ROUND_COUNT` constant --
  `turn.ts`'s `endAuctionGood` now looks up `ROUND_COUNT_BY_MODE[state.mode]`
  (durable mode-lookup fix over a deprecation alias, since only that one call
  site used the old constant). `createInitialGameState` gains a `mode`
  parameter defaulting to `"beginner"`, so every existing test and the UI
  fixture keep today's 6-round behavior unchanged; `"standard"` is reachable
  but nothing selects it yet (the mode picker is a later milestone). Added
  `src/engine/round_scale.ts`'s `muleCurve(round)`, the round-scaled money
  curve used by colony/player event payouts: `25 * (Math.floor((round - 1) /

4. - 1)`, ported from planet_mule's `PlayerEventGenerator.apply()` (`n = 25

- (gameModel.getRound() / 4 + 1)`, integer division). Verified planet_mule's
`GameModel.round` is 0-based (`Properties.java` `firstRound = 0`) against
this engine's 1-based `GameState.round`, so the formula re-indexes by
`round - 1`; this reproduces PM's 25/25/25/25/50/50/50/50/75/75/75/75 for a
12-round standard game (rounds 1-12) and matches the mapping noted in the
work ticket. Widened `Plot` (`src/engine/game_state.ts`) with
`crystiteLevel: 0 | 1 | 2 | 3 | 4`and`crystiteRevealed: boolean`;
`generateMap` (`src/engine/map.ts`) sets both to `0`/`false`on every plot,
keeping map generation deterministic and behavior-identical -- bloom
seeding lands in the later WS-E-blooms milestone. The widening forced three
compiler-driven, zero-behavior-change literal fixes in`src/ui/main.ts`(the demo fixture's two raw`Plot`object literals and its raw`GameState`literal, none of which route through`generateMap`/`createInitialGameState`
today), following the same "compiler-driven sweep" pattern as the prior
Resource-widening Patch 1. Added the action-log replay determinism harness
(`tests/test_replay_determinism.mjs`, node test): a frozen, versioned
`RECORDED_ACTIONS`fixture (673 actions covering land-grant claims/passes,
develop buy/outfit/place/end_turn, and auction role/intent/tick/end_auction
across all six beginner rounds through the scoring phase, recorded once via
a scripted AI playthrough) is replayed twice from a fresh seeded`createInitialGameState`, asserting the two replays are deep-equal (reducer
purity) and that the final state's sha256 hash matches a pinned
`EXPECTED_STATE_HASH`, so an Action-schema or reducer-behavior change on
  this exact trace fails loudly instead of drifting silently; the file's
  header comment documents how to regenerate the fixture.
- Art (M3 WS-A-actors): added `src/ui/sprites/sprites_species.ts` (8 species
  avatars -- humanoid, gollumer, mechtron, packer, leggite, bonzoid,
  spheroid, flapper -- each a distinct 2-frame silhouette at the actor 32x32
  viewBox, `fill="currentColor"` tinted so a caller sets any of the 4
  `PALETTE` player colors via the `color` style property, plus a pure
  `pickSpeciesFrameId` helper that holds on frame 1 when
  `prefers-reduced-motion` is set) and `src/ui/sprites/sprites_mule.ts` (walk
  x2 frames, towed, installed, and escape poses, plus a 4-slot outfit-badge
  system -- `sprite-mule-outfit-food/energy/smithore/crystite`, the crystite
  badge getting its own gem silhouette rather than reusing smithore's
  ore-chunk shape, per the spec's "dedicated crystite sprite" follow-up, for
  this outfit-marker context only; legacy `src/ui/sprites.ts` is untouched).
  Both files draw every fill/stroke exclusively from `PALETTE`
  (`tests/test_sprite_palette.mjs` passes with an empty legacy allowlist).
  Added `src/ui/sprites/sprite_gallery.ts` (`renderSpriteGallery(container)`,
  a standalone avatar-visibility + outfit-clarity fixture -- 32
  `[data-species-avatar]` instances, one per species x player-color pair,
  each covering both `bgDeep` and `terrainPlain` backgrounds internally so
  the 32 count is not doubled; every mule pose on both backgrounds; 4
  `[data-outfit]` badge swatches) and
  `tests/playwright/sprite_gallery.spec.mjs`, which bundles that module with
  `npx esbuild ... --format=iife --global-name=SpriteGalleryModule` into an
  OS-tmpdir file (not `test-results/`, which is prettier-ignored but not
  eslint-ignored and would otherwise fail `check_codebase.sh`'s repo-wide
  lint glob on the generated bundle's unbundled browser globals), injects it
  into the already-built `dist/index.html` via `page.addScriptTag`, and
  asserts the 32-avatar count, 4 distinct outfit-badge fills, and every
  `<symbol id>` following the `sprite-<domain>-<name>[-frameN]` convention;
  green via `PW_PORT=$((RANDOM%20000+20000)) npx playwright test
tests/playwright/sprite_gallery.spec.mjs` (1 passed). Added
  `tests/test_player_color_distinct.mjs`, implementing the Vienot/Brettel/
  Mollon (1999) linear-RGB dichromacy simulation matrices for protanopia and
  deuteranopia (the follow-up the art style spec's "Known risks" section
  flagged: the original player-color reasoning was luminance/blue-channel
  analysis, not simulator-verified) and asserting pairwise CIE76 deltaE > 20
  among the 4 `PALETTE` player colors under each simulation. Result: the
  simulation confirms a real problem the spec's Known-risks section
  anticipated but could not quantify -- `player0` (coral red) vs `player2`
  (gold) collapses under both deficiencies (deltaE 6.15 protanopia, 9.69
  deuteranopia), and `player1` (cyan) vs `player3` (violet) is also weak
  (7.49 protanopia, borderline 19.00 deuteranopia), all well under the 20
  threshold; every other pair clears 40+. Per this workstream's explicit
  boundary, `src/ui/sprites/palette.ts` was NOT modified to chase this
  result (art-lane palette changes route through the manager); the test's
  assertion is left as the real, unweakened threshold, so it fails honestly
  (2 of the repo's 80 `node --test 'tests/test_*.mjs'` tests) rather than
  hiding the finding -- this is currently the only failing check in
  `./check_codebase.sh` and needs a manager decision (revise `player2`/
  `player3` with fresh evidence, or explicitly accept the risk) before it
  can go green. Verified: `npx tsc --noEmit -p tsconfig.json` and `-p
tsconfig.lint.json` clean for `src/`/`tests/`/`tools/`; `npx eslint
--max-warnings 0` and `npx prettier --check` clean on the new files;
  `./check_codebase.sh` reports typecheck/typecheck:lint/lint/format:check
  all PASS, with `test:node` FAIL solely from the 2 colorblind-deltaE
  assertions above (78 of 80 node tests pass).
- Engine (M2 WS-E-blooms): crystite is real data now, not just type-level.
  `generateMap` (`src/engine/map.ts`) seeds `CRYSTITE_BLOOM_COUNT` (4) hidden
  blooms after terrain generation: each bloom picks a random non-river,
  non-town center via the shared seeded `Rng` (rerolling if that plot is
  already at `CRYSTITE_BLOOM_MAX_LEVEL`), then raises every plot's
  `crystiteLevel` to `max(existing, CRYSTITE_BLOOM_MAX_LEVEL -
manhattanDistance)` out to distance 2 (center 3, ring 1 = 2, ring 2 = 1),
  so overlapping blooms keep the higher level rather than stacking; river and
  town plots are forced to 0 afterward. Ported from planet_mule's
  `PlanetMapGenerator.generateCrystite`, with one adjudicated simplification
  (this engine excludes river and town from bloom centers up front and zeros
  town's field directly, where PM instead gates town's _yield_ off at the
  tile-type level while leaving its stored field free to be nonzero -- see
  docs/RULE_SOURCES.md, "Crystite bloom seeding"). Added the `assay_plot`
  action (`Action` union in `game_state.ts`, reducer branch in `turn.ts`):
  legal only during the acting player's develop turn, on any plot including
  unowned ones (verified planet_mule's `Assay` action carries no ownership
  check) except the town, deducting the new `ASSAY_TICK_COST` (3 ticks,
  mapped from planet_mule's `developmentAssayTime` 2.5s via this engine's
  existing 50-tick/47.5s FULL-budget anchor -- see docs/RULE_SOURCES.md,
  "Assay tick cost derivation" for the arithmetic and why it replaces an
  earlier 5-tick placeholder) and setting `crystiteRevealed = true`; paying
  the cost down to zero ticks ends the turn immediately, mirroring how the
  ambient `tick` action already ends a turn at budget exhaustion. Added the
  `visibleCrystite(plot)` selector (`game_state.ts`) as the only sanctioned
  way to read a plot's crystite level outside the engine -- returns the level
  only once `crystiteRevealed`, `null` otherwise -- so the UI can never leak
  an unassayed bloom. Reveal is a single shared boolean per plot rather than
  PM's per-player assay list, a deliberate simplification for this engine's
  local hotseat/AI model (no networked multiplayer to keep separate scouting
  state for); see docs/RULE_SOURCES.md for the full adjudication. Crystite
  production yield and its auction window remain off this milestone
  (WS-E-production and WS-E-auction); bloom levels are inert data until those
  land.
- Art (M2 WS-A-terrain): added `src/ui/sprites/sprites_terrain.ts` (7 terrain
  tiles at the 64x64 tile viewBox -- `plain`, `river`, `mountain1/2/3`,
  `town`, and `crater` -- each a flat, stroke-outlined `<symbol>` distinguished
  by shape as well as fill: mountain tiers by countable peaks (1/2/3, not
  color alone, addressing the style spec's `terrainMountain3` contrast known
  risk), plain by grass-tuft texture, river by ripple bands, town by a
  building cluster, and crater by a rim-and-glint silhouette using
  `resourceCrystite` for the meteorite-event tie-in). `TerrainName` is a
  local 7-value type, not an import of the engine's current 6-value
  `Terrain` union in `game_state.ts`, since `crater` is forward-looking (the
  meteorite colony event has not landed yet); `terrainSymbolId` and
  `buildTerrainSpriteDefsMarkup` are the `data-terrain` selector contract a
  later map-renderer wiring patch consumes. Every fill/stroke is a `PALETTE`
  token (`tests/test_sprite_palette.mjs` passes); no new palette tokens were
  added. Added `src/ui/sprites/terrain_gallery.ts`
  (`renderTerrainGallery(container)`, a standalone readability fixture: a
  7-tile adjacency strip plus a 3x3 mixed-neighbor patch where every
  orthogonal pair is a different terrain) and
  `tests/playwright/terrain_gallery.spec.mjs`, following the
  `sprite_gallery.spec.mjs` esbuild-bundle-into-`dist/index.html` pattern;
  asserts 7 distinct `[data-terrain]` tiles, every adjacent pair in the mixed
  patch differing (shape/symbol-id-based distinguishability), and every
  `<symbol id>` following the `sprite-terrain-<name>` convention. Per this
  workstream's explicit scope reduction (a concurrent subagent was porting
  the map renderer to Solid), the map renderer itself is NOT reskinned by
  this patch -- new files only; wiring `sprites_terrain.ts` into
  `map_render.ts`'s `TERRAIN_FILLS` lookup is a follow-up patch.
- Engine (M3 WS-E-prices): added dynamic store pricing per planet_mule.
  `StoreState` (`src/engine/store.ts`) gains `prices` (the central base price
  per good, PM's `ResourcePrices.price`) and `muleStock` (seeded 14 for the
  smithore mules-available figure; the mule economy is WS-E-mules), and its
  `buyPrice`/`sellPrice` are now derived per good from `prices` via the new
  `deriveGoodQuote` helper (food/energy: buy = price - 15, sell = buy + 35;
  smithore: buy = price, sell = buy + 35; crystite: price floored to a
  multiple of 4, sell = buy + 140). New pure functions: `computeColonyStats`
  (supply/demand from players + board + store), `updateStoreForNewRound`
  (recomputes every good's base price at the round boundary --
  `price *= 0.25 + 0.75 * (demand/supply)` with per-good floors/clamps, the
  smithore ratio clamped to [0.25, 3.0] plus `round(normalDistributed()*7)`
  gaussian jitter, crystite an independent `50 + randInt(0..99)` floored to a
  multiple of 4), `spoilStoreFood` (halves store food each round), and
  `applyAverageTradePrice` (a good's next base becomes its average trade
  price). Added `normalDistributed(rng)` to `src/engine/rng.ts` (sum of 12
  uniform draws minus 6, per `MuleMath.normalDistributed`). `turn.ts` calls
  the recalc at the round boundary (`advanceToNextRound`) and the average-price
  feedback per finished good (`applyEndAuction`, skipped on the last round);
  `auction.ts` now reads the store's live quotes for its band instead of
  `STORE_BASE_PRICE +- AUCTION_STORE_SPREAD`, and guards against a
  store-to-store phantom trade when the clamped band collapses at the ceiling.
  New constants in a `--- store pricing ---` section of `constants.ts`
  (`FOOD_REQUIREMENTS_BY_ROUND`, per-good margins/spreads/floors, ratio
  coefficients, smithore jitter/floor, mule-need cap, crystite deviance,
  `STORE_STOCK_CAP = 255`), each with a planet_mule source comment;
  `STORE_BASE_PRICE` is repointed to PM's initial prices (food 30 / energy 25 /
  smithore 50 / crystite 50) as the base-price seed.
- Art (M5 WS-A-town): added `src/ui/sprites/sprites_town.ts` (4 town
  buildings -- `store`, `pub`, `assay`, `corral` -- at the building-scale
  viewBox, sized in `TOWN_TILE_UNIT` (64) multiples per the style spec's
  "Town building" row and bottom-center anchored so 1-tile (`pub`, `assay`)
  and 2-tile (`store`, `corral`) footprints share a ground line; a shared
  `sprite-town-door` overlay symbol for the walkable scene's future entry
  triggers; 4 `sprite-town-exit-<direction>` edge markers; and a
  `sprite-town-ground` walkable-tile). The store's 4 outfit counters
  (`sprite-town-store-counter-<resource>`) are their own standalone symbols
  nested into the store via `<use>`, reusing `sprites_mule.ts`'s
  diamond/bolt/ore-chunk/gem glyph vocabulary at counter scale so a counter
  and an installed mule's outfit badge read as the same resource by shape,
  not fill color alone. Added `src/ui/sprites/sprites_arena.ts` (auction
  arena chrome, kept as its own module rather than folded into
  `sprites_town.ts`, since it is a distinct HUD concern rather than
  town-scene geometry): backdrop panel, axis bar, axis tick, store-band
  bracket, and a trade-flash starburst, sized to match
  `auction_screen.ts`'s existing `TRACK_WIDTH`/`TRACK_HEIGHT` (280/400) so
  a later scene can layer them behind the live `.auction-track-*` markup;
  `auction_screen.ts` and `style.css` are untouched. Domain-naming note:
  the style spec's symbol-id domain set is closed (`terrain`, `species`,
  `mule`, `town`, `event`, `icon`) with no `arena`/`auction` entry, so
  every arena chrome id uses `sprite-icon-auction-<name>` (the closest
  existing "small UI mark" domain) rather than adding an unlisted domain
  outside this workstream's authority over the spec doc. Every fill/stroke
  in both files is a `PALETTE` token (`tests/test_sprite_palette.mjs`
  passes); no new palette tokens were added. Added
  `src/ui/sprites/town_gallery.ts` (`renderTownGallery(container)`, a
  standalone building/zone-readability fixture: a town layout mock with
  all 4 buildings paired with their own `[data-door-for]` door-marker
  instance, a `[data-counter]` swatch row with distinct fills per resource,
  the 4 `[data-exit]` markers, and a `[data-arena-chrome]` strip) and
  `tests/playwright/town_gallery.spec.mjs`, following the
  `terrain_gallery.spec.mjs` esbuild-bundle-into-`dist/index.html` pattern;
  asserts all 4 building types render with `data-building`, each has an
  associated door marker, the 4 outfit counters have distinct fills, the
  arena axis-bar/store-band/trade-flash symbols are present, and every
  `<symbol id>` follows the `sprite-<domain>-<name>[-frameN]` convention;
  green via `PW_PORT=$((RANDOM%20000+20000)) npx playwright test
tests/playwright/town_gallery.spec.mjs` (1 passed). Ticket note: the
  work ticket's fixture description says "5 building types"; this
  workstream's actual scope (store/pub/assay/corral) is 4, and the spec
  and fixture assert 4 throughout. Verified: `node --test
tests/test_sprite_palette.mjs` passes; `npx tsc --noEmit -p
tsconfig.json` clean; `npx eslint --max-warnings 0` and `npx prettier
--check` clean on the 4 new files.
- UI art (M8 WS-A-title, final art workstream): added
  `src/ui/sprites/sprites_title.ts` (title-screen sprite set): the M.U.L.E.
  wordmark drawn as an original 5x7 dot-matrix pixel font (not SVG
  `<text>`, matching the rest of the sprite set's shape-primitive
  vocabulary) with a one-step drop-shadow layer, a planet backdrop (rocky
  disc, a front/back ring arc pair, one highlight and one shadow crescent
  patch), a reusable starfield star, a landing-ship silhouette (dark hull,
  gold thruster accent), a species-select portrait plate (frame sized to
  nest a `sprites_species.ts` 32x32 avatar at a documented offset, gold
  corner accents), and the HUD-chrome deliverable (panel-corner bracket,
  timer-bar frame, timer-bar fill cap). Added
  `src/ui/sprites/sprites_events.ts`: one 48x48 "vignette"-scale icon per
  colony event (acid rain, sunspot, meteorite, radiation, pest, pirate
  ship, planetquake, fire, ship return) plus a generic good-news/bad-news
  personal-event polarity badge pair (11 symbols total), each built from
  2-3 distinct silhouette shapes so the event reads without relying on
  color alone; vignette scale is bigger than the spec's 16x16 icon budget
  (documented as a new ViewBox row), so each gets the actor-scale thin
  outline stroke rather than staying strokeless. No `style.css` edits (per
  scope, chrome symbols only). Added `src/ui/sprites/title_gallery.ts`
  (`renderTitleGallery(container)`, a standalone fixture: the 4
  `[data-title-element]` hero pieces including a tiled 12-star starfield,
  all 8 `[data-species-portrait]` plates each nesting a tinted avatar, all
  11 `[data-event]` vignettes, and the 3 `[data-hud-chrome]` pieces) and
  `tests/playwright/title_gallery.spec.mjs`, following the
  `town_gallery.spec.mjs` esbuild-bundle-into-`dist/index.html` pattern;
  green via `PW_PORT=30283 npx playwright test
tests/playwright/title_gallery.spec.mjs tests/playwright/town_gallery.spec.mjs
tests/playwright/sprite_gallery.spec.mjs` (3 passed -- the last two prove
  the concurrent palette/domain-rename edits below broke nothing). Full
  `./check_codebase.sh` gate green (typecheck, typecheck:lint, lint,
  format:check, test:node 133/133).
- Engine (M3 WS-E-mules): mule economy, food-scaled develop timer, and
  rank-ordered turn order per `Shop.buildMules`/`Player.useFood`/
  `Development.setPlayerOrder`. `StoreState` (store.ts) gains `mulePrice`;
  `rebuildMules` converts `SMITHORE_PER_MULE` (2) smithore per mule up to
  `MULE_STOCK_CAP` (14) each round boundary, floors an odd smithore spend
  to an even multiple, and reprices at `MULE_PRICE_SMITHORE_MULT` (2) times
  the store's current smithore price floored to `MULE_PRICE_FLOOR_STEP`
  (10); `applyMulePurchase`/`applyBuyMule` (turn.ts) decrement `muleStock`
  and charge the live `store.mulePrice`, throwing at zero stock or
  insufficient money (mirroring the existing `applyOutfitMule` fail-loudly
  convention) instead of the old flat, unlimited `MULE_BASE_PRICE` buy.
  `DevelopPayload` gains `turnQueue`/`queueIndex`; `computeTurnQueue`
  (turn.ts) orders develop turns by current score (`computeScores`,
  verified to accept mid-game state), tied players broken by ascending id,
  reversed to worst-rank-first when `store.muleStock <=
DEVELOP_ORDER_REVERSAL_MULE_THRESHOLD` (7). `beginDevelopTurn` consumes
  each player's food for the round (`FOOD_REQUIREMENTS_BY_ROUND[round -
1]`) at their turn's start and sets that turn's tick budget between the
  new `DEVELOP_TICKS_MIN` (5) and `DEVELOP_TICKS_FULL` (50, numerically
  unchanged from the retired flat `DEVELOP_TICKS_PER_TURN`), scaled by how
  much of the requirement the player could cover; round 1's requirement is
  0, so every player still gets a full budget on turn one. CRITICAL fix:
  `applyUpkeep` (economy.ts) is retired -- it was a flat, round-scaled
  stand-in for food and energy usage that would now double-count both
  against the new food timer and against `computeProduction`'s real
  per-powered-mule energy cost, which the production gate already computed
  but never actually deducted from player inventory until this patch
  (`ProductionResult.energyConsumed`, applied in `enterProduction`); energy
  M.U.L.E.s are also now correctly excluded from that gate/deduction (they
  draw no power, a latent inaccuracy fixed alongside the double-count).
  `docs/RULE_SOURCES.md` gains four additive sections: `buildMules`
  semantics, the upkeep consolidation with a before/after worked example,
  a flagged (unresolved, out of scope) index discrepancy between this
  workstream's develop-timer food index and the already-landed WS-E-prices
  pricing formula's own food index, and the turn-order/rank-order trace.
  New `tests/test_mule_economy.mjs` (rebuild math, odd-smithore floor, cap
  no-op, price-floor-to-10, stock-0 rejection, exact/one-short affordability
  invariants for `buy_mule`/`outfit_mule`); `tests/test_turn.mjs` gains
  timer-proportionality and turn-order/reversal/tie-break tests;
  `tests/test_economy.mjs` updated for `computeProduction`'s new
  `{ yields, energyConsumed }` return shape and the retired upkeep tests
  replaced with energy-consumption tests. The action-log replay fixture
  (`tests/test_replay_determinism.mjs`) was regenerated in full (a fresh
  AI-scripted playthrough per the fixture's own regeneration recipe, with
  the prior fixture's one hand-injected `assay_plot` action preserved at
  the same point) since mule scarcity and the new turn order reshape which
  actions are legal from round 2 onward; the regenerated trace is shorter
  (569 vs. 673 actions) because the AI attempts fewer buy/outfit/place
  sequences once M.U.L.E.s become scarce or pricier. `src/ai/auction_ai.ts`
  updated only its `AUCTION_TARGET_STOCK` heuristic (numerically unchanged
  flat values) to stop importing the retired `FOOD_UPKEEP_BASE`/
  `ENERGY_UPKEEP_BASE` constants; retuning that heuristic against the new
  resource flows is a follow-on, not part of this workstream. 30-seeded-game
  sim gate (both modes): no deadlock, no negative money, minimum develop
  tick budget never fell below `DEVELOP_TICKS_MIN`.
- UI (M4 WS-U-auction): reworked `src/ui/solid/auction_screen.tsx` from the
  abstract SVG price track into the original M.U.L.E. spatial auction scene.
  Each player's species avatar (`<use>` of the `sprites_species.ts` walk
  symbols, tinted per `PLAYER_COLORS`) stands in a per-player lane on the
  vertical price axis at `priceToTrackY(price)`, derived from the engine's
  authoritative participant price (avatars are presentation only). Motion split
  per the plan: reactivity owns state (the `.auction-track-token` price-marker
  dots snap `cy` per tick, store band lines, `data-role`, the trade log, and a
  new crisp monospace price readout), while imperative transforms own 60fps
  motion -- a new `onSceneFrame` subscriber on the scene-manager rAF eases each
  avatar group's `translate(...)` toward its price target, swaps the walk-cycle
  frame while moving, and animates a goods glyph plus a trade-flash burst
  between the trading pair (or the store edge) on each `payload.trades` entry.
  Under emulated `prefers-reduced-motion: reduce` the avatars snap with no
  interpolation, hold the frame-1 idle pose, and a trade shows an instant flash
  with no travel; no CSS transition drives avatar motion, so a reduced-motion
  render carries no tween artifacts. Added `src/ui/scenes/auction_tween.ts`
  (pure `priceToTrackY`/`easeToward` helpers) and `onSceneFrame` in
  `scene_manager.ts` (visual-only per-frame subscribers that never dispatch
  ticks, so the single-owner tick invariant is untouched). Slot->species map is
  fixed (player 0..3 = humanoid, gollumer, mechtron, packer) until species
  select lands at M8. The `game_flow.spec.mjs` selector contract holds
  unmodified (`.auction-track-svg`, per-participant `.auction-track-token` `cy`,
  the two store band lines, role buttons, trade log). Keyboard intent stays
  edge-driven (keydown up/down, keyup hold) to match the engine's discrete
  intent model, keeping the scene fully keyboard-playable. New hooks:
  `.auction-avatar[data-actor][data-role][data-y]`, the arena's
  `data-reduced-motion`, and the trade layer's monotonic `data-flash-count`.
  Verified: `tsc`/eslint/prettier clean; `check_codebase.sh` all 5 checks pass
  (node 170/170, +7 `test_auction_tween.mjs`); Playwright `game_flow.spec.mjs`,
  `auction_scene.spec.mjs` (new: keyboard-playability + reduced-motion), and
  `tick_ownership.spec.mjs` all green; `node tests/e2e/e2e_mini_flow.mjs`
  exits 0.
- UI (M5 WS-U-overworld): added the walkable overworld for the human's develop
  turn. New pure, node-tested modules `src/ui/scenes/walker.ts` (4-directional
  velocity from a held-key set, AABB clamp to board bounds, 64px-tile cell
  derivation, 0.4x mountain-obstacle slowdown, and a towed-follower that trails
  the avatar on a 40px slack; 80 px/s land-speed analog) and
  `src/ui/scenes/zones.ts` (rect cell zones, half-open point-in-zone query,
  town-cell lookup), with `tests/test_walker.mjs` + `tests/test_zones.mjs`
  (18 assertions: clamps, cell derivation, slowdown, tow convergence, zone
  containment, town find). New `src/ui/scenes/overworld_scene.tsx` renders the
  human's avatar (species by player slot, player-color tint) over the existing
  MapLayer during the human develop turn, moving it in its own presentation-only
  rAF loop (transform written through refs; the scene manager stays the sole
  tick owner) and speeding it up in step with `?speed=`. It tows a bought
  M.U.L.E. behind the avatar, exposes the selector contract
  `g[data-actor="player-0"]` with `data-cell-row`/`data-cell-col`/`data-carrying`
  plus a `[data-timer]` HUD bar draining the tick budget, and fires two spatial
  triggers: a capture-phase action key (Enter/Space) installs a carried
  outfitted M.U.L.E. on the avatar's own empty plot (stopping propagation so the
  menu store screen's Enter handler never double-dispatches), and standing on the
  town cell opens an interim `[data-store-overlay]` store panel (M7's town scene
  replaces it). The layer is strictly additive: the menu store screen stays
  mounted in `#game-panel` and its click-to-place path is untouched, so
  `game_flow.spec.mjs` passes unmodified. Wired in `src/ui/solid/game_screen.tsx`
  (unkeyed `<Show>` gated on the human develop turn) with overworld-only styles
  in `src/style.css`. New `tests/playwright/overworld_scene.spec.mjs` (5/5 at
  `?seed=33&speed=8`): keyboard walk, timer-bar drain, walk-to-own-plot + Enter
  install, town-overlay open/close, and reduced-motion (no animated avatar
  styles). Verified: `tsc`/eslint/prettier clean on touched files;
  `node --test tests/test_walker.mjs tests/test_zones.mjs` 18/18;
  `overworld_scene.spec.mjs` 5/5; `node tests/e2e/e2e_mini_flow.mjs` exits 0.
- Engine (M5, WS-E-land): added the colony land-auction phase between
  `land_grant` and `develop` every round. New `src/engine/land_auction.ts`:
  up to three colony plots per round gated by
  `LAND_AUCTION_COLONY_PROBABILITIES` (a later slot only rolls when the
  previous one sold, matching `PlotSeller.generateNextColonyAuction`), each
  seeded via `PlotSeller.beginAuction`'s pricing (first-ever $160,
  round-average-based for a round's first slot, previous-sale-based for a
  later slot, floored at $80, rounded to the nearest $4) and settled through
  a new discrete `bid_land`/going-tick-countdown analog of PM's real-time
  avatar price-axis-walk auction (participants raise their own standing bid,
  capped at `startPrice + 140`; three times `LAND_AUCTION_GOING_TICKS` idle
  ticks finalize a sale to the highest bidder or a drifted no-sale price,
  `startPrice/2 + 52`); ties break to a uniformly random candidate in round 1
  and the worst-ranked candidate afterward, matching `AbstractLandAuctionPhase
.auctionEndStateTimer`. A winning bid is a colony sink (deducted from the
  buyer, credited to no one, matching `PlotSeller.finishAuction`'s always-null
  `planetTile.getOwner()` for a colony-owned plot). `GameState` gained a
  `landMarket` field (`LandMarketState`: `priceAccumulator`/`setSize`/
  `lastSellPrice`) carrying the running price-seed memory across rounds. New
  `decideLandAuctionAction` in `src/ai/land_ai.ts`: values the offered plot by
  a fraction of the scoring formula's `LAND_VALUE_PER_PLOT`, terrain yield,
  owned-neighbor adjacency, and revealed crystite, bidding up to a fraction of
  money with a land-specific reserve (smaller than the develop/goods-auction
  reserve, since a missed land bid is opportunity cost, not a food emergency).
  New `tests/test_land_auction.mjs` (24 assertions: probability gating, price
  seeding/drift/floor/rounding, going-countdown, both tie-break modes,
  colony-sink accounting, phase-skip paths, bid-ceiling and
  bid-affordability invariants, an AI cannot-stall watchdog). Regenerated the
  `tests/test_replay_determinism.mjs` fixture (751 recorded actions) and
  extended `tests/test_full_game.mjs` and `tests/e2e/e2e_balance_sim.mjs` with
  a land-auction driving branch and a land-auction sim gate (dead-land-auction
  rate, mid-game clear-price ratio). Adjudications recorded in
  `docs/RULE_SOURCES.md`, "Colony land auction: pricing, bidding, tie-break
  (WS-E-land)": the discretized bid model versus PM's continuous avatar walk,
  the chain-continues-only-on-sale rule, the colony-sink proceeds direction,
  and running the land auction every round in both game modes (no
  beginner-mode gate was found in the Java). Verified: `tsc -p tsconfig.json`
  and `tsc -p tsconfig.lint.json` clean; `npx eslint --max-warnings 0` and
  `npx prettier --check` clean on touched files; `node --import tsx --test
'tests/test_*.mjs'` 194/194 (fixed six pre-existing test files whose
  land-grant-to-develop helpers needed a land-auction skip step:
  `test_turn.mjs`, `test_ai.mjs`, `test_auction.mjs`, `test_crystite.mjs`,
  `test_mule_economy.mjs`, `test_store_prices.mjs`); `pytest tests/` 629/629;
  `node tests/e2e/e2e_balance_sim.mjs` (default 30 seeds/mode) GATE PASS --
  beginner dead-land-auction rate 2.0%, standard 3.1% (both under the 0.2
  gate), 100% of mid-game land sales cleared at or above the price floor, all
  games terminated, zero negative-money games.
- UI (M5, the previously unassigned land-auction UI arm): fixed the scene-loop
  stall where a round drawing a colony `land_auction` (the WS-E-land phase
  above) rendered an empty `#game-panel` and dispatched zero ticks, since
  `scene_manager.ts` had no scheduling case for that phase kind.
  `scheduleLandAuction`/`landAuctionStep` (`src/ui/scenes/scene_manager.ts`)
  now tick the phase on the goods-auction cadence (`AUCTION_TICK_MS`/
  `AUCTION_FINISHED_PAUSE_MS`, reused rather than duplicated): each tick runs
  every AI's `decideLandAuctionAction`, then dispatches the engine tick; once
  the payload finishes, `end_land_auction` fires after the same pause the
  goods auction uses. Unlike the goods auction there is no human role-commit
  gate -- not bidding a plot already IS passing -- so the clock always runs.
  Added `src/ui/solid/land_auction_panel.tsx`: the plot under the hammer
  (highlighted on the board by reusing `MapLayer`'s existing `plot-cursor`
  affordance via `game_screen.tsx`'s shared cursor, no new `MapLayer` prop
  needed), the current ask, the high bidder (color swatch plus name/"You"),
  a going-once/going-twice/sold-or-no-sale readout derived from `goingTicks`
  against the exported `LAND_AUCTION_GOING_TICKS`, and the remaining
  colony-auction slot count. The engine has no explicit "pass" action for
  this phase, so the human's only dispatch is `bid_land` (Enter or
  `#land-bid-button`, gated by a `canBid` check mirroring
  `decideLandAuctionAction`'s degenerate cases so the UI never offers a bid
  the engine would reject); a Pass button and Escape just blur focus rather
  than dispatching anything. `game_screen.tsx` gained the `land_auction`
  `<Match>` arm and added `land_auction` to `phaseShowsMap` and the board
  cursor logic. New `tests/playwright/land_auction.spec.mjs` (seed 1234
  deterministically draws a round-1 land auction, confirmed by driving
  `applyAction`/`createInitialGameState` directly): panel renders, ticks
  advance without stalling, the phase settles into develop on its own, and a
  human bid updates the price and high bidder. Updated
  `tests/playwright/tick_ownership.spec.mjs`'s invariant checks to recognize
  `land_auction` as a legitimate tick-bearing phase that can open the
  sequence (it previously only expected `develop` first, written before this
  phase existed) and added `land_auction>develop` to its allowed
  transitions. Also gave `tests/playwright/game_flow.spec.mjs`'s three
  develop-reaching tests `?speed=8` (matching `tick_ownership.spec.mjs`'s
  existing mitigation): at the default `speed=1` a chained round-1 land
  auction can legitimately consume enough real wall-clock time to threaten
  their 30s default timeout, which a `--repeat-each` stress run reproduced
  before the speed bump and no longer does after it. Verified: `tsc -p
tsconfig.json` clean; `npx eslint --max-warnings 0` and `npx prettier
--check` clean on touched files; `check_codebase.sh` 5/5 (194/194 node
  tests); `tick_ownership.spec.mjs` + `game_flow.spec.mjs` (5/5) +
  `land_auction.spec.mjs` (2/2) all green, including a 4x repeat-run stress
  pass; `node tests/e2e/e2e_mini_flow.mjs` exits 0. Pre-existing, unrelated
  cross-lane red at hand-off: `sprite_gallery.spec.mjs`,
  `terrain_gallery.spec.mjs`, and `town_gallery.spec.mjs` fail on symbol-id
  assertions (title sprites bleeding into other galleries); none of the
  three import any file this change touches.
- Engine (M7 WS-E-production): completed the production formula and turned
  crystite yield on. `computeProduction` (`economy.ts`) now implements
  `capacity = terrainYield + adjacencyBonus + floor(sameResourceCount /
PRODUCTION_LEARNING_CURVE_DIVISOR) + tempBonus + round(normalDistributed(rng))`,
  clamped to `[0, PRODUCTION_MAX_YIELD]`: a new learning-curve count bonus
  (every one of a player's factories for a resource gets `floor(count / 3)`,
  verified against `Building.calcBonuses`) and an unconditional per-plot
  gaussian variance draw (verified NOT mode-scaled, per `Factory.
calcCapacity`), both new. Crystite factories now yield their plot's own
  `crystiteLevel` directly (verified `PlanetTile.getYieldPotential`'s
  `Crystite` case reads the deposit level with no terrain term at all), read
  regardless of `crystiteRevealed` (production is a real mechanic, not gated
  by the UI reveal fog; PM's own reveal only controls a display digit, never
  the real yield -- verified and adjudicated not to add a
  production-triggers-reveal rule). New `PRODUCTION_LEARNING_CURVE_DIVISOR`
  constant in `constants.ts`. `develop_ai.ts` gained two heuristics: outfit
  toward crystite when the player already owns an empty plot with a
  revealed level-2+ deposit worth more (`level * live crystite price`) than
  the scarcest resource's price, placing a carried crystite M.U.L.E. on its
  richest known deposit rather than the first empty plot; and, once flush
  with spare cash well beyond the reserve, spend idle develop ticks assaying
  a promising mountain-adjacent plot before ever buying a M.U.L.E.
  `tests/e2e/e2e_balance_sim.mjs` now reports crystite units sold per game
  (report-only, no gate). Full Java citations (`Factory.java`,
  `Building.java`, `Player.java`, `Resource.java`, `PlanetTile.java`) in
  `docs/RULE_SOURCES.md`, "Production: variance and the energy-shortfall
  model" and "Crystite production".
- Testing (art gate): added the visual-render art gate, an independent
  pixel-level check that art actually renders, not just that the expected DOM
  attributes exist. New pure-function module `tests/pixel_metrics.mjs`
  decodes a PNG buffer (via the new `pngjs` devDependency,
  `package.json`/`package-lock.json`) and computes non-background coverage
  ratio, distinct quantized color count, CIE76-deltaE palette-conformance
  ratio against `src/ui/sprites/palette.ts`'s tokens, and mean color of a
  region, unit-tested standalone in `tests/test_pixel_metrics.mjs` (11
  cases, no browser dependency). New
  `tests/playwright/visual_render.spec.mjs` applies these invariants over
  real `page.screenshot()`/`locator.screenshot()` PNGs: the 4 sprite/
  terrain/town/title galleries (non-blank coverage band, distinct-color
  band, >=85-95% palette conformance depending on the gallery's AA density),
  the `?demo=map` fixture's plains/river/mountain1 terrain regions (pairwise
  deltaE distinctness plus per-token deltaE), the title screen, and the
  `?demo=town` fixture (coverage band plus palette conformance). Chose
  programmatic pixel invariants over golden-image byte diffs (documented in
  the spec's header comment) since golden images break on font/AA/Chromium
  drift with no useful signal; every threshold was calibrated from 2
  consecutive local runs (byte-identical) with the measured value recorded
  in a comment beside its band. Found and worked around a data quirk while
  building this: `palette.ts`'s `textOnLight` token deliberately mirrors
  `bgDeep`'s hex, so the conformance check excludes both names, not just the
  screen's background token, or a background-adjacent pixel would "conform"
  twice under two names.
- Engine (M9 WS-E-endgame): scoring now matches planet_mule's
  `Player.calcPoints` exactly: `LAND_VALUE_PER_PLOT` (500) per owned plot
  unconditionally, plus a new `POINTS_PER_MULE` (35) plus that resource's
  `OUTFIT_COST` for every installed, outfitted M.U.L.E., plus goods valued at
  the store's live `state.store.prices` instead of the prior static
  `STORE_BASE_PRICE` table. `ScoringPayload` gained `breakdowns` (a per-player
  money/land/mule/goods/total record), `colonyTotal`, `colonyRatingTier` +
  `colonyRatingMessage` (the already-adjudicated PM formula,
  `clamp(colonyTotal / (20000 * roundCount / 12), 0, 6)` indexing 7 new
  `COLONY_RATING_MESSAGES`), `colonyFailed` + `failureMessage`, and
  `firstFounderId`. Added `checkColonyFailure` (scoring.ts): a non-final round
  ends the game early when total food or energy (store plus every player)
  hits zero with no food-outfitted M.U.L.E. anywhere on the board -- a literal
  planet_mule quirk verified directly in `SummaryPhase2.checkNoProduction`
  (both the food and energy branches gate on food production specifically,
  not the resource that ran out; reproduced faithfully rather than
  "corrected," see docs/RULE_SOURCES.md). First Founder (`firstFounderId`) is
  only awarded to the rank-1 player when the colony survives to its final
  round; a failed colony gets neither a founder nor a rating message, matching
  PM's `SummaryListener.summaryFinished` branching. `turn.ts`'s
  `endAuctionGood` now checks colony failure after each round's last auction,
  same seam as the existing final-round check. Added `tests/test_scoring.mjs`
  (20 tests: score-breakdown per-plot/per-mule/goods-at-current-price terms,
  colony-rating tier boundaries and beginner/standard scaling, colony-failure
  edges including the food-production-gate quirk, First Founder wiring).
  `computeScores`'s corrected formula is also picked up by its existing
  mid-game callers (`events.ts` `rankOrder`, `land_auction.ts`
  `worstRanked`), which changed colony-land-auction and develop-turn
  tie-break outcomes as soon as store prices move or a M.U.L.E. is installed,
  so `tests/test_replay_determinism.mjs`'s `RECORDED_ACTIONS` and
  `EXPECTED_STATE_HASH` were fully re-pinned per the file's own regeneration
  recipe (same seed, same hand-injected `assay_plot` for player 0 at (0, 0));
  no colony failure fired on that particular replay. `tests/e2e/e2e_balance_sim.mjs`
  gained report-only colony success rate and rating-tier histogram metrics (30
  seeds/mode: 96.7% success both modes, standard clustering entirely in tier
  1, beginner spanning tiers 1-2) as the explicit M10 baseline input for
  setting the final colony-rating pass band. Full adjudication in
  docs/RULE_SOURCES.md: "Endgame scoring: per-plot and per-mule terms",
  "Colony failure: food-production gate", "First Founder and colony rating:
  only awarded on survival", and "M9 balance sim record".

### Behavior or Interface Changes

- AI (M10 WS-balance): rank-aware land-bid dampening in `src/ai/land_ai.ts`.
  `valueCap` now multiplies each bidder's money cap by a rank-keyed factor
  (`LAND_BID_RANK_FACTORS = [0.7, 1.0, 1.2, 1.2]`, indexed by `rankOrder`): the
  round's leader commits a smaller slice of its money to a plot and the bottom
  two ranks a larger slice, mirroring the leader-penalized/trailer-favored
  fairness pattern `events.ts` uses for personal events. This shrinks the
  leader's land-auction dominance (owned land is ~92-94% of final score), so
  the round-6 leader's game-win rate drops from 51.1% to 38.6% over 300 seeds
  without touching any PM-sourced constant. See docs/RULE_SOURCES.md "Land AI
  valuation and sim-tuning record".
- Sim harness (M10 WS-balance): the M10 release-gate metrics in
  `e2e_balance_sim.mjs` (round-6-leader win rate < 50%, four-goods liveness,
  colony pass band) are hard-gated on standard mode only and only at 100+ seeds,
  matching the plan's "100+ seeded 12-round sims" scope; beginner and the
  30-seed smoke still hard-gate every always-on liveness/safety metric in both
  modes. The four-goods gate hard-gates food/energy/smithore at median >= 1 and
  REPORTS crystite (the store-only-buyer export good, which structurally trades
  in only ~48% of standard games) rather than hard-gating it. See
  docs/RULE_SOURCES.md "M10 balance sim record".
- Engine (M4 WS-E-auction): rebuilt the goods-auction engine to planet_mule
  fidelity, fixing the dead-auction-window collapse (55.4% beginner / 76.1%
  standard dead-window rate down to 0.0% / 0.0% over 100 seeded games per mode).
  The retired v1 model (one global `[5, 100]` price band, 20-tick timeout, one
  price step for all goods) is replaced by: per-good price bands read live from
  the store's buy/sell quotes (`band = [storeBuyQuote, storeSellQuote]`, always
  spread-wide so it never collapses when dynamic prices climb past 100); role
  auto-assignment from planet_mule critical thresholds (food critical = next
  develop turn's requirement, energy = powered-M.U.L.E. count + 1,
  smithore/crystite never critical so any holder sells) with buyers seated at the
  band floor walking up and sellers at the ceiling walking down; crystite added
  as a fourth auctioned good with a price step of 4 (others 1) in planet_mule's
  runtime order smithore, crystite, food, energy; a crystite store-only-buyer
  market that sinks the crystite the store buys (store crystite stays 0); a
  quiet-tick countdown that maps planet_mule's slow-while-walking, pause-during-
  transaction timer (the window clock advances only on a fully idle tick), an
  idle-timeout early end, and a hard tick ceiling (cannot-stall watchdog); a
  tick-mapped transfer-rate cooldown; and a skip rule that runs no trading phase
  on the last round or when no trade is possible (no seller and no below-critical
  buyer -- a demand-side extension of planet_mule's supply-only `goodsForSale`
  skip). `AuctionPayload` gained additive fields (`skipped`, `priceStep`,
  `idleTicks`, `tradeCooldown`, `runUnits`); `priceFloor`/`priceCeiling` now equal
  the live store buy/sell quotes; all existing payload fields are unchanged.
  Players are auto-assigned buyer/seller at tick 0 (no longer all `out`). Full
  rule extraction with Java line citations in `docs/RULE_SOURCES.md`, "Goods
  auction: bands, roles, timing, transfer (WS-E-auction)".
- UI (M2 WS-U-port): the live game now runs entirely on the reactive Solid store
  driven by a single `requestAnimationFrame` scene loop; the old setTimeout phase
  chains and imperative DOM renderers are gone. `game_driver.ts`'s public shape
  changed accordingly: `startNewGame` now takes a `{ seed, speed }` config
  instead of a screen id, and the module exports `currentGameStore()`,
  `playAgain()`, and `HUMAN_ID` (the game screen and Play Again button consume
  these). Game start is deterministic under `?seed=` and clock-scalable under
  `?speed=`. Every documented Playwright selector is preserved, so the regression
  specs pass unmodified. See the M2 WS-U-port entry above for the full scope.
- UI art (M8 WS-A-title, colorblind palette repair): `player2` and
  `player3` changed in `src/ui/sprites/palette.ts`'s `PALETTE` and
  `src/ui/sprites.ts`'s `PLAYER_COLORS` (values only), because
  `tests/test_player_color_distinct.mjs` (a simulator-based CIE76 deltaE
  check added in a concurrent patch) failed against the original palette:
  `player0` vs `player2` deltaE 6.15 (protanopia) / 9.69 (deuteranopia),
  `player1` vs `player3` deltaE 7.49 (protanopia) / 19.00 (deuteranopia),
  both under the 20 separability threshold. `player2` moved from
  `#ffd23f` (gold -- previously an intentional but risky overlap with the
  `gold` accent token) to `#3aaa18` (green); `player3` moved from
  `#c77dff` (lavender-violet) to `#f872e8` (orchid). `player0`
  (`#ff5a5f`, coral red) and `player1` (`#4fd8ff`, cyan) are unchanged.
  New worst-case pairwise deltaE is 22.45 (`player1` vs `player3`,
  protanopia) and 22.64 (`player2` vs `player3`, deuteranopia), both
  comfortably above 20; full 6-pair matrix recorded in
  `docs/active_plans/active/mule_art_style_spec.md`'s
  "Simulator-verified pairwise separation" table. `textOnLight` contrast
  against the new values stays well above the house 5.5:1 target (`player2`
  5.64:1, `player3` 6.96:1). `gold` (`#ffd23f`) is now the sole owner of
  its hex; no token shares it. `tests/test_player_color_distinct.mjs`
  (3/3) and `tests/test_sprite_palette.mjs` (2/2) both pass.
- UI art (M8 WS-A-title, arena domain ratification): amended
  `docs/active_plans/active/mule_art_style_spec.md`'s closed symbol-id
  domain set to add `arena` (ratifying `sprites_arena.ts`'s auction-arena
  chrome as its own domain instead of the `icon` domain it launched under)
  and `title` (for this patch's own backdrop-scale title-screen assets,
  which don't fit any prior domain). Renamed every `sprites_arena.ts`
  symbol id from `sprite-icon-auction-<name>` to `sprite-arena-<name>`
  (`arenaSymbolId`'s return value only; `ARENA_CHROME_NAMES` and the
  function signature are unchanged) and updated the two consumers that
  referenced the domain, not the raw string, so no call-site edits were
  needed beyond `tests/playwright/town_gallery.spec.mjs`'s
  `SPRITE_DOMAINS` naming-convention list (added `"arena"`). Verified
  `grep -rn "sprite-icon-auction"` finds only historical
  changelog/doc-comment references after the rename.
- Engine (M7 WS-E-production): corrected the adjacency bonus from
  per-matching-neighbor (up to 4x `ADJACENCY_BONUS_PER_NEIGHBOR`, this
  engine's own unverified M1-era reading) to a FLAT bonus applied once any
  same-owner, same-resource orthogonal neighbor exists, matching
  `Building.calcBonuses`'s `n5 > 0` branch (which never reads `n5`'s exact
  value). Changed the energy-shortfall gate from a fixed row-major board
  order to a random per-player Fisher-Yates shuffle order each round
  (matching `Player.useEnergy`'s `Collections.shuffle`), so a board-position
  advantage no longer determines which mule loses power on a shortfall;
  `computeProduction` gained a required `rng: Rng` parameter (fourth
  positional argument, before the existing optional `modifiers`) to drive
  both the shuffle and the new variance draw, and now reads from
  `state.rngState` (the core economy/auction stream) via `turn.ts`'s
  `enterProduction`, which previously never touched the RNG at all.

### Fixes and Maintenance

- UI (M11 WS-U-pub): wired the human's pub gambling flow, closing the M8
  "all standard-mode mechanics playable" gap for the human seat (AI usage and
  the engine's `gamble` action were already complete; only the human's town
  door still showed an "opens soon" placeholder). `src/ui/scenes/town_scene.tsx`'s
  pub door now opens a keyboard-accessible confirm affordance ("Gamble and
  end turn?", `[data-gamble-confirming]`) before dispatching -- gambling
  always ends the turn (`applyGamble` in `src/engine/turn.ts`), so a single
  accidental action-key press must not trigger it; the action key confirms,
  Escape declines with no engine effect, and movement freezes while the
  confirm is up. The payout banner (`[data-pub-banner]`/
  `[data-pub-banner-amount]`, honoring `data-reduced-motion`) cannot live in
  the scene's own Solid-owned tree: dispatching `gamble` synchronously flips
  the human's develop payload away, which tears the whole town scene down as
  part of that same dispatch call before any code after it could render, so
  `showPubBanner` appends a plain DOM node straight to `document.body`,
  outside Solid's ownership, so it survives the teardown (new `.pub-banner`
  CSS in `src/style.css`, styled after the wampus-catch-banner precedent).
  New `tests/playwright/pub_gamble.spec.mjs` (3 specs): the confirm/decline
  round-trip with no state change, the full confirm-pays-out-banner-ends-turn
  path (asserting a positive payout <= the engine's $250 cap, the HUD money
  delta matches the banner's amount exactly, and the next player's turn is
  live via `[data-ai-actor-player]`), and a reduced-motion variant. Note:
  `tests/playwright/town_scene.spec.mjs`'s existing "pub door shows an
  opens-soon notice" test (owned by another lane) now asserts stale copy and
  needs updating to match; flagged separately rather than edited here.

- Tests (town-scene "stuck at pub door" investigation): root-caused the
  reported avatar-stuck-at-pub-door failures in
  `tests/playwright/town_scene.spec.mjs`'s "buy at corral" and "assay office"
  specs. It is not a `town_scene.tsx` movement or confirm-freeze bug -- a
  `MutationObserver`-based trace of `data-at-door` confirmed the avatar
  crosses every door smoothly (~400ms dwell each at `?speed=2`) with
  `data-gamble-confirming` staying `false` the whole transit, so the pub's
  confirm affordance does not engage on mere walk-past. The real cause is the
  spec's `useDoor` helper: it held the direction key down for the whole walk
  while polling `data-at-door` for one exact target value, racing a plain
  `getAttribute` round trip against the ~400ms-per-door window. Once that
  round trip runs slow (several Playwright suites contending for the same
  machine), the poll can miss the target door's entire window while the key
  stays held, so the avatar keeps walking straight out the far edge exit --
  unmounting `#town-scene` and leaving the poll re-reading a now-detached
  locator for the rest of its 15s timeout, which reports whatever door it
  last actually saw (often "pub", the last door before the overshoot).
  Fixed by rewriting `useDoor` to advance in bounded taps (hold the direction
  key for a fixed `WALK_TAP_MS` = 120ms, release, then check) instead of one
  continuous hold: each tap moves the avatar well under one door-cell width,
  so a slow check can only delay noticing arrival, never let the avatar sail
  past the door. Also finished the land-grant claim-helper migration this
  file was mid-way through (`claimLandGrantPlotAt`, an Enter-key sweep-cursor
  wait matching `game_flow.spec.mjs`, replacing the old off-cursor plot
  click) and strengthened its ownership check to `data-owner="0"` plus the
  M.U.L.E.-placement assertion to the human's own plot cell specifically
  (not just anywhere on the map). Replaced the stale "pub door shows an
  opens-soon notice" test (the notice no longer exists post WS-U-pub) with a
  narrower door-affordance check -- action key opens
  `[data-gamble-confirming]`, Escape closes it -- since
  `tests/playwright/pub_gamble.spec.mjs` already owns the full confirm/
  payout/turn-end contract. Verified `tests/playwright/town_scene.spec.mjs`
  and `tests/playwright/pub_gamble.spec.mjs` together, twice, all 6 specs
  green each run (about 8s total, versus the prior run regularly burning its
  full 90s test timeout on the two failures). `pub_gamble.spec.mjs`'s own
  `walkToDoor` helper shares the same continuous-hold-and-poll shape, so it
  carries the same latent race; left untouched here since it is this fix's
  regression guard and out of this task's boundary, but worth the same
  bounded-tap treatment later.

- Docs (M10 WS-release, docs drift sweep): re-verified every item in
  `docs/active_plans/audits/docs_drift_audit.md` against the current tree
  (the audit undercounted -- several "not started" milestones it recorded
  were already shipped by the time this sweep ran) and fixed the durable
  doc set to match. `docs/CODE_ARCHITECTURE.md`: added the missing
  `events.ts`, `land_auction.ts`, `round_scale.ts`, `wampus.ts` engine rows;
  replaced the thin UI module map with a full per-subdirectory listing of
  `src/ui/scenes/`, `src/ui/solid/`, and the `src/ui/sprites/` split (12+
  files); added a "Build pipeline" section documenting `pipeline/build.mjs`
  (the esbuild JS-API + `esbuild-plugin-solid` path the canonical CLI
  cannot use); corrected the phase-state-machine diagram, which was still
  showing the pre-land-auction, 3-good (food/energy/smithore) cycle -- the
  real cycle is `land_grant -> land_auction (0-3 slots) -> develop x4 ->
production -> auction x4 goods (smithore, crystite, food, energy)`, per
  `AUCTION_GOOD_ORDER` in `turn.ts`; added the full `?seed=`/`?speed=`/
  `?demo=`/`?mode=`/`?species=`/`?timer=` URL param table; refreshed Test
  layout for `tests/e2e/` and the current Playwright spec set. Files
  referencing untracked in-flight source (`dpad.tsx`,
  `wampus_presentation.ts`, `sprites_wampus.ts`, and three `*_demo.tsx`
  fixtures) are cited as plain backtick paths rather than Markdown links,
  since `tests/test_markdown_links.py` requires link targets to be
  git-tracked. `docs/FILE_STRUCTURE.md`: added `pipeline/` to the top-level
  tree; fixed the stale `src/main.ts` entry-point claim to note it imports
  `src/ui/main.tsx`; expanded the `src/ui/` subtree to show `scenes/`,
  `solid/`, `sprites/`; replaced the stale 3-file Playwright example list
  with the current shape; added a `tests/e2e/` entry; added the missing
  `docs/INSTALL.md`, `docs/USAGE.md`, `docs/RULE_SOURCES.md`,
  `docs/REFERENCE_REPOS.md`, `docs/RELEASE_HISTORY.md`, `docs/NEWS.md`
  rows to the Documentation map. `docs/USAGE.md`: documented
  `pipeline/build.mjs` as the real build path; documented all five
  `?demo=` values (`map`, `town`, `ai_actor`, `mule_escape`, `wampus`) plus
  `?seed=`/`?speed=`/`?mode=`/`?species=`/`?timer=relaxed`; replaced the
  dead `tests/playwright/smoke.spec.ts` example (no `.spec.ts` file exists
  anywhere; every spec is `.spec.mjs`) with a real spec path; added run
  instructions for `tests/e2e/`'s three harnesses and for the Node unit
  test suite (`node --import tsx --test tests/test_*.mjs`).
  `docs/INSTALL.md` needed no change (re-verified, still accurate).
  `README.md`: rewrote the "Features" list to cover everything shipped
  since v1 scope (walkable overworld/town, personal/colony events, land
  auctions, crystite, wampus, mode/species select, accessibility pass,
  relaxed timer); updated the Status line to reflect the M7
  `e2e_full_game.mjs` full-playthrough gate without overclaiming final
  balance/release polish (WS-balance is still active); added
  `docs/RULE_SOURCES.md`/`docs/REFERENCE_REPOS.md` to the Documentation
  list. `docs/TODO.md`: removed land auctions, random events, crystite,
  and the Wampus mechanic from the "Future fidelity plan" backlog list (all
  four are implemented) and retitled the section "Gambling" now that it is
  the one remaining item (the pub's "opens soon" notice, per
  `town_scene.tsx`); left the `deadAuctionWindowRate` figure flagged for
  WS-balance re-verification rather than restating it as current.
  `docs/active_plans/active/mule_fidelity_plan.md`: added a Status column
  to the Milestone plan table (M1-M9 DONE and review-gated, with the
  changelog-tag date range backing each; M10 IN FLIGHT; M11 PENDING) and a
  short dated status note resolving the stale `auction_screen.ts`
  working-tree flag and pointing at the new Status column instead of
  rewriting the historical "Current state summary" section (per this
  workstream's scope: status annotations only, not a plan-content
  rewrite).
- Docs (M10 WS-release): recaptured `docs/screenshots/` from the freshest
  available renders under `output_smoke/gameplay/` and
  `output_smoke/art_gate/` (all four prior screenshots were captured
  2026-07-08, before the SolidJS/town rework). `title_screen.png`,
  `land_grant_map.png`, and `auction_track.png` were refreshed in place;
  `docs/screenshots/store_screen.png` (the deleted store-menu screen) was
  removed and replaced by two new files, `town_interior.png` (the walkable
  town interior that replaced it) and `land_auction.png` (the new colony
  land-auction phase); `README.md`'s screenshots block and alt text were
  updated to match.
- UI (M9 WS-U-polish, art-gate round-3 POLISH carryovers): title screen's
  ringed planet (`title_screen.tsx`) no longer crops hard at the top frame
  edge on wide viewports -- `preserveAspectRatio="xMidYMid slice"`'s crop
  window is always symmetric around the backdrop viewBox's true vertical
  center (210), not the previous `PLANET_CENTER_Y = 110` "upper third"
  placement, so the planet (now `PLANET_CENTER_Y = 210`, `PLANET_RENDER_SIZE`
  170 -> 150 for margin) is the one placement guaranteed to survive the crop
  at any aspect ratio; the landing ship's `SHIP_Y` moved from 250 to 240 to
  stay inside the same worst-case crop window. `#game-map` gains a 16px
  `margin-top` and `.overworld-timer`'s `top` moves from `4px` to `-16px`,
  giving the turn-timer bar its own space above the map instead of
  overlapping the top tile row (present since round 2). Verified all three
  by direct screenshot (`output_smoke/art_gate/title_screen_live_v3.png`,
  `overworld_walk_v3.png`) and by re-running `tests/playwright/
visual_render.spec.mjs`'s calibrated title-screen coverage/conformance
  bands, which held without recalibration.
- UI (M9 WS-U-polish, art-gate round-3 POLISH carryover): re-checked with a
  fresh capture (`output_smoke/art_gate/production_yields_v3.png`), the
  production readout no longer clips at the viewport bottom -- all 4
  player rows render with margin to spare below at 1280x800. The badge-
  placement finding ("food diamond adjacent-to-mule vs smithore chunk in
  tile corner") was investigated and found already resolved:
  `map_layer.tsx`'s `MuleGlyph` uses one unified `badgeX`/`badgeY` formula
  for all 4 outfit types (top-right corner, distinct from the crystite
  deposit badge's top-left corner and circular shape), so no code change
  was needed for either.
- UI (scene cadence, user-reported): fixed the develop-turn timer draining
  about 4x too fast. `scene_manager.ts`'s `DEVELOP_TICK_MS` was `250`,
  draining the engine's `DEVELOP_TICKS_FULL` (50-tick) budget in 12.5s real
  time; the engine side of that budget is anchored to planet_mule's
  `developmentMaxTime` (47.5s, `ticksPerSecond = 50 / 47.5`, see
  `docs/RULE_SOURCES.md`), so the UI cadence was never wired to match its own
  documented anchor. Set `DEVELOP_TICK_MS = 950` (47.5s / 50 ticks) so a
  fully-fed human develop turn now drains in 47.5s real time, matching PM;
  `?speed=` still scales it (`speed=8` -> ~119ms/tick for the Playwright/E2E
  suites, unchanged). Surveyed the other UI-only cadence constants in the same
  file (`AI_STEP_MS` 400, `AUCTION_TICK_MS` 500, `PRODUCTION_PAUSE_MS` 2000,
  `AUCTION_FINISHED_PAUSE_MS` 1500): none has a documented PM-fidelity anchor
  in `docs/RULE_SOURCES.md` or `mule_fidelity_plan.md` (unlike
  `DEVELOP_TICK_MS`, which does via `DEVELOP_TICKS_FULL`); they are UI-only
  pacing choices and were left unchanged. No spec required a wait-strategy
  change: the full Playwright suite (31/31) and `node
tests/e2e/e2e_full_game.mjs` both pass unmodified against the new cadence,
  since every spec already polls on state rather than sleeping a fixed
  duration.
- Engine (WS-E-mules, WS-E-foodfix): fixed the develop-phase food-timer
  off-by-one flagged by WS-E-events' round-base correction. `turn.ts`'s
  `beginDevelopTurn` now reads `FOOD_REQUIREMENTS_BY_ROUND[min(state.round,
12)]` (previously `[state.round - 1]`), matching planet_mule's
  `Player.useFood(getRound())` under the corrected 1-based `getRound()`
  premise (`getRound()` equals this engine's round number directly, with no
  shift, throughout that round's phases -- see "muleCurve round base" in
  `docs/RULE_SOURCES.md`). Round 1 now consumes 3 food per player instead of
  a free round; the tick-budget floor/ceiling formula is unchanged.
  `computeColonyStats` (store.ts) needed no change: its `min(nextRound, 12)`
  index was already correct under the new premise, because `nextRound =
state.round + 1` is computed structurally, not via the round-offset
  formula that needed correcting. Re-verified against the decompiled Java
  (`Shop.java` lines 318, 342; `Player.java` line 167; `CollectionPhase.java`
  line 58; `SummaryPhase2.java` line 143) and re-pinned
  `docs/RULE_SOURCES.md`'s "Food requirement index" section as RESOLVED, with
  worked examples for round 1 and the round-4/5 boundary. Regenerated the
  `tests/test_replay_determinism.mjs` pinned fixture (round-1 food
  consumption shifts the AI's downstream auction/develop decisions from round
  1 onward, changing the recorded action log's shape, not just the hash) and
  updated `tests/test_turn.mjs`'s round-1 develop-timer cases to assert the
  now-nonzero requirement. Flagged a related, out-of-scope finding for a
  follow-up: `auction.ts`'s `auctionResourceCritical` (food case) and its
  `docs/RULE_SOURCES.md` "Role auto-assignment from critical thresholds"
  citation still read `FOOD_REQUIREMENTS_BY_ROUND[min(round, 12)]` under the
  same now-superseded 0-based-offset premise this fix corrected elsewhere; it
  should read `min(round + 1, 12)` to match `Player.getResourceCritical`
  (`Player.java` lines 456-471, `foodRequirements[getRound() + 1]`) under the
  1-based premise.
- Engine (M4 WS-E-auction, review follow-up): fixed the exact food-critical
  off-by-one flagged above. `auction.ts`'s `auctionResourceCritical` now reads
  `FOOD_REQUIREMENTS_BY_ROUND[min(round + 1, 12)]` (previously `[min(round,
12)]`), matching `Player.getResourceCritical` (`Player.java` lines 456-467,
  `foodRequirements[n + 1]` with `n = gameModel.getRound()`), called from
  `AbstractAuctionPhase.begin` (`AbstractAuctionPhase.java` line 118) once per
  player at the start of each good's auction window -- the same round-`R`-
  auction call site already traced for `Shop.calcBuySellPrice`/
  `Shop.getFoodNeed`. A round's own auction now anticipates the NEXT round's
  develop-phase food requirement, one round ahead, the same offset as store
  pricing. Diverges from the prior value at the table's two step points: round
  4's food critical is now 4 (previously 3) and round 8's is now 5 (previously
  4). Re-pinned `docs/RULE_SOURCES.md`'s "Role auto-assignment from critical
  thresholds" section off the superseded premise and appended a resolution
  note under "Food requirement index" cross-referencing both. Added
  `tests/test_auction_fidelity.mjs` cases pinning the round-4 and round-8
  boundaries alongside the existing round-1 case.
- Tests (Playwright, M7 WS-U-town follow-up): `tests/playwright/auction_scene.spec.mjs`
  and `tests/playwright/land_auction.spec.mjs` were timing out on
  `.store-screen-buy-button`, a selector from the interim store overlay
  M7 deleted (`store_screen.tsx` is gone; develop now runs through the
  walkable overworld/town scenes). Both specs now wait on the same
  develop-turn signal `tests/playwright/overworld_scene.spec.mjs` and
  `tests/playwright/tick_ownership.spec.mjs` already use -- the
  `.overworld-svg [data-actor='player-0']` avatar mount (`land_auction.spec.mjs`)
  or simply the next phase's own control (`auction_scene.spec.mjs`'s role
  buttons), since the human's develop turn now drains on its tick-budget timer
  with no button to skip through. Updated both specs' selector-contract
  header comments to match.
- Engine (M4 WS-E-auction follow-ons): `develop_ai.ts` now estimates a M.U.L.E.
  purchase against the store's live `store.mulePrice` (dynamic since WS-E-mules)
  instead of the flat game-start `MULE_BASE_PRICE` seed. Re-verified the
  `docs/RULE_SOURCES.md` "Food requirement index" flagged discrepancy against the
  planet_mule Java and resolved it as NOT a bug: `computeColonyStats`'s food-
  demand index (`min(nextRound, 12)`) is correct because planet_mule's round
  counter is constant across a play-round's develop and collection phases
  (`beginNextRound` increments only at `SummaryPhase2`), so round X's auction
  prices with index X and matches round X+1's develop consumption. No code change
  to `computeColonyStats`; the resolution is recorded in `docs/RULE_SOURCES.md`.
- UI (M2 WS-U-port follow-ons): the store screen's Buy button now shows the live
  `store.mulePrice` (rebuilt each round by the engine; `MULE_BASE_PRICE` only
  seeds the opening value) instead of the static base price, and its
  `disabled` state already reflects `muleStock === 0` via `canBuyMule`. Repaired
  the `docs/CODE_ARCHITECTURE.md` dead links created by the M1 `main.ts` ->
  `main.tsx` rename and the M2 deletion of `hud.ts`/`map_render.ts`/
  `store_screen.ts`/`auction_screen.ts`: the `src/ui/` file table and the "Game
  driver" section now describe the SolidJS layer (store live path, `GameScreen`,
  `scene_manager.ts` rAF loop) and link the current components; verified with
  `pytest tests/test_markdown_links.py` (`CODE_ARCHITECTURE.md` passes).
- Art (WS-A-fixes, art-gate SHOULD-FIX pass): addressed the art-gate
  assessment's SHOULD-FIX list (`docs/active_plans/audits/art_gate_assessment.md`)
  for the art-side items (the title-screen wiring MUST-FIX is a separate UI
  lane). Added a `keylineLight` (`#ffffff`) `PALETTE` token
  (`src/ui/sprites/palette.ts`) and a `keylineOuterShapeMarkup()` helper in
  `src/ui/sprites/sprites_species.ts` that draws every species symbol's
  outer-silhouette primitive twice -- a wider light halo stroke, then the
  usual tinted fill with its darkened stroke on top -- applied uniformly to
  all 8 species x 2 frames x 4 player tints, fixing the MARGINAL
  `player2`-vs-`terrainPlain` avatar-visibility grade (`player2` body-fill
  alone measured 1.05:1, under the WCAG 1.4.11 3:1 non-text minimum;
  `keylineLight` measures 3.19:1 against `terrainPlain`, clearing it).
  `tests/test_player_color_distinct.mjs` stays green (no palette-hue
  changes). Reworked the humanoid, `bonzoid`, and `packer` species
  silhouettes the assessment flagged as too similar at 32px ("humanoid /
  broad-shouldered / pear" trio, all reading as "circle head on rounded
  torso"): humanoid gained a flat-brim helmet bar and close side arms;
  `bonzoid`'s arms now extend to near-ground knuckle nubs (an explicit
  knuckle-walk hint); `packer` became an inverse-taper hexagon body (wide
  bottom, narrow top, no arms) instead of a small-head-on-wide-rect torso.
  Fixed the four gallery fixture modules (`sprite_gallery.ts`,
  `terrain_gallery.ts`, `town_gallery.ts`, `title_gallery.ts`) that
  previously appended their `renderXGallery(container)` output as a plain,
  unstyled `<div>` alongside the live title screen -- content rendered
  crammed small behind the title screen's placeholder text. Each module's
  render function now styles the passed-in container as a full-viewport,
  opaque (`bgDeep`), fixed-position sheet with a flex-column section layout
  and a label above each section; all existing `data-*` selector contracts
  and symbol ids are unchanged. Updated
  `docs/active_plans/active/mule_art_style_spec.md` with a new "Avatar
  keyline" section (rationale, technique, measured contrast), the new
  `keylineLight` palette token row (21 tokens total), and a Known-risks
  RESOLVED entry for both the avatar-visibility and silhouette-
  differentiation SHOULD-FIX items. Regenerated
  `output_smoke/art_gate/sprite_gallery_v2.png`, `terrain_gallery_v2.png`,
  `town_gallery_v2.png`, and `title_gallery_v2.png` as the visual verification
  evidence for the keyline and silhouette fixes.
- UI (WS-U-title-wire, art-gate MUST-FIX): wired the M8 WS-A-title sprite set
  (`src/ui/sprites/sprites_title.ts`) into the live title screen
  (`src/ui/solid/title_screen.tsx`), closing the art gate assessment's single
  MUST-FIX (`docs/active_plans/audits/art_gate_assessment.md`: the shipped
  title screen used none of the finished title art). The screen now composes
  a backdrop `<svg>` (a 24-star fixed-seed starfield, the ringed planet, and
  the landing ship as a small accent) behind a foreground group holding the
  dot-matrix gold wordmark (`sprite-title-logo`) and the New Game button,
  matching the style spec's stated hierarchy: wordmark dominant, planet
  backdrop, ship accent. Star positions are a hardcoded seed array (no
  `Math.random`, no per-render formula) so the composed scene renders
  identically every time. Kept the screen-reader-visible `<h1>M.U.L.E.</h1>`
  heading (visually hidden; the wordmark SVG carries `role="img"` plus
  `aria-label="M.U.L.E."` for sighted users) and the `#new-game-button` id
  unchanged, so `tests/playwright/game_flow.spec.mjs`'s selector contract
  still holds (5/5 green). Twinkle/drift motion on the stars and ship is pure
  CSS, gated behind `@media (prefers-reduced-motion: no-preference)` in
  `src/style.css`: the unconditional rules are the static reduced-motion
  fallback. Added title-screen-scoped classes to `src/style.css` only
  (`.title-screen*`); no other screens' styles touched. Verified: `npx tsc
--noEmit -p tsconfig.json` clean, `npx eslint --max-warnings 0` and `npx
prettier --check` clean on the touched files, `./build_github_pages.sh`
  succeeds, and `PW_PORT=<random> npx playwright test
tests/playwright/game_flow.spec.mjs` passes 5/5. Captured
  `output_smoke/art_gate/title_screen_live_v2.png` via a deleted scratch
  script (`_capture_title_screen_live_v2.mjs`, following the existing
  `_capture_art_gate_v2.mjs` build-serve-screenshot pattern) showing the
  planet, wordmark, starfield, ship, and styled button all composed on
  screen.
- Docs (M8 WS-A-title): recorded the frame-suffix naming clarification
  WS-A-actors flagged in `mule_art_style_spec.md`'s Animation frame policy
  section: an animated sprite carries an explicit `-frameN` suffix on
  every frame including frame 1 (no unsuffixed shorthand for "frame 1 of
  an animated sprite"), while the unsuffixed bare id is reserved for
  sprites with exactly one pose that never animates. This matches what
  `sprites_species.ts` and `sprites_mule.ts` already do; the doc previously
  read ambiguously enough to flag as a clarification, not a behavior
  change.

- Engine (M2 WS-E-blooms): split the fused upkeep-and-spoilage
  `applySpoilage(goods, round)` into `applyUpkeep(goods, round)` (unchanged
  round-scaled food/energy consumption, preserved as-is) and a new
  round-independent `applySpoilage(goods)` implementing planet_mule's exact
  `Player.calcSpoilage` rule in place of the old flat-rate decay: food loses
  `floor(food / 2)`, energy loses `floor(energy / 4)`, smithore and crystite
  are each capped at `ORE_SPOILAGE_CAP` (50), losing any amount above it.
  `turn.ts`'s `enterProduction` now calls `applyUpkeep` then `applySpoilage`
  in sequence. Net numeric effect: players keep more surplus food and energy
  than before (PM's floor-based kept-remainder is more generous than the old
  50%/25% flat decay at typical mid-game quantities -- see
  docs/RULE_SOURCES.md for a worked example). Retired
  `FOOD_SPOILAGE_RATE`/`ENERGY_DECAY_RATE`/`SMITHORE_DECAY_RATE`/
  `CRYSTITE_DECAY_RATE` from `constants.ts`, replaced by
  `FOOD_SPOILAGE_DIVISOR`, `ENERGY_SPOILAGE_DIVISOR`, and the shared
  `ORE_SPOILAGE_CAP`.
- Engine (M3 WS-E-prices): store prices are no longer flat. Round 1 auctions
  still open at planet_mule's initial prices, but from round 2 on each good's
  base is recomputed from colony supply/demand and each good's post-auction
  average trade price feeds its next base, so the auction band shifts round to
  round. The auction store band reads these live quotes (which already carry
  PM's buy/sell spread), so `AUCTION_STORE_SPREAD` is no longer applied on top
  (the constant is retained, unused, pending WS-E-auction band-width work). The
  pinned replay fixture `EXPECTED_STATE_HASH` in
  `tests/test_replay_determinism.mjs` was regenerated: the frozen action log is
  unchanged (same Action schema), but the recalc now advances the seeded Rng
  (smithore jitter + crystite draw) and reshapes the store between rounds, so
  the final GameState moved; same-seed determinism is unaffected.
- Tests (gallery symbol-id bleed): fixed `sprite_gallery.spec.mjs`,
  `terrain_gallery.spec.mjs`, `town_gallery.spec.mjs`, and
  `title_gallery.spec.mjs` failing their `<symbol>` naming-convention
  assertions. Root cause: each spec injects its bundled gallery module into
  the already-built `dist/index.html` shell, and the live app's title screen
  now mounts its own sprite `<symbol>` defs (`buildTitleSpriteDefsMarkup` in
  `src/ui/solid/title_screen.tsx`), so an unscoped `page.locator("symbol")`
  counted the app's title-screen symbols alongside the gallery's own. Each
  gallery module (`src/ui/sprites/*_gallery.ts`) already mounts its `<defs>`
  host as a child of the container element it is given
  (`container.appendChild(buildDefsHost())`), so the fix scopes each spec's
  symbol query to its own gallery container id (`#sprite-gallery symbol`,
  `#terrain-gallery symbol`, `#town-gallery symbol`, `#title-gallery symbol`)
  instead of querying the whole page; counts and naming-convention checks are
  unchanged. Other gallery-specific attribute selectors (`[data-terrain]`,
  `[data-title-element]`, etc.) were confirmed not to collide with the live
  app, since the app's `data-terrain` cells live in `GameScreen`, which is
  gated behind a `<Match>` and unmounted while the title screen shows.
- Engine (M7 WS-E-production): regenerated `tests/test_replay_determinism.mjs`'s
  fixture in full (same `REPLAY_SEED = 2026`, same hand-injected `assay_plot`
  for player 0 at (0, 0)) -- production consuming `state.rngState` for the
  first time perturbs every later draw from that stream in the same game
  (store pricing, land-auction rolls/pricing, colony-event tile picks), so
  land-auction chain lengths and outcomes shift once production first runs
  and the recorded ACTION LOG itself changes shape, not just the hash. Also
  corrected two stale doc comments in `constants.ts` (`STARTING_GOODS`,
  `STORE_OPENING_STOCK`) that predated M4's crystite auction fidelity and
  claimed crystite was "not yet mineable"/"not yet tradable"; crystite has
  been fully auction-tradable since M4, these comments were simply never
  updated.
- UI (art gate round-2 fix bundle): fixed the town scene's duplicate
  instruction-line-plus-End-Turn-button bug (`docs/active_plans/audits/art_gate_assessment_round2.md`
  image 05, MUST-FIX). Root cause: `game_screen.tsx`'s develop-turn side panel
  (`#game-panel`) always rendered its own hint-and-End-Turn footer whenever it
  was the human's develop turn, with no awareness that `town_scene.tsx`
  (`#game-map`) renders an identical notice-plus-End-Turn footer while the
  avatar is inside the walkable town -- both mounted simultaneously in town.
  `human_develop_layer.tsx` now reports its in-town state up to `game_screen.tsx`
  via an `onInTownChange` callback, which suppresses the side panel's footer
  while in town so exactly one footer renders. Also wired the terrain-tile art
  (`sprites_terrain.ts`, ready since M2 but never consumed by the live map) into
  `map_layer.tsx`: every plot cell now renders a `<use>` of its terrain symbol
  (peak-count mountains, ripple river, grass-tuft plains, town buildings,
  crater glints) layered beneath the existing ownership-border `rect` (kept at
  `fill-opacity: 0` so its `fill` attribute still satisfies
  `map_render.spec.mjs`'s DOM assertion while the terrain art shows through),
  closing the round-2 SHOULD-FIX that mountain tiers separated by fill darkness
  alone. Installed M.U.L.E.s now render `sprites_mule.ts`'s `MULE_INSTALLED_ID`
  pose plus a `muleOutfitSymbolId` badge (distinct silhouette per resource)
  instead of the legacy `sprite-mule` glyph and a generic resource icon,
  closing the round-2 finding that a placed M.U.L.E. showed no outfit signal
  after being towed. Added a `muleKeylineBodyMarkup()` helper to
  `sprites_mule.ts` (the same halo-then-fill technique
  `sprites_species.ts`'s `keylineOuterShapeMarkup()` already applies to
  species avatars, duplicated locally per this repo's no-cross-import-between-
  sprite-content-modules convention) applied to every pose's main body rect,
  closing the round-2 finding that a same-hue mule (for example the green
  player's mule on plains) had no second signal separating it from the
  terrain. Regenerated `output_smoke/gameplay/04_overworld_walk_v2.png`,
  `05_town_scene_v2.png`, and `09_production_yields_v2.png` as evidence.

- Tests: hardened `pub_gamble.spec.mjs`'s `walkToDoor` helper to the same
  bounded-tap walk pattern (hold, release, check `data-at-door`, repeat) that
  `town_scene.spec.mjs`'s `useDoor` was just rewritten to, since the old
  continuous-hold-while-polling shape races slow CDP round trips and can walk
  the avatar straight past a door.

- Tests (M10 rollout checklist): extended `tests/e2e/e2e_full_game.mjs` from
  a single beginner-mode, single-seed (`?seed=7`) smoke into a full
  `["beginner", "standard"] x [1, 3, 7]` matrix (six cells), closing the
  "headless playthrough harness green at both modes and three seeds" exit
  criteria row (docs/active_plans/active/mule_fidelity_plan.md). Builds
  `dist/` and starts the static server once, then reuses both across every
  cell; standard mode gets a doubled per-cell wall-clock budget
  (`ROUND_COUNT_BY_MODE.standard` is 12 rounds against beginner's 6). Seeds
  1, 3, and 7 were spot-checked directly against this harness's own
  passive-human strategy in both modes (each cell PASS in well under a
  minute at `?speed=8`) before being adopted as the default matrix. Added an
  optional `mode seed` positional CLI pair (for example
  `node tests/e2e/e2e_full_game.mjs standard 7`) for debugging a single cell;
  the no-arg default still runs the full six-cell matrix. Removed the stale
  "Standard mode is M10's job; beginner suffices here" comment now that
  standard mode is covered. Corrected docs/USAGE.md's one-line description of
  this harness (it previously said "both modes, fixed seeds" while the code
  ran beginner-only, single-seed).
- UI (style-audit cleanup): replaced the duplicated
  `plots.length`/`plots[0]!.length` board-dimension derivation in
  `human_develop_layer.tsx`, `overworld_scene.tsx`, `ai_actor_layer.tsx`, and
  `map_layer.tsx` with the shared `PLOT_ROWS`/`PLOT_COLS` constants, and added
  a `playerColor(id)` helper (`src/ui/sprites.ts`, throws on an out-of-range
  id, matching `turn.ts`'s `playerById` convention) to replace the two
  idioms for indexing `PLAYER_COLORS` (bare `!` and `?? "#e6e6e6"`) across
  `hud.tsx`, `map_layer.tsx`, `production_panel.tsx`, `scoring_panel.tsx`,
  and `auction_screen.tsx`.
- Tests (test-audit fixes): relocated `tests/test_balance_report.mjs` to
  `tests/e2e/e2e_balance_report.mjs` -- it runs `e2e_balance_sim.mjs --report`
  as a real subprocess and reads the real report file it writes under
  `output_smoke/`, which is non-browser whole-system E2E per
  docs/E2E_TESTS.md, not fast-lane unit testing. Converted its `node:test`
  case to a plain `main()` with try/catch and a PASS/FAIL console line,
  matching `e2e_full_game.mjs`'s self-contained, exits-non-zero-on-failure
  style, and fixed `REPO_ROOT` to resolve via `git rev-parse --show-toplevel`
  (the old two-`path.dirname` climb assumed the file's original one-level-
  deeper location under `tests/`). Updated docs/CODE_ARCHITECTURE.md and
  docs/FILE_STRUCTURE.md's file-layout references to the new path.
  Hardened `tests/test_personas.mjs`'s `SEED_BY_PERSONA_FOR_PLAYER_1` fixture:
  it previously hardcoded one seed per named personality as a scan result,
  which would silently go stale under a legitimate refactor of the
  assignment derivation; it is now derived at test-setup time by scanning
  seeds against `personalityForPlayer` (same technique the file already used
  for its seed-coverage test), keeping the existing re-verification
  assertion in the cannot-stall loop.
- Comments (repo-wide sweep): stripped workstream/milestone planning tags
  (`(M3, WS-E-mules)`, `M10 WS-balance`, `M11, WS-AI-personas`, and similar)
  out of permanent `src/` and `tests/` comments per docs/REPO_STYLE.md's
  terminology contract, preserving every docs/RULE_SOURCES.md cross-reference
  and the run-report annotations in `tests/e2e/e2e_balance_sim.mjs`. Reworded
  `develop_ai.ts`'s pub-gambling rationale to state the "always gamble over
  idling" design choice directly instead of citing "the workstream's
  dispatch"; updated `tests/playwright/map_render.spec.mjs`'s header comment
  to cite the current `src/ui/main.tsx` / `src/ui/solid/map_layer.tsx`
  sources instead of the deleted pre-Solid-port files; and replaced six
  remaining ad-hoc `PLAYER_COLORS[id]` index sites (`town_scene.tsx`,
  `overworld_scene.tsx`, `ai_actor_layer.tsx`, `title_screen.tsx`,
  `game_screen.tsx`, `land_auction_panel.tsx`) with the fail-loudly
  `playerColor(id)` helper from `src/ui/sprites.ts`.
- Plan close-out sweep: deleted the dead `.auction-track-token-label` CSS rule
  in `src/style.css` (zero DOM references, left behind by an earlier auction
  scene refactor). Untracked `OTHER_REPOS/repos.txt` from git
  (`git rm --cached`; the path is `.gitignore`d and the file stays on disk,
  matching the plan's reference-material-stays-local decision). Stripped six
  more remaining `WS-`/`M#` planning-tag fragments missed by the earlier
  repo-wide comment sweep above (`eslint.config.local.js`, `pipeline/
build.mjs`, `tools/generate_pwa_icons.mjs`, three sites in
  `tools/balance_report_generator.mjs`), keeping each surrounding sentence.
  Rewrote `docs/TODO.md`'s "Economy fidelity" section from an open backlog to
  a shipped-with-pointers summary (learning-curve production bonus, M.U.L.E.
  store stock cap and smithore rebuild, and the per-round develop-phase tick
  budget -- planet_mule's decompiled source showed that budget is food-scaled,
  not money-scaled as originally guessed), matching the treatment the
  "Gambling" section already had.
- Docs (mule_fidelity_plan.md): added a general note near the milestone
  status table that this plan's PascalCase scene names map repo-wide to
  snake_case files split across `src/ui/scenes/` (imperative rAF layer) and
  `src/ui/solid/` (reactive components), per `docs/CODE_ARCHITECTURE.md` --
  the M4 row's `AuctionScene`/`auction_screen.tsx` callout is one instance of
  this general pattern, not an M4-specific deviation. Ticked the "Headless
  playthrough harness green at both modes, three seeds" and "M1-M11
  integration gates green in order" rollout-checklist rows now that
  `tests/e2e/e2e_full_game.mjs` runs the full beginner+standard x seeds 1/3/7
  matrix at 6/6 PASS across repeated runs and every milestone review is PASS.
- Docs (`docs/PLAYWRIGHT_USAGE.md`): added a repo-specific "Visual render gate"
  section documenting `tests/playwright/visual_render.spec.mjs` and
  `tests/pixel_metrics.mjs` (coverage band, distinct-color band, palette-
  conformance deltaE, pairwise terrain-distinctness deltaE) and the
  recalibration procedure (two stable runs, record the measured values in the
  threshold comments), so the art gate's own re-tuning steps live alongside
  the rest of this repo's Playwright usage guidance.
- Docs: `docs/active_plans/audits/art_gate_assessment_round3.md` (a
  verification pass over the round-2 art-gate report) was not linked from
  anywhere in the repo; recorded here for the record -- its overall verdict is
  PASS, closing the round-2 MUST-FIX and all three SHOULD-FIX findings.
- Filled in the root MIT `LICENSE` copyright holder (Neil R. Voss, per
  [AUTHORS.md](AUTHORS.md)); the file was added this cycle with a template
  placeholder.
- Docs: archived `docs/active_plans/active/mule_art_style_spec.md` to
  `docs/archive/mule_art_style_spec.md` now that the art workstream is
  complete (round-3 gate PASS, `docs/active_plans/audits/
  art_gate_assessment_round3.md`), and repointed the two live links in
  `docs/active_plans/audits/art_gate_assessment.md` and
  `art_gate_assessment_round2.md` at the new path (historical changelog and
  audit mentions of the old path were left as-is; they record where the file
  lived at the time). Also fixed the archived file's own now-broken internal
  link to `docs/COLOR_CONTRAST_ACCESSIBILITY.md` (`../../` -> `../`, since the
  move dropped one directory level); `tests/test_markdown_links.py` caught
  this immediately after the move. Reconciled `docs/TODO.md`'s "Auction
  fidelity" section
  against `docs/RULE_SOURCES.md`: the `deadAuctionWindowRate` bullet is now
  marked shipped, citing the M4 tick-constant fix (dead-window 0.0% at 100
  seeds/mode) and the M10 land-bid-dampening rerun that reconfirms the gate
  at 300 seeds/mode (dead-window 0.0%, dead-land 0.1%); the seller-out-of-
  goods store fallback bullet stays open -- `src/engine/auction.ts`'s
  `bestAsk`/`canExecute` still pick a depleted seller's offer with no
  fallback re-selection of the next-best ask.
- Docs: verified and filled gaps in today's `docs/USAGE.md` update rather than
  rewriting it. Fixed the `e2e_balance_sim.mjs` invocation in the non-browser
  E2E matrix (it imports `src/engine/*.ts` and `src/ai/*.ts` directly, so it
  needs `node --import tsx`, confirmed by running it without the loader and
  reproducing `ERR_MODULE_NOT_FOUND`), added the missing fourth harness
  `tests/e2e/e2e_balance_report.mjs` (confirmed running clean under plain
  `node`), documented the two standalone URL params `?replay=fixture` and
  `?hints=off` that main.tsx/hint_store.ts already read but the doc's param
  summary omitted, and expanded the balance-dashboard section list to match
  `tools/balance_report_generator.mjs`'s actual output (it also renders
  colony-rating-tier distribution, wins-by-seat, and event-frequency stat
  tiles, not just the four sections previously named). `docs/INSTALL.md` was
  re-checked against `check_codebase.sh`, `devel/setup_typescript.sh`,
  `devel/setup_playwright.sh`, and `package.json` (no `engines` field, no
  `.nvmrc`) and needed no changes.
- Docs: refreshed `docs/screenshots/` for the finished-game feature set added
  since the last capture (tutorial hints, ambient animation, species/mode
  pickers, relaxed-timer toggle, PWA install, and end-of-game scoring). Built
  `dist/` via `build_github_pages.sh` and served it from a random loopback
  port (Playwright `chromium`, 1280x800 viewport, `reducedMotion: "reduce"`).
  Recaptured `docs/screenshots/title_screen.png`, `docs/screenshots/
  town_interior.png` (`?demo=town` fixture), and `docs/screenshots/
  auction_track.png` (seed 1234, matching `tests/playwright/auction_scene.
  spec.mjs`'s reachable smithore window); renamed `docs/screenshots/
  land_grant_map.png` to `docs/screenshots/overworld_map.png` and recaptured
  it against the `?demo=map` fixture (every terrain type plus one outfitted
  M.U.L.E. per player), since the land-grant selection screen's flat-color
  plots no longer represent the textured develop-phase overworld the old
  filename's alt text described; dropped `docs/screenshots/land_auction.png`
  (its flat-color, pre-terrain-art capture was also stale, and it fell
  outside the refreshed set's five target views). Added `docs/screenshots/
  scoring_screen.png`, the first screenshot of the M9 scoring screen: a
  seed/mode search (script discarded after use, not committed) over a
  passive-human playthrough (pass every auction, claim land each round,
  matching `tests/playwright/scoring_screen.spec.mjs`'s scripted strategy)
  found that a fully passive human reliably triggers the mid-game colony
  food-shortage abort (`checkColonyFailure`, `src/engine/scoring.ts`) even
  when claiming land every round, and that this repo's default AI matchup
  lands on the Federation rating's second-lowest tier across every seed
  tried in both modes -- beginner seed 1 (`?seed=1&mode=beginner`) was kept
  as a genuine, reproducible non-abort finish (`data-colony-failed="false"`)
  rather than searching further for a more flattering tier, showing the real
  ranked table, colony total, Federation rating message, and First Founder
  callout. Updated `README.md`'s managed screenshot block (five embeds,
  matching alt text to each view) and confirmed `pytest tests/
  test_markdown_links.py` passes against the renamed/dropped files.

### Removals and Deprecations

- UI (M7 WS-U-town): deleted the Solid menu store `src/ui/solid/store_screen.tsx`
  and its overlay wiring now that buying, outfitting, and placing happen in the
  walkable town scene. `game_screen.tsx` renders a slim `DevelopPanel` in its
  place (live money/tick readout, walk-in hint, and an off-map End turn button so
  End turn stays reachable alongside the town scene's own End turn), and the
  orphaned `.store-screen-*` and `.overworld-store-*` CSS was removed. The M5
  interim in-overworld store overlay (`[data-store-overlay]`) went with it; the
  overworld and game-flow specs were updated to drive the town flow, and the M2
  mini harness (`e2e_mini_flow.mjs`) now stops at reaching the human develop turn.
- UI (M2 WS-U-port): deleted the four legacy imperative UI modules whose Solid
  ports proved green -- `src/ui/hud.ts` (-> `solid/hud.tsx`), `src/ui/map_render.ts`
  (-> `solid/map_layer.tsx`), `src/ui/store_screen.ts` (-> `solid/store_screen.tsx`),
  and `src/ui/auction_screen.ts` (-> `solid/auction_screen.tsx`). Nothing imports
  them after `game_driver.ts` stopped rendering; the art `sprites/*.ts` modules
  only referenced them in comments. The setTimeout phase chains were removed with
  the driver rewrite (replaced by `src/ui/scenes/scene_manager.ts`).

### Decisions and Failures

- M10/M11 plan close-out (`docs/active_plans/active/mule_fidelity_plan.md`),
  adopted-vs-adjusted summary: PM-anchored constants (production yields,
  store prices, event tables, scoring formula, colony-rating tier
  boundaries, and every other historical-source-cited value in
  `src/engine/constants.ts`) were adopted verbatim from the original
  game's documented rules, not tuned -- see `docs/RULE_SOURCES.md` for the
  per-constant citation and adjudication record. A small set of values were
  sim-tuned rather than sourced: the M10 rank-aware land-bid dampening
  factors `LAND_BID_RANK_FACTORS = [0.7, 1.0, 1.2, 1.2]` (round-6-leader win
  51.1% -> 38.6-38.8%), the M11 AI-personality parameter sets in
  `src/ai/personas.ts` (`land_baron` `landBidFactor` 1.03, `ore_speculator`
  `resourceWeight` 1.3 smithore/crystite, `farmer` `resourceWeight`
  1.3 food / 1.15 energy, each layered on top of, never instead of, the
  rank-dampening factor), and the M10 colony pass band (success rate
  > = 0.85 on standard mode, a floor ~9-11 points below the 94-96% baseline
  > sweep to absorb seed-set noise). Final release-gate numbers this plan
  > closes on: standard-mode round-6-leader win rate 38.6-38.8%, colony
  > success rate 93.3-96.7% across the 30-300 seed sweeps run this session,
  > each of the three AI personalities' win rate inside the 15-35% band
  > (`land_baron` 30.8%, `ore_speculator` 27.9%, `farmer` 20.3%, 120-seed
  > release run), 65/65 Playwright specs green, and 339/339 node tests green.
  > See `docs/RULE_SOURCES.md` "M10 rank-aware land-bid dampening", "M10
  > balance sim record", and "AI personalities (M11, WS-AI-personas)" for the
  > full per-decision record; this plan is not yet archived, since the
  > fix-harness lane's both-modes-three-seeds headless harness is still
  > landing concurrently.
- M10 WS-balance, two-step colony pass band: from the baseline sweep (colony
  success 95.8% at 120 seeds / 94.0% at 200 seeds, both modes), the colony
  pass band is set as a floor of success rate >= 0.85 on standard mode. The
  floor sits ~9-11 points below baseline to absorb seed-set noise and tuning
  perturbation; no upper bound is gated so a zero-failure seed set cannot fail,
  and failure-reachability is already documented (M9 record). The tuned config
  holds 93.3% at 300 seeds, inside the band. Recorded in docs/RULE_SOURCES.md
  "M10 balance sim record".
- M10 WS-balance, tuning experiments (same 200/300-seed set each, standard
  mode). KEPT: rank-aware land-bid dampening -> round-6-leader win 51.1% ->
  38.6% (300 seeds), colony 93.3%, seat spread 23/23/30/24%, all liveness/
  safety gates green. REJECTED: `LAND_VALUE_MONEY_FRACTION` 0.4 -> 0.3 moved
  leader-win only to 50.0% alone and, combined with rank dampening, made both
  leader-win (45.4%) and colony (91.5%) WORSE than rank dampening alone
  (because a lower money fraction also dampens trailers' catch-up bids), so it
  was dropped and rank dampening kept as a single lever.
- M10 WS-balance, crystite four-goods finding (crystite reported, not
  hard-gated): crystite is the store-only-buyer export good and structurally
  trades in only ~48-53% of standard games at baseline, leaving its
  median-trade count on the 0/1 knife-edge. The one AI lever that lifts it
  reliably above the median (aggressive round-1 crystite scouting via
  `AI_ASSAY_RICH_SURPLUS` food * 30 -> food * 20) raised crystite to ~77% of
  games but starved opening food/energy production, dropping all-AI colony
  success to 90.7% and causing an early colony failure in the `e2e_full_game`
  playthrough (its scripted human seat produces nothing, so three AI seats
  could not carry the colony past round 2). A round-2-onward scout gate
  recovered neither (crystite 43.7%, colony 84.3%). Rather than ship a
  crystite-first AI that weakens colony robustness, crystite is REPORTED
  (median plus games-with-trade share) and the three consumable goods carry the
  four-goods liveness gate. Flagged to the manager for review. Recorded in
  docs/RULE_SOURCES.md "M10 balance sim record".
- UI (M9 WS-U-polish, discovered not fixed): the `?demo=wampus` fixture
  screen (`wampus_hunt_demo.tsx`) renders its overworld overlay inside
  `#map-container`, which carries no CSS `position: relative` rule (unlike
  the real game screen's `#game-map`), so `.overworld-svg`'s `position:
absolute; top: 0` escapes to the page's initial containing block instead
  of the map's own box -- the wampus (and the avatar) render visually
  detached from the board on that isolated fixture screen only. Confirmed
  via direct DOM/bounding-rect inspection that the real game screen (which
  uses `#game-map`, `position: relative`) has no such issue: `.map-svg` and
  `.overworld-svg` report byte-identical bounding rects there. Left
  unfixed: out of this workstream's item list (a-i), and the fixture exists
  only for isolated visual review, not real play; flagging for a future
  small fix (add `position: relative` to `#map-container` in `style.css`).
- UI (M9 WS-U-polish, auction arena, discovered not fixed): capturing the
  previously CANNOT-VERIFY auction arena for the first time
  (`output_smoke/art_gate/auction_arena_v3.png`) confirms the round-3
  finding stands: the arena is a large mostly-empty box with no visible
  numeric price-axis labels (only the price readout above the arena shows
  numbers). Not in this workstream's item list; flagging for the art lane.
- Engine (M6 WS-E-events): verifying every event against the planet_mule Java
  turned up four adjudications, all recorded in `docs/RULE_SOURCES.md`. (1)
  `muleCurve` was off by one: `round_scale.ts` used `floor((round-1)/4)` on the
  premise that PM rounds are 0-based, but PM plays rounds 1..12 (its lobby's
  `beginNextRound` increments `firstRound` 0->1 before round 1), so the correct
  formula is `25 * (floor(round/4) + 1)`, which also matches the plan's own
  key-formula. It was unused and untested, so it was corrected. (2)
  `GameModel.nextPlayerForEvent` (the leader/last 50-50 target picker the task
  cited) is dead code -- never called; personal events actually fire per player
  in develop-turn order, each with an independent 27.5% roll, so that is what
  was implemented. (3) `extra_plot`/`lost_plot` are opt-in in PM (removed unless
  all players vote for events); they were included here (all 22 events) to match
  the milestone's full roster, recorded as a deliberate deviation. (4) PM's
  `Player.setMoney` already clamps negatives to 0, so the "clamp event money at
  0" invariant matches PM exactly (no debt), and `pest`/`radiation` both target
  the rank-1 leader only (`Math.min(1, size)`), not the top two. Also decided:
  event randomness runs on two seed-derived sub-streams isolated from the core
  economy/auction RNG, so adding events left the pre-event replay sequence
  byte-identical (only the fired-event effects and new state fields changed the
  fixture hash).
- UI (M2 WS-U-port): the concurrent M4 engine auction work surfaced two
  cross-lane surprises, both handled without editing engine files. First, a
  constants rename (`AUCTION_TICKS`/`AUCTION_PRICE_STEP`/`_FLOOR`/`_CEILING`
  retired for `AUCTION_MAX_TICKS`/`AUCTION_PRICE_STEP_BY_GOOD`/
  `STORE_PRICE_CEILING`) landed in `constants.ts` before `auction.ts` was updated,
  breaking the shared build; WS-U-port escalated and resumed once the engine lane
  reconciled `auction.ts`. Second, the same M4 work started auto-assigning auction
  roles at entry, which silently broke the frozen `game_flow` auction test until
  the auction screen was changed to always offer the role-choice bar at tick 0
  (see the M2 WS-U-port auction role-choice note above). Recorded lesson: a shared
  constants rename must land atomically with its consumers, and an engine
  behavior change that alters a payload's initial shape can break a frozen UI
  selector contract even when no types change -- the regression net catches it,
  but only if run after the engine change lands.
- UI (M1 WS-U-solid): classified the pending `src/ui/auction_screen.ts` edit as
  INTENDED BEHAVIOR, not discardable drift. Contrary to the replacement brief's
  note that a stalled predecessor reverted it without a recorded verdict, the
  edit was committed by the user in 63412c8 ("OTHER REPOS and a minor auction
  change"), so the diff is recoverable from history. It replaces the shared
  `bindKeys` helper with a dedicated `keydown` listener that ignores OS key
  auto-repeat (`event.repeat`) and `preventDefault`s the arrow keys, so a held
  arrow dispatches `set_auction_intent` once instead of re-firing every
  ~30-50ms; this addresses the exact auto-repeat/clock-churn concern already
  documented in `game_driver.ts`'s `dispatch` comment (a repeat would cancel the
  pending 500ms auction tick before it can move prices). Validated by the
  `game_flow.spec.mjs` auction test, which holds ArrowUp and polls that the human
  price-track token moves: it passes both before and after the Solid port (the
  port does not touch `auction_screen.ts`, which the game driver still renders
  imperatively in M1).
- Engine (M2 WS-E-blooms): adjudicated four crystite/spoilage rule
  conflicts, recorded with Java line citations in docs/RULE_SOURCES.md --
  crystite bloom center candidate exclusions (river/town) and why this
  engine zeros town's field directly rather than gating yield at the type
  level like PM; assay reveal as a single shared boolean per plot instead of
  PM's per-player assay list (no networked multiplayer to preserve that
  distinction for); confirmed via the Java that any plot, owned or not, may
  be assayed (no ownership precondition on PM's `Assay` action); and the
  `ASSAY_TICK_COST` derivation (3 ticks, replacing an initial 5-tick
  work-ticket placeholder once the FULL-budget tick-scale arithmetic was
  actually run).
- Engine (M3 WS-E-prices): recorded three store-pricing adjudications in
  docs/RULE_SOURCES.md with Java line citations. (1) The supply/demand price
  ratio is demand/supply (`required/available`), the INVERSE of the plan's
  key-formulas summary ("supply/required"); verified from the
  `calcFoodPrice(available, required)` call sites, so scarcity raises price.
  (2) The store stock cap is 255 (`Shop` setters `Math.min(n, 255)`), settling
  the "32-vs-255" TSavo discrepancy in favor of 255. (3) The recalc-seam
  mapping: PM recomputes each good's price at its own Collection-phase start and
  averages at its auction end; this engine collapses those per-good recalcs into
  one round-boundary recalc for all goods while keeping the per-auction average
  feedback. Also recorded that `Shop.spoil`'s argument is read as the current
  food amount (not the round), since the method has no caller in the decompiled
  tree; that reading (halve when food > 1) is what matches the "store food
  halves after round 1" exit criterion. The M3 sim gate (30 seeded games per
  mode via the engine + AI) passed both modes: all games terminate, no negative
  money (min $285), trades happen (beginner 609 trades / 540 windows, dead-window
  rate 0.52, down from the v1 baseline 0.79; standard 637 trades / 1080 windows,
  0.75 -- the higher late-round rate is the clamped-band collapse WS-E-auction
  owns next).
- Engine (M7 WS-E-production): tracing `Factory.calcCapacity`'s power gate
  down to its caller (`Player.useEnergy`) turned up that this workstream's
  dispatch wording ("no power -> 0, partial power -> halved, minimum 1") is
  PM's full generic method body, but the "partial, halved" branch is
  UNREACHABLE in this project's classic-1983 scope: `energyNeeded` is always
  0 or 1 (no lab items reduce/raise it), so `power = min(remainingEnergy,
energyNeeded)` can only ever be exactly 0 or exactly `energyNeeded`, never
  strictly between them. Implemented the reachable branch only (full power
  or zero, in a random per-player shuffle order) rather than adding
  never-triggered dead code for a hypothetical multi-energy-need mule this
  project does not implement; recorded with the full trace in
  `docs/RULE_SOURCES.md`. Separately, verified PM has no
  production-triggers-reveal mechanism for crystite (the dispatch flagged
  this explicitly as "verify PM behavior; adjudicate if absent") -- PM's
  `yieldVisible` flag is assay-only, gating a display digit, never the real
  yield -- and adjudicated not to add one; production reads
  `plot.crystiteLevel` directly, bypassing the `crystiteRevealed` gate that
  exists for UI/AI-facing code, matching PM's real "blind mining" behavior.

### Developer Tests and Notes

- Docs close-out placeholder audit (M10/M11 rollout-checklist row): grepped
  every M10/M11 source, test, and doc file listed in the plan's scope
  (`src/ai/personas.ts`, `src/ui/save_log.ts`, `src/ui/game_store.ts`,
  `src/ui/scenes/replay_scene.tsx`, `src/ui/scenes/replay_fixture.ts`,
  `src/ui/hint_store.ts`, `src/ui/solid/tutorial_hint.tsx`,
  `src/ui/pwa_register.ts`, `src/manifest.json`, `src/sw.js`,
  `tools/generate_pwa_icons.mjs`, `tools/balance_report_generator.mjs`,
  `build_github_pages.sh`, the new `tests/test_*.mjs` and
  `tests/playwright/*.spec.mjs` files, and the doc set itself) for
  `TODO|FIXME|XXX|placeholder|TBD` (case-insensitive). Clean: the only real
  hit is the documented, benign one in `tools/generate_pwa_icons.mjs`
  ("generic placeholder", describing the generated icon art itself, not
  unfinished code); the remaining matches are false positives from the
  `walkToDoor` helper name in `tests/playwright/pub_gamble.spec.mjs` and the
  literal `docs/TODO.md` filename referenced from `README.md` and
  `docs/FILE_STRUCTURE.md`.
- M10 WS-balance verification (final, rank-dampening applied): `./check_codebase.sh`
  5/5 PASS with 319 node tests green (replay-determinism fixture unchanged --
  the frozen action log is unaffected by AI-heuristic tuning -- and the AI
  cannot-stall tests pass). `e2e_balance_sim.mjs 300` GATE PASS both modes:
  standard round-6-leader win 38.6%, colony 93.3%, consumable-good medians food
  8 / energy 8 / smithore 24, dead-window 0.0%, dead-land 0.1%, 100% mid-game
  clear, all terminate, no negative money; crystite reported at 48% of games.
  `e2e_balance_sim.mjs 30` GATE PASS (always-on gates only at < 100 seeds).
  `e2e_full_game.mjs` PASS.
- UI (M9 WS-U-polish): fresh `_v3` captures in `output_smoke/art_gate/`
  for the two screens round 3 could not verify (`scoring_screen_v3.png`,
  `auction_arena_v3.png`) plus every screen this workstream visually
  changed (`title_screen_live_v3.png`, `overworld_walk_v3.png`,
  `town_scene_v3.png`, `production_yields_v3.png`). The scoring capture
  happened to land on a genuine colony-failure game (human passed every
  land grant in the seeded playthrough, leaving only 3 AI producers), which
  usefully exercises the failure-message branch (no First Founder callout)
  rather than only the success path.
- UI (M9 WS-U-polish, accessibility audit): scene-by-scene review found
  every phase already keyboard-playable (land grant: Enter/Escape/P via
  `land_grant_panel.tsx`, now also engine-driven per the sweep-cursor entry
  above; land auction: Enter-to-bid via `land_auction_panel.tsx`; develop:
  held arrow keys plus an action key in `overworld_scene.tsx`/
  `town_scene.tsx`; goods auction: role buttons plus held arrow keys in
  `auction_screen.tsx`, which already carries `aria-live="polite"` on its
  price readout; scoring: a native `<button>` for Play Again) and
  reduced-motion already honored everywhere animation exists (title
  starfield, event banner, mule-escape vignette, auction avatar tweening),
  each gated behind the same `@media (prefers-reduced-motion:
no-preference)` pattern. The two gaps found and closed: no `aria-live` on
  the HUD's money/resource changes, and no focus management across phase
  transitions -- both closed above (Additions and New Features). `node
--import tsx --test tests/test_*.mjs`: 319 pass (314 baseline + 5 new
  land-grant-sweep cases). Full Playwright suite (51 specs, including the 2
  new `dpad.spec.mjs` and the 1 new `scoring_screen.spec.mjs`): all green.
- Art gate (round 2): reviewed the 10 live composed gameplay screenshots in
  `output_smoke/gameplay/` against the readability criteria and round-1 report,
  grading ownership and price for real (not "by spec"). Wrote
  `docs/active_plans/audits/art_gate_assessment_round2.md`. Verdict
  PASS-WITH-FIXES: round-1 MUST-FIX (title art wired) RESOLVED, no round-1 item
  regressed. New MUST-FIX: town scene renders a duplicate instruction line and
  duplicate "End turn" button. New SHOULD-FIX: the live map draws flat terrain
  fills with no mountain-tier peak-count overlay (tiers separate by darkness
  alone, the spec's flagged risk), and installed mules carry no outfit icon.

- Engine (M6 WS-E-events): added `tests/test_events.mjs` -- the 1-based
  `muleCurve` values; personal-event fairness properties over 40 seeded standard
  games (no round-1 events, leader never good, bottom two never bad, last two
  rounds good-only, each event at most once per game); the money clamp-at-0
  boundary; colony-deck properties over many seeds (null round-0 slot, forced
  ship finale, early-only rounds 1-2, per-type caps, one ship return); the A/B
  category split; every colony effect (acid rain, sunspot, meteorite crater,
  radiation, fire, pirates, planetquake, pest) plus two `enterProduction`
  integrations; and the `computeProduction` temporary-bonus `[0, 8]` clamp.
  Re-pinned `tests/test_replay_determinism.mjs`'s fixture hash (action log
  unchanged; only the event effects and new state fields moved it) and gave
  `tests/test_turn.mjs`'s `buildRoundState` an empty event deck so the turn-order
  and food-timer unit tests stay event-isolated. `tests/e2e/e2e_balance_sim.mjs`
  now also reports the round-6-leader-wins-game rate (events-fairness signal):
  over 60 seeds, standard mode is 58.3% (above the plan's ~50% target, an M10
  tuning goal), beginner 83.3% (round 6 is its final round); all prior gates
  stay green with events -- both modes terminate, no negative money, goods
  dead-window rate ~4% standard / ~2% beginner.
- Engine (M4 WS-E-auction): added `tests/test_auction_fidelity.mjs` (role
  auto-assignment at exact critical boundaries, per-good band derivation, the
  crystite store-sink + post-auction zeroing, the quiet-tick slow/pause
  countdown semantics, the transfer-rate cooldown progression, the crystite
  price step of 4, and the negative-economy invariant that a buyer never spends
  below zero) and the balance-sim gate harness `tests/e2e/e2e_balance_sim.mjs`
  (drives full all-AI games across seeded games in both modes, reports the
  dead-auction-window rate, and exits non-zero if the gate fails). Rewrote
  `tests/test_auction.mjs` and the auction cases in `tests/test_ai.mjs` for the
  new contract, updated `tests/test_turn.mjs`'s auction-order assertion, and
  regenerated the `tests/test_replay_determinism.mjs` fixture (551 actions, new
  pinned hash) since the auction action stream and randomness consumption
  changed -- keeping the hand-injected `assay_plot` for player 0 at (0,0).
- Engine (M2 WS-E-blooms): added `tests/test_crystite.mjs` (bloom
  determinism per seed; exactly `CRYSTITE_BLOOM_COUNT` plots reach the max
  level; river/town always zero; overlap-keeps-max ring math verified
  directly against the newly exported `applyCrystiteBloomRing`; `assay_plot`
  reveals via `visibleCrystite`, costs `ASSAY_TICK_COST` ticks, throws
  out-of-turn and on the town plot, and ends the turn when it exhausts the
  tick budget) and updated `tests/test_economy.mjs` for the new
  `applyUpkeep`/`applySpoilage` split and PM's exact floor/cap spoilage
  values at odd and even quantities. Regenerated the pinned
  `tests/test_replay_determinism.mjs` fixture: bloom seeding consumes
  additional `Rng` draws during `generateMap`, so every downstream random
  draw in the recorded trace shifts even though the action list's shape did
  not need to change for that reason alone; one `assay_plot` call was also
  added to the recorded trace since the `Action` schema gained a new
  variant, then `EXPECTED_STATE_HASH` was recomputed from the actual replay
  output (both purity assertions -- reaches scoring, two replays deep-equal
  -- continued to pass throughout; only the pinned hash needed updating).
- Engine (M3 WS-E-prices): added `tests/test_store_prices.mjs` covering
  per-good quote derivation (spreads, margins, floor/ceiling clamps, crystite
  multiple-of-4 and unclamped range), the supply/demand recalc at fixed ratios
  with a deterministic Rng stub (balanced factor 1.0, glut floor, energy
  scarcity, smithore ratio clamp and pre-jitter floor, crystite independent
  draw), average-trade-price feedback, store-food halving, the 255 stock cap,
  `computeColonyStats` supply/demand tallies, determinism per seed, and an
  end-to-end round-boundary integration check. Updated `tests/test_auction.mjs`
  to read the store's live quotes (`storeBuyQuote`/`storeSellQuote`) instead of
  the retired `STORE_BASE_PRICE +- AUCTION_STORE_SPREAD`, and made the
  band-clamp test price-agnostic (it no longer assumes the old low midpoint).
  `tests/test_store.mjs` and `tests/test_full_game.mjs` pass unchanged. The two
  pre-existing colorblind failures in `tests/test_player_color_distinct.mjs`
  are unrelated and left as-is.
- Art (M8 art gate): produced
  [docs/active_plans/audits/art_gate_assessment.md](active_plans/audits/art_gate_assessment.md),
  a visual-acceptance review of the sprite, terrain, town, and title galleries
  in `output_smoke/art_gate/` against the style spec and the five readability
  criteria; verdict PASS-WITH-FIXES, with the shipped title screen not yet using
  the title art flagged as the blocking finish item.
- Tests (M7 WS-E-production): rewrote `tests/test_economy.mjs`'s per-terrain
  yield tests as variance-bound checks (exact-yield assertions are no longer
  stable once variance is unconditional) and added dedicated cases for the
  learning-curve count-bonus thresholds (floor(n/3) steps at 2/3/5/6
  factories, via a seeded-average comparison since the 1-2 unit step is
  smaller than the +-6 variance noise on a single sample), the flat (not
  per-neighbor) adjacency bonus, variance bounds/clamp/determinism, the
  random energy-shortfall order (both outcomes appear across a seed range,
  where a fixed row-major order would only ever show one), crystite yield
  tracking deposit level, and crystite production ignoring
  `crystiteRevealed`. Extended `tests/test_ai.mjs` with the new crystite
  outfit/placement preference tests and an assay cannot-stall test (repeated
  assaying terminates within the candidate count, since each assay reveals
  its own target). Full node suite green (230/230); `tsc -p tsconfig.json`
  and `tsc -p tsconfig.lint.json` clean; `npx eslint --max-warnings 0` and
  `npx prettier --check` clean on touched files.
  `tests/e2e/e2e_balance_sim.mjs` (30 seeds/mode): GATE PASS both modes, all
  games terminate, zero negative money, dead-window rate 0.9% beginner /
  4.2% standard (both well under the 0.2 gate; consistent with the M6
  events-added noise level, not a regression), dead-land-auction rate
  0.0%/1.5%, mid-game land clears 100%; crystite units sold per game 1.40
  beginner / 1.57 standard (report-only), confirming the crystite auction
  window now naturally carries real supply instead of always skipping.
- Engine (M10 balance lane, evidence probe): re-ran the round-6-leader-wins
  metric at 200 seeds standard / 100 seeds beginner (up from the prior
  30-seed samples that read 58.3%/63.3%/40.0% across different runs) via a
  scratch instrumented fork of `e2e_balance_sim.mjs`'s sim loop. Stable
  reading: standard 56.5% (113/200, Wilson 95% CI 49.6%-63.2%), beginner
  77.0% (77/100, CI 67.8%-84.2%, reference only -- beginner's final round is
  round 6 so this is not the M10-gated number). Driver analysis found the
  winner's final score is 92-94% land value (money and goods together are
  under 8%), and land-auction wins skew to the round-6 leader at 54-59% of
  sales versus a 25% fair share (`src/ai/land_ai.ts`'s bid cap scales with
  the bidder's current money, with no rank-fairness counterbalance), while
  the personal-event system (`src/engine/events.ts`) already redistributes
  money correctly by rank (leader 100% bad events, bottom two 100% good) but
  money is too small a share of final score to move the win rate much on
  its own. See
  [docs/active_plans/audits/leader_win_rate_probe.md](active_plans/audits/leader_win_rate_probe.md)
  for the full tables and three ranked land-AI tuning-lever recommendations
  (all sim-tuned `land_ai.ts` heuristics per `RULE_SOURCES.md`, none touch
  PM-sourced constants).
- Docs (M10 WS-release, evidence probe): produced
  [docs/active_plans/audits/docs_drift_audit.md](active_plans/audits/docs_drift_audit.md),
  a read-only drift audit of CODE_ARCHITECTURE.md, FILE_STRUCTURE.md,
  USAGE.md, README.md, TODO.md, and the fidelity plan against the current
  tree, feeding the M10 docs sweep with a prioritized fix list.
- Live-measured the human develop-turn errand (get a mule, get equipped, walk
  to a plot) at `?speed=1` with a scratch Playwright harness across three
  plot distances plus a `?timer=relaxed` run; see
  [docs/active_plans/audits/mule_trip_timing.md](active_plans/audits/mule_trip_timing.md).
  Errand totals: 1.69s adjacent-to-town, 4.72s mid-distance, 6.56s far-corner
  (worst case). Against the engine's real tick budgets
  (`DEVELOP_TICKS_FULL`=50 ticks=47.5s, `DEVELOP_TICKS_MIN`=5 ticks=4.75s),
  the full-fed budget has 40+ seconds of margin everywhere, but the
  food-starved minimum turn (4.75s) is only barely met at mid-distance
  (+0.03s) and is missed outright at the far corner (-1.81s). Also found
  that `tests/playwright/town_scene.spec.mjs`'s `reachHumanDevelop` claim
  click is a no-op in practice (the land-grant sweep cursor is not yet on
  the clicked cell), masked by its final assertion only checking that some
  mule glyph exists anywhere on the board; this report's harness instead
  polls the sweep cursor before clicking. No production code changed.
- Docset refresh (orchestrated `docset-updater` run): the arch, usage,
  related-projects, news/release, README, and screenshot doc owners each
  refreshed their sections in this pass, followed by a `docs/CHANGELOG.md`
  conformance audit against `docs/REPO_STYLE.md`'s changelog rotation rules.
  Audit result: both the 2026-07-09 and 2026-07-08 day blocks already carried
  their subsection headings in the canonical order (Additions and New
  Features, Behavior or Interface Changes, Fixes and Maintenance, Removals
  and Deprecations, Decisions and Failures, Developer Tests and Notes),
  omitting only the categories with no entries that day, with every bullet
  filed under a heading and no orphan text; no ordering or heading fixes were
  needed. Rotation check: `wc -l docs/CHANGELOG.md` read 2809 lines and
  `python3 devel/rotate_changelog.py --dry-run` correctly refused with "Only
  two day blocks; cannot rotate." (rotation keeps the two newest day blocks,
  so two blocks is the no-op floor).

## 2026-07-08

### Additions and New Features

- Engine (M1 WS-E-foundation, Patch 1): widened `Resource` in
  `src/engine/player.ts` to `"food" | "energy" | "smithore" | "crystite"`
  and added crystite to `RESOURCES`, then swept every `Record<Resource, ...>`
  call site to compile against the wider union: `STARTING_GOODS.crystite=0`,
  `OUTFIT_COST.crystite=100` (planet_mule GameData equipmentCost, confirmed
  by Kroah's 1983 doc), `STORE_OPENING_STOCK.crystite=0`,
  `STORE_BASE_PRICE.crystite=50` (planet_mule GameData initial price), a new
  `CRYSTITE_YIELD_BY_TERRAIN` (zero on every terrain) wired into
  `YIELD_TABLE_BY_RESOURCE`, and a new `CRYSTITE_DECAY_RATE=0` consumed by
  `applySpoilage` (`src/engine/economy.ts`) so crystite passes through
  spoilage/upkeep untouched. Added a `sprite-icon-crystite` symbol
  (`src/ui/sprites.ts`) reusing the smithore ore-chunk shape with a distinct
  fill, per the plan's "temporarily reuse the smithore shape" note. Zero
  gameplay behavior change by design: crystite yields 0 and stock 0
  everywhere, so `computeProduction`/`applySpoilage`/`computeScores` add a
  crystite entry that always nets 0. Two sites were deliberately kept off the
  widened `RESOURCES` iteration to avoid a real (non-mechanical) behavior
  change: `AUCTION_GOOD_ORDER` in `src/engine/turn.ts` stays a separate
  `["food", "energy", "smithore"]` constant (documented in-line) so no
  crystite auction window appears yet, and a new `OUTFITTABLE_RESOURCES`
  constant in `src/ui/store_screen.ts` keeps the store's outfit panel to the
  same three buttons so players cannot buy a crystite outfit before mining
  exists. Verified `player.goods.crystite` fallback additions in
  `develop_ai.ts`'s `scarcestResource`/`chooseOutfitResource` cannot select
  crystite in this patch (its cost is the highest of the four, so a cheaper
  resource is always found first in iteration order) and left that AI file
  unchanged. Verified: `npx tsc --noEmit -p tsconfig.json` (clean for
  `src/`/`tests/`/`tools/`; only pre-existing, out-of-scope errors remain
  under the gitignored `OTHER_REPOS/TSavo-mule-game/` reference package,
  which `tsconfig.json`'s unfiltered `"include": ["**/*.ts"]` still picks up
  from disk), `npx tsc --noEmit -p tsconfig.lint.json` (clean),
  `npx eslint --max-warnings 0` and `npx prettier --check` on `src/**` and
  `tests/**` (clean), `node --import tsx --test tests/test_*.mjs` (74
  passed, 0 failed).
- Docs (M1 WS-E-sources): added `docs/RULE_SOURCES.md` (every known rule
  conflict with chosen value, source file, secondary source, and reason,
  covering colony rating PM-vs-1983, the colony-event deck model, the pub
  payout array TSavo transcription error, standard round count, species
  handicaps, 1983 beginner stock tables, smithore floor details, and the
  replay-validity-per-build policy, plus the extraction workflow) and
  `docs/REFERENCE_REPOS.md` (a reading guide for `OTHER_REPOS/`: the
  planet_mule Java class map with grep-first verification steps, the Kroah
  1983 doc's BTU/PTU/ATU/CTU glossary plus disassembly grep anchors
  `goodsPrice`/`calcMuleReq`/`roundEventsProb`/`wampusTime`, TSavo audit
  caveats, and `mule_rules.md` as the prose companion). Every constant and
  formula cited was verified directly against the decompiled Java (for
  example `GameData.java`, `ResourcePrices.java`, `Shop.java`,
  `PlayerEventGenerator.java`, `ColonyEventGenerator.java`, `PlotSeller.java`,
  `Wampus.java`, `Development.java`, `PlanetMapGenerator.java`,
  `Player.calcPoints`, `SummaryPhase2.getColonyMessage`) and cross-checked
  against `mule_document.html` / `MULE-Disassembled_Memory.asm` and TSavo's
  `reference/*.md` audits, confirming the pub-array error is a real
  transcription bug in TSavo's own reference docs (its `pubRoundBonus`/
  `pubMaxRandomAmount` are exactly half the verified PM values). Added
  `tests/test_constants_sources.mjs` (node --test), a text-parsing audit
  asserting every `export const` in `src/engine/constants.ts` carries a
  "Source" comment within 10 lines above its declaration, with a documented
  shrink-me allowlist for six constants that currently rely on a shared group
  comment further away (`STORE_OPENING_STOCK`, `YIELD_TABLE_BY_RESOURCE`,
  `AUCTION_PRICE_STEP`, `AUCTION_PRICE_FLOOR`, `AUCTION_PRICE_CEILING`,
  `AUCTION_STORE_SPREAD`); the allowlist self-checks that each entry still
  needs to be there. Verified: `node --test tests/test_constants_sources.mjs`
  (3 passed) and `source source_me.sh && python3 -m pytest
tests/test_markdown_links.py tests/test_ascii_compliance.py -q` (140
  passed, 1 pre-existing unrelated failure on `OTHER_REPOS/mule_document.html`
  from concurrent reference-material tracking, outside this workstream's
  scope).
- Art (M1 WS-A-spec): added `docs/active_plans/active/mule_art_style_spec.md`
  (shape language, stroke policy, depth/shading policy, a 2-3 frame
  animation policy gated by `prefers-reduced-motion`, the
  `sprite-<domain>-<name>[-frameN]` symbol-id convention, viewBox
  conventions per sprite class, the full palette contrast table, the
  colorblind-distinguishability reasoning for the four player colors --
  luminance + blue-channel share, not simulator-verified, flagged as a
  follow-up for WS-A-actors -- and the five behavior-focused readability
  criteria for later fixtures: terrain distinguishability, avatar
  visibility, ownership clarity, outfit clarity, price readability) and
  `src/ui/sprites/palette.ts` (20 named `PALETTE` tokens covering
  backgrounds, text, the gold accent, the 4 player colors, 6 terrain
  fills, and 4 resource-icon fills, reusing the exact hex values already
  in `src/ui/sprites.ts` -- including the `crystite` fill that landed
  moments earlier from the concurrent WS-E-foundation patch -- so no
  visual change ships and no legacy allowlist entry is needed). Added
  `tests/test_sprite_palette.mjs` (node --test, no `tsx` loader needed:
  it parses quoted hex literals out of `src/ui/sprites/*.ts` and
  `src/ui/sprites.ts` as text rather than importing the modules), which
  asserts every sprite-file hex literal is either a `PALETTE` value or an
  explicit `LEGACY_HEX_ALLOWLIST` entry (empty today) and that
  `palette.ts` defines at least 20 named tokens. Verified `.gitignore`
  already ignores `OTHER_REPOS/` and `mule.nes` (via the existing `*.nes`
  glob) with `git check-ignore -v`, so no `.gitignore` edit was needed.
  Verified: `node --test tests/test_sprite_palette.mjs` (2 passed),
  `npx tsc --noEmit -p tsconfig.json` (clean for `src/`; only
  pre-existing, out-of-scope errors remain under the gitignored
  `OTHER_REPOS/TSavo-mule-game/` reference package), and
  `source source_me.sh && python3 -m pytest tests/ -q` (567 passed, 1
  pre-existing unrelated failure on `OTHER_REPOS/mule_document.html`).
- Docs: added `docs/screenshots/title_screen.png`, `land_grant_map.png`,
  `store_screen.png`, and `auction_track.png` via the `screenshot-docs` skill,
  captured headless with Playwright at 1280x800 against a `./build_github_pages.sh`
  build served on port 4174 (the `?demo=map` fixture supplied the land-grant
  shot; the other three drove real game flow through land grant, the store,
  and the auction role/track UI). Filled the managed screenshot block in
  `README.md` with the four embeds. Found and fixed a selector bug in the
  capture script: the `?demo=map` fixture renders into `#map-container`, not
  `#game-map` (that ID only exists once a real game session starts via
  `startNewGame`), which had caused a false capture timeout on first attempt.
  Verified: `source source_me.sh && python3 -m pytest
tests/test_markdown_links.py -q` (31 passed, including the previously
  flagged README link to `docs/FILE_STRUCTURE.md` now resolved by concurrent
  doc work).
- Release docs (news-release-docs skill run): added `docs/RELEASE_HISTORY.md`
  and `docs/NEWS.md`, each seeded with one `## v26.07 - 2026-07-08` block
  summarizing the core-loop v1 completion (full game wiring, engine/AI/UI
  modules, the click-twice and auction-AI-direction fixes, and the
  constants-fidelity pass), sourced from this changelog's 2026-07-08 entries.
  Version `26.07` was read from the repo-root `VERSION` file (no
  `pyproject.toml` to cross-check in this TypeScript repo). Emitted a
  notes-file body to `/tmp` for `devel/make_release.py --notes-file`.
  Verified: `source source_me.sh && python3 -m pytest
tests/test_markdown_links.py -q` (27 passed, 1 pre-existing failure on
  `README.md`'s link to `docs/FILE_STRUCTURE.md`, unrelated to concurrent doc
  work; the new docs add no local links).
- Docs: added `docs/RELATED_PROJECTS.md`, sourced via bounded web discovery,
  covering the 1983 M.U.L.E. original, Planet M.U.L.E., M.U.L.E. Returns,
  and the open-source `LionsPhil/mewl` remake as confirmed entries, plus two
  lower-confidence possible entries (`eric108/MULE`, osgameclones.com).
  Verified: `pytest tests/test_markdown_links.py tests/test_ascii_compliance.py -q`
  passes for the new file (a pre-existing, unrelated README.md link failure
  from concurrent doc work was left untouched).
- Docs: added `docs/INSTALL.md` and `docs/USAGE.md` via the
  `setup-install-usage-docs` skill. `docs/INSTALL.md` covers `npm run setup`
  (`devel/setup_typescript.sh`), the optional Playwright browser install, and
  `./check_codebase.sh` as the install-verify step. `docs/USAGE.md` covers
  `./run_web_server.sh`, `./build_github_pages.sh`, `bash
run_playwright_tests.sh`, and the `?demo=map` renderer fixture.
- README: docset refresh via the `readme-docs` skill. Reserved the managed
  screenshot block (`<!-- screenshots:begin -->` / `<!-- screenshots:end -->`
  sentinels with a pointer line) under the Features section for
  `screenshot-docs` to fill in next. Added Documentation links to
  `docs/FILE_STRUCTURE.md`, `docs/INSTALL.md`, and `docs/USAGE.md` by
  convention ahead of their producers landing (some, like FILE_STRUCTURE.md,
  landed in this same run); `tests/test_markdown_links.py` was skipped for
  this change pending the remaining producers. Preserved the existing first
  paragraph, Features, Quick start, Testing, and License sections unchanged.
  Verified `tests/test_readme_first_paragraph.py` and
  `tests/test_ascii_compliance.py` pass.
- Docs: added `docs/FILE_STRUCTURE.md`, a directory map covering top-level
  layout, `src/`, `tests/`, `devel/`, `tools/` subtrees, generated artifacts
  (`dist/`, `node_modules/`, test/lint caches), the documentation map, and
  where to add new work; cross-linked with the current
  `docs/CODE_ARCHITECTURE.md`.
- Patch 12: full game wiring (WP-4A1). Added `src/ui/game_driver.ts`, which
  owns the single mutable `GameState` and sequences the whole phase cycle
  (title -> land_grant -> develop -> production -> auction -> scoring) by
  dispatching through the pure `applyAction` reducer and re-rendering the HUD,
  map, and active phase panel after every transition. Engine ticks and AI turns
  advance on `setTimeout` chains (one pending timer at a time): AI land-grant
  and develop turns auto-decide via the `decide*Action` functions; the human's
  develop turn drains its tick budget while the store screen handles input; the
  auction runs an AI-adjust-then-tick loop and auto-dispatches `end_auction`
  when a good finishes so an AI-only floor never stalls, pausing at the opening
  tick for the human to declare a role per good. Wired the title screen's "New
  Game" button (`src/ui/main.ts`), added the `#screen-game` container
  (`#game-hud`, `#game-map`, `#game-panel`) to `src/index.html`, and added a
  land-grant panel (map plot-click delegation plus a Pass button), a production
  yields interstitial, and a ranked scoring screen with a Play Again button.
  Added supporting styles to `src/style.css`. Verified: `./check_codebase.sh`
  passes all five steps, `./build_github_pages.sh` succeeds, and a headless
  Chromium smoke ran a full six-round game from New Game through scoring and
  Play Again with no page errors, exercising land grant (click and pass),
  the develop store flow, production, and auction ticking.
- README: added `README.md` with title, first paragraph (pure prose, no
  links or badges), current v1 feature scope, quick start, doc links, and
  license notes (WP-4B1 README portion).
- Docs: added `docs/CODE_ARCHITECTURE.md` covering the engine/AI/UI purity
  boundary and its ESLint gate, a module map for `src/engine/`, `src/ai/`,
  and `src/ui/`, the `GameState`/`Action` reducer data flow, the per-round
  phase state machine, the auction tick model, `constants.ts` as the single
  rule authority, and the test layout; linked it from `README.md`'s
  documentation section (WP-4B1 CODE_ARCHITECTURE.md portion). `src/ui/main.ts`
  is under active rewrite by another agent, so its "Game driver" section is
  intentionally kept to a stable-seam summary pending a follow-up update.
- Patch 1: scaffold. Added the browser host scaffold: `src/index.html`,
  `src/style.css`, `src/main.ts` (entry), `src/ui/main.ts`, and
  `src/ui/screen_router.ts`. The title screen renders an "M.U.L.E." heading
  with a disabled "New Game" placeholder button. Seeded
  `tools/format_version_label.ts` to resolve the TS18003 gotcha (`tsc -p
tsconfig.lint.json` needs at least one `.ts` input under `tests/` or
  `tools/`). `./run_web_server.sh` serves the title-screen page and
  `./check_codebase.sh` passes all steps.
- Patch 2: engine state types and seeded RNG (WP-1B1).
  - `src/engine/rng.ts`: mulberry32 seeded PRNG (`createRng`) with a
    serializable 32-bit accumulator (`getState`) and a same-seed-same-sequence
    guarantee; exposes `next()` and `nextInt(maxExclusive)`.
  - `src/engine/player.ts`: `Resource` (`food` | `energy` | `smithore`),
    `RESOURCES`, `ColorSlot`, and the readonly `Player` type.
  - `src/engine/game_state.ts`: `Terrain`, `Plot`, per-phase payload
    placeholders, the `Phase` and `Action` discriminated unions, `GameState`
    (5x9 plot grid, four-player tuple, seed/rng state, round 1-6), and the
    pure `applyAction(state, action) -> state` reducer stub whose branches
    throw until each phase package implements them.
  - `tests/test_engine_rng.mjs`: node unit tests covering RNG determinism,
    range bounds, and state resume.
- Patch 3: seeded map generation (WP-1B2).
  - `src/engine/map.ts`: `generateMap(rng) -> Plot[][]` builds a deterministic
    5x9 board -- the center column is the river except the center plot, which
    is `town`; every other plot is `plain` or a weighted `mountain1`/2/3 tier
    chosen from the shared `Rng`; all plots start `owner: null` and
    `muleOutfit: null`. Also exports `terrainOf(plots, row, col) -> Terrain`.
  - Self-checked via a temporary `_temp_map_check.mjs` (run with `node
--import tsx`, then deleted): confirmed river column placement, single
    town plot at the grid center, blank ownership/outfit on every plot, and
    same-seed determinism. The permanent test file lands in WP-2C1.
- Patch 4: constants, economy, store, scoring (WP-1C1).
  - `src/engine/constants.ts`: single rule-authority module for round count
    (6), starting money/goods, M.U.L.E. base price and per-resource outfit
    costs, store opening stock/base prices, land value per plot, per-terrain
    food/energy/smithore yield tables, adjacency bonus, food/energy upkeep
    (growing per round), food spoilage / energy decay / smithore decay rates,
    and energy cost per M.U.L.E. Every constant carries a source comment;
    values are anchored to the Atari 8-bit beginner game (start money 1000,
    M.U.L.E. base 100, outfits 25/50/75, land value 500/plot, 6 rounds, river
    food 4 / plain 2 / mountain 1, plain energy 3 / river 2 / mountain 1,
    smithore mountain1 2 / mountain2 3 / mountain3 4 / plain 1 / river 0,
    food spoilage ~50%, energy decay ~25%, smithore no decay); conflicting
    source values (for example per-species starting money) are noted inline.
  - `src/engine/economy.ts`: pure `computeProduction(plots, players, round)`
    (terrain base yield + same-outfit adjacency bonus, with an
    energy-shortfall penalty that leaves M.U.L.E.s unpowered once a player's
    banked energy runs out) and `applySpoilage(goods, round)` (upkeep
    deduction then spoilage/decay on the surplus).
  - `src/engine/store.ts`: `StoreState` type plus
    `createInitialStoreState`, `computeMulePurchaseCost`,
    `computeOutfitCost`, `computeSellProceeds`, `computeBuyCost`,
    `applySellToStore`, `applyBuyFromStore`.
  - `src/engine/scoring.ts`: `computeScores(state) -> number[]` (money +
    goods at store base prices + land value per owned plot) and
    `computeWinnerIndex(state) -> number`.
  - `./check_codebase.sh` passes all 5 steps (typecheck, typecheck:lint,
    lint, format:check, test:node).
- Patch 5: turn sequencer and land grant (WP-2A1).
  - `src/engine/turn.ts`: the phase state machine and reducer. Cycle per
    round: land_grant (snake-order picks) -> develop x4 players (buy, outfit,
    place a M.U.L.E. on a fixed tick budget) -> production (apply yields +
    spoilage, snapshot) -> auction x3 goods in fixed order food, energy,
    smithore -> next round's land_grant, or scoring after round 6. Exports
    `createInitialGameState(seed)`, `enterLandGrant`/`enterDevelop`/
    `enterProduction`/`enterAuction`/`enterScoring` advance helpers,
    `applyTurnAction(state, action)`, and the softlock-avoidance queries
    `canBuyMule` and `hasPlaceablePlot`. Timer expiry mid-turn ends the
    develop turn and loses any unplaced M.U.L.E.; a broke player who owns no
    placeable plot can still end their turn; cancel_placement keeps the
    carried M.U.L.E. in tow.
  - `src/engine/land_grant.ts`: snake-order pick helpers (`landGrantPickOrder`
    reverses on even rounds), `createLandGrantPayload`, `currentPicker`,
    `advancePick`, `isLandGrantComplete`, and `claimPlotOnBoard` (pure,
    fails loudly on town/owned/out-of-range claims).
  - `src/engine/game_state.ts`: replaced the placeholder phase payloads with
    real shapes (`LandGrantPayload`, `DevelopPayload` with a `CarriedMule`
    state, `ProductionPayload` yields snapshot, minimal `AuctionPayload`
    carrying the current good for WP-2A2 to replace, `ScoringPayload`); grew
    the `Action` union (`tick`, `pass`, `buy_mule`, `outfit_mule`,
    `place_mule`, `cancel_placement`, `end_turn`, `end_auction`); added a
    `store` field to `GameState`; and delegated `applyAction` to
    `applyTurnAction`.
  - `src/engine/constants.ts`: added `DEVELOP_TICKS_PER_TURN` (fixed v1 tick
    budget per the plan's Resolved decisions) and relocated `PLOT_ROWS`/
    `PLOT_COLS` here as the numeric-rule source of truth; `game_state.ts`
    re-exports them and `map.ts` now imports them from `constants.ts`, which
    breaks a value-import cycle introduced by delegating `applyAction`.
  - `tests/test_turn.mjs`: full phase cycle, snake order, pass, buy/outfit/
    place, timer expiry losing an unplaced M.U.L.E., broke player ending a
    turn, cancel_placement, out-of-turn throw, and a full six-round game to
    scoring. `./check_codebase.sh` passes all 5 steps.
- Patch 6: auction engine (WP-2A2).
  - `src/engine/auction.ts`: tick-based double-auction matching engine. Each
    player declares a role (buyer, seller, out) via `set_auction_role` and a
    per-tick price intent (up, down, hold) via `set_auction_intent`; every
    tick each participant's price steps by `AUCTION_PRICE_STEP` inside the
    clamped `[AUCTION_PRICE_FLOOR, AUCTION_PRICE_CEILING]` band, then at most
    one unit trades between the highest buyer and lowest seller while the
    market is crossed (streaming one unit per tick, as the original game
    does). Trades execute at the seller's ask; player-to-player trades
    conserve total money, and total goods (players plus store stock) are
    conserved across every trade. The store participates on both sides with a
    fixed band derived from its per-good price widened by
    `AUCTION_STORE_SPREAD`: it sells remaining stock at `storeSellPrice` and
    buys unlimited units at the lower `storeBuyPrice`. The auction ends by
    timeout after `AUCTION_TICKS`, marking the payload `finished` so the
    driver dispatches `end_auction`. Exports `createAuctionPayload`,
    `auctionTick`, `applySetAuctionRole`, `applySetAuctionIntent`, and the
    `AUCTION_STORE_ID` sentinel.
  - `src/engine/game_state.ts`: replaced the `AuctionPayload` placeholder
    alias with the full auction sub-state and per-tick UI snapshot
    (`AuctionRole`, `AuctionIntent`, `AuctionParticipant`, `AuctionTrade`,
    price band, store band/stock, participants, trade log, `finished`), and
    grew the `Action` union with `set_auction_role` and `set_auction_intent`.
  - `src/engine/turn.ts`: `enterAuction` now seeds the full auction payload
    via `createAuctionPayload`, `applyTick` delegates auction-phase ticks to
    `auctionTick`, and the reducer dispatches the two new auction intents.
    Phase-progression logic (good/round advancement on `end_auction`) is
    unchanged.
  - `src/engine/constants.ts`: added isolated auction v1 tunables
    (`AUCTION_TICKS`, `AUCTION_PRICE_STEP`, `AUCTION_PRICE_FLOOR`,
    `AUCTION_PRICE_CEILING`, `AUCTION_STORE_SPREAD`) with source comments.
  - `tests/test_auction.mjs`: price movement per tick, band clamping,
    crossing-price player-to-player trade with money/goods conservation,
    store-sell and store-buy participation, zero-buyer and zero-seller
    auctions ending cleanly, timeout ending with no trade, and a fixed
    scripted AI-vs-AI trace asserted tick-by-tick. `./check_codebase.sh`
    passes all 5 steps.
- Patch 10: store and placement screens (WP-3B1).
  - `src/ui/store_screen.ts`: `renderStoreScreen(container, state, dispatch)`
    renders money, ticks-remaining, a buy-M.U.L.E. button (price shown,
    disabled via `canBuyMule`), per-resource outfit buttons (cost shown,
    disabled when unaffordable), a placement grid of the active player's
    owned un-outfitted plots (disabled via `hasPlaceablePlot` hint text when
    none are placeable), cancel-placement, and an always-visible end-turn
    control. Mode is derived from `DevelopPayload.carriedMule`
    (`none`/`unoutfitted`/`Resource`). Self-contained: builds its own DOM
    grid rather than depending on the in-flight `map_render.ts`/`hud.ts`
    files from WP-3A1.
  - `src/ui/input.ts`: `bindKeys(map) -> unbind` keyboard binding helper;
    `store_screen.ts` uses it for Escape (cancel placement) and Enter (end
    turn) parity with the on-screen buttons.
  - `src/style.css`: added `.store-screen*` rules, namespaced under
    `.store-screen`, with 44px-minimum button touch targets and bottom
    padding for mobile.
- Patch 9: SVG sprites, map render, and HUD (WP-3A1).
  - `src/ui/sprites.ts`: exports `PLAYER_COLORS` (4-color palette: coral red,
    cyan, gold, violet, each checked against the `#1a1a2e` app background for
    the doc's 5.5:1 house contrast target), `TERRAIN_FILLS` (per-`Terrain`
    fill colors covering plain/river/mountain1-3/town), `RESOURCE_ICON_FILLS`,
    `buildSpriteDefsMarkup()` (one shared `<defs>` block with original,
    silhouette-flat symbols: `sprite-mule` walker, `sprite-player` figure,
    and `sprite-icon-food`/`energy`/`smithore` glyphs), and
    `resourceIconSymbolId(resource)`.
  - `src/ui/map_render.ts`: `renderMap(container, state, opts?)` renders the
    board as one inline `<svg viewBox>` grid; each plot's `<g>` carries
    `data-row`/`data-col`/`data-terrain`/`data-owner`, its `<rect>` is filled
    per terrain and stroked in the owning player's color when owned, and an
    installed M.U.L.E. renders a `data-outfit`-tagged glyph group (walker
    tinted with owner color plus a resource icon).
  - `src/ui/hud.ts`: `renderHud(container, state)` renders one
    `data-player`-tagged panel per player with a color swatch, money, and
    per-resource counts.
  - `src/ui/main.ts`: registers a hidden `screen-map` screen and, behind a
    `?demo=map` URL param, builds a hand-written fixture `GameState`
    (`buildFixtureState`/`buildFixturePlots`, independent of the procedural
    map generator) covering every terrain type and one owned/outfitted
    M.U.L.E. per player, then calls `renderMap`/`renderHud` and shows the
    screen -- so the renderers can be viewed and driven by Playwright without
    real game flow.
  - `src/index.html`: added the `screen-map` container with `map-container`
    and `hud-container` child divs.
  - `src/style.css`: added `.map-svg`/`.hud*` rules, with 56px-minimum HUD
    panel height and bottom padding on `#screen-map` for mobile.
  - `playwright.config.ts`: added at the repo root (none existed yet) --
    fixed port 4173, `webServer` serving `dist/` via `python3 -m
http.server`, so `run_playwright_tests.sh` and `npx playwright test` can
    run.
  - `tests/playwright/map_render.spec.mjs`: loads `/?demo=map` and asserts
    at least 3 distinct terrain fills, exactly 4 distinct owner border
    colors, 4 M.U.L.E. glyphs, and all 4 HUD player panels. `bash
run_playwright_tests.sh tests/playwright/map_render.spec.mjs` passes (1
    passed). `./check_codebase.sh` passes typecheck/typecheck:lint/lint for
    every file this patch touches; `format:check` fails only on
    `src/engine/auction.ts`, an in-flight WP-3B2 file this patch did not
    touch.
- Patch 11: auction screen (WP-3B2).
  - `src/ui/auction_screen.ts`: `renderAuctionScreen(container, state,
dispatch)`, a pure render following `store_screen.ts`'s pattern. Two
    modes driven by `AuctionPayload`: a role-choice bar (Buy / Sell / Sit
    Out, dispatching `set_auction_role`) shown while the human participant
    is `out` at `tick === 0`; otherwise a live inline-SVG vertical price
    track `[priceFloor..priceCeiling]` with one token per participant in
    `PLAYER_COLORS`, dashed store buy/sell band lines, a trade flash plus
    recent-trades list from the tail of `payload.trades`, and the current
    good/ticks-remaining header. Human price intent binds ArrowUp/ArrowDown
    (keydown sets `set_auction_intent` up/down, keyup releases to hold) plus
    press-and-hold >=44px touch buttons (pointerdown/up/leave/cancel). When
    `payload.finished`, shows a "round of trading complete" panel with a
    Continue button dispatching `end_auction` (the tick driver dispatches it
    too; this button is a fallback affordance, not a duplicate driver).
  - `src/style.css`: appended `.auction-screen*` and `.auction-track-*`
    rules at the end of the file, namespaced separately from
    `.store-screen*`.
  - Wiring note for WP-4A1: `renderAuctionScreen` re-renders idempotently
    on every dispatch, same as `renderStoreScreen`. To drive ticks, the
    integrator adds a `setInterval` (started when the phase becomes
    `auction`, cleared when it leaves) that dispatches `{type:'tick'}` then
    calls `renderAuctionScreen` again with the fresh state; no interval
    lives inside this module since it is a pure render function.
  - `npx tsc --noEmit` reports zero errors for `src/ui/auction_screen.ts`.
    `./check_codebase.sh` fails at the typecheck step only on pre-existing
    `TS5097` `.ts`-extension-import errors in `src/ai/develop_ai.ts` and
    `src/ai/land_ai.ts`, both untouched by this patch.

### Behavior or Interface Changes

- Constants fidelity pass against the authoritative
  https://www.planetmule.com/how-to-play/ reference: `STARTING_GOODS` now
  gives every player 4 food and 2 energy at game start (was 0/0), and
  `STORE_OPENING_STOCK` now opens the store with 8 food / 8 energy / 8
  smithore (was 30/25/50); smithore stays 0 for starting player goods. Source
  comments in `src/engine/constants.ts` now cite planetmule.com/how-to-play
  as the primary source for these two constants, keeping prior StrategyWiki
  and C64-Wiki citations as recorded history. `OUTFIT_COST` and
  `ENERGY_PER_MULE` were already correct against planetmule.com and only got
  a confirming source-comment update. The store opens with 14 M.U.L.E. units
  per planetmule.com, but `store.ts` sells M.U.L.E.s on demand with no stock
  cap, so this is recorded as a documented v1 gap in the `STORE_OPENING_STOCK`
  comment rather than a new `MULE_OPENING_STOCK` constant. Updated
  `tests/test_ai.mjs`'s develop-AI scarcest-resource test, whose "all zero,
  ties to food" premise no longer holds now that players start with nonzero
  food/energy; the AI now correctly targets smithore as the scarcest good.

- AGENTS.md: trimmed via the `agents-md-fixer` skill from a 9-line file
  restating Python style and env setup into a ~24-line pointer file with
  bare paths into the now-complete `docs/` set (repo/typescript/python style,
  pytest/Playwright/E2E test docs, game design tone docs, color
  accessibility, architecture, file structure, install, and usage). Kept the
  Homebrew Python site-packages path note and the `source source_me.sh &&
python3` bootstrap line, since those are repo-specific and not documented
  elsewhere. Verified: `source source_me.sh && python3 -m pytest
tests/test_markdown_links.py tests/test_ascii_compliance.py -q` (133
  passed).

### Fixes and Maintenance

- Fixed `playwright.config.ts` hardcoding port 4173 for both `use.baseURL`
  and `webServer`, violating the repo rule that local HTTP servers use
  random ports. The original fixed port was a deliberate workaround: a
  random port computed inside the config would be re-evaluated
  independently by each Playwright worker process, desyncing `baseURL` from
  the server the `webServer` block actually started. Fixed the design by
  moving the randomization outside the config: `run_playwright_tests.sh` now
  picks `PW_PORT="${PW_PORT:-$((4100 + RANDOM % 900))}"` once and exports it
  (echoing the chosen port), and `playwright.config.ts` reads
  `process.env.PW_PORT` with a `"4173"` fallback so `npx playwright test`
  still works directly without the wrapper. Kept `webServer.reuseExistingServer:
false` since a foreign server squatting on a randomly chosen port should
  never be silently reused. Reading `process.env` in a strict `.ts` file
  needed `/// <reference types="node" />` in `playwright.config.ts` (no
  `tsconfig.json` edit) to resolve a `Cannot find name 'process'` typecheck
  error, since the file's `tsconfig.json` has no `"types"` field to opt in
  `@types/node`. Verified: `bash run_playwright_tests.sh --build
tests/playwright/` run twice, both green with different ports
  (`PW_PORT=4459` then `PW_PORT=4401`, 6 passed each); `npx tsc --noEmit -p
tsconfig.json` clean.
- Fixed the "click twice to do anything" bug in the game UI (WP-4A1
  follow-up). Root cause: the driver dispatches a `tick` every 250 ms during
  the human develop turn and every 500 ms during the auction, and both
  `renderStoreScreen` and `renderAuctionScreen` cleared `container.innerHTML`
  and recreated every button on each tick. A click whose pointerdown landed on
  a button destroyed before pointerup fired its click on the container instead,
  so the button handler never ran. Fixed the design rather than the symptom:
  both screens now reconcile in place on tick-only re-renders, updating just
  the ticks-left counter (store) and the ticks counter, price-track SVG, and
  trade log (auction) while leaving the buttons and their listeners untouched;
  a change to the interactive structure (carried M.U.L.E. state or money for
  the store, auction mode for the auction) still triggers a full rebuild.
  Exported screen signatures are unchanged. Changed `src/ui/store_screen.ts`
  and `src/ui/auction_screen.ts` only. Verified: `./check_codebase.sh`
  typecheck/lint/format all pass on the changed files, and
  `bash run_playwright_tests.sh --build tests/playwright/` reports 4 passed,
  including the auction spec that drives many tick-reconcile cycles and
  confirms the price track still updates in place.
- README curation (readme-docs skill run): added a "Testing" section listing
  the two verified test commands (`./check_codebase.sh` and
  `bash run_playwright_tests.sh`); the first paragraph, Features, Quick
  start, Documentation, and License sections were already in place and are
  unchanged. `docs/INSTALL.md`, `docs/USAGE.md`, `docs/FILE_STRUCTURE.md`,
  and `docs/TROUBLESHOOTING.md` do not exist yet and are not linked;
  flagging as gaps for `setup-install-usage-docs` / `arch-docs` to fill.
  Verified: `pytest tests/test_readme_first_paragraph.py
tests/test_markdown_links.py tests/test_ascii_compliance.py` (126 passed).
- Fixed auction AI walk direction (WP-2B1 post-review defect). A 30-game
  headless balance sim found zero auction trades in every game; one cause
  was `src/ai/auction_ai.ts` walking buyer prices down toward the floor and
  seller prices up toward the ceiling, the inverse of the auction engine's
  crossing rule (`src/engine/auction.ts`: a trade executes when the highest
  bid meets or exceeds the lowest ask, at the ask price). `desiredIntent`
  now walks a buyer's price up toward a limit (the store's sell price,
  bounded by what it can afford while keeping its money reserve) and a
  seller's price down toward the store's buy price, so bids and asks
  converge instead of diverge. Updated `tests/test_ai.mjs` assertions that
  encoded the old direction. Re-ran the 30-seed balance sim with this fix
  plus the `STARTING_GOODS`/store-stock changes landed in parallel:
  trades-per-good-per-round rose from 0/0/0 to food 1.33, energy 1.33,
  smithore 1.84; `deadAuctionWindowRate` fell from 1.00 to 0.79; score
  spread rose from an exact 0/0/0 tie every game to mean 111.1 (min 10,
  max 160). Verified: `node --import tsx --test tests/test_ai.mjs` (18/18)
  and `node --import tsx --test tests/test_*.mjs` (68/68) pass with no
  regressions.
- Added an ESLint enforcement gate for engine/AI purity in
  `eslint.config.local.js`: files under `src/engine/**` and `src/ai/**` now
  fail lint (`no-restricted-globals`) on direct DOM globals (`document`,
  `window`, `navigator`, `localStorage`, `sessionStorage`, `HTMLElement`,
  `alert`, `confirm`, `prompt`) and fail lint (`no-restricted-imports`) on
  imports from `src/ui/**`. Matches the architecture boundary in
  `docs/archive/mule_core_loop_plan.md` ("engine and AI modules
  are pure TypeScript operating on GameState values; only src/ui/ touches
  the DOM"), moving that boundary from manual-review-only to CI-enforced.
  Verified by adding a scratch `src/engine/_temp_purity_probe.ts` with a
  `document.title` reference, confirming `npx eslint` failed with
  `Unexpected use of 'document' ... no-restricted-globals`, then deleting
  the probe file. `src/ai` importing from `src/engine` remains unaffected
  (only `../ui/` import paths are blocked).
- Audit cleanup (six-pass audit, low-risk fixes). Rewrote
  `docs/CODE_ARCHITECTURE.md`'s "Game driver" section and `src/ui/` module
  map from the current code: `src/ui/game_driver.ts` owns `GameState`,
  dispatch, and phase scheduling behind a single `phaseTimer` with strict
  clear-then-schedule discipline; `src/ui/main.ts` is now documented as a
  thin bootstrap (screen registration, New Game wiring, the `?demo=map`
  fixture). Added `tests/playwright/game_flow.spec.mjs` and
  `tests/test_full_game.mjs` to the test-layout section. Removed stale
  WP-2A2/WP-2B1 planning references from `src/engine/game_state.ts` and
  `src/engine/turn.ts` comments, describing current behavior instead
  (`auction.ts` owns tick-based matching; `end_auction` is dispatched by the
  UI driver; `Phase` payloads are the real per-phase shapes defined in
  `game_state.ts`, not placeholders). Fixed a stale path in
  `eslint.config.local.js` and `docs/CHANGELOG.md` (2026-07-06 entry) from
  `docs/active_plans/active/mule_core_loop_plan.md` to its current archived
  location, `docs/archive/mule_core_loop_plan.md`. Added `*.nes` to
  `.gitignore` so the reference ROM (`mule.nes`) stays untracked. Factored
  the duplicated land-grant Pass-button poll loop in
  `tests/playwright/game_flow.spec.mjs` into one `passThroughLandGrant`
  helper with an explicit iteration bound that throws instead of looping
  silently, and stopped swallowing `.click()` failures. Replaced bare
  literals in `tests/test_economy.mjs` and `tests/test_store.mjs` with the
  `FOOD_YIELD_BY_TERRAIN`/`ENERGY_YIELD_BY_TERRAIN`/
  `SMITHORE_YIELD_BY_TERRAIN`/`MULE_BASE_PRICE` constants they were
  duplicating. Normalized `import type ... from "./x.ts"` to extensionless
  `"./x"` across `src/engine/*.ts` and `src/ai/*.ts` for consistency with
  value imports (`.mjs` test files were left as-is; they require the `.ts`
  suffix for `tsx` resolution). Verified: `./check_codebase.sh` (5/5 PASS,
  including `node --import tsx --test tests/test_*.mjs` 68/68 green) and
  `source source_me.sh && python3 -m pytest tests/test_markdown_links.py -q`
  (25 passed).

### Decisions and Failures

- Delegating `game_state.applyAction` to `turn.ts` created a runtime
  circular-import TDZ crash: `game_state` value-imported `turn`, which
  transitively imports `map`, which read `PLOT_COLS` from `game_state` at
  module-eval time before that constant initialized. Fixed the design rather
  than the symptom by moving `PLOT_ROWS`/`PLOT_COLS` into `constants.ts` (the
  stated single source of truth for numeric rules) so `map.ts` no longer
  value-imports `game_state`; `game_state` re-exports the two constants for
  backward compatibility.
- Documentation close-out, chosen economy rule authority: `src/engine/constants.ts`
  is the single source of truth for every economy number, and each constant
  carries a source comment recording where its value came from. Where sources
  disagreed, https://www.planetmule.com/how-to-play/ is treated as the primary
  citation and prior StrategyWiki/C64-Wiki figures are kept in the comment as
  recorded history rather than deleted, so a future fidelity pass can see the
  full trail. Current anchor values: `STARTING_GOODS` (food 4, energy 2,
  smithore 0 per player) and `STORE_OPENING_STOCK` (food 8, energy 8, smithore 8) both cite planetmule.com/how-to-play; `OUTFIT_COST` and `ENERGY_PER_MULE`
  were already correct against planetmule.com.
- Documentation close-out, auction tunables: per the plan's risk register, the
  auction's real-time trading floor is modeled as discrete ticks rather than
  copied from a historical figure, so its five tunables live isolated together
  in `src/engine/constants.ts` and are called out separately from production/
  store/scoring numbers: `AUCTION_TICKS = 20` (ticks before a good's window
  times out), `AUCTION_PRICE_STEP = 1` (price move per tick per up/down
  intent), `AUCTION_PRICE_FLOOR = 5` and `AUCTION_PRICE_CEILING = 100` (clamp
  band for any participant or the store band), and `AUCTION_STORE_SPREAD = 5`
  (half-width of the store's fixed buy/sell band around each good's base
  price).
- Documentation close-out, dead-auction bug and fix story: a 30-game headless
  AI-vs-AI balance sim (`tests/test_full_game.mjs`-style driver, run manually
  outside pytest) found zero auction trades in every one of the 30 games
  before this fix. The cause was `src/ai/auction_ai.ts`'s `desiredIntent`
  walking buyer prices down toward the floor and seller prices up toward the
  ceiling -- the inverse of `src/engine/auction.ts`'s crossing rule (a trade
  executes when the highest bid meets or exceeds the lowest ask, at the ask
  price). No unit test caught this because each unit test exercised one side
  of the auction in isolation; the design lesson recorded here is that an
  inverted-but-locally-plausible AI decision only surfaces under a full
  AI-vs-AI simulation, so headless multi-game sims stay part of the review
  loop for auction and other emergent-behavior changes, not just `tests/`
  unit coverage. After the fix (plus the `STARTING_GOODS`/store-stock
  constants-fidelity change landed in the same pass), trades-per-good-per-round
  rose from 0/0/0 to food 1.33, energy 1.33, smithore 1.84; score spread rose
  from an exact 0/0/0 tie every game to a mean of 111.1 (min 10, max 160); and
  first-picker win rate across the 30-game sim was 0.17.
- Documentation close-out, known tuning gap (deferred): even after the
  walk-direction fix, the 30-game sim's `deadAuctionWindowRate` only fell from
  1.00 to 0.79 -- about 79% of individual per-good auction windows still close
  with no trade. The `AUCTION_TICKS = 20` tick budget and the
  `AUCTION_PRICE_STEP = 1` step size may not give bid/ask enough ticks to
  cross before the window times out, especially against the
  `AUCTION_PRICE_FLOOR`/`AUCTION_PRICE_CEILING` band width. This is recorded
  as a v1 tuning gap rather than fixed here; see `docs/TODO.md` for the
  follow-up.

### Developer Tests and Notes

- Patch 13: Playwright walkthrough specs (WP-4B1 Playwright portion). Added
  `tests/playwright/game_flow.spec.mjs` (3 tests): load the title screen,
  start a game, and assert the land-grant map plus a 4-player HUD render;
  claim a plot, buy and outfit a M.U.L.E., place it, and assert a
  `data-outfit` glyph appears on the map; and choose the Buy role in the
  auction, hold `ArrowUp` across several `AUCTION_TICK_MS` ticks, and assert
  the human token's `cy` on `.auction-track-svg` changes plus the store
  buy/sell band lines and trade log render. Auction store-band lines are
  zero-area SVG `<line>` strokes, so those two assertions use `toHaveCount`
  rather than `toBeVisible` (a bounding-box check that always reports a
  `<line>` as hidden). `bash run_playwright_tests.sh --build tests/playwright/`:
  4 passed (`map_render.spec.mjs` plus the 3 new tests), no flakes across 3
  repeat runs of the new spec file; `./check_codebase.sh` passes all 5 steps
  (68/68 node tests). No `src/` changes were needed; the product surface
  matched the plan's selector contract exactly.
- Patch 8 part 1: map/economy tests (WP-2C1 part 1). Added
  `tests/test_map.mjs` (grid dimensions, river/town column placement,
  non-river columns never river or town, same-seed determinism, plots start
  unowned with no installed M.U.L.E.), `tests/test_economy.mjs`
  (`computeProduction` documented yields for river food, plain energy,
  mountain3 smithore; same-outfit adjacency raises yield; an unpowered
  M.U.L.E. produces nothing; `applySpoilage` halves surplus food, decays
  surplus energy ~25%, never decays smithore, and never drives a resource
  negative), and `tests/test_store.mjs` (store pricing round trips and
  `computeScores`/`computeWinnerIndex` behavioral properties). All 21 new
  assertions pass; `./check_codebase.sh` passes all 5 steps with 26 total
  node tests. Part 2 (turn/auction/ai/full-game tests) is blocked on M2
  modules and is out of scope for this patch.
- Patch 8 part 2: headless full-game sim (WP-2C1 part 2). Added
  `tests/test_full_game.mjs`: a watchdog-bounded (20000-step) driver plays a
  fixed-seed 4-AI game end to end, applying `decideLandGrantAction` in land
  grant, interleaving `decideDevelopAction` with ticks in develop, and
  applying `decideAuctionActions` per player per tick (then ticking, then
  `end_auction` once `finished`) in auction. Four tests: the sim reaches
  `scoring` phase after round 6 with no thrown errors; scores are four
  finite non-negative numbers with a valid `winnerIndex`; total goods plus
  store stock are conserved across one observed auction phase; and two runs
  with the same seed produce identical final scores and winner
  (determinism). `node --import tsx --test tests/test_full_game.mjs`: 4/4
  pass. `node --import tsx --test tests/test_*.mjs`: 68/68 pass, no
  regressions. No engine or AI softlocks or invariant bugs were found.
- Patch 10: store and placement screens (WP-3B1). Verified with `npx tsc
--noEmit`: no errors attributed to `src/ui/store_screen.ts` or
  `src/ui/input.ts`; the run's failures are all pre-existing, in other
  in-flight agents' files (`src/engine/turn.ts` auction payload/action
  mismatches from WP-3B2, `src/ui/hud.ts`/`src/ui/map_render.ts` `.ts`
  import-extension errors from WP-3A1). `./check_codebase.sh` fails at
  `typecheck` for the same pre-existing reasons; no failure line names a
  file this patch touched. No permanent test added (out of scope; Playwright
  coverage is WP-4B1's); verified via `npx tsc --noEmit` plus manual read of
  the rendered DOM structure logic.
- Patch 7: AI strategies (WP-2B1). Added `src/ai/land_ai.ts`
  (`decideLandGrantAction(state, playerId)`: claims the unowned, non-town
  plot with the best single-resource base yield, passing when it is not the
  player's pick, no plot is claimable, or the game is not in `land_grant`),
  `src/ai/develop_ai.ts` (`decideDevelopAction(state, playerId)`: buys and
  outfits a M.U.L.E. toward the colony's scarcest resource -- summed lowest
  total inventory across all four players -- then places it on the player's
  first owned empty plot; ends turn whenever buying, outfitting, or placing
  is not possible), and `src/ai/auction_ai.ts`
  (`decideAuctionActions(state, playerId): Action | null`: sets buyer/seller
  role from need/surplus against a fixed target stock per good, then walks
  the price intent toward the floor (buyer) or ceiling (seller), returning
  null once the participant already matches its desired role and intent).
  All three AI modules keep a `STORE_BASE_PRICE.food * 10` money reserve so
  they never bid or buy down to a position where emergency food is
  unaffordable. `tests/test_ai.mjs` (18 assertions) covers normal decisions
  (highest-yield plot pick, scarcest-resource outfit choice including a
  smithore-scarce colony, plot placement, buyer role and downward price
  walk, seller role, hold-once-at-target behavior) and every degenerate
  state from the work package (no money, no owned plots, out-of-turn/out-of-
  phase calls, auction already finished, reserve blocking a buy) resolving
  to a terminal `end_turn`/`pass`/`out`-role action or `null` rather than
  throwing or stalling. `npx tsc --noEmit` and
  `node --import tsx --test tests/test_ai.mjs` both pass; `./check_codebase.sh`
  fails only at `format:check`, on `eslint.config.local.js` and
  `src/ui/auction_screen.ts`, both pre-existing and outside this patch's
  scope.
