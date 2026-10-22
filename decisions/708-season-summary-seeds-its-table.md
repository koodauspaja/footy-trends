# 708 — Kausi lyhyesti's end-to-end club is placed by seeded rows only: decisions

Bug #708. v1.19.0's release run failed "with three sentences" and "links the
upset" in `tests/e2e/season-summary.spec.ts`. This overrides
`decisions/070-season-summary-position.md`, "The end-to-end club", where it
counted on the real Premier League 2023/24 rows to give decisions/066's club,
E2E Kausi, an unfavourable place. On an empty database, as in CI's release run,
2023/24 held only the four seeded clubs, E2E Kausi was 1st, "Paras sijoitus
tallennetuilla kausilla: 1." ranked first, and the upset dropped out of the three.
Local runs passed because the test database holds those real rows.

| Decision | Why |
|---|---|
| Three seeded clubs, E2E Kärki 1 to 3, win all ten of their 2023/24 matches against a fourth, E2E Pohja | They put E2E Kausi 4th in 2023/24 with no real club stored. Its earlier seasons rank it 3rd or 4th among the four seeded clubs, so 4th is never a best: the place is a worst or no fact, and ranks after the three favourable facts either way. With the real clubs stored it is lower still. E2E Nolla's 2023/24 place falls below theirs too, so its worst stands. |
| Ten rounds, matchdays 1 to 10 | A season's length is its highest stored matchday (`seasonLength`), so the comparison point stays the season's end on an empty database. |
| Measured on 2026-10-23 with `E2E_TASO_STUB=1` | On a new database, `footy-trends_708_test`: both tests pass; before the change, on `footy-trends_707_test`, both failed as in CI. On the test database's stand-in, which holds the 20 real clubs: all ten tests pass. |
| "Shows no block for a cup season" and "on a national team's pages" are left as they are | They read live football-data seasons, as about ten other specs do, and pass in the full run that fetches them. Run alone on an empty database they find no team. That is the suite's, not this bug's. |
