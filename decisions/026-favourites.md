# 026 — Suosikit: decisions

Implementation notes for `specs/026-favourites.md` (#118). What changed while
building, and why — the spec's own decisions are recorded there and not repeated
here.

## What the spec got wrong, found while building

### The star caused a real hydration mismatch

The toggle renders on pages that are server-rendered, four of them prerendered
(#182). On the server there is no session, so it renders nothing. better-auth's
browser client can answer from its own cache on the **first** client render — so
the client rendered a `<button>` where the HTML had none. React reported a
hydration mismatch and recovered the only way it can: by throwing the server's
markup away and re-rendering.

Nothing failed. Every unit test passed, every e2e assertion passed, and the page
looked correct. It surfaced only as a warning in the dev server's output during
an e2e run, which is the sort of thing that is easy to scroll past.

`isPending` is not the fix, and this is worth writing down because it looks like
it: a cached session is not pending. The only state that is false during server
rendering *by construction* is "mounted", so the star is gated on an effect.
`renderToStaticMarkup` asserts it in a unit test — the component returns the
empty string even for a signed-in reader — and that test fails when the gate is
removed.

### The English path had no redirect

`next.config.ts` gained the `/suosikit` → `/favorites` rewrite but not the
matching `/favorites` → `/suosikit` redirect that every other page pair has. The
e2e suite found it: `/favorites` answered 200 at its own URL, which is exactly
the split-brain the redirect table exists to prevent.

### The actions module broke 114 tests that have nothing to do with it

Caught by CI, not by me: **the unit job has no environment at all**, deliberately
(#158), and my machine has a `.env`. Locally all 1885 tests passed; in CI eight
test files failed to import at all, and `favourite-actions.ts` was in every stack
trace.

`@/lib/auth` constructs better-auth at module scope and throws without
`BETTER_AUTH_SECRET`. A `"use server"` module is imported *by name* from client
components — Next replaces it with a network stub at build, so production never
evaluates that chain in a browser and never noticed. Any environment without the
transform does. specs/026 is simply the first feature whose toggle renders inside
`standings-table` and the region picker, so the server chain reached
`app/domestic/page`, `app/foreign/page`, `app/national-teams/pages`, three
standings pages, a team page and `standings-table` itself.

The fix is not eight `vi.mock` lines. That would be a guard per call site, and
the ninth test to render a standings table would fail the same way with nothing
to explain it. `currentUserId` had also been written **three times** — in
`settings-actions.ts`, `avatar-actions.ts` and `favourite-actions.ts` — which is
the same "three copies of a rule" that produced `session-extras.ts`.

`src/lib/current-user.ts` now holds both: one `currentUserId`, and `@/lib/auth`
imported lazily so that no module a client component can import constructs
better-auth by being imported. All three action modules use it, so the two that
were only *latently* broken are fixed too.

`tests/unit/lib/current-user.test.ts` asserts the invariant directly — with the
auth variables unset and **`@/lib/auth` deliberately not mocked**, since mocking
it is exactly what would hide this. It fails if anyone restores a static
`import { auth }`, which is the mutation that was run to prove it.

### And then a flake: a session subscription outliving its jsdom

The same CI run showed a second, subtler failure — one that had *passed* in the
sibling job, which is what makes it worth writing down. All 1889 tests passed and
the run still exited non-zero:

```
ReferenceError: window is not defined
  at cleanupBroadcastSetup (better-auth/dist/client/broadcast-channel.mjs)
  at Timeout._onTimeout (nanostores/lifecycle/index.js)
This error originated in "tests/unit/app/foreign/team/[id]/page.test.tsx"
```

That file has nothing to do with favourites. better-auth's client opens a
broadcast channel when `useSession` subscribes, and nanostores runs its cleanup a
second *after* the last unsubscribe — so React unmounts the star at the end of a
test, the file finishes, vitest tears down its jsdom, and the timer then fires
into whatever file happens to be running. It lands somewhere different each run,
which is why one CI job saw it and the other did not, and why it does not
reproduce locally on a faster machine.

The eight files whose import graph contains the toggle now mock
`@/lib/auth-client`. Signed out is what they already assumed; saying so
explicitly just avoids starting the timer. The requirement is written at the top
of `favourite-toggle.tsx`, where someone adding the ninth will be reading.

### Two copies of the id rule

`parseTeamKey` and the two team actions each validated the provider id, both with
`Number.isSafeInteger` — which accepts 9 007 199 254 740 991, a value the `int4`
column cannot store. The row would have failed at the driver and reached the
reader as "something went wrong" rather than "that is not an id", and `taso.ts`
already had the correct bound in `parseProviderId`.

One `isTeamProviderId` in `favourite-keys.ts` now decides it, used by the parser
and both actions. This is the class `skills/self-review.md` calls *a guard
covering the named line*, caught by that pass rather than by review.

## Decisions taken while building

| Decision | Choice | Why |
|---|---|---|
| Where the toggle reads its state | `favouriteKeysOf(session, kind)` in `session-extras.ts` | The spec promised "one `useFavourites()` hook". A hook was the wrong shape — the component already holds the session — but the *point* of the promise was one swap point, and this is it. If the payload ever measures heavy, it fetches here and no caller changes. |
| What a client component may import | `favourite-keys.ts`, never `favourites.ts` | The same boundary `avatar-limits.ts` exists for, learned expensively in #268: the toggle is in the browser bundle, and `favourites.ts` reaches `@/db`. |
| The star's position in the picker | Beside the link, not inside it | A `<button>` inside an `<a>` is invalid HTML, and clicking it would navigate as well as toggle. |
| Team names | Resolved from stored matches on read, never stored on the row | A club that renamed would otherwise show its old name until someone re-favourited it — and #254 exists precisely because a renamed club must be told apart from one that does not exist. |
| The count in the cap check | After the delete, not before | Checking first would strand a reader at fifty with no way down: they could not remove a favourite because they had too many. |
| Reaching better-auth from an action | `currentUserId()` / `authApi()` in `current-user.ts`, importing `@/lib/auth` lazily | A module a client component can import must not construct better-auth by being imported. Production hides this behind Next's transform; every other environment sees it. |
| `revalidatePath` | Both `/suosikit` and `/favorites` | #292 established the reader's URL is what matters; the folder path is revalidated beside it because this page answers under both spellings and the extra call costs nothing. It cannot be exercised end to end — the action needs a real session. |
| A retired competition, a nameless team | Kept and reported, never hidden | A row nobody can see is a row nobody can remove. Both render with their `Poista suosikeista` button. |

## What review found, and it was right twice

Sourcery raised three; two were real bugs and are fixed here.

**A national side linked to a club page.** `CompetitionStandingsPage` renders
both `/ulkomaat` and `/maajoukkueet`, so both put a star on their rows — and both
store `football-data:<id>`. `/suosikit` then sent every one of them to
`/ulkomaat/joukkue/:id`. The provider cannot decide the region, so
`resolveTeamNames` now reads each team's `competition_code` from its stored
matches and maps it through the registry (`regionOfCompetition`). A code the
registry no longer has yields no region, which renders as the team's name
unlinked — which turned out to expose a third case the component did not have:
it was saying `Joukkuetta ei löytynyt.` about a team it had just named.

**The cap had a race.** Counting and then inserting is two statements: at
forty-nine, two tabs both read forty-nine and both insert, and the unique index
does not object because they are different teams. Read Committed does not help —
each statement takes its own snapshot, so a conditional insert races identically.
The toggle now runs in a transaction holding `for update` on the reader's own
`user` row, which serialises that reader's writes and nobody else's. Proven
against real Postgres by starting both toggles before awaiting either: with the
lock, fifty rows and one `limit` refusal; without it, fifty-one.

**The lock then changed what a double toggle does, which review also caught.**
Before it, two tabs toggling the same absent team both found nothing to delete
and both inserted, and the unique index turned the second into a no-op — so it
ended favourited *by accident*. Serialised, it flips twice and ends where it
started, which is what a toggle means. The comment claiming the no-op was the
intended behaviour is now a comment saying what actually happens, and
`tests/integration/favourites.test.ts` asserts it against real Postgres. The
`onConflictDoNothing` stays, unreachable through this path, so that a future
caller writing outside the lock degrades to a no-op rather than an error.

Two comments elsewhere had also become false and were corrected: `auth.ts` still
claimed the session extras cost one query, when the favourites add two. It now
carries the measured cost instead.

**A removal on `/suosikit` left every other star stale.** The toggle refetches
the session after a write; the favourites page did not, so removing a team there
and following a client-side link to its page showed a filled star for a favourite
that no longer existed. Both write paths now refetch, and the page's test asserts
it happens on success and *not* on failure.

**A third round found three more, all real.** The star's local answer was never
handed back, so it outranked the session for as long as the component stayed
mounted and a change made in another tab would never appear. It is now cleared by
an effect — but **only once the session agrees**, because dropping it while the
session still disagrees would show an empty star for a favourite the reader just
added, which is the failure the local answer exists to prevent. Both directions
are mutation-tested.

The resolved name was also nondeterministic: `select distinct` over unordered
rows, filled into a `Map`, gives whichever name the planner returned last — so a
renamed club could show either. It is now `distinct on` with
`order by kickoff_at desc`, four queries (each side of each provider) each
returning at most one row per team, merged by date. **Only a real database can
check that**, since a mock returns the rows it was handed whatever the SQL says,
so the proof is an integration test — and deleting the `desc` fails it.

And the page rendered in query order while the spec promised registry order for
competitions and alphabetical for teams. Both are now sorted, retired
competitions and nameless teams last.

**One of those tests proved nothing when first written**, and the mutation is what
said so: sorting `Ilves, Zurich, Äänekoski` gives the same answer with a plain
`<` as with the Finnish collation. The fixture is now `Ilves, ÅIFK, Ähtäri` —
the Finnish alphabet ends Z, Å, Ä, Ö while UTF-16 puts Ä before Å, so only
`localeCompare(…, "fi")` passes it.

**Three findings were wrong, and the code says why.** 1. That `getSessionExtrasFor` returns early for a reader with no preferences row,
   hiding their favourites. It selects **from `user`** with left joins, so that
   early return means "no such user", not "no preferences" —
   `tests/integration/favourites.test.ts` already asserts both lists arrive for a
   reader who has never saved a setting.
2. That returning `favorite: true` after `onConflictDoNothing` lies when the
   insert conflicted. `favorite` answers "is it one now", not "did this statement
   insert" — after a conflict the row exists, so `true` is the true answer, and
   it is what the star renders. The type now says so, because a careful reader
   misreading it is evidence the comment was not carrying its weight.
3. That `taso.ts`'s `parseProviderId` does not enforce the `int4` bound the
   comment credits it with. It does, through `optionalNumber`, which rejects
   anything outside `INT4_MIN..INT4_MAX` before the positivity check.

## Measurements

Numbers in the spec that were measured rather than estimated, recorded here so
the next person can re-run them rather than trust them.

| What | Method | Result |
|---|---|---|
| Session payload at the cap | Fifty of each written to a real Postgres with the longest keys the app produces, then `getSessionExtrasFor` and `JSON.stringify` | **2326 bytes**, 334 gzipped |
| Session read at the cap | `performance.now()` around the same call | **15.1 ms**, against 2.6 ms with nothing stored |
| Stars on a standings page | Probed `/kotimaa/sarjataulukko` in a real browser with an intercepted session | 24 rows, 24 stars, 12 distinct teams — a Veikkausliiga season splits into a runkosarja and two jatkosarjat, so a club really does appear in two tables |
| Prerendering | `npm run build` route table | `/`, `/domestic`, `/foreign`, `/national-teams` still `○ (Static)`; `/favorites` `ƒ (Dynamic)` |

The payload answer settles the spec's first open question: 334 bytes on the wire,
on a request the browser already makes, so the list ships whole and no
fetch-on-demand path was built.

## Tests worth explaining

**Every new test was mutation-checked** — the behaviour it names broken, the test
watched to fail, the code restored. Twenty-seven mutations across five files: five on `favourites.ts`, six on the actions, seven on the toggle, five on the favourites page, four on the key rules. Two
of them changed the work:

- Removing the mount gate proved the hydration test; without the mutation the
  `renderToStaticMarkup` assertion could have passed for the wrong reason.
- Reordering the cap check ahead of the delete proved that "a reader at the cap
  can still remove one" was a real behaviour and not an accident of the mock.

Two tests were wrong when first written, both found by running them rather than
reading them:

- The unique-label assertion on a standings page failed against real data,
  because a club appears in two of Veikkausliiga's three tables. The assertion
  was wrong, not the page; it is now scoped to one table.
- Two "clears the old notice" tests were flaky. The notice renders from *inside*
  the transition, so it appears while the button is still disabled — the second
  click did nothing at all. Both now wait for the control to be enabled, which is
  also a fact about the UI worth knowing.

The signed-out e2e assertions wait for the signed-out header before asserting no
stars are present. Without that wait they would pass on any page that has not
hydrated yet, which is the "test that proves nothing" class exactly.

## Known limit

A write cannot be driven end to end. The server action reads a real cookie and
sees none, so the e2e suite covers what is *rendered* for a signed-in reader —
which the intercepted session does reach, unlike `/asetukset` — and the writes
are covered by unit and integration tests. The round trip stays a human check on
staging, the same gap specs/023 and specs/025 document.

## Moved from comments, 2026-10-05

Cut from `src/lib/favourites.ts` at `55a14fc` by #531.

- **Module.** One table with a `kind` would need four nullable columns and a rule
  about which pair is legal.
- **`withUserLocked`.** The unique index does not object to two different
  favourites, and under Read Committed each statement takes its own snapshot.
- **`toggleFavouriteTeam`.** A toggle, so the client never picks add or remove
  from state it may have wrong. The button is disabled in flight, so a double
  flip needs two tabs.
- **`favouritesForSession`.** It runs in better-auth's `customSession` on every
  `/api/auth/get-session`: missing stars cost less than a missing header.
- **`regionFor`.** For TASO, `/maajoukkueet/joukkue/[id]` is football-data's page
  and `/kotimaa/joukkue/[id]` is scoped to the domestic bucket, so neither finds
  a national-team id.
- **`resolveTeamNames`.** Not stored on the row, or a renamed club keeps its old
  name until re-favourited (pull request #254 rests on telling it from one that
  does not exist). Unscoped by region, as `specs/022` has a team span
  competitions: fifty ids in one `IN` beat fifty guesses. `distinct on`, as
  unordered rows show whichever name the planner returned last.

## Moved from comments, 2026-10-06

Cut from `src/lib/auth.ts` at `a86c1cb` by #531.

- **The favourites in `customSession`.** The toggle renders on the region
  picker, which lives on the four prerendered pages, so it cannot read a
  session on the server at all. The cost, since this runs on every
  `/api/auth/get-session`: the region and the avatar version come from one
  query, a left join from `user`; the favourites are two more, in parallel,
  because they are one-to-many and joining them would multiply the row out.
  Measured with both caps filled: 15.1 ms against 2.6 ms with nothing stored,
  and 2326 bytes of payload (334 gzipped).

Cut from `src/db/schema.ts` at `a86c1cb` by #531.

- **`favoriteTeam`.** A team page spans competitions and seasons, so a
  favourite follows the club and not one of its league entries. The source is
  half the identity because the two providers' id spaces are independent: 317
  exists in both.
- **`favoriteCompetition`.** A team is a provider and a number, a competition a
  region and a code. One table holding both would need four nullable columns
  plus a constraint saying which pair is legal: a check where a type will do.

Cut from `src/lib/competitions.ts` at `94397a8` by #531.

- **`regionOfCompetition`.** A favourite carries `(source, teamProviderId)` and
  no region, so the only way to know whether a football-data team is a club
  or a national side is the competition its stored matches were played in.

Cut from `src/components/account-menu.tsx` at `94397a8` by #531.

- **`Suosikit` in the account menu.** Above `Asetukset`, so the one the reader
  opens most is first.

Cut from `src/components/favourite-toggle.tsx` at `94397a8` by #531.

- **`FavouriteToggle`, one component.** It renders in a standings row, on a
  team page, on a competition page and in the region picker, and the picker
  lives on the four pages `tests/unit/app/rendering-mode.test.ts` keeps
  prerendered. A server-rendered variant would cost those pages their
  prerendering, and there would be two versions to keep in step. It imports
  `favourite-keys.ts` and not `favourites.ts`, which reaches the database: the
  boundary `avatar-limits.ts` exists for.
- **Why a test must mock `@/lib/auth-client`.** The real client opens a
  broadcast channel whose nanostores cleanup runs a second after the last
  unsubscribe, by which point the file's jsdom is gone. It then throws
  `window is not defined` as an uncaught exception inside whichever file is
  running, a flake with no relation to the file that caused it.
- **`own`.** The session is refetched after a write, but not instantly, and a
  star that springs back for a moment reads as a failure. Local state answers
  until the session catches up; the session is the truth on every other
  render.
- **`mounted`.** Not cosmetic. Every page this appears on is server-rendered,
  four of them prerendered, where there is no session and the star is
  nothing. better-auth's client can answer from its cache on the first client
  render, a real hydration mismatch that React recovers from by throwing the
  server's markup away. `isPending` is not enough: a cached session is not
  pending. Mounting is the only state false during server rendering by
  construction.
- **Handing the state back.** Kept past the refetch, the local answer would
  outrank the session for as long as the component stays mounted, so a change
  made in another tab would never appear. Only when they agree: dropping it
  while the session still disagrees would show an empty star for a favourite
  the reader just added.

Cut from `src/lib/preferences.ts` at `ef7eb13` by #531.

- **`favoriteTeams` in the session.** The toggle renders on the region
  picker, which lives on the four pages `rendering-mode.test.ts` keeps
  prerendered, and reading a session on the server there would cost them
  that. The browser already fetches this payload, so a client toggle costs no
  extra request.
- **The favourites' own query.** A reader with 20 teams and 5 competitions
  would fetch 100 rows to learn one region if the two relations were joined
  onto the session row. Two small indexed queries beat that.

Cut from `src/lib/session-extras.ts` at `ef7eb13` by #531.

- **`favouriteKeysOf`.** Being the single reader keeps the choice reversible:
  the whole list is sent because it rides free on a request the browser
  already makes, and if it measures heavy at the cap, this function fetches
  instead and no caller changes. A missing star is a smaller loss than a page
  that will not render.

Cut from `src/lib/favourite-keys.ts` at `dc74e3e` by #531.

- **`favourite-keys.ts`.** The exclusion is the same one at the top of
  `regions.ts` and `avatar-limits.ts`, and it is load-bearing here: the
  toggle renders on the region picker, which lives on the four pages
  `tests/unit/app/rendering-mode.test.ts` keeps prerendered. Anything it
  imports is in the browser bundle.
- **`MAX_FAVOURITES_PER_KIND`.** Fifty is a judgement, not a measurement:
  enough that nobody sensible meets it, small enough to bound both the
  `/suosikit` query and the session payload the list rides on. It is one
  constant so that measuring can change it.
- **`isTeamProviderId`.** Shared and not repeated: `parseTeamKey` reads ids
  out of the session and the server actions read them off the wire, and two
  copies of the rule are how they drift.
- **`teamKey`.** `"taso:60731"` is one `includes` against a list; a
  `{ source, id }` object would be a `find` with two fields at every call
  site, and the session payload would carry the key names on every entry.
- **`parseTeamKey`.** The client cannot vouch for the payload, and a
  malformed key must render nothing and not a link to a team that does not
  exist.

Cut from `src/lib/current-user.ts` at `dc74e3e` by #531.

- **`getAuthInstance`'s dynamic import.** `@/lib/auth` constructs
  better-auth at module scope, and that constructor requires
  `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`. A `"use server"` module is
  imported by name from client components: Next replaces it with a network
  stub at build time, so production never evaluates this chain in a browser
  and never noticed. Any environment without that transform does, and the CI
  unit job has no environment at all, deliberately. The toggle renders inside
  `standings-table` and the region picker, so importing the actions module
  statically put better-auth in the import graph of eight test files that
  have nothing to do with authentication, and 114 tests failed in CI while
  passing locally, where a `.env` happens to exist.
- **`currentUserId` is shared.** It was written three times, identically, in
  `settings-actions.ts`, `avatar-actions.ts` and `favourite-actions.ts`.
  Three copies of the rule that no action takes a user id from its caller is
  how one of them ends up not following it, the reasoning that produced
  `session-extras.ts`. Reading the id from the session removes "do this for
  someone else" as a category where a check would only look for it, and one
  function cannot be half-applied.

Cut from `src/components/standings-table.tsx` at `dc74e3e` by #531.

- **`favouriteSource`.** Passed and not derived from the region:
  `/maajoukkueet` shows football-data's World Cup standings and TASO's
  national-team pages, so the region does not decide the provider. A bracket
  or a pass-through group has rows that are not teams anyone can follow.

Cut from `src/components/competition-picker.tsx` at `ef99862` by #531.

- **`favouriteRegion`.** Separate from `region`, which is football-data's
  notion. `extraEntries` holds Huuhkajat and Helmarit, which are teams and
  not competitions.

Cut from `src/components/favourites-page.tsx` at `ef99862` by #531.

- **`favourites-page.tsx`.** The page is the one place that shows what a
  favourite is and not only whether it is one.
- **`TeamLabel`.** No stored matches means no name. A name without a page,
  because its competitions have left the registry and no region can be said
  to own it, is still worth showing: `Joukkuetta ei löytynyt.` would be
  false about a team we just named.
- **The refetch after a removal.** Without it, removing a team and then
  following a client-side link to its page shows a filled star for a
  favourite that no longer exists, until something else happens to refresh
  the session.

Cut from `src/app/favorites/page.tsx` at `ef99862` by #531.

- **`/suosikit` is read on the server.** Everything it shows is server data,
  and one render beats a client endpoint per section. Reading the session
  hits the database, and an unhandled failure would render an error page
  where the reader expected their list; calling that "signed out" would be a
  claim we cannot make.
- **The order of favourite competitions.** Insertion order would mean the
  page rearranges itself as the reader adds favourites, and query order is
  not even that stable. A code the registry has dropped still has a row and
  still has to be removable.
- **The order of favourite teams.** Alphabetical is what the feature
  promises. A team without a name has no place in that order, and would
  otherwise sort as "".

Cut from `src/lib/favourite-actions.ts` at `48ebab4` by #531.

- **`ToggleResult`'s reason.** At the cap the reader must remove something,
  and on a failure they should try again.
- **`FAVOURITES_PATHS`.** CLAUDE.md's split, joined by the rewrite in
  `next.config.ts`. The reader's URL is the one that matters; the folder
  path is revalidated beside it because the extra call costs nothing and
  this cannot be exercised end to end: the action needs a real session,
  which the e2e suite cannot forge.
