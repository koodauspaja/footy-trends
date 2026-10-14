# 062 — Scoreline probability grid: decisions

Implementation notes for `specs/062-scoreline-probability-grid.md` (#514). The
spec says what the grid shows and where; this says how, and where the
implementation had to decide something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the grid comes from | `predictPoisson` returns the 0–10 grid it already built, as `grid`, beside the outcomes and the score read off it | Spec, API & Data. Nothing is computed twice, and the grid shown cannot come from other expected goals than the line above it |
| Who else gets a prediction | The predictions log, the backtest and the season simulation. Each takes the three outcomes from it and keeps nothing else | S9 and the criterion that `poisson-v1` and its rows are unchanged. No prediction is cached or stored whole, so the added field reaches no cache and no table |
| The fold | `foldScoreGrid(grid, cap)` in `poisson.ts`, pure; the component passes `SCORE_GRID_CAP`, 5 | S2. The cap is `Tulokset`'s own constant, so the two grids cannot come to disagree about what `5+` is |
| The cells | `scoreGridCells` in `match-prediction.tsx`: text, shading level and the mark, from one prediction | One function a test reads without drawing anything |
| A cell's text | `cellText`: a whole percent with the site's no-break space, and `<1 %` when it rounds to zero | S3. Written as the spec has it, without the space `Kauden ennuste` puts in `< 1 %` (specs/061 S9): at 40 px a cell has no room to spare. The two differ, and are left to differ |
| Shading | `Tulokset`'s `shadeLevel`, given the probability and the largest shown cell | S4. Its `ceil` already gives the edge case: any cell above zero is filled, one exactly zero is not |
| A cell that is exactly zero | `<1 %`, unshaded | Spec, Edge Cases. It cannot occur from a fit: every Poisson probability is above zero |
| The marked cell | The shown cell at the most likely score's goals, each capped at 5 | S5 and C2: the score is `mostLikelyScore`'s, so its tie-break is the model's and one cell is marked |
| The outline | A 2 px outline in the foreground colour with a 2 px ring of the background colour inside it, and the figure bold | S5. The marked cell is usually the darkest, where a foreground outline alone disappears, and can be a light one when a `5+` cell is larger. The two rings show on both, in both themes, from theme tokens only |
| One table for both grids | `score-grid-table.tsx`: `ScoreGridTable`, with `goalsLabel` and `shadeLevel` moved to it from the head-to-head page word for word | The spec's Files To Update leaves "shared rather than copied" open. `Ennuste` cannot import from the head-to-head page, which imports `Ennuste`'s body. `Tulokset` renders the markup it did; its tests pass unchanged apart from where two helpers are imported from |
| Where it sits | A block under the Poisson line: the line above the grid, the grid, the line under it; then the failure lines and the notes as before | Spec, UX / UI |
| The corner | `HJK ↓ / KuPS →`, the names the Poisson line uses | S6 |

## Where this departs from the spec

- **`tests/unit/components/head-to-head-page.test.tsx` has no test of the
  grid.** That file replaces `Ennuste`'s body with a stand-in, as it has since
  specs/058, so it can show only that the body is drawn in
  `Seuraava kohtaaminen`, which it did already. That the grid is there, home
  side down, and that its rows read the same as on the match's own page, is
  held end to end in `tests/e2e/rivalry-prediction.spec.ts`.

## What the tests prove, and how

- **Every mutation below was caught**, one row each:

  | # | Mutation |
  |---|---|
  | 1 | The fold's rows and columns swapped |
  | 2 | Scores past the cap dropped, not summed |
  | 3 | Folded cells overwritten, not added |
  | 4 | The fold one goal short |
  | 5 | The prediction carrying another grid than its outcomes were read off |
  | 6 | A cell rounding to zero printed `0 %` |
  | 7 | `<1 %` printed below 1,5 % |
  | 8 | Shaded against the most likely score, not the largest shown cell |
  | 9 | The mark on the largest shown cell |
  | 10 | The mark not capped at `5+` |
  | 11 | The mark's row and column swapped |
  | 12 | Every cell marked |
  | 13 | The grid turned, away down |
  | 14 | The corner naming the away side first |
  | 15 | The grid shown without a Poisson row |
  | 16 | The line above the grid left out |
  | 17 | The line under the grid left out |
  | 18 | The grid above the Poisson line |
  | 19 | The marked cell not bold |
  | 20 | The marked cell not outlined |
  | 21 | Every cell outlined |
  | 22 | The mark replacing the shading |
  | 23 | `Tulokset` printing a zero in an empty cell |
  | 24 | `Tulokset` shaded against the wrong total |
- **The figures in the tests are worked by hand**, not read back from the
  code: at expected goals 1,6 – 1,1, 2–0 is e^-2,7 · 1,6² / 2, 8,6 %, and 0–2
  is 4,1 %, each a little less once the draws are scaled by 1,1.
- **End to end**, against a production build: the seeded upcoming match shows
  36 cells, each a whole percent or `<1 %`, home side down, with one cell
  outlined and bold, and that cell is the score the Poisson line names with
  the line's own percentage; signed out, no cell is in the HTML. On the
  rivalry page the grid is in `Seuraava kohtaaminen`, and every row reads as
  on the match's own page.
- **By eye**, 2026-10-13, on that build, HJK – AC Oulu (expected goals
  2,4 – 1,0, most likely 2–1 at 10 %): at 375 px and 1 280 px, light and dark.
  The six columns fit a 375 px screen without scrolling, `<1 %` fits its
  cell, and the outline shows on the darkest cell in both themes.

## Not done

- Row or column totals, a grid for a finished match, and goal-count
  probabilities: out of scope (S8).
