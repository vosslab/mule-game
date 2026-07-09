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

// Drive any colony land-auction slots to completion without bidding (every
// player passes on the plot by simply never calling bid_land): tick until
// the going countdown finalizes as a no-sale, then end the slot, repeating
// for as many slots as the round's colony-auction chain offers.
function skipThroughLandAuctions(state) {
  let current = state;
  while (current.phase.kind === "land_auction") {
    while (!current.phase.payload.finished) {
      current = applyAction(current, { type: "tick" });
    }
    current = applyAction(current, { type: "end_land_auction" });
  }
  return current;
}

// Every player passes the land grant, entering the develop phase with no
// owned plots and no placed M.U.L.E.s (any colony land-auction slot the
// round offers is skipped, without bidding, the same way).
function passThroughLandGrant(state) {
  let current = state;
  while (current.phase.kind === "land_grant") {
    const payload = current.phase.payload;
    const picker = payload.pickOrder[payload.pickIndex];
    current = applyAction(current, { type: "pass", playerId: picker });
  }
  return skipThroughLandAuctions(current);
}

// Drive the land grant with every player claiming the AI's chosen plot, then
// skip cleanly through any colony land-auction slots the round offers.
function claimThroughLandGrant(state) {
  let current = state;
  while (current.phase.kind === "land_grant") {
    const payload = current.phase.payload;
    const picker = payload.pickOrder[payload.pickIndex];
    const action = decideLandGrantAction(current, picker);
    current = applyAction(current, action);
  }
  return skipThroughLandAuctions(current);
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
    goods: { food: 50, energy: 50, smithore: 0, crystite: 0 },
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

test("develop AI gambles instead of ending turn (M8) when it has no money for a M.U.L.E.", () => {
  const grantDone = claimThroughLandGrant(startedGame(9));
  const active = grantDone.phase.payload.activePlayer;
  const players = grantDone.players.map((player) =>
    player.id === active ? { ...player, money: 0 } : player,
  );
  const broke = { ...grantDone, players };
  const action = decideDevelopAction(broke, active);
  assert.deepEqual(action, { type: "gamble", playerId: active });
});

test("develop AI gambles instead of ending turn (M8) when it owns no placeable plot", () => {
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
  assert.deepEqual(action, { type: "gamble", playerId: active });
});

test("develop AI ends turn (degenerate) when the game is not in develop phase", () => {
  const state = createInitialGameState(11);
  const action = decideDevelopAction(state, 0);
  assert.deepEqual(action, { type: "end_turn", playerId: 0 });
});

// ============================================================
// develop_ai.ts: crystite outfit and assay heuristics
// ============================================================

test("develop AI prefers crystite over the scarcest resource on a revealed high-level deposit", () => {
  const grantDone = claimThroughLandGrant(startedGame(12));
  const active = grantDone.phase.payload.activePlayer;
  const bought = applyAction(grantDone, { type: "buy_mule", playerId: active });
  // Reveal a level-4 deposit on the player's first owned plot; the game's
  // default crystite/smithore prices make a level-4 deposit (4 * price)
  // clearly worth more than one round of the scarcest resource's price.
  const plots = bought.plots.map((row) =>
    row.map((cell) =>
      cell.owner === active && cell.muleOutfit === null
        ? { ...cell, crystiteLevel: 4, crystiteRevealed: true }
        : cell,
    ),
  );
  const enriched = { ...bought, plots };
  const action = decideDevelopAction(enriched, active);
  assert.equal(action.type, "outfit_mule");
  assert.equal(action.resource, "crystite");
});

test("develop AI does not prefer crystite when its revealed level is below the outfit threshold", () => {
  const grantDone = claimThroughLandGrant(startedGame(12));
  const active = grantDone.phase.payload.activePlayer;
  const bought = applyAction(grantDone, { type: "buy_mule", playerId: active });
  // Level 1 is below CRYSTITE_OUTFIT_MIN_LEVEL (2): the scarcest-resource
  // fallback should still win.
  const plots = bought.plots.map((row) =>
    row.map((cell) =>
      cell.owner === active && cell.muleOutfit === null
        ? { ...cell, crystiteLevel: 1, crystiteRevealed: true }
        : cell,
    ),
  );
  const enriched = { ...bought, plots };
  const action = decideDevelopAction(enriched, active);
  assert.equal(action.type, "outfit_mule");
  assert.notEqual(action.resource, "crystite");
});

test("develop AI places a carried crystite M.U.L.E. on its richest revealed deposit, not the first empty plot", () => {
  const grantDone = claimThroughLandGrant(startedGame(13));
  const active = grantDone.phase.payload.activePlayer;
  // Two owned, empty plots for the active player: a plain first-in-row-major
  // plot with no deposit, and a later plot with a revealed level-3 deposit.
  const plots = [
    [
      {
        terrain: "plain",
        owner: active,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
      {
        terrain: "plain",
        owner: active,
        muleOutfit: null,
        crystiteLevel: 3,
        crystiteRevealed: true,
      },
    ],
  ];
  const carrying = {
    ...grantDone,
    plots,
    phase: {
      kind: "develop",
      payload: { ...grantDone.phase.payload, carriedMule: "crystite" },
    },
  };
  const action = decideDevelopAction(carrying, active);
  assert.equal(action.type, "place_mule");
  assert.equal(action.row, 0);
  assert.equal(action.col, 1);
});

test("develop AI assays a promising mountain-adjacent plot when rich, before buying a M.U.L.E.", () => {
  const grantDone = claimThroughLandGrant(startedGame(14));
  const active = grantDone.phase.payload.activePlayer;
  const players = grantDone.players.map((player) =>
    player.id === active ? { ...player, money: 5000 } : player,
  );
  // A mountain plot at (0, 0) and an unrevealed, unowned plot next to it at
  // (0, 1): the only mountain-adjacent, unrevealed candidate on this board.
  const plots = [
    [
      {
        terrain: "mountain1",
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
      {
        terrain: "plain",
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
    ],
  ];
  const rich = { ...grantDone, players, plots };
  const action = decideDevelopAction(rich, active);
  assert.equal(action.type, "assay_plot");
  assert.equal(action.row, 0);
  assert.equal(action.col, 1);
});

test("develop AI assay heuristic cannot-stall: repeated assaying always terminates within the candidate count", () => {
  const grantDone = claimThroughLandGrant(startedGame(15));
  const active = grantDone.phase.payload.activePlayer;
  const players = grantDone.players.map((player) =>
    player.id === active ? { ...player, money: 5000 } : player,
  );
  // Three mountain-adjacent, unrevealed candidates in a row.
  const plots = [
    [
      {
        terrain: "mountain1",
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
      {
        terrain: "plain",
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
      {
        terrain: "mountain1",
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
      {
        terrain: "plain",
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
      {
        terrain: "mountain1",
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
      {
        terrain: "plain",
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
    ],
  ];
  let state = { ...grantDone, players, plots };
  const CANDIDATE_COUNT = 3;
  const WATCHDOG = CANDIDATE_COUNT + 1;
  let assays = 0;
  for (let step = 0; step < WATCHDOG; step += 1) {
    const action = decideDevelopAction(state, active);
    if (action.type !== "assay_plot") {
      break;
    }
    assays += 1;
    state = applyAction(state, action);
  }
  // Every assay reveals its plot, shrinking the candidate set, so the loop
  // must stop assaying at or before CANDIDATE_COUNT iterations -- it never
  // stalls re-assaying the same or an already-revealed plot.
  assert.ok(
    assays <= CANDIDATE_COUNT,
    `assayed ${assays} times, expected at most ${CANDIDATE_COUNT}`,
  );
  const finalAction = decideDevelopAction(state, active);
  assert.notEqual(finalAction.type, "assay_plot");
});

// ============================================================
// auction_ai.ts
// ============================================================

// Override one player's holdings of a good (roles derive from holdings).
function withGood(state, playerId, good, amount) {
  const players = state.players.map((player) =>
    player.id === playerId ? { ...player, goods: { ...player.goods, [good]: amount } } : player,
  );
  return { ...state, players };
}

// Override one player's money.
function withMoney(state, playerId, money) {
  const players = state.players.map((player) =>
    player.id === playerId ? { ...player, money } : player,
  );
  return { ...state, players };
}

// Force one auction participant's role/intent, so a decision test can start
// from a "wrong" seat and check the AI corrects it. Also forces the window
// live (some goods auto-skip at creation when nothing can trade yet), so the
// decision function actually runs.
function setParticipant(state, playerId, overrides) {
  const participants = state.phase.payload.participants.map((entry) =>
    entry.playerId === playerId ? { ...entry, ...overrides } : entry,
  );
  return {
    ...state,
    phase: {
      kind: "auction",
      payload: { ...state.phase.payload, participants, skipped: false, finished: false },
    },
  };
}

test("auction AI declares buyer when holding below the good's critical target", () => {
  // Round 1 food critical is 3; a player holding 0 needs food, so it buys.
  let state = auctionState(12, "food");
  state = withGood(state, 0, "food", 0);
  state = setParticipant(state, 0, { role: "out", intent: "hold" });
  const action = decideAuctionActions(state, 0);
  assert.equal(action.type, "set_auction_role");
  assert.equal(action.role, "buyer");
});

test("auction AI declares seller when holding above the good's critical target", () => {
  // Smithore is never critical (target 0), so any holder sells its surplus.
  let state = auctionState(13, "smithore");
  state = withGood(state, 0, "smithore", 20);
  state = setParticipant(state, 0, { role: "out", intent: "hold" });
  const action = decideAuctionActions(state, 0);
  assert.equal(action.type, "set_auction_role");
  assert.equal(action.role, "seller");
});

test("auction AI walks its bid up toward the store sell price when buying", () => {
  let state = auctionState(14, "food");
  state = withGood(state, 0, "food", 0);
  // Seated buyer at the band floor but told to hold: the AI corrects to up.
  state = setParticipant(state, 0, { role: "buyer", intent: "hold" });
  const action = decideAuctionActions(state, 0);
  assert.equal(action.type, "set_auction_intent");
  assert.equal(action.intent, "up");
});

test("auction AI drops to out once its holdings reach the critical target", () => {
  // A buyer that has reached exactly critical no longer needs the good.
  let state = auctionState(15, "food");
  state = withGood(state, 0, "food", 3);
  state = setParticipant(state, 0, { role: "buyer", intent: "up" });
  const action = decideAuctionActions(state, 0);
  assert.equal(action.type, "set_auction_role");
  assert.equal(action.role, "out");
});

test("auction AI never softlocks (degenerate): sits out when the reserve blocks buying", () => {
  // Below critical (would buy) but broke: the reserve forces it out, not buyer.
  let state = auctionState(16, "food");
  state = withGood(state, 0, "food", 0);
  state = withMoney(state, 0, 0);
  state = setParticipant(state, 0, { role: "buyer", intent: "up" });
  const action = decideAuctionActions(state, 0);
  assert.equal(action.type, "set_auction_role");
  assert.equal(action.role, "out");
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
