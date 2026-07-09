// Land-auction panel as a SolidJS component (M5, the UI arm of the colony
// land-auction phase; previously an unassigned gap that stalled the scene
// loop -- see tests/playwright/tick_ownership.spec.mjs).
//
// Renders the plot under the hammer (highlighted on the board through
// GameScreen's shared cursor, reusing MapLayer's existing `plot-cursor`
// affordance), the current ask price, the current high bidder, a going-once /
// going-twice / sold-or-no-sale readout derived from `goingTicks` against
// `LAND_AUCTION_GOING_TICKS`, and how many further colony-auction slots this
// round's chain could still roll. The engine has no explicit "pass" action for
// this phase -- not bidding a plot IS passing -- so the human's only dispatch
// is `bid_land` (Enter or the Bid button); a Pass button and Escape simply
// blur focus off the Bid control rather than dispatching anything. AI bids
// arrive automatically through the scene manager's land-auction tick cadence
// (src/ui/scenes/scene_manager.ts).
//
// Selector contract for tests/playwright/land_auction.spec.mjs:
// [data-land-auction] (panel root), #land-bid-button (human bid button),
// [data-high-bidder] (current high bidder's player id, or "none").
//
// Solid discipline: run-once component, props read through the props object,
// keyboard listener bound in onMount and released in onCleanup.

