# 020 — Context-free team page

Implementation decisions for `specs/020-context-free-team-page.md`. Every fact
below was measured against the development database on 2026-09-02, and every
page named was loaded in a browser rather than inferred from a passing test.

## The issue described the wrong problem, and the numbers said so

#246 was written as "a team page addressable by its id alone", as though a bare
URL did not resolve. It did — to the region's default competition:

| Region | Team ids stored | Served by a bare URL |
|---|---|---|
| `/kotimaa` | 1,315 | **12** (Veikkausliiga 2026) |
| football-data | 315 | **20** (Premier League) |

So 1,598 of 1,630 ids answered `Joukkuetta ei löytynyt.` on their own address —
under a heading naming a competition they had nothing to do with, with a season
selector and a standings link to match. Confirmed live before any code changed:
`/ulkomaat/joukkue/721` (RB Leipzig) and `/kotimaa/joukkue/60496` (FC
Vaajakoski) both did exactly that.

That reframing is why the not-found page changed too. It was not scope creep
looking for a home: the wrong-competition furniture *was* the bug's visible
half.

## One rule, not four cases

> Take the team's newest stored match, filtered by whatever the URL already
> says, and use it for whatever the URL does not.

The no-parameter case, `?kilpailu=` alone, `?kausi=` alone and the full pair are
then the same query with different predicates rather than four code paths. The
alternative — resolve only when both are absent — is less code in the resolver
and more surprise in the product: `?kausi=2019` on its own would keep meaning
Veikkausliiga 2019.

**No league-preference heuristic was needed**, which was worth checking rather
than assuming. All 12 Veikkausliiga clubs resolve to `VL` and all 20 Premier
League clubs to `PL`, because the top tier's season runs latest; the long tail —
719 teams whose newest match is a Suomen Cup tie — has no league to prefer. And
no team in either table has a tie for "newest match", so the rule is total
without needing one.

## Two questions, because they have different answers

`resolveTeamDefaults` asks the database twice on purpose:

1. **Does this team exist here at all?** — no filter. A `no` is the reduced
   not-found page.
2. **What fills the URL's gaps?** — with the filter.

Collapsing them would make "team you have never heard of" and "team that did not
play in 2019" the same answer, and they need different pages: the first has no
competition to offer, the second has a selector worth using.

**A season filter that matches nothing is dropped; a competition filter is
not.** A season the team never played says nothing about which competition the
reader wanted, so falling back to the region's default there is the behaviour
this whole feature exists to remove. A competition the team never played is a
question with an answer — "not this one" — and the page still says so, with that
competition named.

## The index: one column, and not a contradiction

Measured on `taso_matches` (20,604 rows), for a team with 260 stored matches:

| | Execution | Buffers |
|---|---|---|
| As it stood | 1.03 ms | 144 |
| `(away_team_provider_id)` | **0.20 ms** | **94** |
| `(away_team_provider_id, kickoff_at)` | 0.24 ms | 94 |

Spec 019 concluded a mirrored index earned nothing and did not add one. That
still holds: its query has equality on **both** team columns, which one
composite index serves twice under a `BitmapOr`. This query has equality on a
single column at a time, which that index cannot serve — the away half was
scanning its whole second column, which is the 49 buffers the numbers above
lose. Two different questions, two different answers, and the second one does
not retract the first.

Adding `kickoff_at` to the index buys nothing because the bitmap discards index
order before the sort, so the single column is what ships.

## What the tests caught that review would not have

**`isPlaceholderTeam(teamProviderId, "")` is true for every id.** The guard
refusing the placeholder team passed an empty string as the name — and an empty
name is itself a placeholder, so the function answered `true` for every team and
the resolver returned "not found" for all of them. Six unit tests failed at
once, which is what made it obvious; a reviewer reading the line would have seen
a sensible-looking reuse of an existing helper. The fix compares the id to
`PLACEHOLDER_TEAM_ID` directly, and says why in a comment.

**An e2e failure that was not a product bug.** A new test read `page.url()`
immediately after a click, before the navigation had settled, so it stripped the
parameters off the *standings* URL and asserted against that page's heading —
reported as "a season alone resolves to Valioliiga". Checked against a running
server before touching the resolver: `/ulkomaat/joukkue/5?kausi=2024` renders
`FC Bayern München – Bundesliga 2024/25`. The test gained the `toHaveURL` wait
the test above it already had.

## What the first review round found

Three findings, all taken.

