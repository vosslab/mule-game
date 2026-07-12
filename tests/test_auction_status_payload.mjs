// The auction STATUS beat: AuctionPayload.status, assembled from the round
// ledger the engine RECORDS at every seam that moves a player's goods.
//
// The load-bearing assertion is the reconciliation identity
//   previous - usage - spoilage + production + eventDelta === held
// checked on real played rounds. It is the reason the ledger is recorded rather
// than recomputed from rule constants: a recomputation would still produce
// plausible numbers after a missed seam, whereas a missed seam breaks this
// identity loudly. Rounds with goods-mutating events (the home-world package,
// the wandering traveler's smithore, a forced space-pirates crystite wipe) are
// covered specifically, since those are the cases a reconstruction gets wrong.
//
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { createAuctionPayload } from "../src/engine/auction.ts";
import { decideLandGrantAction, decideLandAuctionAction } from "../src/ai/land_ai.ts";
import { decideDevelopAction } from "../src/ai/develop_ai.ts";
import { decideAuctionActions } from "../src/ai/auction_ai.ts";
import { RESOURCES } from "../src/engine/player.ts";

// Watchdog: fail loudly instead of hanging forever if the AI/engine softlocks.
const WATCHDOG_LIMIT = 20000;

// Seeds whose played games exercise a goods-mutating PERSONAL event (seed 99
// records food, energy, and smithore event deltas) and one that records none
// (seed 2026), so both the event and no-event paths are reconciled.
const SEED_WITH_EVENTS = 99;
const SEED_WITHOUT_EVENTS = 2026;

// Seed 4 fires the Glac-Elves food halving (a NEGATIVE goods delta) and, in
// round 3, carries live food production for the forced-pest case to bite into.
const SEED_WITH_HALVING = 4;

// What the STATUS beat's books must balance to.
function reconcile(entry) {
  return entry.previous - entry.usage - entry.spoilage + entry.production + entry.eventDelta;
}

// Play a full 4-AI game, capturing every auction window's status at window
// creation (tick 0) alongside that round's start-of-round holdings.
//
// Goods never move during land grant or land auction (those phases move money
// and land), so a snapshot taken in either phase IS the round-start holding --
// which is what the ledger's `previous` should equal.
function playCollectingStatuses(seed, options = {}) {
  // `forcedColonyEvent` is { round, type }: schedule a specific colony event for
  // a specific round. `injectGoods` seeds holdings for that same round, applied
  // BEFORE the develop phase snapshots the ledger so they are genuinely
  // round-start holdings.
  const forced = options.forcedColonyEvent ?? null;
  const injectGoods = options.injectGoods ?? null;
  const setupRound = forced === null ? 1 : forced.round;
  let state = applyAction(createInitialGameState(seed), { type: "start_game" });
  const captured = [];
  const roundStartGoods = new Map();
  // What the forced round's colony event actually resolved to, so a test can
  // prove the event really fired and applied rather than silently no-opping.
  let firedColonyEvent = null;
  let injected = false;
  let steps = 0;

  while (state.phase.kind !== "scoring") {
    steps += 1;
    if (steps > WATCHDOG_LIMIT) {
      throw new Error(`playCollectingStatuses: watchdog exceeded in phase ${state.phase.kind}`);
    }
    const phase = state.phase;

    if (phase.kind === "land_grant" || phase.kind === "land_auction") {
      if (!injected && state.round === setupRound && (forced !== null || injectGoods !== null)) {
        injected = true;
        if (injectGoods !== null) {
          state = {
            ...state,
            players: state.players.map((player) => ({
              ...player,
              goods: { ...player.goods, ...injectGoods },
            })),
          };
        }
        if (forced !== null) {
          const schedule = [...state.colonyEventSchedule];
          schedule[forced.round] = forced.type;
          state = { ...state, colonyEventSchedule: schedule };
        }
      }
      roundStartGoods.set(
        state.round,
        state.players.map((player) => ({ ...player.goods })),
      );
    }

    if (phase.kind === "production" && state.round === setupRound) {
      firedColonyEvent = phase.payload.colonyEvent ?? null;
    }

    if (phase.kind === "land_grant") {
      const picker = phase.payload.pickOrder[phase.payload.pickIndex];
      state = applyAction(state, decideLandGrantAction(state, picker));
    } else if (phase.kind === "land_auction") {
      if (state.phase.payload.finished) {
        state = applyAction(state, { type: "end_land_auction" });
      } else {
        for (let playerId = 0; playerId < 4; playerId += 1) {
          const action = decideLandAuctionAction(state, playerId);
          if (action !== null) {
            state = applyAction(state, action);
          }
        }
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "develop") {
      const active = phase.payload.activePlayer;
      state = applyAction(state, decideDevelopAction(state, active));
      // Only tick when the same player's turn continues; end_turn already
      // advanced to the next player (or to production) without a tick.
      if (state.phase.kind === "develop" && state.phase.payload.activePlayer === active) {
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "production") {
      state = applyAction(state, { type: "tick" });
    } else if (phase.kind === "auction") {
      if (phase.payload.tick === 0) {
        captured.push({
          round: state.round,
          good: phase.payload.good,
          status: phase.payload.status,
          roundStartGoods: roundStartGoods.get(state.round),
        });
      }
      for (let playerId = 0; playerId < 4; playerId += 1) {
        const action = decideAuctionActions(state, playerId);
        if (action !== null) {
          state = applyAction(state, action);
        }
      }
      state = applyAction(state, { type: "tick" });
      if (state.phase.kind === "auction" && state.phase.payload.finished) {
        state = applyAction(state, { type: "end_auction" });
      }
    } else {
      throw new Error(`playCollectingStatuses: unexpected phase ${phase.kind}`);
    }
  }
  return { captured, firedColonyEvent };
}

// Build a state whose players and store hold the given goods, for the crafted
// colony-verdict cases.
function withGoodsAndStock(seed, playerGoods, storeStock) {
  const state = applyAction(createInitialGameState(seed), { type: "start_game" });
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      goods: { ...player.goods, ...playerGoods },
    })),
    store: { ...state.store, stock: { ...state.store.stock, ...storeStock } },
  };
}

