# Reference repos reading guide

`OTHER_REPOS/` holds local-only reference material for the M.U.L.E. original-fidelity upgrade
(gitignored; see the `.gitignore` entry added alongside this doc). Treat everything under it as
data to extract rules and formulas from, never as code to copy. Every rule this project
implements is recorded with its source in [RULE_SOURCES.md](RULE_SOURCES.md); this doc is the
map for finding that source material.

## planet_mule (primary rule authority)

`OTHER_REPOS/planet_mule/data_decompiled/` is a CFR-decompiled Java tree of Turborilla's
licensed 2009 remake, Planet M.U.L.E. -- the emulation target for this project's values,
behaviors, and modern presentation. Package root: `com.turborilla.mule`.

### Layout

- `com/turborilla/mule/GameData.java` -- the single tunables file. Every gameplay constant (round
  scaling, starting resources, store prices, timers, event chances, land auction pricing) lives
  here as a public field with a literal default, loaded into the static `GameData.data` instance.
  Start every constant-verification task here first: search this file for the field name before
  looking anywhere else.
- `com/turborilla/mule/Properties.java` and `PropertiesBase.java` -- runtime/session
  configuration (feature flags like `enableHiring`, `easyToCatchWampus`, network/debug settings),
  not gameplay tuning. Do not confuse these with `GameData.java`.
- `com/turborilla/mule/model/` -- the game rules themselves, one class per system:
  - `ResourcePrices.java` -- per-resource buy/sell/price math (`calcFoodPrice`,
    `calcEnergyPrice`, `calcSmithorePrice`, `calcCrystitePrice`), each backed by a `GameData`
    field for its clamp range and buy/sell spread.
  - `Shop.java` -- store state (stock counts, mule count, mule build/price), plus
    `calcBuySellPrice` which computes the supply/demand ratio fed into `ResourcePrices` for each
    resource, and `buildMules` (smithore-to-mule conversion).
  - `PlayerEventGenerator.java` -- the ~22 personal event pool, per-turn 27.5% roll
    (`GameData.data.playerEventChance`), rank-gating (never to rank 1 for good events, never to
    the bottom two ranks for bad events), and the `25 * (round/4 + 1)` event-amount multiplier.
  - `ColonyEventGenerator.java` -- the pre-shuffled 20-slot colony event deck (`generate()`),
    weighted event pool by type.
  - `PlotSeller.java` -- land auction pricing (`beginAuction`, `finishAuction`) and the colony
    auction probability table (`colonyAuctionProbabilities`).
  - `Wampus.java` -- bounty formula (constructor, `moneyReward` field), blink/appear timing,
    mountain-tile tracking.
  - `Development.java` -- per-round turn order (`setPlayerOrder`, reversed when store mules
    `<= 7`) and the develop-phase player iteration state machine.
  - `Player.java` -- per-player state including `calcPoints` (end-of-game scoring: land points,
    goods points, mule outfit cost) and `calcProduction` (production formula entry point).
  - `GameModel.java` -- top-level game state and round orchestration; `calcColonyTotal` (sums
    player points for the colony score) and the pub-gambling payout formula live here.
  - `model/map/PlanetMapGenerator.java` -- terrain layout generation: river placement, mountain
    tier counts (`GameData.data.minNumMountain1` etc.), water/desert tile counts.
  - `model/map/PlanetTile.java`, `model/map/Factory.java`, `model/map/Building.java` -- per-tile
    state including crystite deposit fields.
  - `controller/phase/SummaryPhase2.java` -- end-of-game colony rating (`getColonyMessage`,
    `20000 * lastRound / 12` scaling) and the seven Federation outcome messages.

### How to verify a constant

1. Grep `GameData.java` for the field name (for example `grep -n "developmentPubRoundBonus"
   OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/GameData.java`). This gives the
   literal default value.
2. Grep the `model/` tree for every place that field is read (for example `grep -rn
   "developmentPubRoundBonus" OTHER_REPOS/planet_mule/data_decompiled/com/turborilla/mule/`) to
   find the formula that consumes it, not just the raw number.
3. Read the consuming method in full; decompiled code uses obfuscated single-letter local
   variable names (`n`, `n2`, `f`, `bl`), so trace them by data flow rather than trusting names.
4. Record the file path, method name, and line range in `docs/RULE_SOURCES.md` when the rule is
   implemented, not just the constant's numeric value.

## Kroah 1983 decompilation doc + disassembly (heritage cross-check)

`OTHER_REPOS/mule_document.html` is Kroah's M.U.L.E. decompilation document v0.41 (2009), a
reverse-engineering writeup of the original 1983 Atari 800 binary. It is a saved static HTML
page; read it by stripping tags (a quick Python script with `re.sub("<[^>]+>", " ", text)` works
for spot checks) or open it in a browser. `OTHER_REPOS/MULE-assembly/MULE-Disassembled_Memory.asm`
is the companion annotated 6502 disassembly (about 50,000 lines), with human-readable labels for
most routines and variables.

