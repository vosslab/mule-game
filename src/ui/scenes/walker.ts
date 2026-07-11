// Pure avatar kinematics for the walkable overworld.
//
// DOM-free and framework-free by design: this module is the geometry/motion
// core the OverworldScene's rAF loop calls into each frame, and the node tests
// (tests/test_walker.mjs) exercise it directly without a browser. It owns four
// jobs, all pure: turn a held-key set into a movement direction, integrate the
// avatar's pixel position one frame (with a per-cell obstacle slowdown and an
// AABB clamp to the board bounds), derive the avatar's grid cell from its pixel
// position, and advance a towed follower (the bought M.U.L.E.) that trails the
// avatar on a fixed slack.
//
// Coordinate space: the walker works in a pixel space where every board cell is
// WALKER_CELL_PX square, so the whole board is `cols * WALKER_CELL_PX` wide by
// `rows * WALKER_CELL_PX` tall. Cell derivation is `floor(px / WALKER_CELL_PX)`.
// The scene renders an overlay SVG with a matching `cols*CELL x rows*CELL`
// viewBox, so this space maps straight onto the rendered board.

/** A 2D point or vector in walker pixel space. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** A grid cell position derived from a pixel position. */
export interface Cell {
  readonly row: number;
  readonly col: number;
}

/** The board's pixel extent: total width and height in walker pixel space. */
export interface Bounds {
  readonly width: number;
  readonly height: number;
}

