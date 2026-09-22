# 038 — This season against the club's other seasons

> **Status: all questions answered in chat on 2026-09-21, awaiting the go.**
> Written for #448. Every decision below was taken in conversation on that date.

## Summary

A panel in the team page's `Analyysit` section answering **"is this season
unusual for us?"** — the selected season's measures set against the same
measures averaged over the club's *other* stored seasons. Where every existing
panel describes the selected season, this one gives it a context: 2,05 points a
match means little until you know the club usually takes 1,60.

Miikka, 2026-09-21: *"it's maybe about to compare if the selected season is
different compared to the overall stats of the seasons available"*.

## Scope

### In scope

- One club, the selected season, in `Analyysit`; follows the page's season
  selector like every other panel.
- Both providers. Results only — no event or xG data.
- **Signed-in readers only**, through `Analyysit`'s existing gate and prompt.
- A baseline computed from the club's **other** stored seasons, across all
  competitions, with those competitions named to the reader.

### Out of scope

- **Any measure plotted as a trend across seasons.** This panel compares one
  season to a baseline; it draws no season axis. Five issues that would have
  done that (#443, #444, #445, #446, #330) were folded into this one.
- Streak records, which are #447: their baseline is a record, not a typical
  value, and one heading cannot honestly carry both.
- Comparing this club with another club, or with a league average (#339–#342).
- National teams and cups (#425).

## Settled decisions

Taken in conversation 2026-09-21, with the reasoning that produced them.

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Structure | One panel, one row per measure | `Analyysit` already holds eight panels and #424 exists because of it. One panel rather than five. |
| S2 | Baseline membership | The **other** stored seasons; the selected season is excluded from its own baseline | Self-inclusion drags the baseline toward the value under test. At four seasons it shrank a +0,45 difference to +0,34 — a quarter of the signal, at exactly the sample size where signal is scarcest. |
| S3 | Baseline statistic | Mean | Median was considered and set aside: with three other seasons it rarely differs, and `mediaani` is heavy wording for a fan-facing panel. |
| S4 | Which seasons | **All** stored seasons, with the competitions named | Same-competition-only is the cleaner comparison but leaves every newly promoted club with no baseline at all, every year; promotion is ordinary here (specs/022). Naming the competitions puts the mixing in front of the reader rather than hiding it. |
| S5 | League position | Expressed as a **share of the table**, not a raw place | Rank is the one measure with no fixed scale: finishing 1st of 10 and 10th of 12 averages to "5,5th", which describes nothing. Every other measure keeps its scale across tiers. |
| S6 | Which competitions count | **League seasons only** | `Analyysit` is league-format only today (specs/031, Q2), a position needs a table a cup has not got, and a six-match knockout run folded into a points-per-match average distorts it. |
| S7 | How the per-match measures are averaged | **Pool the other seasons' matches** and compute each measure once over the pool — not a mean of per-season means | A three-match season then contributes three matches' worth automatically. No minimum-match threshold to pick or justify. |
| S8 | How position is averaged | **Mean of the other seasons' positions**, not pooled | A position is a per-season quantity; there is no "pool of positions" to compute one from. This is the one row where S7 does not apply. |
| S9 | Which point of a season position is read at | **The same share of the season completed**, not the same matchday | The selected season is usually the one in progress, so comparing "3rd after 10 matches" with past *final* positions is not like for like. Matching the raw matchday fails for a different reason: 3rd after 20 of 22 matches is nearly final while 3rd after 20 of 27 is not. A share is comparable whatever a season's length — which is the property this panel needs, since Finnish clubs move between competitions of different lengths. One rule still covers both cases: a completed selected season is at 100 %, so the comparison is against final positions. |
| S10 | Which matches the per-match measures use | **All** available matches of the other seasons, not matchday-matched | A rate is comparable whatever the sample; only a rank is a point in time. Deliberately asymmetric with S9 — see the note below. |
| S12 | A refresh that fails while rows exist | **Serve the stored rows**, as every other panel does | Added 2026-09-22 after review. `getStandings` "falls back to stored standings when the provider refresh fails" is an asserted behaviour, and every per-season panel follows it. Erroring only here would make this panel disagree with the eight beside it, about the same season, from the same read. Only the active season can reach this: a past season with rows never refreshes. A refresh that fails and leaves **nothing** is still an error. |
| S11 | Caching | **None.** Measure first; add one only if measurement shows it pays | Nothing on the page caches today, these are small indexed reads, and a cache needs an invalidation story for the active season immediately. A single `inArray` query is the cheaper first fix. |

### Why S9 and S10 differ, deliberately

A **rank** is a position at a moment: 3rd after a fifth of the season and 3rd at
the end are different achievements, so the baseline is read at the same point of
each season (S9). A **rate** — points, goals or clean sheets per match — is not a
moment; it is what the club does on average, so pooling every available match
gives the best estimate of it (S10). Making both rules the same in either
direction would be wrong: restricting the rates to a matching window would throw
away most of the sample for no gain, and pooling positions is not a computation
that exists.

**Both rules use the same set of seasons.** An earlier draft matched position on
the raw matchday, which silently dropped any baseline season shorter than the
selected season's matches played — so the position row and the per-match rows
could rest on different numbers of seasons, and the panel's own
`Verrattuna {n} muuhun kauteen` line could only be true for one of them. Matching
on a share removes that: every stored league season has a 74 % point, so every
season contributes to every row and one count is true for the whole panel.

The denominator this needs is available. The `matches` and `taso_matches` tables
store not-yet-played fixtures — `home_goals` is nullable for exactly that reason
— which is why `toFinishedMatches` exists to filter them out. A season's length
is therefore its stored fixtures, and its completed share is the finished ones
over that.

## API & Data

**No new endpoint, no new column, no new provider request.**

### The multi-season read

The one genuinely new piece. `loadTeamSeasons` (`src/lib/team-seasons.ts`)
already returns every competition-season a club has stored matches for, newest
first, with a match count — the season selector calls it, and it is `cache()`d.
The panel iterates those entries and reads each season's matches through the
existing per-season path.

**The request budget stays at zero, and this is why:** `needsRefresh`
(`src/lib/standings-service.ts`) returns `false` for any past season that has
stored rows, and every season `loadTeamSeasons` returns has rows by definition.
Only the active season can trigger a provider call, and the page already makes
that one for the panels it has today.

### What is reused rather than written

Most of the arithmetic exists:

| Needed | Already there |
|---|---|
| A season's counts for a club | `homeAwayStats` returns `home` and `away` `SideStats`; specs/033 established that the two sum to the standings row, so the season total is their sum |
| Points per match, goals scored and conceded per match, win % | `pointsPerMatch`, `scoredPerMatch`, `concededPerMatch`, `winPercentage` — all take a `SideStats` and return `number \| null` for a side with no match |
| Final position, and the table size behind S5's share | `calculateStandings` |
| Clean-sheet share | `cleanSheetSeries`, whose last point is the season's own rate |

So a "season aggregate" is a `SideStats` plus a position and a table size. The
new code is the multi-season read, the averaging, and the panel.

**Caching:** none (S11). This is the first panel to read more than one season,
so it is the first place a cache could pay — but the decision is to **measure
first**, and to prefer a single `inArray` query over a cache if the reads prove
costly. A cache here would need an invalidation story for the active season
immediately.

## UX / UI (Finnish strings)

Confirmed in chat 2026-09-21. **Six of the row labels already exist in the code
and are reused verbatim**, so a reader meets the same words for the same measure
in two panels.

**Where:** `Analyysit`, after the existing panels.

| String | Where | Status |
|---|---|---|
| `Tämä kausi verrattuna` | panel subheading | settled (Q1) |
| `Verrattuna {n} muuhun kauteen: {competitions}` | the line naming what the baseline covers, e.g. `Verrattuna 11 muuhun kauteen: Veikkausliiga, Ykkönen` | settled (Q1) |
| `Tämä kausi` / `Tavallisesti` | the two column headings | settled (Q1) |
| `Sijoitus` | row label — exists in `league-position-section.tsx` | settled, reused |
| `Pisteitä / ottelu` | row label — exists in `form-chart.tsx` | settled, reused |
| `Tehdyt maalit / ottelu`, `Päästetyt maalit / ottelu`, `Voittoprosentti` | row labels — exist in `home-away-chart.tsx` | settled, reused |
| `Nollapelit` | row label — exists in `clean-sheets-section.tsx` | settled, reused |
| `Joukkueelle ei löydy otteluita muilta kausilta.` | instead of the comparison, when the club has no other stored league season. Miikka's wording, 2026-09-21 | settled (Q2) |
| `Kaudella ei ole vielä pelattuja otteluita.` | when the selected season has no finished match — specs/032's existing string | settled, reused |
| `–` | any measure with no value, never `0` — specs/033 Q7's rule | settled, reused |

## Edge cases

Derived from the code and from S1–S5, not invented. Two of them are open
questions rather than answers, and are marked as such.

| Case | Behaviour |
|---|---|
| The club has **no other stored league season** | The panel renders with the selected season's own values and, instead of the comparison, `Joukkueelle ei löydy otteluita muilta kausilta.` (Q2). The panel is not hidden: the page must not change shape as a club's history grows, and this is exactly where a reader asks "is this normal?". |
| The selected season has **no finished match yet** | The existing `Kaudella ei ole vielä pelattuja otteluita.` line, as the other panels show; no comparison. |
| The selected season is **in progress** | Position is compared at the same **share of the season completed** in each other season (S9). The per-match measures are unaffected and use every available match (S10). |
| A stored season is a **cup or national-team competition** | Excluded from the baseline entirely (S6). A club whose only other stored seasons are cups therefore sees the Q2 line. |
| The club played **a league and a cup in the same year** | `loadTeamSeasons` returns one entry per competition-season; the cup entry is dropped by S6, the league entry counts. |
| A baseline season has **very few matches** | It contributes those matches to the pool and no more (S7). No threshold, and none needed. |
| A baseline season is **shorter or longer than the selected season** | It still supplies a position, because S9 matches a share rather than a matchday. Every stored league season contributes to every row, so one season count is true for the whole panel. |
| A baseline season's share falls **between two matches** | It resolves to a whole match; which way it rounds is an implementation choice the decision record should state, not a spec one. |
| A measure has **no value** for the selected season or the baseline | `–`, never `0` (specs/033, Q7). The existing helpers already return `null`. |
| A season read **fails** | The panel's own error line; the rest of `Analyysit` is unaffected, as each panel loads independently. |

## Performance & limits

- **No provider request**, per the section above. The provider rate limits that
  #363 bounded are untouched.
- **N database reads**, one per stored competition-season: up to about 12 for a
  Finnish club (`EARLIEST_TASO_SEASON` is 2015), and 4 for a foreign one
  (`FOOTBALL_DATA_EARLIEST_SEASON` is 2023, because the plan returns 403 below
  it). The selected season's read is already warm from the other panels.
- Whether those N reads become one query is an implementation choice, not a
  spec one — but the spec's position is that **N small reads are acceptable**
  and a single `inArray` query is a fair optimisation if measurement asks for it.

## Security & secrets

No new environment variable and no new secret. The panel sits behind
`canSeeAnalytics()` like every other analytics panel, and a signed-out request
must not compute any value — the existing gate runs before any loader.

## Acceptance criteria

- [ ] The baseline excludes the selected season (S2), verified by a case where including it would give a visibly different number
- [ ] The baseline spans the club's other **league** seasons across all competitions, and the panel names the competitions it covered (S4, S6)
- [ ] The per-match measures are computed over the **pooled** matches of those seasons, so a short season does not weigh as much as a full one (S7)
- [ ] Position is compared at the **same share of the season completed** in each other season, not at the same matchday and not against past final positions (S9)
- [ ] A baseline season shorter than the selected season still contributes to the position row, so every row rests on the same set of seasons
- [ ] Position is shown as a share of the table, so 1st of 10 and 10th of 12 do not average to a meaningless middle (S5, S8)
- [ ] A club with no other stored league season sees `Joukkueelle ei löydy otteluita muilta kausilta.` and the panel still renders (Q2)
- [ ] A signed-out reader sees the existing single prompt and the page carries no computed analytics value
- [ ] No provider request is made for a past season
- [ ] Every measure with no value shows `–`, never `0`
- [ ] Correct in light and dark, and legible at 375 px

## Tests required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/season-comparison.test.ts` | The baseline excludes the selected season; pooling rather than averaging averages; positions averaged rather than pooled; a share read at the matching point of a season of another length; a club with no other season; `null` propagation |
| `tests/unit/components/season-comparison-section.test.tsx` | A position printed as a place; `–` for a missing value; the baseline column empty rather than zero; the competitions line; the two columns told apart by an outline; nothing signed out |
| `tests/unit/lib/standings-service.test.ts`, `tests/unit/lib/taso-standings-service.test.ts` | Both providers: cups and the selected season left out; a season that ranks nothing kept for its rates; an error rather than a plausible comparison |
| `tests/integration/standings.test.ts` | Against a real database: two stored seasons compared, and `getSeasonMatches` never called for the past one |
| `tests/e2e/season-comparison.spec.ts` | The season's own points per match equal the standings table's `P`/`O`; the competitions line; last in `Analyysit`; no value in a signed-out page's HTML |

Every new test is mutation-checked before review, per
`skills/self-review.md`.

## Files to update

- `specs/038-season-against-history.md` (this file)
- `src/lib/` — the multi-season read and the comparison arithmetic
- `src/components/` — the panel, and its wiring into `analytics-section.tsx`
- Tests as listed above
- `decisions/038-season-against-history.md`, written by the implementing agent
- No `.env.example` or docs change: no new variable, no new provider

## Open questions

**None.** All six were answered in chat on 2026-09-21 and are recorded as S6–S11
and in the UX table above.

The one judgement call left to the spec author — whether the position row and the
per-match rows may rest on different numbers of seasons — was settled on
2026-09-22 by Miikka's rule that *"all charts and such should make sense even
with different lengthy seasons"*. S9 matches a share of the season rather than a
matchday, so they cannot diverge. See the note under the settled decisions.

**Known follow-up, not a blocker.** The four new Finnish strings are agreed as
good enough to build on, and Miikka may revisit the headings once the real page
can be seen — *"they're close enough to go"*. A wording change afterwards is a
one-line chore, not a rework, because every other label is reused from an
existing component.
