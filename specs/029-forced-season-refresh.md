# 029 — Admin tool to force-refresh a stored season

## Summary

Give an admin a way to force one competition + season to be refetched from its
provider and, after reviewing exactly what would change, to apply it — so a
retroactive change, most likely a points deduction applied after we already
synced, can be picked up without weakening the caching rule for everything else.

`specs/013-more-finnish-competitions.md` made Finnish standings depend on TASO's
`starting_points`, which carries deductions. `needsRefresh` — the same function
by the same name in both `taso-standings-service.ts` and `standings-service.ts`
— never refetches a season below the active one, so a deduction applied to a
past season after our sync would never appear: the table would stay quietly
wrong with nothing indicating it. Spec 013 accepted that deliberately, on the
condition that this escape hatch exists.

Confirmed real: Veikkausliiga 2016 carries −6 for PK-35 Vantaa, and the
2015–2026 audit found deductions in Ykkösliiga 2025, Ykkönen 2025–2026 and
Kansallinen Liiga 2025. Nothing tells us when TASO applied any of them.

This is a tool for abnormal situations. It is not part of anybody's routine, it
is not reached from any reader-facing page, and it is expected to be run a
handful of times a year at most. **New seasons never arrive through it** — they
come through the ordinary sync, as they always have.

---

## The rule this feature is built around

**A provider that goes silent must never cost us data. A provider that answers
may correct us, but only with a person's consent.**

Those are two halves of one rule, and separating them is what makes this safe:

1. **Silence deletes nothing.** A season we hold and the provider no longer
   serves — a category retired, a competition dropped from the plan, a request
   that returns an empty array because something upstream broke — comes through
   a refresh with every stored row intact. Nothing is written and nothing is
   removed.

2. **A real answer may replace.** When the provider returns actual data for the
   season and it differs from what we hold, delete-and-insert is legitimate:
   that is the season having genuinely changed, which is the case this tool
   exists to apply. Applying it is an admin's deliberate act, not a side effect
   of a page load.

The consequence is that `synchronizeGroupTeams` keeps its delete-and-insert
exactly as written, matches gain a deletion this feature owns, and the whole
protection sits in two places: an empty answer is refused before it can touch
anything, and every non-empty answer is shown to the admin before it is applied.

### The case the silence guard cannot catch, and what does

A *partial* answer — non-empty, but truncated by something upstream — looks like
a real answer and would delete the matches it omits.

Nothing in the response distinguishes that from a season that genuinely lost
fixtures. So it is not guarded in code; it is **shown to a person**. The admin
sees `Poistuvia otteluita: 180` before anything is written and declines. That is
the confirmation step's real job, and the reason this feature is two steps
rather than one.

---

## Decisions this spec commits to

### It is a page under `/yllapito`

Settled, and not revisited: not a script, not a CLI, not a protected API route.
`requireAdmin()` already exists and `decisions/028-admin-tools-and-roles.md`
records that the role-and-gate pull request shipped first specifically to
unblock this.

The route is **`/yllapito/data`** — neutral, because the page covers both
providers and neither "taso" nor a competition region belongs in the path.

### Both providers, in this feature

#150 is written TASO-only. This covers football-data as well, decided in chat.

The foreign side is the cheaper half: one table, one fetcher, and no
group-standings machinery at all. What it adds is a competition list, two cache
keys, and one adapter. Everything expensive — the page, the gate, the form, the
preview, the confirmation, the run log and its table — is shared, and building
TASO alone would mean retrofitting a `source` discriminator through a shipped
log table later.

### Two steps: preview, then apply

The admin picks a competition and a season and presses `Hae muutokset`. Nothing
is written. The provider is called, the answer is compared against what we
store, and the difference is shown: how many matches would be added, changed and
removed, the same for group standings, and every team whose `starting_points`
would move.

Only `Päivitä` writes.

This is what makes a destructive operation safe without a guard that second-
guesses the provider, and it is also the honest answer to "did the deduction
land" — the admin sees the deduction in the preview, applies it, and the run log
records it.

### The current season is allowed

For a completed season the tool is the only way past `needsRefresh`. For the
current season it bypasses the fifteen-minute window, which is occasionally
useful after a provider corrects a result. One rule, one code path, and this is
not a tool anybody reaches for lightly.

