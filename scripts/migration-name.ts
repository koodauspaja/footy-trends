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

/**
 * The same rule applied to a full tag, as the journal and the files carry it.
 *
 * `String.raw` so `\d` is the regex escape it looks like, rather than a `\\d`
 * that a reader has to decode back into one.
 */
export const MIGRATION_TAG = new RegExp(
  String.raw`^\d{4}_(${MIGRATION_VERBS.join("|")})_[a-z0-9_]+$`
);

export function describeMigrationNameRule(): string {
  return `A migration name must be <verb>_<what>, where <verb> is one of: ${MIGRATION_VERBS.join(", ")}.
Example: --name=add_refresh_runs

Without --name, drizzle-kit invents two random words (0016_young_meteorite),
which says nothing to whoever reads it back during an incident.`;
}

export type GenerationPlan = { ok: true; forwarded: string[] } | { ok: false; message: string };

/**
 * Decides whether a `db:generate` invocation may proceed, and with what.
 *
 * Pure, and separate from the script that spawns `drizzle-kit`, so the rules
 * can be tested without running a generator — the same split
 * `grant-admin-plan.ts` uses.
 */
export function planMigrationGeneration(argv: readonly string[]): GenerationPlan {
  const forwarded = [...argv];
  const names = forwarded.filter((argument) => argument.startsWith("--name="));

  if (names.length === 0) {
    return { ok: false, message: `Missing --name.\n\n${describeMigrationNameRule()}` };
  }

  /**
   * Two `--name=` flags would mean validating one and generating the other:
   * a filter takes the first and a command-line parser generally takes the
   * last. Refused rather than guessed, the same rule `grant-admin` applies to
   * its own duplicate flags.
   */
  if (names.length > 1) {
    return {
      ok: false,
      message: `--name given ${names.length} times: ${names.join(" ")}\n\nGive it once.`,
    };
  }

  const name = (names[0] as string).slice("--name=".length);
  if (!MIGRATION_NAME.test(name)) {
    return {
      ok: false,
      message: `"${name}" is not a usable migration name.\n\n${describeMigrationNameRule()}`,
    };
  }

  /**
   * The **whole** argument list, not just the name. Forwarding only `--name`
   * would silently drop `--config`, `--schema` or `--out`, so a caller who
   * asked for one configuration would quietly get the default — a wrapper
   * changing behaviour it was not asked to change.
   */
  return { ok: true, forwarded };
}
