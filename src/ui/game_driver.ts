// Full-game driver: owns the single mutable GameState, drives engine ticks and
// AI turns on setTimeout chains, and re-renders the board, HUD, and the active
// phase panel after every state transition. Screens (map, HUD, store, auction)
// are rendered as-is; this module only sequences them across the phase cycle
// title -> land_grant -> develop -> production -> auction -> scoring.

import type { Action, AuctionPayload, GameState, LandGrantPayload } from "../engine/game_state";
import type { ProductionPayload, ScoringPayload } from "../engine/game_state";
import type { Resource } from "../engine/player";
import { RESOURCES } from "../engine/player";
import { applyAction } from "../engine/game_state";
import { createInitialGameState } from "../engine/turn";
import { currentPicker } from "../engine/land_grant";
import { decideLandGrantAction } from "../ai/land_ai";
import { decideDevelopAction } from "../ai/develop_ai";
import { decideAuctionActions } from "../ai/auction_ai";
import { showScreen } from "./screen_router";
import { renderMap } from "./map_render";
import { renderHud } from "./hud";
import { PLAYER_COLORS } from "./sprites";
import { renderStoreScreen } from "./store_screen";
import { renderAuctionScreen } from "./auction_screen";
import { bindKeys } from "./input";

/** Player id of the single human player; ids 1..3 are AI. */
const HUMAN_ID = 0;

/** Delay between successive AI decision steps (land grant and develop). */
const AI_STEP_MS = 400;

/** Delay between human develop-turn ticks; the turn's tick budget drains this fast when idle. */
const DEVELOP_TICK_MS = 250;

/** How long the production yields interstitial stays up before auto-advancing. */
const PRODUCTION_PAUSE_MS = 2000;

/** Delay between auction ticks (price movement plus trade matching). */
const AUCTION_TICK_MS = 500;

/** Pause on the finished auction panel before auto-advancing to the next good. */
const AUCTION_FINISHED_PAUSE_MS = 1500;

/** DOM containers the driver renders into, resolved once at game start. */
interface GameElements {
  readonly hud: Element;
  readonly map: Element;
  readonly panel: Element;
}

/** The live game state; null before the first game starts. */
let currentState: GameState | null = null;

/** The single pending timer handle, or null when idle (waiting on the human). */
let phaseTimer: ReturnType<typeof setTimeout> | null = null;

/** Resolved game screen containers, set once by `startNewGame`. */
let elements: GameElements | null = null;

/** True once the map click delegation listener has been attached. */
let mapListenerBound = false;

/** The good the human last committed a role for, so role choice resets per good. */
let lastAuctionGood: Resource | null = null;

/** True once the human has chosen a role for `lastAuctionGood`. */
let humanAuctionCommitted = false;

/** Keyboard-selected plot during the human's land-grant turn. */
let landGrantCursor: { row: number; col: number } = { row: 0, col: 0 };

/** Unbind function for the land-grant keyboard listener, or null when idle. */
let unbindLandGrantKeys: (() => void) | null = null;

//============================================
/**
 * Start a fresh game: build the initial state, show the game screen, and enter
 * the first land grant. Safe to call again for "Play Again".
 *
 * @param gameScreenId - Registered screen id to show for gameplay.
 */
export function startNewGame(gameScreenId: string): void {
  elements = resolveElements();
  bindMapListener();
  clearTimer();
  unbindLandGrantKeysIfBound();
  landGrantCursor = { row: 0, col: 0 };
  const seed = Date.now() % 0xffffffff;
  currentState = applyAction(createInitialGameState(seed), { type: "start_game" });
  showScreen(gameScreenId);
  render();
}

//============================================
/**
 * Resolve the three game containers from the DOM, failing loudly if any is
 * missing so a broken index.html surfaces immediately.
 */
function resolveElements(): GameElements {
  const hud = document.getElementById("game-hud");
  const map = document.getElementById("game-map");
  const panel = document.getElementById("game-panel");
  if (hud === null || map === null || panel === null) {
    throw new Error("game_driver: #game-hud, #game-map, or #game-panel missing");
  }
  return { hud, map, panel };
}

