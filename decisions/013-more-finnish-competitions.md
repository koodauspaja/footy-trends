# 013 — More Finnish competitions: implementation decisions

Spec: `specs/013-more-finnish-competitions.md`
Issue: #141

The spec is delivered as stacked PRs, because one PR would be roughly three
times Sourcery's 150,000 diff-character limit and would not be reviewed at
all. This record grows with each one.

1. **Category-aware storage and threading** (this PR) — no user-visible
   change; Veikkausliiga is still the only competition.
2. `starting_points`, the origin-group rule, the mismatch fallback, forfeited
   matches — fixes Veikkausliiga 2016.
3. The nine new competitions, per-season names, and the picker.

---

## PR 1 — Category-aware storage and threading

### The column had to come before the competitions

Nothing here is visible to a user, which is the point: `taso_matches` could
not tell two competitions apart, so adding one would have silently merged its
matches into Veikkausliiga's. `competition_id` is `spljp26` for *every*
Finnish competition, and `group_id` is only unique within a category —
Veikkausliiga, Miesten Kakkonen and Ykkönen each have a group 1 in that
season. Storing a second competition first and fixing the schema afterwards
would have meant a data cleanup, not just a migration.

### `match_id` is unique across categories, so uniqueness did not change

The obvious defensive move was to widen the unique index to include
`category_id`. Checked instead of assumed: across six categories in
`spljp26`, 710 match ids yielded zero collisions. TASO issues match ids from
one space regardless of category.

So `category_id` joins the *lookup* index and not the unique one. Widening
uniqueness would have been strictly worse — it would let the same match be
stored twice under two categories if a future call ever passed the wrong one,
turning a loud constraint violation into a silent duplicate.

### The migration backfills, which drizzle-kit's output would not have

`drizzle-kit generate` emitted a bare `ADD COLUMN "category_id" text NOT
NULL`, which fails outright on a table that already holds rows — every
Veikkausliiga match synced so far. The committed migration adds the column
with `DEFAULT 'VL'`, then drops the default in the next statement, so
existing rows are labelled correctly and every future insert is still forced
to supply a value.

Verified against a real Postgres rather than reasoned about: a pre-existing
row comes out as `VL`, and a subsequent insert that omits the category fails
the not-null constraint, proving the default is genuinely gone.

### `categoryIdForSeason` is total, not nullable

A competition can outlive its own `category_id` — P21 SM is `P20SM` before
2026 — so the config holds a list of ranges rather than one id, even though
Veikkausliiga has exactly one entry today. The resolver returns `string`, not
`string | null`.

Nullable was the first shape, and it pushed a `?? competitionCode` fallback
into `domestic-page-context.ts` that no test could reach: a season below a
competition's floor cannot be selected, because the season selector is built
from that same floor. Rather than ship an unreachable branch and lose the
repo's 100% coverage, the helper answers the degraded case itself — oldest
range for a too-old season, the code itself for an unknown competition — and
is tested directly at both edges.

### Carry-over config is keyed by category first

`CARRY_OVER_CONFIG` was `competition_id → group_id`. Left alone, `spljp25: {
2: 1 }` would have applied Veikkausliiga's Runkosarja carry-over to every
other competition's group 2 the moment one was added. It is now
`category_id → competition_id → group_id`.

`listCarryOverEntries` and the fixture file changed with it. Fixture keys
became `VL/spljp19` rather than `spljp19`, so the coverage check — which
asserts config and fixtures match exactly, in both directions — stays exact
once two competitions have a 2025 season. A bare `spljp25` would collide.

### The season-context probe picks one category deliberately

`resolveTasoSeasonContext` syncs the discovered season to answer "has it
actually started" (spec 011). That question needs *a* category, not every
category, and TASO publishes a `competition_id` for all of them at once — so
it probes Veikkausliiga through a named `SEASON_PROBE_CATEGORY_ID` constant
rather than looping. Probing all ten would multiply the work by ten to answer
a question any one of them settles.

### The scoping test is mutation-checked

