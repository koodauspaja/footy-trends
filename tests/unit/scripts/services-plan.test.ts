import { describe, expect, it } from "vitest";
import {
  canStartDaemonAutomatically,
  DEFAULT_POSTGRES_PORT,
  daemonUnavailableMessage,
  decidePreflight,
  describeTarget,
  isLocalDatabaseUrl,
  noDockerMessage,
  parseTarget,
  postgresUnreachableMessage,
  resetRefusal,
} from "../../../scripts/services-plan";

const LOCAL = "postgresql://postgres:secret@localhost:5432/footy-trends";

/**
 * Probes that record whether they were asked, so a test can assert that the
 * expensive ones were not. `answers` is what each returns when called.
 */
function probes(answers: { postgres: boolean; available: boolean; running: boolean }) {
  const asked = { postgres: 0, available: 0, running: 0 };
  return {
    asked,
    postgresReachable: async () => {
      asked.postgres += 1;
      return answers.postgres;
    },
    dockerAvailable: () => {
      asked.available += 1;
      return answers.available;
    },
    dockerRunning: () => {
      asked.running += 1;
      return answers.running;
    },
  };
}

/** Everything present and working, so each test can vary one thing. */
const HEALTHY = { postgres: true, available: true, running: true };

describe("decidePreflight", () => {
  it("does nothing in CI, which provides its own services", async () => {
    const decision = await decidePreflight({
      ci: true,
      ...probes({ ...HEALTHY, postgres: false }),
    });

    expect(decision.kind).toBe("skip");
    // The message has to say why nothing happened, or a reader sees a preflight
    // that silently did not run.
    expect(decision.kind === "skip" && decision.message).toContain("CI is set");
  });

  it("asks nothing at all in CI", async () => {
    // Not merely "does not start anything" — a runner should not pay for a
    // connection attempt or a `docker info` either.
    const p = probes({ postgres: false, available: false, running: false });
    await decidePreflight({ ci: true, ...p });

    expect(p.asked).toEqual({ postgres: 0, available: 0, running: 0 });
  });

  it("is ready when Postgres answers", async () => {
    expect((await decidePreflight({ ci: false, ...probes(HEALTHY) })).kind).toBe("ready");
  });

  it("never asks Docker anything when Postgres answers", async () => {
    /**
     * The whole reason the probes are functions. Asking `docker info` on the
     * common path cost about 1.3s on every `npm run dev`, and a boolean
     * signature could not express that it must not happen.
     */
    const p = probes(HEALTHY);
    await decidePreflight({ ci: false, ...p });

    expect(p.asked.postgres).toBe(1);
    expect(p.asked.available).toBe(0);
    expect(p.asked.running).toBe(0);
  });

  it("is ready when Postgres answers even with no Docker at all", async () => {
    // A Postgres running some other way — Homebrew services, a devcontainer —
    // is accepted rather than second-guessed.
    const decision = await decidePreflight({
      ci: false,
      ...probes({ postgres: true, available: false, running: false }),
    });

    expect(decision.kind).toBe("ready");
  });

  it("starts the containers when the daemon is up but Postgres is not", async () => {
    const decision = await decidePreflight({
      ci: false,
      ...probes({ ...HEALTHY, postgres: false }),
    });

    expect(decision.kind).toBe("start-containers");
  });

  it("starts the daemon when it is down", async () => {
    const decision = await decidePreflight({
      ci: false,
      ...probes({ postgres: false, available: true, running: false }),
    });

    expect(decision.kind).toBe("start-daemon");
  });

  it("gives up when there is no docker to run", async () => {
    const decision = await decidePreflight({
      ci: false,
      ...probes({ postgres: false, available: false, running: false }),
    });

    expect(decision.kind).toBe("no-docker");
    expect(decision.kind === "no-docker" && decision.message).toContain("docker compose");
  });

  it("does not bother asking whether the daemon runs when there is no docker", async () => {
    const p = probes({ postgres: false, available: false, running: false });
    await decidePreflight({ ci: false, ...p });

    expect(p.asked.running).toBe(0);
  });
});

