# File structure

Directory map for the M.U.L.E. core-loop remake. For layer boundaries, module
purposes, and data flow, see
[docs/CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md).

## Top-level layout

```text
mule-game/
+- src/                    Application source (engine, ai, ui layers)
+- pipeline/               esbuild JS-API bundler (build.mjs; loads the Solid
|                          JSX plugin the canonical esbuild CLI cannot use)
+- tests/                  Node tests (.mjs), pytest hygiene suite (.py),
|                          tests/playwright/ browser E2E specs, and
|                          tests/e2e/ non-browser whole-system harnesses
+- devel/                  Release, versioning, and changelog developer tools
+- tools/                  Repo-local build/dev helper scripts
+- docs/                   Documentation (this file's home)
+- dist/                   Build output (generated, git ignored)
+- node_modules/           npm dependencies (generated, git ignored)
+- test-results/           Playwright test output (generated, git ignored)
+- OTHER_REPOS/            Local reference repos consulted for rules/data (git
|                          ignored, kept local only; see docs/REFERENCE_REPOS.md)
+- AGENTS.md                Agent workflow pointers into docs/*.md
+- CLAUDE.md                 Claude Code project instructions (imports
|                          AGENTS.md and the docs/*.md style guides via
|                          @-includes)
+- package.json            npm scripts, dependencies, project metadata
+- pip_requirements-dev.txt Python dev dependencies for the pytest hygiene
|                          suite (pytest, pyflakes, bandit, rich, packaging)
+- tsconfig.json           TypeScript compiler config
+- tsconfig.lint.json       TypeScript config used for lint-time type checking
+- eslint.config.js         ESLint config
+- eslint.config.local.js   Repo-local ESLint rules, including the src/engine
|                          and src/ai purity gate (no DOM globals, no ui/ import)
+- playwright.config.ts    Playwright browser test config
+- build_github_pages.sh   Builds the GitHub Pages deployment bundle via
|                          pipeline/build.mjs
+- deploy-pages.yml        GitHub Pages workflow seed; a human moves it into
|                          .github/workflows/ to activate it (root placement
|                          is intentional -- agents edit only repo-root files)
+- run_web_server.sh       Serves the game locally for manual play/testing
+- run_playwright_tests.sh Runs the Playwright browser E2E suite
+- check_codebase.sh       Repo-wide lint/type/test gate script
+- source_me.sh            Shell environment bootstrap (Python runtime flags)
+- REPO_TYPE                Repo type marker (typescript)
+- VERSION                  CalVer version string, synced with package.json
+- mule.nes                 Reference NES ROM consulted for original game rules
|                          (git ignored, kept local only)
+- LICENSE                  Symlink to LICENSE.MIT.md (default license lookup)
+- LICENSE.MIT.md           Source code license (MIT)
+- LICENSE.CC-BY-4.0.md     Non-code creative asset license (CC BY 4.0)
`- README.md                Project overview and quick start
```

## Key subtrees

### src/

```text
src/
+- engine/       Pure game engine: state, reducer, rules (see
|                CODE_ARCHITECTURE.md "Module map" for per-file purpose)
+- ai/           Pure non-human player decision logic (land, develop,
|                auction, plus personas.ts's three named personality
|                parameter sets layered on top)
+- ui/           SolidJS UI and input; the only layer allowed to touch
|  |             document/window/localStorage. Also holds save_log.ts
|  |             (autosave/resume log), hint_store.ts (tutorial hint
|  |             dismissal), and pwa_register.ts (service-worker registration)
|  +- scenes/    rAF loop (scene_manager.ts) and spatial presentation:
|  |             overworld/town walking scenes, walker/zones pure math,
|  |             AI-actor and wampus presentation timing, auction tween, dpad,
|  |             replay_scene.tsx + replay_fixture.ts (replay viewer)
|  +- solid/     Reactive screens and panels (app, title, game, HUD, map
|  |             layer, land-grant/land-auction/auction/production/scoring
|  |             panels, event banner, mule-escape vignette, tutorial_hint)
|  |             plus ?demo= fixture screens (map, town, ai_actor,
|  |             mule_escape, wampus)
|  `- sprites/   SVG sprite defs split by family (terrain, town, mule,
|                species, arena, events, wampus, title) plus one visual-review
|                gallery renderer per family
+- main.ts       Top-level entry point loaded by index.html (imports
|                src/ui/main.tsx)
+- index.html    Game page shell
+- manifest.json PWA manifest (name, icons, display: standalone), copied
|                into dist/ by build_github_pages.sh
+- sw.js         PWA service worker (cache-first offline cache of the static
|                bundle), copied into dist/ by build_github_pages.sh
`- style.css      Game styling
```

`src/engine/` and `src/ai/` must stay pure (no DOM globals, no import from
`src/ui/`); this is enforced by
[eslint.config.local.js](../eslint.config.local.js). See
[docs/CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md#layer-boundaries). For the
full per-file module map of `src/ui/scenes/`, `src/ui/solid/`, and
`src/ui/sprites/`, see
[docs/CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md#module-map).

### tests/

```text
tests/
+- test_*.mjs         Pure Node tests for engine/ai/UI-math (run with
|                     node --import tsx --test tests/test_*.mjs), including
|                     test_personas.mjs and test_save_log.mjs
+- test_*.py          Pytest hygiene suite (ASCII, imports, shebangs,
|                     whitespace, Markdown links, naming conventions)
+- playwright/        Browser-driven E2E specs, one per scene/panel
|                     (including pub_gamble, tutorial_hint,
|                     ambient_reduced_motion, pwa_install, reload_resume,
|                     replay_viewer, build_mismatch_notice) plus
|                     game_flow.spec.mjs (full game through the DOM) and
|                     repo_root.mjs helper; see tests/playwright/ for the
|                     current file list
+- e2e/               Non-browser whole-system harnesses: e2e_mini_flow.mjs,
|                     e2e_full_game.mjs, e2e_balance_sim.mjs (--report also
|                     writes the HTML balance dashboard), and
|                     e2e_balance_report.mjs (runs the --report command as a
|                     subprocess and checks the written dashboard; see
|                     docs/E2E_TESTS.md and docs/USAGE.md)
+- conftest.py        Pytest config; ignores tests/e2e and tests/playwright
|                     from pytest collection
+- file_utils.py      Shared repo-root helper for Python test scripts
`- TESTS_README.md /
   TESTS_TYPESCRIPT_README.md   Test suite usage notes
```

