# E2E_TESTS.md

<!--
Local corrections, re-applied after template propagation overwrote them:
(1) the "How to run" runner is named `tests/e2e/e2e_run_all.sh`, not
`run_all.sh` (the `e2e_` prefix is enforced by
`tests/test_test_naming_conventions.py`), and (2) the "Related docs" bullet
linking to WALKTHROUGH_GUIDE.md. Both belong upstream in the template repo
that ships this file; until the template is fixed, the next propagation will
clobber them again.

Repo-specific sections that propagation will also drop, because the template
has no place for them: "Where to write artifacts" and "Capture drivers in
this repo". These are mule-game content, not template content -- the durable
home for them is this repo, so re-add them here after any sync rather than
pushing them upstream.
-->

End-to-end (E2E) testing conventions for this repo.

## Two E2E homes

This repo supports two distinct E2E execution models, each with its own folder:

- `tests/playwright/` (and optional `tests/playwright/e2e/` sub-grouping) - **browser-based E2E**: full Playwright walkthroughs and browser-driven tests. TypeScript repos include `PLAYWRIGHT_USAGE.md` in their propagated `docs/` folder.
- `tests/e2e/` - **non-browser E2E**: shell/Python orchestration for whole-system testing: CLIs, builds, services, multi-suite coordination. This doc focuses on the non-browser model.

Both are excluded from `pytest tests/` via `collect_ignore = ["e2e", "playwright"]` in `tests/conftest.py`.

## Where to write artifacts

Playwright CLEARS its `outputDir` at the start of every `npx playwright test`
run. `playwright.config.ts` sets `outputDir: "test-results/playwright"`, so
Playwright only ever clears that subdirectory, not the shared `test-results/`
root. This is not a hypothetical: an earlier capture driver wrote 14
screenshots directly under `test-results/`, a concurrent Playwright run
started, and 13 of the 14 files were silently deleted mid-session.

