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

Cut from `src/components/auth-controls.tsx` at `a86c1cb` by #531.

- **The allowlist notice in `auth-controls.tsx`.** Ours, not Google's: the
  reader got through Google and this app turned them away. It names the
  environment and not the address, so it reveals nothing about who is on the
  list. An earlier comment said naming a cause would leak whether an account
  was on Google's Testing-mode test-user list; that list never gated this
  app, because Google enforces it only beyond `openid`, `email` and
  `profile`.
- **`getAll` in `SignInError`.** `errorCallbackURL` already carries
  `?error=auth`, and better-auth's `appendQueryParams` concatenates its own
  `error=<code>`, so the reader lands on `/?error=auth&error=<code>`. With
  `get`, a named cause would have been silently unreachable.

Cut from `src/lib/sign-in-allowlist.ts` at `dc74e3e` by #531.

- **Why the allowlist exists.** Sign-in was believed to be limited to
  Google's Testing mode test-user list. Measured on 2026-09-09, that was
  false: Google enforces the list only for apps asking for more than
  `openid`, `email` and `profile`, and this app asks for exactly those three.
  Staging accepted any Google account, and nothing anywhere said otherwise.
- **Unset means unrestricted.** Production's consent screen is published and
  open on purpose, and local development has no list either. An environment
  that says nothing gets the behaviour it had and not a lockout.
- **`allowedSignInEmails` reads the variable on every call.** This does not
  save a restart on Railway, which redeploys the service whenever a variable
  changes; an earlier comment claimed it did. It makes the function answer
  from the environment as it is when asked, so nothing depends on when the
  module happened to be imported, and a test can change the variable between
  cases. The cost is a string split per sign-in.
- **`refusesSignIn`.** An identity the provider gave no email for cannot be
  checked against a list, and admitting what cannot be checked is the
  opposite of an allowlist.
- **`signInRefusal`.** Running on every sign-in is what makes this a
  restriction and not a bouncer that only checks new faces. An account
  created before the list existed is refused on its next sign-in, and no
  `user` row is written for one that never got in.

Cut from `src/lib/sign-in-refusal.ts` at `48ebab4` by #531.

- **`sign-in-refusal.ts`.** Both halves need the code and they live on
  opposite sides of the bundle boundary: `sign-in-allowlist.ts` reads the
  environment on the server, and `auth-controls.tsx` is a client component
  rendered on the four pages `tests/unit/app/rendering-mode.test.ts` keeps
  prerendered. The same split `favourite-keys.ts` exists for. better-auth
  puts the code in the URL; CLAUDE.md's rule is that UI strings are Finnish
  and everything else is English, and a query parameter is not a UI
  string.
