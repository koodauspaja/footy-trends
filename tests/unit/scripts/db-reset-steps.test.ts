import { describe, expect, it } from "vitest";
import {
  type ResetActions,
  runReset,
  runTestReset,
  type TestResetActions,
} from "../../../scripts/db-reset-steps";

const LOCAL = "postgresql://postgres:secret@localhost:5432/footy-trends";
const REMOTE = "postgresql://user:hunter2@altaria.proxy.rlwy.net:45459/railway";

/** Every action recorded, nothing real — `steps` is the order things happened in. */
function actions(overrides: Partial<ResetActions> = {}): ResetActions & { steps: string[] } {
  const steps: string[] = [];
  const base: ResetActions & { steps: string[] } = {
    steps,
    url: LOCAL,
    dockerAvailable: () => true,
    dockerIsRunning: () => true,
    destroyContainers: () => {
      steps.push("destroy");
      return true;
    },
    startContainers: () => {
      steps.push("start");
      return true;
    },
    postgresReachable: async () => true,
    wait: async (probe) => ({ ok: await probe(), waitedMs: 10 }),
    migrate: async () => {
      steps.push("migrate");
      return 0;
    },
    postgresTimeoutMs: 60_000,
    out: (line) => steps.push(`out:${line}`),
    err: (line) => steps.push(`err:${line}`),
  };
  return { ...base, ...overrides, steps };
}

describe("runReset", () => {
  it("says what was destroyed as soon as it is destroyed", async () => {
    /**
     * Everything after the volume goes can fail, and the data is gone in every
     * one of those cases — so a notice printed only on success would be missing
     * from exactly the runs that needed it. Raised in review on #405.
     */
    const a = actions({ startContainers: () => false });

    expect(await runReset(a)).toBe(1);

    const notice = a.steps.findIndex((s) => s.includes("has gone"));
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(a.steps.indexOf("destroy"));
  });

  it("describes the server rather than naming a test database it cannot know", async () => {
    // TEST_DATABASE_URL can point the suites at another server entirely, so
    // claiming a particular test database was destroyed would be a guess.
    const a = actions();

    await runReset(a);

    const notice = a.steps.find((s) => s.includes("has gone")) ?? "";
    expect(notice).toContain("not only footy-trends");
    expect(notice).not.toContain("footy-trends_test");
  });

  it("destroys, restarts and migrates, in that order", async () => {
    const a = actions();

    expect(await runReset(a)).toBe(0);
    expect(a.steps.filter((s) => !s.startsWith("out:"))).toEqual(["destroy", "start", "migrate"]);
  });

  /**
   * The tests that matter most here. This is the only command in the repository
   * that deletes data on purpose, so what needs pinning is not the happy path —
   * it is that every refusal happens *before* anything is destroyed.
   */
  describe("refuses before destroying anything", () => {
    it("when the target is not this project's database", async () => {
      const a = actions({ url: REMOTE });

      expect(await runReset(a)).toBe(1);
      expect(a.steps).not.toContain("destroy");
      expect(a.steps.at(-1)).toContain("not this project's database");
      expect(a.steps.at(-1)).not.toContain("hunter2");
    });

    it("when DATABASE_URL is unset", async () => {
      const a = actions({ url: undefined });

      expect(await runReset(a)).toBe(1);
      expect(a.steps).not.toContain("destroy");
    });

    it("when Docker is not installed", async () => {
      const a = actions({ dockerAvailable: () => false });

      expect(await runReset(a)).toBe(1);
      expect(a.steps).not.toContain("destroy");
      expect(a.steps.at(-1)).toContain("Docker is not running");
    });

    it("when the daemon is down", async () => {
      const a = actions({ dockerIsRunning: () => false });

      expect(await runReset(a)).toBe(1);
      expect(a.steps).not.toContain("destroy");
    });
  });

  it("stops when the containers cannot be removed", async () => {
    const a = actions({ destroyContainers: () => false });

    expect(await runReset(a)).toBe(1);
    expect(a.steps).not.toContain("start");
    expect(a.steps.at(-1)).toContain("down --volumes` failed");
  });

  it("stops when they cannot be started again", async () => {
    const a = actions({ startContainers: () => false });

    expect(await runReset(a)).toBe(1);
    expect(a.steps).not.toContain("migrate");
  });

  it("does not migrate a database that never came up", async () => {
    const a = actions({ wait: async () => ({ ok: false, waitedMs: 60_000 }) });

    expect(await runReset(a)).toBe(1);
    expect(a.steps).not.toContain("migrate");
    expect(a.steps.at(-1)).toContain("localhost:5432");
  });

  it("fails when the migrations do, rather than reporting a fresh database", async () => {
    const a = actions({ migrate: async () => 1 });

    expect(await runReset(a)).toBe(1);
    expect(a.steps.at(-1)).toContain("Migrations failed");
    expect(a.steps).not.toContain("out:The local database is fresh and migrated.");
  });
});

