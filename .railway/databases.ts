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

// The short name, on purpose. Given Railway's stored name for the same place,
// `europe-west4-drams3a`, the CLI creates another Redis: a bare image with no
// `REDIS_URL`. This file is applied once, so the move a later plan would show
// is never planned.
export const REGION = "europe-west4";

export default defineRailway((ctx) => {
  const id = ctx.environmentId;
  if (id === undefined || PROTECTED_ENVIRONMENT_IDS.includes(id)) {
    throw new Error(
      `.railway/databases.ts is never applied to environment "${ctx.environmentName}"`
    );
  }
  if (process.env[TARGET_VARIABLE] !== id) {
    throw new Error(
      `.railway/databases.ts is applied only by npm run railway:environment, to the environment it names in ${TARGET_VARIABLE}`
    );
  }

  return project(ctx.projectName ?? "footy-trends", {
    resources: [postgres("Postgres", { region: REGION }), redis("Redis", { region: REGION })],
  });
});
