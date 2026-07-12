# Auction visual acceptance (M6 visual gate)

Verdict on the rebuilt full-stage goods auction
([auction_native_recompose.md](../active/auction_native_recompose.md), work package
WP8b-acceptance), judged from the 14 frames the beat-capture driver produces.

## Overall verdict: FAIL

The **composition** passes. The **rendering on top of it** does not.

The recompose worked: the auction now fills the 16:10 stage, the price axis runs
left to right, players own lane rows, the store rails bound the runway, and the
dock carries every number with its owner. Measured, the runway is 56.0% of the
frame and the trailing dead band is 4.0% of stage height, against 16.3% on the
screen the user called unusable. The dock is genuinely good: every value clears
the house contrast target, and the lane-color chain (dock stripe -> badge ->
avatar) makes ownership instant.

It fails on a single defect class, repeated in six places: **labels are drawn at
positions occupants provably occupy, with no collision avoidance.** Every one of
them fires at the moment the screen is supposed to be doing its job -- the
crossing, the trade, the sit-out. Two of the three first-look DEFECTS are
unfixed, and my own pass found three more instances of the same bug plus three
text elements below the WCAG AA contrast floor.

None of this is a composition problem. The geometry is right. The fixes are
local: place labels where occupants cannot be, fix one CSS transform, and give
three text elements a legible color.

## What was run

```
node --import tsx tests/e2e/e2e_auction_beat_capture.mjs
```

```
==> viewport 1024x640: session A (speed=8)
==> captured 01_status_accounting_1024x640.png
==> captured 02_declare_1024x640.png
==> captured 03_live_motion_1024x640.png
==> captured 04_trade_feedback_1024x640.png
==> captured 06_finished_1024x640.png
==> captured 07_skipped_window_1024x640.png
==> viewport 1024x640: session B (speed=2)
==> captured 05_sitout_fastforward_1024x640.png
==> viewport 1280x800: session A (speed=8)
[... same seven ...]
==> all 14 beat screenshots captured in output_smoke/auction_beats
DRIVER_EXIT=0
```

Exit 0, all 14 files. Frames re-captured for this report; nothing here is judged
from a stale image.

Legibility is judged at **1024x640**, the binding minimum. 1280x800 is a sanity
render and is called out only where it differs (it differs once, and for the
worse).

## Provenance: the tree that was judged

`src/ui/scenes/auction_dock.tsx` was being edited by another lane during this
gate, so the state under judgement is pinned rather than assumed:

| | |
| --- | --- |
| `auction_dock.tsx` md5 | `63807543e223baae08d2290b74ba2e97` |
| `auction_dock.tsx` mtime | 2026-07-11 14:32:21 |
| `dist/` built | 2026-07-11 14:34:02 |
| Frames captured | 2026-07-11 14:34:12 - 14:35:00 |

The build followed the last dock edit, and the frames followed the build, so the
verdict is rendered against a stable, fully-built tree. The checksum is unchanged
as of filing.

That ordering means the other lane's change -- `data-col="money|units|traded"` on
the dock's numeric `<text>` elements, so tests address columns by contract rather
than by DOM position -- **was already in the tree I judged**. My instrument read
those very elements. So its "attribute-only, must not alter appearance" claim is
checkable here rather than taken on faith, and it holds, on two independent
grounds:

- **Source**: the diff adds only `data-col` attributes and a comment block. Every
  touched `<text>` keeps an identical `class`, `x`, `y`, and `text-anchor`. Data
  attributes do not render.
- **Rendered**: the dock in these frames measures clean -- money 14.93px at
  12.39:1, units/traded 13.87px, column header 13.33px, role text 12.80px at
  9.38:1, every value right-aligned in its column (`_crops/dock_column.png`).

**No appearance change. Not a defect.** The dock remains the strongest region on
the screen.

## Instruments

Every number below is mine. Nothing is taken from a prior report -- the plan
records two prior confident measurements that measured the wrong thing.

- **Font size**: computed `font-size` x the element's `getScreenCTM()` scale.
  That product is the glyph size in CSS px. A `getBoundingClientRect().height`
  is NOT a font size -- it is inflated by descenders, which is exactly how the
  false "15px" entered the record (see check 7).
