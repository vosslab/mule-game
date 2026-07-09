# M.U.L.E. remake art style spec

Written for milestone M1, workstream WS-A-spec of
[mule_fidelity_plan.md](mule_fidelity_plan.md) (archived alongside this spec on
plan completion). Every later art patch
(WS-A-terrain, WS-A-actors, WS-A-town, WS-A-title) cites this doc for shape
language, palette tokens, and readability criteria, so multiple subagents
produce visually consistent art without talking to each other directly.

## Direction

Clean modern SVG in the spirit of Planet M.U.L.E.'s presentation: smooth
shapes, readable silhouettes, subtle depth, with retro (Atari-era) palette
accents. This is the user's "more of the modern stylings" decision recorded
in the plan's Resolved decisions. Not a pixel-art recreation of either the
1983 original or Planet M.U.L.E.; a fresh, original sprite set that reads
clearly at small map scale first, with polish layered on top.

## Shape language

- Flat silhouette shapes are the base of every sprite: circles, rounded
  rectangles, and polygons, no photorealistic detail.
- Every sprite must read as a recognizable silhouette alone (no fill, pure
  black shape) before color is added. If the silhouette is ambiguous at
  target render size, simplify the shape rather than add detail.
- Prefer rounded corners (`rx`/`ry` on rects, or polygon vertices placed to
  suggest curvature) over sharp right angles for actors and creatures;
  terrain tiles and UI chrome may stay rectilinear.
- Reuse a small vocabulary of primitive shapes (circle, rounded rect,
  triangle/polygon) across sprites rather than inventing a new construction
  technique per sprite, so the set reads as one family.

## Stroke policy

- Icon-scale sprites (16x16 viewBox: resource icons, small UI glyphs) stay
  strokeless flat fills. A stroke at that size reads as noise, not detail.
- Actor/creature-scale sprites (32x32 viewBox: species avatars, M.U.L.E.s)
  and building/tile-scale sprites (64x64 viewBox: terrain tiles, town
  buildings) get one thin outline stroke, proportioned to about 3-5% of the
  viewBox width (roughly 1-1.5px at 32x32, 2-3px at 64x64), in a darkened
  variant of the shape's own fill hue -- never pure black. This separates
  the silhouette from adjacent tiles and the page background without
  adding a harsh outline.
- Do not stroke every sub-shape inside a sprite; stroke only the outer
  silhouette boundary. Internal detail (an ear, a marking) stays fill-only.

### Avatar keyline (WS-A-fixes art-gate revision)

The art gate assessment (`docs/active_plans/audits/art_gate_assessment.md`)
graded avatar visibility MARGINAL: `player2` (green) sits at only a 1.05:1
luminance contrast against `terrainPlain` (both same warm-green hue family),
under the WCAG 1.4.11 3:1 non-text minimum, so a `player2` avatar on plains
leaned entirely on its darkened outline stroke to be seen.

Fix chosen: a light keyline, not a palette nudge (no palette churn, and
`tests/test_player_color_distinct.mjs`'s simulator-verified separation
already depends on the current 4 hex values). Every species symbol's single
"outer silhouette" primitive (the one shape that already carries the
`bgTrackAxis` darkened stroke, per the Stroke policy section above) is now
drawn twice: a wider `keylineLight` (`#ffffff`) halo stroke first
(`stroke-width="3"`, `fill="none"`), then the normal tinted fill with its
own `bgTrackAxis` stroke on top. The wider halo straddles the shape
boundary and the narrower dark stroke does not fully cover it, so a ~1px
light rim survives around the silhouette. Applied uniformly to all 8
species x 2 frames x all 4 player tints (`src/ui/sprites/sprites_species.ts`'s
`keylineOuterShapeMarkup()`), per this section's "apply consistently" rule --
not only to `player2`.

Measured contrast, `keylineLight` (`#ffffff`) vs `terrainPlain` (`#7c9a4e`):
3.19:1, clearing the WCAG 1.4.11 3:1 non-text minimum (unlike `player2`'s
body-fill alone at 1.05:1). This is the keyline color's own contrast against
the terrain, independent of which player tint fills the shape underneath, so
every player color now gets the same >=3:1 boundary signal on plains, not
just a fix for the one marginal case.

