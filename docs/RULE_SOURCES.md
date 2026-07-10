# Rule sources

This is the durable adjudication record for the M.U.L.E. original-fidelity upgrade
(`docs/archive/mule_fidelity_plan.md`, archived on plan completion). Every constant, formula, and behavior that
this engine implements traces to one of the reference repos under `OTHER_REPOS/` (gitignored,
local-only). See [REFERENCE_REPOS.md](REFERENCE_REPOS.md) for how to read each reference repo.

## Emulation target and authority order

The emulation target is Planet M.U.L.E. (Turborilla's licensed 2009 remake) -- its values,
behaviors, and modern presentation -- at the classic 1983 core feature set (no lab items, no
assay bot, no player land selling). When sources disagree, this is the resolution order:

1. `OTHER_REPOS/planet_mule/data_decompiled/` -- decompiled Java, primary authority. Every
   constant and formula below was read directly from these files.
2. `OTHER_REPOS/mule_document.html` (Kroah's 1983 decompilation, v0.41) plus
   `OTHER_REPOS/MULE-assembly/MULE-Disassembled_Memory.asm` -- heritage cross-check, adjudicates
   when the Java is ambiguous.
3. `OTHER_REPOS/TSavo-mule-game/reference/*.md` -- transcriptions of the same Planet M.U.L.E.
   decompilation by a third party; cross-check only, and known to contain at least one
   transcription error (see [Pub payout array](#pub-payout-array-tsavo-transcription-error)
   below). TSavo's own `reference/MECHANICS-AUDIT-V2.md` self-reports 30 unfixed issues against
   its own implementation, so only the `reference/*.md` audit prose is useful, not its code.
4. planetmule.com/how-to-play.
5. C64-Wiki / the Atari manual, including the saved prose writeup `OTHER_REPOS/mule_rules.md`
   (rules narrative, event lists, platform-difference notes).

## Extraction workflow

For every rule this project implements:

1. Read the formula or constant directly from the planet_mule Java (see
   [REFERENCE_REPOS.md](REFERENCE_REPOS.md) for the class map). Note the exact class, field, or
   method name and file path.
2. Cross-check against the Kroah 1983 decompilation doc and disassembly where a formula exists
   there. Record agreement or divergence.
3. If a third source (TSavo audit, planetmule.com, C64-Wiki) disagrees, resolve by the authority
   order above and record the loser's value and source here, with a one-line reason.
4. Write fresh TypeScript in this repo's own style implementing the resolved value or formula.
   Never copy code from `OTHER_REPOS/`; extract the rule, then write it from scratch.
5. Add a source comment on the exported constant in `src/engine/constants.ts` naming the
   authoritative file (for example `Source: planet_mule GameData.java, developmentPubRoundBonus`).
   The constant-metadata audit test (`tests/test_constants_sources.mjs`) enforces this.
6. Write a behavior test for the formula, not just a constant-value test, so a future refactor
   that changes the formula's shape (not just its numbers) is caught.

## Rule conflicts and chosen values

### Colony rating: Planet M.U.L.E. formula vs 1983

- **Chosen value (PM):** `rating = clamp(colonyTotal / (20000 * lastRound / 12), 0, 6)`, indexing
  7 Federation outcome messages. Verified in
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/controller/phase/SummaryPhase2.java`
  lines 282-289 (`getColonyMessage`): `n2 = 20000 * n / 12; n3 = MuleMath.clamp(colonyTotal / n2,
  0, colonyMessages.length - 1)`, where `n` is `gameInfo.getLastRound()`. This scales the
  threshold with game length (beginner 6 rounds vs standard 12 rounds), so a shorter game does
  not unfairly demand the same colony total as a full 12-round game.
- **Secondary source (1983):** `OTHER_REPOS/mule_rules.md` (C64-Wiki-derived prose, "Score
  computing" table) gives seven fixed thresholds at multiples of 20,000, unscaled by round count:
  under 20,000 (Prison), 20,000 (On your own), 40,000 (Tent), 60,000 (Bare minimum, "First
  Founder" declared at this line per the same table), 80,000 (Comfortable), 100,000 (Elegant),
  120,000+ (Luxury). These fixed thresholds only make sense for the 1983 game's single standard
  length; they are not present as a literal formula in `mule_document.html` or the disassembly
  (grepped for `10000`/`20000`, no hits), only as this threshold table.
- **Reason chosen:** PM's round-scaled formula generalizes correctly to this project's beginner
  (6-round) and standard (12-round) modes, while the 1983 fixed-threshold table would silently
  double the effective difficulty of a 6-round game. Per the authority order, PM is primary.
- **1983 messages (for reference, first/last identical to PM's shape):** Prison, On your own,
  Tent, Bare minimum, Comfortable, Elegant, Luxury -- same seven bands as PM's
  `colonyMessages` array (`SummaryPhase2.java` line 58), so only the threshold *scaling*, not the
  message set, differs.

### Colony-event model: PM pre-shuffled deck vs 1983 remaining/slots

- **Chosen value (PM):** a fixed 20-slot-per-game deck, pre-shuffled once per game. Verified in
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/ColonyEventGenerator.java`
  `generate()` (lines 34-65): slot 0 (round 0) is always empty; group A (pirates x2, acid rain
  x3, sunspot x3, fire x2, ten events total) is shuffled twice and split across slots 1-2 first,
  the remainder of group A merged with group B (pest x3, planetquake x3, meteorite x2, radiation
  x2, ten events total) shuffled twice more and filled into the remaining slots; the last round's
  slot is force-overwritten with `SHIP_RETURNS`. This deck sits behind an A/B split around the
  develop/production phases (per the plan's key-formulas summary); the split is presentational
  scheduling and not re-verified line-by-line in this doc pass.
- **Secondary source (1983):** the Kroah decompilation documents a "remaining count" /
  "available slots" probabilistic model instead of a pre-shuffled deck (see the disassembly's
  `roundEventsProb` / `roundEventsProbInit` tables, `MULE-Disassembled_Memory.asm` lines
  14299-14300 and 24503-24532, which decrement/increment a per-event remaining-probability
  counter rather than drawing from a shuffled list).
- **Reason chosen:** PM is the emulation target; its deck model is simpler to make deterministic
  under this engine's seeded Rng (draw order is fixed once per game, not re-rolled per round),
  which matters for the replay harness (`docs/archive/mule_fidelity_plan.md`, M1
  replay determinism requirement).

### Pub payout array: TSavo transcription error

- **Chosen value (PM, verified directly):**
  `developmentPubRoundBonus = [0, 50, 50, 50, 100, 100, 100, 100, 150, 150, 150, 150, 200]`
  (index 0 unused, indices 1-12 are round bonuses) and
  `developmentPubMaxRandomAmount = 200`, both read directly from
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/GameData.java` lines 78-79.
  The payout formula, verified in
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/GameModel.java` lines
  432-443: `payout = pubRoundBonus[round] + floor(random() * min(timeLeft / developmentMaxTime,
  1) * pubMaxRandomAmount)`, doubled for Flapper (out of this project's scope, species are
  cosmetic), capped at 250.
- **TSavo transcription error:** `OTHER_REPOS/TSavo-mule-game/reference/MECHANICS-AUDIT.md`
  (line 231) and `reference/PHASES-ANALYSIS.md` (lines 265-267) both transcribe
  `pubRoundBonus = [25, 25, 25, 50, 50, 50, 50, 75, 75, 75, 75, 100, 100]` and
  `pubMaxRandomAmount = 100` -- exactly half of the verified PM values, and shifted by one index
  (a leading 25 where PM has a leading unused 0). TSavo's own audit calls this out as its own
  bug ("Pub payouts ~2x too high" -- its *implementation* used the wrong, larger numbers while
  its own transcribed reference table was the halved one; the two documents disagree with each
  other, and neither matches the verified `GameData.java` source).
- **Reason chosen:** this project reads `GameData.java` directly rather than trusting either of
  TSavo's two conflicting numbers. The verified array and cap (250) are used as-is.

### Standard round count

- **Chosen value:** 12 rounds. `OTHER_REPOS/mule_rules.md` line 46 ("Standard: The game ends
  after 12 rounds") and the Kroah 1983 doc's PTU/level modifier tables (which enumerate
  Beginner/Standard/Tournament as the three levels, with Standard and Tournament sharing timing)
  agree.
- **Rejected value:** `OTHER_REPOS/TSavo-mule-game/reference/*.md` was checked during planning
  and found to assert standard mode is 8 rounds; no such claim was found in either
  `mule_rules.md` or `mule_document.html`, and PM's `GameData.data` round-length config is not a
  compiled-in constant (it is set per game start), so this project treats "8 rounds" as
  unsupported and uses 12 (user decision, recorded in the plan's Resolved decisions).

### Species handicaps: recorded-but-cosmetic

- **1983 values (recorded, not implemented):** `OTHER_REPOS/mule_rules.md` lines 34-36: Flapper
  starts with $600 extra ($1600 total against a $1000 base), Humanoid starts with $400 less
  ($600 total), tournament-mode AI players get $200 extra. The Kroah doc's PTU race-modifier
  table separately gives Flapper +2 BTU and Human -2 BTU turn-time modifiers (a per-species
  *speed* handicap distinct from the starting-money handicap).
- **Chosen value (this project):** flat $1000 starting money for every species, species purely
  cosmetic (user decision, `mule_fidelity_plan.md` Resolved decisions). `GameData.java` line 15
  confirms PM's baseline `playerStartMoney = 1000` with no species field consuming it directly in
  the decompiled model (species/race bonuses are read from `Properties.mule` flags such as
  `easyToCatchWampus` and the Flapper pub-double check in `GameModel.java` line 439, gated behind
  `Properties.mule.enableHiring`, which this project's classic-core-feature-set scope excludes).
- **Reason chosen:** user decision; the 1983 and PM handicap values above stay recorded here as
  a future data-only toggle if species bonuses are ever added back.

### 1983 beginner stock tables: recorded-but-unused

- **Recorded (not used):** `OTHER_REPOS/mule_rules.md` line 43 states beginner mode gives "extra
  resources and time" without a numeric table in the saved prose; where a numeric per-mode
  beginner stock table exists in secondary sources it is not reproduced here because it was not
  independently verified against the primary Java or the disassembly during this extraction
  pass.
- **Chosen value:** this project's title mode picker (beginner 6 rounds / standard 12 rounds,
  `mule_fidelity_plan.md` Resolved decisions) uses the PM value for every economy constant --
  starting money $1000, food 4, energy 2, store stock 8/8/8/0 plus 14 mules -- in both modes.
  Beginner differs from standard only in round count. `GameData.java` lines 15-24 back every one
  of these PM starting values.
- **Reason chosen:** the plan's design philosophy (fidelity by formula) treats PM as the single
  emulation target; a separate, unverified 1983 beginner economy table would introduce a second
  untested tuning surface for no fidelity gain, since beginner mode's only user-visible
  difference in this project is round count.

### Smithore floor details

- **Chosen value:** the smithore price calculation floors its randomized result at 50 before
  adding the per-purchase jitter, then clamps the final price to `[20, 230]`. Verified in
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/ResourcePrices.java`
  `calcSmithorePrice` (lines 49-59): `n4 = round(price * f2); n4 = max(n4, 50); setSmithorePrice(n4
  + jitter)`, where `setSmithorePrice` (lines 61-64) does `buyPrice = price = clamp(n, 20, 230)`.
  The jitter itself (`Shop.java` lines 305-314, `calcBuySellPrice` for `Smithore`) is
  `round(1.0 * normalDistributed(random) * 7.0)`, roughly the +-7 amplitude noted in the plan's
  key-formulas summary. Sell price is `buyPrice + shopSmithorePriceRange` (35, `GameData.java`
  line 33).
- **Mule rebuild floor:** `Shop.buildMules()` (`Shop.java` lines 483-497) floors the smithore
  spend to a multiple of 2 (`n3 -= n3 % 2`, effectively `n3 = smithore - smithore % 2` when
  smithore-limited) before converting 2 smithore to 1 mule, and floors the resulting mule price
  to a multiple of 10 (`mulePrice -= mulePrice % 10`).

### Replay-validity-per-build policy

- **Policy:** action logs are valid for replay within one build/version of this engine only.
  When the Action schema changes (a new Action variant, a renamed or reshaped payload field, or a
  change to which random rolls the reducer consumes and in what order), any previously recorded
  action log becomes replay-invalid and must be regenerated. This is a deliberate scope
  narrowing versus PM's own save-compatibility guarantees (PM ships a networked, version-pinned
  save format via `com.turborilla.mule.network`, out of scope for a single-player fidelity
  port).
- **Enforcement:** the M1 replay harness (`mule_fidelity_plan.md`, WS-E-foundation) is the
  correctness gate for "same seed plus same action log replays to an identical GameState"; it is
  regenerated whenever the schema changes, not preserved across schema changes.

### Auction "out" role: a deliberate repo addition over PM's buyer/seller binary

- **Deviation:** this engine adds a third goods-auction role, `out`
  (`AuctionRole = "buyer" | "seller" | "out"`, `src/engine/game_state.ts`), and a
  matching "Sit Out" button, on top of Planet M.U.L.E.'s buyer/seller model. PM has no
  explicit third role: a non-participating player simply has `AuctionState.inAuction=false`.
  This is a user-approved addition for pacing (2026-07-09): a player who is done with a good
  can sit it out and let the round finish faster, rather than being forced to hold on the track.
- **Reference behavior (PM):** a non-participating player is drawn OFF the price track near the
  store and shows NO dollar figure. Verified in
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/view/AuctionPainter.java`
  lines 188-215, where the price string `"$" + price` is painted only when `isInAuction()` is
  true. "No price shown" is PM's non-participation signal.
- **Rendering and mechanics contract (this engine):** an `out` participant is excluded from
  trading (skipped in `bestBid`/`bestAsk`, `src/engine/auction.ts`), and its price is frozen by
  construction: `stepParticipantPrice` returns the participant unchanged when `role === "out"`,
  regardless of a stale intent set before the player sat out, so `auctionTick` remains the single
  price-movement authority. The same freeze applies to any seat, human or AI (AI already emits a
  `hold` intent for the out role in `src/ai/auction_ai.ts`). In the UI
  (`src/ui/solid/auction_screen.tsx`), an `out` participant shows the `OUT` label with no price
  (an ASCII `--`) in the readout, draws no token dot on the price axis, and parks its avatar at a
  sideline "line judge" spectator spot beside the track (`sidelineSpot`, the single layout seam a
  future landscape-rotation task rewrites), matching PM's "off the track, no figure" treatment.

## Tournament deltas (recorded, not implemented)

`OTHER_REPOS/mule_rules.md` lines 51-55: tournament mode adds Crystite plus the assay option
(both already in scope for standard mode per PM), pirates steal *all* crystite (rather than just
striking it, per the colony-event summary), and AI players get $200 extra starting money. This
project's plan explicitly excludes tournament as a selectable ruleset (non-goal,
`mule_fidelity_plan.md`); these deltas are recorded here as a future data-only addition.

## 1983 vs PM formula agreement (spot-checked)

These were independently verified against the PM Java during this extraction pass and found to
match the plan's key-formulas summary with no conflict, so no separate entry is warranted beyond
the constant's own source comment in `src/engine/constants.ts`:

- Store pricing curve (`price *= 0.25 + 0.75 * ratio`), `ResourcePrices.java` lines 17-47.
- Land auction pricing (`price = previous - 60`, floor 80, unsold `price/2 + 52`, step-4
  rounding), `PlotSeller.java` lines 118-161.
- Wampus bounty (`100 * floor((round + 4) / 4)`), `Wampus.java` line 59.
- Turn order reversal at store mules <= 7, `Development.java` lines 28-39.
- Scoring (`money + landPoints + goodsPoints`, `landPoints = 500` per owned plot,
  `goodsPoints += 35 + equipmentCost` per outfitted plot, plus goods at current store price),
  `Player.java` lines 411-426; the 1983 doc's combined "500 + outfit price per plot" table
  (`mule_document.html`, "Score computing" section) sums to the identical per-plot total once
  PM's separate `landPoints`/`goodsPoints` fields are added together.
- Personal event chance (27.5% per player turn, never round 1, ~22 events shuffled once per
  game), `PlayerEventGenerator.java`; 22 event subclasses counted directly in
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/PlayerEvent.java`.

## Replay validity note for this document

This document records the Java/disassembly line numbers current in `OTHER_REPOS/` as of the
extraction pass on 2026-07-08. `OTHER_REPOS/` is local-only reference material (gitignored); if
those files are ever replaced with a different decompilation run, re-verify the cited line
numbers before trusting them for a new formula addition.

## Crystite bloom seeding (WS-E-blooms)

- **Bloom center candidates -- river excluded by PM, town excluded by this project.**
  `PlanetMapGenerator.generateCrystite`
  (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/PlanetMapGenerator.java`
  lines 172-190) picks a fully random tile as a bloom center (any type, including river and the
  Shop/town tile), only rerolling when the picked tile's own crystite level is already at the max.
  Separately, `PlanetTile.PlanetTileType.allow` (`PlanetTile.java` lines 322-329) gates crystite
  *yield* off for `River` tiles only; the `Shop` (town) tile's `allow` falls through to the
  default `true`, so PM's engine literally permits a nonzero crystite field on the town tile, it
  is simply never read as yield there (the town is never a player-developable plot). This
  project's engine has no per-type yield gate parallel to `allow`; `Plot.crystiteLevel` is read
  directly by the (future) production code and by `visibleCrystite`. To match PM's effective
  behavior without adding a type-gate layer, this project (a) excludes both river and town from
  the bloom-center candidate set up front (a stricter reroll condition than PM's), and (b) forces
  `crystiteLevel = 0` on every river and town plot once after all blooms are seeded, regardless of
  what the ring math computed for them. Net effect on players is identical to PM (river never
  yields crystite, town is never developed), while the underlying data representation differs from
  PM's literal field storage.
- **No level-4 (meteorite) blooms yet.** PM's `generateCrystite` takes a max-level parameter
  (`n3`), called with `3` for all four map-generation calls (`PlanetMapGenerator.java` lines
  88-90); a rarer level-4 bloom is reachable only via the meteorite colony event calling the same
  method with `n3 = 4` (not found in the decompiled tree searched for this pass beyond the
  parameter's existence). The meteorite event itself is out of scope for this workstream (a later
  colony-events workstream); `CRYSTITE_BLOOM_MAX_LEVEL = 3` is fixed for map generation only.

## Assay: ownership and reveal scope (WS-E-blooms)

- **Any plot may be assayed, owned or not.** `DevelopmentAction.Assay`
  (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/ai/DevelopmentAction.java` lines
  60-76) extends `ClickTile` with no ownership precondition, and `GameModel.assay`
  (`GameModel.java` lines 403-414) takes any `PlanetTile` with no owner check either. This confirms
  the plan's "PM allows scouting" note; this project's `assay_plot` action (`turn.ts`) likewise
  does not check `plot.owner`.
- **Reveal scope: global flag here, per-player list in PM (deliberate simplification).** PM tracks
  assay reveal per-tile as a list of players who have assayed it (`PlanetTile.assays`,
  `PlanetTile.java` lines 37-156: `isAssayedBy(player)` checks list membership), matching PM's
  networked multiplayer model where different remote players may have independently scouted the
  same tile. This project has no networked multiplayer; `Plot.crystiteRevealed` is a single
  boolean shared by every player once any player assays that plot (a local hotseat/AI game has no
  reason to hide an already-revealed level from a different local player). This is a deliberate
  scope simplification, not a fidelity gap that needs future reconciliation.

## Assay tick cost derivation (WS-E-blooms)

`ASSAY_TICK_COST` (`constants.ts`) maps `GameData.data.developmentAssayTime = 2.5f` seconds
(`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/GameData.java` line 73) onto this
engine's tick scale using the FULL-budget anchor already established for
`DEVELOP_TICKS_PER_TURN` (50 ticks representing `developmentMaxTime = 47.5f` seconds,
`GameData.java` line 76, per the plan's key-formulas summary "Develop timer" entry):
`ticksPerSecond = 50 / 47.5`; `assayTicks = 2.5 * (50 / 47.5) = 2.6316...`, rounded to the nearest
whole tick: **3**. The work ticket that dispatched this workstream proposed a placeholder of 5
ticks before this arithmetic was run; 3 is the value the established mapping actually produces, so
it replaces the placeholder rather than keeping it as a second, uncomputed anchor.

## Spoilage: lost-vs-kept direction and the upkeep/spoilage split (WS-E-blooms)

- **`calcSpoilage` returns the amount LOST, not kept.** `Player.calcSpoilage`
  (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Player.java` lines 372-391):
  `case Food: return this.food / 2;` (integer division, i.e. `floor(food / 2)`);
  `case Energy: return this.energy / 4;`; `case Crystite`/`case Smithore`: amount over 50. The
  caller, `CollectionPhase.java` lines 188-191, does
  `player.setResource(resource, current - calcSpoilage(resource))` -- confirming the returned
  value is subtracted, so it is the LOST amount and the KEPT amount is the remainder
  (`food - floor(food / 2)`, i.e. the ceiling half for food; `energy - floor(energy / 4)` for
  energy; `min(current, 50)` for smithore/crystite). This project's `applySpoilage` (`economy.ts`)
  implements the kept-remainder form directly, matching this direction.
- **Upkeep and spoilage split into two functions.** PM's per-round resource usage (`useFood`,
  `useEnergy` -- a later workstream, WS-E-mules) and `calcSpoilage` are independent systems in PM:
  usage happens during the develop phase, spoilage is computed once per `CollectionPhase` from
  whatever the player currently holds, with no round-number dependence in `calcSpoilage` itself.
  This project's v1 economy previously fused an analogous "upkeep" (a stand-in for the not-yet-built
  per-turn usage) and a rate-based "spoilage" into one `applySpoilage(goods, round)` function. This
  workstream splits them into `applyUpkeep(goods, round)` (unchanged upkeep amounts and
  round-scaling, preserved from before this patch) and `applySpoilage(goods)` (round-independent,
  now PM's exact floor/cap formula in place of the old flat-rate decay), called in that order from
  `enterProduction` (`turn.ts`). Net numeric effect on a typical mid-game player (for example food
  10, energy 10 at round 3, upkeep 2+1*3=5 each): old flat-rate model left `floor((10-5)*0.5) = 2`
  food and `floor((10-5)*0.75) = 3` energy; the new split-and-PM-formula model leaves
  `5 - floor(5/2) = 3` food and `5 - floor(5/4) = 4` energy after the same upkeep step -- both
  higher than before, because PM's spoilage keeps more than the old engine's arbitrary 50%/25%
  decay rates did. The retired constants `FOOD_SPOILAGE_RATE`, `ENERGY_DECAY_RATE`,
  `SMITHORE_DECAY_RATE`, `CRYSTITE_DECAY_RATE` are replaced by `FOOD_SPOILAGE_DIVISOR`,
  `ENERGY_SPOILAGE_DIVISOR`, and the shared `ORE_SPOILAGE_CAP`.

## Store pricing: buy/sell derivation and ratio direction (WS-E-prices)

- **Per-good buy/sell derivation, verified directly.** Each good's central base price
  (`ResourcePrices.price`) yields the store's buy quote (what it pays a seller) and sell quote
  (what it charges a buyer) as follows, read from
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/ResourcePrices.java`:
  - **Food** (`setFoodPrice`, lines 27-31): `price = clamp(round(base * f), 30, 230)`;
    `buyPrice = price - 15`; `sellPrice = buyPrice + shopFoodPriceRange` (35). Net: buy = price - 15,
    sell = price + 20.
  - **Energy** (`setEnergyPrice`, lines 43-47): identical shape with a floor of 25 instead of 30 and
    `shopEnergyPriceRange` (35).
  - **Smithore** (`setSmithorePrice`, lines 61-64): `price = clamp(n, 20, 230)`;
    `buyPrice = price` (NO -15 margin, unlike food/energy); `sellPrice = buyPrice + shopSmithorePriceRange`
    (35).
  - **Crystite** (`setCrystitePrice`, lines 71-74): `price = n - n % 4` (floor to a multiple of 4, NOT
    clamped to a band); `buyPrice = price`; `sellPrice = buyPrice + shopCrystitePriceRange` (140).
  This project encodes the per-good margin/spread/floor as `STORE_BUY_MARGIN_BY_GOOD`,
  `STORE_SELL_SPREAD_BY_GOOD`, and `STORE_PRICE_FLOOR_BY_GOOD` in `constants.ts`, applied by
  `deriveGoodQuote` in `store.ts`.
- **Ratio direction is demand/supply, NOT supply/demand.** The supply/demand price factor is
  `f = 0.25 + 0.75 * (n2 / n)` where the callers pass `n = available` (supply) and `n2 = required`
  (demand): `calcFoodPrice(n9_available, n8_required)` (`Shop.java` lines 317-324),
  `calcEnergyPrice(n10_available, n11_required)` (lines 327-335), and `calcSmithorePrice(n3_mulesAvailable,
  n4_mulesNeeded, jitter)` (lines 290-315). So the ratio inside the factor is **demand over supply**
  (`required / available`): scarcity (low supply) raises the price, a glut lowers it. The plan's
  key-formulas summary states "ratio = supply/required", which is inverted; the verified Java form
  (demand/supply) is what this project implements (`updateStoreForNewRound` in `store.ts`), and the
  `constants.ts` store-pricing section header records the correction. Smithore additionally clamps its
  ratio to `[0.25, 3.0]` before the factor (`ResourcePrices.java` line 53); food and energy leave the
  ratio unclamped and only clamp the final price.
- **Demand terms, verified.** Food demand = `numPlayers * foodRequirements[min(round+1, 12)]`
  (`Shop.java` line 318). Energy demand = `sum over players (getEnergyRequirement() + 1)`, where
  `energyRequirement` is the count of a player's installed M.U.L.E.s that draw power -- every
  non-energy outfit costs 1 (`Resource.energyCost` from `foodEnergyRequirement`/
  `smithoreEnergyRequirement`/`crystiteEnergyRequirement = 1`, `GameData.java` lines 38-42; energy
  M.U.L.E.s cost 0, `Resource.java` line 13) -- verified in `Shop.java` lines 330-333 and
  `Player.calcEnergyRequirement` (Player.java lines 265-272). Mule demand =
  `min(min(freeLands, numPlayers) + ownedUndeveloped, 8)` (`Shop.getMuleNeed`, lines 353-374); mule
  supply = `storeMules + floor(storeSmithore / 2)` (`Shop.java` line 310). This project computes all of
  these in `computeColonyStats` (`store.ts`), excluding the town plot from the land tallies (this
  engine's plot grid carries a town cell PM's plot map does not).
- **Smithore jitter is gaussian.** `n7 = round(1.0 * normalDistributed(random) * 7.0)` (`Shop.java`
  line 311), added after the max(.,50) floor and before the final clamp (`ResourcePrices.calcSmithorePrice`
  lines 56-57). `normalDistributed` is the sum of 12 uniform draws minus 6 (`MuleMath.java` lines
  50-56), implemented as `normalDistributed(rng)` in `rng.ts` (`STORE_SMITHORE_JITTER_AMPLITUDE = 7`).
- **Crystite price is an independent draw.** `calcCrystitePrice(random.nextInt(100))` sets
  `price = 50 + randInt(0..99)` floored to a multiple of 4 each round, ignoring the previous price
  entirely (`Shop.java` lines 284-288, `ResourcePrices.java` lines 66-74). This project draws it the
  same way in `updateStoreForNewRound`.

## Store stock cap: 255, not 32 (WS-E-prices)

- **Chosen value (255), verified directly.** Every store resource setter caps at 255:
  `setFood`/`setEnergy`/`setSmithore`/`setCrystite` each do `this.x = Math.min(n, 255)`
  (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Shop.java` lines 213-239).
- **TSavo discrepancy.** The work ticket flagged a "32-vs-255" store-stock-cap discrepancy in TSavo's
  audit prose. The primary Java is unambiguous at 255, so per the authority order this project uses 255
  (`STORE_STOCK_CAP` in `constants.ts`, applied in `applySellToStore`). The cap is far above the units
  that trade in a normal game, so it effectively never binds; it is present for fidelity, not because
  play reaches it.

## Store price recalc seam (WS-E-prices)

- **PM recalcs per good at its Collection start; feeds back per good at its auction end.** planet_mule
  recomputes a single good's price at the start of that good's Collection phase
  (`CollectionPhase.begin` -> `Shop.calcBuySellPrice`, `CollectionPhase.java` line 58, run right before
  the good's auction) and writes the average trade price back at the end of that good's auction
  (`AbstractAuctionPhase.end` -> `Shop.setAveragePrice`, `AbstractAuctionPhase.java` line 644, skipped on
  the last round). `Shop.buildMules` runs once at `SummaryPhase2` (`SummaryPhase2.java` line 73). The
  clean per-round order is visible in the AI simulator `SimulatedState.simulate` (lines 87-113): use,
  spoil, produce, price, trade, average, buildMules, then increment the round.
- **This engine's seam mapping.** This engine has one production phase then three back-to-back auctions
  (food, energy, smithore), not per-good Collection phases. So it collapses PM's per-good Collection
  recalcs into ONE round-boundary recalc (`advanceToNextRound` -> `updateStoreForNewRound` in `turn.ts`)
  that reprices every good for the upcoming round, while keeping PM's PER-AUCTION average-price feedback
  (`applyEndAuction` -> `applyAverageTradePrice`, once per good, skipped on the last round). Store food
  spoilage also lands at this boundary. Net effect: a good's base going into round N+1's recalc is the
  average trade price from round N's auction of that good (or round N's recalc'd price when nothing
  traded), matching PM's price -> trade -> average -> next-price chain per good, just batched at the
  round boundary rather than interleaved with the auctions.
- **`Shop.buildMules` and mule pricing are deferred.** This engine does not yet call the buildMules
  equivalent; the mule economy (rebuild, cap, price coupling, buy-side stock decrement) is WS-E-mules.
  `StoreState.muleStock` is seeded to 14 and read by the smithore mules-available figure, but nothing
  mutates it this patch.

## Store food spoilage: the `Shop.spoil` argument (WS-E-prices)

- **`Shop.spoil(Food, n)` halves store food when `n > 1`; only food spoils.**
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Shop.java` lines 376-395:
  `case Food: if (n > 1) setFood(food / 2)`; energy, crystite, and smithore fall through as no-ops.
- **Argument reading: `n` is the current food amount, not the round.** `Shop.spoil(Resource, int)` has
  no caller in the decompiled tree searched for this pass (grep for `.spoil(` finds only the unrelated
  `SimulatedPlayer.spoil()`), so the argument's meaning is inferred from the method body. Read as the
  current food quantity, `if (n > 1) setFood(food / 2)` means "halve store food whenever more than one
  unit is on hand, leaving a lone unit," which halves every round and matches the plan's M3 exit
  criterion "store food halves after round 1." Read as the round number, `n > 1` would instead skip the
  first two rounds, contradicting that criterion. This project implements the current-amount reading:
  `spoilStoreFood` (`store.ts`) halves store food (floor) at every round boundary when food > 1. Recorded
  here because the caller is absent, so this is an inference, not a line-traced call.

## Mule economy: `Shop.buildMules` semantics (WS-E-mules)

- **Rebuild target and cap share one PM field.** `Shop.buildMules` (`Shop.java` lines 483-497) rebuilds
  toward `GameData.data.shopStartNumMules` (14), capped per call by `GameData.data.shopMaxBuildMules`
  (also 14). Both PM fields carry the identical literal value, so this project encodes them as a single
  `MULE_STOCK_CAP` constant (`constants.ts`) rather than two constants that would always be kept in sync
  by hand.
- **Smithore spend floors to an even multiple, price recomputes unconditionally.** The deficit
  (`shopStartNumMules - numMules`, clamped by `shopMaxBuildMules`) times 2 smithore-per-mule is the
  smithore need; when the store's smithore stock cannot cover it, the spend floors down to a multiple of
  2 (`n3 -= n3 % 2`) so a lone leftover smithore unit is never spent. The M.U.L.E. price recompute
  (`mulePrice = smithorePrices.price * 2`, floored to a multiple of 10) runs every call, even when zero
  mules are built (no conditional guards it) -- verified by reading the method straight through with no
  early return. `rebuildMules` (`store.ts`) implements both: `tests/test_mule_economy.mjs` covers the
  even-deficit case, the odd-smithore-limited case, the at-cap no-op-on-stock case, and confirms the
  price recompute still runs at the cap.
- **Rebuild ordering: after the round's price recalc, using the fresh smithore price.** `buildMules` is
  the last step of PM's per-round loop before the round increments (`SimulatedState.simulate`, `use,
  spoil, produce, price, trade, average, buildMules, ++round`), so it always uses whatever smithore price
  that round's Collection-phase recalc (and any average-trade-price feedback) just set. This project's
  `advanceToNextRound` (`turn.ts`) calls `rebuildMules` immediately after `updateStoreForNewRound`, for
  the same reason: the rebuilt M.U.L.E. price should reflect the round boundary's freshly recomputed
  smithore price, not a stale pre-recalc value.
- **Buy-side stock and price wiring.** `Shop.decreaseMules()` (`Shop.java` lines 127-133) returns `false`
  at zero stock rather than throwing; this project's `applyBuyMule` (`turn.ts`) instead throws when
  `store.muleStock <= 0`, matching this engine's existing fail-loudly convention for every other
  insufficient-resource action (`applyOutfitMule`'s money check, `applyAssayPlot`'s tick check) rather
  than PM's boolean-return convention, which this engine does not use anywhere else. `store.mulePrice`
  (read via `Shop.getMuleCost()`, `Shop.java` lines 199-201) replaces the flat `MULE_BASE_PRICE` at every
  purchase call site; `MULE_BASE_PRICE` remains only as the game-start seed value for `store.mulePrice`
  (it happens to equal PM's own `shopMuleInitialPrice = 100`) and as a stale label in
  `src/ui/store_screen.ts`'s buy button (a known UI follow-on, out of this workstream's scope; see the
  constant's own comment in `constants.ts`).

## Upkeep consolidation: retiring flat `applyUpkeep` (WS-E-mules)

- **Two systems replace one flat stand-in.** The prior v1 `applyUpkeep(goods, round)` (`economy.ts`,
  removed this patch) was an explicit stand-in for planet_mule's real per-round usage, applied once per
  round at production time for both food and energy. PM's real model splits usage into two independent
  systems at two different points in the round: `Player.useFood` (`Player.java` lines 166-183, called
  from `PlayerEventPhase.begin`/`end`) consumes food once per player at the START of their develop turn
  (this workstream's food-scaled timer, `beginDevelopTurn` in `turn.ts`); `Player.calcEnergyRequirement`
  (`Player.java` lines 265-272, consumed via `Resource.energyCost`) charges 1 energy per powered
  non-energy M.U.L.E. at PRODUCTION time, with energy M.U.L.E.s themselves drawing no power. This
  project's `computeProduction` (`economy.ts`) already computed the energy-shortfall production GATE
  from a player's pre-production energy, but never actually deducted the energy it gated on; this patch
  makes that deduction real (`ProductionResult.energyConsumed`, applied in `enterProduction`) and
  excludes energy M.U.L.E.s from the gate/deduction entirely (they were previously gated like every
  other outfit, which was itself a latent inaccuracy this patch fixes alongside the double-count issue).
  Keeping the flat `applyUpkeep` on top of both real systems would double-count both food and energy, so
  it is retired rather than kept as a third parallel system.
- **Worked example (round 3, food 10, energy 10, 2 powered non-energy M.U.L.E.s, zero production yields
  for a clean before/after comparison, matching the WS-E-blooms upkeep/spoilage-split example above):**
  - **Before (WS-E-blooms model):** flat upkeep at production, `foodUpkeep = energyUpkeep = 2 + 1*3 = 5`;
    food 10-5=5, energy 10-5=5; spoilage `5 - floor(5/2) = 3` food, `5 - floor(5/4) = 4` energy. Final:
    **food 3, energy 4**.
  - **After (WS-E-mules model):** food is consumed at develop-turn start, not production. Round 3's
    requirement is `FOOD_REQUIREMENTS_BY_ROUND[3 - 1] = FOOD_REQUIREMENTS_BY_ROUND[2] = 3` (see "Food
    requirement index" below for the index derivation); the player has 10 >= 3, so they pay exactly 3,
    leaving food 7 before production. With zero production yields, spoilage at the round's end is
    `7 - floor(7/2) = 4` food. Energy is charged the real per-mule cost at production: 2 powered
    non-energy M.U.L.E.s cost `2 * ENERGY_PER_MULE = 2`; energy 10-2=8; spoilage `8 - floor(8/4) = 6`
    energy. Final: **food 4, energy 6**.
  - Both final figures are higher than the old flat-upkeep model in this example, for two independent
    reasons: food no longer pays a round-scaled flat charge on top of production (it pays the PM table
    value, 3, not the old model's `2 + round`, 5), and energy now only pays for M.U.L.E.s actually
    powered (2) rather than a flat per-round charge unrelated to how many M.U.L.E.s the player runs (5).
    A player running more M.U.L.E.s than this example would now pay more energy than before; a player
    running fewer (or none) pays less -- the old flat charge was upkeep-shaped (grows with round,
    independent of M.U.L.E. count), the new charge is usage-shaped (grows with M.U.L.E. count,
    independent of round).

## Food requirement index: two offsets from one table (WS-E-mules)

- **RESOLVED (WS-E-foodfix, re-verified against the 1-based `getRound()` premise).** `Player.useFood`
  and `Shop.calcBuySellPrice`/`Shop.getFoodNeed` read the same `foodRequirements` array at two different
  offsets from this engine's 1-based round number, because they answer two different questions at two
  different points in the round. Both are re-traced directly against the decompiled Java under the
  corrected premise from "muleCurve round base": the lobby's `beginNextRound` increments PM's round
  counter 0 -> 1 once, before round 1 begins, and it increments again only at the end of each round
  (`SummaryPhase2.beginTransitionComplete` -> `beginNextRound`, called after that round's Summary phase).
  So for the entire span of this engine's round `R` -- develop, colony event, all four Collection/Auction
  phases, and Summary -- PM's `getRound()` equals `R` directly, with **no shift**. (`GameData.java` line 36:
  `foodRequirements = {0, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0}`, 1-based, index 0 and the trailing
  index-13 unused.)
  - **Consumption -- `Player.useFood(this.model.getRound())`** (`Player.java` line 167;
    called from `PlayerEventPhase.begin`/`end`, `PlayerEventPhase.java` lines 95, 127) runs once per
    player at the start of their develop turn, within this engine's round `R`. Since `getRound() === R`
    throughout round `R` (no shift), the consuming index is `foodRequirements[R]`. This engine's
    `beginDevelopTurn` (`turn.ts`) now reads `FOOD_REQUIREMENTS_BY_ROUND[min(state.round, 12)]` (fixed
    from the prior `[state.round - 1]`, which assumed PM's round value was `R - 1` under the superseded
    0-based premise and under-required food by one round versus PM).
  - **Pricing -- `Shop.calcBuySellPrice(..., this.model.getRound())`'s Food case** (`Shop.java` line 318)
    reads `foodRequirements[min(n + 1, 12)]`, called from `CollectionPhase.begin` (`CollectionPhase.java`
    line 58) with `n = this.model.getRound()`, during round `R`'s own Collection/Auction phases (still
    before the end-of-round increment, so `n = R`, no shift). That gives index `min(R + 1, 12)` -- the
    pricing recalc that runs during round `R`'s own auctions anticipates round `R + 1`'s develop-phase
    requirement, i.e. "buy this round's auction to cover next develop turn." `Shop.getFoodNeed`
    (`Shop.java` line 342, `foodRequirements[gameModel.getRound() + 1]`, called from
    `SummaryPhase2.begin` at line 143, also before the end-of-round increment) reads the identical index
    `R + 1` for the same reason -- both checks run "during round `R`, before its increment" and both
    anticipate round `R + 1`'s consumption.
  - **`computeColonyStats` (store.ts) needed no change.** It is called from `advanceToNextRound` with
    `nextRound = state.round + 1`, where `state.round` is the round whose auctions just finished (`R`).
    Its `reqIndex = min(nextRound, 12) = min(R + 1, 12)` already matches both Java derivations above,
    because `nextRound` is computed structurally (`state.round + 1`), not via a round-offset formula that
    needed correcting for the premise change. Only the develop-timer's consumption index depended on the
    (now-corrected) offset premise.
  - **The two offsets remain mutually consistent** under the fix, exactly as before: round `X`'s auction
    pricing (index `X + 1`) matches round `X + 1`'s develop consumption (index `X + 1`, from
    `FOOD_REQUIREMENTS_BY_ROUND[X + 1]`) -- both reference the same index, because the pricing recalc is
    quite literally computing next round's demand.
  - **Worked example, round 1.** Consumption: `FOOD_REQUIREMENTS_BY_ROUND[1] = 3` (previously `[0] = 0`,
    a free round -- no longer the case). Pricing (round 1's own auctions, priming round 2): `min(1 + 1,
    12) = 2`, `FOOD_REQUIREMENTS_BY_ROUND[2] = 3`.
  - **Worked example, the round-4/5 boundary.** Consumption for round 4: `FOOD_REQUIREMENTS_BY_ROUND[4]
    = 3`; round 5: `FOOD_REQUIREMENTS_BY_ROUND[5] = 4` (the table's first step up). Pricing during
    round 4's own auctions (priming round 5): `min(4 + 1, 12) = 5`, `FOOD_REQUIREMENTS_BY_ROUND[5] = 4`
    -- correctly anticipating round 5's higher requirement one round ahead.
  - **RESOLUTION APPENDED: auction role assignment shares the pricing offset.** A third lane reads this
    table under the same corrected 1-based `getRound()` premise:
    `auctionResourceCritical` (`auction.ts`), which auto-assigns each player's buyer/seller role at the
    start of a good's auction window. It traces to `Player.getResourceCritical(Resource, int, int)`
    (`Player.java` lines 456-467): `if (resource == Food) return foodRequirements[n + 1];`, called as
    `player.getResourceCritical(resource, this.model)` (`Player.java` lines 469-471, `n =
    gameModel.getRound()`) from `AbstractAuctionPhase.begin` (`AbstractAuctionPhase.java` line 118:
    `player.getResource(resource) > player.getResourceCritical(resource, this.model)`), once per player
    at the start of each good's auction window -- the same round-`R`-auction call site already traced
    above for `Shop.calcBuySellPrice`/`Shop.getFoodNeed`. Since PM's `getRound()` equals this engine's
    round `R` throughout round `R`'s auction windows (no shift), the food-critical index is
    `min(R + 1, 12)`, identical to the pricing lane's offset -- the auction's own critical threshold, like
    the price recalc that runs alongside it, is one round ahead of the current round's own develop-phase
    requirement. `auction.ts`'s `auctionResourceCritical` was previously reading
    `FOOD_REQUIREMENTS_BY_ROUND[min(round, 12)]` (the develop-consumption offset, carried over from the
    superseded 0-based premise before this section's fix); fixed to `min(round + 1, 12)`. This diverges
    from the prior (wrong) value at the table's two step points: round 4's food critical is now `4`
    (previously computed as `3`) and round 8's is now `5` (previously computed as `4`) --
    `tests/test_auction_fidelity.mjs` pins both boundaries alongside the existing round-1 case.

## Turn order: `Development.setPlayerOrder` and rank order (WS-E-mules)

- **Rank order is descending score, ties broken by ascending player index.** `GameModel.getPlayersInRankOrder`
  is sorted by `Player.OrderByPoints` (`Player.java` lines 594-611): `player.points` descending, ties
  broken by `player.playerIndex` ascending. `Development.nextPlayer` (`Development.java` lines 41-52)
  walks `getPlayersInRankOrder()` by an internal cursor, stepping `+1` from before the start (normal
  order, leader first) or `-1` from past the end (reversed order, worst rank first) depending on which
  direction `setPlayerOrder` (lines 28-39) chose at the top of the round, per the mule-shortage threshold
  already spot-checked in this doc's "1983 vs PM formula agreement" list. This project's
  `computeTurnQueue` (`turn.ts`) reuses `computeScores` (`scoring.ts`, unmodified by this workstream) for
  the score, confirmed to accept a mid-game `GameState` (it only reads `players` and `plots`, with no
  round-number dependence), builds the same descending-score/ascending-id order, and reverses the whole
  array on mule shortage rather than walking a cursor in two directions -- an equivalent, array-based
  restatement of PM's cursor-based iteration. `tests/test_turn.mjs` covers the ascending-id tie-break, the
  reversal threshold's exact boundary (7 reversed, 8 normal), and mid-game rank exposure with unequal
  scores.

## Goods auction: bands, roles, timing, transfer (WS-E-auction)

This section records the M4 goods-auction fidelity rules, all extracted from planet_mule's auction
classes (`model/Auction.java`, `AuctionLimits.java`, `AuctionState.java`, `Shop.java`,
`controller/phase/AbstractAuctionPhase.java`, `CollectionPhase.java`, `ai/SimpleAI.java`) and mapped
onto this engine's discrete tick model. It replaces the retired v1 model (a single global `[5, 100]`
price band, 20-tick timeout, one price step for all goods) that produced a 55%/76% dead-auction-window
rate once dynamic prices (WS-E-prices) pushed live quotes past 100.

### Auction good order: smithore, crystite, food, energy

- **Chosen value (PM runtime chaining):** the per-round auction order is smithore, crystite, food,
  energy. `ColonyEventPhase.java` line 111 and `GameLobbyPhase.java` line 536 set the first collection to
  `Phase.COLLECTION_SMITHORE`; each auction's `AbstractAuctionPhase` outro then chains the next collection
  (`AbstractAuctionPhase.java` lines 80-96: Smithore -> COLLECTION_CRYSTITE, Crystite -> COLLECTION_FOOD,
  Food -> COLLECTION_ENERGY, Energy -> SUMMARY), and each `CollectionPhase` advances to its own
  `AUCTION_<good>` (`CollectionPhase.java` lines 280-299). Following the chain end to end gives smithore ->
  crystite -> food -> energy -> summary.
- **Rejected value (`Phase` enum declaration order):** `Phase.java` lines 22-29 declare the auction
  constants in the order crystite, smithore, energy, food. That is only the enum's textual declaration
  order and is never used to sequence the round; the runtime `setNextPhase` chaining above is
  authoritative. This engine's `AUCTION_GOOD_ORDER` (`turn.ts`) uses the runtime order.

### Per-good price band from live store quotes

- **Chosen value:** each good's auction band is `[storeBuyQuote, storeSellQuote]` for that good, read live
  from the store (`priceFloor = storeBuyQuote`, `priceCeiling = storeSellQuote`). PM's `AuctionLimits`
  (`AuctionLimits.java` lines 28-49, `calcBuyAndSellTicks` lines 102-111) anchors the band on
  `shop.getBuyPrice(resource)`/`shop.getSellPrice(resource)` and lets it grow as players push past the
  store; this engine collapses that to a fixed band equal to the store's spread, which is always positive
  (buy < sell for every good), so the band can never degenerate. The store bids at the floor (buys
  unlimited) and asks at the ceiling (sells its stock), so a lone buyer walking up buys from the store at
  the ceiling and a lone seller walking down sells to the store at the floor; two crossing players trade in
  between at the resting ask. This is the direct fix for the retired global `[5, 100]` band, which clamped
  both live quotes to 100 once base prices climbed, erasing the spread and killing trade.

### Price step per good: crystite 4, others 1

- **Chosen value:** crystite steps 4 dollars per tick, food/energy/smithore step 1.
  `Auction.java` lines 25-30: `tickSetupLow = new TickSetup(2, 10, 40, 1)` (last arg `priceStep = 1`) is
  used for food, energy, and smithore; `tickSetupHigh = new TickSetup(2, 10, 40, 4)` (`priceStep = 4`) is
  selected for crystite in `beginAuction` (`resource == Resource.Crystite ? tickSetupHigh : tickSetupLow`).
  Encoded as `AUCTION_PRICE_STEP_BY_GOOD` (`constants.ts`).

### Role auto-assignment from critical thresholds

- **Chosen value:** at window start every player is auto-assigned a role by comparing its holdings to the
  good's critical threshold: holdings above critical -> seller, otherwise buyer. `AbstractAuctionPhase.begin`
  (`AbstractAuctionPhase.java` lines 113-122): every player is `setBuyer(true)`, then flipped to seller
  when `getResource(resource) > getResourceCritical(resource, model)` (skipped on the last round).
  `Player.getResourceCritical` (`Player.java` lines 456-471): food critical is
  `foodRequirements[getRound() + 1]` (the next round's develop-turn requirement, one round ahead of the
  current round's own -- under this engine's corrected 1-based `getRound()` premise, PM's round counter
  equals this engine's round `R` with no shift throughout round `R`'s auction, so the index is
  `min(R + 1, 12)`; see "Food requirement index" above for the full derivation and the round-4/8 worked
  boundaries); energy critical is `getEnergyRequirement() + 1`
  (`Player.java` lines 460-462, where `energyRequirement` is the count of installed non-energy M.U.L.E.s,
  `calcEnergyRequirement` lines 265-272); smithore and crystite return 0 (never critical), so any holder is
  a seller. Implemented as `auctionResourceCritical` + `initialRole` (`auction.ts`); the human may override
  its role mid-window. Buyers enter at the band floor walking up, sellers at the ceiling walking down,
  mirroring PM's `setBuyer` seating (`Player.java` lines 282-290: buyers below, sellers above).

### Traversal and matching: ranked bids/asks, solvent fallthrough

- **Chosen value (documented house rule):** each tick the matcher builds a ranked bid list (every
  player buyer plus the store's standing buy offer, ordered by price descending then lowest playerId)
  and a ranked ask list (every player seller plus the store's standing sell offer when `storeStock >=
  1`, ordered by price ascending then lowest playerId), then scans bid-major/ask-minor for the first
  pair that crosses (`bid.price >= ask.price`) and passes the solvency check (buyer can pay the ask
  price, seller holds a unit), skipping any store-to-store pair. The executed pair maximizes bid price,
  then minimizes ask price, then prefers the lowest playerIds, so it degenerates to the top-bid/top-ask
  pair whenever that pair is itself solvent. A participant that fails the solvency check is removed from
  the remainder of that tick's scan rather than blocking the market: an out-of-money buyer or
  out-of-goods seller withdraws and the next eligible offer trades. One unit trades per tick, at the
  seller's resting ask, as before. Implemented as `rankedBids`/`rankedAsks`/`selectTrade` in
  `auction.ts` (replacing the earlier single-best-offer `bestBid`/`bestAsk` pair, whose one solvency
  check let an insolvent top bidder block solvent lower bidders and the store's standing offer).
- **No historical analogue (WP-1A evidence):** the 1983 rules (`OTHER_REPOS/mule_rules.md`, "Trading
  Stage") describe the trading stage as a continuous spatial simulation -- figures walk toward a shared
  price line and trade until a party removes its figure, runs out of money, or runs out of goods -- not
  a discrete ranked-list match, so there is no queue, tie-break, or "next eligible counterparty" rule to
  copy. The decompiled `planet_mule` confirms this mechanically: `AuctionState.setTick` clamps each
  buyer's position by its own budget and sets `inAuction = false` when it can no longer advance (self
  withdrawal, not a skip by the matcher), and `AuctionLimits.calcBuyAndSellTicks` derives the tradable
  band from the max tick among live buyers and the min tick among live sellers (an aggregate
  best-bid/best-ask convergence) with the store folded in as a price-band clamp via
  `Shop.getBuyPrice`/`getSellPrice`, never as a queued participant. This engine's discrete matcher
  therefore uses the house rule above; the price-descending-bids / price-ascending-asks ordering is
  directionally supported by that best-bid/best-ask convergence, the solvency-removal (not
  solvency-skip) rule mirrors the `inAuction = false` self-withdrawal, and the store acting as a
  standing fallback offer rather than a ranked queue slot matches "the store participates as both buyer
  and seller within price limits." No authority contains a tie-break, so lowest-playerId is an
  uncontradicted house choice.
- **Store spread and eligibility:** the store's buy/sell quotes that seed the ranked offers are the
  live band edges; their derivation is documented under "Store pricing: buy/sell derivation and ratio
  direction (WS-E-prices)" above and is not restated here. The auction runs while at least one player is
  a seller OR the store holds at least 1 unit (see "Skip conditions" below); at window end the price
  updates to the average of the units sold (recorded with the closing-price rules elsewhere in this
  section).
- **Sources:**
  - `OTHER_REPOS/mule_rules.md` ("Trading Stage"): prose of figures walking toward each other and
    trading until a party withdraws, runs out of money, or runs out of goods.
  - `OTHER_REPOS/mule_document.html` `#Trading` (auction-runs-while and closing-price rules),
    `#PurchaseAndSalePrice` (store buy/sell spread), `#StoreSetup` (store initial stock and prices).
  - `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/AuctionState.java`,
    `.../model/AuctionLimits.java`, `.../model/Auction.java`,
    `.../controller/AuctionController.java`, `.../model/Shop.java` (implementation evidence,
    subordinate to the rule documents): confirm the original has no discrete matcher -- solvency is a
    per-player budget clamp that self-withdraws an insolvent participant, and the band is the aggregate
    best-bid/best-ask tick with the store folded in as a price clamp.
  - `docs/active_plans/decisions/auction_traversal_evidence.md` (WP-1A): the full evidence pass behind
    this house rule.

### Skip conditions: last round and no-trade-possible (superset of PM `goodsForSale`)

- **Chosen value:** a window is skipped (created already `finished`, running no trading phase) when it is
  the last round, or when no trade is possible: no seller exists AND (no store stock OR no player holds
  strictly below critical). PM skips on two supply-side conditions -- `isLastRound` and
  `!isResourceAvailable` (`AbstractAuctionPhase.java` lines 139-145), plus `!goodsForSale` after roles are
  chosen (lines 247-250; `goodsForSale` lines 612-622: store stock, or a non-buyer holding the resource).
  This engine folds those into one `tradePossible` check (`auction.ts`) and deliberately extends it with a
  demand-side test: a window whose store shelf holds stock but where no player is a seller and no player is
  below critical (most often a smithore or crystite window nobody mined, holding leftover store stock nobody
  needs) can only ever time out with no trade, so it is skipped rather than run. PM lets such a window run
  and quietly expire; this engine skips it so the dead-window metric counts only windows where a wanted
  trade actually failed. This demand-side extension is the single largest driver of the standard-mode
  dead-rate drop (see the sim record below).

### Crystite: store-only-buyer and post-auction zeroing

- **Chosen value:** the store buys crystite from players but never accumulates it (its crystite stock stays
  zero), and it never sells crystite (opening stock is zero, so it has none to offer).
  `AbstractAuctionPhase.apply(TransactionMessage)` (`AbstractAuctionPhase.java` lines 482-494): when a
  player sells, `if (resource != Resource.Crystite) shop.setResource(resource, shop.getResource(resource) +
  1)` -- the crystite branch is skipped, so the store sinks the unit. `GameData.java` line 23:
  `shopStartCrystite = 0`. This engine sinks crystite the store buys in `applyTradeToStore` (`auction.ts`)
  and additionally zeroes `store.stock.crystite` at `applyEndAuction` (`turn.ts`) for robustness.

### Timer slow/pause -> quiet-tick countdown; idle timeout; hard ceiling

- **Chosen mapping:** PM's auction runs a real-time phase timer for `auctionTime = 10s`
  (`GameData.java` line 101) that runs at `auctionTimerFastSpeed = 3.0` normally, slows to
  `auctionTimerSlowSpeed = 0.1` (10%) while any avatar walks the price axis, and fully pauses during a
  transaction (`AbstractAuctionPhase.apply(BeginTransactionMessage)`/`(EndTransactionMessage)`:
  `phaseTimer.pause(true/false)`, lines 452-460). This engine maps that onto a quiet-tick countdown:
  `ticksRemaining` (`AUCTION_QUIET_TICK_BUDGET`) decrements only on a tick where no participant moved and no
  transaction is in progress; a walking or trading tick leaves it unchanged (the slow/pause behavior). A run
  of `AUCTION_IDLE_TIMEOUT` consecutive quiet ticks ends the window early (mapping PM's `maxOutOfAuction =
  40` disengagement concept, `Auction.java` line 25, to a whole-window end), and `AUCTION_MAX_TICKS` is a
  hard safety ceiling that force-finishes any window (the cannot-stall watchdog; no PM analog).
- **No separate declaration phase in the engine.** PM runs a pre-trading countdown
  (`auctionChooseBuySellTime + auctionCountdownTime`, `GameData.java` lines 106-107) during which players
  pick or override their buy/sell side before the trading window's timer starts. This engine has no such
  phase: roles are auto-assigned at tick 0 (from the critical thresholds above) and the quiet-tick trading
  clock begins immediately, so the engine's timer semantics cover only the trading window. The pre-trading
  confirm/override step is a UI-layer presentation concern (the WS-U-auction scene holds its scene clock at
  tick 0 until the human commits or overrides its auto-assigned role); it is not an engine tick rule, and a
  human override arrives as a normal `set_auction_role` action, valid at any tick.

### Transfer-rate curve

- **Chosen mapping:** within a contiguous transaction run, the cooldown after the first unit is the fast
  `AUCTION_TRANSFER_START_TICKS`, and each later unit's cooldown starts from `AUCTION_TRANSFER_BASE_TICKS`
  and shrinks by `AUCTION_TRANSFER_DECREASE_TICKS` per unit, floored at `AUCTION_TRANSFER_MIN_TICKS`.
  Cooldown ticks count as "in transaction" (they pause the quiet-tick countdown). Maps PM's
  `doTransactions` transfer timing (`AbstractAuctionPhase.java` lines 380-393): first unit
  `transactionTimeStart = 225`ms, later units `transactionTime (650) - unitsTraded * transactionTimeDecrease
  (75)`, floored at `transactionMinTime = 125`ms (`GameData.java` lines 111-114). The millisecond values are
  mapped to whole ticks by the sim experiment below.

### Sim-experiment decision record (tunable constants)

- **Decision procedure:** the tick-mapped timing constants (`AUCTION_QUIET_TICK_BUDGET`,
  `AUCTION_IDLE_TIMEOUT`, the transfer curve) are chosen by `tests/e2e/e2e_balance_sim.mjs`, which drives
  full all-AI games across seeded games in both modes and reports the dead-auction-window rate (share of
  live, non-skipped trading windows that close with no trade). Gate: dead-window rate < 0.2 in both modes.
- **Before (v1 model):** dead-window rate 55.4% beginner, 76.1% standard.
- **After the structural fixes (per-good bands + critical roles + trade-possible skip), by constant set,
  over seeded games per mode:**
  - **Winning set (LANDED): `AUCTION_QUIET_TICK_BUDGET = 8`, `AUCTION_IDLE_TIMEOUT = 3`, transfer
    START/BASE/DECREASE/MIN = 1/3/1/1, `AUCTION_MAX_TICKS = 400`.** Dead-window rate 0.0% beginner and 0.0%
    standard over 100 seeds/mode; all games terminate; zero negative-money games.
  - **Runner-up (tighter): budget 4, idle 2 (same transfer curve).** 0.0% beginner, 0.5% standard over 60
    seeds/mode -- still well under the gate, but the tighter idle timeout occasionally ends a window a tick
    before a late cross, so the wider set was kept for margin.
  - **Re-verified 2026-07-10 (post WP-1B ranked-offer solvent-fallthrough matcher):** the same winning
    timing constants, re-measured over 100 seeds/mode after `resolveTrade` gained ranked-offer fallthrough
    (an insolvent top bidder no longer blocks a solvent lower bidder or the store's own bid). Dead-window
    rate 0.7% beginner (5/754 windows) and 0.8% standard (8/1044 windows) -- both still well under the 0.2
    gate; dead-land-auction rate remains 0.0% in both modes. Timing constants unchanged.
- **Why the rate reaches 0%:** the dead-window count is dominated by the structural fixes, not the timing
  constants. Per-good live bands remove the collapse that killed trades; critical-threshold roles guarantee
  a buyer/seller mix wherever a wanted trade exists; and the demand-side skip removes windows that can only
  ever be dead (no seller and no below-critical buyer). The residual dead windows in the runner-up are
  purely the tighter idle timeout truncating a legitimate late trade, which the winning set avoids.

### auction_ai and develop_ai retunes (follow-ons)

- **`auction_ai.ts`** now derives its buy/sell decision from `auctionResourceCritical` (the same threshold
  the engine seats roles from), matching `SimpleAI.updateAuction` (`SimpleAI.java` lines 75-113): a below-
  critical player buys, walking its bid up toward the store sell price (bounded by a cash reserve so it
  never bids below the food-safety reserve); an above-critical player sells, walking its ask down toward the
  store buy price; smithore/crystite sellers (target 0) sell every unit. A player at exactly critical sits
  out.
- **`develop_ai.ts`** now estimates a M.U.L.E. purchase against the store's live `store.mulePrice` (dynamic
  since WS-E-mules) instead of the flat game-start seed `MULE_BASE_PRICE`.

## Colony land auction: pricing, bidding, tie-break (WS-E-land)

This section records the M5 land-auction fidelity rules, all extracted from planet_mule's
`PlotSeller.java`, `AbstractLandAuctionPhase.java`, `Auction.java`, and `AuctionLimits.java`
(`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/`,
`.../controller/phase/`), and mapped onto this engine's tick-based `land_auction.ts`.

### Colony probabilities and the chain-continues-only-on-sale rule

- **Chosen value:** up to three plots per round, gated by
  `LAND_AUCTION_COLONY_PROBABILITIES = [0.691462, 0.446211, 0.216528]` (`PlotSeller.java` line 25,
  `colonyAuctionProbabilities`), rolled sequentially by slot index. Source:
  `PlotSeller.generateNextColonyAuction`'s `f2 <= f` roll (line 84).
- **Flagged and verified: a later slot only rolls when the previous slot's plot actually sold.**
  `AbstractLandAuctionPhase.goToNextPhase` (lines 401-415) only calls
  `generateNextColonyAuction` for the next slot when `this.landBought` is true; a failed sale (no
  bidder) or a failed probability roll ends the round's colony-auction chain immediately,
  regardless of remaining slots. This means the naive sum of the three probabilities
  overstates the expected plots per round; the effective count is lower because a dead slot
  truncates the chain. This engine's `turn.ts` (`applyEndLandAuction`) matches: it only attempts
  the next slot (`attemptLandAuctionSlot`) when `payload.sold && payload.auctionsRemaining > 0`.
- **Plot selection:** a uniformly random unowned, non-town plot (`PlotSeller
  .generateNextColonyAuction`, lines 94-105: candidates exclude any tile with a non-null owner or
  the shop/town tile). This engine's `unownedNonTownPlots` + `Rng.nextInt` matches. When the
  candidate list is empty, the round's colony-auction chain does not start (`bl = false`),
  matching this engine's `attemptLandAuctionSlot`'s empty-candidates skip.

### Price seeding, floor, rounding, and failed-sale drift

- **Chosen value:** the very first colony auction of the game seeds at `LAND_AUCTION_START_PRICE
  = 160` (`GameData.data.landAuctionPrice`, `GameData.java` line 133, read once into
  `PlotSeller.landPrice` at construction). A round's first offered slot (slot 0) seeds from the
  running average of every individual auction's outcome price since the last time that average
  was consumed: `avg - LAND_AUCTION_PRICE_DROP (60)`. A later slot in the same round's chain
  seeds from the immediately preceding slot's own outcome price: `previous - 60`. Both paths then
  floor at `LAND_AUCTION_PRICE_FLOOR (80)` and round to the nearest multiple of
  `LAND_AUCTION_PRICE_MULTIPLE (4)`, ties rounding down. Source: `PlotSeller.beginAuction`
  (lines 118-136): `this.landPrice = this.landPriceAccumulator / this.auctionSetSize - 60` when
  `startingAuctionSet` (true exactly at a new round's slot 0, since `generateNextColonyAuction`
  sets it on `n != lastRoundGenerated`), else `this.landPrice = this.landSellPrice - 60`; then
  `Math.max(this.landPrice, 80)` and `MuleMath.closest(this.landPrice, 4)`
  (`MuleMath.java` lines 10-16: round-to-nearest-multiple, ties down).
- **Running average memory persists across dead rounds.** The accumulator/set-size pair is only
  reset when a round's slot 0 auction actually begins (a plot is available and the roll
  succeeds); a round that offers no plot at all leaves the accumulator untouched, so it carries
  forward uneaten to the next round that does offer one. This engine's `LandMarketState`
  (`priceAccumulator`, `setSize`, `lastSellPrice`, a new top-level `GameState` field alongside
  `store`) matches: `seedStartPrice` only reads/consumes it, and `land_auction.ts`'s
  `finalizeLandAuction` only writes to it when an auction actually ran.
- **Failed-sale drift:** `LAND_AUCTION_FAILED_SALE_OFFSET (52)` added to half the auction's own
  seeded starting price (integer division, exact since the starting price is always a multiple
  of 4): `failedSalePrice = trunc(startPrice / 2) + 52`. Source: `PlotSeller.finishAuction`
  (line 153): `this.landSellPrice = this.landPrice / 2 + 52;`. This drifted price feeds the
  running-average memory exactly like a real sale price would (`PlotSeller.finishAuction` lines
  156-157: `this.auctionSetSize++; this.landPriceAccumulator += this.landSellPrice;` runs on both
  the sold and unsold branches).

### Bid model: discretized tick-based analog, not the continuous avatar walk

- **Verified: PM's land auction is the same real-time avatar price-axis-walk model the goods
  auction uses**, not a discrete bid/going-once-going-twice model. `AbstractLandAuctionPhase
  .begin` (lines 202-223) calls `this.auctionController.begin(this.model, this.controller,
  SoundPlayer.get(), n, n2)` where `n = plotSeller.getAuctionPrice()` and `n2 = n +
  GameData.data.landAuctionPriceRange (140, GameData.java line 134)` -- the identical
  `AbstractAuctionController`/`Auction` machinery the goods auction uses
  (`Auction.beginLandAuction` -> `tickSetupHigh`, the step-4 setup crystite also uses,
  `Auction.java` line 26), with players walking their price along a line and the winner decided
  by whoever holds the highest price when the phase timer (`landAuctionTime = 34.25f` seconds,
  `GameData.java` line 120) expires.
- **Adjudication (this engine's tick-based analog):** rather than porting the continuous
  per-tick walking-avatar model a second time (already ported once for the goods auction in
  `auction.ts`), `land_auction.ts` implements a simpler discrete analog that better fits selling
  exactly one indivisible item: every player carries a `LandAuctionParticipant` (`active`,
  `price`), starting inactive; a `bid_land` action raises the calling player's own standing bid
  to the current asking level (the seeded `startPrice` for a first bid, `LAND_AUCTION_BID_STEP
  (4)` above their own last bid otherwise, capped at `priceCeiling = startPrice +
  LAND_AUCTION_PRICE_RANGE`); a `goingTicks` counter (reset by any bid) finalizes the auction at
  three times `LAND_AUCTION_GOING_TICKS` idle ticks (going once, going twice, sold/no sale),
  mapping PM's `maxOutOfAuction = 40` disengagement-timer concept (the same `tickSetupHigh`
  field `AUCTION_IDLE_TIMEOUT` maps for goods) onto discrete going-stages instead of a single
  idle-timeout window end. Unlike PM's settle-time affordability check (`PlotSeller
  .finishAuction`'s `player.getMoney() >= n`), `bid_land` checks affordability upfront and
  throws on an unaffordable bid, matching this repo's fail-loudly convention
  (`applyBuyMule`/`applyOutfitMule`) rather than PM's silent-fail-at-settlement.
- **Genuine ties remain possible and are tested:** because every participant's price advances
  independently (a `bid_land` call raises only the calling player's own price, not a single
  shared "current leader" price), two or more players can rest at the identical top price when
  the going countdown expires (each having bid the same number of times without ever needing to
  overtake the other), reproducing PM's real tie scenario despite the discretized model.

### Tie-break: round 1 random, otherwise worst-ranked

- **Chosen value:** among participants tied at the highest price when the auction finalizes,
  round 1 breaks the tie uniformly at random; every later round breaks it to the worst-ranked
  tied candidate (lowest current score, a same-score tie broken to the highest player id).
  Source: `AbstractLandAuctionPhase.auctionEndStateTimer` (lines 81-116): iterates
  `model.getPlayersInRankOrder()` (best-to-worst, `Player.OrderByPoints`: descending points, ties
  broken ascending index), tracking the max price and appending every tied candidate to a list in
  that best-to-worst iteration order; `if (round == 1)` picks a uniformly random index from the
  tied list, else `arrayList.get(arrayList.size() - 1)` -- the *last* candidate appended, i.e.
  the worst-ranked of the tied group (a same-score tie's last-appended candidate is the highest
  id, since ties broke ascending index during iteration). This engine's `worstRanked`
  (`land_auction.ts`) matches by scanning for the lowest score, ties broken toward the higher id.

### Proceeds: a colony sink, not a transfer to any other player

- **Verified:** a winning bidder's payment is deducted from their own money and is never credited
  to anyone else. `PlotSeller.finishAuction` (lines 142-148): `player.setMoney(player.getMoney()
  - n); Player player2 = planetTile.getOwner(); if (player2 != null) { player2.setMoney
  (player2.getMoney() + n); }`. Every colony-auctioned plot is, by construction, unowned before
  the sale (`generateNextColonyAuction`'s candidate filter excludes owned tiles), so
  `planetTile.getOwner()` is always null at this point and the credit branch never fires -- the
  money genuinely leaves the economy. (The credit branch only matters for a future
  player-initiated resale via `PlotSeller.sellLand`, out of this milestone's scope; see the
  M5/WS-E-land workstream note.) This engine's `finalizeLandAuction` matches: it only debits the
  winner (`applyMoneyDelta(players, winnerId, -finalPrice)`) and never credits any other player,
  verified by `tests/test_land_auction.mjs`'s colony-sink test (total money across all players
  drops by exactly the sale price).

### Round gating: every round from round 1, both modes

- **Verified:** no round or mode gate was found around `Phase.LAND_AUCTION` or
  `AbstractLandAuctionPhase`. The `Phase` enum (`Phase.java` lines 6-30) places `LAND_GRANT`,
  `LAND_RUSH`, `LAND_AUCTION` back-to-back at the start of every round's cycle, and
  `AbstractLandAuctionPhase.begin`/`generateNextColonyAuction` run unconditionally each round
  with no `isBeginnerGame`/`GameLevel`-style branch anywhere in either file or in `PlotSeller
  .java` (a repo-wide search for `isBeginnerGame`/`Beginner` in the land-auction-adjacent Java
  turned up nothing). The plan's "land auctions from standard mode" phrasing is read as "the
  colony land auction is part of standard-mode rules" (as opposed to a tournament-only or bolt-on
  feature), not as a beginner-mode exclusion. Adjudication: this engine's colony land auction
  runs every round from round 1, in both `beginner` and `standard` modes (`attemptLandAuctionSlot`
  is called unconditionally at every land-grant completion, with no mode check).

### Land AI valuation and sim-tuning record

- **`land_ai.ts`'s `decideLandAuctionAction`** values the offered plot by a conservative slice
  (`LAND_VALUE_BASELINE_FRACTION = 0.3`) of the scoring formula's intrinsic `LAND_VALUE_PER_PLOT`
  (500), plus dollars per point of the plot's best terrain yield, an adjacency bonus per owned
  orthogonal neighbor, and a bonus per revealed crystite tier -- capped at
  `LAND_VALUE_MONEY_FRACTION (0.4)` of the player's current money. It never bids past the
  auction's price ceiling, never bids against itself once it is the sole price leader, and uses a
  land-specific `LAND_AUCTION_MONEY_RESERVE (STORE_BASE_PRICE.food * 3)` smaller than the
  develop/goods-auction reserve, because a missed land bid is opportunity cost, not the
  food-emergency risk the larger reserve guards against. This valuation model, its weights, and
  the reserve size are this engine's own choices (PM's `LandAuctionActuator` AI heuristics are
  out of this workstream's scope), sim-tuned by `tests/e2e/e2e_balance_sim.mjs`'s land-auction
  gate.
- **Decision procedure:** `tests/e2e/e2e_balance_sim.mjs` (extended for M5) additionally reports
  the dead-land-auction rate (share of finalized land auctions with no bidder) and the mid-game
  land clear-price ratio (round 4 onward, share of sold plots clearing at or above
  `LAND_AUCTION_PRICE_FLOOR`). Gate: dead-land-auction rate < 0.2 in both modes, mid-game sales
  clear at or above the floor, no game fails to terminate, no player's money goes negative.
- **Before tuning (a flat `LAND_VALUE_PER_PLOT` baseline, `LAND_VALUE_MONEY_FRACTION = 0.5`,
  `AI_MONEY_RESERVE` shared with the develop/goods-auction reserve):** dead-land-auction rate
  95.0% beginner, 97.0% standard over 5 seeds/mode -- the AI's willingness to pay (near the full
  $500 scoring value, capped only by half its money) let round 1 clear right at the price
  ceiling, which then seeded round 2+'s prices high while cumulative develop/auction spending
  drained money, so mid-game auctions priced above what remained affordable and went dead.
- **After tuning (the baseline fraction, money fraction, and land-specific smaller reserve
  above):** dead-land-auction rate 2.0% beginner, 3.1% standard over the default 30 seeds/mode;
  all games terminate; zero negative-money games; every mid-game sale cleared at or above the
  price floor. The land-specific reserve (a third of the shared reserve) was the change with the
  largest effect: money settles close to the shared reserve's floor by mid-game in this engine's
  economy regardless of land spending, so a land-sized-not-food-sized reserve was necessary for
  the AI to ever bid once the game was underway.
- **M10 rank-aware land-bid dampening (`LAND_BID_RANK_FACTORS = [0.7, 1.0, 1.2, 1.2]`).** The M10
  leader-win-rate probe (docs/active_plans/audits/leader_win_rate_probe.md) found the round-6
  leader won the game ~56% of the time (target < ~50%) because owned land is ~92-94% of final
  score and the leader, holding more money, out-bid trailing players for ~54% of all colony
  land. The fix multiplies each bidder's money cap in `valueCap` by a factor keyed on its
  current rank (`rankOrder` index): the leader commits 0.7x its usual slice, the bottom two
  ranks 1.2x, mirroring the leader-penalized/trailer-favored fairness pattern `events.ts`
  already applies to personal events. It touches no PM-sourced constant (the land-auction
  tie-break and scoring formula are unchanged). Sim result over 300 seeds/mode: standard
  round-6-leader win rate fell from 51.1% (200-seed baseline) to 38.6%, land-auction wins
  redistributed toward a fair share (standard winner-seat spread 23/23/30/24%), colony success
  held at 93.3% (vs 94.0% baseline), and every liveness/safety gate stayed green (dead-window
  0.0%, dead-land 0.1%, 100% mid-game clear, all terminate, no negative money). Rejected
  alternatives on the same seed set: lowering `LAND_VALUE_MONEY_FRACTION` 0.4 -> 0.3 moved
  leader-win only 51.1% -> 50.0% alone, and when combined with rank dampening it made both
  metrics WORSE (leader-win 45.4%, colony 91.5%) than rank dampening alone, because a lower
  money fraction also dampens the trailers' catch-up bids -- so the money-fraction change was
  dropped and rank dampening kept as a single lever.

## M10 balance sim record (WS-balance)

Two-step colony pass band and the four-goods gate scoping, set from the M10 baseline sweep.

- **Baseline (120 and 200 seeds/mode, pre-M10 AI):** colony success 95.8% (120-seed) / 94.0%
  (200-seed) in both modes; standard round-6-leader win 51.1-51.3%; standard median good trades
  food 8, energy 8, smithore 25, crystite 1-2; winner-seat spread near 25% each. Every
  always-on liveness/safety gate green.
- **Step 2 -- colony pass band:** from the ~94-96% baseline, the band is a floor of
  colony-success rate >= 0.85, enforced on standard mode (the plan's "100+ seeded 12-round"
  gate). Rationale: keep the colony reliably viable with ~9-11 points of headroom below baseline
  to absorb seed-set noise and AI-tuning perturbation; no upper bound is gated (a zero-failure
  seed set must not fail), and failure-reachability is already documented in the M9 record
  above. The tuned config (rank dampening) holds 93.3% at 300 seeds, inside the band.
- **Four-goods liveness gate scoping (crystite is an export market, reported not hard-gated).**
  The release gate reads "median game trades all four goods." Food, energy, and smithore trade
  in ~85-100% of standard games (median well above 1) and are hard-gated at median >= 1.
  Crystite is the colony's store-only-buyer export good (see `auction.ts`): it is produced only
  by dedicating a plot and M.U.L.E. to mining, so it structurally trades in only ~48-53% of
  standard games even at baseline, leaving its median right on the 0/1 knife-edge (300-seed runs
  read median 0 at ~48%, 30-seed runs read median 2 at ~53% -- pure sampling noise around 50%).
  The only AI lever that lifts crystite reliably above the median is aggressive round-1 crystite
  scouting (lowering `AI_ASSAY_RICH_SURPLUS` food * 30 -> food * 20): it raised standard crystite
  to the median trade in ~77% of games, but it diverts the colony's opening food/energy
  production, dropping all-AI colony success to 90.7% and -- more sharply -- causing an early
  colony failure in the `e2e_full_game` playthrough, whose scripted human seat produces nothing,
  so the three AI seats could not carry the colony past round 2. A round-2-onward gate on the
  scout recovered neither metric (crystite 43.7%, colony 84.3%). Because forcing crystite to the
  median demands a crystite-first AI that measurably weakens colony robustness, crystite is
  REPORTED (median plus games-with-trade share) rather than hard-gated; the three consumable
  goods carry the four-goods liveness gate. crystite remains a live market (2.25-3.09 units sold
  per standard game, cleared in ~48% of games).

## muleCurve round base (off-by-one fix) (WS-E-events)

- **Source:** `PlayerEventGenerator.apply` (`PlayerEventGenerator.java` line 101):
  `n = 25 * (gameModel.getRound() / 4 + 1)` (integer division).
- **Round base:** planet_mule's played rounds are 1-based. `Properties.firstRound = 0` is only
  the pre-game lobby value; `GameLobbyPhase.begin` calls `GameModel.beginNextRound`
  (`++this.round`, `GameModel.java` line 684) once before the first played round, so `getRound()`
  is 1 during round 1 and 12 during the final round. The `developmentPubRoundBonus` and
  `foodRequirements` arrays are indexed `[round]` with a dummy index-0 entry, confirming 1-based
  play. So `muleCurve(round) = 25 * (floor(round / 4) + 1)`: 25 for rounds 1-3, 50 for 4-7, 75
  for 8-11, 100 for round 12.
- **Fix:** the prior `round_scale.ts` used `25 * (floor((round - 1) / 4) + 1)` on the mistaken
  premise that PM rounds are 0-based, producing 25/50/75 shifted one bracket late (and never
  reaching 100). It was unused and untested, and disagreed with both PM and the plan's own
  key-formula (`25 * (floor(round/4) + 1)`), so it was corrected as a clear defect.
- **Superseding derivation (both, on the record).** OLD (superseded): "`Properties.firstRound = 0`
  therefore `getRound()` is 0-based during play, so a 1-based engine round `R` maps to PM round
  `R - 1`" -> `25 * (floor((R - 1) / 4) + 1)`. NEW (correct): the lobby's `beginNextRound`
  increments 0 -> 1 before round 1, so `getRound()` is 1..12 during the 12 played rounds ->
  `25 * (floor(R / 4) + 1)`. Two independent corroborations settle it 1-based: (a)
  `developmentPubRoundBonus = {0, 50, 50, 50, 100, ...}` is indexed `[round]` with a leading
  index-0 zero -- a 0-based read would give round 1 a $0 pub payout, which the pub mechanic
  contradicts; the tier change at round 4 (50 -> 100) matches the 1-based bonus tiers. (b)
  `PlayerEventPhase`/`GameLobbyPhase` call `useFood(getRound())` with `getRound() == 1` during
  round 1. This supersedes the earlier WS-E-foundation adjudication (the old `round_scale.ts`
  doc comment) and the "PM's own 0-based round counter" phrasing that used to appear in the "Food
  requirement index" section below; that section's develop-consumption offset was re-derived and
  fixed under this 1-based premise by WS-E-mules (WS-E-foodfix).

## Personal events (WS-E-events)

- **Source:** `PlayerEvent.java` (the 22 event subclasses), `PlayerEventGenerator.java` (deck,
  chance, blocking, pity), `PlayerEventPhase.java` (per-player scheduling).
- **Scheduling (real mechanism):** a `PlayerEventPhase` runs before each player's development
  turn, iterating `Development.nextPlayer()` (rank order). `nextEvent` rolls a 27.5% chance
  (`GameData.playerEventChance = 0.275`) each turn, never in round 1. This engine resolves the
  event at the start of each develop turn (`beginDevelopTurn`), before food consumption, because
  PM selects using pre-consumption food (the pity check) and applies the effect before
  `useFood`. Amount = `factor * muleCurve(round)`.
- **`nextPlayerForEvent` is dead code:** `GameModel.nextPlayerForEvent` (last-two-rounds -> last
  place; otherwise 50/50 leader/last) is defined but called nowhere in the decompiled build.
  Personal-event targeting is the per-player develop-turn iteration above, not this picker, so
  the leader/last 50/50 was not implemented. Recorded as a verification finding.
- **Deck and no-repeat:** the 22 events are shuffled once (a seed-derived sub-rng); `nextEvent`
  scans from a cursor for the first eligible event, swaps it to the cursor, and advances the
  cursor -- so each event fires at most once until the deck is exhausted.
- **Blocking rules** (`PlayerEventGenerator.java` line 88): with `n` the player's 1-based rank
  and `lastRound` the final round, an event is skipped when `round > lastRound - 2 && !good`
  (last two rounds: bad blocked), `n == 1 && good` (leader: good blocked), `n >= 3 && !good`
  (bottom two ranks: bad blocked), or its condition fails.
- **Zero-food pity:** when a non-leader (`n > 1`) holds no food, the first `home_world_package`
  at or after the cursor is swapped to the cursor so the starving player draws the food package.
- **Money clamp:** `Player.setMoney` (`Player.java` lines 138-145) reassigns any negative result
  to 0, so a penalty exceeding a player's money leaves them at 0, never in debt. This engine
  clamps identically -- the "no negative money from events" invariant matches PM (no deviation).
- **`extra_plot`/`lost_plot` inclusion (deviation):** PM removes these two plot events from the
  deck at game start unless every player votes for "specific events"
  (`GameLobbyPhase.shouldEnableSpecificEvents` -> `removeSelectedEvents`). This engine includes
  all 22 (equivalent to specific-events-enabled) to match the milestone's full-roster
  requirement; recorded as a deliberate deviation from PM's default.
- **Encoded event table** (factor `x` = `x * muleCurve` money change; per-plot events multiply by
  a plot count):

  | Event | Polarity | Factor / effect | Condition |
  | --- | --- | --- | --- |
  | home_world_package | good | +3 food, +2 energy | none (pity package) |
  | wandering_space_traveler | good | +2 smithore | none |
  | best_built_mule | good | +2 | owns a M.U.L.E. |
  | tap_dancing_mule | good | +4 | owns a M.U.L.E. |
  | agriculture_award | good | +2 per food plot | owns a food plot |
  | worm_infestation | good | +4 | none |
  | museum_bought_computer | good | +8 | none |
  | swamp_eel_eating | good | +2 | none |
  | charity | good | +3 | none |
  | artificial_dumbness | good | +6 | none |
  | relative_died | good | +4 | none |
  | dead_moose_rat | good | +2 | none |
  | extra_plot | good | grant a random unowned plot | an unowned non-town plot exists |
  | mischievous_elves | bad | lose half food (floor) | none |
  | mule_lost_bolt | bad | -3 | owns a M.U.L.E. |
  | mules_deteriorated | bad | -2 per smithore/crystite plot | owns a mining plot |
  | dirty_solar_collectors | bad | -2 per energy plot | owns an energy plot |
  | gypsy_inlaws | bad | -6 | none |
  | flying_cat_bugs | bad | -4 | none |
  | kazinga_races | bad | -4 | none |
  | bat_lizard | bad | -4 | none |
  | lost_plot | bad | lose an undeveloped owned plot | owns an empty plot |

## Colony events (WS-E-events)

- **Source:** `ColonyEvent.java` (9 types, tile selection, effects, A/B `categoryA` flag),
  `ColonyEventGenerator.java` (deck generation), `ColonyEventPhase.java` (A/B phase split).
- **Deck generation** (`ColonyEventGenerator.generate`): build the early deck (pirates x2, acid
  rain x3, sunspot x3, fire x2 = 10), double-shuffle, assign the first 2 to rounds 1 and 2; move
  the remaining 8 into the late deck, add pest x3, planetquake x3, meteorite x2, radiation x2
  (18 total), double-shuffle, assign to rounds 3 onward; force the final round to ship-return.
  Index 0 is the never-played round-0 slot (null). So rounds 1-2 draw early-deck types only, and
  the final round is always ship-return.
- **A/B split** (`ColonyEventPhase`, the `categoryA` enum flag): category A (acid rain, sunspot,
  meteorite, radiation) fires after development and before production, and category B (pest,
  pirates, planetquake, fire, ship) fires after production and before collection. Each round has
  exactly one scheduled type, so at most one colony event fires per round. Category A sets
  factory temporary bonuses (consumed and reset by `Factory.calcCapacity` each round); category B
  adjusts the already-computed production (`Factory.setProduction`), store stock, or terrain.
  This engine encodes the split by resolving category A before `computeProduction` (board changes
  plus a per-plot temporary-bonus map) and category B after (per-plot yield adjustments plus
  store/board/inventory side effects).
- **Effects** (`ColonyEvent.applyEvent`):
  - **acid rain:** a random struck row gets +4 food / -2 energy temporary bonus, every other row
    +1 / -1, on developed food/energy plots.
  - **sunspot:** every developed energy plot gets +3; not applicable when no energy plot exists.
  - **meteorite:** a random plot (not town, not river, crystite level <= 2) is cratered --
    M.U.L.E. destroyed, crystite set to 4, terrain set to `crater`. PM's reject-until-valid
    random loop is replaced here by a uniform pick from the eligible set (same distribution, no
    unbounded loop).
  - **radiation:** a random plot owned by the rank-1 leader that holds a M.U.L.E. loses it; not
    applicable when the leader owns no developed plot. (PM iterates `Math.min(1, size)` -- the
    leader only, not the top two.)
  - **pest:** one random rank-1-leader food plot with positive production produces nothing; not
    applicable when the leader has no positive food production. (Leader only, `Math.min(1,
    size)`.)
  - **pirates:** every crystite plot produces nothing and every player's crystite inventory is
    wiped (this engine has no depot, so all players are affected).
  - **planetquake:** every smithore and crystite plot's production is halved (integer division
    per plot); with 50% chance a mountain (unowned or leader-owned) with an adjacent plain erodes
    one tier while the neighboring plain heaves into a mountain1, both losing their M.U.L.E. and
    that round's production.
  - **fire:** the store's food, energy, and smithore stock burn to zero.
  - **ship return:** the forced final-round event has no mechanical effect (narrative only).

## Event RNG isolation (WS-E-events)

- **Design (not a PM numeric value):** planet_mule uses the main `Random` for colony-event
  shuffles/tile selection and a separate `Random` for personal events. This engine gives BOTH
  subsystems their own sub-streams, seeded from the game seed via `PLAYER_EVENT_RNG_SALT` and
  `COLONY_EVENT_RNG_SALT` (distinct 32-bit mixing constants), and threads their serialized states
  in `GameState`.
- **Rationale:** isolating event randomness from the core economy/auction RNG stream means adding
  events did not perturb the pre-event replay sequence -- the M6 replay fixture's action log is
  unchanged and only its hash moved (from the fired-event effects and the new state fields), and
  economy/auction unit tests that do not reach an event round are unaffected. Determinism is
  preserved (same seed -> same events); exact byte-parity with Java's `Random`/`Collections.
  shuffle` is not attempted (per the plan's "extract rules, write fresh TypeScript" policy).

## Production: variance and the energy-shortfall model (WS-E-production, M7)

This section records the M7 production-formula completion, extracted from `Factory.java`
(`calcCapacity`), `Player.java` (`useEnergy`), `Resource.java`, and `MuleMath.java`
(`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/map/Factory.java` and
sibling files). It resolves two places where this workstream's dispatch wording diverged from
what the Java actually does once traced end to end; both are recorded here with the verified
reading, not the dispatch's assumption.

- **Full formula, verified:** `Factory.calcCapacity(Random random)` (`Factory.java` lines
  121-136): `n = round(normalDistributed(random)); capacity = yieldPotential + bonus +
  temporaryBonus + n`, then the private `calcCapacity(int)` overload applies the power gate and
  clamps to `[0, productionMaxProduction]` (8). `bonus` is `Building.calcBonuses`'s sum of the
  adjacency and learning-curve terms below. This engine's `computeProduction` (`economy.ts`)
  implements the identical shape: `terrainYield + adjacencyBonus + floor(sameResourceCount /
  PRODUCTION_LEARNING_CURVE_DIVISOR) + tempBonus + round(normalDistributed(rng))`, clamped to
  `[0, PRODUCTION_MAX_YIELD]`, then zeroed if unpowered.
- **Variance is unconditional, not mode-scaled (resolved decision, confirmed).** `Factory.
  calcCapacity` draws `round(normalDistributed(random))` with no mode/round branch anywhere in
  the method. The plan's key-formulas summary already recorded this as the resolved PM reading
  (mode-scaling is the unused 1983 heritage variant); this pass confirms it directly against the
  Java with line numbers rather than by inference.

### Adjacency bonus: flat, not per-neighbor (correction to a prior M1-M6 reading)

- **Chosen value (verified):** a plot gets a FLAT `ADJACENCY_BONUS_PER_NEIGHBOR` (currently 1)
  once at least one orthogonally-adjacent plot is owned by the same player and outfitted for the
  same resource, regardless of how many of the (up to four) neighbors match.
- **Source:** `Building.calcBonuses` (`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/
  mule/model/map/Building.java` lines 68-77): `n5` counts matching orthogonal neighbors, but the
  code only branches on `n5 <= 0` (skip) versus `n5 > 0` (apply `factory.setBonus(factory.
  getBonus() + 1)`) -- the exact value of `n5` beyond "at least one" is never read.
- **Correction:** this engine's `computeProduction` previously multiplied
  `ADJACENCY_BONUS_PER_NEIGHBOR` by the matching-neighbor count (`countMatchingNeighbors(...) *
  ADJACENCY_BONUS_PER_NEIGHBOR`, up to 4x), predating this verification pass (the constant's own
  M1-era comment read "work package spec... no exact historical figure documented"). This patch
  changes the multiply to a flat `matchingNeighbors > 0 ? ADJACENCY_BONUS_PER_NEIGHBOR : 0`, and
  updates the constant's doc comment in `constants.ts` with the citation above.

### Learning-curve count bonus: `floor(sameResourceCount / 3)`, per player per resource

- **Chosen value (verified):** every one of a player's factories outfitted for a given resource
  gets `floor(thatPlayer'sTotalFactoryCountForThatResource / 3)` added to its capacity, regardless
  of adjacency -- a colony-wide (well, player-wide) specialization bonus, not a clustering bonus.
- **Source:** `Building.calcBonuses` (`Building.java` lines 83-111): per-player, per-resource
  factory counts (`n`, `n2`, `n3`, `n4` for food/energy/smithore/crystite) are tallied first in a
  loop over the player's owned tiles, then a second loop applies `factory.setBonus(factory.
  getBonus() + n / 3 + n6)` (integer division) to EVERY owned factory of that resource; `n6` is a
  hireling-related term, always 0 in this project's classic-1983 scope (no lab items/hirelings,
  `Properties.mule.enableHiring` gated code is an empty block in the decompiled build). Encoded as
  `PRODUCTION_LEARNING_CURVE_DIVISOR = 3` in `constants.ts`.

### Energy shortfall: verified as full-power-or-zero with random per-player order, not "partial power halved"

- **What the dispatch's wording assumed:** the plan's key-formulas summary and this workstream's
  dispatch both describe PM's energy-shortfall model as "no power -> 0, partial power -> halved
  (minimum 1)", reading `Factory.calcCapacity`'s private `calcCapacity(int n)` overload (`Factory.
  java` lines 130-136) at face value: `if (power < energyNeeded) { n = power == 0 ? 0 : (capacity
  > 1 ? n /= 2 : 1); }`.
- **What tracing the caller shows: the "partial, halved" branch is unreachable in this project's
  scope.** `power` is set by `Player.useEnergy(Random random)` (`OTHER_REPOS/planet_mule/
  data_decompiled/com/turborilla/mule/model/Player.java` lines 185-201): it shuffles the player's
  OWNED tiles (`Collections.shuffle(ownedTiles, random)`), then for each tile's building,
  `power = min(this.energy, building.getEnergyNeeded())`, deducting `power` from the player's
  remaining energy pool before moving to the next shuffled tile. `energyNeeded` is `Resource.
  energyCost` (`Resource.java` lines 10-13): 0 for `Energy`, and `GameData.data.
  foodEnergyRequirement`/`smithoreEnergyRequirement`/`crystiteEnergyRequirement` for the other
  three -- all three literally 1 (`GameData.java` lines 38-42, matching this engine's
  `ENERGY_PER_MULE = 1` for every non-energy resource). With `energyNeeded` always 0 or 1,
  `power = min(remainingEnergy, energyNeeded)` can only ever be exactly 0 or exactly
  `energyNeeded` -- never a value strictly between them. So `power < energyNeeded` (the outer gate)
  is only ever true when `power == 0`, and the ternary's `power == 0 ? 0 : ...` branch is then
  ALWAYS the `0` case: the `capacity > 1 ? n /= 2 : 1` half of the ternary is dead code for every
  input this project's classic-1983 scope can ever produce. (It exists in PM's own source to
  support a hypothetical multi-unit `energyNeeded`, reachable only via lab items -- `WATER_TANK`/
  `MINING_TOWER`/`POWER_PLANT` energy-reduction items -- which are explicitly out of scope per
  `REFERENCE_REPOS.md`'s "classic 1983 core feature set (no lab items...)".)
- **What this project implements: the reachable branch, exactly.** Each player's owned, outfitted
  plots are processed in a random per-round order (a Fisher-Yates `shuffle` in `economy.ts`,
  mirroring `Collections.shuffle`'s back-to-front swap direction), consuming that player's
  pre-production energy budget `ENERGY_PER_MULE` at a time until it runs out; a mule processed
  after the budget is exhausted produces exactly 0 (never a halved value), matching the verified,
  reachable half of PM's power gate. Energy mules draw no power and are never gated (`energyCost
  = 0`).
- **Random order vs the M7 exit criteria's "random-order energy shortfall zeroing" wording.**
  Read together with the trace above, that phrase (from the plan's Key-formulas / M7 exit
  criteria) is the ACCURATE summary of PM's real, reachable behavior in this project's scope; the
  separate "no power -> 0, partial -> halved (min 1)" wording elsewhere in the plan describes
  PM's full generic method body, which includes the unreachable branch. Both wordings originate
  from the same verified Java; this is not a source conflict, only two different levels of detail
  about the same method. This project's engine previously (pre-M7) processed a player's unpowered
  plots in fixed row-major board order, not randomly -- the random Fisher-Yates order is this
  patch's actual behavioral fidelity fix, verified against `Player.useEnergy`'s
  `Collections.shuffle`.
- **RNG stream and draw-count fidelity.** `computeProduction` draws from `state.rngState` (the
  core economy/auction stream, the same one `updateStoreForNewRound` and the land auction already
  use), NOT an isolated sub-stream (unlike the M6 event RNG, see "Event RNG isolation" above) --
  production has no PM-analog reason to be isolated, since PM itself draws capacity variance and
  the energy shuffle from the SAME main `Random`. The M7 patch draws the gaussian variance
  UNCONDITIONALLY for every owned, outfitted plot, even one that turns out unpowered, matching
  `Factory.calcCapacity`'s own unconditional draw ahead of its power gate; this keeps the RNG draw
  count per player independent of which specific mules end up powered, avoiding a subtle
  determinism trap where two board states with the same mules but different power outcomes would
  otherwise silently diverge in how many draws later code in the same round consumes.
- **Replay fixture impact.** `tests/test_replay_determinism.mjs`'s fixture was regenerated in
  full for M7: production consuming `state.rngState` for the first time (it previously never
  touched the RNG at all) perturbs every later draw from that stream in the same game -- store
  pricing, land-auction rolls and pricing, and the colony-event tile/effect picks that thread
  through it -- so land-auction chain lengths and outcomes shift once production first runs,
  changing the ACTION LOG itself (not just the hash) from that point on. The same scripting
  recipe (`REPLAY_SEED = 2026`, the hand-injected `assay_plot` for player 0 at (0, 0) on their
  first develop turn) was re-run to produce the new fixture.

## Crystite production: EBPC = deposit level, and no production-triggers-reveal rule (WS-E-production, M7)

- **Chosen value (verified): crystite's base yield is the plot's own deposit level, not a
  terrain-type lookup.** `PlanetTile.getYieldPotential(Resource)` (`OTHER_REPOS/planet_mule/
  data_decompiled/com/turborilla/mule/model/map/PlanetTile.java` lines 73-89): the `Crystite` case
  returns `this.type.allow(Resource.Crystite) ? this.getCrystite() : 0` -- `getCrystite()` is the
  raw deposit level (`Plot.crystiteLevel` in this engine), with no terrain-type term feeding it at
  all (unlike food/energy/smithore, whose cases read `this.type.food`/`energy`/`smithore`
  directly off the terrain type). `economy.ts`'s `baseYield` special-cases crystite to read
  `plot.crystiteLevel` directly instead of consulting the terrain yield table; river and town
  plots are already forced to `crystiteLevel = 0` at map generation (see "Crystite bloom seeding"
  above), so no separate terrain gate is needed in the production code path. `YIELD_TABLE_BY_
  RESOURCE.crystite` (`CRYSTITE_YIELD_BY_TERRAIN`, all zeros) is kept only so `Record<Resource,
  ...>` call sites like `land_ai.ts`'s best-terrain-yield heuristic compile and correctly score
  crystite's terrain-only potential as 0 (accurate: it genuinely has none).
- **Production reads the TRUE level regardless of `crystiteRevealed`; no reveal-on-production
  rule is added (dispatch item explicitly flagged "verify PM behavior; adjudicate if absent" --
  verified absent, adjudicated not to add it).** `Factory.setYieldVisible` (`Factory.java` line
  42, `GameModel.showYieldPotential`, `GameModel.java` lines 416-421) gates only a UI concern: an
  unassayed crystite factory's displayed identifier falls back to a generic "5" placeholder digit
  sprite (`"factory-" + resource + "5-color" + n` versus the real `yieldPotential` digit) rather
  than the true production number; `setYieldVisible(true)` is called ONLY from `GameModel.assay`
  (via `showYieldPotential`), never from any production code path (`ProductionPhase.java`'s
  `finishPower`/`finishProduction` never touch `yieldVisible`). This confirms PM allows "blind"
  crystite mining: a player who outfits a crystite M.U.L.E. on an unassayed high-level deposit
  receives the real yield into their inventory every round, they simply are not shown the exact
  per-round number on the tile until they assay it. This project's `crystiteRevealed` flag (see
  the "Assay: ownership and reveal scope" entry above) already matches this assay-only-reveal
  model for its own purpose (gating what the UI/AI may read via `visibleCrystite`); `economy.ts`'s
  production code intentionally bypasses that gate and reads `plot.crystiteLevel` directly (the
  same pattern `events.ts`'s meteorite eligibility check already uses), since production is a real
  game mechanic, not something that should be blind to server-side state the player simply hasn't
  scouted yet. No `crystiteRevealed = true` side effect is added to `computeProduction`.
- **Energy cost confirmed at the flat rate.** `Resource.Crystite`'s `energyCost` constructor
  argument is `GameData.data.crystiteEnergyRequirement` (`Resource.java` line 10), which is 1
  (`GameData.java` line 40) -- identical to food and smithore, confirming `ENERGY_PER_MULE = 1`
  already covers crystite with no special case needed in the energy-gate code.
- **Auction window naturally un-skips.** No auction code change was needed or made: the M4
  WS-E-auction skip condition (`docs/RULE_SOURCES.md`, "Skip conditions") already only skips a
  window when no trade is possible (no seller and no below-critical buyer); once players actually
  hold mined crystite, the existing critical-threshold role assignment (crystite's critical is
  always 0, so any holder is a seller) makes the window live on its own. Confirmed by
  `tests/e2e/e2e_balance_sim.mjs`'s new crystite-units-sold report (see below): crystite trades
  in every sampled run once production is live, at roughly 1.4-1.8 units per game across 30
  seeds/mode, with no regression in the dead-window-rate gate.

## develop_ai.ts: crystite outfit and assay heuristics (WS-E-production, M7)

These are this engine's own AI design choices (PM's `LandAuctionActuator`/`SimpleAI` heuristics
for crystite and assay are out of this workstream's scope), sim-tuned against
`tests/e2e/e2e_balance_sim.mjs` and unit-tested for the cannot-stall property in `tests/test_ai.
mjs`.

- **Outfit preference:** when the player owns an empty plot with a revealed crystite level at or
  above `CRYSTITE_OUTFIT_MIN_LEVEL` (2), the AI weighs `level * store.prices.crystite` against
  `store.prices[scarcestResource]` (one round of the colony's currently-scarcest good at its live
  price) and prefers crystite when it scores higher, otherwise falling back to the existing
  scarcest-resource heuristic unchanged.
- **Placement preference:** once carrying a crystite-outfitted M.U.L.E., the AI places it on its
  own richest revealed deposit (`bestOwnedEmptyCrystitePlot`) rather than the first empty plot in
  row-major order (`firstOwnedEmptyPlot`), so the outfit choice above is not wasted on the wrong
  plot; every other outfit still places on the first empty plot as before.
- **Assay heuristic:** once a player's money clears `AI_MONEY_RESERVE + AI_ASSAY_RICH_SURPLUS`
  (the surplus constant is sized well above a fresh game's starting money minus the reserve, so a
  brand-new game never triggers this branch and every pre-existing AI test is unaffected), the AI
  spends develop ticks assaying a promising plot -- not town, not already revealed, orthogonally
  adjacent to a mountain tile (a cheap, imperfect heuristic: this engine's crystite blooms are
  seeded independently of terrain, see "Crystite bloom seeding" above, so this is the AI's own
  belief, not perfect information) -- preferring one it already owns, before ever spending on a
  M.U.L.E. Cannot-stall: assaying always reveals its target plot, shrinking the candidate set, so
  repeated assay ticks provably terminate within the candidate count (verified in `tests/test_ai.
  mjs`).

## Wampus: spawn, blink, and move timing (M8, WS-E-critters)

This section records the M8 wampus subsystem, extracted from planet_mule's `Wampus` model class
(`OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Wampus.java`) and
`GameModel.createWampus`/`AbstractDevelopmentPhase`/`FastDevelopmentPhase` (which call
`createWampus()` once per round's develop phase), and mapped onto this engine's discrete
develop-phase tick clock (`src/engine/wampus.ts`, `DevelopPayload.wampus` in `game_state.ts`).

- **One wampus per round, created when develop begins.** `GameModel.createWampus` (`GameModel.java`
  lines 791-792): `this.wampus = new Wampus(this.map, this.random, this.round);`, called once from
  `AbstractDevelopmentPhase.begin` (line 126) and `FastDevelopmentPhase.begin` (line 93) -- both the
  human-interactive and AI-fast-forwarded develop phase entry points -- confirming a fresh wampus
  per round, not per player turn. This engine's `enterDevelop` (`turn.ts`) calls
  `createWampusState` once, before the round's first `beginDevelopTurn`, and threads the resulting
  `WampusState` through every player's turn in the round (`beginDevelopTurn`'s new `wampus`
  parameter, carried forward by `endDevelopTurn`).
- **Dead on creation with no unowned mountain.** `Wampus`'s constructor (lines 38-63) collects every
  unowned mountain-tier tile's mountain sub-tile into `this.mountains`, then
  `this.dead = this.mountains.isEmpty();`. This engine's `unownedMountains` (`wampus.ts`) does the
  same scan over `state.plots`, and `createWampusState` sets `dead: mountains.length === 0`.
- **No mid-round candidate removal (deliberate omission).** `Wampus.landClaimed` (`Wampus.java`
  lines 164-176) removes a claimed tile's mountain from the candidate list and immediately re-rolls
  a new site if the wampus was standing there, because PM's single continuous real-time phase lets
  land grant/auction and wampus hunting interleave. This engine's develop phase never claims land
  mid-round (land grant and land auctions both run to completion before develop each round), so the
  unowned-mountain candidate set is fixed for the entire round; `landClaimed` has no reachable
  scenario to port, and is intentionally not implemented.
- **Bounty formula.** Already spot-checked in this document's "1983 vs PM formula agreement" list:
  `100 * floor((round + 4) / 4)`, `Wampus.java` line 59 (`this.moneyReward = 100 * ((n + 4) / 4);`,
  `n` the round the wampus is created for). Pinned table for every round 1-12 (rounds 1-3: $100,
  4-7: $200, 8-11: $300, 12: $400), verified against `WAMPUS_BOUNTY_BASE`/`_ROUND_OFFSET`/
  `_ROUND_DIVISOR` in `tests/test_wampus_pub.mjs`.
- **Timing, mapped to this engine's develop tick scale.** `Wampus.update` (lines 65-91) runs every
  frame independent of any player's own turn timer; its non-`easyToCatchWampus` (this project's
  scope excludes the hireling/difficulty flag family) timings are: initial delay before the first
  blink `12.0 + 3.0 * random.nextFloat()` seconds; each visible blink lasts `0.75` seconds; each
  hidden gap between blinks lasts `4.25` seconds; two blinks (`numBlinks = 2`) happen at one
  mountain site before `randomMountain()` picks a new one. Mapped via this engine's established
  develop-tick anchor (`ticksPerSecond = DEVELOP_TICKS_FULL / developmentMaxTime(47.5s)`, the same
  ratio `ASSAY_TICK_COST` uses):
  - Initial delay: `round(12.0 * 50/47.5) = 13` base ticks, `round(3.0 * 50/47.5) = 3` ticks of
    discrete random range (`WAMPUS_INITIAL_DELAY_BASE_TICKS`/`_RAND_TICKS`, drawn via
    `rng.nextInt(4)` giving `0..3` inclusive as the discretized analog of the continuous `[0, 3)`
    second draw).
  - Visible duration: `round(0.75 * 50/47.5) = 1` tick (`WAMPUS_VISIBLE_TICKS`).
  - Hidden duration: `round(4.25 * 50/47.5) = 4` ticks (`WAMPUS_HIDDEN_TICKS`).
  - Blinks per site: `2` (`WAMPUS_BLINKS_PER_SITE`), unchanged from PM's literal value (a pure
    count, no unit conversion needed).
  - **Known consequence, flagged for the UI lane:** at this tick granularity the visible window is
    very short (1 tick) relative to a full develop turn's 50-tick budget. This is the faithful
    tick-mapped value per the extraction workflow; if WS-U-critters' playtesting finds a 1-tick
    window too fleeting for a human to click in the real-time spatial scene, that is a UI-side
    presentation concern (a hold-open buffer, or a coarser `?speed=`-independent minimum-visible-ms
    floor), not a reason to alter the extracted engine constant.
- **Move-to-new-site selection.** `Wampus.randomMountain` (lines 131-147): draw a uniform index into
  the candidate list; if it lands on the currently-occupied site, advance to `(index + 1) %
  size` instead (guarantees a different site whenever more than one candidate exists; with exactly
  one candidate it deterministically stays there). This engine's `pickMountain` (`wampus.ts`)
  matches exactly.
- **Blink-state-machine trace, verified line by line against `Wampus.update`:** decrementing
  `blinkTimer` by one tick each `tick` action; on reaching zero, toggle `visible`. Toggling FROM
  hidden TO visible: if the current site's blink budget is exhausted (`blinksRemainingAtSite <= 0`,
  the analog of PM's `numBlinks == 0`), pick a new site and reset the per-site blink budget to
  `WAMPUS_BLINKS_PER_SITE`, THEN decrement it by one and emit a `"spawn"` event; otherwise stay at
  the same site, decrement the existing budget by one, and emit a `"blink"` event. Toggling FROM
  visible TO hidden: no site change, no event (the UI only needs to know when the wampus becomes
  visible or is caught, not every hide transition; `WampusState.visible` itself already reflects the
  hidden state on every tick). This engine's `tickWampus` (`wampus.ts`) implements this exact
  sequence; `tests/test_wampus_pub.mjs` pins the countdown-only, toggle-to-visible, and dead-no-op
  cases directly against the pure function.

## Wampus RNG isolation (M8, WS-E-critters)

- **Design, matching planet_mule's own choice (not just this project's convenience pattern).**
  `Wampus`'s constructor (`Wampus.java` line 60): `this.random = new Random(random.nextLong());` --
  PM itself seeds a fresh `Random` derived from, but independent of, the main stream, unlike
  production (see "Production: variance and the energy-shortfall model" above, which explicitly has
  "no PM-analog reason to be isolated" because PM draws production variance from the SAME main
  `Random`). This engine follows the same isolation this time: `WAMPUS_RNG_SALT` derives
  `wampusRngState` from the game seed at `createInitialGameState` (`(seed ^ WAMPUS_RNG_SALT) >>>
  0`), matching the `PLAYER_EVENT_RNG_SALT`/`COLONY_EVENT_RNG_SALT` pattern already established for
  personal/colony events.
- **One continuous isolated stream for the whole game, not re-derived per round (a deliberate,
  documented simplification).** PM re-derives a brand-new sub-`Random` every time `createWampus()`
  runs (once per round, from `random.nextLong()` on the CURRENT state of the main stream at that
  moment). This engine instead derives `wampusRngState` once, from the seed, at game start, and lets
  `createWampusState`/`tickWampus` continue advancing that SAME isolated stream across every round of
  the game (never re-seeded). This keeps the wampus subsystem deterministic from the seed alone
  (same as PM) while avoiding a second per-round re-derivation call that would need to consume a
  value from the core stream every round (PM's `random.nextLong()` call importantly does NOT
  consume the core stream in this engine's design, since `wampusRngState` lives in its own isolated
  lane entirely, never touching `state.rngState`) -- matching the same "no exact byte-parity with
  Java's `Random`, determinism from the seed is what matters" policy already recorded under "Event
  RNG isolation" above.

## Pub gambling: engine implementation confirms the already-adjudicated formula (M8, WS-E-critters)

The formula and cap were already fully adjudicated in this document's "Pub payout array: TSavo
transcription error" section above (PM `GameModel.gamble`, `GameModel.java` lines 431-443); this
entry only records the M8 implementation and its tick-mapping, not a new adjudication.

- **`applyGamble` (`turn.ts`) implements the verified formula directly:** `payout =
  PUB_ROUND_BONUS_BY_ROUND[round] + floor(rng.next() * fraction * PUB_MAX_RANDOM_AMOUNT)`, capped at
  `PUB_PAYOUT_CAP` (250), where `fraction = min(payload.ticksRemaining / DEVELOP_TICKS_FULL, 1)` is
  this engine's tick analog of PM's `min(timeLeft / developmentMaxTime, 1)`. `state.round` indexes
  `PUB_ROUND_BONUS_BY_ROUND` directly (no shift), matching PM's `developmentPubRoundBonus[this.round]`
  under the corrected 1-based `getRound()` premise (see "muleCurve round base" above: PM's round
  field equals this engine's round `R` directly throughout round `R`'s develop phase).
- **Draws from the core `state.rngState` stream, not an isolated one.** Unlike the wampus subsystem
  (which PM itself isolates, see above), gambling is a one-shot player-initiated action, not a
  recurring per-tick system; it draws from the same core stream `buy_mule`/`outfit_mule`/`assay_plot`
  already do, consistent with every other player-action RNG draw in this engine (no PM analog for
  isolating a single gamble roll -- `GameModel.gamble` reads the same main `Random` every other
  player action in PM's own model uses).
- **Always ends the turn.** `applyGamble` calls `endDevelopTurn` unconditionally after applying the
  payout, matching the dispatch instruction and PM's own AI actuators, which gate all further
  develop actions behind `player.hasGambled()` once a gamble fires this turn (`DevelopmentActuator`
  in both `ai/search/` and `ai/adam/`, `hasGambled()` guard). This engine needs no explicit
  `hasGambled` flag on `Player`: because `applyGamble` ends the turn immediately (the reducer
  advances `DevelopPayload.activePlayer`/enters production), a player physically cannot gamble twice
  within the same turn -- a second `gamble` for the same player in the same turn would fail
  `requireActivePlayer` instead, once the turn has already moved on.
- **Money-changing action coverage.** `applyGamble`'s payout is always `>= 0` (both terms are
  non-negative), so it needs no clamp of its own; it only ever adds money, matching the negative-
  economy invariant convention (every money-changing action's affordability/clamp rule is unit-
  tested with the module that introduces it -- `tests/test_wampus_pub.mjs`'s bounds tests cover this
  one).

## AI wampus hunting: PM's AI DOES hunt (verified; this project implements a minimal always-hunt
## heuristic) (M8, WS-E-critters)

- **Verification finding: PM's AI hunts the wampus, contrary to this workstream's dispatch
  wording.** The dispatch that opened this workstream stated "PM AI does not hunt the wampus --
  verify; if it does, implement minimal." Grepping PM's `ai/` package for `Wampus`/`wampus` finds
  TWO independent AI implementations that hunt it: `ai/search/DevelopmentActuator.java` (line
  189-190: `if (!gameModel.getWampus().isDead() && f > 5.0f && random.nextFloat() <
  wampusProbability) actionQueue.addAction(new DevelopmentAction.CatchWampus(...));`, a flat 20%
  per-check chance once appeared) and `ai/adam/DevelopmentActuator.java` (lines 175-201,
  `testHuntWampus`: hunts when nothing else productive is queued, with a per-game probability
  `0.3 + 0.5 * random.nextFloat()`). Both actuators gate the probability behind spatial/travel-cost
  reasoning (catching the wampus means walking the avatar to it instead of doing something else with
  that time), which is why PM's AI hunts probabilistically rather than unconditionally.
- **This project's minimal implementation: unconditional hunt when visible.** This engine's develop
  AI has no positional/travel-cost model (the whole point of `hunt_wampus`'s engine-side design is
  that proximity is a UI-scene concern, not an engine rule -- see `applyHuntWampus`'s doc comment in
  `turn.ts`); catching the wampus costs nothing (no ticks, no money) and only ever adds money. With
  no cost to weigh against, PM's probabilistic gate has no analog to port faithfully: any weight
  strictly between "always" and "never" would just be arbitrarily leaving expected value on the
  table for no modeled reason. `decideDevelopAction` (`develop_ai.ts`) therefore hunts unconditionally
  whenever `payload.wampus.visible && !payload.wampus.dead && !payload.wampus.caught`, ahead of every
  other decision in the function (a strict short-circuit, matching this workstream's "implement
  minimal" fallback instruction). Confirmed by the M8 balance sim (see the sim record below): every
  AI-vs-AI game catches a wampus close to once every couple of rounds once one has appeared.

## Species select and mode picker: engine plumbing (M8, WS-E-critters)

- **Species union and `Player.species` field.** `src/engine/player.ts` declares an engine-owned
  `Species` union (`humanoid | gollumer | mechtron | packer | leggite | bonzoid | spheroid |
  flapper`), matching `SPECIES_NAMES` in `src/ui/sprites/sprites_species.ts` name-for-name and
  order-for-order (verified against `Race.races`, `OTHER_REPOS/planet_mule/data_decompiled/
  com/turborilla/mule/model/Race.java` line 12) but declared independently, so the engine stays
  DOM/UI-free (no import from `src/ui/`). `Player.species: Species` is a required field.
  `createInitialGameState` gains an optional fourth parameter, `species: readonly [Species, Species,
  Species, Species]`, defaulting to the first four entries of the exported `SPECIES` list so every
  existing caller (tests, the current UI) keeps a deterministic assignment without passing one; a
  future title-screen species picker (WS-U-critters) supplies its own choice through this parameter.
- **Flat starting money confirmed, no economy branch on species.** `GameData.java` line 15
  (`playerStartMoney = 1000`) is read unconditionally by `createStartingPlayer`
  (`STARTING_MONEY`, unchanged by this patch); no function anywhere in `src/engine/` or `src/ai/`
  reads `Player.species`. `tests/test_wampus_pub.mjs`'s "two games with the same seed but different
  species reach identical economy" test asserts this directly: same seed, two different 4-species
  assignments, identical board, identical starting money and goods for every player, only the
  `species` field itself differs.
- **Mode config: no engine change needed, verified end to end via the sim.** The `GameMode` enum,
  `ROUND_COUNT_BY_MODE`, and the `mode` parameter on `createInitialGameState` already existed before
  this workstream (M1, WS-E-foundation); this workstream's job was to verify standard mode is fully
  playable end to end, not to add mode plumbing. `tests/e2e/e2e_balance_sim.mjs` (see the sim record
  below) runs 30 seeded standard-mode (12-round) AI-vs-AI games to completion with the M8
  wampus/gamble additions in place: 30/30 terminate, zero negative-money games, all auction and land
  gates hold -- confirming standard mode plays end to end with no M8-introduced regression.

## M8 balance sim record (WS-E-critters, informational)

`tests/e2e/e2e_balance_sim.mjs` gained two report-only (non-gate) metrics: wampus catches per game
and pub gambles per game, tallied whenever `decideDevelopAction` returns `hunt_wampus`/`gamble`. Over
30 seeds per mode: beginner 2.63 wampus catches/game, 20.13 pub gambles/game; standard 2.70 wampus
catches/game, 42.97 pub gambles/game (roughly double beginner's, tracking standard's roughly double
round count and develop-turn count). Every existing gate held unchanged (both modes: 0.0% dead
goods-auction-window rate, 0.0% dead land-auction rate, 100% mid-game land clear rate, 30/30 games
terminated, zero negative-money games), confirming the wampus/gamble additions introduce no economy
regression.

## Endgame scoring: per-plot and per-mule terms (M9, WS-E-endgame)

The plan's M9 exit criteria phrase the scoring formula as "money + per-plot (500 + outfit price) +
35 per mule + goods at current prices," which reads as if every owned plot earns `500 + outfit
price`. Read directly against the Java, that phrasing conflates two independent terms.

- **Chosen value (verified directly against `Player.calcPoints`):**
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/model/Player.java` lines 411-426:
  ```java
  public void calcPoints(Shop shop) {
      this.landPoints = 0;
      this.goodsPoints = 0;
      for (PlanetTile planetTile : this.ownedTiles) {
          this.landPoints += GameData.data.pointsPerLand;
          Factory factory = planetTile.getFactory();
          if (factory == null) continue;
          this.goodsPoints += GameData.data.pointsPerMule;
          this.goodsPoints += factory.getResource().equipmentCost;
      }
      this.goodsPoints += this.food * shop.getPrice(Resource.Food);
      this.goodsPoints += this.energy * shop.getPrice(Resource.Energy);
      this.goodsPoints += this.smithore * shop.getPrice(Resource.Smithore);
      this.goodsPoints += this.crystite * shop.getPrice(Resource.Crystite);
      this.points = this.money + this.landPoints + this.goodsPoints;
  }
  ```
  Two independent terms, not one combined term: `pointsPerLand` (500, `GameData.java` line 44) is
  added once per owned tile UNCONDITIONALLY (every plot the player owns, whether or not it carries a
  M.U.L.E.); `pointsPerMule` (35, `GameData.java` line 45) plus that tile's `Factory`'s
  `Resource.equipmentCost` is added only when `getFactory()` is non-null (an installed, outfitted
  M.U.L.E.). `equipmentCost` per resource (`Resource.java` lines 10-13, sourced from `GameData.java`
  lines 37-43) is food $25, energy $50, smithore $75, crystite $100 -- exactly this project's existing
  `OUTFIT_COST` table (see constants.ts; no value changed, only the source citation was tightened).
  Goods are valued at `shop.getPrice(resource)`, the store's live central price
  (`ResourcePrices.price`, this project's `StoreState.prices`) -- NOT the buy or sell quote, and not a
  static table.
- **This project's implementation:** `scoring.ts` `computePlayerBreakdown` does one pass over the
  board per player, adding `LAND_VALUE_PER_PLOT` (500) for every owned plot regardless of
  `muleOutfit`, then `POINTS_PER_MULE` (35, new constant) plus `OUTFIT_COST[plot.muleOutfit]` only
  when `plot.muleOutfit !== null`, then goods valued at `state.store.prices[resource]` (previously the
  static `STORE_BASE_PRICE` table -- this is the "at current prices" fix the exit criteria calls for).
  `LAND_VALUE_PER_PLOT` (500) and `OUTFIT_COST` (25/50/75/100) both already matched PM exactly before
  this workstream (their prior doc comments cited planetmule.com/how-to-play and C64-Wiki, not the
  Java directly); only `POINTS_PER_MULE` is a newly added constant and only the goods-pricing source
  (dynamic `state.store.prices` vs. the static table) is a behavior change. `ScoringPayload` gained a
  `breakdowns: readonly ScoreBreakdown[]` field (`money`/`landValue`/`muleValue`/`goodsValue`/`total`
  per player) so the UI can render a score breakdown without recomputing it.
- **Reason chosen:** direct Java read, unambiguous; the plan's compressed phrasing is not itself
  wrong once "per-plot" and "per-mule" are read as the two separate terms they are in the source
  (the parenthetical actually describes the mule term: `pointsPerMule + outfit price`, applied "per
  mule," not "per plot").

## Colony failure: food-production gate (M9, WS-E-endgame)

- **Chosen value (verified directly, including an apparent PM source quirk):**
  `OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/controller/phase/SummaryPhase2.java`
  `checkShortageMessage` (lines 116-152) and `checkNoProduction` (lines 155-168):
  ```java
  private void checkShortageMessage() {
      if (this.model.isLastRound()) { this.shortageMessage = null; return; }
      ...
      if (n == 0 && this.checkNoProduction(Resource.Food)) { this.colonyFailed = true; ... }
      if (n2 == 0 && this.checkNoProduction(Resource.Energy)) { this.colonyFailed = true; ... }
      ...
  }
  private boolean checkNoProduction(Resource resource) {
      boolean bl = true;
      for (Player player : this.model.getPlayers()) {
          for (PlanetTile planetTile : player.getOwnedTiles()) {
              Factory factory = planetTile.getFactory();
              if (factory == null || factory.getResource() != Resource.Food) continue;
              bl = false; break;
          }
          if (bl) continue;
          break;
      }
      return bl;
  }
  ```
  Two things worth recording precisely:
  1. **The check never runs on the game's final round.** `checkShortageMessage` returns immediately
     (leaving `colonyFailed` at whatever it already was, always still `false` by construction -- if it
     had ever been set `true` in an earlier round the game would already have ended) when
     `isLastRound()`, so a colony can only fail mid-game, never on the round that would end the game
     anyway.
  2. **`checkNoProduction`'s `resource` parameter is never read inside the method body -- both call
     sites (food-shortage and energy-shortage) gate on the SAME hardcoded literal,
     `Resource.Food`.** This reads as an unintentional source bug (the natural per-resource design
     would compare `factory.getResource() != resource`), but it is unambiguous in the decompiled
     bytecode: `checkNoProduction(Resource.Energy)` still only asks "does any player own a food
     tile?", not "does any player own an energy tile?". Nothing in `mule_document.html`, the C64
     disassembly, or `OTHER_REPOS/TSavo-mule-game/reference/*.md` documents an intentional
     food-only design rationale for the energy branch, and no method-inlining explanation applies
     (the two call sites pass different `Resource` literals, so javac cannot have constant-folded a
     single specialization).
- **Reason chosen (literal, quirk and all):** per this document's authority order, PM is the primary,
  directly-verified source, and this project's emulation target is PM's actual compiled behavior, not
  a "corrected" reading of what the source probably meant. A player playing PM today experiences this
  exact gate. Implementing the "sensible" per-resource alternative instead would be an undocumented,
  untraceable design substitution -- exactly what "fix the design, not the symptom" warns against when
  there is no actual local bug to fix, only an upstream one this project chooses to reproduce for
  fidelity. The quirk is called out explicitly here (and in `scoring.ts`'s doc comments) precisely so
  it reads as "verified, not overlooked" to a future maintainer.
- **This project's implementation:** `scoring.ts` `checkColonyFailure(state)` returns
  `{ failed: false, message: null }` immediately when `state.round >= ROUND_COUNT_BY_MODE[state.mode]`
  (the final-round skip). Otherwise it sums `state.store.stock.food` plus every player's
  `goods.food` into `totalFood` (same for energy), and calls a private `anyFoodMuleInstalled(state)`
  helper (true iff any plot anywhere on the board has `muleOutfit === "food"`) for BOTH the food and
  energy branches, matching the literal Java. `COLONY_FAILURE_MESSAGE_FOOD` / `_ENERGY` (constants.ts)
  carry the exact PM shortage strings (`SummaryPhase2.java` lines 135, 140). `turn.ts`'s
  `endAuctionGood` calls this after the round's last auction (energy -- the last good in
  `AUCTION_GOOD_ORDER`, smithore -> crystite -> food -> energy, immediately before summary) and, on failure, skips
  `advanceToNextRound` and goes straight to `enterScoring`, exactly like the final-round path.

## First Founder and colony rating: only awarded on survival (M9, WS-E-endgame)

- **Chosen value (verified directly):** `SummaryPhase2.SummaryListener.summaryFinished()`
  (`SummaryPhase2.java` lines 296-326) branches `if (colonyFailed) { ...shortage message only... }
  else if (model.isGameOver()) { ...First Founder + getColonyMessage()... } else { ...continue
  prompt... }`. Since `isGameOver()` is `isLastRound() || colonyFailed`, the middle branch (First
  Founder awarded to `getPlayersInRankOrder().get(0)`, and the colony-rating message shown) can only
  fire when `isLastRound()` is true AND `colonyFailed` is false -- a failed colony never sees a First
  Founder or a rating message, only the shortage/failure text. The colony-rating formula and its 7
  message tiers are already adjudicated above ("Colony rating: Planet M.U.L.E. formula vs 1983"); this
  entry only records when First Founder applies.
- **This project's implementation:** `scoring.ts` `buildScoringPayload` computes `colonyRatingTier`/
  `colonyRatingMessage` unconditionally (the formula is well-defined either way, and costs nothing to
  compute), but sets `firstFounderId` to `null` whenever `checkColonyFailure` reports `failed`, and to
  `state.players[winnerIndex].id` otherwise. Because this engine's `enterScoring` is reached only at
  true game end (final round or colony failure -- see the previous section), "not failed" and
  "colony survived to the end" are the same condition here, so no extra `isLastRound` check is needed
  at the payload level. `winnerIndex` (and therefore rank-1) already ties-break by lowest player id,
  matching PM's `Player.OrderByPoints` (`Player.java` lines 594-611) exactly -- see the pre-existing
  `computeWinnerIndex` doc comment, unchanged by this workstream.

## M9 balance sim record (WS-E-endgame, informational)

`tests/e2e/e2e_balance_sim.mjs` gained two report-only (non-gate) metrics: colony success rate
(`1 - colonyFailed` share of terminated games) and a colony-rating tier histogram (`ratingTiers[0-6]`,
tallied only for surviving games, since PM never rates a failed colony). Over 30 seeds per mode:
beginner 96.7% success (29/30, tiers `[0,16,13,0,0,0,0]`, clustering tiers 1-2), standard 96.7% success
(29/30, tiers `[0,29,0,0,0,0,0]`, entirely tier 1). Every existing gate held unchanged (both modes:
0.0%/0.4% dead-window rates, 100% mid-game land clear rate, 30/30 games terminated, zero negative-money
games), and the one colony-failure-per-mode confirms the check fires under real AI-vs-AI play rather
than being unreachable dead code. These numbers are the explicit M10 baseline input the plan calls
for when it sets the final colony-rating pass band; they are not a gate in this workstream.

## Land grant: engine-driven sweep cursor (M9, WS-U-polish)

- **Verified:** planet_mule's `LandGrant` model (`LandGrant.java`) snapshots every free (non-shop,
  unowned) tile into `freeTiles` once at round start, then `LandGrantPhase` (`LandGrantPhase.java`)
  walks a single shared cursor forward through that list one tile at a time, dwelling on each for
  `GameData.landGrantPlotDuration` (18 frames at `Properties.framesPerSecond` = 60fps, i.e. 300ms) --
  any player may press their action button during that dwell window, and `checkDone` (lines 281-315)
  grants the tile to whichever presser is worst-ranked (`player2.getRank() < player.getRank()` keeps
  the already-selected, higher/worse rank number rather than replacing it), giving trailing players
  priority when multiple players want the same tile. This is the real-time simultaneous presentation
  this project's `land_grant.ts` module doc already flagged as deferred ("The original game's
  simultaneous land lottery moves to a future fidelity plan").
- **Chosen value (this project's adaptation):** rather than the full simultaneous-multiplayer redesign
  (which would also touch the turn-sequential picker order `land_ai.ts` and every existing land-grant
  test depend on), this engine keeps `pickOrder`/`pickIndex`/`currentPicker` exactly as before (one
  active picker at a time) and layers the sweep cursor purely on top: `LandGrantPayload` gains
  `sweepRow`/`sweepCol`, seeded at round start to the first free plot in raster order
  (`land_grant.ts` `createLandGrantPayload`/`firstFreePlot`) and advanced by one free plot per `tick`
  action while the phase is active (`advanceSweepCursor`, wrapping; `turn.ts` `applyTick`'s
  `land_grant` branch). The new `claim_current_plot` action (`turn.ts` `applyClaimCurrentPlot`) claims
  whichever plot the cursor currently sits on for the current picker; `claim_plot` (explicit row/col)
  is unchanged and stays the path `land_ai.ts` and every existing engine test use. The UI-side dwell
  cadence (`LAND_GRANT_SWEEP_TICK_MS` in `scene_manager.ts`) is set to 300ms, matching PM's measured
  18-frame/60fps dwell exactly.
- **Collision rule, implemented but not yet reachable in play:** `land_grant.ts`'s
  `worstRankedClaimant` implements PM's worst-rank-wins tie-break (via `rankOrder` from `events.ts`,
  which already mirrors `Player.OrderByPoints`) as a pure, independently unit-tested function. Because
  this engine's land-grant round stays turn-sequential, `applyClaimCurrentPlot` only ever calls it
  with a single candidate (the current picker) today -- a genuine multi-candidate collision cannot
  occur under this architecture, so the rule is exercised directly by
  `tests/test_turn.mjs` ("worstRankedClaimant picks the lowest-scoring candidate...") rather than
  through the reducer. This keeps the door open for the still-deferred simultaneous-picking mode to
  reuse the same tie-break without re-deriving it.

## AI personalities (M11, WS-AI-personas)

- **Not PM-sourced:** planet_mule's AI has no notion of named personalities -- its heuristics are
  a single undifferentiated opponent. This is this project's own design element, layered on top of
  the existing develop/land/auction heuristics as parameter sets, not new decision branches. See
  `src/ai/personas.ts`'s module doc comment for the full design rationale.
- **Three profiles, as parameter deltas over `BASELINE_PERSONA_PARAMS` (`src/ai/personas.ts`):**
  - `land_baron`: `landBidFactor` 1.03 (bids a little harder for land), otherwise neutral. An
    early draft used 1.25; the 120-seed release run below showed that factor pushed the
    personality's standard-mode win rate above the fair band's ceiling, so it was sim-tuned down
    to 1.03.
  - `ore_speculator`: `resourceWeight` 1.3 on smithore and crystite (weighs them above baseline in
    the develop-phase scarcest-resource pick and the crystite-vs-scarcest outfit comparison,
    `develop_ai.ts`'s `scarcestResource`), `assayRichSurplusFactor` 0.8 (assays a plot a little
    sooner once rich) -- deliberately gentler than the M10 all-AI crystite-scout experiment (see
    "M10 balance sim record" above) that weakened colony robustness, since here at most one of
    three AI seats carries this bias in a given game.
  - `farmer`: `resourceWeight` 1.3 food / 1.15 energy (weighs the two consumables above baseline),
    `landBidFactor` 0.94 (bids softer for land), `auctionBuyerLimitFactor` 0.95 (buys more
    cautiously at auction, scaling the buyer's price ceiling) -- a risk-averse,
    production-focused identity.
  - Every persona factor layers on top of (never replaces) the personality-independent mechanics:
    the M10 rank-aware land-bid dampening (`LAND_BID_RANK_FACTORS` in `land_ai.ts`), and the
    develop/auction money reserves, the land-auction reserve, and the "never overpay versus the
    store" ceiling all stay identical for every player regardless of personality.
- **Assignment design and replay-safety:** `personalityForPlayer(state, playerId)` is a pure
  function of `(state.seed, playerId)` only -- no `GameState` field, no RNG stream consumed or
  advanced, so it can be called any number of times, in any order, from any decision function, and
  always agrees. This gives the workstream's required property directly: the same seed always
  assigns the same personalities (replay-safe), with no dependency on evaluation order. The human
  seat (`Player.isHuman`) is excluded by construction (`personalityForPlayer` returns `null`
  whenever `player.isHuman` is true), so a human player is never parameterized. See
  `tests/test_personas.mjs` for the determinism, human-exclusion, and full-coverage assertions.
- **Fair-band decision (M11 release gate, `tests/e2e/e2e_balance_sim.mjs`):** each personality's
  standard-mode win rate must land in 15-35%, centered on the M10 baseline's ~25%-per-seat spread
  (see "M10 balance sim record" above) with the same roughly +/- 10-point headroom the colony pass
  band uses, to absorb seed-set noise and each personality's deliberate bid/preference deltas while
  still catching a personality that meaningfully dominates or underperforms. Enforced at 100+
  seeds, standard mode only (matching the plan's "100+ seeded 12-round sims" gate scoping already
  used by the round-6-leader, four-goods, and colony-band gates).
- **120-seed release run (standard mode, current tuning):** `land_baron` 37/120 = 30.8%,
  `ore_speculator` 34/122 = 27.9%, `farmer` 24/118 = 20.3% -- all three inside the 15-35% band.
  Every always-on and 12-round release gate passed alongside it (colony success 96.7% in both
  modes, standard round-6-leader win 38.8%, standard median good trades food 7 / energy 8 /
  smithore 25.5, crystite median 1 reported). Full command:
  `node --import tsx tests/e2e/e2e_balance_sim.mjs 120`.