- Durable artifacts (screenshots, capture output, generated reports) go under
  `output_smoke/` (reuse a stable directory name per
  [REPO_STYLE.md](REPO_STYLE.md)'s output-folder rule), or another
  tool-specific subdirectory outside `test-results/playwright/` -- for
  example the walkthrough harness's `test-results/walker/` report root.
- `test-results/playwright/` belongs to Playwright. Treat anything written
  there as ephemeral; it does not survive the next Playwright run.
- Do not write ad hoc output directly under the `test-results/` root -- that
  path only stays safe if it is inside a subdirectory Playwright does not
  own.

## Capture drivers in this repo

A capture driver is an E2E script whose product is EVIDENCE (screenshots) rather
than a pass/fail assertion about pure logic. It still exits non-zero when it
fails to produce the full evidence set, so an incomplete run cannot be mistaken
for a clean one.

- `tests/e2e/e2e_auction_beat_capture.mjs` -- walks a deterministic seed through
  every goods-auction beat and screenshots each one at both supported viewports
  (1024x640, the minimum supported stage; 1280x800, nominal). Writes 14 PNGs
  (7 beats x 2 viewports) into `output_smoke/auction_beats/`. This is the
  evidence set the auction's visual-acceptance gate is judged from; see
  [active_plans/reports/auction_visual_acceptance_final.md](active_plans/reports/auction_visual_acceptance_final.md).

```bash
node --import tsx tests/e2e/e2e_auction_beat_capture.mjs
```

The driver imports `playwright-core`, not `playwright` or `@playwright/test`,
which is what lets it live under `tests/e2e/` without tripping the
"Playwright imports belong under `tests/playwright/`" rule below.

## Test layout overview

This repo organizes tests in four tiers, all under the `tests/` umbrella:

- `tests/test_*.py` - fast pytest unit and integration tests. Run with `pytest tests/`.
- `tests/test_*.mjs` - pure Node tests, if any (rare; not browser-driven).
- `tests/playwright/` (with optional `tests/playwright/e2e/` subfolder) - browser-driven Playwright tests. TypeScript repos include `PLAYWRIGHT_USAGE.md` in their propagated `docs/` folder.
- `tests/e2e/` - non-browser whole-system E2E. Shell/Python orchestration (`e2e_*.sh`, `e2e_*.py`). Run directly, not via pytest.

## Why tests/e2e/ is excluded from pytest

Pytest is the fast lane. Tests under `tests/` should run in seconds so the
suite stays useful during development. End-to-end tests are by nature slow:
they invoke real scripts, read and write real files, and may hit the network
or external tools. Mixing them into `pytest tests/` makes the fast lane slow
and discourages running it.

Pytest's `collect_ignore = ["e2e", "playwright"]` in `tests/conftest.py` actively excludes
both the `tests/e2e/` and `tests/playwright/` subtrees from pytest collection, regardless of filenames
inside them. This is the primary safety mechanism. Additionally, `.mjs` and `.sh`
files are invisible to pytest by extension, and Python orchestration scripts use
the `e2e_*` prefix as a secondary, human-readable convention.

## Where non-browser E2E tests live

- Folder: `tests/e2e/` under `tests/` at the repo root.
- Pytest is configured to ignore the subtree via `collect_ignore = ["e2e", "playwright"]` in
  `tests/conftest.py`, so file naming inside `tests/e2e/` cannot accidentally pull slow tests into the fast lane.
- Recommended naming for readability:
  - `e2e_*.sh` for shell runners.
  - `e2e_*.py` for Python orchestration.
- Each E2E script is self-contained and exits non-zero on failure.

`tests/` (excluding `tests/e2e/` and `tests/playwright/`) stays reserved for fast pytest tests (see
[PYTEST_STYLE.md](PYTEST_STYLE.md)).

## How to run non-browser E2E tests

- Run a single shell runner: `bash tests/e2e/e2e_<name>.sh`.
- Run a single Python runner: `source source_me.sh && python3 tests/e2e/e2e_<name>.py`.
- Run all E2E tests: provide a `tests/e2e/e2e_run_all.sh` that iterates over
  the routine `e2e_*` files and reports pass/fail for each. The runner itself
  keeps the `e2e_*.sh` prefix so it does not trip the naming-convention check
  it lives alongside (see "Naming conventions test" below).
- For browser-driven Playwright runs, TypeScript repos include `PLAYWRIGHT_USAGE.md` in their propagated `docs/` folder.
- Do not invoke E2E tests from `pytest tests/`. Keep the two suites separate.

## Naming conventions test

File naming conventions are enforced by `templates/typescript/tests/test_test_naming_conventions.py`
(ships only to `REPO_TYPE=typescript` consumer repos) to prevent silent bugs:

- No `test_*.py` files anywhere under `tests/e2e/` (since `collect_ignore` would skip them silently, mismatching the name).
- No `test_*.py` files anywhere under `tests/playwright/` (same trap).
- All Python files under `tests/e2e/` must use the `e2e_*.py` prefix.
- All shell files under `tests/e2e/` must use the `e2e_*.sh` prefix.
- Any file with a Playwright import must live under `tests/playwright/`.

## What E2E tests should cover

- Whole-script behavior: run the CLI end to end with realistic arguments and
  check the produced files or exit code.
- I/O round trips: encode a file with one script, decode with another,
  compare to the original.
- Integration with external tools where mocking would defeat the point.
- Anything that needs user input or read/write to files (the `assert` rules
  forbid asserts in plain scripts entirely; cover that behavior here instead;
  see [PYTHON_STYLE.md](PYTHON_STYLE.md#assert)).

## What E2E tests should not cover

- Pure function correctness. That belongs in pytest under `tests/`.
- Anything fast enough to live in pytest. If a check finishes in under a
  second and does not touch the real filesystem in a meaningful way, it is a
  unit test, not an E2E test.

## Asserts and failures

- E2E test scripts may use `assert` (they are test files, not plain scripts).
- Prefer explicit exit codes and clear stderr messages so a failing E2E run
  is easy to diagnose without reading the script.

## Related docs

- [WALKTHROUGH_GUIDE.md](WALKTHROUGH_GUIDE.md): operating manual for the
  full-game browser walkthrough harness under `tests/e2e/` (`e2e_walkthrough.mjs`
  and its supporting modules) -- layers, run commands, output files, budgets,
  failure taxonomy, and the calibration and sweep coverage tables.
- [PYTEST_STYLE.md](PYTEST_STYLE.md): fast pytest unit and integration tests under `tests/`.
- Browser-driven test conventions: the website family (`website` and its inheriting `typescript`) includes `PLAYWRIGHT_USAGE.md` in their propagated `docs/` folder for tests under `tests/playwright/`.
- Browser test authoring style: the website family (`website` and its inheriting `typescript`) includes `PLAYWRIGHT_TEST_STYLE.md`, shipped via the `templates/website/` overlay, in their propagated `docs/` folder for how to write Playwright tests under `tests/playwright/`.
- [PYTHON_STYLE.md](PYTHON_STYLE.md): repo-wide Python rules, including
  the `assert`-only-in-tests boundary.