`keylineLight` is a new `PALETTE` token (see Palette tokens below); no
existing token cleared 3:1 against `terrainPlain` (`textPrimary` at
`#e6e6e6` only reaches 2.55:1), so this patch added one rather than reusing
an existing token for a purpose its value was not chosen for.

## Depth and shading policy

- Depth comes from layered flat shapes, not gradients or SVG filters. No
  `<filter>`, no blur, no drop-shadow primitives: keeps render cost
  predictable and keeps every color value a scannable hex literal for the
  automated palette check.
- At most two shade steps per sprite: one highlight patch (a lighter
  variant of the base fill) and one shadow patch (a darker variant),
  applied as small flat polygon overlays on the side away from / toward an
  implied light source. Zero, one, or two steps are all acceptable;
  never more than two.
- A standing actor or creature may include one flat, low-opacity ground
  contact ellipse beneath it (reusing `bgDeep` at reduced opacity) to read
  as "grounded," not as directional lighting.

## Animation frame policy

- Walk cycles and simple interaction animations use 2-3 frames. Two frames
  (a symmetric alternating pose) covers most walk cycles; a third frame is
  for a distinct action beat (a mule rearing, an avatar reaching).
- Frame-suffix clarification (recorded by WS-A-title, M8, flagged by
  WS-A-actors): a sprite that actually animates carries an explicit
  `-frameN` suffix on every frame, including frame 1 -- there is no
  unsuffixed shorthand for "frame 1 of an animated sprite," since every
  animated sprite in this repo always cycles once mounted in a scene (see
  `sprites_species.ts`'s `speciesSymbolId`, which always emits
  `sprite-species-<name>-frame1` / `-frame2`). The unsuffixed bare id is
  reserved for sprites with exactly one pose that never animates (a
  building, a terrain tile, an icon): for those, the bare id is both the
  only id and the rest pose, so a caller that never animates can `<use>` it
  directly and still get a valid sprite.
- Any UI-side frame-swap timer must check `prefers-reduced-motion` and, when
  motion is reduced, hold on the rest/frame-1 pose instead of cycling. This
  is a spec each spatial scene's Playwright suite verifies (per the plan's
  accessibility gate), not a promise left unchecked.

## Symbol id naming convention

`sprite-<domain>-<name>[-frameN]`

Fixed domain set: `terrain`, `species`, `mule`, `town`, `event`, `icon`,
`arena`, `title`. Both `arena` and `title` were added by WS-A-title (M8):

- `arena` ratifies auction-arena chrome (backdrop, axis, tick, band,
  flash) as its own domain rather than folding it into `icon`:
  WS-A-town's `sprites_arena.ts` originally shipped those symbols as
  `sprite-icon-auction-*` because `arena`/`auction` was not yet a
  sanctioned domain (see that module's doc comment for the reasoning at
  the time); WS-A-title renamed them to `sprite-arena-*` to match, since
  arena chrome is its own recognizable class of sprite (HUD/backdrop
  chrome for one specific scene), not a generic small UI icon.
- `title` covers the title screen's backdrop-scale composite scene
  elements (`sprites_title.ts`'s wordmark, planet backdrop, starfield
  star, landing-ship silhouette, and species-select portrait plate). None
  of the domains that existed before this patch fit: `icon` specifically
  implies the 16x16 icon-scale ViewBox convention below, which these
  assets do not follow (a planet backdrop or a wordmark needs far more
  canvas than an icon glyph). `title`'s HUD-chrome cousins (panel corner,
  timer-bar frame/cap) stay under `icon` instead, since those are small
  decorative UI marks, not backdrop-scale scene elements -- see
  `sprites_title.ts`'s module doc comment for the full per-symbol
  breakdown.

Examples: `sprite-terrain-plain`, `sprite-species-human-frame1`,
`sprite-species-human-frame2`, `sprite-mule-walk-frame1`,
`sprite-town-store`, `sprite-event-pirates`, `sprite-icon-food`,
`sprite-arena-backdrop`, `sprite-title-logo`, `sprite-title-planet`.

