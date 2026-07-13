# CHANGELOG.md

## 2026-07-12

### Additions and New Features

- Art (bake-off 3, artist 2): added `devel/alien_cast3/artist_2/aliens.svg`, a
  nine-creature candidate cast (the eight species plus the mule) drawn to
  `docs/ALIEN_ART_CONTRACT.md`. Organizing hypothesis is GROUND CONTACT: each
  creature's bottom 60 units of silhouette were fixed before any body existed,
  so the nine locomotions produce nine different bottom edges. Ships the
  contract's three-layer stack, the white halo, one gold accent and one masked
  under-shade per frame, both lint-only silhouette symbols, and the eight face
  crops. All eight species pass `devel/lint_alien_svg.py` when split into
  per-species files; the combined sheet cannot be linted directly because the
  lint derives the species name from the file basename.

- Docs: added `docs/active_plans/reports/alien_canvas_coverage.md`, measuring
ARTIST2_DECISIONS_MARKER
- Art (bake-off 3, artist 2): four contract rules are arithmetically
  unbuildable on the 200-wide canvas, because the 40-unit halo leaves only a
  160-unit usable band and costs 40 units per air gap. (1) A lateral air gap
  beside a limb needs `body + 2 x (40 + 26) = body + 132` units, so the
  humanoid's "gap between each arm and the body" and the bonzoid's arms "clear
  of the chassis" cannot exist as air for any species; both were welded and the
  separation spent on the outline profile instead. (2) The spheroid's three
  legs need `3 x 26 + 2 x 40 = 158`, consuming the whole band and leaving ZERO
  visible air, so its tripod reads as three prongs rather than three separated
  legs. (3) The packer's four limbs need `4 x 26 + 3 x 40 = 224`, and its own
  150-to-185 mass already fills the band; the limbs were paired into two
  splayed feet to buy one 40-unit keyhole arch under the belly, which cost the
  "at most 20 units of clearance" line (belly sits 43 up). (4) The flapper and
  bonzoid spans (175-200 and 170-195) exceed the 160-unit band; both are drawn
  at 160.
- Art (bake-off 3, artist 2): rendering the artist's own first draft at 18 px
  rejected three of its nine creatures. The leggite's six legs at 82-unit
  spacing left 14 visible units between them after the halo and welded into a
  lumpy column; it was redrawn with four legs at 118-unit spacing (50 visible
  units). Generalized rule found: for a repeated feature, spacing must exceed
  the feature width plus 40, and nothing under about 90 is safe. The packer,
  drawn with its belly on the ground as the contract requires, came out as a
  featureless dome indistinguishable from the gollumer. The mechtron, with
  short arms over splayed posts, came out as an X, which is the flapper's
  shape; its arms were run down the body so its upper mass reads as one solid
  rectilinear slab.
- Tooling: `devel/lint_alien_svg.py` has no mule mode and is out of step with
  the contract's own mule section. It hard-codes `viewBox="0 0 200 320"` and
  requires a `<species>-head` symbol, so a contract-conforming mule (which the
  contract mandates on a WIDE `0 0 320 200` canvas, with NO head symbol and no
  face) fails the lint with 6 violations: one `root-viewbox`, one
  `missing-required-symbol` for `mule-head`, and four `symbol-viewbox`. Every
  other rule passes on the mule. The lint needs a per-file canvas and an
  exemption for the mule's absent head crop.

- Docs: added `docs/active_plans/reports/alien_canvas_coverage.md`, measuring
  CANVAS COVERAGE (painted-creature pixel area over the full canvas box) for
  every alien-art source currently available, reusing the existing
  `inkCoverage` metric in `devel/measure_alien_art.py` (this metric already
  equals canvas coverage, since `devel/render_alien_sheet.mjs` renders each
  symbol at its own full declared viewBox rather than a cropped bounding
  box). Findings: the human-approved `devel/alien_bakeoff/set_5/aliens.svg`
  ranges 71.85%-84.22%; the leggite sits mid-band in set_5 (74.50%-74.66%)
  and is not a low outlier in any set measured, which does not support the
  design-tension worry that the leggite's 32-unit column width constraint
  forces a wispy result; the lowest readings overall come from rejected
  bake-off candidates and in-progress `alien_cast3` files, not from approved
  art. Proposed an evidence-based floor of about 70% and a softer ceiling of
  about 85% canvas coverage.

