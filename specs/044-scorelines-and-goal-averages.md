# 044 — Scorelines and goal averages between two teams

> **Status: agreed in chat on 2026-09-29; #337 moved to Ready the same day.**
> Written for #337, joined with #338 — the second and third of the matchup
> features after specs/042 (#336).

## Summary

The head-to-head page (specs/042) says who won how often. This adds the two
questions a reader asks next: **how** the meetings usually end — which scores,
drawn as a grid (#337) — and whether this pairing is a high- or low-scoring one
**compared with the competition it was played in** (#338).

Both read the meetings the page already loads. The score grid needs nothing
else; the comparison needs one new figure per competition: its average score.

## Scope

### In scope

- Two new sections on the head-to-head page, in all five of its routes.
- **Score grid (#337):** every meeting's final score, counted per scoreline and
  drawn as a grid, with the most common scoreline named in words.
- **Goal averages by competition (#338):** for each competition the pair has met
  in, their average score in those meetings against that competition's average
  score in the seasons they met in it (S7).
- Both sections **signed-in only** (S6); the record and the list stay public.
- The same meetings as specs/042 — every competition in the region, finished,
  both scores stored (specs/042 S2, S3). A section never counts a match the list
  below it does not show.

### Out of scope

- Anything on the match page or the team page. The head-to-head page is the one
  place this appears.
- Half-time scores, and anything about *when* goals were scored.
- Comparing against anything but the competition's own average — a team's
  season average, or the region's.
- The bogey-team finder (#333) and the rivalry page (#355).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | One spec or two | **One**, with #338 as its own section | Miikka, 2026-09-29: join them if it seems good. It does: both are read from the same meetings on the same page, so they share their data, their route and every edge case about which meetings count. #338 adds the page's only new query. |
| S2 | Which meetings | **The same as the head-to-head list** | Miikka, 2026-09-29. So the grid's counts add up to the rows below it, and one sentence (the existing window sentence) describes all three sections. |
| S3 | What "the league average" means | **The competition's average home score and away score over its matches**, e.g. `1,6 – 1,2`, compared with the same two numbers over this pair's meetings in it. Which matches: S7 | Miikka, 2026-09-29: *"in that competition if in all games the average score is e.g. 3,4 - 1,2 the score of that fixture is compared against that"*. Home–away rather than first team–second team, because a competition's average has no "first team": only home and away mean the same thing on both sides of the comparison. |
| S4 | Across several competitions | **One row per competition**, never one blended average | Follows from S3: each competition has its own average, so the pair's meetings are split the same way. A Veikkausliiga meeting is compared with Veikkausliiga, a cup meeting with that cup. |
| S5 | The grid's orientation | **The first team's goals down the side, the second team's across the top**, in the URL's order | The same side `Yhteenveto` reads from (specs/042), so `HJK 11 – 6 tasan – 7 KuPS` above and the grid below it agree about who is who. A home–away grid would not: HJK's 2–0 win away would sit in the same cell as KuPS's 2–0 win at home. |
| S6 | Who sees the two sections | **Signed-in readers only.** A signed-out reader gets one `Kirjaudu sisään nähdäksesi analyysit ja trendit.` where both would be, and `Yhteenveto` and `Kohtaamiset` as before | Miikka, 2026-09-29 (Q1). The record and the list were public in specs/042 and stay so; the analysis follows the rule every analytics panel follows (specs/030). One prompt, not one per section, as `Analyysit` does it — and the gate comes before either is computed, so a signed-out page carries no value from them. |
| S7 | Which matches make a competition's average | **Only the seasons in which this pair met in that competition** | Miikka, 2026-09-29 (Q2). Scoring levels drift, so a 2016 meeting compared with 2026's average would compare two eras. A competition-season the pair met in is also one we have stored, so the average never rests on a season no one has browsed. |
| S8 | Every scoreline occurred once | **No sentence; the grid alone** | Miikka, 2026-09-29 (Q3). "Most common" among ties of 1 names every result and says nothing. |
| S9 | The TASO national-team routes | **No `Maalit kilpailuittain` on `/maajoukkueet/huuhkajat` and `/maajoukkueet/helmarit`**; the grid stays | Miikka, 2026-09-29 (Q4). A TASO national category holds Finland's matches and only some others — `ECQ` has 41 stored, 21 of them Finland's — so its "competition average" is Finland's group's, not the competition's. football-data's World Cup and Euro, under `/maajoukkueet`, store whole tournaments, and keep the section. |
| S10 | The average query fails | **The section's heading, and `Keskiarvoja ei voitu laskea. Yritä myöhemmin uudelleen.`** in place of the table | Miikka, 2026-09-29, asked during implementation: the spec named no failure state. The convention every analytics panel follows (`Putkia ei voitu laskea. Yritä myöhemmin uudelleen.`), so a failure never looks like "nothing to compare". |

## UX / UI (Finnish strings)

Signed in, the page becomes four sections, in this order:

1. `Yhteenveto` — unchanged
2. `Tulokset` — new, the score grid
3. `Maalit kilpailuittain` — new, the averages; absent on the two TASO
   national-team routes (S9)
4. `Kohtaamiset` — unchanged, with the window sentence

Signed out, sections 2 and 3 are replaced by one line (S6):
`Kirjaudu sisään nähdäksesi analyysit ja trendit.` — the existing
`SIGNED_OUT_MESSAGE`, not a new string.

### `Tulokset` — the score grid

| Element | Content |
|---|---|
| Heading | `Tulokset` |
| The sentence above the grid | `Yleisin tulos 1–1, 6 kertaa.` — the first team's score first. Always `kertaa`: a count of one is S8's case, which has no sentence |
| A tie for most common | `Yleisimmät tulokset 1–1 ja 2–1, kumpikin 5 kertaa.` — three or more: `Yleisimmät tulokset 0–0, 1–1 ja 2–1, kukin 3 kertaa.` (`kumpikin` is "each of two", `kukin` "each of several"). In order of the first team's goals, then the second's |
| Every scoreline once | No sentence (S8) |
| The grid | An HTML table. Rows are the first team's goals, `0`–`4` and `5+`; columns are the second team's, the same. Each cell prints its count, and is shaded by it: empty cells blank, the most common darkest. The top-left corner names both axes: `HJK ↓ / KuPS →` |
| The diagonal | Draws. No special marking beyond the shading — the reader can see it |

**`5+` rather than a grid as wide as the biggest score**, so the grid is six
columns at most and legible at 375 px. A 7–0 is counted in `5+` against `0`.

**A table, not an SVG**, because its content *is* the numbers: a screen reader
reads a table cell by cell, where a drawn heatmap needs a second, textual copy
of itself. Shading uses theme tokens only, as the existing charts do, so light
and dark both work.

### `Maalit kilpailuittain` — the averages

One row per competition the pair has met in, most meetings first.

| Column | Content |
|---|---|
| `Kilpailu` | The competition's current name, as `Kohtaamiset` names it |
| `Ottelut` | How many meetings in that competition |
| `Kohtaamisissa` | The pair's average home and away score in those meetings: `2,1 – 1,4` |
| `Kilpailussa` | The competition's average home and away score over its stored matches in the seasons the pair met in it (S7): `1,6 – 1,2` |

Averages to one decimal, with a decimal comma. Under the table:
`Kotijoukkueen maalit ensin. Kilpailun keskiarvo lasketaan niiden kausien otteluista, joina joukkueet kohtasivat siinä.`

## API & Data

**No provider request, no new column.** The grid is computed from the meetings
already on the page.

| Needed | Where |
|---|---|
| The meetings | `getHeadToHeadHistory`, unchanged |
| Scoreline counts, most common, `5+` bucketing | **New**, a pure function beside `headToHeadRecord` in `head-to-head.ts` |
| Meetings grouped by competition, with their averages | **New**, pure, the same file |
| A competition's average home and away score | **New query**: `AVG(home_goals)`, `AVG(away_goals)`, `COUNT(*)` over finished matches with both scores, per competition, restricted to the seasons the pair met in it (S7) |
| Whether the reader is signed in | `canSeeAnalytics()`, asked before either section is computed (S6) |

**A competition, per provider:**
- football-data: the `competition_code` column.
- TASO: the registry's competition, not the category id — so Liigacup's `LC2023`
  and `LC` are one competition, through `competitionCodeForCategory`
  (specs/043). One query per competition the pair met in, over its categories.

**Caching:** none, as specs/031–042. The averages are aggregates over indexed
columns of our own tables.

## Edge Cases

| Case | Behaviour |
|---|---|
| The pair has met once | The grid has one filled cell and no sentence (S8: its one scoreline occurred once). The averages table has one row of one meeting |
| Every meeting ended differently | No sentence, the grid alone (S8) |
| A score of 5 or more for either side | Counted in that side's `5+` row or column |
| The URL gives the teams in the other order | The grid transposes; the averages table is unchanged, since home and away do not depend on the URL |
| A meeting at a neutral venue | Home and away as the provider stored them (specs/042) |
| A competition-season whose stored matches are only this pair's | Its average is theirs, and shown. Only possible where TASO stores a category partly, which is why S9 drops the section on the national-team routes |
| The pair met in one competition in 2016 and 2024 | Its average is over 2016 and 2024 only, not the seasons between (S7) |
| The competition-average query fails | `Maalit kilpailuittain` keeps its heading and shows `Keskiarvoja ei voitu laskea. Yritä myöhemmin uudelleen.` in place of the table (S10). The grid is unaffected: it reads only the meetings already loaded |
| Signed out | One sign-in line in place of both sections; neither is computed, and the HTML carries no count or average from them (S6) |
| A TASO national-team route | `Tulokset` shown, `Maalit kilpailuittain` absent (S9) |
| A competition renamed between seasons | One row, under its current name |
| A meeting decided on penalties | Its score after extra time, as the list shows it. The shoot-out is not a scoreline |

## Performance & Limits

The grid and grouping are arithmetic over at most a few dozen rows. The
averages add one aggregate query per competition the pair met in — typically one
to three — on indexed columns.

## Security & Secrets

No new environment variable or secret. Both new sections are behind
`canSeeAnalytics()` (S6); the rest of the page stays public, as specs/042 made it.

## Acceptance Criteria

- [ ] Signed in, the head-to-head page shows `Yhteenveto`, `Tulokset`,
      `Maalit kilpailuittain` and `Kohtaamiset`, in that order — in all five
      routes, except that the two TASO national-team routes have no
      `Maalit kilpailuittain`
- [ ] Signed out, both new sections are replaced by one
      `Kirjaudu sisään nähdäksesi analyysit ja trendit.`, and the page's HTML
      carries no scoreline count or average; `Yhteenveto` and `Kohtaamiset` are
      unchanged
- [ ] The grid's counts add up to the number of meetings in the list
- [ ] Each meeting is counted in exactly one cell, from the first team's side:
      swapping the URL's order transposes the grid
- [ ] A side's 5 or more goals is counted under `5+`
- [ ] The sentence names the most common scoreline and its count, and every
      scoreline tied for most common; with every scoreline occurring once, there
      is no sentence
- [ ] The averages table has one row per competition the pair met in, and its
      `Ottelut` add up to the number of meetings
- [ ] Each row's `Kohtaamisissa` is the average home and away score of exactly
      those meetings
- [ ] Each row's `Kilpailussa` is the average over the competition's stored
      finished matches in exactly the seasons the pair met in it — Liigacup
      2023 and 2024 counted as one competition
- [ ] Averages print to one decimal with a decimal comma
- [ ] When the average query fails, `Maalit kilpailuittain` says
      `Keskiarvoja ei voitu laskea. Yritä myöhemmin uudelleen.`, and the grid
      is still shown *(added 2026-09-29, S10)*
- [ ] No provider request is made
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/head-to-head.test.ts` | Scoreline counts from the first team's side; the swap transposes; `5+` bucketing on both axes; the most common, and a tie for it; grouping by competition, with each group's average home and away score |
| `tests/unit/lib/match-service.test.ts` (or the file the query lands in) | The competition average counts only finished matches with both scores, and only in the seasons given; a TASO competition spanning two category ids is one average |
| `tests/unit/components/head-to-head-page.test.tsx` | The four sections in order; signed out, one prompt and no value from either section; no averages section on the TASO national-team routes; the sentence's tie form, and its absence when every scoreline is unique — one meeting included; the averages' error message; the decimal comma; the averages table's rows |
| `tests/integration/head-to-head.test.ts` | The average query against the real schema |
| `tests/e2e/head-to-head.spec.ts` | Signed in, on a real pair: the grid's counts add up to the rows listed; the averages table appears with a row per competition. Signed out: the prompt, and no grid |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/044-scorelines-and-goal-averages.md` (this file)
- `src/lib/head-to-head.ts` — scoreline counts, grouping and averages
- `src/lib/match-service.ts` — the competition-average query
- `src/components/head-to-head-page.tsx` — the two sections
- `decisions/044-scorelines-and-goal-averages.md`, by the implementing agent

## Open Questions

**None.** Q1–Q4 were answered in chat on 2026-09-29 and are recorded as S6–S9;
the failure state asked during implementation the same day is S10.
