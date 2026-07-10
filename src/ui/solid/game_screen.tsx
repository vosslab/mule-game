// Live game screen as a SolidJS component.
//
// This is the reactive replacement for the imperative game driver's DOM
// writing. It renders the three game containers the Playwright contract depends
// on -- #game-hud, #game-map, #game-panel -- and fills them reactively from the
// live store: the HUD every phase, the board on the spatial phases, and the
// active phase's panel routed by a <Switch> over the phase kind. Every human
// control dispatches through the store; the scene manager owns ticks and AI.
//
// The land-grant board cursor is engine state (LandGrantPayload's sweepRow/
// sweepCol, see src/engine/land_grant.ts's advanceSweepCursor), read straight
// from the payload for MapLayer's highlight -- no UI-only cursor signal is
// needed, since the sweep animates on its own via the scene manager's ticks.
//
// Solid discipline: run-once component, props read through the props object,
// typed per-phase payload accessors feed each <Match> so panels get a narrowed
// payload accessor, and derived board/cursor state is computed with plain
// accessor functions.

import { Switch, Match, Show, ErrorBoundary, createSignal, createEffect } from "solid-js";
import type { JSX } from "solid-js";
import type {
  AuctionPayload,
  DevelopPayload,
  GameState,
  LandAuctionPayload,
  LandGrantPayload,
  Phase,
  ProductionPayload,
  ScoringPayload,
} from "../../engine/game_state";
import { currentPicker } from "../../engine/land_grant";
import type { GameStore } from "../game_store";
import { HUMAN_ID } from "../game_driver";
import { Hud } from "./hud";
import { MapLayer } from "./map_layer";
import type { MapCursor } from "./map_layer";
import { LandGrantPanel } from "./land_grant_panel";
import { LandAuctionPanel } from "./land_auction_panel";
import { AuctionScreen } from "./auction_screen";
import { ProductionPanel } from "./production_panel";
import { ScoringPanel } from "./scoring_panel";
import { HumanDevelopLayer } from "../scenes/human_develop_layer";
import { AiActorLayer } from "./ai_actor_layer";
import { GameErrorFallback } from "./error_fallback";
import {
  EventBanner,
  PASSIVE_EVENT_BANNER_HOLD_MS,
  PERSONAL_EVENT_BANNER_HOLD_MS,
} from "./event_banner";
import { playerColor } from "../sprites";
import { TutorialHint } from "./tutorial_hint";

/** Props for the game screen. */
export interface GameScreenProps {
  /** The live game store this screen renders and dispatches into. */
  readonly store: GameStore;
}

//============================================
/**
 * Render the live game screen: HUD, board, and the active phase panel.
 *
 * @param props - Carries the live game store.
 * @returns The game screen fragment (the three game containers).
 */
