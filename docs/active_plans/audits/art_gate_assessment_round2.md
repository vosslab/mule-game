# Art gate assessment round 2

Visual-acceptance review of LIVE COMPOSED GAMEPLAY against
[docs/archive/mule_art_style_spec.md](../../archive/mule_art_style_spec.md)
and the round-1 report
[docs/active_plans/audits/art_gate_assessment.md](art_gate_assessment.md).
Reviewed the 10 screenshots in `output_smoke/gameplay/`
(`01_title_screen.png` through `10_scoring_screen.png`) at 1280x900 @2x.
Round 1 graded ownership-clarity and price-readability "by spec" only because
the galleries never composed real game states; this round grades every
criterion against real states. Observations are separated from judgment;
grades are PASS / MARGINAL / FAIL / N/A (criterion not exercised by that
image).

## Review limitation (read first)

- No pixel-level contrast tool was run in this pass; grades are visual at the
  rendered 2x scale. Where a numeric ratio matters, the spec's own contrast
  table is cited rather than re-measured.
- Species-silhouette distinguishability (round-1 SHOULD-FIX) cannot be stress
  tested from these shots: the only walking avatar shown is the coral "You"
  (player0); the other species appear only as small auction tokens (07) or as
  mules. That item is marked NOT VERIFIABLE below, not RESOLVED.

## Verdict summary

`N/A` means the image does not exercise that criterion (not a defect).

| Image | Terrain | Avatar vis. | Ownership | Outfit | Price |
| --- | --- | --- | --- | --- | --- |
| 01_title_screen | N/A | N/A | N/A | N/A | N/A |
| 02_land_grant_map | MARGINAL | N/A | N/A | N/A | N/A |
| 03_land_auction | MARGINAL | N/A | PASS | N/A | PASS |
| 04_overworld_walk | MARGINAL | PASS | PASS | N/A | N/A |
| 05_town_scene | N/A | PASS | N/A | PASS | N/A |
| 06_overworld_towed_mule | MARGINAL | PASS | PASS | PASS | N/A |
| 07_auction_scene | N/A | PASS | N/A | N/A | PASS |
| 08_event_banner | MARGINAL | N/A | PASS | MARGINAL | N/A |
| 09_production_yields | MARGINAL | N/A | PASS | MARGINAL | N/A |
| 10_scoring_screen | N/A | N/A | N/A | N/A | N/A |
| Aggregate | MARGINAL | PASS | PASS | PASS/MARGINAL | PASS |

Overall art-gate verdict: PASS-WITH-FIXES.

The round-1 MUST-FIX (title art wired into the live screen) is RESOLVED, and
the previously "by spec only" criteria (ownership, price) now hold up against
real composed states. Two live-only problems keep this from a clean pass: the
overworld map renders terrain as flat color fills with none of the
gallery's texture/peak-count overlays (so mountain tiers separate by fill
darkness alone, the exact spec risk), and the town scene renders a duplicate
instruction line and a duplicate "End turn" button.

## Per-image findings

### 01_title_screen

Observed: the ringed planet backdrop, scattered starfield, pixel/retro
"M.U.L.E." wordmark, a gold "New Game" button, and a slate landing-ship
silhouette with a gold exhaust. This is the finished title art from round-1's
`title_gallery.png` now composed on the live screen.

- Resolves the round-1 MUST-FIX cleanly: the first screen now reads as a
  polished retro remake, not placeholder text on a void.
- The planet is cropped hard at the top frame edge; its top third is off
  canvas. It reads fine but the crop looks unintentional rather than composed.
- The landing ship is small and plain against the large lower void (round-1
  POLISH note about ship size still applies).

### 02_land_grant_map

Observed: a 5x9 tile grid of plains (green), river (blue column), mountain
tiers (tan/medium/dark brown), and one town tile (gold), a four-panel player
HUD across the top (color dot + name + money + resource counts), a yellow
dashed selection cursor on one plot, and a "Pass" button.

- Terrain broad categories (plains/river/mountain/town) separate clearly by
  hue. The three mountain tiers separate only by fill darkness: the
  gallery's peak-count overlay (round 1's reason terrain PASSED) is absent
  here, so tier1-vs-tier2 is a subtle darkness step. Grade MARGINAL.
- HUD panels are legible; player color dots read distinctly (coral / cyan /
  green / pink). Money in gold, counts in white.
- The yellow dashed cursor reads as a selection, distinct from the solid
  player-color ownership borders seen on later screens.

### 03_land_auction

Observed: the map (partially scrolled), a magenta-bordered owned plot, a
yellow dashed auction-target plot, and a text block: "Plot (4, 7) is up for
auction," "Current ask: $164," "High bidder: You at $160" with a coral dot,
"Bidding is open," a remaining-auctions count, and Bid/Pass buttons.

- Price readability PASS against a real state: ask and bid figures are white
  on `bgDeep`, large and unambiguous; the high-bidder line pairs the coral dot
  with the "You" label so identity is not color-only.
