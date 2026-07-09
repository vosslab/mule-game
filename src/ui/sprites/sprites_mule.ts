/**
 * SVG M.U.L.E. sprite defs: walk, towed, installed, and escape poses, plus
 * a 4-slot outfit-marker badge system, following the shape language,
 * stroke policy, and animation-frame policy in
 * docs/active_plans/active/mule_art_style_spec.md.
 *
 * All poses share one vocabulary (boxy body, wedge snout, triangle ears,
 * short leg blocks), reusing `sprite-mule`'s existing "boxy quadruped on
 * short legs" read from the legacy `src/ui/sprites.ts` (not edited by this
 * module; that legacy id is migrated separately, per the spec's naming-
 * convention notes) so the new poses stay recognizably the same creature.
 *
 * Player-color tint: every pose's body uses `fill="currentColor"`, the same
 * mechanism `sprites_species.ts` uses, so an owned-plot mule can be tinted
 * to its owning player's color exactly like an avatar. Outfit badges are
 * NOT tinted -- they always render in their fixed `resource*` PALETTE fill,
 * since a badge's job is to identify which resource is produced, not who
 * owns the plot (ownership is the mule body's tint).
 *
 * Mule keyline (art-gate round-2 revision): every pose's main
 * body rect -- the dominant silhouette mass -- is drawn twice via
 * `muleKeylineBodyMarkup()` below: a wider `keylineLight` (white) halo
 * stroke first, then the usual tinted fill on top, mirroring
 * `sprites_species.ts`'s `keylineOuterShapeMarkup()` technique (duplicated
 * locally rather than imported, matching this repo's convention that each
 * `src/ui/sprites/*.ts` content module stays self-contained; only the
 * gallery modules import across sprite modules). This closes the round-2
 * finding that a same-hue mule (for example the green player's mule on a
 * plains tile) had no second signal separating it from the terrain, unlike
 * species avatars which already got this treatment.
 */

import { PALETTE } from "./palette";
import type { Resource } from "../../engine/player";

export const MULE_WALK_FRAME_1_ID = "sprite-mule-walk-frame1";
export const MULE_WALK_FRAME_2_ID = "sprite-mule-walk-frame2";
export const MULE_TOWED_ID = "sprite-mule-towed";
export const MULE_INSTALLED_ID = "sprite-mule-installed";
export const MULE_ESCAPE_ID = "sprite-mule-escape";

/**
 * Look up the outfit-badge symbol id for a resource, per the naming
 * convention `sprite-<domain>-<name>[-frameN]`: domain `mule`, compound
 * name `outfit-<resource>`.
 *
 * @param resource - Which resource's badge to look up.
 * @returns The `<defs>` symbol id for that resource's outfit badge.
 */
export function muleOutfitSymbolId(resource: Resource): string {
  return `sprite-mule-outfit-${resource}`;
}

/**
 * Choose which walk-frame id a frame-swap timer should render this tick.
 * Mirrors `pickSpeciesFrameId` in `sprites_species.ts`: holds on frame 1
 * when `prefersReducedMotion` is true.
 *
 * @param animationFrame - The frame the animation clock is currently on.
 * @param prefersReducedMotion - Result of a
 *   `matchMedia("(prefers-reduced-motion: reduce)")` check.
 * @returns The symbol id to render this tick.
 */
export function pickMuleWalkFrameId(animationFrame: 1 | 2, prefersReducedMotion: boolean): string {
  if (prefersReducedMotion || animationFrame === 1) {
    return MULE_WALK_FRAME_1_ID;
  }
  return MULE_WALK_FRAME_2_ID;
}

/**
 * A resource's position in the 4-slot outfit-marker grid, expressed as
 * row/column rather than absolute pixels so a caller can scale the badge
 * size to whatever the scene needs.
 */
export const MULE_OUTFIT_SLOT_OFFSETS: Readonly<Record<Resource, { row: 0 | 1; col: 0 | 1 }>> = {
  food: { row: 0, col: 0 },
  energy: { row: 0, col: 1 },
  smithore: { row: 1, col: 0 },
  crystite: { row: 1, col: 1 },
};

/**
 * Convert a resource's outfit-badge grid slot into pixel offsets for a
 * given badge size, so a caller lays out the 2x2 outfit-marker grid next
 * to an installed mule without hardcoding slot math itself.
 *
 * @param resource - Which resource's badge position to compute.
 * @param badgeSize - Width/height of one square badge, in the caller's
 *   chosen render units.
 * @param gap - Space between adjacent badges, in the same units.
 * @returns The top-left `{x, y}` offset for that resource's badge.
 */
