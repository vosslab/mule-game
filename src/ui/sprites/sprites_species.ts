/**
 * SVG species-avatar sprite defs: one <symbol> pair (walk-frame1/idle,
 * walk-frame2) per playable species, following the shape language, stroke
 * policy, and animation-frame policy in
 * docs/active_plans/active/mule_art_style_spec.md.
 *
 * Facing: every symbol faces right. A caller that needs the avatar to face
 * left applies a horizontal flip to the <use> instance (CSS
 * `transform: scaleX(-1)` on the instance, or an SVG
 * `<g transform="scale(-1,1)">` wrapper); no separate left-facing symbols
 * are drawn, per the spec's 2-3 frame animation budget.
 *
 * Player-color tint: the primary body shape in every symbol uses
 * `fill="currentColor"`. A caller sets the instance's tint by setting the
 * CSS `color` property on the <use> element or an ancestor (for example
 * `style="color: ${PALETTE.player0}"`), which is standard SVG currentColor
 * resolution -- no `--player-color` custom property is required. Secondary
 * detail shapes (a head bump, wings, limbs) also use `currentColor` so the
 * whole silhouette tints together; only the shared ground-contact ellipse
 * and the outer stroke use fixed PALETTE tokens, since those must stay
 * legible regardless of which of the 4 player colors is applied.
 *
 * Avatar keyline (art-gate revision): every species' single
 * "outer silhouette" primitive (see keylineOuterShapeMarkup()) is drawn
 * twice -- a wider `keylineLight` (white) halo stroke first, then the usual
 * tinted fill with its `bgTrackAxis` darkened stroke on top -- so a ~1px
 * light rim survives around the silhouette regardless of player tint or
 * background. This was added because player2 (green) sits at only a
 * 1.05:1 luminance contrast against `terrainPlain` (same hue family), well
 * under the WCAG 1.4.11 3:1 non-text minimum; see the art style spec's
 * Avatar keyline section for the measured ratios. Applied uniformly to all
 * 8 species x 2 frames x 4 player tints, not just player2, per the spec's
 * "apply consistently" stroke-policy rule.
 */

import { PALETTE } from "./palette";

/** Fixed set of playable species, silhouette-distinct per the art style spec. */
export const SPECIES_NAMES = [
  "humanoid",
  "gollumer",
  "mechtron",
  "packer",
  "leggite",
  "bonzoid",
  "spheroid",
  "flapper",
] as const;

export type SpeciesName = (typeof SPECIES_NAMES)[number];

/**
 * Build the symbol id for one species animation frame, per the naming
 * convention `sprite-<domain>-<name>[-frameN]` in
 * docs/active_plans/active/mule_art_style_spec.md. Both frames carry an
 * explicit frame suffix (matching that doc's own
 * `sprite-species-human-frame1` / `-frame2` example ids), rather than
 * leaving frame 1 unsuffixed: species avatars always animate once mounted
 * in a scene, so there is no single-pose case that needs the bare-id
 * shorthand the doc reserves for non-animated sprites.
 *
 * @param species - Which species symbol to look up.
 * @param frame - Animation frame, 1 (rest/first stride) or 2 (alternate
 *   stride).
 * @returns The `<defs>` symbol id for that species and frame.
 */
export function speciesSymbolId(species: SpeciesName, frame: 1 | 2): string {
  return `sprite-species-${species}-frame${frame}`;
}

/**
 * Choose which frame id a frame-swap timer should render this tick.
 *
 * When `prefersReducedMotion` is true, always hold on frame 1 (the rest
 * pose) regardless of the animation-driven frame index, per the spec's
 * reduced-motion policy: "hold on the rest/frame-1 pose instead of
 * cycling." The frame-swap timer itself belongs to the scene that consumes
 * this sprite set (an M4+ concern); this function is the pure decision
 * logic a timer calls into.
 *
 * @param species - Which species is animating.
 * @param animationFrame - The frame the animation clock is currently on.
 * @param prefersReducedMotion - Result of a
 *   `matchMedia("(prefers-reduced-motion: reduce)")` check.
 * @returns The symbol id to render this tick.
 */
