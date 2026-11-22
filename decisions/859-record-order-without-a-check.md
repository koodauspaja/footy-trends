# 859 — A comment's records: the original feature's first, a new one below, without a check: decisions

Chore #859, replacing #850. Overrides the "oldest first" of the comment rule in `CLAUDE.md` and `REVIEW_RULES.md`, which `decisions/531-comments-say-what-code-is-for.md` wrote.

| Decision | Why |
|---|---|
| **The original feature's record first, the others after it, and a record added to a comment goes below the ones already there** | Miikka, 2026-11-22: "original feature first, and then the other decisions after that. the rule for claude could be, that all the new decisions going in, goes below the ones already there". Appending keeps the order a comment's records were added in, which is what "oldest first" was after |
| **Nothing checks it** | "Oldest first" needs a date for each record, and #839 measured three ways to get one: the record's date in git, its number, and the first commit naming its issue. Each disagreed with 51 to 72 existing comments (`decisions/839-mechanical-comment-rules.md`), so a check would need a hand-kept date for all 233 records. #850, which was to build it, is closed |
