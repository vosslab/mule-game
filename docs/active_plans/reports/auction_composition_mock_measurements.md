# Auction composition mock measurements

WP-X1 (M3, `docs/active_plans/active/auction_native_recompose.md`) design-proof
pass: a static mock of the new full-stage 16:10 auction composition, built
from the frozen region rects in `src/ui/scenes/auction_geometry.ts` (WP2),
measured before any M4 lane (arena, dock, status) starts building against
those constants. Hypothesis under test: the 150/40/720/40 width budget and
88/448/56 height budget produce a dominant, legible runway.

**Viewport note:** this report uses the CORRECTED supported viewports,
**1024x640** (the minimum supported viewport, the single binding pass/fail
viewport) and **1280x800** (the nominal target, a sanity render), per the
2026-07-11 supersession recorded in
`docs/active_plans/active/auction_native_recompose.md`. Earlier figures for
1600x900 / 1200x1000 were superseded before this report; see that plan's
Context section for the full supersession note.

**This report was corrected after review, twice.** The first pass (recorded
in `docs/CHANGELOG.md` 2026-07-11, "Patch: [WP-X1] composition mock +
measurement") reported all five criteria as PASS, but a reviewer found two
were circular and the fifth was ungraded narrative with no retained
evidence -- self-graded by the same agent that produced it. The second
correction is a role split: this report now collects ARTIFACTS AND
MEASUREMENTS ONLY. It does not issue a PASS/FAIL verdict on rail clarity,
crate fit, or dashed-line visibility -- that judgment belongs to a separate
image_evaluator pass against the retained screenshots and the measurement
tables below. Where this report states a fact that is directly computable
(an overflow/overlap boolean, a pixel gap, a percentage that is an
arithmetic identity of frozen constants), that is data, not a design
conclusion. See "What the review found" below, then "Rerun: rail
measurements" for the artifacts and numbers that replace the old criterion
5 narrative.

## What the review found

The first mock was one full-slot SVG with `viewBox="0 0 960 600"` (exactly
16:10) inside `#game-stage`, whose CSS forces `aspect-ratio: 16 / 10` exactly
(`src/style.css:333-347`). Because the outer box and the inner viewBox share
an identical aspect ratio and nothing else competes for space, ANY full-slot
SVG scales by one uniform factor at ANY 16:10 viewport. That means
`rect_px / stage_px` is mathematically identical to
`rect_viewboxunits / viewbox_units` for every possible region layout the
mock could have drawn -- the "runway share = 56.00%" and "dead band = 4.00%"
figures could not have come out any other way. Rendering them through
`getBoundingClientRect()` at two viewports was arithmetic on the region
constants presented as empirical proof; no possible set of region rects
could have failed that check. Its real value is as a pipeline sanity check
(confirms the render pipeline does not distort the region proportions), not
as a design proof.

The two text-height criteria (dock text, going-price) are genuine
measurements: they need real font-metric rendering and are not derivable
from the region constants alone. They stay valid; see the table below for
their re-measured values at the corrected viewports.

Criterion 5, "rails and dashed lines read at a glance", was graded "PASS
(visual)" on narrative with no retained screenshot and no independent
measurement pass. This was the one criterion that actually covered the
40-unit rail width -- the constant the plan itself names as most likely to
need correction (its own stated fallback is "rails 40->28") -- and it went
unverified.

## Rerun: rail measurements

**Mock is pure SVG.** `_temp_rail_mock.html` has no DOM-layered content --
no HTML overlay text, buttons, or absolutely-positioned divs on top of the
`<svg>`. Every measurable element below (region rects, crate glyphs, price
labels, dashed lines, dock text, going-price text) is an SVG element inside
`#auction-svg`. This means the containment/overflow checks are
scale-invariant inside the viewBox coordinate system (see "What the review
found" above), but real font-metric heights (dock text, going price, price
labels) still had to be measured live per viewport, since SVG text renders
through the browser's font engine, not pure arithmetic -- which is why
those numbers were captured fresh rather than assumed. Because the mock is
pure SVG, this spike does NOT cover DOM-layered content (declare buttons,
hint text, or any future HTML overlay); that surface remains WP3's and the
M6 visual gate's responsibility.

### Method

A second scratch mock (`_temp_rail_mock.html`, scratchpad-only, not
committed) renders the buy and sell rails with the content they will
ACTUALLY carry, built from the geometry module's own constants
(`MAX_RAIL_CRATES = 8`, `CRATE_GLYPH_SIZE = 16`, `clampLabelX`) rather than
hand-placed approximations:

- Each rail renders a full 8-crate stack (`MAX_RAIL_CRATES`, worst-case
  stock), each crate `CRATE_GLYPH_SIZE` (16 units) square, stacked in a
  single column centered on the rail's 40-unit width. This is a design
  choice this rerun makes (the arena has not been built yet) because it is
  the most space-efficient layout the geometry module's constants support;
  WP4 should keep a single centered column rather than a wider multi-column
  grid, since a grid would re-introduce the width crunch this rerun rules
  out for the column layout.
- Each rail renders a 4-character quote label (`$100` on the buy rail,
  `$500` on the sell rail) positioned via the real `clampLabelX` function
  (copied verbatim from `auction_geometry.ts`) against the label's ACTUAL
  rendered width, measured with `getBBox()` in the browser, not assumed.
  `$100`/`$500` are checked against the engine's real price bounds below.
- Dashed best-bid / best-ask lines are computed with the real `priceToX` /
  `priceToTrackY` math (copied verbatim from `auction_geometry.ts` /
  `auction_tween.ts`) at three price pairs, selected by a `?bidask=`
  query param, all asymmetric about the 100..500 band's center (unlike the
  first mock's 280/320 pair, which was symmetric about the center by
  construction):
  - `far`: bid 180, ask 430 (opposite sides of center, unequal distances
    -120 / +130) -- tests whether both lines stay distinct from the rails
    when they sit close to the runway edges.
  - `near`: bid 305, ask 318 (13 apart, both above center) -- tests whether
    the two lines stay distinct from each other when converging.
  - `tight`: bid 299, ask 300 (1 apart) -- `AUCTION_PRICE_STEP_BY_GOOD` is 1
    for food/energy/smithore (4 for crystite, `src/engine/constants.ts:711`),
    so a bid and ask one tick before a trade fires can be exactly 1 price
    unit apart. This is the true worst case for line distinguishability, not
    an arbitrary "near" guess.

