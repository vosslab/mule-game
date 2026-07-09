/**
 * Seeded pseudo-random number generator for the M.U.L.E. engine.
 *
 * Uses the mulberry32 algorithm: a fast 32-bit PRNG whose entire state is a
 * single unsigned 32-bit integer. This makes the state trivially serializable
 * (it is just a number) and guarantees that two generators created from the
 * same seed produce the same sequence, which the engine relies on for
 * reproducible games and replay.
 *
 * The engine is a pure-function engine: nothing here touches the DOM, the
 * clock, or global mutable state beyond the accumulator captured in the
 * returned closure.
 */

/**
 * A seeded generator. `next()` mutates the internal accumulator and returns a
 * float in the half-open range [0, 1). `getState()` returns the current
 * accumulator so callers can serialize it and later resume the exact sequence
 * by passing it back to `createRng`.
 */
export interface Rng {
  /** Return the next float in [0, 1) and advance the internal state. */
  next(): number;
  /** Return an integer in [0, maxExclusive) drawn from `next()`. */
  nextInt(maxExclusive: number): number;
  /** Return the current serializable accumulator (an unsigned 32-bit int). */
  getState(): number;
}

/**
 * Create a seeded generator. Pass a raw seed for a fresh game, or a value
 * previously returned by `getState()` to resume an in-progress sequence.
 *
 * @param seedOrState - Initial 32-bit accumulator value.
 * @returns A generator with the same-seed-same-sequence guarantee.
 */
export function createRng(seedOrState: number): Rng {
  // Single 32-bit accumulator holds the entire generator state.
  let accumulator = seedOrState >>> 0;

  const next = (): number => {
    // mulberry32 mixing step.
    accumulator = (accumulator + 0x6d2b79f5) | 0;
    let t = Math.imul(accumulator ^ (accumulator >>> 15), 1 | accumulator);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    // Convert the mixed 32-bit value to a float in [0, 1).
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (maxExclusive: number): number => {
    // Floor of a [0, 1) draw scaled to the requested range.
    return Math.floor(next() * maxExclusive);
  };

  const getState = (): number => {
    return accumulator >>> 0;
  };

  return { next, nextInt, getState };
}
