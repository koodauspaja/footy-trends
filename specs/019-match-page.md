# 019 — Match page

## Summary

A page for a single match, reachable from every match list on the site, showing
the match itself — kickoff, competition, season, round or group, both teams,
the score — and the five most recent previous meetings between the same two
teams, with an explicit statement of the window those meetings were drawn from.

Every field comes from rows we already store. No new provider call and no new
credential; the only schema change is one index per match table, measured below.

## Scope

### In scope

- A match page in every region: `/kotimaa`, `/ulkomaat`, `/maajoukkueet`.
- Kickoff date **and time**, in `Europe/Helsinki`.
- The competition, the season, and the matchday, stage or group the match
  belongs to.
- Both team names, each linking to its team page **where that page exists**.
- The score, with extra time and the shootout where the provider records them,
  using the suffix conventions the cup bracket already established.
- The five most recent previous meetings between the two teams, newest first,
  each row linking to its own match page.
- A sentence naming the window those meetings were drawn from.
- A link into the match page from every row of every `MatchListTable` on the
  site — six call sites, listed under *Linking*.
- Finnish not-found and error states, in the shape the team pages already use.
- Finnish strings throughout.

### Out of scope

- **Referee, venue, scorers, lineups.** Not available, or not without a
  migration and a new fetch pattern. See #71's research.
- **The cup bracket's tie rows and leg lines** (`src/components/cup-bracket.tsx`),
  permanently — not deferred to a follow-up. A tie is not a match: a two-legged
  tie has no single id, and the leg lines are secondary text inside a cell
  rather than a match list. The bracket is a view of ties, and it stays one.
  Agreed in chat 2026-09-02.
- **More than five previous meetings**, and every aggregate over them —
  win/draw/loss records, goal totals. The data supports them; this version does
  not show them.
- **Head-to-head across sources.** A `/kotimaa` page never mixes in a
  football-data meeting and a `/ulkomaat` page never mixes in a TASO one. The
  two id spaces and the two team-id spaces are unrelated.
- **Triggering a sync.** The page reads stored rows only; it never refreshes a
  season. A match nobody's browsing has ever synced is a 404 here, and that is
  correct — every link into this page comes from a list that has synced.
- Anything in #89. This page is public.

## Routes

There is no single match id space: `matches` and `taso_matches` are separate
tables with independent id spaces, so `/ottelu/{id}` alone cannot resolve. The
route therefore carries enough to name **one** source.

`{id}` is the **provider's** match id (`provider_match_id` / `taso_match_id`),
not the serial primary key — the same choice the team pages make with
`teamProviderId`, and the one that survives a re-sync.

| Public URL | App Router path | Table | Scope predicate |
|---|---|---|---|
| `/kotimaa/ottelu/{id}` | `/domestic/match/[id]` | `taso_matches` | `competition_id` **not** `maajp%` |
| `/ulkomaat/ottelu/{id}` | `/foreign/match/[id]` | `matches` | competition's `region === "foreign"` |
| `/maajoukkueet/ottelu/{id}` | `/national-teams/match/[id]` | `matches` | competition's `region === "national-teams"` |
| `/maajoukkueet/huuhkajat/ottelu/{id}` | `/national-teams/mens-team/match/[id]` | `taso_matches` | `competition_id` `maajp%` |
| `/maajoukkueet/helmarit/ottelu/{id}` | `/national-teams/womens-team/match/[id]` | `taso_matches` | `competition_id` `maajp%` |

The domestic predicate is the **negation** of the national one, not
`spljp%`. Almost every Finnish competition lives inside the `spljp{YY}` season
umbrella, but not all: Ykkösliigacup publishes its own `M1LCUP{YY}`
(`competitionIdPrefix` in `domestic-competitions.ts`, 69 rows stored), and a
`spljp%` predicate would make every one of its matches a not-found. The two
predicates are exhaustive over `taso_matches` and cannot both match, which is
the property the routes actually need.

### Why `/maajoukkueet` has two shapes

