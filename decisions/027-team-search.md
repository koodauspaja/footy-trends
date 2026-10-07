# 027 — Team search: decisions

Implementation notes for #247, against `specs/027-team-search.md`.

## The spec's open questions, and what the data said instead

Three were settled with Miikka before implementation and are recorded in the
spec. Two more were settled by measurement **during** it, and both changed the
code:

| Found | Consequence |
|---|---|
| TASO's `competition_id` is a **season bucket** (`spljp19`, `maajp18`), not a competition; `category_id` is the competition (`VL`, `WCQ`) | `resolveTeamNames` was reading the wrong column for anything wanting a name. Corrected — the first probe rendered `FC Honka [spljp19 · 2019]` |
| `/maajoukkueet/joukkue/[id]` is **football-data's** page, and `/kotimaa/joukkue/[id]` is scoped to `{ kind: "taso", bucket: "domestic" }` | A TASO **national-team** id has no page at all. `regionFor` was sending every TASO team to `/kotimaa`, so those results would have been links to a page that cannot find them |

Neither was in the issue's measured notes, and neither would have failed a test
I had written — the first renders a plausible-looking string, the second a
plausible-looking link. Both came out of running the real query against the real
database before building anything on top of it.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Folding Finnish letters | `translate(lower(x), 'äöåÄÖÅ', 'aoaAOA')` | `unaccent` is available but **not installed**, so it needs a `CREATE EXTENSION` migration and the privilege to run it on the platform. It is also not `IMMUTABLE`, so it could not be indexed. `translate` is (`pg_proc.provolatile = 'i'`, checked), and three character pairs describe the whole problem |
| Where the fold is applied | Both sides | Folding only the stored name finds `Järvenpää` from `jarvenpaa` but not from `Järvenpää`; folding only the term does the reverse. The acceptance criteria name both directions |
| Finding versus displaying | Two steps: match ids here, resolve names in `resolveTeamNames` | One query would show a club's **old** name whenever an old name is what matched — the opposite of useful for someone searching a club they remember under a former name |
| A TASO national side | `region: null`, rendered as plain text | It has no team page in either direction: `/kotimaa/joukkue/[id]` is scoped to the domestic bucket, and `/maajoukkueet/joukkue/[id]` reads **football-data**, whose ids are a separate space — a link there would 404 or show a different team. Searching for a national side still works via football-data, where `EC` and `WC` resolve to `/maajoukkueet` correctly. Finland is the one exception worth routing, and is filed as #325 |
| Ordering | The team's newest matching appearance, newest first | Merged across home and away *by date*, not by which query returned first — a team whose newest row is an away one would otherwise sort by its older home row |
| Escaping | `\` first, then `%` and `_` | Escaping the wildcards first would then escape their own escapes. Unescaped, one `%` matches every team stored |
| The session check | In the action, not only in the component | A server action is a public endpoint whether or not anything renders a control for it |

## Performance, which the spec required to be measured

**Measured, after review pointed out that shipping it unmeasured was not good
enough.** The local database holds 449 real rows, so the benchmark generated
production-shaped data first: 30,449 TASO matches across 2,000 teams — production
holds roughly 20,600 — with Finnish names so the fold has real work to do.

| term | median | worst of five |
|---|---|---|
| `jarvenpaa` | 19 ms | 38 ms |
| `honka` | 19 ms | 22 ms |
| `ilves` | 17 ms | 17 ms |
| `abo` | 17 ms | 20 ms |
| `ja` (the shortest allowed) | 20 ms | 21 ms |

**An order of magnitude under the spec's 200 ms threshold**, so neither `pg_trgm`
nor a materialised team table is warranted. The reason it holds is structural
rather than lucky: `distinct on` collapses the scan to one row per *team*, and
there are roughly 1,600 teams however many matches they played.

The caveat worth keeping: this is one machine with warm caches, and a leading
wildcard still cannot use a B-tree. What the numbers rule out is the *shape* of
the problem being wrong at this scale, not every future scale.

What is in place:

- Four expression indexes on the folded name columns (migration `0014`), verified
  present in `pg_indexes` after `db:migrate`.
- Every one of the four queries is `LIMIT`-ed, and each collapses to one row per
  team via `distinct on`, so the work is bounded by team count rather than by
  match count.

The cap took **two** rounds of review to get right, and both rounds were fair.

1. The first version put `LIMIT 20` on each of the four queries. `distinct on
   (id)` forces the sort to begin with `id`, so it kept the twenty **lowest
   ids** — a club that played last week dropped for one inactive since 2019,
   purely because its id was larger.
2. I then removed the inner `LIMIT` entirely and capped only after merging in
   TypeScript. That fixed the ranking and broke the bound: a short common term
   pulled **every** matching team out of Postgres to keep twenty of them.

The shape that satisfies both is the one review suggested first and I did not
take: the `distinct on` is a **subquery**, and the cap sits on the outer select
where the rows can be ordered by date. Ranking by recency, and never more than
`MAX_RESULTS` rows per query leaving the database.

The outer sort's *direction* is observable only when more teams match than the
cap — with fewer, the TypeScript merge re-sorts them and hides it. That is why
there is an integration test inserting `MAX_RESULTS + 5` teams and asserting the
newest survives and the oldest does not; the unit suite cannot see it, and a
mutation reversing the direction passes there.

## What review found

Two, both real, both fixed in the same commit:

| Finding | Why it mattered |
|---|---|
| The secondary line rendered a **partial** version — a lone `2026` — where the spec asks for both or neither | Spec drift, and worse: the test I wrote **asserted the partial behaviour**, so it would have stayed green forever. The spec's wording was ambiguous and has been tightened rather than left to be misread again |
| Two searches in flight could resolve out of order, the older overwriting the newer | Silent, and indistinguishable from a correct answer: the reader sees results for a term they already replaced. Guarded with a submission counter, on both the success and the failure path — refusing to submit while pending would also close it, but by discarding what the reader asked for |

A third defect was found while fixing CI rather than by review: the component
tests fired `submit` on the **input** instead of the form, so React tried to
build a `FormData` from a non-form element. It threw 31 times per run **locally
too** — as unhandled errors that vitest still reported as `15 passed`. CI is
stricter and failed. Reading a green summary without looking at stderr is what
hid it.

## Testing notes

`searchTeams` is covered twice on purpose. The unit suite mocks the database and
deliberately does **not** inspect the `where` clause — that is a drizzle SQL
object, and asserting on its internals would break on a version bump while
proving less than running the query does.

Thirteen mutations, all caught: eleven by the unit suite, and two only by the
integration suite — *folding one side instead of both*, and *not escaping `%`*.
Those two are exactly the SQL-semantics ones, so the split is the point rather
than a gap.

## Moved from comments, 2026-10-05

Cut from `src/lib/favourites.ts` at `55a14fc` by #531.

- **`TASO_NATIONAL_BUCKET_PREFIX`.** A list of ids would silently send next
  season's teams to the wrong place.
- **`FavouriteTeamView`.** The competition and season serve `specs/027`, where
  `FC Honka` is nine teams.

## Moved from comments, 2026-10-06

Cut from `src/db/schema.ts` at `a86c1cb` by #531.

- **`*_team_name_folded_idx`.** An index on the raw column cannot serve a query
  on `translate(lower(...))`. `translate` and not `unaccent`: the extension is
  not installed, and `unaccent` is not `IMMUTABLE`, so it cannot be indexed.
  A leading-wildcard `LIKE '%x%'` cannot use a B-tree, which is why the
  substring query has to be measured at production scale before it is
  trusted.

Cut from `src/lib/team-search.ts` at `94397a8` by #531.

- **`team-search.ts`, two steps.** Doing both in one query would show a club's
  old name whenever an old name is what matched, the opposite of useful for
  someone searching a club they remember under a former name.
- **`MAX_RESULTS`.** Agreed, not measured. A reader who cannot find their team
  in twenty should type more, and one common name fills half of that on its
  own: `FC Honka` alone carries nine distinct ids.
- **`FOLD_FROM`.** `unaccent` is available but not installed, so it would need
  a `CREATE EXTENSION` migration and the privilege to run it, for a fold three
  character pairs describe completely. `translate` is also `IMMUTABLE`, which
  `unaccent` is not, so an expression index over it is possible.
- **`foldTerm`.** Folding only the stored name finds `Järvenpää` from
  `jarvenpaa` but not from `Järvenpää`; folding only the term does the
  reverse.
- **`escapeLike`.** One `%` matches every team there is. One pass and not
  three: escaping them separately has to do the backslash first, or the
  escapes it inserts get escaped again, and a rule whose correctness depends
  on statement order is one somebody reorders. `$&` is the matched character,
  so each is prefixed exactly once.
- **The four queries in `searchTeams`.** They mirror `resolveTeamNames`.
  `distinct on` collapses each team to its newest matching row, so a club with
  two hundred matches contributes one. `distinct on (id)` requires the sort to
  begin with `id`, so a `LIMIT` on that query keeps the twenty lowest ids: a
  club that played last week dropped for one inactive since 2019, purely
  because its id is larger. With the cap on the outer select the ranking is
  by recency and no more than `MAX_RESULTS` rows per query leave Postgres, so
  a short common term like `ja` cannot pull every matching team into memory.
- **`PLACEHOLDER_TEAM_ID` in `team-search.ts`.** The match page already keeps
  both off: the unresolved bracket slot and the team with no name.

Cut from `src/components/team-search.tsx` at `ef7eb13` by #531.

- **`team-search.tsx`.** Client-side like `favourite-toggle.tsx`, and for
  the same reason: the header is on every page, including the four
  `tests/unit/app/rendering-mode.test.ts` keeps prerendered, and reading the
  session on the server would cost those pages their prerendering. It imports
  `team-search-actions` by name; Next replaces a `"use server"` module with a
  network stub in the client bundle, so better-auth and the database stay out
  of it. The types come from `team-search.ts` as types only, which are
  erased. The mock is needed for the reason noted in `favourite-toggle.tsx`:
  the broadcast channel outlives its jsdom.
- **`secondaryLine`.** The first version got this wrong. A bare `2026` does
  not disambiguate two teams sharing a name, the one thing the line exists
  for, and a placeholder like `Tuntematon · 2026` tells the reader less than
  no line at all. A TASO national-team category has no name in any registry
  the app carries, so that is the case this covers.
- **`latestSubmission`.** Two searches in flight resolve in whatever order
  the network gives them, and the reader would be left looking at results
  for a term they had already replaced, silently and indistinguishable from
  a correct answer. The closure that checks the ref is created before the
  re-render. Refusing to submit while one is pending would also close the
  race, but by discarding what the reader asked for; the latest intent wins.
- **`mounted`.** The header is server-rendered on every page and prerendered
  on four of them, where there is no session.

Cut from `src/lib/team-search-actions.ts` at `48ebab4` by #531.

- **`TeamSearchResult`'s reason.** A short term needs another character, a
  failure needs another attempt, and a signed-out caller needs nothing at
  all: the field is not offered to them.
- **`searchTeamsAction`.** Hiding the field from a signed-out reader is a UX
  decision; the check in the action is the gate, as a server action is a
  public endpoint whether or not anything renders a control for it. The
  module is imported by name from a client component, and a static import
  of `@/lib/auth` would put better-auth into that bundle's graph, the
  failure that cost 114 CI tests.

## Moved from comments, 2026-10-07

Cut from `tests/integration/team-search.test.ts` at `79f2c6a` by #531.

- **The fixture ids in `team-search.test.ts`.** The cap test inserts
  twenty-five rows of its own. Listing ids separately meant a failure before
  its manual cleanup left them in the shared database, to contaminate every
  later test and every later run.
