# 028 — Admin tools and role-based user management

## Summary

Give the app a concept of an **admin**, and one place where an admin can see who
uses it, change who else is an admin, and delete an account. The role is what
later operational tools authorise against — #150's forced TASO re-sync is the
first of them.

## Decisions this spec commits to

### The role lives in the database, not in configuration

A `role` column on `user` is the source of truth. The alternative considered was
an `AUTH_ADMIN_EMAILS` variable mirroring `sign-in-allowlist.ts` from #314, and
it was rejected for one reason: an admin has to be able to change who is an
admin from inside the app, and a variable cannot be written to. Railway also
redeploys the service whenever a variable changes, which makes "promote Kalle" a
deployment.

The allowlist pattern stays where it belongs — deciding who may *sign in* to
staging. That is configuration, because it is about an environment. This is
data, because it is about a person.

### The first admin is made by one documented SQL statement

There is no bootstrap path in the app, deliberately. Every automatic one —
"first user to sign in becomes admin", "this email is admin if it has no role" —
is a rule that exists forever to serve a single moment, and each is a way to
accidentally grant admin later. One `UPDATE`, run once, documented in
`docs/setup/`, cannot misfire twice.

### Non-admins are told the page does not exist

`/yllapito` never answers 403. A 403 confirms the page is there, which is a fact
a stranger has no use for. This mirrors nothing else in the app today because
nothing else is hidden; it is a deliberate choice for the one area that is.

A signed-out visitor gets a real **404**. A signed-in non-admin gets the
not-found **body** with a 200 status — the difference, and why it could not be
closed further, is below.

**`notFound()` alone does not achieve it**, and that was measured rather than
assumed. `src/app/loading.tsx` puts every segment behind a Suspense boundary, so
responses stream, and Next commits the 200 status line before `notFound()` can
be caught — its own documentation says "200 for streamed responses, and 404 for
non-streamed". On a production build a missing URL answered **404** while
`/yllapito` answered **200**, which told a signed-out stranger the route was
real.

So the signed-out case is decided in `src/proxy.ts`, before anything streams: a
request to either spelling without a session cookie is rewritten to a path that
does not exist, and Next produces the identical response it gives any missing
URL — same status, same body, same length, verified at 11 540 bytes against
`/this-route-does-not-exist`. A rewrite rather than a hand-built 404, because a
bare 404 would have an empty body, and a body nothing else returns is itself a
signal.

The proxy reads the **cookie only** — no database, no session validation — and
is not an authorisation. A signed-in non-admin still reaches the page and is
refused by `requireAdmin()`, receiving the not-found body with a 200 status.
That residual difference is visible only to someone who already has an account,
and closing it would mean a database read in front of every request; the trade
was taken deliberately.

### Deletion is the database's cascade, not a procedure

Every table referencing `user` already declares `on delete cascade` — `session`,
`account`, `user_preferences`, `user_avatar`, `favorite_team`,
`favorite_competition` — and avatar bytes live in Postgres rather than on a
volume, so one `DELETE` removes everything a reader owns. No second code path,
which is what `user_avatar`'s own comment says the cascade is for.

## Scope

### In scope

- A `role` column on `user`, values `user` and `admin`, defaulting to `user`
- `requireAdmin()`, the single authorisation check, usable by any future tool
- `/yllapito` — a signed-in admin's page listing every user
- Promoting a user to admin, and demoting an admin to user
- Deleting a user account, with its cascade
- A documented one-time SQL statement that creates the first admin

### Out of scope

- **#150's forced TASO re-sync.** It consumes `requireAdmin()` and specifies its
  own surface; this spec only makes the gate exist.
- An audit log of who changed or deleted what. Worth having and not free; it
  wants its own decision about retention, and #349's deadline-bound logging is
  the nearer precedent to follow when we do.
- Editing a user's name, email or avatar. An admin can remove an account, not
  impersonate or rewrite one.
