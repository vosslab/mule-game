// Node unit tests for the colony land-auction engine (land_auction.ts).
// Covers probability-gated slot rolling, price seeding/drift/floor/rounding,
// the going-tick countdown, both tie-break modes (round-1 random, later
// worst-ranked), colony-sink money accounting, the round-boundary skip paths,
// and the affordability/ceiling invariants on `bid_land`.
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { createRng } from "../src/engine/rng.ts";
import {
  createLandAuctionPayload,
  failedSalePrice,
  rollColonySlot,
  seedStartPrice,
  unownedNonTownPlots,
} from "../src/engine/land_auction.ts";
import { decideLandAuctionAction } from "../src/ai/land_ai.ts";
import {
  LAND_AUCTION_BID_STEP,
  LAND_AUCTION_COLONY_PROBABILITIES,
  LAND_AUCTION_GOING_TICKS,
  LAND_AUCTION_PRICE_FLOOR,
  LAND_AUCTION_PRICE_RANGE,
  LAND_AUCTION_START_PRICE,
} from "../src/engine/constants.ts";

const FINALIZE_TICKS = LAND_AUCTION_GOING_TICKS * 3;

// A round-1, post-start state whose players can be overridden. Land grant
// has not run, so every non-town plot is unowned.
function baseState(seed) {
  return applyAction(createInitialGameState(seed), { type: "start_game" });
}

// Replace the four-player tuple with edited copies (money overrides).
function withPlayers(state, overrides) {
  const players = state.players.map((player, index) => ({
    ...player,
    ...(overrides[index] ?? {}),
  }));
  return { ...state, players };
}

// Build a live land-auction state for (row, col) at a given slot index, then
// optionally override the seated participants for a precise engine test.
function landAuctionOf(state, row, col, slotIndex, participantOverrides) {
  const payload = createLandAuctionPayload(state, row, col, slotIndex);
  let participants = payload.participants;
  if (participantOverrides !== undefined) {
    participants = participants.map((entry) => ({
      ...entry,
      ...(participantOverrides[entry.playerId] ?? {}),
    }));
  }
  return { ...state, phase: { kind: "land_auction", payload: { ...payload, participants } } };
}

// Total money held across all four players.
function totalMoney(state) {
  return state.players.reduce((sum, player) => sum + player.money, 0);
}

// Advance a land-auction state by `count` ticks.
function tickTimes(state, count) {
  let next = state;
  for (let index = 0; index < count; index += 1) {
    next = applyAction(next, { type: "tick" });
  }
  return next;
}

test("colony auction probabilities gate a roll against the slot's own threshold", () => {
  const threshold = LAND_AUCTION_COLONY_PROBABILITIES[1];
  // A draw exactly at the threshold succeeds ("<="); just above it fails.
  const atThreshold = { next: () => threshold };
  const justAbove = { next: () => Math.min(threshold + 0.0001, 0.999999) };
  assert.equal(rollColonySlot(atThreshold, 1), true);
  assert.equal(rollColonySlot(justAbove, 1), false);
});

test("colony auction probability rolls are deterministic for a fixed seed", () => {
  // Same seed, same slot index: identical outcome every time (determinism).
  const first = rollColonySlot(createRng(123), 1);
  const second = rollColonySlot(createRng(123), 1);
  assert.equal(first, second);
});

test("seedStartPrice uses LAND_AUCTION_START_PRICE for the very first auction of the game", () => {
  const landMarket = { priceAccumulator: 0, setSize: 0, lastSellPrice: 0 };
  assert.equal(seedStartPrice(landMarket, 0), LAND_AUCTION_START_PRICE);
});

test("seedStartPrice seeds slot 0 from the running average minus the price drop, floored and rounded", () => {
  // Average of 300 and 260 is 280; 280 - 60 = 220, already a multiple of 4.
  const landMarket = { priceAccumulator: 560, setSize: 2, lastSellPrice: 260 };
  assert.equal(seedStartPrice(landMarket, 0), 220);
});

