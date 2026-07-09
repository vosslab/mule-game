// Store and placement screen: buy a M.U.L.E., outfit it, and place it on an
// owned plot, all during a player's develop-phase tick budget.
//
// This module is self-contained (container + state + dispatch callback) so
// the integrator can wire it into the screen router without this file
// depending on router internals or other in-flight UI modules.

import type { Action, DevelopPayload, GameState, Plot } from "../engine/game_state";
import { RESOURCES } from "../engine/player";
import { canBuyMule, hasPlaceablePlot } from "../engine/turn";
import { MULE_BASE_PRICE } from "../engine/constants";
import { computeOutfitCost } from "../engine/store";
import { bindKeys, bindRovingFocus } from "./input";

/** Unbind function for the previous render's keyboard listeners, if any. */
let unbindKeys: (() => void) | null = null;

/**
 * Container that holds the currently built store DOM, so a re-render into the
 * same container can reconcile in place instead of rebuilding.
 */
let builtContainer: Element | null = null;

/**
 * Signature of the last full build's interactive structure. When a re-render
 * carries the same signature, only the tick counter changed and the buttons
 * are left untouched so an in-flight click is never lost.
 */
let builtSignature: string | null = null;

/**
 * Compute the signature of everything that affects which controls are shown
 * and whether they are enabled. Deliberately excludes `ticksRemaining`, which
 * ticks down every step without changing any button.
 */
function storeSignature(payload: DevelopPayload, money: number): string {
  return `${payload.activePlayer}|${payload.carriedMule}|${money}`;
}

/**
 * Render the store and placement screen into `container`. Safe to call
 * repeatedly (for example after every dispatch) to re-render the current
 * state. Tick-only re-renders update the ticks-left counter in place and
 * leave the buttons alone; a change to the carried M.U.L.E. state or money
 * triggers a full rebuild.
 *
 * @param container - Element to render into.
 * @param state - Current game state.
 * @param dispatch - Callback that applies an action and re-renders.
 */
export function renderStoreScreen(
  container: Element,
  state: GameState,
  dispatch: (action: Action) => void,
): void {
  // Tick-only reconcile path: the develop tick budget drains every step, so
  // rebuilding the whole panel each time would destroy the buttons mid-click.
  // When only the counter changed, update it in place and return.
  if (state.phase.kind === "develop") {
    const payload = state.phase.payload;
    const player = state.players[payload.activePlayer];
    if (player === undefined) {
      throw new Error(`renderStoreScreen: no player ${payload.activePlayer}`);
    }
    const signature = storeSignature(payload, player.money);
    if (container === builtContainer && signature === builtSignature) {
      const ticksLabel = container.querySelector(".store-screen-ticks");
      if (ticksLabel !== null) {
        ticksLabel.textContent = `Ticks left: ${payload.ticksRemaining}`;
        return;
      }
    }
    builtSignature = signature;
  } else {
    builtSignature = null;
  }
  builtContainer = container;

  if (unbindKeys !== null) {
    unbindKeys();
    unbindKeys = null;
  }
  container.innerHTML = "";

  if (state.phase.kind !== "develop") {
    const waiting = document.createElement("p");
    waiting.className = "store-screen-waiting";
    waiting.textContent = "Store is only available during the develop phase.";
    container.appendChild(waiting);
    return;
  }

  const payload = state.phase.payload;
  const player = state.players[payload.activePlayer];
  if (player === undefined) {
    throw new Error(`renderStoreScreen: no player ${payload.activePlayer}`);
  }

  const root = document.createElement("div");
  root.className = "store-screen";

  root.appendChild(buildStatusBar(player.money, payload));

  if (payload.carriedMule === "none") {
    root.appendChild(buildBuyPanel(state, payload, dispatch));
  } else if (payload.carriedMule === "unoutfitted") {
    root.appendChild(buildOutfitPanel(payload, player.money, dispatch));
  } else {
    root.appendChild(buildPlacementPanel(state, payload, dispatch));
  }

  root.appendChild(buildEndTurnPanel(payload, dispatch));

  container.appendChild(root);

  // Arrow keys rove focus among this render's enabled buttons (buy, outfit,
  // placement, cancel, end turn); Enter activates whichever button holds
  // focus so keyboard play matches pointer play button-for-button.
  const unbindRoving = bindRovingFocus(root, ".store-screen-button");
  const unbindEscapeEnter = bindKeys({
    Escape: () => {
      if (payload.carriedMule !== "none") {
        dispatch({ type: "cancel_placement", playerId: payload.activePlayer });
      }
    },
    Enter: () => {
      const focused = document.activeElement;
      if (focused instanceof HTMLButtonElement && root.contains(focused) && !focused.disabled) {
        focused.click();
        return;
      }
      dispatch({ type: "end_turn", playerId: payload.activePlayer });
    },
  });
  unbindKeys = (): void => {
    unbindRoving();
    unbindEscapeEnter();
  };

  root.querySelector<HTMLButtonElement>(".store-screen-button:not(:disabled)")?.focus();
}

