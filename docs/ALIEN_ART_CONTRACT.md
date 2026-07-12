# Alien art contract

This is the production contract for the eight species avatars AND for the mule, which is the ninth
creature and is drawn to the same system. It is binding. Follow it literally and you will produce a
creature that survives at the size the game actually draws it.

The mule is here because it walks the map alongside the player's alien and is on screen with it
constantly, so its silhouette is part of the same separation problem. Designing it outside this
system and hoping it does not collide is the same mistake that produced eight humanoids. The mule's
plan, canvas and separation rules are in [The mule](#the-mule).

Every number here traces to measured evidence in
[active_plans/reports/alien_bakeoff_evidence.md](active_plans/reports/alien_bakeoff_evidence.md),
which scored five independently authored design sets at true scale. Where this document sets a
rule the evidence did not settle, it says so and gives the reason.

Read [The rules that are not negotiable](#the-rules-that-are-not-negotiable) before you draw
anything. Three of them look like optimizations you could skip. Skipping any one of them makes
creatures disappear from the screen.

## The pipeline is vectors. Only the browser makes pixels

Nothing in this pipeline rasterizes. The chain is: SVG art file -> generated `<symbol>` markup ->
inline `<defs>` in the page -> the browser. THE ONLY MOMENT PIXELS EXIST IS WHEN THE BROWSER PAINTS.
The PNG renders this document tells you to judge from are a JUDGING PROXY for that moment. They are
not a stage in the pipeline, and no number in this contract is a property of them.

This matters because it changes what the halo constraints ARE. They are GEOMETRIC, and they are true
in vector space at every zoom, on every display, at every size. They are not rasterization
artifacts, they are not anti-aliasing, and they are not something a small render does to your art.
The three facts that follow are the whole of it, and every floor in this document falls out of them:

- The halo is `stroke-width: 40`, CENTERED on the path, so it extends 20 USER UNITS OUTWARD from
  every edge of the fill. The rendered union is therefore 20 units wider per side than the fill you
  drew. That is why the usable fill band is 160 units of the 200-unit canvas -- see
  [rule 3](#3-the-geometry-floors). It is arithmetic on the geometry, not a measurement of an image.
- A 40-unit gap CLOSES because both facing edges dilate 20 units and MEET. The gap is gone in the
  vector union itself, at any zoom. Rendering it larger does not bring it back, because there is
  nothing there to bring back.
- A TAPERED POINT VANISHES because the stroke terminates in a round join of 20-unit radius, so the
  cusp is BLUNTED BY CONSTRUCTION. The point is not "eaten at small sizes" -- the detail was never
  there to lose, at any size. An artist who believes the halo eats fine points only when the sprite
  is small will try to out-clever it with MORE detail and finer points. That cannot work, and it
  spends the body area that would have carried the creature.

So when this document says a feature will not survive, it is not predicting what a downscaler will
do to it. It is telling you the feature does not exist in the geometry you are about to ship.

## The sizes the game actually paints

Every size in this section was MEASURED in a real headless browser against the live game. None of it
is read out of the art files, and that distinction is the whole point of the section.

THE MINIMUM SUPPORTED VIEWPORT IS 1024x640. 1280x800 is the NOMINAL target, not the floor. The
minimum is stated in [../tests/e2e/e2e_auction_beat_capture.mjs](../tests/e2e/e2e_auction_beat_capture.mjs),
in [E2E_TESTS.md](E2E_TESTS.md), in [TODO.md](TODO.md), and in `src/ui/scenes/auction_geometry.ts`.

THE STAGE SCALES. A sprite whose markup says `width=18` IS NOT 18 CSS PIXELS ON SCREEN. There are
three regimes, and a creature is painted in all of them:

| Surface | svg viewBox | Scale at 1280x800 (nominal) | Scale at 1024x640 (minimum) |
| --- | --- | --- | --- |
| Auction | 960x600 filling a 1280x800 stage | 1.3333 | 1.0667 |
| Overworld / AI-actor board | 576x320 | 2.0444 | 1.6355 |
| Title picker | outside the scaled stage | 1.0 | 1.0 |

Note the counterintuitive ordering that falls out of this: the 44-unit OVERWORLD avatar paints
LARGER (90 px) than the 64-unit AUCTION avatar (85 px), because the board scales 2.04x and the
auction only 1.33x. Reading sizes out of the markup gets this exactly backwards.

### The judging ladder: 24, 32, 68 and 90 CSS px

The old ladder of 18 / 32 / 44 / 64 was viewBox units read out of source, and three of its four
rungs are not what the browser paints. THE LADDER THE ART IS JUDGED AT IS NOW:

| Rung | What paints it | Derivation |
| --- | --- | --- |
| 24 px | auction dock badge | 18 units x 1.3333, nominal viewport |
| 32 px | title-screen species picker | 32 units, 1:1, outside the scaled stage |
| 68 px | auction runway avatar | 64 units x 1.0667, at the 1024x640 minimum (85 px at nominal) |
| 90 px | overworld avatar | 44 units x 2.0444, nominal viewport (72 px at the minimum) |

24 PX IS THE MINIMUM JUDGING SIZE, replacing 18. Judge new work at 24 and at 32. Never approve a
creature from a 4x inspection render: the bake-off's best-looking set at 4x had the worst read at
the smallest rung and the lowest player-color share of all five.

A KNOWN, ACCEPTED GAP: the auction dock badge paints 19.2 px at the 1024x640 minimum viewport, which
is BELOW the 24 px judging floor. The decision is to judge at 24 and to leave the badge markup alone
for now. This is an OPEN ITEM FOR THE WIRING WORK, not a defect in the art, and an artist should not
try to compensate for it by drawing a face that works at 19 px. Nothing does.

Where this document reports that something survived (or died) at 18 PX, that is bake-off evidence,
scored at 18 viewBox units, under the old assumed floor. 18 is SMALLER than anything the game now
paints, so every one of those findings holds with margin at the 24 px floor. Judge NEW work at 24.

The grid still shifts decimally against the 32 rung, which is why 32 remains the size you DESIGN
for: divide any grid number by 10 for its size in the 32 px picker.

### Square draw boxes do not distort the art

Measured, and recorded here so nobody sets out to fix a problem that does not exist. Every draw site
in the game currently uses a SQUARE box (width equals height). That does NOT squash a 5:8 creature.
A `<use>` with the default `preserveAspectRatio` (`xMidYMid meet`) FITS the symbol's viewBox inside
the box, so a 5:8 symbol stays box-HEIGHT tall and LETTERBOXES horizontally. Nothing is distorted.

What a square box actually changes is HORIZONTAL FOOTPRINT: an 11-unit-wide figure sitting inside a
24-unit colored plate looks thin and off-center. The fix for that is LAYOUT -- plate widths,
x-offsets, lane spacing -- and it belongs to the wiring work. It is NOT an aspect-ratio problem and
it is NOT the artist's to solve by drawing wider than the band allows.

## The reference exemplar

The style you are matching is [../devel/alien_bakeoff/set_5/aliens.svg](../devel/alien_bakeoff/set_5/aliens.svg).
Open it, read its construction, and copy it. When this document and the exemplar appear to
disagree, this document wins, and the four known disagreements are listed below so you are never
guessing which is which.

Set_5 is the exemplar because of the quality the project is buying: SOLID OUTER LINES. Its rim is
uniform, unbroken and untapered all the way around every creature, on both frames, because it is
not drawn as a line at all. It falls out of painting one shared geometry group three times (see
[rule 1](#1-the-three-layer-stack-drawn-behind-a-flat-fill)). A hand-drawn outline thins where the
pen turns and breaks where two parts meet; this one cannot. That uniform double rim is what carries
the creature at 18 px, and it is the thing to protect above everything else in this document except
the two strokes themselves.

Set_5 also already satisfies the parts of this contract that the other sets missed: its stack is
exactly 40 / 20 / flat, its mechtron dominant mass is exactly 96 units wide, its leggite central
column is 46, and it is the one set whose eyes survive 18 px.

Copy set_5's CONSTRUCTION. Do not copy its creatures. What you are taking from the exemplar is the
three-layer stack, the uniform rim, the eye spelling, and the interior discipline. The shapes those
techniques are wrapped around in set_5 are people-shaped, and people-shaped is available to exactly
one species here. Read the exemplar with your hand over its silhouettes.

Where this contract supersedes the exemplar (five places, all deliberate):

| The exemplar does | This contract requires | Why |
| --- | --- | --- |
| cream halo `#f3ead8` | white halo `#ffffff` | cream measures 2.83:1 on terrain and misses the 3:1 bar; white measures 3.19:1 and clears it. This is measurement, not taste. See [rule 2](#2-both-strokes-ship-neither-one-is-decoration). |
| eye white `#f7f7ff`, gold `#ffd166` | `keylineLight` `#ffffff`, `gold` `#ffd23f` | the game's palette tokens are the source of truth for color; a creature must not invent near-miss hexes. |
| leggite legs 24 units thick | at least 26 units of fill | the limb floor. See [rule 3](#3-the-geometry-floors). |
| ships no face crop, and argues in its own notes against one | a `<species>-head` symbol is mandatory | see [rule 8](#8-the-dock-badge-is-a-face-crop-not-the-full-body). |
| builds most species on one head-and-torso plan | one body plan per species, assigned before any measurement | five casts drawn to the previous revision produced eight variations on a person. See [Each creature is its own animal](#each-creature-is-its-own-animal). |

Everything else in set_5 is the target. Read its design notes at the top of the file: they are the
same reasoning as this contract, written by the artist who arrived at it independently.

## What you are drawing

- One file per species: `art/aliens/<species>.svg`. That file is the source of truth.
  `src/ui/sprites/sprites_species.ts` is generated from it.
- Two poses per species: frame 1 (idle) and frame 2 (motion).
- One face crop per species for the dock badge.
- Two lint-only silhouette symbols (one per frame), which cost you nothing extra to emit.
- Editing canvas: `viewBox="0 0 200 320"` (5:8, tall). Every number in this document is in those
  grid units.
- Plus the mule: one file, `art/mule/mule.svg`, on a WIDE canvas, with no face crop and no face. See
  [The mule](#the-mule).

Design at the 32 rung: divide any grid number by 10 to get its size there. JUDGE at 24 and 32, and
check the two large rungs at 68 and 90. The ladder and where each rung comes from are in
[The sizes the game actually paints](#the-sizes-the-game-actually-paints). A 4x inspection render
exists for editing only, and nothing is ever approved from it.

## Each creature is its own animal

Every creature in this cast is a different animal, built differently. A player must be able to tell
any two of them apart with the color switched off and the interior detail switched off, because they
have different BODIES -- not because one of them is carrying something.

Start every species from its BODY PLAN, which is assigned to you in
[The eight body plans](#the-eight-body-plans). The body plan tells you what the creature IS: whether
its face sits on a distinct head or directly on its body, how many limbs it has and of what kind,
and how it gets around. Draw that first. Every measurement in this document then applies to the plan
you were given. Measurement second, always.

The organizing axis is LOCOMOTION, because how a creature MOVES forces how it is BUILT. NO TWO OF THE
NINE SHARE A LOCOMOTION, and that is a rule you can check your own work against:

WALKS (humanoid) | FLIES (flapper) | ROLLS ON TREADS (bonzoid) | SLIMES (gollumer) | FLOATS
(spheroid) | SLITHERS ON MANY LEGS (leggite) | WALKS HEAVY (mechtron) | HOPS (packer) | TROTS (mule)

Nine ways of getting around cannot all be a person with an accessory. Settle how your creature meets
the ground before you draw a single line, and most of the silhouette separation is already won.

### Fixed identity, explorable expression

Each row below pins an IDENTITY and leaves the EXPRESSION open. The fixed part is what must be true
in every drawing of that creature and must read in pure silhouette: its locomotion, its limb
inventory, whether it has a head, and its numeric wedges. Everything else -- proportion, contour,
character, how goofy or how grim -- is yours.

Five artists drawing from one row should arrive at five different creatures that are unmistakably
the same species. That divergence is a FEATURE: it is what gives the human something real to choose
between. The last round failed by inverting this exactly -- it over-specified the body (in human
anatomy) and under-specified the identity, so every artist drew the same person and had nothing left
to explore. Pin the identity. Open the expression.

Exactly ONE creature is a head on a torso with two arms and two legs: the humanoid. That plan is the
humanoid's whole identity, and it is therefore closed to the other eight. A plan that everybody
shares identifies nobody.

For the other seven, follow the reference sheets: `2D-Shape-Aliens.jpg`, `2D-Shape-Aliens2.jpg`,
`2D-Shape-Aliens3.jpg`. Look at what those creatures do NOT have. There is no head on a neck on a
torso. THE FACE IS ON THE BODY. The triangle IS the alien, the star IS the alien, the orb IS the
alien: eyes and mouth sit directly on the one dominant shape, and limbs are small stubs hung off
that shape, or absent entirely. That is the target.

This section exists because the previous revision of this contract failed here, and the failure was
the contract's fault, not the artists'. It described species in HUMAN ANATOMY -- a torso width, a
waist maximum, terminal fists. A rule that caps a waist has already decided the creature has a
waist. Five artists obeyed it exactly and delivered five casts of eight people each: a flapper that
is a person with wings, a bonzoid that is a person with big hands, a packer that is a person with a
hump. The two species that came out as real creatures, gollumer and spheroid, are precisely the two
whose rows never said "torso". Words choose bodies. These ones are chosen deliberately.

## The rules that are not negotiable

### 1. The three-layer stack, drawn behind a flat fill

Every creature is drawn three times from ONE shared geometry group, in this order:

1. Halo pass: `fill` and `stroke` = `keylineLight` (`#ffffff`), `stroke-width="40"`.
2. Ink pass: `fill` and `stroke` = `inkKeyline` (`#141422`), `stroke-width="20"`.
3. Body pass: `fill="currentColor"`, no stroke.

Both stroked passes carry `stroke-linejoin="round"` and `stroke-linecap="round"`, so the rim turns
corners without spiking.

Because the body fill is painted last and on top, it covers every internal contour. Overlapping
limbs weld into one clean union with no internal seams, and no stroke can overhang the shape it
belongs to. The clean-edge requirement is therefore satisfied BY CONSTRUCTION. You do not
hand-tidy anything.

What is left over is exactly a 10-unit ink rim around the union, and a 10-unit white rim outside
that. Uniform, unbroken, and the same width at every point on the creature. That is the solid outer
line this project is built on. It is a consequence of the construction, so the way to keep it is to
keep the construction: never taper a limb toward a point, never stroke a part on its own, and never
add a second outline of your own.

Stroking each part individually is the failure mode. Rings pile up where parts meet, the interior
floods with ink, and the player color loses most of the sprite to its own outline. Do not do it.

### 2. Both strokes ship. Neither one is decoration

The two strokes are a COMPLEMENTARY PAIR, not a halo plus an outline. Measured contrast ratios:

| Ink | vs `bgDeep` `#1a1a2e` | vs `terrainPlain` `#7c9a4e` | vs `bgPanel` `#22223a` |
| --- | --- | --- | --- |
| halo `keylineLight` `#ffffff` | 17.06 | 3.19 | 15.46 |
| keyline `inkKeyline` `#141422` | 1.07 | 5.72 | 1.18 |
| player0 fill `#ff5a5f` | 5.59 | 1.04 | 5.07 |
| player1 fill `#4fd8ff` | 10.23 | 1.91 | 9.28 |
| player2 fill `#3aaa18` | 5.64 | 1.05 | 5.11 |
| player3 fill `#f872e8` | 6.96 | 1.30 | 6.31 |

Read the bottom four rows first. THREE of the four player colors are invisible on terrain by body
fill alone: coral 1.04, green 1.05, orchid 1.30. Cyan reaches 1.91 and still misses the 3:1 bar.
This is not a green problem and it is not a one-color problem. The terrain defeats the whole
palette.

Now read the top two rows. The white halo is excellent on the dark panels and marginal on terrain.
The dark keyline is the exact inverse: excellent on terrain, functionally invisible on the panels.
Neither stroke works alone on all three backgrounds. Together, one of them is always doing the
work.

If a future change drops either stroke to save a path, creatures will vanish: the keyline on
terrain, or the halo on the panels. Keep both, on every species, always.

Halo color, and the one place the exemplar is overruled: set_5 and the other bake-off sets used a
cream or bone white (`#f3ead8`, `#f6f1e4`), which measures 2.83:1 on terrain, just under the 3:1
non-text minimum. Pure white (`keylineLight`, `#ffffff`) measures 3.19 and clears it. The rim is
therefore WHITE, not cream, everywhere in production. Nothing else about the exemplar's rim
changes: same 40 units, same uniformity. If you are matching set_5 by eye and your halo looks
slightly warmer than the shipped sprites, that is this rule, working as intended.

Widening the halo instead of lightening it was considered and rejected: it would push the notch
floor above 40 units (see below), and the bake-off's heaviest-rimmed set measurably lost body area
and player color at 18.

### 3. The geometry floors

The halo stroke is 40 units wide, so it grows the silhouette 20 units outward on every side. That
one fact produces both floors, and it is what silently ate three separate artists' first flapper
wings. Set_5's own notes derive the same 40-unit figure independently, and call it the cost of the
halo, stated honestly.

Both floors are GEOMETRIC, so they bind at EVERY size, not just at the small rungs. A feature under
a floor is not a feature that gets hard to see when the sprite is small -- it is a feature that is
not in the vector union at all. See
[The pipeline is vectors](#the-pipeline-is-vectors-only-the-browser-makes-pixels).

- NOTCH FLOOR (the INK floor): no notch, gap, slot, or air gap narrower than 40 grid units (4 px at
  the 32 rung). The halo grows 20 units in from each side of a gap, so anything tighter is filled
  solid and not even a white slot survives. Your negative space simply will not exist. Note
  carefully that clearing this floor buys you a notch in FULL COLOR only -- a gap of exactly 40
  still shows NO background and vanishes in silhouette. A notch that must survive as a black shape
  costs more; see
  [40 is a FLOOR, not a TARGET](#40-is-a-floor-not-a-target-budget-48-to-74-for-any-notch-that-must-show)
  immediately below.
- LIMB FLOOR: no limb, antenna, wing, leg, or appendage whose FILL width is under 26 grid units
  (2.6 px at the 32 rung, 2.0 px at the 24 px floor). Each side of a limb carries 10 units of ink
  and 10 units of white outside the fill. Below 26 units of fill, the rims dominate the limb's
  apparent width and it renders as a dark stick with almost no player color in its middle.
- NO TAPERED POINTS. A limb that narrows to a cusp does not end in a point in the rendered union: the
  stroke terminates in a round join of 20-unit radius, which BLUNTS the cusp BY CONSTRUCTION, at
  every size and at every zoom. Drawing the point finer makes the blunting more complete, not less.
  End limbs in a rounded terminal at or above the limb floor and you will get the shape you drew.

The exemplar sits 2 units under the limb floor: set_5's leggite legs are 24 units thick. Draw
production legs at 26 or more. This is the smallest of the four supersessions and the easiest to
forget.

These floors force smaller bodies and longer, fatter limbs than you would naturally draw. That is
the correct proportion for the 24 px floor anyway. Accept it.

#### 40 is a FLOOR, not a TARGET: budget 48 to 74 for any notch that must SHOW

The notch floor is a floor for the INK. It is not a floor for the SILHOUETTE, and confusing the two
is the most expensive mistake an artist can make in this system, because the drawing looks RIGHT the
whole time you are making it.

At a gap of exactly 40, the halo closes the slot: 20 units of white grow in from each side and meet
in the middle. In FULL COLOR that still reads -- you see a white slot with an ink rim down each side
of it, and the notch is plainly there. But the OUTER BOUNDARY of the union is now smooth across the
gap, because the halo has bridged it. Turn the color off and the notch is GONE.

This is measured, not predicted. An artist's first draft passed every floor, looked correct in
color, and COLLAPSED when rendered as flat black: a 50-unit crown slot, a wing-to-tail bay and a set
of 44-unit gaps between limbs all vanished at once, and four species flattened into the same rounded
rectangle. Two artists hit this independently and traced it to the same cause.

The arithmetic is simple. The background you actually SEE through a gap is the gap minus 40:

| Gap in the fill geometry | Background visible in silhouette | Verdict |
| --- | --- | --- |
| under 40 | none, and no white slot either | below the ink floor, invisible in every mode |
| 40 | none | reads in color, DISAPPEARS in silhouette |
| 48 | 8 units | the practical minimum for a notch that must carry identity |
| 60 | 20 units | comfortable |
| 74 | 34 units | generous; past this you are spending body area |

So: a notch that must show in the SILHOUETTE needs about 40 units to pay the halo, PLUS the width
you actually want to see. BUDGET 48 TO 74 UNITS. Every notch this contract calls a mandatory outline
cue is silhouette-bearing, and those are the notches that decide whether the cast separates. Draw
them at 48 or more. Reserve the bare 40 for gaps you only need to read in full color.

Judge every notch you care about by looking at the creature as FLAT BLACK. That is the only test
that tells the truth.

#### VERTICAL notches are affordable; LATERAL ones are not

There is a second consequence of the halo, and it is a hard arithmetic limit rather than a
preference. It governs every species with an appendage out to the side.

The halo grows the union 20 units outward on every side, so all fill geometry must live inside
`x=20..180`. THE USABLE BAND IS 160 UNITS WIDE, not 200. Now try to put open background between an
arm and a torso, which is what a person-shaped creature wants:

```
arm 26 + gap 40 + torso 40 + gap 40 + arm 26 = 172 units
```

172 is wider than the band. It DOES NOT FIT, and that is with an implausibly thin 40-unit torso; the
humanoid's dominant mass has a floor of 60, which takes it to 192. There is no species on this
canvas for which a lateral air gap beside a limb is buildable. The exemplar does not attempt it
either: set_5 WELDS every arm to every torso.

The law, and it is general:

- VERTICAL notches are affordable. A leg split, a post split, an antenna V, a tail fork, a crown
  slot and the air between two limbs all open UPWARD or DOWNWARD into unlimited background. Nothing
  competes with them for the 160-unit band. Budget them at 48 to 74 and they will show.
- LATERAL notches are not affordable. Anything that asks for open background BESIDE a limb is
  competing with the body for horizontal room and it loses.

So EVERY LATERAL APPENDAGE IS WELDED to the body, and it earns its keep in the outline PROFILE
instead: an arm reads because it BREAKS THE TORSO'S OUTLINE -- a stepped shoulder, a knob, a lobe, a
spike, a bulge that a straight-sided torso would not have -- and not because there is sky behind it.
This is a positive instruction, not a compromise. A welded arm that changes the profile survives at
24 px. A floating arm with a 40-unit gap behind it was never going to exist.

This binds the three armed creatures -- humanoid, mechtron, bonzoid -- and anything else with a
side-mounted part.

### 4. The four-color budget

A creature contains at most FOUR colors in the rendered result:

| Role | Value | Palette token | Used for |
| --- | --- | --- | --- |
| body | player tint | `currentColor` | the whole silhouette union |
| halo | `#ffffff` | `keylineLight` | halo pass, and eye whites |
| keyline | `#141422` | `inkKeyline` | ink pass, and pupils, and the mouth |
| accent | `#ffd23f` | `gold` | exactly one warm accent shape |

`inkKeyline` is a new token the palette lane adds to `src/ui/sprites/palette.ts`. `keylineLight`
and `gold` already exist there.

The eye whites reuse the halo color and the pupils reuse the keyline color, so a full face costs
zero extra colors. That is deliberate.

Forbidden, and this is the documented trap: interior panels, rivets, banding, seams, joint lines,
and feather bars. The bake-off set with the best concepts at 4x was covered in panels and rivets.
It scored WORST at 18 and had the lowest player-color share of all five (0.34). Interior detail
looks excellent while you are drawing it and dies at true scale, and it eats the player's color,
which is the entire point of the system.

#### The one permitted under-shade

One exception, and exactly one. A creature MAY carry a single soft under-shade over its LOWER body,
which is what gives the exemplar's bodies a bottom. It is optional. A species drawn without it is
complete and conforms.

If you use it, it is spelled exactly like this and no other way:

- One `<mask>` per frame, holding a single `<use>` of that frame's own shapes group, painted white:

  ```xml
  <mask id="humanoid-f1-mask"><use href="#humanoid-f1-shapes" fill="#ffffff"/></mask>
  ```

- One `<rect>` per frame, `fill="#141422"` (the keyline token, never a neutral grey),
  `opacity="0.16"` and never higher.
- Confined to the silhouette by wrapping the rect in `<g mask="url(#<species>-fN-mask)">`. It can
  then never overhang the creature.
- Painted after the body pass and before the face, so it darkens the body and never the eyes, the
  mouth, or the gold accent.
- Its top edge sits below the mouth. The face never gets shaded.

This is the only `opacity`, and the only `mask`, allowed anywhere in a creature.

#### Why the shade is a mask and not a clip

Keep this as a mask. The obvious "simplification" back to a `clipPath` deletes the shade, and does
it silently, in the artist's browser preview and in the game at the same time, so nobody sees a
difference and nobody gets an error.

A previous revision of this contract specified the clip as
`<clipPath id="<species>-fN-clip"><use href="#<species>-fN-shapes"/></clipPath>`. That does not
render. Per SVG, a `<use>` inside a `clipPath` contributes clip geometry only when it references a
GRAPHICS element; the shapes group is a CONTAINER (`<g>`), so Chromium resolves the clip to EMPTY
and the shade rect paints nothing, anywhere.

This is measured, not inferred. A pixel probe on a generated shaded humanoid frame 1 in the green
tint read `#3aaa18` on the torso above the shade and `#3aaa18` on the leg INSIDE the shade rect --
identical. A working 0.16 ink shade reads about `#349219`. A three-form probe isolated the
mechanism:

| Form | Spelling | Result |
| --- | --- | --- |
| A | `clipPath` > `use` -> group | NOT SHADED, clip resolves empty |
| B | `clipPath` > `use` -> shape | works |
| C | `clipPath` > inline shapes | works |
| D | `mask` > `use` -> group | works |

Form D is what this contract requires, because a `<mask>` CAN reference a container. The shade
therefore keeps following the exact same shared shapes group the three-layer stack is painted from,
and the single-source-of-truth invariant in [rule 1](#1-the-three-layer-stack-drawn-behind-a-flat-fill)
survives intact.

Form B and form C were rejected: both need the clip to hold COPIES of the geometry, so a shade's
clip can silently drift out of agreement with the silhouette it is supposed to follow. That is the
precise failure the one-shared-geometry-group rule exists to prevent.

Why it is permitted, having been banned in the previous revision of this contract. An A/B render of
set_5 with the shade and with it stripped, at 18 and 32 px, in coral and green, on all three
backgrounds, is indistinguishable at both sizes: the shaded region is one to three device pixels
tall there, and a 16 percent value step across it cannot be seen. The shade only becomes visible at
44 and 64. So it costs nothing at the sizes the game is judged at and adds form at the sizes the
player leans in for. The measurements agree: set_5 ships this shade and still had the HIGHEST
player-color share of any candidate at every single rung (0.52, 0.54, 0.63, 0.64) and the only
face that survived 18 px. Blending `#141422` at 0.16 into the green player token yields `#348e1a`,
a hue shift of about 2 degrees, so it cannot cost a sprite its player-color read.

The cap of 0.16 and the ink token are both load-bearing. The bake-off candidate that DID lose its
hue to shading used a heavier neutral grey over the whole body, and dropped to 3 of 5 on
player-color dominance for it. Neutral grey desaturates; the keyline ink darkens. Do not substitute
one for the other, do not raise the opacity, and do not add a second shade.

### 5. Frame 2 changes the OUTLINE

Frame 2 must change the silhouette, not an interior detail. An interior change is invisible at 24
and therefore is not animation. The bake-off's anti-pattern was a mechtron whose frame 2 was a
visor blink: nothing happens on screen. The template to copy is the exemplar's flapper wing V,
where the wings sweep from a horizontal spread to a raised vertical V and the outline is
unmistakably different even in pure silhouette.

Minimum motion: at least one silhouette extremity moves by at least 40 grid units between frames.
That threshold is the ink floor, 40 units, which is the smallest geometric feature this system can
resolve at all, so a smaller move cannot be seen either.

A MOVE is not a NOTCH, and 40 is honest here in a way it is not for a gap. Displacing an extremity
shifts the OUTER boundary, and the halo grows both frames equally, so the whole 40 units of travel
survives into the silhouette. A 40-unit gap, by contrast, is closed by the halo and shows nothing
(see [40 is a FLOOR, not a TARGET](#40-is-a-floor-not-a-target-budget-48-to-74-for-any-notch-that-must-show)).
Move by 40 or more; open a silhouette-bearing gap by 48 or more.

The frame-2 motion for each species is assigned in
[The eight body plans](#the-eight-body-plans).

### 6. Eyes are LIGHT shapes carrying a DARK pupil

The face sits ON THE DOMINANT SHAPE. Put the eyes and the mouth directly on the largest mass of the
creature -- on the orb, on the toad mass, on the box, on the wing form -- exactly as the reference
sheets do. A separate head is ONE option among several, not the default, and the body plan you were
assigned says whether your species has one. Only the humanoid has a head as a matter of course.

This rule binds all eight species. The mule is the one creature with no face at all: it is a
headless robot, and it carries no eyes and no mouth. See [The mule](#the-mule).

Draw each eye as a `keylineLight` shape with an `inkKeyline` pupil inside it, sitting on top of the
body fill. The eye shape itself carries NO stroke.

Set_5 is the example: `<circle cx="87" cy="97" r="14" fill="#f7f7ff"/>` with a `#141422` pupil, and
not one stroke attribute between them. Set_3 is the counterexample: its eyes carry
`stroke-width="8"` of ink, which eats the light area from both sides as the sprite shrinks, and by
18 px there is no light left. The whole eye collapses into the dark band. That is the exact
mechanism by which the blind evaluator's winner lost its face, and it is why set_5 was the ONLY
candidate of five whose face survived 18 px. It is the single biggest readability win the bake-off
found.

Also required, per species:

- Two eyes, large. (The two single-eye species, gollumer and spheroid, get one large eye instead.)
- One mouth, wide, in `inkKeyline`. Draw a wide friendly smile. It is the warmest, most
  on-reference expression the bake-off produced.
- Exactly one warm `gold` accent shape: a beak, an eye ring, a crest, an antenna tip, a single
  square set into the body. One per species, no more. It survives 18 as a colored dot, acts as a
  focal point, and helps species identification. It is an accent, and it is never the thing that
  tells two species apart -- the BODY does that.

That is the entire interior: two eyes, one mouth, one accent, and at most the one permitted
under-shade. Nothing else. Everything else was drawn by other artists, tested, and cut.

### 7. On a many-limbed creature, every limb is the SAME length

A fringe of legs reads as anatomy when the legs march down the body evenly, and as damage when they
do not. The exemplar fails this rule and it is the one thing about set_5 that must not be copied:
its leggite's eight legs measure 60, 48, 62, 78, 62, 76, 66 and 54 units. A 30-unit spread between
the shortest and the longest is 3 device pixels at 32 px tall, which is plainly visible, and it
reads as a creature that has lost pieces of itself.

The rule, for the leggite and for any species with more than two limbs of a kind:

- Every leg is the same length as its siblings, within 4 units. Both frames. THIS is the measured
  part of the rule and it binds every many-limbed creature without exception.
- The nominal length is 64 grid units for the leggite, the spheroid and the mule.
- Every leg is the same thickness, at least 26 units (the limb floor).

The 64 is set_5's own leggite mean, rounded. It is a good default for a creature whose legs are
LEGS, and it is not a universal constant. The packer's four limbs are deliberately undersized
against a huge body, so the packer sets its own nominal in its row (40 to 56 units) and the
equality still binds at plus or minus 4. What stops a creature reading as damaged is that its limbs
MATCH EACH OTHER, not that they match some number carried over from another species.

The tolerance is 4 units because that is 0.4 px at the 32 rung and 0.3 px at the 24 px floor: a
difference below half a pixel at the size you design for cannot be seen, so anything inside the
tolerance is free. Set_5's 30-unit spread is 7 times that. The 64-unit nominal is set_5's own mean leg length
(63.25) rounded, so a leggite drawn to this rule keeps the exemplar's proportions and only loses
the raggedness.

Vary the ANGLE, not the length. The legs still fan across the 70-to-105-degree band off vertical
that the archetype requires, and frame 2's ripple is carried entirely by rotating each leg to a
different phase. A wave made of equal-length legs is a walk. A wave made of unequal legs is a limp.

### 8. The dock badge is a FACE crop, not the full body

The dock badge is 18 UNITS of markup, which the auction stage paints at 24 CSS px on the nominal
1280x800 viewport and at 19.2 px on the 1024x640 minimum (see
[The sizes the game actually paints](#the-sizes-the-game-actually-paints)). Twenty-four pixels minus
two strokes on each edge leaves roughly 16 px of body, and at the minimum viewport rather less. NO
candidate in the bake-off kept a readable face at that size. Shape and player color survive at the
bottom of the ladder; faces do not.

So each species ships a third symbol, `<species>-head`: a square window onto the FACE REGION of
frame 1 -- wherever on the creature the face actually lives. On a species with a distinct head that
window lands on the head. On an orb, a box or a toad mass whose face sits on the body, the window
lands on that part of the mass. The symbol id is `<species>-head` because the lint and the generator
read that name; the name is a label, not an instruction to grow a head. The dock badge draws this
window instead of the full body, spending every one of those pixels on the most identity-bearing
part of the creature.

The exemplar argues the opposite case in its own notes, and ships the same symbol to the dock with
no crop. That argument is not accepted here, for a reason that has nothing to do with set_5's
quality: it is a discipline claim, not an art claim. A full body in the badge only works when every
silhouette carries alpha-grade negative space, and three of five artists already failed that at
only three species. Eight parallel lanes will not hold it uniformly. Mandating the crop de-risks the
scale-out instead of betting on it.

Do not try to make a face work on a full body in the badge. It does not work.

### 9. A creature FILLS its frame, and never becomes a rectangle

A creature that leaves most of its canvas blank is wispy and does not read on screen. A creature
that fills all of it has no silhouette left. Both are real failures and both have been drawn.

CANVAS COVERAGE is the metric, and it is defined precisely, because a loose definition here would be
argued about instead of measured:

> CANVAS COVERAGE = the area of the PAINTED CREATURE -- its color fill PLUS its outline, which is
> all the ink a viewer actually sees -- as a percentage of the canvas box. The box is 200x320 for a
> species and 320x200 for the mule.

Coverage counts the PAINTED result, not the fill geometry, and that is the one place in this
document where a rule is stated against something other than the fill (see
[Every number in this document is FILL geometry](#every-number-in-this-document-is-fill-geometry-never-rendered-pixels),
which governs everywhere else). It is deliberate: the ink rim is 10 units wide all the way around,
so a thin creature paints substantially heavier than it draws, and a rule about how much ink the
viewer sees has to count the ink the viewer sees.

The two failure modes:

- TOO EMPTY. A creature that leaves roughly three quarters of its canvas blank is a wisp. It has no
  presence on a busy background and no mass for the player color to live in. THIS BINDS EVERY
  CREATURE, THE LEGGITE INCLUDED. A thin column with a few thin legs is a stick insect that vanishes,
  not a centipede. There is no species in this cast for which a mostly empty canvas is the correct
  answer.
- TOO FULL. A creature that approaches 100 percent is a filled rectangle. It has no silhouette,
  nothing to recognize, and it defeats the entire separation system this contract is built on.

#### The ceiling is pi/4, about 78.5 percent

An ELLIPSE INSCRIBED IN ITS BOX covers `pi/4 = 78.5%` of that box. That is a maximally ROUND creature
that completely fills its frame -- there is no rounded body that fills a box more than an ellipse
does. ABOVE 78.5 PERCENT YOU ARE PAINTING INTO THE CORNERS, and a shape that reaches into the corners
of its box reads as a rectangle rather than as an animal.

Use pi/4 as the ceiling reference for every creature.

THE CEILING BINDS THE MECHTRON TOO. Do not exempt it for being rectilinear -- it is the species most
likely to be argued into an exemption and the species that can least afford one. THE MECHTRON NEEDS
ITS EMPTY SPACE IN ORDER TO MOVE ITS LEGS:

- Its 48-to-74-unit post split has to SHOW in the silhouette, and a split is empty canvas by
  definition.
- Its frame 2 lifts a post, and a lifted post needs somewhere to lift INTO.
- That split base is the entire wedge against the bonzoid's solid unbroken track (see
  [How each creature meets the ground](#how-each-creature-meets-the-ground)). A mechtron filled
  toward 100 percent has destroyed its own animation and its own most important separation, in one
  move.

The principle generalizes to the whole cast, and it is the reason this rule has a ceiling at all:
NEGATIVE SPACE IS NOT WASTED CANVAS. IT IS WHERE THE SILHOUETTE AND THE MOTION LIVE.

#### The floor is TBD, and it will be measured, not guessed

There is no numeric floor in this document yet, and one is not invented here. Canvas coverage is
being measured across the existing casts, calibrated against set_5 -- the art the human approved --
and the floor will be set from that evidence. See
[active_plans/reports/alien_canvas_coverage.md](active_plans/reports/alien_canvas_coverage.md).

Until the floor lands, the rule is the RULE and the ceiling: fill your frame, stay under pi/4, and
do not ship a creature that leaves most of its box empty.

Whether the floor is ONE number for the whole cast or one per body plan is part of what the
measurement has to settle, because several plans CAP their own reachable coverage by design and
those caps are not negotiable:

- The PACKER is required to be squat (aspect 0.7 to 1.0) on a 5:8 TALL canvas, so a correct packer
  leaves real vertical canvas empty and cannot come close to the ceiling.
- The SPHEROID owes at least 60 units of clear air under its lowest leg tip, and its orb sits in the
  upper two thirds.
- The FLAPPER is airborne, with clear air under the whole creature.

A floor set from the roundest, fullest species and then applied flat to these three would ask them
to violate their own plans. The plan wins; the floor gets fitted to the plans.

One tension is known and is named here rather than hidden, because an artist will meet it before the
measurement lands. THE LEGGITE is the species where the coverage floor pushes hardest against
another rule: its column is capped at 32 units when its legs reach fully horizontal (see
[The measurements](#the-measurements)), and a 32-wide column with a few legs is exactly the wispy
creature this rule forbids. The two are reconcilable, and the leggite's coverage has to come from
its LEGS rather than its column: four to six legs at or above the 26-unit limb floor, 64 units long,
reaching 130 to 160 across at the tips, each painting 20 units wider than it draws once the ink rim
is counted. A leggite that clears the coverage floor will be one with GENEROUS, LONG, THICK legs, not
one with a fatter column. If the measured floor turns out to be unreachable that way, the floor is
wrong and gets adjusted -- the column cap is load-bearing geometry (it keeps the leg tips inside the
canvas) and the mechtron separation depends on it, so it is not the number that gives way.

## The eight body plans

This section is an ASSIGNMENT, not a measurement. It is the one part of this contract the evidence
demanded but could not supply.

Read the body plan first. It is the whole of your species: what it is made of, and how it is put
together. Everything after it is a measurement OF that plan, and no measurement here licenses a part
your plan does not have. If your row does not give you arms, you have no arms. If it does not give
you a head, your face goes on your body.

### The plans

| Species | Locomotion | The animal | Face sits | Limbs |
| --- | --- | --- | --- | --- |
| Humanoid | WALKS | A person. The one head-torso-arms-legs creature in the cast. | on a distinct head, above the torso | two arms, two legs |
| Flapper | FLIES | A BIRD, airborne. The winged form IS the body: one wedge whose upper edges sweep out into wings. | on the wedge itself, between the wings | two wings, which ARE its arms; a forked tail; tucked feet or none |
| Bonzoid | ROLLS ON TREADS | Johnny 5. A chassis riding a wide flat TRACK, with oversized arms. Exaggerated energy, oversized somewhere. | on the chassis, or on a WIDE sensor visor above it | two oversized arms; NO legs at all |
| Gollumer | SLIMES | A SNAIL. A lopsided oozing mass sitting straight on the ground on its own foot. | on the mass, one large eye | none: no arms, no legs, no tentacles |
| Spheroid | FLOATS | A WAR-OF-THE-WORLDS TRIPOD. A flying-saucer orb with THREE legs hanging beneath it. It hovers; the legs dangle. | on the orb, one large eye | EXACTLY THREE legs. Not two, which is a biped. Not six. Three is the tripod and three is the identity. No arms. |
| Leggite | SLITHERS on many legs | A CENTIPEDE. A tall narrow S-column that undulates, fringed with legs down both sides. | on the column near the top, no head | four to six large near-horizontal legs; NO arms |
| Mechtron | WALKS HEAVY | A HEAVY ANDROID. A rigid rectilinear box that steps with weight. Machine geometry, not human proportion. | on the face of the box, no head | two arms, two posts, two antennae |
| Packer | HOPS | A TOAD. One huge rounded mass -- the biggest body in the cast -- carried on four comically undersized T-rex limbs. The mass IS the creature and the limbs are nearly vestigial. It does not carry a pack. It IS the pack. | on the mass: two eyes and a wide toad mouth | FOUR tiny limbs, splayed frog-style. NO arms. |

EIGHT OF THE NINE HAVE NO HEAD. Only the humanoid has a head on a neck. Everything else carries the
face directly on its dominant mass, with nothing above the face a player could read as a head. A
lump added to the top of a wedge, a box or a rounded mass is a head, and it is out of contract. Two
narrow allowances, both shaped so they cannot become a head:

- The bonzoid may carry a sensor visor above its chassis, and its face may sit there. That visor is
  WIDER THAN IT IS TALL -- a scope bar, not a ball. A round head on a body is the humanoid's, and the
  bonzoid does not get one.
- The mule has no face at all. See [The mule](#the-mule).

ONLY THREE CREATURES HAVE ARMS: humanoid, mechtron, bonzoid. Flapper, spheroid, leggite, gollumer,
packer and the mule have NONE. Arms are the part that turned every creature in the last round into a
person holding something, so the arm budget is spent deliberately and the six armless plans stay
armless. The flapper has wings INSTEAD OF arms, because a bird does not have both. The packer is
armless on purpose: an armless creature cannot read as a person.

Of the three that do have arms, only the humanoid has a head AND arms AND legs. The mechtron has
arms and posts but NO head. The bonzoid has arms and a visor but NO legs. If you have drawn a
creature with all three, you have drawn the humanoid, whatever species you were assigned.

### How each creature meets the ground

This is the locomotion axis made checkable. Nine creatures, nine different answers, and no two of
them can be confused as black shapes at 24 px.

| Species | Ground contact | Clearance under the dominant mass |
| --- | --- | --- |
| Humanoid | two feet, with a leg split between them | the leg length |
| Flapper | NONE. It is airborne. | the whole creature is clear of the ground line |
| Bonzoid | one continuous flat TRACK, at least 120 wide | ZERO: no gap under the chassis, no leg split, ever |
| Gollumer | its whole underside, flat on the ground | ZERO |
| Spheroid | NONE, EVER, in either frame. Its three legs dangle and never reach the ground line. | at least 60 units of clear air below the LOWEST LEG TIP |
| Leggite | four to six legs splayed near-horizontal | full height, the column runs top to bottom |
| Mechtron | two posts, with a split 48 to 74 wide between them | the post length |
| Packer | four small feet, splayed, in a low crouch | AT MOST 20 in frame 1: its belly all but touches the ground. In frame 2 it is AIRBORNE. |
| Mule | four leg columns | AT LEAST 60. Real clearance is its signature. See [The mule](#the-mule). |

The bonzoid and the mechtron are the two machines in the cast, and this table is where they part
company: the bonzoid's bottom edge is one unbroken horizontal line with NO gap beneath it, and the
mechtron's is two posts with a hole between them. Solid base against split base is a binary a player
resolves instantly in silhouette, and it does not depend on surface detail.

Two creatures never touch the ground, and each fails completely if it does. The flapper is airborne.
The spheroid HOVERS: an artist who plants a spheroid leg on the ground has drawn the wrong creature.
Its legs are legs -- straight-ish and tapering, not tentacles -- and they hang.

### The measurements

Every number is in grid units of the 200-wide canvas. DOMINANT MASS means the single largest
connected shape in the creature -- the orb, the box, the toad mass, the chassis, the wedge, the
column. It is a shape, not a body part, and it is measured at its widest. ASPECT means the dominant
mass's height divided by its width: above 1 is a tall shape, below 1 is a wide one.

#### Every number in this document is FILL geometry, never rendered pixels

This is stated once, here, and it governs every measurement in the contract with exactly one named
exception. Two artists read the same row two different ways last round, which is how a cast comes
back inconsistent.

MEASURE THE FILL. Every width, span, gap, mass and limb length is the geometry you type into the
`<g id="...-shapes">` group, BEFORE any stroke is applied. It is what the lint measures and what the
silhouette symbols contain.

THE ONE EXCEPTION IS CANVAS COVERAGE ([rule 9](#9-a-creature-fills-its-frame-and-never-becomes-a-rectangle)),
which is measured on the PAINTED creature -- fill plus outline -- and says so in its own definition.
It is the only rule in this document that counts ink rather than geometry, and it has to, because it
is a rule about how much of the box the viewer SEES filled. Every other number on this page is fill.

The rendered creature is 40 units WIDER than its fill span, because the halo adds 20 units on each
side. That is not a number you draw; it is a number that HAPPENS to you. It has one consequence and
you have already met it: THE USABLE FILL BAND IS 160 UNITS (`x=20..180`), not 200. Every span below
is inside that band, and a creature drawn at the full 160 renders 200 wide and touches both edges of
the canvas -- which is correct, and is what the widest species are supposed to do.

If you find yourself wanting a fill span of 175 or 195, you are thinking in rendered pixels. Divide
the job differently: draw 155 of fill and let the halo carry you to 195.

| Species | Widest span (FILL) | Dominant mass (FILL) | Aspect | Mandatory outline cue (48 to 74 units) | Frame 2 |
| --- | --- | --- | --- | --- | --- |
| Humanoid | 110 to 140 | 60 to 90 wide | tall | the leg split; plus each arm BREAKING the torso outline as a stepped shoulder or lobe -- the arms are WELDED, with no air behind them | a walk: one leg forward, arms counter-swing |
| Flapper | 130 to 160 at the wingtips | AT MOST 60 wide between the wings | -- | a forked tail notch below, and clear air under the whole creature | a flap: wings snap from horizontal V to vertical V |
| Bonzoid | 130 to 155 with the arms out | the chassis; its TRACK is at least 120 wide and sits flat on the ground line | wide | the unbroken flat base; plus the two oversized arms BREAKING the chassis profile as heavy lobes -- WELDED to it, with no air behind them | a rock: the chassis pitches forward over the track and one arm swings out |
| Gollumer | 120 to 145 | 120 to 140 wide, bottom-heavy | wide | asymmetric profile: the left and right outlines differ visibly | a squash: the mass compresses and the crown leans |
| Spheroid | 145 to 158 | the orb: 140 to 148 wide, ROUND (aspect 1.0 plus or minus 0.1), sitting in the UPPER TWO THIRDS of the canvas | 1.0 | the three hanging legs, and at least 60 units of clear air below the lowest leg tip | a bob: the orb rises and the three legs trail and swing. Nothing lands. |
| Leggite | 130 to 160 at the leg tips | AT MOST 60 wide, and AT MOST 32 if the legs reach fully horizontal -- see below | tall, at least 3.0 | four to six large near-horizontal leg spikes, ALL THE SAME LENGTH | a wave: the column flexes and the legs ripple out of phase |
| Mechtron | 140 to 160 | 96 to 130 wide, straight-sided and square-cornered | tall, at least 1.2 | the split between the two posts (48 to 74 wide), plus two antennae breaking the top edge. The ARMS are welded and read in the profile. | a heavy step: one post lifts, the antennae swing the other way |
| Packer | 150 to 158, which IS the mass | the mass: 150 to 158 wide, the BIGGEST dominant mass in the cast. The MASS is CONVEX -- its outline never cuts inward. | squat: 0.7 to 1.0, as wide as it is tall or wider | the two FRONT limbs, split by 48 to 74 units of air under the belly; the two REAR limbs welded, reading as lobes in the profile | THE HOP: the whole body LEAVES THE GROUND LINE and the limbs tuck |

Four plans carry more than two limbs of a kind -- the leggite's four-to-six legs, the spheroid's
three, the packer's four, and the mule's four -- so all four are bound by
[rule 7](#7-on-a-many-limbed-creature-every-limb-is-the-same-length). Every limb of a kind is the
same length within 4 units, in both frames. Vary the angle and the splay, not the length. Nominal
lengths: 64 units for the leggite, the spheroid and the mule; 40 to 56 for the packer, whose limbs
are deliberately undersized (see the rule for why the packer sets its own nominal and why the
equality still binds).

The packer's limbs are the one place its plan can go wrong, and the arithmetic decides how they are
drawn, so read this before you place them.

FOUR LIMBS CANNOT ALL BE SEPARATED BY AIR ON THIS CANVAS. Four limbs at the 26-unit limb floor with
even the bare 40-unit ink gap between each adjacent pair needs `4x26 + 3x40 = 224` units, and the
usable fill band is 160. It does not fit, at any gap, for any packer. (The mule gets away with the
same-looking four-legged cue only because its canvas is 320 wide, so its band is 280. That is the
whole difference.)

So the packer's four limbs read as TWO PAIRS, and each pair earns its keep a different way:

- The two FRONT limbs hang under the belly and are split by 48 to 74 units of air between them. That
  is a VERTICAL notch, it opens downward into open background, and it is affordable: `26 + 48 + 26 =
  100` units, comfortably inside the band.
- The two REAR limbs are LATERAL appendages, so by the law in [rule 3](#3-the-geometry-floors) they
  are WELDED and carry no air behind them. They read as lobes or knobs breaking the profile at the
  bottom corners of the mass.

Both pairs still obey [rule 7](#7-on-a-many-limbed-creature-every-limb-is-the-same-length): all four
limbs are the same length within 4 units. A welded limb is still a limb, and it is still measured.

The limbs angle OUTWARD AND DOWN, frog-style, rather than standing as vertical posts -- that is what
lets the belly sit near the ground while the limbs still read. They angle out WITHIN the mass's own
width; they do not project past it, because the mass already fills the band. The packer's widest
span IS its mass.

A packer whose limbs are swallowed by its own halo reads as a legless blob, which is the gollumer.
The front split is what stops that from happening, so it is not optional.

The leggite has the same kind of arithmetic waiting for it, in the one place nobody looks: its LEG
TIPS. Rule 7 gives it 64-unit legs, and its plan holds them near-horizontal (70 to 105 degrees off
vertical). A leg hung off the edge of a column of width W puts its tip `W/2 + 64` from the
centerline, and the band allows only 80. A 60-wide column therefore throws its leg tips to 94 -- 14
units outside the canvas, where the halo is clipped and the leg ends in a cut-off stump.

So the leggite's column max of 60 is an upper bound it usually cannot spend. If the legs reach fully
horizontal, THE COLUMN IS 32 OR LESS. You buy a wider column only by angling the legs further down,
and the fan is part of the leggite's identity, so the honest move is the narrow column. This costs
nothing that matters: a narrower column pushes the leggite FURTHER from the mechtron (at least 96),
which is the separation the whole cast is built around.

A note on the bonzoid's frame 2, because a naive artist will get this wrong and think they are done:
MOVING THE TREAD CLEATS IS NOT ANIMATION. Cleats are an interior detail, they are invisible at 24 px,
and [rule 5](#5-frame-2-changes-the-outline) requires the OUTLINE to change. The bonzoid's motion
must come from the chassis pitching forward over the track, an arm swinging out, or the visor
craning -- something that moves a silhouette extremity by at least 40 units. Frame 2 is also where
the bonzoid's "exaggerated energy" identity lives, so spend it.

The packer's frame 2 is the opposite problem: it is the easiest in the cast and the biggest outline
change after the flapper's wings. The creature LEAVES THE GROUND. Lift the whole mass clear of the
ground line, at least 60 units of air beneath it, and tuck the four limbs up. That single move is
what makes the packer unmistakable in motion.

### Why these, and the confusions each one is defending against

- Mechtron versus leggite is the failure the bake-off never solved: silhouette overlap (IoU) was
  0.71 to 0.86 in ALL FIVE sets, on both frames. Not one artist made the leggite narrow enough to
  separate it from the mechtron by outline alone. It is broken here by a hard numeric wedge on the
  DOMINANT MASS: the mechtron's is at least 96 wide, the leggite's is at most 60. A wide box cannot
  be mistaken for a narrow column. The exemplar already meets both numbers (96 and 46), so this
  costs nothing to hold. The plans separate them a second time: the mechtron has two posts and the
  leggite has a fringe of four to six large legs, never twenty small ones, all the same length
  (see [rule 7](#7-on-a-many-limbed-creature-every-limb-is-the-same-length)), held near-horizontal
  at 70 to 105 degrees off vertical. Legs at 45 degrees make the leggite read as a person with two
  arms and two legs, which is fatal when humanoid is a separate species.
- Bonzoid versus mechtron is the new version of that problem, because both are machines. They do NOT
  separate on surface detail -- panels and rivets are banned by
  [rule 4](#4-the-four-color-budget) and die at 24 px anyway. They separate on STANCE and FOOTPRINT.
  The mechtron is upright and stepping: aspect at least 1.2, two posts, a split of 48 to 74 units
  between them. The bonzoid is low and rolling: a wide-aspect chassis on a flat track at least 120
  units wide, with NO gap anywhere under it. One has a hole under the body and the other does not.
  That is a binary, it is visible in pure black at 24 px, and it cannot be blurred by detail.
- PACKER VERSUS GOLLUMER IS THE TIGHTEST PAIR IN THE CAST, and it is the one to watch. Both are big
  rounded ground-hugging masses with the face on the mass, and at 24 px a black blob is a black blob.
  Three things separate them, and all three must be present. LIMBS: the packer has four, and its two
  FRONT limbs are split by 48 to 74 units of air under the belly, which cuts a notch a black shape
  cannot hide; the gollumer has NONE, and its bottom outline is unbroken. SYMMETRY: the packer is
  mirror-exact and its MASS is CONVEX (never cutting inward); the gollumer is asymmetric and
  lopsided, with visibly different left and right outlines. MOTION: the packer's frame 2 LEAVES THE
  GROUND; the gollumer's squashes and stays. Judge these two side by side in pure silhouette at
  24 px before approving either one. A packer whose front split is lost in its own halo IS a gollumer,
  which is why that split is budgeted at 48 and not at the bare 40.
- Packer versus spheroid: both are round masses, and they separate on AIR. The spheroid never touches
  the ground in either frame -- at least 60 units of clear air under its lowest leg tip -- and its
  orb sits in the upper two thirds of the canvas. The packer's belly is ON the ground in frame 1
  (clearance at most 20). One hovers, one crouches. The spheroid also has exactly three long hanging
  legs against the packer's four tiny splayed ones.
- Packer versus mechtron: both are bodies on limbs. Three independent axes separate them, which is
  why this pair is safe. Mechtron is HARD (rectilinear, square corners), TALL (aspect at least 1.2)
  and ARMED. Packer is SOFT (rounded, organic, one big convex mass), SQUAT (aspect 0.7 to 1.0) and
  ARMLESS. Any one of those would do; all three together make the pair unmistakable.
- Packer versus bonzoid: these are the two widest bodies in the cast and both sit low against the
  ground line, so they cannot be told apart by size or by height. They separate on CONVEXITY, which
  is the packer's standing defense and the reason its outline rule is written the way it is. The
  packer's MASS is CONVEX: it never cuts inward, and it closes on a rounded belly broken only by the
  split between its two front limbs. The bonzoid is not convex anywhere -- it closes on a STRAIGHT,
  FLAT, UNBROKEN TRACK at least 120 units wide, and its two oversized arms step out of the chassis
  profile as heavy lobes. Flat base against round belly. Two further axes back it up: the bonzoid has
  ARMS and the packer has NONE, and the packer's frame 2 LEAVES THE GROUND while the bonzoid's stays
  welded to it.
- Bonzoid versus flapper: both are wide and both throw mass out to the sides. The flapper's mass is
  in two lateral WINGS with a narrow join, it has a forked tail, and it is AIRBORNE -- clear air
  under the whole creature. The bonzoid is planted on a flat track along the ground line. Nothing
  else in the cast flies, and nothing else in the cast has a solid horizontal base.
- Spheroid was the hardest single species in the set when it was only a circle, because a circle has
  no distinguishing contour at all. The tripod is what solves it: a circle over a three-pronged
  fringe with a GAP UNDER THE WHOLE THING is a shape nothing else in the cast comes near. Draw
  exactly three legs. Two is a biped and six is a leggite; three is the identity. A spheroid that is
  only a circle is not finished, and a spheroid standing on the ground is a different creature.
- Humanoid versus mechtron: both stand upright on two supports and both have arms. The humanoid has
  a HEAD; the mechtron does not, is square-cornered rather than rounded, is wider (140 to 160 against
  110 to 140), has a dominant mass of at least 96 against the humanoid's 60 to 90, and wears
  antennae. Head plus arms plus legs is the humanoid alone.
- Gollumer is the only creature in the cast with NO limbs of any kind and no bilateral symmetry.
  Think SNAIL: it oozes along on its own foot, flat on the ground, one big eye on a lopsided mass.
  Those two absences separate it from everything except the packer, which is the pair above.

Silhouette overlap (IoU) is printed by the diagnostics as a guard rail against blob-shaped design.
It is NOT a gate and production is not scored on it. The bake-off's IoU ranking inverted the truth
on two of five candidates: it ranked the least readable set as the most distinct. The gate is a
human looking at all NINE silhouettes side by side at 24 px -- the eight species and the mule -- and
seeing nine different animals.

## The mule

The mule is the ninth creature and the most-seen sprite in the game. It walks the map beside the
player's alien, often on the same screen at the same time, so it competes for silhouette space with
the whole cast and belongs inside this contract rather than beside it.

### What the mule is

M.U.L.E. stands for Multiple Use Labor Element. It is a ROBOT, not an animal. The reference is a
Boston Dynamics BigDog: a dynamically stable quadruped platform.

| | |
| --- | --- |
| Locomotion | TROTS on four legs |
| The animal | A HEADLESS ROBOTIC QUADRUPED PLATFORM. A horizontal boxy chassis slung between leg columns, carried clear of the ground. |
| Face | NONE. No head, no neck, no eyes, no mouth. |
| Limbs | four leg columns. No arms. |
| Ground contact | four feet, with real clearance under the chassis |

NO HEAD, NO NECK, NO FACE. BigDog has none of the three, and that headless slab-on-legs read is the
whole target. The snout and the upright ears on today's sprite are retired: they are the two most
animal-like things about it, and they are what would let it drift back toward being a donkey. The
mule's identity comes from its chassis, its clearance and its gait, which is exactly the same
argument this contract makes for every other creature.

The mule is therefore the ONE creature exempt from [rule 6](#6-eyes-are-light-shapes-carrying-a-dark-pupil).
It has no eyes and no mouth. It still carries exactly one `gold` accent (a sensor strip, a cargo
clamp), which keeps it inside [the four-color budget](#4-the-four-color-budget) and inside the
visual family. Every other rule applies to it unchanged: the three-layer stack, both strokes, the
white halo, both geometry floors, the mask-form under-shade, frame-2 outline motion, valid XML,
ASCII.

### The mule's canvas

Editing canvas: `viewBox="0 0 320 200"` (8:5, WIDE). This is the exact inverse of the species canvas,
and it is chosen for three reasons.

- The mule is a horizontal creature. Forcing a horizontal animal into a tall box would waste half
  the canvas and quietly pressure the artist to stand it up, which is the same category of mistake
  this contract exists to prevent.
- The grid unit is IDENTICAL to the species grid unit, so every measured rule transfers with no
  recomputation: the 40-unit notch floor, the 26-unit limb floor, the 40 / 20 stroke stack, the
  40-unit frame-2 motion minimum. A different unit would have forced all four numbers to be
  re-derived, and one of them would have been got wrong.
- The decimal-shift property survives: divide any grid number by 10 for screen pixels, so the mule
  draws 32 wide by 20 tall at the 32 px rung, beside a species that draws 20 wide by 32 tall.

### The mule's measurements

| | |
| --- | --- |
| Chassis (dominant mass) | 180 to 240 wide, 60 to 90 tall. Horizontal: aspect at least 2.0, width over height. |
| Ground clearance | AT LEAST 60 units of open air between the underside of the chassis and the ground line. This is the mule's signature and it is also a gap, so it is budgeted as a silhouette-bearing notch: 60 pays the 40-unit halo cost and still shows 20 units of background. |
| Legs | four columns, each at least 26 units of fill (the limb floor) and 64 units long plus or minus 4 (rule 7). |
| Leg gaps | 48 to 74 units of air between adjacent leg columns, front pair to rear pair. Four legs at 26 units of fill with 48-unit gaps needs 248 units, which fits the mule's 280-unit band -- this cue is buildable ONLY because the mule's canvas is wide. |
| Frame 2 | a TROT: the diagonal leg pairs swap, and the chassis dips. At least one silhouette extremity moves 40 units. |

### The mule's separation rules

- MULE versus PACKER. Both are bodies on legs, so the wedge is CLEARANCE, and it is numeric: the
  mule carries at least 60 units of open air under its chassis, the packer at most 20 -- its belly
  is on the ground. The mule strides above the ground on four distinct leg columns; the packer
  crouches on four tiny splayed stubs. The mule is also a hard-edged robot chassis where the packer
  is one big soft convex mass.
- MULE versus MECHTRON. Both are boxy machines. The mule is HORIZONTAL, headless and four-legged.
  The mechtron is VERTICAL (aspect at least 1.2), upright, two-posted and armed. Aspect and stance
  separate them without either one needing a single line of surface detail.
- MULE versus everything else. Nothing else in the cast is a horizontal four-legged platform, which
  is the point of bringing it inside the contract instead of hoping.

### The mule's files

`art/mule/mule.svg`, drawn to the same schema as a species file with three differences: the root
`viewBox` is `0 0 320 200`, the ids are prefixed `mule-`, and there is NO `mule-head` symbol and no
face group, because the mule has no face. It ships `mule-frame1`, `mule-frame2` and the two lint-only
silhouette symbols.

## Symmetry

Frame 1 is mirror-exact about `x=100` for six species: humanoid, mechtron, packer, bonzoid,
spheroid, flapper. Every coordinate pair sums to 200. Mirror the halves from one set of numbers so
they cannot drift.

The spheroid is the one of those six with an ODD number of limbs, so say how its mirror works before
you draw it: one leg sits ON the `x=100` axis and the other two are a mirrored pair flanking it.
That is the only way three legs can be mirror-exact, and it is also the front view of a tripod, so
the constraint and the creature agree. Do not resolve the oddness by dropping to two legs or adding
a fourth -- the leg COUNT is the spheroid's identity and it outranks the symmetry convenience.

Leggite and Gollumer are the two deliberate asymmetry breakers. A standing S-curve cannot be
mirrored, and the gollumer is asymmetric by definition. Note that an asymmetric SPINE does not
license unequal LEGS; rule 7 still holds.

The mule is a PROFILE creature and is not mirrored: it faces the direction it walks, and its four
legs sit at four different depths. Its symmetry rule is rule 7 instead -- four legs of equal length.

Frame 2 may break symmetry for any species, and generally must, because that is where the motion
lives.

## File schema

The lint and the generator are both written against this exact shape. Do not improvise.

### Layout of `art/aliens/<species>.svg`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320" width="200" height="320">
<defs>

	<!-- geometry: the silhouette primitives, no fill and no stroke here -->
	<g id="humanoid-f1-shapes">
		<rect x="70" y="30" width="60" height="56" rx="10"/>
		<rect x="62" y="84" width="76" height="96" rx="12"/>
		<!-- more overlapping primitives -->
	</g>

	<!-- the mask for the optional under-shade: a white use of the shapes group -->
	<mask id="humanoid-f1-mask"><use href="#humanoid-f1-shapes" fill="#ffffff"/></mask>

	<!-- face: eyes, mouth, one gold accent; explicit fills -->
	<g id="humanoid-f1-face">
		<circle cx="86" cy="54" r="14" fill="#ffffff"/>
		<circle cx="114" cy="54" r="14" fill="#ffffff"/>
		<circle cx="88" cy="56" r="7" fill="#141422"/>
		<circle cx="112" cy="56" r="7" fill="#141422"/>
		<path d="M82,70 Q100,86 118,70 L118,64 Q100,78 82,64 Z" fill="#141422"/>
		<rect x="88" y="110" width="24" height="24" rx="4" fill="#ffd23f"/>
	</g>

	<!-- the three passes, the optional shade, and the face, assembled once -->
	<g id="humanoid-f1-draw">
		<use href="#humanoid-f1-shapes" fill="#ffffff" stroke="#ffffff" stroke-width="40"
			stroke-linejoin="round" stroke-linecap="round"/>
		<use href="#humanoid-f1-shapes" fill="#141422" stroke="#141422" stroke-width="20"
			stroke-linejoin="round" stroke-linecap="round"/>
		<use href="#humanoid-f1-shapes" fill="currentColor"/>
		<g mask="url(#humanoid-f1-mask)">
			<rect x="0" y="220" width="200" height="100" fill="#141422" opacity="0.16"/>
		</g>
		<use href="#humanoid-f1-face"/>
	</g>

	<!-- frame 2 repeats the groups above with the "-f2-" infix -->

	<symbol id="humanoid-frame1" viewBox="0 0 200 320">
		<use href="#humanoid-f1-draw"/>
	</symbol>
	<symbol id="humanoid-frame2" viewBox="0 0 200 320">
		<use href="#humanoid-f2-draw"/>
	</symbol>
	<!-- head crop: ZERO-ORIGIN viewBox, and the crop is done by the translate. See below. -->
	<symbol id="humanoid-head" viewBox="0 0 108 108">
		<g transform="translate(-46,-14)">
			<use href="#humanoid-f1-draw"/>
		</g>
	</symbol>
	<symbol id="humanoid-silhouette1" viewBox="0 0 200 320">
		<use href="#humanoid-f1-shapes" fill="#141422"/>
	</symbol>
	<symbol id="humanoid-silhouette2" viewBox="0 0 200 320">
		<use href="#humanoid-f2-shapes" fill="#141422"/>
	</symbol>

</defs>

<!-- PREVIEW: everything below this line is ignored by the generator -->
<rect x="0" y="0" width="200" height="320" fill="#1a1a2e"/>
<use href="#humanoid-frame1" width="20" height="32" x="20" y="20" style="color:#3aaa18"/>
</svg>
```

The shade group is optional. Omit it, and the `<mask>` with it, and the file still conforms.

### Symbol ids

| Id | Purpose | Generated into TypeScript |
| --- | --- | --- |
| `<species>-frame1` | idle pose | yes |
| `<species>-frame2` | motion pose | yes |
| `<species>-head` | dock badge (18 units, paints 24 px) | yes |
| `<species>-silhouette1` | lint mask, frame 1 | no |
| `<species>-silhouette2` | lint mask, frame 2 | no |
| `mule-frame1`, `mule-frame2` | the mule's two walk poses | yes, once the mule pipeline exists |
| `mule-silhouette1`, `mule-silhouette2` | lint mask, mule | no |

The mule ships NO `mule-head` symbol: it has no face, so there is nothing to crop and it never draws
a dock badge. Today `src/ui/sprites/sprites_mule.ts` is hand-written TypeScript, not generated. A
mule drawn to this contract implies `art/mule/mule.svg` generating `sprites_mule.ts` the same way
`art/aliens/*.svg` generates `sprites_species.ts`, and it implies a LAYOUT pass on the mule's draw
sites: today's box is square, and while a square box does not distort an 8:5 symbol (it letterboxes;
see [Square draw boxes do not distort the art](#square-draw-boxes-do-not-distort-the-art)), it does
leave the mule painting shorter than its slot suggests. That work is real and is not the artist's:
it needs planning, not discovering.

The head symbol is a square WINDOW onto the same frame-1 drawing group, not new art. Point it at your
creature's FACE REGION, wherever that lives on the body plan you were assigned; on most species that
is a patch of the dominant mass, not a head. Rules for the window: it is square (width equals
height), between 100 and 140 units on a side, it lies entirely within `0 0 200 320`, and it contains
every eye and the mouth.

#### The head crop is ZERO-ORIGIN plus a translate, and never an offset viewBox

Spell the head symbol exactly as the example above does: a ZERO-ORIGIN square viewBox, `viewBox="0 0
W W"`, with the crop achieved by a `translate` on the draw group. To window onto the square whose
top-left corner is at `(x,y)`, write `viewBox="0 0 W W"` and wrap the `<use>` in
`<g transform="translate(-x,-y)">`.

DO NOT express the crop as an offset viewBox origin (`viewBox="46 14 108 108"`). It looks like the
natural spelling, it is valid SVG, and IT DOES NOT SURVIVE OUR RENDERER. The renderer captures a
symbol by setting the OUTER svg's viewBox to that symbol's viewBox and placing the `<use>` at
`(0,0)`; the symbol then re-applies its own viewBox on top of that, so any symbol with a NON-ZERO
viewBox origin is shifted TWICE. The frame symbols escape only because their origin is `0 0`. A head
crop at `46 14` lands offset by `(-46,-14)` and the face slides straight out of the badge: an artist
who followed the previous spelling literally rendered dock badges with NO EYE VISIBLE.

The zero-origin plus translate form is the same crop of the same art, adds no geometry, uses a
transform that is already allowed, and is correct under BOTH the renderer and a plain browser. The
symbol id stays `<species>-head`, because the lint and the generator read that name.

The silhouette symbols are what make the clean-edge lint buildable at all. The lint renders the
frame and the silhouette, dilates the silhouette mask by 20 units, and fails on any ink pixel
outside it: that is a stroke overhang. Without a fill-free geometry mask the check cannot isolate
stroke from fill, which is exactly why the bake-off's clean-edge check reported `robust: false` and
never ran.

### What is allowed inside `<defs>`

Allowed elements: `g`, `symbol`, `use`, `rect`, `circle`, `ellipse`, `path`, `polygon`, and `mask`
(only in the one form shown above: a single `<use>` of the frame's own shapes group, filled
`#ffffff`, serving the under-shade). This is the whole of the `mask` exception. It is exactly as
narrow as the `opacity` exception beside it: one `<mask>` element per frame, one `<use>` child, no
other content, no other purpose, and no `mask` attribute anywhere except on the shade group. A mask
used for anything else -- a highlight, a texture, a face cutout, a second shade -- is out of
contract. The reason this one is carved out is in
[Why the shade is a mask and not a clip](#why-the-shade-is-a-mask-and-not-a-clip): the clip form
does not render.

Allowed attributes: geometry attributes, `id`, `href`, `viewBox`, `fill`, `stroke`, `stroke-width`,
`stroke-linejoin`, `stroke-linecap`, `rx`, `ry`, `mask` (only on the shade group), `opacity`
(only on the shade rect, only at 0.16 or less), and `transform` limited to `translate(...)` and
`rotate(...)`.

Not allowed anywhere in a creature: `style`, `clipPath`, `clip-path`, `filter`, gradients, `image`,
`text`, `fill-opacity`, `stroke-opacity`, and any `transform` that scales, skews, or uses
`matrix(...)`. A scale transform silently changes the rendered stroke width, which breaks both
geometry floors.

Every `id` in the file is prefixed with the species name. All eight files are inlined into one
shared `<defs>` in the generated TypeScript, so a bare id like `shapes` would collide.

Art files use plain `href`. `xlink:href` is not used anywhere.

Every `fill` and `stroke` value inside `<defs>` is `currentColor`, `none`, or one of the four
values in [The four-color budget](#4-the-four-color-budget), written as a LITERAL hex. Art files
import nothing and reference no palette module; the hexes are typed out. Holding those literals to
the palette is the LINT's job, not the generator's. The preview block below `</defs>` may use any
color, because it never ships.

### What the generator does

The generator reads `art/aliens/<species>.svg` and writes `src/ui/sprites/sprites_species.ts`. Four
decisions it makes are fixed here so no one has to re-derive them from the code.

- It copies everything inside `<defs>` EXCEPT the two lint-only silhouette symbols, in document
  order. The three shipped symbols `<use>` the geometry, face, draw and mask groups, so those groups
  must travel with them.
- It rewrites every `id` in the species file with a uniform `sprite-species-` prefix (symbols,
  geometry groups, face groups, draw groups, masks), and rewrites every `href` and `mask` reference
  to match. This namespaces the species defs against the mule, title and wampus defs mounted in the
  same document.
- It validates STRUCTURE only, and on any violation it fails loudly and writes no output: a missing
  species file, a root `viewBox` other than `0 0 200 320`, an element inside `<defs>` outside the
  allowlist above, an `id` that is not species-prefixed, a non-local `href`, or a missing `frame1`,
  `frame2` or `head` symbol.
- It does not check art rules. The floors, the four-color budget, the palette hexes and the symmetry
  belong to `devel/lint_alien_svg.py`.

### The preview block

Everything after `</defs>` is preview markup: a background rect and some `<use>` instances so a
human can open the file in a browser and see the creature. The generator ignores it entirely: it
copies the contents of `<defs>` (minus the two silhouette symbols) and drops the rest.

Put the preview at 24 px tall and at 32 px tall. Those are the two sizes you are judged at (see
[The judging ladder](#the-judging-ladder-24-32-68-and-90-css-px)).

### Valid XML

`xmllint --noout art/aliens/<species>.svg` must pass.

The trap that broke a real file during the bake-off: a double hyphen (`--`) is ILLEGAL inside an XML
comment, and agents writing prose with em dashes hit it constantly. Use `=` runs for separators and
single hyphens in prose. Files are ASCII only.

## Done when

You are finished with a species when all of these are true. Check them in order.

1. `xmllint --noout art/aliens/<species>.svg` passes.
2. `source source_me.sh && python3 devel/lint_alien_svg.py -i art/aliens/<species>.svg` exits 0.
3. `node devel/render_alien_sheet.mjs art/aliens/<species>.svg` renders the ladder.
4. At 24 px and at 32 px, in ALL FOUR player colors, on ALL THREE backgrounds (`bgDeep`,
   `terrainPlain`, `bgPanel`), you can see the creature and its body reads as the player's color.
5. At 24 px in pure silhouette, the creature matches its assigned BODY PLAN and is plainly distinct
   from the other seven. It carries no limb its plan did not give it, and unless it is the humanoid,
   it has no separate head: its face sits on its dominant mass.
6. The rim is unbroken and the same width all the way around, on both frames, at 32 and at 90. No
   thin spot, no gap, no place where two parts show a seam.
7. Frame 1 and frame 2 differ in the SILHOUETTE, visibly, at 24 px.
8. EVERY MANDATORY OUTLINE CUE SURVIVES AS FLAT BLACK. Render the creature as a pure black shape and
   confirm each cue in your row is still there. A notch that reads in full color and vanishes in
   black is budgeted at 40 and needs 48 to 74. This is the check that catches the failure that
   flattened four species into the same rounded rectangle.
9. All fill geometry lies inside `x=20..180`. Nothing you drew is wider than the 160-unit band, and
   no lateral appendage is asking for open background beside it.
10. If the species has more than two limbs of a kind, every one of them is the same length within 4
    units, in both frames.
11. The face-crop symbol at 24 px shows two eyes (or one, for gollumer and spheroid), a mouth, and
    the gold accent. Its viewBox origin is `0 0` and the crop is done by a `translate`. If the badge
    shows no eye, you have an offset viewBox origin and it has been shifted twice.
12. The mule has no face crop and no face; it is exempt from the face-crop check and from nothing
    else.
13. You did not approve any of the above from the 4x render.
14. Stand your creature's silhouette next to the other EIGHT -- the seven other species and the mule
    -- with the color off. It is a different ANIMAL from each of them, not the same animal holding a
    different object. Its locomotion is legible from the black shape alone: you can see what it does
    to get around.
15. The creature FILLS its canvas without becoming a rectangle: its canvas coverage is under the
    pi/4 (78.5 percent) ceiling, and it does not leave most of its box empty. See
    [rule 9](#9-a-creature-fills-its-frame-and-never-becomes-a-rectangle). The numeric floor is being
    set from measurement; until it lands, judge this one by eye against set_5.

## Related docs

- [../devel/alien_bakeoff/set_5/aliens.svg](../devel/alien_bakeoff/set_5/aliens.svg), the reference
  exemplar
- [active_plans/reports/alien_bakeoff_evidence.md](active_plans/reports/alien_bakeoff_evidence.md)
- [active_plans/reports/alien_canvas_coverage.md](active_plans/reports/alien_canvas_coverage.md),
  the measured canvas coverage that sets rule 9's floor
- [COLOR_CONTRAST_ACCESSIBILITY.md](COLOR_CONTRAST_ACCESSIBILITY.md)
- [MARKDOWN_STYLE.md](MARKDOWN_STYLE.md)
