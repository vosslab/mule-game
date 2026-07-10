// Overworld placement driver for the browser walkthrough harness. Owns the
// human-seat spatial gesture that turns an adapter-decided
// `place_mule{row,col}` plan into real motion + an action-key press on the
// develop-phase overworld, plus the tick-budget guard that gracefully ends a
// develop turn before its budget expires.
//
// - executePlaceMule paths the overworld avatar to the decided plot cell via
//   walkOverworldAvatarToCell (the adaptive 2D walk in walkthrough_helpers.mjs:
//   seeks one axis at a time off the live data-cell-row/col, halving the tap on
//   an overshoot so a fast speed's >1-cell tap still lands on the target cell
//   instead of oscillating around it). The step each tap comes from
//   firstStepAvoiding (a BFS over overworldObstacles), which routes the walk
//   around the town cell so a target sharing the town's column never walks the
//   avatar back into the town scene (which would unmount the avatar mid-place).
//   Then it presses the action key (Enter, the same binding
//   overworld_scene.tsx's handleActionKey installs). Placement is VERIFIED
//   through the read-only projection, never assumed from the keypress: the
//   target plot must gain a non-null muleOutfit owned by seat 0 AND seat 0's
//   installed-M.U.L.E. count must rise, so a no-op key (wrong cell, unowned
//   plot, nothing carried) surfaces as a reported failure instead of a silent
//   miscount. A verified placement increments report.counters.verifiedPlacements.
//
// - shouldTruncate is a pure guard over the marshalled develop payload's
//   ticksRemaining vs a conservative reserve. maybeTruncateTurn ends the turn
//   whenever the reserve is breached (clicking [data-action="develop-end-turn"]),
//   identical gameplay in every case -- so the economy entering the next auction
//   is unchanged. What the decided plan changes is only the COUNT: a truncation
//   is recorded (and a "develop_plan_truncated" warning logged) only when the cut
//   plan actually commits the budget to a buy/outfit/place gesture
//   (planCommitsBudget) -- real work lost to the clock. A plan that would have
//   ended the turn anyway (gamble_pub, end_turn, or a free hunt_wampus/assay_plot
//   skip) is the develop turn's NATURAL end; ending it a moment early at the
//   reserve is logged at info and NOT counted. The develop AI emits gamble, not a
//   bare end_turn, once out of productive moves (src/ai/develop_ai.ts), so a
//   plan-blind counter miscounted every out-of-work turn as truncated.
//   Truncation is a graceful path, NOT a failure: it never calls report.fail,
//   and "develop_plan_truncated" is deliberately absent from the closed
//   FAILURE_KINDS taxonomy.
//
// `deps = { readProjection(page), ...overrides }` lets the orchestrator inject
// the real projection reader (walkthrough_helpers.mjs's readGameState) and the
// real walk primitive while tests/test_walkthrough_overworld.mjs injects fakes.
// The walk primitive (walkToCell, default walkOverworldAvatarToCell) and the
// standalone cell reader (readOverworldCell) default to the real DOM-driven
// implementations but are override points so the pathing and truncation logic
// stay unit-testable against a fake page.

import {
  directionToward,
  OVERWORLD_AVATAR,
  walkOverworldAvatarToCell,
} from "./walkthrough_helpers.mjs";

/** Seat 0 is always the human seat (matches src/ui/game_driver.ts HUMAN_ID). */
const HUMAN_PLAYER_ID = 0;

/** Action key that installs a carried, outfitted M.U.L.E. (overworld_scene.tsx ACTION_KEYS). */
const ACTION_KEY = "Enter";

/**
 * Ticks-remaining floor below which a fresh develop plan should not be started.
 * A buy/outfit/walk/place cycle drains several real-time ticks; below this
 * reserve the budget can expire mid-cycle, which loses a carried M.U.L.E.
 * (game_state.ts CarriedMule doc). Ending the turn here is graceful, so the
 * floor sits a couple ticks above the cheapest single develop action
 * (ASSAY_TICK_COST = 3). Overridable via deps.truncateReserveTicks.
 */
