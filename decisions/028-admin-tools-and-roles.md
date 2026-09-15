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

---

Below: the second pull request — the page, the management actions, and the one
thing that did not work the way the spec assumed.

## `notFound()` does not produce a 404, and the attempt to fix it was withdrawn

The spec chose 404 over 403 so the route would not confirm its own existence.
`notFound()` did not deliver it, and nor did the thing built to compensate.

`src/app/loading.tsx` puts every segment behind a Suspense boundary, so
responses stream and Next commits the status line before `notFound()` is
caught — its documentation states it outright ("200 for streamed responses, and
404 for non-streamed") and it is a long-standing open issue (vercel/next.js
#76474, #93239) with no per-route opt-out.

Measured on a production build: `/this-route-does-not-exist` answered 404 while
`/yllapito` answered **200**.

### The proxy, and why it is gone

`src/proxy.ts` rewrote cookie-less requests to a path that does not exist, so
Next produced the same response it gives any missing URL — verified
byte-identical, 404 and 11 540 bytes. It read the cookie only, so it cost no
query.

Review found it does nothing. `getSessionCookie` **parses** the cookie header
and returns the string; it does not validate anything. Measured:

| Request to `/yllapito` | |
|---|---|
| no cookie | 404, 11 540 B |
| `Cookie: better-auth.session_token=totally-made-up` | **200, 10 318 B** |

One invented header. The proxy stopped nobody who was actually probing, which is
the only person it existed to stop.

A second hole came with it: Next evaluates redirects before the proxy, so
`/admin` answered **308** while a missing English path answered 404 — the
redirect table confirmed the route independently.

I had written into the proxy's own comment that "a forged cookie buys only the
200 that every signed-in reader already gets". That 200 *is* the disclosure. The
sentence was a rationalisation, and it was in the file as justification.

### What was decided instead

Delete it. Miikka's call, on corrected information — my first presentation of
the options described the cookie check as closing "anonymous probing", which was
wrong, and overstated the alternative's cost as "a database read in front of
every request" when the matcher covered two paths nobody visits.

Closing it properly means validating the session in front of the route: a
Node-runtime proxy, or an internal call to the auth endpoint. Not worth it,
because **the obscurity was never the control**. `requireAdmin()` is, it reads
the database on every request, and it refuses regardless of what anyone knows
about the URL. Knowing the route exists gains an attacker one fact and nothing
else.

So: everyone refused gets the generic not-found page, with a 200 status. The
body gives nothing away. The status says the route is real, and that is written
down rather than papered over.

## The role rides on the session, for the menu link only

`getSessionExtrasFor` already selects from `user`, so carrying `role` is one
more column on a row being read anyway — no extra round trip, unlike the
favourites that share that payload.

It decides exactly one thing: whether the account menu offers `Ylläpito`. It is
stale from a role change until the session refreshes, which is tolerable for
whether a menu item renders and intolerable for whether a page opens. Only one
of those reads it.

## The last-admin guard locks the admin set, not the target row

The race is two admins acting on each other at once: both count two admins, both
proceed, and nobody is left. Locking only the target row does not stop it,
because the two transactions touch different rows.

`select 1 from "user" where role = 'admin' for update` locks the set, so the
second transaction waits and re-counts. A row becoming an admin concurrently is
not blocked and does not need to be — it can only make the count larger, which
refuses less often rather than more dangerously.

The integration test runs both demotions through `Promise.all` against a real
Postgres, because a mocked transaction cannot demonstrate a lock.

## The list pages rather than capping

The first version read the newest 500 and stopped. Review pointed out that this
makes the oldest accounts unmanageable with nobody told, so a Finnish notice was
added saying the list had been cut off — which made the limit visible without
removing it.

Miikka's call: "if listing more than 500 at a time is bad (i think it is) how
about paging or smthing." He is right on both halves — rendering 500 rows at
once is bad, and a bound that hides data is worse than a bound that pages
through it.

Fifty per page, the page in the URL as `?sivu=N`, so each page is linkable and
the back button works. Plain links rather than buttons, because the page is
server-rendered per request and a page change is a navigation.

Two queries: a `count(*)` and the page. The count buys the clamp — page nine of
four shows page four instead of an empty table — and the page total, so the
controls can say `Sivu 2 / 4` and the heading can count every user rather than
the fifty on screen.

The sort gained a second key. `created_at` is not unique, and without
`id desc` beside it two accounts created in the same millisecond could swap
between pages: one rendered twice, the other never reachable. That is the same
class of defect paging was introduced to remove, so it would have been a poor
thing to leave in.

`pageFrom` treats anything that is not a positive decimal integer as page one,
and is tested from both sides — `"0x10"`, `"1e3"`, `"2abc"`, a repeated
parameter arriving as an array. It reads a query string, which is
attacker-controlled.