- Tooling: added `devel/lint_alien_svg.py` (WP-LINT-1), a mechanical checker
  for one `art/aliens/<species>.svg` against `docs/ALIEN_ART_CONTRACT.md`.
  Enforces only objective rules: XML validity via `xmllint` (with a named
  message for the double-hyphen-in-comment trap that broke a real bake-off
  file), the `<defs>` element/attribute/transform whitelist, the required
  `<species>-frame1/frame2/head/silhouette1/silhouette2` symbols and their
  viewBox geometry (including the head crop's square-window rule), id
  prefixing, palette conformance against `src/ui/sprites/palette.ts`, the
  four-color (four-HUE, not four rendered values) budget, the
  one-gold-accent-per-frame rule, the three-layer halo/ink/body stroke stack
  (colors, stroke widths, and line caps), and the one optional per-frame
  under-shade: exactly one `<rect>`, `fill` pinned to `inkKeyline`, `opacity`
  capped at 0.16, wrapped in a `<g mask=...>` whose `<mask>` holds a single
  white `<use>` of the frame's OWN shapes group (not the other frame's),
  sitting immediately after the body pass and before the face reference.
  `clipPath`/`clip-path` are rejected outright rather than accepted as an
  alternate shade spelling: the contract's earlier revision specified the
  shade as a clipPath wrapping a bare `<use>` of the shapes group, but a
  `<use>` inside a `clipPath` only contributes geometry when it references a
  graphics element, not a container, so that form silently rendered no shade
  at all (measured: a pixel probe found the shaded and unshaded regions of a
  generated frame read the identical player-tint hex). The contract moved
  the shade to `<mask>`, which can reference a container, and the lint was
  updated to match: `check_mask_form` validates each `<mask>` element's
  shape/fill/target, and the shade check now also confirms the shade
  wrapper's `mask=` resolves to THIS frame's own shapes group rather than
  the other frame's mask. Species name is derived from the file's own
  basename, so an eventual ninth species file needs no lint change. An
  earlier bounding-box heuristic for the notch and limb floors was
  tried and dropped: it false-positived on production-quality
  `art/aliens/humanoid.svg` (a 28x18 neck connector rect, fully hidden inside
  the head/torso union, measured under the 26-unit limb floor even though it
  never renders as a visible limb), which confirmed those two floors, rule 7's
  uniform-limb-length check, and rule 5's frame-2 motion distance cannot be
  verified reliably without rendering the union; they stay human-reviewed
  authoring instructions per the contract's own "Done when" checklist and a
  natural extension of `devel/measure_alien_art.py`'s rasterized diagnostics.
  Verified against deliberate single-rule breaks of a clean `humanoid.svg`
  copy (one violation per case, each firing its intended named rule) and
  against the five pre-contract `devel/alien_bakeoff/set_*/aliens.svg` files
  for message legibility on non-conforming real-world input. Also verified a
  synthetic `humanoid.svg` carrying a valid contract-form mask-based shade
  passes clean, that the retired clipPath spelling now fails
  (`defs-disallowed-element` plus `defs-forbidden-attribute` on `clip-path`),
  and that breaking the mask/shade seven ways (mask targeting the face group
  instead of the shapes group, mask `<use>` painted the wrong color, a
  second element inside the mask, opacity over 0.16, wrong shade fill, two
  shade rects, wrong position, and a shade wrapper pointed at the OTHER
  frame's mask) each fires its own named rule. Added a dedicated
  `check_no_clip_path_shade`/`shade-clip-path-does-not-render` rule on top of
  the generic disallowed-element/disallowed-attribute checks, specifically
  because a clipPath-based shade previews correctly in a browser and looks
  identical to a working mask-based shade in the SVG source, so a generic
  "not allowed" message would not explain why; this rule spells out the
  use-inside-clipPath-targets-a-container failure mode in the violation
  text itself and points at the `<mask>` replacement, making the exact
  defect measured on a real generated sprite (identical pixel color inside
  and outside the shade band) impossible to reintroduce silently.
- Testing: added `tests/test_alien_svg_lint.mjs`, a fast-lane `node --test`
  gate that runs `devel/lint_alien_svg.py` over every current
  `art/aliens/*.svg` and asserts a clean exit. Measured runtime: 447ms for
  two species files (about 180ms per file, mostly `python3`/`xmllint`
  subprocess startup).
- Testing: added `tests/e2e/e2e_alien_contact_sheet.mjs` (WP-PROOF-1), a
  capture driver that renders every species SVG under `art/aliens/` through
  `devel/render_alien_sheet.mjs` (one species per invocation, so single-file
  mode stays active and species names are never bake-off-anonymized) and
  assembles the result into readable contact sheets: an all-species
  silhouette overview at 18 px and 32 px side by side (the standing check
  against the bake-off's unsolved mechtron-vs-leggite confusion), and one
  per-species sheet showing both frames and the head crop across all four
  player colors and all three backgrounds at 32 px (game size). Deliberately
  does not read the tool's shared `manifest.json` (several other agents were
  invoking the same tool concurrently during this work, overwriting that
  file mid-session); instead it derives expected filenames directly and
  validates each PNG by reading it (existence plus a not-blank pixel check),
  exiting non-zero the instant a cell is missing or blank. Writes sheets to
  `output_smoke/aliens_cast/sheets/` and the copied per-species renders
  backing them to `output_smoke/aliens_cast/renders/`. Works on however many
  of the eight species are currently drawn (today: humanoid, gollumer) and
  reports which are missing. Documented in `docs/E2E_TESTS.md`'s capture
  driver list.
- Tooling: added `devel/build_species_sprites.py` (WP-GEN-1), which generates
  `src/ui/sprites/sprites_species.ts` from the alien art in `art/aliens/*.svg`.
  It inlines each species file's `<defs>` (dropping the two lint-only
  silhouette symbols and the preview block), namespaces every id with the
  shipped `sprite-species-` prefix so `humanoid-frame1` becomes the
  `sprite-species-humanoid-frame1` symbol the scenes and Playwright gallery
  specs already assert, and preserves the module's public API while adding
  `SPECIES_SPRITE_WIDTH` / `SPECIES_SPRITE_HEIGHT` / `SPECIES_SPRITE_ASPECT`
  (the art is 5:8 on a 200x320 grid, so a square `<use>` box letterboxes) and
  `speciesHeadSymbolId()` for the 18 px auction dock head crop. Generation is
  byte-stable and the emitted TypeScript is prettier-clean by construction, so
  the repo format gate needs no post-processing step.
