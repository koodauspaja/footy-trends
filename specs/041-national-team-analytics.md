# 041 — Analytics for the national teams

> **Status: all questions answered in chat on 2026-09-27, awaiting the go.**
> Written for #459, split out of #425 on 2026-09-27.

## Summary

Show the `Analyysit` panels on `/maajoukkueet/huuhkajat` and
`/maajoukkueet/helmarit`, which carry none today. Both pages already list every
Finland match from 2018 on, folded by calendar year; every panel but one is
computable from those rows.

Two things stood between the panels and this page, and the spec answers both:
the page has **no team id** for Finland, and **no season**.

## Scope

### In scope

- Both national-team pages. They share one component, `NationalTeamPage`, so
  this is one section in one place.
- Nine of the ten panels. `Sijoitus kierroksittain` cannot apply — a friendly
  ranks nobody, the same reason as specs/040 S2.
- **Signed-in readers only**, through `Analyysit`'s existing gate and its single
  prompt.

### Out of scope

- `/maajoukkueet/joukkue/[id]`, the *opponent* pages under the national-teams
  region. They are football-data club pages and already have all ten panels
  (specs/040).
- Adding, removing or changing what a panel computes. This decides **where the
  panels appear and over which matches**, not their arithmetic.
- A season selector. specs/017 and specs/018 chose scrolling over a dropdown for
  85 matches, and nothing here revisits that.
