# 535 — The sign-in state is read on the first render, with no wait for hydration: decisions

Bug #535, 2026-10-09. The header read `useSession()` on its first render; the
favourite star and the team search waited for an effect first (`mounted`), to
avoid a hydration mismatch. One of the two had to be wrong.

This overrides what earlier records say about the wait. What they describe was
true when written and is not any more.

| Record | Overridden |
|---|---|
| `decisions/026-favourites.md` | "The star caused a real hydration mismatch"; "`mounted`" under its moved comments; the mutation "Removing the mount gate" |
| `decisions/027-team-search.md` | "`mounted`" under its moved comments; "returning null before hydration" in the no-JavaScript test's entry, where the server has no session to render the search for |

## The cause, and where it went

`useSession()` is `useSyncExternalStore` over better-auth's session store. What
React hydrates with is the third argument, the server snapshot.

| better-auth | Server snapshot | Hydrating while the browser already holds a session |
|---|---|---|
| 1.7.3 to 1.7.5 | the store's current value | renders the signed-in tree against signed-out HTML |
| 1.7.6 and later | the store's initial value: no session, pending | renders the signed-out tree, then again with the session |

The star was built on 1.7.3, so its mismatch was real. `main` has had 1.7.6
since 2026-09-28 and 1.7.7 since 2026-10-04, compared file by file from the
published packages: `dist/client/react/react-store.mjs` is where they differ.

The browser holds a session at hydration only when something hydrated earlier
has already fetched it. The header in the root layout is the first thing to
hydrate, so it never met the case; a star in a part of the page that streams in
later did.

## Measured in a browser

Chromium against `next dev`, signed in with a start page and one favourite,
three loads each. Hydration messages were collected from the console.

Hard loads of `/kotimaa/sarjataulukko`, `/kotimaa`, `/ulkomaat/ottelut`,
`/?valitse=1` and `/suosikit`: no message in any of 45 loads, with the wait and
without it, and with the 1.7.5 snapshot patched back in. `Etusivu` is `/` in
the server's HTML and `/?valitse=1` once the session has arrived. None of
these pages delivers a part late enough to meet the case.

So a temporary page was built that does: a `Suspense` boundary resolving after
2.5 s, holding a second `SiteHeader` and a star, by which time the layout's
header has the session.

| Snapshot | `mounted` wait | Result |
|---|---|---|
| 1.7.5 | in the star and search, as on `main` | attribute mismatch on the header's link, "won't be patched up": `Etusivu` stays `/` |
| 1.7.5 | removed | "Hydration failed", the tree regenerated on the client |
| 1.7.7 | as on `main` | clean; `Etusivu` is `/?valitse=1` |
| 1.7.7 | removed | clean; `Etusivu` is `/?valitse=1` |

The first row is the issue's suspicion, exactly: a header that reads a cached
session while hydrating keeps a link that sends the reader back to their
region. It needed the old snapshot and a header that hydrates late, and the
application has neither.

## The fix

The wait is removed from the star and the team search. All three read
`useSession()` directly, which is the one behaviour the issue asked for.

| Considered | Why not |
|---|---|
| A shared hook that waits, used by all three | a second guard beside the library's own, costing every star an extra render, for a case that no longer occurs |
| Leave the wait where it is | two behaviours for one read, and a comment that says something untrue |

## What holds it

`tests/unit/components/session-hydration.test.tsx` uses the real
`@/lib/auth-client`: it renders the header and a star to HTML with no session,
gives the client a session, then hydrates and expects no recoverable error, no
console error, the link at `/?valitse=1`, the search and the star. With the
1.7.5 snapshot patched into `node_modules` it fails, with the wait restored as
well as without. A better-auth release that changed the snapshot back would
fail it on Renovate's pull request.

On 1.7.7 that test passes with the wait restored too, because there is then no
fault for it to find. What holds "no wait" is a test each in
`favourite-toggle.test.tsx` and `team-search.test.tsx`: rendered to a string,
which runs no effects, a signed-in reader gets the star and the search field.
Both fail with the wait restored. Sourcery raised the gap on the first review.

It is the one test that renders these components without mocking
`@/lib/auth-client`. The reason the others mock it still stands
(`decisions/026-favourites.md`: the client's cleanup runs some time after the
last unsubscribe and needs a `window`), so this test runs that cleanup itself.
It unmounts both of its subscribers inside the test, on fake timers, and runs
the pending timer: measured, one timer, which removes the client's `storage`,
`online` and `offline` listeners. Doing it in `afterAll` would be too late,
because `vitest.setup.ts` unmounts everything Testing Library rendered after
each test, on the real clock.

## Not shown by a test

No e2e test was added. On the application's real pages the mismatch does not
occur even with the old snapshot and no wait, so a browser test on them would
pass with the fault present.
