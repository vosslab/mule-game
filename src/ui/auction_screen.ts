// Auction screen: role choice bar, then a live vertical price track with
// four player tokens, store bands, and a trade flash indicator.
//
// This module is self-contained (container + state + dispatch callback) so
// the integrator can wire it into the screen router without this file
// depending on router internals or other in-flight UI modules.

import type {
  Action,
  AuctionPayload,
  AuctionRole,
  AuctionTrade,
  GameState,
} from "../engine/game_state";
import { PLAYER_COLORS } from "./sprites";

/** Height (in SVG units) of the price track, top to bottom. */
const TRACK_HEIGHT = 400;

/** Width (in SVG units) of the price track. */
const TRACK_WIDTH = 280;

/** Number of most recent trades to show in the trade flash list. */
const RECENT_TRADE_COUNT = 5;

/** Unbind function for the previous render's keyboard listeners, if any. */
let unbindKeys: (() => void) | null = null;

/**
 * Container that holds the currently built auction DOM, so a re-render into
 * the same container can reconcile in place instead of rebuilding.
 */
let builtContainer: Element | null = null;

/**
 * Signature of the last full build's interactive structure. When a re-render
 * carries the same signature, only prices, trades, and the tick counter
 * changed, so the buttons and their listeners are left untouched.
 */
let builtSignature: string | null = null;

/**
 * The auction's interactive structure has three modes: the finished panel, the
 * role-choice bar, and the live price track with intent controls. Only the
 * track mode is re-rendered on ticks, so its signature stays stable while
 * prices move and lets the reconcile path preserve the intent buttons.
 */
function auctionSignature(payload: AuctionPayload, humanRole: AuctionRole): string {
  if (payload.finished) {
    return "finished";
  }
  if (humanRole === "out" && payload.tick === 0) {
    return "role-choice";
  }
  return "track";
}

/**
 * Render the auction screen into `container`. Safe to call repeatedly (for
 * example after every dispatch or tick) to re-render the current state. Ticks
 * that only move prices reconcile the track, trade log, and tick counter in
 * place and leave the intent buttons and their listeners alone; a change to
 * the interactive mode triggers a full rebuild.
 *
 * @param container - Element to render into.
 * @param state - Current game state.
 * @param dispatch - Callback that applies an action and re-renders.
 */
export function renderAuctionScreen(
  container: Element,
  state: GameState,
  dispatch: (action: Action) => void,
): void {
  if (state.phase.kind !== "auction") {
    resetBuiltState(container);
    const waiting = document.createElement("p");
    waiting.className = "auction-screen-waiting";
    waiting.textContent = "Auction is only available during the auction phase.";
    container.appendChild(waiting);
    return;
  }

  const payload = state.phase.payload;
  const humanPlayer = state.players.find((player) => player.isHuman);
  if (humanPlayer === undefined) {
    throw new Error("renderAuctionScreen: no human player found");
  }
  const humanParticipant = payload.participants.find(
    (participant) => participant.playerId === humanPlayer.id,
  );
  if (humanParticipant === undefined) {
    throw new Error(`renderAuctionScreen: no participant for player ${humanPlayer.id}`);
  }

  // Tick-only reconcile path: the auction clock re-renders every tick to move
  // prices, but rebuilding the whole panel would destroy the intent buttons
  // mid-press. When the interactive mode is unchanged, update the track, trade
  // log, and tick counter in place and leave the controls alone.
  const signature = auctionSignature(payload, humanParticipant.role);
  if (
    signature === "track" &&
    container === builtContainer &&
    builtSignature === "track" &&
    reconcileTrack(container, payload)
  ) {
    return;
  }

  if (unbindKeys !== null) {
    unbindKeys();
    unbindKeys = null;
  }
  container.innerHTML = "";
  builtContainer = container;
  builtSignature = signature;

  const root = document.createElement("div");
  root.className = "auction-screen";

  root.appendChild(buildHeader(payload));

  if (payload.finished) {
    root.appendChild(buildFinishedPanel(dispatch));
  } else if (signature === "role-choice") {
    root.appendChild(buildRoleChoicePanel(humanPlayer.id, dispatch));
  } else {
    root.appendChild(buildTrackPanel(payload));
    root.appendChild(buildTradeLog(payload));
    unbindKeys = bindPriceIntentControls(root, humanPlayer.id, dispatch);
  }

  container.appendChild(root);
}

/**
 * Update the live track's volatile parts in place: the tick counter, the price
 * track SVG, and the trade log. Leaves the intent buttons and their listeners
 * untouched. Returns false if the expected nodes are missing so the caller can
 * fall back to a full rebuild.
 */
function reconcileTrack(container: Element, payload: AuctionPayload): boolean {
  const ticksLabel = container.querySelector(".auction-screen-ticks");
  const trackPanel = container.querySelector(".auction-screen-track-panel");
  const tradeLog = container.querySelector(".auction-screen-trade-log");
  if (ticksLabel === null || trackPanel === null || tradeLog === null) {
    return false;
  }
  ticksLabel.textContent = `Ticks left: ${payload.ticksRemaining}`;
  trackPanel.innerHTML = buildTrackSvgMarkup(payload);
  fillTradeLog(tradeLog, payload);
  return true;
}

