# 018 — Helmarit

## Summary

Every Helmarit match in the `Maajoukkueet` region on one page, grouped by the
year it was played, each row labelled with the competition it belonged to. A
year is a collapsible section — the women's counterpart to #166, and the same
page in every respect a reader can see.

No season selector and no `?kausi=`: the whole history is 85 matches.

Backed by TASO, from the same provider buckets Huuhkajat reads. What differs is
the category set, and — in four specific ways set out below — the data.

## Scope

### In scope

- A `Helmarit` entry in the `/maajoukkueet` picker.
- A page at `/maajoukkueet/helmarit` listing every match from 2018 onward.
- Matches grouped by the year played, newest first, chronological within a year.
- Each year collapsible via `<details>`, open by default.
- The competition named per row.
- Lifting the shared machinery out of `mens-team.ts` so both teams use one
  implementation — see *The refactor*.
- Finnish strings throughout.

### Out of scope

- Huuhkajat (#166), beyond the refactor that makes it share this code. Its
  rendered output must not change; its tests are the check.
- **Youth national teams and futsal.** Excluded by the same suffix rule.
- **Standings of any kind**, including Nations League group tables.
- A season selector.
- Changing how `/ulkomaat`, `/kotimaa` or the two football-data competitions
  render.

## What #166 already settled, and is simply inherited

These were decided in specs/017 and are not re-opened here: year sections
rather than a selector; grouping by the year a match was played rather than by
the provider bucket; provider labels shown as TASO spells them, with the one
exception agreed here; a failed bucket degrading the page rather than blanking
it; and the page being dynamic. Each is
restated below only where Helmarit's data makes it behave differently.

## Where Helmarit differs from Huuhkajat

Four differences, all measured against the full dataset on 2026-08-28 — not
sampled. Three of them are things the Huuhkajat spec asserted from a handful of
rows and got wrong, so they were checked exhaustively this time.

### 1. The page reaches back to 2018, not 2019

`maajp18` holds **four** calendar years of Helmarit matches, where it held three
of Huuhkajat's:

| Bucket | Played years present |
|---|---|
| `maajp18` | **2018**, 2019, 2020, 2021 |
| `maajp2022` … `maajp2026` | their own year only |

Nothing in the code needs to change for this — grouping already follows each
match's own date — but the page covers nine years, and the acceptance criteria
name 2018.

### 2. Five more English names, three of them creating duplicates

Every English name is in `maajp18`, exactly as on the men's side. The mapping
must extend `FINNISH_TASO_TEAM_NAMES`, not start a second table.

| TASO sends | Must render | Note |
|---|---|---|
| `Croatia` | `Kroatia` | `Kroatia` also appears, in 2023 |
| `Portugal` | `Portugali` | `Portugali` also appears, in 2026 |
| `Scotland` | `Skotlanti` | `Skotlanti` also appears, in 2023 and 2024 |
| `Cyprus` | `Kypros` | no Finnish form anywhere in the data |
| `Czech Republic` | `Tšekki` | no Finnish form anywhere in the data |

The first three are the same defect Huuhkajat had: **one country under two
spellings on one page**. As there, the target is the spelling TASO itself uses
elsewhere, so `Croatia` becomes `Kroatia` and not something invented.

The other 32 opponents arrive in Finnish already. Names identical in both
languages — `Albania`, `Georgia`, `Latvia`, `Montenegro`, `Romania`, `Serbia`,
`Slovakia`, `Wales` — are correct as-is and must not be "fixed".

### 3. Empty categories are the norm, not an edge case

**Thirteen** of the Helmarit categories return zero matches: `maajp2022/WECQ`,
`maajp2023/{WWCQ,WEC,WECQ}`, `maajp2024/{WWCQ,WEC,WUNL}`,
`maajp2025/{WWCQ,WECQ}`, `maajp2026/{WEC,WUNL,WECQ,Naiset-A}`.

Huuhkajat had a couple; here it is roughly half. An empty category is ordinary
and must never contribute to an error.

### 4. Some categories contain no Finland match at all

36 of the 125 rows are matches Finland did not play in, and two categories are
**entirely** other teams':

| Bucket / category | Finland's | Rows |
|---|---|---|
| `maajp2024/Naiset-A` | **0** | 3 |
| `maajp2025/WEC` | **0** | 6 |
| `maajp2026/WWCQ` | 8 | 14 |
| `maajp2024/WECQ` | 12 | 18 |
| `maajp2025/WUNL` | 9 | 15 |
| `maajp2023/WUNL` | 6 | 12 |
| `maajp2022/WEC` | 3 | 6 |

A category filtering down to nothing is therefore normal, and is not
distinguishable from an empty one by the time the page sees it. Both are fine.

## API & Data

### Endpoints

`getCategories` and `getMatches`, as #166. No new endpoint, no new credential.

### The bucket table is shared, unchanged

| Year | `competition_id` |
|---|---|
| 2021 | `maajp18` |
| 2022–2026 | `maajp{YYYY}` |

`seasonFromCompetitionId` no longer exists — #166 deleted it after it mapped
`maajp18` to 2018 and caused rows to be stored under the wrong season. Nothing
here may reintroduce deriving a season from an id.

### Categories are discovered by the ` Helmarit` suffix

Verified per bucket:

| Bucket | Helmarit categories |
|---|---|
| `maajp18` | `WWCQ`, `WECQ`, `Naiset-A` |
| `maajp2022` | `WWCQ`, `WEC`, `WECQ`, `Naiset-A` |
| `maajp2023` | `WWCQ`, `WEC`, `WECQ`, `WUNL`, `Naiset-A` |
| `maajp2024` | `WWCQ`, `WEC`, `WECQ`, `WUNL`, `Naiset-A` |
| `maajp2025` | `WWCQ`, `WEC`, `WECQ`, `WUNL`, `Naiset-A` |
| `maajp2026` | `WWCQ`, `WEC`, `WECQ`, `WUNL`, `Naiset-A` |

`WUNL` first appears in 2023, and `maajp18` carries only three — so the set is
discovered, never hardcoded. The suffix is also what keeps Huuhkajat, the youth
teams and futsal out.

**The `WECQ` era problem in #167's notes does not arise.** That issue warned
that `WECQ` means the women's competition in one era and something else in
another. With the bucket floor at 2021 there is only one era, and `WECQ` is
`EM-karsinnat Helmarit` in every bucket that has it.

### Labels, and the campaign year that is stripped

Suffix-stripping from #166 produces these, across both teams:

```
"MM-karsinnat 2023 Helmarit"   →  "MM-karsinnat 2023"    (maajp18 … maajp2024)
"MM-karsinnat Helmarit"        →  "MM-karsinnat"         (maajp2025, maajp2026)
"Muut A-maaottelut Helmarit"   →  "Muut A-maaottelut"    (maajp18)
"A-maaottelut Helmarit"        →  "A-maaottelut"         (maajp2022 onward)
"EM-lopputurnaus Helmarit"     →  "EM-lopputurnaus"
"UEFA Nations League Helmarit" →  "UEFA Nations League"
"EM-karsinnat Helmarit"        →  "EM-karsinnat"
```

Two of these are TASO's own wording for a competition it names differently in
different buckets, and both are normalised. Agreed in chat 2026-08-28:

| TASO's variants | Rendered |
|---|---|
| `MM-karsinnat 2023`, `MM-karsinnat` | **`MM-karsinnat`** |
| `Muut A-maaottelut`, `A-maaottelut` | **`A-maaottelut`** |

Both as rules, not as a table of ids to names — that table would need an entry
per bucket, since the provider's wording changes between them, and it is what
the suffix rule exists to avoid:

- strip a trailing four-digit year;
- strip a leading `Muut `.

**The `Muut` case is a rename, not two competitions.** The category id is
identical either side of it — `Miehet-A` for the men, `Naiset-A` for the women,
in every bucket — so TASO relabelled one thing rather than splitting it. Only
these two labels begin with `Muut `.

Checked against **every** label either team produces — the thirteen distinct
`category_name` values across all six buckets, for both suffixes — and no other
label is touched by either rule.

### This changes the Huuhkajat page too, deliberately

`Muut A-maaottelut` is live on `/maajoukkueet/huuhkajat` today, for its 2021
matches. Applying the rule to one team and not the other is not possible: it is
one rule over one shared category, and the two pages would disagree about the
same competition.

So this **supersedes #166's decision** that provider labels are shown exactly
as spelled. That decision was made when the only example was `Muut
A-maaottelut` and it read as harmless; seen beside `MM-karsinnat 2023` it is
the same defect, and both are now normalised.

Consequences to carry out rather than discover:

- Huuhkajat's 2021 section will read `A-maaottelut` where it reads `Muut
  A-maaottelut` today. This is the intended outcome, not a regression.
- Three assertions in `tests/unit/lib/mens-team.test.ts` currently pin `Muut
  A-maaottelut` and must change. **They are the only permitted change to
  Huuhkajat's tests** — see *The refactor*.
- `specs/017-huuhkajat.md` and `decisions/017-huuhkajat.md` record the old
  decision in several places and need a note pointing here, rather than being
  left to contradict the code.

### Statuses, scores, placeholders

Measured across all 89 Finland rows: `Played` 87, `Fixture` 1, `Planned` 1 —
the same three, already mapped by `normalizeStatus`. Two rows carry empty
scores, matching the two unplayed. Three rows are placeholders with no date and
no team names, dropped by `normalizeTasoMatch`'s existing kickoff guard.

Finland is **always** `Suomi`, across every bucket and category. The filter
cannot miss a row.

### Volume

85 matches after filtering, across nine years:

| Year | 2026 | 2025 | 2024 | 2023 | 2022 | 2021 | 2020 | 2019 | 2018 |
|---|---|---|---|---|---|---|---|---|---|
| Matches | 7 | 11 | 10 | 13 | 13 | 9 | 5 | 13 | 4 |

**2026 is 7, not 8.** One row — `maajp2026/WWCQ`, `Serbia - Suomi` on 2026-10-13,
status `Planned` — carries a date but an **empty `time`**, so
`normalizeTasoMatch`'s kickoff guard drops it. It is the only such row across
both teams and all six buckets.

That is the existing behaviour and is not changed here: the guard exists to
drop the dateless aggregate rows the cup work found, it is shared with
`/kotimaa`, and this fixture will gain a time as it approaches. It is recorded
because an early draft of this spec said 8 — the raw count checked the date and
not the time — and a number that quietly disagrees with the page is how a spec
stops being trusted.

### Caching

Unchanged from #166: current year 15 minutes, completed years one year, keyed
per bucket. Helmarit adds no new upstream cost for the buckets Huuhkajat
already reads — the `getCategories` response is shared by both pages through
the same cache key.

## The refactor

#167 predicted this feature would be "a registry entry plus tests" if #166
parameterised its category set. It did not: `mens-team.ts` holds the bucket
table and the ` Huuhkajat` suffix as constants.

So this feature first lifts the shared machinery — bucket table, category
discovery, label rule, Finland filter, played-year grouping, and the loading
service — into a module taking a **team configuration**: the category suffix,
the display name, and the base path. `mens-team` and `womens-team` become thin
configurations of it.

`groupByPlayedYear`, `isFinlandMatch` and `toFinnishTasoTeamNames` were written
team-agnostic in #166 and move across unchanged.

**Huuhkajat's rendered output must not change, apart from the label agreed
above.** Its existing unit and end-to-end tests are the regression check and
must pass untouched, with one exception: the three assertions pinning `Muut
A-maaottelut`. If any *other* Huuhkajat test needs editing, the refactor has
changed behaviour and has gone wrong. That is the same bar #165 set for
`/ulkomaat` when its pages were made region-aware.

## UX / UI (Finnish strings)

### Picker (`/maajoukkueet`)

A fourth entry, below `Huuhkajat`:

```
Helmarit
```

Linking to `/maajoukkueet/helmarit`, with `public/finland.svg` and alt text
`Suomi`, exactly as Huuhkajat. It is added through `CompetitionPicker`'s
`extraEntries`, not `SUPPORTED_COMPETITIONS` — that list is football-data's and
feeds `kilpailu` validation.

### Page (`/maajoukkueet/helmarit`)

Heading:

```
Helmarit
```

Year sections, newest first, each `<details open>`, summarised as the year and
count — `(1 ottelu)` singular, `(13 ottelua)` otherwise:

```
2026 (8 ottelua)     2021 (9 ottelua)
2025 (11 ottelua)    2020 (5 ottelua)
2024 (10 ottelua)    2019 (13 ottelua)
2023 (13 ottelua)    2018 (4 ottelua)
2022 (13 ottelua)
```

Table columns, via `MatchListTable`:

```
Pvm | Ottelu | Tulos | Kilpailu
```

A match not yet played shows an empty `Tulos`, never `0–0`.

### Notices and empty states

Reused verbatim from #166:

- Nothing to list: `Otteluita ei ole saatavilla.`
- Nothing loadable at all: `Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.`
- Partly loaded: `Kaikkia otteluita ei voitu ladata. Osa kausista voi puuttua.`

A year with no matches renders no section.

## Rendering mode

`export const dynamic = "force-dynamic"`, and this is not optional.

The page takes no `searchParams`, so Next prerenders it at build time unless
told otherwise. Railway's private network is runtime-only: `*.railway.internal`
does not resolve in a build container, so a prerender fails every query and
**bakes the error page into the static output**, where it is served to every
visitor while the build exits 0 and the health endpoint reports the database
fine. That is #182, caused by exactly this page shape.

`tests/unit/app/rendering-mode.test.ts` fails any page that can be prerendered
without declaring itself static, so this is enforced rather than remembered.

## Edge Cases

1. **A category with no matches** — ordinary; thirteen of them exist. Never an
   error.
2. **A category with no *Finland* matches** — equally ordinary; two are
   entirely other teams'. Indistinguishable from the above by the time the page
   sees it, and treated the same.
3. **A category containing other teams' matches** — filtered on `Suomi`.
4. **Placeholder rows with no date or team names** — dropped by the existing
   kickoff guard; three exist.
5. **An English opponent name** — mapped, per the table above. An unmapped name
   falls through unchanged: readable beats mangled.
6. **One bucket fails while others load** — the years that loaded render, above
   the partial-load notice. Only a page with nothing at all to show is an error.
7. **Every bucket fails** — the load-failure string.
8. **A year with no matches** — no section, rather than an empty fold.
9. **A `?kausi=` query string** — ignored, not an error.
10. **Two matches at the same kickoff** — ordered by `match_id` after kickoff,
    so the order is stable across renders.
11. **A future year with no matches yet** — omitted, so the page opens on the
    newest year that has any.

## Performance & Limits

- 85 matches. No pagination.
- A cold render costs 6 `getCategories` plus one `getMatches` per Helmarit
  category — about 28 calls, issued in parallel per bucket, two round trips
  deep.
- The `getCategories` responses are already cached by Huuhkajat under the same
  keys, so in practice this page adds only its own `getMatches` calls.
- Completed years are immutable and cached for a year; a warm render costs the
  current year only.
- The e2e suite must run with `--workers=1`; the parallel default exhausts
  football-data.org's free-tier quota on neighbouring pages.

## Security & Secrets

- `TASO_API_KEY` only, already configured and already in `.env.example`.
- TASO requires `Accept: json/<key>` plus `Referer`, `Origin` and `User-Agent`;
  `src/lib/taso.ts` already sends all four. Omitting them returns 403.
- Every call is server-side; no key reaches the client.
- Nothing new is committed.

## Acceptance Criteria

- [ ] `/maajoukkueet` lists `Helmarit` below `Huuhkajat`, linking to
      `/maajoukkueet/helmarit`.
- [ ] The page shows every year from 2018 on one page, with no season selector
      and no `Kilpailu` selector.
- [ ] Years descend — 2026 first, 2018 last — and matches ascend by date within
      each year.
- [ ] Each year is a collapsible section, open by default, summarised as
      `<year> (<n> ottelua)`.
- [ ] Counts match: 2026 (7), 2025 (11), 2024 (10), 2023 (13), 2022 (13),
      2021 (9), 2020 (5), 2019 (13), 2018 (4).
- [ ] 2018 renders — it comes from `maajp18`, which spans four years.
- [ ] Each row names its competition, with no trailing ` Helmarit` anywhere.
- [ ] `MM-karsinnat` reads the same in every year — the `2023` TASO carries in
      the older buckets is not shown.
- [ ] The friendlies read `A-maaottelut` in every year, including 2018–2021
      where TASO says `Muut A-maaottelut`.
- [ ] `/maajoukkueet/huuhkajat` also reads `A-maaottelut` for 2021, where it
      reads `Muut A-maaottelut` today.
- [ ] `Croatia`, `Portugal`, `Scotland`, `Cyprus` and `Czech Republic` render as
      `Kroatia`, `Portugali`, `Skotlanti`, `Kypros` and `Tšekki`, and no country
      appears under two spellings.
- [ ] No match without Finland appears.
- [ ] A match with no result renders without a score rather than as `0–0`.
- [ ] No Huuhkajat, youth or futsal match appears in any year.
- [ ] The page is dynamic, not prerendered, and `rendering-mode.test.ts` passes.
- [ ] **Huuhkajat renders exactly as before**, and its existing tests pass
      untouched.
- [ ] Every user-facing string added is Finnish.

## Tests Required

### `tests/unit/lib/national-team.test.ts` (shared machinery, renamed from `mens-team.test.ts`)

- The bucket table maps 2021 to `maajp18` and 2026 to `maajp2026`.
- Category discovery selects by the configured suffix: a fixture containing
  both ` Huuhkajat` and ` Helmarit` names yields only the configured one.
- The label strips exactly the configured suffix.
- A trailing four-digit year is stripped: `MM-karsinnat 2023 Helmarit` and
  `MM-karsinnat Helmarit` both yield `MM-karsinnat`.
- A leading `Muut ` is stripped: `Muut A-maaottelut Helmarit` and
  `A-maaottelut Helmarit` both yield `A-maaottelut`, as do the Huuhkajat pair.
- A label that is only a year, or ends in a number that is not a year, is left
  alone rather than emptied.
- A label that is only `Muut`, or whose name merely contains `Muut` elsewhere,
  is left alone.
- Matches without Finland are filtered out.
- Years group by played date, newest first, chronological within.
- `matchCountLabel` pluralises.

### `tests/unit/lib/womens-team-service.test.ts`

- A category with zero matches contributes nothing and is not an error.
- A category whose every match excludes Finland contributes nothing and is not
  an error — the `maajp2024/Naiset-A` case.
- A bucket spanning four calendar years splits into a section each — the
  `maajp18` case, and the one Huuhkajat's spec got wrong.
- One bucket failing while others load yields `incomplete`, not `error`.
- Every bucket failing yields `error`.

### `tests/unit/lib/country-names.test.ts` (extended)

- The five new English names map to TASO's own Finnish spellings.
- `Croatia` and `Kroatia` resolve to the same string, as do `Portugal`/
  `Portugali` and `Scotland`/`Skotlanti`.
- Names identical in both languages are unchanged.

### `tests/unit/app/national-teams/womens-team.test.tsx`

- Rows render with date, teams, result and competition.
- An unplayed match renders an empty result.
- Sections start open and pluralise their counts.
- The partial-load notice renders only when incomplete.
- Empty and error states render their Finnish strings.
- The page exports `dynamic = "force-dynamic"`.

### `tests/e2e/womens-team.spec.ts`

- The picker reaches the page.
- Every finished year is present, with the current year filtered out of the
  exact assertion (as `mens-team.spec.ts` does).
- A year folds and unfolds.
- No ` Helmarit` suffix survives on any label.
- No English name from the mapped set appears; `Kroatia` and `Skotlanti` do.
- Every rendered row contains `Suomi`.

### Untouched

`tests/unit/app/national-teams/mens-team.test.tsx` and
`tests/e2e/mens-team.spec.ts` must pass **without modification**. If the
refactor requires editing them, it has changed Huuhkajat's behaviour and has
gone wrong.

## Files To Update

- `specs/018-helmarit.md` — this file.
- `decisions/018-helmarit.md` — written by the implementing agent.
- `src/lib/national-team.ts` *(new)* — the shared machinery, taking a team
  configuration.
- `src/lib/national-team-service.ts` *(new)* — the shared loader.
- `src/lib/mens-team.ts`, `src/lib/mens-team-service.ts` — reduced to
  configuration, or removed if the configuration lives with the pages.
- `src/lib/womens-team.ts` *(new)*.
- `src/app/national-teams/womens-team/page.tsx` *(new)*.
- `src/app/national-teams/page.tsx` — the fourth picker entry.
- `src/lib/country-names.ts` — five more TASO names.
- `next.config.ts` — the `/maajoukkueet/helmarit` rewrite.
- `tests/unit/app/rendering-mode.test.ts` — no change expected; it should catch
  the new page automatically if the export is forgotten.
- `specs/017-huuhkajat.md` and `decisions/017-huuhkajat.md` — a note that the
  show-as-spelled decision is superseded here, rather than leaving them to
  contradict the code.
- `tests/unit/lib/mens-team.test.ts` — the three `Muut A-maaottelut`
  assertions, and nothing else.
- Tests as listed above.
- **Not** `src/lib/competitions.ts`.

## Resolved in chat (2026-08-28)

1. **`MM-karsinnat 2023` renders as `MM-karsinnat`**, and **`Muut A-maaottelut`
   renders as `A-maaottelut`**. A trailing four-digit year and a leading `Muut `
   are stripped, so a competition reads the same way in every year. Verified to
   affect no other label either team produces. This supersedes #166's
   show-as-spelled decision and changes the Huuhkajat page too.
2. **The shared module is `national-team`.** `mens-team` and `womens-team`
   remain as its configurations.

## Open Questions

None.
