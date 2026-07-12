# Decision: walkthrough harness suspended as a release gate

## Date

2026-07-11

## Decision

User ruling, verbatim: "i do not trust our current walkthrough suite, it has
failed me twice with bad requirements."

The walkthrough harness (`tests/e2e/walkthrough_*.mjs`, `e2e_walkthrough.mjs`,
and the seed/mode sweep `e2e_walkthrough_sweep.mjs`) is SUSPENDED as a hard
milestone and release gate, effective immediately.

It continues to RUN, for information. A green run is informative. It is NOT
authoritative, and a green walkthrough run must not be cited as evidence that a
milestone is safe to close.

This suspension supersedes, for every milestone closed from 2026-07-11 onward,
the WP-6C restoration recorded at the top of
[sweep_gate_demotion.md](sweep_gate_demotion.md). That restoration rested on six
green sweep runs. The defects below are exactly why green runs from this harness
do not carry that weight: the harness could pass while the thing it claims to
verify never happened.

## Update (WP-H2, 2026-07-11): gate authority RESTORED for the active-mode drivers

All six exit criteria below are now met with verified evidence, not
optimism. `wph-harness` fixed the reported auction-driver defect and, on
audit, a fourth instance in `walkthrough_overworld.mjs`'s `maybeTruncateTurn`
(see `docs/active_plans/audits/walkthrough_requirements_audit.md` for the
full requirement-by-requirement audit). `wph2-requirements-audit` (this
work) independently re-verified every finding, found and fixed two more
instances of the same defect class outside wph-harness's file ownership
(`e2e_walkthrough.mjs`'s `--passive` path and the legacy `e2e_full_game.mjs`
harness), found and fixed one implementation-coupled selector
(`e2e_full_game.mjs`'s positional `roleButtons[2]` Sit Out click), and closed
the `act_did_not_advance` negative-test gap this record's bar (f) required.

- (a) Required/optional/conditional separated, required clicks fail
  immediately: TRUE repo-wide. Every required click in every
  `walkthrough_*.mjs` driver plus the orchestrator and legacy harness now
  either uses `clickRequired` (auction role commit, `maybeTruncateTurn`'s
  end-turn click) or Playwright's own asserting `page.click()` wrapped in
  `actAndWaitProgress` (land-grant-pass, land-bid, develop-end-turn), both of
  which fail loud on non-advancement. Every remaining `clickIfPresent` call
  site is proven genuinely optional, not merely asserted so (see the
  call-site table in `walkthrough_requirements_audit.md`).
- (b) No `clickIfPresent` return value silently discarded at a required call
  site: TRUE repo-wide, confirmed by a fresh grep for the swallow pattern
  (`.catch(() => undefined)`) across every `tests/e2e/*.mjs` file: zero hits.
- (c) Layered failure diagnosis (UI-CONTRACT fails in seconds and names the
  UI; ENGINE STALL is a separate diagnosis with engine evidence): TRUE.
  `required_control_missing` fires in about a second with the selector, phase
  context, and a failure screenshot; `act_did_not_advance` embeds the actual
  observed engine state (for example `{"tick":0,"finished":false}`) in its
  message rather than a bare claim. Both paths are unit-tested for both the
  auction commit and the develop-turn truncation guard.
- (d) No requirement encodes component structure, a `mode()` branch, or a
  tick-only rendering rule: TRUE. The flagship instance (the tick-0/`mode()`
  role-panel assumption) is deleted. A fresh grep for `mode()`/`tick === 0`/
  positional DOM indices across every `walkthrough_*.mjs` and
  `test_walkthrough_*.mjs` file returns zero hits. The engine-level fact behind
  the deletion -- `applySetAuctionRole` in `src/engine/auction.ts` has no tick
  restriction, so a mid-window role change was always permitted -- was
  independently re-verified by reading the source directly, not assumed from
  the audit write-up.
- (e) Every remaining requirement audited against "protects player behavior,
  or preserves old implementation?": DONE, twice, independently -- see
  `walkthrough_requirements_audit.md` (wph-harness) and this work's own
  18-row table (`docs/CHANGELOG.md` WP-H2 entry references the finding); both
  reach the same conclusions.
- (f) A negative test exists and has been OBSERVED to fail correctly: TRUE,
  for BOTH failure branches now. wph-harness proved the missing-control
  branch live (a deliberately broken selector, ~6s, names the selector,
  captures a screenshot proving the screen itself was fine). This work closed
  the previously-open second branch -- click LANDS, engine never advances --
  with unit tests for both the auction commit
  (`test_walkthrough_auction.mjs`: "a commit that lands but never unblocks
  the clock fails fast with engine evidence, not a throw") and the develop
  truncation guard (`test_walkthrough_overworld.mjs`: "a click that lands but
  never ends the phase fails, does not count"), both asserting the failure
  fires with engine-pointing wording and embeds the real observed state.

Verification: `node --import tsx --test 'tests/test_*.mjs'` 551/551.
`bash check_codebase.sh` 5/5. `pytest tests/` 904/904. Two live active-mode
walkthrough runs (seed 3 and seed 7, beginner, calibrated speed) both PASS
clean with real trades, a gamble, and a verified placement.

This restoration applies to the active-mode drivers the release gate
actually exercises (`e2e_walkthrough_sweep.mjs` runs every phase in active
mode). It does NOT cover: `e2e_walkthrough.mjs`'s `--passive` fallback and
the legacy `e2e_full_game.mjs` harness's swallow-shape sites, which ARE now
fixed but are diagnostic tooling outside the release-gate's own exercised
path, not part of the gate itself; nor does it revisit `confirmScoring`'s
CSS-class scoring-screen selectors, noted as a softer (but documented,
intentional) contract worth a future migration to `data-*`, not a defect.

### Accepted by the user, 2026-07-11

The user accepted this restoration, scoped, with four standing boundaries:

1. **WP8a remains the authoritative auction-specific gate** for the goods-auction
   rebuild (see `docs/active_plans/active/auction_native_recompose.md`).
2. **Active-mode `e2e_walkthrough.mjs` and `e2e_walkthrough_sweep.mjs` regain broader
   release-gate authority.**
3. **`--passive` and the legacy `e2e_full_game.mjs` remain diagnostic-only** -- fixed,
   but not part of any gate.
4. **AUTOMATIC RE-SUSPENSION.** Any newly introduced silent-swallow pattern, positional
   DOM-index selector, or implementation-coupled requirement AUTOMATICALLY suspends the
   affected driver's gate authority again. No further audit is needed to justify the
   suspension; the audit is needed to LIFT it. The three patterns, stated so a future
   agent can recognize them without re-deriving this history:
   - **Silent swallow:** a required interaction routed through an optional-click helper,
     or any click whose failure is discarded (`.catch(() => undefined)`, an ignored
     boolean return, an unconditional `return true` after an unverified click).
   - **Positional selector:** identifying a control by DOM array index or nth-child
     (for example `roleButtons[2]`) rather than by its semantic contract (`data-role="out"`).
     Such a selector is silently coupled to render ORDER and will click the wrong thing,
     while staying green, the moment a screen is re-laid-out.
   - **Implementation-coupled requirement:** any assertion about HOW the UI is built --
     a component's internal render mode, a "control only exists at tick N" rule, a CSS
     class used as a behavioral contract -- rather than WHAT the player can do. The test
     may assert that the player can act and that the game responds. It may not assert the
     screen's internals.

   Rationale, recorded so it is not re-litigated: all three patterns were found in this
   suite, all three were invisible to a green test run, and one of them
   (`e2e_full_game.mjs`'s positional `roleButtons[2]` Sit Out click) would have begun
   clicking the WRONG ROLE while remaining green the moment the auction screen reordered
   its buttons -- which was happening in the same session. A suite that cannot fail
   correctly provides no safety, and six green runs from such a suite is exactly the
   invalid evidence this record exists to reject.

## Why: three confirmed defects

All three were verified against the source on 2026-07-11, at the moment of the
ruling. They are recorded here as the evidence the decision rests on, not as a
description of the current tree (see "The repair in flight does not restore the
gate" below).

### D1: required interactions were treated as optional

`clickIfPresent` (`tests/e2e/walkthrough_helpers.mjs`) returned `false` SILENTLY
when the selector was absent: no warning, no report entry. It warned only when a
control that WAS present failed to click.

`driveAuction` (`tests/e2e/walkthrough_auction.mjs`) used it for the human
seat's REQUIRED role-commit click, DISCARDED the returned boolean, and then set
`committedGood = payload.good` unconditionally. The driver recorded "I
committed" whether or not the button had ever existed. A UI failure was
therefore invisible to the harness by construction.

### D2: missing UI was converted into a delayed engine failure

The engine holds the auction clock at tick 0 until the human commits
(`isAuctionTickable` / `humanAuctionCommitted`, `src/ui/scenes/scene_manager.ts`).
So when the role button did not render, the click silently no-opped, the driver
believed it had committed, and the clock never started.

That state spun to `MAX_TICKS_PER_AUCTION` (4000) at a 120ms poll -- roughly
EIGHT MINUTES -- and then reported `auction_stalled`, a message whose own comment
blamed "a stuck engine (a bug elsewhere)". A missing UI selector was reported as
an engine bug, eight minutes late. The harness did not merely miss the defect; it
actively misdirected the diagnosis.

### D3: the harness encoded the old screen's internals as requirements

`tests/e2e/walkthrough_auction.mjs` stated that "the role buttons only render at
the good's opening tick (`payload.tick === 0`; see `auction_screen.tsx`'s
`mode()` switch)" and treated "the UI cannot express a mid-window role change" as
truth. This reached into a component's internal `mode()` switch and wrote a
LIMITATION of the screen currently being replaced into the harness as a law.

This is the "bad requirements" the user named: the harness was not testing that a
player can choose a role, it was pinning the old implementation's shape.

## Why this matters now

The goods auction is being rebuilt
([auction_native_recompose.md](../active/auction_native_recompose.md)). That plan
originally gated four milestones (M3, M4, M5, M6) on this harness, and its risk
register treated the committedGood deadlock as a CONSTRAINT THE NEW UI MUST
SATISFY ("buttons present from first frame by design") rather than as a harness
bug to fix. The plan bent the product design around a broken test.

That is the same failure the town rebuild taught this repo to avoid: tests that
enforce bad design must be removed FIRST. The auction plan removed the tests that
enforced bad GEOMETRY but left a harness that enforced bad STRUCTURE.

## The repair in flight does not restore the gate

Work package WP-H is already rewriting the harness, and part of the repair is in
the working tree as of this record: a `clickRequired` helper that fails fast with
a `required_control_missing` taxonomy, the auction role commit switched over to
it, a bounded commit-verification budget separating `required_control_missing`
from an `act_did_not_advance` engine diagnosis, and the tick-0 / `mode()`
language gone from the driver.

That work is welcome and it is not sufficient. Gate authority is NOT restored by
fixing one click, because the problem this decision responds to is not one click:
it is that the harness's requirements were never audited, and a suite that has
only ever been observed to PASS has proven nothing about its ability to FAIL
correctly.

## What restores gate authority

Gate authority is restored only when the WP-H audit demonstrates all six of the
following. This list is the exit criteria; a future agent should not restore the
gate on a subset.

- Required, optional, and conditional interactions are separated, and required
  clicks fail immediately.
- No `clickIfPresent` return value is silently discarded at a required call site.
- Failure diagnosis is layered: a missing required control is a UI-CONTRACT
  failure that fails in SECONDS and names the UI, while an ENGINE STALL is a
  separate diagnosis that requires engine evidence.
- No requirement encodes component structure, a `mode()` branch, or a tick-only
  rendering rule. The harness may assert only that the player can choose a role
  and that the auction can proceed.
- Every remaining requirement has been audited against the question "does this
  protect INTENDED PLAYER BEHAVIOR, or merely preserve the OLD IMPLEMENTATION?",
  and every requirement of the second kind has been deleted.
- A NEGATIVE TEST exists and has been OBSERVED to fail correctly: deliberately
  remove a required control and prove the harness fails fast with the right
  diagnosis. A harness that has only ever been seen to pass proves nothing about
  its ability to diagnose.

## What milestones close on instead

Until gate authority is restored, milestones close on their other gates:

- `npx tsc --noEmit` (typecheck).
- The node test suites (`check_codebase.sh`, the per-module `tests/test_*.mjs`).
- The behavior-only playwright safety net (no pixel-position assertions).
- The automated visual acceptance report (the judged beat captures).

## References

- `docs/CHANGELOG.md`, 2026-07-11, Decisions and Failures.
- [sweep_gate_demotion.md](sweep_gate_demotion.md): the 2026-07-10 demotion and
  the WP-6C restoration this record suspends.
- [auction_native_recompose.md](../active/auction_native_recompose.md): the plan
  whose walkthrough gates are suspended pending WP-H.
- `tests/e2e/walkthrough_helpers.mjs`, `tests/e2e/walkthrough_auction.mjs`: the
  harness under audit.
