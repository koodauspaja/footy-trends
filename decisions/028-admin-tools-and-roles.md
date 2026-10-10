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

## Moved from comments, 2026-10-05

Cut from `src/lib/admin-users.ts` at `55a14fc` by #531.

- **Module.** Apart from `admin-actions.ts` so the rules are tested without a
  `"use server"` boundary. The acting admin's id is a parameter, so a caller that
  skipped the gate cannot spoof it.
- **`listUsers`.** Newest first, as the list's usual question is "who is new".
  It replaced a hard cap of 500 that made the oldest accounts unreachable.
- **`withAdminsLocked`.** Locking the admin set, not the target row, makes the
  second of two demotions wait and re-count. A row becoming admin meanwhile only
  raises the count, which refuses less often, never more dangerously.
- **`guardedWrite`.** Both writes had it verbatim (Sonar: 18.1% duplicated
  lines), and a guard written twice eventually differs.
- **`changeRole`.** An admin who wants to leave is removed by another.
- **`deleteUser`.** Avatar bytes live in Postgres, so the cascade covers them;
  sign-out through the cascade, not a separate revocation, is relied on.

## Moved from comments, 2026-10-06

Cut from `src/db/schema.ts` at `a86c1cb` by #531.

- **`user.role`.** `text` and not a Postgres enum: adding a value to an enum is
  a migration that takes a lock, and the set is validated by `admin-role.ts`,
  the shape `favourite-keys.ts` uses for its own small closed set. Defaulted
  and not null, so every existing row became a reader without a backfill, and
  a row inserted by better-auth's sign-up path, which knows nothing about the
  column, gets the safe value and not a null nobody checks for. There is no
  bootstrap path in the app: the first admin is made by one documented
  `UPDATE`, in `docs/setup/023-admin-access.md`.

Cut from `src/components/account-menu.tsx` at `94397a8` by #531.

- **`AccountMenu`'s `isAdmin`.** Nothing is reachable by finding the URL.
  Anyone refused, a stranger or a demoted admin whose session still says
  otherwise, gets the generic not-found page with a 200 status, because Next
  cannot change a status a stream has already committed.

Cut from `src/lib/preferences.ts` at `ef7eb13` by #531.

- **`role` in the session.** It costs nothing to carry: the query already
  selects from `user`, so it is one more column on a row being read anyway.
  Nothing decides access from it. A session is issued once, so the value can
  be stale for as long as the session lives; that is tolerable for whether a
  menu item renders and intolerable for whether a page opens, which is why
  `requireAdmin()` reads the column from the database on every request.

Cut from `src/lib/session-extras.ts` at `ef7eb13` by #531.

- **`isAdminSession`.** It reads a value the session was issued with, so it
  is stale from the moment a role changes until that session is refreshed.
  `requireAdmin()` reads the column from the database on every request and is
  what refuses: a demoted admin following a link they can still see gets a
  404, which is why hiding the link is a convenience and not a control.
  `isAdmin` takes `unknown` and answers false for anything that is not
  exactly the admin role, so an unusable payload renders no link and does not
  throw.

Cut from `src/lib/admin-guard.ts` at `dc74e3e` by #531.

- **`admin-guard.ts`.** The page, every server action and the forced refresh
  built on top all go through it. One function so that it cannot be
  half-applied: the reasoning behind `currentUserId`, which was written three
  times identically before it was shared.
- **`requireAdmin` reads the database.** A session is client-held and issued
  once; a role copied into it would keep answering `admin` until that session
  expired, so a demotion would not take effect until the demoted admin
  happened to sign out. Reading the row costs one indexed lookup by primary
  key and makes the answer current by construction.
- **`requireAdmin` returns null.** The page answers a non-admin with the
  not-found page, and a thrown error there would be a 500, which both tells a
  stranger that something exists and reports our refusal as our failure.
  Callers decide what refusal looks like. The refusal carries a 200 and not a
  404, because a streamed response commits its status before `notFound()` is
  caught; the spec records why that is accepted. Signed out and signed in
  without the role are indistinguishable so that no caller can leak the
  difference.
- **`currentUserId` inside the `try`.** It reads the session through
  better-auth, which queries Postgres, so it fails for exactly the reasons
  the lookup does. Left outside, a session-read failure threw a 500 where the
  contract is to refuse.

Cut from `src/app/admin/page.tsx` at `dc74e3e` by #531.

- **`/yllapito` is dynamic.** A build artefact of the page would contain
  every user's email address.
