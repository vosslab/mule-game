# Auction readout variant decision (WP-6A)

Date: 2026-07-10

## Question

For the landscape rotation of the auction arena (WP-6A), where should the
per-player readout information (color swatch, role, price) sit relative to
the horizontal price track, and does the choice need an `ArenaPanel` DOM
change?

## Decision: variant A, per-player readout strip

The chosen layout places a per-player readout strip (color swatch + role +
price, stable column-aligned rows) ABOVE the horizontal track, and the
trade-log strip BELOW the track. No `ArenaPanel` DOM change was needed --
the existing element order already placed `PriceReadout` above the track and
`TradeLog` below it, so the landscape rotation reuses that order directly.

## Rejected: variant B, rail labels on avatars

Variant B would have floated a label above each avatar at that avatar's live
x position along the rail. This was rejected on the measurable readability
criterion from the plan's gates section: near a trade, buyer and seller
avatars converge to the same x position, so per-avatar labels overlap
exactly at the point where trade legibility matters most. The role
assignment also changes per good, so a role-split label strip would
destabilize identity tracking as players swap between buyer and seller
across resources.

Variant A avoids both failure modes: participant identity, bid/ask price,
and trade state stay readable in a fixed column-aligned strip that never
overlaps the track, regardless of where avatars converge.

## Constraint noted

Per-participant funds and stock are not available on `AuctionParticipant`
(only the aggregate `payload.storeStock` field is exposed), so neither
variant can show a per-player funds/stock readout. This is a data
availability gap, not a layout choice, and applies equally to variant A and
variant B.

## Status

Implemented and reviewed PASS 2026-07-10 (geometry, engine-untouched,
sideline, and citation criteria confirmed). WP-6C's visual acceptance report
judges the rendered result at 16:10.
