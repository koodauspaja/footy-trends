# 010 — Playoff group match list: implementation decisions

Spec: `specs/010-playoff-group-match-list.md`
Issue: #126

Follows #122 (spec 009, part 2), which shipped the duplicate-key defect
this fixes. Merged knowingly at the time, with this as the agreed
follow-up.

## The classification rule had to be a positive test on the data

The obvious rule was the complement of the existing classification: a group
is a playoff group when it is not own-calculated. That set already exists —
`isOwnCalculated` returns false for exactly the groups rendered
pass-through — so it would have been a one-line change with no new data
dependency.

It is wrong on live data. **2019's Mestaruussarja and Haastajasarja are
genuine league groups with real points**, but they are not own-calculated,
because `CARRY_OVER_CONFIG` has no `spljp19` entry. Under the complement
rule both would have lost their standings tables and rendered as match
lists.

That is not a temporary gap either. Even after 2019 gets its entry (#127),
the complement rule stays fragile in the same way: a future season that
splits and is added without a carry-over entry would silently turn two
league tables into match lists, with nothing failing. `isPlayoffGroup`
therefore tests TASO's own data — a group whose every team has no points —
which cannot be broken by config drift.

Verified across all twelve seasons (2015–2026): the rule selects exactly
six groups (2019's EL-lopputurnaus and EL-finaali, 2022's Eurolopputurnaus
and Eurolopputurnausfinaali, 2023's and 2024's Eurolopputurnaus) and never
a league group.

## `points` is absent, not null — and the first implementation missed it

The spec initially recorded the rule as `points === null` for every team.
That was written from a Python-side check where `t.get('points') is None`
conflates an absent key with a null value, and it does not survive contact
with TypeScript: TASO **omits the `points` field entirely** on these rows.

`team.points === null` therefore matched nothing, `isPlayoffGroup` returned
false for every group, and the feature silently did nothing at all. Unit
tests written from the same wrong assumption passed, because their fixtures
used explicit `points: null`.

What caught it was running the e2e suite against the live API, where 2019's
fourth table still rendered `SijaJoukkueOVT…` headers. The check now
accepts both absent and null, the spec records the distinction, and the
unit fixture uses the real absent-field shape with one explicit `null` row
alongside so both paths stay covered.

Worth noting for future TASO work: `TasoGroupTeam` types nearly every field
as optional *and* nullable, so `=== null` and `=== undefined` are both
individually insufficient. The existing `toPassThroughStanding` already
handles this correctly with `?? null`.

## Playoff groups keep no standings at all, rather than deduplicated ones

Collapsing TASO's slot rows into one row per team was the alternative that
preserved the current shape. Rejected: the duplicate rows are a symptom,
not the disease. Every stat field except `matches_played` is null for these
groups, so a deduplicated table would still be a points table for a
competition with no points — showing "–" in every column. The group's
matches are the only real information TASO has about it.

So `GroupStandingsResult` gains a third variant carrying `matches` instead
of `standings`, and the page branches on `kind`. Making the union carry
different payloads per kind (rather than an optional `matches` on the
existing shape) means the page cannot read `standings` off a playoff group
by accident.

## The aggregate rows were already handled, by luck rather than design

Every two-legged final carries a third row holding the tie's aggregate
score. It is not a fixture and must not render as one. TASO marks it only
by leaving `date` and `time` empty, so it was already being skipped at
normalization — `taso_matches.kickoff_at` is `NOT NULL`, so it could never
have been stored.

Confirmed against all four seasons before relying on it; the aggregate is
exactly the sum of its two legs every time (2019 Honka–Mariehamn 3–1,
2022 Haka–VPS 4–2, 2023 VPS–Honka 2–0, 2024 SJK–Haka 4–3). The spec records
this as a deliberate edge case rather than leaving the existing skip
looking incidental, and notes that if `kickoff_at` ever becomes nullable
these rows need excluding explicitly — nothing else distinguishes them, as
they carry `status: "Played"` and a real score.

## The e2e suite was asserting the bug as correct

`kotimaa-standings.spec.ts` asserted `bonusRows).toHaveCount(6)` for 2022's
Eurolopputurnaus — a four-team group. The test was counting TASO's
per-bracket-slot rows and encoding the duplication as expected behaviour,
which is why the defect shipped with a green suite.

Replaced rather than adjusted, along with two new cases: 2023 (the worst
case, 8 slot rows for 5 teams, asserting no duplicate-key console error)
and 2019 (asserting its split groups keep their tables while its two
playoff groups become match lists — the regression guard for the
classification rule above).

## `Kierros` over a fourth-column-less table

The playoff match list keeps a fourth column showing the round number, even
though `1`/`2`/`3` mean less in a knockout than in a league. Dropping it
entirely was the alternative. Kept because it is the only ordering signal
the group exposes, and because the season-wide `/ottelut` list and the team
page both already carry a fourth column — a playoff list without one would
be the odd shape out. A null `matchday` falls back to `–`.
