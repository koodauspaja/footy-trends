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
 * **Everything the service has must be declared, or an apply removes it.**
 * The first staging plan, before this was understood, would have deleted all
 * of the service's variables and detached its GitHub source. So the source is
 * declared with each environment's branch, and every variable by name with
 * `preserve()`: Railway keeps the value it holds, and no value is in the
 * repository. **A variable added in the dashboard must be added here before
 * the next apply**, or that apply deletes it; `railway config plan` shows it as
 * a deletion. Railway's own `RAILWAY_*` variables are provided, not declared.
 *
 * Written by hand: `railway config migrate` drops the restart policy
 * (railwayapp/cli#1199). The CLI ignores unknown keys without a word, so
 * `tests/unit/railway-config.test.ts` pins every value.
 */
import { defineRailway, github, preserve, project, service } from "railway/iac";

export const partial = "footy-trends";

/** The Railway service that serves the site, in both environments. */
export const WEB_SERVICE = "footy-trends";

export const REPOSITORY = "koodauspaja/footy-trends";

/** What each environment deploys from (docs/setup/021). */
export const BRANCHES = { staging: "main", production: "release" } as const;

/** The variables both environments hold, by name only. */
export const SHARED_VARIABLES = [
  "AXIOM_DATASET",
  "AXIOM_TOKEN",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "DATABASE_URL",
  "FOOTBALL_DATA_API_KEY",
  "FOOTBALL_DATA_EARLIEST_SEASON",
  "FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "LOG_LEVEL",
  "NEXT_PUBLIC_SENTRY_DSN",
  "REDIS_URL",
  "TASO_API_KEY",
] as const;

/** Only staging restricts sign-in and sets the proxy headers it trusts. */
export const STAGING_VARIABLES = [
  "AUTH_ALLOWED_EMAILS",
  "AUTH_CLIENT_IP_HEADERS",
  "AUTH_TRUSTED_PROXIES",
] as const;

/** Only production tunes Sentry. */
export const PRODUCTION_VARIABLES = [
  "NEXT_PUBLIC_SENTRY_ENABLE_LOGS",
  "NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII",
  "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
  "SENTRY_ENABLE_LOGS",
  "SENTRY_SEND_DEFAULT_PII",
  "SENTRY_TRACES_SAMPLE_RATE",
] as const;

export default defineRailway((ctx) => {
  const production = ctx.isEnvironment("production");
  const names = [...SHARED_VARIABLES, ...(production ? PRODUCTION_VARIABLES : STAGING_VARIABLES)];
  const web = service(WEB_SERVICE, {
    source: github(REPOSITORY, {
      branch: production ? BRANCHES.production : BRANCHES.staging,
      // Production waits for release.yml's checks: a red release run leaves
      // the previous version serving (skills/release.md). Staging does not wait.
      ...(production ? { checkSuites: true } : {}),
    }),
    env: Object.fromEntries(names.map((name) => [name, preserve()])),
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