`/maajoukkueet` is the one region fed by **both** sources: the World Cup and the
Euro come from football-data (`matches`), while Huuhkajat and Helmarit come from
TASO (`taso_matches`, under the `maajp*` buckets). A single
`/maajoukkueet/ottelu/{id}` would have to try both tables and would render the
wrong match whenever one numeric id existed in both.

Measured against the development database on 2026-09-02 (14,001 `matches` rows,
20,604 `taso_matches` rows):

| Question | Answer |
|---|---|
| Ids shared by the two tables at all | **317** |
| Where those 317 land | football-data × `spljp16` — 301 `FL1`, 15 `PL`, 1 `PD` |
| Ids shared inside the `/maajoukkueet` scope (`WC`/`EC` × `maajp*`) | **0** |
| `WC`/`EC` id range | 428742 – 537430 |
| `maajp*` id range | 962445 – 4296364 |
| `spljp*` id range | 277109 – 4348805 |

So the collision is real — 317 of them — and it is only the *scope* that keeps
`/maajoukkueet` clean today. The two id spaces are not structurally disjoint:
TASO ids already run from 277k to 4.3M, straight through football-data's
428k–575k band, and the only reason no `maajp*` id sits inside it is that 226
national-team rows is a small sample. A route that resolved by trying both
tables would be correct by luck, and would start rendering the wrong match the
first time TASO issued a national-team id in that band.

The sub-route removes the ambiguity instead of guarding against it: each of the
five routes resolves against exactly one table.

The scope predicate is not decoration, and the 317 collisions above are the
proof: for those ids, `/kotimaa/ottelu/{id}` and `/ulkomaat/ottelu/{id}` are two
different real matches today. Without the predicate,
`/ulkomaat/ottelu/{a World Cup id}` would also render a national-team match
under the Ulkomaat crumb; with it, that URL is a not-found.

### Redirects

The existing table in `next.config.ts` closes both the English folder path and
the English spelling under a Finnish prefix, for every URL that exists. This
adds the same for the new ones, all `permanent: true`:

- `/domestic/match/:id`, `/kotimaa/match/:id` → `/kotimaa/ottelu/:id`
- `/foreign/match/:id`, `/ulkomaat/match/:id` → `/ulkomaat/ottelu/:id`
- `/national-teams/match/:id`, `/maajoukkueet/match/:id` → `/maajoukkueet/ottelu/:id`
- `/national-teams/mens-team/match/:id`, `/maajoukkueet/huuhkajat/match/:id`
  → `/maajoukkueet/huuhkajat/ottelu/:id`
- `/national-teams/womens-team/match/:id`, `/maajoukkueet/helmarit/match/:id`
  → `/maajoukkueet/helmarit/ottelu/:id`

## UX / UI (Finnish strings)

### Heading

`{koti} – {vieras}`, e.g. `HJK – KuPS`. Same em-dash separator the match lists
use.

### Metadata line, under the heading

Kickoff, then the competition and season, then the round/stage/group — each a
separate line, in this order:

| Line | Example | Source |
|---|---|---|
| Kickoff | `12.09.2026 klo 18.30` | `kickoff_at`, `Europe/Helsinki` |
| Competition and season | `Valioliiga 2025/26` | registry name + `formatSeasonLabel` |
| Round | `Kierros 5` | `matchday`, where it is a round — see below |
| Leg | `Osaottelu 2` | `matchday` on a two-legged knockout round |
| Stage | `Puolivälierät` | `getStageName(stage)` |
| Group | `Lohko A` | `getGroupName(group_name)` (football-data) |
| Series | `Veikkausliiga` | `group_name` verbatim (TASO) |

Only the lines the row actually has. `matchday` is null on plenty of rows,
`stage` is null outside a cup, and `group_name` is null outside a group stage —
a missing line is silence, never `–` and never `Kierros null`.

**What the number means depends on where the match sits**, and the page must not
call all three cases a round. Measured across every stored row on 2026-09-02:

