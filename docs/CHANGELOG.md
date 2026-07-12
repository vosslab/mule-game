# CHANGELOG.md

## 2026-07-11

### Additions and New Features

- Auction rebuild (Patch: [geometry] auction geometry module): added
  `src/ui/scenes/auction_geometry.ts`, the pure single-source-of-truth
  geometry module for the full-stage 16:10 goods-auction recompose (viewBox
  960x600). Exports the region rects (top band, dock, buy rail, runway,
  sell rail, timer), `laneCenterY(slot)` (144/256/368/480 for the four fixed
  lane rows), `priceToX` (floor maps to the runway's left edge, ceiling to
  its right edge, reusing `auction_tween.ts`'s `priceToTrackY` band-fraction
  math rather than duplicating it), and crate-stack, usage-bar, and
  label-clamp scale helpers whose constants (`MAX_RAIL_CRATES`,
  `USAGE_BAR_MAX_WIDTH`) are named exports so a later mock-measurement pass
  can retune them in one place. `tests/test_auction_geometry.mjs` (16 cases)
  pins region endpoints against the exported rects, monotonicity of
  `priceToX`, and lane centers.
- Auction rebuild (Patch: [engine] round ledger recording +
  `AuctionPayload.status`): added the engine's observational round ledger and
  exposed it as `AuctionPayload.status`, the data behind the auction's new
  pre-auction status/accounting beat (NES STATUS-screen semantics). `GameState`
  gains `roundLedger` (per player, per good: `previous`, `usage`, `spoilage`,
  `production`, `eventDelta`), reset when each round's develop phase is entered
  and WRITTEN AS APPLIED at every seam that moves a player's goods: develop-turn
  food consumption and the personal event's net goods delta (`beginDevelopTurn`),
  and production yield, per-mule energy drawn, spoilage lost, and the
  space-pirates crystite inventory wipe (`enterProduction`, around the
  `applySpoilage` call). `createAuctionPayload` assembles `status` from the
  ledger plus `computeColonyStats`. Recorded rather than reconstructed on
  purpose: recomputing usage from the rule constants would still print plausible
  numbers after a short-food clamp or an event and could silently disagree with
  what the player just lived through, so the round is observed at the seams
  instead. The books balance exactly --
  `previous - usage - spoilage + production + eventDelta = held` -- and a future
  seam that forgets to record breaks that identity loudly instead of reporting a
  believable wrong number. Ledger boundary: `held` is read live at each good's
  window creation, and no trades category is needed because each good is
  auctioned exactly once per round, so no earlier window can have traded the good
  on the block. Colony verdict is surplus/shortage for food and energy (need read
  one round ahead, the horizon the auction's own role assignment already uses) and
  always null for smithore and crystite (user decision 2026-07-11). Purely
  additive and rule-free: no band, role, price step, match, skip condition, or
  transfer rate changed, and every existing payload field is untouched. See
  `docs/RULE_SOURCES.md`, "Auction status beat: recorded round ledger".
- Auction rebuild (Patch: [WP-X1] composition mock + measurement): filed
  `docs/active_plans/reports/auction_composition_mock_measurements.md`, the
  M3 design-proof measurement pass for the full-stage auction composition. A
  scratch static mock (region rects copied from `auction_geometry.ts`, static
  dummy data, real `#game-stage` CSS) was screenshotted at 1600x900 and
  1200x1000 and measured via `getBoundingClientRect()`: runway share 56.00%
  of stage area (target ~56%), trailing dead band 4.00% of stage height
  (target <=5%, beating the old design's recorded 16.3%), smallest dock text
  16.00px rendered at 1200x1000 (target >=12px), going price 58-69px
  rendered, rails/dashed lines legible at a glance at both viewports. All
  measurements passed on the first capture, so `auction_geometry.ts`'s
  constants are frozen as-is for M4 -- no geometry patch was needed. The
  scratch mock page and capture script were deleted after the report was
  filed.
- Auction rebuild (Patch: [shell] auction shell rewrite + mount seam + CSS
  slots): rewrote `src/ui/solid/auction_screen.tsx` as a shell -- beat
  sequencing (declare at tick 0, live, finished), the reduced-motion signal,
  keyboard intent, the DOM overlays, and the walkthrough selector contract --
  and gave the auction the whole 16:10 stage. The old screen was a portrait DOM
  column (header, price readout, 480x260 arena capped at 37cqh, trade log,
  stacked intent buttons) parked in a shrink-to-fit `#game-panel` under an empty
  `#game-map`; measured at the declare beat, the new screen covers 100% of
  `#game-stage` on both axes with a 0% trailing dead band at both supported
  viewports (1280x800 nominal, 1024x640 minimum), against the old design's
  recorded 16.3% dead band. The mount seam
  (`src/ui/solid/game_screen.tsx`'s new `phaseOwnsFullStage`) mirrors the proven
  `game-map-filled` idiom one row down: `game-hud-hidden` on `#game-hud` and
  `game-panel-filled` on `#game-panel`, plus a sibling-combinator rule that
  collapses the empty `#game-map` row (and its 16px margin) with the HUD. The
  arena SVG's 960x600 viewBox is 16:10, the stage's own ratio, so it fills the
  freed box with no letterbox on either axis. ArrowRight now raises the price and
  ArrowLeft lowers it -- the axis the avatars actually walk -- with ArrowUp/Down
  kept as aliases and the tutorial hint teaching the horizontal pair. The keyboard
  listener moved up to the shell and stays bound for the whole window rather than
  only while the clock runs: `set_auction_intent` merely records the participant's
  intent, so a key held down through the opening role choice now carries into the
  window instead of being dropped on the beat change (it also removes a real race
  in the safety-net spec, which pressed the raise key immediately after
  committing). Deleted outright: the price readout, the standing trade log, the
  `sidelineSpot` concept, and the whole `.auction-track-*` / `.auction-price-*`
  CSS block. `src/ui/scenes/auction_props.ts` (new) pins the three prop contracts
  the M4 lanes implement (arena, dock, status) as types only, so no lane imports a
  sibling component and none can create a cycle; `src/style.css` carries one
  reserved, clearly-labeled comment block per lane (arena/dock/status/trade-fx) so
  three concurrent lanes never collide in the stylesheet. The old arena is
  transplanted into the shell as a clearly-marked temporary stub (re-framed into
  the geometry module's regions, with flat rects standing in for the backdrop and
  store-band symbols, which carry their own aspect ratio and letterboxed in the
  new frame) so the game stays playable at every commit; WP4 deletes it. Gate
  evidence: the M1 behavior safety net and `game_flow` are green against the
  rewrite (9 passed), the walkthrough sweep is 6/6 PASS with
  `matrixCoverageSatisfied: true`, and a seed-1 standard walkthrough plays a full
  12-round game with 3 trades -- the committedGood deadlock guard, which fails by
  hanging to a 4000-tick cap rather than erroring, held across every window. The
  guard was also proved directly at the DOM level: `elementFromPoint` at the role
  button's center returns the button itself, so nothing (not the declare overlay,
  not the pointer-events-none tutorial hint) can intercept the harness click.
- Auction rebuild (Patch: [shell] container-unit sizing for the auction's DOM
  overlays): every size in the auction slot -- overlay padding, gaps, radii,
  border, and all overlay text -- is now a container unit (cqh/cqw against
  `#game-stage`'s size-query box) rather than a rem or a fixed px. Inside the
  960x600 viewBox the SVG scales by one uniform factor with the stage, so its
  geometry is scale-invariant, but that uniformity stops at the DOM overlays: a
  rem font holds its absolute size while the stage shrinks, so it eats a larger
  fraction of the frame at the 1024x640 minimum than at the 1280x800 nominal,
  which is how an overlay that looks right on a big screen crowds a small one.
  Measured: the declare overlay now occupies 22.7% x 17.5% of the stage at
  1024x640 and 22.9% x 17.1% at 1280x800 (the same composition at both), and its
  text scales exactly with the stage (title 14.7px -> 18.4px, buttons
  12.8px -> 16px). The only fixed-px values left are the buttons' touch-target
  min-height/min-width, which are FLOORS, not caps: at 1280x800 the cqh padding
  wins and the button scales to 50px; at 1024x640 the 44px floor binds and holds
  the accessible minimum instead of shrinking below it. The shared tutorial-hint
  rule (rem text, `max-width: 480px`) is re-sized in container units scoped to
  `.auction-screen` rather than edited out from under the four other phases that
  use it. No width-based media query or container-query threshold was added;
  there are still none anywhere in `src/style.css`.
- Auction rebuild (Patch: [WP-FF] sit-out fast-forward clock): added
  `auctionTickMs(payload)` to `src/ui/scenes/scene_manager.ts` -- the auction
  tick cadence divides by `AUCTION_SIT_OUT_FACTOR` only while the human has
  committed to a good and their role is "out", else the normal 500ms cadence,
  so a human who declares Sit Out no longer spectates the remaining AI-only
  ticks in real time. The per-good commitment reset already in
  `scheduleAuction` self-cancels the speedup the moment a new good's auction
  begins uncommitted, and `?speed=` still multiplies the scaled real-time
  budget on top, so the two speed-ups compose. A new `isAuctionFastForward()`
  export tracks whether the speedup is currently active, for a later
  package's arena FAST indicator. FACTOR was chosen by experiment, not
  assumption: a scratch Playwright driver (`_temp_ff_experiment.mjs`, deleted
  after) drove one scripted sit-out window at seed 1234 through 1x/3x/6x/10x
  builds of the constant, at true in-game pace (no `?speed=` test multiplier,
  since that would compound with the factor and understate real visibility).
  All four factors produced an identical `trades` array and closing price to
  the 1x baseline, and every trade's `data-flash-count` DOM increment was
  observed (polled via `window.muleGameState()` plus the flash-count
  attribute) before the next trade fired, so 10x -- the fastest factor tested
  -- was chosen over the prior 6x guess:

  | factor | wall ms to window close | outcome identical to 1x | all trades flashed |
  | ------ | ----------------------- | ----------------------- | ------------------ |
  | 1      | 25503                   | y                       | y                  |
  | 3      | 8491                    | y                       | y                  |
  | 6      | 4251                    | y                       | y                  |
  | 10     | 2544                    | y                       | y                  |

  Touch points stayed inside `scene_manager.ts`'s one goods-auction tick
  compare site (`scheduleAuction`); the land-auction schedule
  (`scheduleLandAuction`) has no per-good human-commitment concept and was
  left untouched, since `auctionTickMs`'s formula reads `AuctionPayload`
  participant roles that the land-auction payload does not carry.
- Auction rebuild (Patch: [WP5] player dock): added `src/ui/scenes/auction_dock.tsx`,
  the left-column dock composed into the arena's `<svg>` (`DOCK_REGION`,
  `auction_geometry.ts`). One lane row per player, vertically centered on
  `laneCenterY(slot)` so a row's numbers line up with that player's avatar:
  a colored badge (swatch chip + tinted species-head icon), a role label
  (Buy/Sell/Out), and three right-aligned numeric columns ($money, units held
  of the good under auction, and units traded this window, summed from
  `payload.trades`). A thin left-edge accent bar in the player's identity
  color spans the full lane height, the strongest available "this whole row
  is yours" cue. One-time $/Qty/Trd column headers sit above the lanes, and a
  compact store row (gold swatch, "Store" label, a TRADED count summed from
  trades where `AUCTION_STORE_ID` was either party) sits above that -- the
  store's live stock and buy/sell quotes are NOT shown here: `AuctionDockProps`
  carries no such field (that data renders on the arena's rails, WP4's
  territory), so the row shows only what `trades()` can prove rather than
  fabricating a number. The human player's money text carries a scoped
  `aria-live="polite"` region (off for the three AI rows), replacing the
  hidden HUD's own money announcements. Every size is a plain viewBox-unit
  number, not a `cqh`/`cqw` container unit: the dock lives INSIDE the arena's
  already-uniformly-scaled `<svg viewBox="0 0 960 600">`, so a number here
  scales with the stage identically to the SVG's own geometry, matching the
  established `.town-facade-label` precedent rather than the DOM-overlay `cqh`
  convention. Measured via a scratch mock (`_temp_wp5_*`, deleted after) built
  with esbuild + esbuild-plugin-solid into a private `dist_wp5_scratch/` dir,
  rendering the dock alone inside the real `#game-stage` CSS with a
  deliberately worst-case player (`$9999`, the widest practical money value):
  at the binding 1024x640 minimum, the smallest rendered dock text measures
  15px tall (role label "Buy") and the `$9999` money text measures 50.0px
  wide, entirely inside the 160px-wide dock panel with no overflow on either
  edge; at 1280x800 the smallest text is 18px and `$9999` measures 62.6px
  wide inside a 200px panel. Both clear the 12px legibility floor with
  comfortable margin. One real bug the mock's own screenshot caught before
  landing: an uppercase `text-transform` on the header labels widened
  "Qty"/"Trd" enough that the three headers visually ran together as
  "$QTYTRD" at both viewports; removed in favor of the labels' own mixed
  case, which reads with clear gaps.
- Auction rebuild (Patch: [WP6] status layer + declare/finished overlays):
  added `src/ui/scenes/auction_status.tsx`, the pre-auction accounting beat
  (NES STATUS-screen semantics) that renders inside `DeclareOverlay`'s
  reserved slot (`src/ui/solid/auction_screen.tsx`) at tick 0, over the live
  arena. One row per player (`AuctionStatus.accounting`, read verbatim from
  the engine's recorded round ledger, never recomputed): a color swatch, a
  "You"/"P2"/"P3"/"P4" label, a "Had N -> Now N" headline, and a labeled
  step bar (usage/spoilage/production, plus an event segment only when
  `eventDelta` is nonzero) with a numeric chip for every step that actually
  moved. A SURPLUS/SHORTAGE stamp renders only when `status.verdict` is
  non-null (always absent for smithore/crystite, per the user's verdict
  mapping decision). Under `prefers-reduced-motion`, the layer's own
  `data-reduced-motion` attribute gates a CSS rule off, so bar segments
  render at their final width with no animation; otherwise each step grows
  from zero with a staggered `animation-delay` so the row reads as a
  sequence (usage, then spoilage, then production, then any event) rather
  than a single jump. `DeclareOverlay` gained one new prop
  (`reducedMotion: () => boolean`) purely to thread this flag down to the
  status layer; its beat sequencing, keyboard handling, and selector
  contract are untouched.

  Deliberately placed IN-FLOW, not as an absolute overlay: the status layer
  sits between the overlay's title and its "Choose your side" hint, ABOVE
  the three role buttons in both reading order and DOM stacking order,
  inside the same centered card the buttons already render in
  (`.auction-declare-overlay`). This was the explicit fix for the
  deadlock risk named in the plan's risk register: an absolutely-positioned
  status layer could cover the role buttons the scene clock holds tick 0
  open for, silently deadlocking the walkthrough sweep to its 4000-tick cap.
  Verified directly rather than assumed: at 1024x640 (the binding minimum
  viewport), `document.elementFromPoint()` at the center of each of the
  three role buttons returns the button itself (`hitIsButton: true` for
  `buyer`, `seller`, and `out`), both on a good with no verdict stamp
  (smithore) and on one with a stamp present (food, "Surplus") -- the
  overlay card's bounding box (top 217px, bottom 589px at the 640px-tall
  viewport) never overflows the stage even with the stamp's extra height.
  The same check passes at 1280x800. `bash run_playwright_tests.sh
  tests/playwright/auction_scene.spec.mjs tests/playwright/game_flow.spec.mjs`
  stayed green (9/9) throughout, including the tick-0 role-button-clickable
  assertion that is this beat's fast fail signal.

  Every CSS rule lives inside the `RESERVED: auction status layer (WP6)`
  block in `src/style.css`, sized entirely in `cqh`/`cqw` container units
  (no fixed px/rem), matching the auction overlay's existing convention
  (this layer is a DOM overlay outside the arena's SVG viewBox, unlike
  WP5's dock which renders inside the SVG and uses raw viewBox units
  instead). Text holds at 1.9cqh for row/caption/chip text and 2.2cqh for
  the verdict stamp, both above the 12px floor at the 1024x640 minimum:
  measured rendered sizes were 12.16px (row/chip text) and 14.08px (verdict
  stamp) at 1024x640, and 15.20px at 1280x800 -- no measured text fell
  below the floor. Verified via a private esbuild+solid bundle served
  outside the shared `dist/` (a concurrent lane's own build had already
  overwritten `dist/` mid-session), driven with Playwright at both
  viewports and under `reducedMotion: "reduce"`; a first pass without a
  private build silently tested a stale bundle and looked like the
  component was not rendering at all, caught by adding a temporary
  `console.log` probe before removing it again. Skipped windows are
  unaffected by this patch: a skipped good's `beat()` resolves straight to
  `"finished"` (unchanged shell logic), so `DeclareOverlay` -- and this
  status layer inside it -- never mounts for one; only the pre-existing
  `FinishedOverlay` (untouched by this patch) renders its "No {good} to
  trade this round." treatment.
- Auction rebuild (Patch: [WP4] native arena SVG): added
  `src/ui/scenes/auction_arena.tsx`, the full-stage market floor the whole
  auction rebuild was for, and DELETED the temporary arena stub (and its
  `.auction-stub-*` CSS) that had kept the game playable since the shell
  rewrite. The composition teaches supply and demand with geometry rather than
  text: price runs cheap-left to expensive-right across a full-width runway,
  each player owns a horizontal lane row, the store's buy/sell rails bound the
  runway at each end, and a labeled price ruler makes "position IS price"
  readable instead of merely claimed. The rails are not decorative: the engine
  seats the store as a standing bid at `storeBuyPrice` (the band floor, so the
  LEFT rail) and as a standing ask at `storeSellPrice` whenever it holds stock
  (the ceiling, so the RIGHT rail), so a buyer walking right until they touch
  the sell rail has literally crossed the store's ask -- buying from the store
  IS your bid reaching the rail. Both rails carry the SAME crate stack drawn
  from `storeStock`, because there is one store warehouse: it drains as the
  store sells and refills as players sell into it, making the supply side a
  physical quantity. Also lands the top band (good emblem/title, the outsized
  going price = last trade else quote midpoint, tick readout), the FAST
  indicator wired to `isAuctionFastForward()`, the draining timer bar, and the
  ported rAF tween loop (avatars ease along x, walk frames while moving,
  reduced-motion snaps). The arena COMPOSES the player dock (WP5) inside its own
  `<svg>` at `DOCK_REGION`, which is how the dock reaches the screen at all --
  it shipped as an SVG `<g>` that nothing rendered. Since `AuctionArenaProps`
  carries only payload + reducedMotion and an `AuctionParticipant` has neither
  money nor units held, the arena's own prop interface extends the frozen
  contract with a `players` accessor it does not read itself but hands to the
  dock; `auction_props.ts` was left untouched.
- Auction rebuild (Patch: [WP4] the bid/ask lines cannot be told apart by
  drawing them differently): the two dashed best-bid/best-ask lines merge into
  one at a tight market, and the fix is NOT a thinner stroke, a dash phase, or a
  color change. A measurement spike had reported the strokes overlapping at a
  1-price-step gap (`AUCTION_PRICE_STEP_BY_GOOD` is 1 for food, energy, and
  smithore; one step is ~1.8 viewBox units against a 2-unit stroke) and noted it
  is scale-invariant -- SVG `stroke-width` is in viewBox USER UNITS, so a bigger
  monitor magnifies the gap and the stroke together and no viewport ever fixes
  it. The real bound is worse: the engine trades when `bid.price >= ask.price`
  (`selectTrade`), so at the instant of EVERY trade the best bid and best ask sit
  at the SAME price and the two lines are EXACTLY COINCIDENT. Zero gap. Overlap
  is therefore not an edge case to mitigate but the GUARANTEED state at the most
  dramatic moment in the auction, and no per-line styling can survive it. The
  arena instead CHANGES REPRESENTATION as the gap closes: the lines keep
  rendering at their true x (they tell the truth, including that they have
  converged), while the BID/ASK label PENNANTS are held a guaranteed minimum
  distance apart around the market midpoint and tethered back to their lines by
  leaders, so which-side-is-which and at-what-price stay readable at any gap
  including zero; inside 2 price steps the pair is promoted into an explicit
  crossing marker (a band floored at a minimum width, captioned CLOSING and then
  CROSSED). Measured on the real component at a forced 400-wide band, at BOTH
  supported viewports: at a 1-step gap the painted LINES are 1.92px apart at
  1024x640 (2.40px at 1280x800) and at a cross they are 0.000px apart -- while
  the pennants hold 51.2px / 64.0px of clear air and print BID $210 against ASK
  $211 (and BID $210 against ASK $210 at the cross). The first measured attempt
  FAILED at 14.9px: the minimum separation had been set on the pennant CENTERS
  (92 units) while the plates themselves were 78 units wide, leaving a 14-unit
  slit. The constant is now derived from the plate width rather than guessed --
  the clear gap is `2 * halfSeparation - PENNANT_WIDTH` -- which is precisely why
  the separation is measured in a browser instead of asserted on paper. A second
  render-only defect died the same way: the rails' rotated quote and caption
  shared one translate x, and under `rotate(-90)` that x is the perpendicular
  offset, so they printed on top of each other ("$1RORE BUYS") until a screenshot
  showed it.
- Auction (WP7, trade fx): extracted the arena's imperative trade-animation
  helpers into `src/ui/scenes/auction_trade_fx.ts` (`attachTradeFx`) and added
  the "UNITS TRADED n" banner the NES reference uses in place of a standing
  trade log, fed live by `AuctionPayload.runUnits`. Placement is the runway's
  exact center on both axes, which lands in the fixed vertical gutter between
  lane rows 1 and 2 that no avatar's own bounding box ever reaches, so the
  banner never fights an avatar for the same pixels; the flash already draws
  the eye there, so the banner reinforces the same focal point. The gold-plate
  treatment reuses the top band's going-price color rather than inventing a
  third accent. Reduced motion creates the flash and the banner INSTANTLY
  (only the CSS entrance-pop keyframes are gated, matching the interim rules'
  idiom) and skips the flying glyph outright; verified in a real emulated-
  preference browser run that both appear the same frame `data-flash-count`
  increments and that no `.auction-trade-goods` glyph is ever created.
  Teardown clears every flash/banner timer and removes any live nodes;
  verified against a real in-app unmount (the arena sits under
  `<Show when={payload().good} keyed>`, so advancing to the next good disposes
  it) rather than a page navigation, confirming zero orphaned fx nodes survive
  the remount and zero page errors fire across a wait spanning every fx
  timer's duration. `data-flash-count` stays the same monotonic external
  contract `tests/playwright/auction_scene.spec.mjs` and the release-gate
  walkthrough poll.
- Auction rebuild (WP8b-fixture, deterministic beat-capture driver): added
  `tests/e2e/e2e_auction_beat_capture.mjs`, the M6 visual-gate evidence
  driver. One command walks seed 1234 (beginner mode) through two page
  sessions -- speed=8 for the buyer-role beats plus the already-skipped
  crystite window, speed=2 for the sit-out fast-forward beat, chosen because
  `?speed=` COMPOUNDS with the in-game sit-out factor (10x) and speed=8 would
  have driven the sit-out tick cadence down to ~6.25ms, too fast to reliably
  screenshot before the window closed -- and captures all seven named beats
  (status/accounting, declare, live motion, trade feedback, sit-out
  fast-forward, finished, skipped window) at both supported viewports
  (1024x640 binding, 1280x800 nominal), 14 PNGs total, written to
  `output_smoke/auction_beats/` and exiting non-zero if any beat fails to
  capture. The skipped-window beat needed no synthetic fixture: a one-off
  Node scan against the engine reducer directly (reusing the same all-AI
  decision functions `tests/e2e/e2e_balance_sim.mjs` already drives) found
  crystite's round-1 window pre-skipped at every one of seeds 1-50 in both
  modes (round-1 crystite structurally cannot have traded before any plot has
  mined it), confirming the already-fixed seed 1234 carries the same
  property rather than introducing a second seed. One real defect surfaced
  during verification: the driver's first output directory choice,
  `test-results/auction_beats/`, collided with Playwright's own default
  `outputDir` (unset in `playwright.config.ts`), which other concurrent
  lanes' `npx playwright test` runs wipe at the start of every invocation --
  a run's 14 files were observed reduced to 1 survivor between two
  back-to-back driver runs before the directory was moved to
  `output_smoke/auction_beats/` (matching `e2e_balance_sim.mjs`'s existing
  convention), after which repeated runs reliably produced all 14 files. A
  second observation folded into the driver's own header comment: WP7's
  "UNITS TRADED n" banner landed mid-task, so the beat-4 capture trigger
  (the `data-flash-count` increment) now genuinely lands with the real
  banner in frame rather than the flash-only proxy the driver was first
  built against.
- Auction rebuild (Patch: [WP-dock] dock column semantic hooks): added
  `data-col="money"|"units"|"traded"` to every numeric `<text>` in
  `src/ui/scenes/auction_dock.tsx` (each lane row, the header row, and the
  store row), replacing an unaddressable render-order-only column with a
  named contract. Money, units-held, and units-traded shared the same
  `.auction-dock-data-text` CSS class with nothing distinguishing which
  value was which, so `tests/playwright/auction_scene.spec.mjs` could only
  reach the store's TRADED figure (the one row of its kind) and had refused,
  correctly, to write a DOM-index selector for a per-lane column -- leaving
  the intended "the human's own TRADED counter incremented" assertion
  untested. The existing `.auction-dock-row[data-player=N]` per-lane hook
  combines with the new `data-col` to address a value by player and column
  together; the spec's store-trade test now also asserts the human's
  (player 0) lane TRADED value via `.auction-dock-row[data-player="0"]
  [data-col="traded"]`, keeping the store-row assertion alongside it.
  Attribute-only change: no geometry, class, or rendered layout moved.

### Fixes and Maintenance

- HUD: `#game-hud` is now sized in container units (cqh/cqw against `#game-stage`'s
  size-query box) instead of rem/px, which fixes the root cause the scoring-panel
  entry below only worked around. The HUD row was a fixed 96px at every viewport,
  so its SHARE of the stage grew as the stage shrank: 12.0% of the 800px nominal
  stage but 15.0% of the 640px minimum one. Together with `#game-map`'s fixed 16px
  margin row (also converted, to 2cqh) that was 112px of non-scaling chrome --
  14.0% at 1280x800 but 17.5% at 1024x640 -- which space-clamped the proportional
  content below it at the minimum viewport first. `.hud`'s padding (1.5cqh) plus
  `.hud-player`'s `min-height` (9cqh) now sum to exactly 12cqh, measured at 12.00%
  of the stage at 1024x640, 1280x800, 1600x900, and 1200x1000 alike; total chrome
  is a constant 14.00% at all four. 1280x800 renders byte-identical to before
  (96px HUD, 16px map margin), so the nominal target is unchanged and only the
  smaller stages gain room. HUD text is `max(2.1cqh, 12px)`: 16.8px at 1280x800
  and 13.4px at 1024x640, above the 12px legibility floor. Every px term in the
  HUD is a FLOOR (`max()`), never a cap -- a floor can only make a row or its text
  bigger than proportional, so it cannot clamp the composition the way the fixed
  values it replaced did; none of them bind at a supported viewport.
  `.overworld-timer`'s `top` and `height` move to the same unit (2cqh / 1cqh) so
  the bar keeps sitting exactly inside the map's reserve rather than overhanging a
  shorter stage's smaller one. With the chrome proportional, `.scoring-panel`'s
  82cqh stopgap is retired and its `min-height` returns to 84cqh: the bottom margin
  is now a constant 2cqh (12.8px at 1024x640, up from 0.4px at 84cqh before; 16px
  at 1280x800), and the panel's own `min-height` still binds at both (intrinsic
  content is 467.9px against a 537.6px min-height at the minimum viewport), so the
  margin is real headroom rather than a rounding artifact. No `@media` breakpoint
  or container-query threshold was added; one rule holds at every viewport.
- Scoring screen: the final-score panel was 0.4px from being silently clipped at
  the 1024x640 minimum viewport. `.scoring-panel`'s `min-height` drops from 84cqh
  to 82cqh, restoring the bottom margin to 3.2px at 1024x640 and 32px at 1280x800
  (it was 0.4px and 16px). `#game-stage` is `overflow: hidden`, so a vanishing
  margin does not fail loudly -- it eats the Play Again button. Found while
  correcting three `src/style.css` comments that still cited the superseded
  1600x900 / 1200x1000 viewports as design rationale: the 84cqh value had been
  tuned for an 8px margin at a 1200x1000 gate viewport that no longer exists. The
  underlying cause is recorded in the rule's comment and is deliberately NOT fixed
  here: `#game-hud` is 96px tall at BOTH viewports (its text is rem-sized, so it
  does not scale with the stage) and `#game-map` adds a fixed 16px margin row --
  together 14% of an 800px stage but 17.5% of a 640px one. The panel's share is
  proportional and theirs is not, so the column runs out of room at the minimum
  viewport first and the panel is space-clamped there; two whole cqh points of
  panel height bought only 2.8px of margin, which is the tell that the panel is
  not the real constraint. Sizing the HUD in container units is the durable fix,
  filed as follow-up because the HUD is a shared surface every phase renders. The
  other two comments were corrected without a rule change: `.land-auction-panel`'s
  `min(92cqw, 1400px)` cap does not bind at either supported viewport (92cqw is
  1177px at 1280x800 and 942px at 1024x640, both under the cap), and `min()` takes
  the smaller term, so a px cap can only bite on a stage LARGER than the supported
  range -- it cannot starve the 1024x640 minimum. At the small viewport the hazard
  runs the other way, through fixed-px text and minimums, which is exactly the
  scoring defect above.
- Testing: reshaped the goods-auction Playwright coverage
  (`tests/playwright/auction_scene.spec.mjs`, rewritten in place;
  `tests/playwright/game_flow.spec.mjs`) to a behavior-only safety net ahead of
  the auction screen's full-stage 16:10 rebuild. No assertion depends on
  `.auction-track-*` geometry, `data-x`/`data-y` values or ordering, or
  `.auction-screen-trade-log` any more; instead the specs read the human
  participant's payload price and phase/good through the same
  `window.muleGameState()` seam `tests/e2e/walkthrough_helpers.mjs`'s
  `readGameState` already polls (installed by `src/ui/game_driver.ts`), so the
  coverage survives the rebuild. The current raise key (`ArrowUp`) is now a
  single named `RAISE_KEY` constant in `auction_scene.spec.mjs`, since a later
  milestone is expected to add `ArrowRight` as an equivalent gesture. Found
  while writing the "Continue advances past the finished good" case: the
  finished panel's `Continue` button is visible for only a brief real-time
  pause (`AUCTION_FINISHED_PAUSE_MS` scaled by `?speed=`, ~187ms at
  `speed=8`) before the game auto-advances on its own, too narrow for
  Playwright's assertion-layer polling backoff to catch reliably; the fix
  drives that case through the Sit Out role (its `AUCTION_SIT_OUT_FACTOR`
  fast-forward reaches "finished" in a bounded few seconds instead of racing a
  possible 25-second AI-only run) and detects the transient state with
  `page.waitForFunction(..., { polling: "raf" })` instead of a web-first
  `expect`.
- Testing: fixed a walker-harness gesture bug and two stale
  E2E scripts surfaced by the sweep re-triage. The post-panel walk-back
  (`walkBackToStreet`, `tests/e2e/walkthrough_helpers.mjs`) overshot the street
  lane past the next door's open radius; a new converging
  `walkTownAvatarToStreetLaneY` seeks the lane with the same gap-proportional,
  self-correcting logic the horizontal approach already used. `e2e_mini_flow`
  and `e2e_full_game` (`tests/e2e/`) were updated off the earlier
  overworld-start turn assumption to the corral-spawn town-first start. The dead
  `walkTownAvatarToDoor` helper and its four tests were deleted. The
  environmental (non-town) parallel-load flake in
  `tests/playwright/corral_purchase.spec.mjs` was filed to
  [docs/TODO.md](TODO.md) rather than masked.
- Testing (WP-H): fixed the walkthrough goods-auction driver's silent-noop
  defect: the human seat's REQUIRED role-commit click (`tests/e2e/walkthrough_auction.mjs`)
  used the "safe to miss" `clickIfPresent` helper, discarded its return value,
  and then unconditionally recorded the good as committed regardless of
  whether the click actually happened. Since the engine holds the auction
  clock at tick 0 until the human commits a role (`isAuctionTickable`,
  `src/ui/scenes/scene_manager.ts`), a missing role control let the clock sit
  stalled for the whole `MAX_TICKS_PER_AUCTION` ceiling (about 8 minutes)
  before reporting a misleading `auction_stalled` whose own comment blamed "a
  stuck engine (a bug elsewhere)". The driver also hard-coded the old
  screen's `mode()` switch internals as a law ("the UI cannot express a
  mid-window role change"), the exact bad-requirement class the user flagged.
  Added a new REQUIRED-click helper, `clickRequired`
  (`tests/e2e/walkthrough_helpers.mjs`), alongside the existing optional
  `clickIfPresent`: a missing/unclickable required control now fails within
  about a second via a new closed failure kind, `required_control_missing`
  (`tests/e2e/walkthrough_report.mjs`), naming the missing selector and
  stating plainly that the UI never presented the control -- not that the
  engine stalled. The commit's effect (the clock actually leaving tick 0, or
  the window finishing outright) is separately verified via the existing
  `actAndWaitProgress` primitive; a click that lands but never unblocks the
  clock fails via `act_did_not_advance` with a message naming the engine's
  tick gate as the suspect instead, so the two causes are distinguishable. A
  later-tick "adapter wants a different role" request is now a genuinely
  neutral, best-effort `clickIfPresent` call with no assumption baked in
  about why a control might be absent. Audited every other
  `tests/e2e/walkthrough_*.mjs` call site: `clickIfPresent` was used only in
  this one driver; every required click elsewhere (`walkthrough_land.mjs`'s
  land-grant-pass and land-bid, the develop-end-turn click) already used
  Playwright's own asserting `page.click()` wrapped in `actAndWaitProgress`,
  so no other driver needed the same fix. `e2e_walkthrough.mjs`'s deprecated
  `--passive` fallback path and the separate `e2e_full_game.mjs` harness use
  a similar `.catch(() => undefined)` swallow on their own required clicks,
  but neither is a `walkthrough_*.mjs` file and both stay bounded by the
  60s `phase_timeout` rather than the 8-minute `auction_stalled` ceiling this
  fix targets; filed as a follow-up rather than fixed here (out of this
  work package's file ownership). Verified against a disposable `git
worktree` at HEAD (the auction UI was being rewritten concurrently in the
  working tree): a full active-mode run (seed 3, beginner) passed clean with
  real trades clearing through the new commit path, and a deliberately
  broken role selector reproduced the exact defect class and failed in about
  6 seconds with a `required_control_missing` message naming the missing
  selector, instead of the old ~8-minute misdiagnosed stall. Correction: the
  "audited every other call site" claim above was incomplete -- a later audit
  found a third instance of this same defect shape in
  `tests/e2e/walkthrough_overworld.mjs`'s `maybeTruncateTurn`, which did an
  unverified `page.click()` followed by an unconditional `return true` (no
  `clickRequired`, no `actAndWaitProgress` verification). It has since been
  fixed to use `clickRequired` plus `actAndWaitProgress`, with negative-test
  coverage added in `tests/test_walkthrough_overworld.mjs`; three instances of
  the required-interaction-swallow pattern were found and fixed across the
  walkthrough harness, not two.
- Testing (WP-H2): closed two more instances of the swallow-shaped "check
  visibility, then separately click and discard the rejection" defect WP-H found
  in the goods-auction driver, this time in `e2e_walkthrough.mjs`'s deprecated
  `--passive` fallback path (`actForPhase`: land-grant-pass, auction-role[out],
  auction-continue) and the standalone legacy harness
  `tests/e2e/e2e_full_game.mjs` (`actForCurrentPhase`: land-grant-pass,
  develop-end-turn, sit-out). Both used a hand-rolled `isVisible` check followed
  by a separate `page.click().catch(() => undefined)`, the exact race-and-swallow
  shape `clickIfPresent` (`tests/e2e/walkthrough_helpers.mjs`) exists to close.
  Replaced both with direct `clickIfPresent` calls; `e2e_full_game.mjs` has no
  walk-report object of its own, so a small `CONSOLE_REPORT` shim
  (`{ log: (level, message, extra) => console.error(...) }`) backs its
  warn-on-real-rejection log instead of discarding it. Also fixed a second,
  independent defect found in the same file during the same pass:
  `e2e_full_game.mjs`'s Sit Out click selected the role button by DOM array
  position (`roleButtons[2]`, "the third button"), with no assertion it actually
  picked the "out" role -- a selector that encodes button ORDER rather than the
  role contract, and would have silently clicked the wrong role the moment the
  (concurrently being rewritten) auction screen reordered its buttons. Replaced
  with the semantic `[data-action="auction-role"][data-role="out"]` selector
  every other driver already uses. Verified with a positive active-mode
  bootstrap, a full `--passive` run (seed 3, beginner; the run's own report log
  shows both phases hit "auction" twice, with land_grant/land_auction gestures
  all firing via the fixed clicks, and finished clean), and a single-cell
  `e2e_full_game.mjs` run, all against a disposable `git worktree` with a private
  `dist/` build per the shared-build hazard.
- Formatting: ran Prettier's write mode on `tests/e2e/walkthrough_auction.mjs`,
  `tests/e2e/walkthrough_helpers.mjs`, and `tests/test_goods_write_sites.mjs` to
  clear a repo-wide `format:check` failure. Each file changed by exactly one
  reflowed line (a return statement, an `await` call, and an arrow-function
  predicate) wrapped to fit the `printWidth: 100` rule in `.prettierrc`; two of
  the three reflows also picked up Prettier's default trailing comma on the
  newly multi-line literal/argument list. No logic, identifiers, or assertions
  changed.
- Docs/comments: corrected two comments left describing the walkthrough
  harness's retired silent-swallow behavior after the `required_control_missing`
  repair. `driveAuction`'s docstring
  (`tests/e2e/walkthrough_auction.mjs`) previously claimed both role-commit
  failure branches "return early without throwing"; only the
  `act_did_not_advance` branch (actAndWaitProgress's progress budget expiring)
  does that -- the `required_control_missing` branch (`clickRequired` finding
  a missing/unclickable control) throws uncaught and ends the run. The header
  comment in `src/ui/solid/auction_screen.tsx` previously warned that a broken
  selector "does not fail loudly, it DEADLOCKS the walkthrough sweep to its
  4000-tick cap"; that was the pre-repair behavior, and now a missing required
  control fails within about a second, naming the exact selector. Comment-only
  changes; no executable line in either file was touched.
- Lint config: `eslint.config.js`'s ignore list only listed `dist/**`,
  `node_modules/**`, and `OTHER_REPOS/**`, contradicting
  `docs/CLAUDE_HOOK_USAGE_GUIDE.md`'s documented scratch convention ("Write
  scratch code to `_temp.py` or `_temp.sh` -- underscore prefix = safe to
  delete"): any agent that followed that convention with a browser-context
  `.mjs` driver (full of `window`/`document` references) or a private scratch
  build directory (e.g. `dist_wp5_scratch/`, used instead of the shared
  `dist/` to avoid concurrent-build clobbering) got `./check_codebase.sh`'s
  lint step failed by their own compliant scratch files. Added `_temp*`,
  `**/_temp*`, and `dist_*/**` to the ignore list so scratch and private
  build output are exempt from source lint rules without being deleted, and
  added `dist_*/` to `.gitignore` so the same scratch build dirs do not show
  as untracked noise. Verified the ignore is not over-broad: with a scratch
  `_temp_wp6_verify.mjs` and `dist_wp5_scratch/bundle.js` present on disk,
  `./check_codebase.sh` passed all five steps, `npx eslint --debug` on both
  scratch paths reported "File ignored because of a matching ignore
  pattern," and the same debug run on `src/ui/scenes/auction_geometry.ts`
  showed it was actually linted ("Linting code for ...auction_geometry.ts")
  with no ignore warning.
- Testing: `playwright.config.ts` did not set `outputDir`, so Playwright
  defaulted to `test-results/` -- the same root every other tool's
  artifacts were parked under, and Playwright CLEARS its outputDir at the
  start of every run. This already caused a real loss: an end-to-end
  capture driver (`tests/e2e/e2e_auction_beat_capture.mjs`) wrote 14
  screenshots to `test-results/auction_beats/`, a concurrent
  `npx playwright test` run started, and 13 of the 14 files were silently
  deleted mid-session. Set `outputDir: "test-results/playwright"` so
  Playwright only ever clears its own subtree; `.gitignore`'s existing
  `test-results/` rule already covers the new subdirectory, so no ignore
  change was needed. Updated the stale root-cause comment in
  `e2e_auction_beat_capture.mjs` (it still deliberately writes to
  `output_smoke/auction_beats/` instead, as defense in depth) and added a
  "Where to write artifacts" section to `docs/E2E_TESTS.md` documenting the
  convention: durable artifacts go under `output_smoke/` or a tool-owned
  subdirectory (e.g. `test-results/walker/`), never directly under the
  shared `test-results/` root. Verified with a marker file placed at
  `test-results/marker_proof_dir/marker.txt`: it survived a full
  `npx playwright test` run, and two pre-existing trace directories from a
  concurrent lane's test run at the `test-results/` root also survived.
- Docs: re-fixed two template-propagation regressions in `docs/E2E_TESTS.md`.
  A fresh propagation of the centrally-maintained file reintroduced (1) a
  "How to run" bullet telling readers to create `tests/e2e/run_all.sh`, a name
  this repo's own `tests/test_test_naming_conventions.py` rejects (its
  `check_shell_files_use_e2e_prefix` fails any `.sh` under `tests/e2e/` without
  the `e2e_` prefix), while the file that actually exists is
  `tests/e2e/e2e_run_all.sh`; and (2) the loss of the "Related docs" bullet
  linking to `docs/WALKTHROUGH_GUIDE.md`. Restored the correct runner name plus
  the explanation that the runner carries the `e2e_` prefix precisely so it does
  not violate the convention it lives alongside (that sentence was what a prior
  editor dropped, inviting the "simplify it back to `run_all.sh`" mistake), and
  restored the WALKTHROUGH_GUIDE.md bullet. Marked both with an HTML comment at
  the top of the file: these are local corrections and the durable fix is
  upstream in the template repo that ships `E2E_TESTS.md`, so the next
  propagation will clobber them again until the template itself is corrected.
- Testing: fixed a load-dependent flake in `tests/playwright/corral_purchase.spec.mjs`
  (two tests failing under full-suite load, passing in isolation). Root cause:
  `claimLandGrantPlotAt`'s helper polled the land-grant sweep cursor
  (`src/engine/land_grant.ts`'s `advanceSweepCursor`, which dwells on each
  board cell for only one land-grant tick, ~150ms real at this spec's
  `speed=2`) via `expect.poll(async () => page.evaluate(...))`, a Node-side
  loop that round-trips through Node's event loop and the CDP channel on
  every sample. Under full-suite CPU contention that round trip can exceed
  the ~150ms dwell window, so the poll misses every pass of the target cell
  for the full 20s timeout even though the cursor is advancing on schedule
  the whole time (confirmed with a temporary diagnostic: the realized
  sampling interval grew from ~25ms early in an unloaded run to over 1000ms
  late in a loaded run). Replaced the poll with `page.waitForFunction`,
  whose predicate runs natively inside the page on `requestAnimationFrame`
  (the same thread the game's own scene loop runs on), so the sample rate
  tracks the page's actual JS throughput instead of a separately-throttled
  Node round trip. Verified with 4 consecutive full-suite runs (101/101
  passing each time) under the same load that reproduced the original
  2-test failure twice before the fix.
- Auction rebuild (Patch: [arena] avatar-tween investigation + corrected bid/ask
  comments): investigated a reported defect in
  `src/ui/scenes/auction_arena.tsx` -- that `<For each={payload().participants}>`
  keys by object identity while the engine rebuilds the payload immutably every
  tick, so every avatar `<g>` would remount, `onMount`'s `registerAvatar` would
  snap `avatarX` onto the new target, and the rAF tween would be defeated
  (avatars teleporting to their price rather than walking the runway). REFUTED
  with evidence, and NO code change was made to the rendering: sampling every
  avatar's `data-x` once per animation frame in a real browser (seed 1234,
  `speed=2`, 250ms ticks, human buyer holding the raise key) shows a smooth ramp,
  not a staircase -- ~15 distinct `data-x` values inside each single tick
  (player 0: 203.1, 204.5, 205.6, 206.5 ... 209.6, then 213.5, 216.8, 219.4 ...),
  with zero avatar `<g>` node replacements and zero `.auction-avatar` childList
  mutations across 180 frames. The seam the report missed is
  `src/ui/game_store.ts`'s `setState(reconcile(next))`: `reconcile` diffs the new
  snapshot INTO the live store instead of swapping it in, and because
  `AuctionParticipant` carries no `id` field Solid's keyless path matches the four
  entries positionally and writes only the changed properties, so the store
  proxies `<For>` keys on survive the tick even though the engine's own objects do
  not. Confirmed directly in a real Solid renderer driving the app's own store and
  engine: participants array identity and `participants[0]` identity preserved on
  every one of 5 ticks, the row's captured item stayed live (51, 52, 53, 54, 55),
  4 row mounts total. Method note: an earlier bare-`createRoot` Node harness
  reported the opposite and was WRONG -- outside a renderer Solid never flushes
  `createEffect`, so its identity and rebuild readings were meaningless; the
  browser is the only valid oracle for this question. Separately CORRECTED the
  file's header comment, which asserted that at the instant of every trade the
  best bid and best ask are exactly coincident (zero gap). They are not: the
  engine trades on `bid.price >= ask.price` and steps every participant in the
  same tick before matching, so the gap is bounded by `(-2 * priceStep, 0]`.
  Against the store it IS exactly zero (a player's price clamps onto the band
  edge, which is the store's quote: measured smithore $85/$85, crystite
  $188/$188), but a player-vs-player cross OVERSHOOTS and can invert the lines
  (measured crystite bid $120 vs ask $116; smithore $68 vs $67), and
  `resolveTrade` never rewinds the overshot prices. Also corrected the stale claim
  that one price step is 1.8 viewBox units: `STORE_SELL_SPREAD_BY_GOOD` is a
  constant 35x each good's `AUCTION_PRICE_STEP_BY_GOOD`, so the band is always 35
  steps wide and one step is always 720/35 = 20.6 viewBox units, for every good,
  at every stock level. The shipped crossing mechanism was already correct
  (`bandWidth` uses `Math.abs`, `gapSteps` normalizes by `priceStep`), so only the
  prose changed.
- Auction rebuild (Patch: latent poll flake in the auction gate): fixed
  `tests/playwright/auction_scene.spec.mjs`'s "a store trade increments the
  human's dock TRADED counter" and "reduced motion shows the trade flash and
  banner instantly, with no flying goods glyph" tests, both of which watched
  a TRANSIENT condition (seed 1234's store trade lands in a live window under
  ~400ms before the dock's TRADED figure resets on the next good, and the
  trade-fx flash burst / banner remove themselves on wall-clock timers of
  320ms / 900ms, independent of game speed) via Node-side `expect.poll` or
  `expect(locator).toBeVisible()`. ROOT CAUSE: a Node-side poll or web-first
  assertion round-trips through Node's event loop and the CDP channel on
  every sample, and this suite has measured that round trip degrading from
  ~25ms to over 1000ms under full-suite parallel-worker load -- coarse enough
  to miss a sub-second transient window entirely (the same failure mode
  diagnosed and fixed earlier today in `tests/playwright/corral_purchase.spec.mjs`,
  which had presented as an intermittent 20s timeout the original author
  attributed to a fluke). Fixed by moving both waits into the page via
  `page.waitForFunction`/an in-page `requestAnimationFrame` sampler (matching
  the six other in-page waits already in this file) and, for the trade-flash
  test, capturing burst/banner/goods-glyph state atomically in the same
  in-page frame that observes the trade rather than re-querying the DOM from
  Node afterward. The TRADED-counter fix also adds an engine-vs-render
  diagnostic on timeout (reads the payload's own trade log to say whether the
  trade never happened versus never rendered). Audited the rest of the file
  against the rule (poll from Node only for latching conditions; use
  in-page waits for transient ones): every other Node-side wait in this file
  targets a latching condition and was left unchanged. Verified with the
  spec file alone, `check_codebase.sh`, and three consecutive full-suite
  `npx playwright test` runs (107/107 passed each time).
- Sprites: fixed stale comments in `src/ui/sprites/sprites_arena.ts` that
  still named the deleted `.auction-track-*` CSS classes and the deleted
  `src/ui/auction_screen.ts` (the old portrait DOM-column driver, replaced
  by `src/ui/scenes/auction_arena.tsx`'s full-stage SVG). Rewrote them to
  describe the sprites as they are actually consumed today: only
  `trade-flash` is `<use>`d anywhere (by `src/ui/scenes/auction_trade_fx.ts`,
  styled via `.auction-trade-flash-burst`); `backdrop`, `axis-bar`,
  `axis-tick`, and `store-band` are still built into the shared `<defs>`
  markup but nothing currently references their symbol ids. Comment-only
  change, no executable line touched.
- Auction arena: fixed the six defects that failed the M6 visual-acceptance
  gate ([docs/active_plans/reports/auction_visual_acceptance.md](active_plans/reports/auction_visual_acceptance.md)),
  which were one defect class -- labels drawn where avatars provably stand.
  The worst was a LIE: a sat-out player was labeled with a bid he did not
  have, because the BID pennant sat in lane 0's avatar band and printed a
  price over a benched player's head. Sat-out players now carry positive cues
  (an opaque bench plate and an OUT chip at full opacity, 2.31:1 -> 14.87:1)
  instead of only subtractive ones, and no price-bearing label lands on them.
  Root fix for the class: `auction_geometry.ts` gained derived
  `laneOccupantBand` / `labelGutterBand` helpers -- an avatar's extent includes
  the tag above its head, and the bands between lanes are the only y no avatar
  can reach at any price. The CROSSED caption, the BID/ASK pennants, the
  UNITS TRADED banner, the CHEAP/EXPENSIVE wall labels, and the new rail stock
  number all derive their y from a gutter instead of a hand-tuned constant; a
  node test asserts no gutter intersects any lane band. Also: `separateLabelPair`
  slides the BID/ASK pennants as a unit so they no longer stack 73.9% on top of
  each other when the market clears on a band edge (now 0.0%, 51.2px clear);
  the trade flash was anchored correctly but flung off-screen by a CSS
  `transform-box: fill-box` scale on a `<use>` positioned by x/y (measured 309px
  off the buyer, and clean off a 1024px stage at x=1199) -- the pop is now driven
  from a `translate(cx,cy) scale(s)` attribute in the existing advance() loop
  (now 12.7px from the buyer, on-stage); the resource glyphs finally paint their
  palette fill, since `RESOURCE_ICON_FILLS` had zero consumers and every rail
  crate and flying good was rendering as a black silhouette at 1.42:1 (now
  5.8-11.2:1); the crate stack scales against the window's OPENING stock rather
  than a running maximum that raised itself whenever players sold into the
  store, and each rail prints the raw stock integer so the stack cannot lie; and
  the tutorial hint moved from a corner-pinned overlay (which hid the good's
  title, crowded the going price, and cut the dock's column header in half at
  1280x800) into the declare card, shortened from 44 words to one line, leaving
  with the card on the first commit. Contrast fixes, all sampled from rendered
  pixels rather than declared CSS: intent legend 1.43:1 -> 14.87:1 (own opaque
  plate; it was the only instruction for the primary taught control), OUT chip
  2.31:1 -> 14.87:1 (the dim now applies to the sprite alone, not the whole
  group), UNITS TRADED banner 2.97:1 -> 11.2:1 (the entrance pop no longer fades
  opacity, so ink contrast stopped depending on what the plate floated over),
  CHEAP/EXPENSIVE 5.00:1 -> 6.37:1 (house target). Verified by re-running the
  beat-capture driver and re-measuring at the binding 1024x640 viewport with the
  report's own instruments: **zero** label-vs-avatar collisions across the
  declare, trade, finished, and sit-out beats. Composition untouched.
- Auction rebuild (Patch: skipped-window arena suppression + opaque overlay
  scrim): fixed the last instance of the sat-out-lie defect class flagged by
  the M6 acceptance gate (`docs/active_plans/reports/
  auction_visual_acceptance_final.md`, beat 7, "PASS, weakly"). A skipped
  window (round-1 crystite: nothing mined yet, so `tradePossible()` is false)
  still auto-assigns every participant a buyer/seller role and a band-edge
  price -- role assignment runs before the skip check in
  `createAuctionPayload` -- so the arena kept drawing four avatars with live
  price tags and a BID pennant under the "NO CRYSTITE TO TRADE THIS ROUND."
  overlay, reading as a paused live auction rather than an intentionally
  empty market. `auction_arena.tsx` now gates the avatar `<For>`, the
  bid/ask `PriceMarkers` (lines, pennants, crossing band), and the draining
  `TimerBar` behind `!payload.skipped` -- the engine's own flag, never
  inferred from prices or stock -- while the store rails' real stock and
  quotes, the runway's price gridlines, and the Continue affordance are
  untouched. Also fixed: `.auction-overlay`'s scrim was `rgba(26, 26, 46,
  0.92)`, translucent enough that the price ruler's gold gridline labels
  measurably read through both the declare and finished overlays (the M6
  report's beat 6 finding); it is now a solid `#1a1a2e`, matching
  `.auction-arena-backdrop`'s own fill. Verified by re-running
  `node --import tsx tests/e2e/e2e_auction_beat_capture.mjs` and inspecting
  the fresh frames at both supported viewports: beat 7 shows no avatars, no
  price tags, no BID/ASK pennant, and no timer bar, and beats 6 and 7 both
  show a clean, uniform overlay plate with nothing ghosting through. No new
  geometry helper was needed, since the fix reads the existing `payload.
  skipped` field rather than adding new geometry; `tests/playwright/
  auction_scene.spec.mjs`'s skipped-window test and all 29
  `tests/test_auction_geometry.mjs` cases stayed green unchanged.

- UI: closed the last two instances of the goods auction's
  "screen asserts something untrue" defect class, plus the two loose ends the M6
  gate report left ([docs/active_plans/reports/auction_visual_acceptance_final.md](active_plans/reports/auction_visual_acceptance_final.md)).
  (1) The dock's ROLE column printed `Buy`/`Sell` on a SKIPPED window, derived
  from the same engine-fabricated roles (assigned before the skip check runs)
  that the arena already refuses to draw avatars and bid/ask markers from; it
  now reads `--` when `payload.skipped` is set, while money and units-held stay
  live, because a player's cash and holdings are true whether or not the good
  trades. (2) The two store rails were NOT MIRRORED: reading outward from the
  runway, the buy rail ran caption-then-quote but the sell rail ran
  quote-then-caption, so the sell rail's LIVE quote was the innermost element
  and sat in the strip where avatars provably stand -- measured 96.4% covered by
  an avatar on the status and declare beats at both viewports. Both rails' text
  columns are now derived from one outward-facing helper, `railTextColumn` in
  `src/ui/scenes/auction_geometry.ts`, so the static caption is innermost on
  BOTH rails (its occlusion is the case the gate report explicitly accepted) and
  no live price can be placed where a sprite can reach it. Re-measured at
  1024x640 with `getBoundingClientRect`: the sell quote `$85` goes from 96.4%
  covered to 0% (box moves from 968.7-990.7 to 993.2-1015.2), and the caption it
  swapped places with takes 42.1% coverage instead. (3) The rotated rail caption
  rendered at 11.73px, the only text on the screen under the project's 12px
  RENDERED floor and under it by accident: raised to 12 viewBox units, which
  renders 12.80px at the binding 1024x640 stage (1024/960 scale), matching the
  margin the dock's smallest text already carries. Its font size now lives in
  `auction_geometry.ts` with the column math that is computed FROM it (and was
  removed from `src/style.css`, where a declaration would silently win over the
  presentation attribute and slide the columns back into each other). (4)
  Rewrote `tests/test_auction_geometry.mjs`'s `laneCenterY` case, which echoed
  the derived constants `144, 256, 368, 480` back as expected values -- a
  legitimate region retune (which the geometry module's header explicitly
  invites) would have failed it for a reason unrelated to `laneCenterY`; it now
  asserts the behavior (equal lane spacing, ordered, half a row inside each
  runway edge) and six new cases pin the rail mirror. Verified: `npx tsc
  --noEmit` clean, `check_codebase.sh` 5/5 (570 node tests), 11/11 in
  `tests/playwright/auction_scene.spec.mjs`, 35/35 in
  `tests/test_auction_geometry.mjs`, and all 14 beat frames re-captured.
- CSS audit follow-up (auction rebuild): wrapped eleven DOM-overlay
  `font-size` declarations in `src/style.css` (`.auction-overlay-title`,
  `.auction-overlay-hint`, `.auction-screen-button`, `.auction-intent-legend`,
  `.auction-screen .tutorial-hint-text`, `.auction-screen
  .tutorial-hint-dismiss`, `.auction-status-caption`,
  `.auction-status-row-label`, `.auction-status-row-headline`,
  `.auction-status-chip`, `.auction-status-verdict`) as
  `max(Ncqh, 12px)`, matching `.hud-player`'s existing idiom. Before the
  change these rules were legible at both supported viewports only because
  their bare `cqh` coefficients happened to clear the project's 12px
  RENDERED floor -- six of the eleven cleared it by just 1.3% at the binding
  1024x640 viewport, with no guard if a future coefficient retune shrank
  them further. The `max()` floor makes legibility a structural property of
  the rule instead of an arithmetic coincidence that a later edit could
  silently break; the cqh term still wins at both supported viewports today,
  so no rendered size changed (confirmed via the beat-capture frames). Also
  corrected `.auction-fast-text`'s contrast comment from a stale "10.4:1" to
  the correct "11.1:1" for `#2a2000` on `#ffd23f` (recomputed via
  `docs/COLOR_CONTRAST_ACCESSIBILITY.md`'s formula; identical to
  `.auction-trade-banner-text`'s same color pair) -- a wrong figure in a
  comment is worse than none, since a later audit would otherwise cite it as
  evidence.
- Auction (elegance pass): three changes to the goods auction, each asking
  whether an element earns its place and whether it sits where it does the most
  good. (1) The BID/ASK pennants moved OUT of the runway into a new PENNANT BAND
  across its head (`PENNANT_BAND_REGION`, with the four lane rows now derived
  from a `LANE_FIELD_REGION` that is the runway less that band). They sat in a
  label gutter between two lane rows: collision-free, but only because a y-band
  derivation said so, and it put the market's two live prices inside the players'
  space. Above the lanes they cannot collide with an avatar for a STRUCTURAL
  reason rather than an arithmetic one -- avatars live in the lane field and the
  band is not in it -- and the dashed price lines now run down out of the band,
  through the lanes, to the floor, so plate, leader, and line read as one path.
  Measured across 235 polled frames of a live window at the binding 1024x640
  viewport, including a crossing and both band edges: pennant-vs-avatar
  intersection 0 px^2. The band's 40 units come from the top band (8) and the
  lane rows (32), so gutters narrow 28 -> 20; the trade banner already DERIVED
  its plate height from its gutter, so it followed instead of overflowing.
  (2) Deleted the top band's right-hand emblem. It was the good's icon repeated
  for symmetry, and a duplicated MEANINGFUL icon is worse than a meaningless
  shape -- a reader who has learned the badge names the good goes looking for
  what the second one names and finds nothing. Nothing replaced it: the tick
  readout carries that end on type weight instead (16px -> 20px, still well under
  the going price's 44px). (3) The store rails' stock integer moved from a label
  gutter at lane-2 height down to the FOOT OF ITS OWN CRATE STACK, ~200 units
  from where it had been floating: a number belongs adjacent to the thing it
  counts, and the count and the picture of the count are one statement. Both now
  hang off one anchor, `railFootBand` -- the avatar-free strip below the last
  lane -- and the rails' rotated texts derive their baseline from a FULL stack's
  ceiling rather than a literal offset. The rail's mirroring is preserved and the
  measurement proves the hierarchy it exists for: with buyers pinned at the price
  floor and sellers at the ceiling (avatars overhanging both rails at once), the
  worst avatar overlap is 627 px^2 on the static caption and 109 px^2 on the
  crates -- the things that can be sat on harmlessly -- and 0 px^2 on BOTH live
  numbers, the store's quote and its stock. The stock number stays on the rail
  plate it was contrast-measured against (13.5:1; 0 px^2 overlap with any crate).
  New geometry helpers land with 16 new cases in `tests/test_auction_geometry.mjs`
  (45 total), which assert the band/lane-field disjointness directly rather than
  re-checking a y-band computation.
- Docs: pre-commit audit of the auction recomposition's documentation, fixing six
  stale or missing entries. `docs/TODO.md` presented the SUPERSEDED 2026-07-10
  landscape price-track design as shipped four lines above the bullet that says it
  was scrapped; that bullet now carries the same superseded treatment and names
  what replaced it. `tests/e2e/e2e_auction_beat_capture.mjs` existed only in this
  changelog and is now indexed in `docs/FILE_STRUCTURE.md`, `docs/USAGE.md`, and a
  new "Capture drivers in this repo" section of `docs/E2E_TESTS.md`
  (`docs/WALKTHROUGH_GUIDE.md` is scoped to the walkthrough harness alone, so it is
  deliberately not listed there). `AUCTION_SIT_OUT_FACTOR` gained a
  `docs/RULE_SOURCES.md` entry alongside the other auction tunables, recording the
  1x/3x/6x/10x experiment behind the value and -- the reason it matters -- that it
  COMPOUNDS with `?speed=`: `?speed=8` over the 10x factor leaves ~6ms per tick,
  which has now misled three separate agents into diagnosing a correctly-rendering
  auction as broken; `docs/USAGE.md`'s URL-param section carries the same warning.
  `docs/CODE_ARCHITECTURE.md`'s auction section gained a cross-reference to
  `GameState.roundLedger` / `AuctionPayload.status`. `docs/E2E_TESTS.md` is added
  to `docs/REPO_STYLE.md`'s centrally-maintained list -- its absence there is why a
  template propagation clobbering its local corrections surprised us today; both
  files are themselves centrally maintained, so each carries a comment saying the
  durable fix belongs upstream in the template.
- Docs: corrected the execution bookkeeping in
  [docs/active_plans/active/auction_native_recompose.md](active_plans/active/auction_native_recompose.md),
  which was materially false: its status table still listed WP3, WP-X1, WP4, WP5,
  WP6, WP7, WP8a, WP8b-fixture, WP8b-acceptance, and WP-D as `pending` and every
  rollout box as unchecked, while the tree contained all of that work and two filed
  visual-acceptance reports proved the gate had run. Each package was re-verified
  against the working tree rather than against dispatch records; M1 through M6 are
  complete (WP8b-acceptance ran twice: FAIL on labels drawn where occupants stand,
  then PASS after the fix pass), and M7 (docs close-out) is the only milestone still
  open. Plan archival to `docs/archive/` remains the final commit-time step.
- Comments: stripped work-package and milestone plan tags (`WP1`-`WP8`, `M1`-`M7`)
  fossilized in the goods-auction rebuild's permanent comments and CSS block
  headers across `src/style.css`, `src/ui/scenes/auction_arena.tsx`,
  `src/ui/scenes/auction_dock.tsx`, `src/ui/scenes/auction_geometry.ts`,
  `src/ui/scenes/auction_trade_fx.ts`, `src/ui/solid/auction_screen.tsx`,
  `tests/playwright/auction_scene.spec.mjs`, and
  `tests/e2e/e2e_auction_beat_capture.mjs`. Two CSS block headers ("RESERVED:
  auction dock" / "RESERVED: auction status layer", instructing "write CSS
  INSIDE this block only") stated a false empty-block state for panels the same
  change fully populated; rewritten as plain content-describing headers naming
  the module each block serves. All other tags were rewritten in terms of the
  module or file they referred to. Comment-only change; no executable line,
  selector, or CSS rule was touched.
- Testing: closed a self-introduced gap where `docs/PLAYWRIGHT_TEST_STYLE.md`
  documented `testIgnore: ["**/_temp*", "**/dist_*/**"]` for
  `playwright.config.ts` but the config file itself never set it, so a scratch
  spec dropped anywhere under `tests/playwright/` (globbed by path, not by
  name) would have been collected as a durable test; added the setting and
  demonstrated it holds (a throwing `_temp_ignore_demo.spec.mjs` placed inside
  `tests/playwright/` was absent from `npx playwright test --list`'s 108-test
  output, then deleted). Also replaced `auction_scene.spec.mjs`'s
  `toHaveClass(/game-hud-hidden/)` HUD assertions with `toBeHidden()` /
  `toBeVisible()` so the test asserts the player-visible effect instead of
  naming the CSS class that implements it (that class is a plain
  `display: none`, `src/style.css:1515`), and fixed a latent positional
  selector in `corral_purchase.spec.mjs`'s `readCorralFigures()`: the three
  `.corral-purchase-figure` rows were read via `.nth(0/1/2)` over
  structurally-identical `dt`/`dd` pairs, silently coupling the test to render
  order. `corral_purchase_panel.tsx` now names each row with
  `data-corral-figure="price"|"stock"|"funds"` (documented in-component as an
  external test contract) and the spec addresses figures by that attribute.
- Docs: repaired two doc defects, one false and one silently deleted. (1)
  `docs/RULE_SOURCES.md`'s auction "out" role entry described a screen that no
  longer exists: it claimed an out participant shows an `OUT` label with an
  ASCII `--` price in a readout, draws no token dot on a price axis, and parks
  at a sideline "line judge" spot (`sidelineSpot`) beside a track, calling that
  spot "the single layout seam a future landscape-rotation task rewrites". That
  rotation task has SHIPPED (it is the full-stage 16:10 auction recompose), and
  `sidelineSpot` was deleted with it -- the symbol exists nowhere in `src/`, and
  neither does `bestBid`/`bestAsk`, which the same entry cited as the matcher
  that skips an out seat. A canonical fidelity-provenance doc pointing readers at
  two functions that do not exist, and at shipped work as pending, is worse than
  stale, so the entry was rewritten against the source: the mechanics half now
  cites the real matcher (`rankedBids` admits only `role === "buyer"` and
  `rankedAsks` only `role === "seller"`, so an out seat is absent from both books
  by construction rather than filtered out of them), and the rendering half
  describes the real mechanism -- benched at the runway's cheap edge in its own
  lane with no price peg (`outParkingSpot`/`avatarTarget`), snapped and held on
  walk frame 1, carrying an `OUT` chip where its price tag would be, with the dim
  applied to the sprite alone so the bench and chip keep their own contrast
  (`src/ui/scenes/auction_arena.tsx`, `src/style.css`), plus the dock's `Out`
  role column (`src/ui/scenes/auction_dock.tsx`, which has no price column at
  all). The entry keeps its purpose -- recording where this engine departs from
  the reference games -- and now states the real reason it departs: PM signals
  non-participation purely by ABSENCE (off the track, no figure), which does not
  survive the landscape recompose, because the runway's cheap edge is also where
  a legitimate floor-priced BUYER stands. This engine keeps PM's subtractive cues
  and adds two positive objects no active trader has (the bench, the chip). (2)
  `docs/PLAYWRIGHT_USAGE.md` lost its 36-line "Visual render gate" section to a
  central-template propagation, not to any deliberate edit -- an audit confirmed
  the content did not resurface elsewhere. That section documents
  `tests/pixel_metrics.mjs` (`computeCoverageRatio`, `countDistinctColors`,
  `computePaletteConformanceRatio`, `deltaEBetweenRgb`/`meanColor`) and the
  threshold-calibration methodology for `tests/playwright/visual_render.spec.mjs`,
  all of which are live and still gate the build (those calibrated pixel
  thresholds are the reason four otherwise-unused sprite symbols cannot be
  deleted, `docs/TODO.md`). Restored from `git show HEAD` and re-verified against
  the code rather than rewritten from memory: all four helpers, `meanColor`, the
  per-threshold `conformanceMin` measured-value comments, and the river/plains/
  mountain distinctness assertion all still match. Marked with a local-correction
  HTML comment following `docs/E2E_TESTS.md`'s existing convention, since the next
  propagation will clobber it again; the durable fix belongs upstream in the
  template that ships the file.
- Docs: `README.md`'s screenshot block still showed the pre-rebuild auction --
  a narrow portrait-ish price-track panel captured 2026-07-09, before the
  landscape recompose -- so a first-time visitor's first impression was the
  screen the project owner rejected as unusable. `git mv`'d the stale
  `docs/screenshots/auction_track.png` to `docs/screenshots/auction_arena.png`
  (matching the codebase's own `AuctionArena`/`auction_arena.tsx` naming, since
  "the track" design no longer exists) and replaced its contents with the
  `1280x800` frame from `tests/e2e/e2e_auction_beat_capture.mjs`'s beat 3
  ("live motion"), which shows buyers walking in from the cheap wall, sellers
  from the expensive wall, converging BID/ASK markers, store rails at both
  ends, and the per-player dock, filling the frame edge to edge -- 1280px wide
  to match the other four README screenshots. Updated the one live reference
  in `README.md` with alt text describing the new layout (the CHANGELOG
  archives that name the old file are history and were left alone). Checked
  the other four managed screenshots against the same commit range for
  staleness: `docs/screenshots/town_interior.png` was captured before a same-day
  town-collision commit but is pixel-identical to a fresh `output_smoke/
  art_gate/town_scene_v3.png` capture, so it stays; `scoring_screen.png` has
  looser bottom whitespace than ideal after an unrelated `min-height` CSS tune
  but is not broken or misleading, so it was left as an out-of-scope note
  rather than a fix.

### Removals and Deprecations

- Testing: removed `tests/e2e/e2e_walk_calibration.mjs`. Its
  grid-town, Space-key entry model and speed x tap-length sweep were superseded
  by the geometry-derived gesture constants (`tapMsForStepPx` in
  `tests/e2e/walkthrough_helpers.mjs`); the locked-constant door-reach
  measurement now lives in the audit doc
  [docs/active_plans/audits/town_spacing_experiment.md](active_plans/audits/town_spacing_experiment.md).

### Decisions and Failures

- Testing: locked the town spacing constants (unchanged: gap
  44, pad 80, door 64; derived worlds 964 beginner / 1136 standard) and the
  geometry-derived gesture constants (WALK_TAP_MS 25, minimum 20, door-align
  +-8px, door-seek 50/11ms), removing the provisional markers. Per the user
  decision (accept-as-difficulty, 2026-07-11) the travel-budget bar is a
  realistic mule-swap-to-close-plot errand measured against the non-starved fed
  budget (50 ticks x 950ms = 47500ms); only the food-starved 5-tick floor cannot
  finish the maximal full-street trip, and that is accepted as a starvation
  penalty rather than a spacing defect. Evidence:
  [docs/active_plans/audits/town_spacing_experiment.md](active_plans/audits/town_spacing_experiment.md).
- Testing: the walkthrough sweep was re-triaged and RESTORED
  to release-gate status -- 6/6 across seeds {1,3,7} x modes {beginner,standard}
  after the harness and script fixes above. Every failure was triaged by cause;
  the only residual is the environmental (non-town) parallel-load flake filed in
  [docs/TODO.md](TODO.md), so no town-caused failure remains and the sweep is a
  green release gate again.
- Auction rebuild: corrected the supported viewports in the active plan
  [docs/active_plans/active/auction_native_recompose.md](active_plans/active/auction_native_recompose.md).
  Per the user (2026-07-11) the plan's capture and acceptance viewports of 1600x900
  and 1200x1000 were wrong and are superseded by 1024x640 (the MINIMUM supported
  viewport) and 1280x800 (the nominal target), matching the town rebuild's recorded
  1280x800 / 1200x750 precedent with the floor now set at 1024x640. The correction
  landed before the two work packages that would have read the stale numbers
  (WP8b-fixture, the beat-capture driver; WP8b-acceptance, the visual gate) were
  dispatched. Load-bearing consequence now stated in the plan: `#game-stage` is
  locked to `aspect-ratio: 16/10` and the auction viewBox (960x600) is also exactly
  16:10, so both supported viewports fill the stage with no letterboxing and the
  whole composition scales by ONE uniform factor. Therefore the geometry-ratio
  criteria (runway share, trailing dead band, rail-to-runway proportion) are
  SCALE-INVARIANT arithmetic identities of the region constants -- pipeline sanity
  checks, not design evidence (a reviewer caught exactly that error in the WP-X1
  measurement report) -- while text and glyph legibility, the only criterion class
  with an absolute pixel floor, fails first at the smallest stage. 1024x640 is the
  single binding pass/fail viewport for the visual gate; 1280x800 is a sanity
  render.
- Auction rebuild (WP-X1 rerun): re-did the composition mock's rail
  measurement after the review above found it circular and re-corrected it
  again after the viewport supersession landed mid-rerun.
  `docs/active_plans/reports/auction_composition_mock_measurements.md` now
  states plainly that the runway-share and dead-band figures are
  scale-invariant arithmetic identities of the region constants (a pipeline
  sanity check, not design proof), keeps the two genuine text-height
  measurements, and replaces the ungraded "rails/dashed lines read at a
  glance" row with a real measurement: a second scratch mock renders both
  rails at worst-case content (`MAX_RAIL_CRATES` = 8 crates, `CRATE_GLYPH_SIZE`
  = 16, a 4-character quote label positioned via the real `clampLabelX`
  against its `getBBox()`-measured width) and three asymmetric best-bid/
  best-ask price pairs (a `far` pair, a `near` pair, and a `tight` pair at
  `AUCTION_PRICE_STEP_BY_GOOD`'s real 1-unit minimum gap), captured with
  retained screenshots at both supported viewports. Recorded as facts, not
  a verdict, per a third role split (coder collects artifacts and
  measurements only; a separate playwright_operator owns the authoritative
  capture and an image_evaluator owns judgment): programmatic containment
  checks find no crate-stack or quote-label overflow of the 40-unit rail at
  either viewport (label occupies 72% of the rail width, no overlap with
  the crate stack), so no `auction_geometry.ts` constant was changed. One
  directly-computable fact worth flagging: at the `tight` bid/ask gap, the
  two 2px-wide dashed strokes' painted areas geometrically overlap (1.9px
  gap versus 2px stroke width) and render as one line in the retained
  screenshots; filed as a note for WP4/WP7 (line-styling chrome, not a
  geometry-module constant) and for the evaluator's judgment. Mid-rerun, a second reviewer landed the viewport
  supersession above (1024x640/1280x800 replacing 1600x900/1200x1000); the
  entire rerun -- rail measurements plus a fresh capture of the two genuine
  text-height rows -- was redone a second time at the corrected viewports
  rather than left on the stale ones, and the earlier stale-viewport
  screenshots were deleted so no mismatched evidence stays attached to the
  report. Learning recorded for future WP-X1-style spikes: verify which
  criteria in a "measure at N viewports" pass are genuinely independent of
  scale before trusting agreement across viewports as evidence -- identical
  numbers at two 16:10 viewports prove the render pipeline is not distorting
  the ratios, not that the underlying design choice is correct.
- Testing: the walkthrough harness is SUSPENDED as a hard milestone/release
  gate, per the user ("i do not trust our current walkthrough suite, it has failed
  me twice with bad requirements"). It keeps running for information, but a green
  run is no longer authoritative and must not be cited as evidence that a milestone
  is safe to close -- which also supersedes, from today forward, the WP-6C sweep
  restoration recorded above. Three defects were confirmed against the source:
  `clickIfPresent` returned false SILENTLY on a missing selector while
  `driveAuction` discarded that boolean at the human's REQUIRED role-commit click
  and recorded "I committed" regardless (a UI failure was invisible by
  construction); the resulting no-op left the engine's tick-0 commit hold in place,
  so a MISSING BUTTON spun to the 4000-tick cap (about eight minutes) and was then
  reported as `auction_stalled`, an ENGINE bug; and the driver encoded
  `auction_screen.tsx`'s internal `mode()` switch and its tick-0-only rendering as
  a REQUIREMENT, pinning the old implementation's shape rather than intended player
  behavior. Consequence recorded for the auction rebuild: its plan had gated four
  milestones on this harness and its risk register treated the deadlock as a
  constraint the NEW UI must satisfy -- bending the product design around a broken
  test, the same failure the town rebuild taught us to avoid (the plan removed the
  tests enforcing bad GEOMETRY but left a harness enforcing bad STRUCTURE). Gate
  authority is not restored by the WP-H repair now in flight; it returns only when
  the audit shows required/optional interactions separated and failing fast, no
  discarded required-click results, layered UI-contract vs engine-stall diagnosis,
  no requirement encoding component internals, every surviving requirement audited
  against "player behavior or old implementation?", and a NEGATIVE TEST observed to
  fail correctly (a suite only ever seen to pass proves nothing about its ability
  to diagnose). Until then milestones close on typecheck, the node suites, the
  behavior-only playwright safety net, and the visual acceptance report. Evidence:
  [docs/active_plans/decisions/walkthrough_gate_suspension.md](active_plans/decisions/walkthrough_gate_suspension.md).
- Testing (WP-H2): flagged `tests/e2e/e2e_full_game.mjs` for RETIREMENT as a
  follow-up, not executed here (a cross-file cleanup outside this pass's
  ownership). Its passive-only six-cell mode x seed matrix is a redundant subset
  of what the routine active-mode gate (`e2e_walkthrough.mjs`) plus the
  release-gate sweep (`e2e_walkthrough_sweep.mjs`) already check more rigorously:
  `e2e_walkthrough.mjs`'s report wires fatal
  `page_error`/`console_error`/`network_error` listeners (e2e_full_game.mjs's own
  ad hoc `pageErrors` array is weaker), and `assertActiveInvariants` checks real
  bookkeeping invariants e2e_full_game.mjs does not attempt. More fundamentally,
  e2e_full_game.mjs's PASSIVE-ONLY human play can never produce a human
  buy/sell/placement, so it can never satisfy the sweep's own `matrixCoverage`
  release-gate requirement -- its coverage is real but strictly weaker than what
  the other two gates already provide. `grep -rl e2e_full_game` across the repo
  turns up only comment-only provenance references
  (`tests/playwright/scoring_screen.spec.mjs`, `event_banner.spec.mjs`, and five
  `docs/*.md` files), not imports, so deletion is safe but needs a coordinated
  cleanup pass across files outside `tests/e2e/`.
- Testing (auction rebuild): designated **WP8a the trusted, auction-scoped release
  gate** for the goods-auction rebuild
  ([docs/active_plans/active/auction_native_recompose.md](active_plans/active/auction_native_recompose.md)),
  now that the full-game walkthrough is suspended as a gate and is informational
  only. A proposed auction-only walkthrough driver was REJECTED as duplication: the
  M1 behavior safety net, WP8a, and the WP8b beat-capture driver already cover eight
  of the ten checks it wanted, and WP8a already has its own command, deterministic
  seed 1234, and no walkthrough dependency. Two gaps were folded into WP8a instead.
  (1) The clock-hold invariant is now asserted FROM THE UI SIDE -- `payload.tick`
  stays 0 until the human commits a role, then advances -- read via the existing
  `window.muleGameState()` seam; nothing asserted it before, yet the whole deadlock
  class hangs off it (`isAuctionTickable` / `humanAuctionCommitted`), and a lost
  clock hold would silently make the declare beat skippable with no failing test.
  (2) Failure DIAGNOSIS stays at the helper level, where it is already proven with a
  fake page + fake projection (`tests/test_walkthrough_auction.mjs`); WP8a must NOT
  add test-only fault-injection hooks to the live app to reproduce those branches in
  a browser. WP8a owns the positive real-browser contract (controls render, clock
  holds then advances, trade registers, dock counters update) -- a regressed control
  fails a positive assertion, which is sufficient for a spec.
- Auction rebuild (WP-D, close-out): recorded the DECISION CHAIN behind the goods-auction
  rebuild, so the reasoning outlives the per-patch bullets above. (1) The 2026-07-10 screen was
  REJECTED outright by the user, with a screenshot: "the auction is only a tiny aspect of the
  screen ... a crude mixture of both landscape and portrait, which makes it unusable", and "the
  MULE game auction is supposed to be a visual delight showing how supply and demand work, our
  implementation is very confusing." (2) The 2026-07-11 directive that replaced it: recompose the
  auction NATIVELY for the 16:10 landscape stage, splitting the two references by job -- the NES
  auction screens are the reference for LAYOUT, INTERACTION, and INFORMATION HIERARCHY (which
  elements exist, how they relate, what the player reads where), while the GRAPHIC TREATMENT
  follows the Planet-inspired modern look the town facades already use. Three approaches were
  rejected BY NAME and are recorded here so none is re-proposed: centering a narrow NES-shaped
  layout inside the wide stage ("a vertical phone video inside YouTube"); blending the NES
  reference with the existing auction layout; and a literal NES pixel-art reproduction in place of
  the modern treatment. This supersedes the previous near-term target -- a vertical price axis with
  an `AuctionPainter`-shaped composition -- which is now closed out of
  [ROADMAP.md](ROADMAP.md) rather than left standing as a plan a future agent might build. (3) The
  session's supporting decisions, each load-bearing on the result: the auction UI was authorized as
  a SCRAP-AND-REPLACE, not a migration ("I am not partial to any existing auction code, feel free
  to scrap what we have and start over"), with the ENGINE layer untouched -- the round ledger is
  observation at existing seams, not a rule change; the human's Sit Out choice FAST-FORWARDS the
  window's remaining ticks instead of forcing a real-time spectate, which is what made the declare
  overlay viable at all; the top HUD is HIDDEN during the auction so the composition owns the whole
  stage, its per-player numbers moving into the left dock; the status beat's verdict maps
  SURPLUS/SHORTAGE for food and energy only, with ores ALWAYS neutral (a colony has no consumption
  need for smithore or crystite, so a surplus/shortage verdict on them would be meaningless); and
  ArrowLeft/ArrowRight became the PRIMARY taught controls (ArrowUp/ArrowDown remain compatibility
  aliases) precisely because they match the direction the avatars now move -- the control scheme
  follows the composition, not the other way round. Screen-level description in
  [SCREEN_DESIGNS.md](SCREEN_DESIGNS.md), "Goods Auction (the trading floor)"; plan in
  [docs/active_plans/active/auction_native_recompose.md](active_plans/active/auction_native_recompose.md).
- Auction rebuild (sprite audit): an audit expected `src/ui/sprites/sprites_arena.ts`'s four
  non-`trade-flash` arena chrome symbols (`backdrop`, `axis-bar`, `axis-tick`, `store-band`) to be
  fully orphaned by the auction rebuild, since the live `auction_arena.tsx` composition draws its
  own backdrop and bands and never `<use>`s them. A repo-wide grep confirmed no literal-string
  consumer, but `src/ui/sprites/town_gallery.ts`'s "Auction arena chrome" section iterates
  `ARENA_CHROME_NAMES` and `<use>`s all five symbols by name, and
  `tests/playwright/visual_render.spec.mjs`'s calibrated "town gallery" pixel-coverage test
  renders and measures that section. KEPT all four symbols rather than deleting them -- a gallery
  page and a screenshot-fixture-driven test are real consumers, and deleting something still in
  use is worse than leaving a symbol unused by the live game. Separately fixed
  `town_gallery.ts`'s module doc comment, which named two paths that no longer exist: the deleted
  `src/ui/auction_screen.ts` (now `src/ui/solid/auction_screen.tsx`) and the retired
  `tests/playwright/town_gallery.spec.mjs` (this module is now bundled by
  `tests/playwright/visual_render.spec.mjs`).
- Auction rebuild (M6 visual gate, final): PASSED the rebuilt goods auction, re-judged from 14
  freshly captured beat frames -- see
  [docs/active_plans/reports/auction_visual_acceptance_final.md](active_plans/reports/auction_visual_acceptance_final.md).
  All six fixes from the failing gate verified by independent measurement: zero price-bearing
  labels on any benched player (the sat-out lie, now answered with a positive cue -- an opaque
  bench plate and a full-opacity OUT chip at 14.87:1, up from 2.31:1); zero CROSSED / BID / ASK /
  banner / hint collisions (the BID chip was 73.9% occluded at the crossing); the trade flash lands
  ON the buyer and no longer renders off-stage; the going price is dominant at 46.93px with the
  tutorial hint moved into the declare card, so nothing occludes the dock header at either
  viewport; crates legible at 7.39:1 (was 1.42:1 -- `RESOURCE_ICON_FILLS` had zero consumers, so
  every glyph painted black) and scaled against the window's opening stock rather than a running
  maximum, with a raw stock integer as ground truth. Composition held and improved: runway 56.0% of
  frame, trailing dead band 2.0% of stage height (was 4.0%, and 16.3% on the screen the user called
  unusable); smallest dock text 12.80px rendered against a 12px floor. REFUTED the implementer's
  disclosure that the rail-label residual was "not observed in any of the 14 frames": it is
  observed in 4 of them, and the sell rail buries its live `$85` store quote 96.4% behind an avatar
  because the two rails are not mirrored -- the sell quote is the innermost rail element and its
  box begins 2px INSIDE the runway, where avatars provably stand, while the buy rail correctly puts
  its static label there. Recorded as a required follow-up rather than a ship blocker (it hides no
  information: the same price is legible in the ASK pennant and at the price ruler's right end),
  with the fix named -- mirror the sell rail so both rails read quote -> stock -> label outward
  from the runway.

### Developer Tests and Notes

- Testing: new `tests/test_auction_status_payload.mjs` (10 cases) covers the
  auction status beat. The load-bearing case replays fully played games and
  asserts the reconciliation identity on every window, every player, and every
  good -- across seeds that fire goods-mutating personal events and seeds that
  fire none. It also pins that `previous` is the round-start holding (proving the
  ledger resets each round), and that develop-turn food consumption is recorded as
  usage while the ores never accrue usage they have no seam for. Every
  event-recording path is proven on a round where the event ACTUALLY FIRES, since
  an unexercised recording path is not a proven one: a grant (seed 99), a HALVING
  (seed 4's Glac-Elves food halving -- the negative direction, and the case a
  reconstruction would most easily get wrong, since the amount lost depends on what
  the player happened to hold rather than on any rule constant), a forced
  space-pirates crystite wipe (natural AI games rarely mine crystite, so that seam
  is forced rather than left to chance), and a forced colony-pest round proving the
  category split -- a yield-shaping event lands in `production`, NOT as an event
  delta on a holding, so it is neither double-counted nor dropped. Verdict coverage
  is behavioral, not a constant echo: a colony holding none of a good must read
  shortage, one holding far more than any possible need must read surplus, and the
  ores stay neutral either way.
- Testing: re-pinned `EXPECTED_STATE_HASH` in
  `tests/test_replay_determinism.mjs` for the added `GameState.roundLedger` field.
  The schema-drift guard fired exactly as designed. This is a hash-only re-pin
  (the 1301-action log is unchanged), and that was verified rather than assumed:
  replaying the log and hashing the final state with `roundLedger` DELETED
  reproduces the previous pin byte for byte, proving the action stream, RNG
  streams, money, goods, board, and final scores are all untouched and only the
  added field moved the hash.
- Testing: the spacing/travel-budget experiment measured the
  arms behind the accept-as-difficulty decision above. Against the fed budget
  (47500ms), the realistic mule-swap errand passes with a +94% margin in both
  modes and the maximal full-street trip clears +88% (informational); door-reach
  was 100%. Only the food-starved 5-tick floor cannot complete the maximal trip.
  Full arms:
  [docs/active_plans/audits/town_spacing_experiment.md](active_plans/audits/town_spacing_experiment.md).
- Testing: new `tests/test_goods_write_sites.mjs` (3 cases) guards the round
  ledger's exactness invariant structurally: it scans every `.ts` file under
  `src/engine/` for a `goods:` value construction on a `Player`-shaped object
  and asserts each site is one of 6 explicitly reviewed, allow-listed
  locations (anchored on enclosing function/event name, not line number),
  each carrying a short reason it needs no direct ledger-recording call of
  its own. A 7th, unaccounted-for site would fail loudly with a message
  naming the file, the enclosing function, the reconciliation identity, and
  the two ways to resolve it (record it, or allow-list it with a reason);
  confirmed by temporarily injecting a fake write site into `economy.ts` and
  watching the guard fail, then removing it and watching it pass again. Along
  the way the guard surfaced a real gap in the round-ledger review's written
  rationale (not a ledger bug): `events.ts` DOES construct new `goods` values
  in two places (`addGood`, and the `mischievous_elves` handler that halves
  food), contradicting that review's "events.ts... contain[s] NO writes"
  description; those two sites are correctly safe because their net effect
  is captured by `beginDevelopTurn`'s before/after diff rather than a direct
  `record*` call, but the "no writes" phrasing should be corrected to "no
  writes that need a direct ledger call" so a future reader does not
  conclude events.ts is write-free. The guard intentionally scans only
  `src/engine/` (not `src/ui/solid/map_demo.tsx` and `town_demo.tsx`, which
  also hand-build a `goods:` fixture for a standalone demo screen that never
  runs through the round ledger's turn loop).
- Testing: filed
  `docs/active_plans/reports/auction_first_look_findings.md`, the manager's
  review of the first live capture of the rebuilt full-stage auction (frames at
  1024x640 and 1280x800 under `test-results/eyes_auction/`). Headline: the
  rebuild WORKS -- the auction fills the whole stage at both viewports with no
  dead band, no portrait column, and no letterboxing; the runway is dominant,
  the rails bound it, lanes are rows, the dock carries money/qty/traded, and text
  is legible at the binding minimum. Three DEFECTS recorded against that working
  design: the green CROSSED label renders on top of the pink player's avatar at
  the crossing -- the one instant the screen most needs to be readable; the
  tutorial tooltip crowds the going-price readout so the top band reads as two
  competing blocks instead of one dominant number; and the trade sparkle floats
  in empty runway space, anchored to neither seller nor buyer (an input to the
  in-flight WP7 trade-fx package). The capture operator had characterized all
  three as soft rough edges; the manager judged them genuine defects, and the
  disagreement is preserved in the report. Recorded as an OBSERVATION, explicitly
  not a bug: all four avatars converge into one column at the crossing, leaving
  the widest region on screen mostly empty -- possibly the honest picture of a
  converged market, so the visual gate must rule on it rather than "fix" it.
  Carried forward as open questions: sat-out players are distinguished from
  floor-priced buyers only by SUBTRACTIVE cues (dimmed, tagged, no price), and
  rail crate stacks scale against a RUNNING MAX of `storeStock` so the same stack
  height can mean different quantities at different moments within one window --
  a quantity axis that rescales under the player, on a screen whose purpose is to
  make quantity visible. Also corrects a measurement: the dock's smallest text was
  reported as 15px at 1024x640 (a 25% margin over the 12px floor), but that was a
  `getBoundingClientRect().height` inflated by a descender, not a font size; the
  CSS is `font-size: 12px`, rendering at ~12.8px, so the true margin is ~7%. Still
  passing, but thin, and the M6 gate must MEASURE it rather than trust a reported
  number -- the second time in this rebuild that a plausible measurement turned out
  to be measuring the wrong thing. All seven required checks are now pinned into
  WP8b-acceptance in `docs/active_plans/active/auction_native_recompose.md`.
- Testing (WP8a): rewrote `tests/playwright/auction_scene.spec.mjs` (11 cases) as
  the trusted, auction-scoped release gate for the new-composition auction,
  driven entirely through the `data-action`/`data-role` selector contract
  (`src/ui/solid/auction_screen.tsx`) rather than the old `.auction-screen-role-
  button` class. Covers: ArrowRight raising the human's avatar `data-x`
  (plus the ArrowUp alias); the dock's store row TRADED counter incrementing
  after the deterministic seed-1234 store trade; the status layer and all
  three role buttons present and provably CLICKABLE at tick 0 via Playwright
  trial clicks (actionability checks with no click performed, so nothing
  spends the one declare beat a real click would); the clock-hold invariant
  (`payload.tick` sampled across 20 real animation frames stays 0 until the
  human commits a role, then advances); the sit-out fast-forward's tick
  cadence measurably exceeding the committed cadence with the FAST indicator
  showing; round-1 crystite's structural skip showing its finished-overlay
  treatment and advancing; reduced motion snapping the avatar (exactly 1
  distinct value across a tick, vs an un-reduced tween's `>2`) plus the trade
  flash/banner appearing instantly with the flying-goods glyph suppressed;
  and the HUD hiding for the whole auction phase and restoring once the
  human sits out every good through the round boundary. Added the one test
  that did not exist anywhere in the suite: an avatar-tween regression lock,
  sampling `data-x` at animation-frame granularity across one engine tick and
  asserting INTERMEDIATE values exist (a snap-to-target regression would
  collapse this to at most two) -- every other assertion in the suite is
  equally true whether the avatar eases or teleports, so nothing else would
  have caught it. Both frame-granularity samplers (the tween sampler and the
  tick-cadence sampler) run their collection loop INSIDE the page via
  `page.evaluate` + `requestAnimationFrame` rather than a Node-side poll,
  since a Node-side `expect.poll` loop was measured elsewhere in this suite's
  development to degrade from ~25ms to over 1000ms under parallel-worker
  load -- fast enough to miss a single ~62ms tick window entirely. Speed
  choice recorded in the file's header comment: every test uses `?speed=8`
  (matching the rest of the suite); a `speed=2` probe for the tween test
  alone pushed navigation past 30s, while `speed=8` was empirically verified
  to still yield 5 distinct intermediate `data-x` values per tick. Restored
  auction assertion in `tests/playwright/game_flow.spec.mjs` (buy role starts
  the price clock) was already present and re-verified green against the new
  markup, so no separate restoration was needed. Verified:
  `npx playwright test tests/playwright/auction_scene.spec.mjs
  tests/playwright/game_flow.spec.mjs` (15 passed) and `bash check_codebase.sh`
  (5 checks passed) twice each, plus the full `bash run_playwright_tests.sh`
  suite (107 passed) twice consecutively.
- Testing (WP8b-acceptance): filed the M6 visual gate's verdict in
  `docs/active_plans/reports/auction_visual_acceptance.md` -- overall **FAIL**, from
  a fresh 14-frame capture (`node --import tsx tests/e2e/e2e_auction_beat_capture.mjs`,
  exit 0). The COMPOSITION passes and is not re-litigated: measured runway 56.0% of
  frame, trailing dead band 4.0% of stage height (against 16.3% on the screen the user
  called unusable), composition width coverage 98.96%, and every dock value plus the
  going price clearing the house 5.5:1 contrast target (9.38-12.39:1). The screen fails
  on ONE defect class repeated six times: labels drawn where occupants provably stand,
  with no collision avoidance -- and each instance fires at the moment the screen is
  meant to be doing its job. Of the three first-look defects, only half of one was
  fixed: CROSSED still overlaps the lane-4 avatar (38.4 x 15.0 px, unchanged); the
  trade GOODS glyph is now correctly anchored to the seller but the FLASH burst is not.
  Root cause found for the flash rather than re-observed: the code anchors it correctly
  (probed intended screen center (557.3, 153.6) = the buyer) but the pop's
  `scale(1.6)` carries no translation term, and on a `<use>` positioned by x/y
  attributes `transform-box: fill-box` resolves the origin to local (18,18), so the
  scale happens about the SVG origin and throws the burst outward in proportion to the
  buyer's price -- rendered center (880.1, 234.2), 309 px from any avatar, and in the
  finished beat one burst lands at x=1199 on a 1024px stage, entirely off-screen. The
  model predicts the measured left edge exactly (18 + (504.46 - 18) x 1.6 = 796.3
  user units). `src/style.css:2353` carries a comment claiming this exact trap was
  avoided; the comment is wrong for `<use>`, and the reduced-motion path is unaffected,
  which is why the reduced-motion tests never caught it. Three NEW instances of the same
  class: the BID pennant is 73.9% occluded by the ASK pennant at convergence (reading
  "BI" with its price gone, at the market-clearing moment the whole screen exists to
  dramatize); the `UNITS TRADED` banner completely covers the lane-3 seller's price tag
  (its own source comment at `auction_trade_fx.ts:169` asserts the opposite -- with four
  lanes the runway's vertical center is the lane-2/3 boundary, not a gutter); and lane-1
  avatar price tags collide with the CHEAP wall label at tick 0 of every window, since
  buyers start at the cheap wall by construction. Rulings on the three open questions:
  (4) the sparse runway at convergence is HONEST -- accept it, do not scatter the
  avatars, because x = price is the screen's founding contract and "nobody is over here"
  is the lesson, not a gap in it; what actually makes convergence feel wrong is that the
  one column that is NOT empty is where five labels pile onto the same pixels, so the
  answer to (4) is to go fix the collisions. (5) sat-out is NOT distinguishable and is
  worse than the question assumed -- the human's OUT tag is covered 71% by the CHEAP
  label and 41% by the opaque BID pennant, so the screen actively labels a sat-out
  player "BID $16"; and the tag renders at 2.31:1 through its 0.34 group opacity (below
  WCAG AA), confirmed independently by compositing arithmetic (2.30:1). (6) the crate
  stack's running max is NOT acceptable and the payload does need a reference maximum
  (`auction_arena.tsx:349-379`'s own comment defends the running max as "stable" while
  noting stock grows when players sell into it -- self-refuting) -- but the bigger find
  is that the crates render `rgb(1,1,3)` on a `rgb(38,38,64)` rail (1.42:1), losing the
  palette fill the SAME glyphs carry in `docs/screenshots/town_interior.png` (silver
  ore, green food), so the supply half of "supply and demand" is currently black holes
  on a dark wall. Measurement obligation (7) discharged with an independent instrument
  (computed font-size x `getScreenCTM()` scale, not a bounding box): smallest dock text
  is **12.80px** at 1024x640, a 6.7% margin over the plan's 12px floor -- confirming the
  first look's correction and reproducing the original error's source, since the role
  text's bounding-box height is exactly 15.0px and the text is "Buy", whose y-descender
  supplies the missing 2.2px. Four contrast failures beyond the gate's explicit
  dock/going-price requirement: intent legend 1.43:1 (the only text teaching the
  PRIMARY taught control), crate glyph 1.42:1, OUT tag 2.31:1, banner text 2.97:1.
  Graphic treatment otherwise PASSES against the committed town/overworld screenshots
  (flat shapes, soft shadows, no pixel art); the resource glyph fills are the one
  departure. Also recorded: beats 01 and 02 are byte-identical by design, so the gate
  judges 6 distinct frames rather than 7, and the tutorial hint occludes the dock column
  header at BOTH viewports -- cutting it in half at 1280x800, the one defect that is
  worse at the nominal viewport than at the binding one.
- Notes: filed the dead arena-sprite cleanup as a low-priority backlog item in
  [TODO.md](TODO.md) ("UI and layout") so the sprite-audit findings above are not
  re-derived. Recorded there: the four non-`trade-flash` symbols in
  `src/ui/sprites/sprites_arena.ts` ship in every player's `<defs>` and are never
  drawn by the live game; the constants `ARENA_TRACK_WIDTH` (280) and
  `ARENA_TRACK_HEIGHT` (400) exist only to size them and are the dimensions of the
  deleted portrait track panel; and the work is blocked behind a judgment call, not a
  mechanical edit, because `src/ui/sprites/town_gallery.ts` renders all five symbols
  and `tests/playwright/visual_render.spec.mjs`'s pixel-coverage and palette
  thresholds were calibrated including those pixels, so deleting the symbols requires
  recalibrating that spec. The method lesson is recorded with it: a grep for the
  literal symbol ids returns zero hits outside the defining module, which makes the
  symbols LOOK orphaned, but the consumer builds each id at runtime via
  `arenaSymbolId()` over `ARENA_CHROME_NAMES` -- when checking whether something is
  dead, search for the identifiers that BUILD the name, not only the name itself.
- Fixed `tests/playwright/ambient_reduced_motion.spec.mjs`'s "ambient animations run
  under no-preference motion" failure: the trade-flash assertion pinned a CSS
  keyframe name (`auction-trade-pop`) as though it were the behavioral contract, and
  broke when a real bug fix (the flash's `transform-box: fill-box` scale flinging it
  309px off the buyer and clean off the 1024px stage, see `src/style.css` above
  `.auction-trade-flash-burst`) moved the pop from a CSS keyframe to a per-frame
  JS-written SVG `transform` in `auction_trade_fx.ts`. Worse, the spec's synthetic
  `injectTradeFlashBurst` element had no `attachTradeFx` controller wired to it, so
  it could never pop, by construction, regardless of what was asserted -- an
  implementation-coupled requirement testing a mechanism that no longer exists,
  against a fixture that could not exercise the real one either way. Deleted the
  trade-flash assertions and the now-unused helper from both tests in the file; the
  reduced-motion half of that behavior is already covered against a real trade in
  `auction_scene.spec.mjs`'s "reduced motion shows the trade flash and banner
  instantly, with no flying goods glyph". The river-shimmer and mule-idle-bob
  assertions, still genuinely CSS-gated, are untouched. Full suite verified green
  twice consecutively (107/107, then 106/107 with an unrelated `game_flow.spec.mjs`
  flake that passed in isolation, matching this repo's known load-induced Node-side
  wait hazard); `check_codebase.sh` passed all 5 checks.
- Fixed the `game_flow.spec.mjs` flake named just above: root cause was a Node-side
  read of the land-grant sweep cursor's row/col (`getAttribute` calls) taken right
  before the `Enter` keypress that claims a plot, racing the cursor's ~150ms
  per-cell dwell (`advanceSweepCursor`, `src/engine/land_grant.ts`) -- under
  full-suite parallel-worker load a Node round trip can exceed that window, so the
  captured target could already be stale by the time `Enter` landed. This is the
  THIRD instance of this exact hazard found in this repo (after
  `corral_purchase.spec.mjs` and two sites in `auction_scene.spec.mjs`): a
  Node-side wait or read suits a latching condition, not a transient one that
  appears and passes within a few hundred milliseconds. Converted the wait to an
  in-page `page.waitForFunction` over `window.muleGameState()` (matching
  `corral_purchase.spec.mjs`'s `claimLandGrantPlotAt`), and, rather than trying to
  re-verify a specific pre-read target, changed the post-`Enter` assertion to query
  the DOM for whichever plot ended up with `data-owner="0"` -- ownership is
  latching once the engine sets it, so a Node-side read of the RESULT is safe even
  under load, while a Node-side read of the transient cursor POSITION beforehand
  was not. Also added `auction_scene.spec.mjs`'s no-preference counterpart to
  "reduced motion shows the trade flash and banner instantly", closing the
  coverage gap the stale `ambient_reduced_motion.spec.mjs` test above left: drives
  a real store trade and samples the trade-flash burst's SVG `transform` in page,
  on `requestAnimationFrame`, across its whole ~320ms life, asserting the scale
  eases from its `FLASH_POP_SCALE` (1.6) entrance down to its resting scale (1)
  rather than sitting static -- verified able to fail with a page-side
  monkeypatch that froze the burst's `transform` writes to one value (no `src/`
  edits), which collapsed the assertion's distinct-sample-count check as
  expected. Three consecutive full-suite runs green (108/108 each);
  `check_codebase.sh` passed all 5 checks.


## 2026-07-10

### Additions and New Features

- UI: town facades rebuilt in `src/ui/scenes/town_scene.tsx`
  and `src/style.css` -- full-height Planet-inspired industrial storefronts on a
  shared baseline, each with an integrated per-facade door (animated open/closed
  via `data-door-state`), a resource emblem, and a persistent label, over a worn
  street surface with no editor-grid lines for a unique modern look. The renderer
  is catalog-driven, so the beginner mode's 5 facades and the standard mode's 6
  facades render correctly. On-palette (`test_sprite_palette` 2/2); the
  `town_street.spec.mjs` browser suite stays 7/7.
- UI: town facades now show live ambient economics in
  `src/ui/scenes/town_scene.tsx` -- corral mule price and stock, per-outfitter
  outfit prices, a pub "Ends turn" label, and truthful neutral Land and Assay
  labels (Land Office pricing deferred). Every value reads from the SAME
  store selectors the corral and outfit panels use, so there is a single source of
  truth (`store.state.store.mulePrice` and `muleStock`, `computeOutfitCost` and
  `OUTFIT_COST`), surfaced through `data-ambient-price` and `data-ambient-stock`
  hooks. Verified live: corral $100 / Stock 14, mining outfit $75.
- Docs: new `docs/SCREEN_FLOWCHART.md` and `docs/SCREEN_DESIGNS.md` map the
  game's screen flow and per-screen content across three references -- the 1983
  original (Kroah disassembly writeup + `MULE-Disassembled_Memory.asm`, whose
  `round:` driver is the authoritative state machine), the 1990 NES port
  (studied from screenshots), and 2011 Planet M.U.L.E. (decompiled Java
  `controller/phase/*` + `view/*Painter` classes). `SCREEN_FLOWCHART.md` gives
  the whole-game and per-round flow (ASCII plus a Mermaid round-loop graph) and
  a transition-trigger table; `SCREEN_DESIGNS.md` is a screen-by-screen
  compare-and-contrast plus a "Shared visual vocabulary" section framed around the
  information each element conveys (identity tokens, resource emblems, price axis,
  store rails, time bar, persistent HUD, map glyphs) and a use-of-space and scale
  analysis: no wasted screen space, the colonist token about a quarter of a land
  tile, and scale chosen per screen (town looms, map surveys, auction abstracts).
  The dedicated auction walkthrough matches the captured NES/Planet frames to
  `mule_rules.md` with labeled ASCII anatomies of the status and floor screens,
  the three auction stages (status accounting -> binary buyer/seller declaration
  -> real-time floor), the walk mechanic (seller high walking price down, buyer
  low walking bid up, unit-by-unit accelerating transactions, exit conditions,
  collusion), and the store's role in price formation (guaranteed counterparty
  bounding the band, intermediary that only resells what it bought, round-to-round
  repricing on scarcity). Confirmed the auction is a vertical price axis in all
  three (buyers rise, sellers fall, trade where lines meet); our repo's horizontal
  track is the deliberate departure. Reference
  screenshots are copyrighted, so they are linked to external sources
  (c64-wiki, MobyGames, carpeludum) rather than committed.
- UI: town interior now has solid building collision -- new
  `src/ui/scenes/town_layout.ts` is the single source of truth for building
  footprints and doorway gaps, consumed by both the renderer and a new
  collide-and-slide movement clamp (`resolveTownWalk`). Buildings block
  walking outside their doorway gaps (gap width specified in avatar-widths);
  the street stays open so every shop door and edge exit remains reachable;
  the store's central smithore bay is its walk-in doorway aligned to the
  north/south cross-street. Covered by `tests/test_town_layout.mjs`
  (flood-fill reachability from spawn to all 7 doors and 4 exits, wall-slide
  monotonicity, solid-outside-gap, renderer no-drift).
- UI: added an explicit letterboxed 16:10 game stage
  (`#game-stage`) that every in-game surface (`#game-hud`/`#game-map`/
  `#game-panel`) renders inside; the stage is the largest 16:10 box that fits
  the viewport, centered with letterbox bars, and is a
  `container-type: size` query container. The board is a flex slot
  (`#game-map.game-map-filled`) that fills the space between HUD and panel on
  board-showing phases, so each phase renders the largest board that fits
  with no scroll or clip. New `tests/playwright/game_stage.spec.mjs` (3
  tests: 16:10 aspect at wide and tall viewports, content containment,
  board-slot fill). Makes the `HUMAN_GUIDANCE` "fill the canvas" rule
  mechanically checkable for M6/M7.
- Testing: new `tests/e2e/e2e_run_all.sh` step-runs mini_flow,
  full_game, balance_sim (`--import tsx`), balance_report, and the
  single-seed active walkthrough; calibration and sweep are excluded as
  explicit commands (sweep is documented as the release gate). Named
  `e2e_run_all.sh` rather than the plan's originally proposed `run_all.sh`
  because `tests/test_test_naming_conventions.py` enforces the `e2e_*.sh`
  prefix; `docs/E2E_TESTS.md` and the plan doc updated to match.
- Docs: new `docs/WALKTHROUGH_GUIDE.md` covering the harness
  layers, run commands, tick budgets with derivation, the 11-kind failure
  taxonomy with triage steps, an edge-case table, the calibration table plus
  its regenerate command, the sweep coverage table, and the
  strategy/mechanics separation and rule-change tolerance the harness relies
  on. Pointers added from `docs/USAGE.md` and `docs/E2E_TESTS.md`.
- UI: new `src/ui/solid/corral_purchase_panel.tsx`, an
  attempt-then-confirm corral purchase panel replacing the old notice-only
  `buyAtCorral` path. Walking in opens a modal (`[data-corral-panel]`,
  `role="dialog"`) covering all five outcomes
  (buyable/purchased/carrying/out_of_stock/insufficient_funds, exposed via
  `data-corral-outcome`) with price, stock, and funds read live from engine
  store state; `buy_mule` dispatches only on explicit confirm (Enter on the
  auto-focused Buy button, or a mouse click), arrow keys move roving focus
  (reusing `bindRovingFocus`), Escape dismisses, and movement is frozen while
  the panel is open. `.corral-purchase-*` CSS is sized off `#game-stage`
  cqw/cqh. Implementation bug caught during development: `justPurchased` had
  to be a `createSignal` set before dispatch -- a plain `let` let the outcome
  memo recompute too early and showed the wrong panel state.
- Testing: `hunt_wampus` and `assay_plot` develop plans now
  execute spatially instead of logging and ending the turn --
  `executeHuntWampus`/`executeAssayPlot` (`tests/e2e/walkthrough_overworld.mjs`)
  walk the avatar to the wampus or target plot and press the action key
  within budget; `executeArmAssay` (`tests/e2e/walkthrough_town.mjs`) drives
  the town-side assay-office arming leg as a walk-in-trigger door use;
  `e2e_walkthrough.mjs` gained `executeHuntWampusFromTown`/
  `executeAssayPlotFromTown` orchestration wrappers that own the
  town-to-overworld transition for each plan. `skipOpportunisticDevelopPlan`
  is removed -- no develop-plan kind is skipped anymore -- and the turn loop
  no longer force-ends after an opportunistic plan (only `end_turn` or
  `gamble_pub` end the turn now, matching the strategy layer's actual
  intent). The hunt_wampus wampus-blink race (the creature can despawn
  between plan decision and execution) is downgraded from a run failure to a
  re-decide, since it is a legitimate timing window rather than a walker
  bug. `walkBackToStreet`'s arrival check converted from the coarse
  `data-at-door` cell rect to a positional street-y predicate (the coarse
  check let the avatar stop short of the actual street row); `executeBuyMule`
  converted to drive the corral panel's confirm gesture instead of
  the retired direct-buy path. Reviewer PASS; 507/507 unit tests including
  new y-tracking gesture fakes.
- UI: new `src/ui/scenes/town_world.ts` replaces the
  9x5 town grid with a mode-composed world model. A storefront catalog plus
  NES-order street composition (`composeTownStreet`/`composeTownStreetForMode`/
  `townCapabilitiesForMode`) builds the town per game mode from town-layer
  capability flags (`landOfficeVisible`/`assayVisible`/`miningOutfits`):
  beginner composes Mining/Energy/Farm/Corral/Pub (5 facades, derived world
  width 964), standard adds the Land Office (6 facades, width 1136), and
  tournament is a catalog-ready entry (adds Assay, plus crystite in Mining)
  rendered by no current engine mode. World width, facade positions, the corral
  spawn, camera bounds, and the two endpoint exits all derive from the composed
  list. Movement uses solid-facade plus bounded-threshold collision
  (`resolveTownWalk`/`isTownPointBlocked`, collide-and-slide) and door-open
  hysteresis with single-fire threshold entry (`computeOpenDoors`/
  `townDoorAtThreshold`/`townExitAt`). The change is presentation-only and
  alters no engine mechanics; it corrects the retired grid, whose pass-through
  buildings and four exits modeled the wrong space (per
  `docs/THE_TOWN_ANALYSIS.md`). `src/ui/scenes/zones.ts` retired its
  town-interior constants (overworld helpers kept); `src/ui/scenes/town_scene.tsx`
  carries a fenced tsc-green shim with inert collision pending the
  camera cutover (see Decisions and Failures).
- UI: new `src/ui/scenes/town_camera.ts` -- a pure horizontal
  camera. `townCameraOffset(avatarWorldX, worldWidth, viewportWidth)` gives a
  soft-zone centered follow, clamps at both world ends, and returns offset 0
  (no scroll) when the composed world fits the viewport. Covered by
  `tests/test_town_camera.mjs` (8 cases).
- UI: new `src/ui/solid/town_chrome.tsx` -- a dedicated town
  HUD strip (draining time bar plus accessible numeric `Ticks left`, money, tow
  state, and nearest-storefront label) mounted while in town, so the
  development clock stays visible for the whole town visit (previously
  `DevelopPanel`, and thus `Ticks left`, was hidden in town). Sources match
  `DevelopPanel`/corral panel (single source of truth). The nearest-storefront
  label is a stub pending wiring.
- UI: `src/ui/scenes/town_scene.tsx` replaced the scattered
  `confirmingGamble`/`corralPanelOpen` booleans with one explicit
  `TownInteractionState` machine (street / door-opening / at-threshold /
  panel-open / leaving). Movement freezes structurally while a panel is open,
  and dismissing a panel repositions the avatar street-side of its door and
  re-arms the walk-in. The immediate `outfit_mule` dispatch is removed and gated
  behind a placeholder confirm panel; land and assay route to
  placeholder/confirm panels. Adds `data-town-state`. Reviewed
  PASS: attempt-then-confirm is enforced structurally, with no economic dispatch
  on entry anywhere.
- UI: shipped the town's Land Office and Assay Office
  transaction panels, replacing the retired placeholder action-panel
  path. New `src/ui/solid/land_office_panel.tsx` is a purely informational
  in-stage modal (`role="dialog"`, roving focus, focused Dismiss, Escape
  dismiss) that dispatches nothing on entry or Dismiss -- its single
  `informational` `LandOfficeOutcome` truthfully describes that new land
  arrives through the colony-wide Land Grant and Land Auction phases, not a
  per-town sale, and it composes only in standard mode and up (where
  `landOfficeVisible` is true). New `src/ui/solid/assay_office_panel.tsx` is an
  attempt-then-confirm modal with `idle`/`armed`/`sample_ready` states whose
  `onArmAssay` fires only on an explicit Arm confirm; its facade turns on in no
  shipped mode, so it is built ahead of a future mode (like the door and
  arm-and-reveal flow before it). `src/ui/scenes/town_scene.tsx` now routes the
  Land Office and Assay Office doors to these panels.

### Behavior or Interface Changes

- UI: rotated the goods-auction arena
  (`src/ui/solid/auction_screen.tsx`) to a landscape horizontal price track --
  buyers advance rightward from the left as bids rise, sellers leftward from
  the right as asks fall, meeting mid-track where trades fire; store buy/sell
  prices anchor the left/right track ends. Players now occupy stacked
  horizontal lanes (price drives the x axis, was y); the sit-out "line judge"
  sideline moved to the bottom edge. Presentation-only: engine intents
  unchanged. New arena geometry (`TRACK_LENGTH` 480 x `TRACK_BREADTH` 260)
  handed to the canvas-fill CSS work; avatars expose per-frame `data-x`
  (moving price coord) alongside `data-y` (fixed lane). Readout-variant
  decision recorded in `docs/active_plans/decisions/auction_readout_variant.md`.
  Two predicted-red playwright motion polls await the spec update.
- UI: town doors now open on approach and close on
  retreat, and walking through an open doorway is the complete entry action
  -- new `computeOpenDoors`/`resolveTownWalkWithDoors` in
  `src/ui/scenes/town_layout.ts` (hysteresis: opens within 48px of the door,
  closes past 68px) and `refreshDoors`/`detectWalkIn` (edge-triggered at
  `DOOR_ENTER_Y`) in `src/ui/scenes/town_scene.tsx`. Enter/Space door-entry
  handling is removed; Enter remains only to confirm the pub gamble dialog.
  Doors expose `data-door-state="open"|"closed"`; hint strings rewritten to
  describe walk-in entry. The land-office counters are entered by walking
  north into the podium; the corral's smithore bay only outfits a mule when
  the player is carrying an unoutfitted one.
- UI: the goods-auction screen now fills the 16:10 stage
  -- `.auction-screen` sized to `min(94cqw, 1400px)`, `.auction-track-svg`
  to `min(92cqw, calc(37cqh * 480 / 260))` preserving the track's
  aspect ratio, the price readout's width cap removed, and the players grid
  switched to `auto-fit minmax(11rem, 1fr)` (`src/style.css`). Measured
  honest screen-only height coverage is 76.6%/84.5%; the visual pass
  accepted this with a content-based rationale rather than chasing a
  coverage threshold.
- Testing (colony-failure placement waiver): the sweep gate waives
  the per-run `verifiedPlacements >= 1` invariant when the game ended via the
  engine's colony-failure rule (`ScoringPayload.colonyFailed` threaded
  through `report.write` into sweep evaluation); the waiver is recorded
  honestly in the run's reasons (`"placement waived: colony failure at round
N"`), and matrix-level placement coverage is unchanged. Files:
  `tests/e2e/e2e_walkthrough.mjs`, `walkthrough_report.mjs`,
  `e2e_walkthrough_sweep.mjs`, `tests/test_walkthrough_sweep.mjs`.
- Testing (participation invariant second amendment): the per-run
  auction-participation check is demoted from a hard invariant to a logged
  warning -- a held-role participant whose AI price matches from the opening
  tick legitimately pushes no intents and may never trade (seed 3 flaked
  around 2/3 of runs); `humanTurnsCompleted` stays a hard invariant, and
  trade-occurrence proof is owned by the sweep's `matrixCoverage`. Files:
  `tests/e2e/walkthrough_exec.mjs`, `tests/test_walkthrough_plan_exec.mjs`,
  the plan doc.
- UI: `.land-grant-panel` widened to `92cqw` with
  `box-sizing: border-box`; the hint text and Pass button are grouped into a
  new `.land-grant-status-row`.
- UI: `.land-auction-panel` widened to `min(92cqw, 1400px)`;
  `land_auction_panel.tsx` regrouped into three columns
  (`.land-auction-info`/`.land-auction-status`/`.land-auction-side`), with
  all selectors, ids, and `data-` attributes preserved.
- UI: `.production-panel` widened to `92cqw` with
  `box-sizing: border-box`; `.production-list` switched to a grid
  (`repeat(auto-fit, minmax(260px, 1fr))`). The same fix round added the
  missing `box-sizing: border-box` to both the land-grant and production blocks
  (the claimed coverage had been an accidental overshoot without it).
- UI: `.scoring-panel` merged into a single rule, widened
  to `94cqw`, `min-height` tuned from `86cqh` to `84cqh` after measuring the
  86 value exactly flush (0.00px margin) against `#game-stage`'s
  `overflow: hidden` at 1200x1000 (ladder: 86 -> 0.00px, 85 -> 0.50px,
  84 -> 8.00px); `84cqh` buys 8px of real margin. New parametrized
  containment test in `tests/playwright/scoring_screen.spec.mjs` (a
  `playToScoring` helper extracted; `#game-panel` inside `#game-stage` at
  1600x900 and 1200x1000, 1px slack). The honest 84% height result versus
  the 85% starting hypothesis is accepted per the thresholds-are-proxies
  directive.
- UI: `WALKER_SPEED_PX_PER_SEC` raised from 80 to 320
  (`src/ui/scenes/walker.ts:60`) -- a gameplay timing change, not
  presentation. The plan's `[120, 160]` hypothesis failed by 60-110% against
  the food-starved-minimum tick budget once measured live: the corral
  purchase panel (walk-in -> confirm -> Escape -> walk-back-to-street) and
  the no-longer-turn-ending hunt_wampus/assay_plot develop plans both added
  real wall-clock to the develop-turn errand after the original 80 px/s
  mapping was chosen, and this is the mechanism behind the sweep's
  degradation from 6/6 to 2/6 (a starved or partial-fed develop turn's
  `ticksRemaining` now hits 0 mid-walk, tearing the scene out from under the
  walker and surfacing as a `walk_stall` at an arbitrary door). Calibrated
  by measuring the far-corner errand live (`?speed=1`, seed 33) at 80/120/
  160/240/280/320/340/360/400 px/s: 320 is the lowest value clearing the
  plan's 10% starved-budget margin rule (thin, ~10-11% across 5 runs) while
  keeping walk-in door-reach reliable; 340+ starts failing door-reach itself
  (`WALK_TAP_MS`'s fixed 120ms tap overshoots at that speed, a harder
  failure than a thin margin, and out of this package's touch points).
  Evidence table and the tap-length follow-on recorded in
  `docs/active_plans/audits/mule_trip_timing.md`.
- UI: `src/ui/scenes/town_scene.tsx` rewritten to render the
  mode-composed street from `town_world.ts` through `town_camera.ts` -- a fixed
  576-wide camera-window viewBox with a per-frame imperative world-group
  translate. The interim tsc-green shim is removed, so real collision, door
  hysteresis, single-fire walk-in, and two-endpoint exits are live (closing the
  no-collision window). The scene exposes world-coord data attributes
  (`data-town-avatar-x`/`-y`, `data-town-camera-offset`, `data-town-world-width`);
  door markers keep `data-door-for`/`data-door-state`. Outfit doors keep
  immediate dispatch, the Land Office is a neutral notice, and endpoint exits
  map left->west/right->east for now. Reviewed
  PASS: camera and SolidJS reactivity verified leak-free (imperative transforms
  on plain refs, no `createEffect`, correct `onMount`/`onCleanup`).
- UI: human develop turns now START in town at the corral
  street position with the timer running (was: on the overworld beside town),
  matching the original NES loop -- `src/ui/scenes/human_develop_layer.tsx`
  (`inTown` defaults true). The two endpoint exits map to `overworldReturnCell`
  on the matching side.
- UI: relocated the town `End turn` control out of
  `src/ui/scenes/town_scene.tsx`'s own footer and into the town chrome strip
  (`src/ui/solid/town_chrome.tsx`) as a small secondary control, so the Pub
  door stays the primary walk-in-plus-confirm turn-end destination and the
  button no longer competes with it as "the" way to end a turn. The
  `[data-action="develop-end-turn"]` hook and the `.town-end-turn-button` class
  are both preserved (a new `.town-chrome-end-turn-button` layers the smaller
  chrome-scale sizing on top), so the existing Playwright and E2E specs that
  locate the old town-scene button keep finding it in the chrome strip.

### Fixes and Maintenance

- UI (town modularization): split the two largest town modules into
  focused siblings, a behavior-preserving pure extraction. `town_scene.tsx`
  (1414 -> 745 lines, now the shell) split into `town_scene_render.tsx`
  (presentational SVG) and `town_interaction.ts` (`TownInteractionState` plus
  pure transition helpers); `town_world.ts` (1030 -> 588) split into
  `town_collision.ts` (movement clamp plus door-open hysteresis). No new signals
  or effects; the imperative transforms and the disposed-rAF guard are intact.
  The town suites stayed byte-for-byte green before and after (98 playwright / 36
  town unit). `town_scene.tsx` stays at 745, an irreducible shell -- going lower
  needs relocating the rAF/camera writes, out of scope.
- Testing (M3 gate): M3 milestone gate green -- `check_codebase.sh`
  5/5 checks pass after a prettier `--write` fix round on
  `tests/e2e/walkthrough_town.mjs`; Playwright 73/74 with the one failure
  (`town_doors.spec.mjs` "open door fires interaction", sweep-cursor timing)
  confirmed flaky via a 9/9 `--repeat-each=3` rerun.
- UI: the shared narrow-panel CSS rule in `src/style.css`
  split into four per-panel blocks (land grant, land auction, production,
  scoring), a pixel-identical seam split ahead of the per-panel
  edits.
- Testing (M1/M8 gate follow-up): prettier formatting applied to
  `tests/e2e/walkthrough_helpers.mjs` and
  `tests/test_auction_solvent_fallthrough.mjs` (flagged by
  `check_codebase.sh` `format:check` during the M1 milestone gate;
  whitespace-only).
- Engine: the goods-auction matcher (`src/engine/auction.ts`)
  now ranks all bids (price desc, lowest playerId) and asks (price asc,
  lowest playerId) and scans bid-major/ask-minor for the first crossed,
  solvent pair, skipping store-to-store. An insolvent buyer or out-of-goods
  seller withdraws from that tick's scan instead of blocking solvent lower
  bidders and the store's standing offer (replaces the single-best
  bestBid/bestAsk that treated a crossed-but-insolvent top pair as "nothing
  crossed"). Behavior is unchanged whenever the top pair is solvent.
  Documented in `docs/RULE_SOURCES.md` (new "Traversal and matching"
  subsection).
- Testing (truncation accounting fix): `activeDriveDevelop` now
  decides the plan before the tick-reserve guard runs; a turn cut at the
  reserve counts as truncated only when the cut plan commits budget
  (buy/outfit/place, via a new `planCommitsBudget` predicate) -- a
  `gamble_pub`/`end_turn`/`hunt`/`assay` cut is the natural end of the turn.
  Root cause of the earlier 5/6-11/12 truncation rates was miscounting turns
  that were ending anyway (the develop AI returns `gamble`, not `end_turn`,
  when out of moves); zero gameplay change. Files:
  `tests/e2e/walkthrough_overworld.mjs`, `e2e_walkthrough.mjs`,
  `tests/test_walkthrough_overworld.mjs`.
- Testing (stale run-command headers): `tests/e2e/e2e_balance_sim.mjs`
  and `e2e_walkthrough.mjs` header comments corrected to `node --import tsx`
  (plain `node` fails on extensionless `.ts` sibling imports).
- Testing (attribution correction): the 2 predicted-red motion
  polls in `auction_scene.spec.mjs`/`game_flow.spec.mjs` were caused by the
  auction's landscape rotation (price axis moved from `cy` to `cx`), not by the
  later CSS stage-fill work as earlier notes suggested.
- Docs: `docs/THE_TOWN_ANALYSIS.md` amended from a fixed
  seven-facade street to the mode-composed model (storefront catalog plus
  per-mode composition, derived width, no inactive facades), citing the
  2026-07-10 user decision, so the analysis doc and the rebuild plan give coders
  one consistent geometry authority.
- UI: fixed a resource leak in
  `src/ui/scenes/town_scene.tsx` -- the rAF loop could outlive scene teardown
  when an endpoint exit synchronously unmounted the scene mid-frame, leaving an
  uncancellable zombie loop; a `disposed` flag set in `onCleanup` and checked
  before each reschedule closes it.
- UI: rewrote the stale develop and in-town tutorial hints to
  describe the walk-in-then-confirm model -- `DevelopPanel` in
  `src/ui/solid/game_screen.tsx` and the in-town `TutorialHint` in
  `src/ui/scenes/human_develop_layer.tsx` now say a shop door opens as you
  approach, walking through it opens the shop panel, and you confirm inside the
  panel (Enter, or click the focused action) to buy or outfit -- walking through
  alone changes nothing. Both name the Pub as the turn-end destination and the
  small chrome-strip `End turn` control. Removed the resolved walk-in-hint TODO
  comment from `game_screen.tsx`.

### Removals and Deprecations

- UI: deleted `src/ui/scenes/town_layout.ts` and
  `tests/test_town_layout.mjs`, superseded by `src/ui/scenes/town_world.ts` and
  `tests/test_town_world.mjs`.
- Testing: retired the obsolete grid-topology specs
  `tests/playwright/town_doors.spec.mjs` and
  `tests/playwright/town_gallery.spec.mjs`, superseded by
  `tests/playwright/town_street.spec.mjs`.
- Testing: retired (deleted)
  `tests/playwright/town_scene.spec.mjs` after re-homing its 3 skipped cases --
  the corral-buy-plus-outfit-plus-place errand moved to
  `tests/playwright/town_street.spec.mjs` and was un-skipped; the pub
  confirm-plus-Escape case was dropped as superseded by `pub_gamble.spec.mjs`;
  and the assay arm-plus-reveal case was dropped (assay is unreachable in every
  shipped mode, covered instead by door-absence assertions).

### Decisions and Failures

- UI: recalibrated the `visual_render` "town scene fixture"
  coverage floor from 0.4 (calibrated to the retired gold-grid town's 0.7363) to
  0.24, because the mode-composed scrolling street with its dark night-industrial
  palette honestly measures ~0.306 (fixture) / ~0.341 (in-game): its sky, plate,
  and container colors sit within deltaE-8 of `bgDeep` and read as background.
  Rather than weaken the palette gate, registered the town street colors `#26241e`
  and `#1c1a16` as `palette.ts` tokens (`townStreet`, `townStreetWorn`) so palette
  conformance passes at 0.9962 (floor 0.95) -- fix-the-design over hiding the
  symptom. `visual_render` now 7/7.
- UI (polish): non-blocking items logged rather than blocking the
  town rebuild -- door-panel-fill vs plate contrast (1.99:1) and emblem badge
  stroke (1.61:1) fall below the 3:1 non-text bar, but door state stays legible via
  a passing stroke (3.61:1) plus the open/close animation; the chrome
  nearest-storefront label remains an empty stub deferred to a later polish pass;
  and the town camera is a stateless 1:1 tracker, with a stateful dead-zone "feel"
  option noted for a later rollout.
- Docs: the user rejected an agent-proposed "Visual acceptance is a
  side-by-side against the planet_mule painter" review rule as unapproved
  ("I did not approve that rule, remove it"); the entry is removed from
  `docs/HUMAN_GUIDANCE.md`. The approved standing guidance is unchanged:
  visual style follows Planet M.U.L.E.
- UI (M5): discovery that changed the design -- the pre-stage layout
  never actually fit HUD+board+panel in the viewport on big-panel phases; it
  overflowed by ~56px and relied on `#screen-game` scrolling. Inside a fixed
  16:10 no-scroll stage, the plan's "overworld and town scenes render
  identically" criterion was therefore unachievable alongside "no clipped
  content"; a first fixed-reserve attempt (360px) shrank the board ~18% at
  common viewports and a corrected 280px reserve clipped the HUD by 56px at
  every tested viewport. Resolution: flex-slot design -- the board fills the
  space HUD+panel leave free, equal to the old render only where the old
  render already fit without scrolling. M5's exit criterion is amended to
  "largest board that fits with no scroll/clip". Follow-up filed: slim the
  develop panel (~90px of duplicate hint + padding) after the town-door work
  lands to grow the develop-phase board.
- Testing: final release sweep GREEN 2026-07-10T05:03Z -- exit 0, 6/6 runs
  pass across `{1, 3, 7} x {beginner, standard}`, `matrixCoverageSatisfied`
  in both modes, seed-7 legs pass with colony-failure placement waivers;
  seed 3 beginner shows legitimate run-to-run variance between a full
  6-round game and an early colony failure at round 2 (wall-clock gesture
  timing affects the economy), and both shapes pass the gates. The
  walkthrough harness plan (M1-M8, 17 work packages, 33 patches) is
  complete; during execution the harness surfaced and drove fixes for real
  product bugs: the SolidJS stale-`Show` silent crash, the auction
  commit-gate stall, the documented `bestBid`/insolvent-bidder engine bug
  (see `docs/TODO.md` follow-up), sit-out incoherence, and the corral
  hint-string trap.
- Testing (fix round): a contract change -- the corral walk-in no
  longer buys directly -- broke the E2E walker's `executeBuyMule`. Fixing it
  unmasked a latent bug: `walkBackToStreet`'s arrival check used
  `data-at-door`, whose coarse cell rect includes interior positions, so the
  avatar never actually returned to the street row and the next door seek
  stalled against a wall jamb (deterministic, reproduced on 4 of 6 seed/mode
  combos). Fix in flight at the walker layer (a positional street-y
  predicate replacing the `data-at-door` check); tracked under M8.
- Testing (USER DECISION, closure): "the deterministic walker is
  suspect, do not keep as a gate" -- the walkthrough sweep
  (`tests/e2e/e2e_walkthrough_sweep.mjs`) is demoted from a release gate to a
  diagnostic. After the speed change (80 to 320 px/s), the sweep's
  earlier scattered non-deterministic stalls became a deterministic stall on
  seeds 1 and 3 at the counter-smithore door ("town avatar left the street"),
  suspected to be a walker-harness artifact -- the seek/gesture constants
  (`WALK_TAP_MS`, overshoot correction) were tuned against the old 80 px/s
  speed and have not been retuned for 320, which the audit doc already
  flagged as a follow-on. Seed 7 passes both modes. M2 and M8 close on unit
  suite (`check_codebase.sh` 5/5, 507/507 units), Playwright suite (78 pass +
  1 known parallel-load flake), `e2e_run_all` 4/5, and the calibration
  evidence table instead of the sweep; the sweep sits at 2/6 with root-cause
  diagnosis continuing as a non-blocking follow-up (see `docs/TODO.md`
  "Developer and testing").
- Docs: the bug-fixes and UI-fixes plan is CLOSED. All eight
  milestones M1-M8 are done (M2 and M8 closed under the recorded sweep-gate
  demotion above, see
  `docs/active_plans/decisions/sweep_gate_demotion.md`). `docs/HUMAN_GUIDANCE.md`
  kept the verified source-of-truth-hierarchy and town-interaction entries; a
  close-out agent's proposed "Visual acceptance is a side-by-side against the
  planet_mule painter" entry (from the 2026-07-10 "polish a turd" escalation)
  was not user-approved and was removed (see the 2026-07-10 Decisions and
  Failures entry below). Final consistency
  sweep across `docs/ROADMAP.md`, `docs/TODO.md`, and `docs/WALKTHROUGH_GUIDE.md`
  closed the fixed known-bug entries (auction fallthrough, town gaps, walker
  executors) and refreshed the walker executor descriptions. Three deferred,
  user-requested addenda are filed as ROADMAP near-term entries, not part of
  this plan's closure: goods-auction rebuild to the `AuctionPainter`
  composition, town rework to the NES/planet_mule walk-into-buildings entry
  model, and a species + color selection screen. The tracker moved from
  `docs/active_plans/active/` to `docs/archive/bug_fixes_ui_fixes_plan.md`.
- UI (interim state): retiring the 9x5 model left
  `src/ui/scenes/town_scene.tsx` on a fenced shim with inert
  collision to keep `tsc` green until the camera cutover lands; the interim
  state is accepted and tracked to the camera cutover.
- UI (HIGH review finding): a quality review caught an
  open-door entry-zone overshoot -- the entry band extended about 6px past the
  shallow threshold notch into the street lane, firing walk-in entry
  prematurely. Fixed by capping the entry zone at the notch's own depth
  (`Math.min(DOOR_ENTRY_BAND_PX, facade.thresholdRect.height)`) and reading the
  notch top from the per-facade rect, then pinned by a regression case.
- Testing (removal, bounded dual-window): deleting `town_layout.ts`
  orphaned the E2E walker helper imports, so 8 `tests/test_walkthrough_*.mjs`
  fail to load until the walker is migrated -- an accepted bounded
  dual-window. Full `check_codebase.sh` 5/5 is an M6 gate; M1-M5 gate on the
  affected town suites (green).
- UI (follow-up, tunable coherence): `DOOR_ENTRY_BAND_PX` (30) currently
  exceeds `TOWN_THRESHOLD_DEPTH` (24), so the `min()` cap above is actively
  engaged; reconcile the two so they express one intent.
- UI: the town camera ships as a stateless 1:1 centered
  tracker; a stateful dead-zone camera (nicer feel) is a noted follow-up for the
  M3 visual review and rollout, not implemented now.
- Testing: the facade-label legibility ladder is scoped to the
  game's supported viewport widths (1200x750 minimum and up); 320/480/768 are
  not included because they fall below the supported minimum (user, 2026-07-10).
  This is the supported-target scope, not a defect.
- UI: the `at-threshold` state is modeled but effectively
  unobservable -- the walk-in latches `panel-open` on the same frame -- so it is
  kept for completeness and the specs do not assert it.
- Testing: the six-spec town-first navigation fix used
  per-spec edits (no shared helper), matching earlier precedent, because the
  land-claim and post-turn steps differ across specs; a shared `develop_nav.mjs`
  helper is a possible future refactor.
- Testing: `corral_purchase`'s occasional full-parallel flake
  is a pre-existing land-grant sweep-cursor timing race under CPU contention,
  not town-caused.
- UI: modeled the Land Office as a one-member `informational`
  outcome union because no per-town land-sale engine state exists -- new land
  arrives only through the colony-wide Land Grant and Land Auction phases, so
  the panel truthfully describes that instead of inventing a storefront sale,
  and the one-member shape keeps the same outcome-driven form as the corral and
  outfit panels so a later engine change only adds a member. The Assay Office
  panel is built ahead of an unshipped mode: its facade turns on in no shipped
  engine mode today, so the panel exists but is not yet reachable in live play.

### Developer Tests and Notes

- Testing: rebuilt the E2E walker town executors
  (`tests/e2e/walkthrough_town.mjs`, `walkthrough_helpers.mjs`) to DISCOVER the
  active mode-composed street via `composeTownStreetForMode` and drive the
  shipped world-coordinate town DOM: `data-town-avatar-x`/`-y` door seeking,
  gap-proportional convergence, panel-confirm gestures, corral-spawn turn start,
  and absent-destination skips. Retired the old `town_layout.ts` / `TOWN_CELL_PX`
  / `data-at-door` grid model from the harness. `tests/test_walkthrough_town.mjs`
  is 12/12 and both single-seed town legs are green.
- Testing: filed an automated visual-acceptance report at
  `docs/active_plans/reports/town_street_visual_acceptance.md` covering both game
  modes at the supported viewports (1200x750 and 1280x800) with the avatar at
  spawn, mid, and endpoint positions. Three-second-read PASS: composition confirmed
  (beginner street genuinely shorter, no dead gap where the Land Office sits, zero
  grid lines) and contrast passes (labels 13.5:1, prices 8.9:1).
- Testing (M1 milestone gate): M1 closed GREEN -- `npx tsc --noEmit` clean;
  `check_codebase.sh` typecheck/lint pass; `e2e_run_all` 5/5 (mini_flow,
  full_game, balance_sim with all M9/M10/M11 bands satisfied,
  balance_report, walkthrough); walkthrough sweep 6/6 seeds/modes, empty
  failure taxonomy, `matrixCoverageSatisfied` in both modes.
- Testing: added `tests/test_auction_solvent_fallthrough.mjs`
  pinning `selectTrade`'s crossed+solvent fallthrough invariant on both buyer
  and seller sides (player-pair and store-fallback variants), plus an
  equivalence case and a bid-id tie-break case; strengthened
  `tests/test_auction_termination.mjs`'s sold-out-seller case to assert an
  exact derived trade count (2) instead of `>= 1`, removing the stale
  bestBid-matching-quirk comment.
- Testing: re-verified the goods-auction dead-window rate at
  100 seeds/mode post ranked-offer matcher -- 0.7% beginner, 0.8% standard,
  both well under the 0.2 gate, dead-land-auction rate still 0.0% in both
  modes; timing constants unchanged. Updated the stale figures in
  `docs/TODO.md` and `docs/RULE_SOURCES.md`.
- Testing: extracted the shared overshoot-correcting seek
  core `seekAvatarToTarget` in `tests/e2e/walkthrough_helpers.mjs`
  (`walkTownAvatarToDoor` and `walkOverworldAvatarToCell` are now thin
  spec-object wrappers, external signatures unchanged); `MAX_WALK_TAPS` is a
  single exported constant imported by `tests/e2e/e2e_walk_calibration.mjs`
  instead of a redefined copy. 133/133 walkthrough unit tests green.
- Testing: new `tests/playwright/town_doors.spec.mjs`
  covers wall-stop collision (held against a building via SVG transform
  polling), a far door staying closed, and open-door entry firing with no
  keypress; converted 6 existing door-entry cases in `town_scene.spec.mjs`
  and `pub_gamble.spec.mjs` from a Space-press-at-door step to a held-
  ArrowUp walk-in, matching the walk-in interaction model.
- Testing: `auction_scene.spec.mjs` and
  `game_flow.spec.mjs` motion polls converted from predicted-red pixel
  guesses to `data-x` reads with strict directional assertions, plus a new
  sideline `data-y` assertion; visual acceptance filed at
  `docs/active_plans/reports/auction_landscape_visual_acceptance.md` --
  zero clipping pixel-verified at 1200x1000, top-anchored coverage
  83.7%/93.1% including the HUD, no threshold-chasing artifacts; a ~16%
  trailing gap below the intent buttons at 1600x900 flagged as
  non-blocking polish.
- Testing: the walker's town commerce executors
  (`buy_mule`, `outfit_mule`, `gamble_pub`) converted from action-key
  presses to the walk-in gesture -- x-seek to the door's street
  column, wait for `data-door-state="open"`, then a new
  `walkTownAvatarNorthUntil` helper (built on the shared
  `seekAvatarToTarget` core) presses north until the door's interaction
  fires; a new `walkBackToStreet` returns the avatar to the street row
  after a successful buy/outfit, fixing a live-found stall where a
  neighboring building's jamb blocked the horizontal x-seek while the
  avatar was still north of the street. The pub keeps Enter/Space only for
  the turn-ending gamble CONFIRM dialog. Files:
  `tests/e2e/walkthrough_town.mjs`, `walkthrough_helpers.mjs`,
  `tests/test_walkthrough_town.mjs` (fake-page gesture model updated), plus
  `tests/e2e/e2e_walk_calibration.mjs` (now imports the exported
  `MAX_WALK_TAPS` instead of a local copy). Evidence: 133/133 unit tests
  pass, `e2e_run_all` 5/5, sweep 6/6 with `matrixCoverageSatisfied`.
- Testing: new `tests/playwright/corral_purchase.spec.mjs`
  (5 tests: panel figures render with the exact per-outcome message; before/
  after stock and funds deltas on a confirmed purchase; input coverage for
  mouse-click confirm, Enter-on-prefocused confirm, and arrow-moves-focus-
  then-Enter-declines with a `toBeFocused` proof); the existing corral test
  in `town_scene.spec.mjs` converted from a notice check to the confirm
  gesture. `out_of_stock` and `insufficient_funds` are documented as
  impractical to reach through play (`MULE_STOCK_CAP` 14, `MULE_BASE_PRICE`
  100 vs `STARTING_MONEY` 1000 needs roughly 10-14 buy cycles, and there is
  no test-only state hook) -- accepted as an honest documented gap since the
  untested branches share the same tested render path as the covered ones.
- Testing: phase-panel visual acceptance ACCEPTED across
  the four phase panels at two viewports each; report filed at
  `docs/active_plans/reports/phase_panels_visual_acceptance.md`. Land grant,
  land auction, and production are judged as board phases (the map is the
  fill surface, so slim panel strips are by design); scoring is judged as
  the full-panel phase (94%/84% coverage). No dead-margin pathology and no
  threshold-chasing artifacts found; three non-blocking polish candidates
  recorded (see `docs/TODO.md`).
- Testing (disposition): executor unit coverage is complete
  -- 20/20 `tests/e2e/walkthrough_overworld.mjs`-side tests including
  catch/reveal verification, budget-exhaust, and the hunt_wampus blink-race
  re-decide; 13/13 town-side tests covering `executeArmAssay`. The
  sweep-counter/single-seed natural-occurrence proof (identifying one
  seed/mode per plan kind that reliably produces `hunt_wampus`/`assay_plot`)
  is deferred alongside the sweep gate demotion recorded above; a
  forced-plan-hook follow-up (strategy-layer only, so it drives the same
  production dispatch/executor path as a naturally generated plan) is
  recorded in `docs/TODO.md`.
- Testing: new `tests/test_town_world.mjs` (16 cases):
  per-mode presence/absence composition, NES order, derived world width greater
  than the viewport, corral spawn, two-exit topology, street-lane reachability
  flood-fill, facade-jamb/closed-door/open-door collision bounds, door
  hysteresis, single-fire entry, composition purity, a catalog-level totality
  property test over capability-flag combinations, the negative
  regression "the avatar cannot walk through or behind any storefront" against
  the retired 9x5 walk-through bug, and an open-door entry-zone boundary
  regression. `tests/test_zones.mjs` trimmed to overworld-only cases (7) after
  `zones.ts` retired its town constants.
- Testing: new `tests/playwright/town_street.spec.mjs` (7
  cases): camera-offset change plus both-end clamp, per-mode facade composition
  and NES order for beginner and standard, exactly two endpoint exits, chrome
  timer visible and decreasing, and facade-label legibility at supported
  viewport widths. The three interaction cases in
  `tests/playwright/town_scene.spec.mjs` are marked `test.skip`.
  Known bounded windows at M2: 8 `tests/test_walkthrough_*.mjs`
  still fail to load pending the walker migration; `pub_gamble.spec.mjs`
  interaction specs stay red until re-homed; the `visual_render.spec.mjs` town
  coverage floor is pending recalibration once real facade art ships.
  `corral_purchase.spec.mjs` PASSES (it never depended on the retired
  door-column topology), correcting the plan's earlier known-red assumption.
- Testing: added 8 entry-state-machine specs to
  `tests/playwright/town_street.spec.mjs` (single-fire walk-in, corral/outfit
  attempt-then-confirm no-dispatch-on-entry, Escape returns street-side, inert
  street Enter/Space, corral spawn, two endpoint exits, and hold-Up
  behind-facade negatives in both modes), taking `town_street` to 17/17. Fixed
  town-first develop-turn navigation across the Playwright suite
  (`town_street`/`corral_purchase`/`pub_gamble`/`game_flow`, plus follow-on
  `ai_actor_live`/`dpad`/`event_banner`/`land_auction`/`overworld_scene`/
  `reload_resume`): each now reaches `#town-scene` before ending the turn or
  walking to an overworld exit, replacing the retired `.overworld-svg`
  overworld-avatar wait and `.develop-end-turn-button` with
  `.town-end-turn-button`; `pub_gamble`'s dead `data-at-door` walk became a
  DOM-derived door-center homing walk. Full Playwright suite green: 89 passed /
  3 skipped (old topology cases awaiting re-homing) / 0 failed.
- Testing: rewrote the
  `tests/playwright/town_street.spec.mjs` transaction-panel specs against the
  real outfit and Land Office panels, replacing the retired
  `[data-town-action-panel]` placeholder locators. Added per-mode (beginner and
  standard) side-effect-free-until-confirm coverage for the corral, the
  mining/energy/farm outfitters, and the standard-only Land Office, plus
  office-absence door assertions and a non-brittle hint-contract assertion. Full
  Playwright suite after the re-home: 98 passed, 0 failed, 0 skipped
  (`town_street.spec.mjs` 26 passed).
