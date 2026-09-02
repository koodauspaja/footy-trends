# 022 — Teams between tiers

Implementation decisions for `specs/022-teams-between-tiers.md`. The issue said
this was "not yet reproduced/confirmed against an actual relegated team"; every
claim below is now measured against stored data or read off a running page.

## The Finnish side is where the problem lives

The issue framed this around the Premier League. Asked to check the Finnish
tiers, the numbers came out worse there. For clubs that have ever played the
competition, counting every (club, season) the season selector offered:

| Competition | Clubs | Options | Dead |
|---|---|---|---|
| Veikkausliiga | 22 | 264 | **120 (45.5%)** |
| Premier League | 27 | 108 | 28 (25.9%) |

Nearly half of Veikkausliiga's options ended at `Joukkuetta ei löytynyt.` And
the page said that while printing the *competition's* name, a selector full of
further dead ends, and a link to a standings table the club is not in — never
its own name. "This club does not exist" and "this club was a tier down that
year" were the same answer.

Finnish clubs move constantly: FC Haka (Ykkönen 2015–19 → Veikkausliiga
2020–25 → Ykkösliiga 2026), FC Lahti (down in 2025, back in 2026), EIF (up in
2024, down since), HIFK (a Ykkönen year in 2018).

## Two designs, and the reason both are here

The choice was between telling the reader where the club played and letting the
selector take them there. Both, in the end, because they answer different
halves:

- **The selector follows the club.** Its options are the seasons the club
  played, and picking one lands on the competition it played that season. This
  removes the 120 dead options rather than relabelling them.
- **A URL still renders what it says.** `?kilpailu=VL&kausi=2026` shows
  Veikkausliiga 2026 with `Joukkue ei pelannut tässä sarjassa tällä kaudella.`
  and a link onward, so a bookmark, a shared link or a typed address never
  silently becomes a different page.

The rejected third option was restricting the dropdown to one competition's
seasons — this spec's own first idea. It hides years the club did play, which
is worse than the problem.

**Where a club played two competitions in one season, the selector lands on the
one with more matches.** A 27-game league beats a 2-game cup run. Measured from
stored rows rather than a ranking of tiers, which the data does not carry and
which would need hand-maintaining as competitions come and go.

## No inflected competition names

The message names no competition: the heading directly above it already reads
`FC Haka – Veikkausliiga 2026`. Finnish would otherwise need
`Veikkausliigassa`, `Ykkösliigassa`, `Miesten Suomen Cupissa` — case endings
derived from registry strings, which is a class of bug this app should not
invent. Confirmed with the repository owner before implementation.

## The no-JavaScript fallback degrades to the message

`SeasonForm` submits a plain GET with a hidden `kilpailu`, so without
JavaScript a season change keeps the current competition. That lands on the
"did not play" page — with the link that names where the club was. Worse than
the scripted path by one click, better than today by a page that explains
itself, and it needs no per-option encoding that would make the URL mean
something other than what it says.

## One query, two answers, and a name

`getTeamSeasons` groups a club's rows by competition and season. It serves the
selector's options, the "where did it play" links and the fallback to the most
recent season from a single grouped read, and it answers something the pages
could not do before: **the club's name when it has no matches on the page being
shown.** The name comes from the club's newest stored row, so a renamed club
appears under its current name.

TASO's category eras are merged on the way out — `ASM`, `P20SM` and `P21SM` are
one competition to a reader, so a season split across two of them counts once.
A category the picker does not claim is skipped, and a club with nothing but
those is `not_found`, which is the bar specs/020 already set.

## Ordering is total, on purpose

Seasons sort newest first, then by match count, then by competition code. The
last of those only matters when a club played two competitions the same season
and won the same number of matches in each — possible with two cups — and
without it the selector could land somewhere different between renders. The same
reasoning as the head-to-head tie-break in specs/019.

## What the first review round found

**An outage was being reported as an unknown club.** When the grouped seasons
query failed and the asked page had no matches, `played` was empty and the page
fell through to `Joukkuetta ei löytynyt.` — telling a reader a club does not
exist because the database could not be reached. The three states are now
distinct: matches, "played elsewhere", and the page's own error message. The
same class of finding as #249's, and the same fix: an error is not data.

**The grouped read was two queries.** The name came from a second, newest-row
lookup inside `getTeamSeasons`, so every team page paid for it while the spec
claimed one query. `getTeamName` is now its own function, called only by the
page that has no match to read a name off — the common page is back to one added
query, and the spec says what the code does.

**Sonar found the same block twice.** Both pages derived the selector's options,
the same-season links and the newest-season fallback with five near-identical
lines each (9.3% and 9.1% duplication on new code). `teamSeasonsView` takes the
two things the pages genuinely differ on — how they label a season and name a
competition — as functions, and both pages now call it. That also removed the
nested ternaries Sonar flagged separately: with the name lookup split out, there
is nothing left to nest.

## Verified by loading the pages

| URL | Before | After |
|---|---|---|
| `/kotimaa/joukkue/60561?kilpailu=VL&kausi=2026` | `Joukkuetta ei löytynyt.` | `FC Haka – Veikkausliiga 2026`, the message, and `Kaudella 2026: Ykkösliiga, Ykkösliigacup, Miesten Suomen Cup` |
| `/kotimaa/joukkue/60808?kilpailu=VL&kausi=2018` | the same | `HIFK`, the message, `Kaudella 2018: Ykkönen, Miesten Suomen Cup`, and a selector stopping at 2023 — HIFK's last stored season |
| `/ulkomaat/joukkue/328?kilpailu=PL&kausi=2024` | the same | `Burnley FC`, the message, `Kaudella 2024: Championship` |