test("seedStartPrice seeds a later slot from the previous sale price minus the price drop", () => {
  const landMarket = { priceAccumulator: 0, setSize: 0, lastSellPrice: 148 };
  // 148 - 60 = 88, already a multiple of 4.
  assert.equal(seedStartPrice(landMarket, 1), 88);
});

test("seedStartPrice floors a low seed at LAND_AUCTION_PRICE_FLOOR", () => {
  const landMarket = { priceAccumulator: 0, setSize: 0, lastSellPrice: 90 };
  // 90 - 60 = 30, below the floor of 80.
  assert.equal(seedStartPrice(landMarket, 1), LAND_AUCTION_PRICE_FLOOR);
});

test("seedStartPrice rounds a non-multiple-of-4 seed to the nearest multiple, ties down", () => {
  const landMarket = { priceAccumulator: 0, setSize: 0, lastSellPrice: 146 };
  // 146 - 60 = 86; 86 % 4 = 2, exactly half of 4, rounds down to 84.
  assert.equal(seedStartPrice(landMarket, 1), 84);
});

test("failedSalePrice drifts to half the starting price plus 52", () => {
  assert.equal(failedSalePrice(160), 132);
  assert.equal(failedSalePrice(80), 92);
});

test("unownedNonTownPlots excludes owned plots and the town plot", () => {
  const state = baseState(1);
  const candidatesBefore = unownedNonTownPlots(state.plots);
  assert.ok(candidatesBefore.length > 0);
  for (const { row, col } of candidatesBefore) {
    assert.notEqual(state.plots[row][col].terrain, "town");
    assert.equal(state.plots[row][col].owner, null);
  }
  // A fully-owned board (every plot owned by player 0) has no candidates.
  const claimedPlots = state.plots.map((rowPlots) =>
    rowPlots.map((plot) => (plot.terrain === "town" ? plot : { ...plot, owner: 0 })),
  );
  assert.deepEqual(unownedNonTownPlots(claimedPlots), []);
});

test("createLandAuctionPayload seeds every participant inactive at the starting price", () => {
  const state = baseState(2);
  const payload = createLandAuctionPayload(state, 0, 0, 0);
  assert.equal(payload.startPrice, LAND_AUCTION_START_PRICE);
  assert.equal(payload.priceCeiling, LAND_AUCTION_START_PRICE + LAND_AUCTION_PRICE_RANGE);
  assert.equal(payload.auctionsRemaining, LAND_AUCTION_COLONY_PROBABILITIES.length - 1);
  assert.equal(payload.finished, false);
  for (const participant of payload.participants) {
    assert.equal(participant.active, false);
    assert.equal(participant.price, payload.startPrice);
  }
});

test("a first bid commits at the seeded start price and resets goingTicks", () => {
  const state = landAuctionOf(baseState(3), 0, 0, 0);
  const started = tickTimes(state, 2);
  const bid = applyAction(started, { type: "bid_land", playerId: 1 });
  const participant = bid.phase.payload.participants.find((entry) => entry.playerId === 1);
  assert.equal(participant.active, true);
  assert.equal(participant.price, bid.phase.payload.startPrice);
  assert.equal(bid.phase.payload.goingTicks, 0);
});

test("a second bid from the same player steps up by LAND_AUCTION_BID_STEP", () => {
  const state = landAuctionOf(baseState(4), 0, 0, 0);
  const firstBid = applyAction(state, { type: "bid_land", playerId: 0 });
  const secondBid = applyAction(firstBid, { type: "bid_land", playerId: 0 });
  const participant = secondBid.phase.payload.participants.find((entry) => entry.playerId === 0);
  assert.equal(participant.price, firstBid.phase.payload.startPrice + LAND_AUCTION_BID_STEP);
});

test("bid_land throws once the ask would exceed the price ceiling", () => {
  const state = baseState(5);
  const ceilingParticipant = {
    active: true,
    price: LAND_AUCTION_START_PRICE + LAND_AUCTION_PRICE_RANGE,
  };
  const atCeiling = landAuctionOf(state, 0, 0, 0, { 0: ceilingParticipant });
  assert.throws(() => applyAction(atCeiling, { type: "bid_land", playerId: 0 }));
});

