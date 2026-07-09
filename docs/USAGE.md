# Usage

The game runs entirely in the browser from a static build. Use the root-level
shell scripts (or their `npm run` aliases) to serve, check, build, and test it;
see [docs/INSTALL.md](INSTALL.md) first if `node_modules/` is not yet installed.

## Quick start

Serve the game locally (auto-installs dependencies and rebuilds `dist/` first):

```bash
./run_web_server.sh
```

This bundles `src/main.ts` into `dist/main.js` via `build_github_pages.sh`,
starts `python3 -m http.server` against `dist/`, and opens the page in your
default browser. Each run picks a random port (8000-8999) so the browser
treats it as a fresh origin; override with `PORT=<port> ./run_web_server.sh`.

## CLI

There is no separate CLI; the front-door scripts live at the repo root and
mirror the `npm run` scripts in `package.json`:

| Script | npm alias | What it does |
| --- | --- | --- |
| `./run_web_server.sh` | `npm run serve` | Build and serve `dist/` locally, opening a browser tab. |
| `./check_codebase.sh` | `npm run check` | Typecheck, lint, format-check, and run Node unit tests. |
| `./build_github_pages.sh` | `npm run build` | Produce the production `dist/` bundle for GitHub Pages. |
| `bash run_playwright_tests.sh` | `npm run test:playwright` | Run the Playwright browser test suite. |
| `./dist_clean.sh` | `npm run clean` | Remove build artifacts. |

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
bash run_playwright_tests.sh tests/playwright/smoke.spec.ts
```

View the map renderer in isolation using the `?demo=map` fixture, once the
dev server is running:

```text
http://localhost:<port>/?demo=map
```

This loads a hand-written fixture `GameState` so the map renderer can be
reviewed without playing through a full game (see
[docs/CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md)).

## Inputs and outputs

- Inputs: TypeScript source under `src/` (`src/main.ts` is the build entry
  point; `src/index.html` and `src/style.css` are copied as-is).
- Outputs: `dist/index.html`, `dist/main.js` (bundled, minified ESM with a
  sourcemap), `dist/style.css`, and `dist/.nojekyll`, written fresh by
  `build_github_pages.sh` on every run.

## Known gaps

- [ ] Confirm whether any Playwright spec requires environment variables or
  flags beyond `--build` and a spec path filter.
