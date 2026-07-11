// Town camera: a pure horizontal camera for the town street. town_world.ts
// composes a street wider than the viewport (docs/THE_TOWN_ANALYSIS.md
// "Camera contract"), so the renderer needs a world-space-x -> camera-offset
// function to translate the composed street group. This module owns exactly
// that function and nothing else: no DOM, no time, no randomness, no mutable
// state. The scene applies the returned offset as a translate on the
// street group; this module never touches rendering.
//
// The camera never scales the world down to fit a narrow viewport (per the
// contract); it always renders at full scale and scrolls instead. When the
// composed world is no wider than the viewport, there is nothing to scroll:
// the offset is always 0, a valid case handled by the same clamp math below,
// not a special-cased branch.

// ============================================================================
// Soft-zone constants
// ============================================================================

/**
 * Fraction of the viewport width where the middle-third soft zone starts.
 * The avatar is held near the midpoint of [TOWN_CAMERA_SOFT_ZONE_START,
 * TOWN_CAMERA_SOFT_ZONE_END] on screen while the camera is free to scroll
 * (that is, while not clamped at a world edge).
 */
export const TOWN_CAMERA_SOFT_ZONE_START = 1 / 3;

/** Fraction of the viewport width where the middle-third soft zone ends. */
export const TOWN_CAMERA_SOFT_ZONE_END = 2 / 3;

// ============================================================================
// Camera offset
// ============================================================================

//============================================
/**
 * Compute the horizontal camera offset for the town street: the world x that
 * should map to screen x = 0. A pure function of the avatar's world position,
 * the composed world width, and the viewport width -- no previous offset, no
 * time, no randomness, so the same inputs always produce the same output.
 *
 * While the camera is free to scroll (the avatar is not near a world edge),
 * the offset centers the avatar at the midpoint of the middle-third soft
 * zone, so the avatar's on-screen position always falls inside that zone.
 * Near a world edge the offset clamps and the avatar drifts toward the
 * viewport's near edge instead -- expected end-of-street behavior, the same
 * way any side-scrolling camera runs out of world to reveal.
 *
 * When the composed world is no wider than the viewport, the clamp interval
 * collapses to [0, 0] and this function always returns 0: a real, valid
 * no-scroll case, not an error.
 *
 * @param avatarWorldX - The avatar's x position in world coordinates.
 * @param worldWidth - The active mode's composed world width (town_world.ts
 *   `TownStreet.worldWidth`).
 * @param viewportWidth - The current viewport width in the same pixel units.
 * @returns The world x that maps to screen x = 0, clamped to [0, worldWidth -
 *   viewportWidth] (or 0 when that interval is empty).
 */
export function townCameraOffset(
  avatarWorldX: number,
  worldWidth: number,
  viewportWidth: number,
): number {
  const softZoneCenterFraction = (TOWN_CAMERA_SOFT_ZONE_START + TOWN_CAMERA_SOFT_ZONE_END) / 2;
  const rawOffset = avatarWorldX - viewportWidth * softZoneCenterFraction;
  // maxOffset is 0 whenever worldWidth <= viewportWidth, so the clamp below
  // collapses to a fixed 0 without a separate no-scroll branch.
  const maxOffset = Math.max(0, worldWidth - viewportWidth);
  return Math.max(0, Math.min(maxOffset, rawOffset));
}