export function pickSpeciesFrameId(
  species: SpeciesName,
  animationFrame: 1 | 2,
  prefersReducedMotion: boolean,
): string {
  if (prefersReducedMotion) {
    return speciesSymbolId(species, 1);
  }
  return speciesSymbolId(species, animationFrame);
}

/**
 * Build the shared `<defs>` markup for every species: 8 species x 2 frames
 * = 16 symbols, each a flat, tintable, stroke-outlined silhouette at the
 * actor/creature 32x32 viewBox.
 *
 * @returns Raw SVG markup for a single `<defs>` element.
 */
export function buildSpeciesSpriteDefsMarkup(): string {
  let markup = "<defs>";
  markup += buildHumanoidSymbols();
  markup += buildGollumerSymbols();
  markup += buildMechtronSymbols();
  markup += buildPackerSymbols();
  markup += buildLeggiteSymbols();
  markup += buildBonzoidSymbols();
  markup += buildSpheroidSymbols();
  markup += buildFlapperSymbols();
  markup += "</defs>";
  return markup;
}

//============================================
// Low-opacity ground-contact ellipse: reads as "grounded," not as
// directional lighting, per the spec's depth-and-shading policy. Reuses
// bgDeep at reduced opacity, the exact shading device the spec names.
function groundContactEllipseMarkup(): string {
  return `<ellipse cx="16" cy="29" rx="9" ry="2" fill="${PALETTE.bgDeep}" opacity="0.35" />`;
}

