# Town street visual acceptance (WP-3C)

## Update (WP-5/WS-5, 2026-07-11): resolved -- M3 art gate is green

The palette-conformance blocker below was resolved via the preferred route this
report recommended: `src/ui/sprites/palette.ts` now carries `townStreet`
(`#26241e`) and `townStreetWorn` (`#1c1a16`) as named town tokens, so the
street surface and worn patches are first-class palette colors instead of
off-palette CSS darks. The coverage floor for the `town scene fixture` case in
`tests/playwright/visual_render.spec.mjs` was recalibrated from 0.4 to 0.24 as
recommended (about 20% margin below the measured 0.3064), keeping the 0.9
ceiling. With both fixes landed, `visual_render.spec.mjs`'s town on-palette
test passes green (98/98 across the full Playwright suite). The M3 art gate
described as blocking below is satisfied; the original blocking analysis is
kept below, superseded, for the historical record of how the gate got here.

Automated visual acceptance of the rebuilt mode-composed scrolling street
(M3, WP-3A/3B). Evaluator report only: it records measurements and judgments
and recommends threshold and follow-up actions. It does not edit source or
tests.

## Summary verdict

- Three-second-read checklist: PASS on the shipped in-game town for every item
  that the town chrome owns; two items (time-left, tow-state) are shown only in
  the in-game town, not in the isolated `?demo=town` fixture that the art gate
  screenshots.
- Facade text contrast: PASS, comfortably above the 5.5:1 house target.
- Composition: PASS. Beginner composes 5 facades (mining, energy, farm, corral,
  pub); standard adds the Land Office (6). Width is derived from the list, so
  beginner is genuinely shorter with no dead frontage.
- Grid lines in the street: PASS. Zero editor-grid lines; the surface is a flat
  dark lane with soft worn patches.
- Fill decision: HONEST on coverage (recalibrate the coverage floor), but this
  is NOT a clean single-threshold change. The same art gate also checks palette
  conformance at 0.95, and the town currently measures ~0.34 there. Recalibrating
  only the coverage floor would immediately expose the hidden conformance
  failure. See "Fill decision" and "Palette conformance" below.

## What was captured

Screenshots and per-image metrics are under
[docs/screenshots/town_wp3c/](../../screenshots/town_wp3c/) with raw numbers in
[measurements.json](../../screenshots/town_wp3c/measurements.json). Capture was
scripted against a freshly built `dist/` (rebuilt with `build_github_pages.sh`
before capture), served over a random port, with `prefers-reduced-motion:
reduce` and fixed seed 33 for the standard real-game runs.

- Beginner via the `?demo=town` fixture (the same fixture the art gate uses),
  both supported viewports (1280x800 and 1200x750), avatar at spawn and after
  walking. The fixture remounts on reaching an endpoint, so its endpoint frames
  match spawn.
- Standard via a real seed-33 game driven to the human develop turn and into
  town, both viewports, spawn and left endpoint; one extra frame nudged right to
  bring the Land Office into view
  ([standard_1280x800_landoffice.png](../../screenshots/town_wp3c/standard_1280x800_landoffice.png)).
- An exact reproduction of the failing art-gate measurement
  ([visual_render_repro_demo_1280x800.png](../../screenshots/town_wp3c/visual_render_repro_demo_1280x800.png)).

Note: the standard "mid"/"right" walk frames crossed the endpoint exit and
returned to the overworld (the real game exits town at an endpoint), so those
JSON rows are overworld, not town, and were not used for town judgments. Spawn,
left, and the land-office nudge are the valid standard town frames.

## Three-second-read checklist (per item)

Judged from the in-game standard frames (spawn, left, land-office) and the
beginner fixture frames.

| Item | Verdict | Evidence |
| --- | --- | --- |
| Where am I (location) | PASS | Persistent facade labels ("M.U.L.E. Corral", "Pub", "Land Office", "Mining/Energy/Farm Outfitting"), top standings strip, bottom chrome strip all read as a colony town. |
| Which way the street continues | PASS | Endpoint exit arrow markers render (left arrow in the left frame; right arrow in spawn/land-office frames); facades continue past the camera crop. |
| Which building is nearest | PASS with gap | Facades are individually legible by label + emblem + trim color, so recognition works. The chrome's dedicated nearest-storefront field (`[data-town-nearest]`) is still an empty WP-3B/4A stub, so the HUD does not yet name the nearest building. Out of WP-3C scope; noted for WP-4A. |
| Door open or closed | PASS (weak contrast) | Closed doors show two flush leaves plus a handle; the open corral door in the spawn frame shows the leaves slid apart over a dark frame. Door state is legible, but door-vs-plate fill contrast is the weakest element (see contrast table). |
| Time remaining | PASS in-game only | The in-game bottom chrome shows a draining time bar plus "Ticks left: NN". The `?demo=town` fixture renders no chrome strip, so the art-gate screenshot does not show time. |
| Tow state | PASS in-game only | The in-game chrome shows "Tow: none". Same fixture caveat as time. |

