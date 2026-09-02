# 021 — Table consistency

## Summary

Give the app's tables one implementation and **fixed column widths from one
shared scale**, so that every standings table on a page has the same columns as
its siblings, every match list has the same columns as its siblings, and neither
is sized by whichever team names happen to be in it.

## The problem, measured

The complaint is not that a table is the wrong width overall — at 1280px every
table on a page is already 1088px wide. It is that **sibling tables do not line
up**, because each one sizes its own columns from its own rows.

Measured on 2026-09-02 at 1280px, `/kotimaa/sarjataulukko?kilpailu=VL&kausi=2019`,
which renders three phases and two match lists:

| Table | Pvm | Ottelu | Tulos | Kierros |
|---|---|---|---|---|
| First match list | 266 | 480 | 154 | 187 |
| Second match list | 246 | 527 | 142 | 173 |
| **Difference** | **20** | **47** | **12** | **14** |

The standings drift too, by less:

| Table | Sija | Joukkue | O | V | T | H | TM | PM | ME | P | Vire |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Runkosarja | 49 | 593 | 42 | 42 | 42 | 42 | 44 | 45 | **47** | 42 | **101** |
| Mestaruussarja | 49 | **595** | 42 | 42 | 42 | 42 | 44 | 45 | **45** | 42 | **101** |
| Haastajasarja | 49 | **594** | 42 | 42 | 42 | 42 | 44 | 45 | **47** | 42 | **100** |

And across the twelve World Cup group tables
(`/maajoukkueet/sarjataulukko?kilpailu=WC&kausi=2026`), `Joukkue` ranges 663–669,
`ME` 45–47 and `Vire` 67–71 — twelve tables stacked down one page, none of them
aligned with the next.

The cause is the same in both: browser auto table layout sizes each column from
its own table's content, so a group containing `Sporting Clube de Portugal`
gets a wider name column than one that does not, and a match list whose scores
happen to be `10–0` gets a wider `Tulos` than one with `1–0`.

### Also true, and worth not fixing by accident

At 1280px both kinds already render at 1088px; they diverge only below the
standings' `min-w-[760px]` floor (760 vs 704 at 768px, 760 vs 343 or 560 at
375px). And at 375px the standings shows `Sija` and most of `Joukkue` with every
stat off-screen, because `w-full` hands the name column 296 of the 343 visible
pixels. Eleven columns cannot fit a phone, so scrolling is inherent; the number
is recorded so "keep scrolling" stays a decision rather than an assumption.

## Scope

### In scope

- One shared table primitive that both current tables render through.
- **Fixed column widths from one shared scale**, so sibling tables align.
- One alignment rule, applied to both tables.
- One place for the head/row border, padding and text styles both repeat today.

### Out of scope

- **Which columns exist, and what they contain.** No column is added, removed,
  reordered or hidden — on any viewport. A phase that genuinely has no round
  number keeps having no round column.
- Colours, typography, the spacing scale, dark mode.
- `cup-bracket.tsx`. It is a bracket, drawn as ties rather than rows, and its
  own shape is the point of it.
- Changing any Finnish heading.

## The rules

### Alignment

Confirmed in chat on 2026-09-02:

| Column | Alignment | Why |
|---|---|---|
| `Sija` | left | It reads as a label beside the team name, not as a quantity to compare down the column |
| `O V T H TM PM ME P` | **right** | Digits line up by place value; `8` under `19` is what makes a standings table hard to scan today |
| `Joukkue`, `Ottelu` | left | Text |
| `Pvm` | left | A formatted date, not a magnitude |
| `Tulos` | left | `2–1` is a pair, not a quantity — right-aligning it lines up the away goals, which means nothing |
| `Kierros` | **right** | A round number is a quantity, and rounds reach two digits |
| `Sarja`, `Kilpailu`, `Vire` | left | Text |

### Width

**Fixed column widths, from one shared scale per table kind.** Every column
except the flexible one gets an explicit width, and the table lays out to those
widths rather than to its own content:

| Kind | Fixed | Flexible |
|---|---|---|
| Standings | `Sija`, the eight stats, `Vire` | `Joukkue` takes the remainder |
| Match list | `Pvm`, `Tulos`, and the fourth column when present | `Ottelu` takes the remainder |

Two consequences, both of them the point:

- **Siblings align.** Every standings table on a page has pixel-identical
  columns to every other, and so does every match list — whatever their rows
  contain, and whatever phase they belong to.
- **A list's width stops depending on its data.** The same match list renders
  identically on `/kotimaa` and on the Champions League page, where today the
  same component differs by 217px.

`Pvm` and `Tulos` are fixed, so they keep identical widths whether or not a
fourth column exists — measured `112 … 104` in both cases. **`Ottelu` does not**:
it is the flexible column, so it absorbs the fourth column's 128px when a phase
has no round number (`112 872 104` against `112 744 104 128`). That is the
honest limit of "the same columns regardless of phase" without inventing an
empty column for phases that have nothing to put in it, which would change what
the table says. Within any one page every list has the same shape, so the
difference is only ever visible between one page and another.

A table's floor is the sum of its fixed widths plus a minimum for the flexible
column, from the same scale — so the standings keeps a floor near today's 760px
because that is what eleven columns need, and a match list gets a floor from its
own shape instead of nothing at all. Above the floor the table fills its
container, which is why the two kinds already agree at 1280px and will continue
to. Below it, the table scrolls horizontally inside its own container: nothing
is hidden, no row changes height, no value is truncated.

