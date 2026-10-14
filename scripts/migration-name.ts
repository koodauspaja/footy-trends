/**
 * What a migration may be called, in one place: the generator refuses to
 * create a badly named one, and a test refuses to let one exist.
 *
 * decisions/376-named-migrations.md
 */

/**
 * The verbs this repository's migrations actually use.
 *
 * decisions/376-named-migrations.md
 */
export const MIGRATION_VERBS = ["add", "create", "alter", "drop", "rename", "backfill"] as const;

/**
 * `<verb>_<what>`: the name without drizzle-kit's `NNNN_` prefix. Narrow on
 * purpose.
 *
 * decisions/376-named-migrations.md
 */
export const MIGRATION_NAME = new RegExp(`^(${MIGRATION_VERBS.join("|")})_[a-z0-9_]+$`);

/**
 * The same rule applied to a full tag, as the journal and the files carry it.
 *
 * decisions/376-named-migrations.md
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
 * Every `--name` the command line carries, in either form: `--name=add_thing`
 * and `--name add_thing`. A following argument that is itself a flag is not
 * taken as the value.
 *
 * decisions/376-named-migrations.md
 */
function nameOccurrences(argv: readonly string[]): { value: string | null }[] {
  const found: { value: string | null }[] = [];

  for (const [index, argument] of argv.entries()) {
    if (argument.startsWith("--name=")) {
      found.push({ value: argument.slice("--name=".length) });
      continue;
    }
    if (argument === "--name") {
      const next = argv[index + 1];
      found.push({ value: next === undefined || next.startsWith("-") ? null : next });
    }
  }

  return found;
}

/**
 * Decides whether a `db:generate` invocation may proceed, and with what. Pure,
 * and separate from the script that spawns `drizzle-kit`.
 *
 * decisions/376-named-migrations.md
 */
export function planMigrationGeneration(argv: readonly string[]): GenerationPlan {
  const forwarded = [...argv];
  const names = nameOccurrences(forwarded);

  if (names.length === 0) {
    return { ok: false, message: `Missing --name.\n\n${describeMigrationNameRule()}` };
  }

  // Two `--name=` flags would mean validating one and generating the other.
  // Refused, not guessed.
  if (names.length > 1) {
    return { ok: false, message: `--name given ${names.length} times.\n\nGive it once.` };
  }

  const name = (names[0] as { value: string | null }).value;
  if (name === null) {
    return { ok: false, message: `--name was given no value.\n\n${describeMigrationNameRule()}` };
  }

  if (!MIGRATION_NAME.test(name)) {
    return {
      ok: false,
      message: `"${name}" is not a usable migration name.\n\n${describeMigrationNameRule()}`,
    };
  }

  // The whole argument list, not just the name: forwarding only `--name` would
  // silently drop `--config`, `--schema` or `--out`.
  return { ok: true, forwarded };
}