/**
 * Forget any previously built auction DOM so the next auction render starts
 * from a clean full build.
 */
function resetBuiltState(container: Element): void {
  if (unbindKeys !== null) {
    unbindKeys();
    unbindKeys = null;
  }
  container.innerHTML = "";
  builtContainer = null;
  builtSignature = null;
}

/**
 * Build the always-visible header: the good under auction and ticks left.
 */
function buildHeader(payload: AuctionPayload): HTMLElement {
  const header = document.createElement("div");
  header.className = "auction-screen-header";

  const goodLabel = document.createElement("span");
  goodLabel.className = "auction-screen-good";
  goodLabel.textContent = `Auction: ${payload.good}`;

  const ticksLabel = document.createElement("span");
  ticksLabel.className = "auction-screen-ticks";
  ticksLabel.textContent = `Ticks left: ${payload.ticksRemaining}`;

  header.appendChild(goodLabel);
  header.appendChild(ticksLabel);
  return header;
}

/**
 * Build the role-choice bar shown before the human has declared a side.
 */
function buildRoleChoicePanel(
  humanPlayerId: number,
  dispatch: (action: Action) => void,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "auction-screen-panel auction-screen-role-panel";

  const hint = document.createElement("p");
  hint.className = "auction-screen-role-hint";
  hint.textContent = "Choose your side for this good's auction.";
  panel.appendChild(hint);

  const roles: readonly { role: AuctionRole; label: string }[] = [
    { role: "buyer", label: "Buy" },
    { role: "seller", label: "Sell" },
    { role: "out", label: "Sit Out" },
  ];
  for (const { role, label } of roles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "auction-screen-button auction-screen-role-button";
    button.textContent = label;
    button.addEventListener("click", () => {
      dispatch({ type: "set_auction_role", playerId: humanPlayerId, role });
    });
    panel.appendChild(button);
  }

  return panel;
}

/**
 * Build the "round of trading complete" panel shown once the auction has
 * timed out. The driver dispatches `end_auction`; this Continue button gives
 * the human an explicit affordance to move on.
 */
function buildFinishedPanel(dispatch: (action: Action) => void): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "auction-screen-panel auction-screen-finished-panel";

  const message = document.createElement("p");
  message.className = "auction-screen-finished-message";
  message.textContent = "Round of trading complete.";
  panel.appendChild(message);

  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.className = "auction-screen-button auction-screen-continue-button";
  continueButton.textContent = "Continue";
  continueButton.addEventListener("click", () => {
    dispatch({ type: "end_auction" });
  });
  panel.appendChild(continueButton);

  return panel;
}

/**
 * Build the live price track panel: an inline SVG vertical axis with store
 * bands and one token per participant.
 */
function buildTrackPanel(payload: AuctionPayload): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "auction-screen-panel auction-screen-track-panel";

  const svgMarkup = buildTrackSvgMarkup(payload);
  panel.innerHTML = svgMarkup;

  return panel;
}

/**
 * Map a price within `[priceFloor, priceCeiling]` to a y coordinate within
 * the track, where the floor sits at the bottom and the ceiling at the top.
 *
 * @param price - Price to place.
 * @param payload - Current auction payload (supplies the price band).
 * @returns The y coordinate in SVG track units.
 */
function priceToY(price: number, payload: AuctionPayload): number {
  const span = payload.priceCeiling - payload.priceFloor;
  if (span <= 0) {
    return TRACK_HEIGHT / 2;
  }
  const fraction = (price - payload.priceFloor) / span;
  return TRACK_HEIGHT - fraction * TRACK_HEIGHT;
}

/**
 * Build the raw SVG markup for the vertical price track: axis, store bands,
 * and one token per participant.
 */
function buildTrackSvgMarkup(payload: AuctionPayload): string {
  let markup = `<svg class="auction-track-svg" viewBox="0 0 ${TRACK_WIDTH} ${TRACK_HEIGHT}">`;

  // Axis line down the middle of the track.
  const axisX = TRACK_WIDTH / 2;
  markup += `<line x1="${axisX}" y1="0" x2="${axisX}" y2="${TRACK_HEIGHT}" class="auction-track-axis" />`;

  // Store buy/sell band lines, full width, dashed.
  const storeBuyY = priceToY(payload.storeBuyPrice, payload);
  const storeSellY = priceToY(payload.storeSellPrice, payload);
  markup += `<line x1="0" y1="${storeBuyY}" x2="${TRACK_WIDTH}" y2="${storeBuyY}" class="auction-track-store-buy-line" />`;
  markup += `<line x1="0" y1="${storeSellY}" x2="${TRACK_WIDTH}" y2="${storeSellY}" class="auction-track-store-sell-line" />`;

  // One token per participant, offset horizontally by player id so tokens at
  // the same price do not fully overlap.
  const tokenSpacing = TRACK_WIDTH / (payload.participants.length + 1);
  payload.participants.forEach((participant, index) => {
    const color = PLAYER_COLORS[participant.playerId] as string;
    const x = tokenSpacing * (index + 1);
    const y = priceToY(participant.price, payload);
    const roleGlyph =
      participant.role === "buyer" ? "B" : participant.role === "seller" ? "S" : "-";
    markup += `<circle cx="${x}" cy="${y}" r="10" fill="${color}" class="auction-track-token" />`;
    markup += `<text x="${x}" y="${y + 4}" class="auction-track-token-label">${roleGlyph}</text>`;
  });

  markup += "</svg>";
  return markup;
}

