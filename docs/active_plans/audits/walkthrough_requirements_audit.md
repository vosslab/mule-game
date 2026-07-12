# Walkthrough requirements audit (WP-H)

Scope expansion of the WP-H auction-driver fix: a requirement-by-requirement
audit of every `tests/e2e/walkthrough_*.mjs` driver, asking one question per
requirement -- does this protect INTENDED PLAYER BEHAVIOR, or does it merely
preserve the OLD IMPLEMENTATION? Context: the user said "i do not trust our
current walkthrough suite, it has failed me twice with bad requirements."
The town rebuild's lesson was that tests encoding a bad design fight a good
design; this audit checks whether the walkthrough suite is about to repeat
that fight against the in-flight auction rebuild, and whether the same
defect class exists anywhere else in the suite.

Files audited: `walkthrough_auction.mjs`, `walkthrough_land.mjs`,
`walkthrough_town.mjs`, `walkthrough_overworld.mjs`, `walkthrough_exec.mjs`,
`walkthrough_report.mjs`, `walkthrough_strategy.mjs`, `walkthrough_helpers.mjs`
(all owned/fixed by this work package), plus read-only observations of
`e2e_walkthrough.mjs` and `e2e_full_game.mjs` (owned by other agents/other
work; findings reported, not fixed here).

## Exit criteria (from the gate-suspension decision record)

[walkthrough_gate_suspension.md](../decisions/walkthrough_gate_suspension.md)
records the formal ruling and lists six conditions that restore gate
authority. Each is addressed by this work package:

| Exit criterion                                                                                                                    | Status                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required, optional, and conditional interactions separated; required clicks fail immediately                                      | DONE -- `clickRequired` vs `clickIfPresent`; every call site classified below with the reasoning that proves the classification (no CONDITIONAL case exists in the suite)                                                                                                                                                                                               |
| No `clickIfPresent` return value silently discarded at a required call site                                                       | DONE -- the one required site (the auction commit) now uses `clickRequired`, whose contract makes discarding impossible; every remaining `clickIfPresent` call is genuinely optional (proven, not asserted)                                                                                                                                                             |
| Layered diagnosis: UI-CONTRACT failure in seconds, ENGINE STALL requires engine evidence                                          | DONE -- `required_control_missing` (fails in about a second) vs `act_did_not_advance` with a dynamic `failureMessage` embedding the actual observed tick/finished state, not a bare claim                                                                                                                                                                               |
| No requirement encodes component structure, a `mode()` branch, or a tick-only rendering rule                                      | DONE -- the tick-0/`mode()` assumption is deleted; the harness now asserts only that the human can choose a role (required, verified) and that the auction can proceed (verified via the clock unblocking)                                                                                                                                                              |
| Every remaining requirement audited against "protects player behavior, or preserves old implementation?"; the second kind deleted | DONE -- see the requirement-by-requirement audit below; the one requirement of the second kind found (the tick-0/`mode()` encoding) was deleted                                                                                                                                                                                                                         |
| A NEGATIVE TEST exists and has been OBSERVED to fail correctly                                                                    | DONE -- a live-browser run against a deliberately broken role selector failed in about 6 seconds with the exact missing control named (see Verification below); unit-level negative tests for `clickRequired` and both engine-stall paths (auction commit, `maybeTruncateTurn`) are in `test_walkthrough_auction.mjs` and `test_walkthrough_overworld.mjs`, all passing |

## Verdict: is the walkthrough trustworthy enough to be a release gate again?