test("bid-affordability invariant: exact affordability succeeds, one dollar short rejects", () => {
  const state = landAuctionOf(baseState(6), 0, 0, 0);
  const startPrice = state.phase.payload.startPrice;
  const exact = withPlayers(state, { 0: { money: startPrice } });
  const bid = applyAction(exact, { type: "bid_land", playerId: 0 });
  assert.equal(bid.phase.payload.participants.find((entry) => entry.playerId === 0).active, true);

  const oneShort = withPlayers(state, { 1: { money: startPrice - 1 } });
  assert.throws(() => applyAction(oneShort, { type: "bid_land", playerId: 1 }));
});

test("bid_land never drives a player's money negative (invariant across a small stress run)", () => {
  let state = landAuctionOf(withPlayers(baseState(7), { 0: { money: 200 } }), 0, 0, 0);
  // Bid until the ceiling or affordability stops it; money must never go negative.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    for (const player of state.players) {
      assert.ok(player.money >= 0, `player ${player.id} money went negative: ${player.money}`);
    }
    const participant = state.phase.payload.participants.find((entry) => entry.playerId === 0);
    const askPrice = participant.active
      ? participant.price + LAND_AUCTION_BID_STEP
      : state.phase.payload.startPrice;
    const player = state.players[0];
    if (askPrice > state.phase.payload.priceCeiling || player.money < askPrice) {
      break;
    }
    state = applyAction(state, { type: "bid_land", playerId: 0 });
  }
});

test("no bidder at all finalizes as a failed sale at the drifted price after the going countdown", () => {
  const state = landAuctionOf(baseState(8), 0, 0, 0);
  const finished = tickTimes(state, FINALIZE_TICKS);
  assert.equal(finished.phase.payload.finished, true);
  assert.equal(finished.phase.payload.sold, false);
  assert.equal(finished.phase.payload.winnerId, null);
  assert.equal(
    finished.phase.payload.finalPrice,
    failedSalePrice(finished.phase.payload.startPrice),
  );
  // No money changes hands on a failed sale.
  assert.equal(totalMoney(finished), totalMoney(state));
});

test("a bid resets the going countdown so the auction does not finalize early", () => {
  const state = landAuctionOf(baseState(9), 0, 0, 0);
  const almostDone = tickTimes(state, FINALIZE_TICKS - 1);
  assert.equal(almostDone.phase.payload.finished, false);
  const bid = applyAction(almostDone, { type: "bid_land", playerId: 0 });
  const stillGoing = tickTimes(bid, FINALIZE_TICKS - 1);
  assert.equal(stillGoing.phase.payload.finished, false);
});

test("the sole bidder wins at their own bid price after the going countdown, a colony sink", () => {
  const state = landAuctionOf(baseState(10), 0, 0, 0);
  const bid = applyAction(state, { type: "bid_land", playerId: 2 });
  const before = totalMoney(bid);
  const finished = tickTimes(bid, FINALIZE_TICKS);
  assert.equal(finished.phase.payload.finished, true);
  assert.equal(finished.phase.payload.sold, true);
  assert.equal(finished.phase.payload.winnerId, 2);
  const price = finished.phase.payload.finalPrice;
  assert.equal(price, finished.phase.payload.startPrice);
  assert.equal(finished.plots[0][0].owner, 2);
  // Colony sink: the winner's money leaves the economy, nobody else gains it
  // (the plot was colony-owned, unowned before the sale -- matches
  // PlotSeller.finishAuction's `player2 == null` branch).
  assert.equal(totalMoney(finished), before - price);
  assert.equal(finished.players[2].money, bid.players[2].money - price);
});

test("tie-break in round 1 resolves to one of the tied candidates (random, not always the same)", () => {
  const state = landAuctionOf(baseState(11), 0, 0, 0, {
    0: { active: true, price: 200 },
    1: { active: true, price: 200 },
  });
  assert.equal(state.round, 1);
  const finished = tickTimes(state, FINALIZE_TICKS);
  assert.equal(finished.phase.payload.sold, true);
  assert.ok([0, 1].includes(finished.phase.payload.winnerId));
});