//============================================
// Draws a species' single "outer silhouette" primitive twice: a wider
// `keylineLight` halo stroke first (fill-none, so only the stroke shows),
// then the normal tinted fill with its own darkened outline stroke on top.
// The wider halo straddles the shape boundary and peeks out past the
// narrower dark stroke drawn over it, producing a light rim that keeps any
// player tint legible against same-hue terrain (see module doc comment).
// `shapeTag` is the SVG element name (rect/circle/ellipse/polygon);
// `attrs` is that element's shape-geometry attributes only (no fill/stroke).
function keylineOuterShapeMarkup(shapeTag: string, attrs: string): string {
  const keyline = `<${shapeTag} ${attrs} fill="none" stroke="${PALETTE.keylineLight}" stroke-width="3" />`;
  const body = `<${shapeTag} ${attrs} fill="currentColor" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  return keyline + body;
}

//============================================
// Humanoid: upright figure with a distinct flat-brim helmet (a rect bar
// fused over the head circle) and short side arms held close to the body,
// so it reads as a helmeted figure with visible limbs -- distinct from
// bonzoid's long down-reaching arms and packer's armless taper. (Revised:
// the previous plain circle-head + bare-rect-torso read too
// close to bonzoid and packer at 32px; see the art gate assessment's
// "humanoid / broad-shouldered / pear" confusable-trio finding.)
function buildHumanoidSymbols(): string {
  let markup = "";
  markup += `<symbol id="${speciesSymbolId("humanoid", 1)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup("rect", 'x="10" y="14" width="12" height="11" rx="3"');
  markup += '<rect x="7" y="15" width="3" height="7" rx="1.5" fill="currentColor" />';
  markup += '<rect x="22" y="15" width="3" height="7" rx="1.5" fill="currentColor" />';
  markup += '<circle cx="16" cy="9" r="5" fill="currentColor" />';
  markup += '<rect x="10" y="4" width="12" height="3" fill="currentColor" />';
  markup += '<rect x="10" y="24" width="3" height="6" rx="1" fill="currentColor" />';
  markup += '<rect x="19" y="24" width="3" height="6" rx="1" fill="currentColor" />';
  markup += "</symbol>";
  markup += `<symbol id="${speciesSymbolId("humanoid", 2)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup("rect", 'x="10" y="14" width="12" height="11" rx="3"');
  markup += '<rect x="7" y="15" width="3" height="7" rx="1.5" fill="currentColor" />';
  markup += '<rect x="22" y="15" width="3" height="7" rx="1.5" fill="currentColor" />';
  markup += '<circle cx="16" cy="9" r="5" fill="currentColor" />';
  markup += '<rect x="10" y="4" width="12" height="3" fill="currentColor" />';
  markup += '<rect x="13" y="24" width="3" height="6" rx="1" fill="currentColor" />';
  markup += '<rect x="22" y="24" width="3" height="6" rx="1" fill="currentColor" />';
  markup += "</symbol>";
  return markup;
}

//============================================
// Gollumer: cheerful jelly blob. A single asymmetrical, rounded outline keeps
// the player tint as one dominant mass, while the large pale eyes, dark smile,
// and two tiny gold freckles give it a readable face at map scale. The second
// frame squashes lower and swaps the eye tilt for a buoyant blob-hop.
function buildGollumerSymbols(): string {
  let markup = "";
  markup += `<symbol id="${speciesSymbolId("gollumer", 1)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup(
    "path",
    'd="M5 21 C5 16 7 12 11 11 C13 7 19 7 21 10 C26 10 28 14 28 19 C28 25 23 28 16 28 C9 28 5 26 5 21 Z"',
  );
  markup += `<ellipse cx="12" cy="16" rx="3" ry="3.5" fill="${PALETTE.textPrimary}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  markup += `<ellipse cx="20" cy="15" rx="3" ry="3.5" fill="${PALETTE.textPrimary}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  markup += `<circle cx="12.75" cy="16.5" r="1.25" fill="${PALETTE.bgPanel}" />`;
  markup += `<circle cx="19.25" cy="15.5" r="1.25" fill="${PALETTE.bgPanel}" />`;
  markup += `<path d="M12 22 Q16 25 21 21" fill="none" stroke="${PALETTE.bgPanel}" stroke-width="1.5" stroke-linecap="round" />`;
  markup += `<circle cx="8.5" cy="19" r="1" fill="${PALETTE.gold}" />`;
  markup += `<circle cx="24.5" cy="20" r="1" fill="${PALETTE.gold}" />`;
  markup += "</symbol>";
  markup += `<symbol id="${speciesSymbolId("gollumer", 2)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup(
    "path",
    'd="M4 22 C4 17 7 13 11 13 C13 9 19 9 21 12 C26 12 29 16 28 21 C27 26 23 28 16 28 C8 28 4 26 4 22 Z"',
  );
  markup += `<ellipse cx="12" cy="18" rx="3" ry="3.25" fill="${PALETTE.textPrimary}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  markup += `<ellipse cx="20" cy="17" rx="3" ry="3.25" fill="${PALETTE.textPrimary}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  markup += `<circle cx="11.25" cy="17.5" r="1.25" fill="${PALETTE.bgPanel}" />`;
  markup += `<circle cx="20.75" cy="16.5" r="1.25" fill="${PALETTE.bgPanel}" />`;
  markup += `<path d="M12 23 Q16 20 21 23" fill="none" stroke="${PALETTE.bgPanel}" stroke-width="1.5" stroke-linecap="round" />`;
  markup += `<circle cx="8.5" cy="21" r="1" fill="${PALETTE.gold}" />`;
  markup += `<circle cx="24.5" cy="22" r="1" fill="${PALETTE.gold}" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Mechtron: a bilaterally symmetric panel robot. Its antenna nubs, side pods,
// and feet belong to one closed currentColor silhouette, which keeps every
// contour intentional at 32px. Frame 2 is a centered hop.
function buildMechtronSymbols(): string {
  let markup = "";
  markup += `<symbol id="${speciesSymbolId("mechtron", 1)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup(
    "path",
    'd="M11 8 L12 5 L14 8 H18 L20 5 L21 8 H23 Q26 8 26 11 V14 H29 V22 H26 V24 Q26 26 23 26 H21 V29 H18 V26 H14 V29 H11 V26 H9 Q6 26 6 24 V22 H3 V14 H6 V11 Q6 8 9 8 Z"',
  );
  markup += `<rect x="9" y="12" width="14" height="6" rx="2" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  markup += `<rect x="11" y="14" width="3" height="2" rx="1" fill="${PALETTE.textPrimary}" />`;
  markup += `<rect x="18" y="14" width="3" height="2" rx="1" fill="${PALETTE.textPrimary}" />`;
  markup += `<rect x="12" y="20" width="8" height="2" rx="1" fill="${PALETTE.gold}" stroke="${PALETTE.bgTrackAxis}" stroke-width="0.75" />`;
  markup += `<rect x="9" y="20" width="1.5" height="2" rx="0.5" fill="${PALETTE.bgPanel}" />`;
  markup += `<rect x="21.5" y="20" width="1.5" height="2" rx="0.5" fill="${PALETTE.bgPanel}" />`;
  markup += "</symbol>";
  markup += `<symbol id="${speciesSymbolId("mechtron", 2)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup(
    "path",
    'd="M11 7 L12 4 L14 7 H18 L20 4 L21 7 H23 Q26 7 26 10 V13 H29 V21 H26 V23 Q26 25 23 25 H21 V28 H18 V25 H14 V28 H11 V25 H9 Q6 25 6 23 V21 H3 V13 H6 V10 Q6 7 9 7 Z"',
  );
  markup += `<rect x="9" y="11" width="14" height="6" rx="2" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  markup += `<rect x="11" y="13" width="3" height="2" rx="1" fill="${PALETTE.textPrimary}" />`;
  markup += `<rect x="18" y="13" width="3" height="2" rx="1" fill="${PALETTE.textPrimary}" />`;
  markup += `<rect x="12" y="19" width="8" height="2" rx="1" fill="${PALETTE.gold}" stroke="${PALETTE.bgTrackAxis}" stroke-width="0.75" />`;
  markup += `<rect x="9" y="19" width="1.5" height="2" rx="0.5" fill="${PALETTE.bgPanel}" />`;
  markup += `<rect x="21.5" y="19" width="1.5" height="2" rx="0.5" fill="${PALETTE.bgPanel}" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Packer: pear-shaped. A wide-bottom, narrow-top hexagon body tapers UP to