- Roles beyond the two. A third is a real design question and nothing needs one.
- Analytics or usage figures. That is the #327–#356 set.
- Self-service account deletion by an ordinary reader. Related and separate.

## UX / UI (Finnish strings)

### Reaching it

A link in the account menu, rendered **only** when the session's user is an
admin:

- `Ylläpito`

### `/yllapito`

| Where | String |
|---|---|
| Page heading | `Ylläpito` |
| Section heading | `Käyttäjät` |
| Count beside it | `{n} käyttäjää` — the total, not the page |
| Previous page | `Edellinen` |
| Next page | `Seuraava` |
| Position | `Sivu {n} / {m}` |
| Table: email | `Sähköposti` |
| Table: name | `Nimi` |
| Table: role | `Rooli` |
| Table: joined | `Liittynyt` |
| Table: actions | `Toiminnot` |
| Role value, admin | `Ylläpitäjä` |
| Role value, reader | `Käyttäjä` |
| Promote button | `Tee ylläpitäjäksi` |
| Demote button | `Poista ylläpito-oikeudet` |
| Delete button | `Poista tili` |
| Empty list | `Ei käyttäjiä.` |

Dates use the format already used elsewhere in the app rather than a new one.

### Confirming a deletion

A deletion asks first, because it cannot be undone:

| Where | String |
|---|---|
| Prompt | `Poistetaanko {sähköposti} pysyvästi?` |
| Body | `Tämä poistaa tilin, suosikit, asetukset ja profiilikuvan. Tätä ei voi perua.` |
| Confirm | `Poista tili` |
| Cancel | `Peruuta` |

### When something is refused

| Case | String |
|---|---|
| Acting on your own account | `Et voi muuttaa omaa rooliasi tai poistaa omaa tiliäsi täällä.` |
| Removing the last admin | `Viimeistä ylläpitäjää ei voi poistaa.` |
| Anything else failing | `Toiminto epäonnistui. Yritä uudelleen.` |

## API & Data

### Schema

One column, on the existing table:

```ts
role: text("role").notNull().default("user"),
```

`text` with a checked set rather than a Postgres enum: adding a value to an enum
is a migration with a lock, and `favourite-keys.ts` already establishes the
pattern of validating a small closed set in TypeScript.

The parsing helper lives beside the key helpers, with no database import, so a
client component may ask "is this session an admin" without pulling the schema
into the browser bundle — the boundary `avatar-limits.ts` exists for.

### Reading and writing

No new HTTP endpoints. The page is a server component reading the user table
directly; the three mutations are server actions, in the shape
`favourite-actions.ts` already uses:

- `promoteUserAction(userId: string)`
- `demoteUserAction(userId: string)`
- `deleteUserAction(userId: string)`

Every one of them calls `requireAdmin()` **first**, before reading its
arguments. A server action is a public network endpoint, and its arguments are
attacker-controlled — the same rule `favourite-actions.ts` follows when it
validates a source and an id rather than trusting them.

Each returns a discriminated result rather than throwing, so the page can render
the Finnish refusal that matches:

```ts
type AdminActionResult =
  | { ok: true }
  | { ok: false; reason: "self" | "last_admin" | "not_found" | "failed" };
```

### Caching

