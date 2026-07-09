# TODO.md

Backlog scratchpad for small tasks without timelines. See
[docs/CHANGELOG.md](CHANGELOG.md) for what has already shipped and why.

## Auction fidelity

- Tune the auction trading floor: the 30-game headless balance sim still
  shows a `deadAuctionWindowRate` of 0.79 (about 79% of individual per-good
  auction windows close with no trade) even after the AI walk-direction fix.
  Investigate whether `AUCTION_TICKS` (20) needs to grow or
  `AUCTION_PRICE_STEP` (1) needs to grow relative to the
  `AUCTION_PRICE_FLOOR`/`AUCTION_PRICE_CEILING` band width in
  `src/engine/constants.ts`, so bid and ask have enough ticks to cross before
  timeout.
- Add a seller-out-of-goods store fallback: when a human or AI seller runs
  out of a good mid-auction, decide whether the store should step in as a
  fallback counterparty rather than leaving the window to time out.

## Economy fidelity

- Add the learning-curve production bonus: per mulereturns.com, a colony-wide
  bonus of +1 per 3 same-resource plots should apply; not yet modeled in
  `src/engine/economy.ts`.
- Add a M.U.L.E. store stock cap: planetmule.com documents the store opening
  with 14 M.U.L.E. units, but `src/engine/store.ts` currently sells
  M.U.L.E.s on demand with no stock cap (see the `STORE_OPENING_STOCK`
  comment in `src/engine/constants.ts`). Also model the smithore-to-M.U.L.E.
  store rebuild economy (the store consumes smithore to restock M.U.L.E.s).
- Add a money-scaled develop timer: develop-phase tick budget should scale
  with a player's money per the original game's rules; current v1 uses a
  fixed budget.

## Future fidelity plan (land auctions, events, crystite, wampus, gambling)

- Land auctions (bidding on land plots directly, distinct from the goods
  auction).
- Random events (for example pirate raids, crystite finds).
- Crystite as a tradeable resource.
- The Wampus creature mechanic.
- Gambling / casino side mechanic.

These are larger scope than a single backlog bullet each; group them under a
future fidelity plan document when work on any of them starts.