import { Show, onMount, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type {
  GameState,
  LandAuctionParticipant,
  LandAuctionPayload,
} from "../../engine/game_state";
import type { GameStore } from "../game_store";
import { HUMAN_ID } from "../game_driver";
import { bindKeys } from "../input";
import { LAND_AUCTION_BID_STEP, LAND_AUCTION_GOING_TICKS } from "../../engine/constants";
import { playerColor } from "../sprites";
import { TutorialHint } from "./tutorial_hint";

/** Props for the land-auction panel. */
export interface LandAuctionPanelProps {
  /** The live game store, for dispatch and current-state reads. */
  readonly store: GameStore;
  /** Reactive accessor for the land-auction payload. */
  readonly payload: () => LandAuctionPayload;
}

/** The going-tick countdown stage shown to the player. */
type GoingStage = "open" | "going-once" | "going-twice" | "sold" | "no-sale";

//============================================
/**
 * Render the land-auction panel and bind the human's Enter-to-bid /
 * Escape-to-blur keyboard input.
 *
 * @param props - Carries the store and the land-auction payload accessor.
 * @returns The land-auction panel element.
 */
export function LandAuctionPanel(props: LandAuctionPanelProps): JSX.Element {
  const state = (): GameState => props.store.state;

  onMount(() => {
    const unbind = bindKeys({
      Enter: bid,
      Escape: blurFocus,
    });
    onCleanup(unbind);
  });

  //------------------------------------------
  // Dispatch the human's bid_land action, if a bid is currently legal.
  function bid(): void {
    if (!canBid(state(), props.payload())) {
      return;
    }
    props.store.dispatch({ type: "bid_land", playerId: HUMAN_ID });
  }

  //------------------------------------------
  // Pass affordance: remove keyboard focus without dispatching anything, since
  // not bidding a plot already IS passing on it.
  function blurFocus(): void {
    (document.activeElement as HTMLElement | null)?.blur();
  }

  const leader = (): LandAuctionParticipant | null => currentLeader(props.payload());
  const stage = (): GoingStage => goingStage(props.payload());

  return (
    <div class="land-auction-panel" data-land-auction data-going-stage={stage()}>
      <Show when={!props.payload().finished}>
        <TutorialHint
          kind="land_auction"
          message="Bid to raise the price -- not bidding on a plot already passes it. The high bidder when the going-twice countdown ends wins."
        />
      </Show>
      <p class="land-auction-hint">{`Plot (${props.payload().row}, ${props.payload().col}) is up for auction.`}</p>
      <p class="land-auction-price">{`Current ask: $${askPriceFor(props.payload(), HUMAN_ID)}`}</p>
      <p class="land-auction-high-bidder" data-high-bidder={leader()?.playerId ?? "none"}>
        <Show when={leader()}>
          {(entry) => (
            <span
              class="land-auction-swatch"
              style={{ "background-color": playerColor(entry().playerId) }}
            />
          )}
        </Show>
        {highBidderText(state(), leader())}
      </p>
      <p class="land-auction-going">{goingStageText(stage(), state(), props.payload())}</p>
      <p class="land-auction-remaining">
        {`Colony auctions remaining after this one: ${props.payload().auctionsRemaining}`}
      </p>
      <Show when={!props.payload().finished}>
        <div class="land-auction-controls">
          <button
            type="button"
            id="land-bid-button"
            class="land-auction-button"
            disabled={!canBid(state(), props.payload())}
            onClick={bid}
          >
            {`Bid $${askPriceFor(props.payload(), HUMAN_ID)}`}
          </button>
          <button
            type="button"
            class="land-auction-button land-auction-pass-button"
            onClick={blurFocus}
          >
            Pass
          </button>
        </div>
      </Show>
    </div>
  );
}

//============================================
/**
 * The current high bidder among active participants, or null when nobody has
 * bid yet. Ties (two or more active participants resting at the same top
 * price) show the first one found; the engine's tie-break only runs at
 * settlement.
 *
 * @param payload - The current land-auction payload.
 * @returns The leading participant, or null.
 */
function currentLeader(payload: LandAuctionPayload): LandAuctionParticipant | null {
  let leader: LandAuctionParticipant | null = null;
  for (const participant of payload.participants) {
    if (!participant.active) {
      continue;
    }
    if (leader === null || participant.price > leader.price) {
      leader = participant;
    }
  }
  return leader;
}

//============================================
/**
 * The asking price `playerId` would commit to on their next bid: the seeded
 * `startPrice` for a first bid, or `LAND_AUCTION_BID_STEP` above their own
 * last bid otherwise. Mirrors `applyBidLand`'s ask calculation for display.
 *
 * @param payload - The current land-auction payload.
 * @param playerId - Player to compute the next ask for.
 * @returns The next ask price for that player.
 */
function askPriceFor(payload: LandAuctionPayload, playerId: number): number {
  const participant = payload.participants.find((entry) => entry.playerId === playerId);
  if (participant === undefined || !participant.active) {
    return payload.startPrice;
  }
  return participant.price + LAND_AUCTION_BID_STEP;
}

//============================================
/**
 * Whether the human may legally bid right now: the auction is still open, the
 * human is not already the sole current leader, the next ask stays within the
 * price ceiling, and the human can afford it. Mirrors the degenerate cases
 * `decideLandAuctionAction` resolves to null for, so the UI never offers a
 * bid the engine would reject.
 *
 * @param state - Current game state (for the human's money).
 * @param payload - The current land-auction payload.
 * @returns True when a Bid click would succeed.
 */
function canBid(state: GameState, payload: LandAuctionPayload): boolean {
  if (payload.finished) {
    return false;
  }
  const participant = payload.participants.find((entry) => entry.playerId === HUMAN_ID);
  if (participant === undefined) {
    return false;
  }
  const leader = currentLeader(payload);
  if (leader !== null && leader.playerId === HUMAN_ID && soleLeader(payload, HUMAN_ID)) {
    return false;
  }
  const askPrice = askPriceFor(payload, HUMAN_ID);
  if (askPrice > payload.priceCeiling) {
    return false;
  }
  const player = state.players[HUMAN_ID];
  return player !== undefined && player.money >= askPrice;
}

//============================================
/**
 * Whether `playerId` holds the sole highest active bid (no tie at the top).
 *
 * @param payload - The current land-auction payload.
 * @param playerId - Player to test.
 * @returns True when `playerId` is the sole current price leader.
 */
function soleLeader(payload: LandAuctionPayload, playerId: number): boolean {
  let bestPrice = -1;
  let tied = false;
  let leaderId: number | null = null;
  for (const participant of payload.participants) {
    if (!participant.active) {
      continue;
    }
    if (participant.price > bestPrice) {
      bestPrice = participant.price;
      leaderId = participant.playerId;
      tied = false;
    } else if (participant.price === bestPrice) {
      tied = true;
    }
  }
  return leaderId === playerId && !tied;
}

//============================================
/**
 * The going-tick countdown stage: open, going-once, going-twice, or the
 * settled outcome once the auction has finished.
 *
 * @param payload - The current land-auction payload.
 * @returns The current going-tick stage.
 */
function goingStage(payload: LandAuctionPayload): GoingStage {
  if (payload.finished) {
    return payload.sold ? "sold" : "no-sale";
  }
  if (payload.goingTicks >= LAND_AUCTION_GOING_TICKS * 2) {
    return "going-twice";
  }
  if (payload.goingTicks >= LAND_AUCTION_GOING_TICKS) {
    return "going-once";
  }
  return "open";
}

//============================================
/**
 * The label for the current high bidder: "You", "Player N", or "No bids yet."
 *
 * @param state - Current game state (for the human/AI label).
 * @param leader - The current leading participant, or null.
 * @returns The high-bidder label text.
 */
function highBidderText(state: GameState, leader: LandAuctionParticipant | null): string {
  if (leader === null) {
    return "High bidder: none yet.";
  }
  return `High bidder: ${playerLabel(state, leader.playerId)} at $${leader.price}.`;
}

//============================================
/**
 * The going-stage readout text, including the settled outcome once finished.
 *
 * @param stage - The current going-tick stage.
 * @param state - Current game state (for the winner's label).
 * @param payload - The current land-auction payload.
 * @returns The going-stage readout text.
 */
function goingStageText(stage: GoingStage, state: GameState, payload: LandAuctionPayload): string {
  if (stage === "sold") {
    const winnerLabel =
      payload.winnerId === null ? "someone" : playerLabel(state, payload.winnerId);
    return `Sold to ${winnerLabel} for $${payload.finalPrice}!`;
  }
  if (stage === "no-sale") {
    return "No bids. The plot returns to the colony unsold.";
  }
  if (stage === "going-twice") {
    return "Going twice...";
  }
  if (stage === "going-once") {
    return "Going once...";
  }
  return "Bidding is open.";
}

//============================================
/**
 * A player's display label: "You" for the human, "Player N" otherwise.
 *
 * @param state - Current game state.
 * @param playerId - Player id to label.
 * @returns The display label.
 */
function playerLabel(state: GameState, playerId: number): string {
  const player = state.players[playerId];
  if (player === undefined) {
    return `Player ${playerId + 1}`;
  }
  return player.isHuman ? "You" : `Player ${playerId + 1}`;
}