Run the pytest hygiene suite with `source source_me.sh && python3 -m pytest
tests/`. Run Node tests with `node --import tsx --test tests/test_*.mjs`. Run
Playwright specs with `./run_playwright_tests.sh` (or `npm run
test:playwright`). Run a non-browser E2E harness directly, for example
`node tests/e2e/e2e_full_game.mjs` (see
[docs/E2E_TESTS.md](E2E_TESTS.md)).

### devel/ and tools/

- `devel/` holds versioning and changelog automation: `bump_version.py`,
  `rotate_changelog.py`, `query_changelog.py`, `commit_changelog.py`,
  `changelog_lib.py`, `flatten_broken_md_links.py` (repairs broken Markdown
  links under `docs/archive/`), `clean_build.sh`, `dist_clean.sh`,
  `setup_typescript.sh`, `setup_playwright.sh`. See
  [devel/DEVEL_README.md](../devel/DEVEL_README.md) for the current script
  list and what belongs in this folder.
- `tools/` holds repo-local build helpers: `format_version_label.ts`,
  `html_to_pdf.mjs`, `sync_typescript_package_pins.py`,
  `generate_pwa_icons.mjs` (rasterizes the two PWA icon PNGs), and
  `balance_report_generator.mjs` (renders `e2e_balance_sim.mjs`'s sim
  results into the HTML balance dashboard).

## Generated artifacts

- `dist/` -- build output from `build_github_pages.sh`: `index.html`,
  `style.css`, `main.js` (plus its sourcemap), `manifest.json`, `sw.js`,
  `icons/icon-192.png`, `icons/icon-512.png`, and `.nojekyll`. Fully ignored
  by [.gitignore](../.gitignore) (the `dist/` rule); no files under `dist/`
  are tracked in git.
- `node_modules/` -- npm dependencies, git ignored.
- `test-results/`, `playwright-report/`, `blob-report/`, `coverage/` --
  Playwright/test tooling output, git ignored.
- `*.tsbuildinfo`, `.eslintcache`, `.prettiercache` -- TypeScript/ESLint/
  Prettier incremental caches, git ignored.
- `mule.nes` -- reference ROM, git ignored (`*.nes` rule), kept local only for
  developer reference against original game rules.
- `output_smoke/balance_report/` -- HTML balance dashboard written by
  `node --import tsx tests/e2e/e2e_balance_sim.mjs --report`, git ignored;
  see [docs/USAGE.md](USAGE.md#balance-report-dashboard).

## Documentation map

- `docs/CODE_ARCHITECTURE.md` -- layer boundaries, module map, data flow,
  phase state machine, auction tick model.
- `docs/FILE_STRUCTURE.md` -- this file.
- `docs/INSTALL.md`, `docs/USAGE.md` -- setup steps and how to run the game,
  build, and test suites.
- `docs/REPO_STYLE.md`, `docs/PYTHON_STYLE.md`, `docs/PYTEST_STYLE.md` --
  repo-wide and Python conventions (also used by the pytest hygiene suite).
- `docs/TYPESCRIPT_STYLE.md` -- TypeScript conventions for `src/`.
- `docs/E2E_TESTS.md`, `docs/PLAYWRIGHT_USAGE.md`,
  `docs/PLAYWRIGHT_TEST_STYLE.md` -- E2E and Playwright test conventions.
- `docs/COLOR_CONTRAST_ACCESSIBILITY.md`, `docs/FUN_VIBES_DESIGN_STYLE.md`,
  `docs/PLAYFUL_TRAINING_GAME_STYLE.md` -- visual/UX design conventions.
- `docs/RULE_SOURCES.md` -- per-constant authority decisions where historical
  sources conflict. `docs/REFERENCE_REPOS.md` -- consulted reference repos
  and how they are used (data/formulas only, no code reuse).
- `docs/CHANGELOG.md` -- dated log of changes; see
  [docs/REPO_STYLE.md](REPO_STYLE.md#changelog-rotation) for rotation rules.
- `docs/RELEASE_HISTORY.md`, `docs/NEWS.md` -- versioned release log and
  curated highlights.
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
- New pure-logic tests: `tests/test_<name>.mjs`, run with
  `node --import tsx --test`.
- New browser E2E coverage: `tests/playwright/`.
- New non-browser whole-system E2E coverage: `tests/e2e/`, following
  [docs/E2E_TESTS.md](E2E_TESTS.md).
- New Python hygiene checks: `tests/test_*.py`, following
  [docs/PYTHON_STYLE.md](PYTHON_STYLE.md) and
  [docs/PYTEST_STYLE.md](PYTEST_STYLE.md).
- New developer/release tooling: `devel/`.
- New build/sync helper scripts: `tools/`.
- New documentation: `docs/`, using SCREAMING_SNAKE_CASE filenames per
  [docs/REPO_STYLE.md](REPO_STYLE.md#documentation).
