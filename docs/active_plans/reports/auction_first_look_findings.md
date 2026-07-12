# Auction first-look findings

First live capture of the rebuilt full-stage goods auction
([auction_native_recompose.md](../active/auction_native_recompose.md)),
reviewed directly by the manager. Frames were captured at both supported
viewports -- **1024x640** (the binding minimum) and **1280x800** (the nominal
target) -- and live at `test-results/eyes_auction/` as
`auction_declare_*.png`, `auction_live_*.png`, and `auction_trade_*.png`.
Those files are under a gitignored `test-results/`, so they are referenced by
path here rather than linked.

This is a first-look defect log, not the M6 visual gate. It exists so that
what was seen in these frames survives into the packages still in flight
(WP7) and into the gate that judges them (WP8b-acceptance), instead of being
rediscovered later.

## Headline: the rebuild works

The composition the plan set out to prove is on screen. At both viewports the
auction fills the whole stage: no dead band, no portrait column, no
letterboxing. The price runway is the dominant region; the store rails bound
it left and right; the player lanes read as rows; the dock carries per-player
money, quantity, and traded count; a price ruler runs along the bottom. Text
is legible at the binding minimum viewport.

Record this first, because it is the load-bearing result. Everything below is
a defect against a design that is fundamentally working, not evidence against
the design.

## Standing of these findings

Findings 1-3 were judged by the **manager** to be genuine **DEFECTS**. The
capture operator had initially characterized them as soft rough edges or
polish. That disagreement is preserved deliberately: the operator's framing
would have let all three ship, and the reason they are defects is that each
one breaks the screen at the moment the screen is supposed to be doing its
job. Treat them as required fixes, not as a nice-to-have list.

Finding 4 is an **observation**, explicitly not a defect, and must not be
"fixed" before the gate rules on it.

## Finding 1 (defect) -- "CROSSED" label collides with a player avatar

In `auction_live_1024x640.png` the green **CROSSED** text renders directly on
top of the pink player's avatar at bottom-center. Both are garbled: the label
is unreadable over the avatar art, and the avatar is unreadable under the
label.

This fires at the crossing moment -- the single instant the screen most needs
to be readable, because it is when a trade resolves. A label that only
appears at the dramatic beat, and that lands on top of a participant in that
beat, fails exactly when it matters.

- Likely owner: the bid/ask crossing treatment in
  [src/ui/scenes/auction_arena.tsx](../../../src/ui/scenes/auction_arena.tsx).
- Required: a placement that **cannot** overlap a lane occupant, or an
  avatar-aware offset. A placement that merely usually misses is not a fix;
  the avatars converge on the crossing price by construction, so "usually"
  will collide again.

## Finding 2 (defect) -- tutorial tooltip crowds the going-price readout

A large light tooltip panel occupies the top-left quadrant and sits
immediately against the big `$67 LAST TRADE` / GOING PRICE readout in the top
band. The going price is meant to be the loudest element on the screen.
Instead the header reads as two competing blocks of roughly equal weight.

This is a **composition problem in the top band**, not a legibility failure of
either element on its own -- each is individually readable. The defect is that
the band no longer has a single dominant element, so the readout the whole
screen is organized around loses its primacy to a transient hint.

- Scope: the top band's layout, and the tutorial hint's placement/size within
  it.

## Finding 3 (defect) -- the trade sparkle is spatially orphaned

In the live and trade frames a gold sparkle appears floating in empty runway
space, well clear of any avatar. It does not visibly originate from a seller,
and it does not visibly land on a buyer.

A trade effect that is not anchored to its participants communicates nothing.
It reads as decoration on a screen whose entire purpose is to make the trade
legible: who sold, who bought, at what price.

- Owner: this is squarely in the **WP7 trade-fx** package's remit -- goods
  should visibly travel seller -> buyer, with a flash at the buyer. WP7 is in
  flight as this is written, so record it as an **input to that work**.
- Gate: the M6 visual gate must confirm this was fixed, not assume it.

## Finding 4 (observation, NOT a defect) -- sparse runway at the crossing

At the crossing, all four avatars converge into a single vertical column at
the crossing price, leaving large empty regions to the left and right of that
column.

**This may be correct.** A converged market genuinely means everyone is at the
same price, and the geometry may simply be telling the truth about that.

Open question for the visual gate, to be answered rather than prejudged: does
the widest region on screen being mostly empty at the dramatic moment undercut
the supply-and-demand story the screen is teaching, or is it the honest picture
of convergence? Do not "fix" this before the gate rules on it; scattering the
avatars to fill space would make the picture prettier and less true.

## Carried-forward risks (self-reported by the arena implementer)

These reach the visual gate as open questions. Both are the arena
implementer's own flags, recorded here so they are not lost between packages.

### Sat-out players are distinguished only by subtractive cues

Sat-out players park just inside the runway's cheap edge, dimmed, tagged
**OUT**, and carrying no price. A genuine floor-priced **BUYER** stands
nearby, in the same neighborhood of the runway.

The sat-out player is therefore distinguished from an active floor buyer only
by what it **lacks**: it is dimmer, it is tagged, it has no price. Open
question for the gate: is that distinction legible at a glance at 1024x640, or
can a sat-out player be mistaken for an active buyer at the floor? Subtractive
cues are the weakest kind at small sizes, which is exactly the condition the
binding viewport imposes.

### Rail crate stacks scale against a running maximum

The rail crate stacks scale against a **running max** of `storeStock` seen so
far this window, because the payload carries no reference maximum.

Consequence: the same stack height can represent different quantities at
different moments **within a single window**. The scale silently redefines
itself as the window progresses.

On a screen whose stated purpose is to teach supply and demand by making
quantity visible, a quantity axis that rescales under the player is worth
scrutinizing: a stack that stays the same height while stock changes, or
changes height while stock does not, teaches the opposite of the intended
lesson. Open question for the visual gate, and possibly a **payload addition**
(a reference maximum) rather than a rendering fix.

## Measurement correction: dock text size

The player dock's smallest text was reported by its implementer as **15px at
1024x640**, a 25% margin over the plan's 12px floor.

A reviewer established that the 15px figure was a
`getBoundingClientRect().height` -- a glyph bounding box inflated by a
descender -- **not a font size**. The actual CSS is `font-size: 12px`,
rendering at about **12.8px** at the stage's uniform 1.0667x scale. The true
margin over the 12px floor is about **7%**, not 25%.

Still passing, but thin. Consequences:

- The **M6 visual gate must MEASURE** dock text at 1024x640 rather than trust
  a reported number.
- Any future change that shrinks dock text has almost no headroom to spend.

Note the pattern: this is the **second time in this rebuild** that a plausible
measurement turned out to be measuring the wrong thing (the first was the
composition mock's circular ratios, recorded in
[auction_composition_mock_measurements.md](auction_composition_mock_measurements.md)).
A number that looks right and is produced by the same agent that built the
thing is not evidence. Measure at the binding viewport, and state what was
measured.

## Required checks for the M6 visual gate

1. Finding 1 fixed: **CROSSED** cannot overlap a lane occupant at the crossing.
2. Finding 2 fixed: the going price is the dominant element in the top band.
3. Finding 3 fixed (WP7): the trade effect visibly travels seller -> buyer with
   a flash at the buyer.
4. Finding 4 ruled on: sparse runway at convergence is either accepted as
   honest or addressed -- with the reasoning recorded.
5. Sat-out vs floor-buyer distinction judged at 1024x640.
6. Crate-stack scale judged; decide whether the payload needs a reference
   maximum.
7. Dock text **measured** (not reported) at 1024x640 against the 12px floor.
