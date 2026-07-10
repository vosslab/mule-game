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
- Add a seller-out-of-goods store fallback: when a human or AI seller runs
  out of a good mid-auction, decide whether the store should step in as a
  fallback counterparty rather than leaving the window to time out.
- Root cause found by the walkthrough-harness work: `bestBid`
  (`src/engine/auction.ts:426`) and `bestAsk` (`src/engine/auction.ts:455`)
  each select a single best offer, and `resolveTrade`
  (`src/engine/auction.ts:663`) does not fall through to the next-best
  solvent participant, so an insolvent top bidder blocks solvent lower
  bidders and the store's own bid from trading. This is the "limited trade
  count" quirk `tests/test_auction_termination.mjs` pins around but does not
  fix. See [docs/CHANGELOG.md](CHANGELOG.md) (2026-07-09, Decisions and
  Failures, walkthrough-harness Patch 9 fix round) for the full detail, and
  [ROADMAP.md](ROADMAP.md) "Known bugs and gaps" for the full writeup with
  verified line numbers and a suggested fix approach.

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
- Add a `data-assay-armed` attribute to `town_scene.tsx`: the E2E walker
  currently verifies assay arming via an exact `[data-town-notice]` text
  match, which is brittle if the notice string is ever reworded. Found
  during WP-8B.
- `town_doors.spec.mjs`'s land-grant sweep-cursor timing test flakes under
  full parallel suite load (passes isolated and repeated runs; two sightings
  2026-07-10). Harness robustness candidate, not a product bug.
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
  `docs/active_plans/active/bug_fixes_ui_fixes_plan.md`).

## Developer and testing

- Refactor follow-up from the M6 quality review: extract a shared
  overshoot-correcting seek core from `walkTownAvatarToDoor` and
  `walkOverworldAvatarToCell` in `tests/e2e/walkthrough_helpers.mjs`, which
  duplicate about 60 lines of parallel halving/stall logic. Also align
  `tests/e2e/e2e_walk_calibration.mjs`'s locally redefined `MAX_WALK_TAPS`
  with the helpers' constant instead of keeping a second copy.
- Walker follow-up: `hunt_wampus`/`assay_plot` develop plans currently
  log-and-end-turn (an agreed fallback, since there is no spatial executor
  for them yet); implement executors if sweep placement coverage ever
  thins. See [ROADMAP.md](ROADMAP.md) "Known bugs and gaps" for the full
  writeup.
