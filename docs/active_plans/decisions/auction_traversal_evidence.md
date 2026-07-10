# Auction traversal evidence (WP-1A)

Date: 2026-07-10

## Question

For the M1 auction engine fix (an insolvent top bidder must not block other
solvent trades), how does the original M.U.L.E. select the NEXT eligible
buyer/seller when the current one cannot complete a trade -- traversal
order, tie handling, and store position in the queue?

## Primary authority: 1983 rules and prose documentation

`OTHER_REPOS/mule_rules.md` (C64-Wiki article, "Trading Stage" section)
describes the trading stage as a live, continuous simulation, not a
discrete match list:

> "The players can now move their figures towards each other, depending on
> whether they want to sell or buy. Once the lines of two figures touch,
> they have a deal at the displayed price and they trade units of the
> resource until either one player removes his figure or the buyer has run
> out of money or the seller has run out of resources."

There is no mention of a queue, a ranked bid/ask list, or an algorithm for
choosing "the next" buyer or seller. The mechanic is spatial: figures walk
toward a shared price line, and whichever figures' positions coincide are
trading. A participant who cannot afford to continue simply cannot advance
further along the price line; the prose describes this as running out of
money, not as being skipped over by a matching process.

`OTHER_REPOS/mule_document.html` ("Trading" section, `#Trading`) gives the
precise reverse-engineered eligibility and pricing rules used by
`docs/RULE_SOURCES.md`:

> "L'enchere a lieu si: au moins un des joueurs est Seller OU le store a au
> moins 1 unite en stock." (The auction runs if at least one player is a
> Seller OR the store has at least 1 unit in stock.)
>
> "A la fin de chaque enchere, le prix du bien est mis a jour si au moins
> une unite a ete vendue. Le nouveau prix est egal au prix moyen des unites
> vendues." (At the end of each auction, the price is updated if at least
> one unit was sold. The new price equals the average price of units sold.)

The "Purchase and sale price" section (`#PurchaseAndSalePrice`) gives the
store spread table used in the draft `RULE_SOURCES.md` entry below (food and
energy: buy = current price - $15, sell = buy price + $35; smithore: sell =
buy price + $35; crystite: sell = buy price + $140, price rounds to the
nearest lower multiple of 4). "Store setup" (`#StoreSetup`) gives store
initial quantities and prices. Neither section, nor "Declaring"
(`#Declaring`, which only assigns each player to Buyer/Seller role), nor any
other section of `mule_document.html`, describes a traversal order, a tie
rule, or where the store sits in a queue of participants. The document is
silent on discrete matching because the original auction has no discrete
matching step to describe.

## Supporting evidence: planet_mule implementation (subordinate to the above)

The decompiled Java in `OTHER_REPOS/planet_mule/data_decompiled/` confirms
the prose reading and explains mechanically why no traversal/tie-break logic
exists to find:

- `model/Auction.java` `setBuyersAndSellers` partitions all local and remote
  players into two flat lists, `buyers` and `sellers` (declared role only,
  from `player.isBuyer()`). There is no sorting by price, by player id, or
  by rank at this step, and the store is not a member of either list -- it
  is folded in separately as a price-band clamp (see below).
- `model/AuctionState.java` `setTick` is the money-solvency logic. It runs
  per player, every animation tick: a buyer's position is clamped by
  `auctionLimits.priceToMaxTick(player.getMoney())`, and if the resulting
  tick falls below the walkable range the player is unilaterally set to
  `inAuction = false` (walked out of the auction on their own). There is no
  step where the game looks at "the next buyer in line" -- an insolvent
  buyer removes themselves from further consideration by hitting their own
  budget ceiling.
- `model/AuctionLimits.java` `calcBuyAndSellTicks` computes the walkable
  price band each tick by taking the maximum tick among buyers still
  `isInAuction()` (`auctionBuyTick`) and the minimum tick among sellers
  still `isInAuction()` (`auctionSellTick`), i.e. best-bid vs best-ask, not
  a matched pair list. The store is folded into this same band via
  `shop.getBuyPrice(resource)` / `shop.getSellPrice(resource)` as one more
  clamp on the min/max tick, not as a queued participant.
- `controller/AuctionController.java` `calcTargetLimits` builds the buyer
  and seller arrays by walking `model.getPlayersInRankOrder()` in reverse.
  This affects animation/network ordering only; it has no effect on who
  trades with whom, since trading is decided purely by the continuous
  tick/price convergence above, not by iterating pairs.
- `model/Shop.java` `getBuyPrice`/`getSellPrice` return the same spread
  values documented in `mule_document.html`, confirming the store
  participates as a price-band clamp, consistent with the prose's "the
  store is both buyer and seller" framing.

