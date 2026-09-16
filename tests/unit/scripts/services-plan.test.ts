import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPOSE_DATABASE_NAME,
  COMPOSE_POSTGRES_PORT,
  canStartDaemonAutomatically,
  confirmationPrompt,
  DEFAULT_POSTGRES_PORT,
  daemonNotStartedMessage,
  daemonUnavailableMessage,
  databaseNameOf,
  decideConfirmation,
  decidePreflight,
  describeTarget,
  effectiveDatabaseUrl,
  isAffirmative,
  isComposeDatabase,
  isPostgresUrl,
  noDockerMessage,
  parseTarget,
  postgresUnreachableMessage,
  probeUrls,
  resetRefusal,
  runsOnComposeServer,
  testResetRefusal,
  waitFor,
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

/** A local target, which is the case every Docker branch below assumes. */
const LOCAL_TARGET = { targetIsLocal: true, url: LOCAL } as const;

/** A valid Postgres URL that is not this machine's compose database. */
const REMOTE_TARGET = {
  targetIsLocal: false,
  url: "postgresql://user@db.example.com:5432/app",
} as const;

describe("decidePreflight", () => {
  it("does nothing in CI, which provides its own services", async () => {
    const decision = await decidePreflight({
      ci: true,
      ...LOCAL_TARGET,
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
    await decidePreflight({ ci: true, ...LOCAL_TARGET, ...p });

    expect(p.asked).toEqual({ postgres: 0, available: 0, running: 0 });
  });

  it("is ready when Postgres answers", async () => {
    expect((await decidePreflight({ ci: false, ...LOCAL_TARGET, ...probes(HEALTHY) })).kind).toBe(
      "ready"
    );
  });

  it("never asks Docker anything when Postgres answers", async () => {
    /**
     * The whole reason the probes are functions. Asking `docker info` on the
     * common path cost about 1.3s on every `npm run dev`, and a boolean
     * signature could not express that it must not happen.
     */
    const p = probes(HEALTHY);
    await decidePreflight({ ci: false, ...LOCAL_TARGET, ...p });

    expect(p.asked.postgres).toBe(1);
    expect(p.asked.available).toBe(0);
    expect(p.asked.running).toBe(0);
  });

  it("is ready when Postgres answers even with no Docker at all", async () => {
    // A Postgres running some other way — Homebrew services, a devcontainer —
    // is accepted rather than second-guessed.
    const decision = await decidePreflight({
      ci: false,
      ...LOCAL_TARGET,
      ...probes({ postgres: true, available: false, running: false }),
    });

    expect(decision.kind).toBe("ready");
  });

  it("starts the containers when the daemon is up but Postgres is not", async () => {
    const decision = await decidePreflight({
      ci: false,
      ...LOCAL_TARGET,
      ...probes({ ...HEALTHY, postgres: false }),
    });

    expect(decision.kind).toBe("start-containers");
  });

  it("starts the daemon when it is down", async () => {
    const decision = await decidePreflight({
      ci: false,
      ...LOCAL_TARGET,
      ...probes({ postgres: false, available: true, running: false }),
    });

    expect(decision.kind).toBe("start-daemon");
  });

  it("gives up when there is no docker to run", async () => {
    const decision = await decidePreflight({
      ci: false,
      ...LOCAL_TARGET,
      ...probes({ postgres: false, available: false, running: false }),
    });

    expect(decision.kind).toBe("no-docker");
    expect(decision.kind === "no-docker" && decision.message).toContain("docker compose");
  });

  it("does not bother asking whether the daemon runs when there is no docker", async () => {
    const p = probes({ postgres: false, available: false, running: false });
    await decidePreflight({ ci: false, ...LOCAL_TARGET, ...p });

    expect(p.asked.running).toBe(0);
  });
});

describe("decidePreflight, when DATABASE_URL is not a Postgres URL", () => {
  it("does not probe it, because the answer would not mean anything", async () => {
    /**
     * `http://localhost:5432/app` names a host and a port, so a Postgres
     * listening there answers `select 1` — and the preflight would report ready
     * for a URL the application cannot use. Raised in review on #402.
     */
    const p = probes({ postgres: true, available: true, running: true });
    const decision = await decidePreflight({
      ci: false,
      targetIsLocal: true,
      url: "http://localhost:5432/app",
      ...p,
    });

    expect(decision.kind).toBe("not-postgres");
    expect(p.asked.postgres).toBe(0);
  });

  it("names what it must begin with, and not the password", async () => {
    const decision = await decidePreflight({
      ci: false,
      targetIsLocal: false,
      url: "redis://user:hunter2@localhost:6379/0",
      ...probes({ postgres: false, available: true, running: true }),
    });

    expect(decision.kind === "not-postgres" && decision.message).toContain("postgresql://");
    expect(decision.kind === "not-postgres" && decision.message).not.toContain("hunter2");
  });

  it("still skips in CI, which is checked first", async () => {
    const decision = await decidePreflight({
      ci: true,
      targetIsLocal: true,
      url: "not a url at all",
      ...probes({ postgres: false, available: false, running: false }),
    });

    expect(decision.kind).toBe("skip");
  });
});

describe("isPostgresUrl", () => {
  it.each(["postgres://h:5432/d", "postgresql://h:5432/d", "POSTGRESQL://h:5432/d"])(
    "accepts %s",
    (url) => {
      expect(isPostgresUrl(url)).toBe(true);
    }
  );

  it.each(["http://h:5432/d", "redis://h:6379/0", "not a url", "postgresql:///d"])(
    "rejects %s",
    (url) => {
      expect(isPostgresUrl(url)).toBe(false);
    }
  );
});

describe("decidePreflight, when DATABASE_URL is not this project's database", () => {
  it("refuses to start local containers for an unreachable remote", async () => {
    const decision = await decidePreflight({
      ci: false,
      ...REMOTE_TARGET,
      ...probes({ postgres: false, available: true, running: true }),
    });

    expect(decision.kind).toBe("remote-unreachable");
    expect(decision.kind === "remote-unreachable" && decision.message).toContain(
      "only started for localhost:5432"
    );
  });

  it("does not even ask whether Docker is there", async () => {
    /**
     * Caught in review on #402. Starting the compose containers would bind this
     * machine's 5432 with a database nobody is connecting to, and the probe
     * would go on failing against the remote until the timeout — so the command
     * fails anyway, a minute later, with two containers nobody asked for.
     */
    const p = probes({ postgres: false, available: true, running: true });
    await decidePreflight({ ci: false, ...REMOTE_TARGET, ...p });

    expect(p.asked.available).toBe(0);
    expect(p.asked.running).toBe(0);
  });

  it("is still ready when the remote answers", async () => {
    const decision = await decidePreflight({
      ci: false,
      ...REMOTE_TARGET,
      ...probes(HEALTHY),
    });

    expect(decision.kind).toBe("ready");
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
      protocol: "postgresql:",
    });
  });

  it("falls back to Postgres's own port when the URL states none", () => {
    expect(parseTarget("postgresql://user@localhost/app")).toEqual({
      host: "localhost",
      port: DEFAULT_POSTGRES_PORT,
      protocol: "postgresql:",
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

describe("runsOnComposeServer", () => {
  it("matches the port docker-compose.yml actually publishes", () => {
    /**
     * The constant is a second copy of a value that lives in the compose file,
     * so it gets a mechanism rather than a comment asking people to remember.
     * Changing the published port without changing the constant would let
     * `db:reset` refuse the real database, or worse, accept the wrong one.
     */
    const compose = readFileSync("docker-compose.yml", "utf8");
    const published = /-\s*"(\d+):(\d+)"/.exec(compose);

    expect(published).not.toBeNull();
    expect(Number(published?.[1])).toBe(COMPOSE_POSTGRES_PORT);
  });

  it.each(["localhost", "127.0.0.1", "0.0.0.0", "LOCALHOST"])("accepts %s", (host) => {
    expect(runsOnComposeServer(`postgresql://user@${host}:${COMPOSE_POSTGRES_PORT}/app`)).toBe(
      true
    );
  });

  it.each(["http", "https", "redis", "file"])(
    "rejects a %s: URL even on the right host and port",
    (scheme) => {
      // Host and port alone say nothing about what is being addressed, and on
      // the db:reset path accepting one costs a destroyed volume.
      expect(runsOnComposeServer(`${scheme}://localhost:${COMPOSE_POSTGRES_PORT}/app`)).toBe(false);
    }
  );

  it("accepts the postgres: spelling as well as postgresql:", () => {
    expect(runsOnComposeServer(`postgres://user@localhost:${COMPOSE_POSTGRES_PORT}/app`)).toBe(
      true
    );
  });

  it("rejects another Postgres on this machine, on a different port", () => {
    /**
     * Caught in review on #402. A hostname check alone let a second local
     * Postgres through, and then both callers did the wrong thing: the
     * preflight would start containers binding 5432 that cannot serve 6543,
     * and db:reset would destroy this project's volume while the URL pointed
     * somewhere else — reporting a fresh database it had never touched.
     */
    expect(runsOnComposeServer("postgresql://user@localhost:6543/app")).toBe(false);
  });

  it("accepts the IPv6 loopback, which a URL carries in brackets", () => {
    expect(runsOnComposeServer(`postgresql://user@[::1]:${COMPOSE_POSTGRES_PORT}/app`)).toBe(true);
  });

  it.each([
    "postgresql://user@altaria.proxy.rlwy.net:45459/railway",
    "postgresql://user@192.168.1.10:5432/app",
    "postgresql://user@localhost.example.com:5432/app",
  ])("rejects %s", (url) => {
    expect(runsOnComposeServer(url)).toBe(false);
  });

  it("rejects a URL it cannot parse", () => {
    expect(runsOnComposeServer("not a url")).toBe(false);
  });
});

describe("resetRefusal", () => {
  it("allows a local database", () => {
    expect(resetRefusal(LOCAL)).toBeNull();
  });

  it("refuses a remote one, and says so without the password", () => {
    const refusal = resetRefusal("postgresql://user:hunter2@altaria.proxy.rlwy.net:45459/railway");

    expect(refusal).toContain("not this project's database");
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
    expect(resetRefusal("not a url")).toContain("not this project's database");
  });

  it.each(["postgres", "footy-trends_test", "someone-elses-db"])(
    "refuses /%s on the compose server, before anything is destroyed",
    (name) => {
      /**
       * #404. The guard checked scheme, host and port but not the database
       * name, so db:reset destroyed the volume and then migrated whichever
       * database DATABASE_URL named — reporting success afterwards.
       */
      const refusal = resetRefusal(`postgresql://postgres:x@localhost:5432/${name}`);

      expect(refusal).toContain("not this project's database");
      expect(refusal).toContain("footy-trends");
    }
  );

  it("still allows the compose database itself", () => {
    expect(resetRefusal("postgresql://postgres:x@localhost:5432/footy-trends")).toBeNull();
  });

  it("names the database it refused, so the message says what was wrong", () => {
    expect(resetRefusal("postgresql://postgres:x@localhost:5432/postgres")).toContain(
      "localhost:5432/postgres"
    );
  });

  it("refuses another local Postgres, which would reset the wrong volume", () => {
    expect(resetRefusal("postgresql://user@localhost:6543/app")).toContain(
      "not this project's database"
    );
  });
});

describe("waitFor", () => {
  /** A clock the test moves, so no test waits for anything. */
  function clock() {
    let nowMs = 0;
    return {
      now: () => nowMs,
      sleep: async (ms: number) => {
        nowMs += ms;
      },
    };
  }

  it("does not sleep at all when the probe answers immediately", async () => {
    const c = clock();

    const result = await waitFor(async () => true, 10_000, c);

    expect(result).toEqual({ ok: true, waitedMs: 0 });
  });

  it("reports how long it waited before the probe answered", async () => {
    const c = clock();
    let calls = 0;

    const result = await waitFor(
      async () => {
        calls += 1;
        return calls === 3;
      },
      10_000,
      { ...c, intervalMs: 500 }
    );

    expect(result).toEqual({ ok: true, waitedMs: 1000 });
    expect(calls).toBe(3);
  });

  it("does not sleep at all once a slow probe has used the whole budget", async () => {
    /**
     * A probe that itself takes time can cross the deadline. Sleeping a further
     * full interval after that made the reported wait exceed the timeout, so
     * the message said "within 90s" after rather more than 90s. Caught in
     * review on #402.
     *
     * The wait reported here is 2500 rather than 2000, and that is honest: the
     * probe overran on its own. What the fix guarantees is that nothing sleeps
     * *after* the deadline, which is the part this controls.
     */
    const slept: number[] = [];
    let nowMs = 0;

    const result = await waitFor(
      async () => {
        nowMs += 2500;
        return false;
      },
      2000,
      {
        now: () => nowMs,
        sleep: async (ms: number) => {
          slept.push(ms);
          nowMs += ms;
        },
        intervalMs: 500,
      }
    );

    expect(slept).toEqual([]);
    expect(result).toEqual({ ok: false, waitedMs: 2500 });
  });

  it("caps the last sleep to what is left of the budget", async () => {
    const slept: number[] = [];
    let nowMs = 0;

    await waitFor(async () => false, 1200, {
      now: () => nowMs,
      sleep: async (ms: number) => {
        slept.push(ms);
        nowMs += ms;
      },
      intervalMs: 500,
    });

    // Two full intervals, then only the 200ms that remained — not a third 500.
    expect(slept).toEqual([500, 500, 200]);
  });

  it("gives up once the deadline passes", async () => {
    const c = clock();

    const result = await waitFor(async () => false, 2000, { ...c, intervalMs: 500 });

    expect(result.ok).toBe(false);
    expect(result.waitedMs).toBe(2000);
  });

  it("does not probe at all when the timeout is zero", async () => {
    // An off-by-one here would call a probe the caller asked it not to — which
    // for the daemon path means spawning `docker info` after giving up.
    const c = clock();
    let calls = 0;

    const result = await waitFor(
      async () => {
        calls += 1;
        return true;
      },
      0,
      c
    );

    expect(calls).toBe(0);
    expect(result).toEqual({ ok: false, waitedMs: 0 });
  });
});

describe("waitFor, with nothing injected", () => {
  it("uses a real clock and a real sleep", async () => {
    // Covers the defaults the tests above replace. One 1ms sleep, so the probe
    // is genuinely called twice without the test waiting for anything.
    let calls = 0;

    const result = await waitFor(
      async () => {
        calls += 1;
        return calls === 2;
      },
      5000,
      { intervalMs: 1 }
    );

    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });
});

describe("effectiveDatabaseUrl", () => {
  const DEV = "postgresql://postgres:x@localhost:5432/footy-trends";
  const OVERRIDE = "postgresql://postgres:x@db.example.com:5432/suite";

  it("uses DATABASE_URL for dev and the db commands", () => {
    expect(effectiveDatabaseUrl({ forTests: false, testUrl: OVERRIDE, databaseUrl: DEV })).toBe(
      DEV
    );
  });

  it("prefers TEST_DATABASE_URL for the suites, which may be a different server", () => {
    // The suites derive their database from DATABASE_URL by suffixing the name —
    // same server, so probing either is the same question. TEST_DATABASE_URL
    // replaces that outright, and probing the wrong one would start local
    // containers for a run that never touches them.
    expect(effectiveDatabaseUrl({ forTests: true, testUrl: OVERRIDE, databaseUrl: DEV })).toBe(
      OVERRIDE
    );
  });

  it("falls back to DATABASE_URL when no override is set", () => {
    expect(effectiveDatabaseUrl({ forTests: true, testUrl: undefined, databaseUrl: DEV })).toBe(
      DEV
    );
  });

  it("treats a blank override as unset rather than as a URL", () => {
    expect(effectiveDatabaseUrl({ forTests: true, testUrl: "   ", databaseUrl: DEV })).toBe(DEV);
  });

  it("is empty when nothing is set at all", () => {
    expect(
      effectiveDatabaseUrl({ forTests: true, testUrl: undefined, databaseUrl: undefined })
    ).toBe("");
  });
});

describe("daemonNotStartedMessage", () => {
  it("does not claim to have waited, because nothing was launched", () => {
    const message = daemonNotStartedMessage();

    expect(message).not.toContain("within");
    expect(message).toContain("could not be started");
    // Linux is the case that produced this: the caller must be told what to run.
    expect(message).toContain("service manager");
  });
});

describe("probeUrls", () => {
  it("tries the configured database first, then the administrative one", () => {
    // The configured one first because it is the one that has to work: a managed
    // Postgres may refuse `postgres` entirely while the app's database is fine.
    expect(probeUrls("postgresql://u:p@localhost:5432/footy-trends")).toEqual([
      "postgresql://u:p@localhost:5432/footy-trends",
      "postgresql://u:p@localhost:5432/postgres",
    ]);
  });

  it("still tries the administrative one, for a database that does not exist yet", () => {
    // `ensureTestDatabase` is what creates the suite's database, so probing only
    // the configured name would read as unreachable until something else ran.
    const [, admin] = probeUrls("postgresql://u:p@localhost:5432/footy-trends_test");

    expect(admin).toBe("postgresql://u:p@localhost:5432/postgres");
  });

  it("does not probe the same URL twice", () => {
    // Doubling the attempts would double the wait on a server that is down.
    expect(probeUrls("postgresql://u:p@localhost:5432/postgres")).toEqual([
      "postgresql://u:p@localhost:5432/postgres",
    ]);
  });

  it("has nothing to try for a URL it cannot parse", () => {
    expect(probeUrls("not a url")).toEqual([]);
  });
});

describe("isComposeDatabase", () => {
  const on = (name: string) => `postgresql://postgres:x@localhost:${COMPOSE_POSTGRES_PORT}/${name}`;

  it("matches the database name docker-compose.yml actually creates", () => {
    // The same mechanism the port gets: the constant is a second copy, so a test
    // reads the compose file rather than a comment asking people to remember.
    const compose = readFileSync("docker-compose.yml", "utf8");
    const declared = /POSTGRES_DB:\s*(\S+)/.exec(compose);

    expect(declared).not.toBeNull();
    expect(declared?.[1]).toBe(COMPOSE_DATABASE_NAME);
  });

  it("accepts the compose database", () => {
    expect(isComposeDatabase(on(COMPOSE_DATABASE_NAME))).toBe(true);
  });

  /**
   * The bug in #404. Each of these reached the guard, destroyed the compose
   * volume, then migrated the database the URL named — reporting the reset a
   * success with the destructive step already done.
   */
  it.each(["postgres", "footy-trends_test", "someone-elses-db", ""])(
    "refuses /%s on the same server",
    (name) => {
      expect(isComposeDatabase(on(name))).toBe(false);
    }
  );

  it("decodes the name before comparing it", () => {
    // `footy%2Dtrends` addresses `footy-trends`; comparing the raw path would
    // call the same database a different one and refuse a legitimate reset.
    expect(isComposeDatabase(on("footy%2Dtrends"))).toBe(true);
  });

  it("still refuses a remote host that happens to use the same name", () => {
    expect(isComposeDatabase(`postgresql://u:p@db.example.com:5432/${COMPOSE_DATABASE_NAME}`)).toBe(
      false
    );
  });

  it("is false for a URL it cannot parse", () => {
    expect(isComposeDatabase("not a url")).toBe(false);
  });
});

describe("databaseNameOf", () => {
  it("reads the name without its leading slash", () => {
    expect(databaseNameOf("postgresql://h:5432/app")).toBe("app");
  });

  it("is empty when the URL names no database", () => {
    expect(databaseNameOf("postgresql://h:5432")).toBe("");
  });

  it("is null for something that is not a URL", () => {
    expect(databaseNameOf("not a url")).toBeNull();
  });
});

describe("testResetRefusal", () => {
  const onCompose = (name: string) => `postgresql://postgres:x@localhost:5432/${name}`;

  it("allows the suites' database", () => {
    expect(testResetRefusal(onCompose("footy-trends_test"))).toBeNull();
  });

  it("allows any other database on that server, which the tooling owns", () => {
    // Deliberately laxer than the dev guard: nothing here is the human's.
    expect(testResetRefusal(onCompose("footy-trends_e2e"))).toBeNull();
  });

  it("refuses the development database, which is the one thing it protects", () => {
    /**
     * A mis-derived test URL, or TEST_DATABASE_URL set to the dev database by
     * mistake, would otherwise let the *safe* command destroy the developer's
     * data without asking — the exact failure #406 exists to prevent.
     */
    const refusal = testResetRefusal(onCompose("footy-trends"));

    expect(refusal).toContain("that is the development database");
    expect(refusal).toContain("db:reset:dev");
  });

  it("refuses a database on another server", () => {
    expect(testResetRefusal("postgresql://u:p@db.example.com:5432/suite_test")).toContain(
      "not this project's Postgres"
    );
  });

  it("refuses when nothing says where the test database is", () => {
    expect(testResetRefusal(undefined)).toContain("No test database URL");
    expect(testResetRefusal("  ")).toContain("No test database URL");
  });
});

describe("decideConfirmation", () => {
  it("proceeds when --yes was passed", () => {
    expect(decideConfirmation({ yes: true, interactive: true })).toBe("proceed");
    expect(decideConfirmation({ yes: true, interactive: false })).toBe("proceed");
  });

  it("asks when there is a terminal", () => {
    expect(decideConfirmation({ yes: false, interactive: true })).toBe("ask");
  });

  it("refuses when there is nobody to ask", () => {
    /**
     * Treating an unanswerable prompt as consent would make every scripted or
     * agent-driven run a silent destruction of the developer's database, which
     * is the case the confirmation exists for.
     */
    expect(decideConfirmation({ yes: false, interactive: false })).toBe("refuse");
  });
});

describe("confirmationPrompt", () => {
  it("names what will be destroyed, and what counts as consent", () => {
    const prompt = confirmationPrompt();

    // The prompt has to say more than "are you sure": the surprise it exists to
    // prevent is that everything else on that server goes too.
    expect(prompt).toContain(COMPOSE_DATABASE_NAME);
    expect(prompt).toContain("everything else on that server");
    expect(prompt).toContain('Type "yes"');
  });
});

describe("isAffirmative", () => {
  it.each(["yes", "YES", "  yes  ", "Yes"])("accepts %o", (answer) => {
    expect(isAffirmative(answer)).toBe(true);
  });

  it.each(["y", "Y", "", "no", "yes please", "1"])("rejects %o", (answer) => {
    // `y` is what people press to get past a dialog they have stopped reading,
    // and this one destroys data.
    expect(isAffirmative(answer)).toBe(false);
  });
});
