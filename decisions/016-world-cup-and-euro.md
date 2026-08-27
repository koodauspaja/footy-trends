# 016 — World Cup and European Championship: implementation decisions

Spec: `specs/016-world-cup-and-euro.md`
Issue: #165

## The competitions were the easy part

Everything the tournaments needed from the bracket already existed.
`Kahdeksannesvälierät` and `Pronssiottelu` were named during #168's review
round precisely so this feature would not ship raw identifiers; `isDrawnStage`
already excluded both; `buildBracket` already handled single-leg ties; and
`orderRoundsForTree` already kept a tie that feeds nothing at the end, which is
exactly a third-place match.

So the work split into one refactor and a series of things only visible once
the pages were on screen.

## The refactor: one set of pages, two regions

Six components hardcoded `/ulkomaat` as their form action or `router.push`
target. Each gained a `basePath`, and the three page bodies moved into
`competition-{standings,matches,team}-page.tsx`, with the route files under
`src/app/foreign/` and `src/app/national-teams/` reduced to a region constant
and two calls.

A region rather than two more entries under `/ulkomaat`, because **#166 and
#167 land here next and are TASO-backed** — they cannot live under a
football-data-only page, so the region had to exist regardless. Building it now
avoided moving `WC`/`EC` later.

`parseCompetitionParam` is region-scoped as a consequence: `?kilpailu=PL` on
`/maajoukkueet` is rejected rather than rendering a Premier League page under a
heading that says national teams.

## Five things found by looking at the running pages

Each of these was invisible in the spec and obvious on screen.

### The season selector offered seasons that 403

`listSelectableSeasons` runs from the active season down to the plan floor, so
the World Cup offered 2023–2026 when only 2026 answers. The spec asserted these
"already resolve to a single option", which was simply wrong. Competitions now
carry an optional `earliestSeason` — 2026 for `WC`, 2024 for `EC` — the same
per-competition floor the domestic side has had since specs/013.

### "MM-kisat 2026/27"

A tournament is played inside one summer; the label claimed a season it never
had. Derived from the provider's own dates rather than a flag: WC runs
2026-06-11 → 2026-07-19 and EC 2024-06-14 → 2024-07-14, both inside one
calendar year, while CL runs 2025-09-16 → 2026-05-30. A season with no end date
is treated as spanning, which is what every league does.

### `Osaottelu 5` on a single-leg Euro quarter-final

The spec predicted this and got the cause half right. It said knockout
`matchday` is null — true for the World Cup, **false for the Euro**, which
continues the group-stage counter: its quarter-finals are matchday 5. Printing
that under `Osaottelu` claims a second leg that was never played.

`matchday` cannot answer the question at all — CL numbers legs 1 and 2, WC
leaves it null, EC continues a counter. `isTwoLeggedRound` decides from the
data instead: some team pair plays twice. A single-leg round gets no column.

Miikka also flagged that `Osaottelu` is not idiomatic Finnish — it was my
coinage in specs/014, and I had failed to mark it as a guess the way I marked
`Pudotuspelikarsinta`. It survives only because the fix above confines it to
genuinely two-legged rounds, which is where the word does apply.

### `Yhteistulos` on a tie with no aggregate

A single-leg round's tie *is* the match, so there is nothing to aggregate and
the per-leg column only repeated the date. Those rounds now read
`Pvm | Ottelupari | Lopputulos`; two-legged rounds keep both columns.

### The round tables did not line up

Consecutive rounds are separate `<table>` elements, and each sized its own
columns, leaving them visibly out of step down the page. Fixed with
`table-fixed` and an explicit `colgroup`.

## Country names

football-data reports national teams in English. A page headed `MM-kisat`
listing `Netherlands` and `Ivory Coast` is half-translated, so
`toFinnishCountryName` maps the 59 countries appearing in WC 2026 and Euro
2024, applied once where data enters a page so tables, bracket, match list and
team page all agree.

Only the football-data side needs it: **TASO already publishes Finnish names**
(`Suomi`, `Valko-Venäjä`), so #166 and #167 get this free.

