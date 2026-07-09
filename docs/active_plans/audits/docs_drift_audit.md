# Docs drift audit

Audit of durable docs against the current tree after the 2026-07-09 SolidJS
port, scenes layer, pipeline build, engine standard-mode systems (events,
land auctions, crystite), and legacy-module deletions (store_screen.ts,
auction_screen.ts). Read-only audit; no doc content changed. Findings feed
the M10 WS-release docs sweep in
[docs/archive/mule_fidelity_plan.md](../../archive/mule_fidelity_plan.md) (archived
after this audit).

Method: read each doc, cross-checked against `find src/ ...`, `git status`,
`git log`, and `grep` across `docs/CHANGELOG.md`. Ran
`source source_me.sh && python3 -m pytest tests/test_markdown_links.py -q`
(36 passed, no broken links currently).

## docs/CODE_ARCHITECTURE.md

Broadly current: layer boundaries, phase state machine, data flow, and the
Solid module map for previously-existing files are accurate.

| Stale claim / gap | Reality |
| --- | --- |
| Module map (src/engine/) lists 11 files (constants through turn.ts) | Missing three engine modules that exist on disk: events.ts, land_auction.ts, round_scale.ts. None are named anywhere in the doc, in the table or in prose. |
| Module map (src/ui/) table | Missing src/ui/scenes/overworld_scene.tsx, src/ui/scenes/auction_tween.ts, src/ui/scenes/walker.ts, src/ui/scenes/zones.ts (the last two are named only in passing prose under town_scene, not in the table), src/ui/solid/event_banner.tsx, src/ui/solid/land_auction_panel.tsx, src/ui/solid/town_demo.tsx, and src/ui/solid/map_demo.tsx (named only in the Game driver prose section, absent from the table). |
| src/ui/sprites/ subdirectory | Not documented at all. sprites.ts (root ui file) is in the module map, but the 12-file split (palette.ts, sprite_gallery.ts, sprites_arena.ts, sprites_events.ts, sprites_mule.ts, sprites_species.ts, sprites_terrain.ts, sprites_title.ts, sprites_town.ts, terrain_gallery.ts, title_gallery.ts, town_gallery.ts) is undocumented. |
| No mention of pipeline/build.mjs anywhere in the doc | This is the current Solid JSX build path (esbuild JS API + esbuild-plugin-solid), wired into build_github_pages.sh per the 2026-07-09 changelog entry. Neither the module map nor the Game driver section names it. |

## docs/FILE_STRUCTURE.md

| Stale claim / gap | Reality |
| --- | --- |
| Top-level layout ASCII tree has no pipeline/ entry | pipeline/ exists at repo root (pipeline/build.mjs), staged in git, load-bearing for the build. Omitted entirely. |
| src/ subtree: `+- main.ts  Top-level entry point loaded by index.html` | File was renamed to src/ui/main.tsx in M1 Patch 1 (git status shows no src/ui/main.ts, only main.tsx). The src/ subtree also collapses ui/ to one line with no mention of scenes/, solid/, sprites/ underneath it. |
| tests/ subtree: playwright/ documented with 3 example files | 12 spec files exist now (overworld_scene.spec.mjs, land_auction.spec.mjs, terrain_gallery.spec.mjs, town_gallery.spec.mjs, event_banner.spec.mjs, sprite_gallery.spec.mjs, game_flow.spec.mjs, map_render.spec.mjs, auction_scene.spec.mjs, repo_root.mjs, title_gallery.spec.mjs, tick_ownership.spec.mjs, town_scene.spec.mjs). |
| tests/ subtree has no tests/e2e/ entry | tests/e2e/ exists with 3 files (e2e_balance_sim.mjs, e2e_full_game.mjs, e2e_mini_flow.mjs), matching the docs/E2E_TESTS.md non-browser-E2E convention this repo already follows. Not listed at all. |

Sections that check out: Documentation map active_plans subdirectory scheme
matches the real active/, audits/ layout; every doc named in Documentation
map exists on disk (docs/RULE_SOURCES.md and docs/REFERENCE_REPOS.md exist
and are correctly referenced elsewhere, though README's doc list omits them
-- see below).

## docs/USAGE.md

