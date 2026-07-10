// Seat-0 strategy adapter for the browser walkthrough harness.
//
// The walker reads the live game through `window.muleGameState()`
// (src/ui/walker_debug.ts), which returns a deep-frozen, structured-clone
// projection. Playwright's `page.evaluate` hands that projection back to the
// Node walker as JSON-serialized plain data (structured-clone/JSON transport),
// so before any engine AI can decide the human seat's move the projection must
// be re-hydrated into a `GameState` the `src/engine` reducer and `src/ai`
// decide functions accept.
//
// This module owns that seam. The MARSHALLING section below is the
// re-hydration: because `GameState` is designed serializable (numeric
// `rngState`, plain nested objects and arrays, no Map/Set/undefined/Infinity),
// re-hydration is a validated pass-through of the projection's `state` field,
// not a bespoke rebuild. Its unit test proves the pass-through is truly
// lossless by round-tripping a reducer-driven mid-game state through
// `JSON.stringify` and asserting the reducer produces identical next states
// from the original and the marshalled copy, and by calling every imported
// `src/ai` decide function on the marshalled copy.
//
// The DECISION-WRAPPER section (the seat-0 adapter over `src/ai/*`, the closed
// `PLAN_KINDS` vocabulary, and the decision-to-gesture mapping) appends below
// the marshalling section; the two sections stay separate so either can
// change without touching the other.

import { decideLandGrantAction, decideLandAuctionAction } from "../../src/ai/land_ai.ts";
import { decideDevelopAction } from "../../src/ai/develop_ai.ts";
import { decideAuctionActions } from "../../src/ai/auction_ai.ts";

// ============================================================
// Marshalling: browser projection -> engine GameState
// ============================================================

// Validate one required plain-object field, throwing a specific Error naming
// the projection path that was wrong. Fail-loud on a malformed projection
// rather than letting a missing field surface as a confusing engine crash
// several calls later.
function requireObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`walkthrough marshalling: expected object at ${path}`);
  }
}

// Re-hydrate the JSON-serialized walker projection into an engine `GameState`.
//
// `projection` is the value the Node walker receives from
// `page.evaluate(() => window.muleGameState())`: the JSON transport of the
// deep-frozen clone `buildWalkerProjection` installed on the page. The returned
// object is the projection's `state` field, ready to pass straight into
// `applyAction` and the `src/ai` decide functions. The pass-through is
// validated, not blind: the projection's convenience `phaseKind` must agree
// with the nested `state.phase.kind`, and the core `GameState` shape
// (`phase.kind`, four `players`, numeric `round`) must be present, so a
// corrupted or partial serialization fails here with a clear message instead
// of deep inside the AI.
export function marshalProjection(projection) {
  requireObject(projection, "projection");
  const state = projection.state;
  requireObject(state, "projection.state");
  requireObject(state.phase, "projection.state.phase");
  if (typeof state.phase.kind !== "string") {
    throw new Error("walkthrough marshalling: projection.state.phase.kind is not a string");
  }
  // Cross-check the convenience field against the nested truth: a serialization
  // that drifted these apart is corrupt and must not reach the adapter.
  if (projection.phaseKind !== state.phase.kind) {
    throw new Error(
      `walkthrough marshalling: phaseKind ${projection.phaseKind} does not match ` +
        `state.phase.kind ${state.phase.kind}`,
    );
  }
  if (!Array.isArray(state.players) || state.players.length !== 4) {
    throw new Error("walkthrough marshalling: projection.state.players must be a 4-tuple");
  }
  if (typeof state.round !== "number") {
    throw new Error("walkthrough marshalling: projection.state.round is not a number");
  }
  return state;
}

