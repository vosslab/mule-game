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
