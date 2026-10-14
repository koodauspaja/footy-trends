/**
 * A new environment's Postgres and Redis. Applied once, by
 * `scripts/railway-environment.ts`, to an environment that holds nothing. It
 * evaluates only for the one environment that script names, and never for this
 * project's staging or production, whose databases stay in the dashboard.
 *
 * decisions/522-railway-environment-from-code.md
 */
import { defineRailway, postgres, project, redis } from "railway/iac";

export const partial = "footy-trends-databases";

/**
 * This project's staging and production, by id: refused whatever else is true.
 * A fork's environments have other ids, and its own `production` starts empty.
 *
 * decisions/522-railway-environment-from-code.md
 */
export const PROTECTED_ENVIRONMENT_IDS: readonly string[] = [
  "ce529414-ae59-493c-aada-f8456fbe897a",
  "655bdeeb-5f32-46cd-9a55-b30897ec548c",
];

/**
 * The variable that names the one environment this file may evaluate for: the
 * id of an environment the script has just read as empty.
 *
 * decisions/522-railway-environment-from-code.md
 */
export const TARGET_VARIABLE = "RAILWAY_NEW_ENVIRONMENT_ID";

// Railway's stored name for europe-west4: the short name creates the databases
// in the same place, and then plans a move on every later run.
export const REGION = "europe-west4-drams3a";

/**
 * The two services' names, the environment's own. Railway builds a database
 * only under a name the project has never held; under one it has, it adds a
 * bare instance of that service, with no address to reach it by.
 *
 * decisions/522-railway-environment-from-code.md
 */
export function databaseNames(environmentName: string) {
  return { postgres: `Postgres-${environmentName}`, redis: `Redis-${environmentName}` };
}

export default defineRailway((ctx) => {
  const { environmentId: id, environmentName: name } = ctx;
  if (id === undefined || name === undefined || PROTECTED_ENVIRONMENT_IDS.includes(id)) {
    throw new Error(`.railway/databases.ts is never applied to environment "${name}"`);
  }
  if (process.env[TARGET_VARIABLE] !== id) {
    throw new Error(
      `.railway/databases.ts is applied only by npm run railway:environment, to the environment it names in ${TARGET_VARIABLE}`
    );
  }

  const names = databaseNames(name);
  return project(ctx.projectName ?? "footy-trends", {
    resources: [
      postgres(names.postgres, { region: REGION }),
      redis(names.redis, { region: REGION }),
    ],
  });
});