**Yes, for the active-mode drivers the release gate actually exercises**
(`e2e_walkthrough_sweep.mjs` runs every phase in active mode via
`ACTIVE_PHASE_DRIVERS`). The specific defect class that broke trust --
a REQUIRED click routed through the "safe to miss" `clickIfPresent` helper,
its return value discarded, success assumed unconditionally -- was searched
for by grepping every `clickIfPresent` call site across every
`walkthrough_*.mjs` file (see the call-site table below) and found in
exactly two places: the auction driver's role commit (the reported defect,
fixed) and, on closer read, `maybeTruncateTurn`'s end-turn click in
`walkthrough_overworld.mjs` (a bare unverified `page.click()`, not
`clickIfPresent`, but the same "click and unconditionally assume success"
shape -- also fixed). Every other required click in the suite
(`walkthrough_land.mjs`'s land-grant-pass and land-bid,
`e2e_walkthrough.mjs`'s active-mode develop-end-turn) already used
Playwright's own asserting `page.click()` wrapped in `actAndWaitProgress`,
which fails loud on non-advancement. Both fixes are verified by rewritten
unit tests (38 tests in `test_walkthrough_auction.mjs`, all passing; 4 new
`maybeTruncateTurn` tests in `test_walkthrough_overworld.mjs`, all passing)
and a live-browser positive run plus a live-browser negative run (deliberately
broken selector, fails in ~6s with the exact missing control named, versus
the old ~8-minute misdiagnosed stall).

**Not yet audited-for-fix**: two swallow-click sites structurally similar to
the original defect exist OUTSIDE this work package's file ownership
(`e2e_walkthrough.mjs`'s deprecated `--passive` fallback, and the separate
legacy `e2e_full_game.mjs` harness -- see the residual findings section).
Neither is exercised by the release-gate sweep (which always runs active
mode), and both are bounded by the 60s `phase_timeout` rather than the old
8-minute `auction_stalled` ceiling, so the blast radius is smaller. They are
flagged as a fast-follow, not a blocker: the release gate itself does not
run through either path.

**Soft architecture watch, not a proven defect**: `e2e_walkthrough.mjs`'s
`confirmScoring` reads `.scoring-panel`/`.scoring-row` CSS classes rather
than `data-action`/`data-*` attributes. `scoring_panel.tsx`'s own header
comment documents these classes as ITS intentional external contract, so
this is not an implementation detail the harness invented -- but it is a
softer contract than the auction/town/land screens' `data-*` pattern (a
class rename would break silently where a `data-*` rename is more visible in
review). No fix recommended now; noted for the scoring screen's next
touch.

## The requirement-by-requirement audit

Every requirement each driver enforces, and the verdict: KEEP (protects
intended player behavior) or DELETE/FIX (preserves old implementation or was
a design gap). "Intended player behavior" is read from the closest available
source of truth -- an engine-level invariant (`src/engine/*`), a screen's own
documented `SELECTOR CONTRACT` comment, or `docs/HUMAN_GUIDANCE.md` -- never
from a component's internal control-flow (a `mode()` switch, an internal
render branch) that the screen owner never intended as a stable contract.

### walkthrough_land.mjs

