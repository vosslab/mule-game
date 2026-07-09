// eslint.config.local.js - consumer-owned ESLint overrides.
//
// Add repo-specific ESLint config objects here: extra browser-context globs,
// per-tool globals, or local rule tweaks. This file ships once via the noexist
// bucket and is never overwritten by propagation, so your edits survive. The
// canonical eslint.config.js imports and spreads this array AFTER its own config,
// so entries here refine or override the canonical rules.
//
// Example: give two named node tools browser globals for page.evaluate() use,
// without loosening no-undef across all tools.
//
//   import globals from "globals";
//   export default [
//     {
//       files: ["tools/scene_to_png.mjs", "tools/svg_picker/**"],
//       languageOptions: { globals: { ...globals.browser } },
//     },
//   ];
//
// Engine purity gate: src/engine/** and src/ai/** are pure TypeScript
// operating on GameState values; only src/ui/** touches the DOM (see
// docs/archive/mule_core_loop_plan.md, "Architecture boundaries
// and ownership"). no-restricted-globals catches direct DOM global use;
// no-restricted-imports catches importing from the UI layer. src/ai
// importing from src/engine is unaffected (only ../ui/ paths are blocked).
export default [
  {
    files: ["src/engine/**/*.{ts,tsx}", "src/ai/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "document", message: "engine/ai must stay pure; DOM access belongs in src/ui/." },
        { name: "window", message: "engine/ai must stay pure; DOM access belongs in src/ui/." },
        { name: "navigator", message: "engine/ai must stay pure; DOM access belongs in src/ui/." },
        {
          name: "localStorage",
          message: "engine/ai must stay pure; DOM access belongs in src/ui/.",
        },
        {
          name: "sessionStorage",
          message: "engine/ai must stay pure; DOM access belongs in src/ui/.",
        },
        {
          name: "HTMLElement",
          message: "engine/ai must stay pure; DOM access belongs in src/ui/.",
        },
        { name: "alert", message: "engine/ai must stay pure; DOM access belongs in src/ui/." },
        { name: "confirm", message: "engine/ai must stay pure; DOM access belongs in src/ui/." },
        { name: "prompt", message: "engine/ai must stay pure; DOM access belongs in src/ui/." },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/ui/**", "../ui/*", "../../ui/*"],
              message: "engine/ai must stay pure; do not import from src/ui/.",
            },
          ],
        },
      ],
    },
  },
];
