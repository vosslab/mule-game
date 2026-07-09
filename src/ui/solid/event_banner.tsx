// Event banner as a SolidJS component.
//
// A reusable vignette banner for the personal and colony event payloads
// events.ts fires: the matching sprites_events.ts icon, a title line (the
// event's own narrated message), and a short effect line, auto-dismissing
// itself after a caller-supplied hold. One component serves both event
// kinds via the discriminated `source` prop, so the icon lookup, timer, and
// reduced-motion handling live in exactly one place.
//
// Pacing: this banner never dispatches or gates an engine tick itself -- it
// only manages its own visibility. The one place the engine clock actually
// pauses is src/ui/scenes/scene_manager.ts, which imports
// PERSONAL_EVENT_BANNER_HOLD_MS from this module and holds the develop tick
// clock for exactly that long at the START of the HUMAN's own develop turn
// (the only turn a human is both reading the banner and about to act on the
// tick budget it drains). Every other case -- an AI player's personal event,
// or a colony event during production -- is a non-blocking overlay: the
// scene manager's normal cadence (AI_STEP_MS, PRODUCTION_PAUSE_MS) keeps
// running underneath it, using PASSIVE_EVENT_BANNER_HOLD_MS instead.
//
// prefers-reduced-motion: the banner's mount/dismiss timing is identical
// either way (JS-driven, not CSS-driven); only the CSS entrance animation
// (gated by @media (prefers-reduced-motion: no-preference) in style.css) is
// skipped, so a reduced-motion render is a plain timed static display.

