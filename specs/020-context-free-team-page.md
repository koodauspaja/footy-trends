# 020 — Context-free team page

## Summary

A team page addressed by its id alone — `/{region}/joukkue/{id}` with no
`kilpailu` and no `kausi` — resolving the competition and season from the
team's own newest stored match, so that a link to a team is a link to that
team rather than to a guess about which competition it plays in.

## The problem, measured

A bare team URL already resolves today. It just means something else: "the
region's default competition, in its default season". Measured against the
development database on 2026-09-02:

| Region | Team ids stored | Served by a bare URL today |
|---|---|---|
| `/kotimaa` (TASO, domestic) | 1,315 | **12** — Veikkausliiga 2026 |
| `/ulkomaat` + `/maajoukkueet` (football-data) | 315 | **20** — Premier League 2026/27 |

So **1,598 of 1,630 stored team ids answer `Joukkuetta ei löytynyt.`** on their
own URL. Confirmed live, not inferred: `/ulkomaat/joukkue/721` (RB Leipzig)
and `/kotimaa/joukkue/60496` (FC Vaajakoski) both render the not-found message
— under a `Valioliiga` and a `Veikkausliiga` heading respectively, complete
with a season selector and a link to a standings table neither team appears in.

This is also what blocks #247 (team search): a search result is a team id and
nothing else, because the searcher has not chosen a competition.

## Scope

### In scope

- Resolving the competition and season from the team's newest stored match when
  the URL does not say.
- The same resolution for a **partial** URL — one of `kilpailu`/`kausi` given,
  the other not.
- All three regions: `/kotimaa`, `/ulkomaat`, `/maajoukkueet`.
- A not-found page that stops claiming the team belongs to the default
  competition.
- One index per match table, measured below.

### Out of scope

- **Changing what the page shows** once the context is resolved: the same
  heading shape, the same match list, the same season selector.
- **Removing the parameters.** Every existing link keeps working unchanged,
  including the ones spec 019 added from the match page, and the selector keeps
  producing parametrised URLs.
- **A redirect.** A bare URL renders; it does not bounce to a parametrised one.
  Both spellings answer 200, which is what keeps existing links and bookmarks
  working.
- **Canonical link tags.** No page in this app sets one; doing it here only for
  team pages would be an inconsistency dressed as an improvement.
- **Team pages for Huuhkajat and Helmarit opponents.** TASO's national-team
  rows are a separate route family (spec 019) and a separate decision.
- A team page for the placeholder id `0`.

## The resolution rule

One rule covers all four cases, rather than one rule per case:

> Take the team's newest stored match, **filtered by whatever the URL already
> says**, and use its competition and season for whatever the URL does not.

| URL | Competition | Season |
|---|---|---|
| `/kotimaa/joukkue/60496` | from the newest match | from the newest match |
| `…?kilpailu=M2` | `M2` as given | newest season **in `M2`** |
| `…?kausi=2019` | competition of the newest match **in 2019** | `2019` as given |
| `…?kilpailu=M2&kausi=2019` | as given | as given — unchanged from today |

An **invalid** parameter is not a filter: it falls back to resolution and keeps
today's Finnish notice (`Kilpailua ei löytynyt.` / `Kautta ei löytynyt.`), so a
typo lands on the team's newest context rather than on Veikkausliiga's.

When the filter matches nothing — a team that never played the competition
asked for — the page shows `Joukkuetta ei löytynyt.`, which is what it does
today for the same combination.

### Why "newest match" and not "the league it belongs to"

Because the simple rule gives the right answer where it matters, measured
rather than assumed:

- Every one of the **12** Veikkausliiga 2026 clubs resolves to `VL`, not to a
  Suomen Cup tie played earlier in the year.
- Every one of the **20** Premier League clubs resolves to `PL`.
- For the long tail — 719 teams whose newest match is a Suomen Cup tie, 140 a
  Naisten Suomen Cup one — the cup **is** their competition here. There is no
  league page to prefer.

