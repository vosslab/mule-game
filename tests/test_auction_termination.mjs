// Node reducer-level regression tests pinning the goods-auction termination
// guarantee (auction.ts auctionTick + turn.ts applyTick).
//
// Regression for a reported "stall": in a browser walkthrough of seed 3
// beginner, the energy window sat with ticksRemaining=8, idleTicks=0, prices
// frozen at the seat positions (seller 45 = ceiling, buyers 10 = floor) for
// 170+ polls. The frozen ticksRemaining/idleTicks are createAuctionPayload's
// initial values and the frozen prices are the initial seats, so the payload
// was stuck at tick 0: the UI driver was holding the clock waiting for a human
// role commit and never dispatched a tick. The ENGINE itself always terminates
// when it is actually ticked -- these tests lock that in so a future change to
// the tick loop, quiet-tick countdown, or trade matching cannot reintroduce a
// window that fails to finish.
//
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { createAuctionPayload } from "../src/engine/auction.ts";
import { AUCTION_MAX_TICKS, AUCTION_IDLE_TIMEOUT } from "../src/engine/constants.ts";

// A round-1, post-start state. Land grant has not run, so the board is empty
// (no installed M.U.L.E.s -> energy critical is 1).
function baseState(seed) {
  return applyAction(createInitialGameState(seed), { type: "start_game" });
}

// Replace the four-player tuple with edited copies (money/goods overrides).
function withPlayers(state, overrides) {
  const players = state.players.map((player, index) => ({
    ...player,
    ...(overrides[index] ?? {}),
    goods: { ...player.goods, ...(overrides[index]?.goods ?? {}) },
  }));
  return { ...state, players };
}

// Force a good's store stock and pin its band to a known floor/ceiling, so the
// energy window reproduces the reported band exactly (floor 10, ceiling 45).
function withEnergyBand(state, stock, floor, ceiling) {
  const store = {
    ...state.store,
    stock: { ...state.store.stock, energy: stock },
    buyPrice: { ...state.store.buyPrice, energy: floor },
    sellPrice: { ...state.store.sellPrice, energy: ceiling },
  };
  return { ...state, store };
}

// Build the reported energy window: seat 0 holds 2 energy (above critical 1,
// so it auto-seats as a seller at the ceiling walking down), seats 1-3 hold 0
// (auto-seat as buyers at the floor walking up), and the store holds no energy.
function reportedEnergyWindow(seed, intentOverrides) {
  let state = withPlayers(baseState(seed), {
    0: { money: 100, goods: { energy: 2 } },
    1: { money: 20, goods: { energy: 0 } },
    2: { money: 20, goods: { energy: 0 } },
    3: { money: 20, goods: { energy: 0 } },
  });
  state = withEnergyBand(state, 0, 10, 45);
  const payload = createAuctionPayload(state, "energy");
  let participants = payload.participants;
  if (intentOverrides !== undefined) {
    participants = participants.map((entry) => ({
      ...entry,
      ...(intentOverrides[entry.playerId] ?? {}),
    }));
  }
  return {
    ...state,
    phase: {
      kind: "auction",
      payload: { ...payload, participants, skipped: false, finished: false },
    },
  };
}

// Tick the auction until it finishes or a hard cap is hit, asserting the tick
// counter strictly increases every step (proof the window is never frozen).
function tickToFinish(state, cap) {
  let last = state.phase.payload.tick;
  let steps = 0;
  while (state.phase.kind === "auction" && !state.phase.payload.finished && steps < cap) {
    state = applyAction(state, { type: "tick" });
    const now = state.phase.payload.tick;
    assert.equal(now, last + 1, `tick must advance every step (was ${last}, got ${now})`);
    last = now;
    steps += 1;
  }
  return { state, steps };
}

