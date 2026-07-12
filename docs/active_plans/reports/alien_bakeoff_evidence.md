# Alien bake-off evidence

Blind evaluation of five independently designed candidate sets (`candidate_alpha` through
`candidate_epsilon`) for the three seed species: mechtron, flapper, leggite. Rendered cells live
under `output_smoke/aliens/`. The evaluator did not open `label_mapping.json` or anything under
`devel/alien_bakeoff/`, so authorship was unknown while scoring.

Method: every ranking was formed at 18 px and 32 px tall, in both silhouette and full colour,
before any larger size was opened. The 256 px inspection render was viewed last and only to
understand intent and to inform grafting advice. It carries no score.

Two supporting measurements were computed directly from the PNGs, because the shipped
`diagnostics.json` cannot be attributed to a candidate (see [Where the numbers misled](#where-the-numbers-misled)):
hue-based player-colour share, and pairwise silhouette IoU.

## Winner: candidate alpha

`candidate_alpha` is the visual direction the project should adopt.

It is the only candidate that is simultaneously the most separable in pure silhouette at both
18 and 32, the purest expression of the reference recipe, the cheapest to produce, and the only
one whose frame 2 changes the silhouette itself rather than an interior detail. It is not the
prettiest set in the bake-off. It is the one that still works at the sizes the game actually
draws.

The evidence for each of those claims:

- Separable silhouettes. In `output_smoke/aliens/candidate_alpha/silhouette/mechtron_frame1_h18_player0_bgDeep_silhouette.png`,
  `flapper_frame1_h18_...` and `leggite_frame1_h18_...`, alpha is the only candidate whose three
  shapes carry real negative space at 18: a split between the mechtron's legs, a wing V in the
  flapper, and an S-notch in the leggite. Negative space is what survives downscaling; interior
  lines do not.
- Reference purity. Alpha uses 4 distinct solid fills per species (background, bone halo, dark
  keyline, player colour) and no others. The face is drawn in the keyline colour rather than in
  new fills. That is precisely the reference recipe -- bold outline, flat internal colour, one
  dominant body, face made of outline strokes -- and no other candidate matches it.
- Animation. In `candidate_alpha/full/flapper_frame2_h32_player0_bgDeep.png` the wings sweep up
  into a V that changes the outline. The motion is legible from the silhouette alone, so it still
  reads at 18. Every other candidate's frame 2 is a smaller interior change.

Second place is `candidate_gamma`, and it is close. Gamma beats alpha on exactly two criteria --
facial readability at 18 and player-colour dominance -- and those two are precisely what should be
grafted onto alpha (see [What to graft](#what-to-graft-from-the-losers)).

## Score matrix

Scores are 1-5. Every score cites the file that justifies it; paths are relative to
`output_smoke/aliens/`.

| Criterion | alpha | beta | gamma | delta | epsilon |
| --- | --- | --- | --- | --- | --- |
| 1. Distinguishability | 4 | 3 | 3 | 2 | 3 |
| 2. Reference alignment | 5 | 2 | 4 | 4 | 3 |
| 3. Facial readability at 18/32 | 3 | 1 | 5 | 4 | 2 |
| 4. Player-colour dominance | 4 | 1 | 5 | 3 | 4 |
| 5. Animation potential | 5 | 4 | 4 | 2 | 3 |
| 6. Implementation simplicity | 5 | 2 | 3 | 2 | 4 |
| Total (advisory) | 26 | 13 | 24 | 17 | 19 |

The total is advisory. The verdict rests on criteria 1, 2 and 5, which are the ones that decide
whether the art works at the size the game draws it.

### 1. Distinguishability

Judged on silhouette separation at 18 and 32, on whether each shape matches its stated concept,
and on identity across frames and colours.

- alpha (4). `candidate_alpha/silhouette/leggite_frame1_h18_player0_bgDeep_silhouette.png` is an
  unmistakable S-curve, and `flapper_frame2_h18_...` is a deep V. Mechtron and flapper concepts are
  nailed. The leggite loses a point: it is a legless serpent, not a many-legged creature.
- beta (3). Lowest measured IoU (0.46-0.50 for mechtron/flapper and flapper/leggite at 32), and on
  paper the most literal concepts. But at 18,
  `candidate_beta/full/mechtron_frame1_h18_player0_bgDeep.png` and `leggite_frame1_h18_...` both
  collapse into grey columns and become mutually confusable. Good geometry, destroyed by execution.
- gamma (3). Highest IoU, meaning the least separable outlines: 0.75 mechtron/flapper and 0.82
  mechtron/leggite at 32. `candidate_gamma/silhouette/mechtron_frame1_h32_player0_bgDeep_silhouette.png`
  is a featureless rounded rectangle. Gamma separates only once colour and face are added, which is
  fragile. Against that, gamma has the best concept fidelity of any candidate: its leggite
  (`candidate_gamma/full/leggite_frame1_h32_player0_bgDeep.png`) is the only one that is both an
  S-curve and visibly many-limbed, and its flapper is the only unambiguous bird.
- delta (2). Blobby silhouettes plus a flapper that does not read as avian.
  `candidate_delta/silhouette/flapper_frame1_h18_player0_bgDeep_silhouette.png` is a rounded mass
  barely distinct from its own mechtron. Weakest of the five here.
- epsilon (3). An excellent leggite
  (`candidate_epsilon/full/leggite_frame1_h32_player0_bgDeep.png`, a bold standing S-curve) paired
  with a flapper that fails its concept outright:
  `candidate_epsilon/full/flapper_frame1_h32_player0_bgDeep.png` reads as a cross or a standing
  figure with raised arms, not a bird.

One weakness is universal: mechtron/leggite IoU is 0.76-0.82 for every single candidate. No
artist made the leggite tall and narrow enough to separate from the mechtron by outline alone.

### 2. Reference alignment

- alpha (5). 4 fills, flat interior, bold outline, one dominant body, a genuine smile.
  `candidate_alpha/full/mechtron_frame1_h256-inspect_player0_bgDeep.png` is the closest thing in the
  bake-off to the JPG sheets.
- beta (2). `candidate_beta/full/mechtron_frame1_h32_player0_bgDeep.png` is covered in panels,
  rivets and dark banding. The reference's defining trait is flat internal colour; beta abandons it.
- gamma (4). Bold and mostly flat with big eyes, but 9-10 fills per species, and its flapper and
  leggite are less "one dominant geometric shape" than alpha's.
- delta (4). `candidate_delta/full/mechtron_frame1_h32_player0_bgDeep.png` has the friendliest face
  in the entire bake-off. Held back by interior grey shading, which the reference never uses.
- epsilon (3). Bold and flat, but the faces are small and dark and the flapper is not a coherent
  geometric body.

Note: sheet 3 (`2D-Shape-Aliens3.jpg`) is pixel art, which the brief excludes. It was treated as a
palette and scale reference only. Sheets 1 and 2 are the real target.

### 3. Facial readability at 18 and 32

- gamma (5). The only candidate whose eyes survive 18 px.
  `candidate_gamma/full/mechtron_frame1_h18_player0_bgDeep.png` still shows two light eye pixels and
  a yellow chest dot. Gamma achieves this by drawing eyes as light shapes on the dark keyline rather
  than as dark shapes in the keyline colour.
- delta (4). The biggest, friendliest face at 32
  (`candidate_delta/full/mechtron_frame1_h32_player0_bgDeep.png`); at 18 it degrades to a smudge with
  a hint of an eye pair.
- alpha (3). Eyes and a smile read clearly at 32
  (`candidate_alpha/full/mechtron_frame1_h32_player0_bgDeep.png`), but at 18
  (`mechtron_frame1_h18_...`) the face becomes a dark band. This is alpha's real weakness and the
  first thing to fix.
- epsilon (2). Small dark visor eyes, gone by 18.
- beta (1). `candidate_beta/full/mechtron_frame1_h18_player0_bgDeep.png` is salt-and-pepper noise.

### 4. Player-colour dominance

Measured as the fraction of creature pixels whose hue is within 30 degrees of the player hue
(computed from the PNGs; the shipped `tintedPixelShare` is unusable, see below).

| Candidate | 18/deep | 32/deep | 32 green/terrain | 18 green/terrain |
| --- | --- | --- | --- | --- |
| alpha | 0.46 | 0.51 | 0.53 | 0.61 |
| beta | 0.36 | 0.34 | 0.38 | 0.49 |
| gamma | 0.52 | 0.54 | 0.63 | 0.64 |
| delta | 0.50 | 0.49 | 0.48 | 0.58 |
| epsilon | 0.48 | 0.49 | 0.57 | 0.63 |

- gamma (5). Highest at every rung. Its body fill is the literal player token: an edge scan of
  `candidate_gamma/full/mechtron_frame1_h64_player2_terrainPlain.png` returns `#3aaa18` exactly,
  undiluted.
- alpha (4) and epsilon (4). Strong, though alpha carries some interior darks and epsilon's thick
  bone halo eats body area at 18.
- delta (3). Decent on paper but interior grey shading visibly dulls the hue in
  `candidate_delta/full/leggite_frame1_h32_player2_terrainPlain.png`.
- beta (1). 0.34 at 32, far below everyone. The dark panelling swallows the player's colour; in
  `candidate_beta/full/mechtron_frame1_h18_player0_bgDeep.png` the creature reads grey, not coral.

### 5. Animation potential

- alpha (5). `candidate_alpha/full/flapper_frame2_h18_player0_bgDeep.png` -- the wing V changes the
  outline, so the flap survives even at dock size.
- beta (4) and gamma (4). Both raise the wings into a V that reads at 32
  (`candidate_gamma/full/flapper_frame2_h32_player0_bgDeep.png`).
- epsilon (3). Arms raise, which reads; but the mechtron's frame 2
  (`candidate_epsilon/full/mechtron_frame2_h32_player0_bgDeep.png`) is a visor blink -- an interior
  change that is invisible at 18 and therefore not animation.
- delta (2). Frame 1 and frame 2 are nearly identical at 32; compare
  `candidate_delta/full/flapper_frame1_h32_player0_bgDeep.png` against `flapper_frame2_h32_...`.

### 6. Implementation simplicity

Distinct solid fills counted in the 256 px inspection render (colours covering more than 0.4 percent
of the canvas, which excludes anti-aliasing fringes). Lower is simpler and more mechanically
checkable.

| Candidate | mechtron | flapper | leggite |
| --- | --- | --- | --- |
| alpha | 4 | 4 | 4 |
| epsilon | 4 | 4 | 7 |
| beta | 8 | 5 | 5 |
| delta | 10 | 7 | 6 |
| gamma | 10 | 10 | 9 |

- alpha (5). Four fills across all three species, perfectly uniform. A conformance test can assert
  "exactly four fills, one of which is the player token" and it will hold.
- epsilon (4). Nearly as lean.
- gamma (3). The most fills of anyone. In fairness every extra fill is purposeful (eyes, beak, chest
  accent) rather than decorative, which is why gamma still reads well.
- beta (2) and delta (2). Extra fills plus many small interior paths.

## Visibility per candidate

All five candidates are clearly visible in every colour-on-background cell. There are no
disappearances anywhere in the 1800-cell grid.

The reason is that all five use the identical outline device, so this criterion did not
discriminate between them at all. An edge scan entering the body from the left returns the same
three-layer stack for every candidate: a bone halo of roughly `#f6f1e4`, then a near-black keyline
of roughly `#141422`, then the player fill. Rim thickness is the only difference: epsilon's is
heaviest (and costs it body area at 18), gamma's is thinnest, alpha, beta and delta sit between.

This near-identity strongly suggests the double stroke was already mandated by the shared art
contract rather than invented by any artist. It should be recorded as a contract requirement, not
credited to a candidate.

## The green-on-green finding

The double stroke is not a nicety. It is the only thing making the creatures visible, and the
reason is a complementary pair of contrasts.

| Ink | vs bgDeep `#1a1a2e` | vs terrain `#7c9a4e` | vs bgPanel `#22223a` |
| --- | --- | --- | --- |
| bone halo `#f6f1e4` | 15.13 | 2.83 | 13.71 |
| dark keyline `#141422` | 1.07 | 5.72 | 1.18 |
| green fill `#3aaa18` | 5.64 | 1.05 | 5.11 |
| coral fill `#ff5a5f` | 5.59 | 1.04 | 5.07 |

Read the bottom two rows first. Green player on terrain is 1.05:1 -- invisible. But coral on terrain
is 1.04:1, which is just as invisible. The brief framed this as a green problem; it is not. Three of
the four player colours are effectively invisible on terrain by fill alone (coral 1.04, green 1.05,
orchid 1.30). Only cyan (1.91) has any separation, and even that is below the 3:1 threshold. The
terrain background defeats the palette, not just one colour of it.

Now read the top two rows. The bone halo is excellent on the dark panels (15.1 and 13.7) and weak on
terrain (2.83). The dark keyline is the exact inverse: excellent on terrain (5.72) and functionally
invisible on the dark panels (1.07). Neither stroke alone works on all three backgrounds. Together
they always leave one layer doing the work.

So the answer to "which candidates solve green-on-green, and how" is: all five, with the same
device, and the device is a complementary double stroke rather than a halo. Keep both strokes. If
either is dropped from the contract to save a path, the creatures will vanish -- the keyline on
terrain, or the halo on the panels.

One refinement worth making: the bone halo's 2.83:1 against terrain is just short of the 3:1
threshold for non-text contrast, and the measured contrast at the rendered boundary is lower still
(2.19-2.42, because anti-aliasing softens it). Lightening the halo one step or widening it by one
device pixel would clear 3:1 outright.

## The 18 px dock question

At 18 px tall, no candidate keeps a readable face. Gamma alone retains eye pixels
(`candidate_gamma/full/mechtron_frame1_h18_player0_bgDeep.png`); every other candidate's face
degrades into a grey band or noise. This is not a candidate failing. Eighteen pixels of height, minus
two strokes on each edge, leaves roughly twelve pixels of body, and a face simply does not fit.

Body shape and player colour do survive at 18, for alpha, gamma and epsilon. Alpha's three species
remain plainly distinct from one another at 18 in full colour.

The direct answer: the full creature still reads as a creature at 18, but it does not read as a
character. Which one the dock badge needs decides this.

Recommendation: put a dedicated head-crop symbol in the art contract, `<species>-head`, and use it
for the 18 px dock badge. Two reasons. First, the dock badge's job is identification, and a head
crop spends all 18 pixels on the most identity-bearing feature instead of roughly 12 on a whole
body. Second, full-body-at-18 only works when the silhouette has alpha-grade negative space, and
that is discipline eight parallel lanes will not hold uniformly -- three of the five artists here
already failed it at three species. Mandating the head crop de-risks the scale-out rather than
betting on it.

## What to graft from the losers

Alpha wins, but it should not ship unmodified. Four specific grafts, in priority order:

1. Take gamma's eye construction. Alpha draws eyes in the keyline colour, so they merge into the
   dark outline and vanish by 18. Gamma draws eyes as light (bone) shapes carrying a dark pupil,
   which is why gamma is the only candidate with a face at 18. Compare
   `candidate_gamma/full/mechtron_frame1_h18_player0_bgDeep.png` against
   `candidate_alpha/full/mechtron_frame1_h18_player0_bgDeep.png`. This costs alpha one or two fills
   and buys the single largest readability gain available.
2. Take gamma's leggite limbs. Alpha's leggite
   (`candidate_alpha/full/leggite_frame1_h32_player0_bgDeep.png`) is a legless serpent and fails its
   own concept. Gamma's (`candidate_gamma/full/leggite_frame1_h32_player0_bgDeep.png`) is the only
   one that is both a standing S-curve and visibly many-limbed. Graft gamma's limb treatment onto
   alpha's S-curve spine. Delta's leg pairs
   (`candidate_delta/full/leggite_frame1_h32_player0_bgDeep.png`) are the clearest of all if a
   stronger leg read is wanted, at the cost of interior noise.
3. Take gamma's single warm accent. Gamma gives each species one small high-chroma shape -- the
   flapper's orange beak, the mechtron's yellow chest square. It survives 18 as a coloured dot, acts
   as a focal point, and helps species identification. One accent per species, no more.
4. Take delta's mouth. The wide smile in
   `candidate_delta/full/mechtron_frame1_h32_player0_bgDeep.png` is the warmest, most on-reference
   expression in the bake-off, and alpha's face frame can carry it directly.

Take nothing else from beta, delta or epsilon.

## Instructions for the eight-species production lanes

Do these:

1. Design in silhouette at 18 px first, and only then add the face. A species is not approved until
   its 18 px silhouette is plainly distinct from all seven others. Negative space is what carries an
   outline down to 18 -- a leg gap, a wing V, an S-notch. Interior lines do not survive and are
   wasted effort at these sizes.
2. Hold the four-fill budget: bone halo, dark keyline, player fill, plus at most two more for the
   eyes and one warm accent. Alpha proves three species can be built at four fills. Every fill beyond
   that budget must earn its place at 32 px, not at 4x.
3. Make frame 2 change the outline, not the interior. Alpha's wing V is the template. Epsilon's
   mechtron blink is the anti-pattern: an interior change is invisible at the sizes that matter, so
   it is not animation.
4. Keep the double stroke on every species and never drop either layer. The keyline is the only thing
   holding the creature on terrain; the halo is the only thing holding it on the panels.
5. Give the leggite family a genuinely narrow, tall footprint. Mechtron/leggite silhouette IoU is
   0.76-0.82 in all five candidates -- nobody solved this. With eight species the confusion budget is
   tighter, so this must be designed in deliberately.
6. Ship a `<species>-head` symbol alongside the body for the 18 px dock badge.

Avoid these:

- Interior panels, rivets, banding and shading. This is beta's failure. Beta has arguably the best
  concepts at 4x and the worst read at 18, along with the lowest player-colour share (0.34). It is
  the exact "gorgeous at 4x, mush at 32" pattern the brief warns about, and it is the most tempting
  trap because the work looks excellent while you are drawing it.
- Rounded, gap-free bodies. This is delta's failure: charming faces attached to shapes that all
  become the same blob at 18.
- Rim thickness beyond what separation requires. Epsilon's heavy halo consumes body area at 18 and
  measurably reduces the player's colour.
- Judging any species from the 4x render. Approve at 18 and 32 or do not approve.

## Where the numbers misled

Four things that a metrics-only review would have gotten wrong.

1. Silhouette IoU inverted the truth on two of five candidates. It ranks beta most distinct
   (0.46-0.50) and gamma least (0.74-0.82). In the game's actual colour render the opposite is true:
   beta is the hardest of the five to read at 18 and gamma is among the easiest. IoU sees only the
   outline mask and is blind to the face, limb and accent cues a human actually uses. It is a useful
   guard rail against blob-shaped design, and it is not a ranking. Do not gate production on it.
2. `diagnostics.json` cannot be attributed to a candidate and should not be used as shipped. Its
   `inkCoverage` array has 30 entries -- exactly one candidate's worth -- with no candidate field,
   and `playerColorShare` has 1800 entries, also with no candidate field. Worse, 744 of those 1800
   `tintedPixelShare` values are exactly 0.0, including cells that are visibly, strongly tinted. The
   metric appears to test for an exact RGB match, which anti-aliasing and any interior shading
   defeat. Every colour-share number in this report was recomputed from the PNGs using a hue-distance
   test instead. The generator needs a candidate label and a tolerant colour test before its output
   is trustworthy.
3. The clean-edge check never ran. `geometryPrototypes.cleanEdge` in `diagnostics.json` reports
   `robust: false` and explains that the Playwright probe could not reach inside a `<use>` element's
   instantiated content, so stroke geometry was never isolated from fill geometry. Its own suggested
   fix -- a companion silhouette-only symbol -- already exists in these renders, so the check is now
   cheap to build and should be.
4. The bake-off could not actually discriminate on the visibility criterion. Because all five
   candidates independently shipped the same double stroke, green-on-terrain was never at risk for
   any of them, and the criterion separated nobody. That safety came from the contract, not from the
   competition. It should therefore be enforced by an automated conformance test rather than trusted
   to survive eight parallel lanes.

The genuine surprise: the terrain problem is not a green problem. Coral on terrain (1.04:1) is
marginally worse than green on terrain (1.05:1), and orchid (1.30:1) is barely better. Any future
palette change that adds a mid-luminance player colour will hit the same wall, and the double stroke
is what makes the whole palette viable rather than a fix for one unlucky hue.

## Related docs

- [MARKDOWN_STYLE.md](../../MARKDOWN_STYLE.md)
- [COLOR_CONTRAST_ACCESSIBILITY.md](../../COLOR_CONTRAST_ACCESSIBILITY.md)
