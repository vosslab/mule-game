/**
 * Canonical color tokens for every M.U.L.E. remake SVG sprite.
 *
 * Source of truth: docs/active_plans/active/mule_art_style_spec.md. That doc
 * records the WCAG contrast ratios, the colorblind-distinguishability
 * reasoning for the player colors, and the per-token usage notes; this
 * module holds only the values.
 *
 * Every sprite module under src/ui/sprites/ draws fill and stroke colors
 * only from this table. `tests/test_sprite_palette.mjs` enforces that
 * mechanically for every `src/ui/sprites/*.ts` file and the legacy
 * `src/ui/sprites.ts` (migrated to this table one art workstream at a
 * time, per docs/active_plans/active/mule_fidelity_plan.md).
 */
export const PALETTE = {
  // Backgrounds and structural surfaces (matches src/style.css's dark theme)
  bgDeep: "#1a1a2e",
  bgPanel: "#22223a",
  bgTrackAxis: "#4a4a68",

  // Text
  textPrimary: "#e6e6e6",
  textOnLight: "#1a1a2e",

  // Shared accent (money, focus rings, selection highlights)
  gold: "#ffd23f",

  // Player identity colors; see the spec doc for the colorblind-separation
  // reasoning (simulator-verified CIE76 deltaE per
  // tests/test_player_color_distinct.mjs). player2 no longer shares gold's
  // hex (was #ffd23f); player3 shifted from lavender-violet (#c77dff) to
  // orchid to clear separation from player1 under simulated dichromacy.
  player0: "#ff5a5f",
  player1: "#4fd8ff",
  player2: "#3aaa18",
  player3: "#f872e8",

  // Avatar keyline (art-gate revision): a light halo stroke drawn
  // behind every species avatar's outer silhouette, applied uniformly to all
  // 4 player tints. Clears the WCAG 1.4.11 non-text 3:1 minimum against
  // terrainPlain (3.19:1; see the art style spec's Avatar keyline section)
  // where player2's tinted body-fill alone does not (1.05:1).
  keylineLight: "#ffffff",

  // Town street surfaces (facade street): registers the town scene's
  // paved-street colors so the palette-conformance gate (tests/playwright/
  // visual_render.spec.mjs) recognizes them. Both sit past the 20-deltaE
  // conformance bar from every prior token (measured deltaE ~21.1 and ~20.5
  // respectively against the nearest prior token, bgDeep) and cover a
  // meaningful area of the rendered town, so they need their own tokens
  // rather than being absorbed as background. Values match src/style.css's
  // `.town-street-surface` and `.town-street-worn` fills; do not diverge.
  townStreet: "#26241e",
  townStreetWorn: "#1c1a16",

  // Terrain tile fills
  terrainPlain: "#7c9a4e",
  terrainRiver: "#3a7ca5",
  terrainMountain1: "#a68a6d",
  terrainMountain2: "#8a6f52",
  terrainMountain3: "#5c4736",
  terrainTown: "#d9a441",

  // Resource icon fills
  resourceFood: "#8fd14f",
  resourceEnergy: "#ffe066",
  resourceSmithore: "#c0c0c0",
  // Matches the crystite fill landing in src/ui/sprites.ts alongside the
  // Resource-union widening (RESOURCE_ICON_FILLS.crystite).
  resourceCrystite: "#ff6ec7",
} as const;

/** Union of every valid palette token name, for typed lookups. */
export type PaletteToken = keyof typeof PALETTE;