import { Show, createSignal, onMount, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type { ColonyEventResult, ColonyEventType, PersonalEventResult } from "../../engine/events";
import type { ColonyEventName } from "../sprites/sprites_events";
import {
  buildEventSpriteDefsMarkup,
  colonyEventSymbolId,
  personalEventBadgeSymbolId,
  EVENT_VIGNETTE_SIZE,
} from "../sprites/sprites_events";

/**
 * How long a personal-event banner holds the engine's develop tick clock (and
 * stays on screen) when it fires on the HUMAN's own develop turn, in ms at 1x
 * scene speed. Imported by scene_manager.ts so the engine hold and this
 * banner's own display duration never drift apart -- the banner would either
 * outlive the hold (looking stuck) or vanish before it (looking cut off).
 */
export const PERSONAL_EVENT_BANNER_HOLD_MS = 1800;

/**
 * How long a non-blocking banner (an AI player's personal event, or a colony
 * event during production) stays on screen. Nothing waits on this timer, so
 * it is purely a display choice -- long enough to read, short enough not to
 * outlast the production interstitial's own auto-advance pause.
 */
export const PASSIVE_EVENT_BANNER_HOLD_MS = 1800;

/**
 * Map events.ts's snake_case `ColonyEventType` to sprites_events.ts's own
 * kebab-case `ColonyEventName` naming convention.
 */
const COLONY_TYPE_TO_SPRITE_NAME: Readonly<Record<ColonyEventType, ColonyEventName>> = {
  pest_attack: "pest",
  pirate_ship: "pirate-ship",
  acid_rain: "acid-rain",
  planet_quake: "planetquake",
  sunspot: "sunspot",
  meteorite: "meteorite",
  radiation: "radiation",
  fire_in_store: "fire",
  ship_returns: "ship-return",
};

/**
 * Colony events carry no `good`/`bad` flag of their own (unlike personal
 * events); this classifies each by its actual mechanical effect in events.ts
 * so the banner's accent color and `data-event-polarity` stay honest:
 * `sunspot` is a pure energy bonus (resolveSunspot), `acid_rain` trades a food
 * bonus for an energy penalty on every row (resolveAcidRain) and
 * `ship_returns` carries no mechanical effect at all (resolveShipReturn), so
 * both read as `neutral`; every other event only removes goods, mules, or
 * production (resolveMeteorite, resolveRadiation, resolvePest,
 * resolvePirates, resolvePlanetquake, resolveFire), so they read as `bad`.
 */
const COLONY_EVENT_POLARITY: Readonly<Record<ColonyEventType, "good" | "bad" | "neutral">> = {
  sunspot: "good",
  acid_rain: "neutral",
  ship_returns: "neutral",
  meteorite: "bad",
  radiation: "bad",
  pest_attack: "bad",
  pirate_ship: "bad",
  planet_quake: "bad",
  fire_in_store: "bad",
};

/** Which event this banner presents, plus the personal case's player accent. */
export type EventBannerSource =
  | { readonly kind: "personal"; readonly event: PersonalEventResult; readonly playerColor: string }
  | { readonly kind: "colony"; readonly event: ColonyEventResult };

/** Props for the event banner. */
export interface EventBannerProps {
  /** The event to present (personal or colony) plus its kind-specific data. */
  readonly source: EventBannerSource;
  /** How long (ms) this banner stays mounted before it self-dismisses. */
  readonly holdMs: number;
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
 * Render one event's vignette banner: icon, title, and effect line, visible
 * for `props.holdMs` before it removes itself. Mount this component keyed on
 * the event's identity (a fresh `PersonalEventResult`/`ColonyEventResult`
 * object each time one fires) so a new event restarts the timer instead of
 * extending a stale one.
 *
 * @param props - Carries the event source and the display hold duration.
 * @returns The banner element, or nothing once the hold has elapsed.
 */
export function EventBanner(props: EventBannerProps): JSX.Element {
  const [visible, setVisible] = createSignal(true);
  const [reducedMotion, setReducedMotion] = createSignal(prefersReducedMotion());

  onMount(() => {
    const dismissTimer = window.setTimeout(() => setVisible(false), props.holdMs);
    onCleanup(() => window.clearTimeout(dismissTimer));

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

  const eventId = (): string =>
    props.source.kind === "personal" ? props.source.event.name : props.source.event.type;
  const polarity = (): "good" | "bad" | "neutral" =>
    props.source.kind === "personal"
      ? props.source.event.good
        ? "good"
        : "bad"
      : COLONY_EVENT_POLARITY[props.source.event.type];
  const iconHref = (): string =>
    props.source.kind === "personal"
      ? `#${personalEventBadgeSymbolId(props.source.event.good ? "good-news" : "bad-news")}`
      : `#${colonyEventSymbolId(COLONY_TYPE_TO_SPRITE_NAME[props.source.event.type])}`;
  const title = (): string => props.source.event.message;
  const effectLine = (): string | null => {
    if (props.source.kind === "colony") {
      return null;
    }
    const moneyDelta = props.source.event.moneyDelta;
    if (moneyDelta === 0) {
      return null;
    }
    return moneyDelta > 0 ? `+$${moneyDelta}` : `-$${Math.abs(moneyDelta)}`;
  };
  const accentColor = (): string =>
    props.source.kind === "personal" ? props.source.playerColor : "transparent";

  return (
    <Show when={visible()}>
      <div
        class="event-banner"
        data-event-banner
        data-event-id={eventId()}
        data-event-polarity={polarity()}
        data-event-kind={props.source.kind}
        data-reduced-motion={reducedMotion() ? "true" : "false"}
        style={{ "border-left-color": accentColor() }}
      >
        <svg
          class="event-banner-icon"
          viewBox={`0 0 ${EVENT_VIGNETTE_SIZE} ${EVENT_VIGNETTE_SIZE}`}
          width={EVENT_VIGNETTE_SIZE}
          height={EVENT_VIGNETTE_SIZE}
          role="img"
          aria-hidden="true"
        >
          <g innerHTML={buildEventSpriteDefsMarkup()} />
          <use href={iconHref()} width={EVENT_VIGNETTE_SIZE} height={EVENT_VIGNETTE_SIZE} />
        </svg>
        <div class="event-banner-text">
          <p class="event-banner-title">{title()}</p>
          <Show when={effectLine()}>{(text) => <p class="event-banner-effect">{text()}</p>}</Show>
        </div>
      </div>
    </Show>
  );
}
