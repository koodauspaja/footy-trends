import { describe, expect, it, vi } from "vitest";
import { PROTECTED_ENVIRONMENT_IDS, TARGET_VARIABLE } from "../../../.railway/databases";
import { BRANCH_VARIABLE } from "../../../.railway/railway";
import {
  HEALTH_ATTEMPTS,
  HEALTH_INTERVAL_MS,
  type Steps,
  standUp,
} from "../../../scripts/railway-environment-steps";

/**
 * The sequence behind `npm run railway:environment`, with the CLI, the network
 * and the clock injected: what is run, in which order, and where it stops.
 *
 * decisions/522-railway-environment-from-code.md
 */

const NEW_ID = "00000000-0000-4000-8000-000000000001";
const DOMAIN = "https://footy-trends-pr-123.up.railway.app";
const REQUEST = { name: "pr-123", branch: "feature/099-something" };
const KEYS = {
  FOOTBALL_DATA_API_KEY: "football",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  AUTH_ALLOWED_EMAILS: "someone@example.com",
};
const OK = { checks: { database: "ok", redis: "ok" } };

type Environment = { id: string; name: string; services: string[] };

function statusOf(environments: Environment[]): string {
  return JSON.stringify({
    environments: {
      edges: environments.map(({ id, name, services }) => ({
        node: {
          id,
          name,
          serviceInstances: { edges: services.map((serviceName) => ({ node: { serviceName } })) },
        },
      })),
    },
  });
}

/**
 * A Railway that holds `environments`, records every call, and answers
 * `status` from `statuses` in turn when a test needs the answer to change.
 */
function fake({
  environments = [],
  statuses,
  domain = { domain: DOMAIN },
  health = [OK],
  env = KEYS,
}: {
  environments?: Environment[];
  statuses?: Environment[][];
  domain?: unknown;
  health?: unknown[];
  env?: Record<string, string | undefined>;
} = {}) {
  const held = [...environments];
  const calls: Array<{ args: string[]; input?: string; env?: Record<string, string> }> = [];
  const lines: string[] = [];
  const answers = [...health];
  let reads = 0;

  const steps: Steps = {
    railway(args, options = {}) {
      calls.push({ args, ...options });
      const [command, action, name] = args;
      if (command === "status") {
        const scripted = statuses?.[reads];
        reads += 1;
        return statusOf(scripted ?? held);
      }
      if (command === "environment" && action === "new") {
        held.push({ id: NEW_ID, name: String(name), services: [] });
      }
      if (command === "domain") return JSON.stringify(domain);
      return "{}";
    },
    env,
    secret: () => "generated-secret",
    health: vi.fn(async () => (answers.length > 1 ? answers.shift() : answers[0])),
    wait: vi.fn(async () => {}),
    out: (line) => lines.push(line),
  };

  const ran = () => calls.map(({ args }) => args.slice(0, 2).join(" "));
  return { steps, calls, lines, ran };
}

