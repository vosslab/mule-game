# Troubleshooting

Symptom-first fixes for problems seen repeatedly in this repo. Start with
[docs/INSTALL.md](INSTALL.md) and [docs/USAGE.md](USAGE.md) for normal setup
and run steps; this doc covers what to do when those steps do not behave as
documented.

## Build fails right after a deep clean

- Symptom: `./build_github_pages.sh` fails with a module-resolution error
  (for example esbuild or a Solid plugin not found) after running
  `devel/dist_clean.sh`.
- Cause: `devel/dist_clean.sh` is the deep reset. Besides `dist/`, it also
  deletes `node_modules/` (keeping only the committed `package-lock.json`),
  so a bare rebuild has no dependencies to bundle against.
- Fix: reinstall dependencies first, then rebuild:

  ```bash
  npm run setup            # or: bash devel/setup_typescript.sh
  ./build_github_pages.sh
  ```

  `./run_web_server.sh` and `bash run_playwright_tests.sh --build` both
  auto-install and auto-build for you, so prefer those over a manual
  `build_github_pages.sh` call right after a deep clean.

## `npm install` prompts for approval and stalls an agent

- Symptom: an autonomous agent session hangs waiting on approval for a raw
  `npm install <package>` command.
- Cause: `npm install` with a package argument is a passthrough command
  under this repo's Claude permissions hook (it modifies machine state), so
  it always prompts a human.
- Fix: add the dependency to `package.json` directly (pinned version range,
  correct `dependencies` or `devDependencies` section; see
  [docs/TYPESCRIPT_STYLE.md](TYPESCRIPT_STYLE.md) for `allowScripts` entries
  needed by packages with postinstall hooks), then run the hook-allowed
  setup script instead of a raw install:

  ```bash
  bash devel/setup_typescript.sh
  ```

  This runs `npm install` against `package.json` as the single source of
  truth without an interactive package argument.

## Playwright specs flake walking a character to a door

- Symptom: `tests/playwright/town_street.spec.mjs` or
  `tests/playwright/pub_gamble.spec.mjs` intermittently time out or walk the
  avatar past a door, especially under parallel worker load, and re-running
  the same spec alone passes.
- Cause: a fixed-length or continuous-hold walk races slow CDP round trips.
  The mode-composed street's walker is fast (about `160 px/s` at the specs'
  speed), so a single overlong hold can carry the avatar clean past a door's
  narrow alignment window; with one fixed direction it walks straight out the
  far endpoint exit before the next poll notices.
- Fix: walk toward the door by its world coordinate, not by an attribute
  flag. The current helpers read the door-center world `x` off the rendered
  facade (`.town-facade-rect`) and seek it with bounded, gap-proportional
  taps against the avatar's live `data-town-avatar-x`: tap in whichever
  direction closes the gap, shrink each tap's hold as the remaining distance
  shrinks (clamped to a small min and max), and stop inside an arrival
  tolerance. This converges on the door center instead of overshooting the
  narrow alignment window. `pub_gamble.spec.mjs`'s `walkToDoor` and
  `town_street.spec.mjs`'s `walkAvatarToX` both use this seek; a pure
  horizontal seek never crosses a door threshold (that needs a separate Up
  hold), so repositioning cannot trigger an accidental walk-in.
- Guidance: write any new walk-to-target helper as a world-coordinate seek
  with gap-proportional bounded taps, never a fixed-length or
  continuous-hold walk. The harness-wide gesture timings are documented in
  [WALKTHROUGH_GUIDE.md](WALKTHROUGH_GUIDE.md) and derived in
  `tests/e2e/walkthrough_helpers.mjs`; reuse those rather than inventing new
  per-spec hold constants.

## Title screen shows "Saved game unavailable for this version."

- Symptom: the title screen's Resume control is replaced by a
  `[data-saved-game-notice]` message reading "Saved game unavailable for
  this version." instead of resuming a previous game.
- Cause: `src/ui/save_log.ts` stores a `buildVersion` (a hash of the `src/`
  tree, injected at build time) alongside the saved action log in
  `localStorage` under `mule-game-save-v1`. A save only replays against the
  exact engine build that produced it; once the source changes (even a
  rebuild with no player-visible change) the stored `buildVersion` no longer
  matches the running build, and the save is treated as unusable rather than
  replayed against a possibly-incompatible reducer.
- Fix: this is expected behavior, not a bug -- start a new game. The old
  save remains in `localStorage` but is intentionally never replayed once
  the build version no longer matches.

## `window.muleGameState()` is undefined or throws `DataCloneError`

- Symptom: a browser-driven walkthrough run (`tests/e2e/e2e_walkthrough.mjs`)
  finds `window.muleGameState` undefined, or the page throws a
  `DataCloneError` when the projection is built.
- Cause: two known causes. Most common: a stale `dist/` build served from
  before `src/ui/walker_debug.ts` existed. Historical (fixed): the projection
  once called `structuredClone` directly on the live SolidJS `createStore`
  proxy; proxies are not `structuredClone`-able and threw `DataCloneError`.
- Fix: force a rebuild first (`./build_github_pages.sh`) before suspecting the
  engine or walker code. The historical proxy bug was fixed by calling
  `structuredClone(unwrap(state))` instead of cloning the raw store, in
  `src/ui/walker_debug.ts`; see `docs/CHANGELOG.md` (2026-07-09, Decisions and
  Failures, walkthrough-harness Patch 3 fix round) for the full detail.
