# 068 — Choosing which models /ennusteet's charts draw: decisions

Implementation notes for `specs/068-model-choice-on-ennusteet.md` (#659). The
spec says what the reader chooses and what follows the choice; this says how,
and where the build had to decide something the spec did not. It builds on
decisions/054 (the page), decisions/056 (its competition links) and
decisions/060 (the five models and their lines).

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `src/lib/prediction-quality.ts`, pure, beside `qualityHref`: the slugs, `DEFAULT_DRAWN`, `parseDrawn` and `toggleDrawn`; `qualityHref` takes the drawn models as a fourth argument, the default when left out | One place builds and reads `mallit`, so a link and the page that reads it cannot disagree. The other callers (`Ennuste`, `Kauden ennuste`) pass nothing and link to the default, as before |
| `QUALITY_MODELS` | Moved from `prediction-quality-service.ts` into `prediction-quality.ts`, unchanged; the service imports it | The order of models in `mallit`, the toggles and every figure is then one list. The service imports the database, so the pure module could not import the list from there |
| The canonical choice | Always in `QUALITY_MODELS`' order, each model once: `parseDrawn` and `toggleDrawn` both return it, and `qualityHref` orders what it is given | A choice compared as given would make `mallit=poisson,elo` and `mallit=elo,poisson` two addresses, and the default in another order would not be left out (S2) |
| What `mallit` accepts | The five slugs exactly as spelled, comma-separated; anything else in the list is dropped; nothing known, an empty value or a repeated parameter gives the default | Edge Cases. Case and spaces are not forgiven (`Poisson`, ` poisson`): the page writes every address, and a stricter parser has fewer cases to get wrong |
| The default | `Perustaso`, `Elo`, `Poisson` (S1); with no `mallit` the address is as it was, so every existing link and bookmark lands on it | S2: the parameter left out |
| The toggles | One list above `Osumatarkkuus`, after the window line and the backtest note, labelled `Kaavioissa näytetään:` through `aria-labelledby`; one item per model of the report, in its order | S4. Inside `Report`, so the empty and failure states have none; outside the rolling chart's branch, so they stay when it gives way to the count, since `Kalibrointi` follows them |
| A toggle's look | Shown: `font-semibold`, the sample in the foreground colour. Hidden: `text-muted`, `hover:underline`, the sample `stroke-muted`. The sample is the line's own dash | S4, and the page's switches mark their current option the same way. Shown and hidden differ by weight, not only by colour; seen at 375 px and 1 024 px in both schemes |
| A toggle's name | The visible name `aria-hidden`, and one visually hidden string with the whole name: `Elo, näytetään kaavioissa` | A hidden suffix after the visible name was named `Elo , näytetään kaavioissa` by Chromium, which puts a space around an absolutely positioned span. One string names a link and the lone non-link item alike, which `aria-label` would not, since a `span` takes none |
| The last shown model | A `span`, not a link, semibold | Edge Cases: at least one model is always drawn. There is no address that would hide it |
| The sample | `LineSample`, exported from `line-chart.tsx`; `LineLegend` draws its samples with it | One drawing of a line's sample for the legends and the toggles. Every legend's markup is as it was: the legend tests' dash assertions pass unchanged |
| What follows the choice | `Report` filters `rolling` and `calibration` to the drawn models before the charts get them; the legends, the screen-reader lists and the y-axis follow from that | S3, S6. The accuracy line, both tables and `Kilpailuittain` read the report whole |
| Links that carry the choice | Both switches, each competition's row, `Kaikki kilpailut` and every toggle; the region switch still drops `kilpailu` | S2. decisions/056's rule for `kilpailu` is unchanged |
| The read and the cache | `getPredictionQuality(source, kind, competition)` as before, `quality:v3:*` unchanged | S5. The choice is applied after the read, so it never reaches a cache key |
| The cache key's test | The spec's Tests Required names `prediction-quality-service.test.ts` for "the cache key unchanged by a choice"; no test was added there. The page test asserts the read is asked for the same report whatever is drawn (mutation 26) | `qualityCacheKey` takes no choice, so a test of it could not fail; the read's arguments are where a choice could reach the key |
| specs/060 S6 | The variants are no longer in the two charts by default, only when chosen; every other figure still shows them | This feature's S1 and S3. specs/060 and decisions/060 stay as they were |

## The author's review before the first push

The pass in `skills/self-review.md` and the `code-review` skill, run on the
branch before it was pushed. What they changed:

| Finding | Outcome |
|---|---|

## What the tests prove, and how

- **The parameter**: every Edge Cases row for `mallit`: missing, the default,
  unknown beside known, only unknown, empty, repeated, reordered, duplicated
  (`tests/unit/lib/prediction-quality.test.ts`,
  `tests/unit/components/prediction-quality-page.test.tsx`).
- **The page**: the toggles' order, names, links and look; only the chosen
  lines in both charts, their legends and screen-reader text; the accuracy
  line and the tables whole; the axis fitted to the drawn lines; the last
  shown model not a link; every link carrying the choice; the toggles kept
  without the rolling chart and absent on the empty and failure states; the
  read asked for the same report whatever is drawn.
- **End to end**, against a production build: the default's three lines, a
  toggle showing and another hiding a model, the choice kept through the kind
  switch and back, the last model not a link, shown and hidden told apart by
  weight in light and in dark, and at 375 px the toggles inside the page and
  still working.
- **Every mutation below was caught**, each applied alone and restored from a
  commit, and each by the test written for it, read from the failing test's
  name:

| # | Mutation |
|---|---|
| 1 | A variant in the default |
| 2 | `mallit` read in the order given |
| 3 | No fallback when `mallit` names no known model |
| 4 | A repeated `mallit` read |
| 5 | A shown model appended, not in order |
| 6 | The default named in the address |
| 7 | The default and one more taken for the default |
| 8 | The address naming models in the order given |
| 9 | The rolling chart drawing every model |
| 10 | Calibration drawing every model |
| 11 | The last shown model a link |
| 12 | Shown and hidden worded the other way |
| 13 | A hidden model's sample not faded |
| 14 | A hidden toggle as heavy as a shown one |
| 15 | The faded sample drawn in the foreground colour |
| 16 | The region switch dropping the choice |
| 17 | The kind switch dropping the choice |
| 18 | A competition's link dropping the choice |
| 19 | The link back dropping the choice |
| 20 | A toggle dropping the competition |
| 21 | The accuracy line following the choice |
| 22 | A table following the choice |
| 23 | The toggles below the accuracy chart |
| 24 | The toggles shown only with the rolling chart |
| 25 | The toggles shown on an empty report |
| 26 | The page asking for a report of the drawn models' own matches |
