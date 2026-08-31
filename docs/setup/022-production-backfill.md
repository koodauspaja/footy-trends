# 022 — Backfilling production

## Goal
Fill the production database with the full history for every supported
competition, in one controlled run, rather than letting it fill in a page view
at a time as users happen to browse.

Run this **after** the first release has deployed. The deploy runs migrations as
its `preDeployCommand`, and the backfill assumes the schema already exists — it
neither creates nor migrates anything.

---

## Why do it at all

The app backfills lazily: whatever page someone opens, it fetches and stores.
That works, but on a cold production database the *first* visitor to every
competition-season pays provider latency, and production consumes provider
quota in proportion to traffic — which is harder to reason about than one run
you watched.

`needsRefresh` treats a season older than the active one as never needing a
refresh once stored, so this is a one-time cost rather than a recurring one.

---

## What it will do

| | Competitions | Competition-seasons | Requests | Rate | Time |
|---|---|---|---|---|---|
| football-data.org | 12 | 41 | 53 | 9/min | ~5.9 min |
| TASO | 13 | 138 | 276 | 60/min | ~4.6 min |
| **Total** | | **179** | **329** | | **~11 min** |

Those are the figures for a **first** run against an empty database. A re-run
skips what is already stored — see *If it fails partway* — and takes about three
minutes.

Measured, not estimated: a full run against a local database took **11.0 minutes**
with 0 failures. The football-data figure is lower than a naive
competitions×seasons count suggests, because `getSeasonContext` derives the
selectable seasons from the provider's own data — the Champions League offers
three, and the Euros one, not four each.

**football-data.org is capped at 9 requests/minute** — 90% of the documented 10
(`007-football-data-api.md`). The headroom is the point: pacing below the limit
is what stops a rate-limit response happening at all.

`fetchProviderJson` does have a **single** 429 retry, added in #197 — it reads
`Retry-After`, falls back to football-data.org's `X-RequestCounter-Reset`, waits
that out and tries once more. One retry, not a loop, so a provider that keeps
refusing surfaces as an error rather than stalling the run indefinitely.

That retry is a floor, not a licence to pace faster. It absorbs a single
collision. What defeats it is another consumer whose traffic, **added to this
run's**, crosses the per-key limit and keeps it crossed — the retry waits out
one counter reset and gives up, so the run starts failing competition-seasons.
A second consumer that is merely present, and quiet, costs nothing. This matters here because **the key is shared with
staging** (`021-production-environment.md`), so "another consumer" includes a
staging page view or somebody's local `npm run test:e2e`.

**TASO is paced at 1 request/second.** It publishes no rate limit, so there is
no maximum to take a percentage of. One per second is well below what a
`/kotimaa` page view already asks of it, so this is gentler than normal traffic
rather than a guess at a ceiling.

### What it deliberately does not fetch

TASO's category names (`getSeasonCategoryNames`) are **not** backfilled. They
live in a Redis cache with a TTL, not in a table, so there is nothing for a
database backfill to write. They repopulate on first use.

#169 counted those ~12 requests in its volume estimate; they are not made here,
which is why the run is a little shorter than that issue predicts.

---

## Step 1 — Get the production `DATABASE_URL`

Railway → `production` environment → the PostgreSQL service → **Variables** →
`DATABASE_URL`. Use the public connection string, not the internal one: the
internal host only resolves inside Railway's network.

Keep it out of `.env`. Pass it for the one command and let it leave your shell
history behind with it.

---

## Step 2 — Run it

```sh
DATABASE_URL='<production>' npm run backfill
```

The first thing it prints is the target, as host and database only — never the
credentials:

```
Target       <host>:5432/railway
Rates        football-data 9/min, TASO 60/min
```

**Read that line before walking away.** It is the only confirmation that the
run is pointed where you think.

`DATABASE_URL` must come from the environment. The value in `.env` is
deliberately ignored, so a forgotten variable cannot quietly backfill your local
database while you believe production is filling up.

---

## Step 3 — Starting from clean, if you need to

To guarantee nothing arrived by accident first — a visitor browsing during the
window between deploy and backfill, for instance:

```sh
DATABASE_URL='<production>' npm run backfill -- --reset=railway
```

