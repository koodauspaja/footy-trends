# 023 — Google OAuth signup and login

## Summary

Let a reader sign in with their Google account, so that the app has a real user
identity to hang later features on. This feature adds identity and nothing that
consumes it: every page stays public and renders exactly as it does today,
signed in or not.

## Why this is the foundation

`#117` (account settings) and the favourite-teams issue both need a user row and
a session before they can exist. Neither can be specified honestly until it is
settled *what a user is* in this app. This spec settles that and stops there.

Verified against the repository on 2026-09-07:

| Claim | State |
|---|---|
| OAuth credentials exist | Yes — `docs/setup/014-google-oauth-setup.md`, consent screen in **Testing** mode |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env.example` | Yes, unused by any code |
| Auth library in `package.json` | **None** |
| `users` / `sessions` / `accounts` tables in `src/db/schema.ts` | **None** — only `matches`, `taso_matches`, `taso_group_teams` |
| Anything reading a session | **Nothing** |

## Decisions this spec commits to

Confirmed in chat before writing, because each one changes what gets built:

| Decision | Choice | Why |
|---|---|---|
| Library | **better-auth 1.7.3** | Stable release; peer-depends on `drizzle-orm ^0.45.2`, this repo's exact pin; `next ^16` supported. NextAuth v5 is still `5.0.0-beta.32`, and v4 predates the App Router. |
| Sessions | **Database sessions** | Sign-out revokes immediately, and a real `user` row exists from day one for #117. |
| Visible scope | **Sign in / sign out only** | No page gates behind login. Gating arrives with the features that need it. |
| Consent screen | **Stays in Testing mode** | Shipping needs no Google Cloud change; the test-user limit is documented, not worked around. |

## Scope

### In scope

- Google as the only sign-in provider.
- The four better-auth tables in `src/db/schema.ts` and one generated migration.
- A sign-in / sign-out control in `SiteHeader`, visible on every page.
- The signed-in user's name in that header.
- The auth route handler at `/api/auth/[...all]`.
- Renaming the `NEXTAUTH_*` environment variables to better-auth's names, in
  `.env.example` and `docs/setup/014-google-oauth-setup.md`.

### Out of scope

- **Any change to what a page shows.** Standings, match lists, team pages, the
  cup bracket and the front page render identically whether or not a reader is
  signed in. The header is the only difference.
- Protected routes, middleware, and any `redirect()` to a login page. Nothing is
  gated, so nothing needs protecting yet.
- An account page — that is #117.
- Favourite teams, saved preferences, admin tooling.
- Email/password, magic links, and every provider other than Google.
- Account linking between providers: with one provider there is nothing to link.
- Publishing the OAuth consent screen to Production.
- Roles, permissions, or an `isAdmin` flag. No feature reads one yet, and a
  column nothing reads is a guess about a spec not yet written.
- Deleting a user or exporting their data.

## UX / UI (Finnish strings)

All of this lives in an `AuthControls` client component, rendered by `SiteHeader`
to the right of the existing breadcrumb.

### Session still loading

An empty slot of the same width as the `Kirjaudu sisään` button. No text, no
spinner. This state is normally invisible; it exists so that a signed-in reader
is never shown a signed-out header, and so the header does not reflow when the
session arrives.

### Signed out

| Element | String |
|---|---|
| Button | `Kirjaudu sisään` |

Clicking it starts the Google flow. There is no intermediate login page — one
provider means a chooser would offer a choice of one.

### Signed in

| Element | String |
|---|---|
| User's name | the `name` from the Google profile, rendered as text |
| Button | `Kirjaudu ulos` |

### Sign-in failed

The reader lands back on the front page with a notice:

| Element | String |
|---|---|
| Notice | `Kirjautuminen epäonnistui. Yritä uudelleen.` |

This covers a cancelled consent screen, a Google account that is not on the test
list, and a provider error, deliberately as one string: Google's `error` query
parameter distinguishes them, but the reader's next action is the same in every
case, and naming the cause would leak whether a given account is on the test
list.

Rendered with the existing `Notice` component (`src/components/notice.tsx`), not
a new one.

### Sign-out failed

| Element | String |
|---|---|
| Notice | `Uloskirjautuminen epäonnistui. Yritä uudelleen.` |

Distinguished from the sign-in message because it describes a different thing
having failed, and because — unlike the Google-side causes — it is ours and
leaks nothing by being named. The reader stays on the page they were on; the
error is carried in that page's own `?error=signout`, so one notice has one
source rather than a second, invisible mechanism kept in agreement with the
first.

### Accessibility

The header's existing `<nav aria-label="Murupolku">` wraps the breadcrumb only.
The auth control sits outside it, so the breadcrumb landmark keeps its meaning.

## API & Data

### Route handler

`src/app/api/auth/[...all]/route.ts`, exporting better-auth's
`toNextJsHandler(auth)` — verified present in
`better-auth/dist/integrations/next-js.d.mts`, exporting `GET`, `POST`, `PATCH`,
`PUT` and `DELETE`.

better-auth's default `basePath` is `/api/auth` and its social callback route is
`/api/auth/callback/:id`, so Google's callback lands on
`/api/auth/callback/google` — **the redirect URI already registered in
`docs/setup/014`, unchanged**. No Google Cloud edit is needed.

The handler must be `export const dynamic = "force-dynamic"`, matching every
other route in the app, and must never be cached at any layer.

### Schema

Four tables, hand-written into `src/db/schema.ts` in the repository's existing
style — column comments explaining *why*, not `@better-auth/cli generate`. The
CLI is published at **1.4.21** against a **1.7.3** library, so a generated file
would be produced by a lagging tool and would arrive without the comments every
other table here carries. The field list below is taken from
`@better-auth/core/dist/db/get-tables.mjs` at 1.7.3, not from memory.

| Table | Columns |
|---|---|
| `user` | `id` (text, pk), `name` (required), `email` (unique, required), `emailVerified` (boolean, default false, required), `image` (nullable), `createdAt`, `updatedAt` |
| `session` | `id` (text, pk), `token` (unique, required), `expiresAt`, `userId` → `user.id` `ON DELETE CASCADE`, indexed, `ipAddress` (nullable), `userAgent` (nullable), `createdAt`, `updatedAt` |
| `account` | `id` (text, pk), `accountId`, `providerId`, `userId` → `user.id` `ON DELETE CASCADE`, indexed, `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `password` (all nullable), `createdAt`, `updatedAt`. Plus a **unique index on (`providerId`, `accountId`)** — see below |
| `verification` | `id` (text, pk), `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt` |

