# Screen designs

## Context

Companion to [SCREEN_FLOWCHART.md](SCREEN_FLOWCHART.md). The flowchart says which
screens exist and how they connect; this document describes what each screen
contains and how the three reference versions present it. The goal is to give us
a clear per-screen baseline so we can design our own unique look for each screen
with full knowledge of what the source material did and why.

Three references are compared throughout:

- **1983 original** (Ozark Softscape, Atari 8-bit / C64). Evidence from the
  Kroah reverse-engineering writeup (`OTHER_REPOS/mule_document.html`), the
  disassembly (`OTHER_REPOS/MULE-assembly/MULE-Disassembled_Memory.asm`), and
  the C64-Wiki rules dump (`OTHER_REPOS/mule_rules.md`).
- **1990 NES port** (Mindscape). Described from screenshots captured locally.
  The console art is copyrighted, so those images are not stored in this repo;
  they are described in prose and linked to external sources below.
- **2011 Planet M.U.L.E.** (Turborilla). Evidence from the decompiled Java under
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/`.

`OTHER_REPOS/` is a local reference checkout and is not tracked in this repo;
those paths are cited as plain text, not links. External source galleries are
linked in [Reference screenshots](#reference-screenshots-external).

## Version overview

| Aspect | 1983 original | 1990 NES | 2011 Planet M.U.L.E. |
| --- | --- | --- | --- |
| Renderer | Atari/C64 hardware sprites | NES PPU tiles/sprites | Java + Slick/OpenGL |
| Palette | 4 player colors | 4 player colors | full color, skinnable maps |
| Setup | joystick + function keys | menu screens, one per choice | networked lobby |
| Species | 8 choices | 9-icon grid pick | color/name in lobby |
| Auction layout | vertical price axis | vertical price axis | vertical price axis, per-player lanes |
| Extra screens | none | none | login, lobby, connect, pause |

## Shared visual vocabulary

A handful of visual conventions recur across almost every screen. Defining them
once here keeps the per-screen entries short and makes the family resemblance
between versions clear.

### Player identity token

Each player is represented by one persistent token - the chosen species sprite
(1983/NES) or named avatar (Planet M.U.L.E.), tagged with a fixed player color as
its label. What matters is that the same token you steer on the map is the same
token that stands on the auction floor and lines up on the score screen, so its
**position always encodes that player's current state**: where they are on the
map, what price they are offering in an auction, where they rank on the summary.
The token is the read-out; color is only the name tag on it.

### Resource emblems

Each of the four resources has a recurring icon used on shops, HUD panels, and
auction signs:

- **Food** - a sheaf/plant glyph (a stylized hook-pair on NES status screens; a
  wheat sheaf on the Planet M.U.L.E. auction sign).
- **Energy** - a lightning bolt (the NES energy status screen puts a bolt in each
  top corner).
- **Smithore** - a gear/cog.
- **Crystite** - a crystal/cactus glyph (Tournament only).

The store's stock and prices are shown with the same emblems, so a player reads
"which resource" from the icon and "how much / what price" from the number next
to it.

### The price axis (auctions and land)

Auctions and land bids share one spatial metaphor: **vertical position equals
price**. High on the screen is expensive, low is cheap. Sellers sit high (asking
more) and buyers sit low (bidding less); they physically move toward each other
until they meet. Two horizontal **dashed lines** mark the current seller price
and buyer price, and where they touch is where a trade fires. The store's sell
and buy prices bound the axis as a fixed **ceiling** and **floor**.

### Store price rails

The store is always present as the market-maker. On the 1983/NES auction it
appears as two small **crate icons** on the left with numbers: the top crate is
the store's sell price (the ceiling) and the bottom crate is the store's buy
price (the floor). Planet M.U.L.E. draws this as a tall **vertical gauge** on the
right edge with an orange fill showing the current price level, plus a stock/price
readout box.

### Time bar

Real-time phases show remaining time as a **vertical bar at the screen edge**
(cyan on NES, orange on Planet M.U.L.E.). It drains continuously; in development
it drains twice as fast while the player stands still, and in auctions everything
runs at quarter speed when nobody moves - so the bar quietly punishes hesitation.

### Persistent HUD (Planet M.U.L.E. only)

Planet M.U.L.E. keeps a fixed **HUD strip along the bottom of every in-game
screen**: a left label block reading "NAME / MONEY / GOODS", then one column per
player plus a "Store" column. Each player column is tinted in the player color
and shows the name, current money, and the four resource emblems with counts.
The 1983 and NES versions have no such persistent strip; they surface the same
information only on the dedicated status/summary screens between phases. This is
one of the clearest presentation differences: the remake keeps standings on
screen at all times, the originals batch them into summary beats.

### Map glyphs

The planet map is the same board in every version: a roughly 5x9 grid of plots
with a **central store building**, a vertical **river** running down the middle
(the best food land), scattered **mountain** glyphs (mineable, best for
smithore/crystite), and open **plains**. Owned plots are marked by a small
**house/homestead glyph in the owner's color**; a colonist dragging a MULE is the
active token. The map is reused as the backdrop for landing, land grant, land
auction, development, events, and production.

### Use of space

There is essentially no wasted space on any screen. The source hardware ran at a
small resolution, which forced an information-per-pixel discipline: screens fill
the frame edge to edge, and every region earns its place.

- **Edges and corners carry data.** Resource emblems sit in the top corners, the
  time bar runs along the extreme screen edge, titles pin to the top and the
  phase label to the bottom, and player money/unit rows line the bottom band.
- **No central void.** On status and auction screens the layout partitions
  cleanly - store info pinned to one side, players along the bottom, the verdict
  or going-price number at center, time at the edge - so even the middle of the
  screen is doing work (showing the price or the live trading).
- **Apparent empty space is the board.** The grey plains-and-mountain field on
  the map looks like background, but it is the content: it is the unclaimed,
  ownable, biddable land. The "emptiness" is exactly what the land grant and land
  auction are fighting over.
- Planet M.U.L.E.'s only deliberate slack is the letterbox around its fixed 16:10
  stage; inside the stage it keeps the same density and adds a permanent HUD strip
  so standings never leave the screen.

Our own game already commits to this in the HUMAN_GUIDANCE "fill the canvas"
rule; the source material is the reason that rule exists.

### Scale

Elements are sized by how much information they must hold at once, and the
relationships are deliberate.

- **A land tile is large; the colonist is small.** A plot must legibly contain a
  colonist token, a MULE, and the plot's resource/production readout
  simultaneously, so the tile is drawn big. The colonist token is only on the
  order of a quarter of a tile's width (a rough estimate from the frames - the
  figure reads as roughly one-fifth to one-quarter of the tile it stands in), so a
  developed plot never crowds. The size gap is functional headroom, not style.
- **The store reads as about one tile** at the map center - a peer of the plots
  it sits among, not a landmark that dwarfs them.
- **The auction axis is tall on purpose.** Player tokens are small against a
  price axis that spans nearly the full screen height, so a token's vertical
  travel gives fine price resolution: a large axis buys precise pricing. Shrinking
  it would coarsen every bid.
- **Text and number panels are packed tight.** The HUD and the money/units rows
  trade whitespace for density because standings must be read at a glance between
  fast phases.

**Scale is not fixed - it changes per screen to fit that screen's job.** The same
colonist token is drawn at very different apparent sizes because the "camera"
sits at a different distance on each screen:

- **Town / store - human-and-building scale (zoomed in, side view).** The store
  fronts are drawn large, each roughly a quarter of the screen wide and filling
  most of its height, with the colonist small on a foreground strip. You are
  close in, reading big shop signage and walking up to large destinations; the
  scale says "you are a person standing among buildings."
- **Land / map / development - whole-colony scale (zoomed out, top down).** The
  entire board fits on one screen; a plot is a modest rectangle and the colonist
  is only about a quarter of a tile. The scale says "see the whole colony and
  where your token sits in it," so you can plan land and movement.
- **Auction - price scale (abstract, no map).** There is no world at all, just a
  long price axis with small tokens on it. The scale exists to give fine price
  resolution, not to depict space; the token's size is chosen so many distinct
  prices fit between the store's floor and ceiling. The references run this axis
  vertically and ours runs it horizontally (see "Goods Auction (the trading
  floor)"), but the ratio is the point either way: the axis is the long dimension
  of the frame, and the tokens stay small against it.

So the town looms, the map surveys, and the auction abstracts - three different
scales chosen by task, not one global zoom. A design that reused a single scale
everywhere would either shrink the shops until their signs were unreadable or
blow up the map until the board no longer fit.

The lesson to carry into our higher-resolution screens is the ratio thinking, not
the pixel counts: pick each screen's scale from its job (loom, survey, or
abstract), size each element to the information it must hold, keep the board
(negotiable space) dominant where there is one, and let tokens stay small against
it.

## Screen catalog

Each screen below lists its purpose, the per-version presentation, and a short
design-contrast note.

### Title / attract

- **Purpose**: brand the game, wait for start, run an attract demo.
- **1983**: title with an all-computer demo game that plays itself until a
  button is pressed (`playersAi` all set, restart via the `start` sequence in
  the disassembly).
- **1990 NES**: a static title card - "Mindscape Presents / M.U.L.E." in chunky
  chrome lettering, the twin-canister MULE robot sprite, and
  "Copyright 1990, 1983 Ozark Softscape / Licensed from Electronic Arts /
  Licensed by Nintendo of America Inc."
- **Planet M.U.L.E.**: no attract screen; a Swing **Login** window and a **lobby
  browser** (`Main.displayLogin`, `MetaFrame`) take its place.
- **Contrast**: the two offline versions open on a single title; the remake
  opens on account and matchmaking flow.

### Setup: player count

- **Purpose**: choose 1-4 players (0 = all-computer demo in the original).
- **1983**: function keys on the title screen set count and mode; a count of 0
  runs the demo.
- **1990 NES**: a dedicated menu screen, a green arrow cursor pointing at
  "1 PLAYER / 2 PLAYERS / 3 PLAYERS / 4 PLAYERS".
- **Planet M.U.L.E.**: implicit in who joins the lobby (humans + AI fill seats).
- **Contrast**: the NES gives each setup choice its own full screen; the
  original packs them onto the title; the remake derives them from the lobby.

### Setup: difficulty

- **Purpose**: pick Beginner, Standard, or Tournament.
- **1983**: function-key cycle; difficulty controls round count, prices, cursor
  speed, pirates, and whether Crystite/assay exist.
- **1990 NES**: a menu screen with the arrow cursor on
  "BEGINNER / STANDARD / TOURNAMENT".
- **Planet M.U.L.E.**: game **modes** are Training (up to 4 AI) and Tournament
  (2+ humans), set at game creation (`model/GameMode.java`).
- **Contrast**: original and NES expose the classic three difficulties directly;
  the remake reframes them as online modes.

### Setup: color

- **Purpose**: assign each player a color identity.
- **1983**: purple, blue, green, orange.
- **1990 NES**: a "PRESS YOUR BUTTON TO SELECT" screen showing a colored square;
  each player claims a color in turn.
- **Planet M.U.L.E.**: chosen in the lobby with the player name.
- **Contrast**: color is a first-class per-player claim step on console; a
  profile field online.

### Setup: species

- **Purpose**: pick the alien species, which sets starting money and turn time.
- **1983**: 8 species. Mechtron is the computer's; Flapper is beginner-friendly
  (+$600 nest egg, more time); Humanoid is expert (-$400, less time). Only the
  Flapper/Human/"Others" categories matter mechanically.
- **1990 NES**: a 3x3 grid of nine species sprites under "PICK YOUR SPECIES / USE
  YOUR JOYSTICK TO MOVE YOUR COLOR TO THE SPECIES YOU MOST RESEMBLE". Moving onto
  a species tints that sprite in the player color and shows its blurb, e.g.
  "FLAPPER - from the Boird-drop galaxy. All Flappers receive an extra $600 in
  their nest egg!".
- **Planet M.U.L.E.**: no species pick; avatars are cosmetic and set in the
  lobby.
- **Contrast**: species is a meaningful economic choice with flavor text in the
  1983/NES games; the remake drops it, folding balance into modes instead.

### Landing on Irata

- **Purpose**: frame the colony fiction; hand over to the first status summary.
- **1983**: the map draws, the transport ship lands, message "YOU'RE LANDING ON
  THE PLANET IRATA." ("Irata" = "Atari" reversed; "months" = rounds). Evidence:
  the `start` sequence in the disassembly (`drawMap`, `animTransportShipLand`).
- **1990 NES**: a grey planet map bisected by a blue river, scattered mountain
  glyphs, a boxy transport ship at center labeled "TRANSPORT SHIP", and the
  "YOU'RE LANDING ON THE PLANET IRATA." banner.
- **Planet M.U.L.E.**: the reused **Intro** phase; on round 0 it plays the ship
  **landing** ("Simulated Landing on Planet Irata"), on round 1 the **takeoff**
  ("The Colonial Ship will be back in N months"). Evidence:
  `controller/phase/IntroPhase.java`.
- **Contrast**: all three share the Irata landing beat; the remake cleverly
  reuses one Intro phase for both landing and departure.

### Status Summary

- **Purpose**: show each player's Money / Land / Goods / Total and the colony
  total; gate the round on all players acknowledging.
- **1983**: `calcAndDrawScore`; shown at round 0 (starting state) and after every
  round. Score = Money (1 pt/$) + Land (500 + outfit cost per developed plot) +
  Goods (market value). Gate: "PRESS ALL PLAYER BUTTONS TO GO ON".
- **1990 NES**: "STATUS SUMMARY # N" with a per-player row block (species sprite
  in the player color, then Money / Land / Goods / TOTAL right-aligned), a
  "COLONY" grand total, and "PRESS ALL PLAYER BUTTONS". At round 0 Land is 0 and
  Goods reflects starting stock; by round 1 Land shows 500/525/550/575 values as
  plots get developed.
- **Planet M.U.L.E.**: `SummaryPhase2` + `SummaryPainter3`; ranked scores,
  colony total, a "Press Button to Show Colony" map toggle, shortage warnings,
  and a scrolling 7-tier colony-rating verdict. On the last round it becomes the
  endgame screen.
- **Contrast**: nearly identical across versions - this is the game's heartbeat
  screen. The remake adds a map/colony toggle and inline rating verdict.

### Land Grant

- **Purpose**: give each colonist one free plot per round.
- **1983**: `grantLand`; a selection cursor sweeps the plots at a
  difficulty-dependent speed; first player to press claims the highlighted plot;
  ties go to the lowest-ranked player.
- **1990 NES**: the grey map with the central store building, a black
  rectangular cursor stepping plot to plot, and "PRESS YOUR BUTTON TO SELECT A
  PLOT." over a "LAND GRANT" label. A second captured frame shows the four
  players' claimed plots (colored house glyphs) filling the ring around the
  store.
- **Planet M.U.L.E.**: `LandGrantPhase` + `LandGrantPainter`; a moving frame,
  colored land-ping effects, "Land Grant #round", "Press your Button to select a
  Plot". Timings in `GameData.java` (plot dwell, claim, outro).
- **Contrast**: identical concept and presentation across all three. The remake
  adds colored ping effects and network grace frames.

### Land Auction

- **Purpose**: sell additional plots to the highest bidder (Standard/Tournament).
- **1983**: `landsAuctionByPlayers` then `landsAuction`; a plot is highlighted on
  the map and a vertical price bar rises (English auction, $4 per pixel); up to 5
  plots per round; skipped entirely on Beginner ("NO NEW PLOTS FOR SALE.").
- **1990 NES**: same map-with-price-bar model (not among the captured frames but
  mechanically identical to the original).
- **Planet M.U.L.E.**: `LandAuctionPhase` toggles a map view (a "for sale" sign
  on the tile) with an auction view that reuses the goods-auction price-axis
  engine; loops once per plot; ties on round 1 broken randomly.
- **Contrast**: the remake unifies land and goods auctions onto one real-time
  price-ladder engine; the originals draw land auctions as a simple rising bar.

### Player Event (random individual)

- **Purpose**: a per-player windfall or setback before that player's turn.
- **1983**: about 27.5% chance per turn; 22 distinct events, each usable once per
  game; mostly money, occasionally land. A scrolling message names the player.
- **1990 NES**: same engine; a scrolling terminal message.
- **Planet M.U.L.E.**: `PlayerEventPhase`; the target player's mini-avatar
  blinks while a "* * * * name - event * * * *" message scrolls;
  `playerEventChance = 0.275`. In single (turn-based) development it precedes
  each player's development turn.
- **Contrast**: same probability and role in every version. Whether these events
  are enabled is a lobby vote in the remake.

### Development: map movement

- **Purpose**: real-time turn where a player walks the map to buy, place, outfit,
  assay, and gamble, against a shrinking time bar.
- **1983**: `playersTurn`; joystick moves the colonist (not the MULE). Turn time
  = 10 PTU + 91 PTU * food-ratio (about 47 s max); the bar drains twice as fast
  while the figure stands still.
- **1990 NES**: the map with the central store, the four players' plots as
  colored houses ringing it, the active colonist walking, and a time bar at the
  screen edge. Captured under "DEVELOPMENT #1" with a "TIME HAS RUN OUT" banner
  when the bar empties.
- **Planet M.U.L.E.**: `AbstractDevelopmentPhase` with Single (turn-based), Multi
  (simultaneous), and Fast (AI auto-run) variants; a blobby transition swaps the
  map for the store interior; pathfinding arrows, assay bot, wampus, and mules
  following the walker.
- **Contrast**: the core loop is identical; the remake adds the turn-based and
  AI-fast development modes and animated pathfinding.

### Town / store interior

- **Purpose**: buy a MULE, outfit it for a resource, and access pub / assay /
  land office; the store also sets prices and rebuilds MULEs.
- **1983**: the town holds MULE enclosure, four outfitting stations (Crystite
  $100, Smithore $75, Energy $50, Food $25), a free assay office, a land-sale
  office, and the pub. The player leads a bought MULE to an owned plot and
  installs it by moving the figure (not the MULE) to the plot center. MULE price
  = 2 x Smithore price rounded down to the nearest 10; the corral rebuilds up to
  14 MULEs from 2 Smithore each.
- **1990 NES**: the town is a **horizontally scrolling strip** of shop fronts;
  the player walks left/right past signs. Captured signs include "MINING
  OUTFITTING", "ENERGY OUTFITTING", "FARM OUTFITTING", "M.U.L.E. CORRAL", and
  "PUB" (Mining appears in Tournament for Crystite). A separate "BUY A MULE"
  screen shows a grid of MULE robot sprites with "HAVE $1600  MULE COSTS $100 /
  BUY A MULE / EXIT". After buying, the colonist leads the MULE (carrying a
  colored outfit kit) out of town.
- **Planet M.U.L.E.**: `ShopPainter` draws the store interior with outfit prices
  on the counter and MULE inventory stacks; entering the store is a transition
  from the map within the development phase.
- **Contrast**: the original packs eight buildings into one town screen; the NES
  spreads them along a scrolling street with clear signage and a dedicated
  MULE-purchase screen; the remake uses a store-interior overlay. This is one of
  the biggest layout divergences and a good place for our own take.

### Assay office (Tournament)

- **Purpose**: reveal a mountain plot's Crystite grade before mining it.
- **1983**: enter the assay office (no MULE), walk to a plot, sample, return to
  learn None/Low/Medium/High. Only in Tournament.
- **1990 NES**: reached via the "MINING OUTFITTING" street in Tournament; same
  sample-and-return loop.
- **Planet M.U.L.E.**: an assay action inside development (assay bot animation).
- **Contrast**: a Tournament-only wrinkle; presentation is minimal in every
  version.

### Pub (gamble leftover time)

- **Purpose**: end a turn early and convert unused time to cash.
- **1983**: winnings = round bonus (50/100/150/200 by round band) + random up to
  2x time left, capped at $250 (round 12).
- **1990 NES**: the "PUB" storefront on the town street ends the turn.
- **Planet M.U.L.E.**: a gamble action in development (`gamble()`).
- **Contrast**: same mechanic; a building you walk into on console, an action in
  the remake.

### Wampus hunt

- **Purpose**: a hidden bonus - catch the Mountain Wampus for a cash chest.
- **1983**: a colored dot appears on a random mountain when a player is alone;
  standing on the exact pixel yields $100-$400 by round band; once per turn,
  never while dragging a MULE.
- **1990 NES**: same hidden-dot mechanic during development.
- **Planet M.U.L.E.**: `huntWampus()`; "YOU CAUGHT THE MOUNTAIN WAMPUS"
  (`MenuPainter`).
- **Contrast**: an easter-egg-flavored bonus, preserved everywhere.

### Colony / round events

- **Purpose**: a colony-wide fortune or disaster once per round.
- **1983**: one `roundEvent` after production - Pest Attack, Pirate Ship, Acid
  Rain, Planetquake, Sunspot, Meteorite, Radiation, Fire in Store, each with a
  per-game cap. The final round's event is always the colony ship return.
- **1990 NES**: same event set with full-screen graphics.
- **Planet M.U.L.E.**: split into **Colony Event A** (before production) and
  **Colony Event B** (after production); `ColonyEventPainter` has about nine
  sub-painters. A phase whose drawn event does not match its category is skipped
  instantly.
- **Contrast**: same events; the remake formalizes the pre/post-production timing
  as two phases.

### Production

- **Purpose**: each installed MULE converts energy into its resource.
- **1983**: `calcPlotsProdWithMissingEnergyMalus`; output up to 8 units per MULE,
  modified by tile quality, economies of scale (adjacent same-resource tiles),
  learning curve, and energy sufficiency.
- **1990 NES**: an animated production tally (captured as a "STATUS # N" screen
  showing store stock and per-player usage bars as consumption resolves).
- **Planet M.U.L.E.**: `ProductionPhase`; per-tile counts tick up after "power"
  resolves, "Energy at n%", "Press your Button to Skip".
- **Contrast**: same formula; the remake adds a skip and an energy-percent
  readout.

### Collection / Status (per resource)

- **Purpose**: before each resource's auction, resolve that resource's
  bookkeeping: previous stock, usage, spoilage, new production, and the
  surplus/shortage verdict.
- **1983**: part of the trading stage setup; surplus/shortage line drawn per
  resource.
- **1990 NES**: titled "STATUS # N FOOD" / "STATUS # N ENERGY". The left column
  shows the store's two price rails as crates (top = store sell price, bottom =
  store buy price, e.g. Food 50/15, Energy 45/10). Cyan bars over each player
  animate "USAGE" (consumption), then the verdict word appears - "SURPLUS" for
  energy in the captured round. Player money and unit counts sit along the
  bottom.
- **Planet M.U.L.E.**: `CollectionPhase` + `CollectionPainter`; animated bars
  cycle through "Previous Amount -> Usage -> Spoilage -> Production -> result"
  with a "Surplus/Shortage/Sufficient" readout, then hands off to the auction of
  the same resource.
- **Contrast**: the remake makes the accounting steps explicit and animated; the
  NES compresses them into a status screen; the original draws a simpler
  surplus/shortage line. Order is always Smithore, Crystite, Food, Energy.

### Goods Auction (the trading floor)

See the dedicated walkthrough in
[Understanding the auction screens](#understanding-the-auction-screens) below.

- **Purpose**: a real-time open-outcry market, run once per resource, where
  players buy and sell to each other and to the store.
- **1983**: `goodAuction` x4 in Smithore -> Crystite -> Food -> Energy order.
  Two sub-phases: **declaring** (each player chooses buyer or seller, about 2 s)
  and **trading** (a real-time floor, about 4.7 s, quarter-speed when nobody
  moves). Seller avatars start high and walk their asking price down; buyer
  avatars start low and walk their bid up; a trade fires where a buyer line meets
  a seller line, at that price, unit by unit, until someone leaves or runs out.
  The store is both buyer and seller within its price max/min.
- **1990 NES**: two titled screens per resource. "STATUS # N FOOD" handles the
  declaring step ("PUSH STICK TO DECLARE AS BUYER OR SELLER", "STORE HAS 16
  UNITS"); "AUCTION # N FOOD" is the real-time floor - a vertical price axis with
  the store's sell/buy crates as the ceiling/floor rails, sellers high on a
  dashed line, buyers low on a dashed line, the current price shown at center
  (e.g. "29"), and a time bar on the right. When lines meet, "UNITS TRADED 3"
  appears and money updates. An all-buyers/no-seller resource (captured for
  Energy) simply lets players buy from the store.
- **Planet M.U.L.E.**: `AuctionPhase` + `AuctionPainter`; the same vertical-price
  model with each player in a lane, the store price rail on the side, a "Press
  Stick to Declare Buyer or Seller" countdown, then real-time price movement with
  auto-executing unit transactions that accelerate as volume grows. Captured
  "FOOD AUCTION 5" shows two players marked SELL high, buyers low, per-lane
  prices ($97, $98), a store "$65" rail, and per-player units-traded counters.
- **Contrast**: the price-axis, walk-to-meet mechanic is preserved in all three.
  The 1983/NES store rails are two crates; the remake draws a single side rail.
  All three run the price axis vertically because all three were composed for a
  taller frame than ours; this is the screen where our design most deliberately
  departs from the source.
- **Our implementation** (rebuilt 2026-07-11): the auction is recomposed
  **natively for the 16:10 landscape stage** rather than centering a narrow
  NES-shaped layout inside a wide frame. The axis is rotated: **price runs left
  to right** -- cheap at the left wall, expensive at the right -- so buyers walk
  **rightward** from the cheap side as they raise their bids and sellers walk
  **leftward** from the expensive side as they cut their asks, and a trade fires
  where they converge. The store's two crate rails become **vertical walls
  bounding the runway** at both edges (buy rail left, sell rail right), the best
  bid and best ask are vertical dashed lines, and each player owns a **horizontal
  lane row** instead of a vertical lane. A **left dock** carries each player's
  role, money, units, and units traded on their own row; the top HUD hides for
  the duration so the auction owns the whole stage. The status/accounting beat
  runs as an overlay on the live arena before each declare window, and
  ArrowLeft/ArrowRight are the primary taught controls because they match the
  direction the avatars actually move.
- **Our departure, stated plainly**: the NES auction screens are the reference for
  **layout, interaction, and information hierarchy** -- which elements exist, how
  they relate, and what the player reads where. Every NES relationship is
  preserved: position is price, store rails bound the band, dashed lines mark the
  live best bid and best ask, per-player role/money/units/traded stay visible, and
  the going price, timer bar, and units-traded banner all keep their jobs. The
  **graphic treatment** is not the NES's: it follows the Planet-inspired modern
  look the town facades already use, and is deliberately **not** a NES pixel-art
  reproduction. Reference for what to show and how it relates; our own look for
  how it is drawn.

### Endgame

- **Purpose**: declare the winner and rate the colony.
- **1983**: `drawScore` + "PRESS ALL PLAYER BUTTONS TO GO ON", then a colony
  rating message from the total score (7 tiers), and the "First Founder" title
  for the leader when the colony succeeds (colony score >= 60000).
- **1990 NES**: the final Status Summary followed by the colony verdict.
- **Planet M.U.L.E.**: the last-round `SummaryPhase2` becomes the endgame; it
  saves the score and scrolls the rating verdict.
- **Contrast**: shared structure; the rating verdict text is a signature M.U.L.E.
  flourish worth keeping.

### Planet M.U.L.E. only: networking screens

- **Login / lobby browser**: Swing windows for account and game selection.
- **Connect**: TCP/UDP handshake, "Connecting..." / "CONNECTION FAILED", and
  reconnect tokens (`ConnectPhase`).
- **Game Lobby**: player cards ("PLAYED / RATIO / ABANDONED"), spectator list,
  ready-up, and a vote to enable gain/lose-plot events (`LobbyPainter3`).
- **Pause / reconnect**: disconnect grace, vote-to-kick, AI takeover, resume
  countdown (`PausePhase`, `ReconnectPainter`); can preempt any in-game phase.
- **In-game chat**: overlaid on gameplay.
- **Contrast**: these exist only because the remake is online; they have no
  1983/NES equivalent and are out of scope for a single-machine remake unless we
  add multiplayer.

## Understanding the auction screens

The auction is the most information-dense screen in the game, and it is really a
short sequence of stages, each conveying different information and asking a
different thing of the player. The captured frames are key moments in that
sequence, not a full frame-by-frame capture. Read against
`OTHER_REPOS/mule_rules.md`, they resolve into one coherent flow.

Each resource is traded as a two-screen unit: a **status** screen (accounting +
choose your side) followed by a **floor** screen (the live real-time market).
The four resources run in the fixed order Smithore -> Crystite -> Food -> Energy,
and any resource nobody can trade is skipped.

### Stage 1 - status: what the market tells you before you commit

The "STATUS # N <RESOURCE>" screen is the information phase. Before anyone picks
a side it lays out the full supply-and-demand picture for this one resource:

- **Store position** (left): the store's stock and its two prices, drawn as a
  top crate and a bottom crate. The top number is the store's **sell** price, the
  bottom number is the store's **buy** price. These are the ceiling and floor for
  the coming market.
- **Per-player holdings** (bottom): each player's current units of this resource,
  and their money.
- **Usage** (bars over each avatar): the animation subtracts each player's
  consumption for the round, so you watch demand eat into supply.
- **Spoilage and production**: leftover perishables shrink and new production is
  added (Planet M.U.L.E. animates these as labelled steps: Previous Amount ->
  Usage -> Spoilage -> Production -> result; the NES compresses them onto the
  status screen).
- **Verdict** (a word): "SURPLUS", a shortage, or sufficient. This is the single
  most important read - it tells everyone whether the colony is long or short this
  resource, which is what should drive their buy/sell choice next.

```
  NES status screen (information layout)
  +-------------------------------------------------+
  |               STATUS # 1 / FOOD                 |
  |  emblem                              emblem     |
  |  [50]  <- store SELL price (ceiling)            |
  |         |bar|  |bar|  |bar|  |bar|   usage       |
  |  [15]    A      A      A      A     player       |
  |   ^store BUY (floor)                tokens       |
  |  MONEY  1475   1084   905    1118               |
  |  UNITS   3      7      3      3    holdings      |
  |               STORE HAS 16 UNITS                |
  +-------------------------------------------------+