//============================================
/**
 * Apply an action, replace the current state, and re-render. Human role
 * commitment during the auction is tracked here so the auction clock knows the
 * human has made a choice for the current good.
 *
 * @param action - Action to apply through the pure engine reducer.
 */
function dispatch(action: Action): void {
  if (currentState === null) {
    throw new Error("game_driver.dispatch: no active game");
  }
  if (action.type === "set_auction_role" && action.playerId === HUMAN_ID) {
    humanAuctionCommitted = true;
  }
  currentState = applyAction(currentState, action);
  // Intent dispatches must not reset the auction tick clock: key auto-repeat
  // fires set_auction_intent every ~30-50ms, and rescheduling would cancel the
  // pending 500ms tick before it can move prices. Re-render the view only and
  // leave the running timer intact.
  if (action.type === "set_auction_intent") {
    renderPhaseView();
    return;
  }
  render();
}

//============================================
/**
 * Render the active phase's view, then schedule whatever timed step that phase
 * needs (AI move, tick, or auto-advance). Human decision points leave the timer
 * idle and wait for a click.
 */
function render(): void {
  renderPhaseView();
  scheduleForPhase();
}

//============================================
/**
 * Clear the pending timer, if any, so at most one timed step is ever queued.
 */
function clearTimer(): void {
  if (phaseTimer !== null) {
    clearTimeout(phaseTimer);
    phaseTimer = null;
  }
}

//============================================
/**
 * Render the HUD, map, and phase panel for the current phase. Auction and
 * scoring clear the map since the board is not the focus there.
 */
function renderPhaseView(): void {
  const state = requireState();
  const els = requireElements();
  const phase = state.phase;
  if (phase.kind !== "land_grant") {
    unbindLandGrantKeysIfBound();
  }
  switch (phase.kind) {
    case "land_grant":
      renderHud(els.hud, state);
      renderMap(els.map, state);
      renderLandGrantPanel(els.panel, phase.payload);
      syncLandGrantKeyboard(state, phase.payload);
      break;
    case "develop":
      renderHud(els.hud, state);
      renderMap(els.map, state);
      if (phase.payload.activePlayer === HUMAN_ID) {
        renderStoreScreen(els.panel, state, dispatch);
      } else {
        renderWaitingPanel(els.panel, `Player ${phase.payload.activePlayer + 1} is developing...`);
      }
      break;
    case "production":
      renderHud(els.hud, state);
      renderMap(els.map, state);
      renderProductionPanel(els.panel, phase.payload);
      break;
    case "auction":
      renderHud(els.hud, state);
      els.map.innerHTML = "";
      renderAuctionScreen(els.panel, state, dispatch);
      break;
    case "scoring":
      renderHud(els.hud, state);
      els.map.innerHTML = "";
      renderScoringPanel(els.panel, phase.payload);
      break;
    default:
      // title should never render here; other phases are exhaustive above.
      els.panel.innerHTML = "";
      break;
  }
}

//============================================
/**
 * Schedule the next timed step for the current phase. Land grant and develop
 * wait on the human when it is their turn; AI turns, production, and the
 * auction advance on timers.
 */
function scheduleForPhase(): void {
  clearTimer();
  const state = requireState();
  const phase = state.phase;
  switch (phase.kind) {
    case "land_grant":
      scheduleLandGrant(phase.payload);
      break;
    case "develop":
      scheduleDevelop(phase.payload.activePlayer);
      break;
    case "production":
      phaseTimer = setTimeout(() => dispatch({ type: "tick" }), PRODUCTION_PAUSE_MS);
      break;
    case "auction":
      scheduleAuction(phase.payload);
      break;
    default:
      // title and scoring have no automatic next step.
      break;
  }
}

//============================================
/**
 * Schedule the land-grant step: AI pickers auto-decide after a short pause; a
 * human picker leaves the timer idle and waits for a plot click or Pass.
 */