- **Overlap**: `getBoundingClientRect()` on both elements, intersected.
- **Contrast**: colors sampled out of the rendered PNG, not from declared CSS.
  Declared fills lie here: the sat-out OUT tag's fill is `rgb(199,199,230)`, but
  it renders through a 0.34 group opacity and a player actually sees
  `rgb(93,93,121)`. Sampled and cross-checked against the compositing
  arithmetic; the two agree to within one 8-bit step.

## The seven required checks

| # | Check | Verdict |
| --- | --- | --- |
| 1 | CROSSED cannot overlap a lane occupant | **FAIL -- not fixed** |
| 2 | Going price dominant in the top band | **FAIL -- not fixed** (recharacterized) |
| 3 | Trade effect travels seller -> buyer | **FAIL -- half fixed** |
| 4 | Sparse runway at convergence | **RULED: honest. Accept. Do not change.** |
| 5 | Sat-out vs floor-priced buyer at 1024x640 | **FAIL -- worse than the question assumed** |
| 6 | Crate-stack running-max scale | **FAIL -- and the crates are near-invisible** |
| 7 | Dock text MEASURED at 1024x640 | **PASS -- 12.80px, 6.7% over the floor** |

### Check 1 -- CROSSED still lands on an avatar. FAIL.

Frame: `04_trade_feedback_1024x640.png` (and the 1280x800 twin).

`.auction-cross-caption` occupies (540.0, 529.0)-(633.3, 547.0). The lane-4 pink
avatar occupies (589.4, 459.6)-(627.8, 544.0). They intersect over **38.4 x 15.0
px** -- the label's full width across the avatar, the avatar's bottom 18%. The
crop shows the letters "O-S-S" cut through by the avatar's body and feet. Both
are garbled, exactly as the first look reported.

This is the same defect, in the same place, unchanged. The first look already
warned that "a placement that merely usually misses is not a fix; the avatars
converge on the crossing price by construction." Nothing was done.

**Fix**: the caption is anchored to the crossing x, which is by construction
where avatars stand. Move it out of the lane band entirely -- into the top band
next to the going price, or onto the price-ruler strip below the lanes (y >= 553,
which is already reserved for ruler labels and holds no occupant). Do not
"offset it a bit."

### Check 2 -- the going price is not the top band's single dominant element. FAIL.

Frames: all 7, both viewports. The tutorial hint is present in every captured
beat.

I have to correct the first look's characterization before agreeing with its
conclusion. The hint panel is **not** "a large light tooltip" -- sampled, its
plate is dark navy `rgb(34,34,58)`, the same value family as the band. And the
going price is not out-sized: at 46.93px, weight 800, gold `rgb(255,210,63)` at
10.71:1, it is the largest and only gold glyph in the band, and it is centered.
On glyph weight alone, it holds its own.

It still fails, on two grounds that do not depend on taste:

- **Hidden content.** The hint's box is (8, 8)-(460.0, 95.8). The dock column
  header (`$ Qty Trd`) starts at y=92.6. The hint occludes it. At 1024x640 it
  shaves the header's top 3.2px; at **1280x800 it cuts the header in half** --
  see `_crops/dockheader_1280.png`, where only the bottom halves of the glyphs
  survive. Hidden content is a specific usability failure, which is the bar
  `docs/FUN_VIBES_DESIGN_STYLE.md` sets before a visual finding counts. This one
  clears it.
- **It is a 44-word paragraph.** `docs/FUN_VIBES_DESIGN_STYLE.md` lists "Long
  help text. If a kid has to read a paragraph to learn the UI, the UI is wrong"
  under *what goes quiet*, and Layer 1 repeats it. Five lines of prose occupying
  41.3% of the top band, ending 6.7px from the going price, is the thing that
  rule names.

**Fix**: shrink the hint to one line and move it out of the top band -- the
runway's empty upper-left region is free at tick 0, or put it on the timer strip
in place of the (currently illegible) intent legend. Auto-dismiss it after the
first commit. Whatever it becomes, it must not overlap the dock header at either
viewport.

### Check 3 -- the trade effect: goods anchored, flash orphaned. FAIL.

Frames: `04_trade_feedback_*.png`, `06_finished_*.png`.

The **flying goods glyph is fixed** and correct: measured at (601.96, 371.30),
which is on the green seller's avatar (589.4-627.8, 340.1-424.5). Supply visibly
leaves the seller. Credit where due.

The **flash burst is not fixed**, and I found the root cause. In
`04_trade_feedback_1024x640.png` the gold sparkle renders at center (880.1,
234.2). The nearest avatar is 309 px away. It sits on a lane boundary in empty
runway, touching nothing -- see `_crops/orphan_sparkle.png`.

