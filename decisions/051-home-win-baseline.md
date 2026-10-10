# 051 — Home-win baseline: a competition's own history as a prediction: decisions

Implementation notes for `specs/051-home-win-baseline.md` (#343). The spec says
what the panel shows; this says how, and where the implementation had to decide
something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| The read | specs/049's per-season outcome read, parameterised: `footballDataSeasonOutcomes` and `tasoSeasonOutcomes` now take the competitions and a floor, and `null` means no floor | S2 differs from specs/049 only in which seasons count. One read means one definition of a result — the shoot-out subtracted (#492), finished with both scores — rather than a second query able to drift from the first. |
| Where the rules live | `home-baseline.ts`, pure: which matches are predicted (S3, S5), the sum into three shares, the season range and its kind | As `outcome-shares.ts`: the service only counts, so every rule is unit-tested without a database. |
| Which seasons count | Every season with at least one finished match; unplayed matches count nowhere | S2. The read counts only finished matches with both scores, so the season in progress contributes what has been played. A season with none — next season's fixtures, already published — does not widen the range the line names. |
| Filing a TASO match | By its season's exact `(competition_id, category_id)` pair, through `competitionForSeasonPair`, now shared with specs/049's read | The history is counted by that rule, so a match and the history it is predicted from are the same competition. `competitionCodeForCategory`, which the match page already uses for its team links, matches the category alone and would file a cup published under a league's category as the league. A national-team row matches no pair, so S5 needs no rule of its own. |
| Upcoming | `SCHEDULED` or `TIMED`, on both providers | S3. TASO's normaliser maps `Fixture` and `Planned` to `SCHEDULED`; it has no `TIMED`. |
| A season across two years | Any counted season spanning, from the stored kickoffs specs/049 reads | A whole fixture list is stored, so the season in progress already spans from its first sync, and one competition's seasons are all one kind. |
| The explanation line's grammar | `kausilta 2015–2026` for a range, `kaudelta 2026` for one season; `1 ottelun tulos` for a single match | The spec's string names a range of seasons and many matches; S11 makes one match possible, and a brand-new competition has one season. |
| The count | `Intl.NumberFormat("fi-FI")`: `1 003`, a no-break space between thousands | The spec asks for a thousands separator. No other count in the app uses one — specs/049's `Ottelut` prints `1140` — and aligning that is outside this feature. The no-break space keeps the number whole when the line wraps, as `percentText`'s does. |
| The three chances | A `<dl>`, one term and value per outcome, wrapping at 375 px | The label and its percentage stay together when the row wraps, and a screen reader reads each pair. |
| Signed out | The heading with `Kirjaudu sisään nähdäksesi ennusteen.`, only where a prediction would show | S4. The gate is asked after `baselineCompetition`, so a finished match asks nothing, and before the read, so a signed-out page carries no share. |
| The rounding line | specs/049's `ROUNDING_NOTE`, imported | The same sentence for the same reason; one constant. |
| The model identifier | `HOME_BASELINE_MODEL = "home-baseline-v1"` in `home-baseline.ts` | S10. Nothing reads it until #349. |

## What the tests prove, and how

- **Twenty-five mutations, all caught but one.**
  - In the rules: `TIMED` dropped, empty seasons counted, the span taken from every season, any football-data or TASO competition predicted, the shares rounded, the range's last season.
  - In the component: the singular match and season, the gate, the thousands separator, the rounding line, the empty and failure lines, a share shown under the wrong label.
  - In the page: the panel removed.
  - In the registry: either half of the season pair.
  - In the service: the log, the providers swapped, another competition's rows counted.
  - In the SQL, against Postgres: the season floor restored on either provider.
  - End to end: any TASO competition predicted, which puts a panel on an upcoming Suomen Cup match.
- **One survives, on purpose.** Moving the panel inside the head-to-head block keeps it between the match's details and `Aiemmat kohtaamiset`, which is all S6 asks.
- **One first survived.** The service test gained a row from another compared competition, which reading more than the one competition now counts.
- **The integration test measures what its rows add**, as specs/049's does: a 2010 season below the plan floor, a shoot-out draw, and a season in progress with a finished, a timed and an in-play match; on TASO, a 2016 season, a scheduled and a live match, and a Liigacup row under Veikkausliiga's category.
- **The e2e seeds its upcoming match** in 2099, a season nothing else stores, and deletes it afterwards. Whether a real league has a match left to play depends on the time of year; the rules asserted — three whole percentages, the line, the placement, no panel on a finished match or an upcoming cup match, no share signed out — do not.

## Verified against local data

The seeded Veikkausliiga fixture, signed in, at 375 px in light and dark and at
1280 px: `Kotivoitto 42 %`, `Tasapeli 26 %`, `Vierasvoitto 32 %` from 1 003
stored matches in the suite's database; the three wrap onto two lines at
375 px and sit on one at 1280 px; both lines under them.

## A correction to the spec

The spec placed the panel before `Keskinäiset ottelut`. The match page's
section is `Aiemmat kohtaamiset`; the spec now says so, and the placement is
unchanged.

## Moved from comments, 2026-10-06

Cut from `src/lib/match-service.ts` at `a86c1cb` by #531.

- **`getHomeBaseline`.** Never `empty` on a failed read, which would say the
  competition has no finished match. Unplayed matches count nowhere, since
  only finished matches with both scores are counted.

Cut from `src/lib/domestic-competitions.ts` at `a86c1cb` by #531.

- **`competitionForSeasonPair`.** Stricter than `competitionCodeForCategory`:
  a category id alone does not decide it, since a cup can publish under a
  league's category (a `P20SM` row under `Liigacup25`) and a junior id can
  outlive its era. The outcome counts and an upcoming match are filed by the
  same rule, so a match and the history it is predicted from are the same
  competition.

Cut from `src/lib/home-baseline.ts` at `ef99862` by #531.

- **`home-baseline.ts`.** The baseline is the answer every later model has
  to beat. The counts are the ones the comparison of competitions reads, and
  this decides which matches get a prediction and sums the counts into one.
- **`baselineCompetition`.** The pair is the rule the history is counted by,
  so the prediction and its history are the same competition. A
  national-team match matches no pair and gets none.

Cut from `src/components/match-prediction.tsx` at `ef99862` by #531.

- **`MatchPrediction`'s gate.** A signed-out page carries no probability.
  Awaited by the page and not rendered, as `CompetitionAnalyticsSection`
  is.
