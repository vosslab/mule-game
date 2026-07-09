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

- Symptom: `tests/playwright/town_scene.spec.mjs` or
  `tests/playwright/pub_gamble.spec.mjs` intermittently time out or walk the
  avatar past a door, especially under parallel worker load, and re-running
  the same spec alone passes.
- Cause: a continuous-hold-while-polling walk helper races slow CDP round
  trips; the avatar can travel further than expected between polls and miss
  the door tile entirely.
- Fix: use the bounded-tap walk pattern (hold briefly, release, check the
  `data-at-door` attribute, repeat) rather than holding the key down while
  polling. Both `town_scene.spec.mjs`'s `useDoor` helper and
  `pub_gamble.spec.mjs`'s `walkToDoor` helper now use this pattern
  (`WALK_TAP_MS=120`, `MAX_WALK_TAPS=60`). Guidance: write any new
  walk-to-target helpers with bounded taps, never continuous-hold-plus-poll.

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