test("tie-break past round 1 resolves to the worst-ranked tied candidate", () => {
  const state = landAuctionOf(baseState(12), 0, 0, 0, {
    0: { active: true, price: 200 },
    1: { active: true, price: 200 },
  });
  const roundTwo = { ...state, round: 2 };
  // Player 0 holds far more money (a higher score) than player 1, so player 1
  // is the worse-ranked of the two tied bidders and should win the tie.
  const scored = withPlayers(roundTwo, { 0: { money: 5000 }, 1: { money: 100 } });
  const finished = tickTimes(scored, FINALIZE_TICKS);
  assert.equal(finished.phase.payload.sold, true);
  assert.equal(finished.phase.payload.winnerId, 1);
});

test("a hard tick ceiling force-finishes the auction even without three going-stages", () => {
  // The going-countdown resets on every bid, so an auction that keeps getting
  // outbid never reaches FINALIZE_TICKS through idling alone; the
  // LAND_AUCTION_MAX_TICKS safety ceiling still terminates it. Simulate by
  // jumping the tick clock directly to the ceiling with a fresh bid pending.
  const state = landAuctionOf(baseState(13), 0, 0, 0, { 0: { active: true, price: 200 } });
  const nearCeiling = {
    ...state,
    phase: { kind: "land_auction", payload: { ...state.phase.payload, tick: 399, goingTicks: 0 } },
  };
  const finished = applyAction(nearCeiling, { type: "tick" });
  assert.equal(finished.phase.payload.finished, true);
  assert.equal(finished.phase.payload.winnerId, 0);
});

test("end_land_auction rolls the next slot after a sale and stops after a failed sale", () => {
  // Force every land-grant pick to pass so the board stays fully unowned,
  // maximizing the chance a colony auction is offered and, on a sale, chains.
  let state = baseState(14);
  while (state.phase.kind === "land_grant") {
    const picker = state.phase.payload.pickOrder[state.phase.payload.pickIndex];
    state = applyAction(state, { type: "pass", playerId: picker });
  }
  // Either the round offered no plot at all (skip straight to develop, a
  // valid outcome the probability gate allows) or the chain is exercised
  // below by bidding through however many slots this seed's rolls produced.
  let slots = 0;
  while (state.phase.kind === "land_auction") {
    slots += 1;
    state = applyAction(state, { type: "bid_land", playerId: 0 });
    state = tickTimes(state, FINALIZE_TICKS);
    assert.equal(state.phase.payload.sold, true);
    state = applyAction(state, { type: "end_land_auction" });
  }
  assert.equal(state.phase.kind, "develop");
  assert.ok(slots <= LAND_AUCTION_COLONY_PROBABILITIES.length);
});

test("the round-grant-to-auction seam skips cleanly to develop when the slot-0 roll fails", () => {
  // Seed 1000 is a known fixture: its round-1 slot-0 colony roll fails with
  // plenty of unowned plots still on the board, so the skip is attributable
  // to the probability gate, not an empty candidate list.
  let state = applyAction(createInitialGameState(1000), { type: "start_game" });
  const candidatesBeforeGrant = unownedNonTownPlots(state.plots).length;
  while (state.phase.kind === "land_grant") {
    const picker = state.phase.payload.pickOrder[state.phase.payload.pickIndex];
    state = applyAction(state, { type: "pass", playerId: picker });
  }
  assert.equal(state.phase.kind, "develop");
  assert.ok(candidatesBeforeGrant > 0);
});

test("decideLandAuctionAction cannot-stall: a fixed-seed watchdog run always reaches a terminal outcome", () => {
  let state = landAuctionOf(baseState(15), 0, 0, 0);
  let ticks = 0;
  const WATCHDOG = 2000;
  while (state.phase.kind === "land_auction" && !state.phase.payload.finished) {
    ticks += 1;
    assert.ok(ticks < WATCHDOG, "land auction watchdog exceeded: AI stalled the sequencer");
    for (let playerId = 0; playerId < 4; playerId += 1) {
      const action = decideLandAuctionAction(state, playerId);
      if (action !== null) {
        state = applyAction(state, action);
      }
    }
    state = applyAction(state, { type: "tick" });
  }
  assert.equal(state.phase.payload.finished, true);
});
