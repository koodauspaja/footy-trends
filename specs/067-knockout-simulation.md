# 067 — Knockout simulation: who is likely to go through, and to win the cup

> **Status: Q1–Q6 answered in chat on 2026-10-14 and recorded as S7–S12;
> S13–S16 follow from them, measured and confirmed that day, and the spec
> confirmed. Strings may be fine-tuned
> during implementation.** Written for #517, split out of specs/061 (#347) on
> 2026-10-01 (S6 there). It plays a knockout competition's rest of the season
> out as specs/061 plays out a league's, with the same model, runs and seed,
> and counts how far each team gets.

## Summary

A bracket says who plays whom next; it does not say who is likely to lift the
trophy, or how much a one-goal first-leg lead is worth. This simulates the
rest of a knockout competition's season 10 000 times — the league phase's
remaining fixtures, the draws not yet made, both legs of each tie, extra time
and penalties — so a reader sees each team's chance of reaching each round and
of winning, and each current tie's chance of going either way.

## Scope

### In scope

- The Champions League's season in progress: the league phase's remaining
  fixtures, then the knockout bracket to the final (S9, S13, S14).
- The Miesten and Naisten Suomen Cup's season in progress: the cup to its
  final from the round of 16 (S15), and before it the current round's ties
  between two rated sides (S16).
- Each team's chance of reaching each round and of winning; each known,
  undecided tie's chance of going either way (S12, S16).

### Out of scope

- Leagues: specs/061.
- A finished season, and a season of an older format (the Champions League's
  group stage of 2023): nothing the 2024 rules describe (S13).
- Liigacup and Ykkösliigacup: the models do not predict them (specs/059 S1).
- Any change to how a cup tie is predicted: specs/059 S3 stands, and a tie
  with an unrated side still has no `Ennuste` (S10).
- UEFA's own league-phase tie-breakers: points, then the current table's order,
  as specs/061 S4.