This is **not** a bad anchor. The code anchors it correctly. Probed live at the
instant of the trade:

```
flash attrs:            x=504.46  y=126  size=36     (SVG user units)
intended screen center: (557.3, 153.6)   <- the buyer's avatar, correct
rendered box center:    (880.1, 234.2)   <- 323 px away
computed transform:     matrix(1.6, 0, 0, 1.6, 0, 0)
transform-box:          fill-box
transform-origin:       18px 18px
```

The pop's `scale(1.6)` carries **no translation term**. On a `<use>` positioned
by `x`/`y` attributes, `transform-box: fill-box` resolves the origin to (18,18)
in the element's *local* space -- it does not account for the `x`/`y`
placement -- so the scale happens about a point near the SVG origin and throws
the burst outward in proportion to how far right the buyer is. Predicted left
edge under that model: `18 + (504.46 - 18) x 1.6 = 796.3` user units. Measured:
**796.3**. Exact.

The consequences scale with price. In `06_finished_1024x640.png`, where the buyer
is at the ceiling, one burst renders at x=1199-1248 -- **entirely off the
1024px-wide stage.** It is not merely unanchored; it is invisible.

`src/style.css:2353` carries a comment claiming this exact trap was avoided
("scale grows from the flash's own center, not the SVG viewport's (0,0) origin").
The comment is wrong for `<use>`. The reduced-motion path has no animation and is
therefore correct, which is why this never showed up in the reduced-motion tests.

**Fix**: stop routing the pop through a CSS transform on the `<use>`. The arena
already positions avatars correctly with `transform` attributes
(`writeAvatarTransform`). Do the same here: set
`transform="translate(cx,cy) scale(s)"` on the flash and drive `s` from the
`advance(deltaMs)` loop `auction_trade_fx.ts` already runs for the flying goods.
That removes CSS transform-box resolution from the picture and makes the pop
assertable in a node test.

### Check 4 -- sparse runway at convergence. RULED: this is honest. Do not change it.

At the crossing, three active avatars stand within a 44px column while the runway
spans 768px. 89% of the runway width holds no avatar. The open question was
whether that undercuts the supply-and-demand story.

**It does not. Accept it, and do not scatter the avatars.** Three reasons:

1. **The geometry is telling the truth.** A cleared market *is* everyone at one
   price. x = price is the screen's founding contract; the moment we move an
   avatar off its price to fill space, the axis means nothing and every other
   reading on the screen becomes a guess.
2. **The empty runway is not empty of information.** Those regions are the prices
   nobody will trade at. The crossing band, the bid/ask lines, the price ruler
   and the store rails all still occupy them. "Nobody is over here" is the
   supply-and-demand lesson, not a gap in it.
3. **Convergence is the last frame of the story, not the story.** At tick 0
   (frames 01-03) buyers stand at the cheap wall and sellers at the expensive
   wall, and the runway's full width is in play. The teaching happens in the
   walk. Judging the composition on its photo-finish would be judging a race by
   its final frame.

**But the reason convergence *feels* wrong is real, and it is not sparseness.**
It is that the one column that is *not* empty is where five labels pile onto the
same pixels. At the crossing in `06_finished_1024x640.png`, within roughly 150 x
100 px: the BID chip is **73.9% covered by the ASK chip** (plates at
846.9-945.0 and 872.5-970.6, identical y) so it reads as "BI" with its price
hidden; the avatar's `$85` tag collides with the "EXPENSIVE" wall label; and the
avatar sits under both. See `_crops/bid_ask_collision.png`.

The market-clearing moment -- the payoff the entire screen is built to deliver --
is the most illegible moment on it. Fix the collisions and the "sparse" complaint
evaporates on its own. **The answer to check 4 is: leave the avatars alone and go
fix check 1.**

### Check 5 -- sat-out vs floor-priced buyer. FAIL, and worse than the question assumed.

The question was whether subtractive cues (dimmed, OUT tag, no price) are enough
at 1024x640. They are not, and the situation is worse than "not enough":

**The sat-out human is actively labeled with a bid he does not have.**

In `05_sitout_fastforward_1024x640.png` the human sits out in lane 1. Probed:

- The human's avatar: dimmed to opacity 0.34. This cue works -- it is visible.
- The human's `OUT` tag: box (220.9, 103.2)-(252.6, 118.2).
- The `CHEAP` wall label: box (213.3, 98.9)-(269.5, 113.9). It covers the OUT
  tag's **top 71%**.
- The `BID $16` pennant plate: box (202.7, 112.0)-(300.8, 139.7), opaque. It
  covers the OUT tag's **bottom 41%** -- and sits directly over the sat-out
  avatar's head.

Between the two, essentially none of the OUT tag survives. See
`_crops/sitout_lane1_vs_cheap.png`: the tag is a smear under "CHEAP", and the
thing a player actually reads above the dimmed avatar is **"BID $16"**.

And the tag would be marginal even unoccluded. Rendered through the 0.34 group
opacity it is `rgb(93,93,121)` on the `rgb(38,38,64)` runway: **2.31:1**. The
compositing arithmetic independently gives 2.30:1. That is below WCAG AA (4.5:1)
and less than half the house target (5.5:1), at 12.80px.

Separately, the sat-out player parks ~34px from a floor-priced buyer -- **less
than one avatar width (38.4px)**. They overlap.

**Fix**: this needs an *additive* cue, not a better subtractive one. Options, in
order of preference:

1. Park sat-out players **outside the runway** -- there is a spare 10.7px at the
   right stage edge and, better, the dock lane already says "Out". Bench them in
   their dock row, off the price axis entirely. A player with no price does not
   belong on a price axis; that is the honest geometry argument, and it is the
   same argument that protects check 4.
2. If they stay on the runway: give the OUT tag its own plate (like the pennants
   have) so it is not subject to group opacity, raise it to >= 4.5:1, and
   suppress the BID pennant from rendering over a sat-out lane.

The lane-1 case is the one that matters most: it is the human's own lane, and
sitting out is the one state whose only cue is that tag.

### Check 6 -- crate-stack scale. FAIL. And the crates are barely visible at all.

The running-max scale is real, and confirmed in source, not inherited:
`src/ui/scenes/auction_arena.tsx:349-379` keeps `stockFull` as a `createSignal`
raised whenever `storeStock` exceeds it, and `crateCount()` scales against it.
The comment there defends it as giving "a stable full-scale reference ... without
inventing a constant" -- while in the same breath noting "the store's stock GROWS
when players sell into it," which is precisely when the reference moves. It is
self-refuting: the scale is stable except when it isn't.

**Ruling: not acceptable, and yes, the payload needs a reference maximum.** On a
screen whose stated job is making quantity visible, a quantity axis that
redefines itself under the player can show a stack holding steady while stock
falls. That teaches the inverse of the lesson.

But the scale is the *second* problem. The first is that **the crates are nearly
invisible**. Sampled: the crate glyph renders `rgb(1,1,3)` -- effectively pure
black -- on a `rgb(38,38,64)` rail. **1.42:1.** See `_crops/rail_crates.png`:
featureless black blobs.

Compare `docs/screenshots/town_interior.png`, the committed graphic-treatment
reference: the *same* resource glyphs there are a **silver pentagon** (smithore),
a **green diamond** (food), a **pink diamond** (crystite) -- saturated, legible,
on dark navy plates. The auction is using those symbols and losing their fill.
The food window's crates (frame 05) are black diamonds where town's are green.
The flying-goods glyph has the same problem (a dark blob in
`_crops/banner_over_seller.png`).

So the store's supply -- the supply half of "supply and demand" -- is currently
rendered as black holes on a dark wall, on a self-redefining scale, with no
number anywhere on screen.

**Fix**, all three parts:

1. Restore the resource glyph's palette fill so a crate looks like the town's ore
   /food/crystite glyph. This is the highest-value single change on this list:
   it fixes the crates AND the flying good AND aligns the arena with the
   established treatment.
2. Print the raw stock integer beside the crates (the proposed fix -- adopt it).
   The number is ground truth; the stack becomes decoration that cannot lie.
3. Scale the stack against a payload-supplied reference max (the window's opening
   stock), not a running max.

### Check 7 -- dock text, MEASURED. PASS.

Measured at 1024x640 with my own instrument (computed font-size x CTM scale):

| Dock element | Declared | CTM | **Rendered** |
| --- | --- | --- | --- |
| money value | 14px | 1.0667 | **14.93px** |
| units / traded value | 13px | 1.0667 | **13.87px** |
| column header, Store label | 12.5px | 1.0667 | **13.33px** |
| role text (Buy/Sell/Out) | 12px | 1.0667 | **12.80px** |

