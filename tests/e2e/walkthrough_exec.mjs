// Generic plan-kind dispatcher for the browser walkthrough harness.
//
// Every strategy-adapter decide* wrapper (walkthrough_strategy.mjs) emits a
// gesture plan whose `kind` is drawn from the closed PLAN_KINDS vocabulary.
// executePlan is the one place that checks a plan against that vocabulary
// before routing it to a caller-supplied handler, so an out-of-taxonomy plan
// kind (a drift bug between a decide* wrapper and PLAN_KINDS) is caught and
// reported the same way everywhere it might occur, instead of each call site
// re-implementing its own membership check.
//
// Kept separate from walkthrough_land.mjs / walkthrough_auction.mjs (each
// owns its own driver): those two already loop and dispatch on plan.kind
// internally for the phases they own, and are not touched here. executePlan
// exists for orchestrator-level call sites in e2e_walkthrough.mjs that need
// the same guard, and for the negative-path unit test
// (tests/test_walkthrough_plan_exec.mjs) to exercise the unknown_plan_kind
// failure path without a live browser -- e2e_walkthrough.mjs itself cannot be
// imported for that purpose, since its module body runs the harness at
// import time. runActivePhaseDriver below (the orchestrator's real call
// site) lives here for the same import-safety reason: it needs to be
// unit-testable without triggering e2e_walkthrough.mjs's `await main()`.

import { PLAN_KINDS } from "./walkthrough_strategy.mjs";

//============================================
/**
 * Route one gesture plan to its matching handler, failing through the report
 * when the plan's kind is not in the closed PLAN_KINDS vocabulary.
 *
 * @param plan - A gesture plan produced by a walkthrough_strategy.mjs decide*
 *   wrapper (or, in tests, a fabricated plan-shaped object).
 * @param report - The walk report (see walkthrough_report.mjs); report.fail
 *   records the unknown_plan_kind failure.
 * @param handlers - Map of plan.kind -> handler(plan), covering every
 *   PLAN_KINDS value this call site is prepared to act on.
 * @returns The handler's return value, or undefined when the plan was
 *   rejected as unknown.
 */
export async function executePlan(plan, report, handlers) {
  if (!PLAN_KINDS.includes(plan.kind)) {
    report.fail(
      "unknown_plan_kind",
      `plan kind "${plan.kind}" is not a recognized PLAN_KINDS value`,
    );
    return undefined;
  }
  const handler = handlers[plan.kind];
  if (handler === undefined) {
    // A recognized kind with no registered handler is a caller bug (a call
    // site forgot to cover a PLAN_KINDS value it claims to drive), not an
    // out-of-taxonomy plan, so this stays a thrown error rather than a
    // reported run failure.
    throw new Error(`executePlan: no handler registered for plan kind "${plan.kind}"`);
  }
  return handler(plan);
}

//============================================
/**
 * The exit-code decision e2e_walkthrough.mjs's main() applies to a written
 * report: nonzero once any failure was recorded. Extracted here so the
 * negative-path unit test can assert "exits nonzero" against the same rule
 * the CLI uses, without spawning the full harness.
 *
 * @param failure - The `failure` field of a written playthrough_report.json
 *   (null on a clean run, `{ failureKind, message }` otherwise).
 * @returns 0 when failure is null, 1 otherwise.
 */
export function exitCodeForFailure(failure) {
  return failure === null ? 0 : 1;
}

/**
 * Matches the "unexpected plan kind" throw shape driveLandGrant and
 * driveLandAuction (walkthrough_land.mjs) both use when the seat-0 strategy
 * adapter drifts outside PLAN_KINDS. driveAuction's own throw (exceeding its
 * tick ceiling) uses different wording and is not matched here, so it still
 * propagates as an uncaught error rather than being misclassified.
 */
const UNEXPECTED_PLAN_KIND_PATTERN = /unexpected plan kind "([^"]+)"/;

//============================================
/**
 * Call an active-mode phase driver (e2e_walkthrough.mjs's
 * ACTIVE_PHASE_DRIVERS), reclassifying an "unexpected plan kind" throw
 * (walkthrough_land.mjs's own guard against a seat-0 strategy adapter
 * drifting outside PLAN_KINDS) into a real unknown_plan_kind report failure
 * via executePlan, instead of letting it escape as an uncaught error. This
 * is the seam that owns that classification: the drivers in
 * walkthrough_land.mjs/walkthrough_auction.mjs are not edited to route
 * through executePlan directly, so each driver keeps
 * its own defensive throw and this wrapper -- the orchestrator's call site
 * -- extracts the offending kind and routes it through executePlan, the
 * same closed-taxonomy check the negative-path unit test exercises
 * directly. Any other thrown error (for example driveAuction's tick-ceiling
 * guard) is not a plan-kind issue and is re-thrown unchanged.
 *
 * @param driver - One of ACTIVE_PHASE_DRIVERS's driver functions,
 *   `(page, report, deps) => Promise<void>`.
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param deps - The driver's deps object (ACTIVE_DRIVER_DEPS).
 */
