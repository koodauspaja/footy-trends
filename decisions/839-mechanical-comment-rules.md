# 839 — The comment-rules test checks a declaration's citation and a comment's length: decisions

Chore #839. Measured on #817 over the last 50 merged pull requests: Sourcery
raised 42 findings about this repository's own comment rules that the author
then fixed. `tests/unit/scripts/checks/comment-rules.test.ts` checked none of
them. Two of the three mechanical kinds are now checks: a declaration's doc
comment without a record path (about 22 findings), and a comment over
CLAUDE.md's one to three lines (about 4).

## Decisions

| Decision | Why |
|---|---|
| A doc comment on a top-level declaration fails without a `decisions/` path, whatever the file's header cites | The reading `decisions/531-comments-say-what-code-is-for.md` gives CLAUDE.md's rule: the header covers a declaration only when the declaration has no comment of its own. Miikka chose it on 2026-11-21 over the issue's first wording, under which a citing header covered the whole file. 710 of the 784 source files have a citing header, so that reading would have reached only the other 74 and found nothing today |
| "Declaration" means a function, class, interface, type, enum, variable statement, namespace or default export at the top of a file | A field's comment, a method's and a comment inside a function are covered by the declaration they sit in (531). A comment on a call such as `describe(…)`, an import or an export list is on no declaration |
| A header that a blank line sets apart is the file's, not the first declaration's | The same line `stackedDocComments` draws. A header sitting directly on the first declaration is that declaration's comment too, and has to cite a record |
| A comment fails when its prose before the first record path runs over three lines | CLAUDE.md's one to three lines. Blank lines and the comment's markers do not count, and nothing after the first path is counted. A comment with no path counts all its prose |
| `//` lines are one comment when each sits on its own line, directly under the previous one | That is how a reader sees a run of line comments. A blank line, code or a block comment between them ends the run, and so does a `//` after code on the same line |
| Each check fails only on findings its record does not list: `recorded-uncited-declarations.json` (50) and `recorded-long-comments.json` (55) | The issue-citation check works the same way (531), so comments not yet trimmed do not fail. A finding is keyed by its file and its words, so a comment that only moves keeps its key, and a rewritten one is new and has to comply. A recorded finding that is gone fails as well, so the record shrinks as files are trimmed |
| The citation-order check is left out | Below |

## Why the order check was left out

The issue defined "oldest first" as the order in which the records were first
added in git. Measured on `main` at `a0a64dda`:

- 80 of the 233 records were added by #531's comment batches between 2026-10-05
  and 2026-10-07, for changes made well before then. `085-release-workflow.md`
  is dated 2026-10-07, after `113-taso-key-monitor.md` on 2026-10-06.
- By that date, 72 existing comments are out of order, most because they cite
  one of those 80. A new comment citing one would be told an order that
  contradicts when the changes happened.
- Record numbers do not order the records either: a feature's record carries its
  spec number (001–080), and a chore's or bug's its issue number.

The order check had caught 3 of the 42 findings. Miikka, 2026-11-21: "Drop it
from #839".
