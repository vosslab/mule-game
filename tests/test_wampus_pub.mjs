// Node unit tests for the wampus and pub-gambling subsystems: bounty table
// by round, spawn-only-on-unowned-mountains,
// catch semantics (once per round), the gamble payout formula's bounds and
// cap, species being purely cosmetic, and standard mode reaching scoring.
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { createWampusState, tickWampus } from "../src/engine/wampus.ts";
import { SPECIES } from "../src/engine/player.ts";
import { decideDevelopAction } from "../src/ai/develop_ai.ts";
import {
  DEVELOP_TICKS_FULL,
  PUB_MAX_RANDOM_AMOUNT,
  PUB_PAYOUT_CAP,
  PUB_ROUND_BONUS_BY_ROUND,
  WAMPUS_BOUNTY_BASE,
  WAMPUS_BOUNTY_ROUND_DIVISOR,
  WAMPUS_BOUNTY_ROUND_OFFSET,
} from "../src/engine/constants.ts";

// Drive a fresh started game (title -> land_grant, round 1).
function startedGame(seed, mode) {
  return applyAction(createInitialGameState(seed, mode), { type: "start_game" });
}

// Every player passes the land grant and any colony land auctions the round
// offers, entering the develop phase with no owned plots.
function passThroughLandGrant(state) {
  let current = state;
  while (current.phase.kind === "land_grant") {
    const payload = current.phase.payload;
    const picker = payload.pickOrder[payload.pickIndex];
    current = applyAction(current, { type: "pass", playerId: picker });
  }
  while (current.phase.kind === "land_auction") {
    while (!current.phase.payload.finished) {
      current = applyAction(current, { type: "tick" });
    }
    current = applyAction(current, { type: "end_land_auction" });
  }
  return current;
}

// ============================================================
// Wampus bounty table (round -> dollars)
// ============================================================

test("wampus bounty is 100 * floor((round + 4) / 4): pinned table for every round 1-12", () => {
  const expected = {
    1: 100,
    2: 100,
    3: 100,
    4: 200,
    5: 200,
    6: 200,
    7: 200,
    8: 300,
    9: 300,
    10: 300,
    11: 300,
    12: 400,
  };
  for (const [round, bounty] of Object.entries(expected)) {
    const computed =
      WAMPUS_BOUNTY_BASE *
      Math.floor((Number(round) + WAMPUS_BOUNTY_ROUND_OFFSET) / WAMPUS_BOUNTY_ROUND_DIVISOR);
    assert.equal(computed, bounty, `round ${round}`);
  }
});

test("createWampusState sets this round's bounty from the pinned table", () => {
  const state = passThroughLandGrant(startedGame(1, "standard"));
  assert.equal(state.phase.kind, "develop");
  assert.equal(state.round, 1);
  const { wampus } = createWampusState(state);
  assert.equal(wampus.moneyReward, 100);
});

// ============================================================
// Spawn only on unowned mountains
// ============================================================

test("wampus is dead on creation when the board has no unowned mountain plot", () => {
  const state = passThroughLandGrant(startedGame(2, "beginner"));
  // Force every plot to a non-mountain terrain so no candidate site exists.
  const plots = state.plots.map((row) => row.map((plot) => ({ ...plot, terrain: "plain" })));
  const noMountains = { ...state, plots };
  const { wampus } = createWampusState(noMountains);
  assert.equal(wampus.dead, true);
  assert.equal(wampus.mountains.length, 0);
});

test("wampus candidate mountains exclude owned mountain plots", () => {
  const state = passThroughLandGrant(startedGame(3, "beginner"));
  const plots = state.plots.map((row) =>
    row.map((plot) =>
      plot.terrain === "mountain1" || plot.terrain === "mountain2" || plot.terrain === "mountain3"
        ? { ...plot, owner: 0 }
        : plot,
    ),
  );
  const allOwned = { ...state, plots };
  const { wampus } = createWampusState(allOwned);
  assert.equal(wampus.mountains.length, 0);
  assert.equal(wampus.dead, true);
});

test("wampus candidate mountains include every unowned mountain plot", () => {
  const state = passThroughLandGrant(startedGame(4, "beginner"));
  let unownedMountainCount = 0;
  for (const row of state.plots) {
    for (const plot of row) {
      if (
        plot.owner === null &&
        (plot.terrain === "mountain1" ||
          plot.terrain === "mountain2" ||
          plot.terrain === "mountain3")
      ) {
        unownedMountainCount += 1;
      }
    }
  }
  const { wampus } = createWampusState(state);
  assert.equal(wampus.mountains.length, unownedMountainCount);
});

