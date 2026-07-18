# Alien art contract

Version 2, minimal. Version 1 (1264 lines) locked down so much that four independent artists
produced one design; it lives in this file's git history, and its hard-won geometry field notes
are preserved in [active_plans/reports/alien_art_program_status.md](active_plans/reports/alien_art_program_status.md)
and the 2026-07-12 changelog entries. This version states WHO the characters are and the few
technical rules the pipeline needs, and deliberately leaves the rest to the artist. Divergence
between artists is the point, not a defect.

## What you are making

One file per creature: `art/aliens/<species>.svg` on a tall `viewBox="0 0 200 320"` canvas
(the mule: `art/mule/mule.svg`, wide `viewBox="0 0 320 200"`). Two poses per creature: frame 1
at rest, frame 2 in motion. The game inlines these symbols and draws them with the browser at
draw size -- the pipeline is vector end to end, so judge your work by LOOKING at it small
(18 to 32 px tall), never by zooming in.

Two written artifacts precede the drawing; both are commitments made in advance rather than
explanations after the fact:

- THE DESIGN HYPOTHESIS (cast-level, a few sentences): your artist persona, your influences,
  your geometric vocabulary, and what you believe will make these creatures read at 18 to
  32 px. Every SVG file opens with an XML comment carrying this hypothesis.
- THE INTERPRETATIONS (creature-level, one or two paragraphs each): your reading of the
  creature's identity, movement, and personality. Imagine the creature as a character.
  Explain what kind of being it is, how it behaves, and what design themes you intend to
  emphasize. This interpretation becomes the creative foundation for the artwork. Deliver
  the nine interpretations in one file alongside the cast; the dispatch names its location.

Interpretations committed in advance are what make casts diverge; these two artifacts are the
only process requirements.

## Creative latitude

Treat this contract as a source of inspiration, not a script. Provide a unique interpretation
while remaining faithful to the core requirements. Exercise creative judgment wherever the
contract leaves room for interpretation -- it leaves that room on purpose. Where multiple valid
designs exist, choose one that is interesting, cohesive, and well-justified. (Maintainer's
words, 2026-07-16.)

## The characters

This is the heart of the contract. Each creature has a fixed identity, a distinct way of
moving, and a personality. Its identity and locomotion must read in the black silhouette
alone. Its personality must read through its focal features and pose. HOW you achieve those
goals is your design.

The descriptions below define each species' IDENTITY, not its appearance. Multiple artists
should arrive at recognizably different designs for the same species while preserving that
identity. When several interpretations satisfy the contract, favor the one that feels most
original rather than the safest. (Maintainer, 2026-07-16.)

PERSONALITY words below are working defaults set by the maintainer; they are the axis version 1
never had. If a word fights your best drawing, say so in your hypothesis block.

| Species | The being | Moves | Personality |
| --- | --- | --- | --- |
| Humanoid | A person: the one head-torso-arms-legs creature in the cast. | WALKS. Frame 2 unmistakably communicates the walk. | Confident, plucky. The everyman. |
| Flapper | A LARGE bird-like / pterodactyl-like creature, airborne; wings instead of arms. It never touches the ground. | FLIES. Frame 2 unmistakably communicates flying. | Sharp, alert, a little imperious. |
| Bonzoid | A machine of exaggerated energy riding TANK TREADS -- Johnny 5 in Short Circuit; oversized arms, no legs. | ROLLS ON TREADS. Frame 2 unmistakably communicates its rolling, over-energized motion. | Manic, boisterous. |
| Gollumer | A slug -- a Hutt, in the Star Wars sense: a soft lopsided oozing mass on its own foot; no arms, no legs. | SLIMES along. Frame 2 unmistakably communicates the ooze. | Mournful, gentle. |
| Spheroid | A floating War-of-the-Worlds UFO tripod: a flying-saucer orb with three legs dangling beneath it. It floats -- it never walks, never lands, and the legs never reach the ground. | FLOATS. Frame 2 unmistakably communicates floating. | Startled, curious, wide-eyed. |
| Leggite | A tall narrow undulating column fringed with legs; a standing centipede. | SLITHERS on many legs. Frame 2 unmistakably communicates many-legged travel. | Sly, skittering. |
| Mechtron | A heavy rigid rectilinear machine on two posts; machine geometry, not human proportion. | WALKS HEAVY. Frame 2 unmistakably communicates ponderous weight in motion. | Stoic, deadpan. |
| Packer | A large monster with FOUR TINY T-REX LIMBS for legs (maintainer's words); one huge mass -- it IS its own cargo. | HOPS like a toad -- a frog-like hop (maintainer's call). Frame 2 unmistakably communicates the hop. | Dopey, cheerful. |
| Mule | A LITERAL MULE, robotic, engineered for hauling cargo -- Boston Dynamics BigDog is the build reference. It reads as a mule in silhouette (long ears, muzzle, tail, horizontal body) and is constructed as an industrial machine: rigid segmented assemblies, exposed joints, load-bearing posture, four thin legs with real daylight beneath the body. No face crop, no dock badge. | PLODS. Frame 2 unmistakably communicates a steady, load-bearing stride. | Quietly dependable, patient. A working machine, not a pet -- the mild affection you would have for a favorite tractor or old pickup truck. |