**Smallest dock text: 12.80px.** The plan's floor (WP-X1, line 673) is ">= 12px
rendered". Margin: **6.7%**. PASS, thinly.

This confirms the first look's correction and refutes the original "15px". I
reproduced the error's source: the role text's `getBoundingClientRect().height`
is **15.0px** -- and the role text is "Buy", whose **y-descender** inflates the
box by exactly the missing 2.2px. The 15px figure was a bounding box wearing a
font size's clothes.

Any future change that shrinks dock text has 0.8px of headroom. Treat 12px
declared as a floor, not a default.

## Fill, dead band, and the price story

### Geometry (scale-invariant; a pipeline check, not design evidence)

Measured off the live DOM at 1024x640. These are arithmetic identities of the
frozen region constants and are identical at 1280x800 by construction, so they
verify the capture, not the composition.

| Measure | Value | Target | |
| --- | --- | --- | --- |
| Stage | 1024 x 640, no letterbox | 16:10 | OK |
| Runway share of frame | **56.0%** | "~56%" | OK |
| Trailing dead band | **4.0%** of stage height (25.6px) | <= 5% (was 16.3%) | OK |
| Composition width coverage | **98.96%** (dock 0 -> right rail 1013.3) | >= 90% | OK |
| Runway + rails width | 83.33% | -- | see note |
| Top band | 14.67% of stage height | -- | |

Note on the 90% width criterion: read as the *composition's* coverage it is
98.96% and passes comfortably -- only 10.7px (1.04%) of the right edge is unused.
Read as the *runway + rails band alone* it is 83.33%. I record both rather than
quietly picking the flattering one. The dock is a designed region of this
composition, not dead space, so 98.96% is the honest reading. **The screen fills
the stage. That complaint is answered.**

### Price story: legible, with one hole

Rails, ruler, and going price all read well. `$50 ... $59 ... $68 ... $76 ... $85`
runs along the bottom at 12.80px / 8.89:1; the gold rail quotes (18.13px,
10.14:1) mark the store's band at both ends; cheap-left / expensive-right is
labeled and the avatars' motion confirms it. The bid (cyan) and ask (orange)
dashed lines are distinguishable and their pennants are clear -- *until they
converge*, at which point one eats the other (check 4).

The hole is the control legend. **"Left arrow lowers, right arrow raises" renders
at 1.43:1** -- `rgb(185,185,198)` on the cyan `rgb(64,167,201)` timer fill. See
`_crops/timer_legend.png`. This is the only on-screen text teaching what the plan
calls "the PRIMARY taught controls," and it is the least readable text on the
screen. It also sits on top of the timer bar, so the countdown and the controls
fight for the same 34px strip.

## Contrast

Sampled from rendered pixels at 1024x640. House target 5.5:1
([COLOR_CONTRAST_ACCESSIBILITY.md](../../COLOR_CONTRAST_ACCESSIBILITY.md)); WCAG
AA 4.5:1.

The gate's explicit contrast requirement -- **every dock value and the going
price** -- passes:

| Element | Ratio | |
| --- | --- | --- |
| Going price / last trade | **10.71:1** | PASS |
| Dock money value | **12.39:1** | PASS |
| Dock units / traded value | **12.39:1** | PASS |
| Dock role text | **9.38:1** | PASS |
| Dock column header, Store label | **9.38:1** | PASS |
| TICK readout | 17.29:1 | PASS |
| Price ruler label | 8.89:1 | PASS |
| Store rail quote | 10.14:1 | PASS |
| STORE BUYS/SELLS rail label | 8.89:1 | PASS |
| CROSSED caption | 14.65:1 | PASS |
| FAST indicator | 11.16:1 | PASS |
| Finished / skipped overlay title | 11.69 / 10.14:1 | PASS |

Four elements fail anyway, and they are not decorative:

| Element | Ratio | |
| --- | --- | --- |
| Intent legend on the timer fill | **1.43:1** | **FAIL** -- the primary control's only instruction |
| Rail crate glyph on its rail | **1.42:1** | **FAIL** -- the only quantity display on screen |
| Sat-out OUT tag (through 0.34 opacity) | **2.31:1** | **FAIL** -- the only cue a player is out |
| UNITS TRADED banner text | **2.97:1** | **FAIL** -- dark ink on a semi-transparent gold plate |
| CHEAP / EXPENSIVE wall labels | 5.00:1 | AA only; misses the house 5.5:1 |