### Every run is recorded, and the record outlives the operator

A page that shows only the run you just did answers "did it work" and not "when
did we last refresh this, and did *that* work" — both questions an admin will
have, months apart, about an operation nobody performs often enough to remember.

Each applied run writes a row carrying the full audit trail: provider,
competition, season, outcome, and how many matches and group rows were inserted,
updated and deleted. The page lists recent runs under the form.

`run_by` references `user.id` **`on delete set null`** — the only user reference
in this schema that is not `on delete cascade`. Deliberate in both directions:
the operational record survives an admin account being deleted, while the link
to the person does not, which is this project's existing rule for ids. The row
then renders as `Poistettu käyttäjä`. `decisions/028` relies on cascade to make
one `DELETE` remove everything a *reader owns*; an operational log is not
something a reader owns, so this is not a hole in that.

### `needsRefresh` is not touched

Neither copy. No parameter, no override flag, no force argument threaded through
`loadSeasonMatches`. The rule that a completed season is never refetched stays
exactly as it reads today, and this tool sits beside it rather than inside it.

### Season lists come from what already exists

No new season-discovery machinery. `listSelectableTasoSeasons` and
`getSeasonContext().selectableSeasons` already produce these lists for the
reader-facing pickers, and this page uses them unchanged.

---

## Scope

### In scope

- A page at `/yllapito/data`, linked from `/yllapito`, gated by `requireAdmin()`
- Picking one competition — Finnish or foreign — and one season of it
- A preview step that fetches from the provider, writes nothing, and reports
  exactly what would change
- An apply step that writes only what the preview showed
- TASO: `taso_matches` and `taso_group_teams`; football-data: `matches`
- Refusing outright when the provider's answer is empty for a season that has
  stored rows
- Recording every applied run in a new `refresh_runs` table, with insert/update/
  delete counts, and listing recent runs on the page

### Out of scope

- **Any deletion that is not the direct result of an admin confirming a
  non-empty provider answer.** Silence, errors and empty responses never remove
  a row.
- Bringing in seasons we do not already hold — new seasons arrive through the
  ordinary sync
- Automatic detection of retroactive changes; the operator decides when to run
- Any change to `needsRefresh`, or to the fifteen-minute refresh cycle
- A bulk re-sync of every season or every competition at once
- National-team competitions — `competitionsInRegion("national-teams")` is not
  offered. They have no standings depending on a deduction, which is the problem
  this solves.
- Retrying automatically on failure, beyond the admin pressing the button again

---

## UX / UI (Finnish strings)

### Reaching it

`/yllapito` gains one link above the user table:

- `Kauden uudelleenhaku`

`/yllapito/data` is rewritten to `/admin/data` in `next.config.ts`, and
`/admin/data` permanently redirects to `/yllapito/data`, exactly as `/yllapito`
already does. A non-admin gets the not-found page there on the same terms as
`/yllapito` — see spec 028: the body gives nothing away, the status is 200
because Next commits it before `notFound()` is caught, and `requireAdmin()` is
what actually refuses.

### The form

Heading:

- `Kauden uudelleenhaku`

Intro:

- `Hakee yhden sarjan ja kauden tiedot palvelusta uudelleen ja näyttää, miten ne muuttuisivat. Mitään ei kirjoiteta ennen kuin hyväksyt muutokset.`

Controls:

- `Sarja` — one `<select>`, grouped: `<optgroup label="Kotimaa">` listing
  `DOMESTIC_COMPETITIONS` in that list's own order, then
  `<optgroup label="Ulkomaat">` listing `competitionsInRegion("foreign")`.
  Default `Veikkausliiga`. The provider is implied by which group the choice is
  in; nothing asks the admin to name it.
- `Kausi` — a `<select>`, loaded for the chosen competition when the choice is
  made. Disabled and showing `Ladataan…` until it has; on failure
  `Kausien haku epäonnistui.` and the submit stays disabled.
- `Hae muutokset` — fetches and previews. While running: `Haetaan…`, disabled.

### The confirmation

Shown after a successful preview, as a dialog. Nothing has been written at this
point, and the copy says so.

- Heading: `Näin tiedot muuttuisivat`
- `{sarja} {kausi}`

Counts, each line omitted when its value is zero:

- `Uusia otteluita: {n}`
- `Muuttuvia otteluita: {n}`
- `Poistuvia otteluita: {n}`
- `Uusia sarjataulukkorivejä: {n}`
- `Muuttuvia sarjataulukkorivejä: {n}`
- `Poistuvia sarjataulukkorivejä: {n}`

Then the deductions, when any would move:

- `Muuttuvat pistevähennykset:`
- one row per team: `{joukkue}: {vanha} → {uusi}`

When the provider's answer matches what we hold:

- `Tiedot ovat jo ajan tasalla. Mitään ei muuttuisi.` — and the dialog offers
  only `Sulje`.

Otherwise:

- `Haluatko päivittää?`
- Buttons: `Päivitä` and `Peruuta`. While applying: `Päivitetään…`, disabled.

**Removals are shown, not just counted.** When matches would be removed, the
dialog lists them — date, home team, away team — up to twenty, then
`…ja {n} muuta.` A removal is the only irreversible thing this tool does, and a
number alone is not enough to judge it by.

### When the preview refuses

- The provider returned nothing for a season we hold rows for:
  `Palvelu ei palauttanut tälle kaudelle mitään, vaikka tallennettuja rivejä on {n}. Mitään ei muutettu.`
- The provider refused, timed out, or answered unusably:
  `Haku epäonnistui. Palvelu ei vastannut. Tallennetut tiedot jäivät ennalleen.`
- The competition or season was not one of the offered values:
  `Tuntematon sarja tai kausi.`
- The cache could not be cleared:
  `Välimuistia ei voitu tyhjentää, joten haku olisi palauttanut vanhaa tietoa. Mitään ei haettu.`

### When the apply refuses

- The provider's answer changed between the preview and the confirmation:
  `Tiedot muuttuivat haun jälkeen. Tarkista muutokset uudelleen.` — the dialog
  re-renders with the new preview rather than applying anything.
- The write failed:
  `Tallennus epäonnistui. Tallennetut tiedot jäivät ennalleen.`
- Our own database would not answer:
  `Tallennettujen tietojen luku epäonnistui. Mitään ei muutettu.`

### When the apply worked

- `{sarja} {kausi} päivitetty.`
- `Otteluita: {n} uutta, {n} muuttunutta, {n} poistettua.`
- TASO only: `Sarjataulukkorivejä: {n} uutta, {n} muuttunutta, {n} poistettua.`

Every message is rendered in a `role="alert"` region, as
`admin-user-table.tsx` already does for its refusals.

### The run list

Below the form:

- `Aiemmat päivitykset`
- Columns: `Aika`, `Sarja`, `Kausi`, `Tulos`, `Ottelut`, `Sarjataulukko`,
  `Pistevähennyksiä`, `Tekijä`
- `Tulos` is `Onnistui` or `Epäonnistui`
- `Ottelut` and `Sarjataulukko` read `{n} / {n} / {n}` for new, changed and
  removed, with a `{n} uutta, {n} muuttunutta, {n} poistettua` label for screen
  readers
- `Sarjataulukko` shows `—` for a foreign competition, which has none
- `Tekijä` shows the admin's name, or `Poistettu käyttäjä` once that account is
  gone
- Empty: `Ei aiempia päivityksiä.`
- Newest first, the twenty most recent. No paging: this list is short by
  construction, and if it ever is not, that is a finding in itself.

Times are formatted with `Intl.DateTimeFormat("fi-FI")` in `Europe/Helsinki`,
as `admin-user-table.tsx` already does.

---

## API & Data

### Loading the season list

Per chosen competition, not for all of them: there are ten foreign competitions,
`getSeasonContext` is per competition, and a cold Redis would turn one page load
into ten requests against a rate-limited plan.

Through a server action gated by `requireAdmin()` like every other:

- TASO: `resolveTasoSeasonContext(code)` for the ceiling, then
  `listSelectableTasoSeasons(currentSeason, earliestSeasonFor(code))`
- football-data: `getSeasonContext(code).selectableSeasons`, which already
  carries the `2025/26` labels

Both are Redis-cached for fifteen minutes, so a repeated choice costs nothing.
`resolveTasoSeasonContext` probes by syncing the current season — the same work
any `/kotimaa` page does on a cold cache, and named here because it means
choosing a competition can write current-season rows before anything is
submitted. That is the ordinary sync doing its ordinary job, not this feature
writing.