/**
 * Build the trade log panel: a flash indicator and list of the most recent
 * trades from the tail of `payload.trades`.
 */
function buildTradeLog(payload: AuctionPayload): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "auction-screen-panel auction-screen-trade-log";
  fillTradeLog(panel, payload);
  return panel;
}

/**
 * Clear and refill a trade-log panel with the flash indicator and the most
 * recent trades. Split out so tick-only reconciles can refresh the log in
 * place without rebuilding the surrounding interactive controls.
 */
function fillTradeLog(panel: Element, payload: AuctionPayload): void {
  panel.innerHTML = "";

  const recentTrades = payload.trades.slice(-RECENT_TRADE_COUNT).reverse();

  if (recentTrades.length === 0) {
    const empty = document.createElement("p");
    empty.className = "auction-screen-trade-empty";
    empty.textContent = "No trades yet.";
    panel.appendChild(empty);
    return;
  }

  const latestTick = payload.trades[payload.trades.length - 1] as AuctionTrade;
  if (latestTick.tick === payload.tick - 1) {
    const flash = document.createElement("p");
    flash.className = "auction-screen-trade-flash";
    flash.textContent = `Traded ${latestTick.quantity} unit at $${latestTick.price}`;
    panel.appendChild(flash);
  }

  const list = document.createElement("ul");
  list.className = "auction-screen-trade-list";
  for (const trade of recentTrades) {
    const item = document.createElement("li");
    item.className = "auction-screen-trade-item";
    item.textContent = `tick ${trade.tick}: ${trade.quantity} @ $${trade.price}`;
    list.appendChild(item);
  }
  panel.appendChild(list);
}

/**
 * Bind keyboard and press-and-hold touch controls that set the human
 * player's price intent: ArrowUp/ArrowDown on keydown, released back to
 * `hold` on keyup; touch buttons mirror the same up/down/hold intents via
 * pointerdown/pointerup.
 *
 * @param root - Root element to append touch controls into.
 * @param humanPlayerId - The human player's id.
 * @param dispatch - Callback that applies an action and re-renders.
 * @returns An unbind function that removes both keyboard and touch listeners.
 */
function bindPriceIntentControls(
  root: HTMLElement,
  humanPlayerId: number,
  dispatch: (action: Action) => void,
): () => void {
  const setIntent = (intent: "up" | "down" | "hold"): void => {
    dispatch({ type: "set_auction_intent", playerId: humanPlayerId, intent });
  };

  // Intent is a held state, so ignore OS key auto-repeat (event.repeat): the
  // first keydown already set the intent and repeats are redundant dispatches
  // that would otherwise churn the auction clock. A dedicated keydown listener
  // is used here instead of bindKeys because bindKeys does not expose repeat.
  const keydownListener = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIntent("up");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setIntent("down");
    }
  };
  document.addEventListener("keydown", keydownListener);

  // Release the hold on keyup so a released arrow returns intent to "hold".
  const keyupListener = (event: KeyboardEvent): void => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      setIntent("hold");
    }
  };
  document.addEventListener("keyup", keyupListener);

  const controls = document.createElement("div");
  controls.className = "auction-screen-intent-controls";

  const upButton = buildIntentButton(
    "Up",
    "auction-screen-intent-up",
    () => setIntent("up"),
    () => setIntent("hold"),
  );
  const downButton = buildIntentButton(
    "Down",
    "auction-screen-intent-down",
    () => setIntent("down"),
    () => setIntent("hold"),
  );
  controls.appendChild(upButton);
  controls.appendChild(downButton);
  root.appendChild(controls);

  return () => {
    document.removeEventListener("keydown", keydownListener);
    document.removeEventListener("keyup", keyupListener);
  };
}

/**
 * Build a press-and-hold touch button: fires `onPress` on pointerdown and
 * `onRelease` on pointerup (and pointer leave/cancel, so a dragged-off touch
 * still releases the hold).
 */
function buildIntentButton(
  label: string,
  className: string,
  onPress: () => void,
  onRelease: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `auction-screen-button auction-screen-intent-button ${className}`;
  button.textContent = label;
  button.addEventListener("pointerdown", onPress);
  button.addEventListener("pointerup", onRelease);
  button.addEventListener("pointerleave", onRelease);
  button.addEventListener("pointercancel", onRelease);
  return button;
}
