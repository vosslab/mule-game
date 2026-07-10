// Spatial auction scene as a SolidJS component.
//
// This replaces the abstract SVG price track with the original M.U.L.E. spatial
// auction: each player's species AVATAR stands in its own lane on a vertical
// price axis, and its y position is DERIVED from the engine's authoritative
// participant price (avatars are presentation only). Buyers walk up as they
// raise their bid, sellers walk down as they lower their ask; when a buyer and
// seller cross, the engine records a trade and a goods glyph animates between
// the pair (or the store edge, for store trades).
//
// State vs motion split (the plan's architecture): reactivity owns STATE and
// imperative transforms own 60fps MOTION.
//   - Reactive (Solid signals -> DOM): the price-marker token dots (`cy` snaps
//     per tick), store band lines, per-avatar `data-role`, the crisp price
//     readout, and the trade log.
//   - Imperative (scene-manager rAF, refs, transform writes): each avatar
//     group's `translate(...)` is eased toward its price-derived target every
//     animation frame; the walk-cycle frame swaps while an avatar is moving;
//     trade goods/flash glyphs are created and moved in the trade layer.
// Under emulated `prefers-reduced-motion: reduce` the avatars SNAP to their
// price-derived y with no interpolation and hold the frame-1 idle pose, and a
// trade shows an instant flash with no travel. No CSS transitions are used for
// avatar motion, so a reduced-motion render carries no tween artifacts.
//
// Selector contract preserved for tests/playwright/game_flow.spec.mjs (must
// pass unmodified): `.auction-track-svg`, one `.auction-track-token` circle per
// participant in playerId order with a reactive `cy`, exactly one
// `.auction-track-store-buy-line` and one `.auction-track-store-sell-line`, the
// `.auction-screen-role-button` role choices, and the `.auction-screen-trade-log`
// panel. New hooks for tests/playwright/auction_scene.spec.mjs: `.auction-avatar`
// groups carry `data-actor="player-N"`, `data-role`, and a per-frame `data-y`;
// the arena root carries `data-reduced-motion`; the trade layer carries a
// monotonic `data-flash-count`.
//
// Slot -> species mapping (fixed until species selection lands): player slots
// 0..3 map to SPECIES_BY_SLOT below (humanoid, gollumer, mechtron, packer), the
// first four silhouette-distinct species in SPECIES_NAMES. Documented here so a
// later species-select milestone replaces this fixed map with a player choice.

import { For, Show, Switch, Match, onMount, onCleanup, createSignal, createEffect } from "solid-js";
import type { JSX } from "solid-js";
import type {
  Action,
  AuctionPayload,
  AuctionParticipant,
  AuctionRole,
  AuctionTrade,
} from "../../engine/game_state";
import type { GameStore } from "../game_store";
import { HUMAN_ID } from "../game_driver";
import { notifyAuctionCommit, onSceneFrame } from "../scenes/scene_manager";
import { priceToTrackY, easeToward } from "../scenes/auction_tween";
import { buildSpriteDefsMarkup, playerColor, resourceIconSymbolId } from "../sprites";
import type { SpeciesName } from "../sprites/sprites_species";
import {
  speciesSymbolId,
  pickSpeciesFrameId,
  buildSpeciesSpriteDefsMarkup,
} from "../sprites/sprites_species";
import { arenaSymbolId, buildArenaSpriteDefsMarkup } from "../sprites/sprites_arena";
import { TutorialHint } from "./tutorial_hint";

/** Height (in SVG units) of the price track, top to bottom. */
const TRACK_HEIGHT = 400;
/** Width (in SVG units) of the spatial arena. */
const TRACK_WIDTH = 280;
/** Number of player lanes across the arena width (one per player). */
const PLAYER_LANES = 4;
/** Rendered size of a species avatar in SVG units. */
const AVATAR_SIZE = 44;
/** Rendered size of a flying goods-unit glyph in SVG units. */
const GOODS_SIZE = 16;
/** Rendered size of a trade-flash burst in SVG units. */
const FLASH_SIZE = 28;
/** SVG namespace for imperatively created trade-layer elements. */
const SVG_NS = "http://www.w3.org/2000/svg";
/** Store's sentinel participant id in a trade (matches AUCTION_STORE_ID). */
const STORE_ID = 4;