// ============================================================
// Decision wrappers: engine action -> seat-0 gesture plan
// ============================================================
//
// The walker drives the browser as the human seat (player 0). Each turn it
// reads the live state, marshals it (above), then asks one of these four
// wrappers for the NEXT gesture PLAN: a small piece of plain data naming a
// concrete thing to do in the DOM (click this plot, buy a mule, set an auction
// role). A wrapper calls the matching `src/ai` decide function for seat 0 and
// translates the engine ACTION it returns into that plan. The engine action is
// how the reducer mutates state; the plan is how a browser driver reproduces
// that same move through the UI, so the translation drops the internal
// `playerId` (always seat 0 here) and keeps only the fields a driver needs.
//
// Decision-to-gesture mapping (engine action -> plan):
//
//   Land grant (decideLandGrant):
//     claim_plot{row,col}            -> {kind:"claim_plot", row, col}
//     pass                           -> {kind:"pass_land_grant"}
//
//   Colony land auction (decideLandAuction):
//     bid_land                       -> {kind:"bid_land"}
//     null (no bid this tick)        -> {kind:"pass_land_auction"}
//
//   Develop (decideDevelopPlan):
//     hunt_wampus                    -> {kind:"hunt_wampus", opportunistic:true}
//     assay_plot{row,col}            -> {kind:"assay_plot", row, col, opportunistic:true}
//     buy_mule                       -> {kind:"buy_mule"}
//     outfit_mule{resource}          -> {kind:"outfit_mule", resource}
//     place_mule{row,col}            -> {kind:"place_mule", row, col}
//     gamble                         -> {kind:"gamble_pub"}
//     end_turn                       -> {kind:"end_turn"}
//
//   Goods auction (decideAuctionIntent):
//     set_auction_role{role}         -> {kind:"auction_role", role}
//     set_auction_intent{intent}     -> {kind:"auction_intent", direction}
//     null (role+intent already set) -> {kind:"auction_continue"}
//
// hunt_wampus and assay_plot carry `opportunistic:true`: they are free,
// strictly-beneficial scouting/hunting moves the develop AI slips in before it
// spends money, not the turn's main economic gesture, so a driver (or a
// walkthrough assertion) can tell a bonus gesture from a committing one.
//
// Goods-auction `role` passes the engine's own value straight through
// ("buyer" | "seller" | "out"); the DOM renders these as data-role attributes,
// so a driver matches the plan's role to the element without a lookup table.
// The buyer/seller price target the AI walks toward is internal to
// `auction_ai.ts` (never exported), so the plan carries only the role and the
// intent direction ("up" | "down" | "hold") the AI actually emits, not a
// re-derived target price the adapter would have to duplicate.
//
// decideDevelopPlan returns the NEXT SINGLE develop plan, not a whole-turn
// ordered list. A develop turn is genuinely reactive, not a fixed script:
// whether the AI hunts the wampus depends on live wampus visibility, the
// buy-vs-assay branch depends on the store's dynamic mule price and the running
// money reserve, and one turn can loop through several buy/outfit/place cycles
// until a plot or the budget runs out. Deriving the full ordered list up front
// would mean re-running the reducer inside the adapter -- duplicating the
// walker's own tick loop and risking drift from what actually happens on the
// page -- so the adapter yields one gesture per call and the walker loops,
// exactly as it already does for the timer-driven phases.
//
// Serialized-input footprint (follow-on note for shrinking the projection):
// across the four decide functions the AI reads the phase payload plus `plots`,
// `players`, `store`, and `round` -- effectively all of `GameState`. No
// narrower serialized input than the full marshalled state emerged as
// sufficient, so the projection cannot be trimmed without starving one of the
// deciders; keep passing the whole state.

const SEAT_0 = 0;

// The closed set of gesture-plan `kind` values every wrapper can emit. Frozen
// and exported so the walker/orchestrator can fail loud on any plan kind
// outside this vocabulary (an unmapped engine action is a bug, not a move to
// guess at). Order groups the kinds by phase for readability; callers treat it
// as an unordered membership set.
export const PLAN_KINDS = Object.freeze([
  "claim_plot",
  "pass_land_grant",
  "bid_land",
  "pass_land_auction",
  "hunt_wampus",
  "assay_plot",
  "buy_mule",
  "outfit_mule",
  "place_mule",
  "gamble_pub",
  "end_turn",
  "auction_role",
  "auction_intent",
  "auction_continue",
]);