test("the reported zero-stock energy window terminates well within the tick ceiling", () => {
  const start = reportedEnergyWindow(3);
  // Reproduce the reported entry state: seat 0 seller at the ceiling walking
  // down, seats 1-3 buyers at the floor walking up, no store energy stock.
  const p = start.phase.payload;
  assert.equal(p.skipped, false);
  assert.equal(p.storeStock, 0);
  assert.equal(p.priceFloor, 10);
  assert.equal(p.priceCeiling, 45);
  assert.equal(p.tick, 0);
  const seat0 = p.participants.find((entry) => entry.playerId === 0);
  assert.equal(seat0.role, "seller");
  assert.equal(seat0.price, 45);
  assert.equal(seat0.intent, "down");
  for (const id of [1, 2, 3]) {
    const buyer = p.participants.find((entry) => entry.playerId === id);
    assert.equal(buyer.role, "buyer");
    assert.equal(buyer.price, 10);
    assert.equal(buyer.intent, "up");
  }

  const { state, steps } = tickToFinish(start, AUCTION_MAX_TICKS + 10);
  assert.equal(state.phase.payload.finished, true, "the window must finish");
  // The band is only 35 wide and every participant clamps at an edge, so the
  // window goes quiet and finishes in a few dozen ticks -- far below the 400
  // hard ceiling. A regression that stops the quiet-tick countdown would push
  // this toward the ceiling and trip this bound.
  assert.ok(steps <= 60, `expected termination within ~40 ticks, took ${steps}`);
  assert.ok(steps < AUCTION_MAX_TICKS, `must finish before the ${AUCTION_MAX_TICKS} ceiling`);
});

test("a non-crossing zero-stock energy window still finishes via the idle timeout", () => {
  // Seats walk AWAY from each other and clamp immediately: the seller is at the
  // ceiling with intent up (clamped), buyers at the floor with intent down
  // (clamped). Nothing moves and nothing trades, so quiet ticks accrue and the
  // window ends at the idle timeout rather than hanging.
  const start = reportedEnergyWindow(3, {
    0: { intent: "up" },
    1: { intent: "down" },
    2: { intent: "down" },
    3: { intent: "down" },
  });
  const { state, steps } = tickToFinish(start, AUCTION_MAX_TICKS + 10);
  assert.equal(state.phase.payload.finished, true);
  assert.equal(state.phase.payload.trades.length, 0);
  // No movement from tick 1 on, so the idle run ends it at the timeout.
  assert.equal(steps, AUCTION_IDLE_TIMEOUT);
});

test("a sold-out seller with no store stock terminates instead of spinning", () => {
  // The sole seller (seat 0, 2 units) and the buyers are held crossed at 20, so
  // a unit trades to a buyer and then trading dries up: the store holds no
  // energy stock to sell and the remaining crossed bid cannot execute. Nothing
  // moves either (everyone holds), so the window must go quiet and end -- it
  // must not spin once trading stops. This is the termination side of the
  // ROADMAP "seller-out-of-goods store fallback" case.
  const start = reportedEnergyWindow(3, {
    0: { intent: "hold", price: 20 },
    1: { intent: "hold", price: 20 },
    2: { intent: "hold", price: 20 },
    3: { intent: "hold", price: 20 },
  });
  const { state, steps } = tickToFinish(start, AUCTION_MAX_TICKS + 10);
  assert.equal(state.phase.payload.finished, true);
  assert.ok(steps < AUCTION_MAX_TICKS, `must finish before the ${AUCTION_MAX_TICKS} ceiling`);
  // Exactly 2 units clear, derived from the engine rules, not observed and
  // pinned blindly: seat 0 holds 2 energy and all four participants hold at
  // price 20, so on tick 1 selectTrade's bid-major scan picks buyer id 1
  // (lowest id among the tied price-20 buyers) against seat 0's ask, trading
  // immediately (transferCooldown(1) = AUCTION_TRANSFER_START_TICKS = 1). One
  // quiet cooldown tick later, seat 0 still holds 1 unit, so the next resolve
  // trades buyer id 2 against it (transferCooldown(2) = 2, floored at
  // AUCTION_TRANSFER_MIN_TICKS). After that cooldown, seat 0 holds 0 units:
  // its ask remains ranked but canExecute always fails the goods check, and
  // the bid-major scan has no other ask to fall through to (no store stock),
  // so selectTrade returns null forever after and the window goes quiet.
  assert.equal(state.phase.payload.trades.length, 2, "exactly 2 units clear before drying up");
});
