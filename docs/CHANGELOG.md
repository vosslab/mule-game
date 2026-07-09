# CHANGELOG.md

## 2026-07-08

### Additions and New Features

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
  smithore 0 per player) and `STORE_OPENING_STOCK` (food 8, energy 8, smithore
  8) both cite planetmule.com/how-to-play; `OUTFIT_COST` and `ENERGY_PER_MULE`
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
