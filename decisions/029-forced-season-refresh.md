# 029 — Forced season refresh: decisions

Implementation notes for #150, spec `specs/029-forced-season-refresh.md`.
Written as the work happens; this covers the first of two pull requests — the
engine, with no user-visible surface. The page, the actions and the components
follow, and their decisions land here too.

## The rule arrived from Miikka, and it inverted the design

My first draft took "never delete" as an absolute and gave the forced path an
upsert-only writer, extracting the upsert half out of `synchronizeGroupTeams`.

Miikka's correction was sharper than the rule I had written:

> both in taso and in football-data we don't know if they stop providing some
> old season now. so what i don't want to happen, is that something is deleted
> from our db just because the provider stopped sharing that data. if the old
> season has changed and that is updated by our admin, then it's ok to delete
> and insert new rows

The rule is about **provider silence**, not about deletion. That is a better
line, and it costs less: `synchronizeGroupTeams` keeps its delete-and-insert
untouched, no writer is extracted, and the stale-group-row problem its comment
warns about never arises. The whole protection collapses into one branch — an
empty answer for a season we hold rows for is refused before it reaches a
writer — plus a person looking at the diff.

## The confirmation step is the control, not a courtesy

A *partial* answer — non-empty but truncated upstream — is indistinguishable
from a season that genuinely lost fixtures. Nothing in the response separates
them, so nothing in the code can.

That is why this is two steps. The preview fetches, compares and writes
nothing; the admin sees `Poistuvia otteluita: 180` with the matches listed by
name and declines. Removals are listed rather than counted for exactly this
reason: a number is not enough to judge a deletion by.

So the two-step flow is load-bearing. If a later change collapses it into one
button, the feature loses its only defence against a truncated response.

## Redis would have made the whole feature a no-op

`getSeasonMatches` and `getSeasonGroups` are cached for fifteen minutes.
Skipping `needsRefresh` alone refetches **from Redis**, so the tool would have
previewed and applied data the provider was never asked for — and marked the
season synced.

Two consequences, both in the code:

`invalidateCache` gained a `boolean` return, and a failed clear **stops the
run**. Swallowing it would mean showing an admin a diff built from the very
data they are trying to correct. It had no production callers at all before
this — only a test — so nothing else changed behaviour.

And `standings:{code}:{seasonId}` is cleared too. That one is the *computed*
foreign table, and it is the one that would have been missed: the database
write genuinely succeeds, so the only symptom is the page serving the old
standings for another fifteen minutes. All seven cache keys in the codebase
were enumerated to decide which four go and which three stay.

## The cache keys became builders

Each key now exists once, in the module that owns it, exported and used at its
original call site. `force-refresh.ts` imports them.

Spelling `taso:matches:${competitionId}:${categoryId}` out a second time inside
the refresh would have made it a second source of truth, and the failure mode
is silent: change the key in `taso.ts` and the refresh clears a key nobody
reads, then refetches out of the cache it meant to bypass, and reports success.

This is the only change to `taso.ts`, `football-data.ts` and
`standings-service.ts`. `needsRefresh` and the synchronize functions are
untouched.

## The apply reads through the cache the preview warmed

The preview clears and fetches; the apply does not clear.

Inside the fifteen-minute window the apply therefore sees the same bytes the
preview did, so the hash matches, no second provider call is made, and "what
you saw is what you applied" is the ordinary case rather than a race. Past the
window it refetches and the hash check turns a changed answer into a refusal.

My first version cleared on both, which would have doubled provider load and
made a stale bounce likely on any season still being played. Caught by writing
the test for "does not clear the cache again" and finding it failed.

## The hash, rather than storing the snapshot

The alternative was parking the fetched snapshot — up to a megabyte — in Redis
against a token, and applying exactly those bytes.

The hash is cheaper and says the same thing: it is taken over the normalized
provider rows, ignores row order (the provider owes us no order), and is
length-prefixed per group so matches and group standings cannot be swapped for
each other. A mismatch means the answer moved, and the apply hands back the
fresh diff instead of writing something nobody approved.

Miikka's call on the mechanism: "i don't know the details. i trust your
investigation and judgement on this technical decision."

## `run_by` is the one `set null` in the schema

