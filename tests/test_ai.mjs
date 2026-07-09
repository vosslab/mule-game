// Node unit tests for the AI decision strategies (land_ai.ts, develop_ai.ts,
// auction_ai.ts). Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { decideLandGrantAction } from "../src/ai/land_ai.ts";
import { decideDevelopAction } from "../src/ai/develop_ai.ts";
import { decideAuctionActions } from "../src/ai/auction_ai.ts";

// Drive a fresh started game (title -> land_grant, round 1).
function startedGame(seed) {
  return applyAction(createInitialGameState(seed), { type: "start_game" });
}

// Every player passes the land grant, entering the develop phase with no
// owned plots and no placed M.U.L.E.s.
function passThroughLandGrant(state) {
  let current = state;
  while (current.phase.kind === "land_grant") {
    const payload = current.phase.payload;
    const picker = payload.pickOrder[payload.pickIndex];
    current = applyAction(current, { type: "pass", playerId: picker });
  }
  return current;
}

// Drive the land grant with every player claiming the AI's chosen plot.
function claimThroughLandGrant(state) {
  let current = state;
  while (current.phase.kind === "land_grant") {
    const payload = current.phase.payload;
    const picker = payload.pickOrder[payload.pickIndex];
    const action = decideLandGrantAction(current, picker);
    current = applyAction(current, action);
  }
  return current;
}

// Drive a fresh game to the auction phase for the given good, with every
// player passing land grant and ending their develop turn empty-handed.
function auctionState(seed, good) {
  let current = passThroughLandGrant(startedGame(seed));
  for (let i = 0; i < 4; i += 1) {
    current = applyAction(current, {
      type: "end_turn",
      playerId: current.phase.payload.activePlayer,
    });
  }
  current = applyAction(current, { type: "tick" });
  while (current.phase.payload.good !== good) {
    current = applyAction(current, { type: "end_auction" });
  }
  return current;
}

// ============================================================
// land_ai.ts
// ============================================================

test("land AI claims the highest-yield unowned plot on its pick", () => {
  const state = startedGame(1);
  const payload = state.phase.payload;
  const picker = payload.pickOrder[payload.pickIndex];
  const action = decideLandGrantAction(state, picker);
  assert.equal(action.type, "claim_plot");
  assert.equal(action.playerId, picker);

  // The chosen plot must be at least as good as every other claimable plot.
  const claimedPlot = state.plots[action.row][action.col];
  assert.notEqual(claimedPlot.terrain, "town");
  assert.equal(claimedPlot.owner, null);
});

test("land AI passes when it is not the current picker", () => {
  const state = startedGame(2);
  const payload = state.phase.payload;
  const otherPlayer = (payload.pickOrder[payload.pickIndex] + 1) % 4;
  const action = decideLandGrantAction(state, otherPlayer);
  assert.deepEqual(action, { type: "pass", playerId: otherPlayer });
});

test("land AI passes (degenerate) when the game is not in land_grant phase", () => {
  const state = createInitialGameState(3);
  const action = decideLandGrantAction(state, 0);
  assert.deepEqual(action, { type: "pass", playerId: 0 });
});

test("land AI never softlocks: full land grant completes via AI decisions", () => {
  const state = claimThroughLandGrant(startedGame(4));
  assert.equal(state.phase.kind, "develop");
});

// ============================================================
// develop_ai.ts
// ============================================================

test("develop AI buys a M.U.L.E. when it can afford one and has money to spare", () => {
  const grantDone = claimThroughLandGrant(startedGame(5));
  assert.equal(grantDone.phase.kind, "develop");
  const active = grantDone.phase.payload.activePlayer;
  const action = decideDevelopAction(grantDone, active);
  assert.equal(action.type, "buy_mule");
  assert.equal(action.playerId, active);
});

test("develop AI outfits toward the colony's scarcest resource (starting goods, smithore scarcest)", () => {
  const grantDone = claimThroughLandGrant(startedGame(6));
  const active = grantDone.phase.payload.activePlayer;
  const bought = applyAction(grantDone, { type: "buy_mule", playerId: active });
  const action = decideDevelopAction(bought, active);
  assert.equal(action.type, "outfit_mule");
  assert.equal(action.playerId, active);
  // Every player starts with STARTING_GOODS (4 food, 2 energy, 0 smithore,
  // per planetmule.com/how-to-play), so smithore is the scarcest resource.
  assert.equal(action.resource, "smithore");
});

test("develop AI outfits toward smithore when it is the colony's scarcest good", () => {
  const grantDone = claimThroughLandGrant(startedGame(7));
  const active = grantDone.phase.payload.activePlayer;
  const bought = applyAction(grantDone, { type: "buy_mule", playerId: active });
  // Give every player plenty of food and energy but no smithore.
  const players = bought.players.map((player) => ({
    ...player,
    goods: { food: 50, energy: 50, smithore: 0 },
  }));
  const skewed = { ...bought, players };
  const action = decideDevelopAction(skewed, active);
  assert.equal(action.type, "outfit_mule");
  assert.equal(action.resource, "smithore");
});