`verification` is required even though no email flow exists: better-auth stores
the OAuth state and PKCE verifier there for the duration of the redirect.

The unique index on (`providerId`, `accountId`) is **ours, not better-auth's**.
The library looks an account up by that pair on every sign-in and so never
writes a duplicate by itself; the constraint makes "one Google account cannot end
up attached to two users" a property of the database rather than of the library
continuing to behave. It is safe with account linking disabled, which this spec
keeps disabled.

`password` on `account` stays nullable and permanently unused — it is part of
better-auth's core account model, and omitting a column the library writes to
would break on an adapter it does not control.

**Primary keys are `text`, not `serial`.** Every existing table in this repo uses
`serial`; better-auth generates its own string ids and an integer pk would need
its `useNumberId` mode plus a matching adapter config. The two id spaces never
meet — no auth table references a match table or the reverse — so this is a
deliberate, contained inconsistency rather than an oversight.

Table names are singular (`user`, `session`, `account`, `verification`) because
they are better-auth's defaults; renaming them buys a naming convention and
costs a config mapping in every adapter call.

### Session reading — client-side, and why

The session is read **in the browser** by `authClient.useSession()`, inside the
auth control. The root layout does not read it, does not call `headers()`, and
stays a server component with no request-scoped data.

The obvious alternative — `auth.api.getSession({ headers: await headers() })` in
the root layout, passed down as a prop — was rejected, and the reason is a
production incident this repository already paid for.

`tests/unit/app/rendering-mode.test.ts` names four pages as `STATIC_BY_DESIGN`:

    page.tsx            → /
    domestic/page.tsx   → /kotimaa
    foreign/page.tsx    → /ulkomaat
    national-teams/page.tsx → /maajoukkueet