function scheduleLandGrant(payload: LandGrantPayload): void {
  const picker = currentPicker(payload);
  if (picker === null || picker === HUMAN_ID) {
    return;
  }
  phaseTimer = setTimeout(() => {
    dispatch(decideLandGrantAction(requireState(), picker));
  }, AI_STEP_MS);
}

//============================================
/**
 * Schedule the develop step: a human turn drains its tick budget on a timer
 * while the store screen handles input; an AI turn takes one decision per step.
 */
function scheduleDevelop(activePlayer: number): void {
  if (activePlayer === HUMAN_ID) {
    phaseTimer = setTimeout(() => dispatch({ type: "tick" }), DEVELOP_TICK_MS);
    return;
  }
  phaseTimer = setTimeout(() => {
    dispatch(decideDevelopAction(requireState(), activePlayer));
  }, AI_STEP_MS);
}

//============================================
/**
 * Schedule the auction step. A finished auction auto-advances after a pause so
 * an AI-only trading floor never stalls. At the opening tick the driver waits
 * for the human to declare a role for the good; once committed (or past the
 * opening tick) the auction clock runs: AI participants adjust, then a tick
 * moves prices and matches trades.
 */
function scheduleAuction(payload: AuctionPayload): void {
  if (payload.finished) {
    phaseTimer = setTimeout(() => dispatch({ type: "end_auction" }), AUCTION_FINISHED_PAUSE_MS);
    return;
  }
  resetAuctionCommitmentIfGoodChanged(payload.good);
  const humanRole = humanParticipantRole(payload);
  if (payload.tick === 0 && humanRole === "out" && !humanAuctionCommitted) {
    // Wait for the human to choose a side for this good before the clock runs.
    return;
  }
  phaseTimer = setTimeout(auctionStep, AUCTION_TICK_MS);
}

//============================================
/**
 * Advance the auction one tick: let each AI participant take its single role or
 * intent adjustment, then apply the engine tick that moves prices and matches
 * trades. Re-rendering reschedules the next step (or the finished auto-advance).
 */
function auctionStep(): void {
  let state = requireState();
  if (state.phase.kind !== "auction") {
    return;
  }
  for (const player of state.players) {
    if (player.id === HUMAN_ID) {
      continue;
    }
    const aiAction = decideAuctionActions(state, player.id);
    if (aiAction !== null) {
      state = applyAction(state, aiAction);
    }
  }
  currentState = applyAction(state, { type: "tick" });
  render();
}

//============================================
/**
 * Reset the per-good human role commitment when the auctioned good changes, so
 * the human is prompted to choose a side for each good in turn.
 */
function resetAuctionCommitmentIfGoodChanged(good: Resource): void {
  if (good !== lastAuctionGood) {
    lastAuctionGood = good;
    humanAuctionCommitted = false;
  }
}

//============================================
/**
 * Read the human player's declared role in the current auction, defaulting to
 * "out" when the human has no participant entry yet.
 */
function humanParticipantRole(payload: AuctionPayload): string {
  for (const participant of payload.participants) {
    if (participant.playerId === HUMAN_ID) {
      return participant.role;
    }
  }
  return "out";
}

//============================================
/**
 * Attach the one-time map click delegation. During the human's land-grant pick
 * a click on an unowned, non-town plot claims it; other clicks are ignored.
 */
function bindMapListener(): void {
  if (mapListenerBound) {
    return;
  }
  const els = requireElements();
  els.map.addEventListener("click", handleMapClick);
  mapListenerBound = true;
}

//============================================
/**
 * Handle a click on the map during the human's land-grant turn: resolve the
 * clicked plot from its data-row/data-col group and dispatch a claim when the
 * plot is legally claimable.
 */
function handleMapClick(event: Event): void {
  const state = requireState();
  if (state.phase.kind !== "land_grant") {
    return;
  }
  if (currentPicker(state.phase.payload) !== HUMAN_ID) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const group = target.closest("g[data-row]");
  if (group === null) {
    return;
  }
  const row = Number(group.getAttribute("data-row"));
  const col = Number(group.getAttribute("data-col"));
  const plot = state.plots[row]?.[col];
  if (plot === undefined || plot.owner !== null || plot.terrain === "town") {
    return;
  }
  dispatch({ type: "claim_plot", playerId: HUMAN_ID, row, col });
}