`tests/integration/taso.test.ts` stores a Veikkausliiga group 1 and a
Kakkonen group 1 in the same season and asserts each competition sees only
its own group, teams and matches. Since a test like that can easily pass for
the wrong reason, it was confirmed to fail with the `category_id` filter
removed from the query, and pass with it restored.

---

## PR 2 — The standings engine

Everything behavioural, with Veikkausliiga still the only competition, so each
change is observable against twelve seasons of known-good data before nine more
competitions are layered on top.

### The split moved after measuring the fixtures

The plan was two PRs: the engine plus the competitions together. Measuring
first changed it. The 71 carry-over entries need fixtures for 33
competition-seasons — 5,444 matches, of which 4,457 are new — and at the
existing fixture format that is roughly 200KB of JSON before a line of source
changes. Combined with the engine work it would have sat at Sourcery's 300,000
per-PR cap and been unreviewable regardless.

So the fixture bulk moves to PR 3 with the competitions that need it, and this
PR carries the engine alone at ~98,000 characters.

### `starting_points` decides how a group is calculated, so it had to be stored

Spec 009 kept `getGroups` in Redis because only the pass-through path used it.
Own-calculated standings now depend on `starting_points`, which changes the
failure mode entirely: a cold cache would no longer mean a stale table, it
would mean *wrong points, silently*. `taso_group_teams` stores it on the same
freshness rule as matches, and the Redis groups cache is gone.

### A knockout group broke the insert, and only a real database said so

`ON CONFLICT DO UPDATE command cannot affect row a second time`. Spec 010
already documented that a knockout group returns one row per bracket *slot*
rather than per team, so an advancing team appears several times — and Postgres
rejects a whole upsert statement that touches one row twice. Veikkausliiga 2019
and 2022 lost their entire stored group standings to it.

The unit tests could not have caught this: they mock the insert. It surfaced by
running the app against a real database and noticing two seasons missing from
`taso_group_teams`. Rows are now de-duplicated by identity before insert, first
slot winning — arbitrary and harmless, since a group with duplicates is a
knockout group that renders as a match list and has no points at all.

### The origin-group rule is gone, replaced by a result

Spec 009 decided "can we calculate this ourselves?" by shape: lowest
`group_id` is the origin, everything above it is pass-through. That is not a
rule, it is a description of Veikkausliiga, and spec 013 lists three
counterexamples among the competitions still to come.

There is no shape test now. Every group with a table is calculated, and the
question becomes whether the result reproduces TASO's published points. Match:
our table, with a round selector. Mismatch: TASO's numbers, no round selector,
and a Finnish notice saying so. That keeps spec 009's guarantee — an
unvalidated group never shows silently wrong points — and makes the two P20
Ykkönen groups this audit could not explain render visibly rather than wrongly.

Confirmed across all twelve Veikkausliiga seasons: zero groups fall back, so
the calculation reproduces TASO exactly everywhere, including 2016's deduction.

### Missing group data degrades to own-calculated, not to nothing

The first cut made "no stored team rows" mean "no table", which would have
turned an entire season into match lists the first time `getGroups` was
unreachable on a cold store. The distinction that fixes it is whether the
*season* has any group data at all: none means degraded — calculate everything,
adjustments all zero, and log it — while a season that has data but no rows for
one group means that group genuinely has no table.

### Round 0 is why the selector filters by group

Veikkausliiga 2022's Eurolopputurnausfinaali numbers its rounds from **0**.
With the round list taken from every group, the selector would offer a
"Kierros 0" that filters nothing. `listSeasonRounds` therefore excludes groups
with no table, which is also why the page now asks the service for its rounds
rather than deriving them from a match list.

### Coverage measures `src/`, not test data

`tests/**` is excluded from coverage. A JSON fixture has no statements, so it
could only ever report 0% and drag the totals down, hiding a real regression.

Worth recording why it appeared at all: #151 re-keyed the fixture to
`VL/spljp19`, and Vite emits a named export per top-level JSON key only when
those keys are valid JS identifiers — otherwise it falls back to
`export default JSON.parse("...")`, a module with nothing to cover. The
exclusion is the right fix either way.