- Ownership PASS: the magenta-bordered plot reads as owned and identifies its
  owner by border color, separate from the terrain fill.
- Terrain MARGINAL for the same mountain-tier reason as 02.

### 04_overworld_walk

Observed: the player avatar (coral, with a visible light keyline halo and a
ground-contact ellipse) standing on a plains tile; owned plots outlined in
coral (you), cyan (p2), green (p3), and magenta (p4); a yellow turn-timer bar
across the top row; footer "Money / Ticks left / Walk onto the town..." and
"End turn."

- Avatar visibility PASS: the keyline fix is doing its job. The coral avatar
  on olive plains is clearly separated by the white rim, not leaning on the
  dark outline alone.
- Ownership PASS: colored borders make owned plots obvious and name the owner.
  The cyan border on a blue river tile is the tightest border-vs-fill pairing;
  cyan is bright enough that it still reads, but it is the one to watch.
- Terrain MARGINAL (flat mountain tiers as above).

### 05_town_scene

Observed: the zoomed town interior on gold floor tiles: a fenced corral with a
mule, store counters showing the four resource icons (green food chevron,
yellow energy bolt, gray smithore lump, pink crystite diamond), a pub (mug),
an assay office (glasses), gold arch store doors, and four directional exit
arrows in dark discs. The coral avatar (with keyline) stands at left.

- Outfit clarity PASS: the four resources read by icon SHAPE, not color alone,
  and stay legible at counter scale.
- Avatar visibility PASS: keyline present on the gold floor.
- Composition defect: the screen shows TWO instruction lines ("Walk to the
  corral to buy a M.U.L.E." and "Walk onto the town to buy and outfit...")
  and TWO separate "End turn" buttons. The town overlay footer and the
  underlying overworld footer are both rendering. Duplicated primary controls
  read as a bug, not a polished remake.
- The assay-office glyph (glasses) is still the least self-evident building
  icon (round-1 POLISH note stands).

### 06_overworld_towed_mule

Observed: the coral avatar (keyline) towing a coral mule; the mule carries a
green diamond (food) outfit badge on its back; owned-plot borders as in 04.

- Outfit clarity PASS for a towed mule: the green diamond communicates the
  food outfit by shape and color together, legible at map scale.
- Avatar/mule visibility PASS: both the towing avatar and the mule read on
  plains; the mule inherits the owner tint and sits inside the coral border.
- Terrain MARGINAL (flat mountain tiers).

### 07_auction_scene

Observed: the real-time commodity auction. Header "Auction: smithore / Ticks
left: 8," store buy/sell reference prices, a per-player legend (coral BUY $69,
cyan OUT $51, green SELL $66, pink SELL $66) with color dots, a vertical
price-axis arena with player tokens (each keylined), a gold star burst under
the coral high-bidder token, "tick 17: 1 @ $67," and Up/Down buttons.

- Price readability PASS: every figure is bold white (or gold header) on dark,
  and each player's action/price pairs with a color dot plus a text label.
- Avatar/token visibility PASS: the keyline separates each colored token from
  the dark arena; the green token in particular reads cleanly (the round-1
  green-on-terrain concern does not recur on the dark arena).
- The arena interior is large and mostly empty; the axis carries no numeric
  price gradations, so a token's absolute price is read from the text lines,
  not the axis. Acceptable, but the axis is presentational dead space.

### 08_event_banner

Observed: the overworld with installed mules on owned plots (cyan mule on a
river plot, green mule on a river plot, pink mule on a mountain plot), a small
black hexagon deposit marker in several plot corners, and a personal-event
banner: a down-arrow disc icon, magenta accent bar, "Your child was bitten by
a Bat-Lizard; the hospital bill hurt." and "-$100" in red, with "Player 4 is
developing..." below.

- Banner legibility PASS: white body text and red penalty figure are clear;
  the down-arrow disc reads as a loss, and the magenta accent bar frames it.
- Ownership PASS: each installed mule sits inside its owner's border and
  carries the owner tint.
- Outfit clarity MARGINAL: installed mules show owner color but NO visible
  resource-outfit icon. The only outfit badge demonstrated anywhere is the
  towed mule's diamond in 06; once a mule is placed, which resource it
  produces is not badged. The black hexagon in the plot corner reads as a
  tile ore/crystite deposit marker, not the mule's outfit, and "black" carries
  weak color identity against brown/blue tiles.
- Terrain MARGINAL (flat mountain tiers).

### 09_production_yields

Observed: the overworld with installed mules and deposit markers, a
"Production" header, an event banner "Acid Rain: acid fell hardest on row 5."
with a rain-cloud icon, and a per-player production readout beginning to appear
below in player-tint text (partially cut off at the frame bottom).

- Banner legibility PASS: rain-cloud icon plus text reads clearly.
- Ownership PASS as in 08.
- Outfit clarity MARGINAL: same installed-mule-has-no-outfit-icon gap as 08.
- The production readout is rendered in coral/player-tint text on `bgDeep` and
  is clipped at the frame bottom. Coral (`player0`) as body text on dark is the
  lowest-contrast of the four tints; verify it clears the house target, and
  confirm the readout is not being cut off in the actual viewport.
