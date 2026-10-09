import { describe, expect, it } from "vitest";
import { PROTECTED_ENVIRONMENT_IDS } from "../../../.railway/databases";
import {
  domainFrom,
  findTarget,
  healthy,
  parseArgs,
  railway,
  refusal,
  variablesFor,
} from "../../../scripts/railway-environment-plan";

/**
 * The decisions behind `npm run railway:environment`: which environment may be
 * built into, which variables it is given, and what the CLI is asked to do.
 *
 * decisions/522-railway-environment-from-code.md
 */

const NEW_ID = "00000000-0000-4000-8000-000000000001";

// `railway status --json`, as far as the command reads it.
function status(environments: Array<{ id?: unknown; name: string; services?: unknown }>) {
  return {
    environments: {
      edges: environments.map(({ id, name, services }) => ({
        node: {
          id,
          name,
          serviceInstances: Array.isArray(services)
            ? { edges: services.map((serviceName) => ({ node: { serviceName } })) }
            : services,
        },
      })),
    },
  };
}

const KEYS = {
  FOOTBALL_DATA_API_KEY: "football",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  AUTH_ALLOWED_EMAILS: "someone@example.com",
};

describe("parseArgs", () => {
  it("reads a name, with the branch defaulting to main", () => {
    expect(parseArgs(["--name=pr-123"])).toEqual({
      ok: true,
      request: { name: "pr-123", branch: "main" },
    });
  });

  it("reads a branch", () => {
    expect(parseArgs(["--name=pr-123", "--branch=feature/099-something"])).toEqual({
      ok: true,
      request: { name: "pr-123", branch: "feature/099-something" },
    });
  });

  it.each([[[]], [["--name="]], [["--name=Staging"]], [["--name=-x"]], [["--name=a b"]]])(
    "refuses %j, which names no environment",
    (argv) => {
      expect(parseArgs(argv)).toMatchObject({ ok: false, message: /--name is required/ });
    }
  );

  it("refuses a name longer than 32 characters", () => {
    expect(parseArgs([`--name=${"a".repeat(32)}`]).ok).toBe(true);
    expect(parseArgs([`--name=${"a".repeat(33)}`]).ok).toBe(false);
  });

  it.each(["--yes", "-x", "", "a b"])("refuses the branch %j", (branch) => {
    expect(parseArgs(["--name=pr-123", `--branch=${branch}`])).toEqual({
      ok: false,
      message: `--branch does not look like a branch: ${branch}`,
    });
  });

  it("refuses an argument it does not know", () => {
    expect(parseArgs(["--name=pr-123", "--confirm-destructive"])).toEqual({
      ok: false,
      message: "Unrecognised argument: --confirm-destructive",
    });
  });
});

describe("findTarget", () => {
  it("answers the named environment with every service it holds", () => {
    const answer = status([
      { id: "other", name: "production", services: ["Postgres"] },
      { id: NEW_ID, name: "pr-123", services: ["Postgres", "Redis"] },
    ]);

    expect(findTarget(answer, "pr-123")).toEqual({ id: NEW_ID, services: ["Postgres", "Redis"] });
  });

  it("answers an empty environment as holding nothing", () => {
    expect(findTarget(status([{ id: NEW_ID, name: "pr-123", services: [] }]), "pr-123")).toEqual({
      id: NEW_ID,
      services: [],
    });
  });

  it("answers null when the project has no environment of that name", () => {
    expect(
      findTarget(status([{ id: NEW_ID, name: "staging", services: [] }]), "pr-123")
    ).toBeNull();
  });

  // Unreadable is not empty: reading it as empty would let the command build
  // into an environment whose services it simply failed to see.
  it.each([null, {}, { environments: {} }, { environments: { edges: "none" } }])(
    "throws on %j, which lists no environments",
    (answer) => {
      expect(() => findTarget(answer, "pr-123")).toThrow("no list of environments");
    }
  );

  it.each([
    ["no id", { name: "pr-123", services: [] }],
    ["no service list", { id: NEW_ID, name: "pr-123" }],
    ["a service list that is not one", { id: NEW_ID, name: "pr-123", services: {} }],
  ])("throws on an environment with %s", (_, environment) => {
    expect(() => findTarget(status([environment]), "pr-123")).toThrow("it does not describe");
  });
});

describe("refusal", () => {
  it("allows an environment that holds nothing", () => {
    expect(refusal("pr-123", { id: NEW_ID, services: [] })).toBeNull();
  });

  it("refuses an environment that holds a service, naming it", () => {
    expect(refusal("pr-123", { id: NEW_ID, services: ["Postgres", "Redis"] })).toBe(
      '"pr-123" already holds Postgres, Redis: this command only builds into an environment that holds nothing.'
    );
  });

  // By id, and before the service count: emptied of every service, they are
  // still not this command's to build into.
  it.each(PROTECTED_ENVIRONMENT_IDS)(
    "refuses this project's own environment %s even when empty",
    (id) => {
      expect(refusal("staging", { id, services: [] })).toBe(
        '"staging" is this project\'s staging or production: this command never touches it.'
      );
    }
  );
});

