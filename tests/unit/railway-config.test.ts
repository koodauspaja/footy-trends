import { existsSync } from "node:fs";
import { createRailwayContext, project } from "railway/iac";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TARGET_VARIABLE as DATABASES_TARGET_VARIABLE } from "../../.railway/databases";
import program, { BRANCH_VARIABLE, partial, TARGET_VARIABLE } from "../../.railway/railway";

/**
 * `.railway/railway.ts`, as it evaluates for each environment. Railway's CLI
 * ignores a key it does not know without a word, so a typo would silently drop
 * a setting, the migrations before traffic among them: every value is pinned.
 *
 * decisions/521-railway-infrastructure-as-code.md
 * decisions/551-staging-sleeps-when-idle.md
 * decisions/522-railway-environment-from-code.md
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

// Every variable each environment's web service holds, by name; RAILWAY_* are
// Railway's own. Written out here, not imported from the file, on purpose: a
// change to the file's lists has to be made here too, deliberately.
const SHARED = [
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
const HELD = {
  staging: [...SHARED, "AUTH_ALLOWED_EMAILS", "AUTH_CLIENT_IP_HEADERS", "AUTH_TRUSTED_PROXIES"],
  production: [
    ...SHARED,
    "NEXT_PUBLIC_SENTRY_ENABLE_LOGS",
    "NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII",
    "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
    "SENTRY_ENABLE_LOGS",
    "SENTRY_SEND_DEFAULT_PII",
    "SENTRY_TRACES_SAMPLE_RATE",
  ],
};

async function resourcesFor(environmentName: string) {
  const definition = await program(
    createRailwayContext({ environmentName, projectName: "footy-trends" }),
    project
  );
  return definition.resources ?? [];
}

const EXPECTED_WEB = {
  address: "service.footy-trends",
  type: "service",
  name: "footy-trends",
  build: {
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
    preDeployCommand: ["npm run db:migrate"],
    startCommand: "node node_modules/next/dist/bin/next start",
    healthcheckPath: "/api/health",
    healthcheckTimeout: 60,
    restartPolicyMaxRetries: 3,
    overlapSeconds: 15,
    drainingSeconds: 10,
  },
};

describe(".railway/railway.ts", () => {
  it("is a named partial, so an apply cannot delete what it does not declare", () => {
    expect(partial).toBe("footy-trends");
  });

  it.each(["staging", "production"])(
    "declares the web service alone in %s, with every setting railway.toml had",
    async (environment) => {
      const resources = await resourcesFor(environment);

      expect(resources).toHaveLength(1);
      expect(resources[0]).toMatchObject(EXPECTED_WEB);
    }
  );

  // An undeclared source is detached by an apply: the first staging plan set
  // source.repo to null. Production also waits for release.yml (checkSuites).
  it.each([
    ["staging", { type: "github", repo: "koodauspaja/footy-trends", branch: "main" }],
    [
      "production",
      { type: "github", repo: "koodauspaja/footy-trends", branch: "release", checkSuites: true },
    ],
  ])("deploys %s from its branch", async (environment, source) => {
    const [web] = await resourcesFor(environment);

    expect(web).toHaveProperty("source", source);
  });

  // An undeclared variable is deleted by an apply: the first staging plan would
  // have removed all seventeen. Each is kept, by name, with no value here.
  it.each(["staging", "production"] as const)(
    "keeps every variable %s holds, and only those",
    async (environment) => {
      const [web] = (await resourcesFor(environment)) as Array<{ variables?: object }>;
      const variables = Object.entries(web?.variables ?? {});

      expect(variables.map(([name]) => name).sort()).toEqual([...HELD[environment]].sort());
      for (const [, value] of variables) expect(value).toEqual({ type: "preserve" });
    }
  );

  // Railway stores its default restart policy, "On Failure", as null: declared,
  // it would plan as a change on every run (seen applying to staging).
  it("leaves the restart policy to Railway's default, on failure", async () => {
    const [web] = (await resourcesFor("staging")) as Array<{ deploy?: object }>;

    expect(web?.deploy).not.toHaveProperty("restartPolicyType");
  });

  it("lets staging sleep when idle", async () => {
    const [web] = (await resourcesFor("staging")) as Array<{ deploy?: object }>;

    expect(web?.deploy).toHaveProperty("sleepApplication", true);
  });

  // Left out, which an apply reads as "unset it": planned against a service
  // that has it on, this file shows `true → null`. `false` would plan as a
  // change on every run, because Railway stores off as unset.
  it("turns sleeping off in production, by leaving it out", async () => {
    const [web] = (await resourcesFor("production")) as Array<{ deploy?: object }>;

    expect(web?.deploy).not.toHaveProperty("sleepApplication");
  });

  // Falling back to staging's branch and variables would delete whatever a
  // third environment holds beyond staging's list.
  it("refuses an environment it has no configuration for", async () => {
    await expect(resourcesFor("pr-123")).rejects.toThrow(
      '.railway/railway.ts has no configuration for environment "pr-123"'
    );
  });

  it("refuses a new environment whose branch variable is empty", async () => {
    vi.stubEnv(BRANCH_VARIABLE, "");

    await expect(resourcesFor("pr-123")).rejects.toThrow(`a new one needs ${BRANCH_VARIABLE}`);
  });

  // The web service alone, as everywhere: a new environment's databases are in
  // their own file, so this one can never plan a database's deletion.
  it("shapes a new environment as staging, on the branch it is given", async () => {
    vi.stubEnv(BRANCH_VARIABLE, "feature/099-something");

    const resources = (await resourcesFor("pr-123")) as Array<{ variables?: object }>;

    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({ ...EXPECTED_WEB, deploy: { sleepApplication: true } });
    expect(resources[0]).toHaveProperty("source", {
      type: "github",
      repo: "koodauspaja/footy-trends",
      branch: "feature/099-something",
    });
    expect(Object.keys(resources[0]?.variables ?? {}).sort()).toEqual([...HELD.staging].sort());
  });

  it.each([
    ["staging", "main"],
    ["production", "release"],
  ])(
    "keeps %s on its own branch whatever the branch variable says",
    async (environment, branch) => {
      vi.stubEnv(BRANCH_VARIABLE, "feature/099-something");

      const [web] = await resourcesFor(environment);

      expect(web).toHaveProperty("source.branch", branch);
    }
  );

  // The command names one id to both files. A link that moved to production
  // between its two applies must stop this one, not apply to production.
  it.each(["staging", "production", "pr-123"])(
    "refuses %s when told to apply to another environment's id",
    async (environment) => {
      vi.stubEnv(BRANCH_VARIABLE, "main");
      vi.stubEnv(TARGET_VARIABLE, "00000000-0000-4000-8000-000000000001");

      const told = async () =>
        await program(
          createRailwayContext({
            environmentName: environment,
            environmentId: "00000000-0000-4000-8000-000000000002",
          }),
          project
        );

      await expect(told()).rejects.toThrow(
        `was told to apply to 00000000-0000-4000-8000-000000000001, and the linked environment is "${environment}"`
      );
    }
  );

  it("evaluates for the environment whose id it is told", async () => {
    vi.stubEnv(BRANCH_VARIABLE, "main");
    vi.stubEnv(TARGET_VARIABLE, "00000000-0000-4000-8000-000000000001");

    const definition = await program(
      createRailwayContext({
        environmentName: "pr-123",
        environmentId: "00000000-0000-4000-8000-000000000001",
      }),
      project
    );

    expect(definition.resources).toHaveLength(1);
  });

  it("is told its environment through the variable the databases file requires", () => {
    expect(TARGET_VARIABLE).toBe(DATABASES_TARGET_VARIABLE);
  });

  it("names the project after Railway's own, falling back to footy-trends", async () => {
    const definition = await program(createRailwayContext({ environmentName: "staging" }), project);

    expect(definition.name).toBe("footy-trends");
  });

  it("replaces railway.toml, which no longer exists", () => {
    expect(existsSync(new URL("../../railway.toml", import.meta.url))).toBe(false);
  });
});