Every other user reference cascades, and `decisions/028-admin-tools-and-roles.md`
leans on that: one `DELETE` removes everything a reader owns, with no second
code path to forget.

A refresh log is not something a reader *owns* — it is a record of what was done
to the application's data. So the row survives the account and the link to the
person does not, which is this project's existing rule for ids ("id's are ok, if
after deletion can't be linked to user"). It renders as `Poistettu käyttäjä`.

`tests/unit/db/schema.test.ts` asserts it beside the six cascades, because
"make it consistent with the others" is exactly the change someone would make
here in good faith.

## The diff is pure, and it feeds both the dialog and the log

One computation, two consumers. The counts an admin approves and the counts the
run log records are the same numbers by construction rather than by two pieces
of code agreeing — which is the failure this project has hit before.

`rowChanged` iterates the **provider row's own keys** rather than a hand-written
column list. Both normalized provider types mirror their table's columns
exactly — that is stated in `schema.ts` and is what lets a stored row satisfy
the provider type structurally — so those keys are the columns the upsert
writes. A hand-written list would be a second thing to keep true, and the
column it silently missed would be a change the admin was never shown.

`valuesDiffer` needs its own `Date` case. Without it two `Date` objects for the
same instant are never `===`, every match reads as changed on every run, and the
confirmation dialog is worthless. That is a mutation the tests now kill.

## What the tests are actually for

The unit suite can show a writer was not *called*. Only Postgres can show the
rows are still *there*, which is the claim that matters. Two mutations were run
to prove the integration tests earn their place:

| Mutation | Result |
|---|---|
| the empty-answer refusal removed | 2 failures — stored matches and stored group rows both destroyed |
| the match delete widened from the listed ids to the season | 1 failure — the season emptied |

The second is the one a mocked `where` cannot catch: it cannot tell a delete
scoped to one id from a delete scoped to a whole season.

Fourteen further mutations were run across `refresh-diff.ts` and
`force-refresh.ts` — six on the diff, seven on the engine, one on the read
guard. One survived: the foreign half of the empty-answer refusal had no test,
because the two providers have separate diffs and separate early returns, so
removing one left the other passing. A test was added and the mutation now
fails.

## A database that will not answer is its own refusal

