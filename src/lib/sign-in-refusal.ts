/**
 * The code a refused sign-in carries back in the query string, from #314.
 *
 * Its own module because both halves need it and they live on opposite sides of
 * the bundle boundary: `sign-in-allowlist.ts` reads the environment on the
 * server, and `auth-controls.tsx` is a client component rendered on the four
 * pages `tests/unit/app/rendering-mode.test.ts` keeps prerendered. The same
 * split `favourite-keys.ts` exists for, and for the same reason.
 *
 * A code rather than a message: better-auth puts this in the URL, and the
 * Finnish the reader sees is chosen in the component. CLAUDE.md's rule is that
 * UI strings are Finnish and everything else is English — a query parameter is
 * not a UI string.
 */
export const SIGN_IN_NOT_ALLOWED = "sign_in_not_allowed";