| Where | `matchday` | Shown as |
|---|---|---|
| League season (`REGULAR_SEASON`, 13,184 rows across 9 competitions) | round | `Kierros N` |
| League or group phase of a cup | round | `Kierros N` |
| Two-legged knockout round (CL, ELC) | 1 or 2 | `Osaottelu N` |
| Single-leg knockout (EC) | 4–7 — its group counter running on | nothing |
| Single-leg knockout (WC) | null | nothing |
| Finnish cup round (TASO) | `round_id`, not re-indexed — 63 exists | nothing |

This is the rule the match lists already apply (`fourthColumnFor`), decided from
one row rather than from a round's worth of them, plus the domestic standings
page's reason for dropping the column on a cup: the series name above it —
TASO's own `Kierros 2` — already names the round.

`REGULAR_SEASON` itself is never shown. It is not a phase, it is the absence of
one, and it is a provider token rather than a Finnish word.

The season label needs `spansCalendarYears`, which comes from
`getSeasonContext(competitionCode)` — already `cache()`d and already fetched by
every other football-data page. If that call fails, the match still renders and
the season shows as the bare start year (`2026`); the match is the page, and
losing a slash is not worth an error state. TASO seasons are plain years and
need no call.

### Score

`2–1`, rendered large, from `formatMatchResult` — so an unplayed match reads
`–`, exactly as it does in every list.

Suffixes reuse the bracket's conventions verbatim (`src/components/cup-bracket.tsx`):

- shootout recorded → ` (rp 4–3)` from `penalties_home/away`
- decided in extra time, no shootout → ` (ja)`
- TASO's `winner` with a level score → **no suffix**. TASO never itemises the
  shootout, and printing `(rp)` would assert a shootout the data does not
  record. The winner is shown in bold instead, as the bracket does.

`home_goals`/`away_goals` is the provider's `fullTime` and **includes** the
shootout, so the displayed score is `regular_time + extra_time` where the
breakdown exists — the same correction `BracketLeg` documents.

### Teams

Each name links to its team page, carrying the competition and season the way
every other team link on the site does:

- `/kotimaa/ottelu/*` → `/kotimaa/joukkue/{id}?kilpailu={code}&kausi={seasonId}`,
  where `{code}` is the domestic competition whose category set contains this
  row's `category_id` (reverse of `categoryIdsFor`). If no domestic competition
  claims the category, the name renders as plain text.
- `/ulkomaat/ottelu/*`, `/maajoukkueet/ottelu/*` →
  `{basePath}/joukkue/{id}?kilpailu={competitionCode}&kausi={seasonId}`.
- `/maajoukkueet/huuhkajat/ottelu/*`, `/maajoukkueet/helmarit/ottelu/*` →
  **no links.** Neither Finland nor its opponents have a team page in this
  region; #71's criterion says "its existing team page", and here none exists.
  Names render as plain text, as they already do on the team pages themselves.

National-team names are localised through `toFinnishTeamNames` /
`toFinnishTasoTeamNames`, the same as on the lists they were reached from, so
one country never appears under two spellings.

### Previous meetings

Heading: `Aiemmat kohtaamiset`

The table is `MatchListTable`, so the columns are the site's usual
`Pvm` / `Ottelu` / `Tulos`, plus a fourth naming where the meeting was played:
`Kilpailu` (competition name) for football-data rows, `Sarja` (`group_name`) for
TASO rows. Team names in these rows are not links (`teamHref={null}`) — they are
the same two teams as the heading.

Empty: `Aiempia kohtaamisia ei löytynyt.`

The window sentence sits directly under the heading, and is shown **whether or
not** there are meetings — a short list and an empty list are the two cases it
exists to explain:

| Route | String |
|---|---|
| `/kotimaa` | `Perustuu kaudesta 2015 alkaen tallennettuihin otteluihin.` |
| `/ulkomaat` | `Perustuu kaudesta 2023/24 alkaen tallennettuihin otteluihin.` |
| `/maajoukkueet` (WC/EC) | `Perustuu kaudesta {earliest} alkaen tallennettuihin otteluihin.` |
| Huuhkajat / Helmarit | `Perustuu vuodesta 2018 alkaen tallennettuihin otteluihin.` |

