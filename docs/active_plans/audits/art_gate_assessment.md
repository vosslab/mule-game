# Art gate assessment

Visual-acceptance review of the M1-M8 art asset sets against
[docs/archive/mule_art_style_spec.md](../../archive/mule_art_style_spec.md)
and the art gate in
[docs/archive/mule_fidelity_plan.md](../../archive/mule_fidelity_plan.md) (archived
after this audit)
("Acceptance criteria and gates"). Reviewed five gallery screenshots in
`output_smoke/art_gate/` at 1280x900 @2x. Observations are separated from
judgments; grades are PASS / MARGINAL / FAIL / N/A (criterion not exercised by
that image).

## Verdict summary

Grades are per readability criterion, per image. `N/A` means the image does not
exercise that criterion (it is not a defect).

| Image | Terrain | Avatar vis. | Ownership | Outfit | Price |
| --- | --- | --- | --- | --- | --- |
| sprite_gallery.png | N/A | MARGINAL | N/A | PASS | N/A |
| terrain_gallery.png | PASS | N/A | N/A | N/A | N/A |
| town_gallery.png | N/A | N/A | N/A | PASS | MARGINAL |
| title_gallery.png | N/A | N/A | N/A | N/A | N/A |
| title_screen_live.png | N/A | N/A | N/A | N/A | N/A |
| Aggregate | PASS | MARGINAL | NOT SHOWN | PASS | PASS (by spec) |

Overall art-gate verdict: PASS-WITH-FIXES.

The asset sets are consistent, readable, and charming; they clearly read as one
game. The gate is not a clean PASS for one dominant reason: the shipped title
screen (`title_screen_live.png`) uses none of the title art that exists in
`title_gallery.png`. That is a finish/integration gap, not a readability-criterion
failure, but it is the single most visible problem and should block acceptance
until resolved.

## Review-artifact limitation (read first)

All four "gallery" screenshots render their assets crammed into the
bottom-left corner at small scale, with the placeholder title text
("M.U.L.E." + "New Game") showing through the center. The gallery fixtures
appear to mount sprite `<use>` nodes onto the live title page rather than a
dedicated blank gallery canvas. This is a fixture-composition problem, not an
art-asset problem, but it made direct evaluation harder and it is why several
criteria below are graded N/A or NOT SHOWN: the galleries do not compose an
owned-vs-unowned plot, nor a priced auction token at render scale. Assets were
judged by cropping and upscaling the corner regions 3-4x.

## Per-image findings

### sprite_gallery.png (species avatars, mules, outfit badges)

Observed: 8 species body types, each in all 4 player colors, on an olive tile
background and on the dark background, plus a red mule row (walk / towed /
installed poses) and a resource-swatch strip (green, yellow, gray, pink).

- The 4 player colors read as distinct on the dark background: coral
  (`player0`), cyan (`player1`), green (`player2`), orchid (`player3`). This
  matches the simulator-verified separation in the spec.
- Avatar visibility on the olive plains tile is the weak spot. Body-fill
  luminance contrast against `terrainPlain` (`#7c9a4e`) is low for every color
  (coral 1.04:1, green 1.05:1, orchid 1.30:1, cyan 1.91:1 -- all under the WCAG
  1.4.11 3:1 non-text minimum). Coral, cyan, and orchid stay clearly readable
  because they separate from olive by hue and by the darker outline stroke.
  `player2` green is the genuine problem: it shares the plains hue family AND
  sits at 1.05:1 luminance, so a green avatar on a plains tile leans entirely
  on its outline stroke and ground-contact ellipse to be seen. Grade MARGINAL.
  Fix: nudge `player2` lighter/more saturated, or give avatars a thin
  light halo/keyline on dark-on-terrain cases.
- Silhouette differentiation is uneven. Strongly distinct: the robot
  (square antenna head, boxy legs), the winged flyer (spread triangular
  wings), the stalk/lollipop species (round head on two thin legs), and the
  bear/blob (large round headless dome). Too similar to each other at map
  scale: the plain humanoid, the broad-shouldered figure, and the pear/
  bottom-heavy body all read as "rounded head on a rounded torso" and would be
  hard to tell apart on a 32px map token. Weakest sprites by name: the
  humanoid / broad / pear trio.
- Outfit badges (the swatch strip and, in the town image, the store counters)
  use distinct icon shapes per resource, not color alone. Grade PASS (see
  town image).
- Mule poses read as a four-legged animal with a towing hitch; the towed and
  installed variants are legible.

### terrain_gallery.png (7 terrain tiles + mixed patch)

Observed: plains (green + conifer texture), river (blue + wave lines),
mountain tiers 1/2/3 (tan / medium-brown / dark-brown, with 1 / 2 / 3 outlined
peak triangles respectively), town (gold + dark building cluster), and a
crater/crystite tile (dark disc rim + pink deposit dots). A 3x3 mixed-neighbor
patch shows tiles adjacent.

- Terrain distinguishability PASS. Crucially, the three mountain tiers carry a
  second, non-hue signal beyond fill darkness: the peak COUNT (one, two, three
  triangles). This directly satisfies the spec's requirement that mountain
  tiers not rely on fill darkness alone, and it resolves the `terrainMountain3`
  (`#5c4736`) low-contrast known risk for tile-to-tile reading.
- Each type also carries a distinct interior texture (trees, waves, peaks,
  buildings, deposit dots), so no two adjacent types collide.
- Minor: mountain tier 1 vs tier 2 fills are close in the mixed patch; the peak
  count is what separates them, so keep that overlay mandatory and never
  render a mountain tile fill-only.

### town_gallery.png (buildings, doors, counters, exits, arena chrome)

