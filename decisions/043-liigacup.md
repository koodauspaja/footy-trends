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
| The season comparison | `competitionIdForSeason`, not `competitionIdFromSeason` | `readTasoSeason` built the umbrella id, so it asked `spljp26` for `LC` and found nothing — the `Muut kaudet` comparison had no baseline. Already true of Ykkösliigacup; found reading the code for the team page's acceptance criterion. Same answer for every umbrella competition. |
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

## Not verified here

- **End-to-end.** `tests/e2e/cup-domestic.spec.ts` has Liigacup cases and a
  tightened Ykkösliigacup one that asserts tables rather than headings, but the
  suite needs a live `TASO_API_KEY` and a local Postgres, and this environment
  has neither — TASO is outside its network policy. Not run.
- **Integration and the backfill.** Same reason.
- **Ykkösliigacup's `1-4` shape.** Most likely semi-finals and a final, as
  Liigacup's is — said in chat, not verified. If it is not, the split leaves it
  whole and it is listed under `Pudotuspelit`; the page is correct either way,
  and the issue says which it turned out to be.

## Left open, deliberately

**Drawing the tree before the final is played.** Once both semi-finals are
decided and the final is scheduled between their winners, the tree is fully
known; drawing it with the final unplayed is what specs/015 does for MSC. The
spec chose to list the group until the final has a winner, and that is what is
built. It is a one-condition change if that is preferred.