The banner deserves a note: its plate is semi-transparent, so its text contrast
*varies with whatever is behind it* -- worse where it crosses the darker crossing
band. Text contrast should not be a function of what the text happens to be
floating over.

## Per-beat verdicts (1024x640, binding)

### Beat 1-2 -- status / accounting + declare. PASS, with a note.

`01_status_accounting_1024x640.png` and `02_declare_1024x640.png` are
**byte-identical** (md5 `7fa9d9fb...`). That is by design -- the driver documents
that the status layer and role buttons render as one overlay -- but it means the
gate judges **6 distinct frames, not 7**. Recording it so nobody later mistakes
two filenames for two pieces of evidence.

The beat itself is good. The usage card reads cleanly (`You Had 0 -> Now 0`,
`P3 Had 0 -> Now 5`, `Made 5`), the good is named, and Buy/Sell/Sit Out are
present and obvious. It is a centered card in a landscape frame, which is
appropriate for a modal beat and does not repeat the old screen's portrait-column
error, since the full landscape arena is live behind it.

Defects present: tutorial hint (check 2); lane-1 price tag over the CHEAP label.

### Beat 3 -- live motion. PASS on composition, FAIL on labels.

The best frame in the set. Buyers left, sellers right, dashed bid/ask lines
converging, avatars walking, ruler beneath, rails at both ends. This frame alone
answers the user's original complaint: it is unmistakably a landscape market, not
a portrait column, and the supply/demand geometry is legible at a glance.