The years are read from the constants that actually bound each source —
`EARLIEST_TASO_SEASON` (2015), `resolveEarliestSeason(FOOTBALL_DATA_EARLIEST_SEASON)`
(2023 by default), a competition's own `earliestSeason` where it has one, and
the oldest year the national-team buckets cover (2018, per specs/018). They are
never hardcoded in the page.

#### Why the sentence is a criterion and not a nicety

Measured on 2026-09-02, over pairs that have actually met:

| Source | Pairs | Mean meetings | Deepest | Pairs with ≤2 |
|---|---|---|---|---|
| football-data (all competitions) | 3,104 | 3.5 | 8 | **1,464 (47%)** |
| TASO Veikkausliiga | 186 | 11.1 | 35 | 19 (10%) |
| Huuhkajat, per opponent | 38 opponents | 2.7 | 6 | — |
| Helmarit, per opponent | 38 opponents | 3.5 | 9 | — |

Nearly **half** of all football-data pairs have two meetings or fewer, against
one in ten in Veikkausliiga, where the deepest pair has 35. A reader moving
between `/kotimaa` and `/ulkomaat` sees a decade on one page and a single
meeting on the next, and nothing on screen would explain why — which is the
sentence's entire job.

`tallennettuihin` ("stored") is the load-bearing word. It claims a window we
looked in, not a set of seasons we guarantee are fully loaded — which is the
truth, since seasons are synced when someone browses them. Saying
"Näytetään kausien 2015–2026 kohtaamiset" would claim completeness we do not
have.

### Not found and errors

Same shape as the team pages — the message renders inside `PageShell`, and the
response stays 200. No `notFound()`; #71 asks for the not-found state "as the
team pages already do", and they do it this way.

The heading of a page with no match is `Ottelu`. The message belongs in the
body, and putting it in both places would state it twice.

- Unknown, malformed or out-of-scope id: `Ottelua ei löytynyt.`
- Query failure: `Ottelun lataaminen epäonnistui. Yritä myöhemmin uudelleen.`
- Head-to-head query failure, match itself fine: the match renders and the
  section shows `Aiempien kohtaamisten lataaminen epäonnistui.` The failure of
  the secondary block must not blank the primary one.

### Page title

`{koti} – {vieras}, {kilpailu} {kausi}` — e.g. `HJK – KuPS, Veikkausliiga 2026`.
Not found: `Ottelua ei löytynyt.`

## API & Data

### No provider calls

Both queries are against stored rows. Two cached calls sit beside them, each on
one pair of routes only, and neither is a new kind of request:

- `getSeasonContext`, on the football-data routes, for the season label.
  Already `cache()`d, already made by every neighbouring page.
- `getSeasonCategoryNameMap`, on the two TASO national-team routes, to name the
  competition. The name is not stored — `taso_matches` keeps the category id,
  and `WUNL` is not a Finnish label — and this is the same cached map the
  Huuhkajat and Helmarit pages already read. Its failure costs one line, not
  the page.

Whichever team's suffix the category name actually carries is the one stripped,
so a hand-typed id pointing at the other team's category cannot leave
"MM-karsinnat Huuhkajat" on the Helmarit page.

### The match lookup

```sql
SELECT * FROM {matches|taso_matches}
WHERE provider_match_id = :id  -- taso_match_id for taso_matches
```

Unique index on both (`matches_provider_match_id_idx`,
`taso_matches_taso_match_id_idx`). The scope predicate from the route table is
then applied to the returned row: a row that fails it is a not-found, not a
render.

### The head-to-head query