No team in either table has a tie for "newest match": 1,315 TASO ids and 315
football-data ids each resolve to exactly one (competition, season).

## UX / UI (Finnish strings)

**No new strings on a page that resolves.** The heading already names the
competition and season it chose — `FC Vaajakoski – Kakkonen 2026` — so a notice
explaining the choice would repeat the heading in more words. This is a
deliberate answer to the checklist, not an omission.

One page **loses** strings. When nothing resolves, today's page still renders a
season selector, a `Sarjataulukkoon` link and a competition name, all belonging
to a competition the team has nothing to do with. That page becomes:

| | |
|---|---|
| Heading | `Joukkue` |
| Body | `Joukkuetta ei löytynyt.` |
| Selector | none |
| Standings link | none |

The same shape spec 019 gave a match that does not resolve, and for the same
reason: with no team, there is no competition to name, and offering a season
selector invites the reader to try again in a season that will fail identically.

## API & Data

### No provider calls

The resolution is one query against stored rows. Season discovery
(`resolveTasoSeasonContext`, `getSeasonContext`) is unchanged and already
cached; the resolution runs **before** it, because it decides which competition
that context is fetched for.

### The query

```sql
SELECT competition/category, season_id
FROM {matches|taso_matches}
WHERE (home_team_provider_id = :id OR away_team_provider_id = :id)
  AND {region or bucket predicate}
  AND {competition = :kilpailu, when the URL says}
  AND {season_id = :kausi, when the URL says}
ORDER BY kickoff_at DESC, provider_match_id DESC
LIMIT 1
```