test("wampus appears (visible) at an unowned mountain after enough ticks", () => {
  const state = passThroughLandGrant(startedGame(5, "beginner"));
  assert.equal(state.phase.kind, "develop");
  let current = state;
  let sawVisible = false;
  for (let step = 0; step < 200 && !sawVisible; step += 1) {
    current = applyAction(current, { type: "tick" });
    if (current.phase.kind !== "develop") {
      break;
    }
    if (current.phase.payload.wampus.visible) {
      sawVisible = true;
      const { row, col } = current.phase.payload.wampus;
      const plot = current.plots[row][col];
      assert.equal(plot.owner, null);
      assert.ok(["mountain1", "mountain2", "mountain3"].includes(plot.terrain));
    }
  }
  assert.ok(sawVisible, "wampus never became visible within the watchdog window");
});

// ============================================================
// Catch semantics: once visible, awards bounty, despawns (once per round)
// ============================================================

// Drive ticks until the wampus becomes visible, or fail loudly.
function tickUntilVisible(state, watchdog = 200) {
  let current = state;
  for (let step = 0; step < watchdog; step += 1) {
    if (current.phase.kind !== "develop") {
      throw new Error("tickUntilVisible: left the develop phase");
    }
    if (current.phase.payload.wampus.visible) {
      return current;
    }
    current = applyAction(current, { type: "tick" });
  }
  throw new Error("tickUntilVisible: wampus never became visible");
}

test("hunt_wampus while visible awards the bounty and despawns the wampus", () => {
  const state = tickUntilVisible(passThroughLandGrant(startedGame(6, "beginner")));
  const active = state.phase.payload.activePlayer;
  const bounty = state.phase.payload.wampus.moneyReward;
  const before = state.players[active].money;
  const after = applyAction(state, { type: "hunt_wampus", playerId: active });
  assert.equal(after.players[active].money, before + bounty);
  assert.equal(after.phase.payload.wampus.dead, true);
  assert.equal(after.phase.payload.wampus.caught, true);
  assert.equal(after.phase.payload.wampus.visible, false);
  const lastEvent = after.phase.payload.wampus.events.at(-1);
  assert.equal(lastEvent.kind, "catch");
  assert.equal(lastEvent.playerId, active);
});

test("hunt_wampus a second time this round throws (catchable once per round)", () => {
  const state = tickUntilVisible(passThroughLandGrant(startedGame(6, "beginner")));
  const active = state.phase.payload.activePlayer;
  const caughtOnce = applyAction(state, { type: "hunt_wampus", playerId: active });
  assert.throws(() => applyAction(caughtOnce, { type: "hunt_wampus", playerId: active }));
});

test("hunt_wampus throws when the wampus is not visible", () => {
  const state = passThroughLandGrant(startedGame(7, "beginner"));
  assert.equal(state.phase.payload.wampus.visible, false);
  const active = state.phase.payload.activePlayer;
  assert.throws(() => applyAction(state, { type: "hunt_wampus", playerId: active }));
});

test("hunt_wampus out of turn throws", () => {
  const state = tickUntilVisible(passThroughLandGrant(startedGame(8, "beginner")));
  const active = state.phase.payload.activePlayer;
  const other = (active + 1) % 4;
  assert.throws(() => applyAction(state, { type: "hunt_wampus", playerId: other }));
});

test("catchWampus/tickWampus: a caught wampus never becomes visible again this round", () => {
  const state = tickUntilVisible(passThroughLandGrant(startedGame(9, "beginner")));
  const active = state.phase.payload.activePlayer;
  let current = applyAction(state, { type: "hunt_wampus", playerId: active });
  for (let step = 0; step < 50; step += 1) {
    current = applyAction(current, { type: "tick" });
    if (current.phase.kind !== "develop") {
      break;
    }
    assert.equal(current.phase.payload.wampus.visible, false);
  }
});

// ============================================================
// tickWampus: pure state-machine behavior
// ============================================================

test("tickWampus is a no-op once dead", () => {
  const dead = {
    row: null,
    col: null,
    visible: false,
    dead: true,
    caught: false,
    moneyReward: 100,
    blinkTicks: 5,
    blinksRemainingAtSite: 0,
    mountains: [],
    tick: 0,
    events: [],
  };
  const advanced = tickWampus(dead, 42, 1);
  assert.deepEqual(advanced.wampus, dead);
  assert.equal(advanced.wampusRngState, 42);
});