```sql
SELECT * FROM {same table as the match}
WHERE ((home_team_provider_id = :a AND away_team_provider_id = :b)
    OR (home_team_provider_id = :b AND away_team_provider_id = :a))
  AND provider_match_id <> :id
  AND kickoff_at < :kickoff
  AND status = 'FINISHED'
  AND home_goals IS NOT NULL AND away_goals IS NOT NULL
  AND {scope predicate}
ORDER BY kickoff_at DESC, provider_match_id DESC
LIMIT 5
```

Point by point, because each clause is a decision:

- **Both orientations.** A meeting is a meeting whichever ground it was on.
- **`<> :id`.** The match is not its own previous meeting. `kickoff_at <` almost
  covers this; the explicit exclusion covers the case where it does not.
- **`kickoff_at <`, not "any other meeting".** "Previous" is relative to *this*
  match, so an upcoming fixture's page lists what came before it, and a page for
  a match played in 2019 does not list 2024 as previous to it.
- **`FINISHED` plus both goals present.** The site-wide definition of a played
  match (`toFinishedMatches`). A postponed or cancelled fixture is not a
  meeting. TASO's `Played`/`Forfeited` normalise to `FINISHED` already.
- **Scope predicate.** The same one the route resolved with, so a Kotimaa page
  cannot surface a Huuhkajat row out of the shared `taso_matches` table.
- **Across competitions, inside the source.** Two Premier League clubs' cup
  meetings count; two Finnish clubs' Suomen Cup meetings count. The fourth
  column names which, so nothing is silently blended.
- **Legs, not ties.** A meeting that was one leg of a two-legged knockout tie
  appears as its own row with its own score, and links to its own match page.
  The head-to-head list is a list of matches; it never aggregates two legs into
  a tie, and never shows an aggregate score. This falls out of querying the
  match rows directly, and it is deliberate: the bracket is where ties are a
  thing, and this page is not the bracket.
- **Placeholder rows are excluded.** A team provider id of `0` is not a team —
  see *Placeholder teams* below — and no head-to-head is attempted for a match
  that has one.
- **`provider_match_id DESC` tie-break.** Two meetings can share a kickoff
  instant; ordering must be total, or the page is non-deterministic.

### Caching

No new cache key and no new TTL. The pages are `dynamic = "force-dynamic"`, like
every other page here; the reads are indexed lookups against Postgres. Redis is
not involved.

### Team ids are the join key, and they were measured

Head-to-head joins on `home_team_provider_id`/`away_team_provider_id`, never on
team names. Measured on 2026-09-02:

| Source | Names | Ids | Verdict |
|---|---|---|---|
| football-data (`matches`) | 315 | 315 | one-to-one |
| TASO Veikkausliiga (`VL`, 12 seasons) | 23 | 22 | no name carries two ids |
| TASO national, men's categories | 44 | 41 | no name carries two ids |
| TASO national, women's categories | 41 | 39 | no name carries two ids |
| TASO, all domestic categories | 928 | 1235 | see below |

Two findings this settles rather than assumes:

- **Inside a competition, a club's id is stable across seasons.** Veikkausliiga
  spans twelve stored seasons and no club name there has more than one id, so a
  head-to-head reaches back through all of them. The 928 → 1235 spread across
  *all* domestic categories is Suomen Cup, where 771 names produce 801 ids —
  reserve and junior sides sharing a parent club's name. Those are different
  teams, and giving them different ids is correct.
- **Ids unify what names split.** 126 domestic ids carry two or more names over
  time (a rename), and on the national-team side 44 men's names resolve to 41
  ids — the English/Finnish duplicate spellings specs/018 had to map by hand.
  Joining on ids is therefore not merely adequate: it is *more* correct than
  joining on names, and a renamed club keeps its history.

Finland's own ids are one per team: **144368** Huuhkajat, **144367** Helmarit,
confirmed by a clean split across every men's and women's category.

### Placeholder teams: id `0`

TASO stores bracket slots that were never resolved to a club as a team with
provider id **`0`** and, usually, an **empty name**. Measured 2026-09-02: 22
such rows, 21 of them `FINISHED` with a real score, in `spljp19/P201` (12),
`spljp22/P201` (5), `spljp17/MSC` (3) and `spljp21/P201` (2). `matches` has
none.

