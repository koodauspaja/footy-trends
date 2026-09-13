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