export function GameScreen(props: GameScreenProps): JSX.Element {
  const state = (): GameState => props.store.state;
  // Payload accessor feeding the develop layer below, reading store fields
  // rather than the gating <Show>'s narrowing accessor. Passing the narrowing
  // accessor down made the layer's descendant scene memos (town/overworld
  // `carrying`, `ticksLeft`) subscribe to the Show's internal `when` memo;
  // when the human's develop turn ended synchronously (gamble, or the tick
  // budget running out) those memos recomputed once in the same pass that
  // disposed them and hit Solid's stale-read guard, throwing
  // "Stale read from <Show>". Reading the store makes them subscribe to store
  // fields instead and dispose cleanly. This accessor also never returns
  // undefined: on that final teardown recompute a live read is undefined, so
  // it returns the last develop-payload reference. The store reconciles that
  // reference toward the next phase in place, so those scalar memos read
  // `carriedMule`/`ticksRemaining` as undefined for that one disposed-anyway
  // recompute (harmless) rather than dereferencing undefined. The one reader
  // of the payload's nested wampus object (overworld's rAF loop) guards its
  // own teardown frame separately; see overworld_scene.tsx's updateFrame.
  let lastHumanPayload: DevelopPayload | undefined;
  const humanDevelopPayloadLive = (): DevelopPayload => {
    const live = humanDevelopPayload(state());
    if (live !== undefined) {
      lastHumanPayload = live;
    }
    // The gating <Show> only mounts the layer while the payload is defined, so
    // the first read always latches before any consumer runs.
    return lastHumanPayload as DevelopPayload;
  };
  // Tracks whether the human's develop-turn avatar is currently inside the
  // town scene, so the develop panel below can suppress its own hint-and-
  // End-Turn footer while the town scene's footer is showing (see
  // HumanDevelopLayer's onInTownChange doc comment for why).
  const [humanInTown, setHumanInTown] = createSignal(false);

  // The board cursor highlights the land-grant sweep cursor (engine state,
  // shown for every picker's turn for visual continuity, not only the
  // human's), or the plot currently under the hammer during a colony land
  // auction (reusing MapLayer's existing plot-cursor affordance rather than a
  // new prop).
  const boardCursor = (): MapCursor | null => {
    const phase = state().phase;
    if (phase.kind === "land_grant") {
      return { row: phase.payload.sweepRow, col: phase.payload.sweepCol };
    }
    if (phase.kind === "land_auction") {
      return { row: phase.payload.row, col: phase.payload.col };
    }
    return null;
  };

  //------------------------------------------
  // Claim the land-grant sweep cursor's plot when it is clicked, during the
  // human's pick. Any other clicked plot is a no-op: the sweep mechanic
  // requires waiting for the cursor to land on the desired plot, not picking
  // an arbitrary one.
  function handlePlotClick(row: number, col: number): void {
    const current = props.store.state;
    if (current.phase.kind !== "land_grant") {
      return;
    }
    if (currentPicker(current.phase.payload) !== HUMAN_ID) {
      return;
    }
    const payload = current.phase.payload;
    if (row === payload.sweepRow && col === payload.sweepCol) {
      props.store.dispatch({ type: "claim_current_plot", playerId: HUMAN_ID });
    }
  }

  // Focus management on phase transitions (a11y audit): a
  // keyboard or screen-reader user gets no other signal that #game-panel's
  // content was just structurally replaced (a new Switch <Match> branch, not
  // an in-place update), so without this their focus is left on a
  // now-detached or stale element with no cue that a new phase began.
  // `panelRef` carries `tabIndex={-1}` (script-focusable, not Tab-reachable,
  // the standard SPA route-change focus target pattern) and an `aria-label`
  // naming the new phase so a screen reader announces it on focus. Reads
  // only `phase.kind` (not the whole phase object), so this effect re-runs
  // once per genuine phase-kind change -- not on every tick within a phase
  // (store.ts's `reconcile` only notifies a property's subscribers when its
  // value actually differs, and `kind` stays the same string across a
  // phase's own internal updates).
  let panelRef: HTMLDivElement | undefined;
  createEffect(() => {
    const kind = state().phase.kind;
    if (panelRef !== undefined && kind !== "title") {
      panelRef.focus();
    }
  });

  return (
    <ErrorBoundary
      fallback={(err: unknown, reset) => <GameErrorFallback error={err} reset={reset} />}
    >
      {/* The letterboxed 16:10 stage every in-game surface renders inside. The
          HUD, board, and active phase panel lay out in a column here; #game-stage
          is sized and centered by src/style.css to the largest 16:10 box that
          fits the viewport, with the screen background showing as letterbox bars
          outside it. Downstream auction and phase-panel layouts fill this box
          (assert against #game-stage's bounding box, not the raw viewport). */}
      <div id="game-stage">
        <div id="game-hud">
          <Hud state={state()} />
        </div>
        <div id="game-map" classList={{ "game-map-filled": phaseShowsMap(state().phase.kind) }}>
          <Show when={phaseShowsMap(state().phase.kind)}>
            <MapLayer state={state()} cursor={boardCursor()} onPlotClick={handlePlotClick} />
          </Show>
          {/* Spatial develop layer: on the human's develop turn the avatar walks
            the overworld and the walkable town. The unkeyed Show closes during
            AI turns and reopens next human turn, so the layer remounts fresh
            each turn and its town/assay sub-state resets.

            The Show gates on a boolean and the layer reads its payload through
            a plain store-backed accessor (`humanDevelopPayloadLive`), NOT
            through the Show's own narrowing accessor. Passing the narrowing
            accessor down made descendant memos (the town/overworld scenes'
            `carrying`/`ticksLeft`) subscribe to the Show's internal `when`
            memo; when the develop turn ends synchronously (gambling, or the
            tick budget running out mid-walk) those memos recomputed in the
            same pass that disposed them and hit Solid's stale-read guard,
            throwing "Stale read from <Show>". Reading the store directly makes
            the scenes subscribe to store fields and be disposed cleanly on the
            phase flip, matching the AI develop layer below. */}
          <Show when={humanDevelopPayload(state()) !== undefined}>
            {/* A second boundary just for this layer: the develop-phase spatial
              scenes (town/overworld) are the layer this workstream's
              stale-read crash actually came from, so an error here should not
              also take down the HUD and #game-panel below -- only this one
              turn's spatial view degrades to the fallback panel. */}
            <ErrorBoundary
              fallback={(err: unknown, reset) => <GameErrorFallback error={err} reset={reset} />}
            >
              <ForcedCrashProbe />
              <HumanDevelopLayer
                store={props.store}
                payload={humanDevelopPayloadLive}
                onInTownChange={setHumanInTown}
              />
            </ErrorBoundary>
          </Show>
          {/* AI develop-turn avatar, in place of the old
            text-only WaitingPanel. Keyed on a per-turn string (not the raw
            payload) so consecutive AI players' turns each get a fresh
            AiActorLayer mount -- reconcile can reuse the same underlying
            payload object reference across turns (same field set every
            turn), so an unkeyed or object-keyed Show would not reliably
            remount when only activePlayer/queueIndex changed; the turn-key
            string always does. AiActorLayer captures its species/tint/spawn
            once at mount, so this remount is required, not just cosmetic. */}
          <Show when={aiDevelopTurnKey(state())} keyed>
            {(_turnKey) => (
              <AiActorLayer store={props.store} payload={() => currentAiDevelopPayload(state())} />
            )}
          </Show>
        </div>
        <div
          id="game-panel"
          tabIndex={-1}
          aria-label={phasePanelLabel(state().phase.kind)}
          ref={(el) => {
            panelRef = el;
          }}
        >
          <Switch>
            <Match when={landGrantPayload(state())}>
              {(payload) => <LandGrantPanel store={props.store} payload={payload} />}
            </Match>
            <Match when={landAuctionPayload(state())}>
              {(payload) => <LandAuctionPanel store={props.store} payload={payload} />}
            </Match>
            <Match when={developPayload(state())}>
              {(payload) => (
                <>
                  {/* Personal events fire for every player, human and AI alike, at
                    the start of their develop turn (turn.ts's beginDevelopTurn),
                    matching the original showing everyone's events. Keyed so a
                    new turn's event (a new PersonalEventResult object) restarts
                    the auto-dismiss timer instead of reusing a stale one. Only
                    the human's own turn holds the engine tick clock (see
                    scene_manager.ts); an AI turn's banner is a non-blocking
                    overlay, so it uses the shorter passive hold. */}
                  <Show when={payload().event} keyed>
                    {(event) => (
                      <EventBanner
                        source={{
                          kind: "personal",
                          event,
                          playerColor: playerColor(payload().activePlayer),
                        }}
                        holdMs={
                          payload().activePlayer === HUMAN_ID
                            ? PERSONAL_EVENT_BANNER_HOLD_MS
                            : PASSIVE_EVENT_BANNER_HOLD_MS
                        }
                      />
                    )}
                  </Show>
                  {/* AI turns show their status/Skip control inside #game-map via
                    AiActorLayer now (see above), so #game-panel renders
                    nothing for them -- the old text-only WaitingPanel is
                    retired. */}
                  <Show when={payload().activePlayer === HUMAN_ID}>
                    {/* The town scene renders its own notice-plus-End-Turn footer
                      inside #game-map while the human is in town, so this
                      panel's identical hint-plus-End-Turn footer must not also
                      render then -- exactly one footer at a time. */}
                    <Show when={!humanInTown()}>
                      <DevelopPanel store={props.store} payload={payload} />
                    </Show>
                  </Show>
                </>
              )}
            </Match>
            <Match when={productionPayload(state())}>
              {(payload) => <ProductionPanel payload={payload} />}
            </Match>
            <Match when={auctionPayload(state())}>
              {(payload) => <AuctionScreen store={props.store} payload={payload} />}
            </Match>
            <Match when={scoringPayload(state())}>
              {(payload) => <ScoringPanel payload={payload} />}
            </Match>
          </Switch>
        </div>
      </div>
    </ErrorBoundary>
  );
}

