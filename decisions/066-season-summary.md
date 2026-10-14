# 066 — Kausi lyhyesti: decisions

Implementation notes for `specs/066-season-summary.md` (#356). The spec says
what is shown; this says how, and where the implementation had to decide
something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `season-summary.ts`, pure: one detector per fact (`sideFact`, `runFacts`, `upsetFact`), `rankFacts` for R5, and `seasonSummaryFor`, which reads through readers the caller passes | As `comparisonFor` and `recordsFor`: one orchestrator for both providers, every rule unit-tested without a database. |
| The read path | `season-summary-service.ts` adds the upset read and the one `error` line; each provider's `getTeamSeasonSummary` passes its own season reader and its own `getTeamStreakRecords` | The providers differ only in how a season is read, which they already say once for `Tämä kausi verrattuna`. The block's records are `Ennätykset`'s own call, so the two cannot disagree. |
| What is read for a past season or a cup | Nothing: the selected season is checked against the club's league seasons first, and the other seasons are read only once it has five matches played | S9 and S6. Most team-page views are not the latest season. |
| Rounding before comparing (R1) | `Number(value.toFixed(1))`, the same `toFixed(1)` `formatDecimal` prints with | Two seasons the panel prints alike are equal, whichever way binary rounding went. |
| An earlier season with no match on that side | Stops the count, as an equal season does | A count past a season with no figure would claim a comparison it did not make. Only a hand-built season can lack every home match. |
| An earlier season with nothing stored | Left out of the comparison, as `Tämä kausi verrattuna` leaves it out (`readSeasons`) | One rule for what a compared season is, on the same page. |
| The upset's ceiling (S10) | Below 25 % **as printed**: `Math.round(probability * 100) < 25` | A win Elo gave 24,6 % prints `25 %`; under a raw comparison the block would state a figure its own rule says is not under 25 %. R1's rule, applied to the upset's figure. |
| The upset's read | `getTeamUpset` beside `getSeasonSurprises`: the same backtest query, narrowed in TypeScript by `teamUpset` in `surprise.ts`, ordered as the list orders | The list's query already returns the season's predicted matches; a second query for one team would duplicate its join. `predictedIn` now picks the provider's query for both. |
| A failed upset read | Thrown to `getSeasonSummary`, which logs `Unable to summarise the season` once | The spec's one log line carries the provider, team, competition and season; `getSeasonSurprises`' own line knows none of the team. A failed season read reports `error` and is logged by its own service, so the block logs nothing more for it. |
| The in-progress line | `inProgressSeasonLine` from `competition-analytics.tsx`, the line specs/057's list prints | The same `Kausi 2026 (kesken)` wherever a season is marked in progress. |
| In progress | `seasonId === activeSeasonId`, as specs/057 and goals per game decide it | One rule for `(kesken)` across the site. |
| Where the sentences live | Beside the block, in `season-summary-section.tsx`, not in `lib/` | They print with `formatDecimal`, `percentText` (through `eloGaveText`) and `teamDisplayName`; the first two are components', and nothing in `lib/` imports a component. As `eloGaveText` sits in `season-surprises.tsx`. |
| `1 ottelu` | A run of one match is singular | Finnish counts one thing differently, as `Ennätykset` does. The spec's table shows only plurals. |
| The upset's link | `next/link`, built by the team page from its `basePath`, the same function the match list uses | One link, not one per row, so it is not a `RowLink` (decisions/489). The page already knows where its matches live. |
| A failed season lookup | The block shows its failure line, as `loadRecords` and `loadComparison` do | Read as no seasons, it would silently show no block. |
| A national team | `loadSummary` answers `unavailable` on both national-team pages | S6. |

## Where this differs from the spec

| The spec | Built | Why |
|---|---|---|
| R4 and the edge-case table: "A run equal to the earlier record counts, as specs/039 S7 gives a tie to the most recent run" | Stated when `Ennätykset` names the selected season, which it does for a tie **between two spells** (S7). A tie **inside one spell** of consecutive seasons is not stated | specs/039 S7 is about blocks: inside a block `streaksOf` reports the first of equally long runs, so `Ennätykset` names the earlier season. The spec's mechanism (the API table: "the fact holds when the record's span ends in the selected season") and its reason ("so the sentence agrees with `Ennätykset`") both give this. Raised with Miikka on the pull request. |
| Sentences in `season-summary-sentences.ts`, tested in `tests/unit/lib/` | In `season-summary-section.tsx`, tested in `tests/unit/components/season-summary-section.test.tsx` | Above, under "Where the sentences live". |

## What the tests prove, and how

To be written once the mutation pass has run.

## Measured

To be written: the render time before and after on the TASO club with the most
stored seasons.
