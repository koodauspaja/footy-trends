# 023 — Google OAuth signup and login

Implementation decisions for `specs/023-google-oauth-login.md`. Issue #116 was a
placeholder — `specs/NNN-feature-name.md`, three empty acceptance boxes, and a
note listing what nobody had decided yet. Everything below is either a decision
taken deliberately in chat before implementation, or a fact read off the
installed library, a real Postgres, or a real build.

## The library was chosen on evidence, not familiarity

Checked against npm on 2026-09-07 rather than recalled:

| Candidate | State | Verdict |
|---|---|---|
| `next-auth` 5.0.0-beta.32 | The intended modern Auth.js path, still beta | Rejected — a beta dependency in production, and Renovate would offer beta bumps forever |
| `next-auth` 4.24.15 | Current stable, peer-supports `next ^16` and `react ^19` | Rejected — predates the App Router; server-component session access is clumsy, and v4 is effectively in maintenance |
| **`better-auth` 1.7.3** | Stable, peer-depends on `drizzle-orm ^0.45.2` — this repo's exact pin | **Chosen** |

better-auth's default `basePath` is `/api/auth` and its social callback is
`/api/auth/callback/:id`, so Google's callback lands on
`/api/auth/callback/google` — **the redirect URI `docs/setup/014` already
registered**. Switching library cost nothing in the Google Cloud console.

It also added **zero** vulnerabilities. `npm audit` reports six, and all six
(`fast-uri`, `drizzle-kit`, `esbuild`, `browserslist`, two `@esbuild-kit`
packages) trace to Sentry/webpack and drizzle-kit and were present on `main`
before this branch. They are not this PR's to fix.

## The design decision that actually mattered

The first draft of this spec read the session server-side in the root layout and
passed it to `SiteHeader` — the obvious shape, and correct in the HTML with no
flash of a signed-out header.

Then `tests/unit/app/rendering-mode.test.ts` turned up. It names four pages as
`STATIC_BY_DESIGN` — `/`, `/kotimaa`, `/ulkomaat`, `/maajoukkueet` — and its
comment records why the guard exists at all: in #182 a paramless, data-backed
page was prerendered at build time, every query failed against Railway's
runtime-only private network, **and the resulting error page was baked into the
static output and served to everyone** while the build exited 0 and
`/api/health` reported the database healthy.

Reading the session in the root layout puts a Postgres query above all four of
those pages. `headers()` would in practice opt them out of prerendering rather
than letting the build query fail — and that is precisely the objection: the fix
would be *implicit*, invisible in the four page files, and `STATIC_BY_DESIGN`
would go on claiming four pages touch no per-request data while the layout above
them touched some. The guard would keep passing while describing the wrong
world.

**So the session is read in the browser.** `src/app/layout.tsx` is untouched —
listed in the spec's Files To Update precisely so its absence reads as
deliberate. Verified in the build output, before and after:

    ┌ ○ /                    ← still static
    ├ ○ /domestic            ← still static
    ├ ○ /foreign             ← still static
    ├ ○ /national-teams      ← still static
    └ ƒ /api/auth/[...all]   ← dynamic, as it must be

The usual cost of a client-side read is a flash of `Kirjaudu sisään` for a
signed-in reader. That is designed out rather than accepted: while
`useSession()` is pending the control renders a fixed-width **empty slot**. A
signed-in reader never sees a wrong state, only a briefly absent one, and the
header does not reflow when the session lands.

The same boundary decided where the failure notice lives. Rendering it from
`src/app/page.tsx` would give the front page `searchParams` and force it out of
`STATIC_BY_DESIGN` — the same line crossed from the other side. It is rendered
by the client component behind a `<Suspense>` boundary instead, so `/` stays
prerendered.

## Schema: written by hand, and where it departs from the repo

`@better-auth/cli` is published at **1.4.21** against the **1.7.3** library this
repo pins. A generated schema would come from a lagging tool and arrive without
the comments every other table in `src/db/schema.ts` carries, so the four tables
were written by hand from `@better-auth/core/dist/db/get-tables.mjs` at 1.7.3.

Two departures from the surrounding file, both deliberate:

- **`text` primary keys, not `serial`.** better-auth generates its own string
  ids. An integer key needs its `useNumberId` mode plus matching adapter config,
  and buys nothing: no auth table references a match table or the reverse, so
  the two id spaces never meet.
- **Singular table names.** `user`, `session`, `account`, `verification` are the
  library's defaults; renaming them buys a convention and costs a mapping in
  every adapter call.

