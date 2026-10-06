# 314 — Sign-in restricted to an allowlist where one is configured: decisions

Chore #314 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/auth.ts` at `a86c1cb` by #531.

- **`validateUserInfo`, not `databaseHooks.user.create.before`.** That hook
  fires only when an account is created, so anyone who signed in before a
  list existed would keep access forever. `validateUserInfo` runs before
  `create-user`, on `link-account`, and on every OAuth `sign-in`: read from
  better-auth 1.7.3's source, where `link-account.mjs` passes
  `action: "sign-in"` for an account that already exists.
- **Before `create-user`,** so a refused attempt leaves no `user` row behind.
- **What a refusal becomes.** `{ error }` is a `403` the OAuth callback turns
  into a redirect carrying `error=<code>`, and `auth-controls.tsx` renders
  the Finnish for it. The code is deliberately not the reason: see
  `sign-in-refusal.ts`.
