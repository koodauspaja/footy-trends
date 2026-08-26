# 015 — Finnish cups: implementation decisions

Spec: `specs/015-finnish-cups.md`
Issue: #164

## Most of the rendering already existed

The issue was scoped expecting a large rendering job. It was not. **Every**
`MSC` group returns `points: null` for every team, and `keepsATable`
(`taso-standings-service.ts`) already treats a pointless group as knockout and
renders its matches as a list — the work done for
specs/010-playoff-group-match-list.md. Adding `MSC`/`NSC` to the registry gave
correct round-by-round rendering with no new rendering code.

`M1LCUP26` confirmed the classification from the other side: its `Lohko A`/
`Lohko B` carry real points and render as tables, while its `1-4` placement
group does not.

So the real work was four things: the bracket, Ykkösliigacup's competition-id
scheme, TASO's `winner` field, and the tree's ordering.

## Choosing which rounds to draw

Neither names nor team counts work alone, and all three counter-examples are
real:

| Season | Trap |
|---|---|
| MSC 2018 | `Kierros 1` has 8 teams — the *first* round |
| NSC 2015 | `Pikkufinaali` (2 teams) sits *before* `Finaali` (2 teams) |
| MSC 2021 | six 4-team groups that keep tables, and no knockout at all |

`selectBracketRounds` walks **backwards** from the last group: the latest
2-team knockout group is the final, then the latest 4-team before it, then 8.
Working backwards is what resolves `Pikkufinaali` — `Finaali` is later, claims
the 2-team slot, and the third-place match simply falls out of the chain and
renders as a list, which is what it should be.

Team counts come from the distinct teams in a group's own matches, not from
`getGroups`' rows, which return one row per bracket *slot* — the same reason
those groups have no table.

## TASO's `winner`, and the tie that looked like a draw

The bracket first rendered MSC 2025's `FC Haka 1–1 KuPS` as a draw with no
winner, while KuPS played the semi-final. A Finnish cup tie cannot end level;
it is settled on penalties TASO never itemises.

TASO publishes the outcome in a `winner` field instead, and nothing else in the
payload carries it. Measured before relying on it: `MSC` 2025 returns
`Home`/`Away` for all 419 matches including the 55 level ones, while `VL` 2025
returns `Tie` for exactly its 40 level matches. So `Tie` never occurs in a cup.

`NormalizedTasoMatch` and `taso_matches` gained a nullable `winner`
(migration `0007`), typed as the union via Drizzle's `$type<TasoWinner>()` so a
selected row keeps satisfying `NormalizedTasoMatch` structurally — the same
property every other column in that table already has.

The bracket uses it only to break a level tie, under a new `declared` decision
that carries **no suffix**. Labelling it `(rp)` would assert a shootout the
data does not record; the bold winner says what is actually known. An itemised
shootout still wins over a declared verdict where both exist, because it is the
more specific record.

## The tree had to be ordered, not just spaced

Caught in review, and a real bug: a round's ties arrive in kickoff order, which
says nothing about who plays whom next. MSC 2026 drew `VPS – FC Inter`'s
semi-final against the top two quarter-finals when it is actually fed by the
second and third, so the connectors described a bracket that never happened.

`orderRoundsForTree` works backwards from the last round, taking its order as
given, and places the two earlier ties whose participants appear in each later
tie next to each other. It lives in presentation rather than in `buildBracket`,
so the round lists beside the tree stay chronological. A tie whose winner does
not appear in the next round — a third-place match — keeps its place at the end
rather than being dropped.

This affected Champions League too. Its 2023 and 2024 brackets happened to
come back in an order that already aligned, which is why it went unnoticed
there.

## Round names: two normalised, on the whole string

Counted across every MSC and NSC season 2015–2026: `Kierros N` (63) beats
`N. Kierros` (23), and `Loppuottelu` (9) *loses* to `Finaali` (11).
`Loppuottelu` is still the one displayed — that split is by era rather than
popularity (`Finaali` 2015–2019, `Loppuottelu` 2020 onward), so the count only
favours `Finaali` because the older era has more seasons in range, and it
reverses as seasons accumulate. Picking today's winner would mean renaming
again later.

Keyed on the whole name, never a substring: `Pikkufinaali` is the third-place
match and `Finaali-Kakkonen` a separate Kakkonen-cup round, and a substring
replace would mangle both. Every other name — some 50 one-offs — is TASO's own
and already Finnish.

## Collapsible rounds

Added after seeing the page: MSC 2025 measures ~27,000px on a 375px screen with
every round open, and ~1,800px with them folded. Native
`<details>`/`<summary>`, so no client-side state and no hydration cost. Every
round starts **open** — a round that starts hidden reads as missing data, the
same reasoning that keeps the drawn rounds listed below the tree. The summary
carries the match count so a folded round still says how much it hides.

## Two smaller corrections found while building

- **A cup round's match list drops the `Kierros` column.** The round is one
  round by definition and the heading above already names it, so the column
  repeated the same value down every row. League playoff groups can span
  rounds, so they keep it.
- **A cup page hides the round selector.** All of a cup's groups are knockout
  rounds, so `listSeasonRounds` returns nothing and the select offered only
  `Koko kausi` — a control that did nothing. `MatchesControls` already guarded
  the same way; `TasoStandingsControls` now does too.

## Divergence from the spec

The spec's "Pudotuspelit eivät ole vielä alkaneet." empty state is **not
reachable** for a Finnish cup and is not rendered. A round only becomes a
bracket round by having 2, 4 or 8 distinct teams in its own matches, so a
bracket cannot exist with no matches behind it. A season with no qualifying
rounds shows no section at all, which the spec also specifies. The string
stays in `CupBracket` for the football-data path, which can reach it.

## Verification

Checked against the running app, not only tests:

- MSC 2025 — ten rounds, bracket of Puolivälierät/Välierät/Loppuottelu, final
  `HJK 1 – KuPS 0`, and `FC Haka 1 – KuPS 1` with KuPS through.
- MSC 2026 — the tree aligns after the ordering fix:
  `KuPS/VPS, SJK/Inter, Honka/HJK, Ilves/Lahti` under their real semi-finals.
- MSC 2018 — `Kierros 1` excluded despite its 8 teams; `Lohko A–E` as tables;
  `Finaali` displayed as `Loppuottelu`.
- MSC 2024 — `1. Kierros` displayed as `Kierros 1`.
- NSC 2015 — `Pikkufinaali` listed, never drawn.
- MSC 2021 — no bracket, no error.
- Ykkösliigacup 2026 — `Lohko A`/`Lohko B` as tables, `1-4` as matches, season
  selector offering only 2024–2026.
- 375px — no horizontal page scroll; folding every round takes the page from
  ~27,000px to ~1,800px.

Unit tests: **735 passing, 100% statements, branches, functions and lines.**
Integration 21. Nine new Playwright specs pass locally.
