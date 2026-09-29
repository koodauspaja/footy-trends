# 046 — Kääntyneet ottelut only where the half-time score is known

> **Status: agreed in chat on 2026-09-29; #473 moved to Ready the same day.** Written for #473.

## Summary

`Kääntyneet ottelut` reads each match's half-time score, and TASO has none for
most older internationals: on production, Huuhkajat's panel was computed from
about 8 of 84 matches and Helmarit's from **one**, while looking exactly like
the panels beside it. This shows the panel's figures only where at least 40 % of
its matches have a known half-time score, and otherwise says how few are known
instead.

## Scope

### In scope

- One rule in the panel: figures when at least **40 %** of the matches it counts
  have a half-time score (S1), a note instead of them below that (S2).
- Every page the panel is on — club pages as well as the two national-team
  pages. The rule is about the data, not the page (S3).
- The existing "no half-time scores at all" case folds into the same note (S4).

### Out of scope

- Fetching half-time scores from anywhere else: TASO is the source and does not
  have them for these matches (#473).
- Re-fetching stored seasons that predate the half-time columns (migration
  `0017`); that is `npm run backfill -- --refetch`, an operations task.
- The other nine panels.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | How little is too little | **Below 40 %** of the panel's matches with a known half-time score | Miikka, 2026-09-29. Measured on the stored (test) data, coverage is all or nothing: of 838 team-seasons, 446 fully known, 386 wholly unknown and **6** in between — 4 domestic above 40 %, 2 national-team ones below it (a women's World Cup qualifier at 8 %). So the threshold's exact value moves almost nothing; 40 % reads as "under half is not a sample". |
| S2 | What below it shows | **The panel's heading and a note, no figures** | Miikka, 2026-09-29: *"if below, hide with note"*. Hiding the heading too would make the panel vanish without a word on pages where readers have seen it; the heading plus one line says it exists and why it is empty, as the zero case does today. |
| S3 | Which pages | **Every page the panel is on** | #473's own note: a cup run with no half-time data hits the same thing, and a club season stored before migration `0017` has none at all. One rule, stated about the data. |
| S4 | The zero case | **Folded into the same note** | Today `known === 0` says `Puoliaikatuloksia ei ole tälle kaudelle.` — "for this season", which is wrong on the national-team pages, whose axis is a history, not a season (specs/041). One period-free note covers 0 % and every share below 40 %. |
| S5 | The note's wording | **`Puoliaikatulos on tiedossa vain {known} ottelusta, kun otteluita on {total}. Kääntyneitä otteluita ei lasketa.`** | Miikka, 2026-09-29 (Q1), then reworded the same day: the first wording ended in `{total}:stä`, and that case ending follows how the number is read — `3:sta`, `8:sta`, `100:sta`, but `4:stä`, `84:stä` — so a fixed `:stä` would be wrong for many totals. The total now carries no case ending. `{known} ottelusta` is right for every count: the elative of `ottelu` is the same for one as for many, which `missingText` already relies on. |
| S6 | A season with no played match yet | **The existing "not yet" lines**, not the note | Miikka, 2026-09-29, asked during implementation: the draft said such a season had no panel, but the TASO loader returns an `ok` series with 0 known and 0 missing, which showed `Puoliaikatuloksia ei ole tälle kaudelle.` until S4 removed it. With nothing to measure, the 40 % rule does not apply, and the two directions' `Ei vielä otteluita …` say what is true. |

## UX / UI (Finnish strings)

| Case | The panel shows |
|---|---|
| At least 40 % known | Unchanged: the six figures, and `Puoliaikatulos puuttuu N ottelusta.` under them when any is missing |
| Below 40 % | The heading `Kääntyneet ottelut`, then `Puoliaikatulos on tiedossa vain 8 ottelusta, kun otteluita on 84. Kääntyneitä otteluita ei lasketa.` with the two counts filled in (S5), and no figures |
| Error | Unchanged |

`Puoliaikatuloksia ei ole tälle kaudelle.` (`NO_HALF_TIME_MESSAGE`) is removed:
S4 replaces it.

## API & Data

**No new data, no query change.** `ComebacksSeries` already carries `known` and
`missing` (specs/037), so the share is `known / (known + missing)`, computed
where the panel renders. No provider request, no cache.

## Edge Cases

| Case | Behaviour |
|---|---|
| Exactly 40 % known | Figures shown: the rule is "below 40 %". Compared in whole numbers (`known × 5 ≥ total × 2`), so the boundary is exact by construction |
| No played match yet (0 known, 0 missing) | The threshold does not apply: the panel shows its existing `Ei vielä otteluita tappioasemasta.` and `Ei vielä otteluita johtoasemasta.` (S6) |
| 0 % known | The note (S4), stating 0 of the total |
| 100 % known | Unchanged, with no missing line |
| A club season stored before migration `0017` | Below 40 % (usually 0 %): the note, until the season is refetched |
| Signed out | Unchanged: the one `Analyysit` sign-in prompt |

## Performance & Limits

One division per render.

## Security & Secrets

No change. Behind `canSeeAnalytics()` with the rest of `Analyysit`.

## Acceptance Criteria

- [ ] With under 40 % of its matches' half-time scores known, `Kääntyneet
      ottelut` shows its heading and the note, and none of its six figures
- [ ] With 40 % or more known, it is unchanged — figures, and the missing line
      where any is missing
- [ ] 0 % known shows the same note; `Puoliaikatuloksia ei ole tälle kaudelle.`
      appears nowhere
- [ ] A season with no played match yet shows the two `Ei vielä otteluita …`
      lines, not the note (S6)
- [ ] On production data, Huuhkajat and Helmarit show the note
- [ ] A club season with full half-time data is unchanged
- [ ] Correct in light and dark, and legible at 375 px
- [ ] The note reads correctly for any total — no case ending on a numeral (S5)
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/components/comebacks-section.test.tsx` | The note below 40 %, the figures at exactly 40 % and above, the note at 0 %, the old message gone |
| `tests/e2e/national-team-analytics.spec.ts` | The panel on a national-team page shows the note and no figures |
| `tests/e2e/comebacks.spec.ts` | A club season with half-time data is unchanged |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/046-comebacks-half-time-coverage.md` (this file)
- `src/components/comebacks-section.tsx`
- `decisions/046-comebacks-half-time-coverage.md`, by the implementing agent

## Open Questions

**None.** Q1 was answered in chat on 2026-09-29 and is recorded as S5; the
no-match case asked during implementation the same day is S6.