describe("variablesFor", () => {
  it("wires the addresses as references Railway resolves, and sets the secret it is given", () => {
    const planned = variablesFor("pr-123", KEYS, "generated");

    expect(planned).toMatchObject({ ok: true });
    expect(planned.ok && planned.variables).toEqual([
      { name: "DATABASE_URL", value: "$" + "{{Postgres.DATABASE_URL}}" },
      { name: "REDIS_URL", value: "$" + "{{Redis.REDIS_URL}}" },
      { name: "BETTER_AUTH_URL", value: "https://$" + "{{RAILWAY_PUBLIC_DOMAIN}}" },
      { name: "BETTER_AUTH_SECRET", value: "generated" },
      { name: "FOOTBALL_DATA_EARLIEST_SEASON", value: "2023" },
      { name: "FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS", value: "3600" },
      { name: "LOG_LEVEL", value: "info" },
      { name: "FOOTBALL_DATA_API_KEY", value: "football" },
      { name: "GOOGLE_CLIENT_ID", value: "google-id" },
      { name: "GOOGLE_CLIENT_SECRET", value: "google-secret" },
      { name: "AUTH_ALLOWED_EMAILS", value: "someone@example.com" },
    ]);
  });

  it("adds the optional keys that are set, and leaves out the ones that are blank", () => {
    const planned = variablesFor(
      "pr-123",
      { ...KEYS, TASO_API_KEY: "taso", AXIOM_TOKEN: "  ", AXIOM_DATASET: "logs" },
      "generated"
    );

    const names = planned.ok ? planned.variables.map((variable) => variable.name) : [];
    expect(names.slice(-2)).toEqual(["TASO_API_KEY", "AXIOM_DATASET"]);
    expect(names).not.toContain("AXIOM_TOKEN");
    expect(names).not.toContain("NEXT_PUBLIC_SENTRY_DSN");
  });

  it("names every required key that is missing or blank", () => {
    expect(
      variablesFor("pr-123", { GOOGLE_CLIENT_ID: "google-id", GOOGLE_CLIENT_SECRET: " " }, "s")
    ).toEqual({
      ok: false,
      missing: ["FOOTBALL_DATA_API_KEY", "GOOGLE_CLIENT_SECRET", "AUTH_ALLOWED_EMAILS"],
    });
  });

  // An environment with no list lets any Google account in.
  it("requires the sign-in list everywhere but an environment named production", () => {
    const { AUTH_ALLOWED_EMAILS: _, ...withoutList } = KEYS;

    expect(variablesFor("staging", withoutList, "s")).toEqual({
      ok: false,
      missing: ["AUTH_ALLOWED_EMAILS"],
    });
    expect(variablesFor("production", withoutList, "s")).toMatchObject({ ok: true });
  });

  it("gives an environment named production no sign-in list, even when one is set", () => {
    const planned = variablesFor("production", KEYS, "s");

    const names = planned.ok ? planned.variables.map((variable) => variable.name) : [];
    expect(names).toContain("GOOGLE_CLIENT_SECRET");
    expect(names).not.toContain("AUTH_ALLOWED_EMAILS");
  });
});

describe("domainFrom", () => {
  it("reads the address the CLI answers", () => {
    expect(domainFrom({ domain: "https://footy-trends-pr-123.up.railway.app" })).toBe(
      "https://footy-trends-pr-123.up.railway.app"
    );
  });

  it.each([null, {}, { domain: 7 }, { domain: "footy-trends-pr-123.up.railway.app" }])(
    "answers null for %j",
    (answer) => {
      expect(domainFrom(answer)).toBeNull();
    }
  );
});

describe("healthy", () => {
  it("is true when the database and Redis both answered", () => {
    expect(healthy({ status: "ok", checks: { database: "ok", redis: "ok" } })).toBe(true);
  });

  it.each([
    null,
    {},
    { checks: { database: "ok" } },
    { checks: { database: "ok", redis: "error" } },
    { checks: { database: "error", redis: "ok" } },
  ])("is false for %j", (body) => {
    expect(healthy(body)).toBe(false);
  });
});

describe("the railway argument lists", () => {
  const every = [
    railway.status(),
    railway.create("pr-123"),
    railway.link("pr-123"),
    railway.applyDatabases(),
    railway.applyWeb(),
    railway.domain("pr-123"),
    railway.setVariable("pr-123", "LOG_LEVEL"),
    railway.deploy("pr-123"),
  ];

  // The CLI refuses a deletion in a non-interactive run without this flag, and
  // that refusal is the last thing between a wrong link and a deleted service.
  it("never allow a destructive apply", () => {
    for (const args of every) expect(args).not.toContain("--confirm-destructive");
  });

  it("apply each file by name", () => {
    expect(railway.applyDatabases()).toEqual([
      "config",
      "apply",
      "--file",
      ".railway/databases.ts",
      "--yes",
    ]);
    expect(railway.applyWeb()).toEqual([
      "config",
      "apply",
      "--file",
      ".railway/railway.ts",
      "--yes",
    ]);
  });

  it("create and link the environment by name", () => {
    expect(railway.create("pr-123")).toEqual(["environment", "new", "pr-123", "--json"]);
    expect(railway.link("pr-123")).toEqual(["environment", "link", "pr-123", "--json"]);
    expect(railway.status()).toEqual(["status", "--json"]);
  });

  // The value comes on stdin, and the deploy waits for every variable.
  it("set a variable by name only, in the named environment, without deploying", () => {
    expect(railway.setVariable("pr-123", "GOOGLE_CLIENT_SECRET")).toEqual([
      "variable",
      "set",
      "GOOGLE_CLIENT_SECRET",
      "--stdin",
      "--skip-deploys",
      "--service",
      "footy-trends",
      "--environment",
      "pr-123",
      "--json",
    ]);
  });

  it("name the environment for the domain and the deploy", () => {
    expect(railway.domain("pr-123")).toEqual([
      "domain",
      "--service",
      "footy-trends",
      "--environment",
      "pr-123",
      "--json",
    ]);
    expect(railway.deploy("pr-123")).toEqual([
      "redeploy",
      "--service",
      "footy-trends",
      "--environment",
      "pr-123",
      "--from-source",
      "--yes",
      "--json",
    ]);
  });
});