export const DEVELOP_TRUNCATE_RESERVE_TICKS = 5;

/** Default wall-clock budget for the post-keypress placement verification poll. */
const DEFAULT_PLACE_VERIFY_BUDGET_MS = 5_000;

/** Default poll delay for the placement verification poll. */
const DEFAULT_PLACE_VERIFY_POLL_MS = 100;

//============================================
/**
 * Read the overworld avatar's current grid cell off its live data-cell-row/col
 * attributes, or null when the node is unmounted or not yet carrying cell
 * attributes. Resolves the node fresh each call so a scene remount never leaves
 * a stale handle. Exported so it is both the default cell reader executePlaceMule
 * injects and a directly testable seam.
 *
 * @param page - The Playwright page.
 * @returns `{ row, col }` numeric cell, or null.
 */
export async function readOverworldCell(page) {
  const handle = await page.$(OVERWORLD_AVATAR);
  if (handle === null) {
    return null;
  }
  const row = await handle.getAttribute("data-cell-row");
  const col = await handle.getAttribute("data-cell-col");
  if (row === null || col === null) {
    return null;
  }
  return { row: Number(row), col: Number(col) };
}

//============================================
/**
 * Arrival predicate for overworld pathing: true once the avatar's live cell
 * equals `target`. Reads the cell fresh each call through `readCell` so it stays
 * a stationary check between bounded taps.
 *
 * @param target - `{ row, col }` destination cell.
 * @param readCell - Cell reader `(page) => Promise<{row,col}|null>`.
 * @returns A `(page) => Promise<boolean>` predicate.
 */
export function overworldArrived(target, readCell) {
  return async (page) => {
    const current = await readCell(page);
    return current !== null && current.row === target.row && current.col === target.col;
  };
}

//============================================
/**
 * Direction provider for overworld pathing: read the avatar's live cell and
 * return the arrow key stepping one cell toward `target` (columns before rows,
 * per directionToward), or null when the avatar is unmounted or already on the
 * target cell. A null return lets walkTo classify an unreachable target as a
 * stall rather than spinning.
 *
 * @param target - `{ row, col }` destination cell.
 * @param readCell - Cell reader `(page) => Promise<{row,col}|null>`.
 * @returns A `(page) => Promise<string|null>` direction provider.
 */
export function overworldHeading(target, readCell) {
  return async (page) => {
    const current = await readCell(page);
    if (current === null) {
      return null;
    }
    return directionToward(current, target);
  };
}

//============================================
/**
 * Look up the plot at a cell in a marshalled/projected state, or null when the
 * cell is out of range.
 *
 * @param state - The projection's `state` field (engine GameState shape).
 * @param cell - `{ row, col }` cell to read.
 * @returns The Plot object, or null.
 */
function plotAt(state, cell) {
  return state.plots[cell.row]?.[cell.col] ?? null;
}

//============================================
/**
 * The four cardinal steps as `[dRow, dCol, arrowKey]`, listed in the
 * column-before-row order directionToward tie-breaks on, so a BFS that expands
 * neighbors in this order reproduces directionToward's straight paths on an
 * obstacle-free board and only detours when an obstacle forces it.
 */
const OVERWORLD_STEPS = [
  [0, 1, "ArrowRight"],
  [0, -1, "ArrowLeft"],
  [1, 0, "ArrowDown"],
  [-1, 0, "ArrowUp"],
];

//============================================
/**
 * The grid extent and the set of blocked (town) cells for overworld pathing,
 * derived from a marshalled state. The town cell is the only terrain that
 * unmounts the overworld avatar when stepped on (overworld_scene.tsx updateCell
 * calls onEnterTown), so the place walk must route around it.
 *
 * @param state - The projection's `state` field (engine GameState shape).
 * @returns `{ bounds: { rows, cols }, blocked: Set<string> }` where blocked
 *   holds "row,col" keys of every town cell.
 */
export function overworldObstacles(state) {
  const rows = state.plots.length;
  const cols = rows === 0 ? 0 : state.plots[0].length;
  const blocked = new Set();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (state.plots[row][col].terrain === "town") {
        blocked.add(`${row},${col}`);
      }
    }
  }
  return { bounds: { rows, cols }, blocked };
}