**A long team name wraps** rather than widening its column, since the column can
no longer stretch. That is the same rule in both tables, which is what #202's
"long values behave the same in both tables" asks for, and it applies only where
the flexible column is genuinely too narrow — at 1280px `Joukkue` is roughly
600px.

## UX / UI (Finnish strings)

**No new strings, and no string changed.** Every heading — `Sija`, `Joukkue`,
`O V T H TM PM ME P`, `Vire`, `Pvm`, `Ottelu`, `Tulos`, `Kierros`, `Sarja`,
`Kilpailu` — stays exactly as it is, as does `StandingsLegend`. This is sizing
and alignment only.

## API & Data

None. No query, no provider call, no caching decision: this is a rendering
change behind two existing components.

## Edge Cases

| Case | Behaviour |
|---|---|
| A four-team group (3 stat digits per row) | Numbers stay grouped rather than strung across the width — the reason `Joukkue` absorbs slack today, preserved by the shared rule |
| A very long team name (`Sporting Clube de Portugal`) | Never truncated; the table scrolls instead |
| A null stat, rendered `–` | Right-aligned with the numbers, as its column is |
| `Vire` with five results, or none | Unchanged; it is text and stays left |
| A pass-through row with no team id (`teamProviderId === 0`) | Still renders as plain text rather than a link |
| A match list with no fourth column (`/ulkomaat/ottelut`) | Its floor is the sum of the three columns it has, not four |
| A row whose fourth column is empty | Column keeps its width; the cell is empty, as today |

## Performance & Limits

No new query and no new render pass. The primitive is a component both tables
already have equivalents of; the change is where the classes live. Page weight
moves by whatever the class strings differ by, which is noise.

## Security & Secrets

None. No env var, no credential, no user input reaches the change.

## Acceptance Criteria

- [ ] On a page with several standings tables — `/kotimaa/sarjataulukko?kilpailu=VL&kausi=2019`
      (three phases) and `/maajoukkueet/sarjataulukko?kilpailu=WC&kausi=2026`
      (twelve groups) — **every column is the same width in every table**,
      measured rather than eyeballed
- [ ] On a page with several match lists, the same holds: today's 266/246,
      480/527, 154/142, 187/173 become one set of widths
- [ ] A match list renders at the same column widths on `/kotimaa` and on the
      Champions League page, despite team names of very different lengths
- [ ] A three-column match list keeps the four-column list's `Pvm` and `Tulos`
      widths exactly; `Ottelu` absorbs the difference
- [ ] Both tables render through one shared primitive; neither keeps its own
      `<table>`, `<thead>` or border classes
- [ ] `O V T H TM PM ME P` and `Kierros` are right-aligned; `Sija`, `Pvm`,
      `Tulos` and every text column are left-aligned
- [ ] Below its floor a table scrolls inside its own container, and the document
      itself never scrolls horizontally
- [ ] No column is added, removed, reordered or hidden, at any viewport
- [ ] Every Finnish heading is byte-identical to today's
- [ ] The standings' team link, the match list's team and match links, and the
      `Vire` cell's `aria-label` all behave exactly as before

## Tests Required

### Unit

`tests/unit/components/data-table.test.tsx` — the new primitive:

- renders the headers it is given, in order
- applies right alignment to the columns declared numeric and not to the others
- computes the floor as the sum of the declared column minimums
- renders a cell's content through its `render` function

`tests/unit/components/standings-table.test.tsx` (existing, extended):

- the eight stat columns and their cells carry the right-alignment class
- `Sija` and `Joukkue` do not
- the pass-through row with no id still renders as text

`tests/unit/components/match-list-table.test.tsx` (existing, extended):

- `Kierros` is right-aligned, `Pvm` and `Tulos` are not
- the date link and team links are unchanged

### E2E

`tests/e2e/table-consistency.spec.ts` — the claims only a browser settles,
asserted as numbers:

- on `/kotimaa/sarjataulukko?kilpailu=VL&kausi=2019`, every standings table has
  an identical column-width vector, and so does every match list
- the same on `/maajoukkueet/sarjataulukko?kilpailu=WC&kausi=2026`, across
  twelve group tables
- a match list's column widths are the same on `/kotimaa/ottelut`, on
  `/maajoukkueet/huuhkajat` and in a match page's head-to-head — measured
  `112 744 104 128` in all three
- a list with no fourth column measures `112 872 104`: the same `Pvm` and
  `Tulos`, with `Ottelu` absorbing the rest
- at 375px each table's width equals its declared floor, and `document.scrollWidth`
  equals the viewport width — the scrolling is inside the table's container

## Files To Update

- `specs/021-table-consistency.md` (this file)
- `decisions/021-table-consistency.md` (written during implementation)
- `src/components/data-table.tsx` — the shared primitive
- `src/components/standings-table.tsx`, `src/components/match-list-table.tsx`
- the test files listed above

No change to any page component, to `next.config.ts`, or to anything under
`src/lib`.

## Open Questions

None. The one this spec opened — #202's "same width on the same page, at every
breakpoint" — was settled in chat on 2026-09-02, and in a better place than it
was asked: the equality that matters is **column by column between sibling
tables of the same kind**, which fixed widths give at every breakpoint. Two
tables of *different* kinds share the container width wherever it exceeds their
floors, which they already do at 1280px.
