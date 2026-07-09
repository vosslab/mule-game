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

| File | Purpose |
| --- | --- |
| [constants.ts](../src/engine/constants.ts) | Single source of truth for every numeric game rule (round count, board size, prices, yields, upkeep, auction tunables). See "Constants as rule authority" below. |
| [game_state.ts](../src/engine/game_state.ts) | Defines `GameState`, `Phase`, `Action`, and related payload types; `applyAction` is the single reducer entry point, delegating to `applyTurnAction`. |
| [rng.ts](../src/engine/rng.ts) | Seeded, serializable pseudo-random number generator (`Rng`, `createRng`) so a saved seed replays deterministically. |
| [map.ts](../src/engine/map.ts) | Generates the board's terrain grid (`generateMap`) and reads terrain at a plot (`terrainOf`). |
| [player.ts](../src/engine/player.ts) | `Resource`, `RESOURCES`, `ColorSlot`, and the `Player` shape (money, goods, plots owned). |
| [store.ts](../src/engine/store.ts) | `StoreState` and pure store pricing/cost helpers: M.U.L.E. purchase cost, outfit cost, buy/sell proceeds, and stock mutation helpers. |
| [land_grant.ts](../src/engine/land_grant.ts) | Snake-order pick sequence for the land-grant phase: pick order, current picker, advancing picks, and claiming a plot on the board. |
| [economy.ts](../src/engine/economy.ts) | Pure production and spoilage math: terrain yield lookup, adjacency clustering bonus, per-round production (`computeProduction`), and upkeep plus spoilage/decay (`applySpoilage`). |
| [auction.ts](../src/engine/auction.ts) | Tick-based auction engine: builds the per-good `AuctionPayload`, applies role/intent actions, ranks bids and asks (including the store's fixed band), and executes one trade per tick (`auctionTick`). |
| [scoring.ts](../src/engine/scoring.ts) | Final score per player (`computeScores`) and winner index (`computeWinnerIndex`) once round 6 completes. |
| [turn.ts](../src/engine/turn.ts) | The phase state machine: builds the initial state, enters each phase (`enterLandGrant`, `enterDevelop`, `enterProduction`, `enterAuction`, `enterScoring`), and `applyTurnAction`, the reducer `game_state.ts` delegates to. |

### src/ai/ (pure)

| File | Purpose |
| --- | --- |
| [land_ai.ts](../src/ai/land_ai.ts) | `decideLandGrantAction` -- picks a plot (or passes) for a non-human player during land grant. |
| [develop_ai.ts](../src/ai/develop_ai.ts) | `decideDevelopAction` -- buys, outfits, and places a M.U.L.E. for a non-human player within their tick budget. |
| [auction_ai.ts](../src/ai/auction_ai.ts) | `decideAuctionActions` -- sets a non-human player's auction role and per-tick price intent. |

### src/ui/ (DOM)

| File | Purpose |
| --- | --- |
| [screen_router.ts](../src/ui/screen_router.ts) | Registers and shows named DOM screen sections (`registerScreen`, `showScreen`). |
| [sprites.ts](../src/ui/sprites.ts) | SVG sprite defs, player color slots, terrain fills, and resource icon fills shared by the renderers. |
| [map_render.ts](../src/ui/map_render.ts) | `renderMap` -- draws the board grid, terrain, and owned/outfitted plots into a container element. |
| [hud.ts](../src/ui/hud.ts) | `renderHud` -- draws the round/phase/player status readout. |
| [store_screen.ts](../src/ui/store_screen.ts) | `renderStoreScreen` -- draws the M.U.L.E./outfit purchase UI during development. |
| [auction_screen.ts](../src/ui/auction_screen.ts) | `renderAuctionScreen` -- draws the live auction market: participant prices, trade log, store band. |
| [input.ts](../src/ui/input.ts) | `bindKeys` -- binds a key-to-callback map and returns an unbind function. |
| [game_driver.ts](../src/ui/game_driver.ts) | Owns the live `GameState`, dispatches actions, and sequences the phase cycle across timers and AI turns (`startNewGame`). See "Game driver" below. |
| [main.ts](../src/ui/main.ts) | Thin bootstrap (`initApp`): registers screens, shows the title screen, wires the New Game button to `startNewGame`, and renders the `?demo=map` fixture for renderer review. |

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
    -> develop x4 players (buy, outfit, place a M.U.L.E. on a tick budget)
      -> production (apply yields + spoilage, snapshot)
        -> auction x3 goods, fixed order: food, energy, smithore
          -> next round's land_grant
            ... repeats for ROUND_COUNT rounds ...
              -> scoring (after round 6)
```

Each land-grant round uses a snake-order pick sequence (forward 0..3 on odd
rounds, reverse 3..0 on even rounds), from
[land_grant.ts](../src/engine/land_grant.ts). Development turns run in fixed
player-id order 0..3, each with a tick budget
(`DEVELOP_TICKS_PER_TURN`). Auctions run in fixed good order (food, energy,
smithore) per round.

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

[src/ui/game_driver.ts](../src/ui/game_driver.ts) is the seam that wires the
pure reducer to the DOM. `startNewGame` builds the initial `GameState`, shows
the gameplay screen, and renders; `dispatch` applies an `Action` through
`applyAction` and re-renders. All module state (`currentState`, the resolved
`GameElements`, and auction role-commitment tracking) is held in module-level
variables, since exactly one game runs at a time.

Rendering and scheduling are split: `render()` calls `renderPhaseView()` to
draw the HUD, map, and active phase panel, then `scheduleForPhase()` to queue
whatever timed step that phase needs next. Every phase drives forward through
at most one pending timer, held in the single `phaseTimer` variable and always
cleared via `clearTimer()` before a new one is scheduled -- this discipline
(clear-then-schedule, never two live timers) is what keeps the AI/tick/human
sequencing deterministic: land grant and develop schedule an AI step on a
timer for AI players and leave the timer idle for the human's turn (waiting
on a map click or store input); production and a finished auction auto-advance
on a pause timer; a live auction schedules `auctionStep`, which lets AI
participants act, applies one engine `tick`, then re-renders (which
reschedules the next tick or the finished auto-advance).

`src/ui/main.ts` (`initApp`) is a thin bootstrap layered on top: it registers
the title, game, and map screens, wires the title screen's New Game button to
call `startNewGame`, and, behind the `?demo=map` URL parameter, builds a
hand-written fixture `GameState` and renders it directly with `renderMap`/
`renderHud` for renderer review independent of `game_driver.ts` or the
procedural map generator.

## Test layout

- `tests/test_*.mjs` -- fast, pure Node tests for the engine and AI layers
  (`test_engine_rng.mjs`, `test_map.mjs`, `test_economy.mjs`,
  `test_auction.mjs`, `test_store.mjs`, `test_turn.mjs`, `test_ai.mjs`), plus
  `test_full_game.mjs`, a pure-reducer end-to-end run through every phase of a
  full game, run directly with `node`.
- `tests/playwright/` -- browser-driven end-to-end tests exercising the
  rendered UI in a real browser: `map_render.spec.mjs` covers the renderers,
  `game_flow.spec.mjs` drives a full game through the DOM (New Game button,
  land grant clicks, develop, auction, scoring).
- `tests/test_*.py` -- a pytest hygiene suite shared across this repo family:
  ASCII compliance, import rules, shebang rules, indentation/whitespace,
  Markdown link checks, pytest hygiene, and repo-naming conventions. Run with
  `source source_me.sh && python3 -m pytest tests/`.

## Related docs

- [docs/REPO_STYLE.md](REPO_STYLE.md): repo-wide conventions.
- [docs/PYTHON_STYLE.md](PYTHON_STYLE.md): Python rules for the pytest hygiene suite.
- [docs/archive/mule_core_loop_plan.md](archive/mule_core_loop_plan.md): the completed work-package plan this engine implements.