### What the preview calls

**TASO**, with the identifiers derived exactly as `domestic-page-context.ts`
derives them, so the rows compared are the rows the page reads:

- `competitionId = competitionIdForSeason(code, seasonId)` — the season umbrella
  `spljpNN`, or `M1LCUP26` for Ykkösliigacup
- `categoryId = categoryIdForSeason(code, seasonId)`, since a junior
  competition's rows are split across two or three ids by era
- `getSeasonMatches(competitionId, categoryId, seasonId)` and
  `getSeasonGroups(competitionId, categoryId)` → `normalizeGroupTeams`

Using `competitionIdFromSeason` from `taso.ts` instead of
`competitionIdForSeason` would silently query the umbrella for Ykkösliigacup and
compare against rows the cup page never reads.

**football-data**: `getSeasonMatches(competitionCode, seasonId)`.

### Caching

Every provider fetch is Redis-cached for fifteen minutes, so skipping
`needsRefresh` alone would refetch **from Redis** — the tool would preview and
apply data the provider was never asked for, and mark the season synced. The
relevant keys are deleted before the preview fetches; a clear that fails stops
the run, because fetching anyway means showing an admin a diff built from stale
data.

Cleared for the chosen competition + season:
`taso:matches:*` and `taso:category:*`, or `football-data:matches:*` and
`standings:{code}:{seasonId}`. That last one is the *computed* foreign table —
without it the page would keep serving the old standings after the database is
already correct.

Not cleared: `taso:season-context:*`, `taso:categories:*` and
`football-data:competition:*`, which cache which seasons and names exist rather
than the data being corrected.

Everything reader-facing is `force-dynamic`, so once the write lands the next
request sees it, with no Next cache in the way.

`invalidateCache` currently swallows its own failure and returns `void`, so a
caller cannot tell a cleared key from a Redis outage. It gains a `boolean`
return. Checked rather than assumed: it has **no production callers today** —
only `tests/unit/lib/cache.test.ts`, one of whose assertions is
`resolves.toBeUndefined()` and changes with it.

### The diff

Computed in TypeScript from the stored rows and the normalized provider rows,
before anything is written. It drives the dialog, and its counts are what the
run log records — so what the admin approved and what is recorded are the same
numbers by construction rather than by agreement.

- **Matches** are keyed by `providerMatchId`. Added: the provider has it and we
  do not. Changed: both have it and any stored column differs. Removed: we have
  it and the provider does not.
- **Group teams** are keyed by `(groupId, teamProviderId)` — the identity the
  unique index already uses. Same three buckets, plus a deduction change
  whenever `startingPoints` moves between the two.

The provider's group rows are **deduplicated with the writer's own rule before
being diffed or hashed**. A knockout group returns one row per bracket slot, so
a team that advances appears several times, and `synchronizeGroupTeams` keeps
the first and drops the rest. Diffing the raw rows would promise an admin more
inserts than the apply performs — and write that promise into the audit log.

A stable hash of the normalized provider rows travels with the preview. The
apply recomputes it; if it no longer matches, the provider's answer moved
between the two steps and the apply refuses, re-previewing instead. Cheaper and
more honest than storing a megabyte of snapshot against a token, and it makes
"what you saw is what you applied" a checked fact.

### What the apply writes

- Matches: `synchronizeMatches` for the source, unchanged — it upserts the
  provider's rows — followed by a delete of exactly the match rows the diff
  listed as removed, by `providerMatchId`. That deletion is this feature's own,
  and it happens only here.
- Group teams (TASO): `synchronizeGroupTeams`, unchanged. Its delete-and-insert
  is correct here, because it only ever runs against a non-empty answer an admin
  has approved.
- Both inside one transaction per source, so a half-applied season is not a
  state this can produce. **The writers take the transaction as an argument**;
  reaching for the module-level `db` inside them would mean each commits on its
  own connection while the caller believes it is inside a transaction.

### Schema

New table, migration generated by `drizzle-kit`:

