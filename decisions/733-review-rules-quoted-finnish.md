# 733 — Sourcery's Block 6 lets any document quote Finnish UI copy: decisions

Chore #733. Block 6 of Sourcery's review rules, written in #389 with no record
of its own, allowed Finnish UI copy in source, asserted in a test, or quoted in
a spec, and nowhere else. `CLAUDE.md` allows quoting a UI string as data
anywhere. On #730 the rule raised four findings on
`decisions/071-section-toggles.md`, each a page heading quoted in backticks as
the page shows it. Agreed with Miikka in chat on 2026-10-24, and he pasted the
new text into Sourcery's dashboard the same day. No earlier record set the
carve-out, so this one overrides none.

| Decision | Why |
|---|---|
| Finnish UI copy quoted in any document is data, a spec and a decision record among them | `CLAUDE.md` says "Quoting a Finnish UI string as data is not writing in Finnish and is expected", naming no files. At least 26 of the 201 records on `main` quote a page heading in backticks, counted on 2026-10-24 for seven headings only |
| A UI label in backticks or quotation marks counts as quoted | Sourcery called the four backticked headings on #730 "unquoted Finnish terms" |
| Finnish as the language of a comment, a test name, a heading or an explanation is still flagged | The carve-out covers copy the app shows, not writing in Finnish |
| `docs/setup/004-sourcery-setup.md` holds the text to paste into the dashboard, and `REVIEW_RULES.md` the rule's scope and the reason for its paths | As #389 laid them out. The dashboard is changed by hand, and nothing in the repository can read it back |
| Only Block 6 changed. The other six blocks were not compared with the dashboard | Sourcery's comments reword a rule as they quote it: the comment rule appears in nine wordings across the last 30 pull requests, so only the dashboard shows the live text |