/** Number of most recent trades to show in the trade flash list. */
const RECENT_TRADE_COUNT = 5;

/** Avatar easing rate per second; larger converges to the target y faster. */
const TWEEN_RATE = 11;
/** Snap-to-target threshold (SVG units) below which an avatar is "arrived". */
const ARRIVAL_EPSILON = 0.4;
/** Walk-cycle frame-swap cadence in milliseconds while an avatar is moving. */
const WALK_FRAME_MS = 140;
/** Duration a flying goods glyph takes to travel between the trading pair. */
const GOODS_TRAVEL_MS = 420;
/** How long a trade-flash burst stays on screen before it is removed. */
const FLASH_MS = 320;

/**
 * Fixed slot -> species map used until species selection lands. Player slots
 * 0..3 (playerId order) take the first four silhouette-distinct species; a later
 * milestone replaces this with the player's chosen species.
 */
const SPECIES_BY_SLOT: readonly SpeciesName[] = ["humanoid", "gollumer", "mechtron", "packer"];

/** The interactive mode the auction scene shows. */
type AuctionMode = "finished" | "role-choice" | "track";

/** A point in arena SVG coordinates. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** One goods glyph in flight between a trading pair, updated each frame. */
interface FlyingGood {
  readonly el: SVGUseElement;
  readonly from: Point;
  readonly to: Point;
  elapsed: number;
}

/** Props for the auction scene. */
export interface AuctionScreenProps {
  /** The live game store, for dispatch and current-state reads. */
  readonly store: GameStore;
  /** Reactive accessor for the auction payload. */
  readonly payload: () => AuctionPayload;
}

//============================================
/**
 * Center x of a player's lane. Lanes divide the arena width evenly, one per
 * player, so each avatar keeps a stable horizontal column across the window.
 *
 * @param slot - Player slot (playerId, 0..3).
 * @returns The lane center x in arena units.
 */
function laneCenterX(slot: number): number {
  return (TRACK_WIDTH * (slot + 0.5)) / PLAYER_LANES;
}

//============================================
/**
 * The sideline "line judge" spot where an out participant parks: a spectator
 * position beside the price track, off the trading lanes, so a sitting-out
 * player watches the action rather than standing on the price axis. This mirrors
 * planet_mule, where a non-participating player is drawn off the price track and
 * shows no price figure (view/AuctionPainter.java:188-215).
 *
 * This helper is the single seam the planned landscape-rotation task edits.
 * Because it returns a full arena point derived from the arena dimensions and
 * the player's slot, rotating the track (price advancing left-to-right instead
 * of top-to-bottom) only rewrites this one function, not every avatar-placement
 * call site. For the current vertical track the sideline runs down the right
 * edge, with judges staggered by slot so they line up without overlapping.
 *
 * @param slot - Player slot (playerId, 0..3).
 * @returns The judge spot center in arena units.
 */
function sidelineSpot(slot: number): Point {
  // Hug the right edge so the avatar sits fully inside the arena, beside the track.
  const x = TRACK_WIDTH - AVATAR_SIZE / 2;
  // Stagger judges down the sideline, one reserved band per slot.
  const y = (TRACK_HEIGHT * (slot + 0.5)) / PLAYER_LANES;
  return { x, y };
}

//============================================
/**
 * The species a player slot renders until species selection lands.
 *
 * @param slot - Player slot (playerId, 0..3).
 * @returns The slot's fixed species.
 */
function speciesForSlot(slot: number): SpeciesName {
  return SPECIES_BY_SLOT[slot] ?? "humanoid";
}

//============================================
/**
 * Whether the browser currently reports a reduced-motion preference. Read once
 * to seed the signal and again on every media-query change.
 *
 * @returns True when `prefers-reduced-motion: reduce` matches.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

//============================================
/**
 * Render the auction scene: header, crisp price readout, and whichever
 * interactive mode the current payload calls for. The arena root carries
 * `data-reduced-motion` so a browser test can confirm the emulated preference
 * reached the scene.
 *
 * @param props - Carries the store and the auction payload accessor.
 * @returns The auction scene element.
 */
