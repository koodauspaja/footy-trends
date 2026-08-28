# 018 — Helmarit

Implementation decisions for `specs/018-helmarit.md`. Every provider fact was
measured against the complete dataset — all 125 rows across all six buckets —
rather than sampled, because three of #166's spec claims came from reading a
handful of rows and each cost a rework round or a production incident.

## The refactor came first, and it was not free

#167 predicted this feature would be "a registry entry plus tests" if #166 had
parameterised its category set. It had not: `mens-team.ts` held the bucket
table and the ` Huuhkajat` suffix as constants.

So the shared machinery moved into `national-team.ts` and
`national-team-service.ts`, both taking a `NationalTeam` — a category suffix
and a display name. `mens-team.ts` and `mens-team-service.ts` are gone;
`src/components/national-team-page.tsx` renders either team, and the two route
files are four lines each.

The bar was that **Huuhkajat's rendered output must not change**, with its own
tests as the check. That held everywhere except the label rule agreed below,
which changes it deliberately.

One thing the refactor had to match rather than invent: the page calls the
shared component as a function, `NationalTeamPage({ team })`, rather than
rendering it as JSX. That is the convention `src/app/foreign/standings/page.tsx`
already uses, and it is what lets a test `await Page()` and get a resolved tree.
Rendering it as JSX left an unresolved async component and failed ten tests.

## Labels: two normalisations, and a reversal of #166

TASO names one competition differently in different buckets, in two ways:

| Variants | Rendered |
|---|---|
| `MM-karsinnat 2023`, `MM-karsinnat` | `MM-karsinnat` |
| `Muut A-maaottelut`, `A-maaottelut` | `A-maaottelut` |

Implemented as rules — strip a trailing four-digit year, strip a leading
`Muut ` — not as a table of ids to names. That table would need an entry per
bucket, because the provider's wording changes between them, and it is exactly
what the suffix rule exists to avoid.

**The `Muut` case is a rename, not two competitions.** The category id is
identical either side of it: `Miehet-A` for the men, `Naiset-A` for the women,
in every bucket. TASO relabelled one thing.

This **supersedes #166's decision** that provider labels are shown exactly as
spelled, and changes the Huuhkajat page: its 2021 section now reads
`A-maaottelut`. That decision was taken when `Muut A-maaottelut` was the only
example and read as harmless; beside `MM-karsinnat 2023` it is the same defect.
`specs/017` and `decisions/017` carry notes pointing here rather than being
left to contradict the code.

Both rules are guarded against eating a label whole — one that is only a year,
or only `Muut`, or ends in a number that is not a year, is left alone. None of
those cases exists in the data today, which is why they are pinned.

## Five more English names, three of them duplicates

`maajp18` names five Helmarit opponents in English, and the rule holds from
#166: the mapping targets the spelling **TASO itself uses elsewhere**.

| TASO sends | Renders | |
|---|---|---|
| `Croatia` | `Kroatia` | `Kroatia` appears in 2023 |
| `Portugal` | `Portugali` | `Portugali` appears in 2026 |
| `Scotland` | `Skotlanti` | `Skotlanti` appears in 2023 and 2024 |
| `Cyprus` | `Kypros` | no Finnish form in the data |
| `Czech Republic` | `Tšekki` | no Finnish form in the data |

The first three were the same defect Huuhkajat had: one country under two
spellings on one page. The other 32 opponents arrive in Finnish already, and
eight of them — `Albania`, `Georgia`, `Latvia`, `Montenegro`, `Romania`,
`Serbia`, `Slovakia`, `Wales` — are identical in both languages and must not be
"corrected". A test pins that.

Every English name is in `maajp18`, for both teams. That is a rule about the
provider's older content, not a coincidence.

## What Helmarit's data does that Huuhkajat's did not

- **`maajp18` spans four years, not three.** The page reaches back to **2018**.
  No code change: grouping already follows each match's own date, which is the
  correction #166 needed after filing 2019 matches under 2021.
- **Thirteen categories return no rows at all**, against a couple on the men's
  side. Empty is the norm here.
- **Two categories hold only other teams' matches** — `maajp2024/Naiset-A` is
  3 of 3, `maajp2025/WEC` is 6 of 6 — so a category filtering down to nothing
  is ordinary, and indistinguishable from an empty one by the time the page
  sees it.

None of these needed new code. They needed the existing behaviour to be correct
for reasons the men's data never exercised, so each has a test.

## 2026 shows seven matches, and the spec first said eight

One row — `maajp2026/WWCQ`, `Serbia - Suomi` on 2026-10-13, status `Planned` —
carries a date but an **empty `time`**, so `normalizeTasoMatch`'s kickoff guard
drops it. It is the only such row across both teams and all six buckets.

The behaviour is left alone: the guard exists to drop the dateless aggregate
rows the cup work found, it is shared with `/kotimaa`, and this fixture will
gain a time as it approaches.

Recorded because an early draft of the spec said eight. The raw count checked
the date and not the time, which is the same shape of mistake as #166's
"TASO publishes Finnish names" — a number derived from a query that did not ask
everything the code asks. It was caught by comparing the rendered page against
the spec before opening the PR, which is the point of doing that.

## Verification

Checked against the running app, not only tests:

- `/maajoukkueet` lists `MM-kisat`, `EM-kisat`, `Huuhkajat`, `Helmarit`.
- `/maajoukkueet/helmarit` renders nine sections, 2026 down to 2018, with
  counts 7 · 11 · 10 · 13 · 13 · 9 · 5 · 13 · 4.
- No `Muut A-maaottelut` and no `MM-karsinnat 2023` anywhere, on either page.
- No English opponent name; `Kroatia` and `Skotlanti` present.
- `/maajoukkueet/huuhkajat` unchanged except its 2021 friendlies label.
- Both routes build as `ƒ`, never prerendered.