//============================================
/**
 * Arrow key for the first step of a shortest 4-neighbor path from `current` to
 * `target` on a `bounds.rows` x `bounds.cols` grid, routing around every cell in
 * `blocked` (breadth-first search). This keeps the overworld place walk from
 * stepping onto the town cell -- a straight columns-before-rows step would walk
 * the avatar back onto a town that shares the target's column and re-enter it.
 * Returns null when already on the target or when no unblocked path exists.
 *
 * @param current - `{ row, col }` start cell.
 * @param target - `{ row, col }` goal cell.
 * @param blocked - Set of "row,col" keys the path must avoid (the target is
 *   never treated as blocked even if it appears in the set).
 * @param bounds - `{ rows, cols }` grid extent.
 * @returns An arrow-key name for the first step, or null.
 */
export function firstStepAvoiding(current, target, blocked, bounds) {
  if (current.row === target.row && current.col === target.col) {
    return null;
  }
  const cellKey = (row, col) => `${row},${col}`;
  const inBounds = (row, col) => row >= 0 && row < bounds.rows && col >= 0 && col < bounds.cols;
  // Each visited cell records the arrow key of the FIRST step from `current`
  // that reaches it, so the goal hands back the move to make right now.
  const firstKeyTo = new Map();
  const visited = new Set([cellKey(current.row, current.col)]);
  const queue = [];
  const consider = (row, col, firstArrow) => {
    if (!inBounds(row, col)) {
      return;
    }
    const key = cellKey(row, col);
    if (visited.has(key)) {
      return;
    }
    const isTarget = row === target.row && col === target.col;
    if (!isTarget && blocked.has(key)) {
      return;
    }
    visited.add(key);
    firstKeyTo.set(key, firstArrow);
    queue.push({ row, col });
  };
  // Seed the queue with the immediate neighbors, tagging each with its own move.
  for (const [dRow, dCol, arrow] of OVERWORLD_STEPS) {
    consider(current.row + dRow, current.col + dCol, arrow);
  }
  let head = 0;
  while (head < queue.length) {
    const pos = queue[head];
    head += 1;
    if (pos.row === target.row && pos.col === target.col) {
      return firstKeyTo.get(cellKey(pos.row, pos.col));
    }
    const firstArrow = firstKeyTo.get(cellKey(pos.row, pos.col));
    for (const [dRow, dCol] of OVERWORLD_STEPS) {
      consider(pos.row + dRow, pos.col + dCol, firstArrow);
    }
  }
  return null;
}

//============================================
/**
 * Count the installed M.U.L.E.s a player owns: plots whose owner is `playerId`
 * and which carry a non-null muleOutfit (game_state.ts Plot doc). The engine
 * tracks placement per plot, not on the player record, so this derived count is
 * the projection-side signal a placement actually landed.
 *
 * @param state - The projection's `state` field.
 * @param playerId - The owning player id to count for.
 * @returns The number of outfitted plots owned by that player.
 */
function placedMuleCount(state, playerId) {
  let count = 0;
  for (const row of state.plots) {
    for (const plot of row) {
      if (plot.owner === playerId && plot.muleOutfit !== null) {
        count += 1;
      }
    }
  }
  return count;
}

//============================================
/**
 * Press the action key on the current cell and verify a M.U.L.E. was installed
 * on the target plot through the read-only projection: the plot must become
 * owned by seat 0 with a non-null muleOutfit AND seat 0's installed-M.U.L.E.
 * count must rise (the count guard rejects a plot that already held a M.U.L.E.,
 * where the key is a no-op). A verified placement increments
 * report.counters.verifiedPlacements; a budget-exhausted verification reports
 * the closed "act_did_not_advance" failureKind.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param readProjection - `deps.readProjection`.
 * @param target - `{ row, col }` plot cell to place on.
 * @param actionKey - Key that installs the M.U.L.E. (default "Enter").
 * @param budgetMs - Wall-clock budget for the verification poll.
 * @param pollIntervalMs - Delay between verification polls.
 * @returns True once a placement was verified, false on budget exhaustion.
 */
