# 040 — Analytics for cup competitions

> **Status: all questions answered in chat on 2026-09-27, awaiting the go.**
> Written for #425.

## Summary

Show the `Analyysit` panels on **cup** team pages, which carry none today. A cup
team page already lists its matches; every panel was built league-format only,
and all but one of them needs no table.

`Sijoitus kierroksittain` stays absent, because a knockout has no table to rank
a position in. Everything else is computed from results, which a cup has.

## Scope

### In scope

- Cup team pages on all three routes: `domestic/team/[id]` (`MSC`, `NSC`),
  `foreign/team/[id]` (`CL`) and `national-teams/team/[id]` (`WC`, `EC`).
- Both providers. Results only.
- **Signed-in readers only**, through `Analyysit`'s existing gate and prompt.

### Out of scope

- The national-team pages `/maajoukkueet/huuhkajat` and `/helmarit` (#459).
  They have no season and no team id, which is a different feature.
- Adding, removing or changing a panel. This changes **where** the existing
  panels appear, not what any of them shows.
- A league position for a cup, in any form.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Cup results in a club's league figures | **Never.** A cup page shows that cup's figures; a league page is unchanged | Miikka, 2026-09-27: *"stay separate"*. specs/038 and specs/039 both rest on cup seasons being excluded from a club's league baseline — a per-match rate that mixed a six-match cup run into a 27-match league season would describe neither. Showing analytics *on* a cup must not fold cup results *into* a league. |
| S2 | `Sijoitus kierroksittain` on a cup | **Absent**, as today | A knockout ranks nobody. This is the rule specs/030 Q2 set, and it is the only panel it still excludes. |
| S3 | Which cups | **Every competition whose format is `cup`** — `MSC`, `NSC`, `CL`, `WC`, `EC` | The gate is a format test, not a list of codes. A per-code list would be a second place to update the first time a cup is added. |
| S4 | The TASO match selection | A selection that does not assume a table | `teamLeagueMatches` keeps only matches in **table** groups, and a cup is entirely `match-list` groups, so it returns nothing for a cup. This is the one piece of real work; see below. |
| S5 | What `Tämä kausi verrattuna` compares against | The club's other **cup** seasons of that competition | S1, applied to the baseline. A cup season compared against league seasons is the same mixing by another route. |
| S6 | Grouping | The existing three (#424); `Ottelu ottelulta` simply holds four panels rather than five | No new group. A cup page is the same page with one panel missing. |
| S7 | `Sijoitus` in `Tämä kausi verrattuna` on a cup | **The row is dropped**, not shown as `–` | Miikka: *"can be dropped, no real value in cup"*. A `–` means "no value this time"; a row that can never have a value on this page is noise rather than information. |
| S8 | Where the cup match selection lives | **Beside `teamLeagueMatches`, not inside it** | Its table-groups-only step is what excludes the Veikkausliiga playoff from every panel. A single function that sometimes skips that step puts the rule one careless edit away from being widened, and a league would then count playoff matches silently. Two functions keep the league rule in one a cup never calls. |
| S9 | `Ennätykset` says which competition it covers | A line under the heading naming the competition(s), e.g. `Suomen Cup` | Miikka: *"as long as it is clear that it refers to that competition"*. The panel says nothing about its scope today, on **any** page — the ambiguity is already there and cups only make it visible beside a league page for the same club. No season count: each record line already names its own seasons. |

### Why S4 is the whole job

The team page's own match list does not go through `teamLeagueMatches`:
`getTeamMatches` uses `selectTeamMatches` over the season's matches with no
group filter, which is why a cup page lists matches while its analytics are
empty. The analytics services read the other way.

So the work is a match selection for the analytics services that does not
assume a table, **beside** `teamLeagueMatches` rather than inside it (S8). The
football-data services have no equivalent problem — `getSyncedSeasonMatches`
returns the season's matches ungrouped — so this is a TASO-side change.

## API & Data

**No new endpoint, no new column, no provider request.** The same stored rows
the cup page already reads.

| Needed | Already there |
|---|---|
| A cup season's matches for a club | `getTeamMatches` / `selectTeamMatches`, which the page uses today |
| Every panel's arithmetic | Unchanged — `formSeries`, `goalsSeries`, `homeAwayStats`, `cleanSheetSeries`, `streaksOf`, `comebacksOf`, `streakRecords`, `compareSeasons` |
| Which competitions are cups | `getCompetitionFormat` and `isDomesticCup`, which are the two gates being changed |

**Caching:** none, as specs/031–039.

## UX / UI (Finnish strings)

**One new string**, and it is a competition name rather than a sentence: the
line under `Ennätykset` naming what the records cover (S9), e.g. `Suomen Cup`,
or `Veikkausliiga, Ykkönen` for a club whose league history spans two. Every
other panel, heading and message already exists.

The panels that behave differently rather than identically:

| Panel | On a cup |
|---|---|
| `Sijoitus kierroksittain` | Not rendered |
| `Vire otteluittain` | Its existing `too-few` state covers a cup run shorter than the five-match window |
| `Tämä kausi verrattuna` | The `Sijoitus` row is **not rendered** on a cup (S7) |
| `Ennätykset` | Works, and gains a line naming its competition (S9). It will rarely join two seasons on `WC` or `EC` — see the note below |

## Edge cases

| Case | Behaviour |
|---|---|
| A cup run of one or two matches | Every panel computes; `Vire` shows its `too-few` state until the fifth |
| A club knocked out in the first round | One match. `Putket` and `Ennätykset` read it as a run of one |
| A `WC` or `EC` team's seasons are four years apart | `Ennätykset` never joins them: specs/039 S1 joins only **consecutive** years, and 2022 and 2026 are not. Correct rather than a limitation — a run cannot span a tournament the team did not play |
| A club plays a league **and** a cup in one year | Two separate pages and two separate sets of figures (S1). Neither counts the other |
| A cup season with no finished match | The existing `Kaudella ei ole vielä pelattuja otteluita.` line |
| A domestic cup whose groups are all `match-list` | The normal case, and exactly what S4 fixes |

## Performance & limits

No provider request. A cup season is small — six to thirteen matches — so every
read is smaller than the league equivalent. `Ennätykset` reads the club's stored
cup seasons, which for `WC` is at most a handful.

## Security & secrets

No new environment variable, no new secret. Behind `canSeeAnalytics()` like
every other panel.

## Acceptance criteria

- [ ] A signed-in reader sees the analytics panels on a cup team page, on all
      three routes
- [ ] `Sijoitus kierroksittain` is absent on a cup, on every route
- [ ] A cup's matches never appear in a league season's figures, and a league
      season's never in a cup's — asserted in both directions
- [ ] `Tämä kausi verrattuna` on a cup compares against that club's other
      seasons of that cup only
- [ ] The TASO read returns a cup's matches, which `teamLeagueMatches` does not
- [ ] A signed-out reader sees the existing single prompt and the page carries
      no computed value
- [ ] No provider request is made for a past season
- [ ] Correct in light and dark, and legible at 375 px
- [ ] `Tämä kausi verrattuna` on a cup renders no `Sijoitus` row at all
- [ ] `Ennätykset` names the competition its records cover, on a cup page and on a league page
- [ ] `teamLeagueMatches` is unchanged, and a league season still excludes its playoff from every panel

## Tests required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/taso-standings-service.test.ts` | The cup match selection returns a `match-list` season's matches, where `teamLeagueMatches` returns none; a league season is unchanged |
| `tests/unit/lib/standings-service.test.ts` | A foreign cup reads; a cup season is not a league baseline and a league season is not a cup baseline |
| `tests/unit/app/**/page.test.tsx` | Each of the three routes asks for the section on a cup, and does not ask for a position series |
| `tests/e2e/cup-analytics.spec.ts` | Signed in, the panels appear on a domestic and a foreign cup page with no `Sijoitus kierroksittain`; signed out, no value in the HTML |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files to update

- `specs/040-cup-analytics.md` (this file)
- `src/components/competition-team-page.tsx` and
  `src/app/domestic/team/[id]/page.tsx` — the two gates
- `src/lib/taso-standings-service.ts` — the cup match selection
- Tests as listed above
- `decisions/040-cup-analytics.md`, written by the implementing agent

## Open questions

**None.** Q1–Q3 were answered in chat on 2026-09-27 and are recorded as S7–S9.

One consequence worth carrying into implementation rather than deciding here:
`StreakRecordsSeries` currently has a `seasons: number` field that nothing
renders. S9 needs the competition names instead, so that field is **replaced**
rather than joined by a second — an unused count beside a used list is the kind
of pair that drifts.
