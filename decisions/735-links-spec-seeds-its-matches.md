# 735 — The links spec reads only data that stays put: decisions

Chore #735. v1.20.0's release run failed "underlines an upcoming match's link in
the colour of the text around it", in both schemes, in
`tests/e2e/links-and-switches.spec.ts`. The spec, from
`decisions/701-links-and-switches.md`, opened `/kotimaa/ottelu/4353547`, a real
Veikkausliiga 2026 match. A match page shows `Ennuste`, and in it the link the
test looks for, only while the match is upcoming (`baselineCompetition`), so
once the match was played the link was gone, and the test could not pass again.
This overrides 701 only in which pages its rows open. It changes this spec alone: other specs that open current-season pages are not part of it.

| Decision | Why |
|---|---|
| The upcoming match is seeded by the spec, in 2099, with ids of its own (`999_735_…`), and deleted after it | The suite reads live TASO data, and a real match's status changes. `home-baseline.spec.ts` and `rivalry-prediction.spec.ts` seed theirs in 2099 for the same reason |
| The standings row opens Veikkausliiga 2017, and the played match is that season's second final leg, `9900302` | Miikka in chat on 2026-10-25: an e2e test must not read the current season's data, because its matches change. The 2017 season is seeded before every run (`decisions/304-test-database.md`) and never refetched. The final leg has two earlier meetings, so its page offers `Kaikki kohtaamiset` |
| No model cache is dropped after seeding | A league match is predicted whether or not its sides are rated (`predictsSides`), and the home-win baseline counts finished matches only, which the seeded 2017 season supplies on any database |
| The team page row, Premier League 2024, stays live | A finished season: its rows no longer change |
| Verified by CI's end-to-end job, not a local run | Agreed with Miikka in chat on 2026-10-25 |
