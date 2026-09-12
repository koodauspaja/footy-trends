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
