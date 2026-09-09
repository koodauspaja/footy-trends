import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The invariant behind `src/lib/current-user.ts`.
 *
 * `@/lib/auth` constructs better-auth at module scope and throws without
 * `BETTER_AUTH_SECRET`. A `"use server"` module is imported by name from client
 * components — Next replaces it with a network stub, so production never
 * evaluates the chain in a browser and never notices. Anything without that
 * transform does, and **the CI unit job has no environment at all**,
 * deliberately (#158).
 *
 * This is not hypothetical. specs/026's toggle renders inside `standings-table`
 * and the region picker, so a static `import { auth }` in the actions module put
 * better-auth into the import graph of eight test files that have nothing to do
 * with authentication: 114 tests failed in CI while passing locally, where a
 * `.env` happens to exist. This test is what makes that visible without CI.
 *
 * Deliberately **not** mocking `@/lib/auth`: mocking it is what would hide the
 * failure. The real module has to be reachable and simply never constructed.
 */
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
