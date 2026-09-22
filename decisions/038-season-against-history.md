# 038 — This season against the club's other seasons: decisions

Implementation notes for `specs/038-season-against-history.md` (#448). The spec
says what the panel shows; this says how, and where the implementation had to
decide something the spec did not.

## The property everything serves

**A season is only compared with seasons it can be compared with.** The spec's
five settled decisions all protect one thing: that the baseline is a fair
question to ask of the selected season. Self-inclusion damps the answer, a cup
distorts a per-match rate, a raw rank means different things in different
divisions, and a matchday means different things in seasons of different
lengths. Each rule removes one way of comparing unlike with unlike.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the arithmetic lives | `season-comparison.ts`, pure and async nowhere | The providers differ in how a season is found and ranked, not in what is done with it. The services read; this computes. It is tested without a database, and both providers get the same answer by construction rather than by review. |
| Where "which seasons count" lives | `otherLeagueSeasons`, in the pure module, with `isLeague` passed in | Excluding the selected season must not differ between providers; the league test must, because a foreign competition carries its format in the registry and a domestic one is tested against the cup list. Splitting it this way put the shared half in one place without pretending the other half is shared. |
| The mark | `BarChart` (#329), unchanged | Rows with their own scales and two bars each is already this panel's shape, it already survives a phone at 400 units, and its text is already `–` for a missing value. Nothing new to build, and the same measure is drawn the same length in both panels. |
| A position's direction | **Not inverted**: a short bar is a high finish | `Päästetyt maalit / ottelu` already reads that way on this page. Inverting only the position row would make one of the two rules wrong, and a reader would have to know which. |
| A position's printed value | The place it is, in the selected season's table: `3.` and `5,8.` | A share (0,25) is the right thing to compute and the wrong thing to show. The baseline keeps its decimal because it is an average of places, which nobody finished in; the season's own is whole. |
| A position with no table behind it | `–` | Without a `teamCount` a share is not a place, and printing the share itself would be a second unit in the same column. |
| The text alternative's full stop | Suppressed when the value already ends in one | Caught by its own test: a position already carries its ordinal period, so the sentence read `tavallisesti 6,0..`. |
| The TASO read's order | Classify first, then ask for the club's matches | Written the other way round first, which left `classified.status !== "ok"` unreachable — `teamLeagueMatches` has already classified and reported anything but "ok". Rather than keep a branch no test could take, the call order changed so the branch is real. |
| Where the orchestration lives | `comparisonFor`, in the pure module, with the season `read` passed in | Written twice at first — once per provider — which cost two branches no test could take and one no test could reach. The providers differ in how a season is found and ranked and in nothing else, so the sequence lives once and the failure rules cannot drift apart. |
| A failed read versus an empty season | Told apart, and any failure fails the panel | Sourcery caught the first version collapsing both into `null`: a failed *selected* season read as "no panel", and a failed *baseline* season was dropped silently, leaving a plausible comparison whose own `Verrattuna {n} muuhun kauteen` line stated an `n` it had not read. Both providers had it; both are fixed by the shared orchestrator. |
| A season that ranks nothing | Kept, with a null position | A pass-through or knockout group ranks nobody, but the club's results are still its results. Dropping the season would quietly shrink the baseline of every rate to protect one row. |

## What the tests prove, and how

- **The baseline excludes the selected season**, shown with a case where
  including it could not give the asserted number: a 3–0 season against a 0–3
  one gives 3 points a match and a baseline of 0.
- **Pooling, not averaging averages**: one win in a one-match season and none in
  a nine-match season pools to 0,3 points a match. Averaging the seasons' own
  rates would give 1,5 — five times as much — and let a one-match season count
  as heavily as a full one.
- **A share, not a matchday**: a selected season 20 rounds into 27 reads a
  22-round season at *its* round 16, not at its 20th or its last. A season
  shorter than the selected season's matches played still contributes, which is
  the whole point of the rule.
- **Positions are averaged and rates are pooled**, asserted separately, so a
  future change cannot quietly make both the same.
- **Both providers**, each against its own fixtures, including a TASO season
  whose table ranks (verified rows) and one whose table does not (pass-through).
- **Twenty-two mutations**, all caught, listed below.

### The mutations

Twenty-two, in four groups, each of which failed at least one test.

**The arithmetic (10).** Baseline including the selected season; positions
summed rather than averaged; the share inverted; the clean-sheet share not
divided by matches; `addStats` dropping the second side's goals;
`seasonLength` taking the first round rather than the last; the share not
clamped to 1; a position read after the matching round rather than at it; the
first position rather than the last; no floor of one round.

**The panel (5).** The sentence adding a second full stop after a place; the
season's own place keeping a decimal; a place without a table printed as `0.`
rather than `–`; a missing value drawn as a real zero; the baseline bar not
outlined.

**The services (3).** The foreign service filtering nothing, so cups and the
selected season would count; the TASO service naming a season by its raw
category id; the TASO service keeping a club with no league match that season.

**The failure rules (4), added after review.** Only an all-failed read failing
the comparison; a failed selected season reading as "no panel"; a failed
baseline season ignored; every successful read dropped from the baseline.

### What `test:shuffle` caught that no single run did

The TASO tests shared one season id while supplying **different** stored rows
to it. `classifySeasonGroups` is `cache()`d and `vi.clearAllMocks()` does not
clear that memo, so whichever test ran first decided what the others saw — a
failure cached under a season became an error in a test expecting no panel.
It passed in file order and failed about one shuffled run in three.

Each test in that block now takes its own season id from a counter. The general
rule the next such test needs: **`vi.clearAllMocks()` resets mocks, not React's
`cache()`** — two tests that mean different things by the same cache key will
collide however carefully their mocks are reset.

Two mutations earned their place by failing first:

- **The baseline bar's outline** was not asserted at all until its mutation
  escaped. The outline is the only thing telling the two columns apart without
  colour, so nothing was checking the panel's one visual distinction.
- **The cup-filtering test passed for the wrong reason.** Its mock ran out of
  rows before the unfiltered seasons could be read, so a service that filtered
  nothing still reported one baseline season. It now supplies four seasons'
  rows, and filtering nothing gives three. Correcting it also showed that
  `getCompetitionFormat` defaults an unknown code to `"league"` — the fixture
  had used an unregistered cup code.

## Left open, deliberately

- **The Finnish headings** are agreed as good enough to build on, and Miikka may
  revisit them once the real page can be seen. Four strings are new — the
  heading, the two column labels and the line naming the baseline — while all
  six row labels are reused verbatim from existing components, so a rewording
  touches those four and nothing else.
- **How a season's share rounds to a round** — `Math.round`, so a share landing
  between two rounds takes the nearer. Stated here rather than in the spec
  because it is a tie-break, not a rule.
- **No cache** (S11). Up to twelve small indexed reads for a Finnish club, four
  for a foreign one, and the selected season's read is already warm from the
  other panels. If measurement later says it hurts, a single `inArray` query is
  the cheaper fix than a cache that would need an invalidation story for the
  active season.