```ts
export const refreshRuns = pgTable("refresh_runs", {
  id: serial("id").primaryKey(),
  /** "taso" | "football-data" — validated in TypeScript, like favourite-keys.ts. */
  source: text("source").notNull(),
  competitionCode: text("competition_code").notNull(),
  seasonId: integer("season_id").notNull(),
  /** "success" | "failed". */
  status: text("status").notNull(),
  /** The failure reason code, null on success. */
  reason: text("reason"),
  matchesInserted: integer("matches_inserted").notNull().default(0),
  matchesUpdated: integer("matches_updated").notNull().default(0),
  matchesDeleted: integer("matches_deleted").notNull().default(0),
  /** Null for football-data, which stores no group standings. */
  groupRowsInserted: integer("group_rows_inserted"),
  groupRowsUpdated: integer("group_rows_updated"),
  groupRowsDeleted: integer("group_rows_deleted"),
  deductionsChanged: integer("deductions_changed").notNull().default(0),
  /** Set null, not cascade — see the decision above. */
  runBy: text("run_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

`text` rather than a Postgres enum for `source` and `status`, matching the
reasoning already recorded for `user.role`: adding a value to an enum is a
migration that takes a lock, and this repository validates small closed sets in
TypeScript.

The deduction **detail** is not stored, only the count. The schema uses no
`jsonb` anywhere today and this is not the feature to introduce it in; the
detail is shown in the preview that produced it, and the count is what answers
"did anything change" later.

No index on `created_at`. The table gains a handful of rows a year and the list
reads twenty.

### Types

A client-safe module with no database import — the boundary
`admin-user-view.ts` and `favourite-keys.ts` exist for:

```ts
export const REFRESH_SOURCES = ["taso", "football-data"] as const;
export type RefreshSource = (typeof REFRESH_SOURCES)[number];

export type DeductionChange = { teamName: string; from: number; to: number };

export type RemovedMatch = {
  providerMatchId: number;
  /** ISO 8601. `kickoff_at` is `not null` in both match tables. */
  kickoffAt: string;
  homeTeamName: string;
  awayTeamName: string;
};

export type RowCounts = { inserted: number; updated: number; deleted: number };

export type RefreshPreview = {
  competitionName: string;
  seasonLabel: string;
  matches: RowCounts;
  /** Null for football-data. */
  groupRows: RowCounts | null;
  deductionChanges: DeductionChange[];
  removedMatches: RemovedMatch[];
  /** Guards the apply against the provider's answer moving underneath it. */
  snapshotHash: string;
};

export type RefreshFailureReason =
  | "input"
  | "cache"
  | "provider"
  | "empty"
  /** Our own database would not say what we currently hold. */
  | "read"
  | "stale"
  | "write";

export type PreviewResult =
  | { ok: true; preview: RefreshPreview }
  | { ok: false; reason: RefreshFailureReason; storedRows?: number };

export type ApplyResult =
  | { ok: true; applied: RefreshPreview }
  | { ok: false; reason: RefreshFailureReason; preview?: RefreshPreview };