| Stale claim / gap | Reality |
| --- | --- |
| "This bundles src/main.ts into dist/main.js" (Quick start) and "Inputs: ... src/main.ts is the build entry point" | Entry point renamed to src/ui/main.tsx; bundling now runs through pipeline/build.mjs (esbuild JS API + esbuild-plugin-solid), not a bare esbuild CLI call. pipeline/build.mjs is never mentioned in this doc. |
| Only ?demo=map is documented | ?demo=town (src/ui/solid/town_demo.tsx, added in the 2026-07-09 M7 town scene work) is undocumented. |
| ?seed= and ?speed= are never mentioned | Both are load-bearing URL params (parsed in main.tsx per CODE_ARCHITECTURE.md, used throughout every Playwright spec and the balance/e2e harnesses) but absent from Quick start/Examples. |
| Example command `bash run_playwright_tests.sh tests/playwright/smoke.spec.ts` | Dead reference: no smoke.spec.ts exists, and no .spec.ts file exists at all -- every spec is .spec.mjs. |
| No mention of tests/e2e/ | The three non-browser E2E harnesses (e2e_full_game.mjs, e2e_balance_sim.mjs, e2e_mini_flow.mjs) have no run instructions anywhere in USAGE.md, despite e2e_full_game.mjs being the M7 headless full-game gate and e2e_balance_sim.mjs being the M10 tuning harness. |

## docs/INSTALL.md

No drift found. Requirements, install steps, and troubleshooting describe
generic Node/npm/Playwright setup; none of it references paths that moved
during the 2026-07-09 rework.

## README.md

| Stale claim / gap | Reality |
| --- | --- |
| "Features (v1 scope)" lists only the original 6 mechanics | Omits everything shipped since v1: SolidJS UI, walkable town and overworld, personal and colony events, land auctions, crystite. |
| "Status: the core game loop is under active development; not all rounds and phases are complete yet." | Stale relative to the M7 tests/e2e/e2e_full_game.mjs gate, which drives a complete seeded game through all 6 rounds to the scoring screen with zero page errors. |
| Screenshots block embeds docs/screenshots/store_screen.png labeled "Store screen for buying and outfitting a M.U.L.E." | The source for that screen, src/ui/store_screen.ts, is deleted (git status: D  src/ui/store_screen.ts), replaced by the walkable town interior. All four screenshot files are dated 2026-07-08 22:26-22:33, before the SolidJS/town rework, so all four (title, land grant map, store screen, auction track) are pre-rework and need recapture. |
| "Documentation" list | Omits docs/RULE_SOURCES.md and docs/REFERENCE_REPOS.md, both durable M1-workstream docs already in the repo. |

## docs/TODO.md

| Stale claim / gap | Reality |
| --- | --- |
| "Future fidelity plan (land auctions, events, crystite, wampus, gambling)" section lists all five as open/future work | Three of the five are implemented: land auctions (src/engine/land_auction.ts, src/ui/solid/land_auction_panel.tsx, tests/playwright/land_auction.spec.mjs -- M5), random events (src/engine/events.ts, src/ui/solid/event_banner.tsx -- M6, explicit "M6 WS-E-events" changelog entry), and crystite as a tradeable resource (bloom seeding, assay reveal, dynamic store pricing, full auction trading per the M2-M4 changelog entries). Only wampus and gambling remain genuinely open: gambling is explicitly deferred ("the pub shows a 'The pub opens soon' notice... its gamble action lands in M8"); no wampus file exists anywhere under src/ or tests/ (repo-wide grep, zero hits). |
| "Auction fidelity" section's deadAuctionWindowRate of 0.79 | Not re-verified by this audit (would require re-running the balance sim). Flag for WS-balance (M10) to confirm the current value -- the changelog shows auction mechanics changed substantially since that number was recorded (crystite added to the goods auction, store-only-buyer market). |

## docs/active_plans/active/mule_fidelity_plan.md

| Stale claim / gap | Reality |
| --- | --- |
| "Current state summary" section (around lines 122-156) describes the pre-M1 starting state verbatim: "6 rounds, 3 resources... unlimited mules"; "vanilla TS; game_driver.ts (637 lines) sequences phases on setTimeout chains; full-rebuild SVG map; menu store screen... No rAF, no animation, no avatar." | All false now: UI is SolidJS with a single rAF scene_manager.ts loop (no setTimeout chains), store_screen.ts and auction_screen.ts are both deleted, and crystite/events/land-auctions are live engine data and mechanics, not just types. This section was never updated as M1-M7 landed. |
| "Working-tree note" flags src/ui/auction_screen.ts as carrying an uncommitted edit that the M1 WS-U-solid workstream needs to classify | Resolved: the file is deleted (git status: D  src/ui/auction_screen.ts), replaced by src/ui/solid/auction_screen.tsx. The plan text still poses this as an open task. |
| Milestone table has no status column; nothing in the plan document itself states which milestones are done | Based on changelog evidence (explicit "M1 WS-U-solid", "M6 WS-E-events", "M7 WS-U-town" labels) and file-existence evidence gathered this audit, per-milestone completion is: |

