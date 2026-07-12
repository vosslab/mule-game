// The auction arena's imperative trade-feedback layer: the flying goods
// glyph, the buyer flash, and the transient "UNITS TRADED n" banner. This is
// the PAYOFF moment of the whole screen -- a trade must READ as an event, not
// just append a row to a log. Split out of auction_arena.tsx (some helpers
// stayed there deliberately, see that file's module doc) because this is
// pure DOM choreography with its own lifecycle -- timers and injected SVG
// nodes that must never outlive the arena -- and belongs in one place a
// caller can attach, drive per frame, and tear down without threading that
// bookkeeping through the arena's own render logic.
//
// OWNERSHIP: this module only appends and removes children of the `<g
// class="auction-trade-layer">` element the caller supplies, and writes that
// same element's `data-flash-count` attribute. It never reads or touches
// anything else in the arena's DOM. `data-flash-count` is the one external
// contract (tests/playwright/auction_scene.spec.mjs and the release-gate
// walkthrough poll it to prove a trade registered) and stays exactly as
// before: incremented once per executed trade, monotonic for the layer's
// whole lifetime.
//
// REDUCED MOTION: the flash and the banner are created INSTANTLY regardless
// of the preference -- a trade always produces both the same frame it fires,
// so the player never waits to learn a trade happened or how many units ran.
// Only the flying goods glyph is skipped outright under reduced motion (the
// caller's `reducedMotion` flag), and the CSS entrance-pop keyframes for the
// flash and the banner are gated behind `@media (prefers-reduced-motion:
// no-preference)` in style.css, the same idiom the interim trade-flash rules
// already used.
//
// NES reference, Planet-inspired treatment: the NES auction flashes the
// buyer and prints a transient "N UNITS TRADED" line with no standing log
// (docs/active_plans/active/auction_native_recompose.md). The banner here
// reuses the going-price gold plate language the top band already
// established rather than an NES pixel font, so the moment reads as part of
// this screen's own material, not a pasted-in retro widget.

import type { Resource } from "../../engine/player";
import {
  BANNER_GUTTER,
  BANNER_WIDTH,
  RUNWAY_REGION,
  bandHeight,
  labelGutterBand,
  labelGutterCenterY,
  rectWidth,
} from "./auction_geometry";
import { resourceIconFill, resourceIconSymbolId } from "../sprites";
import { arenaSymbolId } from "../sprites/sprites_arena";

/** SVG namespace for the imperatively created trade-layer elements. */
const SVG_NS = "http://www.w3.org/2000/svg";

/** A point in arena viewBox coordinates. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** Rendered size of a flying goods-unit glyph, in viewBox units. */
const GOODS_SIZE = 22;
/** Rendered size of a trade-flash burst, in viewBox units. */
const FLASH_SIZE = 36;
/** Duration a flying goods glyph takes to travel between the trading pair. */
const GOODS_TRAVEL_MS = 420;
/** How long a trade-flash burst stays on screen before it is removed. */
const FLASH_MS = 320;
/** How long the flash's entrance pop takes to settle from its peak scale to 1. */
const FLASH_POP_MS = 300;
/** The scale a flash bursts in at, easing down to 1 over `FLASH_POP_MS`. */
const FLASH_POP_SCALE = 1.6;
/**
 * How long the "UNITS TRADED n" banner stays on screen before it clears
 * itself. Longer than `FLASH_MS` so the number is actually readable, but
 * short enough to stay clear of the fastest possible inter-trade gap
 * (`AUCTION_TRANSFER_MIN_TICKS` at `AUCTION_TICK_MS` is 500ms, src/engine/
 * constants.ts, src/ui/scenes/scene_manager.ts) -- a fast trade streak just
 * keeps replacing the banner with its own updated count rather than the two
 * fighting for the same seconds.
 */
const BANNER_MS = 900;

/**
 * The banner's plate height, DERIVED from the label gutter it lives in rather
 * than chosen: it is the gutter's own height less a unit of clearance at each
 * edge. The old hand-set 44 was taller than any gutter, which is how a banner
 * whose comment claimed it "never fights an avatar for the same pixels" ended up
 * covering a seller's price tag completely.
 */
