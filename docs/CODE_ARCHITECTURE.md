# Code architecture

Architecture of the M.U.L.E. core-loop remake: a browser game with a pure
TypeScript game engine, a pure AI layer, and a DOM-driven UI layer.

## Layer boundaries

The codebase splits into three layers, enforced by an ESLint purity gate in
[eslint.config.local.js](../eslint.config.local.js):

- `src/engine/` and `src/ai/` must stay pure. `no-restricted-globals` blocks
  `document`, `window`, `navigator`, `localStorage`, `sessionStorage`,
  `HTMLElement`, `alert`, `confirm`, and `prompt` in these directories.
  `no-restricted-imports` blocks any import from `src/ui/`. `src/ai/` may
  import from `src/engine/`; only the `../ui/` path is blocked.
- `src/ui/` is the only layer allowed to touch the DOM. It renders `GameState`
  to SVG/HTML and turns user input into `Action` values dispatched back
  through the reducer.

Everything in `src/engine/` operates on plain, readonly, serializable data
(`GameState`, `Action`) with no mutation and no hidden state; every exported
function is deterministic given its inputs (randomness flows through the
seeded `Rng` in [rng.ts](../src/engine/rng.ts), never `Math.random()`).

## Module map

### src/engine/ (pure)

| File                                             | Purpose                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [constants.ts](../src/engine/constants.ts)       | Single source of truth for every numeric game rule (round count, board size, prices, yields, upkeep, auction tunables). See "Constants as rule authority" below.                                                                                                                                                          |
| [game_state.ts](../src/engine/game_state.ts)     | Defines `GameState`, `Phase`, `Action`, and related payload types; `applyAction` is the single reducer entry point, delegating to `applyTurnAction`.                                                                                                                                                                      |
| [rng.ts](../src/engine/rng.ts)                   | Seeded, serializable pseudo-random number generator (`Rng`, `createRng`) so a saved seed replays deterministically.                                                                                                                                                                                                       |
| [map.ts](../src/engine/map.ts)                   | Generates the board's terrain grid (`generateMap`) and reads terrain at a plot (`terrainOf`).                                                                                                                                                                                                                             |
| [player.ts](../src/engine/player.ts)             | `Resource`, `RESOURCES`, `ColorSlot`, and the `Player` shape (money, goods, plots owned).                                                                                                                                                                                                                                 |
| [store.ts](../src/engine/store.ts)               | `StoreState` and pure store pricing/cost helpers: M.U.L.E. purchase cost, outfit cost, buy/sell proceeds, and stock mutation helpers.                                                                                                                                                                                     |
| [land_grant.ts](../src/engine/land_grant.ts)     | Snake-order pick sequence for the land-grant phase: pick order, current picker, advancing picks, and claiming a plot on the board.                                                                                                                                                                                        |
| [economy.ts](../src/engine/economy.ts)           | Pure production and spoilage math: terrain yield lookup, adjacency clustering bonus, per-round production (`computeProduction`), and upkeep plus spoilage/decay (`applySpoilage`).                                                                                                                                        |
| [auction.ts](../src/engine/auction.ts)           | Tick-based auction engine: builds the per-good `AuctionPayload`, applies role/intent actions, ranks bids and asks (including the store's fixed band), and executes one trade per tick (`auctionTick`).                                                                                                                    |
| [scoring.ts](../src/engine/scoring.ts)           | Final score per player (`computeScores`) and winner index (`computeWinnerIndex`) once round 6 completes.                                                                                                                                                                                                                  |
| [turn.ts](../src/engine/turn.ts)                 | The phase state machine: builds the initial state, enters each phase (`enterLandGrant`, `enterDevelop`, `enterProduction`, `enterAuction`, `enterScoring`), and `applyTurnAction`, the reducer `game_state.ts` delegates to.                                                                                              |
| [round_scale.ts](../src/engine/round_scale.ts)   | `muleCurve` -- the round-scaled base dollar amount shared by personal/colony event payouts.                                                                                                                                                                                                                               |
| [events.ts](../src/engine/events.ts)             | Personal events (one roll per player per develop turn, rank/round-gated, 22-event shuffled deck) and colony events (one per round, category-A pre-production / category-B post-production), each with its own derived RNG sub-stream so adding events does not perturb the pre-event replay.                              |
| [land_auction.ts](../src/engine/land_auction.ts) | Colony land-auction phase: up to `LAND_AUCTION_SLOT_COUNT` colony-owned plots offered per round (each gated by its own roll probability), a discrete standing-bid model (`applyBidLand`, `landAuctionTick`) rather than `auction.ts`'s continuous per-tick walk, since a land auction sells exactly one indivisible item. |
| [wampus.ts](../src/engine/wampus.ts)             | Wampus creature subsystem: one spawns per round on an unowned mountain plot during develop, blinks in and out, moves between mountains, and awards a bounty to whichever develop-turn player catches it while visible (`createWampusState`, `tickWampus`, `catchWampus`).                                                 |

### src/ai/ (pure)

| File                                     | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [land_ai.ts](../src/ai/land_ai.ts)       | `decideLandGrantAction` -- picks a plot (or passes) for a non-human player during land grant.                                                                                                                                                                                                                                                                                                                                                                          |
| [develop_ai.ts](../src/ai/develop_ai.ts) | `decideDevelopAction` -- buys, outfits, and places a M.U.L.E. for a non-human player within their tick budget.                                                                                                                                                                                                                                                                                                                                                         |
| [auction_ai.ts](../src/ai/auction_ai.ts) | `decideAuctionActions` -- sets a non-human player's auction role and per-tick price intent.                                                                                                                                                                                                                                                                                                                                                                            |
| [personas.ts](../src/ai/personas.ts)     | Three named AI personality parameter sets (land baron, ore speculator, farmer). `personalityForPlayer(state, playerId)` is a pure function of `(state.seed, playerId)` only, so assignment is replay-safe and needs no new `GameState` field; the human seat never gets one. Every persona parameter layers on top of, never instead of, the M10 rank-aware land-bid dampening and every money-safety reserve/ceiling in `land_ai.ts`/`develop_ai.ts`/`auction_ai.ts`. |

### src/ui/ (SolidJS)

The UI is SolidJS: the reducer's immutable `GameState` snapshots feed a Solid
store via `reconcile`, screens and panels are reactive components, and a single
`requestAnimationFrame` loop drives ticks and AI turns.

Top-level `src/ui/` files:

| File                                           | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [screen_router.ts](../src/ui/screen_router.ts) | Reactive registry of named top-level screens (`registerScreen`, `showScreen`, `currentScreen`).                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [sprites.ts](../src/ui/sprites.ts)             | SVG sprite defs, player color slots, terrain fills, and resource icon fills shared by the renderers; thin re-export layer over the `src/ui/sprites/` split below.                                                                                                                                                                                                                                                                                                                                                  |
| [game_store.ts](../src/ui/game_store.ts)       | `createGameStore` -- wraps immutable `GameState` snapshots in a Solid store via `reconcile`; `dispatch` is the sole writer. Takes an optional `onDispatch` recorder hook (default off, M11 WS-E-replay) called with every dispatched `Action` after it applies, keeping the store itself ignorant of seed/selection/save concerns.                                                                                                                                                                                 |
| [input.ts](../src/ui/input.ts)                 | `bindKeys`/`bindRovingFocus` (edge-triggered menu input) and `createKeyState` (held-key poller sampled by the scene loop).                                                                                                                                                                                                                                                                                                                                                                                         |
| [game_driver.ts](../src/ui/game_driver.ts)     | Session controller: owns the live `GameStore` signal (`currentGameStore`), `startNewGame`/`playAgain`, and starts the scene loop. Wraps every game (new and resumed) in an autosaving store via `game_store.ts`'s `onDispatch` hook, appending each action to `save_log.ts`'s log and rewriting the save after every dispatch; `resumeSavedGame` replays a matching-build save through the reducer. See "Game driver" below.                                                                                       |
| [save_log.ts](../src/ui/save_log.ts)           | Autosave persistence (M11 WS-E-replay): owns the single-localStorage-slot saved representation (`mule-game-save-v1`: buildVersion, seed, mode/species selection, relaxedTimer, speed, action log) plus the reducer-replay helpers (`initialStateFromSave`, `replayToState`) shared by resume and the replay viewer. Same-build replay is the only compatibility guarantee -- a save from a different `__MULE_BUILD_VERSION__` (a source-tree hash `pipeline/build.mjs` injects) is discarded rather than replayed. |
| [hint_store.ts](../src/ui/hint_store.ts)       | First-run tutorial hint persistence (M11 WS-U-delight): a localStorage-backed dismissed-hint set (`mule-game-hints-dismissed-v1`, deliberately separate from `save_log.ts`'s autosave key -- a standing UI preference, not part of a resumable game), with a `?hints=off` escape hatch.                                                                                                                                                                                                                            |
| [pwa_register.ts](../src/ui/pwa_register.ts)   | Registers `src/sw.js` (M11 WS-U-delight PWA install) from `main.tsx` if the browser supports service workers; a failed or unsupported registration is silently swallowed, since offline caching is a progressive enhancement.                                                                                                                                                                                                                                                                                      |
| [main.tsx](../src/ui/main.tsx)                 | Thin bootstrap (`initApp`): registers screens, mounts the Solid `<App>`, parses `?seed=`/`?speed=`/`?demo=`/`?mode=`/`?species=`/`?timer=`, wires New Game to `startNewGame`, and registers the service worker via `pwa_register.ts`.                                                                                                                                                                                                                                                                              |

### src/ui/scenes/ (rAF loop and spatial presentation)

| File                                                                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [scene_manager.ts](../src/ui/scenes/scene_manager.ts)               | Single rAF fixed-timestep loop dispatching every tick and AI turn at each phase's cadence; owns the tick-ownership ledger and the `?timer=relaxed` pacing multiplier.                                                                                                                                                                                                                                                       |
| [human_develop_layer.tsx](../src/ui/scenes/human_develop_layer.tsx) | Human develop-turn map layer: swaps the overworld and walkable town scenes as a UI sub-state of the develop phase (no separate engine phase).                                                                                                                                                                                                                                                                               |
| [overworld_scene.tsx](../src/ui/scenes/overworld_scene.tsx)         | Walkable outdoor board: avatar movement over plots, zone entry into town, wampus encounter rendering.                                                                                                                                                                                                                                                                                                                       |
| [town_scene.tsx](../src/ui/scenes/town_scene.tsx)                   | Walkable town interior: corral (`buy_mule`), four outfit counters (`outfit_mule`), pub notice, assay arm, and edge exits; replaced the develop-turn store menu.                                                                                                                                                                                                                                                             |
| [walker.ts](../src/ui/scenes/walker.ts)                             | Pure, DOM-free avatar kinematics (held-key set to direction, position integration, collision) shared by the overworld and town scenes; unit-tested directly with `tests/test_walker.mjs`.                                                                                                                                                                                                                                   |
| [zones.ts](../src/ui/scenes/zones.ts)                               | Pure overworld zone geometry (plot cells, the town-entry cell) and the point-in-zone query; unit-tested with `tests/test_zones.mjs`.                                                                                                                                                                                                                                                                                        |
| [ai_actor.ts](../src/ui/scenes/ai_actor.ts)                         | Pure AI develop-turn presentation logic: turns the deterministic `decideDevelopAction` action sequence into a walkable target for the AI avatar.                                                                                                                                                                                                                                                                            |
| [auction_tween.ts](../src/ui/scenes/auction_tween.ts)               | Pure motion helpers (`priceToTrackY`, `easeToward`) that ease each auction participant's rendered position toward its engine-derived price target between ticks.                                                                                                                                                                                                                                                            |
| `src/ui/scenes/wampus_presentation.ts`                              | Pure timing helpers that stretch the engine's one-tick wampus visible window into a human-perceivable buffer for the spatial scene.                                                                                                                                                                                                                                                                                         |
| `src/ui/scenes/dpad.tsx`                                            | Touch d-pad: four direction buttons synthesize the same `ArrowUp`/`Down`/`Left`/`Right` `keydown`/`keyup` events `createKeyState()` already polls, so one mount covers movement in both spatial scenes; hidden on non-touch pointers.                                                                                                                                                                                       |
| [replay_scene.tsx](../src/ui/scenes/replay_scene.tsx)               | Replay viewer (M11 WS-E-replay): plays `replay_fixture.ts`'s committed action log back through the ordinary `GameScreen` on an rAF stepper at any `?speed=`, in a plain `GameStore` with no autosave recorder and no scene-loop mount, so it never touches the player's saved game. Play/pause, restart, and a speed radiogroup transport. Entered via `?replay=fixture` or the title screen's "Watch demo replay" control. |
| `src/ui/scenes/replay_fixture.ts`                                   | A committed, full seed-2026, 6-round, 1298-action game log consumed by `replay_scene.tsx`.                                                                                                                                                                                                                                                                                                                                  |

### src/ui/solid/ (reactive screens and panels)

| File                                                             | Purpose                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [app.tsx](../src/ui/solid/app.tsx)                               | Root phase-router: a `<Switch>` over the active screen mounting the title, demo, and live game screens.                                                                                                                                                                                                                                           |
| [title_screen.tsx](../src/ui/solid/title_screen.tsx)             | Title screen: New Game entry, mode/species selection, and the relaxed-timer toggle.                                                                                                                                                                                                                                                               |
| [game_screen.tsx](../src/ui/solid/game_screen.tsx)               | Live game screen: the reactive HUD, board, and phase-routed panel; owns the land-grant/auction board cursor.                                                                                                                                                                                                                                      |
| [hud.tsx](../src/ui/solid/hud.tsx)                               | Reactive per-player status readout; `aria-live="polite"` on the human player's own money/goods spans.                                                                                                                                                                                                                                             |
| [map_layer.tsx](../src/ui/solid/map_layer.tsx)                   | Reactive inline-SVG board with optional land-grant cursor and plot-click delegation.                                                                                                                                                                                                                                                              |
| [land_grant_panel.tsx](../src/ui/solid/land_grant_panel.tsx)     | Land-grant hint, Pass button, and Enter/Space claim of whichever plot the engine's sweep cursor sits on.                                                                                                                                                                                                                                          |
| [land_auction_panel.tsx](../src/ui/solid/land_auction_panel.tsx) | UI for the colony land-auction phase: current plot, standing bid, and per-player bid controls.                                                                                                                                                                                                                                                    |
| [auction_screen.tsx](../src/ui/solid/auction_screen.tsx)         | Live goods auction: role bar, price track, trade log, and price-intent controls.                                                                                                                                                                                                                                                                  |
| [production_panel.tsx](../src/ui/solid/production_panel.tsx)     | Production yields interstitial with a per-resource yield-pop entrance animation (gated off under `prefers-reduced-motion`).                                                                                                                                                                                                                       |
| [event_banner.tsx](../src/ui/solid/event_banner.tsx)             | Reusable vignette banner for personal/colony event payloads: icon, title, effect line, auto-dismissing after a caller-supplied hold.                                                                                                                                                                                                              |
| `src/ui/solid/mule_escape_vignette.tsx`                          | Radiation-event vignette showing an installed M.U.L.E. destroyed on the leader's factory plot.                                                                                                                                                                                                                                                    |
| [ai_actor_layer.tsx](../src/ui/solid/ai_actor_layer.tsx)         | AI develop-turn avatar overlay: walks the AI avatar per `ai_actor.ts`'s target while the AI buys/outfits/places a M.U.L.E.                                                                                                                                                                                                                        |
| [scoring_panel.tsx](../src/ui/solid/scoring_panel.tsx)           | Final scores: colony status banner, First Founder callout, and per-player score-breakdown table; Play Again.                                                                                                                                                                                                                                      |
| [tutorial_hint.tsx](../src/ui/solid/tutorial_hint.tsx)           | First-run tutorial hints (M11 WS-U-delight): one dismissible `[data-tutorial-hint]` notice per phase kind, backed by `hint_store.ts`. Escape uses `stopImmediatePropagation` since SolidJS delegates `keydown` through a single document dispatcher; mounted in the land-grant/land-auction/develop/auction panels and `human_develop_layer.tsx`. |
| [map_demo.tsx](../src/ui/solid/map_demo.tsx)                     | `?demo=map` fixture screen: a hand-written fixture `GameState` rendered through `<Hud>`/`<MapLayer>` for renderer review independent of the procedural map generator.                                                                                                                                                                             |
| [town_demo.tsx](../src/ui/solid/town_demo.tsx)                   | `?demo=town` fixture screen for reviewing the walkable town interior independent of a full New Game.                                                                                                                                                                                                                                              |
| `src/ui/solid/ai_actor_demo.tsx`                                 | `?demo=ai_actor` fixture screen for reviewing the AI avatar/Skip overlay independent of a full New Game.                                                                                                                                                                                                                                          |
| `src/ui/solid/mule_escape_demo.tsx`                              | `?demo=mule_escape` fixture screen for reviewing the radiation vignette without needing a live radiation-round seed.                                                                                                                                                                                                                              |
| `src/ui/solid/wampus_hunt_demo.tsx`                              | `?demo=wampus` fixture screen with a fixed visible wampus for reviewing the encounter without waiting on a live spawn roll.                                                                                                                                                                                                                       |

### src/ui/sprites/ (SVG sprite defs and visual-review galleries)

| File                                                                                                                                                                                                                               | Purpose                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [palette.ts](../src/ui/sprites/palette.ts)                                                                                                                                                                                         | Shared color token palette (`PALETTE`) consumed by every sprite module.                                                            |
| [sprites_terrain.ts](../src/ui/sprites/sprites_terrain.ts)                                                                                                                                                                         | Terrain tile fills/patterns (plains, mountain, river, town).                                                                       |
| [sprites_town.ts](../src/ui/sprites/sprites_town.ts)                                                                                                                                                                               | Town-interior sprites: corral, outfit counters, pub, assay arm.                                                                    |
| [sprites_mule.ts](../src/ui/sprites/sprites_mule.ts)                                                                                                                                                                               | M.U.L.E. unit sprites per outfit.                                                                                                  |
| [sprites_species.ts](../src/ui/sprites/sprites_species.ts)                                                                                                                                                                         | Playable species avatar sprites.                                                                                                   |
| [sprites_arena.ts](../src/ui/sprites/sprites_arena.ts)                                                                                                                                                                             | Auction-arena track and participant avatar sprites.                                                                                |
| [sprites_events.ts](../src/ui/sprites/sprites_events.ts)                                                                                                                                                                           | Personal/colony event icon sprites consumed by `event_banner.tsx`.                                                                 |
| `src/ui/sprites/sprites_wampus.ts`                                                                                                                                                                                                 | Wampus creature sprites (idle, blink, caught).                                                                                     |
| [sprites_title.ts](../src/ui/sprites/sprites_title.ts)                                                                                                                                                                             | Title-screen art sprites.                                                                                                          |
| [sprite_gallery.ts](../src/ui/sprites/sprite_gallery.ts), [terrain_gallery.ts](../src/ui/sprites/terrain_gallery.ts), [title_gallery.ts](../src/ui/sprites/title_gallery.ts), [town_gallery.ts](../src/ui/sprites/town_gallery.ts) | Visual-review gallery renderers, one per sprite family, driving the matching `tests/playwright/*_gallery.spec.mjs` art-gate specs. |

## Data flow

`GameState` is the single serializable snapshot of the game (seed, RNG
accumulator, round, phase, board plots, four players, store). Every state
transition is `applyAction(state, action) -> GameState`
([game_state.ts](../src/engine/game_state.ts)), a pure function with no
mutation, delegating to `applyTurnAction`
([turn.ts](../src/engine/turn.ts)). The UI layer never mutates state directly;
it dispatches an `Action` (a discriminated union covering `tick`,
`claim_plot`, `buy_mule`, `outfit_mule`, `place_mule`, `set_auction_role`,
`set_auction_intent`, and so on) and re-renders from the returned state.

AI decisions (`src/ai/`) read `GameState` and return an `Action` for a given
non-human `playerId`, the same `Action` type a human's UI input produces --
the reducer does not distinguish who issued an action.

## Phase state machine

The `Phase` discriminated union in
[game_state.ts](../src/engine/game_state.ts) and the phase-entry functions in
[turn.ts](../src/engine/turn.ts) implement this per-round cycle:

```
title
  -> land_grant (snake-order picks)
    -> land_auction x0-3 colony plots (skipped cleanly when a slot's roll
       yields no plot, or no unowned non-town plot remains)
      -> develop x4 players (buy, outfit, place a M.U.L.E. on a tick budget)
        -> production (apply yields + spoilage, snapshot)
          -> auction x4 goods, fixed order: smithore, crystite, food, energy
            -> next round's land_grant
              ... repeats for ROUND_COUNT rounds ...
                -> scoring (after the final round)
```

Each land-grant round uses a snake-order pick sequence (forward 0..3 on odd
rounds, reverse 3..0 on even rounds), from
[land_grant.ts](../src/engine/land_grant.ts). The land-auction phase then
offers up to `LAND_AUCTION_SLOT_COUNT` colony-owned plots, each gated by its
own roll probability and only rolling a later slot if the previous one sold
([land_auction.ts](../src/engine/land_auction.ts)). Development turns run in
fixed player-id order 0..3, each with a tick budget
(`DEVELOP_TICKS_PER_TURN`); personal events roll once per player per develop
turn. Production snapshots yields and spoilage, running colony events
before (category A) and after (category B) that snapshot
([events.ts](../src/engine/events.ts)). Auctions run in fixed good order
(smithore, crystite, food, energy) per round, from `AUCTION_GOOD_ORDER` in
[turn.ts](../src/engine/turn.ts).

## Auction tick model

The auction phase ([auction.ts](../src/engine/auction.ts)) models the
original game's real-time trading floor as discrete engine ticks. Each good's
auction runs up to `AUCTION_TICKS` ticks; every participant (players plus a
synthetic store participant, `AUCTION_STORE_ID`) holds a role (`buyer`,
`seller`, or `out`) and a per-tick price intent (`up`, `down`, `hold`) that
moves their price by `AUCTION_PRICE_STEP`, clamped to
`[AUCTION_PRICE_FLOOR, AUCTION_PRICE_CEILING]`. Each `auctionTick` ranks the
best bid against the best ask (store included, at a fixed band around
`STORE_BASE_PRICE`) and executes at most one unit trade when the market is
crossed. The auction ends when its tick budget is spent or no further trade
is possible; `turn.ts` then advances to the next good or phase.

## Constants as rule authority

[constants.ts](../src/engine/constants.ts) is the single source of truth for
every numeric game rule -- round structure, starting resources, production
yield tables, store prices and stock, M.U.L.E. and outfit costs, land value,
spoilage/decay rates, and auction tunables. Every exported constant carries a
source comment citing the historical reference consulted (Atari 8-bit manual
scans, StrategyWiki, C64-Wiki, Data Driven Gamer analysis); where sources
conflict, the constant's own comment records the conflict and which value
this engine chose. Do not duplicate these values elsewhere in the codebase or
in other docs -- link to [constants.ts](../src/engine/constants.ts) instead,
so a rule change only needs one edit.

## Game driver

The live game runs on the reactive store plus a single rAF loop; no imperative
DOM rendering and no setTimeout scheduling remain.

[src/ui/game_driver.ts](../src/ui/game_driver.ts) is the session controller.
`startNewGame` builds the initial `GameState`, wraps it in a `GameStore`
([game_store.ts](../src/ui/game_store.ts)), publishes it on the
`currentGameStore` signal, shows the gameplay screen, and starts the scene
loop; it renders nothing itself. The reactive `<App>`
([app.tsx](../src/ui/solid/app.tsx)) routes to `GameScreen`
([game_screen.tsx](../src/ui/solid/game_screen.tsx)) once a store exists, and
`GameScreen` renders the HUD, board, and active phase panel reactively, routing
the panel by a `<Switch>` over the phase kind.

`game_driver.ts` also owns autosave and resume (M11 WS-E-replay): it wraps
every game -- new or resumed -- in a store built with `game_store.ts`'s
`onDispatch` hook, which appends each dispatched action to
[save_log.ts](../src/ui/save_log.ts)'s log and rewrites the save after every
dispatch, so the persisted log always stays exactly one action behind live
state; `resumeSavedGame` replays that log through the reducer to rebuild the
exact prior state. The title screen offers Resume for a matching-build save
and a "Watch demo replay" control that opens
[replay_scene.tsx](../src/ui/scenes/replay_scene.tsx) instead.

[scene_manager.ts](../src/ui/scenes/scene_manager.ts) owns all scheduling: a
single `requestAnimationFrame` loop consumes real elapsed time (scaled by the
`?speed=` multiplier) in fixed 16.67ms steps, and per-phase tick accumulators
dispatch `{ type: "tick" }` and AI decisions at each phase's cadence -- land
grant and develop schedule an AI step for AI players and hold for the human's
turn; the human's develop budget drains on a tick timer; production and a
finished auction auto-advance; a live auction lets AI participants act, then
applies one engine `tick`. Because the loop is the only thing that dispatches
ticks (recorded on a `window.__tickOwnership` ledger), tick ownership is a
provable single-scheduler invariant. Every transition -- human control or AI --
flows through `store.dispatch` (the pure reducer plus `reconcile`).

[main.tsx](../src/ui/main.tsx) (`initApp`) is a thin bootstrap: it registers the
title, game, and demo screens, mounts the Solid `<App>`, parses the URL query
params below, and wires the title screen's New Game button to `startNewGame`.

| Param             | Effect                                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?seed=`          | Seeds the `Rng` so a game (or a fixture demo) replays deterministically.                                                                                                                                               |
| `?speed=`         | Multiplies elapsed real time in the `scene_manager.ts` rAF loop, for fast-forwarding ticks and AI turns in tests.                                                                                                      |
| `?demo=`          | Shows a fixture screen instead of the title screen: `map`, `town`, `ai_actor`, `mule_escape`, or `wampus` (see the matching `*_demo.tsx` file in the module map above).                                                |
| `?mode=`          | Selects the game mode passed into `startNewGame`'s initial config.                                                                                                                                                     |
| `?species=`       | Selects the human player's species, threaded through `NewGameConfig` so Play Again preserves the choice.                                                                                                               |
| `?timer=relaxed`  | Doubles the develop-tick and land-grant-sweep real-time pacing (`RELAXED_TIMER_MULTIPLIER` in `scene_manager.ts`) for players who find default reflex timing tight; UI-side pacing only, no engine tick-budget change. |
| `?replay=fixture` | Opens the replay viewer ([replay_scene.tsx](../src/ui/scenes/replay_scene.tsx)) instead of the title screen, playing the committed fixture log back through the ordinary `GameScreen`.                                 |
| `?hints=off`      | Suppresses every tutorial hint ([hint_store.ts](../src/ui/hint_store.ts)), as if every hint were already dismissed.                                                                                                    |

## Build pipeline

[pipeline/build.mjs](../pipeline/build.mjs) is the esbuild JS-API bundler that
produces `dist/main.js`: the canonical esbuild CLI cannot load
`esbuild-plugin-solid`, which the SolidJS JSX transform requires, so this
script uses esbuild's JS API directly (`.ts` files still bundle natively;
only `.tsx`/`.jsx` route through the Solid plugin) to emit the same
single ESM bundle (es2020, browser, minified, with sourcemap) the CLI would.
[build_github_pages.sh](../build_github_pages.sh) resolves the entry point
(`src/main.ts`, which imports `./ui/main` -- `src/ui/main.tsx`) and calls
`node pipeline/build.mjs "$ENTRY"`, then owns the rest of the `dist/`
lifecycle (wipe, static-asset copy, `.nojekyll`, existence asserts).

`build_github_pages.sh` also produces the PWA install surface (M11
WS-U-delight): it copies `src/manifest.json` and `src/sw.js` (a cache-first
offline cache of the static bundle) verbatim into `dist/`, and generates
`dist/icons/icon-192.png` / `icon-512.png` via `tools/generate_pwa_icons.mjs`
(a pngjs-rasterized ringed-planet badge reusing the title screen's own
palette tokens). `src/ui/pwa_register.ts` registers the worker from
`main.tsx`.

## Test layout

- `tests/test_*.mjs` -- fast, pure Node tests for the engine, ai, and
  DOM-free UI-math layers (`walker.ts`, `zones.ts`, `auction_tween.ts`), run
  with `node --import tsx --test tests/test_*.mjs` (loads the `tsx` runtime
  loader so `.mjs` tests can import `.ts`/`.tsx` source directly). Includes
  `test_full_game.mjs`, a pure-reducer end-to-end run through every phase of
  a full game; `test_personas.mjs` (persona assignment determinism and
  human-seat exclusion); and `test_save_log.mjs` (autosave round-trip,
  build-match gating, fixture replay).
- `tests/playwright/` -- browser-driven end-to-end tests exercising the
  rendered UI in a real browser: one spec per scene/panel (auction, land
  auction, overworld, town, map render, event banner, scoring, wampus hunt,
  mule escape, dpad, AI actor, species/mode selection,
  sprite/terrain/title/town galleries, tick ownership, visual-render art gate,
  pub gamble, tutorial hint, ambient reduced-motion, PWA install,
  reload/resume, replay viewer, build-mismatch notice) plus
  `game_flow.spec.mjs`, which drives a full game through the DOM (New Game,
  land grant, develop, auction, scoring). Run with
  `./run_playwright_tests.sh` (or `npm run test:playwright`).
- `tests/e2e/` -- non-browser, whole-system E2E harnesses excluded from the
  pytest fast lane (`docs/E2E_TESTS.md`): `e2e_mini_flow.mjs` (one phase
  transition through the real UI), `e2e_full_game.mjs` (New Game to scoring,
  both modes, fixed seeds, zero page errors -- the automated stand-in for a
  human playthrough), `e2e_balance_sim.mjs` (seeded AI-vs-AI sim sweep
  used to tune economy/AI constants against the sim gates; `--report` also
  renders the HTML balance dashboard via
  `tools/balance_report_generator.mjs` -- see
  [docs/USAGE.md](USAGE.md#balance-report-dashboard)), and
  `e2e_balance_report.mjs` (runs `e2e_balance_sim.mjs --report` as a real
  subprocess at a tiny seed count and asserts the written HTML dashboard
  carries every required section).
- `tests/test_*.py` -- a pytest hygiene suite shared across this repo family:
  ASCII compliance, import rules, shebang rules, indentation/whitespace,
  Markdown link checks, pytest hygiene, and repo-naming conventions. Run with
  `source source_me.sh && python3 -m pytest tests/`.

## Related docs

- [docs/REPO_STYLE.md](REPO_STYLE.md): repo-wide conventions.
- [docs/PYTHON_STYLE.md](PYTHON_STYLE.md): Python rules for the pytest hygiene suite.
- [docs/archive/mule_core_loop_plan.md](archive/mule_core_loop_plan.md): the completed work-package plan this engine implements.
