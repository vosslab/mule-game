# Auction visual acceptance, final gate (M6)

Re-judgement of the rebuilt full-stage goods auction
([auction_native_recompose.md](../active/auction_native_recompose.md), work package
WP8b-acceptance) after the implementer's fix pass. This report re-checks the bar set by
[auction_visual_acceptance.md](auction_visual_acceptance.md), which FAILED the screen. Every
number below is measured by this judge with its own instruments, from frames captured for this
report. Nothing is carried over from the implementer's self-report.

## Overall verdict: PASS

All six claimed fixes are verified. The screen the user called "a crude mixture of both landscape
and portrait, which makes it unusable" is now a legible landscape market, and the six-instance
defect class that failed the previous gate -- **labels drawn where occupants provably stand** -- is
gone from every place it fired.

The composition survived the fix pass intact and improved: the runway still holds 56.0% of the
frame, and the trailing dead band **dropped from 4.0% to 2.0%** of stage height. Nothing on the
screen now measures below WCAG AA; the three sub-AA text elements are all above the house 5.5:1
target.

One residual remains, and it is a seventh instance of the same defect class. It is **not** the one
the implementer disclosed, and its disclosure was wrong on the facts (see
[the ruling](#ruling-on-the-rail-label-residual)). It does not block the ship -- it hides no
information and misinforms nobody -- but it is a real defect with a one-change fix, and it is
recorded as a required follow-up rather than waved through.

## What was run

```
node --import tsx tests/e2e/e2e_auction_beat_capture.mjs
```

```
==> dist fresh, skipping build (dist/index.html is newer than every tracked source input)
==> serving dist/ on 127.0.0.1:58401
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
[... the same seven at 1280x800 ...]
==> all 14 beat screenshots captured in output_smoke/auction_beats
DRIVER_EXIT=0
```

Exit 0, all 14 files.

Legibility is judged at **1024x640**, the binding minimum. 1280x800 is checked and differs nowhere
for the worse (it differed for the worse at the last gate; that regression is fixed).

## Provenance

The driver reported `dist fresh, skipping build`, so the build was verified rather than assumed:

| | |
| --- | --- |
| `dist/index.html` built | 2026-07-11 15:27:24 |
| Newest tracked source (`auction_arena.tsx`) | 2026-07-11 15:27:10 |
| `auction_arena.tsx` md5 | `2056548dd6c485f19c06313e959ab4b1` |
| `auction_trade_fx.ts` md5 | `c93392e25c938b630362c6525dbc9264` |
| `auction_screen.tsx` md5 | `aeac9146d40674c9916d5d068c2b02b6` |
| `style.css` md5 | `44639dbd2c32fca315f8ebd40f294cde` |

The build postdates the last source edit by 14 seconds, and the frames postdate the build. The tree
under judgement is stable and fully built.

## Instruments

- **Collisions**: a probe driving the same beats as the capture driver, intersecting
  `getBoundingClientRect()` of every label against every avatar sprite and bench plate. Reported as
  measured overlap and as a percentage of the label's own area.
- **Font size**: computed `font-size` x the element's `getScreenCTM()` scale. A
  `getBoundingClientRect().height` is NOT a font size -- descenders inflate it, which is how the
  false "15px" entered the record at an earlier gate.
- **Contrast**: sampled from the rendered PNG pixels, never from declared CSS, because a fill that
  renders through a group opacity lies about what a player sees. For each element box, colors
  holding a real share of the box are kept (so antialiasing fringes cannot pose as ink or plate)
  and the lightest is rated against the darkest.

## The six claimed fixes

| # | Claimed fix | Verdict |
| --- | --- | --- |
| 1 | The sat-out lie: no price-bearing label on a benched player, plus a positive cue | **VERIFIED** |
| 2 | Zero label collisions across all beats | **VERIFIED** (three rail residuals; see ruling) |
| 3 | The trade flash lands on the buyer | **VERIFIED** |
| 4 | The going price is the top band's dominant element, nothing hidden | **VERIFIED** |
| 5 | Crates legible, and the quantity scale made honest | **VERIFIED** |
| 6 | Three sub-AA text elements raised above the floor | **VERIFIED** |

### 1 -- The sat-out lie. VERIFIED FIXED.

This was the most serious defect: the screen rendered a benched player carrying a bid he did not
have, and the root cause was the BID pennant sitting inside lane 0's avatar band.

Measured across all six probed beats: **zero price-bearing labels intersect any benched player's
box.** Not "fewer" -- zero.

The benched player in `05_sitout_fastforward_1024x640.png`:

| Element | Measured |
| --- | --- |
| Benched sprite | box (224.0, 128.0)-(262.4, 185.6), opacity **0.40** |
| Bench plate | box (202.7, 174.9)-(283.7, 187.7), opacity **0.95** (opaque) |
| OUT chip | full opacity, **14.87:1** (was 2.31:1) |
| Price tag on the benched player | **none** -- the three active buyers each carry `$17` |
| Nearest price-bearing label (BID pennant plate) | top y=188.8, clearing the bench by **1.1px** |

The 1.1px clearance is thin but it is a constant, not a race: sprites are bottom-anchored to a fixed
foot line per lane (foot lines at y = 185.6 / 305.1 / 424.5 / 544.0, exactly 119.5px apart), so the
clearance does not vary with sprite height even though sprite heights vary (49.1 to 61.9px).

**Can a player tell a sat-out player from a floor-priced buyer at a glance? Yes.** Three independent
cues agree, and the screen's own grammar is preserved:

- The benched avatar is dimmed to 0.40 while the buyers standing ~30px away are at full saturation.
- The benched player literally sits on a bench -- an opaque plate bordered in his own lane color --
  with a bright OUT chip above his head.
- The dock row reads `Out` where the others read `Buy`.
- **Every player's number appears above his head.** The active buyers' slots hold `$17`. The benched
  player's slot holds `OUT`. The player is not asked to notice an absence; he is shown a positive
  cue in the exact place he already looks for the price.

### 2 -- Label collisions. VERIFIED for every element named in the gate.

Measured bounding-box intersections, 1024x640:

| Label | Previous gate | Now |
| --- | --- | --- |
| CROSSED | intersected the pink avatar by 38.4 x 15.0px | **0 collisions** -- sits in a lane gutter |
| BID / ASK | BID chip **73.9% occluded** by ASK at bid == ask, reading "BI" | **0 collisions** -- deconflicted horizontally; both fully readable at the crossing |
| UNITS TRADED | covered the lane-3 seller's price tag completely | **0 collisions** -- opaque gold plate in the gutter |
| CHEAP / EXPENSIVE | collided with avatar price tags at tick 0 by 26.9 x 12.7px | **0 collisions** |
| Rail stock number (new) | did not exist | **0 collisions**, 16.00px, 14.08:1 |

The market-clearing frame (`06_finished`), which the previous gate called "the least readable frame
in the set," now reads cleanly: `BID $85` and `ASK $85` sit side by side, both legible, at the exact
moment the entire screen exists to deliver.

Three rail collisions remain. They are ruled on separately below.

One minor, transient blemish, recorded for completeness rather than as a finding: in
`04_trade_feedback`, the flying-goods glyph clips the seller's `$67` price tag by **14.2%** of the
tag's area as it launches. The glyph is a projectile in flight and the tag is fully readable before
and after; the launch point being ON the seller is the correct, intended anchor. A small nudge to the
launch origin (the avatar's chest rather than its crown) would clear it.

### 3 -- The trade flash. VERIFIED FIXED.

Previously the flash was orphaned 309px from the buyer and, in the finished frame, rendered
**entirely off-stage at x=1199 on a 1024px stage** -- invisible. The root cause was a CSS
`scale()` with no translation term resolving its origin against `transform-box: fill-box` on a
`<use>` element.

Measured now:

| Frame | Measured |
| --- | --- |
| `04_trade_feedback` | flash box (530.1, 126.4)-(584.5, 180.8), **overlapping the buyer's sprite**; 18.7px centre-to-centre |
| `06_finished` | **every** FX box on-stage; furthest right edge 993.4 on a 1024px stage |

The burst visibly lands on the buyer. The off-stage render is gone.

### 4 -- The going price. VERIFIED FIXED.

The tutorial hint has moved out of the top band and into the declare card, where it is one sentence
("Hold the Right Arrow to raise your price, the Left Arrow to lower it.") with a `Got it` dismiss --
14 words, against the 44-word paragraph that
[docs/FUN_VIBES_DESIGN_STYLE.md](../../FUN_VIBES_DESIGN_STYLE.md) names under *what goes quiet*.

The top band now carries only the good title, the going price, and the tick readout.

| | Rendered | Contrast |
| --- | --- | --- |
| Going price | **46.93px**, weight 800, gold | 12.97:1 |
| Next-largest glyph anywhere on the stage | 18.13px (rail quote) | -- |

The going price is the largest glyph on the screen by **2.6x** and the only gold text in its band. It
is dominant by measurement, not by taste.

**Nothing is hidden.** The dock column header (`$ Qty Trd`) is fully visible at **both** viewports.
This was the previous gate's specific usability failure: the hint shaved 3.2px off the header at
1024x640 and **cut it in half at 1280x800**. Both are fixed.

### 5 -- Crates: visibility and scale. VERIFIED FIXED, both parts.

**Visibility.** The crate glyphs were painting `rgb(1,1,3)` -- effectively pure black -- at
**1.42:1**, because `RESOURCE_ICON_FILLS` had zero consumers. It now has a real one
(`src/ui/sprites.ts:189`), and the glyphs render in their palette colors:

| Crate | Sampled ink | Contrast |
| --- | --- | --- |
| Smithore (silver) | `rgb(184,184,185)` | **7.39:1** |
| Food (green) | `rgb(137,200,78)` | **7.28:1** |

Both clear the house 5.5:1 target, and the arena now matches the graphic treatment in
`docs/screenshots/town_interior.png`. Note the implementer claimed **8.00:1**; the rendered glyph
measures **7.39:1**. The 8.00 figure is presumably the pure palette fill against the rail, before
the glyph's own shading. The claim is optimistic but the fix is real and comfortably above target.

**Honesty.** The running-max scale is gone. `auction_arena.tsx:448` now captures `openingStock` once
per window and scales the stack against it, so one crate stands for one fixed quantity for the whole
window -- a stack can no longer hold steady while stock falls. A raw stock integer prints on both
rails (16.00px, 14.08:1), so the number is ground truth and the stack is decoration that cannot lie.

Stock that grows *above* the opening level saturates the stack at `MAX_RAIL_CRATES`. That is
disclosed in the source comment and is acceptable, precisely because the printed number is there.

### 6 -- Contrast. VERIFIED FIXED. Nothing on the screen is below WCAG AA.

Sampled from rendered pixels at 1024x640. House target 5.5:1
([docs/COLOR_CONTRAST_ACCESSIBILITY.md](../../COLOR_CONTRAST_ACCESSIBILITY.md)); WCAG AA 4.5:1.

| Element | Previous gate | Now | |
| --- | --- | --- | --- |
| Intent legend on the timer fill | 1.43:1 | **14.87:1** | PASS |
| Sat-out OUT chip | 2.31:1 | **14.87:1** | PASS |
| UNITS TRADED banner text | 2.97:1 | **11.14:1** | PASS |
| Rail crate glyph | 1.42:1 | **7.39:1** | PASS |
| CHEAP / EXPENSIVE hint | 5.00:1 (AA only) | **6.37:1** | PASS |

All three claimed figures land where the implementer said (14.87, 14.87, 11.2 claimed; 14.87, 14.87,
11.14 measured). The fixes were made the right way, per
[docs/COLOR_CONTRAST_ACCESSIBILITY.md](../../COLOR_CONTRAST_ACCESSIBILITY.md): the legend and the
banner each got their own **opaque** plate, so their ratio is now a property of the label instead of
an accident of whatever they float over. Nothing was desaturated.

Everything else on the screen, spot-checked: going price 12.97:1, rail stock 14.08:1, rail quote
10.71:1, rail label 8.89:1, CROSSED 8.40:1, avatar price tag 15.75:1, pennant price 16.67:1, price
ruler 8.89:1, tick readout 17.29:1.

## Ruling on the rail-label residual

The implementer disclosed one residual: the rotated `STORE BUYS` / `STORE SELLS` rail labels can
still be overlapped by an avatar sprite at an extreme price. It argued the overhang is intended
("touching the rail = crossing the store's quote"), that the price-tag occlusion is fixed because
tags now clamp inside the runway, and that **"this was not observed in any of the 14 frames."**

### The disclosure is wrong on the facts

It is observed in **4 of the 14 frames**, and I re-ran the driver myself to produce them:

| Frame | Rail element | Covered by an avatar sprite |
| --- | --- | --- |
| `01_status_accounting` + `02_declare` (both viewports) | sell rail **quote** `$85` | **96.4%** |
| `07_skipped_window_1024x640` | buy rail label `STORE BUYS` | **50.5%** |
| `05_sitout_fastforward_1024x640` | buy rail label `STORE BUYS` | 9.3% |

At 96.4% the sell quote is not overlapped, it is **gone**. What survives is a small gold hook on the
green robot's shoulder that reads as a rendering artifact. It reproduces identically at 1280x800.

### The justification holds for the label, and not for the quote

The semantic argument is sound as far as it goes. `STORE BUYS` at 50.5% covered reads "RE BUYS":
ugly, but it is a **static word** a player learns once, it is redundant with the gold quote and the
CHEAP/EXPENSIVE hints beside it, and an avatar reaching the rail genuinely does mean it has hit the
store's quote. **Accept that.**

It does not extend to the quote, because the quote is a **live number** -- the store's sell price,
which is the supply half of the supply-and-demand story this screen exists to tell.

And the reason the quote is in harm's way at all is not design intent. It is an ordering bug: **the
two rails are not mirrored.** Reading outward from the runway edge:

```
  buy rail  (runway edge at x=202.7, going LEFT):
      label  184.2 .. 197.2   <- innermost
      stock  175.8 .. 186.9
      quote  158.0 .. 180.0   <- outermost, SAFE

  sell rail (runway edge at x=970.7, going RIGHT):
      quote  968.7 .. 990.7   <- innermost, and it BEGINS 2px INSIDE the runway
      stock  986.4 .. 997.6
      label  994.9 .. 1007.9  <- outermost, SAFE
```

An avatar is centred on its price, so at an extreme price it overhangs the rail by half a sprite
width -- measured at **19.2 to 21.4px**. Whichever element is innermost gets sat on. The buy rail
puts the *label* there (the acceptable case the implementer described). The sell rail puts the
*quote* there, and the quote's own box **starts 2px inside the runway** -- it is drawn in the strip
where avatars provably stand.

### Verdict on the residual

**It is a seventh instance of the same defect class, and the justification does not cover it.** A
label sits where an occupant provably stands, with no collision avoidance, and the disclosure that
it would not be seen is false.

**It does not block the ship**, and I want to be explicit about why rather than hedge: it hides no
information (the same `$85` is legible in the ASK pennant and at the price ruler's right end in the
same frame), it misinforms nobody, and it clears every contrast bar. It is a cosmetic blemish on the
declare frame, categorically unlike the sat-out lie it is being compared to.

**Fix (one change, no composition cost):** mirror the sell rail's element order so both rails read
quote -> stock -> label going *outward* from the runway. The innermost element on each rail is then
the static label, whose partial occlusion is exactly the residual the implementer defended and this
report accepts -- and no live price number is ever covered on either rail.

## The composition still holds

The fixes did not cost the recompose anything. Measured off the live DOM and the rendered pixels:

| Measure | Previous gate | Now | Target | |
| --- | --- | --- | --- | --- |
| Stage | 1024 x 640, no letterbox | unchanged | 16:10 | OK |
| Runway share of frame | 56.0% | **56.0%** | ~56% | OK |
| Trailing dead band | 4.0% of stage height | **2.0%** (13px at 1024x640; 16px at 1280x800) | <= 5% (was 16.3% on the rejected screen) | OK |

### Dock text, measured

Measured with computed `font-size` x `getScreenCTM()` scale -- not a bounding-box height:

| Dock element | Declared | CTM | Rendered | Contrast |
| --- | --- | --- | --- | --- |
| money value | 14px | 1.0667 | **14.93px** | 12.39:1 |
| units / traded value | 13px | 1.0667 | **13.87px** | 12.39:1 |
| column header, Store label | 12.5px | 1.0667 | **13.33px** | 9.38-11.36:1 |
| role text (Buy / Sell / Out) | 12px | 1.0667 | **12.80px** | 9.38-10.35:1 |

**Smallest dock text: 12.80px**, against the 12px rendered floor. Margin **6.7%**. PASS, thinly --
this confirms the previous honest measurement and leaves 0.8px of headroom. Treat 12px declared as a
floor, not a default.

One note the gate did not ask for but should have: the **smallest text anywhere on the screen** is
not dock text. It is the rotated rail label at **11.73px** (declared 11px x 1.0667). That is below
12px rendered. It falls outside the dock floor's scope, and it is an all-caps rotated label with
generous letter-spacing that measures 8.89:1, so it is legible -- but it is the one element under the
number this project treats as its floor, and it is worth a deliberate decision rather than an
accident.

## Per-beat verdicts (1024x640, binding)

Every beat reads as deliberately designed. None looks blank or broken.

| Beat | Verdict |
| --- | --- |
| 1-2 status / accounting + declare | **PASS.** The usage card reads cleanly (`You Had 0 -> Now 0`, `P3 Had 0 -> Now 5`, `Made 5`); the good is named; Buy / Sell / Sit Out are obvious; the hint now lives inside the card. Unlike the last gate, beats 1 and 2 are no longer byte-identical -- they differ by idle animation -- but they remain one designed overlay in two files. |
| 3 live motion | **PASS.** The best frame in the set, and the one that answers the user's original complaint on its own: buyers at the cheap wall, sellers at the expensive wall, bid and ask lines converging, price ruler beneath, store rails at both ends. Unmistakably a landscape market. |
| 4 trade feedback | **PASS.** Goods visibly leave the seller, the flash lands on the buyer, CROSSED sits clear in a gutter, and the UNITS TRADED banner is an opaque plate that collides with nothing. |
| 5 sit-out fast-forward | **PASS.** The gold FAST pill (11.16:1) makes the state unmistakable, and the bench plus OUT chip make the benched player unmistakable. This frame carried the worst defect at the last gate and is now clean. |
| 6 finished | **PASS.** `ROUND OF TRADING COMPLETE. 15 UNITS TRADED.` is clear, Continue is obvious, and BID/ASK are both readable at the crossing. Minor: the overlay panel is semi-transparent enough that the ruler's `$59` and `$68` ghost through it. |
| 7 skipped window | **PASS, weakly.** `NO CRYSTITE TO TRADE THIS ROUND.` + Continue is unambiguous and deliberate. Underneath, though, four avatars still stand with live `$48` price tags and a `BID $48` chip on a good that cannot trade, with a full timer bar: it still reads as a live auction someone paused. Unchanged from the last gate's note. Suppressing the participants and the bid/ask on a skipped window would fix it. Not a blocker. |

## 1280x800

Identical composition, uniformly scaled. Every fix reproduces. The one thing that was **worse** at
1280x800 at the last gate -- the tutorial hint cutting the dock column header in half -- is fixed,
because the hint is no longer in the top band at all.

The sell-rail quote occlusion reproduces at this viewport too, as expected from a uniform scale.

## What is right, and should not be touched

- The composition. Runway 56.0% of frame, dead band 2.0%, full-stage landscape. Settled.
- The dock. Every value clears the house contrast target; the lane-color chain from stripe to badge
  to avatar remains the strongest idea on the screen.
- The bench. Giving a sat-out player a positive cue -- an opaque plate in his own lane color, an OUT
  chip in the slot where his price would be -- is the right answer to the sat-out lie, and it is
  better than the "bench them off the runway" option the last gate proposed, because it keeps the
  player visible in his own lane.
- The avatars converging at one price. It is the truth about a cleared market.
- The loud gold going price, the saturated lane colors, the sparkle burst.
  [docs/FUN_VIBES_DESIGN_STYLE.md](../../FUN_VIBES_DESIGN_STYLE.md) is load-bearing; nothing in this
  report is flagged for being bold. Every finding names a specific usability failure.

## Follow-ups (none blocking)

1. **Mirror the sell rail's element order** so quote -> stock -> label reads outward from the runway
   on both rails. Removes the last instance of the defect class.
2. Nudge the flying-goods launch origin off the seller's price tag (14.2% clip, transient).
3. Suppress participants and bid/ask on a skipped window (beat 7).
4. Decide deliberately whether the 11.73px rotated rail label should be raised to the 12px floor.

## Evidence

- Frames: `output_smoke/auction_beats/*.png` (14), regenerated for this report.
- Raw geometry, collision, and font measurements: `output_smoke/auction_beats/_judge_probe.json`.

`output_smoke/` is regenerated by the driver and is not committed; re-run
`node --import tsx tests/e2e/e2e_auction_beat_capture.mjs` to reproduce every frame.
