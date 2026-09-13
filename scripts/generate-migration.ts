import { spawnSync } from "node:child_process";
import { describeMigrationNameRule, MIGRATION_NAME } from "./migration-name";

/**
 * `npm run db:generate -- --name=add_refresh_runs`.
 *
 * A wrapper around `drizzle-kit generate` that **refuses to run without a
 * name**. Seven migrations reached `main` called things like
 * `0016_young_meteorite` because the underlying command happily invents two
 * random words when it is not given one — the failure needed no mistake, only
 * the default.
 *
 * `tests/unit/db/migrations.test.ts` catches such a name if one appears by
 * another route. This stops it being created in the first place, which is the
 * better of the two places to stop it.
 */

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const nameArgument = process.argv.slice(2).find((argument) => argument.startsWith("--name="));
if (nameArgument === undefined) {
  fail(`Missing --name.\n\n${describeMigrationNameRule()}`);
}

const name = nameArgument.slice("--name=".length);
if (!MIGRATION_NAME.test(name)) {
  fail(`"${name}" is not a usable migration name.\n\n${describeMigrationNameRule()}`);
}

const result = spawnSync(
  process.execPath,
  ["node_modules/drizzle-kit/bin.cjs", "generate", `--name=${name}`],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