A throwaway Playwright smoke-check script (deleted after use; not the
authoritative capture) loaded the mock at both supported viewports
(1024x640, 1280x800) for all three bid/ask scenarios (6 captures total),
screenshotted each, and measured rail/label/crate/line geometry via
`getBoundingClientRect()` and the mock's own exact viewBox-unit render data
(crate placement is exact by construction from `CRATE_GLYPH_SIZE`; label
placement folds in the real `getBBox()`-measured width) -- exact rendered
pixels and exact viewBox-unit containment checks, not eyeballing. The
mock page itself is retained (see "Evidence and artifact locations" below)
for the playwright_operator's authoritative capture pass.

**Quote label realism check:** the engine's real store-quote ceiling is
`STORE_PRICE_CEILING = 230` for food/energy/smithore
(`src/engine/constants.ts:548`); crystite has no band clamp but its raw
price is `STORE_BASE_PRICE.crystite (50) + rng.nextInt(STORE_CRYSTITE_PRICE_DEVIANCE
(100))`, so effectively bounded near 150 (`src/engine/store.ts:508`). The
true realistic worst-case quote is therefore a 3-digit price plus a dollar
sign (4 characters, for example `$230`), the same character count as this
rerun's `$100` / `$500` test labels -- the labels tested are representative
of the real worst case, not artificially narrow.