Identity and style: PASS. Distinct emblems (gear, lightning, farm helmet, mule,
mug, land document), per-facade colored header trim, and ambient price/stock
text give each facade a recognizable identity. The look is Planet-inspired
(industrial metal facades, ambient prices, emblem badges) but identifiably our
own (dark blue night palette, colored trim headers, two-leaf sliding doors, our
robot avatar) -- not a Planet M.U.L.E. copy.

## Composition (presence and absence)

| Mode | Facades (DOM order) | World width | Camera scrolls (>576) |
| --- | --- | --- | --- |
| Beginner (fixture) | mining, energy, farm, corral, pub | 964 | yes |
| Standard (real game) | mining, energy, farm, corral, pub, land | 1136 | yes |

Beginner contains no Land Office and no Assay Office; standard adds only the
Land Office. Beginner's width (964) is smaller than standard's (1136), derived
from the composed list -- the beginner street is genuinely shorter, not padded,
and there is no gap where standard's Land Office would sit. PASS.

## Legibility (DOM-measured)

Facade signage is 13px and ambient text 11px in the 576-wide camera viewBox.
The SVG scales that viewBox to roughly 1090-1102px on the supported viewports
(scale ~1.9x), so signage renders at roughly 24-25px (weight 700) and ambient
price text at roughly 21px. Both are clearly legible in every captured frame at
both 1280x800 and 1200x750. PASS.

Grid lines: the street surface is a single flat dark lane with soft, low-opacity
elliptical worn patches and a baseline curb -- no editor-grid lines. Facade
corrugation seam lines are intentional architectural texture, not a grid. PASS.

## Contrast (WCAG per docs/COLOR_CONTRAST_ACCESSIBILITY.md)

Computed with the documented relative-luminance and (L1+0.05)/(L2+0.05) formula.
House target 5.5:1; WCAG AA text floor 4.5:1; WCAG non-text (1.4.11) floor 3:1.

| Pair | Ratio | Text AA (4.5) | House (5.5) |
| --- | --- | --- | --- |
| Facade label #f5f5ff on plate #262640 | 13.52:1 | pass | pass |
| Ambient price #c7c7e6 on plate #262640 | 8.89:1 | pass | pass |
| Facade label #f5f5ff on sky band #101024 | 17.29:1 | pass | pass |
| Ambient #c7c7e6 on sky band #101024 | 11.36:1 | pass | pass |

Non-text component pairs (WCAG 1.4.11, 3:1 floor):

| Pair | Ratio | Non-text (3:1) |
| --- | --- | --- |
| Door panel fill #52527a vs plate #262640 | 1.99:1 | fail |
| Door panel stroke #7a7aa8 vs plate #262640 | 3.61:1 | pass |
| Emblem badge stroke #45456a vs plate #262640 | 1.61:1 | fail |

All facade TEXT clears the house target with margin. The door and emblem-badge
outlines are non-text and their state is still legible in the screenshots
(closed leaves plus handle; open leaves slide apart; badge emblem carries the
identity), but the door panel fill sits below the 3:1 non-text floor against the
plate. Non-blocking polish: raise the door leaf fill or plate contrast so the
door-vs-plate pair clears 3:1.

## Fill decision: HONEST (recalibrate coverage), coupled with a conformance blocker

