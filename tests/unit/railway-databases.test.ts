import { createRailwayContext, project } from "railway/iac";
import { afterEach, describe, expect, it, vi } from "vitest";
import program, {
  PROTECTED_ENVIRONMENT_IDS,
  partial,
  REGION,
  TARGET_VARIABLE,
} from "../../.railway/databases";

/**
 * `.railway/databases.ts`: a new environment's Postgres and Redis, and the two
 * refusals that keep it away from an environment that already has them.
 *
 * decisions/522-railway-environment-from-code.md
 */

const NEW_ID = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Async, so a refusal thrown while evaluating is a rejection to assert on.
async function evaluate(environmentId: string | undefined, environmentName = "pr-123") {
  return await program(
    createRailwayContext({
      environmentName,
      ...(environmentId === undefined ? {} : { environmentId }),
    }),
    project
  );
}

describe(".railway/databases.ts", () => {
  // Its own partial: the web service's file never owned a database, so no apply
  // of that file can plan one's deletion.
  it("is a partial of its own, apart from the web service's", () => {
    expect(partial).toBe("footy-trends-databases");
  });

  it("declares Postgres and Redis for the environment it is told to", async () => {
    vi.stubEnv(TARGET_VARIABLE, NEW_ID);

    const definition = await evaluate(NEW_ID);

    expect(definition.resources).toMatchObject([
      {
        address: "database.Postgres",
        engine: "postgres",
        deploy: { multiRegionConfig: { [REGION]: { numReplicas: 1 } } },
      },
      {
        address: "database.Redis",
        engine: "redis",
        deploy: { multiRegionConfig: { [REGION]: { numReplicas: 1 } } },
      },
    ]);
    expect(definition.resources).toHaveLength(2);
  });

  // Railway's stored name for the same place, `europe-west4-drams3a`, creates a
  // Redis with no `REDIS_URL`: the site then answers with Redis unreachable.
  it("names the region by its short name, which creates Railway's own Redis", () => {
    expect(REGION).toBe("europe-west4");
  });

  it("protects this project's staging and production, by id", () => {
    expect(PROTECTED_ENVIRONMENT_IDS).toEqual([
      "ce529414-ae59-493c-aada-f8456fbe897a",
      "655bdeeb-5f32-46cd-9a55-b30897ec548c",
    ]);
  });

  // Even named as the target: the id list is checked first and on its own.
  it.each(PROTECTED_ENVIRONMENT_IDS)(
    "refuses protected environment %s even when it is the named target",
    async (id) => {
      vi.stubEnv(TARGET_VARIABLE, id);

      await expect(evaluate(id, "production")).rejects.toThrow(
        '.railway/databases.ts is never applied to environment "production"'
      );
    }
  );

  it("refuses when the CLI names no environment id", async () => {
    vi.stubEnv(TARGET_VARIABLE, NEW_ID);

    await expect(evaluate(undefined)).rejects.toThrow("is never applied to environment");
  });

  it("refuses an apply by hand, which names no target", async () => {
    await expect(evaluate(NEW_ID)).rejects.toThrow("applied only by npm run railway:environment");
  });

  it("refuses an environment other than the one named", async () => {
    vi.stubEnv(TARGET_VARIABLE, "00000000-0000-4000-8000-000000000002");

    await expect(evaluate(NEW_ID)).rejects.toThrow("applied only by npm run railway:environment");
  });
});