- Chances in the public bracket: the figures stay in a signed-in panel (S12).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Model | **`poisson-v1`, as specs/061 S1**: its three-way probabilities for a league-phase fixture, its scoreline grid for a knockout leg | specs/061 S1, Miikka, 2026-10-12. A two-legged tie is decided on goals, which only Poisson draws. |
| S2 | Runs and seed | **10 000 runs, the constant seed of specs/061 (`SIMULATION_SEED`)** | specs/061 S2. |
| S3 | The model during a run | **Fixed: one fit for every fixture and every run**; a simulated result never updates a strength | specs/061 S3. |
| S4 | Rounding | **specs/061 S9 and S18**: whole percentages, `< 1 %`, `> 99 %`, `0 %` and `100 %` only when decided; points to one decimal | As specs/061, so the two panels read alike. |
| S5 | Access | **Signed in only (`canSeeAnalytics()`)** | specs/061 S11. |
| S6 | Computing and cache | **On a page view, per competition-season, Redis 15 minutes**, cleared by a forced refresh as specs/064's forecast is | specs/061 S10. |
| S7 | Which competitions | **The Champions League and both Suomen Cups, in this one feature** | Miikka, 2026-10-14 (Q1): "Both in 067". |
| S8 | A level tie or a drawn single match | **Extra time, drawn as a third of a match from the same expected goals on the plain Poisson grid (no draw factor); then a penalty shoot-out won by either side with even odds.** No away-goals rule (decisions/014) | Miikka, 2026-10-14 (Q2): "Extra time, then 50/50 (Recommended)". The stronger side keeps a small edge in extra time. |
| S9 | A Champions League draw not yet made | **Simulated within UEFA's 2025/26 rules**: the play-off pairs 9/10 with 23/24, 11/12 with 21/22, 13/14 with 19/20, 15/16 with 17/18, each seeded side meeting one of its two at random; the last 16 pairs 1/2, 3/4, 5/6, 7/8 with the winners of those four play-offs in reverse order; the quarter- and semi-final path is the seeded tree, 1 and 2 in opposite halves, a winner taking the seed of the side it beat. No country protection. Pairings stored by the provider are used as they are | Miikka, 2026-10-14 (Q3): "Simulate by UEFA seeding (Recommended)". A chance to win from the first matchday. The rules: [Wikipedia, 2025–26 knockout phase](https://en.wikipedia.org/wiki/2025%E2%80%9326_UEFA_Champions_League_knockout_phase); the decision record checks them against UEFA's regulations. |
| S10 | A Suomen Cup side with no covered league match | **In the simulation, the weakest covered adult division's average side: Miesten Kakkonen (`M2`) for MSC, Kansallinen Ykkönen (`N1`) for NSC.** Only inside the simulation: a tie with such a side still has no `Ennuste` and no figure of its own (S16), as specs/059 S3 | Miikka, 2026-10-14 (Q4): "Weakest division's average", and "make it consistent" with specs/059. Otherwise NSC's chance to win would usually show only from the semi-finals (Measured). |
| S11 | Where the Suomen Cups' panel goes | **Its own section after `Pudotuspelit` on the cup's standings page, signed in. Cup pages stay without `Analyysit`** | Miikka, 2026-10-14 (Q5): "Own section after Pudotuspelit (Recommended)". specs/059 S11 kept `Analyysit` off cup pages. |
| S12 | A current tie's chances | **Inside the panel, under `Kierroksen parit`; the public bracket is unchanged** | Miikka, 2026-10-14 (Q6): "Inside the panel (Recommended)". |
| S13 | Which Champions League season | **The season in progress, when its stored matches have a `LEAGUE_STAGE`**: the shape comes from the data, never from the year (decisions/014) | Follows S9: the rules are the 2024 format's. |
| S14 | The league phase and venues | **specs/061's simulation of the remaining fixtures from the current `Liigavaihe` table, zones 1–8, 9–24, 25–36. A stored fixture's listed home side is at home (specs/059 S6); a simulated final at a neutral ground, the mean of both orientations' grids; in a simulated two-legged tie the higher league-phase position plays the second leg at home** | UEFA's rules (S9). |
| S15 | When a Suomen Cup is simulated to its final | **From the round of 16: the season's first round with 16 sides or fewer, a power of two, at least one of them from the season's top division (`VL`, `NL`). The next round drawn uniformly at random from the sides left, each tie a single match at a neutral ground (S14's mean); a stored round's ties used as they are** | Miikka, 2026-10-14: "Yes, round of 16 (Recommended)". A club that has not entered is not in the data, so an earlier chance to win would leave out the favourites. In MSC and NSC 2024–2026 no side entered after the round of 16 (Measured). |
| S16 | Before the round of 16, and an unrated side's tie | **Only `Kierroksen parit`, for ties between two rated sides (specs/059 S3, S10); a tie with an unrated side is left out, nothing said** | Miikka, 2026-10-14: "No figure, as 059 (Recommended)". Consistent with specs/059: no tie gets a figure its own match page does not show. |

## Measured

On production, read-only, on 2026-10-14. "Unrated" is approximated as no
stored covered league match up to that season.

**When the field is complete.** Veikkausliiga sides enter MSC in two waves:
6–8 in round 3, four more in round 5 (32 sides). Kansallinen Liiga sides enter
NSC in rounds 3 and 5 (16 sides). No side entered either cup after its round
of 16 in 2024, 2025 or 2026. NSC 2024 and 2026 had an early round of 16 sides
(`Kierros 1B`) with no top-division side, which S15's top-division condition
excludes.

**Unrated sides left.** MSC: 0–2 in its round of 32, none in the round of 16.
NSC: 5–6 in the round of 16, 1–2 in the quarter-finals.

**specs/059 S3's reach.** Ties with an unrated side, so with no prediction:
MSC 295–349 of 361–418 a season, NSC 72–76 of 83–94, nearly all in the early
rounds between lower-tier sides. A top-division side met an unrated one 4–10
times a season, and lost once in 43.

## UX / UI (Finnish strings)

### The Champions League

On `/ulkomaat/sarjataulukko` for the Champions League, signed in, for the
season in progress (S13), first in specs/057's group `Tämä kausi`, the same
place as a league's `Kauden ennuste`:

`Kauden ennuste` — panel heading, as specs/061.

During the league phase, a table per team in the current `Liigavaihe` order:
`Joukkue` · `Odotetut pisteet` · `Sijat 1–8` · `Sijat 9–24` · `Sijat 25–36`

Then, for every team still able to reach it, in the order of `Mestaruus`:
`Joukkue` · `Neljännesvälierät` · `Puolivälierät` · `Välierät` ·
`Loppuottelu` · `Mestaruus`
— the chance of reaching each round, with specs/014's stage names. A round
already reached is `100 %`; once a team is out, it leaves the table.

During a knockout round with stored ties (S12), above the table:
`Kierroksen parit` — subheading; a line per tie:
`Real Madrid – Benfica: jatkoon 71 % – 29 %`

Then:
`Loppukausi on pelattu 10 000 kertaa Poisson-mallin ennusteiden mukaan. Arpomattomat parit on arvottu sääntöjen mukaan, ja tasaiset ottelut on ratkaistu jatkoajalla ja rangaistuspotkuilla.`
and the link `Kuinka hyvin ennusteet ovat osuneet?` to `/ennusteet` for the
competition (specs/061 S21).

### The Suomen Cups

On the cup's standings page, signed in, for the season in progress, after
`Pudotuspelit` (S11): `Cupin ennuste` — a section heading.

- From the round of 16 (S15): `Joukkue` · each remaining round by specs/015's
  names (`Neljännesvälierät` for 16, `Puolivälierät`, `Välierät`,
  `Loppuottelu`) · `Cupin voitto`, every side left; then `Kierroksen parit`
  for ties between two rated sides (S16).
- Before it: `Kierroksen parit` only (S16), and
  `Cupin voittajaa ennustetaan neljännesvälieristä alkaen, kun kaikki joukkueet ovat mukana.`
- Then: `Loppukilpailu on pelattu 10 000 kertaa Poisson-mallin ennusteiden mukaan. Seuraavien kierrosten parit on arvottu, ja tasapelit on ratkaistu jatkoajalla ja rangaistuspotkuilla.`
- When a side left is unrated (S10), MSC:
  `Joukkueet, joiden sarjaotteluita ei ole tilastoitu, on laskettu Kakkosen keskitasoisiksi.`
  NSC:
  `Joukkueet, joiden sarjaotteluita ei ole tilastoitu, on laskettu Kansallisen Ykkösen keskitasoisiksi.`

### Every string

| String | When |
|---|---|
| `Kauden ennustetta ei voitu laskea. Yritä myöhemmin uudelleen.` | specs/061's: the simulation or a read failed |
| `Kaudella ei ole enää pelaamattomia otteluita.` | specs/061's: the final has been played |

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| The league-phase table | `buildCupPhaseStandings` over `LEAGUE_STAGE` (`cup-standings.ts`), through the standings page's own read (specs/061 S16) |
| Knockout ties | `buildBracket` (`cup-bracket.ts`): legs, aggregates, decisions, winners; a TASO tie decided on penalties read from its `winner` (decisions/015) |
| A remaining fixture | specs/061 S13's rule (`isRemainingFixture`): a placeholder side, `CANCELLED`, `AWARDED` and `Abandoned` are not |
| Probabilities | The provider's cached Poisson fit (`getPoissonFit`); `predictPoisson`'s `prediction` for a league-phase fixture and `grid` for a leg (S1). In the Champions League an absent team is an average side (specs/055 S4) |
| An unrated cup side | A side the Poisson fit has no match of, as `predictPoisson` already refuses a cup tie with one (Miikka, 2026-10-21; decisions/067 A1). In the simulation, the mean of the fit's strengths over the teams of `M2` (MSC) or `N1` (NSC) in that division's most recent season in the fit (S10; decisions/067 A2) |
| Extra time | The pairing's expected goals scaled by 30/90, on the plain grid (S8) |
| A run | The league phase as specs/061; then each round in order: the stored pairings, or a draw (S9, S15); each tie played (S8, S14) |
| Figures | Over 10 000 runs: league-phase expected points and zone shares; per team the share reaching each round and winning; per stored tie between rated sides each side's share going through, a played first leg counted |
| "Decided" and "impossible" | A round already reached `100 %`; a team out `0 %`; the league-phase zones by specs/061's bounds |
| Cache | Redis, 15 minutes, `knockout:v1:${kind}:${code}:${seasonId}:g${generation}`; a forced refresh moves the generation on (decisions/691) |

football-data's handling of a fixture whose side is not yet known — absent, or
`{id: null, name: null}` — is checked live before implementation, and the
decision record says which. Either way it is not a stored pairing (S9).

## Edge Cases

| Case | Behaviour |
|---|---|
| The league phase not started | Simulated from a table of zeros, in the provider's order |
| The league phase finished, play-off draw not made | The draw simulated (S9) |
| A draw made and stored | Its pairings used (S9) |
| Quarter-final path not yet stored | The seeded tree of S9, at random within it |
| A first leg played | Counted; only the second leg is drawn |
| A tie level on aggregate | Extra time, then penalties (S8) |
| The final | One match at a neutral ground (S14) |
| A team absent from the fit, in the Champions League | An average side (specs/055 S4) |
| A Suomen Cup before its round of 16 | `Kierroksen parit` only, and the line (S15, S16) |
| An early round of 16 sides with no top-division side | Not the round of 16 (S15) |
| An unrated side in the round of 16 or later | Simulated as S10's average side; the line names the division; its tie has no figure (S16) |
| A tie TASO decided on penalties | Read from its `winner` (decisions/015) |
| A placeholder side | Not a stored pairing |
| A season of an older format | No panel (S13) |
| The final played | specs/061's no-fixtures line |
| A finished season | No panel |
| Signed out | No figure in the HTML (S5) |

## Performance & Limits

A Champions League run plays at most the league phase's 144 fixtures and the
knockout's 29 ties; 10 000 runs are about specs/061's 89 ms for the
Championship's 446, plus drawing scorelines, which specs/061 measured at about
three quarters more. A Suomen Cup from its round of 16 is 15 ties. The
implementing agent measures both on production's data and inside Railway and
writes them in the decision record. A miss is at most once per competition per
15 minutes.

## Security & Secrets

No new environment variable or secret.

## Logging

The feature only reads. A failed read of the table, the matches or the fit is
already logged by its own service.

| Event | Level | The line |
|---|---|---|
| The simulation, or a read it makes, throws | `error` | `Unable to simulate the knockout`, with the provider, the competition's code, the season id and the error |

Nothing at `info`. No personal data.

## Acceptance Criteria

- [ ] Signed in, the Champions League's season in progress shows `Kauden ennuste` first in `Tämä kausi`: during the league phase, expected points and the three zones per team; and every team's chance of reaching each knockout round and of winning
- [ ] League-phase fixtures are drawn from `poisson-v1`'s probabilities and knockout legs from its scoreline grid, 10 000 times, from specs/061's seed, with one fit
- [ ] An undrawn Champions League round is drawn by S9's seeding; a stored pairing is used as it is
- [ ] A level tie goes to extra time and then penalties (S8); a played first leg counts
- [ ] Each stored, undecided tie between rated sides shows each side's chance of going through; a tie with an unrated side shows none
- [ ] A Suomen Cup in progress shows `Cupin ennuste` after `Pudotuspelit`: before its round of 16 the rated ties only and the line; from it, every side's chance of each round and of winning, with the division line when an unrated side is left
- [ ] No cup tie's `Ennuste` changes: specs/059's predictions are as they were
- [ ] `0 %` and `100 %` appear only when decided
- [ ] A finished season, a season of the group-stage format and Liigacup show no panel; no cup page gains `Analyysit`
- [ ] A failed run shows the Finnish failure line and logs one `error` line; signed out, no figure is in the HTML
- [ ] No provider request of its own; cached 15 minutes; its cost inside Railway measured and written down
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/knockout-simulation.test.ts` | A two-legged tie by hand with a fixed seed: aggregate, extra time, penalties; a played first leg; S9's pairings for every position; the seeded tree; a stored pairing kept; the neutral final; reaching rounds and winning; decided and impossible; repeatability |
| `tests/unit/lib/knockout-simulation-service.test.ts` | The league phase read; the bracket read; an older format; S15's round of 16, including an early 16-side round without a top-division side; S10's average side for `M2` and `N1`; S16's rated ties; the cache key and its clearing; failure and its log line |
| `tests/unit/components/…` | The panel's place on the Champions League page and after `Pudotuspelit`; both tables; `Kierroksen parit`; rounding; every Finnish line |
| `tests/e2e/…` | Signed in, the Champions League in progress shows the panel; a seeded Suomen Cup round of 16 shows `Cupin ennuste`; signed out, none |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/067-knockout-simulation.md` (this file)
- A pure knockout simulation module beside `season-simulation.ts`, its service, `competition-analytics.tsx`, and the cup page
- `decisions/067-knockout-simulation.md`, by the implementing agent

## Open Questions

**None.** Q1–Q6 were answered in chat on 2026-10-14 and are recorded as
S7–S12. S13–S16 follow from them and from what was measured that day; S15 and
S16 were confirmed the same day.
