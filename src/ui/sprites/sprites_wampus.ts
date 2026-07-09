/**
 * SVG wampus sprite defs: a single creature silhouette
 * replacing the inline ellipse-plus-eyes glyph `overworld_scene.tsx` drew
 * directly. The wampus is a stationary, non-animated creature in this
 * engine (it spawns, blinks visible/hidden, and is caught -- no walk cycle),
 * so one static pose is enough, unlike the multi-frame species avatars in
 * sprites_species.ts.
 *
 * Palette tokens only, no raw hex literals: tests/test_sprite_palette.mjs
 * enforces this repo-wide for every file under src/ui/sprites/.
 */

import { PALETTE } from "./palette";

/** The `<defs>` symbol id for the wampus glyph. */
export const WAMPUS_SYMBOL_ID = "sprite-wampus";

//============================================
/**
 * Build the wampus `<defs>` markup: a furry rounded body with pointed ears,
 * a muzzle, two gold eyes, and a light keyline halo so the creature reads
 * clearly against the mountain terrain it spawns on (the same "outer
 * silhouette drawn twice" keyline technique sprites_species.ts uses, since a
 * dark-brown body on dark-brown mountain tiles is otherwise a near-hue
 * match).
 *
 * @returns The `<symbol>` markup string for the wampus glyph.
 */
export function buildWampusSpriteDefsMarkup(): string {
  let markup = `<symbol id="${WAMPUS_SYMBOL_ID}" viewBox="0 0 32 32">`;
  // Keyline halo: a wider, light-colored copy of the body silhouette drawn
  // first, so a ~1-2px rim survives underneath the tinted fill on top.
  markup += `<ellipse cx="16" cy="18" rx="13" ry="10.5" fill="${PALETTE.keylineLight}" />`;
  markup += `<polygon points="6,10 10,2 13,11" fill="${PALETTE.keylineLight}" />`;
  markup += `<polygon points="26,10 22,2 19,11" fill="${PALETTE.keylineLight}" />`;
  // Body: a rounded, furry silhouette with two pointed ears/horns.
  markup += `<ellipse cx="16" cy="18" rx="12" ry="9.5" fill="${PALETTE.terrainMountain3}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1.5" />`;
  markup += `<polygon points="7,9.5 10.5,3 12.5,10.5" fill="${PALETTE.terrainMountain3}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1.5" />`;
  markup += `<polygon points="25,9.5 21.5,3 19.5,10.5" fill="${PALETTE.terrainMountain3}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1.5" />`;
  // Muzzle: a lighter rounded snout so the face reads front-on.
  markup += `<ellipse cx="16" cy="23" rx="5.5" ry="4" fill="${PALETTE.terrainMountain2}" stroke="${PALETTE.bgTrackAxis}" stroke-width="1" />`;
  // Fang accents on the muzzle, for a distinct "wild creature" read.
  markup += `<polygon points="13,25 14,29 15,25" fill="${PALETTE.textPrimary}" />`;
  markup += `<polygon points="17,25 18,29 19,25" fill="${PALETTE.textPrimary}" />`;
  // Eyes: two gold dots, matching the original glyph's eye color exactly.
  markup += `<circle cx="11.5" cy="16" r="2.2" fill="${PALETTE.gold}" />`;
  markup += `<circle cx="20.5" cy="16" r="2.2" fill="${PALETTE.gold}" />`;
  markup += "</symbol>";
  return markup;
}
