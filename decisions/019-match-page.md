# 019 — Match page

Implementation decisions for `specs/019-match-page.md`. Every provider fact
below was measured against the development database on 2026-09-02 — 14,001
`matches` rows and 20,604 `taso_matches` rows — rather than reasoned about from
the schema. Two of the decisions exist only because a measurement contradicted
what the schema suggested.

## The spec's own scope predicate was wrong, and the registry said so

The first draft scoped `/kotimaa` to `competition_id LIKE 'spljp%'`, reading the
season-umbrella scheme off the id format. `domestic-competitions.ts` has an
escape hatch that format does not show: `competitionIdPrefix`, which
Ykkösliigacup uses to publish `M1LCUP{YY}` — 69 stored rows that the `spljp%`
predicate would have turned into not-founds.

The domestic predicate is therefore the **negation** of the national one. The
two are exhaustive over the shared table and cannot both match, which is the
property the routes actually need; `spljp%` only looked like that property.

## Five routes, because `/maajoukkueet` has two providers

Measured before committing to the shape:

| Question | Answer |
|---|---|
| Ids shared by `matches` and `taso_matches` | **317** |
| Where they land | football-data × `spljp16` — 301 `FL1`, 15 `PL`, 1 `PD` |
| Ids shared inside the `/maajoukkueet` scope | **0** |
| `WC`/`EC` id range | 428742 – 537430 |
| `maajp*` id range | 962445 – 4296364 |

Zero collisions inside the region today, but the id spaces are not disjoint —
TASO runs 277k to 4.3M, straight through football-data's band — so a route that
tried both tables would be correct by luck and would start rendering the wrong
match the first time TASO issued a national-team id in that range. Huuhkajat and
Helmarit got their own routes instead, and each of the five resolves against
exactly one table.

The 317 collisions also justify the per-row scope check rather than trusting the
unique index: for those ids, `/kotimaa/ottelu/{id}` and `/ulkomaat/ottelu/{id}`
are two different real matches.

## The head-to-head is SQL, and the index is measured

One statement, with `LIMIT 5` — not a fetch-then-filter in TypeScript, and not a
second implementation to unit-test against. A pure re-implementation of the same
rule would be a second source of truth for it, so the selection's cases are
integration tests against a real Postgres, and the unit tests cover the parts
that are genuinely pure (the window sentence, the limit).

The index was measured rather than assumed, on a real Veikkausliiga pair:

| | Execution | Buffers |
|---|---|---|
| Sequential scan | 3.16 ms | 477 |
| Composite index, bitmap OR | **0.13 ms** | **26** |

**One index per table, not two.** A single `(home, away)` composite serves both
orientations: the planner scans it twice under a `BitmapOr`. Verified by
dropping the mirrored `(away, home)` index and re-running — 0.20 ms, same plan
shape. The mirrored index earns nothing and was not added.

## Team ids are the join key, and they earned it

| Source | Names | Ids |
|---|---|---|
| football-data | 315 | 315 |
| TASO Veikkausliiga, 12 seasons | 23 | 22 |
| TASO national, men's / women's categories | 44 / 41 | 41 / 39 |

No name inside one competition or one national side carries two ids, so a
head-to-head reaches back through every stored season. And 126 domestic ids
carry two or more names over time, so joining on ids is not merely adequate —
it is *more* correct than joining on names, and a renamed club keeps its
history.

## Team id `0` is not a team

TASO stores an unresolved bracket slot as provider id `0` with an empty name:
22 rows, 21 of them finished with a real score, three of them in Suomen Cup,
which the site shows. `matches` has none.

Joining on it would pair a match against every other unresolved slot that
happened to face the same opponent and present the result as previous meetings.
So a placeholder renders as `Tuntematon joukkue`, is never a link, and
suppresses the head-to-head with its own sentence rather than an empty list —
an empty list would claim these two teams have never met.

## Three labelling bugs the browser found that the tests did not

The unit suite was green and the pages were still wrong. Each of these was
found by loading a real match and reading it.

1. **`REGULAR_SEASON` on every league match.** 13,184 stored rows across nine
   competitions carry it, and `getStageName` passes an unknown stage through
   verbatim by design — so a Premier League page printed the provider's token
   as a Finnish page's stage line. It is not a phase, it is the absence of one,
   and it is now suppressed by name.