/**
 * Build the money / ticks-remaining status bar shown at the top of the
 * screen in every carried-M.U.L.E. state.
 */
function buildStatusBar(money: number, payload: DevelopPayload): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "store-screen-status";

  const moneyLabel = document.createElement("span");
  moneyLabel.className = "store-screen-money";
  moneyLabel.textContent = `Money: $${money}`;

  const ticksLabel = document.createElement("span");
  ticksLabel.className = "store-screen-ticks";
  ticksLabel.textContent = `Ticks left: ${payload.ticksRemaining}`;

  bar.appendChild(moneyLabel);
  bar.appendChild(ticksLabel);
  return bar;
}

/**
 * Build the "buy a M.U.L.E." panel shown when the player carries none.
 */
function buildBuyPanel(
  state: GameState,
  payload: DevelopPayload,
  dispatch: (action: Action) => void,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "store-screen-panel store-screen-buy-panel";

  const canBuy = canBuyMule(state, payload.activePlayer);
  const buyButton = document.createElement("button");
  buyButton.type = "button";
  buyButton.className = "store-screen-button store-screen-buy-button";
  buyButton.textContent = `Buy M.U.L.E. ($${MULE_BASE_PRICE})`;
  buyButton.disabled = !canBuy;
  buyButton.addEventListener("click", () => {
    dispatch({ type: "buy_mule", playerId: payload.activePlayer });
  });
  panel.appendChild(buyButton);

  return panel;
}

/**
 * Build the outfit-selection panel shown once an unoutfitted M.U.L.E. is
 * carried: one button per resource, priced with its outfit cost.
 */
function buildOutfitPanel(
  payload: DevelopPayload,
  money: number,
  dispatch: (action: Action) => void,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "store-screen-panel store-screen-outfit-panel";

  for (const resource of RESOURCES) {
    const cost = computeOutfitCost(resource);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "store-screen-button store-screen-outfit-button";
    button.textContent = `Outfit for ${resource} ($${cost})`;
    button.disabled = money < cost;
    button.addEventListener("click", () => {
      dispatch({ type: "outfit_mule", playerId: payload.activePlayer, resource });
    });
    panel.appendChild(button);
  }

  return panel;
}

/**
 * Build the placement panel shown once an outfitted M.U.L.E. is carried: a
 * grid of the player's owned, un-outfitted plots plus a cancel button.
 */
function buildPlacementPanel(
  state: GameState,
  payload: DevelopPayload,
  dispatch: (action: Action) => void,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "store-screen-panel store-screen-placement-panel";

  const hint = document.createElement("p");
  hint.className = "store-screen-placement-hint";
  hint.textContent = hasPlaceablePlot(state, payload.activePlayer)
    ? "Select an owned plot to install the M.U.L.E."
    : "No empty owned plots. Cancel or end turn to keep the M.U.L.E. for later.";
  panel.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "store-screen-plot-grid";
  state.plots.forEach((row: readonly Plot[], rowIndex: number) => {
    row.forEach((plot: Plot, colIndex: number) => {
      if (plot.owner !== payload.activePlayer || plot.muleOutfit !== null) {
        return;
      }
      const plotButton = document.createElement("button");
      plotButton.type = "button";
      plotButton.className = "store-screen-button store-screen-plot-button";
      plotButton.textContent = `${rowIndex}, ${colIndex}`;
      plotButton.addEventListener("click", () => {
        dispatch({
          type: "place_mule",
          playerId: payload.activePlayer,
          row: rowIndex,
          col: colIndex,
        });
      });
      grid.appendChild(plotButton);
    });
  });
  panel.appendChild(grid);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "store-screen-button store-screen-cancel-button";
  cancelButton.textContent = "Cancel placement";
  cancelButton.addEventListener("click", () => {
    dispatch({ type: "cancel_placement", playerId: payload.activePlayer });
  });
  panel.appendChild(cancelButton);

  return panel;
}

/**
 * Build the always-visible end-turn control.
 */
function buildEndTurnPanel(
  payload: DevelopPayload,
  dispatch: (action: Action) => void,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "store-screen-panel store-screen-end-turn-panel";

  const endTurnButton = document.createElement("button");
  endTurnButton.type = "button";
  endTurnButton.className = "store-screen-button store-screen-end-turn-button";
  endTurnButton.textContent = "End turn";
  endTurnButton.addEventListener("click", () => {
    dispatch({ type: "end_turn", playerId: payload.activePlayer });
  });
  panel.appendChild(endTurnButton);

  return panel;
}
