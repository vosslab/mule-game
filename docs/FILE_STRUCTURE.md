# File structure

Directory map for the M.U.L.E. core-loop remake. For layer boundaries, module
purposes, and data flow, see
[docs/CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md).

## Top-level layout

```text
mule-game/
+- src/                    Application source (engine, ai, ui layers)
+- tests/                  Node tests (.mjs), pytest hygiene suite (.py),
|                          and tests/playwright/ browser E2E specs
+- devel/                  Release, versioning, and changelog developer tools
+- tools/                  Repo-local build/dev helper scripts
+- docs/                   Documentation (this file's home)
+- dist/                   Build output (generated, git ignored except as noted)
+- node_modules/           npm dependencies (generated, git ignored)
+- test-results/           Playwright test output (generated, git ignored)
+- package.json            npm scripts, dependencies, project metadata
+- tsconfig.json           TypeScript compiler config
+- tsconfig.lint.json       TypeScript config used for lint-time type checking
+- eslint.config.js         ESLint config
+- eslint.config.local.js   Repo-local ESLint rules, including the src/engine
|                          and src/ai purity gate (no DOM globals, no ui/ import)
+- playwright.config.ts    Playwright browser test config
+- build_github_pages.sh   Builds the GitHub Pages deployment bundle
+- run_web_server.sh       Serves the game locally for manual play/testing
+- run_playwright_tests.sh Runs the Playwright browser E2E suite
+- check_codebase.sh       Repo-wide lint/type/test gate script
+- source_me.sh            Shell environment bootstrap (Python runtime flags)
+- REPO_TYPE                Repo type marker (typescript)
+- VERSION                  CalVer version string, synced with package.json
+- mule.nes                 Reference NES ROM consulted for original game rules
|                          (git ignored, kept local only)
`- README.md                Project overview and quick start
```

## Key subtrees

### src/

```text
src/
+- engine/       Pure game engine: state, reducer, rules (see
|                CODE_ARCHITECTURE.md "Module map" for per-file purpose)
+- ai/           Pure non-human player decision logic (land, develop, auction)
+- ui/           DOM rendering and input; the only layer allowed to touch
|                document/window/localStorage
+- main.ts       Top-level entry point loaded by index.html
+- index.html    Game page shell
`- style.css      Game styling
```

`src/engine/` and `src/ai/` must stay pure (no DOM globals, no import from
`src/ui/`); this is enforced by
[eslint.config.local.js](../eslint.config.local.js). See
[docs/CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md#layer-boundaries).

### tests/

```text
tests/
+- test_*.mjs         Pure Node tests for engine/ai (run directly with node)
+- test_*.py          Pytest hygiene suite (ASCII, imports, shebangs,
|                     whitespace, Markdown links, naming conventions)
+- playwright/        Browser-driven E2E specs (game_flow.spec.mjs,
|                     map_render.spec.mjs, repo_root.mjs helper)
+- conftest.py        Pytest config; ignores tests/e2e and tests/playwright
|                     from pytest collection
+- file_utils.py      Shared repo-root helper for Python test scripts
`- TESTS_README.md /
   TESTS_TYPESCRIPT_README.md   Test suite usage notes
```

Run the pytest hygiene suite with `source source_me.sh && python3 -m pytest
tests/`. Run Node tests directly with `node tests/test_<name>.mjs`. Run
Playwright specs with `./run_playwright_tests.sh` (or `npm run
test:playwright`).

### devel/ and tools/

- `devel/` holds versioning and changelog automation: `bump_version.py`,
  `rotate_changelog.py`, `query_changelog.py`, `commit_changelog.py`,
  `changelog_lib.py`, `clean_build.sh`, `dist_clean.sh`,
  `setup_typescript.sh`, `setup_playwright.sh`.
- `tools/` holds repo-local build helpers: `format_version_label.ts`,
  `html_to_pdf.mjs`, `sync_typescript_package_pins.py`.

## Generated artifacts

- `dist/` -- build output from `build_github_pages.sh`. Ignored by
  [.gitignore](../.gitignore) via the `dist/` rule under the Python section
  (shared ignore list), except where the repo intentionally commits a
  deployment bundle.
- `node_modules/` -- npm dependencies, git ignored.
- `test-results/`, `playwright-report/`, `blob-report/`, `coverage/` --
  Playwright/test tooling output, git ignored.
- `*.tsbuildinfo`, `.eslintcache`, `.prettiercache` -- TypeScript/ESLint/
  Prettier incremental caches, git ignored.
- `mule.nes` -- reference ROM, git ignored (`*.nes` rule), kept local only for
  developer reference against original game rules.

## Documentation map

- `docs/CODE_ARCHITECTURE.md` -- layer boundaries, module map, data flow,
  phase state machine, auction tick model.
- `docs/FILE_STRUCTURE.md` -- this file.
- `docs/REPO_STYLE.md`, `docs/PYTHON_STYLE.md`, `docs/PYTEST_STYLE.md` --
  repo-wide and Python conventions (also used by the pytest hygiene suite).
- `docs/TYPESCRIPT_STYLE.md` -- TypeScript conventions for `src/`.
- `docs/E2E_TESTS.md`, `docs/PLAYWRIGHT_USAGE.md`,
  `docs/PLAYWRIGHT_TEST_STYLE.md` -- E2E and Playwright test conventions.
- `docs/COLOR_CONTRAST_ACCESSIBILITY.md`, `docs/FUN_VIBES_DESIGN_STYLE.md`,
  `docs/PLAYFUL_TRAINING_GAME_STYLE.md` -- visual/UX design conventions.
- `docs/CHANGELOG.md` -- dated log of changes; see
  [docs/REPO_STYLE.md](REPO_STYLE.md#changelog-rotation) for rotation rules.
- `docs/TODO.md` -- backlog scratchpad.
- `docs/active_plans/` -- in-flight planning artifacts, organized by kind
  (`active/`, `audits/`, `reports/`, `decisions/`, `workstreams/`).
- `docs/archive/` -- closed-out plans, including
  `docs/archive/mule_core_loop_plan.md`.

## Where to add new work

- New engine rules or reducer logic: `src/engine/`, keep pure, add a
  constant to [src/engine/constants.ts](../src/engine/constants.ts) with a
  source citation rather than a magic number.
- New non-human decision logic: `src/ai/`.
- New rendering or input handling: `src/ui/`.
- New pure-logic tests: `tests/test_<name>.mjs`, run with `node`.
- New browser E2E coverage: `tests/playwright/`.
- New Python hygiene checks: `tests/test_*.py`, following
  [docs/PYTHON_STYLE.md](PYTHON_STYLE.md) and
  [docs/PYTEST_STYLE.md](PYTEST_STYLE.md).
- New developer/release tooling: `devel/`.
- New build/sync helper scripts: `tools/`.
- New documentation: `docs/`, using SCREAMING_SNAKE_CASE filenames per
  [docs/REPO_STYLE.md](REPO_STYLE.md#documentation).

## Known gaps

- The exact contents committed under `dist/` (full build output vs. a
  pruned deployment subset) were not directly verified against
  `build_github_pages.sh`; confirm before relying on `dist/` as a stable
  build artifact location.