async function verifyPlacement(
  page,
  report,
  readProjection,
  target,
  actionKey,
  budgetMs,
  pollIntervalMs,
) {
  const before = await readProjection(page);
  const beforeCount = placedMuleCount(before.state, HUMAN_PLAYER_ID);
  await page.keyboard.press(actionKey);
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const projection = await readProjection(page);
    const plot = plotAt(projection.state, target);
    const count = placedMuleCount(projection.state, HUMAN_PLAYER_ID);
    if (
      plot !== null &&
      plot.owner === HUMAN_PLAYER_ID &&
      plot.muleOutfit !== null &&
      count > beforeCount
    ) {
      report.counters.verifiedPlacements += 1;
      report.log(
        "info",
        `verified place_mule at (${target.row}, ${target.col}); outfit ${plot.muleOutfit}`,
        { verifiedPlacements: report.counters.verifiedPlacements },
      );
      return true;
    }
    await page.waitForTimeout(pollIntervalMs);
  }
  report.fail(
    "act_did_not_advance",
    `place_mule at (${target.row}, ${target.col}) action key did not install a M.U.L.E. within budget`,
  );
  return false;
}

//============================================
/**
 * Drive the human seat's `place_mule{row,col}` plan on the overworld: path the
 * avatar to the plot cell, then press the action key and verify the placement
 * through the projection. Returns early (without throwing) if the walk stalls
 * (walkTo already recorded "walk_stall") or the placement never verifies.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param deps - `{ readProjection(page), walkToCell, actionKey, walkBudget,
 *   walkTapMs, placeVerifyBudgetMs, placeVerifyPollIntervalMs }`. Only
 *   `readProjection` is required; the rest default to the real DOM-driven
 *   implementations and this module's constants. `walkToCell` is the injectable
 *   pathing primitive (default the adaptive walkOverworldAvatarToCell).
 * @param target - The `place_mule` plan's `{ row, col }` plot cell.
 * @returns True once a placement was verified, false on stall or non-verify.
 */
export async function executePlaceMule(page, report, deps, target) {
  const {
    readProjection,
    walkToCell = walkOverworldAvatarToCell,
    actionKey = ACTION_KEY,
    walkBudget,
    walkTapMs,
    placeVerifyBudgetMs = DEFAULT_PLACE_VERIFY_BUDGET_MS,
    placeVerifyPollIntervalMs = DEFAULT_PLACE_VERIFY_POLL_MS,
  } = deps;
  // Read the board once up front so the walk can route around the town cell
  // (stepping onto it re-enters the town scene and unmounts the avatar).
  const { bounds, blocked } = overworldObstacles((await readProjection(page)).state);
  const reached = await walkToCell(page, report, target, {
    budget: walkBudget,
    tapMs: walkTapMs,
    failureMessage: `overworld avatar never reached plot (${target.row}, ${target.col}) to place a M.U.L.E.`,
    nextStep: (current) => firstStepAvoiding(current, target, blocked, bounds),
  });
  if (!reached) {
    // walkToCell already recorded the walk_stall failure; nothing further to press.
    return false;
  }
  return verifyPlacement(
    page,
    report,
    readProjection,
    target,
    actionKey,
    placeVerifyBudgetMs,
    placeVerifyPollIntervalMs,
  );
}

//============================================
/**
 * Whether the develop turn is close enough to tick-budget exhaustion that a
 * fresh plan should not be started. Pure: reads only the develop payload's
 * ticksRemaining against `reserve`, and reports false for any non-develop phase
 * (nothing to truncate). Kept exported so the guard threshold is unit-testable
 * on its own.
 *
 * @param state - The projection's `state` field (engine GameState shape).
 * @param reserve - Ticks-remaining floor (default DEVELOP_TRUNCATE_RESERVE_TICKS).
 * @returns True when ticksRemaining is at or below the reserve during develop.
 */
export function shouldTruncate(state, reserve = DEVELOP_TRUNCATE_RESERVE_TICKS) {
  const phase = state.phase;
  if (phase.kind !== "develop") {
    return false;
  }
  return phase.payload.ticksRemaining <= reserve;
}