const BANNER_HEIGHT = bandHeight(labelGutterBand(BANNER_GUTTER)) - 2;

/** One goods glyph in flight between a trading pair, advanced each frame. */
interface FlyingGood {
  readonly el: SVGUseElement;
  readonly from: Point;
  readonly to: Point;
  elapsed: number;
}

/**
 * One flash burst, advanced each frame. The burst's scale pop is driven HERE,
 * from its own `transform` attribute, rather than by a CSS animation -- see
 * `addFlash` for the bug that forced the move.
 */
interface FlashBurst {
  readonly el: SVGUseElement;
  readonly at: Point;
  readonly popping: boolean;
  elapsed: number;
}

/**
 * Everything one executed trade needs to animate: the good that changed
 * hands, the buyer's and seller's current arena positions (resolved by the
 * caller, which alone knows avatar and store-rail coordinates), whether
 * reduced motion is active, and the run's live units-traded count
 * (`AuctionPayload.runUnits`) for the banner.
 */
export interface TradeFxContext {
  readonly good: Resource;
  readonly buyerPos: Point;
  readonly sellerPos: Point;
  readonly reducedMotion: boolean;
  readonly runUnits: number;
}

/**
 * The live handle a caller drives: spawn one trade's animation, advance the
 * flying-goods glyphs by one frame, and tear everything down on unmount.
 */
export interface TradeFxHandle {
  readonly spawnTrade: (context: TradeFxContext) => void;
  readonly advance: (deltaMs: number) => void;
  readonly teardown: () => void;
}

//============================================
/**
 * Attach a trade-fx controller to an already-mounted SVG layer group. The
 * layer is the caller's `<g class="auction-trade-layer" data-flash-count="0">`
 * -- this function only appends and removes children of it and writes its
 * `data-flash-count` attribute; it never replaces or repositions the layer
 * itself.
 *
 * @param layer - The mounted trade-layer group element.
 * @returns A handle to spawn trades, advance per-frame motion, and tear down.
 */