describe("standUp", () => {
  it("creates the environment, applies both files, sets every variable, then deploys", async () => {
    const railway = fake();

    const outcome = await standUp(REQUEST, railway.steps);

    expect(outcome).toEqual({
      ok: true,
      message: `${DOMAIN}/api/health reports the database and Redis ok.`,
    });
    expect(railway.ran()).toEqual([
      "status --json",
      "environment new",
      "status --json",
      "config apply",
      "config apply",
      "domain --service",
      ...Array.from({ length: 11 }, () => "variable set"),
      "redeploy --service",
    ]);
  });

  // The databases file evaluates only for the id it is handed here, and that id
  // is the one just read as empty.
  it("names the environment it read as empty to the databases file, and the branch to the web file", async () => {
    const railway = fake();

    await standUp(REQUEST, railway.steps);

    const applies = railway.calls.filter(({ args }) => args[0] === "config");
    expect(applies[0]).toMatchObject({
      args: ["config", "apply", "--file", ".railway/databases.ts", "--yes"],
      env: { [TARGET_VARIABLE]: NEW_ID },
    });
    expect(applies[1]).toMatchObject({
      args: ["config", "apply", "--file", ".railway/railway.ts", "--yes"],
      env: { [BRANCH_VARIABLE]: "feature/099-something" },
    });
  });

  it("hands each value to the CLI on stdin, never as an argument", async () => {
    const railway = fake();

    await standUp(REQUEST, railway.steps);

    const sets = railway.calls.filter(({ args }) => args[0] === "variable");
    const secret = sets.find(({ args }) => args[2] === "GOOGLE_CLIENT_SECRET");
    expect(secret?.input).toBe("google-secret");
    expect(sets.find(({ args }) => args[2] === "BETTER_AUTH_SECRET")?.input).toBe(
      "generated-secret"
    );
    for (const { args, input } of sets) expect(args).not.toContain(input);
  });

  it("prints the names of what it set, and no value", async () => {
    const railway = fake();

    await standUp(REQUEST, railway.steps);

    const printed = railway.lines.join("\n");
    expect(printed).toContain("GOOGLE_CLIENT_SECRET");
    for (const value of [...Object.values(KEYS), "generated-secret"]) {
      expect(printed).not.toContain(value);
    }
  });

  it("builds into an environment that exists and holds nothing, linking it first", async () => {
    const railway = fake({ environments: [{ id: NEW_ID, name: "pr-123", services: [] }] });

    const outcome = await standUp(REQUEST, railway.steps);

    expect(outcome.ok).toBe(true);
    expect(railway.ran().slice(0, 4)).toEqual([
      "status --json",
      "environment link",
      "status --json",
      "config apply",
    ]);
    expect(railway.lines[0]).toBe("Using     pr-123, which holds nothing");
  });

  it("stops at an environment that holds a service, having run nothing but the read", async () => {
    const railway = fake({
      environments: [{ id: NEW_ID, name: "pr-123", services: ["Postgres"] }],
    });

    const outcome = await standUp(REQUEST, railway.steps);

    expect(outcome).toEqual({
      ok: false,
      message:
        '"pr-123" already holds Postgres: this command only builds into an environment that holds nothing.',
    });
    expect(railway.ran()).toEqual(["status --json"]);
  });

  it.each(PROTECTED_ENVIRONMENT_IDS)(
    "stops at this project's own environment %s, having run nothing but the read",
    async (id) => {
      const railway = fake({ environments: [{ id, name: "pr-123", services: [] }] });

      const outcome = await standUp(REQUEST, railway.steps);

      expect(outcome).toMatchObject({ ok: false, message: /never touches it/ });
      expect(railway.ran()).toEqual(["status --json"]);
    }
  );

  // Between the first read and the first write something else may have built
  // into it: the second read is the one the writes rest on.
  it("stops before any write when the environment gained a service after the first read", async () => {
    const empty = [{ id: NEW_ID, name: "pr-123", services: [] }];
    const railway = fake({
      statuses: [empty, [{ id: NEW_ID, name: "pr-123", services: ["Postgres"] }]],
    });

    const outcome = await standUp(REQUEST, railway.steps);

    expect(outcome).toMatchObject({ ok: false, message: /already holds Postgres/ });
    expect(railway.ran()).toEqual(["status --json", "environment link", "status --json"]);
  });

  it("stops before any write when Railway does not list the environment it just created", async () => {
    const railway = fake({ statuses: [[], []] });

    const outcome = await standUp(REQUEST, railway.steps);

    expect(outcome).toEqual({ ok: false, message: 'Railway has no "pr-123" after creating it.' });
    expect(railway.ran()).toEqual(["status --json", "environment new", "status --json"]);
  });

  it("creates nothing when a required key is missing", async () => {
    const railway = fake({ env: { ...KEYS, GOOGLE_CLIENT_SECRET: "" } });

    const outcome = await standUp(REQUEST, railway.steps);

    expect(outcome).toEqual({ ok: false, message: "Not set, and required: GOOGLE_CLIENT_SECRET" });
    expect(railway.calls).toEqual([]);
  });

  it("stops before setting a variable when Railway answers no domain", async () => {
    const railway = fake({ domain: {} });

    const outcome = await standUp(REQUEST, railway.steps);

    expect(outcome).toEqual({ ok: false, message: "Railway answered no domain for the site." });
    expect(railway.ran()).not.toContain("variable set");
    expect(railway.ran()).not.toContain("redeploy --service");
  });

  it("asks again until the site answers healthy, waiting between each", async () => {
    const railway = fake({ health: [null, { checks: { database: "ok", redis: "error" } }, OK] });

    const outcome = await standUp(REQUEST, railway.steps);

    expect(outcome.ok).toBe(true);
    expect(railway.steps.health).toHaveBeenCalledTimes(3);
    expect(railway.steps.health).toHaveBeenCalledWith(`${DOMAIN}/api/health`);
    expect(railway.steps.wait).toHaveBeenCalledTimes(3);
    expect(railway.steps.wait).toHaveBeenCalledWith(HEALTH_INTERVAL_MS);
  });

  it("gives up after its last attempt, saying the environment exists", async () => {
    const railway = fake({ health: [null] });

    const outcome = await standUp(REQUEST, railway.steps);

    expect(outcome).toMatchObject({
      ok: false,
      message: /did not report the database and Redis ok in time/,
    });
    expect(railway.steps.health).toHaveBeenCalledTimes(HEALTH_ATTEMPTS);
  });

  it("allows fifteen minutes for the first deploy", () => {
    expect(HEALTH_ATTEMPTS * HEALTH_INTERVAL_MS).toBe(15 * 60 * 1000);
  });
});
