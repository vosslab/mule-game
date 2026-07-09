# Install

This repo ships a TypeScript browser game (an M.U.L.E. remake). "Installed"
means `node_modules/` holds the npm dev dependencies needed to typecheck,
lint, build, and serve the game; there is no separate package to publish or
import.

## Requirements

- Node.js and npm on `PATH` (no pinned version is declared in
  `package.json`; see [Known gaps](#known-gaps)).
- A POSIX shell (`bash`/`sh`) to run the root-level `.sh` scripts.
- Python 3.12, only if you run the repo's pytest hygiene suite under
  `tests/` (ASCII compliance, shebangs, import checks, and similar
  repo-wide lint checks). Not required to build or run the game itself.

## Install steps

- Clone the repo and `cd` into it.
- Install npm dependencies:

  ```bash
  npm run setup
  ```

  This runs `devel/setup_typescript.sh`, which checks for `npm` on `PATH`
  and then runs `npm install` against the `devDependencies` in
  `package.json` (`typescript`, `eslint`, `prettier`, `tsx`, `esbuild`, and
  related tooling).
- Optionally install Playwright's browser binaries for the browser test
  suite:

  ```bash
  npm run setup:playwright
  ```

  This runs `devel/setup_playwright.sh`.

## Verify install

Run the full codebase check gate; it fails loudly if any dependency is
missing:

```bash
./check_codebase.sh
```

This runs, in order: `tsc --noEmit` against `tsconfig.json`, a wider
`tsc --noEmit` against `tsconfig.lint.json`, `eslint --max-warnings 0`,
`prettier --check`, and the Node unit tests under `tests/test_*.mjs`. A
final `PASS: N checks passed.` summary line confirms a clean install.

## Troubleshooting

- `check_codebase.sh` exits with `ERROR: node_modules missing. Run 'npm
  install' first.` if dependencies were never installed; run `npm run
  setup` (or `./devel/setup_typescript.sh`) first.
- `run_web_server.sh` auto-installs dependencies itself if `node_modules/`
  is missing, by calling `devel/setup_typescript.sh` before serving.
- `check_codebase.sh` prints `WARN: package-lock.json missing; npm install
  will not produce a reproducible install.` if `package-lock.json` is not
  present; commit or regenerate it for reproducible installs.

## Known gaps

- [ ] Confirm and document a minimum supported Node.js version;
  `package.json` currently declares no `engines` field.
- [ ] Confirm minimum supported npm version.
