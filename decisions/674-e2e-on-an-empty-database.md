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
| The domestic answers are recorded from the TASO rows the test database holds, turned back into TASO's response shape by `scripts/record-taso-fixture.ts` (`npm run test:e2e:record-taso`) and its tested half `record-taso-fixture-plan.ts` | TASO cannot be asked, and those rows are what earlier live runs stored from its answers, so the pages show what the provider made them show. A script, not a one-off transform, so the fixture can be recorded again when a spec needs more. It reads the database in one read-only, repeatable-read transaction, so a refresh between reads cannot mix two versions of a season; writes only the fixture, through a temporary file renamed over it; and refuses a recording with no matches, which would otherwise replace the fixture with an empty one. |
| The fixture is gzipped: `tests/e2e/fixtures/taso-domestic.json.gz`, 117 KB | Decided by Miikka, 2026-10-19. As JSON it is about 2 MB, against Sourcery's 300 000-character cap per pull request and a 2 500 000-character weekly budget; Sourcery would have skipped the whole pull request. The code that writes it and reads it is reviewed instead. |
| Recorded: every row outside the national-team buckets, in seasons 2015 to the current year, except Veikkausliiga 2017 and any match an e2e spec seeded, whose ids start at 999 000 000 | The national-team buckets have their own fixture, a season outside that range is an integration test's leftover, and 2017 is seeded by `global-setup.ts`; replaying it too would be a second source for the same season. A spec's seeded match is removed by the spec, but one interrupted mid-run leaves it, and `surprise.spec.ts` seeds into 2016, inside the range (Sourcery on #679). 3 408 matches, 2 183 group rows, 60 zones, from `footy-trends_test` on 2026-10-19, stored by live runs between 2026-09-30 and 2026-10-15. |
| A category's matches are recorded when it has stored matches, and its groups when it has stored group rows or zones; the other list is left unrecorded, so the stand-in refuses it | Sourcery on #679: nothing shows TASO answered the missing list with an empty one, and an empty group answer would make `synchronizeGroupTeams` delete stored rows. One category is affected, Suomen Cup 2026, with 83 matches and no group rows; its page falls back to no group rows, as it would have stored. |
| Category names come from the `taso:categories:<competition>` entries development's Redis still held for a recorded competition: `spljp15`, `spljp19` to `spljp22`, `spljp24`, `spljp25` and `Liigacup23` | They exist nowhere else. Where none is held, `getCategories` is refused and a page shows the configured name, as it does whenever TASO cannot be asked. |
| Kickoffs are recorded in UTC with a `+0000` offset, and a group's `group_type` is left out | Both read back to the stored row: `normalizeTasoMatch` takes the offset as given, and `group_type` only decides a log line. A round trip through the app's normalisers is unit tested. |
| The stand-in answers `getCompetitions` with the eight whole seasons recorded, `spljp15` the oldest and `spljp26` the newest, all published | Refused, season discovery fell back to the newest stored season, which on an empty database is the seeded 2017, and the Veikkausliiga pages opened on it. The current season is therefore 2026 for as long as this fixture is the one recorded. |
| `getMatches` and `getCategory` answer what is recorded for the competition and category asked, without first requiring the competition's names | The 2026 seasons have matches recorded but no names. |
| Every national-team category listed carries its own match list, an empty one included, and nothing unrecorded is answered | Sourcery on #673: a listed category without an entry was answered with an empty list, which `loadSeasonMatches` trusts over stored rows. Refusing those categories instead would have dropped their years from `getNationalTeamYears`, so the 206 empty lists are now written out, and a unit test holds the national-team fixture to listing exactly what it records. |
| Ids are looked up as the fixture's own properties | Sourcery on #673: `constructor` was accepted as a competition id. |
| With the stand-in on, the run uses Redis database 15, set for the whole run in `playwright.config.ts`, and `global-setup.ts` empties it first, when it is empty or holds the key an earlier such run left; anything else there stops the run | Decided by Miikka, 2026-10-19, for Sourcery's finding on #673 that the stand-in's answers and the provider's shared cache keys. Overrides the paragraph in `decisions/672-e2e-without-the-provider.md` that says the suite's Redis is the one `npm run dev` uses: development no longer reads fixture data, and no entry an earlier run cached decides a result. The whole run, not only the server, because four specs drop cache keys themselves (`home-baseline`, `prediction-quality`, `rivalry-prediction`, `season-simulation`). The marker, because Sourcery on #679 noted that emptying it unconditionally deletes whatever else the database holds. |

## Measured after

The same day, the same empty database and `E2E_TASO_STUB=1`: **397 of 397
passed**, in 4.1 minutes. Development's Redis held 15 keys before and after.

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