### Rail measurement table (at 1024x640, the binding viewport)

Measured values only. Whether a given number counts as "legible" or "reads
at a glance" is the image_evaluator's call, not this report's; the two
rows marked (fact) are the exception -- a boolean containment/overlap test
and a stroke-width-vs-gap arithmetic comparison, both directly computable
from the DOM, not a subjective read.

| Item | Measured value |
| --- | --- |
| Crate stack containment (fact) | No overflow of rail bounds detected (programmatic bounding-box check); crate stack occupies 16 of the rail's 40 viewBox units (40% of rail width) |
| Quote label containment (fact) | No overflow of rail bounds detected (programmatic bounding-box check); label occupies 28.9 of 40 viewBox units (72% of rail width), measured via real `getBBox()` |
| Quote label / crate stack overlap (fact) | No overlap detected (programmatic bounding-box check) |
| Quote label rendered height | 16.0px at 1024x640 |
| Dashed-line gap, `far` scenario (bid 180 / ask 430) | 480.0px (450.0 viewBox units) apart; nearest rail 134.4px away |
| Dashed-line gap, `near` scenario (bid 305 / ask 318) | 25.0px (23.4 viewBox units) apart |
| Dashed-line gap, `tight` scenario (bid 299 / ask 300, the real 1-price-step minimum) | 1.9px (1.8 viewBox units) apart |
| Dashed-line stroke width | 2px per line (both bid and ask) |
| Stroke-width-vs-gap comparison, `tight` scenario (fact) | 1.9px gap is smaller than the 2px stroke width of a single line, so the two strokes' painted areas geometrically overlap -- this is a directly computable fact, confirmed visually in the retained `_tight` screenshots (both lines render as one alternating-color line, not two) |

All values reproduce at 1280x800 (the sanity-render viewport) with the same
viewBox-unit values: rail width 53.3px, label 38.6px/20.0px tall, `tight`
gap 2.4px -- see the capture output below for the full numbers. The
containment/overflow facts and the `tight`-scenario stroke-overlap fact hold
at both viewports because the stage's fixed 16:10 aspect ratio makes the
SVG scale uniformly (see "What the review found" above): a viewBox-unit
relationship (contained, overlapping, or not) at one viewport predicts the
same relationship at the other.

### Recorded action: no geometry constant changed

`BUY_RAIL_REGION` / `SELL_RAIL_REGION` / `RUNWAY_REGION` in
`auction_geometry.ts` are unchanged by this rerun. This is an action report,
not a judgment: the containment facts above show no crate-stack or
quote-label overflow at either supported viewport, so there was no
programmatically-detected hard failure that would have required a rail-width
change under the plan's compression order (rails first, then dock, then
band heights, runway never shrinks). If the image_evaluator's judgment pass
finds a legibility problem the containment facts do not capture (for
example, a font weight or fill color that reads poorly against the rail
tint, which this report does not measure), constant tuning is still this
role's to make in response to that verdict -- see "Constant changes" below
for the current state.

The dashed-line stroke-overlap fact at the `tight` scenario is recorded as
a candidate line-styling question (stroke width, dash pattern, or an
intentional "about to trade" convergence cue -- the original NES reference
also shows the two lines visually merging at the trade moment, which may be
the intended read) for WP4 (arena) / WP7 (trade fx) to resolve when those
lanes build the real dashed-line rendering, or for the image_evaluator to
weigh in its judgment. It is not a `auction_geometry.ts` constant, since
that module owns region rects and price-to-x math, not stroke chrome.

## Original measurement table (dock text, going price: genuine; runway share, dead band: reframed)

