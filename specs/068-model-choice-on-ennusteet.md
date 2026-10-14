# 068 — Choosing which models /ennusteet's charts draw

> **Status: Q1–Q6 answered in chat on 2026-10-15 and recorded as S1–S6, and
> the spec confirmed the same day. Strings may be fine-tuned during
> implementation.** Written for #659. Raised by Miikka on 2026-10-14, looking
> at staging's `/ennusteet` after specs/060 (#346, #651) added `Elo + vire` and
> `Elo + kotietu`: the three Elo lines and Poisson lie almost on top of each
> other.

## Summary

`/ennusteet` compares five models, and its two line charts draw all five at
once in one colour, told apart by dash alone (specs/060 S14). On a long
backtest `Osumatarkkuus` is hard to read. A reader chooses which models the
charts draw, to compare two or three at a time.

## Scope

### In scope

- A control choosing which models `Osumatarkkuus` and `Kalibrointi` draw, on
  `/ennusteet` in both regions (`Kotimaa`, `Ulkomaat`) and both kinds
  (`Jälkikäteen lasketut`, `Ennakkoon tehdyt`), with or without a `kilpailu`
  (S4).
- A default set, drawn when nothing is chosen (S1).
- Where the choice is kept, and that it survives the page's other switches
  (S2).
- Which figures besides the lines follow it (S3).

### Out of scope

- Changing which models are logged or judged (specs/054, specs/060).
- Colour per model: the charts tell lines apart by dash (specs/060 S14).
- `Ennuste` on a match page.
- A new model, or a change to any figure's computation.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | The default | **`Perustaso`, `Elo` and `Poisson`; the two variants drawn only when chosen** | Miikka, 2026-10-15 (Q1): "Perustaso, Elo, Poisson (Recommended)". The three families, each a distinct dash; the default page reads well, which was the complaint. |
| S2 | Where the choice lives | **The URL, as `mallit=perustaso,elo,poisson`; slugs `perustaso`, `elo`, `elo-vire`, `elo-kotietu`, `poisson`; the default is the parameter left out; the region and kind switches, `Kilpailuittain`'s rows and `Kaikki kilpailut` carry it** | Miikka, 2026-10-15 (Q2): "URL: mallit=… (Recommended)". Works without scripting, can be shared, and is how the page's other switches work. Saved preferences would need a migration and a write; client state is lost on every switch. |
| S3 | What follows the choice | **The two charts' lines, their legends and their screen-reader lists only. The accuracy line above `Osumatarkkuus` and both tables keep all five** | Miikka, 2026-10-15 (Q3): "Chart lines only (Recommended)". The accuracy line is the only place the page gives accuracy totals, and `Kilpailuittain`'s bold best-of-row would mean something else over a subset. |
| S4 | The control | **One row of toggles above `Osumatarkkuus`, applying to both charts: `Kaavioissa näytetään:`, then each model's dash sample and name in the page's model order; a shown model `font-semibold`, a hidden one `text-muted` with its sample faded; each a `SameRouteLink` to the page with that model toggled** | Miikka, 2026-10-15 (Q4): "One toggle row (Recommended)". No scripting and no submit; legend toggles would have had two legends driving one choice. |
| S5 | The matches judged | **Unchanged: every figure over the matches all five models predicted, whatever is drawn** | Miikka, 2026-10-15 (Q5): "No, all five's matches (Recommended)". specs/060 S16. Hiding a line changes what is seen, never a number, and the cache keeps one report per provider, kind and competition. |
| S6 | `Osumatarkkuus`' y-axis | **Fitted to the drawn lines, as today over all five** | Miikka, 2026-10-15 (Q6): "Fit to drawn lines (Recommended)". Two close lines then spread across the chart, which is the point of choosing them. |

## Measured

Read from `main` at `7afb18d` on 2026-10-15:

- The report (`qualityReport` in `src/lib/prediction-quality.ts`) is computed
  for all five models at once, over the matches every model predicted, and
  cached 15 minutes per provider, kind and competition
  (`qualityCacheKey`, `quality:v3:…`). The rolling lines and calibration bins
  of every model are already in it.
- The page's other choices are links that rebuild the query string:
  `qualityHref(source, kind, competition)` gives
  `/ennusteet?alue=…&tyyppi=…[&kilpailu=…]`. The region switch drops
  `kilpailu`; the kind switch and `Kilpailuittain`'s rows keep it.
- The page is a server component with no client code. The legends
  (`LineLegend`) are plain lists.
- `Osumatarkkuus`' y-axis is fitted to the drawn lines, in steps of 10
  (`RollingChart`).
- Beside each chart, in words: above `Osumatarkkuus` a visible line of every
  model's accuracy (`Perustaso 48 % · Elo …`), the only place the page gives
  the accuracy totals; and under each chart a screen-reader list of each
  drawn line (`quality-rolling-text`, `quality-calibration-text`).

