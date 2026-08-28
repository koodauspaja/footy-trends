# 017 — Huuhkajat

Implementation decisions for `specs/017-huuhkajat.md`. Every provider fact
below was measured against TASO on 2026-08-27, not carried over from #166.

## The issue's central problem did not exist

#166 described the 2015–2019 era mapping as "the bulk of the work" and left
2020–2021 as an unresolved gap. Both dissolved once `maajp18` was identified.

`maajp18` reports `season_id: 2021`, not 2018, and includes
`EC | EM-lopputurnaus Huuhkajat` — the Euro 2020 finals played that June. The
issue had flagged two-digit ids as suspect without working out what they were.
(It is not *only* 2021 either; see the section below.)

With the floor at 2021 — confirmed in chat — there is no gap to explain, every
year shares one modern category set, and the two-era mapping is unnecessary.
The feature became substantially smaller than the issue estimated.

## A bucket is not a calendar year

Caught on the running page during review, not by the spec or the tests: 2019's
and 2020's matches were sitting under a 2021 heading.

`maajp18` is not one season's football. It holds Euro 2020 qualifying played in
**2019** (10 matches), two 2019 friendlies, the 2020–21 Nations League played in
**2020** (6), and 2021's own 15. The first implementation filed all 33 under the
bucket's nominal season, because that is what the id table says the bucket is.

The page now groups by **each match's own kickoff date**, in Europe/Helsinki —
the timezone the date column already renders in, so a late kick-off cannot be
filed under one year and displayed under another. The bucket's season survives
only as the input to the cache TTL.

Every `maajp{YYYY}` bucket does hold just its own year today, verified across
all six, so this changes nothing for them. But that is a property of the current
data, not a guarantee, and the match's own date is the only thing that stays
true when a bucket spans again.

Two consequences worth stating. The page now reaches back to **2019**: those
matches were always in the data, filed under a bucket named for a different
year — the years #166 believed were missing entirely. And 2021 drops from 33 to
15, which is the correct count for what Finland played that calendar year.