The current `src/ui/sprites.ts` ids (`sprite-mule`, `sprite-player`,
`sprite-icon-food`, `sprite-icon-energy`, `sprite-icon-smithore`) predate
this convention. They are legacy ids, not renamed by this patch (out of
scope: this patch does not edit `sprites.ts`). Each owning workstream
(WS-A-actors for `sprite-player` -> `sprite-species-*`, WS-A-terrain for the
map fills) renames its ids to the convention when it migrates that sprite,
recording the Playwright selector-contract impact in its patch notes.

## ViewBox conventions

| Sprite class | ViewBox | Rationale |
| --- | --- | --- |
| Icon (resource glyphs, small UI marks) | `0 0 16 16` | Matches current `sprite-icon-*` sizing; legible at HUD scale. |
| Actor / creature (species, mule) | `0 0 32 32` | Square canvas simplifies rotation/flip and tow-chain layout; matches current `sprite-mule`. |
| Event vignette | `0 0 48 48` | Added by WS-A-title (M8): a colony/personal event narrates a specific happening (2-3 silhouette elements), more detail than the 16-unit icon budget allows but smaller than an actor; gets the actor-scale thin outline stroke rather than staying strokeless. |
| Terrain tile | `0 0 64 64` | Higher resolution than actors for texture and edge detail at map scale; aligns to a consistent grid unit. |
| Town building | multiples of the tile unit (`64 64`, `128 64`, ...) | Buildings share the town-scene grid; anchor at bottom-center so buildings of different footprints sit on a common ground line. |
| Title screen (`title` domain) | per-shape, no fixed size | Added by WS-A-title (M8), following the precedent `sprites_arena.ts` set for `arena` chrome: the wordmark, planet backdrop, starfield star, ship silhouette, and portrait plate each need a different canvas, documented per-shape in `sprites_title.ts`'s module doc comment rather than forced into one size. |

## Palette tokens

Defined in `src/ui/sprites/palette.ts` as the typed `PALETTE` const object.
21 tokens (20 at M8 WS-A-title, plus `keylineLight` added by the WS-A-fixes
art-gate revision below). Every sprite file's fill/stroke hex literals must
come from this table; `tests/test_sprite_palette.mjs` enforces it
mechanically (asserting >=20 tokens, so this addition still passes).

| Token | Hex | Role |
| --- | --- | --- |
| `bgDeep` | `#1a1a2e` | App background (kept from the current dark theme). |
| `bgPanel` | `#22223a` | HUD panel background. |
| `bgTrackAxis` | `#4a4a68` | Structural line color (auction axis, dividers). |
| `textPrimary` | `#e6e6e6` | Default body text on `bgDeep` / `bgPanel`. |
| `textOnLight` | `#1a1a2e` | Text/labels rendered on a light or player-colored fill. |
| `gold` | `#ffd23f` | Shared accent: money figures, focus rings, selection highlights. |
| `player0` | `#ff5a5f` | Player 0 identity color (coral red). |
| `player1` | `#4fd8ff` | Player 1 identity color (cyan). |
| `player2` | `#3aaa18` | Player 2 identity color (green; revised by WS-A-title from `#ffd23f` to stop sharing the `gold` accent hex, see Known risks). |
| `player3` | `#f872e8` | Player 3 identity color (orchid; revised by WS-A-title from `#c77dff` to widen colorblind-simulator separation from `player1`, see Known risks). |
| `keylineLight` | `#ffffff` | Avatar keyline halo stroke (WS-A-fixes; see Avatar keyline above), applied uniformly to all 4 player tints. |
| `terrainPlain` | `#7c9a4e` | Plains tile fill. |
| `terrainRiver` | `#3a7ca5` | River tile fill. |
| `terrainMountain1` | `#a68a6d` | Mountain tier 1 (lightest). |
| `terrainMountain2` | `#8a6f52` | Mountain tier 2. |
| `terrainMountain3` | `#5c4736` | Mountain tier 3 (darkest). |
| `terrainTown` | `#d9a441` | Town tile fill. |
| `resourceFood` | `#8fd14f` | Food outfit icon fill. |
| `resourceEnergy` | `#ffe066` | Energy outfit icon fill. |
| `resourceSmithore` | `#c0c0c0` | Smithore outfit icon fill. |
| `resourceCrystite` | `#ff6ec7` | Crystite icon fill, matching `RESOURCE_ICON_FILLS.crystite` in `src/ui/sprites.ts` (landed alongside the WS-E-foundation Resource-union widening). |

