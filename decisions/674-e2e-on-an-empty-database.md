# 674 — The end-to-end suite passes on an empty database with the TASO stand-in: decisions

Chore #674, the follow-up `decisions/672-e2e-without-the-provider.md` left. With
`E2E_TASO_STUB=1` the suite passed on a developer's machine only because the
league and cup specs read rows earlier live runs had stored. On an empty test
database, as in CI's release run, they still needed TASO, which refuses our
requests since 2026-10-15.

## Measured before

2026-10-19, `E2E_TASO_STUB=1`, a new database `footy-trends_674_test` (its name
ends in `_test`, which the e2e sign-in flag needs; #672's first count used one
that did not) and an empty Redis database: **49 of 397 failed**, in 18 files,
every one on a domestic page. `cup-domestic` 11, `domestic-standings` 7,
`head-to-head` 6, `domestic-team` 4, `bogey-teams` 3, then 18 more across
`team-page-fold`, `league-position`, `home-advantage`, `favourites`,
`cup-analytics`, `surprise`, `home-baseline`, `home-away`, `goals-trend`,
`goals-per-game`, `form-trend`, `domestic-matches` and `clean-sheets`.

## Decisions

| Decision | Why |
|---|---|
| The domestic answers are recorded from the TASO rows the test database holds, turned back into TASO's response shape by `scripts/record-taso-fixture.ts` (`npm run test:e2e:record-taso`) and its tested half `record-taso-fixture-plan.ts` | TASO cannot be asked, and those rows are what earlier live runs stored from its answers, so the pages show what the provider made them show. A script, not a one-off transform, so the fixture can be recorded again when a spec needs more. It reads the database in one read-only, repeatable-read transaction, so a refresh between reads cannot mix two versions of a season; writes only the fixture, through a temporary file of its own renamed over it and removed if the write fails, so neither an interrupted run nor two at once leave a broken file; and refuses a recording with no matches, which would otherwise replace the fixture with an empty one. |
| The fixture is gzipped: `tests/e2e/fixtures/taso-domestic.json.gz`, about 115 KB | Decided by Miikka, 2026-10-19. As JSON it is about 2 MB, against Sourcery's 300 000-character cap per pull request and a 2 500 000-character weekly budget; Sourcery would have skipped the whole pull request. The code that writes it and reads it is reviewed instead. |
| Recorded: every row outside the national-team buckets, in seasons 2015 to the current year, except Veikkausliiga 2017 and any match an e2e spec seeded, whose ids start at 999 000 000 | The national-team buckets have their own fixture, a season outside that range is an integration test's leftover, and 2017 is seeded by `global-setup.ts`; replaying it too would be a second source for the same season. A spec's seeded match is removed by the spec, but one interrupted mid-run leaves it, and `surprise.spec.ts` seeds into 2016, inside the range (Sourcery on #679). 3 408 matches, 2 183 group rows, 60 zones, from `footy-trends_test` on 2026-10-19, stored by live runs between 2026-09-30 and 2026-10-15. |
| A category's matches are recorded when it has stored matches, and its groups when it has stored group rows or zones; the other list is left unrecorded, so the stand-in refuses it | Sourcery on #679: nothing shows TASO answered the missing list with an empty one, and an empty group answer would make `synchronizeGroupTeams` delete stored rows. One category is affected, Suomen Cup 2026, with 83 matches and no group rows; its page falls back to no group rows, as it would have stored. |
| Category names come from the `taso:categories:<competition>` entries development's Redis still held for a recorded competition: `spljp15`, `spljp19` to `spljp22`, `spljp24`, `spljp25` and `Liigacup23`. An entry that is not a JSON object of names stops the recording, naming the entry; an empty set of names is not recorded; where Redis no longer holds an entry, the names of the fixture being replaced are kept; and the names are kept as own keys, `__proto__` included | They exist nowhere else, and a past season's names do not change, so an entry expiring from Redis is no reason to lose them. Where none is held, `getCategories` is refused and a page shows the configured name, as it does whenever TASO cannot be asked; an empty set would instead be answered as TASO naming nothing. The checks, because the cache is outside the recorder's control and a malformed entry would otherwise be replayed as names (Sourcery on #679, for `__proto__`). |
| Kickoffs are recorded in UTC with a `+0000` offset, a group's `group_type` is left out, a group's teams keep the order they were stored in, and a zone level outside 1 to 10 stops the recording | The first two read back to the stored row: `normalizeTasoMatch` takes the offset as given, and `group_type` only decides a log line. A round trip through the app's normalisers is unit tested. Storage order is TASO's, since each sync deletes a season's rows and inserts them as TASO sent them, and the page keeps it for teams sharing a standing (Sourcery on #679). A level outside the ten TASO sends could not be written into `next_stage_levels` faithfully. |
| The stand-in answers `getCompetitions` with the eight whole seasons recorded, `spljp15` the oldest and `spljp26` the newest, all published | Refused, season discovery fell back to the newest stored season, which on an empty database is the seeded 2017, and the Veikkausliiga pages opened on it. The current season is therefore 2026 for as long as this fixture is the one recorded. |
| `getMatches` and `getCategory` answer what is recorded for the competition and category asked, without first requiring the competition's names | The 2026 seasons have matches recorded but no names. |
| Every national-team category listed carries its own match list, an empty one included, and nothing unrecorded is answered | Sourcery on #673: a listed category without an entry was answered with an empty list, which `loadSeasonMatches` trusts over stored rows. Refusing those categories instead would have dropped their years from `getNationalTeamYears`, so the 206 empty lists are now written out, and a unit test holds the national-team fixture to listing exactly what it records. |
| Ids are looked up as the fixture's own properties | Sourcery on #673: `constructor` was accepted as a competition id. |
| `E2E_PORT`, `E2E_TASO_PORT` and `E2E_REDIS_PORT` are read by one function, `e2ePort`, which stops the run on anything but a whole number from 1 to 65535 | Sourcery on #679: a port goes into a command Playwright runs through a shell (`webServer.command` is a string), so shell syntax in the variable would run. `E2E_PORT` had the same path before this pull request. |
| `testDatabaseUrl` and `databaseNameFor` name only the host in their errors, not the connection string | Sourcery on #679: the recorder prints such an error, and the string carries the password. The other scripts already describe a database by host and name. |
| With the stand-in on, Playwright starts a Redis container of the run's own (`docker run --rm`, the image `docker-compose.yml` runs, nothing saved to disk, port 6380 or `E2E_REDIS_PORT`, bound to `127.0.0.1`) and points the whole run at it; it is stopped with SIGTERM, which `docker run` passes on, so Docker removes it | Decided by Miikka, 2026-10-19, for Sourcery's finding on #673 that the stand-in's answers and the provider's shared cache keys: a cache of its own, empty for each run. Overrides the paragraph in `decisions/672-e2e-without-the-provider.md` that says the suite's Redis is the one `npm run dev` uses. A container rather than a database of the shared Redis emptied before each run, which this pull request first did: emptying a shared database deletes whatever else is in it, which Sourcery rated critical on #679, and a marker could not tell the run's keys from keys written after it. A container is empty when it starts and gone when it stops, so nothing is ever deleted. The whole run, not only the server, because five specs drop cache keys themselves (`home-baseline`, `prediction-quality`, `rivalry-prediction`, `season-simulation`, `season-summary`). Two runs at once fail loudly on the port, as they already do on 3001. The container's port is read only when the stand-in is on, so `E2E_REDIS_PORT` cannot stop a live run, and its start-up allows 180 seconds, room for a first pull of the image. An empty cache also means football-data.org is asked afresh on every stand-in run, as on a first run against a new Redis; every stand-in run measured here passed, serial as the suite always is. |

## Measured after

2026-10-20, on the same empty database with `E2E_TASO_STUB=1`, rebased onto
#662's merge: **405 of 405 passed**, in 4.1 minutes. During the run a
`redis:8-alpine` container was bound to `127.0.0.1:6380`; none remained after.
Sentinel keys planted in development's Redis databases 0 and 15 survived, and
database 0 held the same 16 keys before and after.

## Corrects `decisions/666-taso-fixtures-cleared-file-wide.md`

That record says the left-behind `VL` / `spljp99` / 901102 group rows made e2e
read 901102 as Veikkausliiga's current season, unconditionally. Measured later,
that holds only when TASO cannot be asked for the current season: the rows count
as the newest stored season, which `resolveTasoSeasonCeiling` falls back to
(`discovered.season ?? newestStored`). On 2026-10-15, with TASO refusing, e2e
opened `/kotimaa/sarjataulukko` on 901102 and 14 domestic specs timed out; with
TASO answering, or its answer still cached, the same rows changed nothing (a
later `npm run verify` that day passed the domestic specs with them present). It
mattered here because the stand-in refused `getCompetitions`, so every run with
`E2E_TASO_STUB=1` took that fallback; answering it removes the fallback from
these runs.

## What this does not do

- `release.yml` still runs against TASO. Turning the stand-in on there is a
  decision of its own.
- The recording is fixed at what was stored on 2026-10-19. A spec that needs a
  season or a match it lacks fails with the stand-in on until the fixture is
  recorded again from a database that holds it.