test("every auction window's status reconciles: previous - usage - spoilage + production + eventDelta = held", () => {
  for (const seed of [SEED_WITH_EVENTS, SEED_WITHOUT_EVENTS]) {
    const { captured } = playCollectingStatuses(seed);
    assert.ok(captured.length > 0, `seed ${seed} reached no auction window`);
    for (const { round, good, status } of captured) {
      assert.equal(status.good, good);
      assert.equal(status.accounting.length, 4);
      for (const entry of status.accounting) {
        assert.equal(
          reconcile(entry),
          entry.held,
          `seed ${seed} round ${round} ${good} player ${entry.playerId}: ` +
            `books do not balance (${JSON.stringify(entry)})`,
        );
      }
    }
  }
});

test("status.previous is the round-start holding, so the ledger resets each round", () => {
  const { captured } = playCollectingStatuses(SEED_WITH_EVENTS);
  for (const { round, good, status, roundStartGoods } of captured) {
    for (const entry of status.accounting) {
      assert.equal(
        entry.previous,
        roundStartGoods[entry.playerId][good],
        `round ${round} ${good} player ${entry.playerId}: previous is not the round-start holding`,
      );
    }
  }
});

test("a goods-mutating personal event is recorded as an event delta and still reconciles", () => {
  const { captured } = playCollectingStatuses(SEED_WITH_EVENTS);
  const eventEntries = [];
  for (const { good, status } of captured) {
    for (const entry of status.accounting) {
      if (entry.eventDelta !== 0) {
        eventEntries.push({ good, entry });
      }
    }
  }
  assert.ok(
    eventEntries.length > 0,
    "seed exercised no goods-mutating event, so the eventDelta path went untested",
  );
  for (const { good, entry } of eventEntries) {
    assert.equal(reconcile(entry), entry.held, `${good}: event delta broke the books`);
  }
});

test("space pirates wiping crystite is recorded as an event delta, not a hole in the books", () => {
  // Pirates zero every player's crystite inventory at production. Injected
  // crystite is held from round start, so the wipe must show up as a negative
  // eventDelta of exactly what was taken -- if it were unrecorded, the
  // reconciliation below would break instead of quietly reporting a wrong held.
  // Natural AI games rarely mine crystite, so this seam is forced rather than
  // left to chance: an unexercised recording path is not a proven one.
  const crystiteHeld = 6;
  const { captured, firedColonyEvent } = playCollectingStatuses(4242, {
    forcedColonyEvent: { round: 1, type: "pirate_ship" },
    injectGoods: { crystite: crystiteHeld },
  });
  assert.equal(firedColonyEvent?.type, "pirate_ship", "the pirate event never actually applied");

  const crystiteWindow = captured.find((entry) => entry.good === "crystite");
  assert.notEqual(crystiteWindow, undefined, "no crystite window was reached");
  for (const entry of crystiteWindow.status.accounting) {
    assert.equal(entry.previous, crystiteHeld, "round-start crystite was not the injected holding");
    assert.ok(entry.eventDelta < 0, "the pirate wipe was not recorded as a negative event delta");
    assert.equal(entry.held, 0, "pirates should have left no crystite");
    assert.equal(reconcile(entry), entry.held, "the pirate wipe broke the books");
  }
});

