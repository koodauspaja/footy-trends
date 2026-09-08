# 026 — Suosikit: favourite teams and competitions

## Summary

Let a signed-in reader mark teams and competitions as favourites, reach them in
one click from anywhere, and take them off the list again. `/suosikit` is the
page that holds both (#118).

## Decisions this spec commits to

Settled with Miikka on 2026-09-08, before the spec was written.

| Decision | Choice | Why |
|---|---|---|
| Scope | **Teams and competitions, one feature** | A reader follows La Liga, the Champions League and Veikkausliiga *and* a handful of clubs. Splitting those into two features would build the same table, toggle and page twice. |
| Where to add or remove | **The thing's own page, and the list where you meet it in bulk** | A team page and a standings row; a competition's page and the region picker. Both are toggles, so removing happens where adding did. |
| Where the list lives | **A dedicated `/suosikit`** | Room for what a favourite is *for* — next match, latest result — which a menu of names has nowhere to put. |

### Why this is not `defaultCompetition*` again

`specs/024-account-settings.md` already stores one default competition per
region. The two answer different questions and both keep their answer:

- **`Oletussarjat` is the one you like *most***, one per region, and it decides
  what opens when you go to `/kotimaa`. Exactly one can be the default, because
  a page opens on one thing.
- **A favourite is one of the several you follow.** Two or three in the same
  region — Veikkausliiga and Ykkösliiga both, say — and across regions at once:
  La Liga, the Champions League and Veikkausliiga together. Neither of those
  shapes fits in a one-per-region field.

So the default is not a favourite by another name, and a favourite is not a
weaker default. The settings page keeps `Oletussarjat`, `/suosikit` holds the
list, and marking a competition a favourite changes nothing about which one
opens.

### Decisions made now, kept cheap to change

Miikka's instruction, and it shapes the code rather than only the spec: where a
decision cannot be settled without measuring, build it so measuring can still
change it **before** merge.

| Decision | How it stays reversible | What would change it |
|---|---|---|
| Favourites ride on the session payload | No component reads the session for this directly. `favouriteKeysOf(session, kind)` in `session-extras.ts` is the single read point and owns where the answer comes from; swapping it for a fetch is one file. | The payload measuring heavy at the cap |
| Fifty of each | One exported constant, asserted in the test that refuses the fifty-first | Anything that makes fifty feel wrong in use |
| Where the toggle appears | It is one component with one prop pair. A placement is an import; removing one is deleting a line | The standings row proving noisy at twenty rows |
| Team names resolved from stored matches | Adding a stored label later is a column and a write, with no read path to rewrite | A team page for a club with no stored matches looking bad |

The two that are **not** cheap to reverse, and so are decided on their merits
rather than provisionally: the two-table schema, because splitting or merging
tables after rows exist is a migration with data in it, and the identity
`(source, teamProviderId)`, because every row would have to be rewritten to
change what a favourite points at.

## Scope

### In scope

- Favouriting a team from its own page and from a standings row.
- Favouriting a competition from its own standings or match page and from the
  region picker.
- `/suosikit`: both lists, each entry a link, each removable.
- A `Suosikit` link in the account menu.
- Removing the account's favourites with the account.

### Out of scope

- **Ordering by hand.** Competitions render in the registry's own order and
  teams alphabetically; dragging a list into a personal order is a feature of
  its own.
- **Notifications, or anything that watches a favourite.** This is a bookmark.
- **Favourite players, matches or seasons.** Nothing in the app has a page for a
  player, and a match is a moment rather than a thing to follow.
- **Sharing a list, or seeing anyone else's.** Favourites are private, which is
  also what keeps #268's moderation question closed.
- **A favourites-aware front page.** Rearranging `/` around favourites would
  cost it its prerendering, which is a separate decision with #182 behind it.

## UX / UI (Finnish strings)

### The toggle

One control everywhere, so it reads the same in a table row as on a page.

| State | Label (`aria-label`) | Visible |
|---|---|---|
| Not a favourite | `Lisää suosikkeihin` | ☆ |
| A favourite | `Poista suosikeista` | ★ |
| Saving | unchanged, `aria-busy` | ☆/★, dimmed |

**A star and an `aria-label`, not a star alone.** The symbol carries the state
for a sighted reader; the label carries it for everyone else, and it is the only
text a screen reader has to work with in a standings row of twenty.

Signed out, no toggle is rendered at all — there is nothing to attach a
favourite to, the same reasoning as the settings page.

### `/suosikit`, signed in

```
Suosikit

Sarjat
★ Veikkausliiga            Poista
★ Valioliiga               Poista

Joukkueet
★ HJK                      Poista
★ Manchester City          Poista
```

| Element | String |
|---|---|
| Heading | `Suosikit` |
| Competitions section | `Sarjat` |
| Teams section | `Joukkueet` |
| Remove | `Poista suosikeista` |
| No competitions yet | `Ei suosikkisarjoja. Lisää niitä sarjan sivulta.` |
| No teams yet | `Ei suosikkijoukkueita. Lisää niitä joukkueen sivulta.` |
| Nothing at all | Both of the above, each under its own heading |
| Removal failed | `Poistaminen epäonnistui. Yritä uudelleen.` |

### `/suosikit`, signed out

The same shape as `/asetukset`: the page renders and says why it is empty,
rather than redirecting.

| Element | String |
|---|---|
| Heading | `Suosikit` |
| Explanation | `Kirjaudu sisään nähdäksesi suosikkisi.` |

### The account menu

Gains `Suosikit` above `Asetukset`, so the reader's own things sit together.

## API & Data

### Schema

Two tables, not one with a `kind` column: a team is identified by a provider and
a number, a competition by a region and a code. One table would need four
nullable columns and a constraint to say which pair is legal, which is a check
where a type could have been.

```ts
export const favoriteTeam = pgTable(
  "favorite_team",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    // "football-data" | "taso". The two id spaces are independent — 317 ids
    // already exist in both tables — so the provider is half the identity.
    source: text("source").notNull(),
    teamProviderId: integer("team_provider_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("favorite_team_identity_idx").on(table.userId, table.source, table.teamProviderId)]
);

export const favoriteCompetition = pgTable(
  "favorite_competition",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    // The Finnish URL segment, as `default_region` already stores it.
    region: text("region").notNull(),
    competitionCode: text("competition_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("favorite_competition_identity_idx").on(table.userId, table.region, table.competitionCode)]
);
```

`on delete cascade` on both, so deleting an account takes its favourites with
it — the same construction that makes 024's promise true, and 025's.

**No stored team name.** The name is resolved from stored matches at render
time, the way the team page already does it. Storing a label would mean a club
that renamed shows its old name until someone re-favourites it, and #254 exists
precisely because a renamed club has to be told from one that does not exist.

### How a toggle knows the state

`customSession` already carries `defaultRegion` and `avatarVersion`. It gains:

```ts
favoriteTeams: `${source}:${teamProviderId}`[];
favoriteCompetitions: `${region}:${code}`[];
```

**This is what makes one toggle work everywhere.** The competition picker lives
on `/`, `/kotimaa`, `/ulkomaat` and `/maajoukkueet` — the four pages
`tests/unit/app/rendering-mode.test.ts` keeps prerendered because of #182.
Reading the session on the server there would cost them that. The browser
already fetches the session, so a client-side toggle costs no extra request and
no prerendering, and the same component then works on dynamic pages too rather
than needing a second server-side variant.

Strings rather than objects: they are compared, not read, and `"taso:60731"` is
one `includes` instead of a `find` with two fields.

**Bounded on purpose.** Fifty of each, **measured at 2326 bytes** (334 gzipped)
with both caps filled — see Open Questions. The cap is enforced on write, and
`Suosikkeja voi olla enintään 50.` says so.

Every read of these two fields goes through `favouriteKeysOf(session, kind)` in
`session-extras.ts`, which is what keeps "send the whole list" a reversible
decision rather than a shape spread across five components.

### Reading and writing

| Action | Signature | Notes |
|---|---|---|
| `toggleFavouriteTeamAction` | `(source, teamProviderId) => Promise<ToggleResult>` | Adds or removes; returns the new state |
| `toggleFavouriteCompetitionAction` | `(region, code) => Promise<ToggleResult>` | Same |
| `removeFavouriteTeamAction` | `(source, teamProviderId) => Promise<ActionResult>` | For the list page's `Poista suosikeista` |
| `removeFavouriteCompetitionAction` | `(region, code) => Promise<ActionResult>` | Same |

Both `source` and `teamProviderId` are validated inside the action, by the same
`isTeamProviderId` the key parser uses — one rule, because two copies of it is
how they drift (`taso.ts`'s `parseProviderId` enforces the same column bound).

`ToggleResult` is `{ ok: true, favorite: boolean } | { ok: false, reason: "limit" | "failed" }`.

**No action takes a user id**, the rule `settings-actions.ts` and
`avatar-actions.ts` already follow: it removes "favourite something for someone
else" as a category rather than checking for it.

### Caching

`revalidatePath` after a write, on **both** `/suosikit` and `/favorites`. #292
established that the reader's URL is the one that matters; the App Router folder
is revalidated alongside it because this page is reachable under both spellings
through the rewrite, the extra call costs nothing, and it cannot be exercised end
to end — the action needs a real session, which the e2e suite cannot forge.

The toggles themselves are local state plus a session refetch, so a star updates
without a reload and the other stars on the page follow when the session lands.

## Edge Cases

| Case | Behaviour |
|---|---|
| Favouriting twice (two tabs, double click) | The unique index makes the second a no-op; the action returns the state rather than an error |
| A competition retired from the registry | **Kept**, and reported as `Sarjaa ei enää ole.` on `/suosikit` with its `Poista suosikeista` button — validated against the registry on read the way a stored `defaultCompetition` is, but never hidden, because a row nobody can see is a row nobody can remove |
| A team with no stored matches | Rendered as `Joukkuetta ei löytynyt.` with no link, and removable — the entry must not become unreachable |
| The fifty-first favourite | Refused with `Suosikkeja voi olla enintään 50.`; nothing is written |
| Signed out mid-session, then a toggle | `{ ok: false, reason: "failed" }`; the header has already fallen back to `Kirjaudu sisään` |
| Account deleted | Both tables cascade. Verified in an integration test, not assumed |
| A team favourited from two competitions | One row: the identity is `(source, id)`, and specs/022 established that a team page spans competitions and seasons |
| Same provider id, different providers | Two separate favourites, which is correct — `taso:317` and `football-data:317` are different clubs |

## Performance & Limits

| | |
|---|---|
| Favourites per reader | 50 teams, 50 competitions |
| Added to the session payload | **Measured: 2326 bytes at the cap** (334 gzipped), on a request the browser already makes |
| Queries per session read | Three: the existing `LEFT JOIN`, plus the two favourite reads in parallel |
| Session read at the cap | **Measured: 15.1 ms, against 2.6 ms with nothing stored** |
| Queries for `/suosikit` | Two for the keys, plus one per provider that has a favourite (so at most two) to resolve team names from stored matches |
| Extra queries on a standings page | **Zero.** The toggle reads the session the browser already has |

## Security & Secrets

- No new environment variables.
- No user id from the client, on any of the four actions.
- Favourites are private: nothing renders another reader's list, which is what
  keeps #268's moderation question closed.
- A `region` and a `competitionCode` are validated against the registry on read,
  not trusted from the row — the rule `resolveRegion` already applies to
  `default_region`.

## Acceptance Criteria

- [ ] `npm run db:migrate` creates both tables with cascading foreign keys and a
      unique index per identity.
- [ ] Signed in, a team page and every standings row show a toggle; pressing it
      fills the star and the star stays filled after a reload.
- [ ] Signed in, a competition's standings page and the region picker show the
      same toggle, and `/kotimaa` is still prerendered afterwards.
- [ ] `/suosikit` lists both kinds under `Sarjat` and `Joukkueet`, each linking
      to its page, each removable.
- [ ] Removing from `/suosikit` clears the star on the team's own page.
- [ ] Signed out, `/suosikit` explains itself and no toggle is rendered anywhere.
- [ ] The fifty-first favourite is refused with `Suosikkeja voi olla enintään 50.`
- [ ] A competition retired from the registry does not break `/suosikit`.
- [ ] Deleting the account deletes both sets of rows.
- [ ] `/`, `/kotimaa`, `/ulkomaat` and `/maajoukkueet` are still prerendered:
      `npm run build` reports them static and `rendering-mode.test.ts` passes
      unedited.
- [ ] Unit coverage 100% on all four metrics; integration and e2e pass; lint,
      typecheck and build pass.

## Tests Required

### Unit — `tests/unit/`

| File | Asserts |
|---|---|
| `lib/favourite-keys.test.ts` (new) | What a key *is*: both providers stay apart; the id bound is the column's, not `Number.isSafeInteger`; a code containing a colon survives; a retired code still parses |
| `lib/favourites.test.ts` (new) | Identity round trips; the cap refuses the fifty-first but never blocks a removal; names resolve from either side of a stored match; no query for a provider nobody favourited |
| `lib/favourite-actions.test.ts` (new) | Signed out writes nothing; the user id comes from the session, never the caller; each action returns a result rather than rejecting; the cap refusal survives as its own reason |
| `lib/current-user.test.ts` (new) | Each of the three action modules imports cleanly with the auth variables unset, and `@/lib/auth` still refuses to construct without them |
| `lib/session-extras.test.ts` | `favouriteKeysOf` reads each kind from its own field and answers `[]` for any payload that is not a list of strings |
| `components/favourite-toggle.test.tsx` (new) | Both labels; nothing at all when signed out; **nothing on the server, so hydration cannot mismatch**; a failed toggle returns the star to its previous state rather than leaving it wrong |
| `components/favourites-page.test.tsx` (new) | Both sections; both empty states; removal updates the list; a retired competition and a team with no matches still render and stay removable |
| `components/account-menu.test.tsx` | `Suosikit` is in the menu, above `Asetukset`, and closes it on navigation |
| `app/favorites/page.test.tsx` (new) | Signed out asks for sign-in; a session read that fails says so rather than claiming signed out; keys that are not keys are dropped; each provider's team links to its own page |
| `db/schema.test.ts` | Both identity indexes are unique and name the right columns; both tables cascade with the user |
| `app/rendering-mode.test.ts` | Unedited — the picker pages stay prerendered |

Every one of these was mutation-checked: the behaviour each test names was
broken, the test watched to fail, and the code restored. That is the counter to
the largest class in `skills/self-review.md`.

### Integration — `tests/integration/favourites.test.ts` (new)

Against real Postgres: the unique index makes a double insert a no-op; deleting
the `user` row removes both kinds; `taso:317` and `football-data:317` coexist;
the cap refuses at fifty but still lets a removal through; the session payload
carries both lists for a reader with no preferences row at all.

### E2E — `tests/e2e/favourites.spec.ts` (new)

Signed out: `/suosikit` explains itself instead of redirecting, `/favorites`
redirects to it, and no star appears on a standings page or in the picker —
asserted only after the signed-out header has rendered, because "no stars yet"
is true of any page before it hydrates.

**Signed in, the rendered half *is* reachable**, unlike `/asetukset`: the star is
a client component that reads the session the browser fetches, so intercepting
`/api/auth/get-session` — the technique `settings.spec.ts` documents the limits
of — reaches it. Covered: a star beside every competition in the picker with the
favourited one pressed, one star per standings row each naming its own team, the
picker pages still arriving with their content when JavaScript is blocked, and
the account menu reaching `/suosikit`.

**What stays unreachable is a *write*.** The server action reads a real cookie,
sees none, and refuses; forging one would encode better-auth's cookie-signing
internals into the suite. So writes are covered by the unit and integration
suites, and the round trip is a human check on staging — the same gap specs/023
and specs/025 document.

## Files To Update

| File | Change |
|---|---|
| `specs/026-favourites.md` | this |
| `decisions/026-favourites.md` | new, written while building |
| `src/db/schema.ts` | `favorite_team`, `favorite_competition` |
| `drizzle/migrations/0013_*` | generated migration |
| `src/lib/favourite-keys.ts` | new — what a favourite *is*, with no database: the half a client component may import |
| `src/lib/favourites.ts` | new — reads and writes, the cap, bulk name resolution |
| `src/lib/favourite-actions.ts` | new — the four actions |
| `src/lib/current-user.ts` | new — one `currentUserId`, with `@/lib/auth` imported lazily so no module a client component can import constructs better-auth on import |
| `src/lib/settings-actions.ts`, `src/lib/avatar-actions.ts` | use the shared helper, dropping their own copies |
| `src/lib/preferences.ts` | the session extras gain both lists |
| `src/lib/session-extras.ts` | `favouriteKeysOf`, the single read point |
| `src/lib/auth.ts` | `customSession` carries them |
| `src/components/favourite-toggle.tsx` | new — the one client toggle |
| `src/components/favourites-page.tsx` | new |
| `src/app/favorites/page.tsx` | new — server-rendered, `force-dynamic` |
| `next.config.ts` | `/suosikit` → `/favorites`, and the English path redirects |
| `src/components/standings-table.tsx` | an optional toggle per row |
| `src/components/competition-standings-page.tsx` | passes `football-data` as the row source |
| `src/app/domestic/standings/page.tsx` | passes `taso` as the row source |
| `src/components/competition-team-page.tsx` | a toggle beside the team name |
| `src/components/page-shell.tsx` | an optional `headingAction`, so the toggle sits with the heading |
| `src/components/competition-picker.tsx` | a toggle beside each competition — *beside*, not inside the link: a button inside an anchor is invalid and would navigate |
| `src/app/domestic/page.tsx`, `src/app/foreign/page.tsx`, `src/app/national-teams/page.tsx` | pass each competition's region to the picker |
| `src/components/sign-in-prompt.tsx` | its message becomes a prop, defaulting to specs/024's sentence |
| `src/components/account-menu.tsx` | `Suosikit`, above `Asetukset` |
| `tests/e2e/session.ts` | the fake session carries favourite keys |
| `tests/integration/avatar.test.ts` | the session-payload assertion gains both lists |

## Open Questions

Both are now **answered**, which is what "decided before merge" was for.

1. **Does a 2 kB session payload matter?** ~~Open~~ **No.** Measured against a
   real Postgres with both caps filled and the longest keys the app produces:
   **2326 bytes, 334 gzipped**, and 15.1 ms to read against 2.6 ms empty. That
   is a third of a kilobyte on the wire, on a request the browser already makes,
   so the list ships whole and no fetch-on-demand path is built. `favouriteKeysOf`
   stays the single read point anyway — it costs nothing and it is what makes the
   answer revisable if the cap ever rises.
2. **Should the star appear on a match page's team names?** **Not now.** A match
   page names two teams; a standings table names twenty. Adding it there is one
   import against a `FavouriteToggle` that already exists, so it stays the
   cheapest thing to add if it is missed — which is the reason not to add it
   speculatively.

## Follow-ups this spec creates

| Follow-up | Why not now |
|---|---|
| A favourites-aware front page | Costs `/` its prerendering (#182); a decision of its own |
| Next match and latest result per favourite | The page has room for it; the bookmark is the feature |
| Hand ordering | Nothing yet says the registry order is wrong |
