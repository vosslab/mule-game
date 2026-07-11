# TODO.md

Backlog scratchpad for small tasks without timelines. See
[docs/CHANGELOG.md](CHANGELOG.md) for what has already shipped and why.

## Auction fidelity

- Shipped: the auction trading-floor tuning that eliminated dead auction
  windows. The M4 tick-constant sim experiment (`tests/e2e/e2e_balance_sim.mjs`,
  gate: dead-window rate < 0.2) landed `AUCTION_QUIET_TICK_BUDGET = 8`,
  `AUCTION_IDLE_TIMEOUT = 3`, and the 1/3/1/1 transfer curve in
  `src/engine/constants.ts`, driving the dead-window rate to 0.0% in both
  modes over 100 seeds/mode (`docs/RULE_SOURCES.md`, "Goods auction: bands,
  roles, timing, transfer (WS-E-auction)"). The M10 land-bid-dampening sim
  rerun reconfirmed the gate holds at 300 seeds/mode after later AI tuning:
  dead-window 0.0%, dead-land 0.1% (`docs/RULE_SOURCES.md`, "Colony land
  auction: pricing, bidding, tie-break (WS-E-land)", M10 rank-aware
  land-bid-dampening entry).
- Shipped (M1, WP-1B, 2026-07-10): the insolvent-top-bidder fallthrough fix
  and the seller-out-of-goods store fallback. `bestBid`/`bestAsk` now return
  ranked offer lists and `resolveTrade` walks them until a crossed solvent
  pair executes, so an insolvent top bidder no longer blocks a lower solvent
  bidder or the store's standing offer; the store's limited stock is the
  natural seller-out-of-goods fallback (no separate mechanism needed). The
  `tests/test_auction_termination.mjs` third case was re-strengthened to an
  exact trade count and `tests/test_auction_solvent_fallthrough.mjs` pins the
  buyer- and seller-side traversal. See
  [docs/CHANGELOG.md](CHANGELOG.md) 2026-07-10 (WP-1A/WP-1B/WP-1C/WP-1D) and
  [RULE_SOURCES.md](RULE_SOURCES.md) for the traversal citation.

## Economy fidelity

Shipped: the learning-curve production bonus (a colony-wide +1 per
`PRODUCTION_LEARNING_CURVE_DIVISOR` same-resource plots, `src/engine/economy.ts`);
the M.U.L.E. store stock cap and smithore-to-M.U.L.E. rebuild economy
(`STORE_OPENING_STOCK`/`MULE_STOCK_CAP`/`SMITHORE_PER_MULE` in
`src/engine/constants.ts`, `rebuildMules` in `src/engine/store.ts`); and the
develop-phase tick budget that scales per round rather than staying fixed
(`DEVELOP_TICKS_FULL`/`DEVELOP_TICKS_MIN`/`FOOD_REQUIREMENTS_BY_ROUND` in
`src/engine/constants.ts`, consumed by `turn.ts`'s `beginDevelopTurn`) --
planet_mule's decompiled source showed the real per-player develop timer is
food-scaled, not money-scaled as originally guessed here. Every economy item
from the original future-fidelity list has shipped.

### Rule fidelity backlog (from planet_mule manual excerpts, user-posted 2026-07-10)

- Mule REFIT: refitting a mule (swapping its installed outfit for a
  different one) pays or refunds the outfit-cost difference rather than
  charging the full new-outfit price again.
- Mule EXCHANGE: swap a carried mule with the mule already installed on an
  occupied plot via the action press on that plot.
- Mule SELL: sell a mule back at the corral for cash, recovering the
  outfitting cost as well as the base mule price.
- Outfitting kiosk order: the outfit-selection kiosk lists options in the
  order crystite, smithore, energy, food.
- Each item needs verification against the 1983/1990 rule documents
  (`OTHER_REPOS/mule_rules.md`, `OTHER_REPOS/mule_document.html`) before
  implementation, per the authority hierarchy recorded in
  `docs/HUMAN_GUIDANCE.md` (rules follow the 1983/1990 documents; planet_mule
  is a visual-style and implementation-idea reference, subordinate on
  mechanics questions). Verified formulas land in
  [docs/RULE_SOURCES.md](RULE_SOURCES.md).

## Gambling

Shipped: land auctions (`src/engine/land_auction.ts`), random events
(`src/engine/events.ts`), crystite as a tradeable resource, the Wampus
creature mechanic (`src/engine/wampus.ts`,
`src/ui/scenes/wampus_presentation.ts`), and pub gambling for both the AI
(`src/ai/develop_ai.ts`) and the human (`src/ui/scenes/town_scene.tsx`'s pub
door: a confirm-then-dispatch flow, since `gamble` always ends the turn).
Every mechanic from the original future-fidelity list has shipped.

Re-verified 2026-07-10 (WP-1D, post WP-1B ranked-offer solvent-fallthrough
matcher in `src/engine/auction.ts`): `tests/e2e/e2e_balance_sim.mjs 100`
measured a goods dead-auction-window rate of 0.7% beginner (5/754 windows)
and 0.8% standard (8/1044 windows), both well under the 0.2 gate, with the
dead-land-auction rate still 0.0% in both modes. See
[docs/RULE_SOURCES.md](RULE_SOURCES.md), "Goods auction: bands, roles,
timing, transfer (WS-E-auction)" for the updated figures.

## UI and layout

- Slim the develop panel (duplicate hint paragraph and 3rem bottom pad, ~90px
  reclaimable) so the develop-phase board grows toward full slot size inside
  the 16:10 stage; schedule after the WP-3B walk-in-door hint rewrite lands
  to avoid colliding edits (found during WP-5A, 2026-07-10).
- Shipped: rework the goods-auction screen to a landscape, full-16:10
  horizontal price track (`src/ui/solid/auction_screen.tsx`,
  `src/style.css`). See `docs/CHANGELOG.md` 2026-07-10 (WP-6A landscape
  rotation, WP-6B full-canvas CSS, WP-6C spec update and visual acceptance)
  and the visual acceptance report at
  [docs/active_plans/reports/auction_landscape_visual_acceptance.md](active_plans/reports/auction_landscape_visual_acceptance.md).
- Optional polish: give the auction track more of the wide-viewport height
  budget at 1600x900 -- the WP-6C visual pass measured a ~16% trailing gap
  below the intent buttons at that size (`src/style.css` auction rules).
  Non-blocking.
- Shipped: audit the other phase screens (land grant, land auction, town,
  overworld, production, scoring) for the same narrow-centered-column-with-
  dead-margins problem the auction screen has, and apply the
  full-16:10-canvas layout principle from
  [HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md) to each (user request 2026-07-09).
  Land grant, land auction, and production panels widened to fill their
  slot; scoring merged to a single rule at 94cqw/84cqh. Visual acceptance
  ACCEPTED across all four panels at two viewports each. See
  `docs/CHANGELOG.md` 2026-07-10 (WP-7A..WP-7F) and
  [docs/active_plans/reports/phase_panels_visual_acceptance.md](active_plans/reports/phase_panels_visual_acceptance.md).
- Shipped: add a dedicated corral/store purchase interaction screen: walking
  into the corral now always presents an explicit modal with
  success-or-failure messaging (price, stock, funds), not just a one-line
  notice. User request 2026-07-09: "even if no mules or insufficient funds it
  should go to screen and tell me that." See `docs/CHANGELOG.md` 2026-07-10
  (WP-4A/4B `corral_purchase_panel.tsx`, WP-4C spec coverage).
- Production panel tall-viewport player-card grid wraps Player 4 alone (2
  empty slots in the last row) at some viewport sizes. Polish, found during
  the WP-7F visual acceptance pass.
- Scoring panel wide-viewport has a loose vertical gap between the event
  message and the score table. Polish, found during the WP-7F visual
  acceptance pass.
- Pub turn-end reads as a locked/hung screen (user-reported 2026-07-10):
  walking into the Pub freezes the screen and the turn does not end -- it just
  waits for the develop timer to expire. The engine is correct: the `gamble`
  action pays out from the remaining ticks and ends the develop turn
  (`src/engine/turn.ts`, the gamble case calls `endDevelopTurn`). The defect is
  UI-side in `src/ui/scenes/town_scene.tsx`: walking into the pub door sets
  `data-gamble-confirming="true"`, freezes avatar movement, and surfaces the
  "Gamble and end turn?" prompt only in the `[data-town-notice]` banner --
  unlike every other shop (corral/outfit/land/assay), the pub has no modal
  confirm panel. The frozen screen plus an easy-to-miss banner reads as a hang,
  so the player never presses Enter/Space to confirm and the turn only ends
  when the timer expires. Candidate fixes for whoever picks this up: (a) give
  the pub a proper confirm panel consistent with the other town shops (a clear
  modal with a focused "Gamble and end turn" action and a Leave/Decline
  action) instead of the notice-banner-plus-freeze affordance; (b) verify
  Escape/decline restores street movement so the player is not left frozen at
  the pub door after cancelling (check the pub decline path clears the freeze);
  (c) reconcile the tutorial hint copy ("Walk into the Pub to end your turn")
  with the required confirm step -- either the hint mentions confirming, or the
  confirm is obvious enough that walk-in-then-confirm reads as one intent. This
  is a UX/discoverability/consistency defect, not a broken dispatch: per
  [HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md)'s "Town interaction model"
  (attempt-then-confirm), the pub should require a confirm, so the fix is to
  make that confirm clear and consistent, not to auto-end on walk-in. Existing
  coverage `tests/playwright/pub_gamble.spec.mjs` already proves the confirm
  works mechanically (Enter gambles and ends the turn; Escape declines with no
  engine effect), so a fix must keep those specs green or update them
  intentionally if the affordance changes from notice to modal. Not part of the
  current town-rebuild plan's scope; file as separate follow-up work.
- Add a `data-assay-armed` attribute to `town_scene.tsx`: the E2E walker
  currently verifies assay arming via an exact `[data-town-notice]` text
  match, which is brittle if the notice string is ever reworded. Found
  during WP-8B.
- Wire `town_chrome.tsx`'s nearest-storefront field (`data-town-nearest`): it
  is still a permanently-empty WP-3B/WP-4A stub, not populated and not
  asserted by any spec (found by the town_street_visual_acceptance.md
  three-second-read checklist, WP-3C).
- Resolved (superseded by the town street rebuild): `town_doors.spec.mjs` was a
  grid-topology spec deleted at the WP-2B scene cutover, so its land-grant
  sweep-cursor parallel-load flake no longer lives here. The same environmental
  parallel-load flake class was re-observed and filed under
  `tests/playwright/corral_purchase.spec.mjs` during WP-6C triage (see the
  "Developer and testing" entry below) -- a shared land-grant bootstrap timing
  artifact under parallel worker load, not a product bug.
- Shipped: town interaction model decision (user request 2026-07-09): "in the
  1990 NES game, you walk up to the door, it opens and you walk in. If door
  is closed, then you cannot walk in. -- for our game, I can walk where ever,
  no walls." Target model (NES M.U.L.E. door behavior) is now live: buildings
  are solid (walls block walking), each shop has a door that opens on
  approach (closed door = cannot enter), walking in through the open door
  triggers the shop interaction directly with no separate action-key press,
  and the E2E walker's town-commerce executors were converted to the same
  walk-in gesture. See `docs/CHANGELOG.md` 2026-07-10 (WP-3A collision,
  WP-3B door-opens-on-approach + walk-in trigger, WP-3C walker conversion,
  WP-3D spec coverage). The corral/store purchase screen has since shipped
  too; see the "Shipped: add a dedicated corral/store purchase interaction
  screen" bullet above (M4 closed in
  `docs/archive/bug_fixes_ui_fixes_plan.md`).

## Developer and testing

- Refactor follow-up from the M6 quality review: extract a shared
  overshoot-correcting seek core from the town and overworld avatar seeks in
  `tests/e2e/walkthrough_helpers.mjs`, which duplicated about 60 lines of
  parallel halving/stall logic. Shipped: `seekAvatarToTarget` shared core landed
  WP-8A (2026-07-10). The secondary `MAX_WALK_TAPS` second-copy alignment item
  is moot -- its other copy lived in `e2e_walk_calibration.mjs`, retired
  (deleted) at WP-6D.
- Shipped: `hunt_wampus`/`assay_plot` develop plans now execute spatially
  (`executeHuntWampus`/`executeAssayPlot` in
  `tests/e2e/walkthrough_overworld.mjs`, `executeArmAssay` in
  `walkthrough_town.mjs`), replacing the earlier log-and-end-turn fallback.
  See `docs/CHANGELOG.md` 2026-07-10 (Patch 50, WP-8B).
- Walker-harness deterministic stall at `WALKER_SPEED_PX_PER_SEC = 320`
  (pre-town-rebuild grid town): seeds 1 and 3 of the walkthrough sweep used
  to stall deterministically at the counter-smithore door. RESOLVED (WP-6C,
  2026-07-11) as part of the town street rebuild: the entire grid town and
  its walker executors were replaced by the mode-composed street model
  (WP-1A-WP-6A), and the sweep is now 6/6 green (see
  [docs/active_plans/decisions/sweep_gate_demotion.md](active_plans/decisions/sweep_gate_demotion.md)
  for the current disposition). A separate walker-level bug of the same
  shape resurfaced at the new geometry and was fixed in the same pass: the
  post-panel walk-back (`walkBackToStreet`) used a fixed-tap, one-way south
  walk that could overshoot the street lane by more than
  `DOOR_OPEN_RADIUS_PX`'s vertical margin, so the next door (reproducibly
  "mining" on seed 1) never registered as open. Fixed by converging the
  walk-back onto the lane with the same gap-proportional, self-correcting
  seek `walkTownAvatarToDoorX` already used for the horizontal approach
  (new `walkTownAvatarToStreetLaneY`, `tests/e2e/walkthrough_helpers.mjs`).
