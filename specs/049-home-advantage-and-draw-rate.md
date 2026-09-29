# 049 — Home advantage and draw rate, compared across competitions

> **Status: all questions (Q1–Q18) answered in chat on 2026-09-29 and
> 2026-09-30, awaiting the go.** Written for #339 (home
> advantage strength by competition) and #340 (draw rate by competition),
> joined — the second of the competition-level analytics after specs/048 (#341).
> It joins the competition page's `Analyysit` section that specs/048 creates.

## Summary

How much does playing at home matter in Veikkausliiga — more or less than in the
Premier League? And is it a league of draws? Both questions are answered by the
same three numbers: of a competition's matches, how many the home side won, how
many were drawn, how many the away side won. This puts those numbers for the
competition being read beside the same numbers for the others, so a reader can
see where it stands.

Every result needed is already stored. What is new is a figure computed over
**many** competitions at once, and the competition page's first panel that is
about other competitions rather than its own seasons.

## Scope

### In scope

- One panel, `Kotietu ja tasapelit`, on the standings page of every competition
  specs/048 S5 names, in a new `Analyysit` group `Kilpailut rinnakkain` (S12).
- A table of every one of those competitions — both providers — with this
  competition's row highlighted (S4, S6).
- Home advantage (#339) as `Kotietu`, home wins minus away wins (S5); draw rate
  (#340) as `Tasapelit`.
- Completed seasons from 2023, the football-data plan floor, onward (S8, S19).

### Out of scope

- A trend of either measure across seasons. specs/048 draws goals per game that
  way; the same for these is a later feature if wanted.
- Home and away **goals** — goals per game is specs/048, and a team's own home
  and away split is specs/033.
- The competitions specs/048 S5 leaves out: the domestic cups, the World Cup,
  the Euro, Huuhkajat and Helmarit — neither a panel on their pages nor a row in
  the table.
- Sortable columns (S11).
- Any per-team figure.
- Table volatility — #342.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | One spec or two | **One**: #339 and #340 are two readings of the same three shares | Miikka agreed the order with #339 and #340 joined, 2026-09-29. A match ends in exactly one of home win, draw, away win, so the draw rate and any home-advantage measure come from one count per competition, and share every question about which matches and which competitions — as specs/044 joined #337 and #338. |
| S2 | Providers | **Each competition's shares are computed within its own source**; the table lists competitions of both (S6) | The shares are per competition, never summed across competitions, so the separate id spaces (specs/026, specs/027) never meet. Listing Veikkausliiga beside the Premier League compares two numbers, not two registries. |
| S3 | Which results | **Finished matches with both scores stored**; a draw is equal scores after extra time — a penalty shoot-out does not decide it | specs/042 S3, specs/044. A cup tie drawn and settled on penalties is a draw here, because the question is about the match, not who went through. |
| S4 | What the panel shows | **A table, one row per competition**: `Kilpailu`, `Ottelut`, `Kotivoitot`, `Tasapelit`, `Vierasvoitot`, `Kotietu`; this competition's row highlighted | Miikka, 2026-09-29 (Q1). About twenty rows of numbers are legible at 375 px as a table, and a reader reads a column. A stacked bar's middle segment — the draws — has no common baseline to compare by eye. |
| S5 | Home advantage | **`Kotietu` = home-win share minus away-win share, in percentage points with a sign** (`+16`) | Miikka, 2026-09-29 (Q2). One number anyone can check from the two columns beside it. The home side's share of points was considered and set aside: it needs explaining where `+16` does not. |
| S6 | Which competitions | **Every competition specs/048 S5 names, both providers, in one table** — the same on every one of their pages | Miikka, 2026-09-29 (Q3). "Is Veikkausliiga a league of draws?" is answered against the big leagues as much as against Ykkönen. S2 is why mixing sources is sound here. |
| S7 | The Champions League | **Included, results as stored** | Miikka, 2026-09-29 (Q4). One neutral-venue final among over a hundred matches a season moves nothing, and specs/042 already counts neutral venues as the provider stores them. |
| S8 | Which seasons | **Completed seasons from 2023 onward** — the football-data plan floor, the oldest season every football-data competition S6 names has. A competition whose history starts later is compared over what it has: Ykkösliiga, founded 2024, over 2024 onward, its `Ottelut` saying so (S10). The season in progress is not in it (S19) | Miikka, 2026-09-29 (Q5), and 2026-09-30 (Q16). The selected season alone would compare an unfinished season with finished ones; every stored season would compare TASO's 2015–2025 with football-data's 2023–2025, two eras (specs/044 S7). Q16: the strict "every competition has it" reading gives 2024 because of Ykkösliiga alone, and would drop a season from the other nineteen. |
| S9 | Which matches | **Every stored finished match**, playoffs and qualifiers included — specs/048 S6 | Miikka, 2026-09-29 (Q6). One rule across the competition page; a relegation playoff still has a home side. |
| S10 | Few matches | **Every competition listed, whatever its count**; `Ottelut` says what each row rests on | Miikka, 2026-09-29 (Q7). |
| S11 | Row order | **By `Kotietu`, strongest first** | Miikka, 2026-09-29 (Q8). It answers #339 directly; a reader after #340 scans one column. |
| S12 | The group | **`Kilpailut rinnakkain`, a second group after `Kausi kaudelta`** (specs/048 S4) | Miikka, 2026-09-29 (Q9). `Kausi kaudelta` is about this competition's seasons; this is about other competitions. #424's rule: a new question is a new group. |
| S13 | The strings | As proposed — see UX / UI | Miikka, 2026-09-29 (Q10). |
| S14 | Rounding | **Whole percentages, and under the table: `Osuudet on pyöristetty, joten niiden summa voi poiketa 100 prosentista.`** `Kotietu` is computed from the unrounded shares | Miikka, 2026-09-29 (Q11). Whole numbers are what a reader compares; one decimal adds width at 375 px and precision the samples do not have. The line covers both a row summing to 99/101 and a `Kotietu` one off from the printed columns' difference. |
| S15 | A read fails | **One failure message for the panel whenever either provider's read fails:** `Kotietua ei voitu laskea. Yritä myöhemmin uudelleen.` | Miikka, 2026-09-29 (Q12). A partial table would rank a competition against some of the others, and could be missing this page's own row. Both reads hit the same database, so they fail together in practice. |
| S16 | This page's competition has no match in the window | **The table without a highlighted row, and a line: `Kilpailusta ei ole tallennettuja otteluita näiltä kausilta.`** | Miikka, 2026-09-29 (Q13). The comparison still says something about the others; the line says why this one is absent. |
| S17 | Equal `Kotietu` | **More `Ottelut` first** | Miikka, 2026-09-29 (Q14). More evidence first, as specs/045 S7. |
| S18 | Naming the window | **Both kinds of season spelled out: `Kaudet 2023–2025 ja 2023/24–2025/26, kaikki tallennetut ottelut.`** — years derived from the window (S8), not literals | Miikka, 2026-09-29 (Q15). The shorter calendar-year line would hide that the football-data rows run into 2026. |
| S19 | A completed season | **One with finished matches and none left to play** — none scheduled, timed or in play. A postponed, suspended or cancelled match does not hold a season open. Decided per competition, from stored data | Miikka, 2026-09-30 (Q17). Both providers store a season's whole fixture list, so the database knows when the last match has been played. Each competition's current season is otherwise known only from a provider call, which twenty rows would make up to twenty of on a cold cache. |

## UX / UI (Finnish strings)

Signed in, on the standings page of a competition specs/048 S5 names:

1. `Analyysit`
2. `Kausi kaudelta` — specs/048's group, unchanged
3. `Kilpailut rinnakkain` — new group (S12)
4. `Kotietu ja tasapelit` — panel heading
   - A table, one row per competition (S6), strongest `Kotietu` first (S11);
     this competition's row highlighted
   - `Kilpailu` · `Ottelut` · `Kotivoitot` · `Tasapelit` · `Vierasvoitot` ·
     `Kotietu`
   - Shares as whole percentages (`45 %`, S14); `Kotietu` in percentage points
     with a sign (`+16`, `0`, `−3`)
   - Under the table: `Kaudet 2023–2025 ja 2023/24–2025/26, kaikki tallennetut
     ottelut.` — the window's seasons from S8, not literals (S18); then
     `Osuudet on pyöristetty, joten niiden summa voi poiketa 100 prosentista.`
     (S14)

`Kilpailu` names each competition as the competition list does.

| String | When |
|---|---|
| `Kotietua ei voitu laskea. Yritä myöhemmin uudelleen.` | Either read failed (S15) |
| `Kilpailusta ei ole tallennettuja otteluita näiltä kausilta.` | This page's competition has no match in the window (S16) |
| `Kirjaudu sisään nähdäksesi analyysit ja trendit.` | Signed out: `Analyysit` and this, nothing else (specs/048 S4) |

## API & Data

**No new column, no provider request.**

| Needed | Where |
|---|---|
| Per competition: matches, home wins, draws, away wins, in the window (S8, S9) | **New query per provider**: `COUNT(*)` with `FILTER` on the score comparison, grouped by competition — football-data by `competition_code`, TASO by the registry's competition over its category ids (specs/043) |
| The window | From the football-data plan floor (S8) to each competition's last completed season (S19) — derived from the plan floor and the stored data, not written as a literal. The S18 line names, for each kind of season, the latest completed one among the table's rows |
| A match's result | Its score after extra time. football-data's stored score **includes** a penalty shoot-out (Liverpool "1–5" PSG, 2024/25, is 0–1 with penalties 1–4), so its `penalties_home`/`penalties_away` are subtracted where stored before comparing. TASO's score has no shoot-out in it (S3; #492 is the same correction for specs/048) |
| This competition's row | The same result — its own row, highlighted |
| Signed in | `canSeeAnalytics()`, before either query |

**Caching:** none, as specs/031–048: two aggregate queries over indexed columns.
The result is the same on every competition page for a given window, so a cache
is the obvious later step if measurement shows the query costs anything.

## Edge Cases

| Case | Behaviour |
|---|---|
| A match decided on penalties | A draw (S3) |
| A match with a result but a missing score | Not counted (S3) |
| A playoff, qualifier or Champions League knockout match | Counted (S7, S9) |
| A competition with few matches in the window | Listed; `Ottelut` shows it (S10) |
| A competition with no match in the window | No row |
| This page's competition has no match in the window | The table without a highlighted row, and the S16 line |
| A TASO competition spanning several category ids | One row (specs/043) |
| Two competitions with equal `Kotietu` | More `Ottelut` first (S17) |
| The season in progress | Not in the window (S19), so it does not move the table |
| A season's last match played | The season joins the table that day (S19) |
| A postponed or cancelled match in an otherwise finished season | The season is completed (S19) |
| A competition whose history starts after 2023 (Ykkösliiga) | Compared over the seasons it has; `Ottelut` shows it (S8, S10) |
| Calendar-year competitions finishing on different dates | Each row covers its own completed seasons; for those weeks the S18 line names the latest completed calendar year among the rows |
| A Champions League tie settled on penalties | A draw: its score after extra time, the shoot-out subtracted (S3) |
| Rounded shares not adding to 100 % | Printed as rounded; the S14 line says why |
| Either provider's read fails | The S15 message in place of the table; the rest of the page renders |
| Signed out | No share in the HTML (specs/048 S4) |

## Performance & Limits

Two aggregate queries per page view, one per provider, over every stored match
in the window — a few thousand rows, grouped in the database.

## Security & Secrets

No new environment variable or secret. Behind `canSeeAnalytics()`.

## Acceptance Criteria

- [ ] Signed in, the standings page of every competition specs/048 S5 names shows
      `Kotietu ja tasapelit` in a `Kilpailut rinnakkain` group after
      `Kausi kaudelta`
- [ ] The table has one row for every one of those competitions with a match in
      the window, from both providers, and highlights this page's own
- [ ] Each row's `Kotivoitot`, `Tasapelit` and `Vierasvoitot` are shares of its
      `Ottelut`, over its completed seasons from 2023 onward (S8, S19)
- [ ] A season with a match still scheduled, timed or in play is not counted;
      a postponed or cancelled match does not hold one open
- [ ] A drawn match settled on penalties counts as a draw — on football-data,
      with the stored shoot-out subtracted
- [ ] `Kotietu` is the home-win share minus the away-win share, signed, and the
      rows are ordered by it, strongest first
- [ ] The line under the table names the window's seasons of both kinds, and
      the rounding line follows it
- [ ] Ties on `Kotietu` put the competition with more `Ottelut` first
- [ ] With no match of this page's competition in the window, no row is
      highlighted and the Finnish line says so
- [ ] If either provider's read fails, the panel shows the one failure message
- [ ] The season in progress does not change the table
- [ ] Signed out, no share is in the page's HTML
- [ ] No provider request is made
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish


## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/…outcome-shares….test.ts` | Home win, draw, away win from scores; a penalty-decided draw is a draw; shares of the count; `Kotietu` from unrounded shares; the order and its tie-break; the window line's seasons |
| `tests/unit/lib/…service….test.ts` | Each provider's query: the window, the competitions, finished with both scores only, playoffs counted; TASO across category ids; failure |
| `tests/unit/components/…home-advantage….test.tsx` | Group after `Kausi kaudelta`; rows, highlight and order; percentage and sign formatting; the window line; signed out, no value; failure message |
| `tests/integration/…` | Both aggregates against the real schema: a football-data shoot-out counted as a draw; a season with a scheduled match left out, one with only a postponed match left in |
| `tests/e2e/…` | Signed in, on a real league: the table with rows from both providers, its own row highlighted; signed out, the prompt |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/049-home-advantage-and-draw-rate.md` (this file)
- A new pure module for the shares, and the queries in the relevant services
- The competition-page `Analyysit` component from specs/048 — the new group
- `decisions/049-home-advantage-and-draw-rate.md`, by the implementing agent

## Open Questions

**None.** Q1–Q15 were answered in chat on 2026-09-29 and are recorded as S4–S18.
Q16 (the window's start, given Ykkösliiga's 2024 founding) and Q17 (how a season
is known to be completed without a provider request) were answered on
2026-09-30 and are S8 and S19. Q18 found that specs/048 counts football-data
shoot-out goals; it is filed as #492 and fixed separately.