Re-measured with a fresh capture at the corrected 1024x640 / 1280x800
viewports (the same `_temp_rail_mock.html` pass used for the rail rerun
above; the dock-text and going-price elements were added to that same mock
rather than scaled by hand, so every number below is a real
`getBoundingClientRect()` reading, not an estimate). Verdicts are not
recorded here -- see the Role note at the top of this report; the plan's
stated floor (`>=12px` for dock text, `>=28px` working threshold for the
going price) is included for the evaluator's reference, not applied by
this report as a pass/fail judgment.

| Criterion | 1024x640 | 1280x800 | Nature of the number |
| --- | --- | --- | --- |
| Runway share of stage area | 56.00% | 56.00% | Arithmetic identity of the region constants (see "What the review found"), confirmed not broken by the render pipeline -- not an independent design proof. The plan's stated target is ~56%. |
| Trailing dead band (below timer, 576-600 viewBox units) | 4.00% | 4.00% | Arithmetic identity of the region constants, same caveat as above. The plan's stated bar is <=5%. The old design's recorded figure was 16.3% (`auction_landscape_visual_acceptance.md`, captured before the viewport supersession, so read its own viewport figures as stale and its dead-band ratio as scale-invariant). |
| Smallest dock text rendered height | 14.0px | 16.0px | GENUINE measurement (real font-metric rendering, freshly captured). The plan's stated floor is >=12px rendered at the binding 1024x640 viewport. Narrower than the original 1600x900/1200x1000 pass reported (16.00px), because that pass never hit the true binding viewport -- 1024x640 is smaller than either of its viewports. |
| Going-price legibility (rendered text bbox height) | 49.0px | 61.0px | GENUINE measurement, freshly captured. |
| Rails/dashed lines | See "Rerun: rail measurements" above | See "Rerun: rail measurements" above | Replaced -- see the rerun section; the original row was ungraded narrative with no retained evidence. |

## Constant changes

None yet. `auction_geometry.ts`'s constants
(`TOP_BAND_REGION`/`DOCK_REGION`/`BUY_RAIL_REGION`/`RUNWAY_REGION`/
`SELL_RAIL_REGION`/`TIMER_REGION`, `MAX_RAIL_CRATES`, `CRATE_GLYPH_SIZE`)
are unchanged: the programmatic containment facts above found no
crate-stack or quote-label overflow at either supported viewport, so no
hard failure forced a change under the plan's compression rule.
`node --import tsx --test tests/test_auction_geometry.mjs` stays green
(16/16, unchanged). If the image_evaluator's judgment pass returns a FAIL
this report's facts did not already surface, constant tuning (per the
plan's compression order: rails first, then dock, then band heights,
runway never shrinks) is this role's to make in a follow-up patch with a
matching node-test update.

## Evidence and artifact locations

**Mock page (the coder-role deliverable, retained, not deleted):**
`/private/tmp/claude-501/-Users-vosslab-nsh-TYPESCRIPT-mule-game/7bbdbd32-7719-4de1-b141-4fab932f05d2/scratchpad/_temp_rail_mock.html`.
This is pure SVG (see "Rerun: rail measurements" above), so a driver can
load it with any URL and viewport it chooses. State selection: append
`?bidask=far`, `?bidask=near`, or `?bidask=tight` to the file URL to select
the bid/ask scenario (default `far` if the param is omitted); worst-case
rail content (8 crates + a 4-character quote label on BOTH rails) renders
unconditionally in every scenario, so one capture per scenario covers both
the rail-fit facts and the dashed-line facts at once. Stable selectors for
every measurable element:

| Element | Selector |
| --- | --- |
| Buy rail region rect | `#region-buy-rail` |
| Sell rail region rect | `#region-sell-rail` |
| Runway region rect | `#region-runway` |
| Dock region rect | `#region-dock` |
| Top band region rect | `#region-top-band` |
| Timer region rect | `#region-timer` |
| Trailing dead-band rect | `#region-trailing` |
| Every crate glyph, both rails | `.crate-glyph` (16 total: 8 buy + 8 sell; each has `data-crate-index="0".."7"`) |
| Buy rail quote label | `#buy-rail-content-label` |
| Sell rail quote label | `#sell-rail-content-label` |
| Best-bid dashed line | `#best-bid-line` |
| Best-ask dashed line | `#best-ask-line` |
| Smallest dock text | `#smallest-dock-text` |
| Going-price text | `#going-price-text` |
| Stage box (for scale-factor computation) | `#game-stage` |

