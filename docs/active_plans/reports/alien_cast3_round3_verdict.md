# Alien cast round 3 verdict

Evaluation of the round-3 full-cast bake-off under `devel/alien_cast3/`: four delivered artist
sheets (`artist_1`, `artist_2`, `artist_4`, `artist_5`; artist_3 never delivered), each drawing
the eight species plus the mule to [ALIEN_ART_CONTRACT.md](../../ALIEN_ART_CONTRACT.md).

Round numbering, for the record:

- Round 1: `devel/alien_bakeoff/set_1..5`, three seed species, blind. Verdict in
  [alien_bakeoff_evidence.md](alien_bakeoff_evidence.md) (winner: alpha; grafts from gamma/delta).
- Round 2: `devel/alien_cast/artist_1..5`, eight species. Failed: every artist produced the SAME
  body plan per species slot, which forced the contract's BODY PLAN assignments
  (`docs/CHANGELOG.md`, 2026-07 entries).
- Round 3 (this report): `devel/alien_cast3/`, nine creatures per artist, drawn to the body-plan
  contract.

Note on the plan of record: [the original plan](../../archive/new_aliens_plan.md) and its successor
(`pure-bouncing-lobster`) specified M3 as four production lanes drawing two species each directly
into `art/aliens/`. Rounds 2 and 3 deviated: full-cast competitive bake-offs instead. The plan was
not updated for this; this report is the M3-equivalent judgment artifact.

## Method

- Each artist sheet rendered in single-file mode (identifiable labels, no anonymization -- the
  judging here is per-cast, and every artist drew the same nine assignments):
  `node devel/render_alien_sheet.mjs devel/alien_cast3/<artist>/aliens.svg`
  (2640 cells per artist; 10560 total).
- Judged at 18 px and 32 px first, silhouette before full color, per the round-1 method. The 4x
  inspection render was viewed last and carries no score. Note: the contract's judging ladder
  is now 24/32/68/90 CSS px but the renderer still emits 18/32/44/64; 18 is judged as the harsher
  stand-in for 24.
- Comparison sheets assembled to `output_smoke/aliens_cast3/sheets/` (one `cast_overview_<artist>`
  silhouette lineup per artist; one `species_<name>` sheet per creature, one row per artist).
  Scratch tooling: `_split_cast3.py`, `_sheet_cast3.py`, `_render_cast3.sh` (repo root,
  underscore-scratch).
- Mechanical lint: combined sheets split into per-species files under
  `output_smoke/aliens_cast3/split/<artist>/<species>.svg`, then
  `devel/lint_alien_svg.py` run on each.

## Lint results

| Artist | humanoid | flapper | bonzoid | gollumer | spheroid | leggite | mechtron | packer | mule |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| artist_1 | OK | OK | OK | OK | OK | OK | OK | OK | FAIL* |
| artist_2 | OK | OK | OK | OK | OK | OK | OK | OK | FAIL* |
| artist_4 | OK | OK | OK | OK | OK | OK | OK | OK | FAIL* |
| artist_5 | OK | OK | OK | OK | OK | OK | OK | OK | FAIL* |

*All four mule failures are the SAME five violations (`missing-required-symbol mule-head` plus
four `symbol-viewbox` on the wide `0 0 320 200` canvas) -- i.e. every mule conforms to the
contract's own mule section and the LINT is what does not: it has no mule mode. This is the
known tool gap already recorded in the 2026-07-12 changelog. All 32 species files pass clean.

## Winner: artist_2

artist_2's "GROUND CONTACT" cast is the strongest of the four, and its organizing hypothesis is
the reason: it is the only set whose distinguishing work happens on the axis the contract itself
chose (nine locomotions, nine bottom edges), so its separations survive in pure silhouette at 18.

Evidence, per claim (sheets under `output_smoke/aliens_cast3/sheets/`):

- Best flapper (`species_flapper.png`, row 2): a clean butterfly-X with the forked-tail notch and
  clear air below; at 18 it is the most legible "winged thing" of the four. Frame 2 snaps the
  wings from horizontal to raised -- a large outline change that survives 18.
- Best mule (`species_mule.png`, row 2): the ONLY mule of the four with a head/snout bump and
  tail breaking the slab -- it reads as an animal; the other three read as awnings or benches.
- Most machine mechtron (`species_mechtron.png`, row 2): rectangular light-shape eyes with dark
  pupils where the other three use round friendly eyes; the one cast where the mechtron does not
  read as a bunny-eared sibling of the humanoid.
- Strongest frame-2 motion across the cast: packer hop fully airborne with tucked limbs, bonzoid
  chassis pitch with an arm thrown, gollumer squash-and-lean. The artist's own documented sweep
  (silhouette-extremity travel 41-61 units, floor 40) matches what the renders show.
- The delivery came with the best failure documentation of the bake-off: the four arithmetically
  unbuildable contract rules and the "spacing must exceed feature width + 40" rule (changelog
  2026-07-12) came from this lane's own 18 px self-rejection pass.

