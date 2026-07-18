# Alien art program status

Written 2026-07-16. Stock-take of the whole alien-art effort -- assets, tooling, proven
knowledge, and open decisions -- requested before choosing a direction for the next round.
No recommendation is made here; this is the inventory the decision gets made FROM.

## The goal (unchanged)

Replace the 16 string-built 32x32 square sprites in `src/ui/sprites/sprites_species.ts` with an
editable SVG cast (eight species + mule, 2 frames each, tall 5:8 aspect), art as source of truth,
TypeScript generated from it. The human is the taste authority; bake-offs exist to give that
authority real alternatives to choose among. Pipeline is vector end to end: SVG symbols are
inlined and drawn by the browser at draw size; no raster step ships.

## Settled inputs (stable, no reopening proposed)

- Eight species identities plus mule; species stay cosmetic (no rule effects).
- Canvas `0 0 200 320` tall (mule `0 0 320 200` wide); fill band 160 wide after the 40-unit halo.
- `currentColor` body tint; four player hexes; three canonical backgrounds from `palette.ts`.
- Two frames per species; frame 2 must change the outline.
- Style target: the three `2D-Shape-Aliens*.jpg` root sheets (still UNTRACKED in git -- the
  program's primary reference is not in version control).

## Proven knowledge (survives any restyle; provenance in linked reports)

1. The complementary double stroke (bone halo + dark keyline) is what makes the ENTIRE palette
   visible on all three backgrounds -- three of four player colors are ~1.0:1 against terrain by
   fill alone. Not a green-only fix. ([alien_bakeoff_evidence.md](alien_bakeoff_evidence.md))
2. Eyes drawn as light shapes with dark pupils survive small sizes; eyes drawn in keyline ink
   vanish. Full-body faces do NOT survive 18 px regardless; the head-crop symbol does. (Round 1
   verdict; confirmed in all four round-3 casts.)
3. Geometry arithmetic on the 160-unit band: a lateral air gap costs `2x(40+26)=132` beside the
   part; repeated-feature spacing must exceed feature width + 40 (nothing under ~90 is safe);
   four separated limbs cannot fit (224 > 160). Discovered by round-3 artist_2's self-rejection
   pass, now partially encoded in the contract. (2026-07-12 changelog.)
4. Mechtron-vs-leggite confusion (unsolved in all five round-1 sets, IoU 0.71-0.86) is SOLVED by
   the contract's numeric wedge (mass >= 96 wide vs <= 60): all four round-3 casts separate them
   in silhouette. ([alien_cast3_round3_verdict.md](alien_cast3_round3_verdict.md))
5. Canvas coverage of human-approved art sits ~72-84 percent; proposed floor ~70, ceiling ~85.
   ([alien_canvas_coverage.md](alien_canvas_coverage.md))
6. THE CONVERGENCE LESSON, twice over: AI artist lanes do not diverge by being given freedom.
   Round 1 diverged (five visibly different systems) with a loose brief that FORCED each lane to
   name its own hypothesis. Round 2 converged with freedom (every lane drew the same archetype
   per slot). Round 3 converged by construction (the contract answers every creative question;
   four near-identical spheroids). A future round produces choice only if divergence is
   ENGINEERED -- assigned, named, mutually exclusive aesthetic directions -- with the contract
   stripped back to technical schema + separability.
7. Numeric metrics mislead when unattended: IoU inverted the round-1 truth on two candidates;
   `diagnostics.json` colour-share was 41 percent zeros. Numbers are advisory beside the eye.
   ([alien_bakeoff_evidence.md](alien_bakeoff_evidence.md), "Where the numbers misled".)

## Art assets on disk

| Asset | What it is | Status |
| --- | --- | --- |
| `devel/alien_bakeoff/set_1..5/` | Round 1: 3 seed species x 5 blind artists | Kept as evidence. set_5 is the human-approved exemplar the contract points at; the blind report's "candidate_alpha" label mapping was per-run and is not durably recorded |
| `devel/alien_cast/artist_1..5/` | Round 2: 8 species x 5 artists | Failed (same body plan everywhere); triggered the contract's BODY PLAN section |
| `devel/alien_cast3/artist_{1,2,4,5}/` | Round 3: 9 creatures x 4 artists (artist_3 never delivered) | All 32 species files lint clean; casts converge on one design. Advisory verdict: [alien_cast3_round3_verdict.md](alien_cast3_round3_verdict.md) (graded execution; the headline is convergence, and the pick is the human's, not the report's) |
| `art/aliens/humanoid.svg`, `gollumer.svg` | The only production-slot art | Committed with the round-3 work (b9d6f6e); 2 of 9 slots filled |
| `devel/alien_wide_candidates/`, `alien_species_concept_board.svg` | Pre-plan studies | Superseded; plan schedules deletion at close-out |
| `2D-Shape-Aliens*.jpg` (repo root) | Style reference | UNTRACKED |

## Review surfaces (new this week)

- PNG contact sheets (raster): `output_smoke/aliens_cast3/sheets/`.
- Pure-SVG boards (preferred -- vector, zoomable, no raster in pipeline):
  `output_smoke/aliens_cast3/sheets_svg/` -- `cast_<artist>.svg` large per-artist boards,
  `board_silhouettes/full/green_terrain.svg` cross-artist grids, `species_<name>.svg` deep dives.
  Built by `bakeoff/build_alien_cast3_boards.py`; the corresponding combined-file splitter is
  `bakeoff/split_alien_cast3.py`. Round 4 uses `bakeoff/build_alien_cast4_boards.py` and
  `bakeoff/validate_alien_cast4.sh`.

## Tooling and gates

| Tool | State | Known gaps |
| --- | --- | --- |
| `devel/render_alien_sheet.mjs` | Works; 2640 cells/cast | Ladder is 18/32/44/64; contract's judging ladder says 24/32/68/90 |
| `devel/measure_alien_art.py` | Works | `diagnostics.json` lacks candidate attribution; exact-match colour test broken (round-1 finding) |
| `devel/lint_alien_svg.py` | Works; proven on 32 files | NO MULE MODE: contract-conforming mules fail 5 violations; blocks clean full-cast lint |
| `tests/test_alien_svg_lint.mjs` | Fast-lane gate over `art/aliens/` | Covers only the 2 existing files |
| `tests/e2e/e2e_alien_contact_sheet.mjs` | Capture driver | Reads `art/aliens/` only, so currently 2 species |
| `devel/build_species_sprites.py` + `tests/test_species_sprites_fresh.mjs` | Generator + staleness test exist | Staleness test errors under bare `node --test` (extensionless `./palette` import needs the tsx loader); cannot gate until fixed or invoked correctly |

## What the game actually draws today

The OLD hand-authored `sprites_species.ts` (square 32x32, pre-contract keyline system). None of
the bake-off art -- three rounds, ~30 casts of creatures -- has reached the running game. M5
(generate, wire, resize consumers) has not started; it is gated on a chosen, complete cast.

## Docs and their drift

- [../../ALIEN_ART_CONTRACT.md](../../ALIEN_ART_CONTRACT.md): the production spec. Very tight --
  tight enough that it now prevents bake-offs from producing alternatives (proven knowledge #6).
  Fine as an EXECUTION spec; wrong as an EXPLORATION brief.
- Plan of record (`pure-bouncing-lobster` / [../../archive/new_aliens_plan.md](../../archive/new_aliens_plan.md)):
  stale. Specifies M3 as four 2-species production lanes into `art/aliens/`; rounds 2-3
  (full-cast competitive bake-offs) are not reflected. The plan's "eight body-shape families
  (triangle/star/hexagon... from the reference JPGs)" open question was never executed -- every
  cast to date is one rounded-blob shape language, which is a candidate root cause of "round 3
  looks like round 2".
- Round reports: [alien_bakeoff_evidence.md](alien_bakeoff_evidence.md) (round 1, solid),
  [alien_cast3_round3_verdict.md](alien_cast3_round3_verdict.md) (round 3, advisory),
  [alien_canvas_coverage.md](alien_canvas_coverage.md) (coverage floor/ceiling evidence).

## Open decisions (the actual fork)

1. AESTHETIC DIRECTION -- the big one. Three live options, mutually exclusive as a next step:
   accept the converged cute-rounded design and move to promotion + execution; run a
   forced-divergence round 4 (assigned, named directions; minimal technical contract); or step
   back to the reference JPGs and settle the shape-family system with the human first.
2. If the converged design is accepted: which cast/grafts promote into `art/aliens/` (the round-3
   verdict's artist_2 + artist_4 grafts is one advisory answer).
3. Squat-species sizing: height-scaled drawing makes a contract-conforming packer paint far fewer
   pixels than a humanoid at equal draw height. Accept as character or size by box.
4. Ladder unification: renderer 18/32/44/64 vs contract 24/32/68/90.
5. Lint mule mode (wide canvas, no head) -- needed before any full-cast gate.
6. Staleness-test invocation fix -- needed before the generated-file protection means anything.
7. Plan refresh or formal supersession note, so the plan of record matches reality.
8. Track the reference JPGs (or record why not).
9. artist_3's empty slot: refill only if a specific species still needs alternatives.

## Related docs

- [alien_bakeoff_evidence.md](alien_bakeoff_evidence.md)
- [alien_cast3_round3_verdict.md](alien_cast3_round3_verdict.md)
- [alien_canvas_coverage.md](alien_canvas_coverage.md)
- [../../ALIEN_ART_CONTRACT.md](../../ALIEN_ART_CONTRACT.md)