- **The refusal on `/yllapito`.** A 403 says "this exists and you may not
  have it", a fact a stranger has no use for. Everyone refused gets the same
  generic page: no admin markup, no admin title, nothing in the body that
  distinguishes it from any other missing URL. The status is 200 and not 404
  as a framework limit: `src/app/loading.tsx` puts every segment behind a
  Suspense boundary, so the response streams and Next commits the status line
  before `notFound()` is caught; its documentation says "200 for streamed
  responses, and 404 for non-streamed". So the route is identifiable as real
  by status alone. A proxy was built to close that and deleted again: it
  could only read the session cookie, not validate it, so
  `Cookie: better-auth.session_token=x` walked straight through, 200 against
  the 404 an absent cookie got. Machinery whose stated purpose it does not
  achieve is worse than none. What refuses is `requireAdmin()`, here and on
  every action; the route being discoverable costs an attacker one fact and
  gains them nothing.

Cut from `src/lib/admin-user-view.ts` at `dc74e3e` by #531.

- **`admin-user-view.ts`.** The same boundary as `favourite-keys.ts` and
  `avatar-limits.ts`, for the same reason: `admin-users.ts` opens `@/db`.
  Keeping the type and the refusal vocabulary apart means the browser bundle
  never reaches the query layer to learn what a row looks like.
- **`USERS_PER_PAGE`.** It replaced a hard cap of 500. The cap kept the
  render bounded but made the oldest accounts unreachable once it was hit,
  and a notice saying so only made that visible. Fifty is a screenful with
  scrolling and keeps the query small; the number is a judgement, not a
  measurement, and changing it changes nothing else.
- **`pageFrom`.** The parameter is attacker-controlled and arrives as a
  string: `"0"`, `"-3"`, `"2abc"`, `"1e3"`, an array from a repeated
  parameter, `undefined`. `Number()` alone would accept several of those,
  `Number("0x10")` is 16, which is the parser class `skills/self-review.md`
  names.
- **`isAdminRole`.** `isAdmin(entry.role)` would invite being read as "is
  this entry an admin object".

Cut from `src/lib/admin-role.ts` at `ef99862` by #531.

- **`admin-role.ts`.** The exclusion is the same one at the top of
  `favourite-keys.ts`, `regions.ts` and `avatar-limits.ts`, and load-bearing
  for the same reason: the account menu decides whether to render the
  `Ylläpito` link, and the account menu is in the browser bundle. Importing
  `admin-guard.ts` there would pull the database in with it.
- **`isAdmin`.** The value arrives from a database column typed `text` and
  from session payloads the client cannot vouch for, so the check that it is
  a role at all belongs in one place and not at each call site, where one of
  them would eventually skip it. An unknown string, a different case, `null`,
  `undefined`, a number: all not admin. The failure direction matters more
  here than anywhere else in the app, so it is closed by construction and
  not by enumerating what to reject.

Cut from `src/components/admin-user-table.tsx` at `ef99862` by #531.

- **`admin-user-table.tsx`.** A client component because every control is
  interactive and a deletion asks first. The boundary is the one
  `avatar-limits.ts` and `favourite-keys.ts` exist for: this is a browser
  bundle.
- **The empty user list.** An early return for the empty case dropped the
  heading and the count. In practice an admin is reading the page, so there
  is always at least one user; the branch exists because "the query answered
  nothing" and "the table is empty" must not be the same rendering.
- **An admin's own row.** Offering a button whose only outcome is a refusal
  is a worse answer than not offering it.

Cut from `src/lib/admin-actions.ts` at `48ebab4` by #531.

- **`admin-actions.ts`.** A server action is a public network endpoint
  whether or not anything renders a control for it, so neither the missing
  menu link nor the page's not-found answer keeps a caller out; only the
  gate does. `favourite-actions.ts` follows the same rule about the acting
  user's id.

## Moved from comments, 2026-10-07

Cut from `tests/integration/admin.test.ts` at `79f2c6a` by #531.

- **What `admin.test.ts` can show and a mock cannot.** The acceptance
  criterion says to verify the cascade by querying each table, and a mocked
  transaction cannot demonstrate two demotions running at once. An earlier
  version of the concurrent test passed `READER_ID` as the actor for both
  calls, so neither was an admin acting and the test passed without
  exercising what it described: `changeRole` does not check the actor's
  role, because `requireAdmin()` does that a layer up. The race between
  count and page is inherent to reading a live table and harmless for a list
  refetched on every request, but the test must not claim otherwise.

## Moved from comments, 2026-10-08

Cut from `tests/unit/lib/admin-users.test.ts` at `ec04260` by #531.

- **The sort-key assertion in `admin-users.test.ts`.** Demonstrating the
  page-boundary fault needs fifty-one accounts sharing a timestamp. Removing
  the second key survived every other test in the file, which is why the
  check exists and was not left to review.
