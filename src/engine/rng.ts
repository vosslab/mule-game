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

/**
 * Draw one sample from an approximately-standard-normal distribution (mean 0,
 * standard deviation 1) by summing twelve uniform `[0, 1)` draws and
 * subtracting six. This is the central-limit approximation the store's
 * smithore price jitter uses; the sum of twelve uniforms has mean 6 and
 * variance 1, so subtracting 6 centers it on 0 with unit variance. Output is
 * bounded to `[-6, 6)`.
 *
 * Advances the generator by exactly twelve steps, so callers threading a
 * serialized `rngState` must capture `getState()` afterward.
 *
 * Source: `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/MuleMath.java`
 * lines 50-56, `normalDistributed(Random)`: `for (i=0; i<12; i++) f +=
 * random.nextFloat(); return f - 6.0f`.
 *
 * @param rng - Seeded generator to draw from (advanced by twelve steps).
 * @returns A sample in `[-6, 6)`, mean 0, standard deviation 1.
 */
export function normalDistributed(rng: Rng): number {
  let sum = 0;
  for (let draw = 0; draw < 12; draw += 1) {
    sum += rng.next();
  }
  return sum - 6;
}