```

### Stage 2 - declaring: the one binary choice

Between status and the live floor the game asks each player a single question,
shown as "PUSH STICK TO DECLARE AS BUYER OR SELLER" with "STORE HAS n UNITS":

- **Push up = seller. Push down = buyer.** That choice puts your token on the
  seller line (high) or the buyer line (low) for the floor.
- The game pre-assigns a sensible default if you do nothing: for Smithore and
  Crystite you default to seller if you own any, else buyer; for Food and Energy
  you default to seller when you have a surplus.
- A player who has declared shows "SELL" (or drops to the buy line). This is the
  only decision the player commits to before the real-time scramble; everything
  after is execution.
- The declaring window is short (about 2-3 seconds), so the status verdict you
  just read is what you act on.

### Stage 3 - the floor: how the walk works

The "AUCTION # N <RESOURCE>" screen is the live market. Its whole layout is a
single idea: **your vertical position is your price.** High on the screen is
expensive, low is cheap.

```
  NES auction floor (price = vertical position)
  +-------------------------------------------------+
  |               AUCTION # 1 / FOOD                |
  |  emblem            [29] going price   emblem    |
  |  [50] ceiling = store sell                    |t|
  |        A....A....A   seller line (asks)       |i|
  |            (sellers walk DOWN over time)      |m|
  |        A....A....A   buyer line (bids)        |e|
  |            (buyers walk UP over time)         |b|
  |  [15] floor = store buy                       |a|
  |  MONEY  BUY    BUY    BUY    BUY              |r|
  |  UNITS  1475   1084   905    1118              |
  |  TRADED   (fills in as units change hands)      |
  +-------------------------------------------------+
