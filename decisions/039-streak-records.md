# 039 — Streak records across stored seasons: decisions

Implementation notes for `specs/039-streak-records.md` (#447). The spec says
what the panel shows; this says how, and where the implementation had to decide
something the spec did not.

## The property everything serves

**A record must be a run the club actually had.** Every rule here removes a way
of inventing one: joining two spells in different divisions, joining two seasons
with an unfetched season between them, or counting matches the rest of the page
does not count as league matches. A record that is merely *too small* is a
disappointment; a record that never happened is a lie, and the panel is only
worth having if it cannot tell one.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the arithmetic lives | `streak-records.ts`, pure | Same split as specs/038: the services read, this computes. The season-grouping rule is the whole feature, and it is tested without a database. |
| Where the orchestration lives | `recordsFor`, in the pure module, from the start | specs/038 was written once per provider and that cost two branches no test could take and one no test could reach. Written once here, before the second provider existed. |
| Reusing `streaksOf` | Unchanged | Each block's matches are concatenated and handed to it as one sequence. A run that ends one season and continues into the next is then simply a run, with no special case anywhere. |
| How a record finds its season | Tag each match with its season, then order with `teamMatchesInOrder` | It is generic over its element type, so the tagged array comes back in exactly the order `streaksOf` numbers its runs over. The streak's `from`/`to` therefore index it directly — no second ordering to keep in step with the first. |
| A run's span when it is out of range | **Throws** (`labelAt`) | Unreachable, because `streaksOf` numbers over exactly that array. A `?? ""` would have printed `Kausi ` and read as a season — a wrong value rather than an error. The services catch it. |
| Blocks carry their own last season | A `{ last, seasons }` pair while grouping | Reading the last element back off the array meant an "empty block" case that cannot happen, and lcov counts a branch no test can take. Carrying it removes the case rather than defending it. |
| Where `leagueSeasons` lives | Split out of `otherLeagueSeasons` in `season-comparison.ts` | The record book counts every stored season and the comparison excludes the selected one, but *which seasons are league seasons* must mean the same to both, or the two panels would disagree about what a club's history is. |
| The season label | Passed in from the page | `spansCalendarYears` is discovered at runtime, not held in the registry, so a service cannot compute it. Taking the page's own function makes "the same wording the selector uses" true by construction rather than by review. |
| `Tämänhetkinen putki` | **Not** repeated here | A record book has no "now". `Putket` owns the current run, and repeating it would make the two panels look like the same panel twice. |

## What the tests prove, and how

- **The rule, three ways**: a relegation, a **promotion**, and a season missing
  from storage each break a run, asserted separately at both the block level and
  the record level.
- **A run does cross a boundary** when it is allowed to: three wins ending one
  season and three beginning the next are one run of six.
- **The tie-break**: two spells with an equal record give the most recent; a
  longer record from an older spell still wins.
- **The span**: a record inside one season names that season; one that crossed
  names both; a foreign season keeps its own `2024/25` wording.
- **End to end, against the panel above it**: the record is never shorter than
  the same run inside the selected season. That is asserted against `Putket`'s
  rendered figure rather than a number typed into the test, so it cannot pass by
  agreeing with a stale constant.
- **Eleven mutations**, all caught.

### The mutations

**The rule (6).** Any two seasons joining; same-competition joining across a
gap; consecutive years joining across competitions; an equal record keeping the
older spell; blocks ordered newest first; a span ending where it started.

**The panel (3).** A one-season record reading as two; one of a thing taking the
plural; a club with no record showing four blanks.

**The orchestrator (2).** A failed season read ignored; a club with no league
season still getting a panel.

### One mutation escaped first, and what it showed

*Consecutive years joining across competitions* survived the first run. The
relegation fixture was `VL 2024 → M1 2025 → VL 2026`, which sorts to
`M1 2025, VL 2024, VL 2026` — and no two adjacent entries there are consecutive
years, so removing the competition test changed nothing. A **promotion**,
`M1 2024 → VL 2025`, is the case where the years *do* line up and only the
competition test separates them. Both are now asserted, which is what the spec
meant by "verified separately".

## Left open, deliberately

- **The Finnish wording** is agreed for now and is the likeliest thing to
  change once the page can be seen. `Ennätykset`, `Kausi {a}` / `Kaudet {a}–{b}`
  and two messages are new; the four figure labels are `Putket`'s, reused.
- **`Putket` still shows its own four longest figures**, beside four similarly
  named records. Whether that reads as duplication is a question for the page,
  not for this change, and belongs in its own issue.
- **Ten panels.** #424 was filed at five. This does not block it, but it grows
  it.
