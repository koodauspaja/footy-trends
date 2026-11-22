# 868 — e2e tests never use the newest season as an example: decisions

Chore #868, from #865. A test tied to the newest season passes on the stand-in, whose data is frozen, and fails in the release run, which reads real TASO. Veikkausliiga 2026's forecast lost its labels when the season ended, and the release run went red. `tests/e2e/README.md` now states the rule.

| Decision | Why |
|---|---|
| **A test that needs some season names a finished one the stand-in serves; one about what exists only in the season in progress seeds it** (`decisions/867-e2e-forecasts-seed-their-season.md`); **only a test about the default leaves out `kausi`** | The newest season is the one that changes under a test: it moves mid-season, finishes, and is overtaken when TASO lists the next |
| **The specs that name `kausi=2026` keep it** | TASO's newest is 2027, so 2026 is finished and its data no longer changes. The stand-in serves Liigacup only for 2023 and 2026, and Ykkösliigacup only for 2026, so another year would need new fixtures for no gain |
| **The specs that open a page without `kausi` keep doing so** | They test the default season itself, or `Tämä kausi`, which only the active season has. Since `decisions/865-active-season-has-matches.md` the default is always a season with matches |
| **The rule is written down, not checked** | A check would have to tell "the newest season" apart from a finished one by year, and the year moves. The README is where someone writing an e2e test reads how the suite works |