Three of them sit in Suomen Cup, which this site shows, so they are reachable.
They matter here because id `0` is not an identity: joining on it would pair a
match against every other unresolved slot that happened to face the same
opponent, and present the result as previous meetings.

So:

- A team with id `0` or an empty name renders as **`Tuntematon joukkue`** and is
  never a link.
- A match with either team id `0` shows no head-to-head at all. In its place:
  `Aiempia kohtaamisia ei voida näyttää, koska toista joukkuetta ei tunnisteta.`
- The match itself renders normally. Its score is real.

## Linking

`MatchListTable` gains one optional prop:

```ts
/** Builds a match's page href, or `null` where a row should not link. */
matchHref?: ((match: T) => string) | null;
```

The **`Pvm` cell** becomes the link. It is the one column every table has, it is
never a link today, and it does not nest inside the team links the `Ottelu`
column already carries.

All six call sites pass it:

| Call site | Page | Href |
|---|---|---|
| `src/app/domestic/matches/page.tsx` | `/kotimaa/ottelut` | `/kotimaa/ottelu/{id}` |
| `src/app/domestic/standings/page.tsx` (×2) | `/kotimaa/sarjataulukko` | `/kotimaa/ottelu/{id}` |
| `src/app/domestic/team/[id]/page.tsx` | `/kotimaa/joukkue/:id` | `/kotimaa/ottelu/{id}` |
| `src/components/competition-matches-page.tsx` (×2) | `{basePath}/ottelut` | `{basePath}/ottelu/{id}` |
| `src/components/competition-team-page.tsx` | `{basePath}/joukkue/:id` | `{basePath}/ottelu/{id}` |
| `src/components/national-team-page.tsx` | `/maajoukkueet/{huuhkajat,helmarit}` | `/maajoukkueet/{team}/ottelu/{id}` |

The match page's own head-to-head table passes it too.

## Edge Cases

| Case | Behaviour |
|---|---|
| Non-numeric id (`/kotimaa/ottelu/abc`) | `Ottelua ei löytynyt.` — `Number.isNaN` short-circuits before any query, as the team pages do |
| Numeric id with no row | `Ottelua ei löytynyt.` |
| Row exists but fails the route's scope predicate | `Ottelua ei löytynyt.` — never render another region's match |
| Match not yet played | Renders. Score is `–`; previous meetings still list |
| Match played, no previous meeting stored | Table replaced by `Aiempia kohtaamisia ei löytynyt.`, window sentence still shown |
| Fewer than five previous meetings | Shows what exists; window sentence explains the shortfall |
| Level TASO cup tie with `winner` set | Winner in bold, no `(rp)` suffix |
| `matchday`, `stage`, `group_name` null | The line is omitted, not rendered empty |
| `getSeasonContext` fails on a football-data route | Match renders; season shows as the bare start year |
| Head-to-head query throws | Match renders; section shows its own error line |
| Domestic row whose `category_id` maps to no competition | Team names render as plain text |
| Team provider id `0` or empty name (22 TASO rows) | Name renders `Tuntematon joukkue`, no link, no head-to-head |
| Previous meeting was one leg of a two-legged tie | Listed as its own match with its own score, never aggregated |
| Same two teams twice on the same day | Deterministic order via the `provider_match_id` tie-break |

## Performance & Limits

Two queries per page view. The lookup uses the existing unique index.

The head-to-head query has no supporting index today, so it sequentially scans
the table on every page view. Measured with `EXPLAIN (ANALYZE, BUFFERS)` on
`taso_matches` (20,604 rows), a real Veikkausliiga pair:

| | Execution | Buffers |
|---|---|---|
| As it stands (seq scan) | 3.16 ms | 477 |
| With a composite index (bitmap OR) | **0.13 ms** | **26** |

So this spec **adds one index per table**, and only one:

```
matches_head_to_head_idx      on matches      (home_team_provider_id, away_team_provider_id)
taso_matches_head_to_head_idx on taso_matches (home_team_provider_id, away_team_provider_id)
```

A single composite index serves *both* orientations — verified by dropping the
mirrored `(away, home)` index and re-running: the planner scans the same index
twice under a `BitmapOr`, at 0.20 ms. The second index earns nothing and is not
added.

This is the spec's one schema change, and it is an index only: no column, no
backfill, no data migration.

No provider request is issued for the match or the meetings, so no rate limit
applies and no sync can be triggered by traffic to this page. `LIMIT 5` bounds
the second query regardless of how deep the history goes.

## Security & Secrets

No new env var, no new credential, no new outbound host. `DATABASE_URL`,
`FOOTBALL_DATA_TOKEN` and the TASO credentials already in `.env.example` are
unchanged. The route parameter is parsed to a number before it reaches any query
and is bound as a parameter by Drizzle — it never reaches SQL as text. No
secret is committed.

## Acceptance Criteria

- [ ] `/kotimaa/ottelu/{id}`, `/ulkomaat/ottelu/{id}` and
      `/maajoukkueet/ottelu/{id}` each render a single match
- [ ] `/maajoukkueet/huuhkajat/ottelu/{id}` and
      `/maajoukkueet/helmarit/ottelu/{id}` render a single TASO national-team
      match
- [ ] Each page shows the kickoff date and time, the competition, the season,
      and the matchday, stage or group where the row has one
- [ ] Both teams are shown, each linking to its team page on the three routes
      where such a page exists, and as plain text on the two where it does not
- [ ] The score is shown, with `(rp x–y)` where the shootout is recorded and
      `(ja)` where extra time decided it
- [ ] Up to five previous meetings between the two teams are listed, newest
      first, each linking to its own match page, each an individual match —
      a two-legged tie's legs appear as two rows, never as one aggregate
- [ ] The window sentence is shown on every match page, including one with no
      previous meetings
- [ ] Every row of all six existing `MatchListTable` call sites links to the
      match page via its `Pvm` cell
- [ ] An unknown, malformed or out-of-scope id shows `Ottelua ei löytynyt.`
      inside the normal page shell
- [ ] The English spellings of all five new URLs redirect to the Finnish ones
- [ ] Every user-facing string on the page is Finnish

## Tests Required

### Unit — the head-to-head window

`tests/unit/lib/head-to-head.test.ts`

- the sentence, for a season window and for a calendar-year one
- the window each source resolves to: TASO 2015, national teams 2018, the plan
  floor for a league, a tournament's own floor for the World Cup
- a configured `FOOTBALL_DATA_EARLIEST_SEASON` is followed

**The selection itself is tested against a real database, not here.** It is one
SQL statement, and a second implementation in TypeScript to unit-test against
would be a second source of truth for the rule — the thing this repo removes
rather than guards. Its cases live in the integration suite below.

### Unit — score and metadata formatting

`tests/unit/lib/match-detail.test.ts`

- shootout → `(rp 4–3)`; extra time without a shootout → `(ja)`
- TASO level score with `winner` → no suffix
- displayed score excludes the shootout where the breakdown exists
- unplayed match → `–`
- null `matchday`/`stage`/`group_name` produce no line

### Unit — pages

`tests/unit/app/domestic/match/[id]/page.test.tsx`,
`tests/unit/app/foreign/match/[id]/page.test.tsx`,
`tests/unit/app/national-teams/match/[id]/page.test.tsx`,
`tests/unit/app/national-teams/team-match.test.tsx`

Mirroring the existing team-page tests: happy path renders heading, score and
meetings; unknown id renders `Ottelua ei löytynyt.`; out-of-scope id renders the
same; query failure renders the error string; head-to-head failure leaves the
match rendered; `generateMetadata` returns the expected title.

### Unit — table linking

`tests/unit/components/match-list-table.test.tsx`

- with `matchHref`, the `Pvm` cell is a link to the expected href
- without it, the cell is plain text and no `<a>` appears
- team links in the `Ottelu` column are unchanged either way