```

---

## Edge Cases

- **The provider returns nothing for a season we hold rows for.** Refused at
  preview, `reason: "empty"`, nothing written, nothing deleted, and the message
  says how many rows were kept. This is the silence half of the rule.
- **One TASO endpoint answers and the other does not.** Refused on the same
  terms. The guard is applied **per table**: matches silent with matches
  stored, *or* group standings silent with group standings stored. Testing both
  together with an `&&` reads as the same rule and is not — TASO answering with
  matches but no group standings would walk past it, and `synchronizeGroupTeams`
  deletes before it inserts, so a completed season's standings would be
  destroyed by a run that reported success.
- **The provider returns nothing for a season we hold no rows for.** Not a
  refusal — there is nothing to protect. The preview reports that nothing would
  change.
- **A partial answer.** Indistinguishable from a real one in the response, so it
  is not guarded in code: it is shown, with removals listed by name, and the
  admin declines. Named as the reason the confirmation step exists.
- **The provider's answer changes between preview and apply.** The snapshot hash
  no longer matches, so the apply refuses with `"stale"` and shows the new
  preview. Nothing is written on a diff nobody approved.
- **The competition or season is not one of the offered values.** Both actions
  are public network endpoints, so both validate server-side — the code against
  `parseDomesticCompetitionParam` or `parseCompetitionParam`, the season against
  the range freshly resolved for that competition — rather than trusting a
  `<select>`. `reason: "input"`; no run row, because nothing happened.
- **Redis cannot be cleared.** Refuse before fetching, `reason: "cache"`.
- **The provider fails, times out, or answers malformed JSON.**
  `reason: "provider"`, nothing written. TASO's ten-second `RENDER_TIMEOUT_MS`
  applies here as everywhere.
- **`getMatches` succeeds and `getCategory` fails** (TASO). The preview fails as
  a whole rather than offering a half-diff: a partial preview would ask the
  admin to approve something the apply could not honour.
- **Nothing would change.** The dialog says `Tiedot ovat jo ajan tasalla.` and
  offers no `Päivitä`. A no-op is a useful answer and must not look like a
  failure, nor write a run row.
- **Two admins apply the same season at once.** The second transaction's hash
  still matches — the provider's answer has not moved — so it applies a diff
  whose work is already done: the upserts are idempotent and the deletes remove
  nothing. Both runs are recorded, the second with zeroes.
- **The admin is demoted between loading the page and submitting.**
  `requireAdmin()` runs first in every action, before the arguments are looked
  at, so both preview and apply refuse.
- **The account that ran a refresh is deleted.** The run row survives with
  `run_by` null and renders as `Poistettu käyttäjä`.
- **Writing the run row fails after a successful apply.** Logged, and the
  success is still reported — the data is correct, and losing the record of it
  is not a reason to tell an admin their change failed.

---

## Performance & Limits

One TASO preview is two requests: `getMatches` at roughly 0.6–1.1 MB for a
season category, and `getCategory`, which is far smaller. One football-data
preview is one request. Measured during the #365 investigation: per-request
worst case 80–512 ms, JSON parsing too cheap to register.

The apply refetches through the now-warm Redis entry rather than the provider,
so confirming costs no second provider call in the ordinary case.

The writes are one upsert of the season's matches (a few hundred rows), a delete
of whatever the diff listed, and for TASO one delete-and-insert of its group
rows (tens). Comparable to a cold current-season page load.

football-data's plan is rate-limited, which is why season lists load one
competition at a time rather than ten on page load.

Buttons are disabled while their request is in flight. Nothing rate-limits the
tool beyond that: the admin set is two people, and both providers are the same
ones every page render already calls.

---

## Security & Secrets

- `requireAdmin()` is called first in the page and first in **all three**
  actions — season list, preview, apply — before any argument is read. A server
  action is a public network endpoint whether or not a control renders for it.
- The apply re-validates everything the preview validated. It does not trust the
  preview's own output, which arrives from the browser: the competition, the
  season and the diff are all recomputed server-side, and the hash only decides
  whether the recomputed diff is the one the admin saw.
- No new environment variable. `TASO_API_KEY`, `FOOTBALL_DATA_API_KEY` and
  `DATABASE_URL` already exist and stay in the deployment; nothing is added to
  `.env.example`.
- The page is `force-dynamic`, like every other admin surface.
- Failures are logged with `logger.error` including source, competition, season
  and the acting admin **id** — ids, not addresses, matching the rest of the
  admin code.
- No user-supplied string reaches a provider URL or a cache key: competition
  codes are matched against the registries and the season is an integer inside a
  freshly resolved range, so every identifier is built from values this
  repository owns.
- The run list shows an admin's name, already visible to any admin on
  `/yllapito`. It adds no disclosure.

---

## Acceptance Criteria

- [ ] An admin can preview and then apply a re-sync of one competition + season
      from `/yllapito/data`, without a redeploy and without touching the
      database
- [ ] **The preview writes nothing** — no row inserted, updated or deleted in
      any table by a preview, whatever the provider answered
- [ ] **A provider answer that is empty for a season with stored rows is refused
      outright**: nothing written, nothing deleted, and the refusal says how
      many rows were kept
- [ ] A provider failure leaves stored rows exactly as they were
- [ ] The apply writes only what the preview showed, and refuses when the
      provider's answer moved in between
- [ ] Matches the provider no longer returns are removed only by a confirmed
      apply, and are listed by name in the confirmation before that
- [ ] A TASO run covers `taso_matches` and `taso_group_teams`; a football-data
      run covers `matches`
- [ ] The provider's Redis entries for that competition + season are cleared
      before the preview fetches, `standings:{code}:{seasonId}` included, and a
      failed clear stops the run
- [ ] `needsRefresh` is unchanged in both services, and a completed season is
      still never refetched by any page
- [ ] The confirmation shows added, changed and removed counts for both tables,
      and every team whose `starting_points` would move, old → new
- [ ] Every applied run — success or failure — is recorded in `refresh_runs`
      with its insert/update/delete counts, and the twenty most recent are
      listed on the page
- [ ] Deleting an admin account leaves their run rows in place, with the person
      no longer identifiable from them
- [ ] A non-admin — signed out or signed in — gets the not-found page at
      `/yllapito/data`, and all three server actions refuse them
- [ ] An unknown competition code or an out-of-range season is refused
      server-side, whatever the form sent

---

## Tests Required

### Unit — `tests/unit/`

- `lib/refresh-diff.test.ts` — the pure diff: added, changed, removed and
  untouched matches; a column-level change detected on each stored column; group
  teams keyed by `(groupId, teamProviderId)` with the same team id in two groups
  counted separately; deduction changes over moved, unmoved, new and vanished
  teams; the snapshot hash stable across reorderings of the same rows and
  different for any changed value.
- `lib/force-refresh.test.ts` — with providers, `cache.ts` and the writers
  mocked. **The preview calls no writer at all** — asserted directly, because
  that one fact is half the safety of this feature. An empty answer against
  stored rows returns `"empty"` and calls no writer either. A `false` from
  `invalidateCache` returns `"cache"` and calls no fetcher. A throwing fetch
  returns `"provider"`. A mismatched hash on apply returns `"stale"` and writes
  nothing. The identifiers passed to TASO are
  `competitionIdForSeason`/`categoryIdForSeason`, asserted for `M1LCUP` as well
  as an umbrella competition. Every cache key that must be cleared is asserted
  cleared, and the three that must not be are asserted untouched.
- `lib/cache.test.ts` — extend: `invalidateCache` returns `true` on a delete and
  `false` when `redis.del` throws; the existing `resolves.toBeUndefined()`
  assertion becomes `resolves.toBe(true)`.
- `components/refresh-form.test.tsx` — the Finnish strings; the grouped
  competition select; the season select disabled until loaded and after a load
  failure; buttons disabled while pending; every refusal message.
- `components/refresh-confirm.test.tsx` — zero-valued count lines omitted; the
  deduction list rendering `{team}: {old} → {new}`; removed matches listed and
  truncated at twenty with `…ja {n} muuta.`; the no-change dialog offering only
  `Sulje`; `Päivitä` absent until there is something to apply.
- `components/refresh-run-list.test.tsx` — the columns, `Onnistui`/
  `Epäonnistui`, `—` for a foreign competition's group counts,
  `Poistettu käyttäjä` for a null `runBy`, and the empty state.
- `app/admin/data/page.test.tsx` — **this file must exist even though it is
  thin.** Vitest measures only files a test imports, so a page with no test is
  reported as 100% covered while Sonar reports it as 0% — the trap
  `tests/unit/app/settings/page.test.tsx` documents in its header and the one
  that failed #370's gate at 70.1%. Asserts `notFound()` for a null
  `requireAdmin()` and the form rendered for an admin.

### Integration — `tests/integration/refresh.test.ts` (new)

Against a real Postgres, with the providers' HTTP layer stubbed:

- **A preview leaves the database byte-for-byte unchanged** — row counts and
  `updated_at` values identical before and after, for both sources. The
  assertion that fails if a preview ever gains a write.
- **An empty group answer against a season with stored rows: every row is still
  there afterwards**, and the result is `"empty"`. Written against a real
  Postgres rather than a mocked transaction, because this is the rule.
- **An empty match answer against a season with stored matches: every match is
  still there afterwards.** Same, both sources.
- A completed TASO season with a changed `starting_points`: previewed as a
  deduction change, applied, and the stored row carries the new value.
- A match the provider no longer returns: listed as removed in the preview,
  still present after the preview, gone after the apply, and counted in
  `matches_deleted`.
- A failing group fetch: `taso_group_teams` still holds its previous rows.
- A football-data apply writes `matches` and records a run row with null group
  counts.
- Deleting the acting admin leaves the run row present with `run_by` null —
  asserted alongside #119's existing cascade test, so the exception is visible
  next to the rule.

### E2E — `tests/e2e/admin.spec.ts` (extend)

- A signed-out visit to `/yllapito/data` gets the not-found page, not the form.
- `/admin/data` redirects to `/yllapito/data`.

The signed-in path is not driven end to end: it would call both providers for
real from the test run. The integration suite covers it against stubs.

---

## Files To Update

Delivered as **two pull requests, one spec**, split by what they risk rather
than by provider:

1. **The engine.** Everything server-side, for both providers, with the tests
   that prove the never-delete rule against a real Postgres. No user-visible
   surface.
2. **The surface.** The server actions, the page, the three components, the
   routing, the docs and the e2e specs.

The split is not the one first proposed in chat (TASO, then a football-data
adapter). That one put ninety-five per cent of the work in the first pull
request and a single adapter in the second, which is not a split. This one puts
the data-safety half in front of a reviewer on its own, which is where the risk
actually is.

### Pull request one — the engine

New:

- `specs/029-forced-season-refresh.md`
- `decisions/029-forced-season-refresh.md`
- `src/lib/refresh-view.ts` — client-safe types, source and input validation
- `src/lib/refresh-competitions.ts` — which competitions are offered, and their
  names. Its own module because both the engine and the log need it, and having
  the log import the engine would be a cycle.
- `src/lib/refresh-diff.ts` — the pure diff and the snapshot hash
- `src/lib/force-refresh.ts` — cache clearing, both adapters, preview and apply
- `src/lib/refresh-runs.ts` — reading and writing `refresh_runs`
- `drizzle/migrations/0016_next_bullseye.sql` — generated, `refresh_runs`
- `tests/unit/lib/refresh-{view,competitions,diff,runs}.test.ts`,
  `tests/unit/lib/force-refresh.test.ts`,
  `tests/integration/refresh.test.ts`

Changed:

- `src/db/schema.ts` — `refreshRuns`
- `src/lib/cache.ts` — `invalidateCache` returns `boolean`
- `src/lib/taso.ts`, `src/lib/football-data.ts`, `src/lib/standings-service.ts`
  — **the Redis key each module owns becomes an exported builder**, used at its
  original call site. Spelling a key out again inside `force-refresh.ts` would
  make it a second source of truth, and the resulting failure is silent: the
  refetch simply answers out of the cache the run exists to bypass.
- `src/db/index.ts` — an `Executor` type: the database, or a transaction on it.
- `src/lib/standings-service.ts`, `src/lib/taso-standings-service.ts` — both
  `synchronizeMatches` and `synchronizeGroupTeams` take an optional executor,
  defaulting to `db` so every existing caller is unchanged. Without it a caller
  that opens a transaction does not actually get one.
  `dedupeByIdentity` is exported from `taso-standings-service.ts` so the diff
  can apply the writer's own rule rather than a copy of it.
- `tests/unit/lib/cache.test.ts` — `invalidateCache` now answers `true`/`false`
- `tests/unit/db/schema.test.ts` — the `set null` exception asserted beside the
  cascade rule it departs from

### Pull request two — the surface

New:

- `src/lib/refresh-actions.ts` — the `"use server"` boundary, three actions
- `src/app/admin/data/page.tsx`
- `src/components/refresh-form.tsx`
- `src/components/refresh-confirm.tsx`
- `src/components/refresh-run-list.tsx`
- `tests/unit/app/admin/data/page.test.tsx`,
  `tests/unit/components/refresh-{form,confirm,run-list}.test.tsx`

Changed:

- `src/app/admin/page.tsx` — the link to the new page
- `next.config.ts` — the `/yllapito/data` rewrite and the `/admin/data` redirect
- `docs/setup/023-admin-access.md` — what an admin can do there, when to run it,
  and that a preview never writes
- `tests/e2e/admin.spec.ts` — the refusal and the redirect

### Not changed, deliberately

`needsRefresh` keeps its current behaviour exactly, in both services.
`synchronizeMatches` and `synchronizeGroupTeams` keep theirs too — the executor
parameter is additive and defaulted, so no existing call site behaves
differently. The only new writer in the feature is the match deletion, which no
existing caller performs.

Checked, not assumed: `README.md` lists no admin surfaces, so it needs no change
unless that is wrong at implementation time.

---

## Open Questions

None outstanding. Both providers, the two-step confirmation, the `/yllapito/data`
route, the audit counts and the `on delete set null` exception were all settled
in chat before this was written.
