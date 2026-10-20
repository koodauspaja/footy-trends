import { describe, expect, it } from "vitest";
import {
  e2eAppPort,
  e2ePort,
  e2eRedisPort,
  e2eTarget,
  e2eTasoPort,
  serverCommand,
  startUpTimeoutMs,
  vouchesForAPush,
  withoutSentry,
} from "../../../scripts/e2e-target";

/**
 * Which server the end-to-end suite runs against, and which of them a pre-push
 * marker may stand on.
 *
 * decisions/568-e2e-against-a-production-build.md
 */

describe("e2eTarget", () => {
  it("builds and serves when nothing is set, which is what the everyday commands run", () => {
    expect(e2eTarget(undefined)).toBe("fresh-build");
  });

  it("serves a build the caller made for `build`, as the release workflow sets", () => {
    expect(e2eTarget("build")).toBe("prebuilt");
  });

  it("runs the dev server only when asked to by name", () => {
    expect(e2eTarget("dev")).toBe("dev");
  });

  it.each(["", "Dev", "production"])("builds and serves for the unknown value %j", (value) => {
    // A typo must not land on the dev server, where a defect of the production
    // build cannot fail.
    expect(e2eTarget(value)).toBe("fresh-build");
  });
});

describe("e2ePort", () => {
  it.each([
    ["unset", undefined, 3001],
    ["blank", "  ", 3001],
    ["a port, spaces trimmed", " 4000 ", 4000],
    ["the lowest port", "1", 1],
    ["the highest port", "65535", 65_535],
  ])("reads %s as %s", (_case, value, expected) => {
    expect(e2ePort("E2E_PORT", value, 3001)).toBe(expected);
  });

  it.each([
    ["shell syntax", "3001; touch /tmp/owned"],
    ["a command substitution", "$(id)"],
    ["zero", "0"],
    ["one past the highest port", "65536"],
    ["a negative number", "-1"],
    ["an exponent", "3e3"],
    ["a decimal", "3001.5"],
    ["six digits", "300100"],
  ])("refuses %s, naming the variable", (_case, value) => {
    expect(() => e2ePort("E2E_REDIS_PORT", value, 6380)).toThrow(
      `E2E_REDIS_PORT must be a port from 1 to 65535, not ${JSON.stringify(value)}.`
    );
  });
});

describe("the suite's ports", () => {
  it("default to 3001 for the app, 3002 for the TASO stand-in and 6380 for its Redis", () => {
    expect([e2eAppPort({}), e2eTasoPort({}), e2eRedisPort({})]).toEqual([3001, 3002, 6380]);
  });

  it("each read their own variable", () => {
    const env = { E2E_PORT: "3011", E2E_TASO_PORT: "3012", E2E_REDIS_PORT: "6390" };
    expect([e2eAppPort(env), e2eTasoPort(env), e2eRedisPort(env)]).toEqual([3011, 3012, 6390]);
  });

  it("refuse a value that is not a port, naming the variable", () => {
    expect(() => e2eRedisPort({ E2E_REDIS_PORT: "6380; id" })).toThrow(
      "E2E_REDIS_PORT must be a port"
    );
    expect(() => e2eTasoPort({ E2E_TASO_PORT: "x" })).toThrow("E2E_TASO_PORT must be a port");
    expect(() => e2eAppPort({ E2E_PORT: "0" })).toThrow("E2E_PORT must be a port");
  });
});

describe("serverCommand", () => {
  it("builds before it starts, for a fresh build", () => {
    expect(serverCommand("fresh-build", 3001)).toBe("npm run build && npm start -- -p 3001");
  });

  it("only starts, for a build already made", () => {
    expect(serverCommand("prebuilt", 3001)).toBe("npm start -- -p 3001");
  });

  it("starts the dev server on the same port", () => {
    expect(serverCommand("dev", 3105)).toBe("npm run dev -- -p 3105");
  });
});

describe("startUpTimeoutMs", () => {
  it("leaves a fresh build room for the build itself", () => {
    expect(startUpTimeoutMs("fresh-build")).toBe(300_000);
  });

  it.each(["prebuilt", "dev"] as const)("waits two minutes for %s", (target) => {
    expect(startUpTimeoutMs(target)).toBe(120_000);
  });
});

describe("vouchesForAPush", () => {
  it("lets a run against the build it made vouch for a push", () => {
    expect(vouchesForAPush("fresh-build")).toBe(true);
  });

  it.each(["prebuilt", "dev"] as const)(
    "does not let a run against %s vouch: nothing says the build is this code",
    (target) => {
      expect(vouchesForAPush(target)).toBe(false);
    }
  );
});

describe("withoutSentry", () => {
  it("blanks the DSN, so a run reports nothing to Sentry whatever .env holds", () => {
    const env = withoutSentry({ NEXT_PUBLIC_SENTRY_DSN: "https://key@example.ingest.sentry.io/1" });

    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBe("");
  });

  it("keeps every other variable as it was", () => {
    expect(
      withoutSentry({ DATABASE_URL: "postgres://localhost/x_test", LOG_LEVEL: "info" })
    ).toEqual({
      DATABASE_URL: "postgres://localhost/x_test",
      LOG_LEVEL: "info",
      NEXT_PUBLIC_SENTRY_DSN: "",
    });
  });
});
