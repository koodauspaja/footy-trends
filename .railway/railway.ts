/**
 * The web service's Railway configuration, as Infrastructure as Code (#521).
 *
 * Replaces `railway.toml`: Railway's Config as Code is deprecated, and stops
 * being read on 2026-12-01. Every value below is the one that file set.
 *
 * **Railway never reads this file during a deploy.** A change takes effect
 * only when applied, once per environment — `railway config plan`, then
 * `railway config apply`, with the CLI linked to staging and then to
 * production. docs/setup/025-railway-infrastructure-as-code.md has the steps.
 *
 * **A named partial, deliberately.** This file owns only the services it
 * declares. Without `partial`, it would describe the whole project, and an
 * apply would delete everything missing from it: Postgres, Redis and the
 * `predictions` cron service.
 *
 * The `predictions` service stays in the dashboard (docs/setup/024). It never
 * used `railway.toml`, so the cutoff does not touch it, and it exists in
 * production only.
 *
 * Written by hand: `railway config migrate` drops the restart policy
 * (railwayapp/cli#1199). The CLI ignores unknown keys without a word, so
 * `tests/unit/railway-config.test.ts` pins every value.
 */
import { defineRailway, project, service } from "railway/iac";

export const partial = "footy-trends";

/** The Railway service that serves the site, in both environments. */
export const WEB_SERVICE = "footy-trends";

export default defineRailway((ctx) => {
  const web = service(WEB_SERVICE, {
    build: {
      // Only application code or its build configuration redeploys. Pushes
      // that touch only docs, specs, decisions or tests do not.
      watchPatterns: [
        "src/**",
        "public/**",
        "drizzle/**",
        "package.json",
        "package-lock.json",
        "next.config.ts",
        "tsconfig.json",
      ],
    },
    deploy: {
      // Migrations run in the new container before it takes traffic.
      preDeployCommand: ["npm run db:migrate"],
      startCommand: "npm start",
      // No traffic until this returns 200.
      healthcheckPath: "/api/health",
      healthcheckTimeout: 60,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 3,
      // Zero-downtime deploys: the old container stays up 15 s after the new
      // one is healthy, then drains connections for 10 s.
      overlapSeconds: 15,
      drainingSeconds: 10,
    },
  });

  return project(ctx.projectName ?? "footy-trends", { resources: [web] });
});
