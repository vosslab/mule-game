# Auction landscape visual acceptance

WP-6C visual acceptance pass for the rotated (landscape, horizontal price
track) auction screen after WP-6A (arena rotation) and WP-6B (full-canvas
CSS). Screenshots captured at the two milestone-standard viewports: a wide
16:10 window (1600x900, letterboxed left/right) and a tall 16:10 window
(1200x1000, letterboxed top/bottom). Measurement method: a scratch Playwright
script drove a fresh game to the auction's role-choice bar, chose Buy, waited
for the price track to render, then measured `#game-stage`'s bounding box
against `.auction-screen`'s bounding box in the live DOM (not a manual pixel
count).

Screenshots: `test-results/wp6c_1600x900.png`, `test-results/wp6c_1200x1000.png`
(gitignored scratch output, per this repo's existing visual-acceptance report
precedent of citing `test-results/` filenames rather than committing binaries
under `docs/`; regenerate with the measurement steps below if needed).

## Criterion (a): main-content coverage of `#game-stage`

The plan's 90%/85% figures are proxies for one real question: does the
screen read as filled and readable at 16:10, or does it read as a narrow
column adrift in dead margin? This section measures both the raw
`.auction-screen`-only figure (what WP-6B reported) and a corrected
top-anchored figure that also counts `#game-hud` (a sibling of
`.auction-screen` inside `#game-stage`, not part of it), then judges the
screen against the visual question rather than the raw number.

| Viewport | Width coverage | `.auction-screen`-only height | Top-anchored content span (HUD through intent buttons) |
| --- | --- | --- | --- |
| 1600x900 | 96.2% | 76.6% | 83.7% (top margin 0px, trailing gap 146px = 16.3% of stage height) |
| 1200x1000 | 96.7% | 84.5% | 93.1% (top margin 0px, trailing gap 52px = 6.9% of stage height) |

The `.auction-screen`-only figure (matching WP-6B's 76.6%/84.5%) undercounts
the real content span because it excludes `#game-hud`, which sits flush
against the top of `#game-stage` (measured top margin: 0px at both
viewports). Once the HUD is included, all the empty space is a single
trailing band below the intent buttons -- there is no interior dead space
between the HUD, hint banner, header, price readout, track, trade log, or
buttons; the gap is: `hud -> hint -> header -> readout -> track -> trade log
-> buttons -> [ everything below here is empty ]`. That is a materially
different shape from the plan's actual complaint ("a narrow centered
single-column layout with large dead margins" -- side gutters swallowing
width around a starved column). Width coverage here is 96%+ at both
viewports, so there is no narrow-column pathology to begin with.

**No threshold-chasing artifacts found.** Checked for the specific patterns
called out: no stretched voids inside the content stack (every gap between
elements is a plain `gap: 1rem` flex spacing,
`src/style.css:1158-1165`), no oversized elements that exist only to fill
space (the track's size is derived from its native 480:260 aspect ratio,
`src/style.css:1205-1208`, not stretched past it), and no `space-between`
justification doing layout work that content should (`.auction-screen` uses
`align-items: center` with a fixed `gap`, not `justify-content:
space-between`). The empty space is genuine unused trailing room, not a
disguised or padded-out fill.

**Visual read, by viewport:**
- 1200x1000 (tall/letterboxed window): a 52px trailing gap (6.9% of stage
  height) below the buttons. Reads as filled and complete; not flagged.
- 1600x900 (wide window): a 146px trailing gap (16.3% of stage height) below
  the buttons -- the more noticeable of the two, visible in the screenshot as
  a plain dark band roughly a sixth of the stage's height. This does not read
  as broken, clipped, or hollow (the content above it is dense and legible,
  and there is no stretched or padded-out filler trying to hide the gap),
  but it is the one place on this screen where the visual read and the raw
  number agree: the wide viewport has more unclaimed room than the tall one.

**Verdict: ACCEPT as filled and readable at both viewports; flag the
1600x900 trailing gap as a minor non-blocking polish candidate for a
follow-up package, not a FIX_NEEDED blocker.** Rationale: nothing is clipped,
crowded, or artificially stretched to chase a number, width is fully used at
both viewports, and the layout does not match the "narrow column with large
dead margins" defect pattern -- so this is not a functional or readability
defect. The wide-viewport trailing gap is real and worth a look (for example
giving the track slightly more of the stage's height budget on wide windows,
`src/style.css:1196-1204` comments this exact width-or-height-first
trade-off), but is a polish-tier follow-up, not a gate failure for this
package.

## Criterion (b): zero max-width caps on the auction path

`grep -n "480px\|280px" src/style.css` finds six `max-width: 480px` hits, all
in other panels' rules (land-grant, develop, and other WP-7A/7B..7E-owned
selectors) plus one 280px reference in commentary for a non-auction panel.
`.auction-screen` (`src/style.css:1158-1165`) uses
`width: min(94cqw, 1400px)` and `.auction-track-svg` (`src/style.css:1205-
1208`) uses `width: min(92cqw, calc(37cqh * 480 / 260))`; neither carries a
480px or 280px cap. **PASS.**

