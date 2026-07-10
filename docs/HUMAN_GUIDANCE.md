# HUMAN_GUIDANCE.md

Durable human preferences, project-specific guidance, review expectations, and
stable decisions that agents should preserve across planning and
implementation work. Keep entries focused on stable preferences and recurring
project decisions, not transient task notes; detailed history stays in
[docs/CHANGELOG.md](CHANGELOG.md).


## Summary

A. modern Graphics follow Planet M.U.L.E.; but in general we want a unique modern look

B. Game rules and screen layout follow 1983/1990 NES M.U.L.E. game
the layout rule is not pixel strict, 
we can switch from portrait to landscape in auction to better fill the 16:10 aspect

C. User interaction is designed around mouse + arrow keys + enter key

## Rule fidelity targets game mechanics, not input devices

Target the 1983/1990 M.U.L.E. game rules -- formulas, economy, and phase
mechanics -- while keeping modern computer-native input and presentation.
Prefer mouse and arrow-key control over the original console/joystick key
mappings (random A/B/Z/X-style bindings). A time-based land-selection UI is an
acceptable modernization of the original turn-based land-claim screen. Apply
rule fidelity to mechanics; let input devices and screen layout follow modern
computer conventions instead of replicating the original console UI.

**Why:** the user clarified (2026-07-09) that requesting 1990-accurate game
rules did not extend to the 1990 console UI; a mouse-and-keyboard computer
audience benefits from arrow keys and mouse control over the original
joystick-era bindings.

**How to apply:** when a plan or implementation choice involves an input
scheme, control mapping, or screen flow, choose the modern computer-native
option unless the specific rule or formula being replicated requires
otherwise. Reserve fidelity effort for economy and phase mechanics documented
in [docs/RULE_SOURCES.md](RULE_SOURCES.md).

## Fill the full 16:10 canvas; avoid narrow centered layouts

Design screens to use the full 16:10 canvas. Spread HUD elements, panels, and
the play area to fill the available width and height rather than centering
content in a narrow column with large blank margins.

**Why:** the user reviewed the goods-auction screen at 16:10 aspect (2026-07-09)
and found a narrow centered column with large empty margins on both sides, an
unused-space problem rather than a content problem.

**How to apply:** when building or reviewing a screen layout, check the full
16:10 canvas width and height are used by HUD/panels/play area before calling
a layout done. Treat a narrow centered single-column layout with large dead
margins as a defect to fix, not an acceptable minimal layout. See
[docs/TODO.md](TODO.md), "UI and layout" for the goods-auction rework tracked
from this review.

## Source-of-truth hierarchy: visual, rules, interface

Visual style follows Planet M.U.L.E.: use the `OTHER_REPOS/planet_mule`
painters (for example `AuctionPainter.java`, `ShopPainter.java`) as the visual
reference for screens. Game rules follow the 1983/1990 documents
(`OTHER_REPOS/mule_rules.md`, `OTHER_REPOS/mule_document.html`); planet_mule
code is subordinate on any mechanics question and supplies implementation ideas
only. The interface uses mouse + arrow keys + Enter where practical (user,
2026-07-10).

Document authority split (route future updates to the owning doc):

- [docs/RULE_SOURCES.md](RULE_SOURCES.md) owns formulas, constants, and their
  citations.
- [docs/HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md) owns durable user preferences and
  decision records.
- [docs/ROADMAP.md](ROADMAP.md) owns priority ordering and known-bug writeups.
- [docs/TODO.md](TODO.md) owns the small-task backlog.

**Why:** the user set this hierarchy (2026-07-10) so mechanics questions resolve
against the original rule documents while presentation follows the Planet
M.U.L.E. reference, and so agents stop scattering the same fact across multiple
docs.

**How to apply:** when a question is about a game mechanic, formula, or constant,
resolve it against the 1983/1990 documents first and treat planet_mule code as
subordinate. When it is about how a screen looks, follow the planet_mule
painters. When choosing input or control flow, prefer mouse, arrow keys, and
Enter. Record a new fact in the single owning doc named above rather than
duplicating it.

## Town interaction model: walk-in doors, attempt-then-confirm transactions

The town interaction model is a FIXED user-facing requirement, not an
experiment. It has exactly four behaviors (user, 2026-07-10):

1. Arrow keys move the player.
2. Approaching a shop opens its door (a closed door means you cannot enter).
3. Walking through the open doorway enters the shop -- the walk-in is the
   complete entry action, with no keypress.
4. Enter confirms choices after entry, where appropriate (dialogs and panels
   only).

Once inside a shop, transactions follow attempt-then-confirm: entering opens
the transaction panel with no side effects, and the state-changing dispatch
fires only on an explicit confirm (Enter, or a mouse click on the focused
action). Arrow keys move focus between actions and the focused action is
visibly highlighted.

**Why:** the user (2026-07-10) requires the town to match NES M.U.L.E. door
behavior -- "if I walk up to shop door, the door slides open and I walk in, no
keypress. If door is closed, then you cannot walk in." Entering a shop is a
low-commitment gesture that always shows the transaction state (price, stock,
funds) before anything changes, so no purchase or sale happens by simply
walking in.

**How to apply:** when building or reviewing a town shop interaction, treat the
four behaviors above as fixed requirements. Open the door on approach, make the
walk-through the complete entry action with no keypress, open the transaction
panel without side effects on entry, and gate the state-changing dispatch
behind an explicit confirm (Enter or a mouse click on the focused action). Wire
arrow keys to move the player outside shops and to move focus inside panels,
and keep the focused action visibly highlighted. Reserve Enter for confirming
choices in dialogs and panels after entry.