An unmapped country falls through to the provider's name — readable-but-English
beats a mangled guess, and the fix is to add it to the map. Club names are
never touched: the map is applied only in the national-teams region.

## Icons, and a correction

The World area has no flag (`flag: null` from the provider), so the World Cup
needed something local. I first argued against FIFA's mark by citing specs/006,
which was **wrong**: specs/006 is about football-data's *contract*, which
requires consent for logos served from **their API**. A file from Wikimedia
Commons is not covered by that contract at all — a different question, and I
should not have merged the two.

Checked properly at Miikka's request. Both files carry `PD-textlogo` — "does
not meet the threshold of originality needed for copyright protection" — plus
Commons' standard trademark warning. Copyright is settled; trademark is
separate, and using a mark to identify the mark owner's own competition is the
nominative case every results site relies on.

`public/fifa.svg` for `MM-kisat`, `public/uefa.svg` for `EM-kisat` — the latter
also distinguishing the Euro from Champions League, which carries the plain
Europe flag and would otherwise look identical. Both are 3:1 wordmarks in a 3:2
slot, so the icons use `object-contain` rather than being stretched.

## One deliberate step outside the spec's scope

The spec put "changing how `/ulkomaat` or `/kotimaa` render" out of scope.
`StandingsTable`'s numeric columns now stay grouped instead of spreading across
the full width, which changes both.

A four-team World Cup group made it impossible to ignore — four short names and
the numbers strung across roughly 700px of gap, so a row could not be followed
across. The component is shared, so every league table gets the same fix.
Recorded here rather than pretended away.

## Duplication the refactor introduced

Sonar caught 25 duplicated lines: `/maajoukkueet`'s picker was a copy of
`/ulkomaat`'s, which is how it was written. Both are now
`CompetitionPicker`, taking a region and a base path — the same shape the three
page bodies already use.

A second, smaller copy went with it: `localiseIfNationalTeams` existed in both
the standings and matches modules. Below Sonar's threshold, but the same
mistake, so it moved into `country-names.ts` as `localiseForRegion`.

## A region default the notice did not follow

Sourcery's review round caught a real one. `resolveBasePageContext` falls back
to `defaultCompetitionFor(region)` when `kilpailu` is missing or names a
competition from another region — that is the whole point of the per-region
default. The banner announcing the fallback did not: it formatted
`DEFAULT_COMPETITION_CODE` directly, which is `PL`.

So `/maajoukkueet/sarjataulukko?kilpailu=PL` rendered the heading `MM-kisat
2026` above the notice *"Kilpailua ei löytynyt. Näytetään Valioliiga."* — the
page contradicting itself about which competition it was showing.

Five render sites, not one: `ContextNotices` is used twice each by the
standings and matches pages (league shape and cup shape), plus the team page's
own copy. Both now interpolate the already-resolved `competitionName`, which
every caller had in hand — a smaller change than passing the region down, and
the shape `/kotimaa`'s pages already used.

The test that should have caught it asserted
`toHaveTextContent("Kilpailua ei löytynyt.")` — a substring match that stops
one word before the mistake. It now asserts the whole sentence, and the two
other national-team pages assert it too, so all five sites are pinned.

## Verification

Checked against the running app, not only tests:

- `/` shows the third tile; `/maajoukkueet` lists exactly `MM-kisat` and
  `EM-kisat`; `/ulkomaat` lists exactly its ten.
- WC 2026 — 12 group tables `Lohko A`–`Lohko L`, `Kahdeksannesvälierät` and
  `Pronssiottelu` listed, `Puolivälierät` → `Loppuottelu` drawn.
- EC 2024 — 6 groups, neither of those two rounds.
- Country names Finnish throughout; no English name left on the page.
- Neither offers a `Kilpailu` select; each offers exactly its one season.
- No leg column on either; Champions League still shows `Osaottelu`.
- Headings read `MM-kisat 2026` and `EM-kisat 2024`; CL still `2024/25`.

Unit tests: **780 passing, 100% statements, branches, functions and lines.**
Integration 21. Eight new Playwright specs pass locally, alongside the existing
`/ulkomaat` suite as the refactor's regression test.
