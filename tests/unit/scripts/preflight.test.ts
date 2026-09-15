import { describe, expect, it } from "vitest";
import { type PreflightActions, runPreflight } from "../../../scripts/preflight";
import type { Preflight } from "../../../scripts/services-plan";

const URL = "postgresql://postgres:secret@localhost:5432/footy-trends";

/**
 * Every action recorded, nothing real. `steps` is the order things happened in,
 * which is most of what this module is: two failures can produce the same exit
 * code and still be different bugs.
 */
function actions(
  decision: Preflight,
  overrides: Partial<PreflightActions> = {}
): PreflightActions & { steps: string[]; out: (line: string) => void } {
  const steps: string[] = [];
  const base: PreflightActions & { steps: string[] } = {
    steps,
    url: URL,
    decide: async () => decision,
    startDaemon: () => {
      steps.push("startDaemon");
      return true;
    },
    dockerIsRunning: () => true,
    startContainers: () => {
      steps.push("startContainers");
      return true;
    },
    postgresReachable: async () => true,
    wait: async (probe) => ({ ok: await probe(), waitedMs: 10 }),
    daemonTimeoutMs: 90_000,
    postgresTimeoutMs: 60_000,
    out: (line) => steps.push(`out:${line}`),
    err: (line) => steps.push(`err:${line}`),
  };
  return { ...base, ...overrides, steps };
}

describe("runPreflight", () => {
  it("does nothing at all when Postgres already answers", async () => {
    const a = actions({ kind: "ready" });

    expect(await runPreflight(a)).toBe(0);
    // Not even a line of output: this runs before every `npm run dev`, and the
    // common case should be invisible.
    expect(a.steps).toEqual([]);
  });

  it("prints why it skipped in CI, and starts nothing", async () => {
    const a = actions({ kind: "skip", message: "CI is set" });

    expect(await runPreflight(a)).toBe(0);
    expect(a.steps).toEqual(["out:CI is set"]);
  });

  it.each([
    { kind: "no-docker", message: "no docker here" } as const,
    { kind: "remote-unreachable", message: "that is not this machine" } as const,
  ])("reports $kind on stderr and stops, starting nothing", async (decision) => {
    const a = actions(decision);

    expect(await runPreflight(a)).toBe(1);
    expect(a.steps).toEqual([`err:${decision.message}`]);
  });

  it("starts the containers when only they are down", async () => {
    const a = actions({ kind: "start-containers" });

    expect(await runPreflight(a)).toBe(0);
    expect(a.steps).toEqual([
      "out:Starting the project's containers…",
      "startContainers",
      "out:Postgres is ready.",
    ]);
  });

  it("starts the daemon first, then the containers", async () => {
    const a = actions({ kind: "start-daemon" });

    expect(await runPreflight(a)).toBe(0);
    // The order is the point: a daemon that was down means the containers are
    // down too, so this falls through rather than deciding again.
    expect(a.steps).toEqual([
      "out:The Docker daemon is not running. Starting it…",
      "startDaemon",
      "out:Starting the project's containers…",
      "startContainers",
      "out:Postgres is ready.",
    ]);
  });

  it("gives up, without touching the containers, when the daemon never comes up", async () => {
    const a = actions(
      { kind: "start-daemon" },
      {
        dockerIsRunning: () => false,
        wait: async () => ({ ok: false, waitedMs: 90_000 }),
      }
    );

    expect(await runPreflight(a)).toBe(1);
    expect(a.steps).not.toContain("startContainers");
    expect(a.steps.at(-1)).toContain("did not come up within 90s");
  });

  it("reports a compose failure rather than waiting out the timeout", async () => {
    const a = actions({ kind: "start-containers" }, { startContainers: () => false });

    expect(await runPreflight(a)).toBe(1);
    expect(a.steps.at(-1)).toContain("`docker compose up -d` failed");
  });

  it("reports the wait when Postgres never answers, naming host and port only", async () => {
    const a = actions(
      { kind: "start-containers" },
      { wait: async () => ({ ok: false, waitedMs: 60_000 }) }
    );

    expect(await runPreflight(a)).toBe(1);
    const last = a.steps.at(-1) ?? "";
    expect(last).toContain("localhost:5432");
    expect(last).not.toContain("secret");
  });
});