## UX / UI (Finnish strings)

On `/ennusteet` only (S4); the strings may be fine-tuned in implementation.

| Where | String |
|---|---|
| Label before the toggles, above `Osumatarkkuus` (S4) | `Kaavioissa näytetään:` |
| Each toggle | The model's name as `MODEL_LABELS` gives it: `Perustaso`, `Elo`, `Elo + vire`, `Elo + kotietu`, `Poisson` |
| A toggle's accessible name, shown | `{malli}, näytetään kaavioissa` |
| A toggle's accessible name, hidden | `{malli}, piilotettu kaavioista` |

The row wraps at 375 px, like the legends. Shown and hidden are told apart by
weight and by the faded sample, never by colour alone, in dark and light. The
only drawn model's toggle is not a link (Edge Cases).

## API & Data

**No new table, no migration, no provider request.**

| Needed | Where |
|---|---|
| The lines | The cached report, unchanged; filtered at render to the chosen models |
| The choice | The `mallit` query parameter (S2), parsed by `parseQualityParams` beside `alue`, `tyyppi` and `kilpailu` |
| Links | `qualityHref` gains the choice, and omits `mallit` when it is the default |

**Caching:** nothing new. The report's cache key and TTL (15 minutes) are
unchanged, because the choice is applied after the report is read (S2, S5).

## Edge Cases

| Case | Behaviour |
|---|---|
| No `mallit` | The default set (S1) |
| `mallit` lists the default set exactly | The same page; links omit the parameter |
| An unknown slug among known ones | Ignored; the known ones are drawn |
| Only unknown slugs, or an empty `mallit=` | The default set |
| `mallit` repeated (an array) | The default set, as a repeated `alue` falls back today |
| Slugs in another order, or one twice | The set they name; lines and toggles in the page's fixed model order |
| One model drawn | Its toggle is not a link, so at least one is always drawn |
| Switching region, kind or competition | The choice is carried (S2) |
| `Osumatarkkuus` has fewer than 200 matches (`tooFewSentence`) | No rolling chart; the toggles still show, since `Kalibrointi` follows them |
| A calibration line with every bin under 50 | Drawn as today (no points) when chosen; its toggle still works |
| `Täydellinen kalibrointi` | Always drawn and in the legend; not a toggle |
| No judged predictions (`NO_JUDGED`) or an error (`QUALITY_ERROR`) | No toggles, as there are no charts |
| Signed out | The sign-in prompt, as today; the parameter is ignored |

## Performance & Limits

None: the report is read and cached as today, and filtering five lines at
render costs nothing measurable.

## Security & Secrets

No new environment variable or secret. The parameter is matched against the
five known slugs, so nothing from it reaches a query or the markup unchecked.

## Logging

None new. The page only reads; a failed report is already logged at `error`
(`Unable to read the prediction quality`), and the choice changes no shared
data. No personal data.

## Acceptance Criteria

- [ ] A reader can choose which models `Osumatarkkuus` and `Kalibrointi` draw, on `/ennusteet` in both regions and both kinds, with and without a `kilpailu`
- [ ] With no choice made, the default set (S1) is drawn
- [ ] At least one model is always drawn: the last shown model cannot be hidden, and a choice naming no known model draws the default
- [ ] The choice survives the region and kind switches and the competition links (S2)
- [ ] The screen-reader text under each chart lists exactly the drawn lines; the figures S3 keeps whole still show all five
- [ ] Every figure is still judged over the matches every model predicted, whatever is drawn (S5)
- [ ] The toggles work without scripting, at 375 px, in dark and light, shown and hidden told apart without colour
- [ ] No provider request, no new cache key, and every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/prediction-quality.test.ts` | `qualityHref` with and without a choice; the default omitted; slugs in model order |
| `tests/unit/components/prediction-quality-page.test.tsx` | `parseQualityParams`' `mallit`: missing, default, unknown, all unknown, empty, repeated, reordered, duplicated. The charts draw only the chosen lines; the legends and screen-reader lists match; `Täydellinen kalibrointi` always drawn; the last shown toggle not a link; the switches and competition links carry the choice; no toggles on `NO_JUDGED` or `QUALITY_ERROR`; toggles shown when the rolling chart is not |
| `tests/unit/lib/prediction-quality-service.test.ts` | The cache key unchanged by a choice |
| `tests/e2e/prediction-quality.spec.ts` | Toggling a model hides and shows its line, at 375 px; the choice survives switching kind |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/068-model-choice-on-ennusteet.md` (this file)
- `src/components/prediction-quality-page.tsx`, `src/lib/prediction-quality.ts`
- `decisions/068-model-choice-on-ennusteet.md`, by the implementing agent

## Open Questions

**None.** Q1–Q6 were answered on 2026-10-15 and are S1–S6, and the spec is
confirmed.
