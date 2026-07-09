# Release history

## v26.07 - 2026-07-08

### Highlights

- Full game wiring (`src/ui/game_driver.ts`): a single mutable `GameState`
  drives the whole phase cycle (title -> land_grant -> develop -> production
  -> auction -> scoring) through the pure `applyAction` reducer, with AI
  turns and engine ticks advancing on `setTimeout` chains. The title screen's
  "New Game" button now launches a full six-round game through scoring and
  Play Again.
- Core engine: seeded RNG (`src/engine/rng.ts`), deterministic map generation
  (`src/engine/map.ts`), economy/store/scoring modules
  (`src/engine/constants.ts`, `economy.ts`, `store.ts`, `scoring.ts`), the
  turn/phase state machine and land grant (`src/engine/turn.ts`,
  `land_grant.ts`), and a tick-based double-auction matching engine
  (`src/engine/auction.ts`).
- AI strategies for all three phases: land grant, develop, and auction
  (`src/ai/land_ai.ts`, `develop_ai.ts`, `auction_ai.ts`).
- UI screens: SVG sprites and map/HUD rendering (`src/ui/sprites.ts`,
  `map_render.ts`, `hud.ts`), the store/placement screen
  (`src/ui/store_screen.ts`), and the auction screen
  (`src/ui/auction_screen.ts`) with keyboard and touch price-intent input.
- Docs: added `README.md` and `docs/CODE_ARCHITECTURE.md` covering the
  engine/AI/UI purity boundary, module map, data flow, and phase state
  machine.
- Added an ESLint purity gate (`eslint.config.local.js`) that fails lint on
  DOM globals or `src/ui/**` imports inside `src/engine/**` and `src/ai/**`,
  enforcing the architecture boundary in CI rather than by manual review
  only.

### Notable fixes

- Fixed a "click twice to do anything" bug: the store and auction screens
  cleared and rebuilt their whole DOM on every tick-driven re-render, so a
  click whose pointerdown landed on a button destroyed mid-render never
  fired. Both screens now reconcile in place on tick-only updates and only
  rebuild on structural changes.
- Fixed the auction AI's price-walk direction: `desiredIntent` was moving
  buyer prices toward the floor and seller prices toward the ceiling, the
  inverse of the auction engine's crossing rule. A 30-game headless balance
  sim had found zero trades in every game before the fix; after the fix,
  trades-per-good-per-round rose from 0/0/0 to food 1.33, energy 1.33,
  smithore 1.84, and the dead-auction-window rate fell from 1.00 to 0.79.
- Constants fidelity pass against planetmule.com/how-to-play: starting goods
  now give every player 4 food and 2 energy (was 0/0), and the store opens
  with 8 food / 8 energy / 8 smithore (was 30/25/50).
- Resolved a runtime circular-import crash from `game_state.applyAction`
  delegating to `turn.ts` by moving `PLOT_ROWS`/`PLOT_COLS` into
  `constants.ts`, the stated single source of truth for numeric rules.

### Compatibility notes

- The store opens with 14 M.U.L.E. units per planetmule.com, but `store.ts`
  sells M.U.L.E.s on demand with no stock cap. This is recorded as a
  documented v1 gap in the `STORE_OPENING_STOCK` comment rather than modeled
  as a new constant.
- About 79% of individual per-good auction windows still close with no trade
  even after the AI walk-direction fix; the `AUCTION_TICKS`/
  `AUCTION_PRICE_STEP` tuning may not give bid/ask enough ticks to cross.
  Tracked as a deferred v1 tuning gap in `docs/TODO.md`.

### Validation

- `./check_codebase.sh` passes all five steps (typecheck, typecheck:lint,
  lint, format:check, `node --import tsx --test tests/test_*.mjs`, 68/68
  node tests green).
- `./build_github_pages.sh` succeeds.
- A headless Chromium smoke ran a full six-round game from New Game through
  scoring and Play Again with no page errors.
- `bash run_playwright_tests.sh --build tests/playwright/` reports 4 passed
  (map render, title-to-land-grant flow, M.U.L.E. purchase/outfit/placement,
  and auction role/price-intent interaction).
- `source source_me.sh && python3 -m pytest tests/test_markdown_links.py -q`
  passes (25 passed).
