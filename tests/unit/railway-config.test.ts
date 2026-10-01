import { existsSync } from "node:fs";
import { createRailwayContext, project } from "railway/iac";
import { describe, expect, it } from "vitest";
import program, { partial, WEB_SERVICE } from "../../.railway/railway";

/**
 * `.railway/railway.ts` (#521). Railway's CLI ignores a key it does not know
 * without a word, so a typo would silently drop a setting — the migrations
 * before traffic among them. Every value is pinned here, as the file evaluates
 * for each environment.
 */

async function resourcesFor(environmentName: string) {
  const definition = await program(
    createRailwayContext({ environmentName, projectName: "footy-trends" }),
    project
  );
  return definition.resources ?? [];
}

const EXPECTED_WEB = {
  address: `service.${WEB_SERVICE}`,
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
    restartPolicyType: "ON_FAILURE",
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

  it("declares no source, so the GitHub connection and its branch stay as the dashboard has them", async () => {
    const [web] = await resourcesFor("production");

    expect(web).not.toHaveProperty("source");
  });

  it("names the project after Railway's own, falling back to footy-trends", async () => {
    const definition = await program(createRailwayContext({ environmentName: "staging" }), project);

    expect(definition.name).toBe("footy-trends");
  });

  it("replaces railway.toml, which no longer exists", () => {
    expect(existsSync("railway.toml")).toBe(false);
  });
});