describe("runTestReset", () => {
  function testActions(overrides: Partial<TestResetActions> = {}) {
    const steps: string[] = [];
    const base: TestResetActions & { steps: string[] } = {
      steps,
      url: "postgresql://postgres:x@localhost:5432/footy-trends_test",
      dropDatabase: async () => {
        steps.push("drop");
        return true;
      },
      out: (line) => steps.push(`out:${line}`),
      err: (line) => steps.push(`err:${line}`),
    };
    return { ...base, ...overrides, steps };
  }

  it("drops the database and stops there", async () => {
    const a = testActions();

    expect(await runTestReset(a)).toBe(0);
    /**
     * No containers, no volume, no migrations — `ensureTestDatabase` rebuilds it
     * at the start of the next run, so doing it here would repeat work the thing
     * about to use it does anyway. That is the whole difference between a
     * one-second command and a thirty-second one.
     */
    expect(a.steps).toEqual([
      "drop",
      "out:The test database is gone. The next test run recreates and migrates it.",
    ]);
  });

  it("refuses the development database without dropping anything", async () => {
    const a = testActions({ url: "postgresql://postgres:x@localhost:5432/footy-trends" });

    expect(await runTestReset(a)).toBe(1);
    expect(a.steps).not.toContain("drop");
    expect(a.steps.at(-1)).toContain("that is the development database");
  });

  it("refuses a database on another server", async () => {
    const a = testActions({ url: "postgresql://u:p@db.example.com:5432/suite_test" });

    expect(await runTestReset(a)).toBe(1);
    expect(a.steps).not.toContain("drop");
  });

  it("reports a failed drop rather than claiming the database is gone", async () => {
    const a = testActions({ dropDatabase: async () => false });

    expect(await runTestReset(a)).toBe(1);
    expect(a.steps.at(-1)).toContain("Could not drop");
  });
});

describe("runReset, confirmation", () => {
  it("asks before anything is destroyed, and stops on a decline", async () => {
    const a = actions({ confirm: async () => "declined" });

    expect(await runReset(a)).toBe(1);
    expect(a.steps).not.toContain("destroy");
    expect(a.steps.at(-1)).toContain("Nothing was changed");
  });

  it("refuses outright when there was nobody to ask", async () => {
    const a = actions({ confirm: async () => "refused" });

    expect(await runReset(a)).toBe(1);
    expect(a.steps).not.toContain("destroy");
    expect(a.steps.at(-1)).toContain("--yes");
  });

  it("proceeds when confirmed", async () => {
    const a = actions({ confirm: async () => "proceed" });

    expect(await runReset(a)).toBe(0);
    expect(a.steps).toContain("destroy");
  });

  it("asks before Docker is even looked for", async () => {
    // "It did not ask me" and "it did not run" are indistinguishable only until
    // the volume is gone.
    const order: string[] = [];
    const a = actions({
      confirm: async () => {
        order.push("confirm");
        return "declined";
      },
      dockerAvailable: () => {
        order.push("docker");
        return true;
      },
    });

    await runReset(a);

    expect(order).toEqual(["confirm"]);
  });
});