- Youth sides and futsal, which the category suffix already excludes.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Finland's identity | **Normalise at the read boundary**: every national-team match is rewritten so Finland's side carries one reserved negative id, `FINLAND_TEAM_ID` | The eight analytics functions all take `teamId: number` and match on `homeTeamProviderId` / `awayTeamProviderId`. Teaching each to match on a name instead would put `"Suomi"` in eight modules and leave every club page carrying a branch it never takes. TASO has no id for Finland that is stable across categories — which is why `isFinlandMatch` matches the name — so one reserved id is the only thing that *is* stable. Provider ids are positive, so a negative sentinel cannot collide with a real team. |
| S2 | Where the rewriting happens | In the national-team read, beside `isFinlandMatch` — the one place that already knows which side Finland is | One transformation on one path. A rewrite applied in the loaders instead would be applied nine times, and the ninth would be the one that forgot. |
| S3 | The axis for `Ottelu ottelulta` and `Kausi kokonaisuutena` | **The whole history on one axis**: every finished match from 2018 to now, in kickoff order | Miikka, 2026-09-27, choosing "History, plus per-year comparison". A calendar year holds 8–14 matches, which is a short chart and a thin summary; the history is 85 and is what the page is already about. It also needs no selector, so specs/017's decision stands. |
| S4 | The axis for `Muut kaudet` | **A calendar year is the season.** `Tämä kausi verrattuna` sets the newest year against every earlier one; `Ennätykset` stays all-time | Same answer. A comparison needs two comparable periods and the history is one period; a record book wants the longest run it can find, and a year would cut runs at every 31 December. So the two panels in this group read the years, and the record book reads across them. |
| S5 | Where the section sits | **Above the year list**, once, under the page heading | It describes every year, so it cannot sit inside one. |
| S6 | Which year is "this" year | The newest year holding a **finished** match, with no minimum | specs/038 S9 pools the baseline's matches rather than averaging per season, exactly so a short period contributes its own weight and no more. A January with one match played is that rule working, not a case it needs protecting from. |
| S7 | `Sijoitus` in `Tämä kausi verrattuna` | **The row is dropped**, via the existing `UNRANKED_MEASURES` | Built for specs/040 S7 and the same situation: a row that can never have a value here is noise, where `–` would mean "not this time". |
| S8 | The comparison's `competition` field per year | The **year itself**, as a label | `SeasonRead.competition` exists to tell the baseline's periods apart in the panel's own line. On this page a year spans friendlies, qualifiers and a tournament at once, so the competition is not what distinguishes one period from another — the year is. See Q1, which decides how that line reads. |
| S9 | Unfinished and upcoming matches | Excluded from every panel, as everywhere else | The panels are computed from finished matches. Nothing new. |
| S10 | Grouping | The existing three (#424). `Ottelu ottelulta` holds four panels, `Kausi kokonaisuutena` three, `Muut kaudet` two | No new group: this is the same panel set as a cup page, over a different axis. |
| S11 | The comparison panel's wording | **`vuosi` on this page, `kausi` everywhere else.** `Tämä vuosi verrattuna`, and `Verrattuna 8 muuhun vuoteen: 2018, 2019, …` | Miikka, 2026-09-27. The period really is a calendar year here and the page is folded by year, so `kausi` would name something the reader cannot see. The panel takes the word from its caller rather than hardcoding either — one parameter, and no page can disagree with its own axis. |
| S13 | The group headings on this page | `Ottelu ottelulta` unchanged, `Kausi kokonaisuutena` → **`Koko historia`**, `Muut kaudet` → **`Muut vuodet`** | Miikka, 2026-09-28. S3 puts the whole history in the middle group, so `Kausi kokonaisuutena` would head three panels computed from every match since 2018 — a reader would take that for one season. The third follows S11's word so a group cannot disagree with the panel inside it. The club pages keep both headings unchanged; the two come from the caller, like the period word. |
| S12 | What `Ennätykset` covers, in words | **The span of years, not the competitions**: `2018–2026`, or a single year where that is all there is | Miikka, 2026-09-27. The line exists to stop a reader taking one competition's records for the club's whole history (specs/040 S9). Here they *are* the whole history, deliberately crossing every competition, so the useful fact is how far back a record reaches. Nine competition names would also wrap to three lines at 375 px and would have to track TASO's wording, which has already changed twice. |

### Why S1 is most of the work

Everything else on this page is already computed from `NationalTeamMatch`, which
is `NormalizedTasoMatch & { competitionName }` — results, goals, kickoff order
and half-time scores all present. What is missing is only the identity the
functions key on, and S1 supplies it once.

The loaders then flatten `getNationalTeamYears`'s years into one ascending list
of finished matches and pass `FINLAND_TEAM_ID`, and the nine panels work
unchanged.

## API & Data

**No new endpoint, no new column, no provider request.** The same buckets both
pages already read, on the same TTLs — the newest treated as changing, every
older one as immutable.

| Needed | Already there |
|---|---|
| Every Finland match, 2018 on | `getNationalTeamYears(team)` |
| The year a match belongs to | `groupByPlayedYear` / `playedYear`, in Finnish local time |
| Every panel's arithmetic | Unchanged: `formSeries`, `goalsSeries`, `homeAwayStats`, `cleanSheetSeries`, `streaksOf`, `comebacksOf`, `streakRecords`, `comparisonFor` |
| Dropping the `Sijoitus` row | `UNRANKED_MEASURES` (specs/040) |

**Caching:** none added. The analytics read rows the page has already fetched.

## UX / UI (Finnish strings)

**Two new strings, both decided (S11, S12).** Every other heading, message and
panel name already exists.

| String | Where | Value |
|---|---|---|
| The comparison heading | `season-comparison-section.tsx`, passed by this page | `Tämä vuosi verrattuna` |
| Its baseline line | same | `Verrattuna 8 muuhun vuoteen: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025` |
| The records' scope line | `streak-records-section.tsx`, passed by this page | `2018–2026`, an en dash, or one year alone when the history holds one |
| The middle group heading | `analytics-section.tsx`, passed by this page | `Koko historia` (S13) |
| The third group heading | same | `Muut vuodet` (S13) |

The panels that behave differently rather than identically:

| Panel | On a national-team page |
|---|---|
| `Sijoitus kierroksittain` | Not rendered |
| `Vire otteluittain` | The five-match window runs across the whole history |
| `Koti- ja vierastilastot` | Home is a match played in Finland, which is what TASO's home side means here |
| `Tämä vuosi verrattuna` | The newest year against every earlier one, and no `Sijoitus` row. Heading and line both say `vuosi` (S11) |
| `Ennätykset` | All-time, its line naming the span of years (S12) |

## Edge cases

| Case | Behaviour |
|---|---|
| A year with one finished match | It is a year like any other: the selected year's rates are read from one match, and as a baseline it contributes one match to the pool (S6) |
| The newest bucket has no finished match yet | The newest year that *does* is "this" year. In January that is last year, which is correct — it is the most recent football there is |
| A bucket fails to load | The page's existing `incomplete` state already says so. The panels compute from the years that loaded, because a partial history is still a history — **worth a reviewer's eye**: a silently shorter record book is the risk |
| Two matches on one day | `byKickoffThenId` already orders them, so the axis cannot reorder between renders |
| 85 points on one axis at 375 px | The charts must stay legible — #441 resized the labels for exactly this. Checked at 375 px, not asserted by a test |
| A competition Finland played once | `Ennätykset` and the charts include it; no panel filters by competition (S3) |
| The whole history is one match | Every panel renders its existing too-few state. Not reachable for either team today |

## Performance & limits

No provider request beyond what the page already makes. 85 matches per team is
smaller than a single league season's read, and the panels are computed in one
pass over rows already in memory.

## Security & secrets

No new environment variable, no new secret. Behind `canSeeAnalytics()` like
every other panel.

## Acceptance criteria

- [ ] A signed-in reader sees the `Analyysit` section on both national-team
      pages, above the year list
- [ ] The section carries nine panels, and never `Sijoitus kierroksittain`
- [ ] `Ottelu ottelulta` and `Kausi kokonaisuutena` cover every finished match
      from 2018 on, in kickoff order — not one year's
- [ ] `Tämä kausi verrattuna` sets the newest year holding a finished match
      against every earlier year, and renders no `Sijoitus` row
- [ ] `Ennätykset` reads across year boundaries, so a run spanning 31 December
      is one run, and its line names the span of years rather than competitions
- [ ] The comparison panel says `vuosi` on these two pages and still says
      `kausi` on every club page
- [ ] The groups read `Ottelu ottelulta`, `Koko historia` and `Muut vuodet`
      here, and are unchanged on every club page
- [ ] Only Finland's matches reach any panel — the two categories that are
      entirely other teams' contribute nothing
- [ ] Finland is identified by one reserved id, and no real team can share it
- [ ] A signed-out reader sees the existing single prompt, and the page carries
      no computed analytics value
- [ ] No provider request is made beyond the page's existing reads
- [ ] Correct in light and dark, and legible at 375 px with the full history on
      the axis
- [ ] Both pages, not only Huuhkajat

## Tests required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/national-team.test.ts` | The normalisation puts `FINLAND_TEAM_ID` on Finland's side whichever side that is, leaves the opponent's id alone, and is a no-op for a match Finland is not in |
| `tests/unit/lib/national-team-service.test.ts` | The flattened history is ascending and finished-only; the newest year with a finished match is the selected one; a failed bucket shortens the history rather than failing the section |
| `tests/unit/components/national-team-page.test.tsx` | The section is asked for above the year list, with no position loader; signed out, one prompt and no value |
| `tests/unit/components/season-comparison-section.test.tsx` | The period word comes from the caller: `vuosi` renders in heading and line, and the club pages' `kausi` is unchanged |
| `tests/e2e/national-team-analytics.spec.ts` | Signed in, the nine panels on both pages with no `Sijoitus kierroksittain`, `Tämä vuosi verrattuna`, and `Ennätykset` showing a year span rather than a competition name; signed out, no panel name in the HTML |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files to update

- `specs/041-national-team-analytics.md` (this file)
- `src/lib/national-team.ts` — `FINLAND_TEAM_ID` and the normalisation (S1, S2)
- `src/lib/national-team-service.ts` — the history and the year split the
  loaders read
- `src/components/national-team-page.tsx` — the section and its nine loaders
- `src/components/season-comparison-section.tsx` — the period word, from the
  caller (S11)
- `src/components/streak-records-section.tsx` — the scope line (S12). Note the
  consequence: `StreakRecordsSeries.competitions` was added in #425 to name a
  competition, and now has to carry either a span or a list. One field with two
  meanings is the pair that drifts, so the implementing agent decides whether it
  becomes one honest `scope` line built by each service — and records it
- Tests as listed above
- `decisions/041-national-team-analytics.md`, written by the implementing agent

## Open questions

**None.** Q1 and Q2 were answered in chat on 2026-09-27 and are recorded as S11
and S12; the group headings they implied were answered on 2026-09-28 and are
recorded as S13.