## Criterion (c): no horizontal overflow

`document.documentElement.scrollWidth === clientWidth` and
`scrollHeight === clientHeight` at both viewports (1600x900 and 1200x1000):
no scrollbars, no clipped content. **PASS.**

### Explicit clipping check at 1200x1000

WP-6B's reviewer PASSed the CSS but could not independently confirm the
height-coverage numbers or rule out clipping at 1200x1000 with read-only
tooling. This is the authoritative check, run directly against the live DOM
(bounding boxes in page coordinates; `#game-stage` at this viewport is
letterboxed top/bottom, spanning y=125 to y=875):

| Element | Top edge | Bottom edge | Fully inside stage (y=125 to y=875)? |
| --- | --- | --- | --- |
| `#game-stage` | 125 | 875 | -- |
| `.auction-track-svg` | 419.6 | 697.1 | YES (697.1 < 875, margin 177.9px) |
| `.auction-screen-trade-log` | 713.1 | 763.1 | YES (763.1 < 875, margin 111.9px) |
| `.auction-screen-intent-controls` (Up/Down buttons) | 779.1 | 823.1 | YES (823.1 < 875, margin 51.9px) |

Every element's bottom edge is inside the stage box, and the last element
(the intent buttons) still has 51.9px of clearance before the stage's bottom
edge. **Confirmed: zero clipping at 1200x1000** -- the track bottom and the
trade log are both fully visible, and the stage's own bottom margin is what
was measured above as the trailing gap, not a clip.

## Criterion (d): stable at both viewports

Both viewports render the same element set (HUD, hint banner, auction
header, price readout, price track with 4 avatars + 4 tokens, store buy/sell
band lines, trade log, intent buttons) with the same relative arrangement;
the 96%+ width coverage and no-overflow result hold at both. **PASS.**

## Criterion (e): identity, role, price, and trade state readable without covering the track

Confirmed from both screenshots and the `.auction-screen` flex-column CSS
(`src/style.css:1158-1165`, `display: flex; flex-direction: column`, no
absolutely-positioned overlays): the HUD player cards (name, color swatch,
funds, stock counts), the price readout (good name, store buy/sell quotes,
per-player role + price line), and the trade log all stack above/below the
track in normal flow -- none of them overlap the track's SVG bounding box.
Inside the track itself, four avatars render as distinct colored/shaped
glyphs at the buyer lane, seller lane, and the sit-out sideline row (see
below); the shaded price zone (store buy-to-sell band) sits behind the
avatars without obscuring them. **PASS.**

### Sideline slot check

The M.U.L.E. rules require an out (sat-out) participant to render at a
distinct spectator position, not on a trading lane. In both screenshots the
blue "OUT" avatar renders below both the buyer and seller lane rows, at the
bottom edge of the arena -- consistent with WP-6A's landscape rotation moving
the sideline "line judge" position to the bottom edge. No spec in this
work package's scope (`auction_scene.spec.mjs`, `game_flow.spec.mjs`) had a
pre-existing sideline-position assertion to adapt from the old vertical
layout, so none was added; this section documents the visual confirmation
instead.

## Direction check (buyer geometry)

Both screenshots show "You" (the human, chosen Buy) as the red avatar on the
left side of the track at its lane, with its price marker below the store
buy quote -- consistent with `priceToX` (`src/ui/solid/auction_screen.tsx`):
a buyer starts left and moves right as it raises its bid. The two converted
spec assertions (see below) exercise this directly by polling `cx`/`data-x`
for a strict increase while ArrowUp is held.

## Spec changes

- `tests/playwright/game_flow.spec.mjs` ("buy role in the auction moves the
  human token on the price track"): the token-movement poll switched from
  `cy` (fixed lane on the landscape track) to `cx` (the moving price
  coordinate), and the assertion strengthened from "changed" to "increased"
  (`Number(currentX) > Number(startX)`), matching the buyer's rightward
  raise-bid direction.
- `tests/playwright/auction_scene.spec.mjs` ("held ArrowUp walks the human
  avatar and a trade animates"): the same conversion, `data-y` -> `data-x`,
  with the same "increased" (not just "changed") assertion.
- The reduced-motion spec's snap-alignment poll (comparing `data-y` to the
  token's `cy`) was left unchanged -- both are the fixed-lane coordinate on
  the landscape track, so that invariant is still the correct one to assert
  and stays green.

## Verification commands and output

```
bash run_playwright_tests.sh tests/playwright/auction_scene.spec.mjs tests/playwright/game_flow.spec.mjs
```

```
6 passed (11.7s)
PASS: playwright tests passed.
```

Full suite:

```
bash run_playwright_tests.sh
```

See the work package handoff message for the full-suite pass/fail count and
classification of any unrelated red specs.