describe("canStartDaemonAutomatically", () => {
  it("can start Docker Desktop on macOS, which needs no password", () => {
    expect(canStartDaemonAutomatically("darwin")).toBe(true);
  });

  it.each<NodeJS.Platform>(["linux", "win32", "freebsd"])(
    "will not try on %s, where starting Docker wants root or is unknown",
    (platform) => {
      // Reporting false is what makes the caller print the command instead of
      // silently prompting for a password.
      expect(canStartDaemonAutomatically(platform)).toBe(false);
    }
  );
});

describe("noDockerMessage", () => {
  it("names the runtimes rather than insisting on Docker Desktop", () => {
    const message = noDockerMessage();

    expect(message).toContain("OrbStack");
    expect(message).toContain("Colima");
    // The override exists for nix, asdf and containers — a message that omits
    // it sends someone with a working docker off to install a second one.
    expect(message).toContain("DOCKER_EXECUTABLE");
  });
});

describe("the waiting messages", () => {
  it("reports the daemon wait in whole seconds", () => {
    expect(daemonUnavailableMessage(90_000)).toContain("90s");
  });

  it("reports the Postgres wait in whole seconds, and names the target", () => {
    const message = postgresUnreachableMessage(60_000, LOCAL);

    expect(message).toContain("60s");
    expect(message).toContain("localhost:5432");
  });

  it("never prints the password, in either message", () => {
    expect(postgresUnreachableMessage(1000, LOCAL)).not.toContain("secret");
    expect(describeTarget(LOCAL)).not.toContain("secret");
  });
});

describe("parseTarget", () => {
  it("reads host and port", () => {
    expect(parseTarget("postgresql://user@db.example.com:6000/app")).toEqual({
      host: "db.example.com",
      port: 6000,
    });
  });

  it("falls back to Postgres's own port when the URL states none", () => {
    expect(parseTarget("postgresql://user@localhost/app")).toEqual({
      host: "localhost",
      port: DEFAULT_POSTGRES_PORT,
    });
  });

  it("returns null for something that is not a URL", () => {
    expect(parseTarget("not a url")).toBeNull();
  });

  it("returns null when the URL names no host", () => {
    // `postgresql:///app` parses, and has an empty hostname — there is nothing
    // to connect to, which is different from a default port.
    expect(parseTarget("postgresql:///app")).toBeNull();
  });

  it("describes an unparseable URL rather than throwing", () => {
    expect(describeTarget("not a url")).toBe("<unparseable DATABASE_URL>");
  });
});

describe("isLocalDatabaseUrl", () => {
  it.each(["localhost", "127.0.0.1", "0.0.0.0", "LOCALHOST"])("accepts %s", (host) => {
    expect(isLocalDatabaseUrl(`postgresql://user@${host}:5432/app`)).toBe(true);
  });

  it("accepts the IPv6 loopback, which a URL carries in brackets", () => {
    expect(isLocalDatabaseUrl("postgresql://user@[::1]:5432/app")).toBe(true);
  });

  it.each([
    "postgresql://user@altaria.proxy.rlwy.net:45459/railway",
    "postgresql://user@192.168.1.10:5432/app",
    "postgresql://user@localhost.example.com:5432/app",
  ])("rejects %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });

  it("rejects a URL it cannot parse", () => {
    expect(isLocalDatabaseUrl("not a url")).toBe(false);
  });
});

describe("resetRefusal", () => {
  it("allows a local database", () => {
    expect(resetRefusal(LOCAL)).toBeNull();
  });

  it("refuses a remote one, and says so without the password", () => {
    const refusal = resetRefusal("postgresql://user:hunter2@altaria.proxy.rlwy.net:45459/railway");

    expect(refusal).toContain("not this machine");
    expect(refusal).toContain("altaria.proxy.rlwy.net:45459");
    expect(refusal).not.toContain("hunter2");
  });

  it("refuses when DATABASE_URL is unset", () => {
    expect(resetRefusal(undefined)).toContain("not set");
  });

  it("refuses when DATABASE_URL is blank, rather than treating it as absent", () => {
    // `DATABASE_URL= npm run db:reset` otherwise passes a null check and fails
    // somewhere less helpful — the same trap `grant-admin.ts` documents.
    expect(resetRefusal("   ")).toContain("not set");
  });

  it("refuses a URL it cannot parse, rather than falling through to the reset", () => {
    expect(resetRefusal("not a url")).toContain("not this machine");
  });
});
