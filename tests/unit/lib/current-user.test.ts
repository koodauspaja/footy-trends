import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Importing a server action module must not construct better-auth. Production never notices, as
 * Next stubs a `"use server"` import, and a local `.env` hides it, so these tests delete the
 * variables the way CI's unit job has none. Mocking `@/lib/auth` would hide the failure.
 *
 * decisions/026-favourites.md
 * decisions/316-heaviest-import-timeout.md
 */

// Every test here imports a real module graph, the largest in the repository: better-auth,
// its Drizzle adapter and the schema. These tests assert a guard, not a latency: thirty
// seconds is far past any contention, and still fails fast if the import ever hangs.
vi.setConfig({ testTimeout: 30_000 });

const ACTION_MODULES = {
  "favourite-actions": () => import("@/lib/favourite-actions"),
  "avatar-actions": () => import("@/lib/avatar-actions"),
  "settings-actions": () => import("@/lib/settings-actions"),
};

const AUTH_VARIABLES = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("a server action module", () => {
  it.each(Object.entries(ACTION_MODULES))(
    "%s does not construct better-auth merely by being imported",
    async (_name, load) => {
      vi.resetModules();
      // `vi.stubEnv(name, undefined)` deletes the variable, which is what CI
      // looks like — not an empty string, which `required()` also rejects but
      // for a different reason.
      for (const variable of AUTH_VARIABLES) vi.stubEnv(variable, undefined);

      await expect(load()).resolves.toBeDefined();
    }
  );
});

describe("@/lib/auth itself", () => {
  it("still refuses to construct without its secret", async () => {
    // The other half of the same fact: the guard this test relies on is real,
    // so the test above is asserting a lazy import rather than a missing check.
    vi.resetModules();
    for (const variable of AUTH_VARIABLES) vi.stubEnv(variable, undefined);

    await expect(import("@/lib/auth")).rejects.toThrow(
      "BETTER_AUTH_SECRET is required for authentication but is not set"
    );
  });
});