export function muleOutfitSlotPosition(
  resource: Resource,
  badgeSize: number,
  gap: number,
): { x: number; y: number } {
  const slot = MULE_OUTFIT_SLOT_OFFSETS[resource];
  const x = slot.col * (badgeSize + gap);
  const y = slot.row * (badgeSize + gap);
  return { x, y };
}

/**
 * Build the shared `<defs>` markup: 2 walk frames, 3 single-pose symbols
 * (towed, installed, escape), and 4 outfit badges.
 *
 * @returns Raw SVG markup for a single `<defs>` element.
 */
export function buildMuleSpriteDefsMarkup(): string {
  let markup = "<defs>";
  markup += buildMuleWalkSymbols();
  markup += buildMuleTowedSymbol();
  markup += buildMuleInstalledSymbol();
  markup += buildMuleEscapeSymbol();
  markup += buildMuleOutfitBadgeSymbols();
  markup += "</defs>";
  return markup;
}

//============================================
// Draws the mule's main body rect twice: a wider `keylineLight` halo stroke
// first (fill-none, so only the stroke shows), then the normal tinted fill
// with its usual `bgTrackAxis` outline on top. The wider halo straddles the
// rect boundary and peeks out past the narrower dark stroke drawn over it,
// producing a light rim that keeps any player tint legible against same-hue
// terrain (see module doc comment). `attrs` is the body rect's geometry
// attributes only (x/y/width/height/rx), no fill/stroke.
function muleKeylineBodyMarkup(attrs: string): string {
  const keyline = `<rect ${attrs} fill="none" stroke="${PALETTE.keylineLight}" stroke-width="3" />`;
  const body = `<rect ${attrs} fill="currentColor" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  return keyline + body;
}

//============================================
// Shared ears, drawn identically across the walk/installed poses (ears
// don't need to differ between a walk-cycle's two frames).
function uprightEarsMarkup(): string {
  let markup = "";
  markup += '<polygon points="9,7 12,12 6,12" fill="currentColor" />';
  markup += '<polygon points="13,7 16,12 10,12" fill="currentColor" />';
  return markup;
}

//============================================
// Walk: boxy body on 3 short legs (matches the legacy sprite-mule's leg
// count) that shift left/right between frames for a trot.
function buildMuleWalkSymbols(): string {
  let markup = "";
  markup += `<symbol id="${MULE_WALK_FRAME_1_ID}" viewBox="0 0 32 32">`;
  markup += muleKeylineBodyMarkup('x="6" y="12" width="20" height="10" rx="2"');
  markup += '<polygon points="24,10 30,13 24,16" fill="currentColor" />';
  markup += uprightEarsMarkup();
  markup += '<rect x="7" y="21" width="3" height="7" fill="currentColor" />';
  markup += '<rect x="13" y="21" width="3" height="7" fill="currentColor" />';
  markup += '<rect x="19" y="21" width="3" height="7" fill="currentColor" />';
  markup += "</symbol>";
  markup += `<symbol id="${MULE_WALK_FRAME_2_ID}" viewBox="0 0 32 32">`;
  markup += muleKeylineBodyMarkup('x="6" y="12" width="20" height="10" rx="2"');
  markup += '<polygon points="24,10 30,13 24,16" fill="currentColor" />';
  markup += uprightEarsMarkup();
  markup += '<rect x="9" y="21" width="3" height="7" fill="currentColor" />';
  markup += '<rect x="15" y="21" width="3" height="7" fill="currentColor" />';
  markup += '<rect x="21" y="21" width="3" height="7" fill="currentColor" />';
  markup += "</symbol>";
  return markup;
}

//============================================
// Towed: the whole body tilts (a rotated group), legs hang limp instead of
// striding, and a taut line-plus-ring reads as a tow rope pulling the
// mule from off the front edge of the viewBox.
function buildMuleTowedSymbol(): string {
  let markup = `<symbol id="${MULE_TOWED_ID}" viewBox="0 0 32 32">`;
  markup += '<g transform="rotate(-14 17 18)">';
  markup += muleKeylineBodyMarkup('x="6" y="12" width="20" height="10" rx="2"');
  markup += '<polygon points="24,10 30,13 24,16" fill="currentColor" />';
  markup += uprightEarsMarkup();
  markup += '<rect x="8" y="21" width="3" height="5" fill="currentColor" />';
  markup += '<rect x="14" y="21" width="3" height="6" fill="currentColor" />';
  markup += '<rect x="20" y="21" width="3" height="4" fill="currentColor" />';
  markup += "</g>";
  markup += `<line x1="2" y1="15" x2="9" y2="13" stroke="${PALETTE.bgTrackAxis}" stroke-width="1.2" />`;
  markup += `<circle cx="2" cy="15" r="1.5" fill="none" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Installed: the same boxy body at rest, legs neat and evenly spaced,
// ears perked -- the "content, standing still on an owned plot" pose the
// outfit badges attach next to.
function buildMuleInstalledSymbol(): string {
  let markup = `<symbol id="${MULE_INSTALLED_ID}" viewBox="0 0 32 32">`;
  markup += muleKeylineBodyMarkup('x="6" y="12" width="20" height="10" rx="2"');
  markup += '<polygon points="24,10 30,13 24,16" fill="currentColor" />';
  markup += uprightEarsMarkup();
  markup += '<rect x="8" y="21" width="3" height="7" fill="currentColor" />';
  markup += '<rect x="14" y="21" width="3" height="7" fill="currentColor" />';
  markup += '<rect x="20" y="21" width="3" height="7" fill="currentColor" />';
  markup += "</symbol>";
  return markup;
}

//============================================
// Escape: body stretched wide and low for a gallop, ears swept back and
// flattened, and 4 legs stretched to extreme fore/aft angles -- reads as
// a full sprint rather than a walk cycle.
function buildMuleEscapeSymbol(): string {
  let markup = `<symbol id="${MULE_ESCAPE_ID}" viewBox="0 0 32 32">`;
  markup += muleKeylineBodyMarkup('x="4" y="13" width="24" height="8" rx="3"');
  markup += '<polygon points="27,11 32,14 27,17" fill="currentColor" />';
  markup += '<polygon points="7,10 11,13 4,12" fill="currentColor" />';
  markup += '<polygon points="11,10 15,13 8,12" fill="currentColor" />';
  markup += '<polygon points="6,20 9,20 4,27" fill="currentColor" />';
  markup += '<polygon points="12,20 15,20 10,27" fill="currentColor" />';
  markup += '<polygon points="18,20 21,20 24,27" fill="currentColor" />';
  markup += '<polygon points="24,20 27,20 30,27" fill="currentColor" />';
  markup += "</symbol>";
  return markup;
}

//============================================
// 4 outfit badges (icon-scale 16x16), each a distinct silhouette in a
// fixed resource fill, reused by the "outfit-clarity" fixture: markers
// must read by shape, not fill color alone.
function buildMuleOutfitBadgeSymbols(): string {
  let markup = "";
  markup += `<symbol id="${muleOutfitSymbolId("food")}" viewBox="0 0 16 16">`;
  markup += `<polygon points="8,1 15,8 8,15 1,8" fill="${PALETTE.resourceFood}" />`;
  markup += "</symbol>";
  markup += `<symbol id="${muleOutfitSymbolId("energy")}" viewBox="0 0 16 16">`;
  markup += `<polygon points="9,0 3,9 7,9 6,16 13,6 9,6" fill="${PALETTE.resourceEnergy}" />`;
  markup += "</symbol>";
  markup += `<symbol id="${muleOutfitSymbolId("smithore")}" viewBox="0 0 16 16">`;
  markup += `<polygon points="8,0 14,4 16,11 10,16 3,14 0,6" fill="${PALETTE.resourceSmithore}" />`;
  markup += "</symbol>";
  // Crystite gets its own gem/diamond silhouette (4 points, vertically
  // symmetric) rather than reusing smithore's irregular ore-chunk hexagon,
  // satisfying the "dedicated crystite sprite" the legacy sprites.ts
  // comment flags as a future art-pass item -- for this outfit-marker
  // context, not a change to the legacy sprites.ts icon itself.
  markup += `<symbol id="${muleOutfitSymbolId("crystite")}" viewBox="0 0 16 16">`;
  markup += `<polygon points="8,0 13,5 8,16 3,5" fill="${PALETTE.resourceCrystite}" />`;
  markup += "</symbol>";
  return markup;
}
