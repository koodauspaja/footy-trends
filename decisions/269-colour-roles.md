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

## Moved from comments, 2026-10-07

Cut from `tests/shared/hardcoded-colour.ts` at `79f2c6a` by #531.

- **One definition for both colour guards.** `tests/unit/app/theme-tokens.test.ts`
  scans the source, and `tests/e2e/dark-mode.spec.ts` scans the stylesheet
  the running app serves. They were written as separate copies of the same
  rule and had already drifted: the source guard knew about `bg-[#fafafa]`
  while the stylesheet guard did not. The rule itself is in
  `src/app/globals.css`: a component names a role, never a shade.
- **`VARIANT`.** A prefix that only allowed `[\w-]+` stopped at the first
  bracket, letting `data-[state=open]:bg-zinc-500` through both guards;
  `[&>svg]:` and `supports-[display:grid]:` are the same shape.
- **`HARDCODED_COLOUR_SELECTOR`.** Leaving the variant prefix out was a real
  gap: Tailwind writes `hover:bg-zinc-500/15` as
  `.hover\:bg-zinc-500\/15:hover`, where the dot sits before `hover` and
  not before `bg`, so a pattern anchored on `\.bg` walked past every variant
  of every shade.
- **`paintsWithShade` is a function.** Passing a pattern into
  `page.evaluate` would mean the matching lived in two places again, which
  is how the arbitrary-colour case came to be missing from one of them.
  Tailwind escapes `:` and `/` in a selector; the class underneath is what
  it is about.

Cut from `tests/e2e/session.ts` at `0fe724f` by #531.

- **`tests/e2e/session.ts` is shared, not copied.** The fake session was
  already written twice, in `auth.spec.ts` and `settings.spec.ts`, and a third
  copy landed in the dark-mode sweep: three chances for it to drift from what
  better-auth actually answers.
