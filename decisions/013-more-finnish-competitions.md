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

---

## PR 3a — The ten competitions

All ten render, with the nine new ones' split groups falling back to TASO's own
numbers until PR 3b validates their carry-over entries.

### The split moved again, and the fallback path is why

The plan was one PR for the competitions and their carry-over entries. The
fixtures those entries need measure **220KB** — 33 competition-seasons, 5,444
matches — which with the source changes would have sat at Sourcery's 300,000
cap for a diff whose bulk is unreviewable JSON.

The seam that made a clean split possible is the fallback built in PR 2. A
carry-over group with no config entry does not render wrongly; it renders
TASO's own numbers with a Finnish notice. So the competitions can ship first
and be correct, and the entries upgrade them afterwards from "TASO's table" to
"our table, with a round selector".

Confirmed live: Miesten Kakkonen 2026 renders its three parallel pools
own-calculated and its six jatkosarja groups on the fallback path, which is
exactly the intended state before PR 3b.

### Parallel pools proved the origin-group rule was right to remove

Kakkonen is the case spec 009's heuristic could not express: three pools that
are each an origin group. Under "the lowest `group_id` is the origin", Lohko B
and Lohko C would have rendered as pass-through with no round selector. They
now calculate correctly, which is the first real evidence the result-based rule
generalises beyond Veikkausliiga.

### A competition's name comes from the season, not the config

`NL` is "Naisten Liiga" 2015–2019, "Kansallinen Liiga" 2020–2024 and "Briotech
Kansallinen Liiga" from 2025. Heading a 2016 page with today's sponsor name
would be wrong, so the heading uses TASO's `category_name` for that season and
adds `nykyisin {current name}` underneath when the two differ.

One `getCategories` call covers all 28 categories in a season, so the cache key
is the season rather than the competition — asking for a second competition in
the same season is free. Best-effort throughout: a name is presentation, and a
failure falls back to the configured name rather than breaking the page.

### The season probe follows the competition, resolving in the right order

Sourcery flagged in PR 1 that `resolveTasoSeasonContext` probed Veikkausliiga
for every competition, so one that starts earlier would be defaulted to the
previous season. Fixing it has an ordering constraint: the category to probe
depends on the season, and the season is what the probe resolves.

Discovery is competition-agnostic by construction (spec 011) — a
`competition_id` is a season of all Finnish football — so the discovered season
comes first, and only then does the competition's category for *that* season
get probed. The Redis key and the stored-season fallback are both scoped to the
competition.

### Ykkösliiga has no history, and that is not an oversight

It was created in 2024, when the men's second tier was renamed and Ykkönen
continued separately as a lower one. So it gets a 2024 floor and no predecessor
entry, while the four junior competitions map back through two ids each. Its
season selector offers 2024–2026 and rejects 2016 with the existing notice.

### A spec claim was wrong and is corrected

The spec said a seeded carry-over group's `matches_played` counts the child's
own matches only. It does not: Veikkausliiga 2022's Mestaruussarja reports 27,
which is Runkosarja's 22 plus its own 5. The two conventions differ only in how
*points* are expressed. Caught while generating PR 3b's fixtures, where the
number had to be asserted rather than described.

---

## PR 3b — The carry-over entries

71 entries across seven categories, each validated against TASO's own
published standings. Every split group in the nine new competitions moves off
the fallback path onto an own-calculated table with a round selector.

### The entries were derived, not transcribed

Hand-writing 71 entries and their `seeded` flags would have been 71 chances to
introduce a silent error. They come instead from the audit that produced the
spec: every group in every season was recalculated from its own matches and
compared against TASO's published points, and the classification that
reconciled tells us both the parent and the convention.

Distribution: Kansallinen Liiga 20, Kakkonen 18, Veikkausliiga 12, Ykkönen 10,
Kansallinen Ykkönen 8, T18 SM 2 (under `BTSM` 2015), Ykkösliiga 1. The three
P21/P18 competitions need none — every group in their twelve seasons is
independent.

### `seeded` varies by season within one competition, which is why it is data

Ykkönen is seeded in 2021, 2022 and 2024, and not in 2023 and 2025. Kakkonen is
seeded through 2024 and not in 2025. There is no rule to infer it from: TASO
simply changed convention, and not uniformly. A per-entry flag derived from the
data is the only honest representation.

### The fixtures now carry TASO's numbers, which makes the guard sharper

Previously the fixtures held matches and expected points, with `getGroups`
mocked empty — so a wrong entry produced wrong points and the assertion caught
it. Now TASO's own `points` and `starting_points` are fed in as stored group
rows, so a wrong entry does not merely produce different numbers: it fails to
reconcile, and the group renders `pass-through` instead of `own-calculated`.
Both are asserted, so the failure is unmissable either way.

That is also why the fixture grew: it needs every match in the groups a
carry-over touches, plus those groups' published rows. 33 competition-seasons,
5,444 matches, ~215KB — the reason this is its own PR rather than part of the
one that added the competitions.

### Kakkonen is the shape that would have broken the old design twice

Three parallel pools, each an origin, and six continuation groups mapping onto
them in pairs — `4→1, 7→1` for Ylempi and Alempi jatkosarja A. The old
"lowest `group_id` is the origin" rule could express neither. Verified against
TASO for 2024: Reipas 41 points from 23 played, matching exactly, with a seeded
`starting_points` of 31 behind it.
