# Plan: modularize the town scene files

## Context

The town rebuild grew two files past a comfortable size: `src/ui/scenes/town_scene.tsx`
(1546 lines) and `src/ui/scenes/town_world.ts` (1030 lines). `town_scene.tsx` now does five
jobs in one file -- SVG rendering, the rAF movement/camera loop, the interaction state
machine, walk-in detection, and inline panel scaffolding. This plan splits both by extraction
only (behavior preserving), touching town files only. It is NOT part of the town-rebuild
feature plan; it is a cleanup pass that runs at M5 close, after WP-5A/WP-5B finish editing
`town_scene.tsx` and before M6's walker work depends on it.

## Objectives

- No town file over ~600 lines; each new module has one clear job.
- Zero behavior change: pure extraction, verified by the existing town test suites.
- Executed after WP-5A/WP-5B settle `town_scene.tsx`, before M6, so nothing is edited by two
  agents at once.

## Design philosophy

Extract, don't rewrite: move cohesive blocks into named modules and update imports; change no
logic, no signal wiring, no DOM, no data attribute. The tests (town_street 17/17, the
town_world/town_camera unit suites) are the guardrail -- green before and after, byte-for-byte
behavior. Rejected alternative: a deeper redesign of the scene's reactivity/loop; rejected
because a refactor that also changes behavior can't use the current green suite as a safety
net, and the file's structure is sound, just large.

## Scope

- Split `src/ui/scenes/town_scene.tsx` into the scene shell plus extracted render and
  interaction modules.
- Optionally split collision/door-state out of `src/ui/scenes/town_world.ts`.
- Update imports across town consumers and tests.
- Keep it town-only.

## Non-goals

- Do not touch non-town large files (`replay_fixture.ts`, `auction_screen.tsx`,
  `engine/events.ts`, `engine/turn.ts`, `engine/constants.ts`, `engine/auction.ts`) -- those
  are a separate cleanup pass.
- Do not split `src/style.css` (shared across all screens; repo-wide CSS concern, not town).
- Do not change any behavior, DOM, data attribute, or public signature that tests/walker rely
  on.
- Do not run concurrently with any agent editing `town_scene.tsx`.

## Approach

Target module layout (extract from `town_scene.tsx`):

1. `src/ui/scenes/town_scene_render.tsx` -- presentational SVG components: `FacadeView`,
   `FacadeAmbientContent`, `TownDoorMarker`, resource emblems/icons, street surface, exit
   markers. Pure render, props in, no state ownership.
2. `src/ui/scenes/town_interaction.ts` -- the `TownInteractionState` union and its transition
   helpers (`syncMovementPhase`, `dismissPanel`, `streetSideOfDoor`, the walk-in
   detect/`useDoor` logic), as plain functions/a small hook that take and return state, so the
   contract stays testable in isolation.
3. `src/ui/scenes/town_scene.tsx` (shrunk) keeps: the component shell, the rAF loop + `disposed`
   guard, imperative `writeTransforms`/camera offset writes, panel mounting, and the wiring
   that connects the render + interaction modules.

Panels are already separate (`src/ui/solid/corral_purchase_panel.tsx`, and the WP-5A/5B
`outfit_panel.tsx` / `land_office_panel.tsx` / `assay_office_panel.tsx`), so no panel work here.

Optional second module (only if it lands cleanly, lower priority):

4. `src/ui/scenes/town_collision.ts` -- move `resolveTownWalk`, `sweepX`/`sweepY`,
   `isTownPointBlocked`, `buildTownSolidRects`, `computeOpenDoors`, `townDoorAtThreshold`,
   `townExitAt` out of `town_world.ts`, leaving `town_world.ts` as catalog + composition +
   types + tunable constants. Update imports in `town_scene.tsx`, `town_camera.ts` (if any),
   `tests/test_town_world.mjs`, and the walker. Skip if the import churn outweighs the benefit.

Order:
1. Extract render module (1) -- largest, most mechanical line reduction, lowest risk.
2. Extract interaction module (2).
3. Re-measure `town_scene.tsx`; stop if already under ~600 lines.
4. Only if still warranted, do the `town_world.ts` collision split (4).

## Critical files

- `src/ui/scenes/town_scene.tsx` (source of the extraction)
- `src/ui/scenes/town_world.ts` (optional collision split)
- New: `src/ui/scenes/town_scene_render.tsx`, `src/ui/scenes/town_interaction.ts`, optionally
  `src/ui/scenes/town_collision.ts`
- Import updates: any town consumer + `tests/test_town_world.mjs`, `tests/test_town_camera.mjs`,
  and the walker (`tests/e2e/walkthrough_*`) if the collision split changes an imported name.

## Verification

- `npx tsc --noEmit` -- exit 0.
- `npx eslint` + `npx prettier --check` on all touched/new files -- clean.
- `node --import tsx --test tests/test_town_world.mjs tests/test_town_camera.mjs tests/test_zones.mjs`
  -- unchanged pass counts.
- `bash build_github_pages.sh` then `npx playwright test tests/playwright/town_street.spec.mjs`
  -- still 17/17 (the behavior guardrail); full playwright suite unchanged.
- `wc -l` on the split files -- each under ~600 lines.
- Run through `code-simplifier` (behavior-preserving), tests green before and after.

## Sequencing

Runs at M5 close: after WP-5A (outfit panel) and WP-5B (land/assay panels + End-turn
relocation) finish editing `town_scene.tsx`, and before M6 (walker rebuild) so the walker
builds against the final module layout. Not before -- `town_scene.tsx` must be quiescent
(no other agent editing it) for a clean extraction.