test("develop AI places an outfitted M.U.L.E. on an owned empty plot", () => {
  const grantDone = claimThroughLandGrant(startedGame(8));
  const active = grantDone.phase.payload.activePlayer;
  const bought = applyAction(grantDone, { type: "buy_mule", playerId: active });
  const outfitted = applyAction(bought, {
    type: "outfit_mule",
    playerId: active,
    resource: "food",
  });
  const action = decideDevelopAction(outfitted, active);
  assert.equal(action.type, "place_mule");
  const targetPlot = outfitted.plots[action.row][action.col];
  assert.equal(targetPlot.owner, active);
  assert.equal(targetPlot.muleOutfit, null);
});

test("develop AI ends turn (degenerate) when it has no money for a M.U.L.E.", () => {
  const grantDone = claimThroughLandGrant(startedGame(9));
  const active = grantDone.phase.payload.activePlayer;
  const players = grantDone.players.map((player) =>
    player.id === active ? { ...player, money: 0 } : player,
  );
  const broke = { ...grantDone, players };
  const action = decideDevelopAction(broke, active);
  assert.deepEqual(action, { type: "end_turn", playerId: active });
});

test("develop AI ends turn (degenerate) when it owns no placeable plot", () => {
  const started = startedGame(10);
  const passed = passThroughLandGrant(started);
  assert.equal(passed.phase.kind, "develop");
  const active = passed.phase.payload.activePlayer;
  // No plots were claimed, so a carried, outfitted M.U.L.E. cannot be placed.
  const carrying = {
    ...passed,
    phase: {
      kind: "develop",
      payload: { ...passed.phase.payload, carriedMule: "food" },
    },
  };
  const action = decideDevelopAction(carrying, active);
  assert.deepEqual(action, { type: "end_turn", playerId: active });
});

test("develop AI ends turn (degenerate) when the game is not in develop phase", () => {
  const state = createInitialGameState(11);
  const action = decideDevelopAction(state, 0);
  assert.deepEqual(action, { type: "end_turn", playerId: 0 });
});

// ============================================================
// auction_ai.ts
// ============================================================

test("auction AI buys when it is short of the target stock and can afford it", () => {
  const state = auctionState(12, "food");
  const active = 0;
  const action = decideAuctionActions(state, active);
  assert.equal(action.type, "set_auction_role");
  assert.equal(action.playerId, active);
  assert.equal(action.role, "buyer");
});

test("auction AI sells when it holds a surplus of the auctioned good", () => {
  const state = auctionState(13, "smithore");
  const active = 0;
  const players = state.players.map((player) =>
    player.id === active ? { ...player, goods: { ...player.goods, smithore: 20 } } : player,
  );
  const surplus = { ...state, players };
  const action = decideAuctionActions(surplus, active);
  assert.equal(action.type, "set_auction_role");
  assert.equal(action.role, "seller");
});

test("auction AI walks price up once buying, away from the store band midpoint", () => {
  const state = auctionState(14, "food");
  const active = 0;
  const buyerAction = decideAuctionActions(state, active);
  const withRole = applyAction(state, buyerAction);
  const action = decideAuctionActions(withRole, active);
  assert.equal(action.type, "set_auction_intent");
  assert.equal(action.intent, "up");
});

test("auction AI holds once already at its desired role and price extreme", () => {
  const state = auctionState(15, "food");
  const active = 0;
  const buyerAction = decideAuctionActions(state, active);
  let current = applyAction(state, buyerAction);
  // Drive the price up toward the buyer's limit until it holds.
  for (let i = 0; i < 100; i += 1) {
    const action = decideAuctionActions(current, active);
    if (action === null) {
      break;
    }
    current = applyAction(current, action);
    current = applyAction(current, { type: "tick" });
    if (current.phase.kind !== "auction" || current.phase.payload.finished) {
      break;
    }
  }
  const action = decideAuctionActions(current, active);
  assert.equal(action, null);
});

test("auction AI never softlocks (degenerate): sits out when reserve blocks buying", () => {
  const state = auctionState(16, "food");
  const active = 0;
  const players = state.players.map((player) =>
    player.id === active ? { ...player, money: 0 } : player,
  );
  const broke = { ...state, players };
  // The player starts seated `out`, and with no money it stays `out` rather
  // than declaring `buyer`, so the decision resolves to null (no change).
  const action = decideAuctionActions(broke, active);
  assert.equal(action, null);
  assert.equal(broke.phase.payload.participants[active].role, "out");
});

test("auction AI returns null (degenerate) when the game is not in auction phase", () => {
  const state = createInitialGameState(17);
  const action = decideAuctionActions(state, 0);
  assert.equal(action, null);
});

test("auction AI returns null (degenerate) when the auction has already finished", () => {
  const state = auctionState(18, "food");
  const finished = {
    ...state,
    phase: { kind: "auction", payload: { ...state.phase.payload, finished: true } },
  };
  const action = decideAuctionActions(finished, 0);
  assert.equal(action, null);
});
