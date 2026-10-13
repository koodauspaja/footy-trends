# 629 — `Kilpailut rinnakkain` folds away: decisions

Notes for #629, a chore.

## Why

A competition's standings page ended `Analyysit` with the same twenty-row
table of every compared competition, whichever league the reader had opened.
Miikka, 2026-10-12: "showing this under each competition without the
possibility to toggle it minimized, is poor design".

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| How it starts | Folded, on every load | Miikka, 2026-10-12. A reader who came for one league's table no longer scrolls past twenty rows of the others |
| What folds | The group `Kilpailut rinnakkain`, heading and all | The group's heading is what a reader presses, as `Ottelut` and `Analyysit` are on the team page (decisions/416). The page's other groups are about this competition and stay as they were |
| The mechanism | A `<details>` without `open`, its `<summary>` holding `FoldMarker` and the group's own `h3` | The team page's, and the shared marker's (decisions/419): no script, and the keyboard and assistive technology get it from the element |
| Where | `Group` in `competition-analytics.tsx`, by a `folded` property | One group component, so a second folded group is a property and not a copy |
| The data | Read whether the group is opened or not, as before | Deferring the read to the opening would make the group a client component with a request of its own. That is a different change from giving it a fold, and not this chore's |
| Remembering the choice | Not done | Out of the issue's scope. The fold resets on every load, as the team page's do |

## What the tests prove, and how

- **Every mutation below was caught**, one row each:

  | # | Mutation |
  |---|---|
  | 1 | The group not folded |
  | 2 | The fold starting open |
  | 3 | Every group folded |
  | 4 | The marker left out of the summary |
  | 5 | The heading left outside the summary |

- **End to end**, against a production build: the group starts folded with its
  heading and marker showing and the table hidden, the groups above it as they
  were; it opens and folds from the mouse and from the keyboard; it is folded
  again after a reload. The panel's own tests open it first.
- **By eye**: folded and opened at 375 px, light and dark, and at 1 280 px,
  light, on Veikkausliiga's standings page from the production build. The
  page's width was measured in both states at both widths and both themes: no
  horizontal scroll.
