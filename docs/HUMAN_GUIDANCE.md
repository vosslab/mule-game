# HUMAN_GUIDANCE.md

Durable human preferences, project-specific guidance, review expectations, and
stable decisions that agents should preserve across planning and
implementation work. Keep entries focused on stable preferences and recurring
project decisions, not transient task notes; detailed history stays in
[docs/CHANGELOG.md](CHANGELOG.md).

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