- Testing: added `tests/test_species_sprites_fresh.mjs`, which regenerates the
  species sprites into a temporary buffer and compares byte for byte with the
  committed `src/ui/sprites/sprites_species.ts`, so a hand edit to the
  generated file, or an art edit that was never regenerated, fails loudly.
  While the eight-species cast is still being drawn, the test skips and names
  the species whose art files do not exist yet.
- Art: added `alien_species_concept_board.svg`, a standalone editable concept
  board with eight 32x32 geometric alien symbols. Each major body region uses
  `currentColor` and the board previews the symbols in all four shipped player
  colors against deep and terrain backgrounds.
- Art: added `devel/alien_wide_candidates/candidate_C_48x30.svg`, an
  independent editable 48x30 wide-silhouette study for Mechtron, Bonzoid, and
  Flapper. It includes two frames per species and true-scale previews in all
  four player colors.
- Art: added `devel/alien_wide_candidates/candidate_E_48x30.svg`, an
  independent editable design study for wide 48x30 Mechtron, Bonzoid, and
  Flapper frames. The study pairs two closed, centered animation silhouettes
  for each species with four-player-color preview strips.
- Art: added `devel/alien_wide_candidates/candidate_B_48x30.svg`, an
  independent editable wide-silhouette study for Mechtron, Bonzoid, and
  Flapper. Each species has two 48x30 animation symbols, a currentColor body,
  closed symmetric geometry, and native-size previews in all four player
  colors.
- Art: added `devel/alien_wide_candidates/candidate_A_48x30.svg`, an
  independent editable 48x30 study with wide, centered Mechtron, Bonzoid, and
  Flapper frames. It uses one closed currentColor silhouette per creature,
  clear Flapper wing motion, and four-player-color preview strips.
- Art: added `devel/alien_wide_candidates/candidate_D_48x30.svg`, an
  independent editable wide-sprite study for Mechtron, Bonzoid, and Flapper.
  Each species has two 48x30 frames, a single closed currentColor silhouette,
  and a four-player-color proof strip; Flapper's pair shows a full wings-down
  to wings-raised motion.

### Behavior or Interface Changes