The page also exposes `window.__wpx1RailMeasurement` after load (poll with
`page.waitForFunction(() => window.__wpx1RailMeasurement !== undefined)`),
carrying the exact viewBox-unit values a driver can read directly instead
of re-deriving them from `getBoundingClientRect()`: `.scenario`,
`.bidPrice`, `.askPrice`, `.buyRail` / `.sellRail` (each with
`crateStackLeft/Right/Top/Bottom`, `labelLeft/Right/Top/Bottom`,
`labelWidth`), `.bidAsk` (`.bidX`, `.askX`).

**Screenshots (smoke check only, not the authoritative capture):** six
files under the same scratchpad directory, retained and not deleted --
`_temp_rail_1024x640_far.png`, `_temp_rail_1024x640_near.png`,
`_temp_rail_1024x640_tight.png`, `_temp_rail_1280x800_far.png`,
`_temp_rail_1280x800_near.png`, `_temp_rail_1280x800_tight.png`. These were
captured by this role while verifying the mock renders and its selectors
resolve; the authoritative capture pass for the image_evaluator to judge is
the playwright_operator's, not this report's.

All artifacts live under this session's scratchpad directory
(`/private/tmp/claude-501/-Users-vosslab-nsh-TYPESCRIPT-mule-game/7bbdbd32-7719-4de1-b141-4fab932f05d2/scratchpad/`),
a path scoped to this agent session, not a durable repo location. Binary
screenshots do not belong in git per `docs/REPO_STYLE.md`, so none of this
is committed. An earlier version of this rerun's evidence was captured at
the STALE 1600x900/1200x1000 viewports (superseded before this report was
finalized); those screenshots were deleted and replaced with the
1024x640/1280x800 set above so no stale-viewport evidence remains attached
to this report.

Smoke-check capture run output (1024x640, 1280x800; recorded as raw data,
not as pass/fail):

