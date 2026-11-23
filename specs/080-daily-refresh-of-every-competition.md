# 080 — Daily refresh of every competition

## Summary

Once a day, at 03:00 UTC, every competition's current season is fetched from
its provider and stored, so the readers that never open a competition page —
Arvauspeli, the predictions log and the settling of guesses — see fixtures and
results the provider added or moved, without waiting for someone to open that
page. Decided on #815.

## Scope

### In scope

- A daily step that refreshes the current season of every competition: the 14
  domestic ones (matches and group tables) and the 10 football-data ones
  (matches).
- It runs inside the hourly `predictions` run that starts at 03:00 UTC, before
  that run's own refresh of matches near kickoff.
- `npm run predictions -- refresh`, which runs the daily step alone: for
  staging, where nothing scheduled runs, and for a day whose 03:00 run failed.

### Out of scope

- Making pages read-only, or a sub-hourly scheduled sync (#815 decided against
  both).
- Everything on the national-team pages (`/maajoukkueet`): Huuhkajat and
  Helmarit from TASO, and the World Cup and the Euro (`WC`, `EC`) from
  football-data. Nothing reads their matches without opening the page, and
  their pages refresh as today.
- Past seasons. They were backfilled and do not change.
- Any change to the page refresh (15 minutes) or to the hourly refresh of
  matches near kickoff.
- The hourly cron's football-data coverage: #829.

## Settled decisions

| Decision | Settled |
|---|---|
| National-team pages are not refreshed daily: Huuhkajat and Helmarit, and by the same reason the World Cup and the Euro | Miikka, 2026-11-23 |
| The step runs at 03:00 UTC (05:00 Finnish time in winter, 06:00 in summer) | Miikka, 2026-11-23 |
| A football-data season the provider has published but not started is refreshed too, so "current" means the newest season the provider has published, as it already does for TASO | Miikka, 2026-11-23 |
| Pages keep their 15-minute refresh, the hourly near-kickoff refresh stays, past seasons are never fetched | #815, 2026-11-21 |

## UX / UI (Finnish strings)

None. Nothing on a page changes. A reader sees the difference only as fixtures
and results being stored without a page visit: in Arvauspeli, the predictions
log, and a competition page opened for the first time that day.

## API & Data

What a competition's "current season" is:

| Provider | Competitions | Current season | Refreshed |
|---|---|---|---|
| TASO | VL, M1L, M1, M2, NL, N1, P21SM, P211, P18SM, T18SM, MSC, NSC, LC, M1LCUP (`DOMESTIC_COMPETITIONS`) | the newest season TASO lists, found as a domestic page finds it (`resolveTasoSeasonContext`) | its matches (`taso_matches`), and the group tables its standings page shows (`taso_group_teams`, `taso_group_zones`), through the same calls the pages make |
| football-data | PL, ELC, FL1, BL1, SA, DED, PPL, PD, BSA, CL (`SUPPORTED_COMPETITIONS` whose region is `foreign`; the predicted ones) | the active season (the newest started, as the pages read it), and the upcoming season when the competition response lists one | its matches (`matches`) |

- **The pages' own refresh path, not a new one.** Each season is refreshed
  through the functions a page visit uses, with the refreshed season as the
  active one, so the rule is theirs: fetched when nothing is stored or the
  stored rows are 15 minutes old or more, and written by the same sync. After a
  day, every season is older than that.
- **Caching:** unchanged. Requests go through the existing 15-minute Redis
  response cache and the 15-minute season-context cache, so a season a page or
  the hourly run fetched in the last 15 minutes is not fetched again.
- Endpoints: TASO's competition listing (season discovery), season matches and
  group standings; football-data's `/competitions/{code}` and
  `/competitions/{code}/matches?season={year}`. All already used.

## Edge Cases

- **One competition fails to refresh** (provider error, timeout, TASO 403): its
  stored rows stay as they are, the other competitions are still refreshed, it
  is named in the run's failures, and the run exits non-zero so Railway marks
  it failed. The rest of the hourly run (settling, predictions) still runs.
- **TASO's season discovery fails:** the season is resolved as a page resolves
  it then (the newest stored season), that season is refreshed, and the
  competition is named in the run's failures.
- **TASO lists a new season with no matches yet:** that season is fetched and
  stores nothing. It is not a failure, and the season before it is not fetched:
  it is past.
- **football-data lists no upcoming season:** only the active one is fetched.
- **A competition between seasons** (the Finnish season in winter): its current
  season is finished, and is fetched anyway. One call, and nothing changes.
- **The 03:00 run does not start, or fails before the step:** that day has no
  daily refresh. Nothing catches up on its own; the next day's run covers it,
  and `npm run predictions -- refresh` runs it by hand.
- **A run at any other hour** does not run the step, including a run started
  by hand with `-- log`.
