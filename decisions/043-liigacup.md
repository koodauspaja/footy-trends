# 043 — Liigacup: decisions

Implementation notes for `specs/043-liigacup.md` (#474). The spec says what the
page shows; this says how, and where the implementation had to decide something
the spec did not.

## The property everything serves

**Miesten and Naisten Suomen Cup render exactly as they did.** The spec says so
in the words it was given — *"in this spec, you MUST not touch that
competition"* — and most of what follows is that rule applied: every new path
is reached through a registry declaration those two cups do not make, never
through a rule their data could happen to satisfy.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Which cups get tables and a playoff | A declared `cupFormat` in the registry, `groups-and-playoff` on `LC` and `M1LCUP` only | Structure alone would have reached MSC: MSC 2021's six 4-team groups are round-robins by any test. Asserted directly: an MSC group shaped like a round-robin is still a list. |
| Telling a group from a playoff | `isRoundRobin` — at least 3 teams, every pair met | Points cannot: `getCategory` sends them for knockout groups too, which is #272. Three teams is the floor because a lone final is trivially "every pair met". |
| Where the cup check asks | `competitionCodeForCategory(categoryId)` first, then the registry | `buildGroup` asked `isDomesticCup(categoryId)`, which only worked because every cup's category id equalled its code. `LC2023` does not, so 2023 would have rendered as a league. `isCupCategory` already existed beside it doing it properly; `buildGroup` now uses it. For MSC and NSC it answers the same, since their category id *is* their code. |
| Splitting `1-4` | `splitCombinedKnockout`, then specs/015's walk unchanged | Four teams, three matches, the last between the other two's winners and **decided**. The walk then sees `Välierät` and `Loppuottelu` as it sees MSC's separate rounds, so bracket drawing, tree ordering and level-tie handling are specs/015's code, not a second copy. |
| A final still to play | The group stays whole and is listed under `Pudotuspelit` | The spec's edge case. The first version split as soon as the final was *scheduled* between the two semi winners — which would have drawn the tree with an unplayed final. The test caught the difference; the code follows the spec. See **Left open**. |
| Drawn *and* listed? | Drawn only | Champions League's layout, as agreed: a drawn group is not repeated as a list. `buildPlayoffBracket` returns the drawn group ids so the page can list only the rest. MSC keeps listing its drawn rounds, per specs/015. |
| The round selector | `listSeasonRounds` returns none for a cup | Liigacup's groups are now own-calculated tables, which would otherwise put a `Kierros` selector on a cup page — specs/015 says a cup has none. MSC and NSC had no tabled group, so they already got none. |
| The season comparison | `competitionIdForSeason`, not `competitionIdFromSeason` | `readTasoSeason` built the umbrella id, so it asked `spljp26` for `LC` and found nothing — the `Muut kaudet` comparison had no baseline. Already true of Ykkösliigacup; found reading the code for the team page's acceptance criterion. Same answer for every umbrella competition. `resolveTasoSeasonContext` probed the current season the same wrong way and now asks the same function (Sourcery, on this PR): with the current season not yet stored, it found `spljp26` empty for `LC` and defaulted the page to an older season. |
| A tie on points in a group | TASO's published order, for a `groups-and-playoff` cup's table only, when TASO ranked every team | Found against live data: Liigacup 2023's `Lohko B` showed FC Haka second on goal difference, while KuPS — level on 7, and 1–0 winners of their meeting — went through, as TASO's own standing says. Chosen in chat over applying it to every table: of 98 stored groups TASO ranks, this is the only rendered one where the orders really differ (Veikkausliiga 2022's `Eurolopputurnaus` differs only by a gap in TASO's numbering), so leagues gain nothing and keep the spec's "unchanged". Applied to the full season only; a position describes the group as it stands. |
| The backfill | Unchanged | It walks `DOMESTIC_COMPETITIONS` through `competitionIdForSeason`, `categoryIdForSeason` and `earliestSeasonFor`, so the registry entry is all it needs. `docs/setup/022`'s sample output now counts 14 competitions. |

## What the tests prove, and how

- **Every rendering change is gated**, asserted from both sides: `LC`, `LC2023`
  and `M1LCUP` get a table and a listed playoff; MSC with the same data gets
  two lists.
- **The split follows the matches, not the order they arrive in** — the fixture
  lists the final first — and follows an away winner and a level semi-final's
  declared winner into the final.
- **Nine mutations, all caught.** The category-id cup check, the format gate,
  Ykkösliigacup's declaration, the round-selector guard, the umbrella id in the
  comparison, the page's layout switch, and the decided-final condition each
  fail at least one test when reverted. The round-selector test did **not**
  fail at first: its fixture had no round numbers, so there was nothing for a
  selector to offer. It numbers its group stage now, as TASO does.
- **MSC and NSC tests are unedited**, and pass.

## Verified against live data

The implementing session had no database and no route to TASO, so it left
these open; they were run locally on 2026-09-29.

- **End-to-end.** The whole suite passes, 300 tests. It found one defect in
  the new cases: the picker test asked for the link named `Liigacup`, which
  Playwright matches as a substring, so it also found `Ykkösliigacup` and failed
  strict mode. It names links exactly now, and checks their order.
- **Ykkösliigacup's `1-4` shape** is Liigacup's: two semi-finals and their
  winners' final in `M1LCUP26`, so it is drawn, and its e2e case now asserts
  the tree rather than allowing a list while also forbidding one.
- **MSC and NSC are unchanged**, and so are leagues. MSC 2025, MSC 2018,
  NSC 2020, Veikkausliiga 2025 and Ykkösliiga 2025 were served from `main` and
  from this branch against the same database, and their headings, tables,
  rows, folds, selectors and full page text are identical.
- **The team page and head-to-head.** FC Inter's page, reached from Liigacup
  2026, shows cup `Analyysit` and a season comparison with rows; both are now
  e2e cases, and the comparison one fails if it asks `spljp{YY}` again.
  FC Inter v AC Oulu lists both of their Liigacup meetings.
- **Liigacup 2023's `Lohko B` table was wrong**, the one defect the live data
  found in the implementation: see the tie-on-points decision above. Now an
  e2e case, which fails with the old order.
- **Integration** passes, 160 tests.
- **The backfill**, into a scratch database: Liigacup 2023–2026 stored as
  `Liigacup23`/`LC2023` and `Liigacup24`–`26`/`LC`, 33 matches each, no
  failures. A re-run skipped 2023–2025 and fetched 2026 again, which is
  what it does for every competition's current season.

## Left open, deliberately

**Drawing the tree before the final is played.** Once both semi-finals are
decided and the final is scheduled between their winners, the tree is fully
known; drawing it with the final unplayed is what specs/015 does for MSC. The
spec chose to list the group until the final has a winner, and that is what is
built. It is a one-condition change if that is preferred.

## Moved from comments, 2026-10-06

Cut from `src/lib/taso-standings-service.ts` at `a86c1cb` by #531.

- **The round-robin exception in `buildGroup`.** Liigacup's and Ykkösliigacup's
  `Lohko A` and `Lohko B` are points competitions and are tabled like a
  league's. Told apart by structure, since points are what proved unreliable.
- **`inPublishedOrder`.** Our order breaks a tie on points by goal difference;
  Liigacup breaks it by the tied teams' meeting. Liigacup 2023's `Lohko B` has
  KuPS and FC Haka level on 7, Haka ahead on goal difference and KuPS on their
  1–0, and KuPS went through, so our order drew a table that contradicted the
  semi-final beneath it. All or nothing: with any team unranked, TASO's
  numbers cannot place it. Only the numbers are kept, so a gap in TASO's
  numbering cannot put two teams at one position. Full season only: a
  position describes the group as it stands.
- **`listSeasonRounds`, cups.** A cup page has no round selector, and tabled
  groups do not change that: the rounds are one short group stage, and the
  page's other half is a playoff no round filters.