export async function runActivePhaseDriver(driver, page, report, deps) {
  try {
    await driver(page, report, deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = UNEXPECTED_PLAN_KIND_PATTERN.exec(message);
    if (match === null) {
      throw error;
    }
    await executePlan({ kind: match[1] }, report, {});
  }
}

//============================================
/**
 * Enforce the active-participation invariants once a run reached scoring
 * cleanly: every completed human develop turn should correspond to a round
 * reached, and -- for any run where the human ever held a buyer/seller role
 * in a goods auction -- participation must be proven for at least one such
 * window: the human held the role AND (the driver pushed at least one
 * non-hold intent click while holding it, OR the window actually cleared a
 * trade for the human, i.e. its recorded `humanGoodsDelta` is nonzero).
 * Both are genuine engagement, not a stuck driver: real seed 3 evidence
 * showed a held "seller" window trade clearing at the engine's
 * auto-assigned opening price with zero intent pushes needed
 * (`desiredIntent` in src/ai/auction_ai.ts already matched the target from
 * tick 0), so requiring a pushed intent alone was too narrow. A blanket
 * trades>=1-per-run requirement is deliberately NOT used, though: an auction
 * window closes on quiescence (src/engine/auction.ts:758-795's
 * `auctionTick`), and nothing guarantees an opposing seat crosses the
 * human's price within a 4-player game, so trades=0 across every held-role
 * window in a run can still be legitimate provided at least one of those
 * windows shows a pushed intent instead. Trade occurrence across the whole
 * seed matrix is asserted at sweep level: e2e_walkthrough_sweep.mjs's
 * matrixCoverage already requires at least one human buy and one human sell
 * somewhere in the matrix. `gambles` and `verifiedPlacements` are
 * spatial-play invariants and are intentionally not asserted here either.
 *
 * Second amendment (2026-07-10): the participation-proven branch below is
 * demoted from a hard per-run invariant to a warn-and-continue log. Seed 3
 * beginner runs flake about 2/3 of the time on this exact branch even though
 * other runs of the same seed pass cleanly with trades=1: a held-role
 * participant whose AI-desired price already matches the opening tick pushes
 * no intents and may never cross, and standing at your limit price is
 * legitimate M.U.L.E. real-time-auction participation, not a stuck driver.
 * Per-run economic outcomes are not deterministic under wall-clock gesture
 * timing, so trade-or-intent proof cannot be a hard per-run gate; the sole
 * owner of trade-occurrence proof stays e2e_walkthrough_sweep.mjs's
 * matrixCoverage (humanBuy/humanSell), unaffected by this change.
 * `humanTurnsCompleted` below stays a hard invariant: it is deterministic
 * (every completed human develop turn must correspond to a round reached)
 * and is unaffected by this amendment.
 * Records the humanTurnsCompleted violation via
 * report.fail("invariant_violation", ...) before throwing, so the written
 * playthrough_report.json is always classified even though the violation
 * itself is still surfaced loudly as a thrown error, not swallowed into a
 * silent report-only failure. The participation branch instead records a
 * warn log line with the same diagnostic detail and returns normally.
 *
 * @param report - The live walk report (see walkthrough_report.mjs); its
 *   counters and getLog() are read, and log() records an info line when every
 *   auction window recorded the human role "out" (or a warn line when a held
 *   role showed no proven participation), so a sweep can count how often
 *   either case happens.
 * @param finalRound - The `state.round` reached at scoring.
 */
export function assertActiveInvariants(report, finalRound) {
  if (report.counters.humanTurnsCompleted !== finalRound) {
    const message =
      "active-mode invariant violated: humanTurnsCompleted " +
      `(${report.counters.humanTurnsCompleted}) does not equal the rounds reached at ` +
      `scoring (${finalRound})`;
    report.fail("invariant_violation", message);
    throw new Error(message);
  }

  const auctionOutcomes = report.getLog().filter((entry) => entry.message === "auction_outcome");
  const heldRoleOutcomes = auctionOutcomes.filter((entry) => entry.extra.role !== "out");
  if (heldRoleOutcomes.length === 0) {
    const detail =
      auctionOutcomes.length === 0
        ? "no auction windows occurred this run"
        : `every one of ${auctionOutcomes.length} auction window(s) recorded the human role "out"`;
    report.log(
      "info",
      `trades invariant satisfied via the legitimate-non-participation branch: ${detail}`,
      { auctionWindows: auctionOutcomes.length },
    );
    return;
  }

  const participationProven = heldRoleOutcomes.some(
    (entry) => (entry.extra.intentsPushed ?? 0) >= 1 || (entry.extra.humanGoodsDelta ?? 0) !== 0,
  );
  if (!participationProven) {
    const message =
      "active-mode invariant relaxed: expected at least one auction window with a held " +
      "buyer/seller role to show proven participation (a pushed non-hold intent click, or a " +
      `cleared trade); got ${heldRoleOutcomes.length} held-role window(s), none with either. ` +
      "Standing at your limit price with no intent pushed is legitimate participation; trade " +
      "occurrence across the seed matrix is proven at sweep level instead (matrixCoverage).";
    report.log("warn", message, { heldRoleWindows: heldRoleOutcomes.length });
  }
}
