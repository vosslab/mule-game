# Related projects

## Confirmed related projects

### M.U.L.E. (1983, Ozark Softscape / Electronic Arts)
- Relationship: prior art or inspiration
- Link: https://en.wikipedia.org/wiki/M.U.L.E.
- Evidence: `README.md` states this repo is "a browser remake of the 1983
  economic strategy classic's core loop", naming the original game directly.
- Notes: original design source for the land grant, develop, production, and
  auction phase structure this repo implements.

### Planet M.U.L.E.
- Relationship: same problem domain, independent implementation
- Link: https://www.planetmule.com/
- Evidence: a free, actively maintained remake of the 1983 game for Windows,
  Linux, and macOS, developed as a tribute to the original Ozark Softscape
  designers; same source material and core-loop scope as this repo.
- Notes: adds online multiplayer via a hosted master server; a heavier,
  longer-running project than this repo's single-player-vs-AI v1 scope.

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

## Possible related projects

### eric108/MULE
- Relationship: same problem domain, independent implementation
- Link: https://github.com/eric108/MULE
- Evidence: repository name and topic match the original game; scope and
  activity level not confirmed beyond the repo listing itself.
- Confidence: low

### osgameclones.com M.U.L.E. entry
- Relationship: same problem domain, independent implementation
- Link: https://osgameclones.com/
- Evidence: the Open Source Game Clones directory catalogs M.U.L.E. remakes
  and clones alongside other classic-game reimplementations; a discovery
  index rather than a single project.
- Confidence: low

## Evidence notes

Repo evidence (`README.md`) names the 1983 M.U.L.E. original as the direct
inspiration; no `package.json` dependency, badge, or doc referenced any other
project by name, so all entries above came from bounded web search rather
than in-repo citations. Two search rounds covered: (1) named candidates
supplied for this task (Planet M.U.L.E., M.U.L.E. Returns, open-source
clones), and (2) a widening pass on "M.U.L.E. open source clone GitHub" that
surfaced `LionsPhil/mewl`, `eric108/MULE`, and the osgameclones directory.
M.U.L.E. Online and a dedicated "World of M.U.L.E." wiki were searched but not
independently confirmed as separate, currently reachable projects within this
bounded pass; the closest fan-community source found was the Carpe Ludum /
Eidolon's Inn "World of M.U.L.E." remakes page
(https://www.carpeludum.com/modern-remakes-of-m-u-l-e/), used only to
cross-check the Planet M.U.L.E. entry above, not written up as its own entry
since it is a community page rather than a project.