// a small head, the inverse of bonzoid's shoulder taper (which narrows
// DOWN), and carries no arms -- just two tiny foot nubs -- so its "bottom-
// heavy" silhouette reads distinct from both the arm-bearing humanoid and
// bonzoid. (Revised: the previous small-head-on-wide-rounded-
// rect torso read too close to humanoid/bonzoid at 32px; see the art gate
// assessment's "humanoid / broad-shouldered / pear" confusable-trio
// finding.)
function buildPackerSymbols(): string {
  let markup = "";
  markup += `<symbol id="${speciesSymbolId("packer", 1)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup("polygon", 'points="12,11 20,11 25,18 24,26 8,26 7,18"');
  markup += '<circle cx="16" cy="8" r="3" fill="currentColor" />';
  markup += '<rect x="9" y="26" width="3" height="3" rx="1" fill="currentColor" />';
  markup += '<rect x="20" y="26" width="3" height="3" rx="1" fill="currentColor" />';
  markup += "</symbol>";
  markup += `<symbol id="${speciesSymbolId("packer", 2)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup("polygon", 'points="12,11 20,11 25,18 24,26 8,26 7,18"');
  markup += '<circle cx="16" cy="9" r="3" fill="currentColor" />';
  markup += '<rect x="10" y="26" width="3" height="3" rx="1" fill="currentColor" />';
  markup += '<rect x="19" y="26" width="3" height="3" rx="1" fill="currentColor" />';
  markup += "</symbol>";
  return markup;
}