### How each creature meets the ground

Nine creatures, nine different bottom edges. This axis is a maintainer requirement, and it is
the cheapest identity signal a player gets: design the bottom of the silhouette on purpose,
before the rest of the body exists if that helps.

| Species | Ground contact |
| --- | --- |
| Humanoid | two feet, with a leg split between them |
| Flapper | NONE -- airborne, clear air under the whole creature |
| Bonzoid | reads as riding a TANK TREAD on the ground (maintainer's ask -- Johnny 5, for visual clarity) |
| Gollumer | its whole underside, flat on the ground |
| Spheroid | NONE, in either frame -- the three legs dangle and never reach the ground |
| Leggite | its many legs; the column runs top to bottom |
| Mechtron | two posts with a visible hole between them |
| Packer | four tiny feet, belly clear of the ground |
| Mule | four leg columns with real daylight beneath the slab |

The paired confusions this table settles in silhouette: bonzoid vs mechtron is solid base vs
split base; packer vs gollumer is a hole under the belly vs no break anywhere; flapper and
spheroid are the two that never land, one winged and one orbed.

### Identity guardrails

Only the humanoid is a person. Design every other creature so its silhouette reads first as
its own kind of being -- keep the anatomy anchored in that creature's identity, and let every
appendage you add serve that read. When an appendage choice is unusual, say why in your
hypothesis block.

Leggite and gollumer benefit from asymmetry. Other species may use asymmetry when it
strengthens the design without obscuring identity.

## Technical rules

The complete list. Anything not stated here is the artist's choice.

1. SOLID FLAT SHAPES. Paint every shape as a flat solid fill at full opacity (the one optional
   under-shade below is the single exception). Body fills use `fill="currentColor"` so the
   player's color tints the creature; make the player color visibly dominant. The file-schema
   whitelist below states exactly which elements and attributes a creature file uses.
2. COLORS come from `src/ui/sprites/palette.ts` tokens: the halo `keylineLight`, the ink
   `inkKeyline`, the optional single `gold` accent, plus `currentColor`.
3. THE DOUBLE STROKE, the one visibility device that is not negotiable: every creature's
   outline is drawn as a `keylineLight` pass at `stroke-width="28"` under an `inkKeyline` pass
   at `stroke-width="20"` (round joins and caps), under the flat `currentColor` body. Evidence:
   three of the four player colors sit at about 1:1 contrast against terrain by fill alone; the
   halo carries the creature on dark panels and the keyline carries it on terrain
   ([active_plans/reports/alien_bakeoff_evidence.md](active_plans/reports/alien_bakeoff_evidence.md)).
   Interior line work, where you use any, is `inkKeyline`.
4. THE FACE MUST COMMUNICATE THE SPECIES' PERSONALITY AT BADGE SIZE (the eight species; the
   mule ships no face). Eyes, sensors, visors, apertures, or other focal features are all
   acceptable if they remain expressive and readable at 18 to 32 px. Most creatures will benefit from visible eyes -- the proven
   construction is light eye shapes carrying a dark pupil, drawn strokeless on top of the body
   (evidence: the only construction whose face survived small sizes in round 1) -- but an
   artist may replace them with another expressive focal feature if the design hypothesis
   explains why it better suits the character. Count, shape, size, lids, brows, mouth,
   expression are yours.
5. AT MOST ONE `gold` accent shape per creature -- a beak, a visor tip, a chest square. It is a
   focal-point option, not a requirement. Zero is fine.
6. FRAME 2 CHANGES THE OUTLINE. Motion an observer can see in the black silhouette at game
   size; an interior-only change (a blink, moved cleats) is not animation.
