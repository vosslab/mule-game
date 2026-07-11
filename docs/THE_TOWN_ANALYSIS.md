# The town analysis

## Status: shipped 2026-07-11

The mode-composed, horizontally scrolling street this document proposes was
implemented and closed on 2026-07-11. The proposal below reads in the
present tense as open work, but it is not: the "Replacement topology",
"Geometry contract", "Camera contract", and "Fix sequence" are all shipped.
See [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](CHANGELOG.md) for the shipped
record and work-package history.

The "Current town structure" section and its `9 x 5` grid diagram below
describe the RETIRED model this rebuild REPLACED, not the current town. They
are kept for the historical geometry rationale that motivated the rebuild; do
not read them as the live layout. The "Replacement topology" section is the
model that shipped.

## Decision

Replace the current `9 x 5` open floor with a horizontally scrolling NES-style
street. Use Planet M.U.L.E. as the visual reference, not as the topology
reference.

The target combines three established project decisions:

- Preserve the 1990 NES town's long walk and left-to-right errand planning.
- Use Planet M.U.L.E.'s industrial storefront language, visible prices, and
  strong destination identity.
- Preserve the interaction contract in
  [HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md): arrow keys move, doors open on
  approach, walking through a door enters, and Enter confirms inside panels.

This is not a polish pass on the current town. The current topology models the
wrong space and must be replaced.

## Scope and evidence

This analysis covers only the town during a human development turn: town entry,
street layout, camera, storefronts, doors, collision, town exits, town HUD, and
the town-side portion of errands. It does not redesign the economy, auctions,
production, or the overworld.

Local evidence:

- `OTHER_REPOS/mule_rules.md`, especially "Description of the Town," defines
  the original building roles and the timed development loop.
- `OTHER_REPOS/mule_document.html` and
  `OTHER_REPOS/MULE-assembly/MULE-Disassembled_Memory.asm` describe the 1983
  Atari implementation. The assembly's `EnterStore`, `LoopInStore`, outfit,
  assay, land-sale, and gambling branches show that town movement is part of
  one continuously timed development turn.
- `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Shop.java`
  defines Planet M.U.L.E.'s exact town collision rectangles, stores, four
  exits, and start position.
- `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/view/ShopPainter.java`
  defines the rendered shop backdrop and ambient price/stock overlays.
- `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/ai/PathFindingGraph.java`
  exposes Planet M.U.L.E.'s town nodes and confirms its cross-street topology.
- `OTHER_REPOS/TSavo-mule-game/docs/superpowers/specs/2026-03-30-web-mule-design.md`
  is a prose cross-check for the required town destinations only. Per
  [REFERENCE_REPOS.md](REFERENCE_REPOS.md), TSavo's implementation is not an
  authority and is not an implementation model for this recommendation.

External visual cross-checks:

