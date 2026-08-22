# 133 — Split-group round numbering: implementation decisions

Issue: #133
Spec violated: `specs/009-veikkausliiga.md`

A decision record is not the default for a bug fix. This one exists because
the root cause was not what the investigation set out to find, and because
the remediation had more than one defensible shape.

## The bug was found while investigating something else

#127's scope included enabling 2019's carry-over entry. Its numbers
validated — all 12 teams, zero mismatches — so the entry looked like a
one-line addition. Writing an e2e test for the round selector it would
enable is what surfaced the real problem: 2019 numbers its split-group
rounds `1–5` rather than continuing from Runkosarja's `22`.

Checking whether that was unique to 2019 is what mattered. It is not:

| Season | Runkosarja | Split groups | Configured when found |
|---|---|---|---|
| 2019 | 1–22 | **1–5** | no |
| 2021 | 1–22 | 23–27 | yes |
| 2022 | 1–22 | **1–5** | **yes — shipped** |
| 2023 | 1–22 | **1–5** | **yes — shipped** |
| 2024 | 1–22 | 23–27 | yes |
| 2025 | 1–22 | 23–32 / 23–27 | yes |

So this was never a "can we enable 2019" question. Two shipped seasons were
already wrong: on 2022, "Kierros 5" showed every Mestaruussarja team with 10
matches played — Runkosarja rounds 1–5 plus Mestaruussarja rounds 1–5 — and
the selector offered nothing above 22, leaving the split rounds unreachable.

Full-season standings were never affected, which is why this survived
review and shipped: `#127`'s fixtures reproduce every group-season's
published points and matches played exactly. Only the round filter was
wrong, and only for the three restarting seasons.

## Derived from the data, not a per-season constant

The obvious fix is a config value — `spljp22: { roundOffset: 22 }` — beside
the existing carry-over entries. Rejected for the same reason
`specs/011-current-season-discovery.md` rejected a hardcoded competition
list: a hand-maintained table has to be *remembered*, and this codebase has
now been bitten twice by exactly that (`LATEST_TASO_SEASON`, and the
carry-over config's own missing coverage).

Instead, a carry-over group whose round range overlaps its parent's is
shifted by the parent's last round. That is a no-op for 2021/2024/2025,
self-corrects if TASO changes numbering for a future season, and requires
nothing to be remembered when 2026 splits.

The overlap test is what makes it safe to apply unconditionally: a
continuation group that genuinely starts after its parent is left alone, so
running the transform twice cannot double-shift a correct season. There is
a regression test for exactly that.

## Applied at the funnel, not at the filter

The narrowest fix would renumber inside `ownCalculatedStandings`, where
`filterByRound` actually runs. That fixes the standings table and nothing
else: `/kotimaa/ottelut` and the team page would keep showing "Kierros 3"
for a match the standings page calls round 25.

`getSyncedSeasonMatches` is the single funnel all three read through, so the
transform lives there and every surface agrees. The cost is that it runs for
callers that never look at `matchday`; it is a no-op map for the seasons
that need no shift, and the season's matches are already in memory.

Storing renumbered rounds in `taso_matches` instead was rejected: it would
need a migration and a re-sync of every affected season, and it would bake a
derived value into storage where a provider correction could no longer
override it.

## 2019 enabled in the same change

`skills/bug-workflow.md` says to keep a bug fix scoped. Adding
`spljp19: { 2: 1, 3: 1 }` is not strictly part of correcting 2022 and 2023.

It ships here anyway, as a separate commit, because the entry was blocked
by *this exact defect* and by nothing else — its carry-over validated
before the bug was known. Holding it for a third issue would mean a
one-line config change plus a fixture, tracked across three issues, to
enable something already proven correct. The separate commit keeps it
independently reviewable and revertible.

Note `#127`'s coverage test forces the fixture to accompany the entry: the
configured `competitionId + groupId` pairs are asserted against the fixture
keys in both directions, so the entry cannot land untested.

## Verified against live data, not only fixtures

The unit tests reproduce TASO's numbering from captured fixtures, which is
what makes them deterministic in CI. But fixtures encode an assumption about
the data, and this whole bug came from an assumption about the data being
wrong for half the seasons.

So the issue's repro is also an e2e test against the live API, confirmed to
fail without the fix with the exact numbers from the issue — 10 played at
"Kierros 5", and a selector capped at 22.