`groupByPlayedYear` is deliberately team-agnostic, because Helmarit (#167) reads
the same shaped data from the same buckets and needs the same correction.

## Year → competition id is a hand-written table

`seasonFromCompetitionId` reads an id's last two characters. That is right for
`spljp26` and accidentally right for `maajp2026`, and it maps `maajp18` to
**2018**. Reusing it would have silently mislabelled 2021 — a wrong heading
over correct data, which is the kind of bug that survives review.

So `MENS_TEAM_SEASONS` pairs each bucket with its id explicitly, and the year is
carried alongside rather than parsed back out. New years are added by hand:
`getCompetitions` lists only currently published competitions and cannot
enumerate history, so there is nothing to discover from.

## Categories are discovered, labels are not normalised

A year's Huuhkajat categories are those whose `category_name` ends
` Huuhkajat`. Discovery rather than a hardcoded list, because the set moves —
2022–2024 carry `EC` and 2025–2026 do not. The same suffix is what excludes
Helmarit and every youth team, so one rule does both jobs.

**Superseded by #167.** Both a trailing campaign year and a leading `Muut ` are
now stripped, so this page shows `A-maaottelut` where it showed `Muut
A-maaottelut`. The reasoning below held while `Muut A-maaottelut` was the only
example; Helmarit's `MM-karsinnat 2023` made it the same defect twice, and the
category id is identical either side of the rename — TASO relabelled one
competition rather than splitting it. See `decisions/018-helmarit.md`.

The row label is that name with the suffix removed. TASO calls the friendlies
`Muut A-maaottelut` in 2021 and `A-maaottelut` from 2022, and **both are shown
as TASO spells them**. Normalising would mean reintroducing exactly the
id→name table the suffix rule exists to avoid, to paper over a difference the
provider considers real.

`mensTeamCategories` returns each category already paired with its label
rather than just an id. The first version looked the name up a second time and
needed a `?? categoryId` fallback for a key that had come out of that very map
— a branch that could not be taken, and which coverage duly flagged as dead.
Pairing removes the question.

## TASO is mostly Finnish, and the exception is what matters

The spec asserted that TASO publishes Finnish names and that this page needed
no translation layer. That came from reading a handful of rows, all of which
happened to be Finnish, and it was wrong.

`maajp18` names four opponents in English — `Greece`, `Italy`, `Bosnia and
Herzegovina`, `Republic of Ireland` — across the eight rows of its 2019 Euro
qualifiers and 2020 Nations League. Every `maajp{YYYY}` bucket is Finnish
throughout, which is exactly why it was easy to miss.

The defect was not only English text. `Greece` and `Kreikka` both appeared, as
did `Bosnia and Herzegovina` and `Bosnia-Hertsegovina`, so **one country read
two ways on one page**. That is what decided the mapping's target: it
translates to the spelling TASO itself uses elsewhere, not to
`FINNISH_COUNTRY_NAMES`'s, which says `Bosnia ja Hertsegovina` and would have
preserved the split.

`toFinnishTasoTeamName` therefore lives beside `toFinnishCountryName` in
`country-names.ts` rather than replacing it: one map per provider, in the file
that already exists for the purpose. That file's own comment claimed TASO
needed none; it now says otherwise.

Names are normalised before the Finland filter runs, so a row can never be
matched on one spelling and displayed as another. Finland itself is always
`Suomi`, verified across every bucket, so the filter cannot miss a row.

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

## A bucket that cannot be served no longer fails the whole page

**Reversed after production, see #180.** What follows is the original
reasoning, kept because it was right about the problem and wrong about the
remedy.

The page now renders the buckets that loaded and shows
`Kaikkia otteluita ei voitu ladata. Osa kausista voi puuttua.` above them.
Only a page with nothing at all to show is an error.

The original argument — that a year missing from a page showing every year
leaves no gap a reader could notice — still holds, and the notice is what
answers it. What the original missed is exposure. Every other page in the app
issues one such query per render; this one issues up to 28, so it has 28 times
as many chances to meet a transient failure — and it turned every one of them
into a blank page. A production incident did exactly that.

The notice deliberately names no year, because a failed bucket's matches were
never read and a bucket is not a calendar year — which years went missing is
the one thing that cannot be known at that point.

### The original reasoning

`loadSeason` returns `null` rather than an empty list, and any `null` makes the
page an error.

The alternative — render the years that loaded — is worse specifically because
this page shows every year at once. A missing year leaves no gap a reader could
notice: there is no selector entry greyed out, no empty section, nothing on
screen that says 2023 should have been there. A page that is quietly
incomplete is worse than one that admits it failed.

**But the bar is "cannot be served", not "anything went wrong",** and an
earlier draft of this document overstated it. `getSeasonMatchList` answers `ok`
with stored rows when a TASO refresh fails, so an outage serves the database's
copy; only a category with nothing stored *and* a failed refresh reaches
`null`.

That is the app-wide behaviour and it is the right one here. Every year but the
current one is a finished season, so its stored rows are complete and a failed
refresh changes nothing a reader could see — "stale" has no meaning for 2019.
Only the current year can lag, by one refresh interval, which is the exposure
every page in the app already carries. Failing the whole page because a
finished season could not be re-fetched would trade correct data for a blank
screen.

An **empty** category is not a failure either: `maajp2025/UNL` genuinely exists
with zero matches.

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

## Out of scope here, fixed later in #179

`src/app/loading.tsx` read `Ladataan sarjataulukkoa...` — "loading the standings
table" — and is app-wide, so it appeared while this match-list page streamed. It
was already inaccurate on `/ulkomaat/ottelut` and the team pages, so it was
pre-existing rather than introduced here, and changing it touched every page's
loading state.

It was therefore flagged rather than fixed at the time, and filed as #179. That
chore has since landed: the copy is now `Ladataan...`, true of every page it can
appear over. `specs/001` and `specs/002`, which mandated the old string, were
updated with it.

## Finnish names, English code

Sourcery flagged five identifiers carrying `Huuhkajat`, and it was right about
something larger than style: `src/app/national-teams/huuhkajat/` was the only
Finnish folder in an App Router whose folders are otherwise all English
(`domestic`, `foreign`, `national-teams`), and there is no precedent for a
Finnish identifier anywhere in `src/`. Spec 012 set that split and CLAUDE.md
allows "no exceptions in either direction".

So the module is `mens-team.ts`, the route folder is `mens-team/`, and the
identifiers are `MENS_TEAM_SEASONS`, `mensTeamCategories`, `getMensTeamYears`.
`Huuhkajat` survives in exactly the two places it belongs: the string displayed
to readers, and the provider's own ` Huuhkajat` category suffix. The public URL
stays `/maajoukkueet/huuhkajat`. #167 becomes `womens-team`.

`cache()` was also removed from `getMensTeamYears`. Its comment claimed to
share a pass between `generateMetadata` and the page body, but this page
exports static `metadata` and has no `generateMetadata` — with one caller the
wrapper did nothing, and the comment described behaviour that did not exist.

## The page must not be prerendered

Found in production, after merge (#182).

Dropping the season selector removed the page's `searchParams`, and with it the
thing that made every other data-backed page dynamic without anyone deciding it.
Next duly prerendered this one at build time. Railway's private network is
runtime-only — `*.railway.internal` does not resolve in a build container — so
all 28 queries failed with `ENOTFOUND postgres.railway.internal`, the page
rendered its error state, and that error was **baked into the static output**.

Every symptom followed from that. The failure was permanent rather than
transient, because the HTML never changed. `/api/health` reported the database
healthy, because at runtime it was. Every other page worked, because every
other page is dynamic. And the build exited 0, because the page catches its own
errors and renders a message rather than throwing — so nothing failed loudly.

`export const dynamic = "force-dynamic"` fixes it. Reproduced both ways
locally by building against an unresolvable `postgres.railway.internal`:
without the export the route builds as `○` static with 28 `ENOTFOUND` errors in
the log and exit 0; with it the route is `ƒ` and the log is clean.

Two things are worth carrying forward. The first is that a paramless
data-backed page is a trap in this app, so `tests/unit/app/rendering-mode.test.ts`
now fails any page that imports a data module while taking neither request
params nor an opt-out — #167 is the same shape. The second is that
`/api/health` checked the database and Redis but not the providers, which is
why it could report a healthy service while a page was broken; it now makes a
real TASO call.

## Verification

Checked against the running app, not only tests:

- `/maajoukkueet` lists `MM-kisat`, `EM-kisat`, `Huuhkajat`, in that order.
- `/maajoukkueet/huuhkajat` renders eight sections, 2026 down to 2019.
- Counts match the measurements exactly: **2023 `(12 ottelua)`**, **2021
  `(15 ottelua)`**, **2020 `(6 ottelua)`**, **2019 `(12 ottelua)`** — 85 in
  total, the same 85 as before the regrouping, correctly distributed.
- Every opponent renders in Finnish. The four names TASO sends in English are
  gone from the page, and no country appears under two spellings — checked by
  listing all 41 distinct opponents the page renders.
- 2019 holds `EM-karsinnat`, 2020 holds `UEFA Nations League`, 2021 holds
  `EM-lopputurnaus` — the three years `maajp18` spans, each under its own
  heading.
- Unplayed 2026 Nations League fixtures show an empty result, not `0–0`.
- Labels read `A-maaottelut`, `MM-karsinnat`, `UEFA Nations League`,
  `EM-karsinnat`, `EM-lopputurnaus` — no ` Huuhkajat` left anywhere.
- Every rendered row contains `Suomi`.

Unit tests: **100% statements, branches, functions and lines.**
Integration 21. Playwright includes 8 new specs, run with `--workers=1`
because the parallel default exhausts football-data.org's quota on the
neighbouring pages.