```

The walk, precisely:

- If you declared **seller**, your token sits in the **upper** band. Walking
  **down** lowers your asking price (you accept less); walking up raises it.
- If you declared **buyer**, your token sits in the **lower** band. Walking
  **up** raises your bid (you offer more); walking down lowers it.
- The two dashed lines are the current **best ask** (top) and **best bid**
  (bottom); the vertical gap between them is the spread, and the center number is
  the going price.
- When a buyer's line rises to meet a seller's line (or a seller drops to meet a
  buyer), the two tokens are at the same price and a **transaction fires**: units
  move one at a time at that price, and the pace **accelerates** the longer they
  stay matched (roughly 225 ms per unit down to 125 ms). "UNITS TRADED 3" is a
  completed run.
- A match ends when either token walks away (prices separate), the **buyer runs
  out of money**, the **seller runs out of goods**, or - for food and energy - a
  seller hits their own **critical reserve** and snaps back to the top to stop
  selling their survival stock.
- The **time bar** on the right ends the whole auction. Movement runs at
  quarter speed while nobody is moving, so standing still wastes the clock and
  pressures both sides to commit.
- Two humans can **collude**: pressing their buttons together lets them trade
  privately at a price of their choosing, freezing out the AI and the store for
  that exchange.

Planet M.U.L.E. draws the same mechanic with each player in their own vertical
**lane** and the store as a gauge on the right instead of two crates:

```
  Planet M.U.L.E. auction arena
  +-----------------------------------------------------+
  | resource      <RES> AUCTION <round>       [ stock ] |
  |  sign                                     [ $sell ] |
  |   lane lane lane lane                     +-------+  |
  |    |    |    |    |    Asell Asell (high)  | gauge |  |
  |   ====== dashed going-price line ======   | fill= |  |
  |    Abid  Abid (low)                        | price |  |
  |    $97   $98   per-lane offered price      +-------+  |
  |    [3]   [6]   [0]   [15]  units + side    [ $buy  ] |
  |                  Production  (step label)            |
  +-----------------------------------------------------+
  | NAME  |  P1  |  P2  |  P3  |  P4  |  Store           |
  | MONEY | $..  | $..  | $..  | $..  |  stock  (HUD)    |
  | GOODS | icons + counts per player | store stock      |
  +-----------------------------------------------------+