- The [NES instruction manual scan](https://www.retrogames.cz/manualy/NES/MULE_-_NES_-_Manual.pdf)
  shows a side-view row of labeled, full-height storefronts and says that the
  player leaves town only by walking off screen to the left or right.
- The [NES town screenshot](https://images.cgames.de/images/gsgp/287/mule-5_995155.jpg)
  shows the side-view street, large labels, doors, and only part of the town in
  the viewport.
- The [1990 NES gameplay recording](https://www.youtube.com/watch?v=Fh_ycrBPfgI)
  confirms the starting position near the corral, automatic door approach, and
  the long horizontal route.
- A [full NES playthrough](https://www.youtube.com/watch?v=B7qOHrSz1ps)
  confirms the expanded Standard/Tournament street with the Pub, Land Office,
  and Assay Office to the right of the corral.

The user settled the topology choice on 2026-07-10: prefer the NES long-walk
topology over Planet M.U.L.E.'s square topology.

## Reference town structures

### 1983 computer town

The 1983 computer town is a compact, top-down square. Shops sit on both sides of
a central east-west street, with a north-south cross-street through the middle.
The player can leave in four cardinal directions. All destinations fit on one
screen.

The original roles are:

- M.U.L.E. corral
- Food outfitter
- Energy outfitter
- Smithore outfitter
- Crystite outfitter in Tournament mode
- Assay office
- Land office
- Pub

The important design feature is not the exact pixels. It is that movement time
is a resource. Buying, outfitting, leaving town, working plots, returning for an
assay, and reaching the Pub all consume the same shrinking development timer.

### Planet M.U.L.E. town

Planet M.U.L.E. modernizes the 1983 square rather than the NES side-scroller.
Its `440 x 348` shop image is placed inside a `620 x 360` play area. `Shop.java`
uses these interaction centers:

```text
                 NORTH EXIT
                     |
  CRYSTITE   SMITHORE   ENERGY      FOOD
      |          |          |          |
WEST--+----------+----------+----------+--EAST
      |          |          |          |
   ASSAY       LAND        PUB       M.U.L.E.
                     |
                 SOUTH EXIT
```

The implementation is unusually explicit:

- Each destination has a concrete collision rectangle.
- Buildings and exterior walls have separate collision rectangles.
- Four exit rectangles sit outside the image boundaries.
- The player starts at the central cross-street.
- `PathFindingGraph.java` names each destination, street node, and exit node.
- `ShopPainter.java` paints outfit prices and the M.U.L.E. price directly over
  the town, and visually shows M.U.L.E. stock.

Planet M.U.L.E.'s strengths to reuse are visual and technical:

- The town reads as a place, not a debug grid.
- Storefronts are large and visually distinct.
- Prices and stock are visible before entry.
- Collision is modeled as walls and store rectangles, not as an open field.
- The shop list is data-driven enough for AI pathing and human rendering to
  agree.

Do not copy Planet M.U.L.E.'s square topology or its four exits. Those erase the
long-walk route the user wants.

### 1990 NES town

The NES port converts the square into a side-view horizontal street. The world
is wider than the viewport, the camera scrolls, storefront doors share one
ground line, and the only town exits are at the far left and far right.

The observed street sequence is:

```text
< EXIT
  MINING OUTFITTING
  ENERGY OUTFITTING
  FARM OUTFITTING
  M.U.L.E. CORRAL
  PUB
  LAND OFFICE
  ASSAY OFFICE
                                                    EXIT >
```

The Mining Outfitting building covers the mining choices available in the
current mode. This keeps the NES street to one destination per facade while
preserving Smithore and Tournament Crystite as separate choices inside the
outfitting interaction.

The NES arrangement creates useful route structure:

- The player starts near the centrally placed corral.
- Common outfitters are to the left of the corral.
- The Pub and longer-horizon service offices are to the right.
- A buy-and-outfit errand crosses storefront distance instead of adjacent
  `64 px` cells.
- Leaving town requires committing to an endpoint.
- Returning to the Pub or Assay Office creates a real time-cost decision.

The long walk is not excise in this game. It is the physical form of the timed
development budget. It should be kept, measured, and made legible.

## Current town structure

The current implementation is a `9 x 5` grid of `64 px` cells, or `576 x 320`
world units. It puts all seven current destinations in adjacent columns on the
north side of row 2:

```text
row 0: open floor             NORTH EXIT             open floor
row 1: CORRAL  FOOD  ENERGY  SMITHORE  CRYSTITE  PUB  ASSAY
row 2: WEST EXIT  spawn/doors/continuous street              EAST EXIT
row 3: open floor
row 4: open floor             SOUTH EXIT             open floor
```

There is no camera. The entire grid is scaled into the available SVG viewport.
Every destination is visible at once. Storefront centers are only `64 px`
apart, while the default walker speed is `320 px/s`, so the avatar crosses one
storefront interval in about `0.2 s`.

This is neither reference topology:

- It lacks the bounded two-row square and central cross-street of 1983/Planet
  M.U.L.E.
- It lacks the wider-than-viewport street, camera, facade scale, and endpoint
  exits of the NES port.
- It combines the disadvantages of both: arbitrary two-dimensional roaming
  with no useful spatial choices, plus tiny repeated storefronts.

## Critical defects

### Buildings are tunnels

`town_layout.ts` names the corral, Pub, and Assay Office
`PASS_THROUGH_BUILDINGS`. For each one, `townDoorwayGap()` cuts a full-height
slot through the entire building footprint. Opening a door removes the only
panel across that slot. Nothing closes the rear of the building.

The result is exactly the observed bug: the avatar can walk through the facade,
through the building, and into the open row behind it.

The smithore station is even less constrained. It is omitted from the solid
counter list so that it can double as a north-south cross-street. This makes one
outfitter a navigation tunnel for reasons unrelated to that shop.

### Entry zones reach the roof

`townDoorEntryZone()` starts every entry rectangle at `y = 0` and extends it to
the street threshold. A point anywhere behind a facade can therefore remain
inside a shop's entry zone. `computeOpenDoors()` also keeps a pass-through door
open whenever the avatar is anywhere north of the street in that door's column.

The implementation does not model "entering a doorway." It models an unbounded
vertical lane from the street to the top of the world.

### Four exits encode the bug

The north and south exits require the player to walk behind or far in front of
the storefront line. They are the reason the smithore bay was turned into a
cross-street and why the test suite requires rear access.

The NES target has two endpoint exits. North and south exits must be removed.

### Tests require wrong behavior

The unit tests do not merely miss the bug. They preserve it:

- `every town edge exit stays reachable from the spawn` requires the north and
  south exits.
- `a building is solid on its jambs but open through its doorway gap` expects a
  point in the middle of the full building depth to be occupiable.
- `the central smithore bay stays open` requires the navigation tunnel.
- `an open door lets the avatar walk in` expects the avatar to move north of
  the facade with no stopping boundary.
- `a pass-through door is held open while the avatar is inside its doorway`
  places the avatar deep behind the facade and calls that valid.

The browser tests only prove that one solid counter can stop northward motion.
They never prove that the rear of a facade is unreachable. Green tests currently
mean the broken topology remains intact.

### The town hides its clock

The development timer keeps draining while `TownScene` is mounted, but
`game_screen.tsx` hides `DevelopPanel` whenever `humanInTown()` is true.
`DevelopPanel` owns the only `Ticks left` display. `TownScene` replaces it with
an instruction line and End turn button, so the town removes the most important
piece of information during the phase where travel time matters most.

The NES town keeps a prominent time bar on screen. The replacement town must do
the same.

### Turns start outside town

`human_develop_layer.tsx` resets every human turn to the overworld beside the
town. The original development loop and NES guide start the player in the
middle of town with the timer already running.

Starting outside adds a mandatory, low-information step before every normal
M.U.L.E. errand and weakens the corral-centered street design. Start each human
development turn at the corral unless a specific carried-M.U.L.E. or return
state requires another location.

### Visuals do not read as town

The current screenshot reads as an editor grid:

- Forty-five equally loud gold cells dominate the scene.
- Most of the floor is empty.
- Buildings are small icons on one grid row rather than full-height facades.
- Four identical gold arches float below the outfit counters.
- Resource glyphs have no persistent text labels or prices.
- Large cardinal-arrow exit icons compete with the shops.
- The corral, store counters, Pub, and Assay Office do not share a coherent
  architectural frontage.

The player must remember icon meaning and destination order. Planet M.U.L.E.
and the NES port both use recognition: visible shop identity, large facades,
and ambient economic information.

### Interaction guidance conflicts

The fixed rule says walking through an open door is the complete entry gesture.
Two live tutorial messages still say to press Enter or Space at a shop door:

- `human_develop_layer.tsx` town hint
- `game_screen.tsx` development hint

The scene's own notice says to walk into the corral. The interface therefore
teaches two incompatible interaction models in the same phase.

### Outfit purchases bypass confirm

The corral and Pub have confirmation states, but `outfitAtCounter()` dispatches
`outfit_mule` immediately when the avatar enters a counter. This violates the
attempt-then-confirm transaction rule in
[HUMAN_GUIDANCE.md](HUMAN_GUIDANCE.md).

Every outfit door must open a panel that shows the choice, price, carried
M.U.L.E., and funds. The dispatch occurs only after Enter or a mouse click on
the focused confirm action.

### The End turn button bypasses town

The large End turn button below the town makes the Pub and the route to it
optional in a way the reference town does not. It also consumes vertical space
that should hold the time bar and town status.

The Pub should be the visible town action for voluntarily ending a turn and
receiving a payout. If a direct End turn escape remains for accessibility or
recovery, make it secondary and clearly distinguish it from gambling at the
Pub.

### Assay loses its return trip

The original assay errand is spatial: enter the Assay Office, take a sample on
a plot, then return to the office for the result. The current flow arms an assay
on entry and reveals the plot when the overworld action is pressed, with no
return to town.

This removes one of the long town route's meaningful round trips. Even if assay
mechanics are fixed separately, the new layout must reserve and support the
return-to-office state.

### The Land Office is absent

The original, Planet M.U.L.E., and NES expanded town all include a Land Office.
The current street has no slot for it. A replacement street should include the
facade now, even if the land-sale transaction lands in a later work package, so
the world geometry does not need another redesign.

## Replacement topology

Amended 2026-07-10 (user decision, same day the topology choice was settled):
the town is MODE-COMPOSED, not a fixed seven-facade street. Beginner renders a
smaller town; larger modes add the facades their features need; no mode renders
an inactive or placeholder destination. This replaces the earlier fixed
seven-facade recommendation. This amendment and the town rebuild plan cite the
same composition table so coders receive one consistent authority.

Use one horizontal world and one shallow interaction axis, but generate the
facade row per mode by filtering a shared storefront catalog:

```text
WORLD SPACE, wider than viewport (composed per mode)

< EXIT | <ordered catalog facades selected for the active mode> | EXIT >
         facade   facade   ...   CORRAL   ...   facade
         [door]   [door]   ...   [door]   ...   [door]
==================================================================
                   walkable street and player lane
------------------------------------------------------------------

                 +------------------------------+
                 |       camera viewport        |
                 +------------------------------+
```

### Storefront catalog

A single catalog holds every known facade record (stable id, facade width, door
center, label, resource icon, ambient text kind, panel kind, and an availability
predicate). Each mode composes its street by filtering the catalog with explicit
town-layer capability flags: `landOfficeVisible`, `assayVisible`, and
`miningOutfits` (the resource list the Mining panel offers). Composition is
presentation-only; it changes no engine mechanics. The engine gates nothing by
mode except round count.

### Per-mode composition

The composition is derived from `OTHER_REPOS/mule_rules.md` (Beginner lines
40-44; Standard 45-49 adds land auctions, so the Land Office, per line 145;
Tournament 51-55 adds Crystite and the Assay office, per lines 54, 108, 144,
since assay is crystite-tied and crystite is Tournament-only):

| Facade | Beginner | Standard | Tournament (catalog-ready, no engine mode yet) |
| --- | --- | --- | --- |
| Mining Outfitting | yes (smithore) | yes (smithore) | yes (smithore + crystite) |
| Energy Outfitting | yes | yes | yes |
| Farm Outfitting | yes | yes | yes |
| M.U.L.E. Corral (spawn) | yes | yes | yes |
| Pub | yes | yes | yes |
| Land Office | no | yes | yes |
| Assay Office | no | no | yes |

So the composed streets are:

- Beginner: Mining, Energy, Farm, Corral, Pub (5 facades).
- Standard: the beginner set plus the Land Office (6 facades).
- Tournament (a catalog entry, rendered by no current engine mode): plus the
  Assay Office and the crystite option inside Mining (7 facades).

NES order is preserved among the included facades: Mining, Energy, Farm, Corral,
Pub, Land, Assay. A destination absent from a mode is not rendered; there is no
present-but-closed facade.

### Derived geometry

World width, facade positions, door centers, the corral spawn, camera bounds,
ambient info, and walker routes all DERIVE from the composed list using shared
spacing and padding constants. The exact spacing is tuned against development
time, but every mode's composed world stays wider than the viewport, so the
camera must scroll for the player to see both ends in every mode. The town
always renders at full scale. Do not force an artificial width on the smaller
beginner town: the beginner street is genuinely shorter than the standard street
while still exceeding the viewport on its own composed width.

The corral remains the starting anchor in every composition. Common outfit
errands go left; turn-end and information errands go right. This reproduces the
NES route choice while keeping every included destination in a predictable
order.

## Geometry contract

The replacement should use world-space rectangles, not a semantic cell grid.
Keep rendering, collision, interaction, camera, and tests on the same
`TownWorld` data, but give that source of truth the correct model. `TownWorld`
is the street COMPOSED for the active mode: a mode filter selects an ordered
subset of the storefront catalog, and every world coordinate derives from that
subset.

The storefront catalog holds one record per known facade; each record needs:

- stable destination id
- facade width and door center (world `x` is assigned during composition, not
  stored per record)
- label and resource icon
- ambient price or status text
- an availability predicate driven by the town-layer capability flags
- panel/action kind

Composition assigns world `x` in NES order among the included facades, then
derives world width, the corral spawn, camera bounds, and the two endpoint exit
zones from that ordered composed subset.

Define three vertical bands:

```text
SOLID FACADE     The avatar can never occupy this band.
DOOR THRESHOLD   A shallow pocket that opens and triggers entry once.
STREET LANE      The normal walkable band.
```

Required invariants:

- The composed street contains exactly the facades the active mode's flags
  select, in NES order, with no inactive or placeholder facade.
- World width derives from the composed subset and exceeds the viewport in
  every mode.
- No occupiable world point exists behind a facade.
- A closed door blocks the threshold.
- An open door permits movement only into the shallow threshold.
- Reaching the inner threshold opens the panel and stops world movement.
- Dismissing a panel places the avatar on the street side of that door.
- The avatar can walk left/right along the entire street without touching a
  storefront.
- Up approaches the nearest aligned door; down retreats to the street.
- Only the far-left and far-right endpoint zones leave town.

Do not create a doorway by subtracting a full-depth slot from a building
rectangle. Model a bounded threshold in front of an always-solid facade.

## Camera contract

The camera is part of the layout, not optional polish.

- Store avatar position in world coordinates.
- Render the street and storefronts through a camera `x` offset.
- Keep the avatar in a horizontal soft zone near the middle third while moving.
- Clamp the camera at both world ends.
- Keep the HUD, time bar, notices, and panels in screen space.
- Do not scale the whole world down to fit the viewport.
- At narrow widths, show fewer storefronts rather than shrinking signs below
  legibility.
- Make storefront labels and door state remain readable at the supported
  viewport widths, from the `1200 x 750` minimum on up.

A camera-follow test should use deterministic world coordinates. Browser tests
should assert camera offset and visible storefront identities, not pixel-perfect
screenshots.

## Visual contract

Use Planet M.U.L.E. for the look:

- industrial metal facades with a shared baseline
- large, integrated doors rather than detached arch markers
- sandy or worn street surface without editor-grid lines
- strong resource symbols backed by text labels
- price text visible on the facade before entry
- M.U.L.E. stock visible at the corral
- clear open/closed door animation and sound feedback
- a persistent development time bar

Use the NES port for composition:

- side view
- one row of storefronts
- world wider than viewport
- camera scroll
- corral near the middle
- exits only at the street endpoints

The town should communicate, within three seconds:

- where the player is
- which way the street continues
- which building is nearest
- whether its door is open
- how much development time remains
- whether the player is towing a M.U.L.E. and its outfit state

## Interaction state

Use an explicit state machine instead of deriving all behavior from avatar
position:

```text
STREET
  -> DOOR_OPENING
  -> AT_THRESHOLD
  -> PANEL_OPEN
  -> STREET

STREET
  -> LEFT_EXIT or RIGHT_EXIT
  -> OVERWORLD
```

Panel rules:

- Entry itself never changes economic state.
- The panel receives focus when it opens.
- Arrow keys move focus inside the panel.
- Enter or a mouse click confirms.
- Escape cancels and returns to the same doorway.
- Closing a panel restores movement focus and puts the avatar outside the
  threshold.
- Outfit, corral, Pub, Land Office, and assay states each expose specific
  success/failure feedback rather than one generic notice line.

## HUD requirements

Keep these visible while walking:

- Development phase and active player
- Time remaining as a bar, with a numeric value available accessibly
- Player money
- Towed M.U.L.E. state: none, unoutfitted, or resource outfit
- Current nearest storefront label and status

Show destination-specific economic details on the facade or at the threshold:

- Corral: M.U.L.E. price and stock
- Outfitters: outfit price
- Pub: expected action, including that it ends the turn
- Land Office: current availability
- Assay Office: idle, sample needed, or sample ready to return

## Test migration

Retire the current topology tests before using them as gates for the rewrite.
Replace them with tests that encode the desired world.

### Unit tests

Parameterize the geometry tests over the current modes; the town is composed per
mode, so a single universal geometry is no longer the assumption.

- In every mode, the composed world width exceeds the viewport width.
- In every mode, storefront order matches NES order among the included facades.
- Spawn is at the corral street position in every mode.
- Only left and right exits exist in every mode.
- Every composed storefront threshold is reachable from spawn by the street
  lane.
- No point behind any facade is reachable.
- Holding Up against a non-door facade never changes the avatar's inner depth.
- A closed door blocks the threshold.
- An open aligned door reaches only the bounded threshold.
- Door entry fires once and cannot continue through the facade.
- Closing or cancelling a panel returns the avatar to a valid street point.
- Camera offset follows the avatar inside its soft zone and clamps at both ends.

Per-mode composition (presence and absence):

- Each current mode composes exactly its confirmed storefront sequence: beginner
  is Mining, Energy, Farm, Corral, Pub; standard adds the Land Office.
- Each mode omits the facades its flags exclude: the beginner street contains no
  Land Office facade and no Assay Office facade; the standard street contains no
  Assay Office facade.
- No mode renders a destination whose feature is unavailable (no
  present-but-closed facade).
- Mining outfit options vary by mode (smithore only in the current modes,
  smithore plus crystite in the Tournament catalog entry) without adding or
  removing the Mining facade or changing the rest of the composed geometry.
- Composition is total over the availability flags: a future mode token composes
  a valid street (catalog-level property test, no new game mode added).

### Browser tests

- Hold Up at the corral, Pub, Assay Office, and between doors; the avatar never
  appears behind a building.
- Walk continuously from one endpoint to the other and verify camera movement,
  storefront order, and two endpoint exits.
- Verify no north/south exit markers or interactions render.
- Verify the time bar stays visible and updates while walking in town.
- Verify labels and prices remain visible at desktop and narrow viewports.
- Verify approaching opens only the aligned door.
- Verify entering every transaction door performs no dispatch before confirm.
- Verify Enter confirms inside a panel and does nothing as a shop-entry gesture
  on the street.
- Verify Escape cancels and returns control outside the doorway.
- Verify the tutorial text never tells the player to press Enter at a door.
- Verify buying, outfitting, leaving through either endpoint, and placing still
  complete within a normal full-time development turn.

### Negative regression test

Add one test named for the actual failure:

```text
town: the avatar cannot walk through or behind any storefront
```

Sample multiple `x` positions across every facade, hold Up longer than needed to
cross the old building depth, and assert both world `y` and camera-visible
position remain on the street side. This must fail against the current
implementation.

## Fix sequence

### 1. Replace topology

- Remove the `9 x 5` town cell model.
- Remove north/south exits and the smithore cross-street.
- Introduce the ordered storefront data and wider world coordinates.
- Start the development turn at the corral.

### 2. Replace collision

- Delete pass-through building geometry.
- Add solid facades and bounded door thresholds.
- Add explicit street, threshold, and panel states.
- Make the behind-building regression test pass.

### 3. Add camera and HUD

- Add horizontal camera following and endpoint clamps.
- Keep the timer, money, and tow state in screen space.
- Verify narrow viewports show fewer readable shops instead of a shrunken world.

### 4. Rebuild storefronts

- Replace the grid and tiny podiums with Planet-inspired facades.
- Integrate labels, prices, doors, and stock into the architecture.
- Add the Land Office facade and combine mining choices behind the NES-style
  Mining Outfitting entrance.

### 5. Repair interactions

- Remove contradictory Enter-at-door hints.
- Put outfit purchases behind confirmation panels.
- Return the avatar outside the threshold after every panel.
- Restore the assay return trip when its mechanics are implemented.

### 6. Replace test gates

- Delete or invert tests that require pass-through buildings and four exits.
- Add topology, camera, HUD, interaction, and negative collision tests.
- Recalibrate full-turn travel only after the final world width and camera are
  stable.

## Acceptance gate

The town layout is fixed only when all of these are true (mode-composed model,
amended 2026-07-10):

- In every mode, the town is a horizontally scrolling street wider than the
  viewport.
- The corral is the development-turn spawn anchor in every mode.
- Each mode composes its street from the shared catalog in NES order among the
  included facades (beginner: Mining, Energy, Farm, Corral, Pub; standard adds
  the Land Office), with world width, spawn, exits, and camera bounds derived
  from that composed list.
- No mode renders an inactive or placeholder destination.
- Only left and right endpoint exits return to the overworld.
- The avatar cannot occupy any point through or behind a facade.
- Door openings are bounded thresholds, not tunnels.
- The timer remains visible for the entire town visit.
- Storefront labels, prices, and door state are readable without memorization.
- Economic actions occur only after explicit confirmation inside a panel.
- Desktop, keyboard, mouse-panel, and touch-d-pad flows remain usable.
- Tests reject the old behind-building and four-exit behavior and prove each
  mode's composition, including the presence and absence of mode-specific
  facades.

The current collision module should not be patched by adding more rectangles to
the `9 x 5` floor. Its consistency is not the problem. It consistently enforces
the wrong town.
