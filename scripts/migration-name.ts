/**
 * What a migration may be called, in one place.
 *
 * Imported by `scripts/generate-migration.ts`, which refuses to create a badly
 * named one, and by `tests/unit/db/migrations.test.ts`, which refuses to let one
 * exist. Two enforcement points, one rule — a second copy of the pattern would
 * be free to drift, and then the generator and the test would disagree about
 * what is legal.
 */

/** The verbs this repository's migrations actually use. */
export const MIGRATION_VERBS = ["add", "create", "alter", "drop", "rename", "backfill"] as const;

/**
 * `<verb>_<what>` — the name without drizzle-kit's `NNNN_` prefix.
 *
 * Deliberately narrow. The point is to reject the two random words
 * `drizzle-kit generate` picks when given no `--name`, and a pattern loose
 * enough to accept anything descriptive would accept `young_meteorite` too.
 */
export const MIGRATION_NAME = new RegExp(`^(${MIGRATION_VERBS.join("|")})_[a-z0-9_]+$`);

/** The same rule applied to a full tag, as the journal and the files carry it. */
export const MIGRATION_TAG = new RegExp(`^\\d{4}_(${MIGRATION_VERBS.join("|")})_[a-z0-9_]+$`);

export function describeMigrationNameRule(): string {
  return `A migration name must be <verb>_<what>, where <verb> is one of: ${MIGRATION_VERBS.join(", ")}.
Example: --name=add_refresh_runs

Without --name, drizzle-kit invents two random words (0016_young_meteorite),
which says nothing to whoever reads it back during an incident.`;
}