//============================================
// Leggite: long-legged. A small body sits high on two very long, thin legs
// that scissor wide between frames -- the biggest positional swing of any
// species, matching its "long-legged" read at small map scale.
function buildLeggiteSymbols(): string {
  let markup = "";
  markup += `<symbol id="${speciesSymbolId("leggite", 1)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += '<rect x="12" y="16" width="2" height="14" fill="currentColor" />';
  markup += '<rect x="19" y="16" width="2" height="14" fill="currentColor" />';
  markup += keylineOuterShapeMarkup("ellipse", 'cx="16" cy="11" rx="6" ry="5"');
  markup += "</symbol>";
  markup += `<symbol id="${speciesSymbolId("leggite", 2)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += '<rect x="9" y="16" width="2" height="14" fill="currentColor" />';
  markup += '<rect x="22" y="16" width="2" height="14" fill="currentColor" />';
  markup += keylineOuterShapeMarkup("ellipse", 'cx="16" cy="11" rx="6" ry="5"');
  markup += "</symbol>";
  return markup;
}

//============================================
// Bonzoid: ape-like, broad tapering shoulders (narrows DOWN, the inverse of
// packer's pear taper). Arms now reach nearly to the ground with a rounded
// "knuckle" nub at each tip, an explicit knuckle-walk hint -- swapping
// which arm is longer between frames reads as a swinging knuckle-drag gait,
// distinct from humanoid's short side arms and packer's armless taper.
// (Revised: see the art gate assessment's "humanoid /
// broad-shouldered / pear" confusable-trio finding.)
function buildBonzoidSymbols(): string {
  let markup = "";
  markup += `<symbol id="${speciesSymbolId("bonzoid", 1)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup("polygon", 'points="8,14 24,14 21,27 11,27"');
  markup += '<circle cx="16" cy="9" r="5" fill="currentColor" />';
  markup += '<rect x="3" y="15" width="3" height="14" rx="1.5" fill="currentColor" />';
  markup += '<circle cx="4.5" cy="29" r="2" fill="currentColor" />';
  markup += '<rect x="26" y="15" width="3" height="12" rx="1.5" fill="currentColor" />';
  markup += '<circle cx="27.5" cy="27" r="2" fill="currentColor" />';
  markup += "</symbol>";
  markup += `<symbol id="${speciesSymbolId("bonzoid", 2)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup("polygon", 'points="8,14 24,14 21,27 11,27"');
  markup += '<circle cx="16" cy="9" r="5" fill="currentColor" />';
  markup += '<rect x="3" y="15" width="3" height="12" rx="1.5" fill="currentColor" />';
  markup += '<circle cx="4.5" cy="27" r="2" fill="currentColor" />';
  markup += '<rect x="26" y="15" width="3" height="14" rx="1.5" fill="currentColor" />';
  markup += '<circle cx="27.5" cy="29" r="2" fill="currentColor" />';
  markup += "</symbol>";
  return markup;
}

//============================================
// Spheroid: round. One large circular body with a small head bump; tiny
// feet nubs rock up and down between frames (a roll, not a stride) to fit
// a body shape with no room for a leg swing.
function buildSpheroidSymbols(): string {
  let markup = "";
  markup += `<symbol id="${speciesSymbolId("spheroid", 1)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup("circle", 'cx="16" cy="18" r="10"');
  markup += '<circle cx="16" cy="7" r="3" fill="currentColor" />';
  markup += '<rect x="11" y="27" width="3" height="3" rx="1" fill="currentColor" />';
  markup += '<rect x="18" y="27" width="3" height="3" rx="1" fill="currentColor" />';
  markup += "</symbol>";
  markup += `<symbol id="${speciesSymbolId("spheroid", 2)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup("circle", 'cx="16" cy="18" r="10"');
  markup += '<circle cx="16" cy="7" r="3" fill="currentColor" />';
  markup += '<rect x="10" y="26" width="3" height="3" rx="1" fill="currentColor" />';
  markup += '<rect x="19" y="28" width="3" height="3" rx="1" fill="currentColor" />';
  markup += "</symbol>";
  return markup;
}