const PLAN_KIND_SET = new Set(PLAN_KINDS);

// Fail loud if a wrapper ever assembles a plan whose kind is not in the
// exported vocabulary: that means the mapping and PLAN_KINDS drifted apart, the
// same drift the orchestrator's downstream unknown-kind check would reject.
function checkedPlan(plan) {
  if (!PLAN_KIND_SET.has(plan.kind)) {
    throw new Error(`walkthrough decision wrapper: plan kind ${plan.kind} is not in PLAN_KINDS`);
  }
  return plan;
}

// Translate the land-grant AI's action for seat 0 into a gesture plan: claim a
// specific plot, or pass when it is not seat 0's pick or nothing is claimable.
export function decideLandGrant(state) {
  const action = decideLandGrantAction(state, SEAT_0);
  if (action.type === "claim_plot") {
    return checkedPlan({ kind: "claim_plot", row: action.row, col: action.col });
  }
  if (action.type === "pass") {
    return checkedPlan({ kind: "pass_land_grant" });
  }
  throw new Error(`decideLandGrant: unmapped land-grant action ${action.type}`);
}

// Translate the colony land-auction AI's action for seat 0. A bid is a single
// click that bumps the ask by the engine's bid step; null means the AI holds
// this tick (already leading, priced out, or over its value cap), which a
// driver reproduces by simply not bidding.
export function decideLandAuction(state) {
  const action = decideLandAuctionAction(state, SEAT_0);
  if (action === null) {
    return checkedPlan({ kind: "pass_land_auction" });
  }
  if (action.type === "bid_land") {
    return checkedPlan({ kind: "bid_land" });
  }
  throw new Error(`decideLandAuction: unmapped land-auction action ${action.type}`);
}

// Translate the develop AI's NEXT action for seat 0 into a single gesture plan
// (see the section note on why this is one gesture, not a whole-turn list).
export function decideDevelopPlan(state) {
  const action = decideDevelopAction(state, SEAT_0);
  switch (action.type) {
    case "hunt_wampus":
      return checkedPlan({ kind: "hunt_wampus", opportunistic: true });
    case "assay_plot":
      return checkedPlan({
        kind: "assay_plot",
        row: action.row,
        col: action.col,
        opportunistic: true,
      });
    case "buy_mule":
      return checkedPlan({ kind: "buy_mule" });
    case "outfit_mule":
      return checkedPlan({ kind: "outfit_mule", resource: action.resource });
    case "place_mule":
      return checkedPlan({ kind: "place_mule", row: action.row, col: action.col });
    case "gamble":
      return checkedPlan({ kind: "gamble_pub" });
    case "end_turn":
      return checkedPlan({ kind: "end_turn" });
    default:
      throw new Error(`decideDevelopPlan: unmapped develop action ${action.type}`);
  }
}

// Translate the goods-auction AI's action for seat 0. The AI moves the seat one
// step at a time -- first into the right role, then walking its price intent --
// so a single call yields at most one of those steps; null means role and
// intent already match, which a driver reproduces by holding position.
export function decideAuctionIntent(state) {
  const action = decideAuctionActions(state, SEAT_0);
  if (action === null) {
    return checkedPlan({ kind: "auction_continue" });
  }
  if (action.type === "set_auction_role") {
    return checkedPlan({ kind: "auction_role", role: action.role });
  }
  if (action.type === "set_auction_intent") {
    return checkedPlan({ kind: "auction_intent", direction: action.intent });
  }
  throw new Error(`decideAuctionIntent: unmapped auction action ${action.type}`);
}