//============================================
/**
 * Whether a decided develop plan commits the tick budget to a buy/outfit/place
 * M.U.L.E. gesture -- the only plans whose start the tick-budget reserve
 * guards, because each drains several real-time ticks and abandoning one
 * mid-cycle loses a carried M.U.L.E. (game_state.ts CarriedMule doc).
 *
 * The plans that are NOT committing are the develop turn's natural ends:
 * gamble_pub and end_turn end the turn outright, and the walker resolves the
 * opportunistic hunt_wampus/assay_plot skips by ending the turn too. The
 * develop AI emits `gamble`, never `end_turn`, when it has nothing productive
 * left (src/ai/develop_ai.ts), so gamble_pub -- not end_turn -- is the common
 * natural end; treating it as committing would miscount every out-of-work turn
 * as a truncation. Kept exported so the classification is unit-testable.
 *
 * @param plan - A decided develop plan (walkthrough_strategy.mjs PLAN_KINDS).
 * @returns True for buy_mule/outfit_mule/place_mule, false for every other kind.
 */
export function planCommitsBudget(plan) {
  return plan.kind === "buy_mule" || plan.kind === "outfit_mule" || plan.kind === "place_mule";
}

//============================================
/**
 * Tick-budget guard. When the develop turn's remaining ticks have dropped to
 * the reserve, end the turn gracefully by clicking
 * [data-action="develop-end-turn"] and return true so the caller loop stops --
 * exactly as the guard has always done, and identical gameplay either way (the
 * turn ends here rather than running its next gesture, so a low-budget gamble is
 * not walked out and the economy entering the next auction is unchanged from the
 * pre-guard-decides behavior).
 *
 * The ONLY thing the decided plan changes is the COUNT. A truncation is counted
 * (and a "develop_plan_truncated" warning logged) only when the plan the guard
 * cut off actually commits the budget to a buy/outfit/place gesture
 * (planCommitsBudget) -- real economic work abandoned for lack of ticks. A plan
 * that would have ended the turn anyway (gamble_pub, end_turn, or a free
 * hunt_wampus/assay_plot skip) is the turn's natural end; ending it a moment
 * early at the reserve is not a truncation, so it is logged at info and not
 * counted. The develop AI emits `gamble`, never a bare end_turn, once it is out
 * of productive moves (src/ai/develop_ai.ts), so without this split every
 * out-of-work turn was miscounted as truncated.
 *
 * Truncation is never a failure -- this deliberately calls report.log, not
 * report.fail.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param deps - `{ truncateReserveTicks }`; the reserve floor is optional and
 *   defaults to DEVELOP_TRUNCATE_RESERVE_TICKS.
 * @param plan - The plan just decided for this loop iteration.
 * @param state - The marshalled develop GameState the plan was decided from
 *   (same read, so the tick check matches the decision).
 * @returns True once the turn was ended at the budget floor, false when the
 *   plan should run.
 */
export async function maybeTruncateTurn(page, report, deps, plan, state) {
  const { truncateReserveTicks = DEVELOP_TRUNCATE_RESERVE_TICKS } = deps;
  if (!shouldTruncate(state, truncateReserveTicks)) {
    return false;
  }
  await page.click('[data-action="develop-end-turn"]');
  const phase = state.phase;
  const ticksRemaining = phase.kind === "develop" ? phase.payload.ticksRemaining : null;
  if (!planCommitsBudget(plan)) {
    // The turn was going to end on this plan anyway; ending it at the reserve
    // is the natural close, not a truncation. Logged for visibility, not counted.
    report.log("info", "develop_turn_ended_at_budget_floor", {
      ticksRemaining,
      reserve: truncateReserveTicks,
      planKind: plan.kind,
    });
    return true;
  }
  report.counters.truncatedTurns += 1;
  report.log("warn", "develop_plan_truncated", {
    ticksRemaining,
    reserve: truncateReserveTicks,
    truncatedTurns: report.counters.truncatedTurns,
    planKind: plan.kind,
  });
  return true;
}
