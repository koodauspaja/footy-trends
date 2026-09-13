import { spawnSync } from "node:child_process";
import { planMigrationGeneration } from "./migration-name";

/**
 * `npm run db:generate -- --name=add_refresh_runs`.
 *
 * A wrapper around `drizzle-kit generate` that **refuses to run without a
 * name**. Seven migrations reached `main` called things like
 * `0016_young_meteorite` because the underlying command happily invents two
 * random words when it is not given one — the failure needed no mistake, only
 * the default. `docs/setup/015-database-setup.md` had said to pass `--name`
 * the whole time, which is the evidence that advice was not enough.
 *
 * `tests/unit/db/migrations.test.ts` catches such a name if one appears by
 * another route. This stops it being created, which is the better of the two
 * places to stop it.
 *
 * The decisions live in `migration-name.ts` so they can be tested without
 * spawning anything; this file is the side effect.
 */
const plan = planMigrationGeneration(process.argv.slice(2));

if (!plan.ok) {
  process.stderr.write(`${plan.message}\n`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["node_modules/drizzle-kit/bin.cjs", "generate", ...plan.forwarded],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