test("an event that HALVES a holding is recorded as a negative event delta and reconciles", () => {
  // The Glac-Elves personal event (events.ts) halves a player's food outright.
  // It is the negative-direction counterpart to the grant events, and it is the
  // case a reconstruction would most easily get wrong (the amount lost depends
  // on what the player happened to be holding, not on any rule constant). Seed 4
  // fires it naturally, so the recording is proven on a real played round.
  const { captured } = playCollectingStatuses(SEED_WITH_HALVING);
  const losses = [];
  for (const { good, status } of captured) {
    for (const entry of status.accounting) {
      if (good === "food" && entry.eventDelta < 0) {
        losses.push(entry);
      }
    }
  }
  assert.ok(
    losses.length > 0,
    "no food-halving event fired, so the negative event-delta path went untested",
  );
  for (const entry of losses) {
    assert.equal(reconcile(entry), entry.held, "a halved holding broke the books");
  }
});

test("colony pest is recorded as reduced production, not as an event delta on a holding", () => {
  // The category split this ledger depends on: an event that reshapes a PLOT'S
  // YIELD (pest devours one food plot's harvest) reaches the player through
  // `production`, while an event that reaches into a HOLDING (pirates, elves)
  // is an `eventDelta`. Recording pest in both places would double-count it and
  // break the books; recording it in neither would also break them. Seed 4's
  // round 3 has live food production for pest to eat into.
  const { captured, firedColonyEvent } = playCollectingStatuses(SEED_WITH_HALVING, {
    forcedColonyEvent: { round: 3, type: "pest_attack" },
  });
  assert.equal(firedColonyEvent?.type, "pest_attack", "the pest event never actually applied");

  const pestRoundFood = captured.find((entry) => entry.round === 3 && entry.good === "food");
  assert.notEqual(pestRoundFood, undefined, "no food window was reached in the pest round");
  assert.ok(
    pestRoundFood.status.accounting.some((entry) => entry.production > 0),
    "the pest round recorded no food production at all, so pest had nothing to eat into",
  );
  for (const entry of pestRoundFood.status.accounting) {
    assert.equal(reconcile(entry), entry.held, "the pest round broke the books");
  }
});

test("develop-turn food consumption is recorded as usage, and the ores never accrue usage", () => {
  const { captured } = playCollectingStatuses(SEED_WITH_EVENTS);
  let foodUsageSeen = false;
  for (const { good, status } of captured) {
    for (const entry of status.accounting) {
      if (good === "food" && entry.usage > 0) {
        foodUsageSeen = true;
      }
      // Only food (develop timer) and energy (powering mules) are consumed;
      // the ores have no usage seam, so recording any would be a mis-attribution.
      if (good === "smithore" || good === "crystite") {
        assert.equal(entry.usage, 0, `${good} recorded usage it has no seam for`);
      }
    }
  }
  assert.ok(foodUsageSeen, "no develop-turn food consumption was recorded across a whole game");
});

test("colony verdict is surplus or shortage for food and energy, and always neutral for the ores", () => {
  const { captured } = playCollectingStatuses(SEED_WITH_EVENTS);
  const seen = new Set();
  for (const { good, status } of captured) {
    seen.add(good);
    if (good === "food" || good === "energy") {
      assert.ok(
        status.verdict === "surplus" || status.verdict === "shortage",
        `${good} verdict should be a verdict, got ${status.verdict}`,
      );
    } else {
      assert.equal(status.verdict, null, `${good} carries no colony need, so it takes no verdict`);
    }
  }
  for (const good of RESOURCES) {
    assert.ok(seen.has(good), `no ${good} window was observed`);
  }
});

test("a colony that holds none of a good is in shortage; one holding far more is in surplus", () => {
  // Behavioral, not a constant echo: the colony always needs SOME food and
  // energy, so zero supply must read as a shortage and a supply far above any
  // possible need must read as a surplus.
  const starved = withGoodsAndStock(5, { food: 0, energy: 0 }, { food: 0, energy: 0 });
  assert.equal(createAuctionPayload(starved, "food").status.verdict, "shortage");
  assert.equal(createAuctionPayload(starved, "energy").status.verdict, "shortage");

  const glutted = withGoodsAndStock(5, { food: 500, energy: 500 }, { food: 500, energy: 500 });
  assert.equal(createAuctionPayload(glutted, "food").status.verdict, "surplus");
  assert.equal(createAuctionPayload(glutted, "energy").status.verdict, "surplus");

  // The ores stay neutral no matter how the colony is stocked.
  assert.equal(createAuctionPayload(starved, "smithore").status.verdict, null);
  assert.equal(createAuctionPayload(glutted, "crystite").status.verdict, null);
});

test("status accounting carries one entry per player, in players order", () => {
  const state = applyAction(createInitialGameState(11), { type: "start_game" });
  const status = createAuctionPayload(state, "food").status;
  assert.deepEqual(
    status.accounting.map((entry) => entry.playerId),
    [0, 1, 2, 3],
  );
});