//============================================
/**
 * The human's develop-turn side panel: a walk-in hint plus an End Turn button.
 * With the store menu retired, buying and outfitting happen in the walkable
 * town (HumanDevelopLayer); this panel keeps End Turn reachable off the map so
 * the human can end the turn without walking to a town exit, and shows the live
 * money and tick budget the way the old store screen did.
 *
 * @param props - Carries the store and the human develop payload accessor.
 * @returns The develop panel element.
 */
function DevelopPanel(props: {
  readonly store: GameStore;
  readonly payload: () => DevelopPayload;
}): JSX.Element {
  const money = (): number => props.store.state.players[HUMAN_ID]?.money ?? 0;
  return (
    <div class="develop-panel">
      <TutorialHint
        kind="develop"
        message="Walk onto the town, then press Enter (or Space) at a shop door to buy and outfit a M.U.L.E., and again on an owned plot to place it before your ticks run out."
      />
      <div class="develop-panel-status">
        <span class="develop-panel-money">{`Money: $${money()}`}</span>
        <span class="develop-panel-ticks">{`Ticks left: ${props.payload().ticksRemaining}`}</span>
      </div>
      <p class="develop-panel-hint">
        Walk onto the town, then press Enter (or Space) at a shop door to buy and outfit a M.U.L.E.,
        and again on an owned plot to place it.
      </p>
      <button
        type="button"
        class="develop-end-turn-button"
        data-action="develop-end-turn"
        onClick={() => props.store.dispatch({ type: "end_turn", playerId: HUMAN_ID })}
      >
        End turn
      </button>
    </div>
  );
}