**A database error was being answered with the wrong competition.** When the
unfiltered lookup succeeded and the filtered one failed, `resolveTeamDefaults`
fell back to the unfiltered context — rendering some other competition's page as
though it were the answer, and hiding a transient failure. Both the narrowed
lookup and the season-dropping retry now propagate `error`, which the pages
already render as their existing error state. The distinction the fallback path
exists for is `not_found`, and only that.

**`seasonCandidate` accepted numbers that are not numbers.** `/^\d+$/` passes
three hundred digits, which `Number` turns into `Infinity`, which reaches an
integer comparison and makes Postgres throw — an error state where a Finnish
notice belongs. It now requires `Number.isSafeInteger`. Checked for the same
shape elsewhere while fixing it: the other two season parsers compare against a
list of selectable seasons, so an unusable value fails that check and gets its
notice; the team and match id parsers already require `Number.isInteger`, which
`Infinity` fails. This was the only one.

**A comment that had become the opposite of the code.** It said an invalid
`kausi` falls back to the competition's default; after this change it falls back
to the team's own season whenever the resolved competition is the one being
shown. Rewritten in both resolvers to state what actually happens.

Sonar found the same two lines from the other side — an `x !== undefined && x.y`
that reads better as `x?.y` — so the rewritten fallbacks use optional chaining.

## The second review round: an e2e test that passed for the wrong reason

Both new e2e tests captured the heading from the *parameterised* team page and
demanded the bare URL render it identically. That is not the rule. A correct
resolver renders a different competition whenever the team's newest stored match
belongs to one — a Suomen Cup tie, a Champions League night — so the tests would
have failed on correct behaviour the moment the data shifted. They passed only
because today's Bundesliga and Kakkonen seasons happen to run later than those
teams' cup matches.

Rewritten to assert what e2e can actually prove without hardcoding ids that may
not exist in another database: the URL stays bare, the heading names the team,
a match table renders, and the heading is **not** the region's default
competition — which is the regression this feature exists to fix. Which
competition is chosen is verified against fixtures in
`tests/integration/team-context.test.ts`, where a fixed newest match can be
inserted and asserted exactly.

## The third round: a range one door further out

The same review that caught `Infinity` came back for the range below it.
`Number.isSafeInteger` accepts 9,007,199,254,740,991; a Postgres `integer`
column holds 2,147,483,647. Measured on a running server before fixing
anything, all of these rendered **`Otteluiden lataaminen epäonnistui.`** — the
error state, telling a reader the site was broken:

| URL | Rendered | Should render |
|---|---|---|
| `/kotimaa/joukkue/99999999999` | error | `Joukkuetta ei löytynyt.` |
| `/ulkomaat/joukkue/99999999999` | error | `Joukkuetta ei löytynyt.` |
| `/kotimaa/joukkue/60496?kausi=9007199254740991` | error | the team's page, with the season notice |
| `/kotimaa/ottelu/99999999999` | error | `Ottelua ei löytynyt.` |

**The last two rows are spec 019's, already on `main`.** The match page had the
identical flaw, so this is a class rather than a line, and one guard —
`isStoredInteger` in `src/lib/provider-ids.ts` — now stands at all three doors:
`getMatchPageData`, `getTeamContext` and `seasonCandidate`.

The non-obvious part, and the reason the database cannot be left to answer it:
**raw SQL with a literal that large is fine.** Postgres promotes the column to
`bigint` when it compares against one, and returns zero rows. It is the *bound
parameter* that fails — `postgres.js` binds an `int4` — so the failure appears
only through the app, which is exactly where a reader meets it.

All four URLs were re-loaded after the fix and now answer honestly, the
`kausi` one landing on the team's own page under
`Kautta ei löytynyt. Näytetään kausi 2026.`

## Smaller calls

- **Page tests mock `@/lib/team-context`, not `@/lib/team-page-context`.**
  Mocking at the database boundary leaves `resolveTeamDefaults`' own two-question
  logic running inside the page tests, where mocking the resolver would have
  replaced the thing most worth testing.
- **The default mock is restored in every `beforeEach`.** `vi.clearAllMocks()`
  clears calls but keeps an implementation set by a `mockResolvedValue` inside a
  test, which leaked an error status into every test that followed it.
- **Two superseded e2e tests were deleted rather than left beside their
  replacements.** Both asserted that an unknown team id keeps its season
  selector, which is precisely what this spec removes.
- **No redirect and no canonical tag.** A bare URL renders; both spellings
  answer 200. Bouncing to a parametrised URL would break the clean link the
  feature exists to provide, and no other page in this app sets a canonical.
