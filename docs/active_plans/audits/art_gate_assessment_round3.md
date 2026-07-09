# Art gate assessment round 3

Verification pass over the round-2 report
[docs/active_plans/audits/art_gate_assessment_round2.md](art_gate_assessment_round2.md).
Round 2 graded PASS-WITH-FIXES and named one MUST-FIX, three SHOULD-FIX, and
six POLISH items. The fix lane has since applied the round-2 findings; this
round checks each one against the fresh v2 captures and judges from the pixels
observed, not from the fix lane's claims.

Captures reviewed with the Read tool:

- `output_smoke/gameplay/04_overworld_walk_v2.png`
- `output_smoke/gameplay/05_town_scene_v2.png`
- `output_smoke/gameplay/09_production_yields_v2.png`
- `output_smoke/art_gate/title_screen_live_v2.png`
- `output_smoke/art_gate/title_gallery_v2.png`
- `output_smoke/art_gate/town_gallery_v2.png`

## Review limitation

- No pixel-level contrast tool was run in this pass; grades are visual at the
  rendered 2x scale, same as rounds 1 and 2.
- Two round-2 POLISH items (scoring screen, auction arena) target screens with
  no v2 capture in this round's inputs, so they are marked CANNOT-VERIFY, not
  guessed.

## Finding-by-finding verdicts

Verdicts: CLOSED (fix visible in a capture), STILL-OPEN (defect still visible),
CANNOT-VERIFY (no capture exercises the screen).

| Round-2 finding | Rank | Expected fix | Observed in | Verdict |
| --- | --- | --- | --- | --- |
| Town scene draws duplicate instruction line and duplicate End turn button | MUST-FIX | One instruction, one control set | 05_town_scene_v2 | CLOSED |
| Overworld terrain is flat color with no texture or peak-count overlays | SHOULD-FIX | Grass, river, peak-count, town textures on live map | 04_overworld_walk_v2, 09_production_yields_v2 | CLOSED |
| Installed mules carry no outfit icon; black hexagon marker weak | SHOULD-FIX | Badge produced resource on placed mules | 09_production_yields_v2 | CLOSED |
| Green mule on same-hue terrain lacks a keyline | SHOULD-FIX | Extend keyline or rim to mules | 09_production_yields_v2 | CLOSED |
| Title planet cropped hard at top frame edge | POLISH | Compose planet fully in frame | title_screen_live_v2 | STILL-OPEN |
| Scoring screen sparse, full-tint score text | POLISH | Color-dot plus white-text pattern | none | CANNOT-VERIFY |
| Production readout clipped, low-contrast coral text | POLISH | Fit viewport, raise contrast | 09_production_yields_v2 | STILL-OPEN |
| Auction arena large empty, unlabeled price axis | POLISH | Numeric axis or tighter arena | none | CANNOT-VERIFY |
| Assay-office glyph (glasses) least self-evident | POLISH | Clearer building icon | town_gallery_v2 | STILL-OPEN |
| Landing ship small and plain | POLISH | Larger, more detailed ship | title_screen_live_v2, title_gallery_v2 | CLOSED |

## Evidence per finding

### Town duplicate controls (MUST-FIX) CLOSED

- 05_town_scene_v2 shows exactly ONE instruction line, "Walk to the corral to
  buy a M.U.L.E.", and ONE "End turn" button below the town interior.
- The overworld footer that previously double-drew is gone. Store counters
  read by icon shape (green food chevron, yellow energy bolt, gray smithore
  lump, pink crystite diamond); avatar keyline present on the gold floor.

### Overworld terrain textures (SHOULD-FIX) CLOSED

- 04_overworld_walk_v2 and 09_production_yields_v2 both render textured
  terrain: plains carry grass/tree tuft motifs, river tiles carry ripple
  lines, and mountains carry a peak-count overlay.
- Mountain tiers now separate by peak count, not fill darkness alone: single-
  peak, two-peak, and darker three-peak tiles are distinguishable. This is the
  second signal the round-2 SHOULD-FIX asked for.
- The town tile renders building silhouettes rather than a flat gold fill.

### Installed-mule outfit badges (SHOULD-FIX) CLOSED

- 09_production_yields_v2 badges every placed mule: the coral mule on the
  owned plains plot carries a green food diamond, and the cyan, green, and
  pink mules carry a gray ore-chunk (smithore) badge in the tile corner.
- The round-2 black hexagon deposit marker with weak color identity is not
  present in this capture; the corner marker now reads as the gray ore-chunk
  outfit badge.

### Mule keyline on same-hue terrain (SHOULD-FIX) CLOSED

- In 09_production_yields_v2 all four installed mules render with a white
  keyline halo, including the green mule, so the keyline fix now extends to
  mules and not only species avatars.
- The exact round-2 scenario (green mule on a green plains plot) is not
  reproduced here (the green mule sits on a river tile), but the universal
  keyline on mules resolves the underlying same-hue concern.

### Title planet crop (POLISH) STILL-OPEN

- title_screen_live_v2 still crops the ringed planet hard at the top frame
  edge; roughly the top third is off canvas. Non-blocking, but unchanged from
  round 2.

### Production readout (POLISH) STILL-OPEN

- 09_production_yields_v2 shows the per-player production line in coral tint
  clipped at the very bottom of the frame ("Player 1: food 4, energy 0,
  smithore 0, crystite 0" partially cut). Low-contrast coral body text on dark
  and viewport clipping both persist. Non-blocking.

### Assay-office glyph (POLISH) STILL-OPEN

- town_gallery_v2 still renders the assay office with the glasses glyph, the
  least self-evident building icon. Non-blocking.

### Landing ship (POLISH) CLOSED

- title_screen_live_v2 and title_gallery_v2 render a larger ship with an
  arrow/rocket body, a gold exhaust flame, and a window detail, an improvement
  over the round-2 "small and plain" silhouette.

## New regressions

- No blocking regressions observed. Terrain textures do not harm text
  readability: footer and production text sit on the dark background below the
  map, not over tile art, and HUD text stays on dark panels.
- Minor observation (not a regression): badge placement is inconsistent. The
  coral mule's food diamond sits adjacent to the mule, while the gray smithore
  chunks sit in the far tile corner where the round-2 deposit marker lived.
  Both read as badges, but the corner placement is worth a glance to confirm it
  reads as outfit rather than a leftover tile marker.
- Minor observation: in 04_overworld_walk_v2 the yellow turn-timer bar overlaps
  the top row of tile art. Present in round 2 as well; cosmetic.

## Overall verdict

PASS. The round-2 MUST-FIX and all three SHOULD-FIX findings are closed in the
v2 captures. The three still-open and two cannot-verify items are all POLISH
and do not block art-gate acceptance; the landing-ship POLISH is also resolved.