7. CANVAS COVERAGE, pending calibration: the maintainer's target band is 25 to 75 percent --
   the painted creature (fill plus strokes) over the full canvas box, the `inkCoverage` number
   from `devel/measure_alien_art.py`. The human-approved round-1 exemplar measures 72 to 84
   percent, so the band and the exemplar disagree. Until the maintainer recalibrates, treat
   the band as a target: measure your cast and report each creature's number in the hypothesis
   block. A number outside the band is calibration data, not a rejection.
8. THE OPTIONAL UNDER-SHADE: at most one per frame, an `inkKeyline` rect at `opacity <= 0.16`
   inside a `<g mask="...">` whose mask is a white `<use>` of that frame's own shapes group,
   painted after the body and before the face. Never `clipPath` -- a `<use>` of a group inside
   a clipPath silently renders nothing.
9. ASCII-ONLY valid XML (`xmllint --noout` passes; no `--` inside comments).

## Separability, judged by eye

Before a creature is accepted, stand its frame-1 silhouette next to the other eight with color
off, at 18 and 32 px tall. It must be a different BEING from each of them -- different body,
different bottom edge, different way of moving -- not the same being in a new pose. Numbers
(silhouette IoU, coverage) are advisory diagnostics beside the images, never the verdict.

## File schema

The lint (`devel/lint_alien_svg.py`) and the generator (`devel/build_species_sprites.py`) parse
this exact shape. Per frame N: a fill-free geometry group `<species>-fN-shapes`, an optional
`<species>-fN-mask` + shade, a face group `<species>-fN-face`, and a draw group
`<species>-fN-draw` assembling halo pass, ink pass, body pass, optional shade, face. Then five
symbols:

| Id | Purpose |
| --- | --- |
| `<species>-frame1`, `-frame2` | the two poses, full-canvas viewBox |
| `<species>-head` | square face-crop window for the dock badge |
| `<species>-silhouette1`, `-silhouette2` | lint masks: a single `inkKeyline` `<use>` of each shapes group |

Every id in the file starts with `<species>-`. Allowed elements inside `<defs>`: `g`, `symbol`,
`use`, `rect`, `circle`, `ellipse`, `path`, `polygon`, `mask`. Transforms are
`translate`/`rotate` only (scale silently changes stroke width). A preview block after
`</defs>` is ignored by the generator.

THE HEAD CROP IS ZERO-ORIGIN PLUS A TRANSLATE: `viewBox="0 0 W W"` (W between 100 and 140) with
`<g transform="translate(-x,-y)">` around the `<use>`. An offset-origin viewBox
(`viewBox="46 14 108 108"`) is valid SVG and DOES NOT SURVIVE THE RENDERER -- the crop shifts
twice and the face slides out of the badge. The window contains the face's focal features. The
mule ships no head symbol and no face.

Minimal example of one frame's assembly:

```xml
<g id="humanoid-f1-draw">
	<use href="#humanoid-f1-shapes" fill="#ffffff" stroke="#ffffff" stroke-width="28"
		stroke-linejoin="round" stroke-linecap="round"/>
	<use href="#humanoid-f1-shapes" fill="#141422" stroke="#141422" stroke-width="20"
		stroke-linejoin="round" stroke-linecap="round"/>
	<use href="#humanoid-f1-shapes" fill="currentColor"/>
	<use href="#humanoid-f1-face"/>
</g>
```

(Hex values shown for shape; the real fills must be the palette token values.)

## Done when

1. `xmllint --noout art/aliens/<species>.svg` passes.
2. `source source_me.sh && python3 devel/lint_alien_svg.py -i art/aliens/<species>.svg` exits 0.
3. `node devel/render_alien_sheet.mjs art/aliens/<species>.svg` renders the ladder, and you
   judged the creature at the SMALL sizes, in all four player colors, on all three backgrounds.
4. The silhouette lineup test above: different being from all eight others, locomotion legible
   from the black shape.
5. Frame 1 and frame 2 differ visibly in silhouette at game size.
6. The face expresses the personality word, and the head crop shows it at badge size (the
   eight species; the mule ships no face and no head crop).
7. Coverage measured and reported per creature (rule 7); inside the target band, or the
   number noted as calibration data.

## Related docs

- [active_plans/reports/alien_bakeoff_evidence.md](active_plans/reports/alien_bakeoff_evidence.md)
- [active_plans/reports/alien_cast3_round3_verdict.md](active_plans/reports/alien_cast3_round3_verdict.md)
- [active_plans/reports/alien_art_program_status.md](active_plans/reports/alien_art_program_status.md)
- [RULE_SOURCES.md](RULE_SOURCES.md)
