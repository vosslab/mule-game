// Node unit and property tests for the personal + colony event systems
// (src/engine/events.ts). Covers the round-scaled money curve,
// personal-event fairness invariants over many seeded AI games, the money
// clamp-at-0 invariant, the pre-shuffled colony deck's caps and forced finale,
// the A/B category split, and each colony effect. Run via check_codebase.sh:
// node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState, enterProduction } from "../src/engine/turn.ts";
import { computeProduction, plotKey } from "../src/engine/economy.ts";
import { createRng } from "../src/engine/rng.ts";
import { muleCurve } from "../src/engine/round_scale.ts";
import {
  applyPersonalEvent,
  drawPersonalEvent,
  generateColonySchedule,
  isCategoryAColony,
  resolveColonyPostProduction,
  resolveColonyPreProduction,
} from "../src/engine/events.ts";
import { decideLandGrantAction, decideLandAuctionAction } from "../src/ai/land_ai.ts";
import { decideDevelopAction } from "../src/ai/develop_ai.ts";
import { decideAuctionActions } from "../src/ai/auction_ai.ts";
import { ROUND_COUNT_BY_MODE, PRODUCTION_MAX_YIELD } from "../src/engine/constants.ts";

const WATCHDOG_LIMIT = 300000;

// ============================================================
// muleCurve (1-based round base)
// ============================================================

test("muleCurve = 25 * (floor(round/4) + 1) for 1-based rounds", () => {
  // planet_mule plays rounds 1..12 (beginNextRound increments firstRound 0->1
  // before round 1), so 25 for rounds 1-3, 50 for 4-7, 75 for 8-11, 100 for 12.
  assert.equal(muleCurve(1), 25);
  assert.equal(muleCurve(3), 25);
  assert.equal(muleCurve(4), 50);
  assert.equal(muleCurve(7), 50);
  assert.equal(muleCurve(8), 75);
  assert.equal(muleCurve(11), 75);
  assert.equal(muleCurve(12), 100);
});

// ============================================================
// Personal-event fairness properties over many seeded games
// ============================================================

