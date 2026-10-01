import { existsSync } from "node:fs";
import { createRailwayContext, project } from "railway/iac";
import { describe, expect, it } from "vitest";
import program, { partial } from "../../.railway/railway";

/**
 * `.railway/railway.ts` (#521). Railway's CLI ignores a key it does not know
 * without a word, so a typo would silently drop a setting — the migrations
 * before traffic among them. Every value is pinned here, as the file evaluates
 * for each environment.
 */

/**
 * Every variable each environment's web service holds, by name; RAILWAY_* are
 * Railway's own. Written out here rather than imported from the file, on
 * purpose: this is the record of what Railway holds, so a change to the file's
 * lists has to be made here too, deliberately.
 */
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
    startCommand: "npm start",
    healthcheckPath: "/api/health",
    healthcheckTimeout: 60,
    restartPolicyMaxRetries: 3,
    overlapSeconds: 15,
    drainingSeconds: 10,
  },
};

describe(".railway/railway.ts (#521)", () => {
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

  // Falling back to staging's branch and variables would delete whatever a
  // third environment holds beyond staging's list.
  it("refuses an environment it has no configuration for, before anything is planned", async () => {
    await expect(resourcesFor("pr-123")).rejects.toThrow(
      '.railway/railway.ts has no configuration for environment "pr-123"'
    );
  });

  it("names the project after Railway's own, falling back to footy-trends", async () => {
    const definition = await program(createRailwayContext({ environmentName: "staging" }), project);

    expect(definition.name).toBe("footy-trends");
  });

  it("replaces railway.toml, which no longer exists", () => {
    expect(existsSync(new URL("../../railway.toml", import.meta.url))).toBe(false);
  });
});