//============================================
// Flapper: hovering kite-moth. One broad, winged currentColor silhouette
// reads immediately as airborne, while a dark mask, two bright eyes, and a
// gold chest beacon stay facially legible at 32px. The wings swing from a
// low spread in frame 1 to a high spread in frame 2, making a clear wingbeat.
function buildFlapperSymbols(): string {
  let markup = "";
  markup += `<symbol id="${speciesSymbolId("flapper", 1)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup(
    "path",
    'd="M16 7 C20 7 22 10 23 13 L30 16 L27 21 L22 19 C21 24 19 27 16 27 C13 27 10 24 10 19 L4 22 L2 17 L9 13 C10 10 12 7 16 7 Z"',
  );
  markup += `<path d="M9 14 L14 18 M23 14 L18 18" fill="none" stroke="${PALETTE.bgTrackAxis}" stroke-width="1.25" stroke-linecap="round" />`;
  markup += `<path d="M11 14 Q16 10 21 14 V17 Q16 20 11 17 Z" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  markup += `<ellipse cx="13.5" cy="15" rx="1.5" ry="1.75" fill="${PALETTE.textPrimary}" />`;
  markup += `<ellipse cx="18.5" cy="15" rx="1.5" ry="1.75" fill="${PALETTE.textPrimary}" />`;
  markup += `<circle cx="14" cy="15.5" r="0.75" fill="${PALETTE.bgDeep}" />`;
  markup += `<circle cx="18" cy="15.5" r="0.75" fill="${PALETTE.bgDeep}" />`;
  markup += `<path d="M14 21 Q16 22.5 18 21" fill="none" stroke="${PALETTE.bgPanel}" stroke-width="1.25" stroke-linecap="round" />`;
  markup += `<circle cx="16" cy="23" r="1.5" fill="${PALETTE.gold}" stroke="${PALETTE.bgTrackAxis}" stroke-width="0.75" />`;
  markup += "</symbol>";
  markup += `<symbol id="${speciesSymbolId("flapper", 2)}" viewBox="0 0 32 32">`;
  markup += groundContactEllipseMarkup();
  markup += keylineOuterShapeMarkup(
    "path",
    'd="M16 8 C20 8 22 10 23 14 L28 4 L31 9 L23 19 C21 24 19 27 16 27 C13 27 10 24 9 19 L2 9 L5 4 L10 14 C11 10 13 8 16 8 Z"',
  );
  markup += `<path d="M10 14 L14 18 M22 14 L18 18" fill="none" stroke="${PALETTE.bgTrackAxis}" stroke-width="1.25" stroke-linecap="round" />`;
  markup += `<path d="M11 14 Q16 11 21 14 V17 Q16 20 11 17 Z" fill="${PALETTE.bgPanel}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  markup += `<ellipse cx="13.5" cy="15" rx="1.5" ry="1.75" fill="${PALETTE.textPrimary}" />`;
  markup += `<ellipse cx="18.5" cy="15" rx="1.5" ry="1.75" fill="${PALETTE.textPrimary}" />`;
  markup += `<circle cx="13" cy="14.5" r="0.75" fill="${PALETTE.bgDeep}" />`;
  markup += `<circle cx="19" cy="14.5" r="0.75" fill="${PALETTE.bgDeep}" />`;
  markup += `<path d="M14 21 Q16 20 18 21" fill="none" stroke="${PALETTE.bgPanel}" stroke-width="1.25" stroke-linecap="round" />`;
  markup += `<circle cx="16" cy="23" r="1.5" fill="${PALETTE.gold}" stroke="${PALETTE.bgTrackAxis}" stroke-width="0.75" />`;
  markup += "</symbol>";
  return markup;
}