`--reset` deletes every row in `matches`, `taso_matches` and `taso_group_teams`
before fetching. It requires the database name, and refuses if it does not
match:

```
Refusing to reset: --reset=footy-trends does not match the target database (railway)
```

That guard exists for one specific mistake: running `--reset` in a shell that
still has yesterday's `DATABASE_URL` exported. A flag alone would not catch it;
having to type the name does.

**Reset is opt-in on purpose.** If it happened on every run, a run that died at
minute nine would destroy its own work on restart.

---

## Step 4 — Watch it

One line per competition-season, to stdout:

```
=== football-data.org: 12 competitions ===
  PL 2026: 380 matches
  PL 2025: 380 matches
...
=== TASO: 13 competitions ===
  VL 2026: 245 matches, 12 group rows
```

Failures go to stderr and do not stop the run — one competition-season failing
should not cost you the other 178. Each is counted, and the exit code is
non-zero if any failed:

```
Finished in 11.3 min with 0 failure(s).
```

---

## Step 5 — Verify

```sh
psql '<production>' -c "
  SELECT 'matches' AS table, count(*), count(DISTINCT (competition_code, season_id)) AS comp_seasons FROM matches
  UNION ALL SELECT 'taso_matches', count(*), count(DISTINCT (competition_id, season_id)) FROM taso_matches
  UNION ALL SELECT 'taso_group_teams', count(*), count(DISTINCT (competition_id, season_id)) FROM taso_group_teams;"
```

Then open a standings page for an old season in production and confirm it
renders without waiting on a provider call.

---

## If it fails partway

**Just run it again, without `--reset`.** A re-run skips every competition-season
that already holds rows and is older than the season being played — the same
rule `needsRefresh` applies in normal operation, rather than a second notion of
"done" invented for this script.

Measured against a fully populated production database: **3.3 minutes instead of
11.2**, 153 competition-seasons skipped and 27 fetched. The 27 are the current
season, which is still changing and so is deliberately refreshed every time.

A season with no stored rows is always re-asked, including one that is genuinely
empty. That costs a single request, and it is the right way round: skipping a
season that had merely *failed* would leave a hole nothing later fills.

For TASO the matches and the group snapshot are asked about **separately**,
because they are separate writes. A season whose matches stored and whose groups
then failed retries only the groups; a single season-level check would see "it
has rows" and strand them for ever.

Do not re-run with `--reset` to "start clean" after a partial run — that throws
away good rows and buys nothing.

One asymmetry to know about on a re-run: match rows are upserted, but group
standings are replaced. `synchronizeGroupTeams` deletes a season's group rows
and reinserts whatever TASO just returned, deliberately — a team TASO no longer
ranks has to disappear. A *failed* request throws and leaves the stored rows
alone, but TASO answering with an empty group list is treated as an answer, and
that season's group rows go. Matches are unaffected either way.

| Failure | What it means |
|---|---|
| `password authentication failed` | The connection string is wrong, or you used the internal host from outside Railway |
| A `429` from football-data.org | Something else is using the same key — staging, a local `npm run test:e2e`, or another backfill. The key is shared between the two environments, the pacing's 10% headroom is gone the moment a second consumer appears, and `fetchProviderJson`'s single retry only absorbs one collision |
| Repeated TASO failures | Its key is scraped rather than issued (`020-taso-api-key.md`) and may have expired. Re-scrape, then re-run |

---

## Done when
- [x] The first release has deployed, so the schema exists — `v1.0.0`
- [x] The run reported the expected production host and database on its first line
- [x] It finished with **0 failures** — 11.2 minutes
- [x] `matches`, `taso_matches` and `taso_group_teams` all hold rows —
      13,857 / 20,378 / 8,180
- [x] A standings page for an old season renders in production without fetching
      match data — ~460ms on repeat requests. The first request to a given
      competition-season is ~6x slower, because TASO's category names live in a
      Redis cache a database backfill cannot fill; one slow request, once
- [x] The production `DATABASE_URL` is not left behind in `.env`

## Next
→ Nothing scheduled. This is a one-time operation; the app keeps the current
  season fresh on its own refresh interval.