// Drive one full all-AI game, collecting every personal event that fired with
// the firing player's rank (from the develop payload's rank-order snapshot).
function playAndCollect(seed, mode) {
  let state = applyAction(createInitialGameState(seed, mode), { type: "start_game" });
  const events = [];
  const seenTurns = new Set();
  let steps = 0;
  while (state.phase.kind !== "scoring") {
    steps += 1;
    if (steps > WATCHDOG_LIMIT) {
      throw new Error(`playAndCollect watchdog at ${state.phase.kind}`);
    }
    const phase = state.phase;
    if (phase.kind === "develop") {
      const p = phase.payload;
      if (p.event !== undefined) {
        const key = `${state.round}:${p.queueIndex}`;
        if (!seenTurns.has(key)) {
          seenTurns.add(key);
          events.push({
            round: state.round,
            rank: p.rankOrder.indexOf(p.activePlayer) + 1,
            good: p.event.good,
            name: p.event.name,
            playerId: p.activePlayer,
          });
        }
      }
      const active = p.activePlayer;
      state = applyAction(state, decideDevelopAction(state, active));
      if (state.phase.kind === "develop" && state.phase.payload.activePlayer === active) {
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "land_grant") {
      const picker = phase.payload.pickOrder[phase.payload.pickIndex];
      state = applyAction(state, decideLandGrantAction(state, picker));
    } else if (phase.kind === "land_auction") {
      if (phase.payload.finished) {
        state = applyAction(state, { type: "end_land_auction" });
      } else {
        for (let id = 0; id < 4; id += 1) {
          const a = decideLandAuctionAction(state, id);
          if (a !== null) {
            state = applyAction(state, a);
          }
        }
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "production") {
      state = applyAction(state, { type: "tick" });
    } else if (phase.kind === "auction") {
      if (phase.payload.finished) {
        state = applyAction(state, { type: "end_auction" });
      } else {
        for (let id = 0; id < 4; id += 1) {
          const a = decideAuctionActions(state, id);
          if (a !== null) {
            state = applyAction(state, a);
          }
        }
        state = applyAction(state, { type: "tick" });
      }
    } else {
      throw new Error(`unexpected phase ${phase.kind}`);
    }
  }
  return { state, events };
}

test("personal-event fairness holds over many seeded standard games", () => {
  const lastRound = ROUND_COUNT_BY_MODE.standard;
  let totalEvents = 0;
  for (let seed = 5000; seed < 5040; seed += 1) {
    const { events } = playAndCollect(seed, "standard");
    totalEvents += events.length;
    const namesThisGame = new Set();
    for (const ev of events) {
      // No event ever fires in round 1.
      assert.notEqual(ev.round, 1, `event fired in round 1 (seed ${seed})`);
      // Rank 1 (leader) never receives a good event.
      if (ev.good) {
        assert.notEqual(ev.rank, 1, `leader got good event ${ev.name} (seed ${seed})`);
      }
      // The bottom two ranks (3 and 4) never receive a bad event.
      if (!ev.good) {
        assert.ok(ev.rank <= 2, `rank ${ev.rank} got bad event ${ev.name} (seed ${seed})`);
      }
      // The last two rounds only ever fire good events.
      if (ev.round > lastRound - 2) {
        assert.ok(ev.good, `bad event ${ev.name} in last two rounds (seed ${seed})`);
      }
      // Each event name fires at most once per game (shuffled-deck no-repeat).
      assert.ok(!namesThisGame.has(ev.name), `duplicate event ${ev.name} (seed ${seed})`);
      namesThisGame.add(ev.name);
    }
  }
  // The system must actually produce events, or the properties are vacuous.
  assert.ok(totalEvents > 0, "no personal events fired across 40 games");
});

// ============================================================
// Personal-event money clamp at 0
// ============================================================

test("a bad personal event never drives a player's money below zero", () => {
  // Build a round-2 state where player 0 is nearly broke and force-draw a bad
  // money event by seeding a one-event deck; the penalty clamps money at 0.
  const base = applyAction(createInitialGameState(1, "standard"), { type: "start_game" });
  const players = base.players.map((p) =>
    p.id === 0 ? { ...p, money: 10, goods: { food: 5, energy: 5, smithore: 0, crystite: 0 } } : p,
  );
  const state = {
    ...base,
    round: 2,
    players,
    playerEventDeck: ["bat_lizard"],
    playerEventCursor: 0,
  };
  const applied = applyPersonalEvent(state, 0, "bat_lizard");
  assert.equal(applied.state.players[0].money, 0);
  // The recorded delta reflects the clamp (lost only what they had, not 4*m).
  assert.equal(applied.result.moneyDelta, -10);
  assert.equal(applied.result.good, false);
});

test("drawPersonalEvent never fires in round 1 and consumes no roll", () => {
  const base = applyAction(createInitialGameState(1, "standard"), { type: "start_game" });
  const draw = drawPersonalEvent(base, 0, 2, 5);
  assert.equal(draw.name, null);
  assert.equal(draw.rngState, base.playerEventRngState);
});

// ============================================================
// Colony deck (schedule) generation
// ============================================================

const COLONY_CAPS = {
  pirate_ship: 2,
  acid_rain: 3,
  sunspot: 3,
  fire_in_store: 2,
  pest_attack: 3,
  planet_quake: 3,
  meteorite: 2,
  radiation: 2,
};
const EARLY_TYPES = new Set(["pirate_ship", "acid_rain", "sunspot", "fire_in_store"]);

test("colony schedule: null round-0 slot, forced ship-return finale, early-only rounds 1-2", () => {
  for (let seed = 7000; seed < 7040; seed += 1) {
    for (const mode of ["beginner", "standard"]) {
      const lastRound = ROUND_COUNT_BY_MODE[mode];
      const { schedule } = generateColonySchedule(seed, lastRound);
      assert.equal(schedule[0], null, `round-0 slot not null (seed ${seed}, ${mode})`);
      assert.equal(schedule[lastRound], "ship_returns", `finale not ship (seed ${seed}, ${mode})`);
      assert.ok(EARLY_TYPES.has(schedule[1]), `round 1 not early (seed ${seed}): ${schedule[1]}`);
      assert.ok(EARLY_TYPES.has(schedule[2]), `round 2 not early (seed ${seed}): ${schedule[2]}`);
    }
  }
});

test("colony schedule respects every type's deck cap and has exactly one ship return", () => {
  for (let seed = 8000; seed < 8030; seed += 1) {
    const lastRound = ROUND_COUNT_BY_MODE.standard;
    const { schedule } = generateColonySchedule(seed, lastRound);
    const counts = {};
    let shipCount = 0;
    for (let round = 1; round <= lastRound; round += 1) {
      const type = schedule[round];
      if (type === "ship_returns") {
        shipCount += 1;
        continue;
      }
      counts[type] = (counts[type] ?? 0) + 1;
    }
    assert.equal(shipCount, 1, `expected exactly one ship return (seed ${seed})`);
    for (const [type, count] of Object.entries(counts)) {
      assert.ok(count <= COLONY_CAPS[type], `${type} count ${count} exceeds cap (seed ${seed})`);
    }
  }
});

// ============================================================
// A/B category split
// ============================================================

test("category A is exactly the pre-production events; category B the rest", () => {
  const categoryA = ["acid_rain", "sunspot", "meteorite", "radiation"];
  const categoryB = ["pest_attack", "pirate_ship", "planet_quake", "fire_in_store", "ship_returns"];
  for (const type of categoryA) {
    assert.ok(isCategoryAColony(type), `${type} should be category A`);
  }
  for (const type of categoryB) {
    assert.ok(!isCategoryAColony(type), `${type} should be category B`);
  }
});

// ============================================================
// Colony effect unit tests
// ============================================================

// Build a plot with sensible event-test defaults.
function plot(terrain, owner = null, muleOutfit = null, crystiteLevel = 0) {
  return { terrain, owner, muleOutfit, crystiteLevel, crystiteRevealed: false };
}

// A state with a caller-supplied board and per-player money (player 0 richest
// by default, so player 0 is the rank-1 leader), otherwise the standard-game
// starting state.
function craft(plots, moneyById = [5000, 100, 100, 100]) {
  const base = applyAction(createInitialGameState(1, "standard"), { type: "start_game" });
  const players = base.players.map((p) => ({ ...p, money: moneyById[p.id] ?? p.money }));
  return { ...base, plots, players };
}

test("acid rain sets +food / -energy temporary bonuses on developed food/energy plots", () => {
  const plots = [[plot("river", 0, "food"), plot("plain", 0, "energy"), plot("plain")]];
  const pre = resolveColonyPreProduction(craft(plots), "acid_rain");
  assert.ok(pre.applicable);
  const foodBonus = pre.tempBonusByPlot.get(plotKey(0, 0));
  const energyBonus = pre.tempBonusByPlot.get(plotKey(0, 1));
  assert.ok(foodBonus === 4 || foodBonus === 1, `food bonus ${foodBonus}`);
  assert.ok(energyBonus === -2 || energyBonus === -1, `energy bonus ${energyBonus}`);
  // The undeveloped plot gets no bonus entry.
  assert.equal(pre.tempBonusByPlot.get(plotKey(0, 2)), undefined);
});

test("sunspot gives every energy plot +3, and is not applicable with no energy plot", () => {
  const withEnergy = [[plot("plain", 0, "energy"), plot("river", 0, "food")]];
  const pre = resolveColonyPreProduction(craft(withEnergy), "sunspot");
  assert.ok(pre.applicable);
  assert.equal(pre.tempBonusByPlot.get(plotKey(0, 0)), 3);
  assert.equal(pre.tempBonusByPlot.get(plotKey(0, 1)), undefined);

  const noEnergy = [[plot("river", 0, "food")]];
  const preNone = resolveColonyPreProduction(craft(noEnergy), "sunspot");
  assert.ok(!preNone.applicable);
});

test("meteorite craters an eligible plot: crystite level 4, crater terrain, mule destroyed", () => {
  const plots = [[plot("plain", 0, "smithore", 1), plot("river")]];
  const pre = resolveColonyPreProduction(craft(plots), "meteorite");
  assert.ok(pre.applicable);
  const struck = pre.plots[0][0];
  assert.equal(struck.terrain, "crater");
  assert.equal(struck.crystiteLevel, 4);
  assert.equal(struck.muleOutfit, null);
});

test("radiation removes a leader M.U.L.E.; not applicable when the leader has none", () => {
  const withMule = [[plot("plain", 0, "energy"), plot("plain", 1, "energy")]];
  const pre = resolveColonyPreProduction(craft(withMule), "radiation");
  assert.ok(pre.applicable);
  // The leader is player 0; their mule is gone, the non-leader's remains.
  assert.equal(pre.plots[0][0].muleOutfit, null);
  assert.equal(pre.plots[0][1].muleOutfit, "energy");

  const leaderNoMule = [[plot("plain", 1, "energy")]];
  const preNone = resolveColonyPreProduction(craft(leaderNoMule), "radiation");
  assert.ok(!preNone.applicable);
});

test("fire in store burns food, energy, and smithore stock to zero", () => {
  const state = craft([[plot("plain")]]);
  const post = resolveColonyPostProduction(state, "fire_in_store", []);
  assert.ok(post.applicable);
  assert.equal(post.storeStock.food, 0);
  assert.equal(post.storeStock.energy, 0);
  assert.equal(post.storeStock.smithore, 0);
});

test("pirates zero every crystite plot's production and wipe crystite inventory", () => {
  const state = craft([[plot("plain")]]);
  const perPlot = [
    { row: 0, col: 0, owner: 0, resource: "crystite", amount: 5 },
    { row: 0, col: 1, owner: 1, resource: "smithore", amount: 4 },
  ];
  const post = resolveColonyPostProduction(state, "pirate_ship", perPlot);
  assert.ok(post.applicable);
  assert.ok(post.zeroCrystiteInventory);
  assert.equal(post.perPlot[0].amount, 0);
  assert.equal(post.perPlot[1].amount, 4);
});

test("planetquake halves smithore and crystite production (floored), leaving food/energy", () => {
  const state = craft([[plot("plain")]]);
  const perPlot = [
    { row: 0, col: 0, owner: 0, resource: "smithore", amount: 5 },
    { row: 1, col: 0, owner: 0, resource: "crystite", amount: 3 },
    { row: 2, col: 0, owner: 0, resource: "food", amount: 4 },
  ];
  const post = resolveColonyPostProduction(state, "planet_quake", perPlot);
  assert.ok(post.applicable);
  assert.equal(post.perPlot[0].amount, 2); // floor(5/2)
  assert.equal(post.perPlot[1].amount, 1); // floor(3/2)
  assert.equal(post.perPlot[2].amount, 4); // food untouched
});

test("pest zeroes one leader food plot with positive production; not applicable otherwise", () => {
  const state = craft([[plot("river", 0, "food")]]);
  const perPlot = [{ row: 0, col: 0, owner: 0, resource: "food", amount: 4 }];
  const post = resolveColonyPostProduction(state, "pest_attack", perPlot);
  assert.ok(post.applicable);
  assert.equal(post.perPlot[0].amount, 0);

  // No leader food production -> not applicable.
  const noneState = craft([[plot("plain", 0, "smithore")]]);
  const nonePerPlot = [{ row: 0, col: 0, owner: 0, resource: "smithore", amount: 4 }];
  const postNone = resolveColonyPostProduction(noneState, "pest_attack", nonePerPlot);
  assert.ok(!postNone.applicable);
});

// ============================================================
// enterProduction integration with a forced colony schedule
// ============================================================

test("enterProduction applies a scheduled fire event and reports it on the payload", () => {
  const base = craft([[plot("plain")]]);
  // Force round 3's colony event to fire in store (category B).
  const schedule = base.colonyEventSchedule.slice();
  schedule[3] = "fire_in_store";
  const state = { ...base, round: 3, colonyEventSchedule: schedule };
  const produced = enterProduction(state);
  assert.equal(produced.phase.kind, "production");
  assert.equal(produced.phase.payload.colonyEvent.type, "fire_in_store");
  assert.equal(produced.store.stock.food, 0);
  assert.equal(produced.store.stock.smithore, 0);
});

test("enterProduction applies a scheduled sunspot bonus into energy yields", () => {
  // One energy plot on the plains: base yield 3, +3 sunspot temporary bonus.
  // `computeProduction` (M7) draws an unconditional per-plot gaussian
  // variance from `state.rngState`, so the exact yield is no longer a fixed
  // number; compare against the identical state with no event scheduled
  // instead. `resolveSunspot` draws no randomness of its own (it applies
  // unconditionally to every energy plot), so `state.rngState` -- and thus
  // the shuffle order and variance draw `computeProduction` consumes -- is
  // byte-identical between the two runs, making a direct `>=` comparison
  // robust (clamping can only ever narrow the gap, never invert it).
  const plots = [[plot("plain", 0, "energy")]];
  const base = craft(plots, [5000, 100, 100, 100]);
  const withEnergy = base.players.map((p) =>
    p.id === 0 ? { ...p, goods: { ...p.goods, energy: 10 } } : p,
  );
  // Explicit null baseline: force round 3 to have no scheduled event at all
  // (rather than trusting whatever the shuffled deck happened to assign),
  // so the comparison isolates sunspot's own effect.
  const noEventSchedule = base.colonyEventSchedule.slice();
  noEventSchedule[3] = null;
  const noEventState = {
    ...base,
    round: 3,
    players: withEnergy,
    colonyEventSchedule: noEventSchedule,
  };
  const withoutSunspot = enterProduction(noEventState);

  const sunspotSchedule = base.colonyEventSchedule.slice();
  sunspotSchedule[3] = "sunspot";
  const state = {
    ...base,
    round: 3,
    players: withEnergy,
    colonyEventSchedule: sunspotSchedule,
  };
  const produced = enterProduction(state);
  assert.equal(produced.phase.payload.colonyEvent.type, "sunspot");
  assert.ok(
    produced.phase.payload.yields[0].energy >= withoutSunspot.phase.payload.yields[0].energy,
  );
});

// ============================================================
// computeProduction temporary bonus + [0, PRODUCTION_MAX_YIELD] clamp
// ============================================================

test("a positive temporary bonus clamps a plot's yield at PRODUCTION_MAX_YIELD", () => {
  const plots = [[plot("river", 0, "food")]]; // base food yield 4
  const players = [
    {
      id: 0,
      isHuman: true,
      colorSlot: 0,
      money: 0,
      goods: { food: 0, energy: 5, smithore: 0, crystite: 0 },
    },
  ];
  const bonus = new Map([[plotKey(0, 0), 10]]);
  // +10 pushes the raw capacity to base(4) + 10 = 14 before variance, which
  // clamps to PRODUCTION_MAX_YIELD regardless of the [-6, 6] variance draw
  // (14 - 6 = 8 is still >= PRODUCTION_MAX_YIELD), so the seed does not matter.
  const production = computeProduction(plots, players, 3, createRng(1), {
    tempBonusByPlot: bonus,
  });
  assert.equal(production.yields[0].food, PRODUCTION_MAX_YIELD);
});

test("a large negative temporary bonus clamps a plot's yield at zero, never negative", () => {
  const plots = [[plot("plain", 0, "energy")]]; // base energy yield 3
  const players = [
    {
      id: 0,
      isHuman: true,
      colorSlot: 0,
      money: 0,
      goods: { food: 0, energy: 5, smithore: 0, crystite: 0 },
    },
  ];
  const bonus = new Map([[plotKey(0, 0), -10]]);
  // -10 pushes the raw capacity to base(3) - 10 = -7 before variance, which
  // clamps to 0 regardless of the [-6, 6] variance draw (-7 + 6 = -1 is still
  // negative), so the seed does not matter.
  const production = computeProduction(plots, players, 3, createRng(1), {
    tempBonusByPlot: bonus,
  });
  assert.equal(production.yields[0].energy, 0);
});