Measured full-page coverage (fraction of pixels farther than deltaE 8 from
bgDeep `#1a1a2e`, stride 3, the art gate's own math):

| Frame | Coverage |
| --- | --- |
| Art-gate repro (fixture, beginner, 1280x800, spawn) | 0.3064 |
| Fixture beginner 1200x750 (spawn) | 0.288 |
| In-game standard 1280x800 (spawn) | 0.341 |
| In-game standard 1200x750 (spawn) | 0.325 |

The art gate currently fails only its coverage floor of 0.4 (the conformance
assertion runs after it and is never reached). The low coverage is HONEST, not a
narrow-column layout defect:

- The town uses a deliberately dark night-industrial palette. Its sky/facade
  band (#101024, deltaE 4.8 from bgDeep), town container (#14142a, 3.4), and
  facade plate (#262640, 7.0) all sit within the deltaE-8 background tolerance,
  so they register as "background" even though they are painted content. The
  street lane and worn patches are also very dark. A dark side-view street will
  never approach the old grid town's 0.7363.
- The 0.4 floor was calibrated from the old 9x5 grid town, whose viewport was a
  wall of 45 gold cells. That number does not describe the new scrolling street.
- The shipped in-game town fills the 16:10 canvas well: a top standings strip,
  full-width looming facades that fill most of the SVG height, the notice and
  End-turn control, and a bottom town-chrome strip (time bar, ticks, money,
  tow). It is not a narrow centered column with dead margins.

Caveat worth flagging (non-blocking): the art gate screenshots the isolated
`?demo=town` fixture, which renders `TownScene` alone with no game_screen chrome,
so it leaves a large near-background empty band below the End-turn button. That
band is a fixture artifact, not the shipped screen. The fixture will always read
sparser than the game; the coverage floor is being applied to a chrome-less
fixture.

Recommended coverage recalibration (for the frame the test actually measures --
the fixture at 1280x800, spawn): measured 0.3064 -> set the floor to 0.24 (about
a 20% margin below the measured value), keep the 0.9 ceiling. This is not
threshold-chasing: the design legitimately renders darker and sparser than the
retired grid town, and 0.24 still catches a blank or collapsed render while
admitting the real scene. Also update the test's measured-value comment to the
new number and rationale.

## Palette conformance: currently fails the 0.95 bar (measure it, per WP-3C)

Per the WP-3C instruction to confirm palette conformance still passes 0.95, it
was measured with the art gate's own function. It does NOT pass.

| Frame | Palette conformance |
| --- | --- |
| Art-gate repro (fixture, 1280x800, spawn) | 0.338 |
| In-game standard 1280x800 (spawn) | 0.343 |

Root cause (deltaE of each town structural color to its nearest non-background
palette token, matching the metric that excludes bgDeep and textOnLight):

- Street surface `#26241e`: nearest token terrainMountain3 at 21.1 -> OFF (>20).
- Worn patches `#1c1a16`: nearest token bgPanel at 20.5 -> OFF (>20).
- Baseline curb `#3a382e`: terrainMountain3 at 13.4 -> on.
- Facade plate `#262640`, sky band `#101024`, container `#14142a`, door/emblem
  frame `#14142a`: all within deltaE 8 of bgDeep, so they count as background
  and are excluded from the conformance denominator entirely.
- Door panel `#52527a` (bgTrackAxis 7.0), stroke `#7a7aa8` (terrainRiver 19.1),
  facade stroke `#45456a` (bgTrackAxis 5.0), labels and ambient text: all on.

So the large-area street lane and its worn patches are the dominant off-palette
contributor: they are just past the 20-deltaE conformance threshold, and they
cover much of the non-background pixels. The town's architectural colors live in
`src/style.css`, not in `src/ui/sprites/*.ts`, so `tests/test_sprite_palette.mjs`
does not govern them; the pixel conformance metric was calibrated on the
palette-driven sprite/terrain/title galleries (0.98-0.999) and does not fit a
CSS-styled architectural scene.

This is the same shape of mismatch as coverage: a metric tuned to the old town.
Because it is currently masked behind the coverage failure, resolving only the
coverage floor would surface it. Route one of the two decisions below; the town
gate should not be marked passed until both thresholds are consistent.

- Preferred (fix the design, keep the gate meaningful): add the town's
  architectural fills -- at minimum the street surface `#26241e` and worn patch
  `#1c1a16`, and ideally the plate/sky/container darks -- to `palette.ts` as
  named town tokens, then keep the 0.95 conformance bar. This makes the town's
  colors first-class shared-palette tokens and keeps the conformance gate honest.
  Small, bounded WS-5 change owned by a coder.
- Alternative (recalibrate, weaker): lower the town conformance bar to about
  0.30 with a written rationale that the town uses CSS architectural colors
  outside the sprite palette. This erodes the gate's meaning and is not
  recommended over adding the tokens.

## Recommendations (routing)

1. Coverage: recalibrate the `town scene fixture` coverage floor from 0.4 to
   0.24 (keep the 0.9 ceiling) and refresh the measured-value comment. Tester
   task (do not have this evaluator edit the spec).
2. Palette conformance: decide between adding town color tokens to `palette.ts`
   (preferred, coder) and lowering the conformance bar (weaker). This must land
   with the coverage change so the town gate is internally consistent.
3. Non-blocking polish: raise door-leaf/plate contrast to clear the 3:1 non-text
   floor; wire the chrome nearest-storefront field (currently a WP-4A stub) for
   the HUD "nearest building/status" requirement.

## Blocking vs non-blocking

- Blocking for the M3 gate as written: the art gate cannot go green by lowering
  the coverage floor alone; the palette-conformance failure must be resolved in
  the same test edit (recommended: add town color tokens).
- Non-blocking polish: door-vs-plate contrast; nearest-storefront HUD field;
  optionally pointing the art gate at the in-game town instead of the chrome-less
  fixture so its coverage reflects the shipped screen.
