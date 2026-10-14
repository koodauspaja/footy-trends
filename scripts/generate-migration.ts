import { spawnSync } from "node:child_process";
import { planMigrationGeneration } from "./migration-name";

/**
 * `npm run db:generate -- --name=add_refresh_runs`: a wrapper around
 * `drizzle-kit generate` that refuses to run without a name.
 *
 * decisions/376-named-migrations.md
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