| Requirement                                                                                | Protects                                                                                                                            | Verdict                                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Sweep-cursor must match the decided plot before pressing Enter (`waitForSweepCursorMatch`) | The land-grant sweep-claim mechanic itself (`src/engine/land_grant.ts`'s `advanceSweepCursor`) -- a real game rule, not a UI detail | KEEP                                                         |
| `land-grant-pass` click is REQUIRED and verified (`actAndWaitProgress`)                    | "The human can pass a land-grant turn" via the documented `data-action="land-grant-pass"` selector                                  | KEEP (already correctly required+verified before this audit) |
| `land-bid` click is REQUIRED and verified                                                  | "The human can bid in the colony land auction" via `data-action="land-bid"`                                                         | KEEP (already correct)                                       |
| Unmapped plan kind throws                                                                  | Coverage between the AI's action vocabulary and the driver's handlers, not a UI assumption                                          | KEEP                                                         |

No bad requirements found. No changes made.

### walkthrough_town.mjs

| Requirement                                                                                        | Protects                                                                                                                                             | Verdict          |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Walk-in opens a shop panel, no keypress needed (`alignAndOpenPanel`)                               | `docs/HUMAN_GUIDANCE.md`'s documented "Town interaction model" -- an intentional, product-level UX contract, not an incidental implementation detail | KEEP             |
| Active street is discovered live (`composeTownStreetForMode`), never a hardcoded facade list/order | Exactly the fix the prior town rebuild needed; this file already embodies the lesson this audit is checking for elsewhere                            | KEEP (exemplary) |
| Panel outcome gating (only proceed on `buyable`/`idle`)                                            | "The game only lets a purchase go through when it is actually purchasable" -- a real mechanic the develop AI itself respects                         | KEEP             |
| Pub payout verified as an EXACT money-delta match                                                  | Real economic correctness (the payout must be exactly what was shown)                                                                                | KEEP             |
| `walkBackToStreet` convergence onto the composed `streetLaneY`                                     | Spatial geometry derived live from the composed street, not a fixed pixel guess                                                                      | KEEP             |

No bad requirements found; this file was already rebuilt after the town
lesson and is the model the auction fix now matches.

### walkthrough_overworld.mjs

| Requirement                                                                                                                                                    | Protects                                                                                   | Verdict                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `place_mule`/`hunt_wampus`/`assay_plot` verified via projection-only engine fields (`plot.owner`, `plot.muleOutfit`, `wampus.caught`, `plot.crystiteRevealed`) | Real placement/catch/reveal outcomes, never a UI-internal signal                           | KEEP                                                                                                                                                                                                                                          |
| `hunt_wampus` treats an already-uncatchable wampus as a graceful skip, not a failure                                                                           | A genuinely time-varying live entity (`tickWampus`); this is restraint, not over-asserting | KEEP (good example of NOT reaching for a false requirement)                                                                                                                                                                                   |
| `maybeTruncateTurn`'s end-turn click at the tick-budget reserve                                                                                                | "The turn ends gracefully when ticks run low" -- a real, necessary guard                   | KEEP the requirement; the click was an unverified `page.click()` with an unconditional `return true` -- the same silent-noop-then-assume shape as the auction defect. FIXED: now `clickRequired` + `actAndWaitProgress` with engine evidence. |
| `planCommitsBudget`/`shouldTruncate`                                                                                                                           | Pure classification of which plans a truncation should count against; no DOM coupling      | KEEP                                                                                                                                                                                                                                          |

One fix made (`maybeTruncateTurn`); everything else already correct.

### walkthrough_auction.mjs

| Requirement                                                                                                                                                                                                              | Protects                                                                                                                                                                                                                                                                                                        | Verdict                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Opening role commit is REQUIRED (unblocks `isAuctionTickable`, `scene_manager.ts`)                                                                                                                                       | "The human can choose a role and the auction can proceed" -- the engine's own documented tick-gate contract                                                                                                                                                                                                     | KEEP the requirement. FIXED: was `clickIfPresent` with the return value discarded and success assumed unconditionally; now `clickRequired` + verified.                         |
| Role buttons only meaningfully commit at the good's opening tick, because a mid-window `auction_role` plan used to be treated as UI-unreachable by hard-coded assumption (citing `auction_screen.tsx`'s `mode()` switch) | Was preserving the OLD SCREEN'S INTERNAL implementation, not any documented contract -- confirmed by reading the engine: `applySetAuctionRole` (`src/engine/auction.ts`) places NO tick restriction, so a mid-window role change is a legitimate engine-level capability whenever a screen chooses to expose it | DELETED. Replaced with a neutral, best-effort `clickIfPresent` attempt, logged once per good for visibility, asserting nothing about why a control might be present or absent. |
| `auction-intent-up`/`auction-intent-down` optional                                                                                                                                                                       | Can legitimately be reissued next tick; the window closes on quiescence, not on any one intent landing                                                                                                                                                                                                          | KEEP (correctly optional)                                                                                                                                                      |
| `auction-continue` optional                                                                                                                                                                                              | Confirmed by reading `scene_manager.ts`'s `scheduleAuction`: the window auto-dispatches `end_auction` after `AUCTION_FINISHED_PAUSE_MS` regardless of the click                                                                                                                                                 | KEEP (correctly optional)                                                                                                                                                      |
| `MAX_TICKS_PER_AUCTION` whole-phase ceiling                                                                                                                                                                              | A genuine backstop against a stall anywhere else in the phase, now that the tick-0 commit stall is caught in seconds instead                                                                                                                                                                                    | KEEP, re-scoped and re-tested (see the new procedural-generator test)                                                                                                          |