//============================================
/**
 * Whether the board is shown for a phase. The board is up on the spatial
 * phases (land grant, land auction, develop, production) and cleared for the
 * goods auction and scoring screens, matching the old driver.
 *
 * @param kind - The current phase kind.
 * @returns True when the board should render.
 */
function phaseShowsMap(kind: Phase["kind"]): boolean {
  return (
    kind === "land_grant" || kind === "land_auction" || kind === "develop" || kind === "production"
  );
}

//============================================
/**
 * The accessible label for `#game-panel`'s current phase, read by a screen
 * reader when focus lands there on a phase transition (see the focus-
 * management effect above).
 *
 * @param kind - The current phase kind.
 * @returns A human-readable phase name.
 */
function phasePanelLabel(kind: Phase["kind"]): string {
  switch (kind) {
    case "land_grant":
      return "Land grant";
    case "land_auction":
      return "Land auction";
    case "develop":
      return "Development";
    case "production":
      return "Production";
    case "auction":
      return "Auction";
    case "scoring":
      return "Final scores";
    default:
      return "Game panel";
  }
}

//============================================
/** The land-grant payload when in that phase, else undefined. */
function landGrantPayload(state: GameState): LandGrantPayload | undefined {
  return state.phase.kind === "land_grant" ? state.phase.payload : undefined;
}

//============================================
/** The land-auction payload when in that phase, else undefined. */
function landAuctionPayload(state: GameState): LandAuctionPayload | undefined {
  return state.phase.kind === "land_auction" ? state.phase.payload : undefined;
}

