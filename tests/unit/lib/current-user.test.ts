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
/**
 * Every test here imports a **real** module graph — that is the point of the
 * file, and mocking `@/lib/auth` is what would hide what it protects.
 *
 * That graph is the largest in the repository: better-auth, its Drizzle adapter,
 * and the schema. Transforming it cold costs 500-640 ms on an idle machine and
 * was measured between 588 and 1266 ms while the other 111 files were running —
 * a 2.5x spread across three runs. Vitest's 5 s default left no room for the
 * tail of that distribution, and the file failed roughly once in ten full runs
 * with `Test timed out in 5000ms`, never in isolation (#316).
 *
 * These tests assert a guard, not a latency. Thirty seconds is far past any
 * contention this machine produces, and still fails fast if the import ever
 * genuinely hangs.
 */
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
