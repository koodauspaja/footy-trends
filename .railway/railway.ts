/**
 * The web service's Railway configuration, as Infrastructure as Code (#521).
 *
 * Replaces `railway.toml`: Railway's Config as Code is deprecated, and stops
 * being read on 2026-12-01. The build and deploy values are the ones that file
 * set, except the restart policy type, left to Railway's default (below). The
 * source and the variables are new: the file never set them, but an apply
 * removes what is not declared.
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
 * **Only the environments named in `ENVIRONMENTS` evaluate.** Any other name
 * throws, so an apply linked to a third environment fails before it plans:
 * falling back to staging's branch and variable list would delete whatever
 * that environment holds beyond it. A new environment is #522.
 *
 * Written by hand: `railway config migrate` drops the restart policy
 * (railwayapp/cli#1199). The CLI ignores unknown keys without a word, so
 * `tests/unit/railway-config.test.ts` pins every value.
 */
import { defineRailway, github, preserve, project, service } from "railway/iac";

export const partial = "footy-trends";

/** The variables both environments hold, by name only. */
const SHARED_VARIABLES = [
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
];

/** Each environment: its branch (docs/setup/021), whether it waits for CI, and its own variables. */
const ENVIRONMENTS = {
  staging: {
    branch: "main",
    waitForCi: false,
    // Idle almost all the time, and nothing depends on it staying warm: it
    // sleeps after a quiet spell and wakes on the next request (#551).
    sleepsWhenIdle: true,
    // Only staging restricts sign-in and sets the proxy headers it trusts.
    variables: ["AUTH_ALLOWED_EMAILS", "AUTH_CLIENT_IP_HEADERS", "AUTH_TRUSTED_PROXIES"],
  },
  production: {
    branch: "release",
    // A red release.yml run leaves the previous version serving (skills/release.md).
    waitForCi: true,
    // Production must not sleep. Declared, not left out, so an apply turns it
    // off wherever it came from: a production duplicated from staging has it on.
    sleepsWhenIdle: false,
    // Only production tunes Sentry.
    variables: [
      "NEXT_PUBLIC_SENTRY_ENABLE_LOGS",
      "NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII",
      "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
      "SENTRY_ENABLE_LOGS",
      "SENTRY_SEND_DEFAULT_PII",
      "SENTRY_TRACES_SAMPLE_RATE",
    ],
  },
} as const;

export default defineRailway((ctx) => {
  const name = (Object.keys(ENVIRONMENTS) as Array<keyof typeof ENVIRONMENTS>).find((key) =>
    ctx.isEnvironment(key)
  );
  if (name === undefined) {
    throw new Error(
      `.railway/railway.ts has no configuration for environment "${ctx.environmentName}"`
    );
  }
  const environment = ENVIRONMENTS[name];
  const names = [...SHARED_VARIABLES, ...environment.variables];
  const web = service("footy-trends", {
    source: github("koodauspaja/footy-trends", {
      branch: environment.branch,
      ...(environment.waitForCi ? { checkSuites: true } : {}),
    }),
    env: Object.fromEntries(names.map((variable) => [variable, preserve()])),
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
      // Not `npm start`: npm runs its script through `sh -c`, and on the image's
      // dash the shell dies on Railway's SIGTERM while the server never receives
      // it. Requests in flight were cut off and npm reported a failure, which
      // listed every replaced deployment as CRASHED (#525). Started directly,
      // Next closes the server and finishes pending requests first.
      startCommand: "node node_modules/next/dist/bin/next start",
      // No traffic until this returns 200.
      healthcheckPath: "/api/health",
      healthcheckTimeout: 60,
      // Restart on failure, at most 3 times. "On failure" is Railway's default,
      // which it stores as null, so declaring it would show as a change in
      // every plan; only the retries, which are not the default, are declared.
      restartPolicyMaxRetries: 3,
      // Zero-downtime deploys: the old container stays up 15 s after the new
      // one is healthy, then drains connections for 10 s.
      overlapSeconds: 15,
      drainingSeconds: 10,
      sleepApplication: environment.sleepsWhenIdle,
    },
  });

  return project(ctx.projectName ?? "footy-trends", { resources: [web] });
});
