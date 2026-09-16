import { describe, expect, it } from "vitest";
import { type ResetActions, runReset } from "../../../scripts/db-reset-steps";

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
  it("says the test database went too, because the volume held both", async () => {
    // Not obvious and not reversible by the person who ran it: the suites'
    // database shares the server and therefore the volume. Nothing has to be
    // done about it, but silence would be the wrong answer.
    const a = actions();

    await runReset(a);

    expect(a.steps.at(-1)).toContain("footy-trends_test went with the volume");
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