export function attachTradeFx(layer: SVGGElement): TradeFxHandle {
  const flyingGoods: FlyingGood[] = [];
  const flashes: FlashBurst[] = [];
  let flashCount = 0;
  let bannerEl: SVGGElement | undefined;
  let bannerTimer: number | undefined;

  //------------------------------------------
  // Write a flash's transform: place it at its point, scaled by its pop.
  //
  // The glyph's own x/y are HALF ITS SIZE NEGATIVE, so the element's local
  // origin is its own center and `scale` therefore grows it about that center.
  // The position then comes entirely from the translate.
  const writeFlashTransform = (flash: FlashBurst, scale: number): void => {
    const transform = `translate(${flash.at.x.toFixed(2)}, ${flash.at.y.toFixed(2)}) scale(${scale.toFixed(3)})`;
    flash.el.setAttribute("transform", transform);
  };

  //------------------------------------------
  // A short-lived flash burst at a point, removed after FLASH_MS by `advance`.
  //
  // The pop is driven from the SVG `transform` ATTRIBUTE here, not from a CSS
  // `transform` on the element, and that is a bug fix rather than a preference.
  // The CSS route used `transform-box: fill-box` with `transform-origin: center`
  // on a `<use>` that was positioned by its `x`/`y` attributes -- and on a
  // `<use>`, fill-box resolves the origin inside the element's LOCAL box, which
  // knows nothing about that x/y placement. So `scale(1.6)` carried no
  // translation term and threw the burst outward in proportion to how far right
  // the buyer stood: measured 309px from the nearest avatar at mid-band, and
  // entirely OFF the 1024px stage (x=1199) when the market cleared at the
  // ceiling. The flash was not mis-anchored -- it was anchored correctly and
  // then flung away by the scale. Positioning by translate removes CSS
  // transform-box resolution from the picture entirely.
  const addFlash = (at: Point, reducedMotion: boolean): void => {
    const el = document.createElementNS(SVG_NS, "use");
    el.setAttribute("href", `#${arenaSymbolId("trade-flash")}`);
    el.setAttribute("class", "auction-trade-flash-burst");
    el.setAttribute("x", String(-FLASH_SIZE / 2));
    el.setAttribute("y", String(-FLASH_SIZE / 2));
    el.setAttribute("width", String(FLASH_SIZE));
    el.setAttribute("height", String(FLASH_SIZE));
    const burst: FlashBurst = { el, at, popping: !reducedMotion, elapsed: 0 };
    // Reduced motion lands at its final scale on the first frame it exists, so
    // the flash still appears instantly -- it just never travels or grows.
    writeFlashTransform(burst, burst.popping ? FLASH_POP_SCALE : 1);
    layer.appendChild(el);
    flashes.push(burst);
  };

  //------------------------------------------
  // A goods glyph starting at the seller, eased toward the buyer each frame
  // by `advance`. This is the literal picture of the trade: the good itself
  // crosses the runway, so supply moving to demand is something the player
  // watches happen rather than infers from a number changing.
  const addFlyingGood = (good: Resource, from: Point, to: Point): void => {
    const glyph = document.createElementNS(SVG_NS, "use");
    glyph.setAttribute("href", `#${resourceIconSymbolId(good)}`);
    glyph.setAttribute("class", "auction-trade-goods");
    // The resource symbols carry no fill of their own (src/ui/sprites.ts), so
    // without this the good that crosses the runway is a black blob on a dark
    // floor -- the one glyph in the animation that has to be recognizable.
    glyph.setAttribute("fill", resourceIconFill(good));
    glyph.setAttribute("width", String(GOODS_SIZE));
    glyph.setAttribute("height", String(GOODS_SIZE));
    glyph.setAttribute("x", (from.x - GOODS_SIZE / 2).toFixed(2));
    glyph.setAttribute("y", (from.y - GOODS_SIZE / 2).toFixed(2));
    layer.appendChild(glyph);
    flyingGoods.push({ el: glyph, from, to, elapsed: 0 });
  };

  //------------------------------------------
  // Replace the "UNITS TRADED n" banner with a fresh instance carrying the
  // run's current count, and (re)schedule its removal. Recreating the node on
  // every call -- rather than mutating one persistent node's text -- both
  // updates the count AND replays the entrance pop for free: a fresh element
  // always starts its CSS animation from the beginning, so a fast trade
  // streak keeps visibly re-announcing itself instead of the pop firing once
  // and the banner sitting there stale while the count keeps climbing.
  //
  // Placement: horizontally centered on the runway, vertically on the center of
  // `BANNER_GUTTER` -- a band DERIVED from the lane geometry
  // (auction_geometry.ts's `labelGutterBand`), not measured off the runway's
  // midpoint.
  //
  // The distinction is the whole bug. This banner's own comment used to claim it
  // sat "in the gutter between lane rows 1 and 2 ... a fixed band no avatar's
  // own extent ever reaches" while it actually sat at the runway's vertical
  // CENTER -- which, with four lanes, is the boundary BETWEEN lanes 2 and 3, and
  // lane 2's avatar reaches up through it. Worse, an avatar's extent is not just
  // its sprite: it carries a price tag above its head. The rendered frame showed
  // this plate covering a seller's "$67" tag completely. The gutter helper now
  // accounts for that head tag, the banner's height is derived from the gutter
  // rather than hand-set, and the geometry test asserts the band is empty.
  //
  // Trades can fire at any price along the runway, so no single lane or price
  // position is uniquely "the" trade spot; the flash already draws the eye to
  // the buyer, and centering the banner reinforces that focal point instead of
  // splitting attention.
  const showBanner = (units: number, reducedMotion: boolean): void => {
    if (bannerEl !== undefined) {
      bannerEl.remove();
    }
    if (bannerTimer !== undefined) {
      window.clearTimeout(bannerTimer);
    }

    const centerX = RUNWAY_REGION.left + rectWidth(RUNWAY_REGION) / 2;
    const centerY = labelGutterCenterY(BANNER_GUTTER);

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "auction-trade-banner");
    group.setAttribute("data-reduced-motion", reducedMotion ? "true" : "false");

    const plate = document.createElementNS(SVG_NS, "rect");
    plate.setAttribute("class", "auction-trade-banner-plate");
    plate.setAttribute("x", (centerX - BANNER_WIDTH / 2).toFixed(2));
    plate.setAttribute("y", (centerY - BANNER_HEIGHT / 2).toFixed(2));
    plate.setAttribute("width", String(BANNER_WIDTH));
    plate.setAttribute("height", String(BANNER_HEIGHT));
    plate.setAttribute("rx", "6");
    group.appendChild(plate);

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", "auction-trade-banner-text");
    text.setAttribute("x", centerX.toFixed(2));
    text.setAttribute("y", (centerY + 5).toFixed(2));
    text.setAttribute("text-anchor", "middle");
    text.textContent = `UNITS TRADED ${units}`;
    group.appendChild(text);

    layer.appendChild(group);
    bannerEl = group;

    bannerTimer = window.setTimeout(() => {
      group.remove();
      if (bannerEl === group) {
        bannerEl = undefined;
      }
      bannerTimer = undefined;
    }, BANNER_MS);
  };

  //------------------------------------------
  // Spawn the animation for one executed trade: a flash at the buyer, a
  // banner announcing the run's units-traded count, and (unless reduced
  // motion) a goods glyph flying from seller to buyer. The monotonic flash
  // counter records that the animation path ran, for the playwright safety
  // net and the release-gate walkthrough.
  const spawnTrade = (context: TradeFxContext): void => {
    flashCount += 1;
    layer.setAttribute("data-flash-count", String(flashCount));
    addFlash(context.buyerPos, context.reducedMotion);
    if (!context.reducedMotion) {
      addFlyingGood(context.good, context.sellerPos, context.buyerPos);
    }
    showBanner(context.runUnits, context.reducedMotion);
  };

  //------------------------------------------
  // Advance every flying goods glyph and every flash by one frame; remove those
  // that have finished. Both lifetimes are owned here rather than by a timer, so
  // the burst's scale and its removal are driven off the same clock the arena
  // already runs its avatar tween on.
  const advance = (deltaMs: number): void => {
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

    for (let index = flashes.length - 1; index >= 0; index -= 1) {
      const flash = flashes[index];
      if (flash === undefined) {
        continue;
      }
      flash.elapsed += deltaMs;
      if (flash.popping) {
        // Ease the burst down from its peak scale to its resting size. The
        // translate in the transform never changes, so the burst stays pinned to
        // the buyer for the whole pop instead of being flung away by the scale.
        const progress = Math.min(1, flash.elapsed / FLASH_POP_MS);
        const eased = 1 - (1 - progress) * (1 - progress);
        const scale = FLASH_POP_SCALE + (1 - FLASH_POP_SCALE) * eased;
        writeFlashTransform(flash, scale);
      }
      if (flash.elapsed >= FLASH_MS) {
        flash.el.remove();
        flashes.splice(index, 1);
      }
    }
  };

  //------------------------------------------
  // Remove every in-flight glyph, the banner if present, and clear every
  // pending timer, so nothing outlives the layer that owns this controller.
  // This is the class of bug this module exists to prevent: an animation
  // that keeps a timer alive or a node in the DOM after the arena tears
  // down leaks and can throw against elements that no longer exist.
  const teardown = (): void => {
    for (const good of flyingGoods) {
      good.el.remove();
    }
    flyingGoods.length = 0;
    for (const flash of flashes) {
      flash.el.remove();
    }
    flashes.length = 0;
    if (bannerTimer !== undefined) {
      window.clearTimeout(bannerTimer);
      bannerTimer = undefined;
    }
    if (bannerEl !== undefined) {
      bannerEl.remove();
      bannerEl = undefined;
    }
  };

  return { spawnTrade, advance, teardown };
}