None of these four files contain a discrete "find next eligible
counterparty" loop, a tie-break comparator, or any explicit ordering of the
store relative to human/AI participants. The original game has no analogue
to a discrete matcher at all -- it is a continuous best-bid/best-ask
convergence where an insolvent participant is removed from the aggregate
(`isInAuction() == false`) by their own budget clamp rather than by another
participant's turn being skipped.

## Conclusion

**No direct analogue exists.** The 1983 original's trading stage is a
continuous spatial simulation (figures physically walk toward a shared price
line and an insolvent figure withdraws under its own budget clamp), not a
discretely matched buyer/seller list. The modern engine's discrete matcher
in `src/engine/auction.ts` therefore needs a documented house rule, as the
plan anticipated; this package's evidence gathering does not force a
historical answer because none exists at that level of detail.

That said, the aggregate best-bid/best-ask computation in
`AuctionLimits.calcBuyAndSellTicks` (max tick among live buyers, min tick
among live sellers) is directionally consistent with, and lends indirect
support to, WP-1B's provisional house rule: ordering bids by price
descending and asks by price ascending mirrors "always match the best
available bid against the best available ask." The provisional rule should
be adopted with two refinements grounded in this evidence rather than
invention:

1. **Solvency removal, not solvency skip.** Model an insolvent participant
   as dropping out of the live buyer/seller set entirely for the remainder
   of that resource's auction (as the original's `isInAuction() = false`
   clamp does), rather than merely being passed over for one match and
   reconsidered later. WP-1B's "skip and continue scanning" behavior is
   compatible with this as long as a participant who fails solvency is not
   revisited in the same trading pass.
2. **Store position is a clamp, not a queue slot.** The original never
   treats the store as an ordered participant to be scanned before or after
   players; it is folded in as one more bound on the tradable price band
   (buy price and sell price acting as ceiling/floor on the tick range,
   gated by `shop.getResource(resource) > 0` for whether the store can
   still sell). WP-1B's "skip store-to-store" rule is a reasonable modern
   substitute, but the evidence does not support giving the store a fixed
   rank position among bidders/askers by playerId; it should instead act as
   a fallback counterparty whenever a player-to-player match is unavailable
   at a given price, consistent with "the store participates as both buyer
   and seller within price limits."

The evidence found no tie-break rule (by playerId or otherwise) in either
authority. WP-1B's "lowest playerId" tie-break is therefore an
uncontradicted house-rule addition, not something to revise based on this
package's findings.

## Draft RULE_SOURCES.md entry (for WP-1B to paste)

```markdown
### Auction traversal and store spread

- **Rule**: When a trading-stage auction runs, the store participates as
  both buyer and seller within price limits and sells only the stock it
  has accumulated from prior rounds; a trade run continues until the buyer
  runs out of money, the seller runs out of goods, or a participant
  withdraws. The 1983/1990 sources describe this as a continuous
  best-bid/best-ask convergence (figures walking toward a shared price
  line), not a discrete ranked-list match. The modern discrete matcher
  therefore uses a documented house rule: bids ordered by price descending
  then lowest playerId; asks ordered by price ascending then lowest
  playerId; scan bid-major, ask-minor, skip store-to-store, execute the
  first crossed pair passing solvency; a participant that fails solvency is
  removed from the remaining scan for that resource's auction rather than
  revisited.
- **Store spread**: food and energy buy price = current price - $15, sell
  price = buy price + $35; smithore sell price = buy price + $35; crystite
  sell price = buy price + $140 (crystite price rounds to the nearest lower
  multiple of 4).
- **Auction eligibility and closing price**: the auction for a resource
  runs while at least one player is a seller, OR the store holds at least 1
  unit in stock. At the end of the auction, if at least one unit sold, the
  resource's price updates to the average price of the units sold.
- **Sources**:
  - `OTHER_REPOS/mule_rules.md` ("Trading Stage" section): prose
    description of figures walking toward each other and trading until a
    party withdraws, runs out of money, or runs out of goods.
  - `OTHER_REPOS/mule_document.html` `#PurchaseAndSalePrice` (store buy/sell
    spread table), `#Trading` (auction-runs-while and closing-price
    rules), `#StoreSetup` (store initial quantities and prices).
  - `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/controller/AuctionController.java`,
    `.../model/Auction.java`, `.../model/AuctionState.java`,
    `.../model/AuctionLimits.java` (implementation evidence, subordinate to
    the rule documents above): confirm the original has no discrete
    buyer/seller matching loop -- solvency is enforced per player via a
    tick/budget clamp that removes an insolvent participant from
    `isInAuction()`, and the tradable price band is the max tick among live
    buyers vs the min tick among live sellers, with the store folded in as
    a price clamp via `.../model/Shop.java` `getBuyPrice`/`getSellPrice`.
```