These are the same hex values already in the current `src/ui/sprites.ts`
`PLAYER_COLORS` / `TERRAIN_FILLS` / `RESOURCE_ICON_FILLS` tables (13 values
present when this spec was drafted, 14 once `RESOURCE_ICON_FILLS.crystite`
landed from the concurrent WS-E-foundation patch), renamed to canonical
tokens, plus 6 new tokens (`bgDeep`, `bgPanel`, `bgTrackAxis`, `textPrimary`,
`textOnLight`, `gold`) drawn from `src/style.css`'s existing values. This is
a deliberate choice: reusing the current values means
`tests/test_sprite_palette.mjs` passes against `sprites.ts` today with an
empty legacy allowlist, and no visual change ships in this patch. Later art
workstreams may revise individual terrain/player values with sim or
readability-fixture evidence; any revision updates this table and records
the reason.

WS-A-title (M8) is the first such revision: `player2` and `player3` moved
off their original hex values (`#ffd23f` and `#c77dff`) once
`tests/test_player_color_distinct.mjs` landed a simulator-based pairwise
check and found both `player0`-`player2` and `player1`-`player3` under the
20 deltaE separability threshold (see Colorblind-distinguishability
reasoning below for the new values' evidence).

## Contrast ratios

Computed with the WCAG relative-luminance formula from
[docs/COLOR_CONTRAST_ACCESSIBILITY.md](../COLOR_CONTRAST_ACCESSIBILITY.md)
(house target 5.5:1, WCAG AA minimum 4.5:1 for text; WCAG 1.4.11 non-text
minimum 3:1 for graphical fills).

### Text-on-background pairs actually used by the current UI

| Pair | Ratio | AA (4.5:1) | House (5.5:1) |
| --- | --- | --- | --- |
| `textPrimary` on `bgDeep` (body text) | 13.67:1 | OK | OK |
| `textPrimary` on `bgPanel` (HUD panel text) | 12.39:1 | OK | OK |
| `gold` on `bgDeep` (`.auction-screen-trade-flash`) | 11.81:1 | OK | OK |
| `gold` on `bgPanel` (`.hud-money`) | 10.71:1 | OK | OK |
| `textOnLight` on `player0` (auction token label) | 5.59:1 | OK | OK |
| `textOnLight` on `player1` (auction token label) | 10.23:1 | OK | OK |
| `textOnLight` on `player2` (auction token label) | 5.64:1 | OK | OK |
| `textOnLight` on `player3` (auction token label) | 6.96:1 | OK | OK |

Every real text-on-background pair in the current UI already clears both
the WCAG AA minimum and the house 5.5:1 target. No token needed adjustment
to pass. The `player2`/`player3` rows above are recomputed for WS-A-title's
revised hex values (see Colorblind-distinguishability reasoning below);
both still clear the house target with margin.

### Non-text fills vs the app background (WCAG 1.4.11, 3:1 minimum)

Terrain and resource fills are graphical tile/icon fills, not text, so the
applicable bar is the WCAG 1.4.11 non-text minimum (3:1), checked here
against `bgDeep` as the nearest applicable "surrounding" surface (map tiles
sit against each other in practice; see Known risks below for why
tile-vs-tile separation is the more meaningful metric for terrain).

| Token | Ratio vs `bgDeep` | 3:1 minimum |
| --- | --- | --- |
| `terrainPlain` | 5.35:1 | OK |
| `terrainRiver` | 3.74:1 | OK |
| `terrainMountain1` | 5.26:1 | OK |
| `terrainMountain2` | 3.64:1 | OK |
| `terrainMountain3` | 1.96:1 | FAIL |
| `terrainTown` | 7.58:1 | OK |
| `resourceFood` | 9.26:1 | OK |
| `resourceEnergy` | 13.08:1 | OK |
| `resourceSmithore` | 9.38:1 | OK |
| `resourceCrystite` | 6.75:1 | OK |

`terrainMountain3` fails the 3:1 non-text minimum against `bgDeep` (its
value is unchanged from the current `sprites.ts` fill). See Known risks.

## Colorblind-distinguishability reasoning (player colors)

Superseded by simulator evidence: `tests/test_player_color_distinct.mjs`
(the M3 fixture this section originally called for) runs the four player
colors through the Vienot, Brettel, Mollon (1999) dichromacy simulation
matrices for protanopia and deuteranopia, then asserts every pair stays
separable by CIE76 deltaE > 20 in both simulations. WS-A-title (M8) is the
patch that made the palette pass that fixture; the original luminance- and
blue-channel-share heuristic below is kept for historical context but is no
longer the basis for the palette (see Known risks).

| Token | Relative luminance | Blue-channel share | Hue family |
| --- | --- | --- | --- |
| `player0` (coral red) | 0.294 (darkest) | 0.37 (low) | warm |
| `player1` (cyan) | 0.580 | 1.00 (high) | cool |
| `player2` (green, was gold) | 0.297 (dark) | 0.14 (low) | warm |
| `player3` (orchid, was violet) | 0.378 | 0.94 (high) | cool |

### Simulator-verified pairwise separation (WS-A-title revision)

CIE76 deltaE per pair, computed by `tests/test_player_color_distinct.mjs`
against the current `player0`-`player3` hex values (all must exceed 20):

| Pair | Protanopia deltaE | Deuteranopia deltaE |
| --- | --- | --- |
| `player0` vs `player1` | 58.19 | 69.19 |
| `player0` vs `player2` | 26.79 | 41.65 |
| `player0` vs `player3` | 36.72 | 35.70 |
| `player1` vs `player2` | 37.58 | 33.84 |
| `player1` vs `player3` | 22.45 | 35.20 |
| `player2` vs `player3` | 22.80 | 22.64 |

The tightest margins are `player1` vs `player3` under protanopia (22.45)
and `player2` vs `player3` under deuteranopia (22.64); both still clear the
20 threshold with a margin of at least 2.4.

## Readability criteria (for later per-scene fixtures)

Behavior-focused, not implementation-focused: each criterion below is
something a Playwright fixture can assert on rendered output once the
owning workstream lands the sprite set.

- **Terrain distinguishability**: any two terrain tile types that can be
  adjacent on the map must be distinguishable without relying on hue alone
  (per the WCAG "use of color" principle) -- pair a fill-lightness or
  fill-hue difference with a distinct silhouette texture or icon overlay,
  not color alone. The mountain tiers in particular need a second signal
  beyond fill darkness (see Known risks).
- **Avatar visibility**: a player-colored avatar or token, at its actual
  render size in the scene, must be visually distinguishable from every
  terrain/background fill it can appear on (WCAG 1.4.11 non-text 3:1,
  measured at render scale, not only against `bgDeep`). RESOLVED by
  WS-A-fixes for the `player2`-vs-`terrainPlain` MARGINAL grade: see Avatar
  keyline above, which adds a `keylineLight` halo (3.19:1 against
  `terrainPlain`) around every species avatar's outer silhouette,
  independent of player tint.
- **Ownership clarity**: an owned plot must be visually distinct from an
  unowned plot independent of which player owns it (a border, flag, or
  outfit-marker addition, not a color swap alone), and the owning player's
  identity must be readable from a swatch/badge separate from the terrain
  fill itself.
- **Outfit clarity**: the mule-plus-outfit-marker combination on a plot
  must communicate which resource it produces through icon shape (reusing
  the `resource*` icon shapes), not fill color alone, so it stays readable
  for colorblind players and at small map scale.
- **Price readability**: any text rendered on a colored token or background
  (for example the auction-track token labels) must meet the house 5.5:1
  ratio against that specific token's color, verified per-token as in the
  table above, never assumed from the page-background ratio.

## Known risks and open items for later workstreams

- `terrainMountain3` (`#5c4736`) fails the WCAG 1.4.11 3:1 non-text minimum
  against `bgDeep` (1.96:1). In practice, map tiles are rendered
  edge-to-edge against other tiles, not floating on the app background, so
  the more meaningful metric is tile-to-tile separation, not tile-to-page
  contrast. WS-A-terrain's terrain-distinguishability fixture (M2) must
  measure and pass on adjacent-tile contrast directly; if it still reads as
  too dark next to `terrainMountain2` or `bgPanel` (used behind some map
  chrome), revise `terrainMountain3` in this table with the fixture's
  evidence recorded.
- RESOLVED by WS-A-title (M8): `player2` previously shared the same hex
  value (`#ffd23f`) as `gold` by design, so a player-2-owned element and a
  generic gold-accent element (a focus ring, a money figure) could look
  identical out of context. WS-A-title changed `player2` to `#3aaa18`
  (green); `gold` stays `#ffd23f` as the sole owner of that hex. Ownership
  clarity through a non-color signal (badge, border) is still the right
  design per the Ownership clarity readability criterion above, since any
  two player colors can still collide with terrain/UI fills in specific
  contexts -- this fix removes the one *guaranteed*, by-construction
  collision, not the general need for non-color ownership signals.
- RESOLVED by WS-A-title (M8): the colorblind-distinguishability reasoning
  was previously luminance- and blue-channel-based analysis only, not
  output from an actual deuteranopia or protanopia simulator.
  `tests/test_player_color_distinct.mjs` now runs the four player colors
  through the Vienot, Brettel, Mollon (1999) simulation matrices and
  asserts pairwise CIE76 deltaE > 20 under both protanopia and
  deuteranopia. The original palette failed that check (`player0` vs
  `player2` deltaE 6.15/9.69, `player1` vs `player3` deltaE 7.49/19.00
  under protanopia/deuteranopia); WS-A-title revised `player2` and
  `player3` to `#3aaa18` and `#f872e8` so every pair now exceeds 20 (see
  the Simulator-verified pairwise separation table above for the full
  matrix). `player0` and `player1` were unchanged.
- RESOLVED by WS-A-fixes (art-gate SHOULD-FIX pass): the art gate assessment
  graded avatar visibility MARGINAL because `player2` shares `terrainPlain`'s
  hue family at only 1.05:1 luminance contrast. See Avatar keyline above for
  the `keylineLight` halo fix and its measured 3.19:1 contrast against
  `terrainPlain`. The same assessment also flagged the humanoid /
  broad-shouldered (`bonzoid`) / pear-shaped (`packer`) species trio as too
  similar at 32px map scale; `src/ui/sprites/sprites_species.ts` reworked all
  three silhouettes (humanoid: flat-brim helmet + close side arms; bonzoid:
  arms extended to near-ground knuckle nubs; packer: an inverse-taper
  wide-bottom-narrow-top hexagon body with no arms) so the three now read as
  distinct postures rather than "circle head on rounded torso" three times
  over.

## Automated style check

`tests/test_sprite_palette.mjs` (run via `node --test
tests/test_sprite_palette.mjs`, and as part of the repo's
`node --import tsx --test 'tests/test_*.mjs'` gate in `check_codebase.sh`):

- Parses every file matching `src/ui/sprites/*.ts` (excluding `palette.ts`
  itself) and `src/ui/sprites.ts` for quoted hex-color string literals.
- Asserts every hex literal found is either present in `PALETTE`
  (`src/ui/sprites/palette.ts`) or explicitly listed in the test's
  `LEGACY_HEX_ALLOWLIST` (empty today; see Palette tokens above for why).
- Allowlists non-hex fill/stroke values (`none`, `currentColor`) and
  ignores `url(...)` references, since those are not palette lookups.
- Passes today against the current, unmodified `src/ui/sprites.ts` with an
  empty legacy allowlist.

## .gitignore housekeeping

`OTHER_REPOS/` (universal section) and `*.nes` (which matches `mule.nes`,
local section) were already present in `.gitignore` before this patch, so
no `.gitignore` edit was needed to satisfy the plan's "reference material
stays local-only" decision; verified with `git check-ignore -v` against
both paths.