### Unit — routing

`tests/unit/app/rendering-mode.test.ts` — the new pages are dynamic.

### Integration

`tests/integration/match.test.ts` — both queries against a real Postgres:

- lookup by provider id
- a national-team row is not found under `/kotimaa`, and a foreign row is not
  found under `/maajoukkueet`
- a Ykkösliigacup row **is** found under `/kotimaa`, though it is not a `spljp`
  bucket
- both orientations returned, newest first, capped at five
- the match itself, a later meeting and a third team's match all excluded
- an unplayed meeting excluded
- the bucket boundary holds inside the shared TASO table
- a placeholder team yields no head-to-head at all
- head-to-head spans competitions inside one region, but not across regions

### E2E

`tests/e2e/match.spec.ts`

- from `/kotimaa/ottelut`, clicking a `Pvm` cell lands on a match page whose
  heading names both teams
- the same from `/ulkomaat/ottelut` and from `/maajoukkueet/huuhkajat`
- the window sentence is present
- `/kotimaa/ottelu/999999999` shows `Ottelua ei löytynyt.`

`tests/e2e/redirects.spec.ts` — the five English spellings 308 to the Finnish
URLs.

Run with `--workers=1`; parallel workers hit football-data.org's rate limit.

## Files To Update

- `specs/019-match-page.md` (this file)
- `decisions/019-match-page.md` (written during implementation)
- `next.config.ts` — five rewrites, ten redirects
- `src/app/domestic/match/[id]/page.tsx`
- `src/app/foreign/match/[id]/page.tsx`
- `src/app/national-teams/match/[id]/page.tsx`
- `src/app/national-teams/mens-team/match/[id]/page.tsx`
- `src/app/national-teams/womens-team/match/[id]/page.tsx`
- `src/components/match-page.tsx` — the shared page body
- `src/components/match-list-table.tsx` — the `matchHref` prop
- `src/lib/match-service.ts` — the two queries
- `src/lib/head-to-head.ts`, `src/lib/match-detail.ts` — the pure parts
- `src/lib/match-source.ts` — the source/scope type both of those and the routes share
- `src/lib/cup-stages.ts` — a name for `REGULAR_SEASON`, so the page can suppress it
- `src/lib/national-team.ts` — each team's own base path, and the earliest bucket year
- `src/lib/domestic-competitions.ts` — category id → competition code reverse lookup
- the six call sites listed under *Linking*
- the test files listed above

- `src/db/schema.ts` — one head-to-head index per match table
- `drizzle/` — the generated migration for those two indexes

No change to `.env.example` or to any doc in `docs/setup/`.

## Open Questions

None. All four are settled, in chat on 2026-09-02:

1. **The cup bracket's leg lines and tie rows are not linked** — and not as a
   follow-up either. The bracket stays a view of ties.
2. **Head-to-head lists legs individually.** A leg of a two-legged tie is a
   match, gets its own row and its own score, and is never aggregated.
3. **The context-free team page** (`/joukkue/{id}` with no `kilpailu`/`kausi`)
   is **its own issue, #246, after this one.** The measurements here say it is
   feasible — an id identifies a team, and its competition and season can be
   resolved from its own newest stored match — but it changes the URL contract
   of three existing pages plus their metadata, redirects and e2e tests, which
   is a larger change than the page it would ride along with. This spec
   therefore links teams with the competition and season taken from **the match
   itself**, which is always the right context and needs no new machinery.
4. **National-team opponent pages** wait on #246 too. At 2.7 (Huuhkajat)
   and 3.5 (Helmarit) matches per opponent, such a page would show almost
   exactly what this page's head-to-head block already shows.

Resolved by measurement rather than by argument: the
head-to-head index (now specified, with numbers), the `/maajoukkueet` id
collision (317 collisions exist; 0 inside that scope; ranges not disjoint), and
team-id stability (ids are the right join key, and unify renames and spelling
variants).
