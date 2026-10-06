# 036 — Comebacks from a half-time deficit: decisions

Implementation notes for `specs/036-halftime-comebacks.md` (#335). The spec says
what the panel shows; this says how, and where the implementation had to decide
something the spec did not.

## The property everything serves

**A missing half-time score never reads as 0–0.** This is the first analytics
feature whose input the app did not already hold, and the input is incomplete by
nature: football-data refuses seasons outside the plan's window, and TASO gave no
half-time score for 1 of Ykkönen 2025's 132 played matches. Silence and a
goalless first half are the same two nulls in the row and the same zeroes on the
page unless something keeps them apart, so `comebacksOf` counts a match with no
half-time score as `missing`, never as a match the team did not trail, and the
panel says how many it could not read.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Storing it | Two nullable columns per match table, in the shared `matchTeamColumns()` | Q3. Both providers give a half-time score and both tables need it; one definition means the two tables cannot drift. Nullable twice over: an unplayed match has none, and a played one may still have none. |
| `??`, not `\|\|`, in both providers' mapping | `match.score?.halfTime?.home ?? null` | A goalless first half is `0`, and `0 \|\| null` is `null`. The one line where the whole distinction above would have been thrown away. |
| Both sides or neither | `halfTimeFor` returns `null` unless both are numbers | A half-time score with one side missing is not a score; treating the present side as a comparison would invent a result. |
| Figures, not a chart | A `<dl>` of three, as `Putket` | Three counts need no axis, and the panel reads as a sentence about the team. |
| `known === 0` | `Puoliaikatuloksia ei ole tälle kaudelle.` instead of the figures | Three zeroes are a claim — "never trailed" — that a season with no data does not support. |
| `trailed === 0`, `known > 0` | `Ei vielä otteluita tappioasemasta.` | The same reason, one level down: the team genuinely never trailed, and that is worth saying in words. |
| Some missing, some known | Both: the figures, and the missing line beneath | Q4, in the spec's own words — *do not hide* what is known. |
| The missing line's Finnish | `Puoliaikatulos puuttuu {n} ottelusta.` with no singular branch | The elative does not change for one: `1 ottelusta` is as correct as `5 ottelusta`. `matchCount` does need both forms (`1 ottelu` / `3 ottelua`). |
| Re-running the backfill | A `--refetch` flag on `scripts/backfill-run.ts`, off by default | Q7. Every skip site asks `alreadyStored`, so a plain re-run would write no half-time value at all. A flag leaves first-run behaviour untouched, and `docs/setup/022-production-backfill.md` says when to use it. |
| Reaching the columns | Widened TASO's `toFinishedMatches` and `teamLeagueMatches` to return the row, not a narrowed `NormalizedMatch` | The narrowed type dropped the half-time columns on the way through, so the panel would have seen `undefined` for every match — data the database had. |

## What the tests prove, and how

- **The arithmetic**, over a hand-written season where every figure can be
  counted by eye, alternating home and away so the team's own side is read
  correctly in both; and `won + drew ≤ trailed`, `known + missing = played`
  against `calculateStandings`, for both providers.
- **Missing is not zero**: a season stored before the columns existed reads
  `known: 0, missing: 6`, not six matches the team did not trail.
- **The league rule holds**: TASO's playoff match, a comeback win, is not
  counted — counting it would raise both `trailed` and `won`.
- **The column round-trips** through both sync paths, a goalless first half
  included, and a later sync fills in what an earlier one had as `null` — which
  is exactly what `--refetch` does in production.
- **End to end against the seeded 2017 season**, whose half-time scores are
  rewritten before every run: the figures, the missing line shown *beside* them,
  and nothing in a signed-out reader's HTML.
- **Mutations, all caught**: dropping `excluded.half_time_*` from either upsert,
  showing zeroes instead of each of the two messages, hiding the missing line,
  always using the plural, and printing the raw number without its unit.

## Left open, deliberately

- **Blown leads** — led at half-time, did not win — is the mirror measure, filed
  as #429 (Q2).
- **Who scored first, and when**: neither provider gives goal events on these
  endpoints, which is why #335 was rewritten to a half-time deficit at all.
- **The live-season e2e is an invariant check, not an exact one.** A past season
  that already has stored rows is never refetched, so whether a live league has
  half-time scores depends on when that machine's database was filled. The exact
  figures are asserted against the seeded season, which is rewritten every run;
  the live league is checked for `won + drew ≤ trailed ≤ played`, and for the
  no-data message when it has none.

## Moved from comments, 2026-10-06

Cut from `src/lib/taso.ts` at `a86c1cb` by #531.

- **`TasoProviderMatch.hts_A`.** Present for all but one of Ykkönen 2025's 132
  played matches, and for all of Veikkausliiga 2015, 2019 and 2025: measured.

Cut from `src/lib/taso-standings-service.ts` at `a86c1cb` by #531.

- **`FinishedMatchRow`.** Not narrowed to `NormalizedMatch`, which is a subset
  of the row, so `calculateStandings` and the rest still take one unchanged.

Cut from `src/db/schema.ts` at `a86c1cb` by #531.

- **`half_time_home`, `half_time_away`.** Nullable twice over. TASO omitted the
  half-time score for 1 of 132 Ykkönen 2025 matches, and football-data
  refuses older seasons outright. "No half-time score" and "0–0 at the break"
  must stay distinguishable.

Cut from `src/components/analytics-section.tsx` at `ef7eb13` by #531.

- **Panels, not charts.** Most are charts; `Putket` and `Kääntyneet ottelut`
  are lists of figures, which is why `AnalyticsSection` calls its parts
  panels.

Cut from `src/lib/comebacks.ts` at `dc74e3e` by #531.

- **`comebacks.ts`.** Two directions, one question: the deficits a team
  rescued and the leads it gave away. They are counted together because they
  come out of the same column and the same matches, so a match missing a
  half-time score is missing from both. Neither provider guarantees one:
  football-data refuses older seasons outright, and TASO omitted it for 1 of
  Ykkönen 2025's 132 played matches. A missing score and a goalless first
  half must not look the same, so the panel says how many it could not read.
  Counted over exactly the matches the other result panels count; the
  services pass them in.

## Moved from comments, 2026-10-07

Cut from `scripts/backfill.ts` at `5b180e0` by #531.

- **`--refetch`.** It exists for a column added after production was
  filled, the half-time score, where every stored row is complete by the old
  definition and empty by the new one; without it such a column stays null
  until each season happens to become the active one again. `--reset` is the
  other way to the same place, and throws the rows away first.
