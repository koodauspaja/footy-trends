# 040 — Analytics for cup competitions: decisions

Implementation notes for `specs/040-cup-analytics.md` (#425). The spec says what
a cup page shows; this says how, and where the implementation had to decide
something the spec did not.

## The property everything serves

**A figure counts the matches the page it sits on is about, and no others.** A
cup page's panels count that cup; a league page's count that league. Every
decision below is that rule applied somewhere: to the match selection, to the
comparison's baseline, to the records' seasons, and to the line that says which
competition the records are of.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| The cup match selection | `teamCupMatches` **beside** `teamLeagueMatches`, with `teamPanelMatches` choosing | The spec's S8. `teamLeagueMatches`'s table-groups-only step is what keeps the Veikkausliiga playoff out of every panel; a single function that sometimes skips it would put that rule one edit from being widened, and a league would count playoff matches with nothing to notice. The two mutations for this — a cup read through the league path, a league read through the cup path — fail 5 and 13 tests respectively, which is the margin the split buys. |
| Where the choice is made | Inside the service, from the category | The panel services take a `categoryId`, not a competition code, so `isCupCategory` maps one to the other. Deciding at the call sites would have meant seven of them agreeing, and a cup match would be whatever the last edited one thought. |
| The baseline's membership | `seasonsBeside(competitionCode)` — league seasons for a league, that cup's own for a cup | specs/038 and specs/039 already excluded cups from a league baseline; this is the same rule facing the other way. Without it a cup page would compare a six-match run against a 27-match league season. |
| Dropping the `Sijoitus` row | `UNRANKED_MEASURES`, passed from the service | A `–` means "no value this time"; on a cup there can never be one. Passing the measures rather than a boolean keeps `compareSeasons` ignorant of what a cup is. |
| `Ennätykset` naming its competition | `competitions: string[]` **replacing** `seasons: number` | That field was added in #447 and never rendered — dead data. Adding the names beside it would have left an unused count next to a used list, which is the pair that drifts. |
| The gate | Removed, rather than widened to `league \|\| cup` | Every competition is one or the other, so a test that admits both is a test that admits everything. What remains is `result.status === "ok"`, and the *position loader* answers `unavailable` for a cup — so the one panel that needs a table is the one place that knows about tables. |

## What the tests prove, and how

- **The separation, in both directions and on both providers.** A cup page's
  baseline excludes the club's league seasons, and a league page is unchanged —
  asserted on the same club so a rule that held on one page only would show.
- **The selection is the whole job**: a knockout group's matches are counted by
  `teamCupMatches` and dropped by `teamLeagueMatches`, and a cup panel reads
  where the league path returns nothing.
- **End to end**, a cup page shows nine panels and never `Sijoitus
  kierroksittain`, while the league page for the same club still leads with it.
- **Five mutations**, all caught: the wrong selection in each direction, a cup
  baseline widened to every league, the `Sijoitus` row kept, and the same
  widening on the football-data side.

### One e2e test proved nothing, briefly

`drops the Sijoitus row from the comparison on a cup` called `count()` on a
region without waiting, got 0, and its `test.skip()` guard turned that into a
pass. The panel was there all along. The guard is gone and the test waits — a
skip conditioned on the thing under test is a test that reports success for the
one failure it exists to catch.

## Left open, deliberately

- **The national teams are #459**, and are a different job: `isFinlandMatch`
  matches on the name `"Suomi"` while every analytics function takes a
  `teamId: number`, and the page has no season axis.
- **`tests/unit/app/national-teams/pages.test.tsx` needed `usePathname` and
  `useSearchParams`** once those pages started rendering `Analyysit` — `WC` and
  `EC` are cups, so they gained analytics with everything else. The mocks are
  the test catching up with the feature, not a workaround.
- **A `WC` or `EC` club's records will rarely span two seasons**, because
  specs/039 joins only consecutive years and tournaments are four apart. That is
  correct: a run cannot cross a tournament the team did not play.