- **A page syncs the same season at the same moment:** the same overlap two
  page views can have today, handled as it is today (the season lock of
  `decisions/871-season-sync-lock.md` for group rows). Nothing new.
- **A match the provider removed:** stays stored, as with every sync today (the
  sync deletes none).

## Performance & Limits

- Per competition, at most three TASO calls (discovery, matches, group tables)
  or three football-data calls (competition, active and upcoming season
  matches): at most 42 TASO and 30 football-data calls a day. At the pacers'
  rates (`src/lib/providers/pacer.ts`: TASO 60/min, football-data 9/min), about
  45 s and 3½ min at worst. Usually fewer, because cached responses are reused
  and there is an upcoming season only between seasons.
- The step shares the hourly run's pacers, so it and the near-kickoff refresh
  together never exceed either provider's rate. That is why it is a step of the
  hourly run rather than a second cron service: two processes would each pace
  only themselves.
- The 03:00 run takes a few minutes longer than other hours', well inside the
  hour.

## Security & Secrets

No new variables. The step uses what the `predictions` service already holds:
`DATABASE_URL`, `REDIS_URL`, `TASO_API_KEY`, `TASO_HASH_SALT` and
`FOOTBALL_DATA_API_KEY`. Production only; on staging, only by hand.

## Logging

- **Each run of the step:** one `info` line, `Daily refresh finished`, with the
  number of competition-seasons refreshed and each failure as `source`, `code`
  and `seasonId`. This is the record of the shared data it changes; it acts for
  no person, so it has no user id.
- **Each failure:** the `warn` lines the pages' refresh already writes (`TASO
  refresh failed; using stored matches`, `TASO group refresh failed; falling
  back to stored group standings`, `Competition refresh failed; using stored
  matches`) stay as they are, and the run's printed summary gains one line
  per failure, `Failed       daily <source> <code> <season>`.
- **The run's printed summary** gains `Daily        <n> competition-season(s)
  refreshed` on the 03:00 run and on `-- refresh`.
- No personal data: the step handles none.
- Where it goes: the `predictions` service logs to Axiom, as the hourly run
  does (`docs/infrastructure.md`, Observability).

## Acceptance Criteria

- [ ] The hourly run that starts at 03:00 UTC refreshes the current season of all 14 domestic competitions (matches and group tables) and all 10 football-data competitions (matches), Liigacup and Ykkösliigacup included, before its own near-kickoff refresh
- [ ] A football-data competition's upcoming season is refreshed when the provider lists one
- [ ] A fixture stored only at the provider is in the database after the next daily run, with no page visited
- [ ] A run at any other hour does not run the daily step
- [ ] `npm run predictions -- refresh` runs the daily step alone, and prints and exits as the hourly run does
- [ ] One competition failing leaves its stored rows, the others are still refreshed, the run names it and exits non-zero
- [ ] Pages still refresh the current season they show when its stored rows are 15 minutes old, as today
- [ ] The hourly refresh of matches near kickoff is unchanged
- [ ] Past seasons and the national-team pages' competitions (Huuhkajat, Helmarit, WC, EC) are not fetched by the step
- [ ] Each run of the step logs `Daily refresh finished` with its counts and failures, ids only
- [ ] `docs/infrastructure.md` (the predictions cron) describes the daily step and the `refresh` command

## Tests Required

- `tests/unit/lib/predictions/daily-refresh.test.ts`: every domestic and
  football-data competition is visited once; the upcoming season only when
  listed; Huuhkajat, Helmarit, WC and EC never; a failing competition does not stop the rest
  and is named; a season with no matches is not a failure.
- `tests/unit/lib/predictions/prediction-log-service.test.ts`: the step runs
  when the run's clock is in hour 03 UTC and not at 02 or 04, and before the
  near-kickoff refresh.
- `tests/unit/scripts/predictions/predictions-plan.test.ts`: `refresh` parses,
  is in the usage, and its summary and exit code.
- `tests/integration/daily-refresh.test.ts`: with the providers stubbed, a
  fixture only at the provider is stored for a TASO and a football-data
  competition; a past season's rows are untouched; rows refreshed in the last
  15 minutes are not fetched again.

## Files To Update

- `specs/080-daily-refresh-of-every-competition.md`
- `src/lib/predictions/` (the step, and the hourly run calling it)
- `scripts/predictions/predictions.ts`, `scripts/predictions/predictions-plan.ts`
  (the `refresh` command)
- `docs/infrastructure.md` (the predictions cron section)
- `decisions/080-daily-refresh-of-every-competition.md` (by the implementing
  agent)
- No `.env.example` change, no Railway schedule change.

## Open Questions

None. Proposed in this draft, not yet confirmed: running the step inside the
03:00 hourly run rather than as a cron service of its own, and the `refresh`
command for staging and missed days.
