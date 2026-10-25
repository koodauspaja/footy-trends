# 696 — Headings and spacing: an analytics panel, a table's label and an empty line each look like what they are: decisions

Chore #696. The #695 sweep found analytics panels running together:

- A panel's heading (`Kauden ennuste`, 14 px) looked like the table label under it (`Mestaruussarja`, 14 px).
- An empty line (16 px) was larger than the heading above it.
- Panels sat 16 px apart, the same gap as between two groups.
- A standings page's table headings differed: `Runkosarja` 20 px bold, `Liigavaihe` and the World Cup's `Lohko A` 16 px medium.

Agreed with Miikka on 2026-10-24 and written on the issue: every standings table heading is bold like `Runkosarja`, at one level everywhere. Analytics panel headings get a larger style. Panels get space between them, as the legal pages have. The panel headings' size was settled afterwards, below.

| Decision | Why |
|---|---|
| A standings table's heading is `TABLE_HEADING`, `font-semibold text-xl`, on the domestic page and on the foreign and national pages: `Runkosarja`, `Lohko A`, `Liigavaihe`, `Pudotuspelit` | As agreed. One constant, so the same kind of heading cannot drift apart again |
| An analytics panel's heading is `PANEL_HEADING`, `font-semibold text-lg` (18 px): above the 14 px table labels and chart labels inside a panel, and below `Analyysit` and a table's heading (20 px) | Miikka chose this on 2026-10-24 ("696, do recommendation") over the agreement's literal "larger than the table headings". That reading would have put every panel's `h4` above its own section's `h2`. An empty line (16 px) is now smaller than the heading above it |
| A panel starts 32 px below the one before it, and the first 16 px below its group's label. A group starts 48 px below the one before it | 32 px is the legal pages' gap between sections. A group's gap is larger than a panel's, so the groups read as the larger parts |
| A group's label is `GROUP_HEADING`, shared by the team page's groups and the standings page's | The two copies were identical. One constant keeps them so |
| Every labelled select (`Kausi`, `Kierros`, `Vaihe`, `Kilpailu`) is one flex item of its row | On the national match list at 375 px, `Vaihe` ended one line and its select started the next. Measured: three labels were parted from their selects there |
| The season comparison's line keeps 8 px from its chart | `Verrattuna 3 muuhun kauteen: …` touched the first bar label, `Sijoitus` |
| The Champions League's knockout forecast labels its two tables `Liigavaihe` and `Pudotuspelit` when both are shown. A lone knockout table stays unlabelled | They ran together under one heading. These are the names the standings page gives the same phases. A lone table needs no name to tell it from another, as the season forecast already does |
| `headings-and-spacing.spec.ts` measures it in a browser: one look for the four pages' table headings; a table label, a panel heading and `Analyysit` in rising sizes, and no empty line larger than its panel's heading; the gaps between panels and between groups; every label on its select's line at 375 px; and the comparison line's gap | jsdom has no layout |
