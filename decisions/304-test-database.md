# 304 — A database of the suites' own: decisions

Implementation notes for #304. `skills/bug-workflow.md` asks for one of these
only when the fix involved a real tradeoff; this one did, three times.

## The bug was not where it looked

Six e2e tests failed on every clean database. The obvious reading — "the tests
need seeding" — was wrong twice over.

They failed because **the application had a regression**. #272 moved
`getSeasonGroups` from `getGroups` to `getCategory`, because TASO had started
refusing the first, and `getCategory` reports points for a cup's rounds.
`keepsATable` treats any group with points as a league table, so every round of
Suomen Cup rendered as a standings table, the bracket disappeared — it is built
from the groups that render as matches — and a `Kierros` selector appeared on a
page with no rounds to filter.

The tests were right. They had been green for the wrong reason: TASO was
refusing an endpoint, the app fell back to stored rows, and the missing standings
made every knockout group classify correctly by accident.

## Decisions taken while building

| Decision | Choice | Why |
|---|---|---|
| Where a cup's rounds are classified | `buildGroup`, on `isDomesticCup` | A cup's groups are rounds whatever the provider reports for them. Putting it in `keepsATable` instead would have made the rule "no points *or* a cup", which reads as a special case rather than as the thing it is. |
| Which database the suites use | `<name>_test`, derived from `DATABASE_URL` | Miikka's, and better than what I was doing: discipline about not depending on ambient data is a rule somebody has to keep, and a separate database is a fact. Derived rather than configured so an existing `.env` needs no edit; `TEST_DATABASE_URL` overrides where the derivation is wrong. |
| The e2e server | Its own, on port 3001, never reused | A server already listening was started by somebody else against the development database. Reusing it puts the suite back on exactly the data this separation removes. Port 3001 so `npm run dev` can keep running. |
| One season | Seeded, not fetched | The rendering rules these specs check depend on a shape no live season produces any more. Seeding is also the cheapest possible fetch: a completed season with stored rows is never refetched, so those pages make no provider request at all. |
| Locating groups in assertions | By heading, not `nth()` | Positional indexing is how the old assertions came to check the wrong table without anyone noticing — one group more or fewer and they silently retarget. |

## What review found, and the pattern in it

Five rounds, and worth recording honestly: **rounds two and three found defects in
code the earlier rounds had added**. Each round introduced another piece of I/O —
a wrapper script, a database helper, a seeder — and each brought its own
concurrency and portability surface.

| Round | Finding | Real? |
|---|---|---|
| 1 | Two suites racing to `create database`; the loser aborts | Yes — `42P04` is now caught, and only that code |
| 1 | A percent-encoded name created under its encoded spelling | Yes — `create database` takes an identifier, not a URL component |
| 2 | `node_modules/.bin/vitest` is a `.cmd` shim on Windows | Yes — the same trap `scripts/executable.ts` documents; the wrapper runs Node directly |
| 3 | Concurrent seeding still collides on a unique id | Yes, **and my first fix was insufficient** — see below |
| 3 | The PR template's spec and decision fields | Yes — this file, and the spec named in the PR |

**A transaction is not a lock.** The first attempt wrapped the seed in one
transaction and called the race fixed. It was not: two transactions can both
delete the fixture and both insert, and the second takes a duplicate-key error.
Atomicity makes each all-or-nothing; it does not make them take turns.
`pg_advisory_xact_lock` does, and is released with the transaction.

## Tests worth explaining

**One test proved nothing, and the mutation is what said so.** The
percent-encoding fix was first asserted through `testDatabaseUrl()` — that the
returned URL keeps its encoding. That passes with the decode removed, because
assigning a decoded name back to `pathname` re-encodes it. The two halves only
differ at the *identifier*, so the assertion moved to `databaseNameFor`, where
removing `decodeURIComponent` now fails it.

**A finding recorded rather than fixed:** `taso_group_teams` is unique on
`(category, competition, season, group, team_provider_id)`, so the repeated
bracket slot `specs/010-playoff-group-match-list.md` was written against cannot
be stored at all. The schema already prevents it; the classification rule is what
remains, and that is what the fixture covers.

## Known limit

The concurrency fixes are not unit-tested. Both need two connections racing on a
real Postgres, which is an integration concern rather than a unit one, and the
file is deliberately thin I/O around `create database` and one seeding
transaction. The pure halves — deriving the URL and the identifier — are tested,
and mutation-checked.