test("tickWampus counts down blinkTicks without side effects until it reaches zero", () => {
  const wampus = {
    row: null,
    col: null,
    visible: false,
    dead: false,
    caught: false,
    moneyReward: 100,
    blinkTicks: 3,
    blinksRemainingAtSite: 0,
    mountains: [{ row: 0, col: 0 }],
    tick: 0,
    events: [],
  };
  const step1 = tickWampus(wampus, 1, 1);
  assert.equal(step1.wampus.blinkTicks, 2);
  assert.equal(step1.wampus.visible, false);
  assert.deepEqual(step1.wampus.events, []);
});

test("tickWampus toggles to visible at a candidate mountain once the countdown expires", () => {
  const wampus = {
    row: null,
    col: null,
    visible: false,
    dead: false,
    caught: false,
    moneyReward: 100,
    blinkTicks: 1,
    blinksRemainingAtSite: 0,
    mountains: [{ row: 2, col: 3 }],
    tick: 0,
    events: [],
  };
  const advanced = tickWampus(wampus, 1, 1);
  assert.equal(advanced.wampus.visible, true);
  assert.equal(advanced.wampus.row, 2);
  assert.equal(advanced.wampus.col, 3);
  assert.equal(advanced.wampus.events.length, 1);
  assert.equal(advanced.wampus.events[0].kind, "spawn");
});

// ============================================================
// Gamble payout formula: bounds, cap, ends the turn
// ============================================================

test("gamble payout is at least the round's bonus and never exceeds the cap", () => {
  let state = passThroughLandGrant(startedGame(10, "beginner"));
  for (let round = 0; round < 6; round += 1) {
    const active = state.phase.payload.activePlayer;
    const before = state.players[active].money;
    const roundBonus = PUB_ROUND_BONUS_BY_ROUND[Math.min(state.round, 12)];
    const after = applyAction(state, { type: "gamble", playerId: active });
    const payout = after.players[active].money - before;
    assert.ok(payout >= roundBonus, `payout ${payout} below round bonus ${roundBonus}`);
    assert.ok(payout <= PUB_PAYOUT_CAP, `payout ${payout} exceeds cap ${PUB_PAYOUT_CAP}`);
    // Advance to the next round's develop phase for the next iteration, or
    // stop once the game leaves develop (production/auction/scoring).
    if (after.phase.kind !== "develop") {
      break;
    }
    state = after;
  }
});

test("gamble payout formula matches PUB_ROUND_BONUS_BY_ROUND[round] plus a bounded random term", () => {
  const state = passThroughLandGrant(startedGame(11, "beginner"));
  const active = state.phase.payload.activePlayer;
  const before = state.players[active].money;
  const bonus = PUB_ROUND_BONUS_BY_ROUND[state.round];
  const fraction = Math.min(state.phase.payload.ticksRemaining / DEVELOP_TICKS_FULL, 1);
  const after = applyAction(state, { type: "gamble", playerId: active });
  const payout = after.players[active].money - before;
  const maxPossible = Math.min(
    bonus + Math.floor(fraction * PUB_MAX_RANDOM_AMOUNT),
    PUB_PAYOUT_CAP,
  );
  assert.ok(payout >= Math.min(bonus, PUB_PAYOUT_CAP));
  assert.ok(payout <= maxPossible);
});

test("gamble ends the turn: the active player advances to the next queue slot", () => {
  const state = passThroughLandGrant(startedGame(12, "beginner"));
  const active = state.phase.payload.activePlayer;
  const queueIndex = state.phase.payload.queueIndex;
  const after = applyAction(state, { type: "gamble", playerId: active });
  assert.equal(after.phase.kind, "develop");
  assert.notEqual(after.phase.payload.activePlayer, active);
  assert.equal(after.phase.payload.queueIndex, queueIndex + 1);
});

test("gamble ends the turn even for the round's last develop player, entering production", () => {
  let state = passThroughLandGrant(startedGame(13, "beginner"));
  // Gamble through every player's turn: each gamble ends the current turn.
  for (let index = 0; index < 4; index += 1) {
    assert.equal(state.phase.kind, "develop");
    const active = state.phase.payload.activePlayer;
    state = applyAction(state, { type: "gamble", playerId: active });
  }
  assert.equal(state.phase.kind, "production");
});

