# 021 — Table consistency

Implementation decisions for `specs/021-table-consistency.md`. Every number
below was measured in a browser at a stated viewport, before and after.

## The issue described the wrong symptom

#202 opened with "every table renders to the same width on the same page" and
the observation that the standings has a 760px floor while the match list has
none. Measured first, that turned out to be true only below the floor: at
**1280px every table on a page is already 1088px**.

The real complaint was one column deeper. Each table sizes its own columns from
its own rows, so **siblings drift**. On
`/kotimaa/sarjataulukko?kilpailu=VL&kausi=2019`, two match lists on one page:

| | Pvm | Ottelu | Tulos | Kierros |
|---|---|---|---|---|
| First | 266 | 480 | 154 | 187 |
| Second | 246 | 527 | 142 | 173 |

and three standings tables whose `Joukkue` measured 593 / 595 / 594, `ME`
47 / 45 / 47, `Vire` 101 / 101 / 100. Across the twelve World Cup group tables,
`Joukkue` ranged 663–669 — twelve tables down one page, none aligned with the
next.

The same component also rendered **217px apart** on two different pages: a match
list is 343px wide on `/kotimaa` and 560px on the Champions League page, because
European club names are longer.

So the fix is not a shared width. It is **fixed column widths from one shared
scale**, which is a different change from the one the issue asked for.

## `table-fixed` plus a `<colgroup>`, and one flexible column

With `table-layout: fixed` the browser stops measuring content, so a declared
width is a declaration rather than a suggestion. Every column takes its width
from `COLUMN_WIDTHS`; exactly one — `Joukkue` in the standings, `Ottelu` in a
match list — is declared `flex` and absorbs whatever the container leaves.

That gives both properties at once: siblings are identical because their columns
are declared, and a wide screen still hands the slack to the name rather than
stringing the numbers across the page, which is what `w-full` was doing before.

Measured after, at 1280px:

| Page | Shape | Layout |
|---|---|---|
| VL 2019 | 3 standings | `64 560 44×8 112`, all three |
| VL 2019 | 2 match lists | `112 744 104 128`, both |
| WC 2026 | 12 standings | `64 560 44×8 112`, all twelve |
| `/kotimaa/ottelut`, `/maajoukkueet/huuhkajat`, a match page's head-to-head | match list | `112 744 104 128` |

## What a three-column list can and cannot promise

The spec said a list with no fourth column would align with a four-column one
"down `Pvm`, `Ottelu` and `Tulos`". Measuring proved that wrong and the spec was
corrected before the code was written: it is `112 872 104` against
`112 744 104 128`.

`Pvm` and `Tulos` keep their widths exactly. **`Ottelu` does not** — it is the
flexible column, so it absorbs the missing 128px. The alternative is rendering
an empty fourth column for phases that have no round number, which would add a
column that says nothing, and the spec forbids adding columns. Within any one
page every list has the same shape, so the difference only shows between pages.

## The scale's numbers

`64` for `Sija`, `44` per statistic, `112` for `Vire`, `112` for `Pvm`, `104`
for `Tulos`, `128` for the fourth column, and `240` as the least the flexible
column may take. The standings' floor is therefore `64 + 8×44 + 112 + 240 =
768`, within 8px of the 760 it has carried for its whole life — chosen to keep
today's behaviour rather than to be a round number.

## The bracket is not a table of rows, and it fooled the first measurement

`cup-bracket.tsx` renders a `<table>` with four columns, so a first pass that
classified tables by column count reported the Champions League page as having
"match lists" 20px apart. They were bracket rounds — `Pvm/Ottelupari/
Yhteistulos/Osaottelut`, out of scope by the issue's own words.

Every measurement after that keys on the **header text** rather than the column
count, and so does the e2e suite: it groups tables by their headers and asserts
that each shape has exactly one layout, which cannot accidentally compare a
bracket with a match list.

## Alignment

Confirmed in chat: the eight statistics right, `Sija` left. `Kierros` is also
right — a round is a quantity and reaches two digits — while `Tulos` stays left,
because `2–1` is a pair and right-aligning it would line up the away goals,
which means nothing. `Sarja` and `Kilpailu` are text.

## The e2e measures numbers, and one of them measured zero

The suite asserts column-width vectors rather than comparing screenshots, so a
failure names the columns that disagree. Its first run failed on widths of `0`:
`page.goto` resolves before layout, and a table measured too early reports
nothing — which compares equal to nothing else and fails as though the columns
had drifted. It now waits for the first table to be visible before measuring.
