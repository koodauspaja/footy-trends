# 701 — Links and switches look like controls: decisions

Chore #701. The #695 sweep found `Kaikki ottelut`, `Sarjataulukkoon`, `Kuinka
hyvin ennusteet ovat osuneet?`, `Kaikki kohtaamiset (4)` and the 404's
`Etusivulle` in the text's colour with no underline, and `/ennusteet`'s two
switches as bold and grey words. `/yllapito`'s one link was the only underlined
one, and the header's `Hae` button read as plain text beside its field. Agreed
with Miikka on 2026-10-24 and written on the issue: an in-text link is always
underlined in the text's colour, thicker on hover, and a switch is a segmented
control whose chosen option is filled and marked `aria-current`.

This overrides decisions/068's "A toggle's look" in one respect: a hidden
model's toggle is underlined at rest, not only on hover, like every other link.
decisions/056's current row keeps its look, but its "as the switches mark
theirs" no longer holds, since a switch now fills its chosen view.

| Decision | Why |
|---|---|
| One rule in `globals.css`'s base layer underlines every `<a>`: 1 px in the text's colour, 0.2 em below it, 2 px on hover | A link added later is underlined without anyone asking for it, which a class or a component would need. In the base layer, any utility on the link overrides it |
| `quiet-link`, underlined on hover only, for the breadcrumb, the footer's two navigation links, a table's team and match links, and a bracket's team names | Their place already says they are links. The navigation was out of scope and keeps its look. In a table every name is a link, and a column of underlines would compete with the numbers |
| `no-underline` for boxed links: the region and competition cards, the account menu's items, a switch's options | A border or a fill already marks them |
| Every other link takes the rule, the sweep's and the rest: the legal pages, the footer's `football-data.org`, both pagers, the favourites and the search results, the head-to-head form letters, the match page's team names, the model toggles | The issue's test is that every link can be told from plain text. `/yllapito`'s user-table pager had no cue at all |
| A switch between views is `ViewSwitch`: a bordered group, the chosen view filled in the text's colour with its words in the page's background, the others `hover:bg-surface`. `/ennusteet`'s two switches use it | The fill reads as chosen in both schemes, at the page's own contrast. The component is the one place, so a new switch gets it |
| `Kilpailuittain`'s competition links keep their look: the current one semibold and not underlined, the others underlined | A choice of row inside a table, as decisions/056 set it. The underline now comes from the base rule |
| The header's `Hae` button gets the border the forms' buttons have | It read as plain text beside its field. The header's other controls were out of scope |
| The admin user table's buttons, which are underlined text, and `global-error`'s link are unchanged | Buttons were out of scope. `global-error` replaces the root layout, so the stylesheet never reaches it and the browser's own underline applies |
| `links-and-switches.spec.ts` measures it in a browser: each found link underlined in the colour of the text around it, in both schemes; the thicker hover; a table's name quiet until hovered; the switch's fill and border; the `Hae` button's border; `/yllapito`'s link. It also walks eight pages for a visible link that is neither underlined, quiet nor boxed | jsdom has no CSS. The walk is what catches a later link that opts out with nothing in its place |
