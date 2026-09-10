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

**The spec's threshold could not be tested honestly, and that is worth stating
plainly rather than burying.** The local database holds 449 TASO match rows and
**zero** football-data rows, so any timing taken here describes nothing.

What is in place:

- Four expression indexes on the folded name columns (migration `0014`), verified
  present in `pg_indexes` after `db:migrate`.
- Every one of the four queries is `LIMIT`-ed, and each collapses to one row per
  team via `distinct on`, so the work is bounded by team count rather than by
  match count.

**What remains unproven is the substring `LIKE` at production scale**, and a
leading-wildcard `LIKE` cannot use those B-trees. The spec names the threshold
(~200 ms) and the two candidates (`pg_trgm` with a GIN index, or a materialised
team table). This should be measured against production data before anyone
treats the feature as finished — the boxes for it stay unticked on #247.

## Testing notes

`searchTeams` is covered twice on purpose. The unit suite mocks the database and
deliberately does **not** inspect the `where` clause — that is a drizzle SQL
object, and asserting on its internals would break on a version bump while
proving less than running the query does.

Thirteen mutations, all caught: eleven by the unit suite, and two only by the
integration suite — *folding one side instead of both*, and *not escaping `%`*.
Those two are exactly the SQL-semantics ones, so the split is the point rather
than a gap.