The self-review pass (`skills/self-review.md`, class 2 — "a failure path
dropped") caught this before review did: the reads of what we currently hold
had no handler, so one Postgres blip would have thrown out of the engine.

The caller is a server action answering a client component, so a throw reaches
an admin as a generic browser error with nothing to act on. `"read"` is its own
reason rather than folded into `"provider"` — the provider answered fine, our
database did not, and that distinction tells an operator which system to look
at.

## One branch was deleted rather than tested

`resolve()` mapped `listSeasonsFor`'s refusal through
`seasons.reason === "input" ? "input" : "provider"`. The `"input"` side is
unreachable: `listSeasonsFor` only answers that for an unknown competition, and
the line above had already rejected those.

Removed rather than covered. A guard duplicating a check that has already run is
a second source of truth, and this repository has paid for that before (#193).

## Three things review caught that I had not

All three were in `force-refresh.ts`, and all three were places where the code
said one thing and I had written the other down as fact.

**The transaction did not cover the writes.** `writeSnapshot` opened
`db.transaction` and passed `tx` only to the deletion; the synchronize functions
reached for the module-level `db` and committed on their own connections. The
spec, this record and the pull request body all claimed atomicity that did not
exist — a group replacement could land and a later deletion fail, leaving a
season half applied. The writers now take an `Executor` (the database, or a
transaction on it), defaulted to `db` so every existing caller is unchanged.

**The silence guard was one rule where it needed two.** It refused only when
matches *and* group standings were both empty. TASO answering with matches but
no group standings therefore walked past it — and `synchronizeGroupTeams`
deletes before it inserts, so a completed season's standings would have been
destroyed by a run that reported success. That is the feature's own core rule,
failing in the exact case it exists for.

My integration test for it seeded *only* group rows, so both answers were empty
and the test passed. A test that happens to satisfy the weaker condition is the
first defect class in `skills/self-review.md`, and I wrote one while believing I
was proving the opposite.

**The diff counted rows the writer would not store.** A knockout group returns
one row per bracket slot, so a team that advances appears several times.
`synchronizeGroupTeams` keeps the first and drops the rest; the diff counted
them all. The preview would have promised more inserts than the apply performed
and written that promise into the audit log — breaking the one property the log
is for. `dedupeByIdentity` is now exported and applied before diffing *and*
before hashing, so the diff describes what will actually be stored.

Each fix was mutation-checked by reverting it: all three fail at both unit and
integration level now, and none of them did before.

## Two more, on the second round

**The preview could write, through a door I had documented rather than closed.**
`listSeasonsFor` called `resolveTasoSeasonContext`, which decides its default
season by *synchronizing* the current one. So merely previewing a TASO season
could mutate current-season rows — against the engine's one promise, and against
an acceptance criterion in this feature's own spec.

I had even written the behaviour into the spec as a note, framed as "the
ordinary sync doing its ordinary job, not this feature writing". That framing
was wrong: a write that happens because someone pressed a button in this tool is
this tool writing. Describing a defect accurately is not the same as it being
acceptable, and a note is not a decision.

Fixed by splitting the read-only half out as `resolveTasoSeasonCeiling` and
having both callers share it. Extracted rather than reimplemented, because the
floor clamp is subtle enough that two copies would drift.

The integration test that claims a preview changes nothing had been passing
while mocking the very call that writes. It now asserts the probing resolver is
never reached, with a counter rather than a `vi.fn` so `clearAllMocks` cannot
erase the evidence.

**An attempted apply could vanish from the log.** When `resolve` failed because
the provider could not say which seasons exist, `applyRefresh` returned without
recording anything — while the spec requires every attempted run to be recorded.
Now recorded; `"input"` still is not, because a request naming a competition
this app does not have is malformed rather than an event that happened to the
data.

## The audit log stores the season label rather than deriving it

Third round, and this one I had decided the wrong way on purpose.

`listRuns` rendered `String(seasonId)`, with a comment explaining that deriving
the picker's label would cost a provider call per row to learn whether a foreign
season spans two calendar years. True, and the wrong conclusion: a foreign run
would read `2025` in the log where every other surface says `2025/26`.

Review's second suggestion is the one I should have reached — **persist the
label the preview already computed**. No provider call, and the log agrees with
the picker. Null only when the run failed before the range could be resolved,
which is the one case where it is genuinely unknown; the list falls back to the
id there.

The migration was regenerated rather than followed by a second one, since the
table is unreleased and arriving in two migrations within one pull request would
be untidy for no gain. Anyone holding this branch with the old migration applied
has to drop `refresh_runs` and its journal row; a fresh environment is
unaffected.

## Round four: the contract said three things the code did not

**The tool could import a season.** The season list came from the provider's
range, which includes seasons this app has never stored — so an admin could
preview and apply one, and the tool would *create* it. The spec's own scope says
new seasons arrive through the ordinary sync. Narrowed to the seasons we hold
rows for, counting both TASO tables, since a season can hold standings without
matches and a deduction there is exactly the case this exists for.

A competition with nothing stored now offers an empty list, which is the honest
answer: there is nothing to correct.

**The approval hash covered one side of the comparison.** It was taken over the
provider's rows only, so the *stored* side could move between preview and apply —
another admin applying, or the ordinary sync touching a current season — and the
apply would still accept an approval built against rows that were gone. The
admin approves removals **by name**, so this was not academic: it could have
removed matches nobody had seen listed. The hash now covers both sides, and
either moving re-previews.

**The audit contract was wider than the behaviour.** A stale bounce is not
recorded, deliberately — it is the apply working as designed, and the admin is
about to see a fresh diff and decide again. But the acceptance criterion said
"every applied run — success or failure". Review offered both resolutions;
narrowing the stated contract is the right one, so the criterion now names the
two refusals that are excluded and why. The behaviour did not change; the
promise did, to match it.

That is three rounds in a row where the defect was the same shape: a property
asserted in prose while the code did something narrower. The lesson is not
"write fewer claims" — it is that every claim in a spec is a test I have not
written yet.

## Round five: the last two, both narrower than what came before

**The approval was checked outside the transaction that acted on it.** Closing
the hash over both sides (round four) stopped an apply accepting an approval
built against rows that had since changed — but only as far as the read that
computed it, which happened before the transaction opened. Between that check
and the write, another apply could still commit.

The hash is now recomputed **inside** the transaction, from rows read through
it, and the transaction is `serializable` — the same level
`scripts/grant-admin-run.ts` uses, for the same reason: re-reading alone is not
enough under read-committed. This runs a handful of times a year, so the
strictest isolation costs nothing against overwriting somebody's correction.

That also forced the hashing rule into one function used by both the diff and
the re-check. Two copies of it would have been free to disagree, which is
exactly the failure the hash exists to prevent.

**A database failure was still being reported as a provider failure.** I added
the `"read"` reason two rounds earlier for precisely this, then introduced a new
database read — the one listing which seasons are stored — inside the `try` that
maps everything to `"provider"`. `resolve` then flattened it a second time. Both
fixed, and the reason is now carried rather than collapsed at every level.

That one is worth naming plainly: it was not a subtle interaction. It was me
adding a distinction and then failing to apply it to the next thing I wrote.

## Round six: two findings, one structural cause

Both of these were seams, so both were fixed as seams rather than patched.

**The preview and the write each built their own view of reality.** A stale
bounce inside the transaction returned the *caller's* preview — a diff of rows
that were no longer stored — inviting an admin to approve it a second time.

The two diff functions collapsed into one pure `compare(snapshot, stored,
resolved)`, used by the preview against rows read from the database and by the
write against rows read inside its own transaction. A refusal now hands back a
diff describing what is actually there.

That seam is worth naming, because it produced findings in three separate
rounds: the silence guard was right in one diff function and wrong in the other,
the knockout dedupe was applied in one and not the next, and the hash was spelled
out at each call site. One rule in one place ends that class, rather than the
individual bugs it kept producing.

**"What seasons do we hold" was answered twice, differently.** The season list
read both TASO tables; the ceiling's fallback read only `taso_matches`. A
competition held purely as group standings therefore looked unstored, and with
discovery unavailable its ceiling fell below its own data — so the one season
with a deduction to correct was the one that could not be selected.

Fixed by moving the question to the service that owns the tables:
`storedTasoSeasons` and `storedForeignSeasons`. `newestStoredSeason` is now
derived from the former, and `force-refresh.ts` dispatches rather than querying.
A module that orchestrates a refresh should not know which columns answer "what
do we hold" — that it did is why the two answers were free to drift.

## Sorting for a hash is not sorting for a reader

Sonar flagged both `.sort()` calls in `refresh-diff.ts` and asked for
`localeCompare`. Declined, with an explicit comparator instead.

Both sorts canonicalise input for a hash. `localeCompare` answers by the
runtime's locale data, so two machines — or one machine after an ICU upgrade —
could order the same keys differently and hash identical rows to different
digests. The apply would then refuse a diff nobody had changed, as `"stale"`,
and re-previewing would not help. Code-unit order is boring and identical
everywhere, which is the entire requirement.

Where this repository sorts for *display* it uses `localeCompare` with a
locale, and should.

## Delivered as two pull requests, one spec

Split by risk rather than by provider. This pull request is the engine for both
providers, with the never-delete proof; the next is the page, the actions and
the components.

The split first proposed in chat — TASO, then a football-data adapter — would
have put almost all of the work in the first pull request and a single adapter
in the second. That is not a split. Miikka's instruction was "split it the best
way you can", so this one puts the data-safety half in front of a reviewer on
its own, which is where the risk is.

football-data turned out to be the cheaper half rather than a second feature:
one table, one fetcher, a `synchronizeMatches` that already never deletes, and
no group-standings machinery at all.

---

Below: the second pull request — the page, the actions and the components.

## The dialog is the feature, and the form is the smaller half

Most of the work in this pull request is one dialog. That is the right
proportion: the engine can refuse a *silent* provider, and only a person can
refuse a *truncated* one. Everything else here exists to put that decision in
front of someone.

So removals are listed by date and teams rather than counted, capped at twenty
with `…ja {n} muuta.` A count answers "how many"; an admin about to delete
history needs "which".

The dialog offers no `Päivitä` at all when nothing would change — it says
`Tiedot ovat jo ajan tasalla.` and a `Sulje`. Offering a button that would write
nothing invites a click that means nothing.

## The season list loads per competition, not per page

Ten foreign competitions, each needing its own `getSeasonContext`. Resolving
them on mount would turn a cold cache into ten requests against a rate-limited
plan, so the list is fetched for the competition actually chosen.

That makes the effect racy by construction — a slow answer for a competition
nobody has selected any more would overwrite the current one — so the effect
cleans up after itself and a stale answer is dropped. Both the resolve and the
reject path are tested, because the second one is the easy one to forget.

## Three guards that turned out to be unreachable, and were removed

`onPreview` and `onApply` began with `if (season === null) return;`, and the
component defaulted its competition with `?? ""`. None could fire: the button is
disabled until a season exists, and the registries are non-empty literals.

Coverage found them and they were deleted rather than tested, the same call made
on the engine's dead ternary. The season is narrowed once, where the button is
rendered, so the handlers take a `number` and have nothing to check. What
remains — a competition list that is genuinely empty — is a real degenerate case
and has a test.

## Verified by loading it, not by rendering it in jsdom

An acceptance criterion saying an admin can preview and apply is not met by a
component test. So it was driven against a production build, signed in with a
real session, and pointed at the **test** database — the development one is not
something this work may touch, and it had not had the migration applied anyway.

- Signed out, `/yllapito/data` gives the not-found page and contains none of the
  admin strings; signed in as an admin, all of them.
- The season picker offered `2026, 2025, 2022, 2020, 2019, 2017, 2015` — exactly
  the seasons the database holds, two of which exist only as group standings.
  Nothing else: the tool cannot reach a season it has never stored.
- A preview of Veikkausliiga 2022 called TASO for real, diffed 167 stored
  matches, and reported `Tiedot ovat jo ajan tasalla.` — which also shows the
  diff does not invent changes on identical rows.
- One stored match was then corrupted (`home_goals` set to 99). The preview
  reported `Muuttuvia otteluita: 1`, the apply restored it to TASO's `1`, the
  notice read `Veikkausliiga 2022 päivitetty. Otteluita: 0 uutta, 1
  muuttunutta, 0 poistettua.`, and the run log gained the row with its counts
  and operator.

Every fixture was removed afterwards and the run log left empty.

## Moved from comments, 2026-10-05

Cut from `src/lib/force-refresh.ts` at `55a14fc` by #531.

- **Module.** The two steps are all that stands between a truncated provider
  answer and a deleted season: nothing in a partial answer tells it from a
  season that lost fixtures, so a person looks at the removals.
- **`listSeasonsFor`.** New seasons come through the ordinary sync. Per
  competition, as resolving ten at once would turn a cold Redis into ten
  requests against a rate-limited plan. `resolveTasoSeasonContext` would have
  written rows on a mere preview (found in review).
- **`storedSeasonsFor`.** A second copy of "what do we hold" is how the ceiling
  and the season list once disagreed.
- **`cacheKeysFor`.** `taso:season-context`, `taso:categories` and
  `football-data:competition` stay. A key spelled out twice changes in one place,
  and the refetch then silently answers from the cache it meant to bypass.
- **`compare`.** Run twice so a stale bounce shows the rows there now. It was
  two functions, and each seam cost a review round. An `&&` across the tables
  would let matches-without-standings destroy a finished season's standings.
- **`snapshotHashOf`.** Hashing the provider alone would accept an approval
  built on rows that are gone, removing matches the admin never saw.
- **`computeDiff`.** The writer is shared with the ordinary sync, where deleting
  a dropped team is right. Within the fifteen-minute window the apply reads the
  same bytes; past it, a changed answer becomes a refusal. A server action's
  throw reaches the client as a generic error, hence `"read"`.
- **`writeSnapshot`.** `synchronizeGroupTeams` deleting first is right here: it
  runs only on a non-empty, approved answer. Removal by id, never a predicate
  over the season, which would widen with the next row. Without `tx` a group
  replacement could commit and a later delete fail (found in review).
  Serializable as in `scripts/grant-admin-run.ts`: a few runs a year cost
  nothing against overwriting someone's correction.

## Moved from comments, 2026-10-06

Cut from `src/lib/taso.ts` at `a86c1cb` by #531.

- **`tasoMatchesCacheKey`, `tasoCategoryCacheKey`.** Exported because the forced
  refresh has to delete exactly these keys to reach TASO. Spelled out in two
  places, a changed key would silently stop the refresh clearing anything, and
  the refetch would answer out of the cache it meant to bypass.

Cut from `src/lib/taso-standings-service.ts` at `a86c1cb` by #531.

- **`storedTasoSeasons`.** A season holds group standings without matches when
  a competition's fixtures were never synced but its published table was, or
  its matches were pruned. Reading only `taso_matches` made this the single
  source of truth for "seasons we have" in name only.
- **`newestStoredSeason`.** Derived from `storedTasoSeasons`, so "what do we
  hold" is answered one way. It read `taso_matches` alone before, so a
  competition held only as group standings looked unstored, and with discovery
  unavailable its ceiling fell below its own data.
- **`resolveTasoSeasonCeiling`.** Split out of `resolveTasoSeasonContext`, which
  needs the same numbers and then probes by synchronizing the current season,
  which writes. The forced refresh needs a range to validate against and must
  not write before an admin has approved a diff. Extracted, not reimplemented:
  two copies of the floor clamp would drift, and a drifted ceiling offers a
  season the competition never had.
- **The floor in `resolveTasoSeasonCeiling`.** Without it, a discovery failure
  with nothing stored would put Ykkösliiga's ceiling at 2015, below its 2024
  floor; `listSelectableTasoSeasons` counts down from the ceiling to the floor,
  so the selector would come back empty. Discovery is competition-agnostic but
  the stored fallback is not, so the cache key is scoped to the competition.
- **`synchronizeGroupTeams`' `executor`.** Defaults to opening its own
  transaction, which is what every caller before the forced refresh did.

Cut from `src/db/schema.ts` at `a86c1cb` by #531.

- **`refreshRuns`.** A forced refresh is run a handful of times a year, by an
  admin, against a season whose data turned out wrong, so its questions are
  asked months apart ("when did we last refresh this, and did it work?") by
  someone who cannot be expected to remember. What an admin approved and what
  is recorded are the same numbers by construction.
- **`refresh_runs.source`.** `text` and not an enum, for the reason recorded
  for `user.role`; the set is validated in `refresh-view.ts`.
- **`refresh_runs.season_label`.** `2016` for a Finnish season, `2025/26` for a
  foreign one that spans two calendar years. Deriving it later would mean a
  provider call per row. Where it is null the list falls back to the season
  id.
- **`refresh_runs.run_by`.** The only user reference in the schema that does
  not cascade. The row then renders as `Poistettu käyttäjä`. The admin-tools
  feature relies on cascade so that one `DELETE` removes everything a reader
  owns; a log of operations performed on the app is not something a reader
  owns, so this is not a hole in that.

Cut from `src/lib/football-data.ts` at `a86c1cb` by #531.

- **`footballDataMatchesCacheKey`.** Exported for the same reason as its TASO
  counterpart: the forced refresh deletes exactly this key to reach the
  provider, and a key spelled out in two places would let a change silently
  stop that.

Cut from `src/lib/refresh-view.ts` at `94397a8` by #531.

- **`refresh-view.ts`.** `refresh-form.tsx` and `refresh-confirm.tsx` are
  browser bundles, and the modules that do the work (`refresh-diff.ts`,
  `force-refresh.ts`, `refresh-runs.ts`) must not travel with them: the
  boundary `admin-user-view.ts` and `favourite-keys.ts` exist for.
- **`CHOICE_SEPARATOR`.** One control and not a provider radio plus a
  competition list: which provider a competition belongs to is a fact about
  the competition, not a question to put to an admin. Both registries use
  upper-case letters and digits, so `:` is safe.
- **`decodeChoice`.** It stays client-safe so the form can use it too; the
  registries live with the caller.
- **`DeductionChange`.** The field the feature exists for.
- **`RemovedMatch`.** A removal is the only irreversible thing the tool does,
  and a number alone is not enough to judge it by, given that a provider can
  answer partially.
- **`RefreshPreview.snapshotHash`.** It makes "what you saw is what you
  applied" a checked fact and not an assumption about timing.
- **`previewHasChanges`.** Deductions are named although a moved
  `starting_points` also moves the group row's `updated` count, so that
  clause is unreachable as the diff works today. The predicate decides
  whether the admin is offered a `Päivitä` button, and the dialog lists
  deductions separately: leaving them out would make the button's condition
  and the dialog's contents two ideas of "something changed", free to drift
  when the diff does.

Cut from `src/lib/refresh-diff.ts` at `ef7eb13` by #531.

- **`refresh-diff.ts`.** Pure and separate from `force-refresh.ts` because it
  is both what the confirmation dialog shows an admin and what the run log
  records: computed once, what was approved and what is recorded are the same
  numbers by construction.
- **`valuesDiffer`.** Two `Date` objects for the same instant are never `===`,
  so without their own case every match would read as changed on every run
  and the confirmation dialog would be worthless.
- **`rowChanged`.** Driven by the provider row's keys and not a hand-written
  column list. Both normalized provider types mirror their table's columns
  exactly, which is what lets a selected row satisfy the provider type
  structurally, so the provider row's keys are the columns the upsert writes.
  A hand-written list would be a second thing to keep true, and the column
  it missed would be a change the admin was never shown.
- **`groupTeamKey`.** There is no provider-side row id to key on.
- **`byCodeUnit`.** `localeCompare` answers by the runtime's locale data, so
  two machines, or one machine after an ICU upgrade, could order the same keys
  differently and hash the same rows to different digests. The apply would
  then refuse a diff nobody had changed, as `"stale"`, and re-previewing would
  not help. Where the repository sorts for display it uses `localeCompare`
  with a locale.
- **`snapshotHash`.** The apply recomputes it and refuses when it no longer
  matches, so an admin can never approve one diff and have another applied.
  The provider is under no obligation to keep a row order. Each group is
  length-prefixed and hashed separately, so matches and group teams cannot be
  swapped for each other.

Cut from `src/components/refresh-form.tsx` at `ef7eb13` by #531.

- **`refresh-form.tsx`.** A client component because every control is
  interactive and the apply asks first. The engine must not travel in a
  browser bundle: the boundary `admin-user-view.ts` and `favourite-keys.ts`
  exist for.
- **`requestId`.** Without it a slow preview could put one competition's diff
  on screen while the buttons beneath it act on another, and the whole
  feature rests on the diff an admin sees being the one they approve.
- **`abandonInFlight`.** `useCallback` with no dependencies: a function
  rebuilt each render would restart the effect that lists it every render,
  refetching the season list continuously.
- **The season list.** There are ten foreign competitions, so resolving them
  all on mount would turn a cold cache into ten requests against a
  rate-limited plan.
- **`run`.** A server action can reject where it could return a refusal, on a
  dropped connection or an exception the engine did not convert, and
  `void action()` alone would swallow that, leaving the form pending with no
  notice and no way forward. `startTransition` tracks only what its callback
  does before returning, so firing the request and returning at once drops
  `pending` to false while the server action is still running.
- **`chosenSeason`.** A guard the disabled button makes unreachable is a
  branch no test can reach and no reader can justify.

Cut from `src/lib/refresh-runs.ts` at `ef7eb13` by #531.

- **`refresh-runs.ts`.** A forced refresh happens a handful of times a year,
  so its questions are asked months apart by someone with no memory of the
  event: when did we last refresh this, did it work, and what did it move?
- **`recordSuccess`.** A refresh that succeeded has already changed the
  database, and losing the note of it is no reason to tell an admin their
  change failed: the one place in the feature where swallowing is right.
- **`recordFailure`.** A submission naming a competition or season the app
  does not have is a malformed request, not an event that happened to the
  data; a stale bounce is the apply working as intended, and the admin is
  about to see the fresh diff and decide again. Recording either would fill
  the log with noise nobody can act on.
- **`groupCountsFrom`.** A foreign competition stores null in all three
  columns because it has no group standings. Null means "this table does not
  exist for this provider"; three zeroes would claim nothing changed.
- **`listRuns`.** The table gains a handful of rows a year, and a list that
  needed paging would itself be the finding. A deleted admin's run has
  `run_by` null, which is what `on delete set null` on the column is for.
  Guessing which provider a hand-edited row meant would put a wrong
  competition name in an audit log. Deriving the season label on read would
  mean a provider call per row just to learn whether a foreign season spans
  two calendar years, so a run would read `2025` where the picker says
  `2025/26`.

Cut from `src/db/index.ts` at `dc74e3e` by #531.

- **`Executor`.** Without the parameter a writer silently commits on its own
  connection while its caller believes it is inside a transaction, which is
  what `force-refresh.ts` believed, and did not have, until review said so.

Cut from `src/app/admin/data/page.tsx` at `ef99862` by #531.

- **The refusal on `/yllapito/data`.** A 403 says "this exists and you may
  not have it", a fact a stranger has no use for. The 200 is a framework
  limit and not a choice: `src/app/loading.tsx` puts every segment behind a
  Suspense boundary, so Next commits the status line before `notFound()` is
  caught. The body gives nothing away, and `requireAdmin()` refuses here
  and, separately, inside all three actions.
- **A failed read of the run log.** Saying nothing has ever been refreshed
  is a claim we cannot make from a database error, and the page exists
  partly so an admin can trust that list.

Cut from `src/lib/refresh-actions.ts` at `ef99862` by #531.

- **`refresh-actions.ts`.** A server action is a public network endpoint
  whether or not anything renders a control for it, so neither the missing
  link nor the page's not-found response keeps a caller out; only the gate
  does. The same rule `admin-actions.ts` and `favourite-actions.ts` follow.
  The competition arrives as the `<select>`'s own encoded value, a string
  from the browser like any other: `decodeChoice` checks its shape and
  `isKnownCompetition` checks it against the registries, and a value failing
  either is refused before it reaches the engine.
- **`applyRefreshAction`.** The hash only answers "is this still the thing
  you were shown".
- **Revalidating after an apply.** Without it the row just written stays
  invisible until the admin reloads: an audit log that does not show the
  thing that was audited. Revalidating for a refusal would re-render the
  page to prove nothing changed.

Cut from `src/components/refresh-confirm.tsx` at `ef99862` by #531.

- **`refresh-confirm.tsx`.** A truncated provider answer is
  indistinguishable from a season that genuinely lost fixtures: nothing in
  the response separates them, so nothing in the code can. What separates
  them is a person seeing `Poistuvia otteluita: 180` and declining. A number
  is not enough to judge a deletion by, and deletion is the only
  irreversible thing this tool does.
- **The `<dialog>` in the confirmation.** The element carries the semantics
  natively and behaves consistently across assistive technology, which the
  role alone does not guarantee. A top-layer modal would need focus
  management the inline form does not otherwise require.

Cut from `src/components/refresh-run-list.tsx` at `ef99862` by #531.

- **`refresh-run-list.tsx`.** None of it needs to reach the browser as
  JavaScript. The questions it answers are asked months apart by someone who
  cannot be expected to remember: when did we last refresh this, did it
  work, and what did it move.
- **`REASONS`.** A reason with no message would otherwise be an empty cell
  in an audit log. `reasonFrom` in `refresh-runs.ts` has already rejected
  anything outside the union.
- **`Counts`.** `1 / 2 / 0` is compact enough to scan down a column and
  meaningless read aloud. Visually hidden text and not `aria-label`: a bare
  `<span>` has no role, and ARIA labelling is not supported on elements that
  have none. `sr-only` is what `team-search.tsx` already uses for the same
  job.

Cut from `src/lib/cache.ts` at `48ebab4` by #531.

- **`invalidateCache`'s boolean.** The forced refresh clears a provider's
  entry in order to reach the provider. If the clear silently failed, the
  refetch would come back out of Redis and an admin would be shown, and
  would apply, a diff built from the stale data they were trying to correct.
  For every other caller, a failure to invalidate is no reason to fail a
  request that was only trying to be helpful.

Cut from `src/lib/refresh-competitions.ts` at `48ebab4` by #531.

- **`refresh-competitions.ts`.** Its own module because both
  `force-refresh.ts` and `refresh-runs.ts` need it, the engine to validate a
  submission and the log to name a competition in a row written months ago,
  and having the log import the engine would be a cycle.
- **`isKnownCompetition`.** `decodeChoice` in `refresh-view.ts` validates
  the shape and stays client-safe; this is the half that needs the
  registries.
