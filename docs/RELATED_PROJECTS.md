# Related projects

## Confirmed related projects

### M.U.L.E. (1983, Ozark Softscape / Electronic Arts)
- Relationship: prior art or inspiration
- Link: https://en.wikipedia.org/wiki/M.U.L.E.
- Evidence: `README.md` states this repo is "a browser remake of the 1983
  economic strategy classic's core loop", naming the original game directly.
- Notes: original design source for the land grant, develop, production, and
  auction phase structure this repo implements.

### Planet M.U.L.E. (Turborilla, 2009)
- Relationship: prior art or inspiration
- Link: https://www.planetmule.com/
- Evidence: [docs/REFERENCE_REPOS.md](REFERENCE_REPOS.md#planet_mule-primary-rule-authority)
  documents a locally held (gitignored) CFR-decompiled Java tree of this
  licensed remake (`com.turborilla.mule`) as "the emulation target for this
  project's values, behaviors, and modern presentation" -- this project's
  primary rule-and-formula source (see [docs/RULE_SOURCES.md](RULE_SOURCES.md)),
  not just an independent same-domain remake.
- Notes: see [docs/REFERENCE_REPOS.md](REFERENCE_REPOS.md#planet_mule-primary-rule-authority)
  for the file-by-file reference-material map; that doc owns the detail, not
  this one. The live planetmule.com site adds online multiplayer via a
  hosted master server, a heavier, longer-running project than this repo's
  single-player-vs-AI v1 scope.

### M.U.L.E. Returns
- Relationship: replacement, competitor, or alternative
- Link: https://mulereturns.com/
- Evidence: a licensed iOS remake of the 1983 M.U.L.E. by Comma 8 Studios,
  funded via Kickstarter with the rights holders' involvement; same source
  game, different platform (mobile) and license status (proprietary).
- Notes: per its own site and press coverage (see
  [M.U.L.E. Returns on Wikipedia](https://en.wikipedia.org/wiki/M.U.L.E._Returns)),
  the mobile release has since been retired.

### LionsPhil/mewl
- Relationship: same problem domain, independent implementation
- Link: https://github.com/LionsPhil/mewl
- Evidence: GitHub repo description states it is an "open source remake of
  the classic multiplayer economic strategy game M.U.L.E.", explicitly
  incomplete.
- Notes: closest license-compatible sibling found (open source); useful as
  prior art for engine/reducer design even though development stalled.

### TSavo/mule-game
- Relationship: same problem domain, independent implementation (used as an
  audit cross-check source, not as reused code)
- Link: https://github.com/TSavo/mule-game
- Evidence: `OTHER_REPOS/repos.txt` records `git clone --depth 1
  https://github.com/TSavo/mule-game.git TSavo-mule-game`; the repo's own
  description reads "Web M.U.L.E. -- multiplayer economic strategy game
  faithful to the 1983 classic" and it is written primarily in TypeScript.
- Notes: see [docs/REFERENCE_REPOS.md](REFERENCE_REPOS.md#tsavo-mule-game-audit-cross-check-only).
  This project treats TSavo's own implementation as untrustworthy (its
  bundled `reference/MECHANICS-AUDIT-V2.md` self-reports 30 unfixed
  mechanics deviations against its own transcription of the Planet M.U.L.E.
  Java) and reads only its `reference/*.md` audit prose as a cross-check one
  step below the primary planet_mule source; TSavo's TypeScript source
  itself is not read for implementation ideas.

### Kroah's M.U.L.E. Reverse Engineering Page
- Relationship: prior art or inspiration (heritage cross-check source)
- Link: http://bringerp.free.fr/RE/Mule/reverseEngineering.php5
- Evidence: `OTHER_REPOS/repos.txt` records `wget
  http://bringerp.free.fr/RE/Mule/mule_document.html`, the saved
  decompilation document this project uses; [docs/REFERENCE_REPOS.md](REFERENCE_REPOS.md#kroah-1983-decompilation-doc--disassembly-heritage-cross-check)
  describes it as "Kroah's M.U.L.E. decompilation document v0.41 (2009), a
  reverse-engineering writeup of the original 1983 Atari 800 binary."
- Notes: see [docs/REFERENCE_REPOS.md](REFERENCE_REPOS.md#kroah-1983-decompilation-doc--disassembly-heritage-cross-check)
  for how this project uses the doc's BTU/PTU/ATU/CTU time-unit glossary and
  the companion annotated 6502 disassembly (`OTHER_REPOS/MULE-assembly/`).

## Possible related projects

### eric108/MULE
- Relationship: same problem domain, independent implementation
- Link: https://github.com/eric108/MULE
- Evidence: repository name and topic match the original game; scope and
  activity level not confirmed beyond the repo listing itself.
- Confidence: low

### nik0kin/mule
- Relationship: same problem domain, independent implementation
- Link: https://github.com/nik0kin/mule
- Evidence: repo description reads "Asynchronous Turn-Based Game Backend -
  WIP" for a game named `mule`; scope (backend service, work in progress)
  not independently confirmed as a full M.U.L.E. implementation.
- Confidence: low

### parasj/MULE
- Relationship: same problem domain, independent implementation
- Link: https://github.com/parasj/MULE
- Evidence: repo description reads "Reimplementation of multiplayer supply
  and demand game MULE"; activity level and completeness not confirmed
  beyond the repo listing itself.
- Confidence: low

### osgameclones.com M.U.L.E. entry
- Relationship: same problem domain, independent implementation
- Link: https://osgameclones.com/m-u-l-e/
- Evidence: the Open Source Game Clones directory catalogs M.U.L.E. remakes
  and clones alongside other classic-game reimplementations; a discovery
  index rather than a single project.
- Confidence: low

## Evidence notes

Repo evidence anchors the Confirmed tier directly: `README.md` names the
1983 M.U.L.E. original as the direct inspiration, `OTHER_REPOS/repos.txt`
records the exact clone/download commands for TSavo/mule-game and Kroah's
decompilation document, and `docs/REFERENCE_REPOS.md` documents the locally
held (gitignored) planet_mule decompiled Java tree and its role as this
project's primary rule authority. See
[docs/REFERENCE_REPOS.md](REFERENCE_REPOS.md) for the full local
reference-material map; entries above link to it rather than repeating its
file-by-file detail.

Two bounded web search rounds covered the Possible tier and confirmed the
external links above: (1) a seed round verifying Planet M.U.L.E., M.U.L.E.
Returns, Kroah's reverse-engineering page, and TSavo/mule-game's public
description; (2) a widening round on open-source M.U.L.E. remakes that
surfaced `LionsPhil/mewl`, `eric108/MULE`, `nik0kin/mule`, `parasj/MULE`,
and the osgameclones directory. M.U.L.E. Online and a dedicated "World of
M.U.L.E." wiki were searched but not independently confirmed as separate,
currently reachable projects within this bounded pass; the closest
fan-community source found was the Carpe Ludum / Eidolon's Inn "World of
M.U.L.E." remakes page
(https://www.carpeludum.com/modern-remakes-of-m-u-l-e/), used only to
cross-check the Planet M.U.L.E. entry above, not written up as its own
entry since it is a community page rather than a project.
</content>