artist_2's one real defect: its bonzoid is TALLER than it is wide (rounded upright slab), where
the contract's plan says wide chassis on a track, wide aspect. It keeps the unbroken flat base
(the binary vs mechtron holds) but the "Johnny 5 chassis" read is weak.

## Runner-up: artist_4

Closest challenger, and the graft source:

- Best-conforming bonzoid (`species_bonzoid.png`, row 3): genuinely wide chassis, flat track,
  arms as heavy lobes, frame 2 pitches forward with an arm swing. This is the bonzoid the
  contract describes.
- Cleanest leggite construction (`species_leggite.png`, row 3): distinct leg tiers off a narrow
  column, the most centipede-like read at 32.
- Strong humanoid with a gold chest accent and the friendliest proportions.
- Also shipped optional `-shadow1/-shadow2` symbols per species (62 symbols vs 44) -- harmless
  extras the renderer ignores.

## Per-species verdicts

| Species | Best | Notes |
| --- | --- | --- |
| humanoid | artist_4 | All four solid; artist_4 broadest character. Round-1 grafts (light eyes, smile) visible in ALL casts -- the contract absorbed them. |
| flapper | artist_2 | Only one that is unambiguously winged AND airborne at 18. artist_5's spiky star is second. |
| bonzoid | artist_4 | artist_2's is tall (plan deviation); artist_1's reads as a rabbit/plug; artist_5's arms weld into invisibility -- its mandatory arm cue does not survive as flat black. |
| gollumer | tie 2/4 | All four conform (lopsided mass, one eye, squash). Hard to lose with this plan. |
| spheroid | artist_2 | All four nearly identical (orb, 3 dangling legs, one eye, gold browband) -- total convergence; artist_2's legs separate cleanest at 32. |
| leggite | artist_4 | All four read as lumpy vertical zigzags rather than centipedes at 18, but all are now plainly separable from the mechtron -- the round-1 unsolved pair is SOLVED by the contract's numeric wedge. |
| mechtron | artist_2 | Machine-eyed; others read cute-robot. All four hold the two-post split + antennae. |
| packer | artist_2 | Its front-limb split survives at 18 and its hop is fully airborne. artist_1's packer f1 is a featureless dome at 18 = gollumer confusion risk (the exact round-2 failure). |
| mule | artist_2 | Only animal-read of the four. |

## Systemic findings (affect all four casts)

1. Spheroid convergence. Four near-identical spheroids: the contract's plan (orb + exactly three
   dangling legs + one eye) is now so tight the bake-off cannot discriminate on it. Not a defect
   -- it means this species no longer needs competition, just execution.
2. Squat species render small. The renderer (and the game) scale by HEIGHT. A contract-conforming
   squat packer (aspect 0.7-1.0, bottom third of a 5:8 canvas) therefore paints far fewer pixels
   at h=32 than a full-height humanoid, and the top ~60 percent of its box is empty. This is the
   low canvas-coverage reading [alien_canvas_coverage.md](alien_canvas_coverage.md) already
   flagged for cast3 sources. Decide before promotion: either accept the size asymmetry as
   character, or let squat species draw at a larger box height so their on-screen mass matches.
3. The 18 px face still does not exist on full bodies -- unchanged from round 1 -- but every
   artist's HEAD CROP carries two readable eyes at 18. The contract's face-crop rule is doing its
   job; the dock badge must use it.
4. Green-on-terrain: readable in all 36 green/terrain cells checked. The double stroke continues
   to carry the whole palette.

## Recommendation

Adopt artist_2 as the base cast, with two grafts and one redraw:

1. Graft artist_4's bonzoid (or redraw artist_2's to the wide-chassis plan) -- MUST-FIX, plan
   conformance.
2. Consider artist_4's leggite leg-tier construction on artist_2's column -- SHOULD-FIX,
   improves the centipede read.
3. artist_1 and artist_5 contribute nothing artist_2/4 do not already do better. Take nothing.

Follow-on work before promotion to `art/aliens/`:

- Add a mule mode to `devel/lint_alien_svg.py` (wide canvas, no head symbol) -- the known gap now
  blocks a clean full-cast lint.
- Split the winning cast into per-species `art/aliens/<species>.svg` files (the contract's file
  schema) and re-run lint + ladder renders per file.
- Update the renderer's size ladder to the contract's judging ladder (24/32/68/90) or record why
  18/32/44/64 stays.
- Decide the squat-species sizing question (finding 2) before `devel/build_species_sprites.py`
  consumes the art.
- artist_3 never delivered; no action needed unless a fifth perspective is wanted for the two
  contested species (bonzoid, leggite).

## Related docs

- [alien_bakeoff_evidence.md](alien_bakeoff_evidence.md)
- [alien_canvas_coverage.md](alien_canvas_coverage.md)
- [ALIEN_ART_CONTRACT.md](../../ALIEN_ART_CONTRACT.md)