```

Each lane shows that player's offered price and, at the bottom, their units
traded and current side; the store gauge shows the price level and the store's
sell/buy numbers; the persistent HUD underneath keeps every player's money and
goods on screen throughout.

**How ours differs (2026-07-11).** All three references put price on the vertical
axis because all three were composed for a taller frame. Our stage is 16:10
landscape, so the axis is rotated: price runs left to right, buyers walk rightward
and sellers leftward, the store's rails become the walls at either end of the
runway, and each player gets a horizontal lane row. Read the stages above for the
relationships -- what the status screen must tell you, why the declare choice is
binary, how the walk resolves into a trade -- and see "Goods Auction (the trading
floor)" above for how that same information is laid out on our landscape stage.

### The store in the supply-and-demand pricing

The store is not scenery - it is the mechanism that turns the colony's
supply/demand into actual prices, in three ways:

- **Guaranteed counterparty, bounded band.** The store always stands ready to buy
  at its floor and sell at its ceiling. So a seller never accepts less than the
  store's buy price (they would just sell to the store), and a buyer never pays
  more than the store's sell price (they would just buy from the store). Every
  player-to-player trade is therefore squeezed **inside the store's price band**.
  The band is the market; the walk is only where within the band the deal lands.
- **Intermediary, not an infinite source.** The store can only sell what it has
  previously bought. If nobody sold food to the store, it has none to resell,
  even at its ceiling, so a genuine shortage cannot be papered over by the store -
  "STORE HAS n UNITS" tells players how much cushion actually exists.
- **Round-to-round repricing on scarcity.** Between rounds the store moves its
  whole band based on the colony's surplus or shortage: a scarce resource pushes
  the store's prices up, a glut pushes them down (difficulty settings clamp the
  min/max, and Beginner fixes them). This is the real supply-and-demand loop, and
  the status screen's SURPLUS / SHORTAGE verdict is the player-facing preview of
  which way the band just moved. Trade well against a shortage and next round's
  higher prices reward you.

### Why only Food and Energy show early

Because the auctions run Smithore -> Crystite -> Food -> Energy and skip any
resource nobody can trade, the opening rounds only run Food and Energy: players
start with food and energy stock but have produced no smithore or crystite yet.
That is why every captured floor frame is a Food or Energy auction.

## Reference screenshots (external)

The NES and Planet M.U.L.E. screenshots are copyrighted and are not stored in
this repo. Browse them at their sources:

| Screen | Version | Source |
| --- | --- | --- |
| In-game map | 1983 (Atari) | https://en.wikipedia.org/wiki/M.U.L.E. |
| Annotated playfield | 1983 (C64) | https://www.c64-wiki.com/wiki/M.U.L.E. |
| Land grant, town, auction, score | 1983 (C64) | https://www.c64-wiki.com/wiki/M.U.L.E. |
| Store, auctions, wampus, ship, summary | Planet M.U.L.E. | https://www.carpeludum.com/modern-remakes-of-m-u-l-e/planet-m-u-l-e/ |
| Full galleries | original / Planet | https://www.mobygames.com/game/9752/mule/screenshots/ and https://www.mobygames.com/game/113088/planet-mule/ |

Playable copies for capturing your own frames: the Internet Archive hosts both
the 1983 Atari version and Planet M.U.L.E.

## See also

- [SCREEN_FLOWCHART.md](SCREEN_FLOWCHART.md) - the screen flow and transition
  triggers.
- [RULE_SOURCES.md](RULE_SOURCES.md) - provenance of formulas and constants.
