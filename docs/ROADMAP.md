# Roadmap

Planned work for this M.U.L.E. engine, in priority order, plus what stays
intentionally out of scope. See [CHANGELOG.md](CHANGELOG.md) for what has
already shipped and [TODO.md](TODO.md) for the smaller task backlog.

## Near term

- Auction seller-out-of-goods store fallback: when a human or AI seller runs
  out of a good mid-auction, decide whether the store should step in as a
  fallback counterparty rather than leaving the window to time out. See
  [TODO.md](TODO.md).
- Walk-speed tuning: raise `WALKER_SPEED_PX_PER_SEC` from 80 toward 120-160
  px/s so a food-starved develop turn can reach a far-corner plot within the
  starved-minimum tick budget. Recorded as a live-timing recommendation, not
  yet applied. See
  [active_plans/audits/mule_trip_timing.md](active_plans/audits/mule_trip_timing.md).
- Release cut: bump `VERSION` (CalVer) and cut the first tagged release now
  that the M1-M11 fidelity plan's gates are green. Human decision, not yet
  made. See [archive/mule_fidelity_plan.md](archive/mule_fidelity_plan.md).

## Later

- Sound and music: a separate pass with its own asset pipeline, deliberately
  excluded from the fidelity plan so it could ship a finished game first. See
  [archive/mule_fidelity_plan.md](archive/mule_fidelity_plan.md).
- Species handicaps as a data toggle: the 1983 starting-money handicaps
  (Flapper $1600, Humanoid $600) and PTU speed modifiers are recorded but
  unused; species stay cosmetic at flat $1000 until this toggle is built. See
  [RULE_SOURCES.md](RULE_SOURCES.md).
- Tournament ruleset as a data toggle: the 1983 tournament deltas (higher
  variance amplitude, pirates steal all crystite, AI +$200 starting money)
  are recorded but unimplemented. See [RULE_SOURCES.md](RULE_SOURCES.md).

## Explicitly out of scope

- Multiple human players (hotseat or online): the driver, auction, and
  develop flows assume 1 human plus 3 AI; multiplayer would change the
  interaction model, not the rules.
- Lab items (Depot, Water Tank, Mining Tower, Power Plant) and the hireling
  system: Planet M.U.L.E. additions beyond the 1983 ruleset this project
  targets.
- Deserts and player-to-player land selling: Planet M.U.L.E. toggles beyond
  the 1983 game.