- Terrain MARGINAL (flat mountain tiers).

### 10_scoring_screen

Observed: "Final Scores" header, a ranked list ("Player 4: $4317 (winner)" in
bold magenta, "Player 3: $4247" green, "Player 2: $3832" cyan, "You: $1550"
coral), and a "Play Again" button. Cut-off HUD panel edges are visible at the
very top of the frame.

- Hierarchy reads: the winner is bold and labeled "(winner)," ranking is
  top-to-bottom, and player identity is carried by tint.
- The scores use player tints as body text on dark. Cyan and magenta read
  strongly; coral "You: $1550" and green "Player 3" are the dimmer pair
  (both are the darker-luminance tints) -- legible but the weakest contrast on
  screen. Consider white text with a color dot, matching the HUD-panel and
  auction-legend pattern, rather than full-tint text.
- Composition is sparse: the score block sits top-center over a large empty
  void, and residual HUD panels bleed in at the top edge. Presentational, not
  a readability failure.

## Round-1 item status

| Round-1 item | Rank | Status |
| --- | --- | --- |
| Wire title art into live title screen | MUST-FIX | RESOLVED (01) |
| Improve player2 green avatar visibility on plains | SHOULD-FIX | RESOLVED for avatars/tokens via keyline (04, 07); see new item on green mule |
| Differentiate humanoid/broad/pear silhouettes | SHOULD-FIX | NOT VERIFIABLE from gameplay (no walking non-player species shown) |
| Compose owned-vs-unowned + priced-token samples | SHOULD-FIX | RESOLVED (ownership 03/04/06/08/09; price 03/07) |
| Fix gallery fixtures (corner-cram) | SHOULD-FIX | RESOLVED (full-scale composed gameplay this round) |
| Clarify assay-office glyph | POLISH | STILL OPEN (05, glasses icon unchanged) |
| Disambiguate ore/crystite & fire event vignettes | POLISH | PARTIAL (down-arrow 08 and rain-cloud 09 read clearly; full set not shown) |
| Larger/detailed landing ship on title | POLISH | STILL OPEN (01, ship small and plain) |

No round-1 item REGRESSED. Two live-only problems are new this round (terrain
texture absence, town duplicate controls).

## Ranked fix list

### MUST-FIX (blocks art-gate acceptance)

- Town scene renders a duplicate instruction line and a duplicate "End turn"
  button (05). The town-overlay footer and the overworld footer both draw.
  Collapse to one instruction and one control set. (Composition defect; reads
  as a bug on a scene the player uses every turn.)

### SHOULD-FIX (marginal or aesthetic)

- Overworld terrain renders as flat color fills with no texture or peak-count
  overlays (02, 03, 04, 06, 08, 09), so mountain tiers separate by fill
  darkness alone -- the exact second-signal gap the spec's Known Risks section
  flagged and that round-1's terrain PASS depended on the gallery to cover.
  Render the tier peak-count (and plains/river/town textures) on the live map,
  or otherwise add a non-darkness signal that distinguishes tier1/tier2/tier3.
- Installed mules carry no resource-outfit icon (08, 09); only the towed mule
  shows its outfit (06). Badge the produced resource on placed mules so outfit
  clarity holds after placement, not only in transit. Also clarify the black
  hexagon deposit marker, which has weak color identity on brown/blue tiles.
- Green mule on a green plains plot (09, bottom-left) sits same-hue on terrain
  without the species keyline (the keyline fix applies to species avatars, not
  mules). It reads today via the owner border and darkness, but this is the
  residual of the round-1 green-on-green concern; consider extending the
  keyline (or a rim) to mules on same-hue terrain.

### POLISH (nice-to-have)

- Title planet is cropped hard at the top frame edge (01); compose it fully in
  frame or intentionally.
- Scoring screen (10) is sparse (large void, HUD edges bleeding at top) and
  uses full-tint score text; a color-dot + white-text pattern would match the
  HUD/auction legends and lift the coral/green rows' contrast.
- Production readout (09) is clipped at the frame bottom and uses low-contrast
  coral body text; verify viewport fit and text contrast.
- Auction arena interior (07) is large and empty with an unlabeled price axis;
  numeric axis gradations or a tighter arena would use the space.
- Carry over round-1 POLISH: clearer assay-office glyph (05) and a
  larger/more-detailed landing ship (01).

## Overall art-gate verdict

PASS-WITH-FIXES. The round-1 MUST-FIX is resolved, avatar visibility (keyline),
ownership clarity (colored borders + labeled HUD dots), and price readability
(auction and land-auction figures) all hold up against real composed states.
The remaining blocker is presentational: the town scene's duplicated controls
must be collapsed, and the live map should carry the terrain second-signal
(mountain-tier overlay) that the gallery had but the map does not.
