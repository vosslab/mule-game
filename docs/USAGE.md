# Usage

The game runs entirely in the browser from a static build. Use the root-level
shell scripts (or their `npm run` aliases) to serve, check, build, and test it;
see [docs/INSTALL.md](INSTALL.md) first if `node_modules/` is not yet installed.

## Quick start

Serve the game locally (auto-installs dependencies and rebuilds `dist/` first):

```bash
./run_web_server.sh
```

This bundles `src/main.ts` (which imports `src/ui/main.tsx`) into
`dist/main.js` via `build_github_pages.sh`, which calls
[pipeline/build.mjs](../pipeline/build.mjs) (an esbuild JS-API script with the
`esbuild-plugin-solid` plugin, needed because the canonical esbuild CLI cannot
load a Solid JSX plugin), starts `python3 -m http.server` against `dist/`, and
opens the page in your default browser. Each run picks a random port
(8000-8999) so the browser treats it as a fresh origin; override with
`PORT=<port> ./run_web_server.sh`.

## CLI

There is no separate CLI; the front-door scripts live at the repo root and
mirror the `npm run` scripts in `package.json`:

| Script                         | npm alias                 | What it does                                            |
| ------------------------------ | ------------------------- | ------------------------------------------------------- |
| `./run_web_server.sh`          | `npm run serve`           | Build and serve `dist/` locally, opening a browser tab. |
| `./check_codebase.sh`          | `npm run check`           | Typecheck, lint, format-check, and run Node unit tests. |
| `./build_github_pages.sh`      | `npm run build`           | Produce the production `dist/` bundle for GitHub Pages. |
| `bash run_playwright_tests.sh` | `npm run test:playwright` | Run the Playwright browser test suite.                  |
| `./dist_clean.sh`              | `npm run clean`           | Remove build artifacts.                                 |

## Examples

Run the full lint/typecheck/test gate before committing:

```bash
./check_codebase.sh
```

Build the production bundle without serving it:

```bash
./build_github_pages.sh
```

Run the browser test suite (builds `dist/` first if missing):

```bash
bash run_playwright_tests.sh
```

Force a rebuild before running Playwright, or run a single spec file:

```bash
bash run_playwright_tests.sh --build
bash run_playwright_tests.sh tests/playwright/game_flow.spec.mjs
```

Run the pure Node unit test suite directly (the same step `check_codebase.sh`
runs, loading the `tsx` runtime loader so `.mjs` tests can import `.ts`/`.tsx`
source):

```bash
node --import tsx --test tests/test_*.mjs
```

Run a non-browser, whole-system E2E harness (see
[docs/E2E_TESTS.md](E2E_TESTS.md)); each is self-contained and exits
non-zero on failure:

```bash
node tests/e2e/e2e_mini_flow.mjs                 # one phase transition through the real UI
node tests/e2e/e2e_full_game.mjs                 # New Game to scoring, both modes x 3 fixed seeds
node --import tsx tests/e2e/e2e_balance_sim.mjs  # seeded AI-vs-AI sim sweep for economy/AI tuning
node tests/e2e/e2e_balance_report.mjs            # asserts the HTML balance dashboard renders all sections
```

`e2e_balance_sim.mjs` imports `src/engine/*.ts` and `src/ai/*.ts` directly, so it
needs the `tsx` runtime loader (`--import tsx`) the same way `check_codebase.sh`'s
Node unit test step does; the other three drive the built `dist/` over HTTP (via
Playwright or a plain fetch) and run under plain `node`.

View a fixture screen once the dev server is running, using the `?demo=`
query param (see [docs/CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md) for the
full URL param reference and which `src/ui/solid/*_demo.tsx` file backs
each one):

```text
http://localhost:<port>/?demo=map          map renderer, hand-written fixture GameState
http://localhost:<port>/?demo=town         walkable town interior
http://localhost:<port>/?demo=ai_actor     AI avatar / Skip overlay
http://localhost:<port>/?demo=mule_escape  radiation-event vignette
http://localhost:<port>/?demo=wampus       wampus encounter, fixed visible spawn
```

`?seed=`, `?speed=`, `?mode=`, `?species=`, and `?timer=relaxed` combine with
`?demo=` or a live game the same way, for example
`http://localhost:<port>/?seed=42&speed=8&mode=standard&species=flapper`.
Two standalone params open a screen instead of combining with `?demo=`:
`?replay=fixture` opens the replay viewer (same as the title screen's "Watch
demo replay" control) and `?hints=off` suppresses every tutorial hint, as if
already dismissed.

## Inputs and outputs

- Inputs: TypeScript source under `src/` (`src/main.ts` is the build entry
  point, importing `src/ui/main.tsx`; `src/index.html` and `src/style.css`
  are copied as-is).
- Outputs: `dist/index.html`, `dist/main.js` (bundled, minified ESM with a
  sourcemap), `dist/style.css`, `dist/manifest.json`, `dist/sw.js`,
  `dist/icons/icon-192.png` / `icon-512.png`, and `dist/.nojekyll`, written
  fresh by `build_github_pages.sh` on every run.

## Installing as an app (PWA) and offline play

`build_github_pages.sh` produces a small installable app: `src/manifest.json`
(name, icons, `display: standalone`) and `src/sw.js` (a service worker that
caches the static bundle) are copied into `dist/` alongside two generated
icon PNGs (`tools/generate_pwa_icons.mjs`). Serving `dist/` (either
`./run_web_server.sh` locally or the deployed GitHub Pages site) lets a
browser offer "Install" or "Add to Home Screen"; once installed (or even
just visited once while online), the game keeps working with no network --
the service worker serves the cached bundle on a later offline reload.

## Balance report dashboard

Regenerate the HTML balance dashboard from a fresh sim sweep with one command:

```bash
node --import tsx tests/e2e/e2e_balance_sim.mjs --report 30
```

The `--report` flag runs the usual sim gates (any seed count works; use a
higher count such as 100+ for a release-grade run) and additionally writes
`output_smoke/balance_report/index.html`. The dashboard covers, per mode
(beginner and standard), a gate-vs-target table showing every release gate
next to the value this run measured, per-round store price curves for each
good, per-good trade volumes, win rate by AI personality, a per-seed winner
grid, colony rating tier distribution, wins by seat, and event-frequency
stat tiles. `tests/e2e/e2e_balance_report.mjs` asserts every section anchor
renders at a tiny seed count, as a fast regression check on the report
pipeline itself.

## Browser walkthrough harness

For proof the game is playable start to finish through the real rendered
UI (the human seat played actively by the game's own AI), see
[docs/WALKTHROUGH_GUIDE.md](WALKTHROUGH_GUIDE.md): layers, run commands,
output files, budgets, failure taxonomy, and the calibration and sweep
coverage tables.

## Known gaps

- [ ] Confirm whether any Playwright spec requires environment variables or
      flags beyond `--build` and a spec path filter.
