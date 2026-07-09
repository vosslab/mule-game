/**
 * SVG event-vignette sprite defs: one icon per colony event (acid rain,
 * sunspot, meteorite, radiation, pest, pirate ship, planetquake, fire, ship
 * return) plus a generic good-news and bad-news personal-event badge,
 * following the shape language, stroke policy, and depth-and-shading
 * policy in docs/active_plans/active/mule_art_style_spec.md.
 *
 * Domain: `event` (already in the spec's fixed domain set; this module is
 * that domain's first patch).
 *
 * ViewBox: a `48x48` "vignette" scale, not the spec's `16x16` icon scale.
 * Colony/personal events narrate a specific happening (a cloud storm, a
 * pirate raid), not a generic small UI glyph, so each vignette needs room
 * for 2-3 silhouette elements to read clearly -- more detail than a
 * 16-unit icon budget allows. Per the stroke policy, icon-scale sprites
 * stay strokeless, but this vignette scale is closer to the actor/creature
 * 32x32 class, so each vignette's outer silhouette gets the same thin
 * outline stroke actors get (a darkened variant of the shape's own fill),
 * proportioned for the larger 48x48 canvas.
 *
 * Every event reads by silhouette shape first (cloud, sun-with-flares,
 * comet, hazard-trefoil, insect, ship-with-sail, cracked-ground, flame,
 * ascending-rocket, up-chevron, down-triangle), with color as a secondary
 * signal, per the spec's colorblind-safe "not color alone" principle.
 */

import { PALETTE } from "./palette";

/** Fixed set of colony events this module draws one vignette per. */
export const COLONY_EVENT_NAMES = [
  "acid-rain",
  "sunspot",
  "meteorite",
  "radiation",
  "pest",
  "pirate-ship",
  "planetquake",
  "fire",
  "ship-return",
] as const;

export type ColonyEventName = (typeof COLONY_EVENT_NAMES)[number];

/** Fixed set of generic personal-event polarity badges this module draws. */
export const PERSONAL_EVENT_BADGE_NAMES = ["good-news", "bad-news"] as const;

export type PersonalEventBadgeName = (typeof PERSONAL_EVENT_BADGE_NAMES)[number];

/** Shared vignette viewBox edge length; see the module doc comment for why. */
export const EVENT_VIGNETTE_SIZE = 48;

/**
 * Build the symbol id for one colony event vignette, per the naming
 * convention `sprite-<domain>-<name>[-frameN]` in
 * docs/active_plans/active/mule_art_style_spec.md.
 *
 * @param eventName - Which colony event's vignette to look up.
 * @returns The `<defs>` symbol id for that vignette.
 */
export function colonyEventSymbolId(eventName: ColonyEventName): string {
  return `sprite-event-${eventName}`;
}

/**
 * Build the symbol id for one generic personal-event polarity badge.
 *
 * @param badgeName - Which polarity badge to look up.
 * @returns The `<defs>` symbol id for that badge.
 */
export function personalEventBadgeSymbolId(badgeName: PersonalEventBadgeName): string {
  return `sprite-event-${badgeName}`;
}

/**
 * Build the shared `<defs>` markup for every event vignette: 9 colony
 * events plus the 2 personal-event polarity badges.
 *
 * @returns Raw SVG markup for a single `<defs>` element.
 */
export function buildEventSpriteDefsMarkup(): string {
  let markup = "<defs>";
  markup += buildAcidRainSymbol();
  markup += buildSunspotSymbol();
  markup += buildMeteoriteSymbol();
  markup += buildRadiationSymbol();
  markup += buildPestSymbol();
  markup += buildPirateShipSymbol();
  markup += buildPlanetquakeSymbol();
  markup += buildFireSymbol();
  markup += buildShipReturnSymbol();
  markup += buildGoodNewsSymbol();
  markup += buildBadNewsSymbol();
  markup += "</defs>";
  return markup;
}

//============================================
function openVignetteSymbol(eventName: ColonyEventName): string {
  return `<symbol id="${colonyEventSymbolId(eventName)}" viewBox="0 0 ${EVENT_VIGNETTE_SIZE} ${EVENT_VIGNETTE_SIZE}">`;
}