Milestone completion evidence (M column matches the plan's milestone table):

| M | Status | Evidence |
| --- | --- | --- |
| M1 Proofs and foundations | DONE | pipeline/build.mjs, src/ui/game_store.ts, docs/RULE_SOURCES.md, docs/REFERENCE_REPOS.md, docs/active_plans/active/mule_art_style_spec.md all exist. |
| M2 Port completion and terrain | DONE | Crystite bloom seeding and assay_plot present per changelog ("Engine (M2 WS-E-blooms)"); sprites_terrain.ts exists; scene_manager.ts (rAF) exists; legacy store_screen.ts / auction_screen.ts deleted. |
| M3 Living economy | DONE | Changelog documents dynamic store pricing formulas landed (learning-curve/jitter/floor language matches the plan's M3 exit criteria). |
| M4 Spatial auction | DONE, with a naming divergence | The plan specifies AuctionScene.tsx under src/ui/scenes/; the actual file is src/ui/solid/auction_screen.tsx (not under scenes/). Functionally present; worth a one-line reconciliation note in the plan rather than a code change. |
| M5 Land and overworld | DONE | src/engine/land_auction.ts, src/ui/scenes/overworld_scene.tsx, src/ui/solid/land_auction_panel.tsx all exist. |
| M6 Events | DONE | src/engine/events.ts, src/ui/solid/event_banner.tsx, explicit "M6 WS-E-events" changelog entry. |
| M7 Production and town | DONE | src/ui/scenes/town_scene.tsx, tests/e2e/e2e_full_game.mjs grown per the plan's exit criteria, explicit "M7 WS-U-town" changelog entry. |
| M8 Creatures and identity | NOT STARTED | No wampus file found anywhere in src/ or tests/ (repo-wide grep, zero hits); gambling explicitly deferred ("gamble action lands in M8"); no species/mode select screens found. |
| M9 Endgame | NOT STARTED | No scoring/colony-rating changes or land-grant sweep cursor found beyond the current plan-described state. |
| M10 Balance and release | NOT STARTED | This audit is scoped to feed M10's WS-release workstream; the sim-tuning and docs-refresh exit criteria are not yet met. |
| M11 Excellence and durability | NOT STARTED | No autosave, replay viewer, AI personas, or PWA manifest found. |

This M1-M7-done / M8-M11-pending picture is not written anywhere in the plan
document itself -- a reader opening the plan cold cannot tell M1-M7 are done
without cross-referencing the changelog and the tree by hand, which is
exactly the drift the M10 docs sweep should close before archiving the plan.

## Prioritized fix list for the M10 docs sweep

1. docs/CODE_ARCHITECTURE.md: add events.ts, land_auction.ts, round_scale.ts
   to the engine module map; add the missing src/ui/scenes/ and
   src/ui/solid/ files to the UI module map; document the src/ui/sprites/
   subdirectory split; add a pipeline/build.mjs mention (module map or a
   short "Build pipeline" subsection).
2. docs/FILE_STRUCTURE.md: add pipeline/ to the top-level layout tree; fix
   main.ts -> main.tsx in the src/ subtree; expand the src/ui/ subtree to
   show scenes/, solid/, sprites/; replace the 3-file playwright/ example
   list with the current 12-file set (or drop the enumeration and point to
   tests/playwright/); add a tests/e2e/ entry.
3. docs/USAGE.md: fix both src/main.ts references to src/ui/main.tsx;
   document pipeline/build.mjs as the build path; document ?seed=, ?speed=,
   and ?demo=town; remove or fix the dead tests/playwright/smoke.spec.ts
   example; add run instructions for tests/e2e/ (e2e_full_game.mjs,
   e2e_balance_sim.mjs, e2e_mini_flow.mjs).
4. README.md: update the feature list and Status line to reflect the
   current SolidJS/town/events/land-auction/crystite state; recapture all
   four screenshots (all are pre-rework, dated 2026-07-08); add
   docs/RULE_SOURCES.md and docs/REFERENCE_REPOS.md to the documentation
   list.
5. docs/TODO.md: remove land auctions, random events, and crystite from the
   "Future fidelity plan" bullet list (all implemented); keep wampus and
   gambling as the remaining open items, or retitle the section "Wampus and
   gambling" now that it is down to two items; re-verify the
   deadAuctionWindowRate figure via the balance sim before restating it.
6. docs/active_plans/active/mule_fidelity_plan.md: rewrite "Current state
   summary" to reflect the post-M7 state (SolidJS, rAF scheduler,
   crystite/events/land-auctions live); remove or resolve the stale
   auction_screen.ts working-tree note; add a milestone status marker
   (inline in the table or a short status paragraph) recording M1-M7 done,
   M8-M11 pending, so the plan is self-describing without a changelog
   cross-reference; note the AuctionScene.tsx vs auction_screen.tsx
   naming/location divergence from the M4 workstream spec.
7. docs/INSTALL.md: no action needed; confirmed current.

## Developer tests and notes

- Added this audit artifact (docs/active_plans/audits/docs_drift_audit.md),
  staged for review by the M10 docs sweep.