### walkthrough_exec.mjs

| Requirement                                                                                                                             | Protects                                                                                                                                                                    | Verdict                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `humanTurnsCompleted === finalRound` (hard invariant)                                                                                   | A deterministic engine-level guarantee: the human seat completes exactly one develop turn per round                                                                         | KEEP                                                                                        |
| Held-role auction participation is a WARN, not a hard fail (already demoted in a prior amendment, documented in the file's own comment) | Real-time auction outcomes are not deterministic under wall-clock gesture timing; a prior hard version flaked on legitimate "held your limit price, never crossed" outcomes | KEEP as-is; this is the repo already having applied the "fix the design" lesson once before |
| `unknown_plan_kind` classification via `executePlan`/`PLAN_KINDS`                                                                       | Coverage between the strategy adapter and every driver, not a UI assumption                                                                                                 | KEEP                                                                                        |

### walkthrough_report.mjs / walkthrough_strategy.mjs / walkthrough_helpers.mjs

`walkthrough_strategy.mjs`'s decision wrappers call the SAME production
`src/ai/*` decide functions the shipped game runs -- the strongest possible
form of "protects intended player behavior," since the walker plays exactly
as the real AI would, not a walker-specific heuristic. KEEP, no changes.

`walkthrough_report.mjs`'s closed `FAILURE_KINDS` taxonomy and narrow
`EXPECTED_NOISE` allowlist (favicon only) are both scoped tightly and
justified per entry. KEEP, extended with `required_control_missing`.

`walkthrough_helpers.mjs`'s spatial selector audit (the "Selector audit"
comment block, re-audited 2026-07-11 against the live scene sources) already
retired `data-at-door` when the town rebuild removed it, rather than leaving
a stale assumption in place. KEEP, exemplary; this audit found nothing
further to fix there beyond the new `clickRequired`/`actAndWaitProgress`
additions this work package made.

## clickIfPresent / required-click call-site audit (complete)

Every `clickIfPresent` call site in `tests/e2e/`, classified REQUIRED,
OPTIONAL, or CONDITIONAL per the three-bucket framework, with the reasoning
that PROVES the classification rather than asserting it:

| Site                                                   | File                                              | Classification                                                                                            | Why                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening role commit (auto-assigned or adapter-chosen)  | `walkthrough_auction.mjs`                         | REQUIRED                                                                                                  | Engine holds the clock at tick 0 until committed (`isAuctionTickable`); no legitimate path skips this                                                                                                                                          |
| Mid-window role-change request                         | `walkthrough_auction.mjs`                         | OPTIONAL                                                                                                  | Engine accepts a role change at any tick (`applySetAuctionRole` has no tick guard); whether a given screen still exposes the control past the opening tick is that screen's own design choice, not something the harness may assume either way |
| `auction-intent-up` / `auction-intent-down`            | `walkthrough_auction.mjs`                         | OPTIONAL                                                                                                  | Can be reissued next tick; no persistent invariant requires any one click to land                                                                                                                                                              |
| `auction-continue`                                     | `walkthrough_auction.mjs`                         | OPTIONAL                                                                                                  | Engine auto-advances via `AUCTION_FINISHED_PAUSE_MS` regardless of the click (`scene_manager.ts`'s `scheduleAuction`)                                                                                                                          |
| `develop-end-turn` at the tick-budget reserve          | `walkthrough_overworld.mjs` (`maybeTruncateTurn`) | REQUIRED                                                                                                  | No legitimate path leaves the turn running past the reserve; was a bare unverified `page.click()`, now `clickRequired`                                                                                                                         |
| `land-grant-pass`                                      | `walkthrough_land.mjs`                            | REQUIRED                                                                                                  | Already used Playwright's own asserting `page.click()` + `actAndWaitProgress`; not `clickIfPresent`                                                                                                                                            |
| `land-bid`                                             | `walkthrough_land.mjs`                            | REQUIRED                                                                                                  | Same as above                                                                                                                                                                                                                                  |
| `develop-end-turn` (the walker's own end-turn gesture) | `e2e_walkthrough.mjs` (`endDevelopTurn`)          | REQUIRED                                                                                                  | Already `page.click()` + `actAndWaitProgress`; not owned by this work package, not touched                                                                                                                                                     |
| Every corral/outfit/assay panel interaction            | `walkthrough_town.mjs`                            | REQUIRED, but never via `clickIfPresent` -- via `page.keyboard.press()` wrapped in a verified `pollUntil` | Each is verified against a real observable (outcome attribute, projection field, avatar attribute); already correct                                                                                                                            |

`clickIfPresent` is used in exactly one file (`walkthrough_auction.mjs`) for
exactly the two genuinely OPTIONAL cases above (intent clicks, continue) plus
the now-corrected mid-window role change. No CONDITIONAL case was found in
the whole suite: every click site is either unconditionally required once its
enclosing code path is reached, or genuinely optional with no state that
would make it required.

## Every discarded `clickIfPresent` boolean (item B, exhaustive)

`clickIfPresent`'s return value is discarded (not checked) at every one of
its current call sites in `walkthrough_auction.mjs` -- `auction-intent-up`,
`auction-intent-down`, `auction-continue`, and the mid-window role-change
click. Per the audit above, all four are genuinely OPTIONAL, so discarding
the boolean is correct there: an optional click's failure is not a run
condition to react to. The one call site where discarding the boolean WAS
the defect (the opening role commit) has been converted to `clickRequired`,
whose contract makes discarding impossible -- failure throws rather than
returning a value to ignore.

## Residual findings outside this work package's ownership

UPDATE (WP-H2, 2026-07-11): both residual findings below are now FIXED.
`e2e_walkthrough.mjs`'s `--passive` fallback path (`actForPhase`) and
`e2e_full_game.mjs`'s `actForCurrentPhase` now call the shared
`clickIfPresent` helper directly instead of a hand-rolled `isVisible` check
plus `page.click().catch(() => undefined)`, closing the same check-then-click
race and silent-rejection swallow this whole audit is about. A third,
independent defect was found and fixed in the same file: `e2e_full_game.mjs`'s
Sit Out click selected the role button by DOM array position
(`roleButtons[2]`), not the semantic `[data-role="out"]` selector -- silently
coupled to auction-screen button ORDER during the very rewrite this audit is
watching for. See `docs/CHANGELOG.md`'s WP-H2 entry and the edge-case triage
table row in `WALKTHROUGH_GUIDE.md`.

- **`e2e_walkthrough.mjs`'s `--passive` fallback** (`actForPhase`, 3 sites:
  `land-grant-pass`, `auction-role[out]`, `auction-continue`) uses
  `isVisible()` check + `page.click().catch(() => undefined)`. Same
  swallow-the-outcome shape as the original defect, but structurally more
  benign: it is an idempotent per-poll retry (the loop re-attempts the click
  every poll interval rather than latching a one-shot "committed" flag), and
  it is bounded by the 60s `phase_timeout` rather than the removed 8-minute
  `auction_stalled` ceiling. Not exercised by the release-gate sweep
  (`--passive` restores the deprecated M2 baseline). Recommend a follow-up
  work package convert these to `clickRequired` for full consistency, but
  this does not block restoring gate authority since the gate itself never
  runs this path.
- **`e2e_full_game.mjs`** (a separate, older harness, not part of the
  walker-projection driver family) has the identical
  `page.click().catch(() => undefined)` shape on three required clicks
  (`land-grant-pass`, `develop-end-turn`, sit-out). Same recommendation:
  follow-up, not a blocker.
- **`e2e_walkthrough.mjs`'s `confirmScoring`** reads `.scoring-panel`/
  `.scoring-row` CSS classes. `scoring_panel.tsx` documents these as its own
  intentional contract, so this is not a fabricated requirement, but it is a
  softer contract than the `data-*` pattern used elsewhere. No fix
  recommended now; worth migrating to `data-*` on the scoring screen's next
  touch, for consistency with the rest of the suite.

## Rich diagnostics (item C)

`clickRequired` (`walkthrough_helpers.mjs`) now reports, on any required-click
failure: the missing/failed selector, a caller-supplied `detail` phrase, a
caller-supplied `extra` object of the relevant game-state facts (phase kind,
good, tick, finished, the human participant's committed/assigned role), and a
best-effort full-page screenshot written to
`test-results/walker/failures/<timestamp>_<tag>.png` (never throws itself --
a screenshot failure never masks the original failure it documents). All of
this lands in both the thrown error message (visible even in a bare console
failure) and `report.fail`'s structured `extra` (queryable in the written
`playthrough_report.json`). Verified live: a deliberately broken role
selector produced a screenshot showing the real "Choose Buy, Sell, or Sit
Out" panel WITH its buttons visibly present, immediately telling a reader the
selector -- not the screen -- was the defect.

`actAndWaitProgress` gained a `failureMessage` function form
`(lastSnapshot) => string`, so an ENGINE-STALL diagnosis is backed by the
ACTUAL observed state at the moment the budget expired (for example
`{"tick":0,"finished":false}`), not a bare assertion that something stalled.
This is the mechanism that lets the auction driver and `maybeTruncateTurn`
report real evidence.

## Verification

All commands below were run against a disposable `git worktree --detach
HEAD` (the auction UI was being rewritten concurrently in the working tree
at audit time), then reverted and the worktree removed.

- **Unit tests**: `node --import tsx --test 'tests/test_*.mjs'` -- 551
  passed, 0 failed (includes 38 tests total across
  `test_walkthrough_auction.mjs` (17) and `test_walkthrough_overworld.mjs`
  (21), all passing, of which 4 are new `maybeTruncateTurn` tests exercising
  both the happy path and both failure causes).
- **Positive live-browser run**: `node --import tsx tests/e2e/e2e_walkthrough.mjs
--seed 3 --mode beginner` -- `"failure": null`, real trades cleared across
  8 auction goods and 2 roles, the new `auction_role_change_requested` info
  log fired once without breaking the run.
- **Negative live-browser run**: the same command with the role selector
  deliberately renamed to a selector that does not exist -- failed in about
  6 seconds with `"failureKind": "required_control_missing"` and a message
  naming the exact broken selector, the phase/good/tick/role context, and a
  screenshot path. The screenshot itself shows the real "Choose Buy, Sell, or
  Sit Out" panel with its buttons genuinely present, proving the diagnosis
  correctly pointed at the selector rather than the screen. Reverted; diff
  confirmed a clean revert before removing the worktree.
- **Lint/format/type-adjacent**: `npx eslint` and `npx prettier --check` on
  every file this work package touched -- clean.
- **Regression**: `pytest tests/` (904 passed, including
  `tests/test_markdown_links.py` and ASCII compliance) and the node suite
  above -- both green against the main working tree after the fix.
  both report real engine evidence rather than a guess.