None. `/yllapito` is per-request and must never be prerendered — it is
user-specific and privileged. `tests/unit/app/rendering-mode.test.ts` keeps four
pages static by design (#182); this page must be asserted **dynamic** there, so
a later change cannot quietly make it a build artefact containing every user's
email.

## Edge Cases

- **An admin acts on their own row.** Refused for both role change and deletion,
  with the `self` message. Prevents the one-click lockout, and an admin who
  genuinely wants to leave can be removed by another admin.
- **Demoting or deleting the last admin.** Refused with `last_admin`, counted in
  the same transaction as the write so two concurrent demotions cannot both see
  a second admin and both proceed.
- **The target no longer exists** — deleted in another tab. `not_found`, and the
  list re-renders without it rather than reporting a failure.
- **A non-admin calls a server action directly.** `requireAdmin()` refuses. This
  is the case that matters most, because the action is reachable without the
  page.
- **A signed-out visitor opens `/yllapito`.** 404, byte-identical to a genuinely
  missing URL, decided in `src/proxy.ts` before the response streams.
- **A signed-in non-admin opens `/yllapito`.** The not-found body, with no admin
  markup and no admin title — but a 200 status, because `notFound()` cannot
  change a status the stream has already committed. The two are therefore *not*
  indistinguishable, and that is a deliberate trade: closing it would mean a
  database read in front of every request, and the residual difference is
  visible only to someone who already has an account.
- **An admin's role is revoked while they have the page open.** The next action
  fails the gate; the page is not required to notice sooner.
- **A user with no name.** `name` is `notNull` and the sign-in path falls back to
  the email's local part (#116), so the column is safe to render directly.

## Performance & Limits

The list is **paginated, fifty per page**, newest first, with the page in the
URL as `?sivu=N`.

An earlier version bounded the query at 500 with no paging. That kept the render
bounded and made the oldest accounts unreachable once the bound was hit — a
notice saying so made the limit visible without fixing it. Paging removes the
failure mode rather than announcing it: every account is reachable, and no page
renders more than fifty rows.

Two queries per render, a `count(*)` and the page itself. The count is what lets
the page be clamped: asking for page nine of four shows page four rather than an
empty table with no explanation. Fifty is a judgement rather than a measurement,
and it is one constant so measuring can change it.

`created_at` is not unique, so the sort is `created_at desc, id desc`. Without
the second key two accounts created in the same millisecond could swap between
pages — one shown twice, the other never.

The actions are single-row writes. No rate limiting beyond what already guards
the session.

## Security & Secrets

- **No new environment variables, and no secrets.** The deliberate consequence
  of putting the role in the database.
- `requireAdmin()` reads the role from the **database**, not from the session
  payload. A session is client-held and a role copied into it would keep
  answering `admin` after a demotion until the session expired.
- The page and all three actions are gated independently. Neither the link's
  absence from the account menu nor the page's 404 is a control; only the gate
  is.
- No real email addresses in the repository — fixtures use `example.fi`
  addresses, per the standing rule.
- The one-time bootstrap SQL is documented with a placeholder address, never a
  real one.

## Acceptance Criteria

- [ ] A user whose `role` is `admin` sees an `Ylläpito` link in the account menu; a user whose role is `user` does not
- [ ] `/yllapito` renders every user with email, name, role, and join date, newest first
- [ ] A signed-out visitor receives a **404** byte-identical to a genuinely missing URL, decided before the response streams
- [ ] A signed-in non-admin receives the not-found body with no admin markup and no admin title
- [ ] An admin can promote a `user` to `admin`, and the change is visible to that user on their next request
- [ ] An admin can demote another `admin` to `user`
- [ ] An admin cannot change their own role, and is told why in Finnish
- [ ] An admin cannot demote or delete the last remaining admin, and is told why in Finnish
- [ ] Deleting a user removes their session, account, preferences, avatar, favourite teams and favourite competitions — verified by querying each table, not by trusting the cascade
- [ ] Every server action refuses a non-admin caller **when invoked directly**, not only when the page is hidden
- [ ] `requireAdmin()` reflects a role change without the affected user signing out and in again
- [ ] `/yllapito` is asserted dynamic in `tests/unit/app/rendering-mode.test.ts`
- [ ] `docs/setup/` documents the one-time SQL that creates the first admin
- [ ] Unit coverage stays at 100% on all four metrics

## Tests Required

### Unit — `tests/unit/`

- `lib/admin-role.test.ts` — the parsing helper: `admin` and `user` accepted, an
  unknown string is not an admin, `undefined`/`null` are not, and the check is
  case-sensitive. Mutation: flipping the comparison must fail a test.
- `lib/admin-guard.test.ts` — `requireAdmin()` with no session, with a
  non-admin session, and with an admin session; and that it reads the role from
  the database rather than from the session payload (a session claiming `admin`
  for a row that is not must be refused).
- `lib/admin-actions.test.ts` — each action: happy path, non-admin caller, self,
  last admin, and a target that does not exist. The non-admin case must assert
  that **no write occurred**, not merely that the result was `ok: false`.
- `app/rendering-mode.test.ts` — extend: `/yllapito` is dynamic.
- `components/account-menu.test.ts` — the link appears for an admin session and
  not for a reader's. The file must mock `@/lib/auth-client`, per the rule in
  `favourite-toggle.tsx`.

### Integration — `tests/integration/admin.test.ts` (new)

Against a real database, because the cascade is the thing being trusted:

- Deleting a user with a preference row, an avatar, two favourite teams and one
  favourite competition leaves **zero** rows in each of those tables for that id.
- The last-admin guard holds under two concurrent demotions — one succeeds, one
  is refused, and an admin still exists afterwards.
- A promoted user's `requireAdmin()` answers true on the next call with no
  session change.

### E2E — `tests/e2e/admin.spec.ts` (new)

- A signed-out visit to `/yllapito` is a 404.

Nothing further: the suite cannot forge a session, which is why
`favourite-actions.ts` notes the same limitation. Everything behind the gate is
covered by unit and integration tests instead, and an e2e test asserting that a
page a signed-out visitor cannot reach does not contain a string would prove
nothing — the defect class `skills/self-review.md` names first.

## Files To Update

- `specs/028-admin-tools-and-roles.md` — this file
- `src/db/schema.ts` — the `role` column
- `drizzle/migrations/` — the generated migration
- `src/lib/admin-role.ts` — the closed set and its parser, no database import
- `src/lib/admin-guard.ts` — `requireAdmin()`
- `src/lib/admin-actions.ts` — the three server actions
- `src/app/admin/page.tsx` — the page, reached at `/yllapito` through the
  rewrite in `next.config.ts`, with `/admin` redirecting to it like every other
  English folder path
- `src/proxy.ts` and `src/lib/admin-route.ts` — the early 404 for signed-out
  visitors, and its decision kept testable
- `src/components/admin-user-table.tsx` — the table and its controls
- `src/components/account-menu.tsx` — the conditional link
- `tests/unit/`, `tests/integration/admin.test.ts`, `tests/e2e/admin.spec.ts`
- `docs/setup/023-admin-access.md` — the one-time bootstrap SQL, and `docs/setup/README.md`
- `decisions/028-admin-tools-and-roles.md` — written during implementation

## Open Questions

None outstanding. The three this spec was drafted with were resolved before
implementation began, and are recorded here rather than deleted so the reasoning
survives.

1. **The path is `/yllapito`, rewritten to `/admin`.** Resolved from the
   codebase rather than by preference: `next.config.ts` maps Finnish sources to
   English destinations without exception — `/suosikit`→`/favorites`,
   `/asetukset`→`/settings`, `/kotimaa`→`/domestic`, `/maajoukkueet`→
   `/national-teams`. A new area that did not follow it would be the only one.

2. **A deleted user's session ends by cascade, and that is deliberate.** The
   `session` table declares `on delete cascade`, so removing the row removes
   their sessions and signs them out. This spec relies on it rather than issuing
   a separate revocation, and says so here so that a later change to that
   constraint is understood to break sign-out too. A *demoted* admin needs
   nothing equivalent: `requireAdmin()` reads the database, so the next request
   already sees the new role.

3. **The account menu links to it, for admins only.** Miikka's call. A link is
   not a security control and its absence is not one either — the gate is the
   control, and hiding the entrance from the two people who need it buys
   nothing. The conditional renders from the session the browser already has,
   the same way `FavouriteToggle` decides whether to render at all.
