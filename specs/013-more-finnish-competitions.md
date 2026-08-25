# 013 — More Finnish competitions

## Summary
Extends `/kotimaa` from Veikkausliiga alone to ten Finnish league competitions
sourced from TASO, which requires the storage and standings layers to learn
three things they do not know today: which *category* a match belongs to, that
a season's competition can live under a different `category_id`, and that
`starting_points` carries points deductions and qualifying bonuses that the
current table silently drops.

## Scope

### In scope

#### The ten competitions
`?kilpailu=` selects between these, all league-shaped and all rendered by the
three existing `/kotimaa` pages (standings, season match list, team matches):

| `?kilpailu=` | Name shown in the picker | Seasons | `category_id` by season |
|---|---|---|---|
| `VL` | Veikkausliiga | 2015–2026 | `VL` |
| `M1L` | Ykkösliiga | 2024–2026 | `M1L` |
| `M1` | Ykkönen | 2015–2026 | `M1` |
| `M2` | Miesten Kakkonen | 2015–2026 | `M2` |
| `NL` | Briotech Kansallinen Liiga | 2015–2026 | `NL` |
| `N1` | Kansallinen Ykkönen | 2015–2026 | `N1` |
| `P21SM` | P21 SM | 2015–2026 | `P21SM` 2026 · `P20SM` 2017–2025 · `ASM` 2015–2016 |
| `P211` | P21 Ykkönen | 2015–2026 | `P211` 2026 · `P201` 2017–2025 · `APY` 2015–2016 |
| `P18SM` | P18 SM | 2015–2026 | `P18SM` 2026 · `P17SM` 2017–2025 · `BSM` 2015–2016 |
| `T18SM` | T18 SM | 2015–2026 | `T18SM` 2017–2026 · `BTSM` 2015–2016 |

Every mapping above was confirmed against `getCategories` for all twelve
seasons. Ykkösliiga genuinely has no history before 2024 — it was created when
the men's second tier was renamed, and `M1` (Ykkönen) continued as a separate,
lower competition, so it gets no predecessor entry.

`?kilpailu=VL` keeps working unchanged; the codes above are the current
`category_id`s, so no existing URL breaks.

#### Category-aware storage
- `taso_matches` gains a `category_id` column, `NOT NULL`, existing rows
  backfilled to `'VL'`. Confirmed necessary: `group_id` is not unique across
  categories — Veikkausliiga, Kakkonen and Ykkönen each have a group 1 in
  `spljp26` — so without it a second competition's matches are stored
  indistinguishably from Veikkausliiga's.
- `category_id` joins the composite read index, which becomes
  `(category_id, competition_id, season_id, group_id)`.
- The unique index on `taso_match_id` is **unchanged**. Confirmed live that
  TASO's `match_id` is unique across categories: 710 ids across six categories
  in `spljp26`, zero collisions. `category_id` is a filter and index column,
  not part of uniqueness.
- Every service-layer function that takes `competitionId` takes `categoryId`
  alongside it, and every TASO request already passes `category_id` (spec 009
  hardcoded it to `VL`; it becomes a parameter).

#### A new `taso_group_teams` table
`getGroups`' per-team rows are stored rather than only Redis-cached, because
own-calculated standings now depend on `starting_points` and must not silently
change when Redis is cold or TASO is unreachable. Columns: `category_id`,
`competition_id`, `season_id`, `group_id`, `team_provider_id`, `team_name`,
`starting_points`, plus TASO's own published `points`, `matches_played`,
`matches_won`, `matches_tied`, `matches_lost`, `goals_for`, `goals_against`,
`goals_diff`, `current_standing`, `final_group_standing`. Unique on
`(category_id, competition_id, season_id, group_id, team_provider_id)`. Synced
on the same freshness rule as matches (see Caching).

This replaces `getCachedSeasonGroups`' Redis cache, which is removed.

#### `starting_points`, the three meanings
Confirmed by recalculating all 262 in-scope groups from their own matches and
comparing team-by-team against TASO's published points. 260 reconcile exactly:

- **A carry-over seed** (54 groups, the 2015–2024 convention).
  `starting_points` equals the team's points in the parent group, and
  `matches_played` counts the child group's own matches only.