### BTU / PTU / ATU / CTU

The doc's time-unit glossary (its "Time unit" section) defines four nested units used throughout
its formulas:

- **BTU (Base Time Unit)**: the game's internal tick, 4 jiffies (`1/15s` on NTSC, the doc's
  reference system).
- **PTU (Player Time Unit)**: the per-pixel rate of a human player's turn timer, `7 BTU` by
  default, modified by race (Flapper +2 BTU, Human -2 BTU) and level (Beginner +2 BTU). Used for
  turn time, wampus initial delay, and wampus movement.
- **ATU (Auction Time Unit)**: analogous timing unit for the goods-auction phase.
- **CTU (Cursor Time Unit)**: analogous timing unit for the land-grant cursor sweep.

When a formula in the doc is expressed "in BTU" or "in PTU", convert using the ratios above
before comparing it to this project's tick-based timers (`src/engine/constants.ts` documents
each tick constant's own conversion where relevant).

### How to grep the labeled disassembly

The `.asm` file carries meaningful labels for the routines the plan's key-formulas summary names.
Useful anchors:

```bash
grep -n "goodsPrice" OTHER_REPOS/MULE-assembly/MULE-Disassembled_Memory.asm       # store pricing routine and its operand table
grep -n "calcMuleReq" OTHER_REPOS/MULE-assembly/MULE-Disassembled_Memory.asm      # mule-requirement calculation (function start at "calcMuleReq:")
grep -n "roundEventsProb" OTHER_REPOS/MULE-assembly/MULE-Disassembled_Memory.asm  # per-event round probability counters (init + decrement/increment)
grep -n "wampusTime" OTHER_REPOS/MULE-assembly/MULE-Disassembled_Memory.asm       # wampus appearance/blink countdown
```

Each hit includes a line number and a short inline comment (often in French, machine-translated
comments are common throughout the file); read a window of surrounding lines with the Read tool
rather than trusting the label name alone, since 6502 disassembly labels mark the *start* of a
routine, not every line that uses the value.

## TSavo-mule-game (audit cross-check only)

`OTHER_REPOS/TSavo-mule-game/` is a full TypeScript M.U.L.E. implementation with its own
decompiled-Java audit notes under `reference/*.md`:

- `reference/MECHANICS-AUDIT.md` and `reference/MECHANICS-AUDIT-V2.md` -- itemized deviations
  between TSavo's own implementation and its transcription of the PM Java, organized
  Critical/Major/Minor. `MECHANICS-AUDIT-V2.md` self-reports 30 total unfixed issues (10
  Critical, 8 Major, 12 Minor) against TSavo's own game, which is why this project treats
  TSavo's *implementation* as untrustworthy and its `reference/*.md` audit *prose* as
  cross-check-only, one step below the primary planet_mule source.
- `reference/TIMING-REFERENCE.md`, `reference/PHASES-ANALYSIS.md`, `reference/AUCTION-ANALYSIS.md`
  -- narrower transcriptions of specific systems (timing constants, phase state machines, auction
  flow). Known caveat: the pub payout table in these files is transcribed incorrectly (see
  [RULE_SOURCES.md](RULE_SOURCES.md#pub-payout-array-tsavo-transcription-error) for the verified
  correction); treat any numeric table in these files as a lead to re-verify against
  `planet_mule/data_decompiled/`, not as a trusted final value.

Do not read TSavo's actual TypeScript source (`src/` or similar) for implementation ideas; the
audit docs above already establish it as unreliable, and this project writes fresh TypeScript
from the extracted rules regardless.

## mule_rules.md (prose companion)

`OTHER_REPOS/mule_rules.md` is a saved MediaWiki-formatted prose writeup (C64-Wiki style) of the
1983 game: mode descriptions (Beginner/Standard/Tournament), the species list with starting-money
handicaps, the full personal-event message list, global/colony event descriptions, and the
score-computing thresholds table. It has no source code and no line-precise formulas; use it for
narrative rules text, event flavor text, and the few numeric tables it does carry (species
handicaps, colony score thresholds), cross-checked against the primary Java or disassembly before
relying on a number from it alone.

## Everything else in OTHER_REPOS/

- `repos.txt` -- a plain list of the original repo URLs this material was pulled from; useful for
  re-cloning a fresh copy if a citation needs re-verification against upstream.
- `mule.nes` (referenced by the plan, gitignored alongside `OTHER_REPOS/`) -- an NES ROM, not a
  reference this project reads directly.
