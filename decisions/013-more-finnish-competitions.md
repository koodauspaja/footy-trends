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