2. **"Kierros 2" for a Champions League quarter-final second leg.** On a
   knockout round the number is a leg. The match lists already knew this
   (`fourthColumnFor`); the match page did not. Measured across every stored
   knockout row: CL and ELC carry 1–2 (legs), the Euro carries 4–7 (its group
   counter running on into the knockout — not legs), the World Cup carries
   null. So only 1 and 2 are shown, as `Osaottelu N`.
3. **"Kierros 63" on a Suomen Cup match.** TASO's `round_id` is not re-indexed
   per competition, and the series name directly above it is TASO's own
   `Kierros 2`. Two lines, both reading "Kierros", one of them meaningless. The
   domestic standings page had already dropped that column on cups for the same
   reason; the match page now does too.

The general lesson is the one the project already writes down: a page that
renders is not a page that is correct, and the check is to load it.

## What Sourcery caught, and what it did not

Five findings on the first review, four of them real.

**The window sentence described a narrower set than the query returned.** The
sentence took its floor from the match's own competition while the query spans
the whole region, so a World Cup page could list a 2024 European Championship
meeting under a sentence claiming 2026. Fixed on the sentence's side rather than
the query's: the cross-competition list is the feature, so the window now names
the oldest season any competition in the region reaches. Widening the query's
scope was never the alternative — narrowing it to one competition would have
been.

**A placeholder team was still a link.** `Tuntematon joukkue` pointed at
`/kotimaa/joukkue/0`. The finding named the TASO view; the fix covers both
providers, because one rule is cheaper than remembering that `matches` happens
to carry no such row today.

**Half a shootout printed as a shootout.** `formatScore` checked only
`penaltiesHome`, so one recorded total without the other would have rendered
`(rp 4–null)`. Now one `bothOrNeither` helper states the rule once for all three
score pairs, which also removed two unreachable `?? 0` fallbacks.

**The season fallbacks disagreed with each other.** With the provider
unreachable, the season line showed `2026` while the window sentence would have
said `2026/27`.

**The one I did not take** was a nitpick: the `matchHref` prop's doc promised a
per-row opt-out its type did not offer. Widening the type to `string | null`
would have added a code path no caller wants — the opt-out is per *table*, which
the optional prop already provides. The documentation was wrong, so the
documentation changed.

Sonar found one more: a nested ternary choosing a TASO competition's name. It is
two different questions behind one expression — a registry lookup for a domestic
row, a cached category map for a national-team one — and it is now a named
function.

## Coverage, and what it exposed

100% on all four metrics, and reaching it was not a test-writing exercise. Three
of the gaps were unreachable code that should not have existed:

- a source/route mismatch branch in the head-to-head, which pretended to be
  error handling for a state the caller made impossible. The query is now bound
  inside the branch that already knows both types, so the state cannot be
  described, let alone reached.
- `?? ""` behind a label lookup that could not miss. Each head-to-head row now
  carries its own label instead of being looked up in a side map.
- `?? ""` per date part in the kickoff formatter, gone with the switch to two
  formatters joined by `klo`.

The rest were real cases with no test: a category the registry does not claim
(TASO publishes 28 in `spljp26`, the picker registers 20), a category map that
answers nothing, a category name carrying neither team's suffix, and the
metadata of a page with no match.

**`match-service.ts` read as 0% covered in Sonar while vitest's summary looked
clean**, because vitest reports only files a test imported and the service was
exercised solely by integration tests. It now has unit tests of its own for the
decisions made around the queries — the scope predicate applied to a returned
row, the placeholder short-circuit, and the two failure paths, none of which an
integration test can trigger on demand.

## Smaller calls

- **The date carries the match link**, in every list. It is the one column every
  table has, it is never a link otherwise, and it does not nest inside the team
  links the `Ottelu` column already carries. Two existing e2e specs clicked "the
  row's first link" expecting a team and were retargeted at the `Ottelu` cell.
- **A not-found page is headed `Ottelu`**, not the error sentence. Heading and
  body would otherwise say the same thing twice — which the tests caught as a
  strict-mode violation before a reader could.
- **The scoreline puts the names either side of the score.** The heading already
  names both teams; a second `Home – Away` line under it read as a repeat, while
  `VPS 0–1 FC Lahti` reads as a scoreboard and carries the links a heading
  string cannot.
- **National-team competition names come from the cached category map**, the one
  the Huuhkajat and Helmarit pages already read, because the name is not stored.
  Whichever team's suffix the category name carries is the one stripped, so a
  hand-typed id pointing at the other team's category cannot leave
  "MM-karsinnat Huuhkajat" on the Helmarit page.
