# 028 — Admin tools and role-based user management: decisions

Implementation notes for #119, spec `specs/028-admin-tools-and-roles.md`.
Written as the work happens; this covers the first of two pull requests — the
role and the gate. The page and the management actions follow, and their
decisions land here too.

## The role is a column, not configuration

The obvious cheap answer was an `AUTH_ADMIN_EMAILS` variable mirroring
`sign-in-allowlist.ts` from #314. It was proposed and rejected, and the reason is
worth keeping: **an admin has to be able to change who is an admin from inside
the app, and a variable cannot be written to.** Railway also redeploys the
service whenever a variable changes, which would make "promote Kalle" a
deployment.

The allowlist stays where it belongs. Who may *sign in to staging* is a fact
about an environment, so it is configuration. Who is an admin is a fact about a
person, changes without a deploy, and is edited by the app — so it is a column.

`text` rather than a Postgres enum: adding a value to an enum is a migration
that takes a lock, and `favourite-keys.ts` already establishes validating a small
closed set in TypeScript. The set has two values and a third is a design
question, not a column change.

Defaulted and `not null`, so every account that already existed became a reader
when the migration ran — no backfill — and so a row inserted by better-auth's
sign-up path, which knows nothing about this column, gets the safe value rather
than a null nobody checks for.

## The gate reads the database, never the session

`requireAdmin()` fetches the role by primary key on every call.

Copying the role into the session would have been one fewer query, and wrong: a
session is client-held and issued once, so a demoted admin would keep answering
`admin` until their session expired. Revocation that takes effect "eventually"
is not revocation. One indexed lookup buys an answer that is current by
construction.

## It returns null rather than throwing

`requireAdmin()` answers `string | null`, not a thrown error.

The page must respond **404** to a non-admin, and a throw inside a server
component is a 500 — which both tells a stranger that something is there and
reports a refusal as a failure. Returning null lets each caller decide what
refusal looks like, while this function decides only whether to refuse.

Signed-out and signed-in-without-the-role both answer `null`, deliberately
indistinguishable, so no caller can leak the difference between "no account" and
"not permitted".

## A database failure refuses

The `catch` logs and returns `null`.

The alternative — treating an unreadable role as "carry on" — would mean an
outage opens the admin area. Refusing means an outage closes it, which is the
direction to fail in when the question is authorisation. This is the one
decision here that a reviewer should push back on if they disagree, because it
is a deliberate choice to be unavailable rather than permissive.

## There is no bootstrap path in the app

The first admin is made by one `UPDATE`, documented in
`docs/setup/023-admin-access.md`.

Every automatic rule considered — first account to sign in becomes admin, an
address is admin if it has no role yet, grant when the table is empty — exists
forever in order to serve a single moment, and each is a way to grant admin by
accident later: an empty table after a data incident, a first sign-in that is
not who you expected, a value copied into the wrong environment. A manual step
run once cannot misfire twice.

## Deletion will be the database's cascade

Not implemented in this pull request, but decided now because it shaped the
scope: all six tables referencing `user` already declare `on delete cascade` —
`session`, `account`, `user_preferences`, `user_avatar`, `favorite_team`,
`favorite_competition` — and avatar bytes live in Postgres rather than on a
volume. So one `DELETE` removes everything a reader owns, with no second code
path to forget, which is what `user_avatar`'s own comment says the cascade is
for.

Checked rather than assumed: the constraints were read out of `schema.ts` before
the acceptance criteria were written, and the integration test will verify each
table rather than trusting the cascade.

A deleted user's sessions disappear with it, so deletion signs them out as a
side effect rather than by a separate revocation. That is relied on
deliberately, and is recorded here so a later change to that constraint is
understood to break sign-out too.

## Delivered as two pull requests, one spec

The spec stays whole. The role model, the gate reading from the database, and
the page's 404 are one security story, and splitting them across two documents
would mean keeping two documents true — the failure mode that produced fifteen
review findings on #368 the same day.

Only the delivery splits: this pull request is the role and the gate, with no
user-visible surface, which unblocks #150's forced TASO re-sync without it
waiting on a user-management page it has no interest in.