- **Deduction or bonus** (46 groups). Negative is a points deduction
  (Veikkausliiga 2016 −6, Ykkösliiga 2025 −2, Ykkönen 2025 −3/−2 and 2026 −3,
  Kansallinen Liiga 2025 −2). Positive 1–3 is a qualifying-series seeding bonus
  every junior SM season carries — verified e.g. P21 SM 2026, JäPS 13
  calculated + 1 = 14 published.
- **Not a seed at all**, with the parent's matches folded into
  `matches_played` instead (17 groups, TASO's convention from 2025 on). Sixteen
  of these carry `starting_points: 0`; the seventeenth (Ykkönen 2025's Alempi
  jatkosarja) carries a deduction, which is how we know the two meanings can
  coexist in one group.

The standings calculation therefore becomes:

```
contributing = the group's own matches
             + the parent group's matches, when the group has a carry-over entry

seed[team]   = points from the parent's matches alone, when the entry is seeded
             (0 otherwise)

adjustment[team] = starting_points[team] - seed[team]

points[team] = calculateStandings(contributing)[team].points + adjustment[team]
```

`adjustment` is 0 for every seeded group observed, and recovers a deduction
correctly if a seeded group ever carries one — a combination not seen in twelve
seasons, and the reason the subtraction is there rather than a flat "ignore
`starting_points` when seeded".

Applying `adjustment` fixes Veikkausliiga 2016, where PK-35 Vantaa currently
renders 19 points against TASO's 13. That defect is in scope here rather than
as a separate bug, confirmed in chat.

#### Carry-over configuration
`CARRY_OVER_CONFIG` is re-keyed from `competition_id` to
`category_id → competition_id → group_id`, and each entry gains a `seeded`
flag distinguishing the two conventions above. 71 entries are needed; all are
derived and listed in the audit referenced under Files To Update, and all are
fixture-validated per the existing `taso-carry-over.test.ts` pattern.

Distribution: Veikkausliiga 12, Ykkösliiga 1, Ykkönen 10, Kakkonen 18,
Kansallinen Liiga 20, Kansallinen Ykkönen 8, T18 SM 2 (under `BTSM` 2015). The
three P21/P18 competitions need none — every group in their twelve seasons is
independent.

Kakkonen is the first competition where one parent has two children
(`4→1, 7→1` in 2024–2025: Ylempi and Alempi jatkosarja both continue Lohko A)
and where parents are parallel rather than singular (`5→2`, `6→3`). The
existing `Record<groupId, parentGroupId>` shape already expresses this.

Kept as explicit configuration rather than derived from the data at render
time, confirmed in chat, even though this raises maintenance from one or two
entries per new season to roughly ten. A wrong entry is invisible in
production — the table still renders, with wrong points — so it is worth the
cost, and the mismatch fallback below bounds the damage of a *missing* one.

Which 2026 entries ship is decided per competition, not per season, because the
ten competitions are not at the same point in their calendars. Veikkausliiga
2026 still has only Runkosarja, so its entry stays pending exactly as spec 009
left it. Kansallinen Liiga and Kansallinen Ykkönen have already split — their
seasons are shorter (8 and 10 teams against Veikkausliiga's 12) — and their
2026 split groups have matches played and reconcile exactly, so both entries
are included. A mid-season validation is sound here because the parent-child
relationship does not change as more matches are played, only the totals do;
re-check both at season end regardless.

#### The origin-group rule
`isOwnCalculated`'s "the lowest `group_id` present is the origin group" is
replaced by "a group with no carry-over entry has no parent". Confirmed
necessary three ways:
- Kakkonen has three parallel pools (Lohko A/B/C), each its own origin; under
  the current rule two of three would render pass-through with no round
  selector.
- Group ids do not start at 1: P21 Ykkönen 2026 uses 2–5, Ykkönen 2019 has
  only group 2, Kansallinen Ykkönen 2020 only group 4.
- A season's groups are not contiguous: P20 Ykkönen 2024 uses 1, 2, 10, 11, 12.

#### Pass-through becomes a mismatch fallback
Spec 009's pass-through path exists so that a split group whose carry-over is
not yet validated shows TASO's own numbers rather than a silently wrong table.
Its trigger changes from "not the lowest `group_id`" to a direct comparison:

- Compute the group's own-calculated **full-season** table.
- If every team's points equal TASO's published `points` for that group, render
  own-calculated, with the round selector.
- Otherwise render TASO's published numbers, with no round selector and the
  footnote below.

This keeps the guarantee spec 009 wanted and removes the heuristic. It is also
the accepted answer for the two groups this audit could not explain — P20
Ykkönen 2019 group 4 and 2022 group 4, where TASO's published points sit 3–4
below the computed figure for individual teams with nothing to account for it.
Confirmed in chat: the cause is not investigated further, and the footnote is
what the reader gets instead.

#### Forfeited and planned matches
`normalizeStatus` learns two statuses confirmed live: `Forfeited` (36 matches,
all in P20 Ykkönen) → `FINISHED`, since TASO counts a walkover as its recorded
3–0 result and the current code drops it from the table entirely; and
`Planned` (12 matches) → `SCHEDULED`, an unscheduled fixture.

#### Per-season competition names
The picker shows the current name from config. A season's own page shows that
season's `category_name` from `getCategories`, which is not stable: `NL` is
"Naisten Liiga" 2015–2019, "Kansallinen Liiga" 2020–2024 and "Briotech
Kansallinen Liiga" from 2025; `M1` alternates between "Ykkönen" and "Miesten
Ykkönen". When the season's name differs from the current one, the current name
is shown underneath the heading (see UX).

#### A group with matches but no team rows
`isPlayoffGroup` requires at least one team, so a group with a match but no
team rows in `getGroups` falls through to a heading over an empty table. Three
exist in 2026 (the P21 SM, P18 SM and T18 SM qualifying matches). Such a group
renders as a match list, the same as a knockout group.

### Out of scope
- **Suomen Cup (`MSC`, `NSC`) and every other knockout competition.** Confirmed
  in chat: a cup needs bracket UI, which is #68.
- **Every TASO category outside the ten above** — the regional cups (`MRC`,
  `MRRC`, `NRC`, `NRRC`), the qualification categories (`VLK`, `M1LK`, `M1K`,
  `N1K`, `NLK`), `N2` (Naisten Kakkonen), and the SM qualifying series
  (`P21SMK`, `P18SMK`, `T18SMK`).
- **Grouping the picker** by gender or by adult/youth. Confirmed in chat: the
  list stays flat, even though TASO supplies `category_group_name`.
- **Merging the Finnish list into `SUPPORTED_COMPETITIONS`.** Spec 009 says the
  two lists stay separate; unchanged.
- **Veikkausliiga's official conditional tie-break cascade** — still not built,
  and now not built for nine more competitions. Unchanged from spec 009.
- **The 2026 Veikkausliiga carry-over entry.** Spec 009 left it pending until
  the split groups exist; they still do not (2026 has only Runkosarja). Adding
  it is not part of this work.
- **A merged single table across split groups**, unchanged from spec 009.
- **Any football-data.org change.** `/ulkomaat` is untouched.

## UX / UI (Finnish strings)

### `/kotimaa` picker
- Heading: `Valitse kilpailu` (unchanged).
- Ten entries, flat, in the order listed in Scope, each linking to
  `/kotimaa/sarjataulukko?kilpailu={code}`. Each shows the competition's
  **current** name and the existing 🇫🇮 marker.

### `/kotimaa/sarjataulukko`
- Heading: `{season's own category name} {season}` — e.g. `Naisten Liiga 2016`,
  `Briotech Kansallinen Liiga 2026`, `Miesten Kakkonen 2020`.
- When the season's name differs from the competition's current name, a muted
  line directly under the heading: `nykyisin {current name}` — e.g. under
  `Naisten Liiga 2016`, the line `nykyisin Briotech Kansallinen Liiga`. Shown
  only on a difference, so the common case has no extra chrome.
- Group headings, table columns (O/V/T/H/TM/PM/ME/P), round selector
  ("Kierros" / "Koko kausi"), season selector and error/empty copy are all
  unchanged from spec 009.
- **Mismatch footnote**, shown under a group rendered from TASO's published
  numbers: `Näytetään Palloliiton omat pisteet: ne poikkeavat otteluista
  lasketuista. Kierrosvalitsin ei ole käytössä tässä ryhmässä.`
- The 2015/2018 `group_name === "1"` → "Runkosarja" fallback from spec 009 is
  unchanged, and applies per competition (Ykkönen 2015–2018 and Kansallinen
  Ykkönen 2018 use the same literal `"1"`).

### `/kotimaa/ottelut` and `/kotimaa/joukkue/:id`
Copy unchanged from spec 009. Both keep the `group_name` column, which now
matters more: a Kakkonen season spans three parallel pools.

### Invalid parameters
- Unknown `?kilpailu=`: existing `Kilpailua ei löytynyt. Näytetään {name}.`
- A season outside the selected competition's range — e.g.
  `?kilpailu=M1L&kausi=2016`: existing `Kautta ei löytynyt. Näytetään kausi
  {season}.`, falling back to that competition's default season.

## API & Data

### Endpoints
- `GET /taso/rest/getMatches?competition_id={id}&category_id={category}` —
  unchanged except that `category_id` becomes a parameter.
- `GET /taso/rest/getGroups?competition_id={id}&category_id={category}` — same,
  and now read for **every** group rather than only unresolved ones, because
  `starting_points` feeds the calculation.
- `GET /taso/rest/getCategories?competition_id={id}` — **new**. Returns all 28
  categories for a season in one response; used for per-season names. Fields
  read: `category_id`, `category_name`.
- `GET /taso/rest/getCompetitions` — unchanged (season discovery, spec 011).
  It is competition-agnostic by construction: a `competition_id` identifies a
  season of all Finnish football, so all ten competitions share one lookup.

### Caching
- `taso_matches` and `taso_group_teams` are both stored, and both refreshed on
  the existing `needsRefresh` rule: the current season is refetched when the
  newest stored row is older than `15 * 60` seconds; a completed season is
  never refetched once synced. `needsRefresh` is now evaluated per
  `(category, competition, season)`, not per `(competition, season)`.
- A completed season is therefore synced once and never refetched, so a
  retroactive change to it — a deduction applied months later — is not seen.
  The same applies if TASO edits a `starting_points` value in place rather than
  restating the group. Both are accepted deliberately; the escape hatch is the
  operator-triggered re-sync tracked as #150, not a shorter TTL.
- `getCategories` is Redis-cached under `taso:categories:{competitionId}`,
  `15 * 60` seconds for the current season and one year for a completed one —
  the TTL rule the removed `getCachedSeasonGroups` used.
- `resolveTasoSeasonContext`'s `taso:season-context` cache is unchanged, but
  its "does the current season have matches" probe is scoped to Veikkausliiga
  rather than being run per competition. Confirmed safe: a `competition_id` is
  published for all categories at once.

### Season resolution
`competitionIdFromSeason` (`2026` → `spljp26`) is unchanged. New:
`categoryIdForSeason(code, seasonId)` resolves the per-season `category_id`
from the config table in Scope, and `earliestSeasonFor(code)` gives the season
selector's floor — 2024 for Ykkösliiga, 2015 for the rest.

## Edge Cases
- **A season before the competition existed** (`?kilpailu=M1L&kausi=2016`) —
  rejected by the season parameter check against that competition's own range,
  falling back to its default season with the existing notice.
- **A `round_id` of 0.** Confirmed in six in-scope groups (P20 Ykkönen 2017
  groups 6 and 9, B-tyttöjen SM 2015 group 3, and three knockout groups). The
  round selector's membership check already tolerates it, and
  `withContinuedRoundNumbering` maps it onto the parent's next round like any
  other value; it must not be treated as "no round".
- **Parallel groups sharing one round scale.** Kakkonen's three pools all run
  rounds 1–18 and P21 Ykkönen's spring and autumn groups all run 1–9, so
  "Kierros 5" filters every group to its own round 5. This is correct per
  group but means one selector value spans unrelated series; accepted rather
  than introducing a per-group selector.
- **A split group restarting its round numbering at 1.** 35 of the 71
  carry-over groups overlap their parent's round range, against 36 that
  continue it. `withContinuedRoundNumbering` (#133) already derives the shift
  from the data; it is only re-keyed to be category-aware here.
- **A group whose `getGroups` entry has zero teams** but which has matches —
  rendered as a match list, not an empty table.
- **A knockout group**, detected as today by every team missing `points` —
  eleven in scope, unchanged behaviour.
- **TASO's published points disagreeing with the calculation** — the group
  falls back to TASO's numbers with the footnote. Two known cases (P20 Ykkönen
  2019 group 4, 2022 group 4) plus any future split group whose carry-over
  entry has not been added yet.
- **`getGroups` unavailable while matches are stored** — standings for a group
  with no stored `taso_group_teams` rows render own-calculated with a zero
  adjustment, which is correct for the 126 groups that need none and wrong only
  for a group that has an adjustment. Logged, not silently swallowed.
- **A team appearing in more than one group in a season** — unchanged from spec
  009, and now also across parallel pools (a Kakkonen team promoted mid-season
  between jatkosarjat).
- **`Forfeited` with no recorded score** — treated as any other match with null
  goals: excluded from the table, listed in the match list.
- **A dateless aggregate row** — unchanged from spec 009: skipped at
  normalization.
- **The two-legged final rows and the `spljphhl26` season-id trap** — unchanged
  from specs 009 and 011.

## Performance & Limits
- No usage limit assumed for TASO (unchanged from spec 009); caching exists to
  avoid redundant work.
- Backfill volume: ten competitions × twelve seasons. Measured per-season match
  counts range from 45 (T18 SM 2025) to 513 (Kakkonen 2015); the ten
  competitions total roughly 17,000 matches across all seasons — well within
  Postgres, and each season is synced once and then never refetched.
- A season's `getMatches` response is roughly 0.6–1.1 MB per category.
  Syncing is per competition and per season, triggered by a page view, so no
  single request fetches more than one.
- `taso_group_teams` adds roughly 2,300 rows across the full backfill.
- No new client-side requests; all TASO calls stay server-side.

## Security & Secrets
- `TASO_API_KEY` — unchanged, already in `.env.example`, read server-only,
  never logged, never sent to the client. No new env var.
- `Referer`/`Origin`/`User-Agent` remain fixed non-secret constants.
- No secrets committed.

## Acceptance Criteria
- [ ] `/kotimaa` lists all ten competitions, flat and ungrouped, each linking to
      its own standings page.
- [ ] `?kilpailu=` selects between all ten; `?kilpailu=VL` behaves exactly as
      before this change.
- [ ] One competition's matches, groups and standings never appear under
      another: Kakkonen 2026's Lohko A and Veikkausliiga 2026's Runkosarja both
      exist as group 1 in `spljp26` and render as separate competitions.
- [ ] Each competition's season selector covers only its own seasons —
      Ykkösliiga 2024–2026, the other nine 2015–2026.
- [ ] P21 SM, P21 Ykkönen and P18 SM show seasons back to 2015 via their
      predecessor category ids, and T18 SM back to 2015 via `BTSM`.
- [ ] Veikkausliiga 2016 shows PK-35 Vantaa on 13 points, matching TASO, not 19.
- [ ] P21 SM 2026's table matches TASO exactly, including the 1–3 point
      qualifying bonuses.
- [ ] Kakkonen 2026 renders three own-calculated tables (Lohko A, B, C), each
      with a working round selector.
- [ ] P21 Ykkönen 2026 renders all four of its groups (ids 2–5) own-calculated,
      despite there being no group 1.
- [ ] Every configured carry-over group's final-round standings match TASO's
      published points exactly, for all 71 entries.
- [ ] A group whose calculation disagrees with TASO's published points renders
      TASO's numbers, no round selector, and the Finnish footnote.
- [ ] A group with matches but no team rows renders as a match list.
- [ ] A forfeited match counts toward the table.
- [ ] A past season's heading shows that season's own name, with `nykyisin
      {current name}` underneath when it differs.
- [ ] `/kotimaa/ottelut` and `/kotimaa/joukkue/:id` work for all ten
      competitions, scoped to the selected one.
- [ ] A TASO failure shows the existing generic Finnish error copy on all three
      pages.

## Tests Required
- `tests/unit/lib/domestic-competitions.test.ts` — the ten-competition list;
  `categoryIdForSeason` across every boundary (2016/2017 and 2025/2026 for the
  junior competitions, 2023/2024 for Ykkösliiga); `earliestSeasonFor`;
  `parseDomesticCompetitionParam` accepting all ten and rejecting `MSC`.
- `tests/unit/lib/taso.test.ts` — `category_id` threaded into every request URL;
  `Forfeited` → `FINISHED` and `Planned` → `SCHEDULED`; `getCategories`
  normalization; `round_id` of 0 surviving normalization as 0, not null.
- `tests/unit/lib/taso-standings-service.test.ts` — the adjustment formula for
  each of the three `starting_points` meanings; a group with no parent and no
  adjustment; the origin-group rule with non-contiguous group ids (2, 3, 4, 5)
  and with three parallel pools; the mismatch fallback rendering TASO's numbers
  and suppressing the round selector; a zero-team group with matches rendering
  as a match list; category scoping (two categories sharing group 1 in one
  season do not mix).
- `tests/unit/lib/taso-carry-over.test.ts` — extended to all 71 entries, each
  asserted against a captured fixture, with the existing coverage check that
  fails when a config entry has no fixture. Fixtures keyed by category as well
  as competition.
- `tests/unit/app/domestic/page.test.tsx` — all ten competitions listed, flat.
- `tests/unit/app/domestic/standings/page.test.tsx` — per-season heading name
  and the `nykyisin` line's presence and absence; the mismatch footnote.
- `tests/unit/db/schema.test.ts` — `category_id` on `taso_matches` and the new
  index shape; the `taso_group_teams` table and its unique index.
- `tests/integration/taso.test.ts` — sync and read paths scoped by category
  against real Postgres, including two categories with colliding `group_id`s in
  one season; `taso_group_teams` upsert.
- `tests/e2e/domestic-standings.spec.ts` — extended to a second competition.

## Files To Update
- `specs/013-more-finnish-competitions.md` (this file)
- `src/lib/domestic-competitions.ts` — the ten-competition config, per-season
  category resolution, per-competition season floors
- `src/lib/domestic-page-context.ts` — competition-aware season range and names
- `src/lib/taso.ts` — `category_id` as a parameter, `getCategories`, the two new
  statuses
- `src/lib/taso-standings-service.ts` — category-keyed carry-over config with
  the `seeded` flag, the adjustment formula, the origin-group rule, the
  mismatch fallback, `taso_group_teams` sync
- `src/db/schema.ts` + `drizzle/migrations/0004_*.sql` — `category_id` with the
  `'VL'` backfill, the new index, `taso_group_teams`
- `src/app/domestic/page.tsx` — ten entries
- `src/app/domestic/standings/page.tsx` — per-season name, `nykyisin` line,
  mismatch footnote
- `src/app/domestic/matches/page.tsx`, `src/app/domestic/team/[id]/page.tsx` —
  category threading
- `src/components/taso-standings-controls.tsx`,
  `src/components/taso-season-only-controls.tsx` — per-competition season lists
- `tests/**` as listed above; `tests/fixtures/taso-carry-over.json` extended
- `decisions/013-more-finnish-competitions.md` (written during implementation)
- `docs/setup/` — a note that `getCategories` is the source of per-season names

Supporting data: the audit behind every figure in this spec (262 groups
recalculated against TASO's published points, the 71 carry-over entries, the
season coverage matrix) is at
<https://claude.ai/code/artifact/6dc7be6a-9867-4ed2-bcd1-cb4a35dacfcc>.

## Open Questions
None. Two known unknowns were raised and both are accepted rather than left
open, confirmed in chat:

- **Why P20 Ykkönen 2019 group 4 and 2022 group 4 do not reconcile.** The only
  two of 262 groups this audit cannot explain. Accepted as-is: they fall to the
  mismatch fallback, which shows TASO's own numbers and tells the reader so in
  the footnote under UX. No further investigation before implementation.
- **Whether `starting_points` can be changed mid-season.** Considered unlikely
  and accepted either way — the current season's 15-minute refresh would pick a
  change up, and a completed season's re-sync is what #150 exists for.
