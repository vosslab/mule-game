# Plan: goods-auction pipeline rebuild -- native 16:10 recompose of the NES auction

## Context

The goods auction is the game's centerpiece market and its worst screen. The game targets a
letterboxed 16:10 landscape stage (`#game-stage`, `src/style.css:333`), but the current auction
(`src/ui/solid/auction_screen.tsx`, 964 lines) is a portrait DOM column (header, price readout,
small SVG arena, trade log, intent buttons stacked vertically). The goods auction is not a board
phase (`phaseShowsMap`, `src/ui/solid/game_screen.tsx:357-366` excludes `auction`), so the screen
parks shrink-to-fit in `#game-panel` below an empty `#game-map`, and the arena SVG is capped at
`min(92cqw, calc(37cqh * 480/260))` (`src/style.css:1483`) -- by construction at most ~37% of
stage height. User verdict (2026-07-11, with screenshot): "the auction is only a tiny aspect of
the screen ... a crude mixture of both landscape and portrait, which makes it unusable", and "the
MULE game auction is supposed to be a visual delight showing how supply and demand work, our
implementation is very confusing."

**Composition target (user directives, 2026-07-11; supersedes the `docs/ROADMAP.md` near-term
entry's vertical-axis / `AuctionPainter` wording):** two references with distinct jobs. The NES
auction screens (`OTHER_REPOS/1990_NES_game_screenshots/13-auction*.png`) are the LAYOUT,
INTERACTION, and INFORMATION-HIERARCHY reference: which elements exist, how they relate, what the
player reads where. Planet M.U.L.E. remains the GRAPHIC-TREATMENT reference -- the same
"Planet-inspired modern look" the town facades already use (`docs/CHANGELOG.md` 2026-07-10), not
pixel-art reproduction. The composition is recomposed natively for the 16:10 landscape stage:
price runs left to right (cheap left, expensive right); buyers and sellers move horizontally;
player ROWS replace the NES player columns. The NES relationships are preserved -- position =
price, store rails bound the band, dashed lines mark the live best bid and best ask, per-player
role/money/units/traded always visible, big going price, timer bar, units-traded banner -- but
every region's placement is designed from the 16:10 frame outward. Three failure modes are
rejected by name: centering a narrow NES-shaped layout in the wide stage ("a vertical phone video
inside YouTube"), combining the reference with the current auction layout, and a literal NES
pixel reproduction in place of the modern treatment.

**Canonical sequence directive (user, final wording):** the NES screenshots are the canonical
reference for the COMPLETE auction sequence -- status/accounting, buy/sell/sit-out declaration,
live auction movement, trade feedback, and usage/consumption presentation. Preserve those beats
and the relationships among players, store stock, price, units, money, and traded amounts;
recompose each beat horizontally so the full stage is used, keeping every value visually
connected to its owner. (In this engine, usage is applied before the auction phase, so the
usage/consumption beat is presented inside the status/accounting beat -- the same order the NES
uses, where the USAGE animation runs on the STATUS screen before the AUCTION floor.)

Further user decisions this session: scope is the WHOLE auction pipeline as above; the existing
top HUD gives way to a per-lane player dock during auction; trade feedback is NES-style (transient
banner + per-lane counters, no standing text log); declare is an overlay on the live arena; Sit
Out fast-forwards the remaining window (the old blocker on the overlay idea); "I am not partial
to any existing auction code, feel free to scrap what we have and start over" -- the UI layer is
a scrap-and-replace, not a migration (the engine layer stays); milestones must be completable by
the manager and subagents alone, with NO human gates, visible or hidden; and prefer more, smaller
milestones over fewer large ones.

Lesson carried from the town rebuild (user, 2026-07-11): tests that enforce the bad layout get
removed FIRST, so the harness never argues for the old geometry -- but behavioral coverage of the
engine-to-UI seam must not lapse while layout work is in flight.

**SUPERSESSION (user, 2026-07-11): the supported viewports are 1024x640 and 1280x800.** Earlier
wording of this plan specified capture and acceptance viewports of 1600x900 and 1200x1000. Those
figures were wrong and are replaced throughout by **1024x640 (the MINIMUM supported viewport)** and
**1280x800 (the nominal target)**. Precedent: the town rebuild -- this repo's successful prior
screen rebuild -- recorded its supported viewports as 1280x800 and 1200x750
(`docs/active_plans/reports/town_street_visual_acceptance.md`); the user has now set the floor at
1024x640.

The 16:10 aspect ratio has been consistent throughout this project and is confirmed. `#game-stage`
is locked to `aspect-ratio: 16/10` (`src/style.css:333-347`), and the auction SVG viewBox is
960x600, which is ALSO exactly 16:10. Both 1024x640 and 1280x800 are exactly 16:10, so the stage
fills the viewport with NO letterboxing at either -- stage height equals viewport height -- and the
ENTIRE composition therefore scales by ONE uniform factor at every supported viewport. Two
consequences bind the visual gate:

- Geometry RATIOS (runway share of stage, trailing dead band, rail-to-runway proportion) are
  SCALE-INVARIANT. They are arithmetic identities of the region constants and cannot fail at one
  viewport while passing at another. They are pipeline sanity checks, not empirical design
  evidence, and this plan does not treat them as proof. (A reviewer caught exactly this error in
  the WP-X1 measurement report on 2026-07-11.)
- TEXT AND GLYPH LEGIBILITY is the only criterion class with an absolute pixel floor, so it is the
  only class that can actually fail across viewports, and it fails FIRST at the SMALLEST stage.
  **1024x640 is therefore the single binding pass/fail viewport**: a constant that is legible only
  at 1280x800 does not pass. 1280x800 is a sanity render, not a gate.

Scale math, recorded so later agents do not re-derive it: at 1024x640 the stage is 640 px tall
against the viewBox's 600 units, so 1 viewBox unit = 640/600 = 1.0667 CSS px -- a 40-unit store
rail renders at about 42.7 px, a 16-unit crate glyph at about 17.1 px. At 1280x800 the factor is
800/600 = 1.3333 CSS px per unit.

## Objectives

- The auction fills the 16:10 stage natively: the price runway is the dominant region (~56% of
  frame, full width between the store rails), no dead margins, no portrait column, no narrow
  reference layout centered in the wide frame.
- The supply-and-demand story is spatially legible: buyers enter from the cheap left wall walking
  right, sellers from the expensive right wall walking left, the dashed best-bid and best-ask
  lines visibly converge, and trades fire where they meet; buying from the store is literally
  your bid reaching the sell rail.
- The full per-good pipeline teaches the market: a status/accounting beat (store stock rails,
  per-player usage bars showing what was actually consumed, SURPLUS/SHORTAGE verdict) leads into
  declare and the floor.
- Every player-facing number lives with its owner: a left dock block per lane row carries role,
  money, units held, and units traded; the top HUD is hidden during auction.
- The human's Sit Out choice fast-forwards the window's remaining ticks instead of forcing a
  real-time spectate, at the fastest measured factor that leaves the window's outcome identical.
- The walkthrough sweep is run throughout for information, but as of 2026-07-11 it is SUSPENDED as
  a gate and a green run does not close a milestone (see
  [walkthrough_gate_suspension.md](../decisions/walkthrough_gate_suspension.md)). Every remaining
  plan gate is verifiable by the manager and subagents alone -- captured fixtures, deterministic
  state forcing, automated behavior tests, and an image-evaluator acceptance report; no human
  sign-off inside the plan.

## Design philosophy

- Composition first, chrome second: the budget goes to one full-stage composition where geometry
  itself carries the market information (x = price, row = player, rails = the store's band). The
  rejected alternative -- incrementally re-styling the existing DOM-column screen -- is exactly
  the patch-a-wrong-composition trap the town rebuild escaped by scrapping.
- Fix the design, not the symptom, in the data layer too: the status beat records ACTUAL
  per-player usage at the seams where the engine applies it, rather than reconstructing usage
  from rule constants after the fact -- reconstruction would show mathematically plausible
  numbers that can diverge from what the player just experienced (clamped consumption, event
  effects). A small recording cost now buys a truthful teaching screen forever.
- Tests follow design, not the reverse: layout-locking assertions die in the first milestone
  while a small behavior-only safety net (selectors, role commit, intent, completion, reduced
  motion) keeps the engine-to-UI seam protected for the whole rebuild.

## Scope

- Rebuild the goods-auction floor to the full-stage native landscape composition (horizontal
  price axis, one row lane per player, store rails at the runway edges, dashed bid/ask lines,
  big going price, timer bar) in the Planet-inspired modern graphic treatment.
- Add the per-good status/accounting beat before each floor, driven by a new additive read-only
  engine round ledger that records actual per-player usage/spoilage/production as they are
  applied, exposed on `AuctionPayload`.
- Rebuild declare as an overlay on the live arena with role buttons present from tick 0's first
  frame; the scene clock stays held until the human commits (existing `notifyAuctionCommit`).
- Implement Sit Out fast-forward: when the human's committed role is `out`, the auction tick
  interval drops via a scene-manager-only seam (factor chosen by the WP-FF experiment, prior
  6x); a FAST indicator shows it.
- Replace the trade log with NES-style feedback: transient "UNITS TRADED n" banner, per-lane
  TRADED counters in the dock, kept goods-glyph/flash animations.
- Build the left player dock (role / money / units / traded per lane row) with a human-scoped
  money live region; hide `#game-hud` during the auction phase.
- Delete the old auction UI and CSS outright; strip old-geometry test assertions FIRST while
  landing a behavior-only safety net; write new specs for the new composition; keep the
  walkthrough harness selector contract intact.
- Make ArrowLeft/ArrowRight the PRIMARY taught controls (matching the horizontal motion: right =
  raise price, left = lower); ArrowUp/ArrowDown remain as compatibility aliases.
- Preserve the reduced-motion contract (snap positioning, no avatar CSS transitions, instant
  flash/banner; status usage bars snap to final size).
- Build a deterministic state-forcing path (seed + scripted gestures, or a debug fixture reusing
  the existing `?seed=`/`?speed=` hooks and `src/ui/scenes/replay_fixture.ts` pattern) so every
  auction beat -- status, declare, live, trade feedback, fast-forward, finished, skipped -- can
  be captured and judged automatically at both supported viewports, 1024x640 (binding) and
  1280x800 (sanity render).
- Update `docs/ROADMAP.md` (supersede the vertical-axis entry), `docs/SCREEN_DESIGNS.md` (our
  departure note), and `docs/CHANGELOG.md`.

## Non-goals

- Change any engine auction rule: bands, price steps, role auto-assignment, ranked-offer
  matching, skip conditions, quiet-tick timer semantics, transfer rates all stay exactly as
  documented in `docs/RULE_SOURCES.md`. (Recording applied amounts is observation, not a rule
  change.)
- Rebuild the land auction (`land_auction_panel.tsx`, `land-auction-*` CSS); separate board
  phase, untouched.
- Add multiplayer, collusion gestures, or any mechanic the engine does not already have.
- Add sound or music (separate roadmap pass).
- Implement species selection (the fixed `SPECIES_BY_SLOT` map carries over).
- Restyle other phase panels beyond the HUD-hide seam the auction needs.
- Block any milestone on human review; the human's approval is post-plan, on the filed
  acceptance artifacts.

## Current state summary

- Mount: `AuctionScreen` renders inside `#game-panel` (`game_screen.tsx:296-298`); `auction` is
  not in `phaseShowsMap`, so `#game-map` idles empty and the panel shrink-fits under
  `align-items: center`.
- Layout: `.auction-screen` flex column capped `min(94cqw, 1400px)` (`style.css:1435`); arena SVG
  480x260 capped at 37cqh (`style.css:1483`) -- the "tiny box" root cause.
- Motion layer (the one part worth carrying): the arena already moves avatars HORIZONTALLY --
  `priceToX` = `TRACK_LENGTH - priceToTrackY(...)` (`auction_screen.tsx:460-462`), rAF tween via
  `onSceneFrame`, `writeAvatarTransform` mirrors `data-x` (moving) / `data-y` (lane), walk-frame
  swapping, reduced-motion snap. The chosen axis direction matches this, so the tween
  architecture ports nearly verbatim; the composition around it is scrapped.
- Clock: `scene_manager.ts` owns pacing -- `AUCTION_TICK_MS = 500` (line 66), clock held at tick 0
  until `notifyAuctionCommit()` (`isAuctionTickable`, line 437), commitment reset per good.
- Engine payload: `AuctionPayload` (`game_state.ts:306-345`) carries everything the floor needs
  (participants with role/price/intent, store quotes and stock, band identical to quotes --
  `priceFloor === storeBuyPrice`, `priceCeiling === storeSellPrice` -- trades, tick clock,
  `runUnits`, skipped/finished) and its doc explicitly blesses additive fields. No status
  payload exists. Usage is applied at two seams before the auction: food consumption at the
  develop-phase timer, energy usage + spoilage + production inside `enterProduction`
  (`src/engine/economy.ts`, `applySpoilage` at line 410). `computeColonyStats`
  (`src/engine/store.ts:396`, pure, exported) yields food/energy supply-and-need pairs for the
  colony verdict.
- Tests: `tests/playwright/auction_scene.spec.mjs` (geometry-heavy: sideline `data-y` ordering,
  rightward `data-x` motion, reduced-motion snap-to-token) and the auction half of
  `tests/playwright/game_flow.spec.mjs` (token `cx` motion, store-line counts, trade-log
  presence) are redesign-fragile. `tests/e2e/walkthrough_auction.mjs` is selector-only
  (`data-action` + `data-role`) and geometry-free -- BUT lines 252-262 set `committedGood`
  unconditionally after `clickIfPresent`, so role buttons hidden at tick 0 would silently
  deadlock the sweep at the 4000-tick cap. Node tests: `test_auction_tween.mjs` (kept),
  `test_auction*.mjs` engine suites (untouched).
- Prior artifacts: `docs/active_plans/reports/auction_landscape_visual_acceptance.md` (flags the
  trailing dead-band at 16.3% of stage height; captured before the viewport supersession above, so
  read its viewport figures as stale and its dead-band ratio as scale-invariant),
  `docs/active_plans/decisions/auction_readout_variant.md` (per-player money is not on
  `AuctionParticipant` -- the dock needs `players` money in props),
  `docs/active_plans/decisions/auction_traversal_evidence.md` (engine provenance, unaffected).
- Existing determinism hooks for fixtures: `?seed=` / `?speed=` URL params (`src/ui/main.tsx`),
  `src/ui/scenes/replay_fixture.ts`, fixed seed 1234 reaches a deterministic store-trade window
  (per the old spec header).

## Architecture boundaries and ownership

Durable component names (no planning terms in code):

- **Auction geometry module** -- `src/ui/scenes/auction_geometry.ts` (new, pure): viewBox
  960x600 regions, `laneCenterY(slot)`, `priceToX(price, floor, ceiling)` over the runway span,
  crate/usage-bar scales, label clamps. Node-tested like `auction_tween.ts`.
- **Auction shell** -- `src/ui/solid/auction_screen.tsx` (rewritten, ~250 lines): beat
  sequencing, reduced-motion signal, keyboard intent (ArrowLeft/Right primary, ArrowUp/Down
  aliases), DOM overlays (declare, finished, intent buttons, hint, aria-live announcer). Owns
  the exact `data-action="auction-role|auction-intent-up|auction-intent-down|auction-continue"`
  + `data-role` selector contract.
- **Auction arena** -- `src/ui/scenes/auction_arena.tsx` (new): the single full-slot SVG -- top
  band (emblems, title, big going price, ticks, FAST indicator), store buy/sell rails at the
  runway edges, 4 lane rows, vertical dashed best-bid/best-ask + rail lines, avatars + ported
  tween loop, timer bar, composes dock + status + fx layers.
- **Auction dock** -- `src/ui/scenes/auction_dock.tsx` (new): left dock rows (swatch, species
  head, role, $money, units, traded) aligned per lane, human-scoped money live region.
- **Auction status layer** -- `src/ui/scenes/auction_status.tsx` (new): tick-0 accounting
  content (crate accounting on the rails, per-row usage bars from the round ledger, USAGE
  caption, SURPLUS/SHORTAGE stamp), rendered inside the declare overlay above always-present
  role buttons.
- **Auction trade fx** -- `src/ui/scenes/auction_trade_fx.ts` (new, extracted): imperative
  flying-goods / flash / "UNITS TRADED n" banner helpers.
- **Scene clock** -- `src/ui/scenes/scene_manager.ts` (edited): `auctionTickMs(payload)` helper --
  `AUCTION_TICK_MS / FACTOR` (measured, prior 6) when
  `humanAuctionCommitted && participants[HUMAN_ID].role === "out"`, else 500. Same single
  scheduler, tick-ownership invariant untouched.
- **Engine round ledger** (additive only) -- per-player, per-good `{previous, usage, spoilage,
  production, eventDelta, held}` RECORDED at every seam that mutates player goods between round
  start and the good's auction-window creation: food consumption at the develop timer
  (`turn.ts:432`), energy usage + spoilage + production inside `enterProduction` /
  `applySpoilage` (`turn.ts:591`, `economy.ts:410`), and event-driven goods changes
  (`events.ts:214` resource grants, `events.ts:549` pest food halving -- verified goods-mutating
  sites; WP-E greps for any others and covers them). Ledger boundary: `previous` is the player's
  holding at round start; `held` is the holding at window creation; the reconciliation
  `previous - usage - spoilage + production + eventDelta = held` is EXACT by construction
  because every mutating seam records. Exposed with the colony verdict (`computeColonyStats`
  supply-vs-need; food/energy only, ores always null -- user decision) as
  `AuctionPayload.status` from `createAuctionPayload` (`src/engine/auction.ts:247`). Observation
  only; no rule changes.
- **State-forcing fixture path** -- deterministic beat capture reusing `?seed=`/`?speed=` and the
  `replay_fixture.ts` pattern: a scripted playwright driver that walks seed 1234 to each auction
  beat (status/declare at tick 0, live motion, store-trade feedback, sit-out fast-forward,
  finished, and a skipped window) and screenshots each at 1024x640 and 1280x800.
- **Mount seam** -- `src/ui/solid/game_screen.tsx`: `game-panel-filled` class on `#game-panel`
  and `game-hud-hidden` on `#game-hud` when `kind === "auction"`, mirroring the proven
  `game-map-filled` idiom; `src/style.css`: new slot rules, old auction block deleted.
- **Reused unchanged**: `auction_tween.ts` (`priceToTrackY`, `easeToward`), species/arena sprite
  modules, `GameStore` dispatch, all engine auction rules.

### Mapping (milestones / workstreams -> components / patches)

| Milestone / Workstream | Component | Expected patches |
| --- | --- | --- |
| M1 / WS-tests | old playwright auction specs + behavior safety net | 1 |
| M2 / WS-geometry | auction geometry module + node tests | 1 |
| M2 / WS-ledger | engine round ledger + `AuctionPayload.status` | 1-2 |
| M2 / WS-clock | scene clock fast-forward | 1 |
| M3 / WS-shell | auction shell, mount seam, CSS slot rules | 1-2 |
| M3 / WS-mock | static composition mock + measurement report | 1 (throwaway mock, kept report) |
| M4 / WS-arena | auction arena SVG | 1-2 |
| M4 / WS-dock | auction dock | 1 |
| M4 / WS-status | auction status layer + declare/finished overlays | 1-2 |
| M5 / WS-fx | auction trade fx | 1 |
| M5 / WS-capture | beat-capture driver + skipped-seed scan | 1 |
| M6 / WS-specs | new playwright auction specs | 1-2 |
| M6 / WS-visual | all-beats capture run + image-evaluator acceptance | 1-2 |
| M7 / WS-docs | ROADMAP / SCREEN_DESIGNS / CHANGELOG close-out | 1 |

### Skill routing for doers

The user named three local skills whose reference files doers load per lane (invoke the skill,
read only the routed reference file):

- `solid-js-expert` -- all SolidJS component lanes (WS-shell, WS-arena, WS-dock, WS-status,
  WS-fx). Key routes: `references/control-flow.md` (`<For>`/`<Show>`/`<Switch>`),
  `references/refs-lifecycle.md` (onMount/onCleanup around the rAF tween loop),
  `references/jsx-attributes.md` (classList, attr writes on SVG), `references/gotchas.md`
  (run-once components; no props destructuring).
- `typescript-engineer` -- WS-geometry and WS-ledger. Key routes:
  `references/game-type-patterns.md`, `references/modular-type-design.md` (the payload contract
  is a shared boundary type). Verification per its return contract: quoted `npx tsc --noEmit`
  output. Repo front doors are the interface: `./check_codebase.sh`, `./run_web_server.sh`,
  `./run_playwright_tests.sh`, `./build_github_pages.sh`.
- `ui-ux-engineer` -- WS-visual acceptance judging and any M4 composition question. Key routes:
  `references/ui_ux_review.md` (hierarchy/state-coverage checklist),
  `references/testing_and_oracles.md` (state matrix: every captured beat must look intentional).
  The `docs/FUN_VIBES_DESIGN_STYLE.md` load-bearing rule goes into every reviewer prompt: loud
  color, big shapes, playful motion are not defects without a specific usability failure.

## Milestone plan

| M | Title | Summary | Goal |
| --- | --- | --- | --- |
| M1 | Test reshaping | Strip old-geometry assertions; land a behavior-only safety net | The seam stays protected while nothing argues for the old layout |
| M2 | Foundations | Pure geometry module, engine round ledger, fast-forward clock with a measured factor | Every later lane has its inputs, node-tested and evidence-backed |
| M3 | Shell, mount, and composition proof | Rewrite the shell and stage slot; in parallel, screenshot-measure a static mock of the proposed composition | The auction owns the whole stage, and the region budget is validated by measurement before three lanes build on it |
| M4 | Native composition | Arena, player dock, and status/declare layers in parallel | The full-stage market renders: runway, rails, lanes, dock, accounting beat |
| M5 | Trade feedback and capture fixture | Flying goods, flash, banner; in parallel, the beat-capture driver | Trades read as moments, and the proof harness is ready before proof time |
| M6 | Automated proof | New behavior specs + all-beats capture, image-evaluator judged | All gates green with zero human interaction |
| M7 | Docs close-out | ROADMAP supersession, SCREEN_DESIGNS note, changelog summary | No doc still points at the dead design |

### Dispatch waves (wall-time view)

Milestone numbers are labels; ordering is dependency-driven, and independent milestones dispatch
CONCURRENTLY. Maximum-parallelism schedule (workstream count per wave):

- Wave A (4 lanes at once): WP1 (M1) + WP2, WP-E, WP-FF (M2) -- all four packages are
  file-disjoint and dependency-free, and WP-FF's factor experiment runs inside it.
- Wave B (2 lanes): WP3 (M3 shell, solo on its collision set) + WP-X1 (M3 composition mock).
  WP-X1's mock page and captures are scratch files, fully disjoint from WP3; its ONE repo
  artifact -- the constant-freeze patch to `auction_geometry.ts` + node test -- is authored by
  the WS-mock coder and lands AFTER WP2 is merged (the file's only prior owner), so no lane
  ever has a concurrent editor on that file.
- Wave C (3 lanes): WP4, WP5, WP6 (M4) -- file-disjoint, interfaces pinned by WP3, constants
  frozen by WP-X1's measurements.
- Wave D (2 lanes): WP7 (M5 fx) + WP8b-fixture (M5 capture driver -- depends only on WP3's
  stable selectors, captures re-run later).
- Wave E (2-3 lanes): WP8a (specs) + WP8b-acceptance (capture + judge + tuning loop); WP-D
  drafts concurrently and lands last (M7).

Peak crew: 4 doers (Wave A); no wave leaves a doer blocked on a sibling in the same wave.

### Milestone: M1 -- Test reshaping

- Depends on: none.
- Workstreams: WS-tests (WP1).
- Entry criteria: none.
- Exit criteria: no spec asserts old geometry (track selectors, `data-x`/`data-y` values,
  sideline ordering, trade-log presence); a behavior-only safety net spec exists and is green
  against the CURRENT screen (role buttons clickable at tick 0, held intent changes the human
  participant's payload price direction, Continue ends the good, `data-reduced-motion`
  propagates, flash counter increments on a store trade -- all layout-agnostic); walkthrough
  harness untouched. Follow-ons: changelog entry; drop dead helper imports.
- Parallel-plan ready: no -- one tightly scoped package (1 doer).

### Milestone: M2 -- Foundations

- Depends on: none (independent of M1).
- Workstreams: WS-geometry (WP2), WS-ledger (WP-E), WS-clock (WP-FF).
- Entry criteria: none.
- Exit criteria: `auction_geometry.ts` + node tests green; round ledger recorded at the apply
  seams and exposed as `AuctionPayload.status` with node tests pinning a hand-computed round
  (previous/usage/spoilage/production/held reconcile: previous - usage - spoilage + production
  = held) and verdict cases (food/energy surplus+shortage, ores null); `auctionTickMs` in
  scene_manager (measured factor when human committed `out`, else 500) with FAST state readable
  and the 3x/6x/10x experiment table recorded; existing
  engine suites untouched and green; `docs/RULE_SOURCES.md` note landed. Follow-ons: changelog
  per patch.
- Parallel-plan ready: yes -- WP2, WP-E, WP-FF are file-disjoint and dependency-free (3 doers).

### Milestone: M3 -- Shell, mount, and composition proof

- Depends on: M1 (old geometry assertions gone; safety net available to re-run); WS-mock also
  needs M2 WS-geometry (the region constants it measures).
- Workstreams: WS-shell (WP3, solo -- collision-heavy by design) + WS-mock (WP-X1, parallel).
- Entry criteria: M1 merged (WP-X1 additionally waits for WP2).
- Exit criteria: shell rewritten with the old arena transplanted as a temporary internal stub
  (game playable at every commit); `game-panel-filled` + `game-hud-hidden` seams + CSS slot
  rules landed with one reserved comment block per M4/M5 lane; all four `data-action` selectors
  + `data-role` render exactly as before at tick 0 and finish; ArrowLeft/Right primary intent
  keys + Up/Down aliases wired; component prop interfaces pinned (arena: payload +
  reducedMotion; dock: participants + trades + players money; status: payload.status +
  reducedMotion); WP-X1's measurement report filed and its verdict folded into
  `auction_geometry.ts` (constants frozen for M4). GATE: M1 safety-net spec green AND
  `tests/e2e/walkthrough_auction.mjs` green inside a full walkthrough run (the committedGood
  deadlock check). Follow-ons: changelog; remove orphaned constants/CSS.
- Parallel-plan ready: yes -- WP3 and WP-X1 touch disjoint files (WP-X1 is a scratch page +
  capture script + report; its geometry edits land as one handoff patch WP3 does not touch)
  (2 doers).

### Milestone: M4 -- Native composition

- Depends on: M2 (geometry, ledger), M3 (shell, prop interfaces, reserved CSS blocks).
- Workstreams: WS-arena (WP4), WS-dock (WP5), WS-status (WP6).
- Entry criteria: M2 + M3 merged.
- Exit criteria: temporary arena stub deleted; runway/rails/lanes/dashed-lines/timer/top-band
  render to the geometry module's regions; dock rows aligned to lanes with the human money live
  region; combined tick-0 status + declare overlay with role buttons clickable from the first
  frame; FAST indicator wired; skipped windows render an intentional skipped state (good name +
  "no trade possible" treatment, instant Continue), not a blank frame. GATE: safety-net spec +
  walkthrough_auction green. Follow-ons: changelog per patch; each lane's CSS stays inside its
  reserved block; a geometry-module gap is fixed in the module + its node test in the same patch.
- Parallel-plan ready: yes -- WP4, WP5, WP6 are file-disjoint with interfaces pinned at M3
  (3 doers).

### Milestone: M5 -- Trade feedback and capture fixture

- Depends on: M4 (arena trade layer for WS-fx; stable rendered beats for WS-capture's dry run --
  the driver itself needs only M3's selectors and can start against the M4 tree).
- Workstreams: WS-fx (WP7) + WS-capture (WP8b-fixture).
- Entry criteria: M4 merged.
- Exit criteria: flying goods seller->buyer, flash at buyer, transient "UNITS TRADED n" banner
  fed by `runUnits`, monotonic `data-flash-count`; reduced motion = instant flash + banner, no
  travel; teardown clears timers/glyphs; the beat-capture driver runs end to end and emits one
  screenshot per beat at both viewports (trade-feedback and FAST frames re-captured in M6 after
  WP7 merges if the dry run predates it); the skipped-window source is pinned (scanned seed or
  synthetic fixture). GATE: safety-net spec green. Follow-ons: changelog.
- Parallel-plan ready: yes -- WP7 and WP8b-fixture are file-disjoint (2 doers).

### Milestone: M6 -- Automated proof

- Depends on: M4, M5.
- Workstreams: WS-specs (WP8a), WS-visual (WP8b-acceptance).
- Entry criteria: M5 merged (including the WP8b-fixture driver).
- Exit criteria: new `auction_scene.spec.mjs` green (behavior-shaped: buyer holding ArrowRight
  moves `data-x` rightward; dock TRADED counter increments after the seed-1234 store trade;
  status layer + role buttons both present at tick 0; sit-out window tick cadence measurably
  exceeds committed cadence; reduced-motion snap; HUD hidden during auction and restored after);
  `game_flow.spec.mjs` auction assertion restored; the WS-capture driver (built in M5) re-runs
  and produces screenshots of ALL beats -- status/accounting, declare, live motion, trade
  feedback, fast-forward, finished, skipped -- at 1024x640 and 1280x800; image_evaluator judges
  them against the written criteria, with the criterion classes kept distinct: the geometry ratios
  (runway dominant, >= 90% stage-width coverage, trailing dead band <= 5% of stage height) are
  SCALE-INVARIANT identities of the frozen region constants -- pipeline sanity checks that read the
  same at both viewports -- while the legibility criteria (price story legible -- rails, dashed
  lines, going price; dock legible; every beat intentional; Planet-modern treatment not NES pixel
  copy) are judged at 1024x640, the BINDING viewport, with 1280x800 as a sanity render. The judge
  files a PASS report under `docs/active_plans/reports/`; full walkthrough sweep seeds
  {1,3,7} x modes {beginner,standard} 6/6 green. A FAIL report loops geometry/style tuning
  patches (geometry edits land with matching node-test updates) until PASS -- the report, not a
  human, is the gate. Follow-ons: changelog; spec header selector-contract comments updated.
- Parallel-plan ready: yes -- WP8a and WP8b are independent lanes (2-3 doers: tester +
  playwright_operator + image_evaluator).

### Milestone: M7 -- Docs close-out

- Depends on: M6 (final geometry settled).
- Workstreams: WS-docs (WP-D).
- Entry criteria: M6 merged.
- Exit criteria: `docs/ROADMAP.md` near-term auction entry rewritten to the native landscape
  composition decision (supersession dated 2026-07-11); `docs/SCREEN_DESIGNS.md` auction
  departure note updated; `docs/CHANGELOG.md` close-out summary; this plan moved to
  `docs/archive/` via `git mv`; `pytest tests/test_markdown_links.py tests/test_ascii_compliance.py`
  green. Follow-ons: none (close-out).
- Parallel-plan ready: no -- one doc package (1 doer).

## Workstream breakdown

### Workstream: WS-tests (M1)

- Owner: coder
- Needs: nothing.
- Provides: geometry-free suite + behavior safety net protecting the seam through M3-M6.
- Expected patches: 1.

### Workstream: WS-geometry (M2)

- Owner: coder
- Needs: the geometry spec in this plan.
- Provides: `auction_geometry.ts` consumed by arena/dock/status; node tests.
- Expected patches: 1.

### Workstream: WS-ledger (M2)

- Owner: expert_coder (engine seams; provenance discipline)
- Needs: nothing (verdict mapping resolved: food/energy from `computeColonyStats`, ores null).
- Provides: recorded round ledger + `AuctionPayload.status` for the status layer.
- Expected patches: 1-2.

### Workstream: WS-clock (M2)

- Owner: coder
- Needs: nothing (factor resolved: 6x).
- Provides: `auctionTickMs(payload)`; FAST state for the arena.
- Expected patches: 1.

### Workstream: WS-shell (M3)

- Owner: expert_coder (collision-heavy seam work; harness-contract risk lives here)
- Needs: M1 merged.
- Provides: shell + mount seams + reserved CSS blocks + pinned component prop interfaces.
- Expected patches: 1-2.

### Workstream: WS-mock (M3)

- Owner: coder (mock page) + playwright_operator (capture) + image_evaluator (measurement read)
- Needs: WS-geometry constants.
- Provides: measured evidence -- geometry ratios (runway share, dead band) as scale-invariant
  pipeline checks, plus dock/label legibility read at the binding 1024x640 viewport with 1280x800
  as a sanity render -- that freezes the geometry constants before three M4 lanes build on them.
- Expected patches: 1 (geometry handoff; the mock itself is scratch).

### Workstream: WS-capture (M5)

- Owner: playwright_operator
- Needs: M3 selectors (start), M4 rendered beats (dry run).
- Provides: the deterministic beat-capture driver + pinned skipped-window source, reused by
  WS-visual in M6.
- Expected patches: 1.

### Workstream: WS-arena (M4)

- Owner: expert_coder (the composition centerpiece; ports the tween loop)
- Needs: WS-geometry, WS-shell.
- Provides: the arena SVG all other layers compose into.
- Expected patches: 1-2.

### Workstream: WS-dock (M4)

- Owner: coder
- Needs: WS-geometry, WS-shell (props: participants, trades, players money).
- Provides: dock rows + money live region.
- Expected patches: 1.

### Workstream: WS-status (M4)

- Owner: coder
- Needs: WS-geometry, WS-shell, WS-ledger.
- Provides: status layer + declare/finished overlays (role buttons always present at tick 0) +
  intentional skipped-window state.
- Expected patches: 1-2.

### Workstream: WS-fx (M5)

- Owner: coder
- Needs: WS-arena trade layer.
- Provides: flying goods, flash, banner, reduced-motion behavior.
- Expected patches: 1.

### Workstream: WS-specs (M6)

- Owner: tester
- Needs: M5 merged.
- Provides: new playwright specs for the new composition.
- Expected patches: 1-2.

### Workstream: WS-visual (M6)

- Owner: playwright_operator (capture run) + image_evaluator (judge); tuning patches by coder
- Needs: M5 merged (including the WS-capture driver); NES frames + written criteria as the
  judging basis.
- Provides: all-beats screenshots at 1024x640 and 1280x800, PASS report (legibility judged at
  1024x640, the binding viewport), tuning patches until PASS.
- Expected patches: 1-2.

### Workstream: WS-docs (M7)

- Owner: planner
- Needs: M6 merged (can draft earlier, lands last).
- Provides: ROADMAP/SCREEN_DESIGNS/CHANGELOG updates + plan archival.
- Expected patches: 1.

## Work packages

### Work package: WP1 -- reshape auction tests to behavior-only

- Owner: coder
- Touch points: `tests/playwright/auction_scene.spec.mjs` (rewrite in place to the safety net),
  `tests/playwright/game_flow.spec.mjs` (strip geometry/trade-log assertions; keep the
  reach-the-auction smoke).
- Depends on: none.
- Acceptance criteria: no assertion references `.auction-track-*`, `data-x`/`data-y` VALUES or
  ordering, or `.auction-screen-trade-log`; the safety net asserts, layout-agnostically: role
  buttons present and clickable at tick 0; after committing buyer and holding the raise key the
  HUMAN PARTICIPANT'S PAYLOAD PRICE rises -- read via the EXISTING named testing seam
  `window.muleGameState()` (installed by `src/ui/game_driver.ts`; the same projection
  `tests/e2e/walkthrough_helpers.mjs:398 readGameState` already polls, exposing
  `phase.payload.participants`), not pixel positions and not a new hook; a store trade
  increments `data-flash-count`; Continue advances past the good;
  `data-reduced-motion="true"` under emulated preference. Green against the CURRENT screen
  before merge.
- Verification commands: `npx playwright test tests/playwright/auction_scene.spec.mjs
  tests/playwright/game_flow.spec.mjs`.
- Obvious follow-ons: changelog entry; drop dead helper imports.

### Work package: WP2 -- auction geometry module

- Owner: coder
- Touch points: `src/ui/scenes/auction_geometry.ts` (new), `tests/test_auction_geometry.mjs`
  (new).
- Depends on: none.
- Acceptance criteria: exports viewBox 960x600 region rects (top band y 0-88; dock x 0-150; buy
  rail x 150-190; runway x 190-910 with lanes y 88-536; sell rail x 910-950; timer y 544-576),
  `laneCenterY(slot)` -> 144/256/368/480, `priceToX` (floor -> runway left edge, ceiling ->
  right edge, reusing `priceToTrackY` semantics), crate/usage-bar scale helpers, label clamp.
  Node tests pin endpoints against the exported region rects (not re-hardcoded numbers),
  monotonicity, and lane centers.
- Verification commands: repo node-test invocation for the new test; `npx tsc --noEmit`.
- Obvious follow-ons: changelog entry.

### Work package: WP-E -- engine round ledger + status payload

- Owner: expert_coder
- Touch points: `src/engine/economy.ts` / `src/engine/turn.ts` (record actual applied amounts at
  the existing seams: food consumption at the develop timer; energy usage, spoilage, production
  in `enterProduction`), `src/engine/game_state.ts` (ledger + `AuctionPayload.status` types),
  `src/engine/auction.ts` (`createAuctionPayload` assembles status from the ledger +
  `computeColonyStats`), `tests/test_auction_status_payload.mjs` (new),
  `docs/RULE_SOURCES.md` (note: observational field, NES STATUS-screen semantics).
- Depends on: none.
- Acceptance criteria: per-player, per-good `{previous, usage, spoilage, production, eventDelta,
  held}` recorded AS APPLIED at every goods-mutating seam (develop food consumption
  `turn.ts:432`; production/spoilage `turn.ts:591` + `economy.ts:410`; event grants
  `events.ts:214`; pest halving `events.ts:549`; plus a grep sweep for any other
  `goods:`-mutation site, each covered or explicitly noted as outside the round window). The
  reconciliation `previous - usage - spoilage + production + eventDelta = held` is asserted in
  the node test on a seeded played round THAT INCLUDES a goods-mutating event; colony verdict
  surplus/shortage for food/energy from `computeColonyStats`, ALWAYS null for smithore/crystite
  (user decision 2026-07-11); every existing payload field unchanged; existing engine suites'
  BEHAVIORAL expectations preserved -- minimal test maintenance (fixture/type updates for the
  new state field) is allowed, weakening or deleting a behavioral assertion is not; ledger
  resets each round.
- Verification commands: node engine test suite; `npx tsc --noEmit`.
- Obvious follow-ons: RULE_SOURCES note in the same patch; changelog entry.

### Work package: WP-FF -- sit-out fast-forward clock (factor by measurement)

- Owner: coder
- Touch points: `src/ui/scenes/scene_manager.ts`; a scratch `_temp` driver script for the
  experiment (deleted after).
- Depends on: none.
- Acceptance criteria: `auctionTickMs(payload)` returns `AUCTION_TICK_MS / FACTOR` only when
  `humanAuctionCommitted` and the human participant's role is `out`, else 500; both
  `scheduleAuction` compare sites use it; per-good commitment reset self-cancels the speedup;
  `?speed=` still multiplies on top; FAST state exported for the arena indicator. FACTOR is
  chosen by experiment, not assumption: drive one sat-out window at 3x, 6x, and 10x (seed 1234,
  scripted sit-out), record wall time to window close and whether AI trades still visibly
  register; pick the fastest factor whose window outcome remains identical to 1x (same trades,
  same closing price) and whose frames still show trades landing -- 6x is the prior, the
  measurement decides. Both observations are deterministic: (1) outcome equivalence -- the
  window's `trades` array and closing price are identical to the 1x run at the same seed; (2)
  feedback visibility -- every trade produces at least one observed `data-flash-count` increment
  before the next trade fires (polled via `window.muleGameState()` + the DOM counter, not
  eyeballed frames). Record the three measurements in the changelog entry.
- Verification commands: `npx tsc --noEmit`; tick-ownership playwright spec green; M1 safety-net
  spec green; the experiment table (factor, wall ms, outcome-identical y/n, all-trades-flashed
  y/n) in the changelog.
- Obvious follow-ons: changelog entry with the table; delete the scratch driver.

### Work package: WP3 -- shell rewrite + mount + CSS slots

- Owner: expert_coder
- Touch points: `src/ui/solid/auction_screen.tsx` (rewrite), `src/ui/solid/game_screen.tsx`
  (`game-panel-filled`, `game-hud-hidden`), `src/style.css` (delete old auction block; new slot
  rules + reserved per-lane comment blocks).
- Depends on: WP1.
- Acceptance criteria: `.auction-screen` flex-fills the panel slot HUD-to-bottom (with HUD
  hidden, effectively the whole stage); old arena transplanted as a temporary internal stub so
  every phase still plays; the four `data-action` selectors + `data-role` attributes render
  exactly as today at tick 0 / during / finished; `.auction-screen-button` class kept (shared
  focus-visible rule `style.css:915-917`); ArrowLeft/Right primary (right = raise, left =
  lower) with ArrowUp/Down aliases, tutorial-hint copy teaching the horizontal pair; component
  prop interfaces pinned.
- Verification commands: full walkthrough run for at least one seed/mode (committedGood deadlock
  gate); M1 safety-net spec; remaining playwright suite; `npx tsc --noEmit`.
- Obvious follow-ons: changelog; remove orphaned constants/CSS.

### Work package: WP-X1 -- composition mock + measurement (design proof before build)

- Owner: coder (mock) + playwright_operator (capture) + image_evaluator (measurement read)
- Touch points: a scratch mock page (`_temp` prefix or scratchpad; not committed) rendering the
  full 960x600 composition with STATIC dummy data (4 avatars at spread prices, rails, dashed
  lines, dock rows with realistic 4-digit money, going price, timer) inside the REAL
  `#game-stage` slot with the HUD hidden; screenshots at 1024x640 and 1280x800; measurement
  report `docs/active_plans/reports/auction_composition_mock_measurements.md`; final constant
  values handed off into `src/ui/scenes/auction_geometry.ts` + its node test (one small patch).
- Depends on: WP2.
- Acceptance criteria: the report records the runway share of stage area and the trailing dead
  band % ONCE, labeled as scale-invariant identities of the region constants (they read the same
  at every 16:10 viewport and prove the capture pipeline, not the design), and records the
  legibility measurements -- smallest dock text px height (must be >= 12px rendered), going-price
  legibility, and whether rails/dashed lines read at a glance -- at 1024x640, the BINDING viewport,
  where text is smallest; 1280x800 is captured as a sanity render only. Each failing measurement
  names the constant change made (dock 150->132, rails 40->28, band heights) and the mock is
  re-captured until all measurements pass; the passing constants are frozen into
  `auction_geometry.ts` before any M4 lane starts. Hypothesis being tested: the 150/40/720/40
  width budget and 88/448/56 height budget produce a dominant, legible runway -- the mock
  confirms or corrects it for the cost of one scratch page instead of three reworked lanes.
- Verification commands: capture run; report filed with all measurements passing; geometry node
  test green after handoff.
- Obvious follow-ons: changelog entry; delete the scratch mock.

### Work package: WP4 -- native arena SVG

- Owner: expert_coder
- Touch points: `src/ui/scenes/auction_arena.tsx` (new), small shell wiring.
- Depends on: WP2, WP3.
- Acceptance criteria: full-slot SVG renders top band (corner emblems, title, big going price =
  last trade else quote midpoint, ticks, FAST indicator), buy/sell crate rails at runway edges
  with quote labels and stock-scaled crates, 4 lane rows, vertical dashed best-bid/best-ask +
  rail lines spanning the lanes, timer bar draining with `ticksRemaining`; avatars tween on x
  via the ported loop (`data-x` moving, `data-y` lane), walk frames while moving, out players
  parked dimmed at their lane's dock edge; reduced-motion snap preserved (`data-reduced-motion`
  on the root, no CSS transitions on avatars); Planet-modern treatment (palette/materials
  consistent with the town facades), not NES pixel copy.
- Verification commands: `npx tsc --noEmit`; M1 safety-net spec; walkthrough_auction green.
- Obvious follow-ons: changelog; delete the temporary stub in this patch.

### Work package: WP5 -- player dock

- Owner: coder
- Touch points: `src/ui/scenes/auction_dock.tsx` (new).
- Depends on: WP2, WP3.
- Acceptance criteria: one dock block per lane row, vertically centered on `laneCenterY(slot)`:
  swatch + species head, role label, $money, units of the good, TRADED n (sum of
  `payload.trades` per playerId); MONEY/UNITS/TRADED header labels at dock top; store block;
  human-scoped polite live region announcing the human's money changes (replacing the hidden
  HUD's announcements).
- Verification commands: `npx tsc --noEmit`; M1 safety-net spec.
- Obvious follow-ons: changelog.

### Work package: WP6 -- status layer + declare/finished overlays

- Owner: coder
- Touch points: `src/ui/scenes/auction_status.tsx` (new), overlay parts of the shell.
- Depends on: WP2, WP3, WP-E.
- Acceptance criteria: at tick 0 the live arena is visible with the status layer over it --
  crate accounting on the rails, per-row usage bars fed by the RECORDED ledger (previous ->
  usage -> spoilage -> production -> held, animated as labeled steps), USAGE caption,
  SURPLUS/SHORTAGE stamp centered on the runway (absent when verdict is null) -- and the three
  role buttons rendered and clickable FROM THE FIRST FRAME beneath it (the committedGood
  deadlock guard); usage bars snap to final size under reduced motion; finished state shows a
  summary overlay + Continue on the still-visible arena; a skipped window shows an intentional
  skipped treatment with instant Continue.
- Verification commands: walkthrough_auction green (no deadlock); M1 safety-net spec;
  `npx tsc --noEmit`.
- Obvious follow-ons: changelog; tutorial-hint copy for the status beat.

### Work package: WP7 -- trade fx

- Owner: coder
- Touch points: `src/ui/scenes/auction_trade_fx.ts` (new), arena trade-layer wiring.
- Depends on: WP4.
- Acceptance criteria: flying goods glyph seller->buyer, flash at buyer, transient "UNITS TRADED
  n" banner over the runway fed by `runUnits`; monotonic `data-flash-count` kept; reduced motion
  = instant flash + banner, no travel; teardown clears timers/glyphs.
- Verification commands: M1 safety-net spec (flash-count assertion); `npx tsc --noEmit`.
- Obvious follow-ons: changelog.

### Work package: WP8a -- playwright specs for the new composition

- Owner: tester
- Standing (2026-07-11): **this suite is the trusted, auction-scoped release gate for this plan**
  (see "Acceptance criteria and gates"). It runs on its own command against deterministic seed
  1234 and does not depend on the full-game walkthrough, which is informational while suspended.
- Touch points: `tests/playwright/auction_scene.spec.mjs` (extend the safety net into the full
  new-composition spec), `tests/playwright/game_flow.spec.mjs` (restore one auction assertion).
- Depends on: WP4, WP5, WP6, WP7.
- Acceptance criteria: behavior-shaped assertions ONLY -- no pixel positions, no geometry
  constants echoed back (geometry correctness belongs to the node-tested geometry module plus the
  M6 automated visual gate). Assert: buyer holding ArrowRight moves `data-x` rightward; dock
  TRADED counter increments after the deterministic seed-1234 store trade; status layer + role
  buttons both present at tick 0; sit-out window payload-tick cadence measurably exceeds
  committed cadence; reduced-motion snap; HUD hidden during auction and restored after; skipped
  window shows its treatment and advances.
- Acceptance criteria, clock-hold invariant (added 2026-07-11): assert FROM THE UI SIDE that the
  auction clock does not advance until the human commits a role -- at tick 0 with no role
  committed, `payload.tick` stays 0 across several real frames; after committing a role, it
  advances. Read through the existing `window.muleGameState()` seam. Nothing asserts this today,
  and it is the invariant the entire deadlock class hangs off (`isAuctionTickable` /
  `humanAuctionCommitted`, `src/ui/scenes/scene_manager.ts`): if the engine ever stopped holding
  the clock, the declare beat would silently become skippable and the status/accounting beat
  could be raced past, and nothing would fail.
- Out of scope, failure diagnosis (added 2026-07-11): WP8a does NOT add test-only
  fault-injection hooks to the live app to reproduce failure branches in a browser. Both branches
  are already PROVEN at the helper level with a fake page + fake projection
  (`tests/test_walkthrough_auction.mjs`): a missing required control fails in about 6 s naming
  the exact selector and accusing the UI, and a click that lands while the clock never advances
  fails with the engine's own observed state (`"tick":0`, `"finished":false`) as evidence. They
  stay there. WP8a owns the POSITIVE real-browser contract instead: the required controls DO
  render, the clock DOES hold and then advance, the trade DOES register, the dock counters DO
  update. A regressed control fails a positive assertion, which is sufficient -- WP8a is a spec,
  not a diagnostic harness, and shipping test scaffolding into production paths buys nothing.
- Verification commands: `npx playwright test tests/playwright/auction_scene.spec.mjs
  tests/playwright/game_flow.spec.mjs`.
- Obvious follow-ons: changelog; spec header selector-contract comments updated.

### Work package: WP8b-fixture -- deterministic beat-capture driver

- Owner: playwright_operator
- Touch points: `tests/e2e/e2e_auction_beat_capture.mjs` (new, e2e_* naming per
  `docs/E2E_TESTS.md`), reusing `?seed=`/`?speed=` + the walkthrough helpers' projection reads
  and scripted gestures.
- Depends on: WP3 (selectors); dry run against the M4 tree.
- Acceptance criteria: one command walks seed 1234 to each beat and screenshots it at 1024x640
  and 1280x800 -- status/declare overlay at tick 0, live motion mid-window, trade feedback
  frame (captured within the banner's display window), sit-out fast-forward (FAST indicator
  visible), finished overlay, and a skipped window. The skipped-window source is produced by a
  seed-scan step inside the driver (iterate seeds 1..50 via the projection until a window with
  `skipped: true` is found in round 1-2, cache the seed in the script); if the scan finds none,
  the driver forces a synthetic skipped payload via the `replay_fixture.ts` pattern -- either
  way the beat is captured deterministically with no human. Exits non-zero if any beat fails to
  capture.
- Verification commands: run the driver; 7 beats x 2 viewports (1024x640, 1280x800) = 14 files
  exist, exit 0.
- Obvious follow-ons: changelog; document the driver in `docs/WALKTHROUGH_GUIDE.md` if that doc
  indexes e2e drivers.

### Work package: WP8b-acceptance -- automated visual acceptance

- Owner: image_evaluator (judge); tuning patches by coder; re-captures by playwright_operator
- Touch points: acceptance report under `docs/active_plans/reports/` (snake_case);
  `src/ui/scenes/auction_geometry.ts` + node test for any tuning.
- Depends on: WP7, WP8b-fixture.
- Acceptance criteria: image_evaluator judges the 14 frames against the written criteria, keeping
  the two criterion classes distinct. Geometry ratios (runway dominant; >= 90% stage-width
  coverage; trailing dead band <= 5% of stage height, beating the recorded 16.3%) are
  SCALE-INVARIANT identities of the frozen region constants: identical at both viewports, they
  verify the capture pipeline rather than proving the design, and a passing ratio is not evidence
  of a good composition. Legibility criteria (price story legible -- rails, dashed lines, going
  price readable; dock legible; every beat intentional; FUN_VIBES load-bearing rule applied) are
  the only class that can actually fail across viewports, and they are judged at 1024x640, the
  BINDING viewport, where text and glyphs are smallest; 1280x800 frames are a sanity render. A
  constant legible only at 1280x800 is a FAIL. The graphic-treatment
  oracle is evidence, not taste: the arena must (a) share the established modern-treatment
  anchors -- side-by-side comparison against the committed town/overworld screenshots
  (`docs/screenshots/town_interior.png`, `docs/screenshots/overworld_map.png`) for material
  language (flat shapes, soft shadows, worn-surface texture, no pixel dithering or 8-bit
  tile art), (b) draw only from the sprite palette that `tests/test_sprite_palette.mjs` already
  enforces for the sprite modules (the new arena chrome symbols land in the sprite modules and
  are covered by that same test), and (c) meet `docs/COLOR_CONTRAST_ACCESSIBILITY.md` contrast
  rules for all dock/going-price text. The report files per-beat verdicts and measured numbers.
  The PASS report is the gate; FAIL loops tuning patches + re-capture until PASS (after 3 FAIL
  loops on one criterion the manager reopens the owning M4 lane with the report as the work
  order). No human sign-off required for plan completion; the filed report and screenshots are
  what the human reviews afterward at leisure.
- Acceptance criteria, first-look defects (added 2026-07-11): the gate MUST additionally clear the
  seven required checks in
  [auction_first_look_findings.md](../reports/auction_first_look_findings.md), the manager's
  review of the first live capture. Three are DEFECTS the gate must confirm were fixed (the
  CROSSED label overlapping a lane occupant; the tutorial tooltip crowding the going price out of
  its dominance in the top band; the trade sparkle floating unanchored to seller or buyer -- a WP7
  input). Three are open questions the gate must RULE ON rather than inherit (is the sparse runway
  at convergence honest or misleading; is a sat-out player distinguishable from a floor-priced
  buyer at 1024x640, given only subtractive cues; does the crate stack's running-max scale need a
  payload-supplied reference maximum). One is a measurement obligation: dock text must be MEASURED
  at 1024x640, not taken from a report -- the previously reported 15px was a bounding-box height,
  and the true margin over the 12px floor is about 7%, not 25%.
- Verification commands: report present with all-beats PASS.
- Obvious follow-ons: tuning edits land with matching node-test updates; changelog.

### Work package: WP-D -- docs close-out

- Owner: planner
- Touch points: `docs/ROADMAP.md`, `docs/SCREEN_DESIGNS.md`, `docs/CHANGELOG.md`, plan archival
  (`git mv` to `docs/archive/`).
- Depends on: WP8b.
- Acceptance criteria: no doc still says the vertical-axis rebuild is pending; the 2026-07-11
  supersession and decision chain recorded; changelog close-out summary present.
- Verification commands: `pytest tests/test_markdown_links.py tests/test_ascii_compliance.py`.
- Obvious follow-ons: none (close-out).

## Acceptance criteria and gates

- **Trusted gate designation (2026-07-11): WP8a is the trusted, auction-scoped release gate for
  this plan.** It has its own command, a deterministic seed (1234), and no dependency on the
  full-game walkthrough, which stays INFORMATIONAL until it is separately rehabilitated (see
  [walkthrough_gate_suspension.md](../decisions/walkthrough_gate_suspension.md)). A separate
  auction-only walkthrough driver was proposed and REJECTED as duplication: the M1 safety net,
  WP8a, and the WP8b beat-capture driver already cover what it wanted. The auction rebuild gets a
  focused, trustworthy gate without a second overlapping harness.
- Per-patch gate: `npx tsc --noEmit` clean; touched-suite tests green (node tests for
  engine/geometry patches, targeted playwright for UI patches); changelog entry present;
  reviewer (subagent) audit before closure.
- Integration gate (end of M3, M4, M5): M1 behavior safety net green AND
  `tests/e2e/walkthrough_auction.mjs` green inside a full walkthrough run -- specifically
  proving role buttons at tick 0 (committedGood deadlock guard) and Continue on finish.
- Regression gate (M6): full sweep seeds {1,3,7} x modes {beginner,standard} 6/6 green -- the
  repo's release gate, restored before the plan closes.
- Visual gate (M6): the image_evaluator all-beats PASS report, with legibility judged at the
  binding 1024x640 viewport and the geometry ratios reported as scale-invariant sanity checks
  (see the 2026-07-11 viewport supersession in Context). Automated; the manager loops tuning until
  PASS. Human review of the filed report/screenshots is post-plan approval, never an execution
  blocker.

## Test and verification strategy

- Unit (node): geometry mapping (endpoints from exported rects, monotonicity, lane centers);
  ledger reconciliation on a played round (previous - usage - spoilage + production = held) and
  verdict cases (food/energy surplus+shortage, ores null); existing `test_auction_tween.mjs`
  unchanged. All follow `docs/PYTEST_STYLE.md` anti-brittleness rules (behavioral assertions, no
  constant echoes).
- Browser (playwright): behavior-shaped assertions only (payload-price direction under held
  keys, counter increments, overlay presence, reduced-motion snap, HUD hidden, fast-forward
  cadence, skipped-window treatment, and the clock-hold invariant -- `payload.tick` stays 0 until
  the human commits a role). No pixel-position assertions; geometry correctness is owned by the
  node-tested geometry module plus the automated visual gate. The WP8a suite is the trusted,
  auction-scoped release gate for this plan; it asserts the positive real-browser contract and
  adds no fault-injection hooks to the live app (see WP8a and "Acceptance criteria and gates").
- E2E (walkthrough): SUSPENDED as a gate on 2026-07-11 pending the WP-H audit (see
  [walkthrough_gate_suspension.md](../decisions/walkthrough_gate_suspension.md)); it still runs at
  M3, M4, M5, and M6 for information, and a red run is worth diagnosing, but a green run no longer
  closes a milestone. The `data-action` selectors and `data-role` attributes remain the harness's
  compatibility contract. "Tick-0 role buttons" is expressly NOT a requirement: it was the old
  screen's `mode()` internals encoded as a law, and the new screen is free to present the role
  choice however it likes so long as the player can choose a role and the auction can proceed.
- Visual (automated): the WP8b beat-capture fixture forces every beat deterministically
  (seed 1234 + scripted gestures; sit-out for the fast-forward frame; a known skipped window --
  seed chosen by inspection, e.g. an early-round crystite window on standard) and the
  image_evaluator judges each frame against written criteria. Evidence, not opinion: the report
  lists per-beat verdicts with the measured coverage numbers.
- Failure semantics: a red safety net blocks that milestone from closing; a FAIL visual report
  blocks M6; visual FAIL loops WP8b tuning patches without reopening M4 lanes unless the report
  names a structural defect (then the manager reopens the named lane with the report as the work
  order). A red walkthrough run or red sweep no longer blocks a milestone by itself while the
  harness is suspended -- diagnose it, and decide whether it is a product defect or a harness
  defect on the evidence.

## Migration and compatibility policy

- Additive rollout: the ledger and `AuctionPayload.status` are additive; every existing consumer
  keeps working. The scene-clock fast-forward defaults to current cadence whenever its condition
  is false.
- Backward compatibility: the walkthrough harness selector contract is preserved verbatim; it is
  the only external UI contract. Playwright geometry assertions are explicitly NOT compatible
  and are reshaped first (M1).
- Legacy deletion criteria: the transplanted arena stub dies in WP4's patch; the old
  `.auction-*` CSS block, `sidelineSpot` concept, and trade-log markup are gone by end of M4
  (grep for dead selectors is part of WP4/WP6 review).
- Rollback strategy: every milestone leaves the game playable with the safety net green, so
  recovery is reverting that milestone's patches.

## Risk register

| Risk | Impact | Trigger | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| committedGood deadlock: a role button the driver cannot find hangs the run to the 4000-tick cap and is misreported as an engine stall | Wasted runs, misdirected diagnosis | Harness discards its required-click result (D1/D2, now under WP-H repair) | WP-H harness owner | Fixed in the HARNESS, not the product: the required click fails fast and names the UI. This was previously mitigated by requiring the new UI to keep buttons at tick 0 -- that was bending the design around a broken test and is withdrawn; the new screen owes only "the player can choose a role and the auction proceeds" (see [walkthrough_gate_suspension.md](../decisions/walkthrough_gate_suspension.md)) |
| Behavioral coverage gap between test reshaping and new specs | Regressions land unseen | Old spec deleted without replacement | WS-tests coder | WP1 lands the safety net IN THE SAME PATCH as the strip, green against the current screen |
| Ledger recording misses a seam (event-driven goods changes mid-round) | Status beat shows numbers that do not reconcile | Recording only at develop/production seams | WS-ledger expert_coder | Node test asserts reconciliation on a played round WITH events (seeded run); unreconciled delta fails the test |
| HUD hide kills money aria-live announcements | A11y regression | `display: none` on #game-hud | WS-dock coder | Dock carries a human-scoped polite live region; WP8a asserts it exists |
| Dock + rails eat runway width (230/960 chrome) | Cramped price story | Visual report reads tight | WS-visual | Compression order fixed: rails 40->28, dock 150->132, runway never shrinks |
| Shared-file collisions on shell/CSS during M4 | Merge churn | Two lanes editing style.css/shell | WS-shell owner | Reserved per-lane CSS comment blocks; component files are lane-disjoint; shell edits only via WP3 owner |
| Fast-forward breaks tick-ownership invariant or sweep timing | Flaky release gate | New cadence path in scene_manager | WS-clock coder | Same single scheduler dispatches; tick-ownership spec verified; sweep runs at every milestone gate |
| Skipped-window seed scan (1..50) finds none | Skipped beat uncaptured | Scan exhausts its range | WS-capture | The driver's built-in fallback forces a synthetic `skipped: true` payload via the replay-fixture pattern -- specified inside WP8b-fixture, no human needed |
| WP-X1 mock invalidates the width/height budget | M4 lanes would build on wrong constants | Measurement fails a criterion | WS-mock | That is the spike working as intended: constants corrected and re-measured BEFORE M4 dispatch; M4 entry waits on the frozen constants |
| Visual gate loops without converging | M6 stalls | Repeated FAIL on the same criterion | manager | After 3 FAIL loops on one criterion, the manager reopens the owning M4 lane with the report as the work order (structural, not tuning) |
| ROADMAP/docs drift (old vertical-axis target quoted later) | Future agent rebuilds the wrong thing | WP-D slips | planner | WP-D is its own milestone (M7) with a link/ascii pytest gate |

## Rollout and release checklist

- [x] M1: safety net green against the current screen; old geometry assertions gone.
- [x] M2: geometry + ledger + fast-forward merged; node suites green.
- [x] M3: shell/mount merged; safety net green (walkthrough_auction runs for information only --
      suspended as a gate, so it does not close this milestone).
- [x] M4: arena/dock/status merged; stub + old CSS deleted; gates green.
- [x] M5: trade fx merged; gates green.
- [x] M6: new specs green; all-beats visual PASS report filed (the full sweep is run and its
      result reported, but it is suspended as a gate and does not close M6). The gate ran twice:
      FAIL, then PASS after the fix pass -- see
      [auction_visual_acceptance.md](../reports/auction_visual_acceptance.md) and
      [auction_visual_acceptance_final.md](../reports/auction_visual_acceptance_final.md).
- [ ] M7: docs close-out merged; markdown-link + ascii pytest gates green. IN PROGRESS -- the only
      milestone still open. See the execution-status table below for what remains.
- [ ] Post-plan (outside execution): human reviews the filed report/screenshots and runs the
      final `git commit` per repo policy (agents stage + changelog only). Plan archival
      (`git mv` this file to `docs/archive/`) is the last step of that commit.

## Documentation close-out requirements

- Active plan / progress tracker: this plan is copied to
  `docs/active_plans/active/auction_native_recompose.md` at execution start; per-WP status
  tracked there; moved to `docs/archive/` via `git mv` at close (M7).
- docs/CHANGELOG.md entry: per-patch entries during execution ("Patch N: [component] [intent]"),
  plus an M7 close-out summary recording the composition decision chain (2026-07-10 rejection ->
  2026-07-11 native-recompose directive) and the session decisions (scrap authorization, sit-out
  fast-forward, HUD hide, verdict mapping, control priority).
- Archive / closure notes: WP8b report stays under `docs/active_plans/reports/`;
  `docs/ROADMAP.md` and `docs/SCREEN_DESIGNS.md` updated per WP-D.

## Patch plan and reporting format

One patch per work package, labeled "[component] [intent]" in reports and changelog (for example
"Patch 3: [engine] round ledger recording + AuctionPayload.status"). Patch order follows the
dispatch waves above; WP-X1's constant freeze and WP8b-acceptance tuning are their own small
patches. Patch N: tests, migration, docs (WP-D close-out).

## Resolved decisions

All decisions resolved by the user on 2026-07-11 (this session); no open questions remain:

- References split: NES = layout/interaction/information-hierarchy; Planet M.U.L.E. = graphic
  treatment (the town's established modern look).
- Five-beat NES sequence canonical, usage presented inside the status beat (matching both the
  NES order and this engine's pre-auction usage application).
- Verdict mapping: food/energy from `computeColonyStats` supply-vs-need; smithore and crystite
  ALWAYS neutral (no stamp).
- Sit-out fast-forward: 6x as the user-approved prior, final factor confirmed by the WP-FF
  3x/6x/10x measurement (fastest factor with identical window outcome and visible trades);
  FAST indicator always shown.
- Dock side: LEFT ("who you are | cheap wall | price runway | expensive wall").
- Controls: ArrowLeft/Right primary and taught (right = raise, left = lower, matching motion);
  ArrowUp/Down kept as compatibility aliases.
- Scrap-and-replace authorization for all existing auction UI code; engine rules untouched.
- No human gates: every milestone completable by manager + subagents; automated visual
  acceptance via fixture capture + image_evaluator report; human review is post-plan approval.
- Design authority: remaining visual-style choices (palette, spacing, exact ratios, indicator
  treatment) are made by implementers in service of one elegant, cohesive composition, judged by
  the automated visual gate -- implementers do not stop to ask style questions.

## Execution status

Per-work-package tracker; the manager keeps this table current as waves land.

Status as of 2026-07-11, verified against the working tree (not against dispatch records): every
work package through M6 has landed. M7 (docs close-out, WP-D) is the only milestone still open.

| Work package | Milestone | Status | Evidence in the tree |
| --- | --- | --- | --- |
| WP1 | M1 | complete 2026-07-11 | `tests/playwright/auction_scene.spec.mjs` reshaped to behavior-only assertions |
| WP2 | M2 | complete 2026-07-11 | `src/ui/scenes/auction_geometry.ts` + `tests/test_auction_geometry.mjs` |
| WP-E | M2 | complete 2026-07-11 | `GameState.roundLedger` + `AuctionPayload.status` (`game_state.ts`, `turn.ts`, `auction.ts`); `tests/test_auction_status_payload.mjs`, `tests/test_goods_write_sites.mjs` |
| WP-FF | M2 | complete 2026-07-11 | `auctionTickMs` + `AUCTION_SIT_OUT_FACTOR` in `scene_manager.ts`; 1x/3x/6x/10x experiment table recorded in the changelog and `docs/RULE_SOURCES.md` |
| WP3 | M3 | complete 2026-07-11 | `src/ui/solid/auction_screen.tsx` rewritten; `src/ui/scenes/auction_props.ts` pins the lane prop interfaces; slot/HUD-hide CSS in `src/style.css` |
| WP-X1 | M3 | complete 2026-07-11 | measurement report `../reports/auction_composition_mock_measurements.md`; verdict folded into the frozen `auction_geometry.ts` constants |
| WP4 | M4 | complete 2026-07-11 | `src/ui/scenes/auction_arena.tsx` (temporary stub deleted) |
| WP5 | M4 | complete 2026-07-11 | `src/ui/scenes/auction_dock.tsx` |
| WP6 | M4 | complete 2026-07-11 | `src/ui/scenes/auction_status.tsx` (status + declare overlay) |
| WP7 | M5 | complete 2026-07-11 | `src/ui/scenes/auction_trade_fx.ts` |
| WP8b-fixture | M5 | complete 2026-07-11 | `tests/e2e/e2e_auction_beat_capture.mjs`; 14 PNGs (7 beats x 2 viewports) to `output_smoke/auction_beats/` |
| WP8a | M6 | complete 2026-07-11 | `tests/playwright/auction_scene.spec.mjs` (the trusted auction-scoped gate); `game_flow.spec.mjs` auction assertion restored |
| WP8b-acceptance | M6 | complete 2026-07-11 | gate ran twice: `../reports/auction_visual_acceptance.md` FAIL (labels drawn where occupants do not stand), then `../reports/auction_visual_acceptance_final.md` PASS after the fix pass |
| WP-D | M7 | in progress 2026-07-11 | `docs/ROADMAP.md` supersession and `docs/SCREEN_DESIGNS.md` rebuild note landed; the remaining doc close-out (TODO supersession, FILE_STRUCTURE/E2E_TESTS driver entries, RULE_SOURCES sit-out constant, CODE_ARCHITECTURE ledger cross-reference, changelog summary) is the open work |

Remaining to close the plan:

- M7 / WP-D: finish the docs close-out above and keep the markdown-link + ascii pytest gates green.
- Plan archival: `git mv` this file to `docs/archive/` -- the FINAL step, done at commit time by the
  human, not by an agent mid-execution.
