# 045 — Bogey teams

> **Status: all questions answered in chat on 2026-09-29, awaiting the go.** Written for #333, the third matchup
> feature after specs/042 and specs/044. #355 (the rivalry page) comes after it:
> its live prediction needs the predictions work (#343 on), and most of the rest
> of it is this and specs/044.

## Summary

Every club has an opponent it cannot beat. This names them on the team page: the
opponents the club has done worst against across every stored season, each with
its record and a link to the full head-to-head (specs/042).

The data is already there — a club's stored matches, both providers — and so is
the page a reader will want next. What is new is ranking a club's opponents, and
the team page's first panel about opponents rather than periods.

## Scope

### In scope

- One panel in the team page's `Analyysit`, signed-in only as every panel is
  (specs/030), under a **new group** — the first since #424 (S6).
- On the domestic team page (TASO) and the football-data team page, for clubs.
- The same rows whichever season the page shows: it is about the club's history
  against each opponent, not about the selected season.
- Each opponent linking to the head-to-head page for the pair.

### Out of scope

- The opposite list — the opponents a club does best against (S3).
- The national-team pages (S5): Huuhkajat and Helmarit, and football-data's
  `/maajoukkueet/joukkue/…` pages for World Cup and Euro countries — countries,
  not clubs.
- Anything on the head-to-head page itself; specs/044 is that page's analysis.
- Opponents met only in a season we have not stored. The window sentence's
  point (specs/042 S7) applies: this is our data, not the club's whole history.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | What makes an opponent "bad" | **Points per match**, 3 for a win and 1 for a draw | Miikka, 2026-09-29 (Q1). It ranks a draw above a loss, which a loss count or a win rate does not, and it is the measure the table itself uses. |
| S2 | How many meetings before an opponent counts | **At least 3** | Miikka, 2026-09-29 (Q2). One loss would otherwise make a 0,0-points bogey team of anyone met once. |
| S3 | How many rows | **The three worst**, and no list of the best | Miikka, 2026-09-29 (Q3). The issue asks for the worst; a "favourite victims" list is a separate feature if wanted. |
| S4 | Which meetings count | **The head-to-head's**: every competition in the club's region, every stored season, cups included | Miikka, 2026-09-29 (Q4). Each row then agrees with the page it links to. specs/038 excludes cups because they distort *rates across seasons*; here the unit is one opponent's record, and a row disagreeing with its own link would be the worse failure. |
| S5 | The national-team pages | **Out of scope; clubs only** | Miikka, 2026-09-29 (Q5). TASO has no stable id for Finland across categories (`FINLAND_TEAM_ID` is a sentinel for that reason), and an opponent's id varies by category too — one country could split into several rows, and the head-to-head link has no single id for Finland. Matching national opponents by name is its own piece of work. |
| S6 | The group | **A fourth group, `Vastustajat`, after `Muut kaudet`**, holding the panel `Vaikeimmat vastustajat` | Miikka, 2026-09-29 (Q6). #424 groups by the question a reader asks, and "who do we struggle against" is a new one — none of the three existing groups is about opponents. |
| S7 | Ties on points per match | **More meetings first, then the most recent meeting** | Miikka, 2026-09-29 (Q7). More meetings is more evidence; the most recent is the one a reader remembers. |

## UX / UI (Finnish strings)

Under `Analyysit`, a new group after `Muut kaudet` (S6):

| Element | Content |
|---|---|
| Group heading | `Vastustajat` |
| Panel heading | `Vaikeimmat vastustajat` |
| The table | `Vastustaja`, `O`, `V`, `T`, `H`, `P/O` — the opponent's name linking to `…/kohtaamiset/<club>/<opponent>`, then meetings, wins, draws, losses and points per match |
| Under the table | `Vähintään 3 kohtaamista.` (S2), then specs/042's window sentence for the page's source — `Perustuu kaudesta 2015 alkaen tallennettuihin otteluihin.` on the domestic page, the football-data floor on the other |
| No opponent qualifies | `Yhtäkään vastustajaa ei ole kohdattu vähintään 3 kertaa.` in place of the table |
| A failed read | `Vastustajia ei voitu laskea. Yritä myöhemmin uudelleen.` — the panel convention |

The table is the panel's own compact one rather than `DataTable`: `DataTable`'s
240 px floor for the name column would put `P/O` — the figure the rows are
ranked by — off a 375 px screen. Added during implementation.

`O`, `V`, `T` and `H` are the standings table's own headers, with its own
titles (`Ottelut`, `Voitot`, `Tasapelit`, `Häviöt`), so they need no key. `P/O`,
titled `Pisteitä ottelua kohden`, is points per match to one decimal with a
decimal comma (`0,8`), like every other rate on the page.

**Three rows** (S3), worst first. A club with fewer qualifying opponents shows
fewer rows.

## API & Data

**No provider request, no new column.**

| Needed | Where |
|---|---|
| Every finished meeting of the club, with both scores, in the meetings S4 names | **New read**, the same predicates as `getHeadToHeadHistory` without the second team |
| Per opponent: meetings, W–D–L, points per match | **New**, pure, beside `headToHeadRecord` in `head-to-head.ts` — the record per opponent is exactly the head-to-head page's `Yhteenveto` |
| The link | `meetingsHref`, extracted from specs/042's `meetingsLink` so both spell the head-to-head URL in one place |

**The record in a row is the head-to-head page's record** for the same pair —
same meetings, same arithmetic — so following the link never shows different
numbers. That is why S4 takes the head-to-head's scope rather than
specs/038's league-only one.

**Caching:** none, as specs/031–044.

## Edge Cases

| Case | Behaviour |
|---|---|
| A club with no opponent met 3 times | The panel shows `Yhtäkään vastustajaa ei ole kohdattu vähintään 3 kertaa.` |
| Two opponents with equal points per match | The one met more often first — more evidence — then the most recently met (S7) |
| An opponent the club has never lost to | Can still appear, if it is among the three worst: `P/O` says how bad "worst" is. The panel is a ranking, not a verdict |
| A placeholder team (a bracket slot) | Never an opponent: `hasPlaceholderTeam`'s rule, as the head-to-head uses |
| The selected season is a cup season | The same panel — it does not depend on the season |
| Signed out | The one `Analyysit` sign-in prompt, as for every panel |
| The read fails | The panel's error message; the rest of `Analyysit` is unaffected |

## Performance & Limits

One indexed read per page: every finished match of one club in its source,
at most a few hundred rows for the longest-stored clubs, grouped in TypeScript.

## Security & Secrets

No new environment variable or secret. Behind `canSeeAnalytics()` with the rest
of `Analyysit`.

## Acceptance Criteria

- [ ] Signed in, a club's team page shows `Vaikeimmat vastustajat` in a
      `Vastustajat` group after `Muut kaudet`, on both the domestic and the
      football-data team page
- [ ] At most three opponents, each met at least three times, worst points per
      match first; ties by meetings, then by the latest meeting
- [ ] Each row's meetings, W–D–L and points agree with the head-to-head page it
      links to
- [ ] The rows are the same whichever season the page shows
- [ ] A club with no qualifying opponent shows the Finnish empty message
- [ ] A failed read shows the panel's error message
- [ ] The national-team pages are unchanged
- [ ] No provider request is made
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/head-to-head.test.ts` | Per-opponent records from the club's side; the threshold; the order and both tie-breaks; at most three |
| `tests/unit/lib/match-service.test.ts` | The club's read, its failure as its own case |
| `tests/unit/components/*bogey*.test.tsx` | The table, the link, the empty message, the error message |
| `tests/unit/components/analytics-section.test.tsx` | The new group after `Muut kaudet` |
| `tests/integration/match.test.ts` | The read against the real schema: both orientations, finished only, the region's competitions only |
| `tests/e2e/…` | Signed in, on a real club: the panel, and a row's record equals the head-to-head page it links to |

## Files To Update

- `specs/045-bogey-teams.md` (this file)
- `src/lib/head-to-head.ts`, `src/lib/match-service.ts`
- `src/components/analytics-section.tsx` — the group
- A new panel component
- `src/components/competition-team-page.tsx`, `src/app/domestic/team/[id]/page.tsx`
- `decisions/045-bogey-teams.md`, by the implementing agent

## Open Questions

**None.** Q1–Q7 were answered in chat on 2026-09-29 and are recorded as S1–S7.