```
=== Viewport 1024x640, scenario far ===
stage px: 1024.0 x 640.0; scale factor 1.1
rendered crate count: buy=8 sell=8 (MAX_RAIL_CRATES=8)
buy rail: rail width 42.7px (40.0 viewBox units); label width 30.8px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 16.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
sell rail: rail width 42.7px (40.0 viewBox units); label width 30.8px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 16.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
bid/ask lines: bid price 180 ask price 430; gap between lines 480.0px (450.0 viewBox units); bid line to buy-rail edge 153.6px; ask line to sell-rail edge 134.4px
smallest dock text height: 14.0px; going price text height: 49.0px

=== Viewport 1024x640, scenario near ===
stage px: 1024.0 x 640.0; scale factor 1.1
rendered crate count: buy=8 sell=8 (MAX_RAIL_CRATES=8)
buy rail: rail width 42.7px (40.0 viewBox units); label width 30.8px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 16.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
sell rail: rail width 42.7px (40.0 viewBox units); label width 30.8px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 16.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
bid/ask lines: bid price 305 ask price 318; gap between lines 25.0px (23.4 viewBox units); bid line to buy-rail edge 393.6px; ask line to sell-rail edge 349.4px
smallest dock text height: 14.0px; going price text height: 49.0px

=== Viewport 1024x640, scenario tight ===
stage px: 1024.0 x 640.0; scale factor 1.1
rendered crate count: buy=8 sell=8 (MAX_RAIL_CRATES=8)
buy rail: rail width 42.7px (40.0 viewBox units); label width 30.8px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 16.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
sell rail: rail width 42.7px (40.0 viewBox units); label width 30.8px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 16.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
bid/ask lines: bid price 299 ask price 300; gap between lines 1.9px (1.8 viewBox units); bid line to buy-rail edge 382.1px; ask line to sell-rail edge 384.0px
smallest dock text height: 14.0px; going price text height: 49.0px

=== Viewport 1280x800, scenario far ===
stage px: 1280.0 x 800.0; scale factor 1.3
rendered crate count: buy=8 sell=8 (MAX_RAIL_CRATES=8)
buy rail: rail width 53.3px (40.0 viewBox units); label width 38.6px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 20.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
sell rail: rail width 53.3px (40.0 viewBox units); label width 38.6px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 20.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
bid/ask lines: bid price 180 ask price 430; gap between lines 600.0px (450.0 viewBox units); bid line to buy-rail edge 192.0px; ask line to sell-rail edge 168.0px
smallest dock text height: 16.0px; going price text height: 61.0px

=== Viewport 1280x800, scenario near ===
stage px: 1280.0 x 800.0; scale factor 1.3
rendered crate count: buy=8 sell=8 (MAX_RAIL_CRATES=8)
buy rail: rail width 53.3px (40.0 viewBox units); label width 38.6px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 20.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
sell rail: rail width 53.3px (40.0 viewBox units); label width 38.6px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 20.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
bid/ask lines: bid price 305 ask price 318; gap between lines 31.2px (23.4 viewBox units); bid line to buy-rail edge 492.0px; ask line to sell-rail edge 436.8px
smallest dock text height: 16.0px; going price text height: 61.0px

=== Viewport 1280x800, scenario tight ===
stage px: 1280.0 x 800.0; scale factor 1.3
rendered crate count: buy=8 sell=8 (MAX_RAIL_CRATES=8)
buy rail: rail width 53.3px (40.0 viewBox units); label width 38.6px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 20.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
sell rail: rail width 53.3px (40.0 viewBox units); label width 38.6px (28.9 viewBox units, 28.9 viewBox units from getBBox); label height 20.0px; label overflows rail (rendered px check): right=false left=false; label overflows rail (viewBox check): false; crate stack overflows rail bounds: false; label overlaps crate stack (viewBox check): false
bid/ask lines: bid price 299 ask price 300; gap between lines 2.4px (1.8 viewBox units); bid line to buy-rail edge 477.6px; ask line to sell-rail edge 480.0px
smallest dock text height: 16.0px; going price text height: 61.0px
```

## Summary for the image_evaluator

This report hands off artifacts and measurements, not a verdict. Recap of
what is and is not established:

- Runway share (56.00%) and trailing dead band (4.00%) are arithmetic
  identities of the frozen region constants -- true by construction at any
  16:10 viewport, not evidence of good design.
- Dock text (14.0px at 1024x640) and going-price (49.0px at 1024x640)
  rendered heights are genuine, freshly-measured font metrics against the
  plan's stated floors (12px, ~28px working threshold) for the evaluator to
  judge.
- The 8-crate stack and 4-character quote label on both rails produce no
  programmatically-detected overflow or overlap at either supported
  viewport (a fact, not a judgment) -- whether that reads as legible and
  well-composed is the evaluator's call.
- At the `tight` bid/ask scenario, the two dashed lines' strokes
  geometrically overlap (1.9px gap versus 2px stroke width, a fact) and
  render as one line in the retained screenshots; whether that is a defect
  or an intentional trade-convergence cue is also the evaluator's call.
- The mock is pure SVG; DOM-layered content is out of this spike's scope.

No `auction_geometry.ts` constant has been changed. If the evaluator
returns FAIL on a criterion this report's facts already cover (rail
containment, dashed-line overlap), or on one this report cannot cover (a
subjective legibility read), constant tuning is this role's to make next,
per the plan's compression order (rails first, then dock, then band
heights, runway never shrinks) and the 12px-at-1024x640 dock-text floor.