export function AuctionScreen(props: AuctionScreenProps): JSX.Element {
  const dispatch = (action: Action): void => props.store.dispatch(action);
  const [reducedMotion, setReducedMotion] = createSignal(prefersReducedMotion());

  onMount(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (): void => {
      setReducedMotion(mediaQuery.matches);
    };
    mediaQuery.addEventListener("change", onChange);
    onCleanup(() => mediaQuery.removeEventListener("change", onChange));
  });

  const mode = (): AuctionMode => {
    const payload = props.payload();
    if (payload.finished) {
      return "finished";
    }
    // At the opening tick the human confirms or overrides the engine's
    // auto-assigned role before the clock runs; committing a role starts the
    // clock, which advances the tick and swaps this to the live arena.
    if (payload.tick === 0) {
      return "role-choice";
    }
    return "track";
  };

  return (
    <div class="auction-screen" data-reduced-motion={reducedMotion() ? "true" : "false"}>
      <TutorialHint
        kind="auction"
        message="Choose Buy, Sell, or Sit Out for this good -- your avatar walks the price track as you raise or lower your offer."
      />
      <div class="auction-screen-header">
        <span class="auction-screen-good">{`Auction: ${props.payload().good}`}</span>
        <span class="auction-screen-ticks">{`Ticks left: ${props.payload().ticksRemaining}`}</span>
      </div>
      <Switch>
        <Match when={mode() === "finished"}>
          <FinishedPanel dispatch={dispatch} />
        </Match>
        <Match when={mode() === "role-choice"}>
          <RolePanel dispatch={dispatch} />
        </Match>
        <Match when={mode() === "track"}>
          <ArenaPanel payload={props.payload} dispatch={dispatch} reducedMotion={reducedMotion} />
        </Match>
      </Switch>
    </div>
  );
}

//============================================
/**
 * Finished panel: a completion message and a Continue button that ends the
 * auction (the scene manager also auto-advances after a pause).
 *
 * @param props - Carries the dispatch function.
 * @returns The finished panel element.
 */
function FinishedPanel(props: { readonly dispatch: (action: Action) => void }): JSX.Element {
  return (
    <div class="auction-screen-panel auction-screen-finished-panel">
      <p class="auction-screen-finished-message">Round of trading complete.</p>
      <button
        type="button"
        class="auction-screen-button auction-screen-continue-button"
        data-action="auction-continue"
        onClick={() => props.dispatch({ type: "end_auction" })}
      >
        Continue
      </button>
    </div>
  );
}

//============================================
/**
 * Role-choice bar: Buy / Sell / Sit Out buttons. Choosing declares the human's
 * role for this good and notifies the scene manager that the auction clock may
 * start (even when the choice is to sit out).
 *
 * @param props - Carries the dispatch function.
 * @returns The role-choice panel element.
 */
function RolePanel(props: { readonly dispatch: (action: Action) => void }): JSX.Element {
  const roles: readonly { readonly role: AuctionRole; readonly label: string }[] = [
    { role: "buyer", label: "Buy" },
    { role: "seller", label: "Sell" },
    { role: "out", label: "Sit Out" },
  ];
  const choose = (role: AuctionRole): void => {
    props.dispatch({ type: "set_auction_role", playerId: HUMAN_ID, role });
    notifyAuctionCommit();
  };
  return (
    <div class="auction-screen-panel auction-screen-role-panel">
      <p class="auction-screen-role-hint">Choose your side for this good's auction.</p>
      <For each={roles}>
        {(entry) => (
          <button
            type="button"
            class="auction-screen-button auction-screen-role-button"
            data-action="auction-role"
            data-role={entry.role}
            onClick={() => choose(entry.role)}
          >
            {entry.label}
          </button>
        )}
      </For>
    </div>
  );
}

//============================================
/**
 * Live arena panel: the crisp price readout, the spatial price arena, the trade
 * log, and the up/down price-intent controls (keyboard held-arrows plus
 * press-and-hold touch buttons). Keyboard intent is edge-driven to match the
 * engine's discrete up/down/hold intent model: keydown sets the held direction,
 * keyup releases to hold, and OS auto-repeat is ignored. This keeps the scene
 * fully keyboard-playable without a per-frame poller, since the engine, not the
 * keyboard, advances the avatar position (through the price it derives from).
 *
 * @param props - Carries the payload accessor, dispatch, and reduced-motion
 *   accessor.
 * @returns The arena panel fragment.
 */