- **The scope predicate is spec 019's**, unchanged: `competition_id NOT LIKE
  'maajp%'` for `/kotimaa`, the region's competition codes for the two
  football-data routes. A national-team row must not resolve a `/kotimaa` team
  page, and `/ulkomaat/joukkue/{a World Cup team id}` must be a not-found.
- **`provider_match_id DESC` breaks a tie.** No team has one today; ordering
  must still be total, or the page could differ between renders.
- **Placeholder ids never reach it.** `id = 0` short-circuits to the not-found
  page before any query, as it does on the match page.

### Cached per request

Wrapped in React's `cache()`, like `getTeamMatches` and `getSeasonContext`:
Next.js calls `generateMetadata` and the page separately, and both need the
resolved context.

### The category a competition does not claim

A TASO row whose `category_id` no competition in the picker claims cannot
produce a competition to show, so the resolution skips it and takes the next
newest match that can. Measured across all 137 stored domestic
(category, season) pairs: **0** are unclaimed today, and **0** fall below their
competition's own selector floor. The filter is there because the registry is
hand-maintained while TASO publishes more categories than it lists — 28 in
`spljp26` against the picker's 20.

## Performance & Limits

One extra query per team page view, and it needs one index per table.

Measured on `taso_matches` (20,604 rows) for a team with 260 stored matches:

| | Execution | Buffers |
|---|---|---|
| As it stands | 1.03 ms | 144 |
| With an index on `away_team_provider_id` | **0.20 ms** | **94** |

The existing `(home_team_provider_id, away_team_provider_id)` index from spec
019 already serves the home half of the `OR`; the away half currently scans
that whole index on its second column, which is the cost above and which grows
with the table while the home half does not.

**A single-column index is enough** — `(away_team_provider_id, kickoff_at)`
measured 0.24 ms against the single column's 0.20 ms, because the bitmap OR
discards index ordering before the sort. So the extra column buys nothing and
is not added.

Note this does **not** contradict spec 019's finding that a mirrored index
earned nothing. That was a query with equality on *both* columns, which one
composite index serves twice. This one has equality on a single column at a
time, which it does not.

## Security & Secrets

No new env var, no new credential, no new outbound host. The id is parsed to a
number before it reaches any query and is bound as a parameter by Drizzle. No
secret is committed.

## Acceptance Criteria

- [ ] `/kotimaa/joukkue/{id}`, `/ulkomaat/joukkue/{id}` and
      `/maajoukkueet/joukkue/{id}` render a team's matches with no query
      parameters at all
- [ ] With no parameters, the competition and season shown are those of the
      team's newest stored match — verified on RB Leipzig (`/ulkomaat/joukkue/721`
      → Bundesliga) and FC Vaajakoski (`/kotimaa/joukkue/60496` → Kakkonen),
      both of which show the not-found message today
- [ ] `?kilpailu=` alone resolves the newest season **in that competition**;
      `?kausi=` alone resolves the competition of the newest match **in that
      season**
- [ ] An existing `?kilpailu=&kausi=` URL renders exactly as it does today
- [ ] An invalid parameter still shows its Finnish notice, and falls back to the
      resolved context rather than to the region's default competition
- [ ] A team id with no stored match shows `Joukkuetta ei löytynyt.` under the
      heading `Joukkue`, with no season selector and no standings link
- [ ] The placeholder id `0` never resolves to a page
- [ ] A team id belonging to another region or to the national-team buckets is
      a not-found, not another region's team
- [ ] Every existing link to a team page still works, including the match
      page's
- [ ] All user-facing strings are Finnish

## Tests Required

### Unit — the resolution rule (pure)

`tests/unit/lib/team-context.test.ts`

- no filter → the newest match's competition and season
- a competition filter → the newest season within it
- a season filter → the competition of the newest match in it
- both → the given pair, with no query at all
- a filter matching nothing → `null`
- id `0` → `null` without querying
- a row whose category no competition claims is skipped for the next newest

### Unit — the queries

`tests/unit/lib/team-context.test.ts` (mocked `db`, as `match-service`'s tests
are): the scope predicate per region, the bucket predicate for `/kotimaa`, and
the error path.

### Unit — pages

`tests/unit/app/domestic/team/[id]/page.test.tsx` and
`tests/unit/app/foreign/team/[id]/page.test.tsx`, extended: a bare URL renders
the resolved competition in the heading; a partial URL resolves the other half;
an unresolvable id renders the reduced not-found page; `generateMetadata`
matches the heading.

### Integration

`tests/integration/team-context.test.ts` — the query against a real Postgres:
newest match wins, the filters narrow it, the scope predicate holds, and a tie
on `kickoff_at` is broken deterministically.

### E2E

`tests/e2e/team.spec.ts` and `tests/e2e/domestic-team.spec.ts`, extended:

- `/ulkomaat/joukkue/721` shows Bundesliga matches, not a not-found
- `/kotimaa/joukkue/60496` shows Kakkonen matches
- the season selector still produces a parametrised URL that renders the same
- an unknown id shows the reduced not-found page

Run with `--workers=1`, per the config.

## Files To Update

- `specs/020-context-free-team-page.md` (this file)
- `decisions/020-context-free-team-page.md` (written during implementation)
- `src/lib/team-context.ts` — the resolution and its query
- `src/lib/domestic-page-context.ts` — accept a resolved fallback context
- `src/lib/page-context.ts` — the same for the two football-data regions
- `src/app/domestic/team/[id]/page.tsx`, `src/components/competition-team-page.tsx`
- `src/db/schema.ts` and `drizzle/` — one index per match table
- the test files listed above

No change to `.env.example`, to `next.config.ts`, or to any doc in `docs/setup/`.

## Open Questions

None. Both were settled in chat on 2026-09-02:

1. **The reduced not-found page is in.** Heading `Joukkue`, the message, and
   nothing else — no season selector, no standings link. It is a visible change
   to an existing page that #246 did not ask for, taken deliberately: the
   current page invites the reader into a selector for a competition the team
   has nothing to do with, where every season fails identically.
2. **Partial parameters resolve.** `?kilpailu=` alone gives the newest season in
   that competition, `?kausi=` alone gives the competition of the newest match
   in that season. One filter-then-take-newest query with optional predicates,
   rather than a special case per URL shape — and it removes the surprise where
   `?kausi=2019` alone silently means Veikkausliiga.