//============================================
/**
 * Keep the land-grant keyboard cursor in sync with whose turn it is: bind
 * arrow/Enter/Escape/P navigation while the human is picking, unbind and hide
 * the cursor otherwise. Clamps the cursor to the current grid bounds and
 * re-applies the highlight class on every render (the map SVG is rebuilt
 * from scratch each time, so the class does not survive on its own).
 */
function syncLandGrantKeyboard(state: GameState, payload: LandGrantPayload): void {
  const els = requireElements();
  if (currentPicker(payload) !== HUMAN_ID) {
    unbindLandGrantKeysIfBound();
    return;
  }
  const rows = state.plots.length;
  const cols = state.plots[0]?.length ?? 0;
  landGrantCursor = {
    row: clampToRange(landGrantCursor.row, 0, rows - 1),
    col: clampToRange(landGrantCursor.col, 0, cols - 1),
  };
  highlightLandGrantCursor(els.map);
  if (unbindLandGrantKeys !== null) {
    return;
  }
  unbindLandGrantKeys = bindKeys({
    ArrowUp: () => moveLandGrantCursor(0, -1, rows, cols),
    ArrowDown: () => moveLandGrantCursor(0, 1, rows, cols),
    ArrowLeft: () => moveLandGrantCursor(-1, 0, rows, cols),
    ArrowRight: () => moveLandGrantCursor(1, 0, rows, cols),
    Enter: claimCursorPlot,
    Escape: () => dispatch({ type: "pass", playerId: HUMAN_ID }),
    p: () => dispatch({ type: "pass", playerId: HUMAN_ID }),
    P: () => dispatch({ type: "pass", playerId: HUMAN_ID }),
  });
}

//============================================
/**
 * Unbind the land-grant keyboard listener, if bound.
 */
function unbindLandGrantKeysIfBound(): void {
  if (unbindLandGrantKeys !== null) {
    unbindLandGrantKeys();
    unbindLandGrantKeys = null;
  }
}

//============================================
/**
 * Move the land-grant cursor by the given row/col delta, clamped at the grid
 * edges, and refresh the highlight in place (no full re-render needed).
 */
function moveLandGrantCursor(dCol: number, dRow: number, rows: number, cols: number): void {
  landGrantCursor = {
    row: clampToRange(landGrantCursor.row + dRow, 0, rows - 1),
    col: clampToRange(landGrantCursor.col + dCol, 0, cols - 1),
  };
  highlightLandGrantCursor(requireElements().map);
}

//============================================
/**
 * Clamp `value` into the inclusive `[min, max]` range.
 */
function clampToRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

//============================================
/**
 * Apply the `plot-cursor` class to the plot group at `landGrantCursor` and
 * remove it from every other group, so exactly one plot shows the highlight.
 */
function highlightLandGrantCursor(mapContainer: Element): void {
  mapContainer.querySelectorAll("g[data-row].plot-cursor").forEach((group) => {
    group.classList.remove("plot-cursor");
  });
  const selector = `g[data-row="${landGrantCursor.row}"][data-col="${landGrantCursor.col}"]`;
  mapContainer.querySelector(selector)?.classList.add("plot-cursor");
}

//============================================
/**
 * Claim the plot at the current cursor position, mirroring the click-to-claim
 * legality check: unowned and not a town.
 */
function claimCursorPlot(): void {
  const state = requireState();
  const { row, col } = landGrantCursor;
  const plot = state.plots[row]?.[col];
  if (plot === undefined || plot.owner !== null || plot.terrain === "town") {
    return;
  }
  dispatch({ type: "claim_plot", playerId: HUMAN_ID, row, col });
}

//============================================
/**
 * Render the land-grant panel: a hint plus, on the human's turn, a Pass button.
 */
