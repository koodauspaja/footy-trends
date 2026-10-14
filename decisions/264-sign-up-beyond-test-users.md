# 264 — Google sign-up opened beyond the test-user list: decisions

Chore #264 had no record of its own; #531 created this one for reasons cut
from the comments of its code. Its pull request also rebuilt the guard that
keeps a page declared static from turning dynamic, because the two pages
Google requires reachable signed out depend on it; these reasons are about
that guard.

## Moved from comments, 2026-10-07

Cut from `tests/unit/app/rendering-mode.test.ts` at `c12c30a` by #531.

- **The walk through a page's own modules.** Checking the page's own
  imports was not enough, and review said so four times before the walk was
  written: `headers()` makes a page dynamic wherever it is called, so a
  one-line helper is enough to hide it. Only first-party files are followed,
  so the walk is small and ends at the first package boundary; cycles are
  handled by the visited set. Without the stop at `"use server"` modules it
  reports every page carrying a favourite star, via
  `favourite-toggle.tsx → favourite-actions.ts → current-user.ts`, and the
  build disagrees: all three are `○ (Static)`. `current-user.ts` imports
  `@/lib/auth` with `import type` for the type and with `await import` for
  the value; `viewer.ts` uses `await import` too.
- **Any parameter, not one named `params`.** `function Page(props)` reading
  `props.searchParams` is the case name matching missed. `takesRequestProps`
  handles every default-export form: declaration, arrow function, function
  expression, and `export default Name` followed back to its declaration.
  Each is mutation-checked.
- **Three checks, three properties.** This test proves nothing the page
  declares or imports makes it dynamic. `npm run build`'s route table proves
  the page really is prerendered (`○`). `privacy.spec.ts` and `terms.spec.ts`
  prove it is reachable signed out with JavaScript blocked, and not that it
  is static: a server-rendered page returns HTML without JavaScript too.
  For the two pages Google requires reachable without signing in, becoming
  dynamic is not a performance regression but a broken legal requirement.