function ArenaPanel(props: {
  readonly payload: () => AuctionPayload;
  readonly dispatch: (action: Action) => void;
  readonly reducedMotion: () => boolean;
}): JSX.Element {
  const setIntent = (intent: "up" | "down" | "hold"): void => {
    props.dispatch({ type: "set_auction_intent", playerId: HUMAN_ID, intent });
  };

  onMount(() => {
    // Intent is a held state, so ignore OS key auto-repeat: the first keydown
    // set the intent and repeats are redundant. Keyup releases back to "hold".
    const onKeyDown = (event: KeyboardEvent): void => {
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
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        setIntent("hold");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    onCleanup(() => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    });
  });

  return (
    <>
      <PriceReadout payload={props.payload} />
      <div class="auction-screen-panel auction-screen-track-panel">
        <PriceArena payload={props.payload} reducedMotion={props.reducedMotion} />
      </div>
      <TradeLog payload={props.payload} />
      <div class="auction-screen-intent-controls">
        <IntentButton
          label="Up"
          className="auction-screen-intent-up"
          dataAction="auction-intent-up"
          onPress={() => setIntent("up")}
          onRelease={() => setIntent("hold")}
        />
        <IntentButton
          label="Down"
          className="auction-screen-intent-down"
          dataAction="auction-intent-down"
          onPress={() => setIntent("down")}
          onRelease={() => setIntent("hold")}
        />
      </div>
    </>
  );
}

//============================================
/**
 * Crisp price readout: the good name, the store's live buy/sell quotes, and
 * each player's current price and role. Rendered as high-contrast, monospace,
 * right-aligned text so the numbers stay readable and column-aligned as they
 * move, addressing the art gate's price-readability criterion.
 *
 * @param props - Carries the auction payload accessor.
 * @returns The price-readout element.
 */