function renderLandGrantPanel(container: Element, payload: LandGrantPayload): void {
  container.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "land-grant-panel";

  const picker = currentPicker(payload);
  const hint = document.createElement("p");
  hint.className = "land-grant-hint";
  if (picker === HUMAN_ID) {
    hint.textContent = "Your land grant: click an unclaimed plot, or pass.";
    panel.appendChild(hint);
    const passButton = document.createElement("button");
    passButton.type = "button";
    passButton.id = "land-grant-pass-button";
    passButton.className = "land-grant-button";
    passButton.textContent = "Pass";
    passButton.addEventListener("click", () => {
      dispatch({ type: "pass", playerId: HUMAN_ID });
    });
    panel.appendChild(passButton);
  } else if (picker === null) {
    hint.textContent = "Land grant complete.";
    panel.appendChild(hint);
  } else {
    hint.textContent = `Player ${picker + 1} is choosing land...`;
    panel.appendChild(hint);
  }

  container.appendChild(panel);
}

//============================================
/**
 * Render a simple centered waiting message (used while an AI develops).
 */
function renderWaitingPanel(container: Element, message: string): void {
  container.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "waiting-panel";
  const text = document.createElement("p");
  text.textContent = message;
  panel.appendChild(text);
  container.appendChild(panel);
}

//============================================
/**
 * Render the production interstitial: each player's per-resource yields for the
 * round. The panel auto-advances to the auction on a timer.
 */
function renderProductionPanel(container: Element, payload: ProductionPayload): void {
  container.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "production-panel";

  const heading = document.createElement("h2");
  heading.textContent = "Production";
  panel.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "production-list";
  payload.yields.forEach((record, index) => {
    const item = document.createElement("li");
    item.className = "production-item";
    const parts: string[] = [];
    for (const resource of RESOURCES) {
      parts.push(`${resource} ${record[resource]}`);
    }
    item.textContent = `Player ${index + 1}: ${parts.join(", ")}`;
    const color = PLAYER_COLORS[index];
    if (color !== undefined) {
      item.style.color = color;
    }
    list.appendChild(item);
  });
  panel.appendChild(list);

  container.appendChild(panel);
}

//============================================
/**
 * Render the scoring screen: players ranked by final score, the winner marked,
 * and a Play Again button that starts a fresh game.
 */
function renderScoringPanel(container: Element, payload: ScoringPayload): void {
  container.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "scoring-panel";

  const heading = document.createElement("h2");
  heading.textContent = "Final Scores";
  panel.appendChild(heading);

  // Rank player indices by score, highest first; ties keep player order.
  const ranking = payload.scores
    .map((score, playerId) => ({ score, playerId }))
    .sort((a, b) => b.score - a.score);

  const list = document.createElement("ol");
  list.className = "scoring-list";
  for (const { score, playerId } of ranking) {
    const item = document.createElement("li");
    item.className = "scoring-item";
    const isWinner = playerId === payload.winnerIndex;
    const who = playerId === HUMAN_ID ? "You" : `Player ${playerId + 1}`;
    item.textContent = `${who}: $${score}${isWinner ? " (winner)" : ""}`;
    const color = PLAYER_COLORS[playerId];
    if (color !== undefined) {
      item.style.color = color;
    }
    if (isWinner) {
      item.classList.add("scoring-winner");
    }
    list.appendChild(item);
  }
  panel.appendChild(list);

  const playAgain = document.createElement("button");
  playAgain.type = "button";
  playAgain.id = "play-again-button";
  playAgain.className = "scoring-button";
  playAgain.textContent = "Play Again";
  playAgain.addEventListener("click", () => {
    startNewGame(GAME_SCREEN_ID);
  });
  panel.appendChild(playAgain);

  container.appendChild(panel);
}

//============================================
/**
 * Narrow the module's game state, failing loudly if no game is active.
 */
function requireState(): GameState {
  if (currentState === null) {
    throw new Error("game_driver: no active game state");
  }
  return currentState;
}

//============================================
/**
 * Narrow the module's resolved containers, failing loudly if unset.
 */
function requireElements(): GameElements {
  if (elements === null) {
    throw new Error("game_driver: game elements not resolved");
  }
  return elements;
}

/** Registered id of the gameplay screen; shared with main.ts wiring. */
export const GAME_SCREEN_ID = "screen-game";
