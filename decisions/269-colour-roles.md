# 269 — Every colour has a role that follows the theme: decisions

Chore #269 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/components/account-menu.tsx` at `94397a8` by #531.

- **The account menu's panel.** `bg-background` and `text-foreground` are the
  tokens `globals.css` flips under `prefers-color-scheme`, and `body` uses
  them. A hardcoded white surface while the text followed the theme left the
  panel at 1.17:1 in dark mode. An earlier fix used alpha tints of a mid grey
  for the border and hover, which read acceptably against either background;
  once every scheme had its own values, `border-border` and `bg-surface`, a
  tint that has to work twice was no longer the best answer.
