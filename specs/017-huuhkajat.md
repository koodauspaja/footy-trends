# 017 — Huuhkajat

## Summary

Every Huuhkajat match in the `Maajoukkueet` region on **one page**, grouped by
year, each row labelled with the competition it belonged to —
`MM-karsinnat`, `UEFA Nations League`, `EM-karsinnat`, `EM-lopputurnaus`,
`Muut A-maaottelut`. A year is a collapsible section, the same `<details>`
pattern the Finnish cups already use for rounds.

No season selector and no `?kausi=`: the whole history is 85 matches, which is
a page, not a paginated archive. Confirmed in chat 2026-08-27.

A year on this page is **the year a match was played**, not the provider bucket
it came from — see *A bucket is not a calendar year*.

Backed by TASO, not football-data. This is the first football-data-free page in
a region that currently holds two football-data competitions.

## Scope

### In scope

- A `Huuhkajat` entry in the `/maajoukkueet` picker.
- A page at `/maajoukkueet/huuhkajat` listing every match from 2019 onward.
- Matches grouped by the year they were played, newest first, chronological
  within a year.
- Each year collapsible via `<details>`, open by default.
- The competition named per row.
- Finnish strings throughout.

### Out of scope

- **Helmarit** (#167) — the same page with a different category set, shipping
  separately. This spec must leave the seams where that split will happen, but
  must not build it.
- **Youth national teams** (U21, U19, U18, U17, U16, U15, U14) and futsal.
  Present in the same TASO competition and deliberately excluded.
- **Standings of any kind**, including Nations League group tables. The
  qualifying-group data is there (see *Other teams' matches*) and is still out
  of scope.
- **A season selector.** Superseded by the year grouping — see *Why there is no
  season selector*.
- **Seasons before 2021.** Confirmed in chat: the floor is 2021. This retires
  the 2015–2019 era mapping the issue described as the bulk of the work — see
  *Why 2021 is the floor*.
- Changing how `/ulkomaat`, `/kotimaa` or the two football-data competitions in
  `/maajoukkueet` render.

## Why there is no season selector

The first draft of this spec had one, mirroring every other page in the app.
It was dropped deliberately.

A selector is for when showing everything is impractical. Here everything is
**85 matches across six years** — 2021 is the outlier at 33, and no other year
exceeds 12. A reader asking "when did Finland last beat X" or "what did 2023
look like" is served better by one scrollable page than by six round trips
through a dropdown.

The cost is that the page fetches all six years on every cold render rather
than one; see *Performance & Limits*, where that is bounded.

## A bucket is not a calendar year

Found on the running page: 2019's and 2020's matches were appearing under a
2021 heading.

`maajp18` is not one season's worth of football. It holds **three calendar
years**:

| Category | Played | Matches |
|---|---|---|
| `ECQ` — Euro 2020 qualifying | **2019** | 10 |
| `Miehet-A` — friendlies | **2019** | 2 |
| `UNL` — 2020–21 Nations League | **2020** | 6 |
| `EC` — Euro 2020 finals | 2021 | 3 |
| `WCQ` — WC 2022 qualifying | 2021 | 8 |
| `Miehet-A` — friendlies | 2021 | 4 |

Every `maajp{YYYY}` bucket does hold only its own year today, so `maajp18` is
the only one affected — but that is a fact about the current data, not a rule
the provider guarantees.

So the page groups by **each match's own kickoff date**, in Europe/Helsinki,
which is the timezone the date column renders in. The bucket's nominal season
is used only to pick a cache TTL.

This also means the page reaches back to **2019**, not 2021: the earlier
matches were always in the data, filed under a bucket whose id names a
different year. The floor below is about which buckets are read, not about
which years appear.

## Why 2021 is the floor for reading

#166 proposed 2015 with a gap at 2020–2021, having found `maajp2020` and
`maajp2021` empty. Both observations were right; the conclusion was wrong.

`maajp18` **is season 2021** — not 2018. Its categories report
`season_id: 2021`, and it carries `EC | EM-lopputurnaus Huuhkajat`, the Euro
2020 finals Finland played in June 2021. Confirmed against
`tulospalvelu.palloliitto.fi/category/WCQ!maajp18/group/1`, which renders
`KAUSI 2021`.

So the bucket floor is 2021, there is **no gap to explain**, and every season
from 2021 shares one modern category set. The two-era mapping is not needed.

Because `maajp18` reaches back to 2019, the page displays 2019 and 2020 as
well — the years #166 believed were missing entirely.

## API & Data

### Endpoints — no new provider surface

`getCategories` and `getMatches`, both already used by `/kotimaa`. No new
endpoint, no new credential.

### Year → competition id is a lookup, not a formula

This is the one thing that cannot be derived, and the existing helper gets it
wrong:

| Year | `competition_id` |
|---|---|
| 2021 | `maajp18` |
| 2022 | `maajp2022` |
| 2023 | `maajp2023` |
| 2024 | `maajp2024` |
| 2025 | `maajp2025` |
| 2026 | `maajp2026` |

**`seasonFromCompetitionId` must not be used here.** It reads the last two
characters of the id — correct for `spljp26` and coincidentally correct for
`maajp2026`, but it maps `maajp18` to **2018**. The year is a property of the
mapping above, and is carried explicitly rather than parsed back out of the id.

Every other `maajp` id was probed and is empty or irrelevant: `maajp15`,
`maajp16`, `maajp19`, `maajp20`, `maajp21`, `maajp22` return zero categories;
`maajp17` is genuinely season 2017 with one category; `maajp2020`/`maajp2021`
return `Invalid competition_id`.

New years are added to this table by hand. That is a deliberate choice over
discovery: `getCompetitions` lists only currently published competitions and
cannot enumerate history, so there is nothing to discover from.

### Categories are discovered per year, by name suffix

A year's Huuhkajat categories are those whose `category_name` ends with
` Huuhkajat`. Verified for every year in scope:

| Year | Huuhkajat categories |
|---|---|
| 2021 | `EC`, `WCQ`, `ECQ`, `UNL`, `Miehet-A` |
| 2022 | `EC`, `WCQ`, `ECQ`, `UNL`, `Miehet-A` |
| 2023 | `EC`, `WCQ`, `ECQ`, `UNL`, `Miehet-A` |
| 2024 | `WCQ`, `EC`, `UNL`, `ECQ`, `Miehet-A` |
| 2025 | `WCQ`, `UNL`, `ECQ`, `Miehet-A` |
| 2026 | `WCQ`, `UNL`, `ECQ`, `Miehet-A` |

Discovered rather than hardcoded: 2022–2024 carry `EC` and 2025–2026 do not,
and the id set is not stable. The suffix rule is safe **only because the floor
is 2021** — it does not hold for the 2015–2019 names (`Miesten A-maaottelut`),
which is another reason the floor matters.

The suffix rule is also what keeps youth teams and Helmarit out: their names
end ` Helmarit`, ` U21-miehet`, ` U19-pojat` and so on.

### The row label comes free, and is not normalised

`getMatches` rows carry `category_name`. The label is that string with the
trailing ` Huuhkajat` removed:

```
category_name: "UEFA Nations League Huuhkajat"  →  "UEFA Nations League"
category_name: "EM-lopputurnaus Huuhkajat"      →  "EM-lopputurnaus"
category_name: "MM-karsinnat Huuhkajat"         →  "MM-karsinnat"
category_name: "Muut A-maaottelut Huuhkajat"    →  "Muut A-maaottelut"
```

TASO names the friendlies category `Muut A-maaottelut` in 2021 and
`A-maaottelut` from 2022. **Both are shown as TASO spells them** — confirmed in
chat: `Muut A-maaottelut` is a good label. No hardcoded id→name table, and no
normalisation pass; the provider's own wording is the label.

A row whose `category_name` does not end with the suffix keeps its name
unchanged.

### Other teams' matches — the filter this page needs

**A category can contain matches Finland is not playing in.** Measured
2026-08-27:

| Year | Finland's matches | Rows returned | Where they differ |
|---|---|---|---|
| 2021 | 33 | 35 | `Miehet-A` 6 of 8 |
| 2022 | 10 | 10 | — |
| 2023 | **12** | **32** | `ECQ` 10 of 30 |
| 2024 | 10 | 10 | — |
| 2025 | 10 | 10 | — |
| 2026 | 10 | 10 | — |
| **Total** | **85** | 109 | |

Those are per **bucket**. Grouped by the year each match was played, the same
85 fall out as:

| Year | Matches |
|---|---|
| 2026 | 10 |
| 2025 | 10 |
| 2024 | 10 |
| 2023 | 12 |
| 2022 | 10 |
| 2021 | 15 |
| 2020 | 6 |
| 2019 | 12 |

2023's `ECQ` returns the whole Euro 2024 qualifying group — `Kazakstan -
Slovenia`, `San Marino - Pohjois-Irlanti` and so on. Listing those on a page
headed `Huuhkajat` would be plainly wrong, so **rows are filtered to those
where Finland is one of the two teams**.

The 2021 `Miehet-A` difference is a different thing: two placeholder rows with
empty team names, empty date and `status: "Planned"`. Those are already dropped
by `normalizeTasoMatch`'s kickoff guard, which returns `null` for an unparseable
date. No new handling needed, but the count is explained here so the two causes
are not confused.

Finland is identified by team name `Suomi`. There is no stable team id to match
on across categories, and TASO publishes the name in Finnish.

### Sample row

```json
{
  "match_id": "2028037",
  "date": "2021-06-12",
  "time": "19:00:00",
  "status": "Played",
  "category_name": "EM-lopputurnaus Huuhkajat",
  "group_name": "Lohko B",
  "team_A_name": "Tanska",
  "team_B_name": "Suomi",
  "fs_A": "0",
  "fs_B": "1"
}
```

Team names arrive **already in Finnish** — `Tanska`, `Uusi-Seelanti`,
`Kap Verde`, `Valko-Venäjä`. `toFinnishCountryName` from #165 is for
football-data only and must not be applied here.

### Statuses

`Played`, `Fixture` and `Planned` are the three observed values.
`normalizeStatus` already maps `Played`/`Forfeited` to `FINISHED` and
`Fixture`/`Planned` to `SCHEDULED`. Unplayed rows carry empty `fs_A`/`fs_B`,
which `parseScore` already turns into `null`.

### Caching

Follows `/kotimaa`'s existing policy, which is what these endpoints are already
cached under:

- Current year (2026): **15 minutes**, matching
  `CURRENT_SEASON_CACHE_TTL_SECONDS`.
- Completed years (2021–2025): **1 year**, matching the existing
  `seasonId >= activeSeasonId ? … : 60 * 60 * 24 * 365` rule.

This split is what makes the no-selector design affordable: five of the six
years are immutable and answer from cache indefinitely, so a warm render costs
one year's worth of upstream calls, not six.

Cache keys include the year, because one competition id serves one year only
and the category set differs per year.

## UX / UI (Finnish strings)

### Picker (`/maajoukkueet`)

A third entry below `MM-kisat` and `EM-kisat`:

```
Huuhkajat
```

It links to `/maajoukkueet/huuhkajat`, **not** to `/sarjataulukko?kilpailu=…`
like the other two — Huuhkajat has no standings page. The shared
`CompetitionPicker` currently hardcodes `/sarjataulukko` as every entry's
target, so it gains a per-competition landing path.

Icon: the Finnish flag, as a local `public/finland.svg` authored in-repo. Two
plain rectangles and a cross — no third-party asset and no licence question,
unlike #165's wordmarks. `/kotimaa` uses the 🇫🇮 emoji, but this picker renders
`<img>` for every row and mixing the two in one list would look accidental.

### Page (`/maajoukkueet/huuhkajat`)

Heading — no year, because the page is every year:

```
Huuhkajat
```

### Year sections

One `<details>` per year, **newest first**, each open by default. This is the
same component shape as `CupRoundSection` in `src/app/domestic/standings/page.tsx`:
a native `<details open>` with a `<summary>` carrying the heading and a count,
so folding needs no client-side state.

The summary reads as the year and the match count, matching the cups' existing
`(N ottelua)` form:

```
2026 (10 ottelua)
2025 (10 ottelua)
2024 (10 ottelua)
2023 (12 ottelua)
2022 (10 ottelua)
2021 (15 ottelua)
2020 (6 ottelua)
2019 (12 ottelua)
```

A year with exactly one match reads `(1 ottelu)`, singular.

Open by default follows the cups' stated reasoning — *"every round starts open
so nothing is hidden by default"*. 85 rows is roughly a quarter of the height
that made collapsing necessary there, so there is no case for starting closed.

### Match table

`MatchListTable` with its existing columns plus the fourth column it already
supports:

```
Pvm | Ottelu | Tulos | Kilpailu
```

Rows ascend by kickoff **within** a year, while the years themselves descend.
The most recent year is at the top, and within it a season reads forward the
way a season is played.

A match not yet played shows an empty `Tulos` — never `0–0`.

### Empty and error states

Reusing the region's existing strings verbatim:

- No matches at all:
  `Otteluita ei ole saatavilla.`
- Load failure:
  `Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.`

A year with no matches renders **no section at all** rather than an empty
`<details>`, so the page never shows a fold that opens onto nothing.

There is no invalid-season notice, because there is no season parameter.

## Edge Cases

1. **A year whose categories are all empty** — the year is omitted from the
   page entirely. `maajp2025/UNL` genuinely returns zero matches while existing
   as a category, so an empty category is normal, not a failure.
2. **A category returning other teams' matches** — filtered to Finland's, per
   *Other teams' matches*. 2023 is the case that proves it.
3. **Placeholder rows with empty team names and dates** — dropped by the
   existing kickoff guard. Two exist in 2021 `Miehet-A`.
4. **`getCategories` fails for one year** — the whole page shows the
   load-failure string. A page silently missing a year, with no indication
   which, is worse than an honest error, because nothing on it would reveal the
   gap.
5. **One category's `getMatches` fails while others succeed** — same: the
   load-failure string, not a partial list.
6. **A `?kausi=` query string** — ignored, not an error. Old links from any
   draft, and hand-typed params, render the normal page.
7. **A category name not ending ` Huuhkajat`** — cannot appear, since that
   suffix is the selection rule; if the label logic is reached with one anyway,
   the name is used unchanged.
8. **Two matches with the same kickoff** — order between them is unspecified
   but must be stable across renders, so the sort is by kickoff then
   `match_id`.
9. **The current year has no matches yet** — its section is omitted (per 1),
   so on 1 January the page opens on the previous year rather than an empty
   fold.
10. **A year in the table whose id stops resolving** — treated as a failure
    (per 4), not as an empty year, so a renamed id is loud rather than silent.

## Performance & Limits

The no-selector design moves cost from six page loads to one, and the numbers
are small enough that this is the cheaper side of the trade.

- **85 matches total**, the largest year being 2021 at 33. No pagination.
- A **cold** render costs 6 `getCategories` plus one `getMatches` per Huuhkajat
  category — **34 calls**, issued in parallel per year. Depth is two round
  trips, not 34.
- A **warm** render costs at most the current year's 5 calls: 2021–2025 are
  immutable and cached for a year.
- The 34-call cold case happens after a deploy or a Redis flush, not per
  visitor.
- TASO has no published rate limit, and `/kotimaa` already makes heavier use of
  it than this page will.
- The e2e suite must run with `--workers=1`; the parallel default exhausts
  football-data.org's free-tier quota on the neighbouring pages.

## Security & Secrets

- `TASO_API_KEY` only, already configured, already in `.env.example`. No new
  env var.
- TASO requires `Accept: json/<key>` plus `Referer`, `Origin` and `User-Agent`
  headers; `src/lib/taso.ts` already sends all four. Omitting them returns 403.
- No key reaches the client: every call is server-side.
- Nothing new is committed.

## Acceptance Criteria

- [ ] `/maajoukkueet` lists `Huuhkajat` alongside `MM-kisat` and `EM-kisat`.
- [ ] The `Huuhkajat` entry links to `/maajoukkueet/huuhkajat`, and the other
      two still link to their standings pages.
- [ ] `/maajoukkueet/huuhkajat` shows every year on one page, with no season
      selector and no `Kilpailu` selector.
- [ ] Years descend — 2026 first, 2019 last — and matches ascend by date within
      each year.
- [ ] A match is filed under the year it was **played**: `maajp18`'s 2019 and
      2020 matches appear under `2019` and `2020`, not under `2021`.
- [ ] `2019` reads `(12 ottelua)` and holds `EM-karsinnat`; `2020` reads
      `(6 ottelua)` and holds `UEFA Nations League`.
- [ ] Each year is a collapsible section that opens and closes on click, and
      every section starts open.
- [ ] Each section's summary reads `<year> (<n> ottelua)`, with `ottelu`
      singular for one.
- [ ] Each row names its competition — `MM-karsinnat`, `UEFA Nations League`,
      `EM-karsinnat`, `EM-lopputurnaus` or `Muut A-maaottelut` — with no
      trailing ` Huuhkajat` left on any label.
- [ ] 2021 renders from `maajp18` and is labelled `2021`, not `2018`.
- [ ] 2021 includes the three `EM-lopputurnaus` matches and reads
      `(15 ottelua)`.
- [ ] 2023 reads `(12 ottelua)`, not 32: no match without Finland appears, and
      `Kazakstan - Slovenia` specifically does not.
- [ ] A match not yet played shows an empty result, not `0–0`.
- [ ] No Helmarit, youth or futsal match appears in any year.
- [ ] A year with no matches renders no section rather than an empty fold.
- [ ] `/ulkomaat`, `/kotimaa`, `MM-kisat` and `EM-kisat` render exactly as
      before.
- [ ] Every user-facing string added is Finnish.

## Tests Required

### `tests/unit/lib/huuhkajat.test.ts`

- `2021` maps to `maajp18` and `2026` to `maajp2026`.
- The year is **not** derived from the id: `maajp18` yields 2021.
- Categories are selected by the ` Huuhkajat` suffix; a fixture containing
  `… Helmarit`, `… U21-miehet` and `… Huuhkajat` yields only the last.
- The label strips exactly the trailing ` Huuhkajat`, and leaves
  `Muut A-maaottelut` intact rather than normalising it to `A-maaottelut`.
- Matches without Finland are filtered out; a fixture modelled on 2023 `ECQ`
  (30 rows, 10 with `Suomi`) yields 10.
- Years are returned newest first; matches within a year ascend by kickoff,
  then by `match_id` for ties.
- An empty year is omitted from the result rather than returned empty.

### `tests/unit/app/national-teams/huuhkajat.test.tsx`

- Happy path: a year section renders with date, teams, result and competition
  label.
- Section summaries carry the year and count, and pluralise `ottelua` /
  `ottelu` correctly.
- Every section renders with `open` set.
- An unplayed match renders an empty result rather than `0–0`.
- A year with no matches renders no section.
- No matches at all renders `Otteluita ei ole saatavilla.`
- A failing `getCategories` for any year renders the load-failure string, not a
  page missing one year.
- One failing category renders the load-failure string rather than a partial
  list.
- `?kausi=2023` renders the same page as no query string.
- Metadata: the title carries `Huuhkajat`.

### `tests/unit/app/national-teams/page.test.tsx` (existing, extended)

- The picker lists `Huuhkajat` and links it to `/maajoukkueet/huuhkajat`.
- `MM-kisat` and `EM-kisat` still link to their standings pages.

### `tests/e2e/huuhkajat.spec.ts`

- `/maajoukkueet` → `Huuhkajat` navigates to `/maajoukkueet/huuhkajat`.
- The page shows more than one year section, and no `Kausi` or `Kilpailu`
  selector.
- Clicking a year's summary collapses it and clicking again expands it.
- The 2021 section contains an `EM-lopputurnaus` row.
- Assertions are on structure and labels, not on scores, which change.

## Files To Update

- `specs/017-huuhkajat.md` — this file.
- `decisions/017-huuhkajat.md` — written by the implementing agent.
- `src/lib/huuhkajat.ts` *(new)* — year→id map, category discovery, label rule,
  Finland filter, year grouping.
- `src/app/national-teams/huuhkajat/page.tsx` *(new)*.
- `next.config.ts` — the `/maajoukkueet/huuhkajat` → `/national-teams/huuhkajat`
  rewrite.
- `src/components/competition-picker.tsx` — per-competition landing path.
- `public/finland.svg` *(new)*.
- Tests as listed above.
- **Not** `src/lib/competitions.ts`: `Huuhkajat` stays out of
  `SUPPORTED_COMPETITIONS` — see below.
- No `.env.example` change; no new setup doc.

## Resolved in chat (2026-08-27)

1. **`Huuhkajat` stays out of `SUPPORTED_COMPETITIONS`.** That list is
   football-data's — every entry has a code the provider understands, and
   `competitionsInRegion` feeds both the picker and the `kilpailu` validation
   #165 added. Putting a TASO competition in it would let `?kilpailu=HUU`
   resolve on a standings page that cannot serve it. The picker draws from two
   sources instead, and #167 will add its entry the same way.
2. **Provider labels are shown as-is.** `Muut A-maaottelut` in 2021 and
   `A-maaottelut` from 2022 both stand. No normalisation table.
3. **No season selector.** Replaced by the year grouping above.
4. **The route is `/maajoukkueet/huuhkajat`**, inside the region rather than a
   top-level `/maaottelut/…`. #167 will follow the same shape.

## Open Questions

None. All three questions raised during drafting were answered in chat on
2026-08-27 and are recorded under *Resolved in chat* above; the route was
confirmed as `/maajoukkueet/huuhkajat`, inside the region, matching #165's
Finnish-URL rewrite table.
