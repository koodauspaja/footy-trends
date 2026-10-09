/**
 * The web service's Railway configuration, as Infrastructure as Code. Railway
 * reads it only when it is applied, once per environment, and an apply removes
 * whatever the service has that is not declared here.
 *
 * decisions/521-railway-infrastructure-as-code.md
 * decisions/525-next-started-directly.md
 * decisions/551-staging-sleeps-when-idle.md
 * decisions/522-railway-environment-from-code.md
 */
import {
  defineRailway,
  github,
  preserve,
  project,
  type RailwayContext,
  service,
} from "railway/iac";

export const partial = "footy-trends";

/**
 * The variables both environments hold, by name only.
 *
 * decisions/521-railway-infrastructure-as-code.md
 */
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

/**
 * Each environment: its branch, whether it waits for CI, and its own variables.
 *
 * decisions/521-railway-infrastructure-as-code.md
 * decisions/551-staging-sleeps-when-idle.md
 */
const ENVIRONMENTS = {
  staging: {
    branch: "main",
    waitForCi: false,
    // Idle almost all the time, and nothing depends on it staying warm: it sleeps
    // after a quiet spell and wakes on the next request.
    sleepsWhenIdle: true,
    // Only staging restricts sign-in and sets the proxy headers it trusts.
    variables: ["AUTH_ALLOWED_EMAILS", "AUTH_CLIENT_IP_HEADERS", "AUTH_TRUSTED_PROXIES"],
  },
  production: {
    branch: "release",
    // A red release.yml run leaves the previous version serving (skills/release.md).
    waitForCi: true,
    // Production must not sleep.
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

/**
 * The variable that carries a new environment's branch. Without it, a name
 * other than the two above has no configuration.
 *
 * decisions/522-railway-environment-from-code.md
 */
export const BRANCH_VARIABLE = "RAILWAY_NEW_ENVIRONMENT_BRANCH";

/**
 * The entry an environment evaluates as: its own, or staging's on the branch
 * `BRANCH_VARIABLE` names.
 *
 * decisions/521-railway-infrastructure-as-code.md
 * decisions/522-railway-environment-from-code.md
 */
function environmentFor(ctx: RailwayContext) {
  const name = (Object.keys(ENVIRONMENTS) as Array<keyof typeof ENVIRONMENTS>).find((key) =>
    ctx.isEnvironment(key)
  );
  if (name !== undefined) return ENVIRONMENTS[name];

  const branch = process.env[BRANCH_VARIABLE];
  if (branch === undefined || branch === "") {
    throw new Error(
      `.railway/railway.ts has no configuration for environment "${ctx.environmentName}" (a new one needs ${BRANCH_VARIABLE})`
    );
  }
  return { ...ENVIRONMENTS.staging, branch };
}

export default defineRailway((ctx) => {
  const environment = environmentFor(ctx);
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
      // Not `npm start`: npm runs its script through `sh -c`, and that shell dies on
      // Railway's SIGTERM while the server never receives it.
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
      // Left out where it is off, which is how an apply turns it off: a plan
      // for a service that has it on shows `true → null`. Not `false`, which
      // plans as a change on every run, because Railway stores off as unset.
      ...(environment.sleepsWhenIdle ? { sleepApplication: true } : {}),
    },
  });

  return project(ctx.projectName ?? "footy-trends", { resources: [web] });
});
