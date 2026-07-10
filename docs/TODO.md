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

Re-verify the `deadAuctionWindowRate` figure above via the balance sim before
restating it -- auction mechanics have changed substantially since it was
recorded (crystite added to the goods auction, store-only-buyer market).

## UI and layout

- Rework the goods-auction screen (`src/ui/solid/auction_screen.tsx`) to fill
  the full 16:10 canvas. The price track, participant list, and trade log
  currently render as a narrow centered column with large blank margins on
  both sides; spread these panels to use the available width and height
  instead. See [HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md) for the general
  full-canvas layout preference (user request 2026-07-09). Chosen direction
  (user request 2026-07-09): rotate the auction arena to a landscape,
  horizontal price track. Buyers advance from the left as they raise bids,
  sellers advance from the right as they lower asks, and trades fire where
  the two sides meet in the middle; store buy and sell prices anchor the
  left and right ends of the track. Participant readouts sit above and below
  the track. Sitting-out players keep their sideline spectator slot ("like a
  tennis line judge") from the in-progress sit-out coherence fix; the
  rotation must preserve that slot. Mechanics are unchanged -- this is
  presentation only, per the rules-vs-UI split in
  [HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md).
- Audit the other phase screens (land grant, land auction, town, overworld,
  production, scoring) for the same narrow-centered-column-with-dead-margins
  problem the auction screen has, and apply the full-16:10-canvas layout
  principle from [HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md) to each (user request
  2026-07-09).
- Add a dedicated corral/store purchase interaction screen: walking into the
  corral should always present an explicit screen or dialog with
  success-or-failure messaging (price, stock, funds), not just a one-line
  notice. User request 2026-07-09: "even if no mules or insufficient funds it
  should go to screen and tell me that." A SolidJS `ErrorBoundary` and the
  existing notice line already cover the crash/feedback floor; this item is
  the fuller interaction screen on top of that floor.
- Town interaction model decision (user request 2026-07-09): "in the 1990
  NES game, you walk up to the door, it opens and you walk in. If door is
  closed, then you cannot walk in. -- for our game, I can walk where ever,
  no walls." Target model (NES M.U.L.E. door behavior): buildings are
  solid -- walls block walking; each shop has a door that opens when the
  player walks up to it (closed door = cannot enter); walking in through the
  open door triggers the shop interaction (the purchase screen/feedback from
  the bullet above). No separate action-key press needed to enter. Current
  state diverges on both counts: the town has no collision at all (the
  player walks anywhere, through buildings), and shop interaction requires
  an undocumented Enter/Space press at the door. Implementation note: this
  changes the E2E walker's town-commerce driver (it currently presses Enter
  at doors), so schedule the door-model work after the walkthrough harness
  plan closes; the walker's strategy/mechanics separation means only the
  gesture layer changes. Interim: a hint-string fix naming the Enter/Space
  key ships now as a stopgap until the door model lands. See
  [ROADMAP.md](ROADMAP.md) "Known bugs and gaps" for the full writeup.

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