/** Which of the four cardinal directions are currently held. */
export interface HeldDirections {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

/**
 * Pixel size of one board cell in walker space. The plan specifies 64px tiles
 * for the overworld; the scene's overlay SVG uses a matching per-cell size so
 * pixel positions here map directly onto rendered cells.
 * Source: mule_fidelity_plan.md's task ("64px tiles").
 */
export const WALKER_CELL_PX = 64;

/**
 * Avatar ground speed in pixels per second on open (non-obstacle) terrain, the
 * land-movement analog. planet_mule drives avatar motion off its Properties
 * movement-speed fields; the original 80 px/s mapping (a little under one
 * tile per second at 1x) is this engine's land-speed analog of that source.
 * Source: planet_mule Properties movement speed (land analog); mapped by
 * mule_fidelity_plan.md's task ("Speed: 80 px/s land analog (PM Properties)").
 *
 * Recalibrated (2026-07-10) from 80 to 320: a food-starved develop
 * turn's tick budget (`DEVELOP_TICKS_MIN` = 5 ticks) is a GAMEPLAY TIMING
 * constraint the walk speed must fit inside, and the corral purchase panel
 * (walk-in -> confirm -> dismiss -> walk-back-to-street) and the
 * no-longer-turn-ending hunt_wampus/assay_plot develop plans both added
 * real wall-clock to the develop-turn errand since the original 80 px/s
 * mapping was chosen. Measured against the real browser at `?speed=1`, seed
 * 33, far-corner target plot (docs/active_plans/audits/mule_trip_timing.md):
 * 80/120/160/240/280 all measured well under the required 10% margin against
 * the 4.75s starved-min budget (240 and 280 already crossed into failure);
 * 320 is the lowest tested value that cleared the 10% margin, averaging
 * ~11% margin over 5 runs (one run at 9.5%, noise-bound around the 10%
 * line); 340+ started failing the walk-in door-reach reliability check
 * itself (a `walk_stall`, worse than a thin timing margin) because
 * `WALK_TAP_MS` (`tests/e2e/walkthrough_helpers.mjs`) is a fixed 120ms tap
 * length outside this package's touch points -- widening the timing margin
 * further needs that constant retuned too (see the follow-on note in
 * docs/active_plans/audits/mule_trip_timing.md), not another walker-speed
 * increase.
 */
export const WALKER_SPEED_PX_PER_SEC = 320;

/**
 * Multiplier applied to the avatar's speed while it stands on a mountain cell,
 * so rough terrain slows the walk. planet_mule slows avatars on obstacle tiles
 * by its `obstacleMovingSpeedFactor`; mountains are this engine's obstacle
 * terrain.
 * Source: planet_mule Properties `obstacleMovingSpeedFactor`;
 * mule_fidelity_plan.md's task ("per-cell obstacle slowdown factor (0.4 on
 * mountains ...)").
 */
export const MOUNTAIN_SLOWDOWN_FACTOR = 0.4;

/**
 * Distance (in walker pixels) a towed M.U.L.E. trails behind the avatar. The
 * follower holds this slack: it only moves once the avatar pulls farther than
 * this away, then catches up to sit exactly this far behind. Roughly two-thirds
 * of a cell reads as "on a lead" without overlapping the avatar sprite.
 */
export const TOW_FOLLOW_DISTANCE = 40;

//============================================
/**
 * Turn a held-key set into a unit movement direction. Opposing keys cancel;
 * a diagonal is normalized to unit length so diagonal motion is not faster
 * than cardinal motion. Returns the zero vector when no net direction is held.
 *
 * @param held - Which cardinal directions are currently pressed.
 * @returns A direction vector of length 0 (idle) or 1 (moving).
 */
export function directionFromKeys(held: HeldDirections): Vec2 {
  const dx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  const dy = (held.down ? 1 : 0) - (held.up ? 1 : 0);
  if (dx === 0 && dy === 0) {
    return { x: 0, y: 0 };
  }
  const length = Math.hypot(dx, dy);
  return { x: dx / length, y: dy / length };
}

//============================================
/**
 * The speed multiplier for a terrain: mountains slow the avatar, every other
 * terrain moves at full speed. Accepts a plain terrain string so the walker
 * stays decoupled from the engine's `Terrain` union and easy to node-test.
 *
 * @param terrain - The terrain name of the avatar's current cell.
 * @returns `MOUNTAIN_SLOWDOWN_FACTOR` on a mountain, `1` otherwise.
 */
export function slowdownForTerrain(terrain: string): number {
  return terrain.startsWith("mountain") ? MOUNTAIN_SLOWDOWN_FACTOR : 1;
}

//============================================
/**
 * Clamp a pixel position so the avatar's center stays within `margin` pixels of
 * every board edge (an axis-aligned bounding-box clamp). Keeps the avatar
 * sprite fully on the board rather than half off an edge.
 *
 * @param position - The unclamped avatar center.
 * @param bounds - The board's pixel extent.
 * @param margin - Minimum distance to keep from each edge.
 * @returns The position clamped inside the board.
 */
export function clampToBounds(position: Vec2, bounds: Bounds, margin: number): Vec2 {
  const x = clamp(position.x, margin, bounds.width - margin);
  const y = clamp(position.y, margin, bounds.height - margin);
  return { x, y };
}

//============================================
/**
 * Derive the grid cell containing a pixel position: `floor(px / WALKER_CELL_PX)`
 * on each axis. Positions on the board always fall inside `[0, cols)` x
 * `[0, rows)` because the caller clamps the avatar inside the bounds first.
 *
 * @param position - A pixel position in walker space.
 * @param cellPx - Pixel size of one cell (defaults to `WALKER_CELL_PX`).
 * @returns The row/col of the cell the position lies in.
 */
export function cellFromPosition(position: Vec2, cellPx: number = WALKER_CELL_PX): Cell {
  const row = Math.floor(position.y / cellPx);
  const col = Math.floor(position.x / cellPx);
  return { row, col };
}

//============================================
/**
 * Integrate the avatar's position one frame: move `direction` by
 * `speed * slowdown * dtSeconds` pixels, then clamp back inside the board. A
 * zero direction leaves the position unchanged (aside from the clamp).
 *
 * @param position - Current avatar center.
 * @param direction - Unit movement direction (from `directionFromKeys`).
 * @param speed - Base speed in pixels per second (already scene-speed scaled).
 * @param slowdown - Terrain speed multiplier (from `slowdownForTerrain`).
 * @param dtSeconds - Elapsed real time this frame, in seconds.
 * @param bounds - The board's pixel extent.
 * @param margin - Edge margin passed through to the bounds clamp.
 * @returns The next avatar center, clamped inside the board.
 */
export function stepPosition(
  position: Vec2,
  direction: Vec2,
  speed: number,
  slowdown: number,
  dtSeconds: number,
  bounds: Bounds,
  margin: number,
): Vec2 {
  const distance = speed * slowdown * dtSeconds;
  const moved = { x: position.x + direction.x * distance, y: position.y + direction.y * distance };
  return clampToBounds(moved, bounds, margin);
}

//============================================
/**
 * Advance a towed follower one frame. The follower keeps `followDistance` of
 * slack: while it is already that close (or closer) to the leader it does not
 * move, so a stationary or gently-moving avatar leaves the M.U.L.E. resting
 * behind it. Once the leader pulls farther away, the follower closes the gap by
 * up to `catchUpSpeed * dtSeconds` pixels, never overshooting past the slack
 * distance. Repeatedly stepping toward a fixed leader converges the follower to
 * exactly `followDistance` away and never nearer, which the node test asserts.
 *
 * @param follower - Current follower position (the towed M.U.L.E.).
 * @param leader - Current leader position (the avatar).
 * @param dtSeconds - Elapsed real time this frame, in seconds.
 * @param followDistance - Slack distance the follower trails at.
 * @param catchUpSpeed - Max pixels per second the follower may close the gap.
 * @returns The next follower position.
 */
export function stepTowFollower(
  follower: Vec2,
  leader: Vec2,
  dtSeconds: number,
  followDistance: number,
  catchUpSpeed: number,
): Vec2 {
  const dx = leader.x - follower.x;
  const dy = leader.y - follower.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= followDistance) {
    return follower;
  }
  // Close the gap down toward the slack distance, capped by this frame's travel.
  const gap = distance - followDistance;
  const travel = Math.min(gap, catchUpSpeed * dtSeconds);
  return { x: follower.x + (dx / distance) * travel, y: follower.y + (dy / distance) * travel };
}

//============================================
/**
 * The pixel center of a grid cell, used to spawn or snap the avatar/follower to
 * a cell.
 *
 * @param cell - The target cell.
 * @param cellPx - Pixel size of one cell (defaults to `WALKER_CELL_PX`).
 * @returns The cell's center in walker pixel space.
 */
export function cellCenter(cell: Cell, cellPx: number = WALKER_CELL_PX): Vec2 {
  return { x: (cell.col + 0.5) * cellPx, y: (cell.row + 0.5) * cellPx };
}

//============================================
/**
 * Grid (Manhattan) distance between two cells: the number of orthogonal
 * steps separating them. Used for "walk-adjacent" proximity checks (for
 * example the wampus hunt trigger) where the avatar's own
 * cell and its four orthogonal neighbors all count as adjacent (distance <= 1).
 *
 * @param a - First cell.
 * @param b - Second cell.
 * @returns `|a.row - b.row| + |a.col - b.col|`.
 */
export function manhattanDistance(a: Cell, b: Cell): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

//============================================
/**
 * Clamp `value` into the inclusive `[min, max]` range. When `min > max` (a board
 * narrower than twice the margin) the lower bound wins, keeping the result
 * finite and centered rather than NaN.
 *
 * @param value - Value to clamp.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns The clamped value.
 */
function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