- WP-8C deferred evidence: the walker-harness stall above is resolved, so
  this precondition is now met. Still open: add a forced-plan hook to the
  harness's develop-plan strategy layer (not the executor/dispatch layer)
  so `hunt_wampus`/`assay_plot` executors are provably exercised by the
  sweep counter check, rather than relying on natural single-seed
  occurrence. The hook must drive the identical production dispatch-table
  entry and executor code as a naturally generated plan -- it may only
  override which plan the strategy proposes.
- Resolved (WP-6D, 2026-07-11): `tests/e2e/e2e_walk_calibration.mjs` was
  retired (deleted) rather than rewritten. It assumed the pre-rebuild grid town
  (overworld-start develop turns, cell-based `walkToDoor`/`TOWN_COL` addressing,
  Space-key entry), all superseded by the composed-street model (corral spawn IN
  town, world-coordinate `walkTownAvatarToDoorX`, walk-in-only entry). WP-6B's
  spacing/gesture experiment already replaced its measurement role with the
  geometry-derived constants and scratch harnesses recorded in
  [docs/active_plans/audits/town_spacing_experiment.md](active_plans/audits/town_spacing_experiment.md),
  and `docs/WALKTHROUGH_GUIDE.md`'s "Calibration record" section now documents
  the retirement and the locked gap-proportional constants.
- `tests/playwright/corral_purchase.spec.mjs:267` ("corral: re-entering with
  a M.U.L.E. already in tow shows the carrying outcome") intermittently
  fails under a full parallel `npx playwright test tests/playwright/` run
  but passes 5/5 in isolation (found during WP-6C triage). Root-caused: the
  failure is NOT in this test's own walk-in/re-entry logic at all -- it is
  the shared `claimLandGrantPlotAt` bootstrap helper (used identically by
  every test in the file) timing out waiting for the land-grant sweep
  cursor to reach its target cell (`sweep cursor never reached (2, 3)`,
  stuck at `(4, 4)`, 20s budget exceeded). The land-grant sweep cursor is a
  real-time animation with a fixed wall-clock poll, and under full-suite
  parallel worker CPU contention it can simply run too slowly to reach the
  target within the timeout -- reproduced twice in a row under load, clean
  in isolation both times. This is an environmental parallel-load flake in
  a pre-existing, non-town helper (land grant, not town entry/exit/coords/
  interactions), not a race in this test's own timing/waits, so it was
  documented rather than "fixed" by loosening the spec's wait (which would
  only mask CPU contention, not address it) or touching production code.
