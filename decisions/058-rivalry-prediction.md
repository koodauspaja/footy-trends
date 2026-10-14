# 058 — The next meeting of a rivalry, predicted: decisions

Implementation notes for `specs/058-rivalry-prediction.md` (#480). The spec
says what is shown; this says how, and where the implementation had to decide
something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| The next-meeting read | `getNextMeeting(source, first, second, now)` in `match-service.ts`, beside the history read it mirrors: the pair either way round, `SCHEDULED` or `TIMED`, kickoff after `now`, the route's region, the earliest by kickoff then provider match id, one row | S1, S10. It answers a `StoredMatch`, the shape `baselineCompetition` and `Ennuste` already take, so nothing is converted on the way. |
| `now` | Passed in by the page, the same `Date` the form's three-year rule is given | One moment for the whole page, and a read a test can place in time. |
| A kickoff that has passed | Left out by the query, whatever its status says | S10. The following meeting is then simply the earliest row left. |
| The upcoming statuses | `UPCOMING_STATUSES`, exported from `home-baseline.ts`, read by the query and by `baselineCompetition` alike | One list. The query and the rule that decides whether a match is predicted cannot then disagree on what upcoming means. |
| Covered or not | `baselineCompetition` on the row the read returned, after the read | S2, S10: the next meeting is the one predicted, so a cup tie is found first and then given nothing. Filtering in the query would have skipped it for the later league meeting. |
| `Ennuste`'s body | `PredictionBody({ stored, competition })`, exported from `match-prediction.tsx`: the three reads, then the rows and lines. `MatchPrediction` is now its heading, its gate and that body | S3. The rivalry page draws the same component, so the two pages cannot differ in a row or a line. |
| The gate | Stays with the caller: `MatchPrediction` asks before it, and the rivalry page's `loadAnalysis` already has | S7. The rivalry page asks once for everything it shows a signed-in reader. |
| The link's address (S13) | `qualityHref(kind, "backtest", code)`, moved from the `/ennusteet` page's file to `prediction-quality.ts` with the competition's name beside it (`comparedCompetitionName`) | The page built these addresses for its own switches. `Ennuste` importing the page's file for one function would have pulled the charts in with it. |
| Which report the link opens | `Jälkikäteen lasketut`, with `tyyppi` written out | It is the page's default, and the one with matches in every competition; the address is the one the page's own competition links write. |
| The competition's code in the link | The one `baselineCompetition` answers | It is one of `COMPETITIONS`, which is what `/ennusteet` accepts as `kilpailu` (decisions/056), for both providers. |
| The new line (S14) | `MOVES_NOTE`, in the body, under the models' lines and above the rounding note | As the spec places it. In the body, so it is on both pages by construction. |
| The group's first line | `formatKickoff`, then ` · `, then the competition's name from its provider's registry | The match page's own formatter (spec). The name is the one `/ennusteet` shows for the same code. |
| The teams in the group | The stored fixture's own names through `teamDisplayName`, home first | As `Ennuste`'s lines name them under it. The page's heading keeps the URL's order. |
| The match's link | A plain `Link`, not `RowLink` | It is one link, not one per row of a list (decisions/489). |
| When groups are headed (S5) | Whenever the form or the next meeting is shown; the history alone stays unheaded | specs/047 S12 with a third group counted. A rivalry specs/047 S8 hides can now have two groups. |
| The TASO national-team routes | No next-meeting read at all | Scope. No model covers them, so the read could only ever be thrown away. |
| football-data's `/maajoukkueet` | The read is made, and `baselineCompetition` answers `null` | Its competitions are not in `COMPETITIONS`. No route is special-cased: if one is ever compared, the group appears. |
| A failed read (S12) | `{ status: "error" }` from the service, which logs `Unable to read the pair's next meeting` with the two ids; the page treats it as no group | As the history read beside it reports its own. |

## What this overrides

| Earlier record | What it said | Now |
|---|---|---|
| `decisions/054-prediction-quality.md`, `Ennuste`'s link | The link opens `/ennusteet` | It opens `/ennusteet` filtered to the match's competition (S13) |
| `decisions/047-rivalry-page.md`, heading levels | The groups appear only together, so the level is decided from whether there is form | The level is decided from whether the form or the next meeting is shown (S5) |

## What the tests prove, and how

- **Every mutation below was caught**, one row each, so the count is the
  table's length:

  | # | Mutation |
  |---|---|
  | 1 | TASO: a kickoff at this moment counts as upcoming |
  | 2 | TASO: any status counts as upcoming |
  | 3 | TASO: the latest meeting, not the earliest |
  | 4 | TASO: the higher id on a shared kickoff |
  | 5 | TASO: the bucket ignored |
  | 6 | TASO: only the first-named team at home |
  | 7 | football-data: a kickoff at this moment counts as upcoming |
  | 8 | football-data: any status counts as upcoming |
  | 9 | football-data: the latest meeting, not the earliest |
  | 10 | football-data: the higher id on a shared kickoff |
  | 11 | football-data: the region ignored |
  | 12 | football-data: only the first-named team at home |
  | 13 | A `TIMED` match not upcoming |
  | 14 | The failure logged without the team ids |
  | 15 | The failure not logged |
  | 16 | A failed read answered as no meeting |
  | 17 | A TASO row tagged as football-data's |
  | 18 | A football-data row tagged as TASO's |
  | 19 | `Ennuste`: the link unfiltered |
  | 20 | `Ennuste`: the link always under `Kotimaa` |
  | 21 | `Ennuste`: the link to `Ennakkoon tehdyt` |
  | 22 | `Ennuste`: the new line dropped |
  | 23 | `Ennuste`: the new line under the rounding note |
  | 24 | `Ennuste`: the new line reworded |
  | 25 | The body reading another competition than it is given |
  | 26 | The body reading its own gate |
  | 27 | The body under `Ennuste`'s heading |
  | 28 | Rivalry: the group only beside the form |
  | 29 | Rivalry: the group under the form |
  | 30 | Rivalry: a competition that is not covered predicted |
  | 31 | Rivalry: the next meeting read on a TASO national-team route |
  | 32 | Rivalry: the away side named first |
  | 33 | Rivalry: the match linked under `/kotimaa` on every route |
  | 34 | Rivalry: the match linked by its row id |
  | 35 | Rivalry: the competition named from the domestic registry |
  | 36 | Rivalry: the line without its competition |
  | 37 | Rivalry: the kickoff as the lists format it, without its time |
  | 38 | Rivalry: the next meeting asked as of another moment |
  | 39 | Rivalry: the next meeting asked of another pair |
  | 40 | Rivalry: the body given another competition |
  | 41 | Rivalry: the prediction left out of the group |
  | 42 | Rivalry: the group's heading reworded |

- **None survived.** 1 to 13 are caught by the integration tests, the rest by
  the unit tests.
- **Not mutated: the gate.** Signed out, `loadAnalysis` returns before any of
  its reads, as it did; the unit test and the end-to-end test both assert that
  no next meeting is read or shown.
- **Integration**, against Postgres: among a played meeting, one kicked off at
  the very moment asked about, a postponed one, another pair's, two sharing a
  kickoff and a later one, the lower id of the two; none when all are played
  or past; the club game and the national teams apart; football-data's region,
  with a World Cup meeting earlier than the league one.
- **End to end**, against a production build, on two pairs seeded with
  fixtures in 2099: the group first with its kickoff, competition and three
  rows; the match's link opening a page whose `Ennuste` has the same rows, the
  new line and the filtered link; the group's link opening `/ennusteet` on
  that competition; a pair whose next meeting is a Suomen Cup tie, with a
  league meeting after it, without the group; signed out, neither the group
  nor a model's name in the page.

- **An existing end-to-end test changed.** `head-to-head.spec.ts` asserted
  that FC Inter and AC Oulu's page has exactly the form and the history
  groups. The pair has a real fixture stored for part of the year, so it now
  sets `Seuraava kohtaaminen` aside before comparing.
- **By eye**: the group on a seeded pair's page and `Ennuste` on its match
  page, at 375 px and 1 280 px, light and dark, from the production build on
  the test database. No horizontal scroll at either width; the table, the
  five lines and the link fit a phone.

## Measured

On production, read-only, on 2026-10-12.

| The next-meeting read | In Postgres | Buffers |
|---|---|---|
| A Premier League pair | 0,08 ms | 11 |
| A Veikkausliiga pair | 0,10 ms | 19 |

It uses `matches_head_to_head_idx` and `taso_matches_head_to_head_idx`, twice
each, as the history read does. From a laptop the round trip was 33 ms, the
same as `select 1`: there is nothing for a cache to save (S11).

| Pairs | Kotimaa | Ulkomaat |
|---|---|---|
| With a head-to-head page | 6 991 | 3 046 |
| Of them, with a next meeting stored | 45 | 1 360 |
| Whose next meeting is not in a covered competition | 0 | 0 |
| Whose next meeting is a Champions League match | 0 | 18 |
| With a next meeting and a rivalry specs/047 S8 hides | 1 | 3 |
| With an upcoming meeting and no finished one, so no page (S15) | 3 | 307 |
| Days to the next meeting, median and most | 6 and 27 | 70 and 230 |

- **S10's first rule changes nothing today.** No domestic cup fixture is
  stored as upcoming, and every club competition football-data stores is a
  covered one. It will apply when a Liigacup or Suomen Cup tie is published
  ahead of a league meeting.
- **S10's second rule likewise.** Ten stored matches have an upcoming status
  and a kickoff in the past: three national-team matches from the last ten
  days and seven youth fixtures from 2019 to 2021. None is in a covered
  competition.
- **The domestic group is seasonal.** The last stored Veikkausliiga fixture is
  on 8 November 2026; after it no domestic pair has a next meeting until the
  2027 fixtures are stored.

A TASO category was counted as covered where the `predictions` table has rows
for it.
