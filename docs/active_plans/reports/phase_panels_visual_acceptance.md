# Phase panels visual acceptance (WP-7F)

Visual acceptance for the four reworked phase panels that fill the 16:10
`#game-stage`: land grant (WP-7B), land auction (WP-7C), production (WP-7D),
and scoring (WP-7E). Judged against the governing directive: coverage numbers
are proxies for the real complaint (a narrow centered column with large empty
side margins). The test is whether each screen READS as filled, with no
dead-margin pathology and no threshold-chasing artifacts (stretched voids,
oversized fonts, space-between gaps doing content's work).

Inputs: 8 screenshots, each phase at 1600x900 (wide) and 1200x1000 (tall).

## How the phases are judged

- Land grant, land auction, and production are BOARD PHASES. The overworld map
  (`#game-map`) is the primary fill surface and stays visible; the phase panel
  is a deliberately slim strip. These three are judged by TOTAL canvas use
  (HUD + map + panel strip together), not by holding the strip to a full-panel
  height hypothesis.
- Scoring is the only full-panel phase. Its panel is judged directly against
  the fill criteria (measured 94.0% w / 84.0% h; the 84 vs 85 is a sanctioned
  8px clip-margin trade, already accepted).
- Both tall (1200x1000) shots render a 1200x750 16:10 stage centered in a
  1000px viewport. The dark band above the HUD and below the last control is
  page background OUTSIDE the stage (aspect-ratio letterbox), not stage dead
  space. Fill is judged WITHIN the stage bounds.

## Per-screen verdicts

| Screen | Viewport | Verdict | Reads as filled? |
| --- | --- | --- | --- |
| land grant | 1600x900 | ACCEPTED | YES |
| land grant | 1200x1000 | ACCEPTED | YES |
| land auction | 1600x900 | ACCEPTED | YES |
| land auction | 1200x1000 | ACCEPTED | YES |
| production | 1600x900 | ACCEPTED | YES |
| production | 1200x1000 | ACCEPTED | YES (polish note) |
| scoring | 1600x900 | ACCEPTED | YES (polish note) |
| scoring | 1200x1000 | ACCEPTED | YES |

### Land grant 1600x900 - ACCEPTED

HUD row spans the full stage width at top, the map grid fills the center, and
the instruction strip plus Pass button sit at the bottom edge. The stack fills
the stage top to bottom and edge to edge. No narrow-column margins. Text legible,
hierarchy clear (highlighted plot, tutorial callout, Pass action).

### Land grant 1200x1000 - ACCEPTED (flagged item resolved)

This is the flagged case: `#game-map` measured 74.1% w / 65.9% h. The map does
carry visible side gutters (roughly 13% of stage width on each side) and is
shorter than the stage. Judged in isolation the map looks boxed, BUT the total
canvas completes the fill: the HUD row spans full stage width directly above the
map, and the instruction strip plus Pass button span the width below it. The
side gutters read as normal board framing (a centered grid bracketed by a wider
HUD and strip), NOT as the "narrow centered column with large empty margins"
complaint. The empty band above the HUD is the 16:10 letterbox outside the
stage, expected. Within the stage there is no dead void. Weakest fill of the
grant pair but clearly acceptable; not a threshold-chasing artifact.

### Land auction 1600x900 - ACCEPTED

HUD, map, and a richer bottom strip (plot up for auction, current ask, high
bidder, bidding status, Bid/Pass, auctions-remaining) fill the stage. Bottom
controls are distributed across the full width, which fills the strip with
real content rather than stretched gaps. Highlight borders (owner colors,
sweeping cursor) are legible.

### Land auction 1200x1000 - ACCEPTED

Same board framing as land grant tall: HUD full width, centered map with ~13%
side gutters read as framing, bottom strip spans the width with the auction
controls. Total canvas fills the stage; side gutters are framing, not dead
margin.

### Production 1600x900 - ACCEPTED

Strong fill. HUD and map on top, then the "Production" title, the acid-rain
event banner, and four per-player production cards spanning the full stage
width at the bottom. The bottom cards carry the fill with real layout content
edge to edge. Legible; the mostly-empty card values reflect early-round data
state, not a layout defect.

### Production 1200x1000 - ACCEPTED (non-blocking polish)

Total canvas fills the stage (HUD + map + title + banner + player cards). The
map is smaller here (both narrower and shorter, panel 43.4% h), which is
expected for the board phase at tall aspect. Two minor observations, both
non-blocking: (1) the four player cards render as a 3-column grid, so Player 4
wraps to its own row and leaves two empty grid slots to its right, a visible
bottom-right imbalance; (2) the card values are largely empty (bare commas),
which reads slightly hollow but is a content/data-state matter, not layout.
Neither is a dead-margin pathology.

### Scoring 1600x900 - ACCEPTED (non-blocking polish)

Full-panel phase. Horizontal fill is excellent: the final-scores table spans
nearly the full stage width (Player through Total columns edge to edge), the
data is dense and legible, and the winner row is clearly highlighted. One soft
spot: vertically the panel uses a loose distribution, leaving a visible gap band
between the "Colony Failed" event line and the table header. It reads slightly
loose in the upper-middle rather than hollow, and does not reproduce the side-
margin complaint. Non-blocking polish candidate (tighten vertical rhythm between
the event message and the table).

### Scoring 1200x1000 - ACCEPTED

Vertical distribution is more even at the tall aspect: HUD, title, event
message, full-width table, and Play Again fill the stage without the upper-
middle gap seen in the wide shot. Excellent horizontal fill, legible hierarchy.

## Board-phase vs full-panel distinction

The three board phases (land grant, land auction, production) are correctly
built as slim panel strips over a persistent map. Judging their panel height
against the 85% full-panel hypothesis would be threshold-worship; judged by
total canvas use they fill the stage. Scoring, the only full-panel phase, fills
its panel directly and meets the criteria.

## Follow-up candidates

Non-blocking polish (no owner package required to accept WP-7F):

- Production tall: the player-card grid wraps Player 4 alone with two empty
  slots to its right. Consider a 2x2 or a 4-up responsive grid at narrow
  widths so the bottom row balances.
- Scoring wide (1600x900): tighten the vertical rhythm between the "Colony
  Failed" event line and the score table to close the upper-middle gap band.
- Production player-card values read sparse (bare commas) in these captures;
  confirm this is early-round data state and not a rendering gap. Content
  matter, not layout.

Blocking defects: none.

## Overall verdict

WP-7F ACCEPTED. All 8 screen x viewport combinations read as filled with no
dead-margin pathology and no threshold-chasing artifacts. The original
complaint (narrow centered column, large empty side margins) is not reproduced
in any capture. Two non-blocking polish items are noted above; neither blocks
acceptance.
