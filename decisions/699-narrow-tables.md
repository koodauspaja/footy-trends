# 699 — Tables on a phone keep their key column in view: decisions

Chore #699. At 375 px a standings table showed `Sija`, `Joukkue` and `O`. The
points and every other column were out of view, with nothing to say the table
scrolled. A match list showed `Pvm` and `Ottelu` but not `Tulos`. Agreed with
Miikka on 2026-10-24 and written on the issue. Below `sm` this overrides spec
021's "Eleven columns cannot fit a phone, so scrolling is inherent" and its
"nothing is hidden", and decisions/021's "The scale's numbers" for the
flexible column, whose 240 now holds from `sm` up.

| Decision | Why |
|---|---|
| Below `sm` a standings table keeps `Sija`, `Joukkue`, `O` and `P`, and leaves out `V`, `T`, `H`, `TM`, `PM`, `ME` and `Vire` | As agreed: those four are the ones the issue asked a phone to keep. They fit 343 px: 64 + 120 + 44 + 44 = 272 |
| Below `sm` every table's flexible column may narrow to 120 px, from 240, so a long name wraps rather than push the result out of view. A word too long for it, `Mönchengladbach`, breaks | A match list's `Pvm`, `Ottelu` and `Tulos` then take 336 of 343 px. A fourth column, `Kierros`, `Sarja` or `Kilpailu`, still scrolls into view |
| A column leaves a phone through `hideOnPhone` on its `DataTable` column. Its `<col>`, header and cells get `max-sm:hidden`, and the table's floor below `sm` counts only what stays | Hiding the `<col>` along with its cells keeps the other columns on their own widths. Checked in Chromium on 2026-10-24 on a fixed-layout table: `P` lands beside `O`. Firefox and Safari stay a human check |
| A box that still scrolls sideways shadows the edge with more beyond it, through one `scroll-edge` utility: every `DataTable`, the cup bracket and `/yllapito`'s user table | CSS alone. Covers that scroll with the content hide the shadow at the end the reader reaches. A row with a background paints over it: a standings table's zone rows, which on a phone no longer scroll but between 640 and about 830 px still do, and the competition comparison's current row, whose table scrolls on a phone |
| At 1 024 px nothing changes: every column, and the 240 px minimum | As agreed |
| The forecast tables, the score grid, the predictions page's and the admin data page's tables are unchanged | The forecast tables already keep their names sticky and were out of scope on the issue. The others were not in it. The cue is one class to add where a later change wants it |