function PriceReadout(props: { readonly payload: () => AuctionPayload }): JSX.Element {
  const money = (amount: number): string => `$${amount}`;
  return (
    <div class="auction-price-readout" aria-live="polite">
      <div class="auction-price-store">
        <span class="auction-price-good-name">{props.payload().good}</span>
        <span class="auction-price-store-quote">{`store buy ${money(props.payload().storeBuyPrice)}`}</span>
        <span class="auction-price-store-quote">{`store sell ${money(props.payload().storeSellPrice)}`}</span>
      </div>
      <ul class="auction-price-players">
        <For each={props.payload().participants}>
          {(participant) => (
            <li class="auction-price-player" data-actor-readout={`player-${participant.playerId}`}>
              <span
                class="auction-price-swatch"
                style={{ "background-color": playerColor(participant.playerId) }}
              />
              <span class="auction-price-role">{roleLabel(participant.role)}</span>
              <span class="auction-price-value">
                {participant.role === "out" ? "--" : money(participant.price)}
              </span>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

//============================================
/**
 * The spatial price arena SVG: arena chrome backdrop, the store buy/sell band
 * lines and bracket, the central price axis, one price-marker token dot per
 * participant (reactive `cy`), one species avatar per participant (imperatively
 * tweened), and the trade-animation layer on top. The avatar tween loop and the
 * trade animations run off the scene manager's rAF via `onSceneFrame`.
 *
 * @param props - Carries the payload accessor and reduced-motion accessor.
 * @returns The arena `<svg>` element.
 */
function PriceArena(props: {
  readonly payload: () => AuctionPayload;
  readonly reducedMotion: () => boolean;
}): JSX.Element {
  const axisX = TRACK_WIDTH / 2;
  const bandY = (price: number): number =>
    priceToTrackY(price, props.payload().priceFloor, props.payload().priceCeiling, TRACK_HEIGHT);

  // An avatar's target position: an out participant parks at its sideline judge
  // spot (beside the track); a buyer or seller stands in its lane at its price.
  const avatarTarget = (participant: AuctionParticipant): Point =>
    participant.role === "out"
      ? sidelineSpot(participant.playerId)
      : { x: laneCenterX(participant.playerId), y: bandY(participant.price) };

  // Imperative avatar state, indexed by player slot (playerId 0..3). The token
  // dots stay reactive; only the avatar groups tween.
  const avatarGroups: (SVGGElement | undefined)[] = [];
  const avatarSprites: (SVGUseElement | undefined)[] = [];
  const avatarY: number[] = [];

  // Trade-animation layer state.
  let tradeLayer: SVGGElement | undefined;
  const flyingGoods: FlyingGood[] = [];
  const flashTimers = new Set<number>();
  let flashCount = 0;
  let lastTradeCount = props.payload().trades.length;

  // Frame-loop bookkeeping for the walk-cycle clock.
  let lastNow = 0;
  let walkClockMs = 0;
  let walkFrame: 1 | 2 = 1;

  //------------------------------------------
  // Register an avatar's refs and snap it to its current price-derived y so it
  // never flashes at the SVG origin before the first frame runs.
  const registerAvatar = (slot: number, group: SVGGElement, sprite: SVGUseElement): void => {
    avatarGroups[slot] = group;
    avatarSprites[slot] = sprite;
    const payload = props.payload();
    const participant = payload.participants[slot];
    if (participant === undefined) {
      return;
    }
    const target = avatarTarget(participant);
    avatarY[slot] = target.y;
    writeAvatarTransform(group, target.x, target.y);
  };

  //------------------------------------------
  // The store's edge position for a store-side trade: the store sells at the
  // ceiling and buys at the floor, both on the central axis.
  const storePosition = (side: "buy" | "sell"): Point => {
    const payload = props.payload();
    const price = side === "sell" ? payload.storeSellPrice : payload.storeBuyPrice;
    return { x: axisX, y: bandY(price) };
  };

  //------------------------------------------
  // A trade participant's current arena position: a player's tweened avatar
  // position, or the store edge for the store sentinel id.
  const actorPosition = (id: number, side: "buy" | "sell"): Point => {
    if (id === STORE_ID) {
      return storePosition(side);
    }
    const payload = props.payload();
    const participant = payload.participants[id];
    const y =
      avatarY[id] ?? (participant !== undefined ? bandY(participant.price) : TRACK_HEIGHT / 2);
    return { x: laneCenterX(id), y };
  };

  //------------------------------------------
  // Spawn the animation for one executed trade: a flash at the buyer, and
  // (unless reduced motion) a goods glyph flying from seller to buyer. The
  // monotonic flash counter records that the animation path ran.
  const spawnTradeAnimation = (trade: AuctionTrade): void => {
    const layer = tradeLayer;
    if (layer === undefined) {
      return;
    }
    const buyerPos = actorPosition(trade.buyerId, "buy");
    const sellerPos = actorPosition(trade.sellerId, "sell");
    flashCount += 1;
    layer.setAttribute("data-flash-count", String(flashCount));
    addFlash(layer, buyerPos);
    if (!props.reducedMotion()) {
      addFlyingGood(layer, props.payload().good, sellerPos, buyerPos);
    }
  };

  //------------------------------------------
  // Add a short-lived flash burst at a point, removed after FLASH_MS.
  const addFlash = (layer: SVGGElement, at: Point): void => {
    const flash = document.createElementNS(SVG_NS, "use");
    flash.setAttribute("href", `#${arenaSymbolId("trade-flash")}`);
    flash.setAttribute("class", "auction-trade-flash-burst");
    flash.setAttribute("x", (at.x - FLASH_SIZE / 2).toFixed(2));
    flash.setAttribute("y", (at.y - FLASH_SIZE / 2).toFixed(2));
    flash.setAttribute("width", String(FLASH_SIZE));
    flash.setAttribute("height", String(FLASH_SIZE));
    layer.appendChild(flash);
    const timer = window.setTimeout(() => {
      flash.remove();
      flashTimers.delete(timer);
    }, FLASH_MS);
    flashTimers.add(timer);
  };

  //------------------------------------------
  // Add a goods glyph starting at the seller, to be eased toward the buyer by
  // the frame loop.
  const addFlyingGood = (
    layer: SVGGElement,
    good: AuctionPayload["good"],
    from: Point,
    to: Point,
  ): void => {
    const glyph = document.createElementNS(SVG_NS, "use");
    glyph.setAttribute("href", `#${resourceIconSymbolId(good)}`);
    glyph.setAttribute("class", "auction-trade-goods");
    glyph.setAttribute("width", String(GOODS_SIZE));
    glyph.setAttribute("height", String(GOODS_SIZE));
    glyph.setAttribute("x", (from.x - GOODS_SIZE / 2).toFixed(2));
    glyph.setAttribute("y", (from.y - GOODS_SIZE / 2).toFixed(2));
    layer.appendChild(glyph);
    flyingGoods.push({ el: glyph, from, to, elapsed: 0 });
  };

  //------------------------------------------
  // Advance every flying goods glyph by one frame; remove those that arrived.
  const updateFlyingGoods = (deltaMs: number): void => {
    for (let index = flyingGoods.length - 1; index >= 0; index -= 1) {
      const good = flyingGoods[index];
      if (good === undefined) {
        continue;
      }
      good.elapsed += deltaMs;
      const progress = Math.min(1, good.elapsed / GOODS_TRAVEL_MS);
      const x = good.from.x + (good.to.x - good.from.x) * progress;
      const y = good.from.y + (good.to.y - good.from.y) * progress;
      good.el.setAttribute("x", (x - GOODS_SIZE / 2).toFixed(2));
      good.el.setAttribute("y", (y - GOODS_SIZE / 2).toFixed(2));
      if (progress >= 1) {
        good.el.remove();
        flyingGoods.splice(index, 1);
      }
    }
  };

  //------------------------------------------
  // One animation frame: ease each avatar toward its price-derived y (or snap
  // under reduced motion), swap walk frames while moving, and advance goods.
  const onFrameTick = (now: number): void => {
    const deltaMs = lastNow === 0 ? 0 : now - lastNow;
    lastNow = now;
    const deltaSeconds = deltaMs / 1000;
    const payload = props.payload();
    const reduced = props.reducedMotion();

    // Advance the shared walk-cycle clock, toggling the stride frame.
    walkClockMs += deltaMs;
    if (walkClockMs >= WALK_FRAME_MS) {
      walkClockMs = 0;
      walkFrame = walkFrame === 1 ? 2 : 1;
    }

    for (const participant of payload.participants) {
      const slot = participant.playerId;
      const target = avatarTarget(participant);
      const group = avatarGroups[slot];
      const sprite = avatarSprites[slot];

      // An out participant is a static spectator: snap to its sideline judge
      // spot and stand still (frame 1, no walk cycle).
      if (participant.role === "out") {
        avatarY[slot] = target.y;
        if (group !== undefined) {
          writeAvatarTransform(group, target.x, target.y);
        }
        if (sprite !== undefined) {
          const frameId = `#${pickSpeciesFrameId(speciesForSlot(slot), 1, reduced)}`;
          if (sprite.getAttribute("href") !== frameId) {
            sprite.setAttribute("href", frameId);
          }
        }
        continue;
      }

      // A buyer or seller keeps its lane x and eases vertically toward its price.
      const current = avatarY[slot] ?? target.y;
      const next = reduced
        ? target.y
        : easeToward(current, target.y, deltaSeconds, TWEEN_RATE, ARRIVAL_EPSILON);
      avatarY[slot] = next;
      const moving = !reduced && next !== target.y;

      if (group !== undefined) {
        writeAvatarTransform(group, target.x, next);
      }
      if (sprite !== undefined) {
        const desiredFrame: 1 | 2 = moving ? walkFrame : 1;
        const frameId = `#${pickSpeciesFrameId(speciesForSlot(slot), desiredFrame, reduced)}`;
        if (sprite.getAttribute("href") !== frameId) {
          sprite.setAttribute("href", frameId);
        }
      }
    }

    updateFlyingGoods(deltaMs);
  };

  //------------------------------------------
  // Tear down: remove any in-flight goods, clear flash timers.
  const teardownAnimations = (): void => {
    for (const good of flyingGoods) {
      good.el.remove();
    }
    flyingGoods.length = 0;
    for (const timer of flashTimers) {
      window.clearTimeout(timer);
    }
    flashTimers.clear();
  };

  onMount(() => {
    const unsubscribe = onSceneFrame(onFrameTick);
    onCleanup(() => {
      unsubscribe();
      teardownAnimations();
    });
  });

  // Trades are additive; when the log grows, animate each newly-appended trade.
  createEffect(() => {
    const trades = props.payload().trades;
    if (trades.length > lastTradeCount) {
      for (let index = lastTradeCount; index < trades.length; index += 1) {
        const trade = trades[index];
        if (trade !== undefined) {
          spawnTradeAnimation(trade);
        }
      }
      lastTradeCount = trades.length;
    }
  });

  return (
    <svg
      class="auction-track-svg"
      viewBox={`0 0 ${TRACK_WIDTH} ${TRACK_HEIGHT}`}
      role="img"
      aria-label="Auction price arena"
    >
      <g
        innerHTML={
          buildSpriteDefsMarkup() + buildSpeciesSpriteDefsMarkup() + buildArenaSpriteDefsMarkup()
        }
      />
      <use
        href={`#${arenaSymbolId("backdrop")}`}
        x={0}
        y={0}
        width={TRACK_WIDTH}
        height={TRACK_HEIGHT}
      />
      <StoreBandBracket
        buyY={bandY(props.payload().storeSellPrice)}
        sellY={bandY(props.payload().storeBuyPrice)}
      />
      <line x1={axisX} y1={0} x2={axisX} y2={TRACK_HEIGHT} class="auction-track-axis" />
      <line
        x1={0}
        y1={bandY(props.payload().storeBuyPrice)}
        x2={TRACK_WIDTH}
        y2={bandY(props.payload().storeBuyPrice)}
        class="auction-track-store-buy-line"
      />
      <line
        x1={0}
        y1={bandY(props.payload().storeSellPrice)}
        x2={TRACK_WIDTH}
        y2={bandY(props.payload().storeSellPrice)}
        class="auction-track-store-sell-line"
      />
      <For each={props.payload().participants}>
        {(participant) => (
          <Show when={participant.role !== "out"}>
            <circle
              class="auction-track-token"
              cx={laneCenterX(participant.playerId)}
              cy={bandY(participant.price)}
              r={5}
              fill={playerColor(participant.playerId)}
            />
          </Show>
        )}
      </For>
      <For each={props.payload().participants}>
        {(participant) => (
          <Avatar
            slot={participant.playerId}
            participant={participant}
            species={speciesForSlot(participant.playerId)}
            register={registerAvatar}
          />
        )}
      </For>
      <g
        class="auction-trade-layer"
        data-flash-count="0"
        ref={(el) => {
          tradeLayer = el;
        }}
      />
    </svg>
  );
}

//============================================
/**
 * The store's buy/sell band bracket: the arena-chrome band symbol stretched to
 * span the two store-quote y coordinates, layered behind the dashed band lines
 * as a shaded price zone. Buyers above the top edge and sellers below the bottom
 * edge are outside the store's spread.
 *
 * @param props - Carries the top (`buyY`, the higher-priced ceiling) and bottom
 *   (`sellY`, the lower-priced floor) band y coordinates.
 * @returns The band bracket `<use>` element, or nothing for a zero-height band.
 */
function StoreBandBracket(props: { readonly buyY: number; readonly sellY: number }): JSX.Element {
  const top = (): number => Math.min(props.buyY, props.sellY);
  const height = (): number => Math.abs(props.sellY - props.buyY);
  return (
    <Show when={height() > 0}>
      <use
        href={`#${arenaSymbolId("store-band")}`}
        x={0}
        y={top()}
        width={TRACK_WIDTH}
        height={height()}
      />
    </Show>
  );
}

/** Props for one avatar. */
interface AvatarProps {
  /** Player slot (playerId, 0..3): lane, species, and ref index. */
  readonly slot: number;
  /** The participant whose role tints the group's `data-role`. */
  readonly participant: AuctionParticipant;
  /** The species silhouette to render. */
  readonly species: SpeciesName;
  /** Called on mount with the group and sprite refs for the tween loop. */
  readonly register: (slot: number, group: SVGGElement, sprite: SVGUseElement) => void;
}

//============================================
/**
 * One player's species avatar: a `<g>` carrying the test hooks (`data-actor`,
 * reactive `data-role`, and the per-frame `data-y` the tween loop writes) around
 * a tintable `<use>` of the species walk symbol. The group's `transform` and the
 * sprite's `href` are written imperatively by the tween loop; the initial pose
 * is set on mount via `register`, so nothing here binds them reactively.
 *
 * @param props - Carries the slot, participant, species, and register callback.
 * @returns The avatar `<g>` group.
 */
function Avatar(props: AvatarProps): JSX.Element {
  let groupEl: SVGGElement | undefined;
  let spriteEl: SVGUseElement | undefined;
  const color = playerColor(props.participant.playerId);
  onMount(() => {
    if (groupEl !== undefined && spriteEl !== undefined) {
      props.register(props.slot, groupEl, spriteEl);
    }
  });
  return (
    <g
      ref={(el) => {
        groupEl = el;
      }}
      class="auction-avatar"
      data-actor={`player-${props.participant.playerId}`}
      data-role={props.participant.role}
    >
      <use
        ref={(el) => {
          spriteEl = el;
        }}
        class="auction-avatar-sprite"
        href={`#${speciesSymbolId(props.species, 1)}`}
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
        style={{ color }}
      />
    </g>
  );
}

//============================================
/**
 * Write an avatar group's transform so its center sits at (`centerX`, `centerY`),
 * and mirror the center y onto `data-y` for browser tests to poll. Taking an
 * explicit center x (rather than deriving it from the lane) lets an out
 * participant park on the sideline, off its trading lane.
 *
 * @param group - The avatar group element.
 * @param centerX - The avatar's center x in arena units.
 * @param centerY - The avatar's center y in arena units.
 */
function writeAvatarTransform(group: SVGGElement, centerX: number, centerY: number): void {
  const x = centerX - AVATAR_SIZE / 2;
  const y = centerY - AVATAR_SIZE / 2;
  group.setAttribute("transform", `translate(${x.toFixed(2)}, ${y.toFixed(2)})`);
  group.setAttribute("data-y", centerY.toFixed(1));
}

//============================================
/**
 * Trade log: a flash line for a just-executed trade and a list of the most
 * recent trades, or an empty message when no trades have fired.
 *
 * @param props - Carries the auction payload accessor.
 * @returns The trade log panel element.
 */
function TradeLog(props: { readonly payload: () => AuctionPayload }): JSX.Element {
  const recent = (): AuctionTrade[] => props.payload().trades.slice(-RECENT_TRADE_COUNT).reverse();
  const flash = (): string | null => {
    const payload = props.payload();
    const latest = payload.trades[payload.trades.length - 1];
    if (latest !== undefined && latest.tick === payload.tick - 1) {
      return `Traded ${latest.quantity} unit at $${latest.price}`;
    }
    return null;
  };
  return (
    <div class="auction-screen-panel auction-screen-trade-log">
      <Show when={recent().length === 0}>
        <p class="auction-screen-trade-empty">No trades yet.</p>
      </Show>
      <Show when={flash()}>{(text) => <p class="auction-screen-trade-flash">{text()}</p>}</Show>
      <Show when={recent().length > 0}>
        <ul class="auction-screen-trade-list">
          <For each={recent()}>
            {(trade) => (
              <li class="auction-screen-trade-item">
                {`tick ${trade.tick}: ${trade.quantity} @ $${trade.price}`}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

//============================================
/**
 * A press-and-hold intent button: fires onPress on pointerdown and onRelease on
 * pointerup / leave / cancel, so a dragged-off touch still releases the hold.
 *
 * @param props - Carries the label, extra class, and press/release handlers.
 * @returns The intent button element.
 */
function IntentButton(props: {
  readonly label: string;
  readonly className: string;
  readonly dataAction: string;
  readonly onPress: () => void;
  readonly onRelease: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      class={`auction-screen-button auction-screen-intent-button ${props.className}`}
      data-action={props.dataAction}
      onPointerDown={() => props.onPress()}
      onPointerUp={() => props.onRelease()}
      onPointerLeave={() => props.onRelease()}
      onPointerCancel={() => props.onRelease()}
    >
      {props.label}
    </button>
  );
}

//============================================
/**
 * A short role label for the price readout.
 *
 * @param role - The participant's auction role.
 * @returns The uppercase label to show.
 */
function roleLabel(role: AuctionRole): string {
  if (role === "buyer") {
    return "BUY";
  }
  if (role === "seller") {
    return "SELL";
  }
  return "OUT";
}