They are prerendered at build time, deliberately, because they touch no
per-request data. Its comment records what happens when that stops being true:
`/maajoukkueet/huuhkajat` (#182) was prerendered, every query failed at build
time with `ENOTFOUND postgres.railway.internal` — Railway's private network is
runtime-only — **and the resulting error page was baked into the static output
and served to everyone.** The build exited 0 and `/api/health` reported the
database healthy.

A session read in the root layout puts a Postgres query above all four of those
pages. `headers()` would in practice opt them out of prerendering rather than
letting the build query fail — but that is the point: the fix would be
*implicit*, invisible in the four page files themselves, and it would silently
turn the repo's most carefully guarded invariant into a claim that is no longer
true. `STATIC_BY_DESIGN` would still list four pages as touching no per-request
data while the layout above them touched some. The guard would keep passing
while describing the wrong world.

Reading the session client-side keeps all four pages exactly as they are, adds no
database query to any page's render path, and needs no change to the guard or
its list.

**The flash this normally costs is designed out rather than accepted.** While
`useSession()` is pending, the control renders an empty slot of fixed width — not
`Kirjaudu sisään`. A signed-in reader therefore never sees a *wrong* state, only
a briefly *absent* one, and the header does not reflow when the session lands.

### The failure notice

For the same reason, the notice is **not** rendered by `src/app/page.tsx`.
Reading `searchParams` there would give the front page request props and force it
out of `STATIC_BY_DESIGN` — the same boundary, crossed from the other side.

It is rendered by the client auth component via `useSearchParams()`, wrapped in
the `<Suspense>` boundary Next requires, so `/` stays prerendered and the notice
fills in on the client.

### Caching

- **Nothing about a session is cached.** No Redis key, no `getCached` call, no
  `revalidate`. Sessions are read from Postgres per request.
- better-auth's cookie session cache stays **off**. It would cut the per-request
  query, but it caches the session in a signed cookie for a TTL, which delays
  the immediate revocation that database sessions were chosen for.
- **No existing cache key gains a user dimension.** Every current Redis key is
  content-scoped (competition, season, team), and it must stay that way — a
  per-user key in a shared cache is how one reader gets served another's page.
  This is the single most important invariant in this spec.

## Edge Cases

| Case | Behaviour |
|---|---|
| Google account not on the Testing-mode test-user list | Google refuses before redirecting back; the reader never reaches our callback. Nothing for the app to handle — Google's own screen is the end of the flow. |
| Reader cancels at the consent screen | Google returns `error=access_denied`. Land on `/` with `Kirjautuminen epäonnistui. Yritä uudelleen.` |
| Google profile has no `name` | `user.name` is `required`. Fall back to the local part of the email (`matti.meikalainen@…` → `matti.meikalainen`). Google returns a name under the `profile` scope, so this is a guard against a contract, not an expected path. |
| Google profile has no `image` | Column is nullable; the header shows the name alone. The header shows no avatar in this spec regardless. |
| Same Google account signs in again | Matched on (`providerId`, `accountId`) → the existing `user` row. No duplicate user, no duplicate account. |
| Session expires while the reader is on a page | The next request renders the header signed out. No page breaks, because no page depends on a session. |
| Postgres unreachable during a session read | The client `useSession()` call fails; the control renders **signed out** rather than throwing. A database blip must not turn every page into an error page when no page needs the session. Because the read is client-side, a failure cannot affect the server-rendered page at all. |
| Session read is slow | The control stays an empty slot until it resolves. No page content waits on it — the page is already rendered and interactive. |
| Postgres unreachable during the sign-in callback | The auth handler returns its error; the reader lands on `/` with the failure notice. |
| Reader signs out | Session row deleted, cookie cleared, reader stays on the page they were on. |
| Sign-out request fails | The reader stays put and is told `Uloskirjautuminen epäonnistui. Yritä uudelleen.` Neither this nor the sign-in call may drop its promise: a rejected sign-out otherwise leaves a header claiming the reader is signed in while the session row and cookie still exist, with an unhandled rejection as its only trace. |
| Sign-in request fails before reaching Google | Our own route being unreachable, rather than Google refusing. Reported in place with the sign-in failure notice. |
| Reader has cookies disabled | The flow cannot complete; the reader returns to `/` signed out with the failure notice. First-party cookies only, so a third-party-cookie blocker does not affect this. |
| Two browsers / devices, same account | Two `session` rows, one `user` row. Signing out of one leaves the other signed in. |

## Performance & Limits

- **No page's server render gets slower.** The session is fetched by the browser
  after the page is delivered, so time-to-first-byte is unchanged everywhere and
  the four prerendered pages stay prerendered.
- One extra client request per page load, to `/api/auth/get-session`. It reads
  `session` by `token`, which is `UNIQUE` — a single-row index hit.
- No new external API calls in any path. Google is contacted only during the
  sign-in redirect itself.
- The `matches` and `taso_matches` query paths are untouched.
- No rate limiting is configured in this spec. better-auth's rate limiter would
  add a `rateLimit` table; with sign-in as the only endpoint and a test-user-gated
  consent screen, there is nothing yet to rate limit. Worth revisiting when the
  consent screen is published.
- No pagination anywhere — no list of anything is added.

## Security & Secrets

### Environment variables

| Variable | Change |
|---|---|
| `GOOGLE_CLIENT_ID` | unchanged |
| `GOOGLE_CLIENT_SECRET` | unchanged |
| `BETTER_AUTH_SECRET` | **replaces** `NEXTAUTH_SECRET` (same `openssl rand -base64 32` value is fine) |
| `BETTER_AUTH_URL` | **replaces** `NEXTAUTH_URL` |

Both new names must be added to Railway's Variables tab **before** the release
reaches production, and `docs/setup/014-google-oauth-setup.md` updated so the
setup doc stays authoritative rather than describing a library the repo does not
use. The old `NEXTAUTH_*` names are removed from `.env.example` in the same
change — leaving both would be two sources of truth for one secret.

No secret is committed. `.env.example` carries empty values only, as today.

### Railway — real values, not dummies

The two new Railway variables take the **existing** values, not placeholders:

| New variable | Value |
|---|---|
| `BETTER_AUTH_SECRET` | the current `NEXTAUTH_SECRET` value, copied across |
| `BETTER_AUTH_URL` | the current `NEXTAUTH_URL` value, copied across |

Nothing needs regenerating, and `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are
untouched. A dummy value works in CI but **not** here: a placeholder
`BETTER_AUTH_SECRET` in production would invalidate every session cookie the
moment it changed, and a wrong `BETTER_AUTH_URL` sends Google's callback to the
wrong host. Once both are set the old `NEXTAUTH_*` pair can be deleted from
Railway.

### CI — no new GitHub secrets

Nothing in CI needs a real Google credential, because no test completes a real
sign-in. Every value below is a literal in the workflow file, matching how
`DATABASE_URL` and `REDIS_URL` are already provided.

| Job | Change |
|---|---|
| `ci.yml` → `unit` | **No env vars added.** That job deliberately has none and no service containers, so that a unit test reaching Postgres fails there with a name that says so (#158). `lib/auth.test.ts` must therefore mock `better-auth` and `postgres` and stub env with `vi.stubEnv`, exactly as `tests/unit/db/index.test.ts` already mocks `postgres` — never rely on ambient environment. |
| `ci.yml` → `integration` | Add `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` as literals to the existing `env:` block. |
| `release.yml` → `integration` and `e2e` | The same two, plus dummy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` literals. The e2e assertion is that the sign-in link carries *the configured* client id, which a dummy satisfies — it proves the wiring, which is all an automated test can prove here. |

Suggested literals, chosen to be obviously non-secret at a glance:

    BETTER_AUTH_SECRET: ci-not-a-real-secret-ci-not-a-real-secret
    BETTER_AUTH_URL: http://localhost:3000
    GOOGLE_CLIENT_ID: ci-dummy-client-id
    GOOGLE_CLIENT_SECRET: ci-dummy-client-secret

### Other

- `accessToken`, `refreshToken` and `idToken` are stored on `account` and are
  marked `returned: false` in better-auth's field definitions, so they are never
  serialised to the client. Nothing in this app reads them; no code may expose
  them.
- The session cookie is `httpOnly`, `sameSite=lax`, and `secure` in production.
- The only personal data stored is name, email and avatar URL — what the
  `openid email profile` scopes already return. No extra scope is requested.
- **Sentry:** signing in must not start sending user emails to Sentry.
  `SENTRY_SEND_DEFAULT_PII` is already unset in production per
  `docs/setup/021-production-environment.md`; this spec adds no `setUser` call.

## Acceptance Criteria

- [ ] `npm run db:migrate` creates `user`, `session`, `account` and
      `verification` with the columns, unique constraints and cascading foreign
      keys listed above.
- [ ] Signed out, every page shows `Kirjaudu sisään` in the header — verified by
      loading a page in each of the three regions plus `/`.
- [ ] Clicking `Kirjaudu sisään` reaches Google's consent screen for the
      `footy-trends` OAuth client.
- [ ] Completing sign-in as a listed test user returns to the page the reader
      started on, with their name and `Kirjaudu ulos` in the header.
- [ ] That sign-in creates exactly one `user` row, one `account` row with
      `providerId = 'google'`, and one `session` row.
- [ ] Signing in a second time with the same account creates a second `session`
      row and **no** second `user` or `account` row.
- [ ] `Kirjaudu ulos` deletes the session row, clears the cookie, and leaves the
      reader on the same page, signed out.
- [ ] Cancelling at Google's consent screen lands on `/` with
      `Kirjautuminen epäonnistui. Yritä uudelleen.`
- [ ] Standings, matches, team, match and cup pages render identically signed in
      and signed out — confirmed by loading the same URL in both states.
- [ ] With Postgres reachable but the session row deleted underneath it, the next
      page load renders signed out and does not error.
- [ ] No Redis cache key contains a user id, session token, or email.
- [ ] `/`, `/kotimaa`, `/ulkomaat` and `/maajoukkueet` are still prerendered:
      `npm run build` reports them as static (`○`), not dynamic (`ƒ`).
- [ ] `tests/unit/app/rendering-mode.test.ts` passes with no edit to the file,
      and `STATIC_BY_DESIGN` still names exactly four pages.
- [ ] A signed-in reader never sees `Kirjaudu sisään` at any point during a page
      load — only an empty slot, then their name.
- [ ] `npm run test:unit` reports 100% statements, branches, functions and lines.
- [ ] `npm run test:integration` and `npm run test:e2e` both pass.
- [ ] `npm run lint`, `npm run typecheck` and `npm run build` pass.

## Tests Required

### Unit — `tests/unit/`

| File | Assertions |
|---|---|
| `components/site-header.test.tsx` (existing, extended) | Signed out → `Kirjaudu sisään` present, no name. Signed in → name and `Kirjaudu ulos` present, `Kirjaudu sisään` absent. The breadcrumb assertions already there still pass in both states, and the auth control renders outside `nav[aria-label="Murupolku"]`. |
| `db/schema.test.ts` (existing, extended) | The four tables exist with the expected column names; `session.token` unique; `session.userId` and `account.userId` cascade on delete. |
| `lib/auth.test.ts` (new) | Google is the configured provider; the Drizzle adapter is wired to `db`; missing `BETTER_AUTH_SECRET` fails loudly at construction rather than at first sign-in. Mocks `better-auth` and `postgres` and sets env with `vi.stubEnv` + `vi.resetModules()` and a dynamic import — the `tests/unit/db/index.test.ts` pattern. It must pass in a shell with no `.env` and no environment at all, because that is what the CI `unit` job is. |
| `lib/auth-name-fallback.test.ts` (new) | A profile with no `name` yields the email local part; a profile with a name is untouched. |
| `components/auth-controls.test.tsx` (new) | Pending session → empty slot, neither `Kirjaudu sisään` nor a name. Failed session → signed out, no throw. `?error=` present → the failure notice renders; absent → it does not. A rejected `signOut()`/`signIn.social()` reports on the current path, keeping the reader's existing query. |
| `lib/auth-client.test.ts` (new) | The client takes no `baseURL`, and re-exports the three members the header uses. Exists because every other test mocks this module, so without it the real file is never imported — which vitest scores 100% and Sonar scores 0%. |
| `app/api/auth/route.test.ts` (new) | The route serves better-auth's handler and is `force-dynamic`. Same reason as above: an untested file is invisible to vitest's report and 0% in Sonar's. |
| `app/rendering-mode.test.ts` (existing) | Must pass **unchanged**, with `STATIC_BY_DESIGN` still listing exactly its current four pages. If this file needs editing, the implementation has crossed the boundary this spec set out to respect — treat that as a design failure, not a test to update. |

### Integration — `tests/integration/auth.test.ts` (new)

Against real Postgres, as the other integration tests do:

- Inserting a user and session, then reading the session by token, returns the
  user.
- Deleting the user cascades away its sessions and accounts.
- The same (`providerId`, `accountId`) pair cannot produce two user rows.

### E2E — `tests/e2e/auth.spec.ts` (new)

Serial, like the rest of the suite — enforced in `playwright.config.ts` since
#227, so no `--workers=1` flag is needed or wanted.

- The header shows `Kirjaudu sisään` on `/`, `/kotimaa/sarjataulukko`,
  `/ulkomaat/sarjataulukko` and `/maajoukkueet/sarjataulukko`.
- Clicking it navigates to an `accounts.google.com` URL carrying the configured
  client id.
- A standings page's table contents are byte-identical to the pre-change
  snapshot, proving the header change did not disturb the page.

**E2E cannot complete a real Google sign-in** — it needs live test-user
credentials and Google blocks automated browsers. The signed-in header is
therefore covered by unit tests plus the manual verification the acceptance
criteria call for, and this gap is stated here rather than papered over with a
mocked-out "e2e" test that proves nothing about the real flow.

## Files To Update

| Path | Change |
|---|---|
| `specs/023-google-oauth-login.md` | this file |
| `decisions/023-google-oauth-login.md` | written by the implementing agent |
| `package.json` | add `better-auth` at an exact pin (1.7.3), matching the repo's no-caret convention |
| `src/db/schema.ts` | the four tables |
| `drizzle/migrations/` | one generated migration |
| `src/lib/auth.ts` | new — the better-auth server instance |
| `src/lib/auth-client.ts` | new — the browser client |
| `src/app/api/auth/[...all]/route.ts` | new — the route handler |
| `src/components/auth-controls.tsx` | new — client component: session state, sign-in/out, failure notice |
| `src/components/site-header.tsx` | render `AuthControls` beside the breadcrumb |
| `src/app/layout.tsx` | **unchanged** — listed to make its absence deliberate |
| `src/app/page.tsx` | **unchanged** — see "The failure notice" |
| `.env.example` | `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` replace the `NEXTAUTH_*` pair |
| `docs/setup/014-google-oauth-setup.md` | the same rename, plus a note that the registered redirect URI is unchanged |
| `.github/workflows/ci.yml` | two literals on the `integration` job; `unit` untouched |
| `.github/workflows/release.yml` | the same two, plus two dummy Google literals, on `integration` and `e2e` |
| `tests/…` | as listed above |

## Open Questions

None outstanding. All three were resolved in chat on 2026-09-07, recorded here
because each one shaped the spec above.

1. **Client-side session read — settled, keep it.** The session is read in the
   browser so `/`, `/kotimaa`, `/ulkomaat` and `/maajoukkueet` stay prerendered
   and `STATIC_BY_DESIGN` stays true. The cost — an auth control that is briefly
   empty on first paint — is accepted, and is mitigated by rendering a
   fixed-width empty slot rather than a wrong signed-out state. The rationale is
   #182, in full, under "Session reading — client-side, and why".
2. **Environment variables — settled.** Railway is updated by hand before merge,
   with the real values carried over from the `NEXTAUTH_*` pair. CI needs no new
   GitHub secrets at all; every CI value is a dummy literal in the workflow file.
   See "Railway — real values, not dummies" and "CI — no new GitHub secrets".
3. **Test-mode ceiling — settled, and deferred by choice.** Only listed Google
   test users can sign in, and this spec ships that way. Opening signup to any
   Google account is wanted "once we're good for proper launch" and is tracked
   as its own follow-up rather than smuggled in here — publishing the consent
   screen is a Google Cloud action with its own consequences (an unverified-app
   warning screen, and a Google verification review once sensitive scopes or
   volume warrant it), and it should land when the app is ready to be launched,
   not when the login code merges.

## Follow-ups this spec creates

| Follow-up | Why it is not in #116 |
|---|---|
| Publish the OAuth consent screen to Production so any Google account can sign up | A Google Cloud change, not a code change; wanted at launch readiness, not at merge. Blocks nothing here. |
| Delete the `NEXTAUTH_SECRET` / `NEXTAUTH_URL` variables from Railway | Only safe once the new pair is confirmed live in production. |
| Revisit better-auth's rate limiter | Nothing to rate limit while the consent screen gates sign-in to a handful of test users; it becomes real the moment the follow-up above ships. |