//============================================
/** The develop payload when in that phase, else undefined. */
function developPayload(state: GameState): DevelopPayload | undefined {
  return state.phase.kind === "develop" ? state.phase.payload : undefined;
}

//============================================
/**
 * The develop payload only while it is the human's develop turn, else
 * undefined. Gates the walkable overworld overlay so it mounts for the human's
 * spatial turn and unmounts during AI develop turns (which keep the fast
 * auto-play). Because the overlay's `<Show>` is unkeyed, the scene stays mounted
 * across the turn's ticks and remounts fresh for each of the human's turns.
 */
function humanDevelopPayload(state: GameState): DevelopPayload | undefined {
  if (state.phase.kind === "develop" && state.phase.payload.activePlayer === HUMAN_ID) {
    return state.phase.payload;
  }
  return undefined;
}

//============================================
/**
 * Whether `?crash-test=1` is present in the page URL: a dev/test-only escape
 * hatch (same shape as src/ui/hint_store.ts's `?hints=off`) that lets a
 * Playwright spec force a real synchronous throw inside the develop layer's
 * subtree, proving the surrounding <ErrorBoundary> actually catches a crash
 * rather than only being reachable in theory.
 */
function forcedCrashRequested(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get("crash-test") === "1";
}

//============================================
/**
 * Renders nothing, unless `?crash-test=1` is set, in which case it throws
 * during its own (run-once) render -- Solid propagates that throw to the
 * nearest `<ErrorBoundary>`, which mounts `HumanDevelopLayer` alongside it.
 *
 * @returns An empty fragment, or never (throws) when the test flag is set.
 */
function ForcedCrashProbe(): JSX.Element {
  if (forcedCrashRequested()) {
    throw new Error("forced crash for ErrorBoundary test (?crash-test=1)");
  }
  return <></>;
}

//============================================
/** The develop payload only while an AI player's develop turn is active, else undefined. */
function aiDevelopPayload(state: GameState): DevelopPayload | undefined {
  if (state.phase.kind === "develop" && state.phase.payload.activePlayer !== HUMAN_ID) {
    return state.phase.payload;
  }
  return undefined;
}

//============================================
/**
 * A per-AI-turn remount key: a non-empty string while an AI player develops
 * (so `<Show keyed>` never treats a falsy `queueIndex` of 0 as "not shown"),
 * changing every time `queueIndex` advances -- including between two
 * consecutive AI players' turns, where the underlying `DevelopPayload`
 * object reference may not itself change (see the `#game-map` mount's
 * comment). Undefined outside an AI develop turn.
 */
function aiDevelopTurnKey(state: GameState): string | undefined {
  const payload = aiDevelopPayload(state);
  return payload === undefined ? undefined : `ai-turn-${payload.queueIndex}`;
}

//============================================
/**
 * The live AI develop payload, for `AiActorLayer`'s payload accessor prop.
 * Only called while `aiDevelopTurnKey` gates the layer's mount, so an AI
 * turn is always active when this runs.
 *
 * @throws If called outside an AI player's develop turn (a mounting bug).
 */
function currentAiDevelopPayload(state: GameState): DevelopPayload {
  const payload = aiDevelopPayload(state);
  if (payload === undefined) {
    throw new Error("currentAiDevelopPayload: called while no AI player is developing");
  }
  return payload;
}

//============================================
/** The production payload when in that phase, else undefined. */
function productionPayload(state: GameState): ProductionPayload | undefined {
  return state.phase.kind === "production" ? state.phase.payload : undefined;
}

//============================================
/** The auction payload when in that phase, else undefined. */
function auctionPayload(state: GameState): AuctionPayload | undefined {
  return state.phase.kind === "auction" ? state.phase.payload : undefined;
}

//============================================
/** The scoring payload when in that phase, else undefined. */
function scoringPayload(state: GameState): ScoringPayload | undefined {
  return state.phase.kind === "scoring" ? state.phase.payload : undefined;
}
