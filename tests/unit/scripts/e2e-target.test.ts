import { describe, expect, it } from "vitest";
import {
  e2eTarget,
  serverCommand,
  startUpTimeoutMs,
  vouchesForAPush,
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

describe("serverCommand", () => {
  it("builds before it starts, for a fresh build", () => {
    expect(serverCommand("fresh-build", "3001")).toBe("npm run build && npm start -- -p 3001");
  });

  it("only starts, for a build already made", () => {
    expect(serverCommand("prebuilt", "3001")).toBe("npm start -- -p 3001");
  });

  it("starts the dev server on the same port", () => {
    expect(serverCommand("dev", "3105")).toBe("npm run dev -- -p 3105");
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