//============================================
// Acid rain: a lumpy storm cloud with 3 drip streaks reaching the ground,
// in a sickly green so the "corrosive" read comes through even before the
// drip-streak shape is noticed.
function buildAcidRainSymbol(): string {
  let markup = openVignetteSymbol("acid-rain");
  markup += `<circle cx="16" cy="18" r="10" fill="${PALETTE.bgTrackAxis}" stroke="${PALETTE.bgDeep}" stroke-width="2" />`;
  markup += `<circle cx="27" cy="20" r="8" fill="${PALETTE.bgTrackAxis}" stroke="${PALETTE.bgDeep}" stroke-width="2" />`;
  markup += `<circle cx="20" cy="12" r="7" fill="${PALETTE.bgTrackAxis}" stroke="${PALETTE.bgDeep}" stroke-width="2" />`;
  markup += `<polygon points="12,28 15,28 10,44 8,44" fill="${PALETTE.resourceFood}" />`;
  markup += `<polygon points="20,28 23,28 19,44 17,44" fill="${PALETTE.resourceFood}" />`;
  markup += `<polygon points="28,28 31,28 28,44 26,44" fill="${PALETTE.resourceFood}" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Sunspot: a sun disc ringed by 8 jagged flare spikes, entirely in gold --
// a bright, energetic silhouette matching the "extra energy" effect.
function buildSunspotSymbol(): string {
  let markup = openVignetteSymbol("sunspot");
  const flarePoints: string[] = [];
  const spikeCount = 8;
  for (let i = 0; i < spikeCount; i++) {
    const angle = (i / spikeCount) * Math.PI * 2;
    const nextAngle = ((i + 0.5) / spikeCount) * Math.PI * 2;
    const tipX = (24 + Math.cos(angle) * 22).toFixed(1);
    const tipY = (24 + Math.sin(angle) * 22).toFixed(1);
    const valleyX = (24 + Math.cos(nextAngle) * 12).toFixed(1);
    const valleyY = (24 + Math.sin(nextAngle) * 12).toFixed(1);
    flarePoints.push(`${tipX},${tipY} ${valleyX},${valleyY}`);
  }
  markup += `<polygon points="${flarePoints.join(" ")}" fill="${PALETTE.gold}" opacity="0.85" />`;
  markup += `<circle cx="24" cy="24" r="11" fill="${PALETTE.gold}" stroke="${PALETTE.terrainMountain2}" stroke-width="2" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Meteorite: a dark rock chunk trailing a crystite-pink streak, matching
// the effect (sets the struck tile's crystite level).
function buildMeteoriteSymbol(): string {
  let markup = openVignetteSymbol("meteorite");
  markup += `<polygon points="42,6 20,28 34,34 12,42 30,20" fill="${PALETTE.resourceCrystite}" opacity="0.55" />`;
  markup += `<polygon points="34,6 44,16 40,28 28,30 22,20" fill="${PALETTE.terrainMountain3}" stroke="${PALETTE.bgDeep}" stroke-width="2" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Radiation: an original 3-wedge hazard-trefoil silhouette (round center,
// 3 rounded wedges at 120-degree spacing) in energy-yellow -- reads as
// "hazard" from the trefoil shape alone, not from color.
function buildRadiationSymbol(): string {
  let markup = openVignetteSymbol("radiation");
  markup += `<circle cx="24" cy="24" r="20" fill="${PALETTE.bgDeep}" stroke="${PALETTE.terrainMountain3}" stroke-width="2" />`;
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const wedgeCenterX = 24 + Math.cos(angle) * 12;
    const wedgeCenterY = 24 + Math.sin(angle) * 12;
    markup += `<circle cx="${wedgeCenterX.toFixed(1)}" cy="${wedgeCenterY.toFixed(1)}" r="7" fill="${PALETTE.resourceEnergy}" />`;
  }
  markup += `<circle cx="24" cy="24" r="6" fill="${PALETTE.bgDeep}" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Pest: a beetle-like insect silhouette (oval body, 6 leg lines, 2
// antennae) in a muted earth tone.
function buildPestSymbol(): string {
  let markup = openVignetteSymbol("pest");
  markup += `<ellipse cx="24" cy="26" rx="12" ry="9" fill="${PALETTE.terrainMountain2}" stroke="${PALETTE.bgDeep}" stroke-width="2" />`;
  markup += `<circle cx="24" cy="14" r="5" fill="${PALETTE.terrainMountain2}" />`;
  markup += `<line x1="21" y1="10" x2="17" y2="4" stroke="${PALETTE.terrainMountain3}" stroke-width="1.5" />`;
  markup += `<line x1="27" y1="10" x2="31" y2="4" stroke="${PALETTE.terrainMountain3}" stroke-width="1.5" />`;
  markup += `<line x1="13" y1="20" x2="4" y2="16" stroke="${PALETTE.terrainMountain3}" stroke-width="2" />`;
  markup += `<line x1="12" y1="26" x2="3" y2="26" stroke="${PALETTE.terrainMountain3}" stroke-width="2" />`;
  markup += `<line x1="13" y1="32" x2="4" y2="36" stroke="${PALETTE.terrainMountain3}" stroke-width="2" />`;
  markup += `<line x1="35" y1="20" x2="44" y2="16" stroke="${PALETTE.terrainMountain3}" stroke-width="2" />`;
  markup += `<line x1="36" y1="26" x2="45" y2="26" stroke="${PALETTE.terrainMountain3}" stroke-width="2" />`;
  markup += `<line x1="35" y1="32" x2="44" y2="36" stroke="${PALETTE.terrainMountain3}" stroke-width="2" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Pirate ship: a hull silhouette with a raised triangular sail, reusing
// the title screen's "silhouette ship" vocabulary at vignette scale so
// the two ship sprites read as the same construction technique.
function buildPirateShipSymbol(): string {
  let markup = openVignetteSymbol("pirate-ship");
  markup += `<polygon points="4,32 44,32 38,42 10,42" fill="${PALETTE.bgTrackAxis}" stroke="${PALETTE.bgDeep}" stroke-width="2" />`;
  markup += `<rect x="22" y="6" width="2" height="28" fill="${PALETTE.terrainMountain3}" />`;
  markup += `<polygon points="24,8 24,26 8,20" fill="${PALETTE.textPrimary}" opacity="0.8" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Planetquake: a ground block split by a jagged crack, with 2 loose
// debris chips -- the "halved mining, may degrade a mountain" effect
// reads as ground damage, not just a generic warning tone.
function buildPlanetquakeSymbol(): string {
  let markup = openVignetteSymbol("planetquake");
  markup += `<rect x="4" y="20" width="40" height="22" rx="2" fill="${PALETTE.terrainMountain2}" stroke="${PALETTE.bgDeep}" stroke-width="2" />`;
  markup += `<polygon points="18,20 24,20 20,28 26,28 16,42 20,30 14,30" fill="${PALETTE.bgDeep}" />`;
  markup += `<rect x="8" y="10" width="6" height="6" rx="1" fill="${PALETTE.terrainMountain1}" />`;
  markup += `<rect x="34" y="6" width="7" height="7" rx="1" fill="${PALETTE.terrainMountain1}" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Fire: a classic 2-tone flame silhouette (wide energy-yellow outer
// tongue, slimmer gold inner tongue), matching the "wipes store supplies"
// effect's obvious hazard.
function buildFireSymbol(): string {
  let markup = openVignetteSymbol("fire");
  markup += `<path d="M24,4 C14,16 10,24 14,34 C16,40 22,44 24,44 C26,44 32,40 34,34 C38,24 34,16 24,4 Z" fill="${PALETTE.resourceEnergy}" stroke="${PALETTE.terrainMountain3}" stroke-width="2" />`;
  markup += `<path d="M24,16 C19,24 18,29 21,35 C22,38 24,40 24,40 C24,40 26,38 27,35 C30,29 29,24 24,16 Z" fill="${PALETTE.gold}" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Ship return: the last-round arrival -- a ship silhouette ascending with
// 2 motion streaks behind it and a gold thruster flame, the positive
// counterpart to the pirate ship's grounded hull.
function buildShipReturnSymbol(): string {
  let markup = openVignetteSymbol("ship-return");
  markup += `<line x1="14" y1="42" x2="20" y2="30" stroke="${PALETTE.textPrimary}" stroke-width="2" opacity="0.4" />`;
  markup += `<line x1="22" y1="44" x2="26" y2="30" stroke="${PALETTE.textPrimary}" stroke-width="2" opacity="0.4" />`;
  markup += `<polygon points="24,4 32,26 24,22 16,26" fill="${PALETTE.bgTrackAxis}" stroke="${PALETTE.bgDeep}" stroke-width="2" />`;
  markup += `<polygon points="21,26 27,26 24,38" fill="${PALETTE.gold}" opacity="0.85" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
function openBadgeSymbol(badgeName: PersonalEventBadgeName): string {
  return `<symbol id="${personalEventBadgeSymbolId(badgeName)}" viewBox="0 0 ${EVENT_VIGNETTE_SIZE} ${EVENT_VIGNETTE_SIZE}">`;
}

//============================================
// Good news: an up-chevron inside a ring, in gold -- the shared "positive"
// accent color the rest of the palette already reserves for good things
// (money figures, focus rings).
function buildGoodNewsSymbol(): string {
  let markup = openBadgeSymbol("good-news");
  markup += `<circle cx="24" cy="24" r="20" fill="${PALETTE.bgPanel}" stroke="${PALETTE.gold}" stroke-width="3" />`;
  markup += `<polygon points="24,12 36,28 27,28 27,38 21,38 21,28 12,28" fill="${PALETTE.gold}" />`;
  markup += "</symbol>";
  return markup;
}

//============================================
// Bad news: a down-chevron inside a ring, in a dark neutral tone -- the
// mirror shape of good-news (same ring-plus-chevron construction, flipped
// direction) so the two badges read as a matched pair distinguished by
// shape, not only by color.
function buildBadNewsSymbol(): string {
  let markup = openBadgeSymbol("bad-news");
  markup += `<circle cx="24" cy="24" r="20" fill="${PALETTE.bgPanel}" stroke="${PALETTE.terrainMountain3}" stroke-width="3" />`;
  markup += `<polygon points="24,36 12,20 21,20 21,10 27,10 27,20 36,20" fill="${PALETTE.terrainMountain3}" />`;
  markup += "</symbol>";
  return markup;
}
