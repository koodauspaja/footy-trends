# 017 — Huuhkajat

Implementation decisions for `specs/017-huuhkajat.md`. Every provider fact
below was measured against TASO on 2026-08-27, not carried over from #166.

## The issue's central problem did not exist

#166 described the 2015–2019 era mapping as "the bulk of the work" and left
2020–2021 as an unresolved gap. Both dissolved once `maajp18` was identified.

`maajp18` **is season 2021**, not 2018: its categories report
`season_id: 2021` and include `EC | EM-lopputurnaus Huuhkajat`, the Euro 2020
finals played that June. The issue had flagged two-digit ids as suspect without
working out what they were.

With the floor at 2021 — confirmed in chat — there is no gap to explain, every
year shares one modern category set, and the two-era mapping is unnecessary.
The feature became substantially smaller than the issue estimated.

## Year → competition id is a hand-written table

`seasonFromCompetitionId` reads an id's last two characters. That is right for
`spljp26` and accidentally right for `maajp2026`, and it maps `maajp18` to
**2018**. Reusing it would have silently mislabelled 2021 — a wrong heading
over correct data, which is the kind of bug that survives review.

So `HUUHKAJAT_SEASONS` pairs each year with its id explicitly, and the year is
carried alongside rather than parsed back out. New years are added by hand:
`getCompetitions` lists only currently published competitions and cannot
enumerate history, so there is nothing to discover from.

## Categories are discovered, labels are not normalised

A year's Huuhkajat categories are those whose `category_name` ends
` Huuhkajat`. Discovery rather than a hardcoded list, because the set moves —
2022–2024 carry `EC` and 2025–2026 do not. The same suffix is what excludes
Helmarit and every youth team, so one rule does both jobs.

The row label is that name with the suffix removed. TASO calls the friendlies
`Muut A-maaottelut` in 2021 and `A-maaottelut` from 2022, and **both are shown
as TASO spells them**. Normalising would mean reintroducing exactly the
id→name table the suffix rule exists to avoid, to paper over a difference the
provider considers real.

`huuhkajatCategories` returns each category already paired with its label
rather than just an id. The first version looked the name up a second time and
needed a `?? categoryId` fallback for a key that had come out of that very map
— a branch that could not be taken, and which coverage duly flagged as dead.
Pairing removes the question.

## A category is not only Finland's matches

The finding the issue did not have. Season 2023's `ECQ` returns **30** matches
— the whole Euro 2024 qualifying group, `Kazakstan - Slovenia` included — of
which 10 are Finland's. Unfiltered, a page headed `Huuhkajat` would have listed
matches Finland was not in.

| Year | Finland's | Rows returned |
|---|---|---|
| 2021 | 33 | 35 |
| 2022 | 10 | 10 |
| 2023 | **12** | **32** |
| 2024 | 10 | 10 |
| 2025 | 10 | 10 |
| 2026 | 10 | 10 |

Filtered on the team name `Suomi`: there is no team id stable across
categories, and TASO publishes names in Finnish already.

2021's smaller difference has a different cause — two placeholder rows with
empty team names and dates, already dropped by `normalizeTasoMatch`'s kickoff
guard. Two causes, one number; recorded so they are not conflated later.

## One failed year fails the whole page

`loadYear` returns `null` on failure rather than an empty list, and any `null`
makes the page an error.

The alternative — render the years that loaded — is worse specifically because
this page shows every year at once. A missing year leaves no gap a reader could
notice: there is no selector entry greyed out, no empty section, nothing on
screen that says 2023 should have been there. A page that is quietly
incomplete is worse than one that admits it failed.

An **empty** category is not a failure and does not trigger this:
`maajp2025/UNL` genuinely exists with zero matches.

## `getSeasonCategoryNameMap`, and why it throws

`getSeasonCategoryName` already existed but answers for one category and
swallows errors, falling back to a configured name — correct there, because a
name is presentation.

This page cannot use that. It *discovers* which competitions a year holds, so a
swallowed error is indistinguishable from a year with no competitions, and
would render as a silently missing year. The new function shares the same cache
key and TTL and lets failures through.

## Huuhkajat stays out of `SUPPORTED_COMPETITIONS`

That list is football-data's: every entry has a code the provider understands,
and `competitionsInRegion` feeds both the picker and the `kilpailu` validation
#165 added. An entry there would let `?kilpailu=HUU` resolve on a standings
page that cannot serve it.

So `CompetitionPicker` gained `extraEntries`, and the region page concatenates.
Its rows are now a provider-independent `PickerEntry` — the football-data
competitions are mapped into that shape rather than the shape being theirs.
`/maajoukkueet` is the first region backed by two providers, and #167 adds
Helmarit the same way.

## Caching pays for the no-selector design

Showing every year costs 6 `getCategories` + 28 `getMatches` on a cold render,
against 5 for a single-season page. That is affordable only because the
existing TTL rule makes 2021–2025 immutable for a year: a warm render costs the
current year's 5 calls, and the 34-call case follows a deploy or cache flush
rather than a visitor.

The years load in parallel, so the depth is two round trips, not 34.

## `public/finland.svg` is authored here

Three rectangles in the official 18:11 proportions. #165's wordmarks needed a
licence argument; a national flag drawn in-repo needs none, and avoids a
provider dependency for a page that otherwise has none. `/kotimaa` uses the 🇫🇮
emoji, but this picker renders `<img>` for every row and mixing the two in one
list would read as an accident.

## Out of scope, and left alone

`src/app/loading.tsx` reads `Ladataan sarjataulukkoa...` — "loading the
standings table" — and is app-wide, so it appears while this match-list page
streams. It is already inaccurate on `/ulkomaat/ottelut` and the team pages,
so this is pre-existing rather than introduced here, and changing it would
touch every page's loading state. Flagged rather than fixed; it wants its own
chore.

## Verification

Checked against the running app, not only tests:

- `/maajoukkueet` lists `MM-kisat`, `EM-kisat`, `Huuhkajat`, in that order.
- `/maajoukkueet/huuhkajat` renders six sections, 2026 down to 2021.
- Counts match the measurements exactly: **2023 `(12 ottelua)`** and **2021
  `(33 ottelua)`**, the two years the filter and the id mapping decide.
- Unplayed 2026 Nations League fixtures show an empty result, not `0–0`.
- Labels read `A-maaottelut`, `MM-karsinnat`, `UEFA Nations League`,
  `EM-karsinnat`, `EM-lopputurnaus` — no ` Huuhkajat` left anywhere.
- Every rendered row contains `Suomi`.

Unit tests: **832 passing, 100% statements, branches, functions and lines.**
Integration 21. Playwright 93, including 7 new specs, run with `--workers=1`
because the parallel default exhausts football-data.org's quota on the
neighbouring pages.
