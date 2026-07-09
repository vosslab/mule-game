// Pure motion helpers for the spatial auction scene.
//
// The auction scene is presentation-only: the engine owns every participant's
// price, and each avatar's vertical position is DERIVED from that price via
// `priceToTrackY`. Between engine ticks the rendered position is eased toward
// its price-derived target with `easeToward`, one animation frame at a time, so
// the avatars glide instead of snapping. Keeping the math here (DOM-free, pure)
// lets the scene component focus on wiring refs and the frame loop, and lets the
// easing be unit-tested without a browser.

/**
 * Map a price within a good's band to a y coordinate on the vertical price
 * track. The band floor sits at the bottom of the track (largest y) and the
 * ceiling at the top (y = 0), so a rising price walks an avatar upward, matching
 * the original M.U.L.E. auction where buyers raise their bid by walking up. The
 * fraction is clamped to `[0, 1]` so an out-of-band price never places an avatar
 * off the track, and a degenerate band (ceiling <= floor) centers everything so
 * a zero-width band never divides by zero.
 *
 * @param price - Price to place.
 * @param priceFloor - Band floor (the store's buy quote for the good).
 * @param priceCeiling - Band ceiling (the store's sell quote for the good).
 * @param trackHeight - Height of the price track in SVG units.
 * @returns The y coordinate in track units.
 */
export function priceToTrackY(
  price: number,
  priceFloor: number,
  priceCeiling: number,
  trackHeight: number,
): number {
  const span = priceCeiling - priceFloor;
  if (span <= 0) {
    return trackHeight / 2;
  }
  const fraction = (price - priceFloor) / span;
  const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  const y = trackHeight - clamped * trackHeight;
  return y;
}

/**
 * Ease a current value a fraction of the way toward a target for one animation
 * frame of length `deltaSeconds`, at `ratePerSecond`. The step fraction is
 * capped at 1 so a long frame (a backgrounded tab regaining focus) snaps to the
 * target rather than overshooting past it. Once within `epsilon` of the target
 * the target is returned exactly, so motion terminates cleanly instead of
 * creeping forever.
 *
 * @param current - The current eased value.
 * @param target - The value to move toward.
 * @param deltaSeconds - Length of this frame in seconds.
 * @param ratePerSecond - Easing rate; larger converges faster.
 * @param epsilon - Snap-to-target threshold.
 * @returns The eased value for this frame.
 */
export function easeToward(
  current: number,
  target: number,
  deltaSeconds: number,
  ratePerSecond: number,
  epsilon: number,
): number {
  const diff = target - current;
  if (Math.abs(diff) <= epsilon) {
    return target;
  }
  const step = Math.min(1, deltaSeconds * ratePerSecond);
  const next = current + diff * step;
  return next;
}