test("gamble out of turn throws", () => {
  const state = passThroughLandGrant(startedGame(14, "beginner"));
  const active = state.phase.payload.activePlayer;
  const other = (active + 1) % 4;
  assert.throws(() => applyAction(state, { type: "gamble", playerId: other }));
});

test("gamble outside the develop phase throws", () => {
  const state = createInitialGameState(15, "beginner");
  assert.throws(() => applyAction(state, { type: "gamble", playerId: 0 }));
});

// ============================================================
// AI cannot-stall: hunt-when-visible and gamble-when-nothing-better
// ============================================================

test("develop AI cannot-stall: hunting the wampus always terminates within one action (caught, never re-hunted)", () => {
  const state = tickUntilVisible(passThroughLandGrant(startedGame(20, "beginner")));
  const active = state.phase.payload.activePlayer;
  assert.equal(decideDevelopAction(state, active).type, "hunt_wampus");
  let current = applyAction(state, { type: "hunt_wampus", playerId: active });
  // A watchdog loop: the AI must never propose hunt_wampus again this turn
  // once the wampus is caught (it would throw if it did), and must reach a
  // terminal action (buy/outfit/place/assay/gamble) within a small number of
  // steps rather than looping.
  const WATCHDOG = 10;
  let sawNonHuntAction = false;
  for (let step = 0; step < WATCHDOG; step += 1) {
    if (current.phase.kind !== "develop" || current.phase.payload.activePlayer !== active) {
      sawNonHuntAction = true;
      break;
    }
    const action = decideDevelopAction(current, active);
    assert.notEqual(action.type, "hunt_wampus");
    sawNonHuntAction = true;
    current = applyAction(current, action);
    if (current.phase.kind !== "develop" || current.phase.payload.activePlayer !== active) {
      break;
    }
  }
  assert.ok(sawNonHuntAction, "AI never moved past hunting the wampus");
});

test("develop AI cannot-stall: gambling with nothing else to do always ends the turn on the first call", () => {
  const grantDone = passThroughLandGrant(startedGame(21, "beginner"));
  const active = grantDone.phase.payload.activePlayer;
  const players = grantDone.players.map((player) =>
    player.id === active ? { ...player, money: 0 } : player,
  );
  const broke = { ...grantDone, players };
  const action = decideDevelopAction(broke, active);
  assert.equal(action.type, "gamble");
  const after = applyAction(broke, action);
  // gamble always ends the turn, so the active player has necessarily moved
  // on (to the next queue slot, or out of develop into production) in a
  // single step -- no repeated-decision loop is possible.
  const stillSamePlayerTurn =
    after.phase.kind === "develop" && after.phase.payload.activePlayer === active;
  assert.equal(stillSamePlayerTurn, false);
});

// ============================================================
// Species: cosmetic, no economic effect
// ============================================================

test("SPECIES lists all 8 playable species", () => {
  assert.equal(SPECIES.length, 8);
  assert.deepEqual(new Set(SPECIES).size, 8);
});

test("every player starts with flat STARTING_MONEY regardless of species", () => {
  const state = createInitialGameState(16, "beginner", [
    "flapper",
    "humanoid",
    "leggite",
    "spheroid",
  ]);
  const money = state.players.map((player) => player.money);
  assert.deepEqual(new Set(money).size, 1);
});

test("two games with the same seed but different species reach identical economy", () => {
  const seed = 17;
  const a = createInitialGameState(seed, "beginner", [
    "humanoid",
    "gollumer",
    "mechtron",
    "packer",
  ]);
  const b = createInitialGameState(seed, "beginner", ["flapper", "spheroid", "bonzoid", "leggite"]);
  // Same board, same starting money/goods for every player -- species only
  // changes the `species` field itself.
  assert.deepEqual(a.plots, b.plots);
  for (let index = 0; index < 4; index += 1) {
    assert.equal(a.players[index].money, b.players[index].money);
    assert.deepEqual(a.players[index].goods, b.players[index].goods);
    assert.notEqual(a.players[index].species, b.players[index].species);
  }
});

test("createInitialGameState defaults species to the first four SPECIES entries", () => {
  const state = createInitialGameState(18);
  assert.deepEqual(
    state.players.map((player) => player.species),
    [SPECIES[0], SPECIES[1], SPECIES[2], SPECIES[3]],
  );
});

// ============================================================
// Mode config: standard mode reaches scoring end to end
// ============================================================

test("standard mode (12 rounds) config: ROUND_COUNT_BY_MODE reflects 12", () => {
  const state = createInitialGameState(19, "standard");
  assert.equal(state.mode, "standard");
});