Defects: the lane-1 avatar's `$52` price tag overlaps the `CHEAP` wall label by
**26.9 x 12.7px** (48% of the label's width). This is not an edge case -- buyers
*start* at the cheap wall by construction, so a lane-1 buyer collides with CHEAP
at tick 0 of every window. Symmetrically, floor-priced buyers overhang the left
rail and their price tags occlude the `STORE BUYS` label (`_crops/floor_buyer_vs_rail.png`
shows it reading "...RE BUYS"). Plus the illegible intent legend (1.43:1).

### Beat 4 -- trade feedback. FAIL.

Three defects converge here:

- CROSSED garbles the pink avatar (check 1): 38.4 x 15.0px overlap.
- The flash burst floats 309px from any participant (check 3).
- The `UNITS TRADED 1` banner plate covers the lane-3 seller's `$67` price tag
  **completely** -- banner (468.8-704.5, 318.3-358.2) over tag (589.4-627.8,
  340.1-357.1). See `_crops/banner_over_seller.png`, where the tag reads "$6...".

The banner's own source comment (`auction_trade_fx.ts:169`) claims it lands "in
the gutter between lane rows 1 and 2 ... a fixed band no avatar's own extent ever
reaches, so the banner never fights an avatar for the same pixels." With four
lanes, the runway's vertical center is the boundary between lanes 2 and 3, and
lane 3's avatar reaches up through it. The comment asserts the opposite of what
renders.

**Fix**: move the banner off the lane band -- the top band or the ruler strip --
or compute its y from the actual lane gutters rather than the runway center.

### Beat 5 -- sit-out fast-forward. FAIL.

The `FAST` indicator works: a gold pill beside the tick readout, 11.16:1,
unmistakable. The fast-forward beat is legible as a distinct state.

Everything else about this frame fails (check 5). The human's OUT tag is buried
under CHEAP and the BID chip; the screen labels a sat-out player "BID $16"; and
the three active floor buyers overhang the store rail and hide its label.

### Beat 6 -- finished. FAIL.

The `ROUND OF TRADING COMPLETE. 15 UNITS TRADED.` overlay is clear (11.69:1) and
the Continue button is obvious. Deliberate, not broken.

But this frame contains the worst collision on the screen: at bid == ask == $85,
the BID chip is **73.9% occluded** by the ASK chip and reads "BI" with its price
gone; the avatar's price tag collides with EXPENSIVE; and a flash burst renders
**off-stage at x=1199** on a 1024px stage. The market-clearing frame is the least
readable frame in the set.

The overlay panel is also semi-transparent enough that the price ruler's `$59`
and `$68` show through it as ghosts.

### Beat 7 -- skipped window. PASS, weakly.

`NO CRYSTITE TO TRADE THIS ROUND.` + Continue is unambiguous and reads as
deliberate. It clears the "must not look blank or broken" bar.

It is muddled underneath, though: four avatars stand on the runway with live
`$48` price tags and a `BID $48` chip, on a good that cannot trade, with empty
rails and a full timer bar. It looks like a live auction someone paused. A
skipped window would read better with the participants and bid/ask suppressed --
the rails, ruler, and the overlay are enough.

## 1280x800 (sanity render)

Identical composition, uniformly scaled -- as the plan predicts, since both
viewports are exactly 16:10 and the stage fills each with no letterboxing. All
defects above reproduce.

One thing is **worse** at 1280x800, contradicting the assumption that the small
viewport is always the hard case: the tutorial hint grows with the viewport and
**cuts the dock column header in half** (`_crops/dockheader_1280.png`), where at
1024x640 it only shaves 3.2px off the top. A hint sized in CSS px against a stage
sized in scaled user units will keep drifting; it should be sized in the same
units as the thing it must not overlap.

## Graphic treatment

**Passes, with one exception.** Side by side with `docs/screenshots/town_interior.png`
and `docs/screenshots/overworld_map.png`: the arena shares the established
material language -- flat shapes, soft shadows, rounded chunky forms, saturated
player colors on dark navy plates, gold accents, no dithering, no 8-bit tile art.
The auction robots are the same sprites as the town's. This is not a NES
reproduction, which is the correct outcome.

The exception is the resource glyphs (check 6): town renders smithore as a silver
pentagon and food as a green diamond; the auction renders the same symbols as
black silhouettes at 1.42:1. That is the one place the arena falls out of the
established treatment, and fixing it fixes a legibility failure at the same time.

## What an implementer should do

Ordered by value. Every item is local; none touches the composition.

1. **Restore the resource glyph fills** in the rail crates and the flying goods
   (check 6). Fixes the worst legibility failure and the only treatment
   inconsistency at once.
2. **Move CROSSED off the lane band** (check 1) -- top band or ruler strip. Not
   an offset.
3. **Fix the flash transform** (check 3): `transform="translate(cx,cy) scale(s)"`
   driven from the existing `advance()` loop; drop the CSS `transform-box`
   approach on the `<use>`.
4. **Bench sat-out players off the price axis**, or give the OUT tag its own
   plate at >= 4.5:1 and suppress the BID pennant over a sat-out lane (check 5).
5. **Deconflict the convergence cluster**: BID/ASK pennants must not stack when
   bid == ask; avatar price tags must not land on the CHEAP/EXPENSIVE labels or
   the rail labels.
6. **Move the UNITS TRADED banner** off the lane band (beat 4).
7. **Fix three contrast failures**: intent legend (1.43:1), OUT tag (2.31:1),
   banner text (2.97:1). Per `docs/COLOR_CONTRAST_ACCESSIBILITY.md`, fix by
   darkening plates / brightening text, never by desaturating.
8. **Shrink the tutorial hint** to one line, move it out of the top band, and
   stop it overlapping the dock header at both viewports (check 2).
9. **Print the store's stock integer** beside the crates and scale the stack
   against a payload-supplied reference max (check 6).

A collision-avoidance node test would prevent the whole class: assert that no
label rect intersects an avatar rect across the price sweep. Six of the nine
items above are one bug wearing six hats.

## What is right, and should not be touched

- The composition. Runway 56.0% of frame, dead band 4.0%, full-stage landscape.
  Do not re-litigate it.
- The dock. Every value clears the house contrast target; the lane-color chain
  from stripe to badge to avatar is the strongest idea on the screen.
- The status/usage beat. It reads.
- The avatars converging at one price (check 4). It is the truth.
- The loud gold going price and saturated lane colors. `FUN_VIBES` is
  load-bearing; nothing here is flagged for being bold. Every finding above names
  a specific usability failure -- hidden content, unreadable text, or visual
  ambiguity.

## Evidence

- Frames: `output_smoke/auction_beats/*.png` (14).
- Crops (3-5x, nearest-neighbor): `output_smoke/auction_beats/_crops/`.
- Raw DOM measurements: `output_smoke/auction_beats/_measurements.json`,
  `_probe.json`.

`output_smoke/` is regenerated by the driver and is not committed; re-run
`node --import tsx tests/e2e/e2e_auction_beat_capture.mjs` to reproduce every
frame, and the numbers above against them.
