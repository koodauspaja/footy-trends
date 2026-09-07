# 024 — Account settings

## Summary

Give a signed-in reader a page of their own: where the app should start them,
which competition each region should default to, which devices are signed in,
and a way to delete the account entirely. The first thing built on the identity
`specs/023-google-oauth-login.md` established.

## Decisions this spec commits to

Confirmed in chat on 2026-09-07 before writing, because each changes what gets
built:

| Decision | Choice |
|---|---|
| What ships | Default region, default competition per region, active sessions with sign-out-everywhere, account deletion |
| Favourite teams (#118) | **Not here.** This page ships first and #118 adds its own section later, against an established pattern |
| Theme / dark mode | **Out of scope** — see "Why there is no theme setting" |
| Signed-out visitor | Gets the page, with a Finnish prompt to sign in. No middleware, no redirect |
| Where settings is reached | An account menu behind the reader's avatar, which also takes over `Kirjaudu ulos` |
| Reversibility | Every preference can be unset, and no setting may make a page unreachable by clicking |
| How the default region acts | Client-side redirect once the session resolves, so `/` stays prerendered |
| Session rows | Browser and last-used only. **No IP addresses** |
| Deleting an account | Confirmed by typing `POISTA` |

## Why there is no theme setting

Dark mode looks half-present and is not. `globals.css` flips `--background` and
`--foreground` under `prefers-color-scheme: dark`, but every component hardcodes
light values — `text-zinc-600`, `border-zinc-200`, `bg-zinc-50`, `bg-amber-50`.
A toggle would hand readers a broken theme. Making the component set genuinely
theme-aware is its own feature, touching every file in `src/components/`, and
does not belong in a settings page.

## Scope

### In scope

- A settings page at `/asetukset`, reachable from the header.
- Four preferences, stored per user: default region, and a default competition
  for each of the three regions.
- A list of the reader's active sessions, and a way to end all the others.
- Account deletion.
- Applying the stored defaults where the app currently uses hardcoded ones.

### Out of scope

- **Favourite teams (#118) and team search (#247).** This page establishes the
  pattern; those add their own sections.
- **Any theme, language or notification setting.** UI is Finnish by rule
  (CLAUDE.md), there is no notification infrastructure, and see above for theme.
- **A default season.** The current season is discovered
  (`specs/011-current-season-discovery.md`); a pinned one silently goes stale and
  is a worse default than the live answer.
- **Changing the avatar.** The Google `image` is displayed; uploading or picking
  a different one needs storage, size limits, moderation and a delete path, and
  is its own issue.
- Changing the reader's name or email — those come from Google.
- Ending one *specific* other session. The list is for noticing something wrong;
  the response to noticing is to end all of them.
- Any change to what a signed-out reader sees anywhere else in the app.
- Exporting the reader's data.
- Roles, admin tooling, or anything that gates content behind a preference.

## UX / UI (Finnish strings)

### Reaching it — the header becomes an account menu

Today the header shows the reader's name and a `Kirjaudu ulos` button side by
side. A third control would make three, in the row that already overflowed at
320px (#266). So the name becomes a **menu trigger**, and sign-out moves inside
it:

| State | Header |
|---|---|
| Signed out | Exactly as today — `Kirjaudu sisään`, nothing else |
| Signed in | The reader's avatar, which opens a menu |

The menu holds two items:

| Item | String |
|---|---|
| Settings | `Asetukset` |
| Sign out | `Kirjaudu ulos` |

**The avatar is the Google `image` already stored by 023 and never rendered.**
No new data, no new provider call. When `image` is null the trigger falls back to
the reader's name, as today — an avatar that cannot load must not become an
unlabelled button.

| Element | String |
|---|---|
| Trigger accessible name | `Tili: <nimi>` |
| Avatar `alt` | empty — the trigger is already labelled, and a duplicated name is noise to a screen reader |

Behaviour: a real `<button aria-expanded>` controlling the menu, closing on
`Escape`, on outside click, and on choosing an item. Not a hover menu — hover
menus are unusable on the phones #266 was about.

**Focus on dismissal, per path**, because "returns focus to the trigger" is only
right for one of the three:

| Dismissed by | Focus |
|---|---|
| `Escape` | Returns to the trigger. The reader is on the keyboard and has nowhere else to be. |
| An outside click | Returns to the trigger **only if focus was inside the menu and nothing else claimed it.** A keyboard reader who tabs in and then clicks empty space would otherwise be dropped on `<body>` — measured, not assumed. But a click is itself a focus request, so overriding it when the reader clicked another control is the anti-pattern this avoids. |
| Choosing an item | Stays where the navigation or sign-out puts it. Yanking focus back to the header mid-navigation would drop a keyboard reader at the top of the page on every visit. |

> **Test impact, stated because it will bite twice.** `Kirjaudu ulos` stops being
> directly visible: every existing selector for it — in
> `tests/unit/components/auth-controls.test.tsx`, `site-header.test.tsx` and
> `tests/e2e/auth.spec.ts` — must open the menu first. This is a real change to
> 023's shipped surface, not an addition alongside it.

### Signed out, at `/asetukset`

| Element | String |
|---|---|
| Heading | `Asetukset` |
| Body | `Kirjaudu sisään nähdäksesi asetuksesi.` |
| Button | `Kirjaudu sisään` |

No redirect and no middleware: the page renders and explains itself.

**This page reads its session on the server**, unlike the header. That is not an
inconsistency with 023 — it is the same rule applied. 023 reads client-side
because `/` and the three region pickers are prerendered and must stay so.
`/asetukset` is per-user by definition, can never be prerendered, and is
`force-dynamic` like every other data-backed page here. Reading server-side
means the preferences, the session list and the signed-out prompt all arrive in
one render, with no client endpoints to build and no loading states to get
wrong.

> **Test impact, stated because it will bite:** this puts a second
> `Kirjaudu sisään` button on the page while the header already has one. Existing
> e2e selectors using `getByRole("button", { name: "Kirjaudu sisään" })` become
> ambiguous on this route and must be scoped to the header.

### While the session is loading

Nothing but the heading. Same reasoning as the header's empty slot in 023: a
signed-in reader must not be shown the signed-out prompt on the way to being
recognised.

### Signed in

Heading `Asetukset`, then three sections.

#### `Aloitusnäkymä`

| Element | String |
|---|---|
| Label | `Mistä sovellus aloittaa` |
| Options | `Kysy joka kerta` (default), `Kotimaa`, `Ulkomaat`, `Maajoukkueet` |
| Help | `Valitsemasi alue avataan suoraan, kun siirryt etusivulle. Pääset silti aina alueen valintaan.` |

**No setting may make a page unreachable.** Every preference here can be set and
unset — `Kysy joka kerta` and each `Oletus (…)` are real values, not decoration —
and the region picker keeps a permanent way back:

- `/` redirects to the chosen region.
- **`/?valitse=1` always renders the picker and never redirects**, whatever is
  stored.
- The header's `Etusivu` crumb points at `/?valitse=1` **whenever a default
  region is set**, and at `/` otherwise.

That last point is not a nicety. Without it, a reader on `/kotimaa/ottelut` who
clicks `Etusivu` is bounced straight back to `/kotimaa` — the crumb would look
broken, and the picker would be reachable only by typing a URL. The escape hatch
is what makes the redirect safe to have at all.

#### `Oletussarjat`

Three selects, one per region. Each lists that region's competitions plus a first
option naming the current fallback:

| Label | First option |
|---|---|
| `Kotimaan oletussarja` | `Oletus (Veikkausliiga)` |
| `Ulkomaiden oletussarja` | `Oletus (Valioliiga)` |
| `Maajoukkueiden oletuskilpailu` | `Oletus (MM-kisat)` |

Saving is explicit, not on-change:

| Element | String |
|---|---|
| Button | `Tallenna` |
| Saved | `Asetukset tallennettu.` |
| Failed | `Asetusten tallentaminen epäonnistui. Yritä uudelleen.` |

#### `Kirjautuneet laitteet`

One row per session:

| Element | String |
|---|---|
| Device | `Chrome` — the browser, and **not** the operating system |
| Current session | `Tämä laite` |
| Last used | `Käytetty tänään` / `Käytetty eilen` / `Käytetty 3.9.2026` |
| Button | `Kirjaa ulos muut laitteet` |
| Only one session | `Olet kirjautunut sisään vain tällä laitteella.` — button hidden |
| Done | `Muut laitteet kirjattu ulos.` |
| Failed | `Uloskirjaus epäonnistui. Yritä uudelleen.` |

**No IP address is shown.** It is the reader's own data, but it reveals
approximate location on a page that gets screenshotted and shoulder-surfed, and
browser plus last-used is enough to recognise a device you do not own.

#### `Tilin poistaminen`

| Element | String |
|---|---|
| Warning | `Tilin poistaminen on lopullista. Tilisi, istuntosi ja Google-yhteytesi poistetaan, eikä niitä voi palauttaa.` |
| Prompt | `Kirjoita POISTA vahvistaaksesi.` |
| Field label | `Vahvistus` |
| Button | `Poista tili` — disabled until the field reads exactly `POISTA` |
| Failed | `Tilin poistaminen epäonnistui. Yritä uudelleen.` |

On success the reader is signed out and returned to `/`. There is no farewell
screen: the account that would own it no longer exists.

`POISTA` is compared after trimming, case-sensitively. Lowercase `poista` does
not enable the button — the friction is the point.

## API & Data

### Schema

One new table. `user_preferences`, one row per user:

| Column | Notes |
|---|---|
| `id` | text, pk, matching the auth tables' convention |
| `userId` | text → `user.id` `ON DELETE CASCADE`, **unique** — one row per reader |
| `defaultRegion` | nullable text. Null means `Kysy joka kerta` |
| `defaultCompetitionDomestic` | nullable text. Null means the hardcoded fallback |
| `defaultCompetitionForeign` | nullable text |
| `defaultCompetitionNational` | nullable text |
| `createdAt` / `updatedAt` | as every other table |

**Three columns rather than a `(userId, region, code)` table.** The three regions
the reader sees are a closed set fixed in the URL structure and the front page,
and adding a fourth would be a code change carrying a migration anyway. A join
table would buy flexibility nothing is asking for.

Note that the code does **not** have one type spanning all three:
`CompetitionRegion` is `"foreign" | "national-teams"` only, because Kotimaa's
competitions come from TASO and live in `domestic-competitions.ts` with their own
`DEFAULT_DOMESTIC_COMPETITION_CODE`. So "the default competition for a region"
is two lookups against two registries, not one — the column names say which is
which rather than pretending to a uniformity the data does not have.

Null is meaningful everywhere: it means "no preference", which is distinct from
"prefers the current default". If the fallback later changes from Veikkausliiga
to something else, a reader who never chose follows the change — and a reader who
explicitly chose Veikkausliiga does not.

### Reading and writing preferences

A server action or route handler under `/api/` is **not** needed for reads: the
settings page is dynamic and reads the session server-side. Writes go through a
server action that resolves the session itself and writes only that user's row —
the userId is never taken from the client.

### Applying the defaults

| Preference | Where it acts | How |
|---|---|---|
| Default region | `/` | **Client-side.** Once `useSession()` resolves and a preference exists, the browser navigates on. `/` keeps its prerender and `STATIC_BY_DESIGN` stays a list of four. |
| Default competition | `/kotimaa/*`, `/ulkomaat/*`, `/maajoukkueet/*` when `?kilpailu=` is absent | **Server-side.** Those pages are already `force-dynamic`, so reading the session there costs no prerendering. |

The two differ deliberately, and the reason is #182 — the same reason 023 reads
the session in the browser. `/` is prerendered and must stay so; the competition
pages are not and never were.

**The server-side lookup is skipped entirely unless it can change the answer.**
It runs only after the URL and any team context have failed to settle the
competition, and only when a session cookie is actually present — matched on
parsed cookie *names*, so an unrelated cookie whose value contains the string
does not drag a signed-out request through better-auth. A signed-out reader, and
any reader following an explicit `?kilpailu=` link, pays nothing.

### Caching

- **No cache key gains a user dimension.** This is the invariant 023 set and it
  matters more here, not less: a preference decides *which* competition to
  resolve, and the Redis key is then built from the **resolved competition**,
  exactly as today. Two readers with different defaults hit the same key for the
  same competition.
- Preferences are read from Postgres per request, never cached in Redis. They are
  small, indexed by a unique key, and staleness would be visible and confusing.
- The settings page itself is `force-dynamic`.

### better-auth endpoints

Verified present in `better-auth/dist/api/index.d.mts` at 1.7.3:

| Need | Endpoint |
|---|---|
| List sessions | `listSessions` |
| End the others | `revokeOtherSessions` |
| Delete the account | `deleteUser` |

`deleteUser` requires `user.deleteUser.enabled: true` in `src/lib/auth.ts`.
With no `sendDeleteAccountVerification` callback configured it deletes
immediately, which is what the typed `POISTA` confirmation is standing in for —
an email round trip on top would be friction without extra safety, since the
session proves the account already.

### Parsing the user agent

A small, local mapping — no dependency. The browser is the first match among
Edge, Opera, Firefox, Chrome, Safari; Edge before Chrome and Chrome before
Safari, because their UA strings contain each other's names. Anything unmatched
renders `Tuntematon selain`.

**The operating system is not shown.** `Chrome · macOS` put two English product
names into a Finnish page to say what the browser alone already says, and
CLAUDE.md's Finnish-UI rule admits no exception worth spending there. The
accepted cost is that two Chrome sessions on different machines read alike; the
browser is still enough to notice a device that is not yours, which is what the
section is for.

This is deliberately crude. It exists so a reader can recognise a device, not to
be an analytics-grade parser, and a wrong guess costs nothing.

## Edge Cases

| Case | Behaviour |
|---|---|
| Stored competition code no longer exists in the registry | Ignored; the region falls back to its hardcoded default, and the select shows `Oletus (…)`. A removed competition must not strand a reader on a dead page. |
| Stored region is not one of the three | Ignored; `/` shows the picker as normal. |
| Reader has no `user_preferences` row | Every default applies. The row is created on first save, not at sign-in — an untouched settings page writes nothing. |
| Default region set, reader lands on `/` | Redirected to that region. |
| Default region set, reader wants the picker | `/?valitse=1` renders it and never redirects. The header's `Etusivu` crumb points there whenever a default is set, so it is reachable by clicking, not only by typing. |
| `?valitse=1` with no default region set | Renders the picker, exactly as `/` already does. The parameter suppresses a redirect that was not going to happen; it never causes one. |
| Every preference, unset | `Kysy joka kerta` and each `Oletus (…)` restore the app's stock behaviour completely. No setting is one-way. |
| Default region redirect and the back button | `replace`, not `push`, so `/` does not become a step the reader has to click past twice. |
| Preference points at a region, reader signs out | Nothing redirects. The preference is theirs, not the browser's. |
| `?kilpailu=` present in the URL | Wins over the preference, always. An explicit URL is a stronger statement than a stored default, and a shared link must render what it says (`specs/012`). |
| `?kilpailu=` present but invalid | Falls back to the reader's **preference** if they have a usable one, otherwise to the region's hardcoded default. The existing notice is unchanged and stays accurate either way, because `ContextNotices` renders `resolved.competitionName` — it names whatever is actually shown. An earlier draft of this spec said the hardcoded default must win here, on the grounds that the notice would otherwise name "a competition the reader never asked for"; that was wrong twice over, since the notice follows the resolved competition and a stored preference is something the reader chose explicitly. |
| Session list contains the current session | Marked `Tämä laite`. It is never ended by `Kirjaa ulos muut laitteet`. |
| Only one session | The button is hidden and the list says so. Ending "the others" when there are none is a button that does nothing. |
| Another device is revoked while the reader is on the page | Nothing breaks. The list is a snapshot; it refreshes on the next load. |
| Reader deletes their account with other sessions open | Those sessions cascade away with the user row. The other device is signed out on its next request. |
| Deletion fails midway | Postgres cascades are one transaction: either the user and everything keyed to them are gone, or nothing is. There is no half-deleted state to recover from. |
| Reader types `poista` or ` POISTA ` | Trimmed, then compared case-sensitively. `POISTA` with surrounding spaces works; lowercase does not. |
| Save fails | The form keeps what the reader typed and shows the failure. Nothing is silently discarded. |
| Preferences cannot be **read** | The form is withheld entirely and the page shows `Asetusten lataaminen epäonnistui. Yritä myöhemmin uudelleen.` Rendering defaults would show settings apparently reset, and a save would then overwrite the real ones — losing them to a query that briefly failed. "Failed" and "never saved" must not collapse into one state. |
| The device list cannot be read | `Laitelistaa ei voitu ladata.`, and the sign-out button stays. **Never** `Olet kirjautunut sisään vain tällä laitteella.` — that is a claim about the reader's account security that a failed request cannot support, and it would hide the very sessions this section exists to reveal. |
| The session cannot be read when the page loads | `Asetusten lataaminen epäonnistui. Yritä myöhemmin uudelleen.` — **not** the sign-in prompt. A failed lookup is not proof the reader is signed out, and they may well be signed in. |
| The session refresh after a save fails | `Asetukset tallennettu. Päivitä sivu, jotta muutokset tulevat voimaan.` The save did succeed, so reporting a failure would be wrong — but the start region rides on the session payload and will not take effect until it is re-read, and a silently stale header is worse than saying so. |
| Resolving the session fails during a save | Returns a failure, never rejects. The client awaits the action with no rejection handler, so a thrown error would leave the reader with a form that silently did nothing. |

## Performance & Limits

- **Signed-out readers pay nothing anywhere.** Every new lookup is behind a
  session-cookie check.
- For a signed-in reader, competition pages gain one lookup on `user_preferences`
  by a unique `user_id` — a single-row index hit in the Postgres the page already
  queries.
- `/` gains no server work at all; the region preference is applied in the
  browser.
- The settings page itself: one session read, one preferences read, one
  `listSessions`. Sessions per reader are naturally small, so the list is not
  paginated — a reader with enough devices to need pagination has a different
  problem, which is what `Kirjaa ulos muut laitteet` is for.
- No new external API calls anywhere.

## Security & Secrets

- **No new environment variables and no new secrets.** Nothing to change in
  Railway or Google Cloud.
- Every write resolves the session server-side and acts on **that** user. No
  endpoint accepts a user id from the client — the whole class of "change someone
  else's settings" is removed rather than checked for.
- `user_preferences` cascades on user deletion, so deleting an account leaves no
  orphaned preference row.
- No IP addresses are rendered, deliberately (see UX).
- Account deletion is irreversible by design and says so before it happens. There
  is no soft-delete window, so there is nothing to leak later.
- Deletion is the reader's own account only; there is no admin surface here.

## Acceptance Criteria

- [ ] `npm run db:migrate` creates `user_preferences` with a unique `user_id` and
      a cascading foreign key to `user`.
- [ ] Signed out, `/asetukset` renders the heading and
      `Kirjaudu sisään nähdäksesi asetuksesi.` — no redirect, no error.
- [ ] Signed in, the header shows an avatar that opens a menu containing
      `Asetukset` and `Kirjaudu ulos`; signed out the header is unchanged from
      today.
- [ ] The menu opens on click and closes on `Escape`, on an outside click and on
      choosing an item. `Escape` restores focus to the trigger; an outside click
      restores it only when focus would otherwise be orphaned; choosing an item
      leaves focus to the navigation or sign-out that follows.
- [ ] A reader whose Google profile has no `image` gets their name as the
      trigger, not an unlabelled button.
- [ ] At a 320px viewport with a long display name, the header does not overflow
      and the page does not scroll sideways — the #266 regression, re-checked
      against the new control.
- [ ] Setting `Aloitusnäkymä` to `Kotimaa` and visiting `/` lands on `/kotimaa`;
      setting it back to `Kysy joka kerta` shows the picker again.
- [ ] With a default region set, `/?valitse=1` renders the picker and does not
      redirect, and the header's `Etusivu` crumb leads there rather than bouncing
      the reader back to their region.
- [ ] Every page and picker in the app is reachable by clicking, whatever the
      stored preferences are.
- [ ] Setting `Kotimaan oletussarja` to Ykkösliiga makes
      `/kotimaa/sarjataulukko` (no `?kilpailu=`) render Ykkösliiga.
- [ ] `/kotimaa/sarjataulukko?kilpailu=VL` still renders Veikkausliiga for that
      same reader — an explicit URL beats the preference.
- [ ] A signed-out reader sees the unchanged hardcoded defaults everywhere.
- [ ] A preference naming a competition that no longer exists falls back to the
      hardcoded default rather than erroring.
- [ ] `Kirjautuneet laitteet` lists the current session marked `Tämä laite`, with
      browser and last-used, and **no IP address anywhere in the page source**.
- [ ] Signing in on a second browser, then `Kirjaa ulos muut laitteet`, leaves
      exactly one `session` row and signs the other browser out on its next
      request.
- [ ] `Poista tili` is disabled until the field reads exactly `POISTA`, and
      lowercase `poista` does not enable it.
- [ ] Deleting the account removes the `user`, `session`, `account` and
      `user_preferences` rows, and returns the reader to `/` signed out.
- [ ] `/`, `/kotimaa`, `/ulkomaat` and `/maajoukkueet` are still prerendered:
      `npm run build` reports them `○`, and `tests/unit/app/rendering-mode.test.ts`
      passes with **no edit to the file**.
- [ ] No Redis cache key contains a user id, session token, email, or preference.
- [ ] `npm run test:unit` reports 100% on all four metrics; integration and e2e
      pass; lint, typecheck and build pass.

## Tests Required

### Unit — `tests/unit/`

| File | Assertions |
|---|---|
| `lib/preferences.test.ts` (new) | A stale competition code resolves to the hardcoded default; a valid one wins; an absent preference falls back; an unknown region is ignored. |
| `lib/user-agent.test.ts` (new) | Edge before Chrome, Chrome before Safari; an unparseable string gives `Tuntematon selain`; **no output ever names an operating system**. |
| `components/settings-page.test.tsx` (new) | Signed out → the Finnish prompt. Pending → heading only, never the prompt. Signed in → the three sections. Save failure keeps the reader's input. |
| `components/delete-account.test.tsx` (new) | The button is disabled until `POISTA` exactly; ` POISTA ` enables it; `poista` does not. |
| `components/sessions-list.test.tsx` (new) | Current session marked; a single session hides the button; **no IP appears in the rendered output**. |
| `components/account-menu.test.tsx` (new) | Closed by default; opens on click; `Escape`, outside click and choosing an item all close it; `aria-expanded` tracks state; a null `image` falls back to the name. Focus is asserted per path: rescued when an outside click would orphan it, **not** stolen from a control the reader clicked instead. |
| `components/site-header.test.tsx` (existing) | The menu trigger appears only when signed in. The `Etusivu` crumb points at `/?valitse=1` when a default region is set, and at `/` otherwise. |
| `components/auth-controls.test.tsx` (existing) | **Updated, not extended.** `Kirjaudu ulos` now lives behind the menu, so every existing assertion for it opens the menu first. |
| `app/rendering-mode.test.ts` (existing) | Passes **unchanged**, with `STATIC_BY_DESIGN` still naming four pages. Needing to edit it means the implementation crossed the boundary this spec set out to respect. |

### Integration — `tests/integration/preferences.test.ts` (new)

Against real Postgres:

- A preferences row cascades away with its user.
- `user_id` is unique — a second row for the same user is rejected.
- Preferences survive a session being revoked; they belong to the user, not the
  session.

### E2E — `tests/e2e/settings.spec.ts` (new)

Using the `/api/auth/get-session` interception established in 023, since a real
Google sign-in still cannot be automated:

- Signed out, `/asetukset` shows the Finnish prompt and does not redirect.
- Signed in, the three sections render.
- The delete button enables only on exactly `POISTA`.
- No IP address string appears in the page.
- The account menu opens, offers both items, and closes on `Escape`.
- At 320px with a long display name: the header does not overflow and the page
  does not scroll sideways — the #266 check, repeated against the new control.
- **Existing specs are updated, not just added to.** `Kirjaudu ulos` moves behind
  the menu, and this route puts a second `Kirjaudu sisään` on the page, so
  `tests/e2e/auth.spec.ts` selectors must be scoped to the header and taught to
  open the menu.

**Not automatable, and stated rather than skipped:** the redirect and
default-competition behaviours depend on a real signed-in session with stored
preferences, which needs a human on staging — the same gap 023 documented.

## Files To Update

| Path | Change |
|---|---|
| `specs/024-account-settings.md` | this file |
| `decisions/024-account-settings.md` | by the implementing agent |
| `src/db/schema.ts` | `user_preferences` |
| `drizzle/migrations/` | one generated migration |
| `src/lib/auth.ts` | `user.deleteUser.enabled: true` |
| `src/lib/preferences.ts` | new — read, write, and resolve against the registries |
| `src/lib/user-agent.ts` | new — the small browser/OS mapping |
| `src/app/settings/page.tsx` | new — the page |
| `next.config.ts` | `/asetukset` → `/settings` rewrite, plus the `/settings` redirect, per `specs/012` |
| `src/components/settings-*.tsx` | new — the three sections |
| `src/components/account-menu.tsx` | new — the avatar trigger and its menu |
| `src/components/auth-controls.tsx` | signed-in branch becomes the menu; `Kirjaudu ulos` moves inside it |
| `src/components/site-header.tsx` | the `Etusivu` crumb honours a default region |
| `src/app/page.tsx` | the client-side region redirect, and `?valitse=1` suppressing it |
| `src/lib/competitions.ts` | `defaultCompetitionFor` takes an optional override (`foreign`, `national-teams`) |
| `src/lib/domestic-competitions.ts` | the same for Kotimaa's separate default |
| `tests/…` | as listed above |

## Open Questions

None outstanding. Both were resolved in chat on 2026-09-07, recorded here
because each changed the spec above.

1. **Settings must be reversible, and nothing may become unreachable.** Settled:
   every preference has a real unset value, and `/?valitse=1` plus the
   `Etusivu` crumb keep the region picker permanently reachable by clicking. The
   first draft said a reader with a default region is "still redirected" from
   `/`, which would have made the picker reachable only by typing a URL — the
   redirect is only safe because the escape hatch exists.
2. **Where the settings link lives.** Settled: the name becomes an avatar that
   opens an account menu, and `Kirjaudu ulos` moves into it. That keeps the
   header at one control instead of three in the row that overflowed in #266,
   and it is where a reader looks for account actions anyway. The cost is real
   and stated above: it changes 023's shipped surface and every existing test
   that clicks `Kirjaudu ulos`.

## Follow-ups this spec creates

| Follow-up | Why it is not here |
|---|---|
| Choosing or uploading an avatar instead of Google's | Needs file storage, size and type limits, a delete path, and a moderation answer. Bigger than a settings row, and the page works without it. |
| Finishing dark mode, or removing the half of it that exists | `globals.css` flips two tokens while every component hardcodes light values. Untracked today; worth an issue whichever way it is resolved. |