SQL columns stay snake_case like the rest of the file. That is safe because the
Drizzle adapter resolves a field by indexing the table object with the **TS
property key** (`schemaModel[fieldName]` in
`@better-auth/drizzle-adapter/dist/index.mjs`) and throws if it is absent — so
the camelCase TS keys are what matter, and the column names underneath are ours.
`tests/unit/db/schema.test.ts` pins both halves.

**One constraint is ours, not better-auth's:** a unique index on
(`providerId`, `accountId`). The library looks an account up by that pair on
every sign-in and never writes a duplicate itself; the index makes "one Google
account cannot attach to two users" a property of the database rather than of
the library continuing to behave. Safe because account linking stays disabled.

`password` on `account` is nullable and permanently unused — part of the core
account model for the email/password provider this app does not enable. Omitting
a column the library writes to would break on an adapter we do not control.

## Failing fast on missing configuration

`src/lib/auth.ts` reads its four variables through a `required()` helper that
throws and names the missing one. Without it, better-auth still constructs, the
header still renders, and the break surfaces only when a reader clicks
`Kirjaudu sisään` in production.

That choice is what forced the shape of the tests. The CI `unit` job
deliberately has no service containers and no environment at all, so that a unit
test reaching Postgres fails there with a job name that says so (#158). So
`tests/unit/lib/auth.test.ts` mocks `better-auth`, `postgres` and
`drizzle-orm/postgres-js`, stubs env with `vi.stubEnv`, and re-imports through
`vi.resetModules()` — the shape `tests/unit/db/index.test.ts` already uses. **No
env var was added to the `unit` job.**

The name fallback lives in its own module, `src/lib/auth-profile.ts`, for the
same reason: `auth.ts` throws at import without four variables, so a test of the
fallback would otherwise have to construct the whole auth instance to reach a
two-line function.

## No new GitHub secrets

No test completes a real Google sign-in — Google blocks automated browsers — so
CI needs no real credential. `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are dummy literals in `ci.yml` and
`release.yml`, alongside the `DATABASE_URL` and `REDIS_URL` literals already
there.

Railway is the opposite case and is called out in the spec: it takes the **real**
values, carried over from the existing `NEXTAUTH_SECRET` / `NEXTAUTH_URL` pair,
which better-auth replaces. Nothing needs regenerating. A dummy secret there
would invalidate every session cookie whenever it changed.

## What e2e can and cannot prove

`tests/e2e/auth.spec.ts` covers the control on all seven page shapes — including
the four prerendered ones, where it also proves the control *hydrates*, since it
is absent from the static HTML — the handover to Google, the breadcrumb landmark
staying free of the button, and the failure notice.

The handover test **intercepts and aborts the navigation to
`accounts.google.com`** rather than following it, then asserts on the URL that
was requested: the client id, the `/api/auth/callback/google` redirect URI, and
the `email`/`profile` scopes. The suite proves what we asked Google for without
depending on Google answering.

**It cannot complete a sign-in.** That needs live test-user credentials and
Google blocks automated browsers. The signed-in header is covered by
`tests/unit/components/auth-controls.test.tsx` and by the manual check in the
acceptance criteria. This is stated rather than papered over with a mocked "e2e"
test that would prove nothing about the real flow.

## Verification

- `npm run test:unit` — 1310 tests, **100% statements, branches, functions and
  lines**. Reaching 100% needed a real assertion, not a pragma: Drizzle defers
  `references()` in a callback, so the two uncovered lines were foreign keys
  whose target nobody had ever checked. The test now resolves both and asserts
  they point at `user.id`.
- `npm run test:integration` — 55 tests against real Postgres, 7 of them new.
  They assert the *constraints*, not better-auth's behaviour: cascade on user
  delete, unique session token, unique (`providerId`, `accountId`), unique
  email, and a rejected session for a non-existent user.
- `npm run test:e2e` — **158 passed** against a production build.
- `npm run lint`, `npm run typecheck`, `npm run build` — clean.
- Migration `0010` applied to a real Postgres and the result inspected with
  `\d`: both cascades, both unique constraints and all three indexes present.

One e2e failure appeared in an early full-suite run
(`team.spec.ts › a relegated club is told where it played`). It was investigated
rather than re-run away: the spec passes alone on clean `origin/main` **and**
alone on this branch, and the full suite is green on this branch. It was
state-dependent, not a regression from this change — the class of failure #256
already addressed.

## Deliberately not built

Route protection, middleware, an account page (#117), favourite teams, roles or
an `isAdmin` flag, account linking, and any provider but Google. Every page stays
public; the header is the only difference between signed in and signed out.

Publishing the OAuth consent screen is **#264**. Until then only Google accounts
on the test-user list can sign in — everyone else is refused by Google before
reaching the app, which is why the failure notice names no cause: distinguishing
"you cancelled" from "you are not on the list" would leak the list.