- **The season label falls back to the bare start year** when `getSeasonContext`
  cannot be reached. The match is the page; losing a slash is not worth an
  error state.

## Moved from comments, 2026-10-06

Cut from `src/lib/head-to-head.ts` at `a86c1cb` by #531.

- **`HEAD_TO_HEAD_LIMIT`.** Five, as the issue asked; the data supports more.
- **`HeadToHeadWindow`.** National-team matches are grouped by the year they
  were played and not by a season at all.
- **`headToHeadWindowSentence`.** "tallennettuihin" (stored) is load-bearing: it
  claims a window we looked in, not a set of seasons guaranteed complete,
  since a season is synced when someone browses it. The measured asymmetry is
  why the sentence exists: 47% of football-data pairs have two meetings or
  fewer, against 10% in Veikkausliiga, where the deepest pair has 35. Without
  it, "2 aiempaa kohtaamista" reads as a fact about the teams and not about
  our data.
- **`headToHeadWindow`.** The head-to-head spans every competition in a region,
  so a World Cup page can list a European Championship meeting. Stating the
  World Cup's own floor (2026) under a list containing a 2024 meeting would
  describe a window the page has just contradicted, so the floor is the oldest
  season any competition the query can return reaches. `spansCalendarYears`
  only shapes the label: `2023/24` for a league, `2026` for a tournament
  played inside one summer.

Cut from `src/lib/match-service.ts` at `a86c1cb` by #531.

- **`StoredMatch`.** One row carries a score breakdown and a stage, the other a
  series name and TASO's verdict on who went through, so flattening them
  would have to lie about one of them.
- **`HeadToHeadResult`, `unavailable`.** Not an error. Telling the reader is
  honest; an empty list would claim these teams have never met.
- **`previousOf`.** Every clause is a decision: both orientations, strictly
  earlier than this match, played matches only, and scoped to the same source
  so a Kotimaa page cannot surface a Huuhkajat row out of the table they
  share. A row cannot kick off strictly before itself, so that clause also
  keeps the match off its own list. The ordering is total, since two meetings
  can share a kickoff instant and a page that reordered between renders would
  be a bug nobody could reproduce. Ties belong to the bracket; this is a list
  of matches.
- **`footballDataHeadToHead`, `tasoHeadToHead`.** A single function had to
  re-check that the row and the route agreed about the source, which the
  caller knows by construction: an unreachable branch pretending to be error
  handling.
- **`loadMatchPageData`.** Cached per request because Next.js calls
  `generateMetadata` and the page separately and both need the same rows, as
  for `getTeamMatches`. Keyed on primitives, not the source object, which a
  route rebuilds on every render and would miss the cache every time. A
  head-to-head failure never reaches the match: the reader came for the
  match.

Cut from `src/db/schema.ts` at `a86c1cb` by #531.

- **`matches_head_to_head_idx`.** The match page's head-to-head asks for one
  pair in either order. One composite index serves both orientations under a
  BitmapOr, so the mirrored index would earn nothing and is absent on
  purpose.
- **`taso_matches_head_to_head_idx`.** On 20,604 stored rows it turns the
  pair lookup from a 3.16 ms sequential scan into a 0.13 ms bitmap scan.

Cut from `src/lib/cup-stages.ts` at `a86c1cb` by #531.

- **`REGULAR_SEASON`.** 13,184 stored rows across nine competitions carry it.
  The competition and round already say everything a name for it would.

Cut from `src/lib/national-team.ts` at `a86c1cb` by #531.

- **`NationalTeam.basePath`.** These matches are TASO's while
  `/maajoukkueet/ottelu/:id` is football-data's, so each team's rows need a
  route that names their source.
- **`EARLIEST_NATIONAL_TEAM_YEAR`.** Not a bucket's nominal year: `maajp18`
  reports `season_id: 2021` while holding matches played in 2018 to 2021. It
  is the year the match page's head-to-head states as the window it looked
  in.

Cut from `src/lib/domestic-competitions.ts` at `a86c1cb` by #531.

- **`competitionCodeForCategory`.** The inverse of `categoryIdsFor`, for a page
  that starts from a stored row and not from a `kilpailu` value: the match
  page builds a team link out of a match it has just read. `null` and not a
  fallback: a category no competition claims has no team page to link to.