- Art contract: `docs/ALIEN_ART_CONTRACT.md` now assigns each species a BODY PLAN
  (topology) before any measurement, and the eight plans differ structurally, not
  by accessory. Diagnosis: five independently drawn eight-species casts
  (`output_smoke/aliens/devel_alien_cast_artist_*`) all produced the SAME body
  plan eight times -- a round head on a torso with two arms and two legs, plus a
  species accessory. The cause was the contract, not the artists: its archetype
  table was written in human anatomy ("torso at least 96 wide", "WAIST AT MOST
  70", "terminal fists"), and a rule that caps a waist has already decided the
  creature has one. Confirming evidence: gollumer and spheroid, the only two rows
  that never said "torso", are the only two species that came out as non-humanoid
  creatures in every cast. The archetype section is replaced by "The eight body
  plans", organized on LOCOMOTION, because how a creature moves forces how it is
  built and nine ways of getting around cannot all be a person with an accessory:
  humanoid walks (the ONLY head-torso-two-arms-two-legs plan in the cast, now closed
  to everyone else), flapper flies (airborne; its wings ARE its arms), bonzoid rolls
  on treads (a Johnny 5 chassis on a flat track, oversized arms, NO legs), gollumer
  slimes (a snail: a legless oozing mass), spheroid floats (a War-of-the-Worlds
  tripod: an orb with EXACTLY THREE legs that dangle and never touch the ground),
  leggite slithers on many legs (a tall S-column, no arms), mechtron walks heavy (a
  rigid upright box, no head), packer hops (a TOAD: the biggest mass in the cast on
  four comically undersized T-rex limbs -- it does not carry a pack, it IS the pack).
  NO TWO CREATURES SHARE A LOCOMOTION, and that is stated as a line an artist can
  check their own work against. A "how each creature meets the ground" table makes
  the axis checkable: nine creatures, nine different answers. Each row pins an
  IDENTITY and leaves the EXPRESSION open, so five artists should reach five
  different creatures that are unmistakably the same species; the last round failed
  by inverting this, over-specifying the body in human anatomy and under-specifying
  the identity. The face now sits ON the dominant shape
  by default (per the `2D-Shape-Aliens*.jpg` reference sheets); a separate head is
  one option, not the default; and the `<species>-head` symbol is redescribed as a
  crop of the FACE REGION wherever it lives (the id is unchanged, since the lint
  and generator read that name).
- Art contract: THE MULE joins the contract as the ninth creature, on its own
  `viewBox="0 0 320 200"` canvas (8:5, wide -- the exact inverse of the species
  canvas). It is on screen beside the player's alien constantly, so its silhouette
  is part of the same separation problem; designing it outside the system and hoping
  it does not collide is the mistake that produced eight humanoids. Its plan is a
  HEADLESS ROBOTIC QUADRUPED PLATFORM (a Boston Dynamics BigDog, not an animal):
  horizontal chassis, four leg columns, real ground clearance, no head, no neck, no
  face. The snout and upright ears on today's hand-written `sprites_mule.ts` sprite
  are retired as the two most animal-like features on it. The wide canvas keeps the
  grid unit IDENTICAL to the species canvas, so the notch floor, limb floor, stroke
  stack and frame-2 motion minimum all transfer with no number re-derived. The mule
  is exempt from the eyes/mouth rule (it has no face) and from nothing else. Its
  wedges are numeric: at least 60 units of ground clearance against the packer's at
  most 20, and a horizontal aspect (at least 2.0 wide over tall) against the
  mechtron's upright 1.2. Downstream and NOT yet planned: `sprites_mule.ts` is
  hand-written today, so a mule drawn to this contract implies an `art/mule/mule.svg`
  generator path and a mule draw box that changes from square to 8:5.
- Art contract: the archetype measurements are restated in body-plan-neutral terms
  so a number cannot force a body. The mechtron/leggite numeric wedge, the one
  confusion the bake-off never solved (silhouette IoU 0.71-0.86 in all five sets),
  is preserved by re-expressing it on the DOMINANT MASS (the largest connected
  shape) rather than on a "torso" and a "core column": mechtron at least 96 wide,
  leggite at most 60. The new pairs are wedged the same way, on properties of an
  OUTLINE rather than on anatomy: bonzoid versus mechtron (the cast's two machines)
  separate on FOOTPRINT -- the bonzoid's track is one unbroken base with no gap
  under it, the mechtron's two posts have a split of at least 40 between them, so
  one has a hole under the body and the other does not -- and packer versus spheroid
  (now the tightest pair in the cast) separate on the fact that a BARREL HAS A BASE
  AND A SPHERE DOES NOT: the packer's outline runs straight and parallel down the
  middle third of its height and closes on a flat bottom, which a circle cannot do,
  and it hugs the ground where a floating spheroid carries 60 units of air beneath
  it. All measured rules are unchanged: the three-layer stack, both strokes, the
  white halo, the 40-unit notch floor and 26-unit limb floor, the four-hue budget,
  the uniform 64 +/- 4 limb length (which now also binds the spheroid's tentacles
  and the mule's four legs), frame-2 outline motion, the mask-form under-shade, and
  the schema. Bonzoid frame 2 carries an explicit warning that moving the tread
  cleats is an INTERIOR change, invisible at 18 px, and does not satisfy rule 5.
- Art contract: the optional under-shade is now specified as a `<mask>`, not a
  `clipPath`. `docs/ALIEN_ART_CONTRACT.md` spells it as
  `<mask id="<species>-fN-mask"><use href="#<species>-fN-shapes" fill="#ffffff"/></mask>`
  applied to the shade group with `mask="url(#<species>-fN-mask)"`. A `<mask>`
  may reference a container, so the shade still follows the one shared shapes
  group the three-layer stack is painted from, and the contract's
  single-source-of-truth geometry invariant survives. The contract's blanket ban
  on `mask` is replaced by a narrow exception, the same shape as the existing
  `opacity` exception: one `<mask>` per frame, one `<use>` child, no other
  content and no other purpose, with the `mask` attribute permitted only on the
  shade group. `clipPath` and `clip-path` move to the forbidden list. A new
  section, "Why the shade is a mask and not a clip", records the measured
  evidence in the contract itself so a later agent does not "simplify" the mask
  back into a clip and silently delete every shade.
- Art contract: `docs/ALIEN_ART_CONTRACT.md` now states five schema decisions the
  generator previously had to make on its own. Every id in a species file gets a
  uniform `sprite-species-` prefix on generation, with `href` and `mask`
  references rewritten to match, which namespaces the species defs against the
  mule, title, and wampus defs in the same document. Everything in `<defs>`
  except the two lint-only silhouette symbols travels into the generated markup,
  in document order. Art files use plain `href`, never `xlink:href`. The art
  carries literal hexes and the generated module imports no palette module;
  holding those literals to the palette is the lint's job. The generator
  validates structure only and fails loudly writing no output, while art rules
  (floors, budget, symmetry) stay with the lint.
- Art contract: `docs/ALIEN_ART_CONTRACT.md` was rewritten around BODY PLAN and
  LOCOMOTION, replacing the previous archetype table. The cast is nine
  creatures (eight alien species plus the mule) and NO TWO SHARE A
  LOCOMOTION: humanoid walks, flapper flies, bonzoid rolls on treads,
  gollumer slimes, spheroid floats, leggite slithers on many legs, mechtron
  walks heavy, packer hops, mule trots. Supporting rules: eight of the nine
  have NO head (the face is worn on the dominant mass; only the humanoid has
  a head on a neck), and six of the nine have NO arms (only humanoid,
  mechtron and bonzoid). A "how each creature meets the ground" table turns
  locomotion into something checkable in pure black at 18 px. The mule is
  added to the art system on its own `viewBox="0 0 320 200"` canvas -- the
  exact inverse of the species canvas, with an IDENTICAL grid unit, so every
  existing floor and stroke width transfers with no number re-derived. Note:
  `docs/ALIEN_ART_CONTRACT.md` is currently UNTRACKED in git and needs
  `git add` at commit time.

### Fixes and Maintenance

- Tooling: `devel/render_alien_sheet.mjs` had a silent double-viewBox bug in
  the symbol-capture path. A `<use>` referencing a `<symbol>` already
  generates a synthetic viewport that applies the symbol's viewBox ONCE; the
  tool also set that same viewBox on the outer `<svg>`, applying it a SECOND
  time and shifting content by (-minX, -minY). Zero-origin frame symbols
  shifted by (0,0) and were unaffected, which is why it went unnoticed;
  head-crop symbols have a non-zero origin by nature (for example
  `viewBox="46 14 108 108"`) and rendered with the face pushed off-canvas,
  producing dock badges with no eye visible. Two artists hit it
  independently. Fixed by removing the viewBox from the outer `<svg>` and
  sizing the `<use>` explicitly in device pixels, so the symbol's viewBox
  applies exactly once at any origin. Verified by pixel probe, not by code
  reading: a marker rect at a known position inside a non-zero-origin crop
  window produced ZERO matching pixels anywhere in the render before the
  fix, and after the fix landed exactly in the predicted window (x[16,47]
  y[16,47] against a predicted x[16,48) y[16,48)). Zero-origin frame renders
  are byte-identical before and after, so the frame path did not regress.

### Decisions and Failures

- Art contract: the alien pipeline is VECTORS end to end and nothing in it
  rasterizes. `docs/ALIEN_ART_CONTRACT.md` now says so in a new top section:
  the chain is SVG art -> generated `<symbol>` markup -> inline `<defs>` ->
  browser, and the only moment pixels exist is when the browser paints, so the
  PNG renders the contract judges from are a JUDGING PROXY for that moment, not
  a stage in the pipeline. The halo constraints were reworded from
  pixel/anti-aliasing language to the GEOMETRIC facts they actually are, all
  three true at any zoom: the halo is `stroke-width: 40` CENTERED on the path
  so it extends 20 user units outward (which is why the fill band is 160 of the
  200-unit canvas); a 40-unit gap closes because both facing edges dilate 20
  units and MEET; and a tapered point vanishes because the stroke terminates in
  a round join of 20-unit radius, so the cusp is blunted BY CONSTRUCTION. The
  last one drove the wording change: an artist told "the halo eats fine points
  at 18 px" may try to out-clever it with finer detail, which cannot work,
  because the detail was never in the geometry to begin with. Added a
  no-tapered-points bullet to rule 3 stating the mechanism.
- Art contract: the judging ladder was WRONG and is now 24 / 32 / 68 / 90 CSS
  px, with 24 replacing 18 as the minimum judging size. Measured in a real
  headless browser against the live game, not assumed. Two findings forced it.
  First, the minimum supported viewport is 1024x640, not 1280x800 (which is the
  NOMINAL target); the minimum is already stated in
  `tests/e2e/e2e_auction_beat_capture.mjs`, `docs/E2E_TESTS.md`, `docs/TODO.md`
  and `src/ui/scenes/auction_geometry.ts`. Second, THE STAGE SCALES, so a
  sprite whose markup says `width=18` is not 18 CSS px on screen: the auction
  svg has a 960x600 viewBox filling a 1280x800 stage (scale 1.3333 nominal,
  1.0667 at the minimum), the overworld / AI-actor board svg has a 576x320
  viewBox (2.0444 nominal, 1.6355 minimum), and the title picker lives OUTSIDE
  the scaled stage and maps 1:1. The old 18/32/44/64 ladder was viewBox units
  read out of source and three of its four rungs are not what the browser
  paints. Each new rung traces to a draw site: 24 px is the auction dock badge
  (18 units x 1.3333, `auction_dock.tsx`), 32 px is the title-screen species
  picker (32 units, 1:1, `title_screen.tsx`), 68 px is the auction runway
  avatar at the minimum viewport (64 units x 1.0667, `auction_geometry.ts`; 85
  px at nominal), and 90 px is the overworld avatar (44 units x 2.0444,
  `overworld_scene.tsx`; 72 px at the minimum). Note the counterintuitive
  ordering the scale factors produce: the 44-unit overworld avatar paints
  LARGER (90 px) than the 64-unit auction avatar (85 px). Recorded as a known,
  ACCEPTED gap rather than fixed: the auction dock badge paints 19.2 px at the
  1024x640 minimum, BELOW the 24 px judging floor. The decision is to judge at
  24 and leave the badge markup alone for now; it is an open item for the
  wiring work, not a defect in the art. Bake-off findings reported at 18 px are
  left standing and annotated: 18 is smaller than anything the game paints, so
  those conclusions hold with margin at the 24 px floor.
- Art contract: added rule 9, CANVAS COVERAGE -- a creature must fill its frame
  and must not become a rectangle. The metric is defined as the area of the
  PAINTED creature (color fill PLUS outline, the ink the viewer sees) as a
  percentage of the canvas box (200x320 for a species, 320x200 for the mule).
  It is the ONE rule in the contract measured on painted ink rather than fill
  geometry, so the "every number is FILL geometry" section was amended to name
  the exception rather than be silently contradicted by it. Two failure modes,
  both real: TOO EMPTY (a creature leaving roughly three quarters of its canvas
  blank is a wisp that does not read, and this binds every creature INCLUDING
  the leggite -- a thin column with a few thin legs is a stick insect, not a
  centipede) and TOO FULL (approaching 100 percent is a filled rectangle with
  no silhouette). The CEILING is pi/4 = 78.5 percent, the coverage of an
  ellipse inscribed in its box, which is the maximally round creature that
  fills its frame; above it you are painting into the corners. The ceiling
  binds the MECHTRON too, and it is not exempted for being rectilinear: the
  mechtron NEEDS its empty space to move its legs, because its 48-to-74-unit
  post split has to SHOW in the silhouette, frame 2 needs somewhere to LIFT a
  post into, and that split base is the entire wedge against the bonzoid's
  solid unbroken track. The generalizing principle is stated in the rule:
  NEGATIVE SPACE IS NOT WASTED CANVAS, IT IS WHERE THE SILHOUETTE AND THE
  MOTION LIVE. No numeric floor was invented; it is marked TBD and will be
  evidence-derived from measured coverage across the existing casts, calibrated
  against set_5, in `docs/active_plans/reports/alien_canvas_coverage.md`.
- Art contract: recorded that the floor cannot safely be a single flat number
  applied to the whole cast, which the coverage measurement now has to settle.
  Three body plans CAP their own reachable coverage by design and those caps
  outrank a floor: the packer is required to be squat (aspect 0.7 to 1.0) on a
  5:8 TALL canvas, the spheroid owes at least 60 units of clear air under its
  lowest leg tip, and the flapper is airborne with clear air under the whole
  creature. A floor derived from the roundest species and applied flat would ask
  those three to violate their own plans.
- Art contract: SQUARE DRAW BOXES DO NOT DISTORT THE ART, recorded so nobody
  sets out to fix a non-problem. Every draw site in the game currently uses a
  square box (width equals height), and that does NOT squash a 5:8 creature: a
  `<use>` with the default `preserveAspectRatio` (`xMidYMid meet`) FITS the
  symbol viewBox inside the box, so a 5:8 symbol stays box-HEIGHT tall and
  letterboxes horizontally. What actually changes is HORIZONTAL FOOTPRINT -- an
  ~11-unit-wide figure inside a 24-unit colored plate looks thin and off-center
  -- so the downstream work is LAYOUT (plate widths, x-offsets, lane spacing),
  not aspect correction. The mule's file-schema note was corrected accordingly:
  it previously implied the mule's draw box must change from square to 8:5,
  which overstated the requirement.
- Art contract: confirmed (unchanged) that the mule's canvas is
  `viewBox="0 0 320 200"` -- 8:5 WIDE, the exact inverse of the 5:8 species
  canvas, with an IDENTICAL grid unit, so every floor and stroke width (the
  40-unit notch floor, the 26-unit limb floor, the 40/20 stroke stack, the
  40-unit frame-2 motion minimum) transfers with no recomputation.
- Art contract: a KNOWN TENSION between rule 9 and the leggite is named in the
  document rather than papered over. The leggite's column is capped at 32 units
  when its legs reach fully horizontal (the cap keeps its leg tips inside the
  canvas and is what separates it from the mechtron's 96-unit minimum), and a
  32-wide column with a few thin legs is exactly the wispy creature the new
  coverage rule forbids. The contract's position: the two are reconcilable
  because coverage counts the PAINTED creature, so every leg paints 20 units
  wider than it draws once the 10-unit ink rim on each side is counted, and a
  leggite that clears the floor is one with generous, long, thick legs rather
  than a fatter column. If the measured floor turns out to be unreachable that
  way, the FLOOR is wrong and gets adjusted; the column cap is load-bearing
  geometry and does not give way.
- Art contract: the optional under-shade's clip construction, as
  `docs/ALIEN_ART_CONTRACT.md` currently spells it, does not render. The
  contract's form is `<clipPath id="x-f1-clip"><use href="#x-f1-shapes"/>
  </clipPath>`, where the `<use>` targets a `<g>` container. Per SVG, a `<use>`
  inside a `clipPath` contributes clip geometry only when it references a
  graphics element, not a container, so Chromium resolves that clip to EMPTY
  and the shade rect never paints. Measured on the generated sprites with a
  pixel probe: a leg pixel inside the shade rect reads `#3aaa18` (the raw
  player tint), identical to a torso pixel above the rect's top edge, where a
  working 0.16 ink shade would read about `#349219`. The failure is silent in
  both directions: the shade is invisible in the artist's own browser preview
  of the art file and invisible in the game, so a species could ship a shade
  that does nothing. Two forms were measured working in the same probe: a
  `<mask>` holding a white `<use>` of the shapes group (keeps the contract's
  single-shared-geometry invariant, but the contract currently forbids `mask`),
  and a `clipPath` holding copies of the shapes (renders, but duplicates the
  geometry, so the shade's clip can drift from the silhouette it follows).
  A generator-side rewrite of the broken form into a working one was considered
  and refused: it would have made the game render a shade the artist's own
  browser preview does not, which is exactly the art-and-code divergence this
  pipeline exists to remove. The art file and the game must agree, so the fix
  belongs in the contract and the art. Resolved the same day in favor of the
  `<mask>` form: it is the only working form that keeps the shade following one
  shared geometry group, and `docs/ALIEN_ART_CONTRACT.md` now carries a narrow
  `mask` exception for exactly this use. The `clipPath`-with-copies form was
  rejected because duplicated geometry lets a shade's clip drift out of
  agreement with the silhouette it follows, which is the failure the
  one-shared-geometry-group rule exists to prevent.
- Tooling: `devel/build_species_sprites.py` now carries `<mask>` definitions
  through into the generated `<defs>`, rewriting `mask="url(#...)"` references
  alongside `href`, and REFUSES a species file still carrying the retired
  `clipPath` shade spelling. The refusal is deliberate rather than a
  pass-through: that form is now known to render nothing, so a file still using
  it is a stale file, and shipping it would put an invisible shade in the game
  with no error anywhere. The error names the mask form to write instead.
  Verified by pixel probe on the regenerated sprites (green player tint): a leg
  pixel inside the shade reads `#349219` against `#3aaa18` for a torso pixel
  above the shade's top edge, and a pixel inside the shade rect but off the
  creature stays terrain `#7c9a4e`, so the mask both paints and clips. The
  shade stays optional; an unshaded species generates unchanged.
- THE HUMANOID FAILURE, AND ITS ROOT CAUSE. A five-artist bake-off produced
  five casts of eight variations on a person: every species came out as a
  round head on a torso with two arms and two legs plus an accessory (the
  flapper was a person with wings; the mechtron a person made of boxes). The
  root cause was NOT the artists. It was the contract's own vocabulary: the
  archetype table was written in humanoid terms ("torso", "waist at most
  70", "terminal fists"), and a rule that sets a waist maximum presupposes a
  waist. The diagnostic evidence: in three separate casts, the only two
  species that came out as real creatures were gollumer and spheroid --
  precisely the two archetype rows that never used the words torso, waist
  or arms. The contract's words chose the bodies. Fixed by making
  locomotion the organizing axis, since how a creature MOVES forces how it
  is BUILT.
- THE EXEMPLAR WAS CONTAMINATING STRUCTURE, NOT JUST STYLE. The contract
  pointed artists at `devel/alien_bakeoff/set_5/aliens.svg` as a style base
  with no qualification, and artists copy pictures faster than they read
  tables. One artist discovered on inspection that their own flapper was
  "structurally set_5's creature with new numbers" and discarded it. The
  contract now says to copy set_5's CONSTRUCTION and to read it "with your
  hand over its silhouettes".
- THE 40-UNIT NOTCH FLOOR IS AN INK FLOOR, NOT A SILHOUETTE FLOOR. At a
  40-unit gap the 20-unit halo closes the slot and the outer boundary goes
  smooth across it: the notch reads correctly in FULL COLOR and VANISHES
  from the SILHOUETTE. An artist's first draft looked right in color and
  collapsed as flat black, with four species becoming the same rounded
  rectangle. A silhouette-bearing notch needs roughly 40 units of halo PLUS
  the width you want to see; budget 48 to 74. Found independently by an
  artist rendering their own work at 18 px.
- A LATERAL AIR GAP BESIDE A LIMB IS ARITHMETICALLY IMPOSSIBLE ON THIS
  CANVAS. The halo grows the union 20 units per side, leaving a usable band
  of 160 units; arm 26 + gap 40 + torso 40 + gap 40 + arm 26 = 172. The
  contract's humanoid cue asking for "a gap between each arm and the body"
  could not be drawn by anyone. Two artists derived this independently and
  both welded the arms. The rule is now stated once and generally: VERTICAL
  notches (leg splits, antenna V, tail fork, crown slot) are affordable;
  LATERAL ones are not, so lateral appendages are welded and earn their
  keep in the outline profile.
- SILHOUETTE OVERLAP (IoU) INVERTED THE TRUTH and is not a gate. In the
  bake-off it ranked the least readable cast as the most distinct. It is
  printed as a diagnostic only. The gate is a human looking at all nine
  silhouettes side by side at 18 px and seeing nine different animals.
- TWO WRITERS ON ONE UNTRACKED FILE. Two agents edited
  `docs/ALIEN_ART_CONTRACT.md` concurrently. The second noticed only
  because line numbers shifted under it between a read and a grep; because
  the file has never been committed, there was no baseline to diff against
  and the collision was otherwise invisible. The second agent correctly
  refused to race and asked rather than guessing. Resolution: one writer
  was stopped, the file was confirmed byte-stable, and sole ownership was
  handed to the survivor.