Observed: a store building with four outfit-counter icons (green food, yellow
energy bolt, gray smithore lump, pink crystite diamond), a pub (mug icon), an
assay office (glasses + diamond icon), a corral (fenced pen with a mule), gold
arch door markers, a resource-counter badge row, white directional exit arrows
in discs, and auction-arena chrome (axis bar, token, gold 4-point trade-flash
star, timer bar frame).

- Outfit clarity PASS. The store counters and the badge row read the four
  resources by icon shape (chevron, bolt, lump, diamond), legible and
  color-independent.
- Doors are obviously doors: the gold rounded-arch markers read as doorways at
  a glance. Exit arrows are unambiguous.
- Price readability is only partially exercised: the arena axis, token, and
  trade-flash chrome are present and on-brand, but no numeric price label on a
  colored token is composed here, so the per-token text contrast (which the
  spec's table already clears at 5.59:1+) is not visually stressed. Grade
  MARGINAL only because it is not demonstrated, not because a defect was seen.
- The assay-office glyph (glasses over a diamond) is the least self-evident
  building icon; consider a clearer assay motif (magnifier over ore).

### title_gallery.png (title art assets)

Observed: a gold blocky/retro "M.U.L.E." wordmark, a ringed brown planet with
subtle banding, a scattered starfield, a slate landing-ship silhouette with a
gold exhaust, 8 red species portrait busts in hazard-striped frames, and ~11
event vignettes (rain cloud, sunburst, meteor, ore/crystite cluster, pest bug,
pirate sailboat, energy battery, fire flame, launch/quake spark, price-up and
price-down arrows).

- The wordmark is the strongest retro accent and reads well; it fits the
  "modern shapes with retro accents" direction better than the plain system
  font used on the live screen.
- The planet, starfield, and ship compose a genuine title backdrop.
- Event vignettes mostly read at 48px. Confusable pair: the ore/crystite
  cluster (three circles) reads close to a generic resource icon; the
  fire/fuel droplet is also a bit generic. These are aesthetic, not blocking.
- Portrait busts repeat the humanoid/broad/pear similarity noted above.

### title_screen_live.png (the shipped title screen)

Observed: plain white system-font "M.U.L.E." text and a default "New Game"
button centered on flat `bgDeep`. None of the title art (wordmark, planet,
starfield, ship, portraits) is present.

- This is the highest-impact finding. The first screen a player sees looks
  unfinished relative to the assets that already exist in
  `title_gallery.png`. It reads as a placeholder, not a polished remake.
- Composition is empty: a small centered text block over a large dark void,
  no hierarchy, no art. The gallery assets would fill this directly.

## Style-spec conformance

- Shape language is consistent across modules: flat silhouettes built from
  circles, rounded rects, and polygons, with a single darkened outline stroke
  on actor/tile/building sprites and strokeless icons. Species, mules, terrain,
  town, and title assets read as one family despite being separate workstreams.
- Depth/shading policy is honored: flat layered shapes, at most a highlight/
  shadow patch, ground-contact ellipses under actors, no gradients-as-filters
  beyond the sanctioned flat overlays. Nothing looked like a drop-shadow or
  blur.
- Palette harmony is good; the player colors, terrain browns, and resource
  hues cohere. The `player2` green revision reads distinct from `gold`.

## Aesthetics

Clean, modern-flat, and charming, with a coherent retro accent in the wordmark
and hazard-frame portraits. Silhouette quality is good for terrain, town, and
the distinct species; it is weakest where three humanoid body types converge.
The overall set evokes the intended polished-remake spirit -- once it is
actually placed on screen, which today it is not on the title.

## Ranked fix list

### MUST-FIX (blocks art-gate acceptance)

- Wire the title art into the live title screen. `title_screen_live.png` ships
  plain text while `title_gallery.png` holds a finished wordmark, ringed
  planet, starfield, ship, and portraits. Compose them into the actual title
  scene. (Finish/integration gap; single most visible problem. Owner: title UI
  scene, not the art assets, which exist.)

No readability criterion hard-fails on the asset sets themselves.

### SHOULD-FIX (marginal or aesthetic)

- Improve `player2` green avatar visibility on plains. Body-fill vs
  `terrainPlain` is 1.05:1 and same hue family, so it depends entirely on the
  outline. Shift `player2` lighter/more saturated, or add a thin light keyline
  to avatars rendered on same-hue terrain. (Avatar-visibility MARGINAL.)
- Differentiate the humanoid / broad-shouldered / pear species silhouettes so
  all 8 are distinguishable at 32px map scale (vary head shape, stance, or add
  a distinct accessory per species).
- Compose an owned-vs-unowned plot sample and a priced auction-token sample so
  the ownership-clarity and price-readability criteria can be verified visually,
  not only by the spec contrast table. (Currently NOT SHOWN.)
- Fix the gallery fixtures so assets render on a clean canvas at full scale
  instead of crammed into the corner behind the placeholder title text; this
  is what a reviewer actually inspects.

### POLISH (nice-to-have)

- Clarify the assay-office building glyph (a magnifier-over-ore motif reads
  more clearly than glasses-over-diamond).
- Disambiguate the ore/crystite-cluster and fire/fuel event vignettes from
  generic resource icons.
- Consider a slightly larger or more detailed landing ship on the title
  backdrop; at present it is small and plain against the starfield.

## Overall art-gate verdict

PASS-WITH-FIXES. The terrain, actor, town, and title asset sets meet the style
spec and the readability criteria they exercise (terrain distinguishability and
outfit clarity are solid; avatar visibility is marginal only for green-on-green;
price and ownership are sound by spec but not composed for visual proof). The
one item that keeps this from a clean pass is presentation, not assets: the
shipped title screen must actually use the title art before the gate closes.
