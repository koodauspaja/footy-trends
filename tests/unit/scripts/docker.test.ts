import { describe, expect, it } from "vitest";
import {
  defaultRun,
  destroyContainers,
  dockerAvailable,
  dockerIsRunning,
  type SpawnResult,
  startContainers,
  startDockerDaemon,
} from "../../../scripts/docker";

const BINARY = "/opt/homebrew/bin/docker";

/** Records what was asked of the process runner, and answers with `status`. */
function runner(status: number | null) {
  const calls: { command: string; args: readonly string[]; inherit: boolean }[] = [];
  return {
    calls,
    run: (command: string, args: readonly string[], { inherit }: { inherit: boolean }) => {
      calls.push({ command, args, inherit });
      return { status } satisfies SpawnResult;
    },
  };
}

const found = () => BINARY;
const missing = () => null;

describe("dockerAvailable", () => {
  it("is true when a binary was found", () => {
    expect(dockerAvailable({ find: found })).toBe(true);
  });

  it("is false when it was not", () => {
    expect(dockerAvailable({ find: missing })).toBe(false);
  });
});

describe("dockerIsRunning", () => {
  it("asks the daemon for its version, silently", () => {
    const { calls, run } = runner(0);

    expect(dockerIsRunning({ find: found, run })).toBe(true);
    expect(calls).toEqual([
      {
        command: BINARY,
        args: ["info", "--format", "{{.ServerVersion}}"],
        // A probe that printed the daemon's info before every `npm run dev`
        // would be noise, and the caller only wants the status.
        inherit: false,
      },
    ]);
  });

  it("is false when docker exits non-zero", () => {
    expect(dockerIsRunning({ find: found, run: runner(1).run })).toBe(false);
  });

  it("is false when the spawn was killed, which is how a timeout arrives", () => {
    // `spawnSync` reports `status: null` for a signalled child. Treating that
    // as anything but "not running" would hang the caller on a wedged CLI.
    expect(dockerIsRunning({ find: found, run: runner(null).run })).toBe(false);
  });

  it("is false, and runs nothing, when there is no docker", () => {
    const { calls, run } = runner(0);

    expect(dockerIsRunning({ find: missing, run })).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("startContainers", () => {
  it("runs `compose up -d` and shows its output", () => {
    const { calls, run } = runner(0);

    expect(startContainers({ find: found, run })).toBe(true);
    expect(calls).toEqual([{ command: BINARY, args: ["compose", "up", "-d"], inherit: true }]);
  });

  it("is false when compose fails", () => {
    expect(startContainers({ find: found, run: runner(1).run })).toBe(false);
  });

  it("is false, and runs nothing, when there is no docker", () => {
    const { calls, run } = runner(0);

    expect(startContainers({ find: missing, run })).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("destroyContainers", () => {
  it("passes --volumes, which is what makes it a reset", () => {
    const { calls, run } = runner(0);

    expect(destroyContainers({ find: found, run })).toBe(true);
    /**
     * Pinned deliberately. Without `--volumes` this is a restart that silently
     * keeps the data, `db:reset` would report a fresh database it had not made,
     * and nothing else in the repository would notice.
     */
    expect(calls).toEqual([
      { command: BINARY, args: ["compose", "down", "--volumes"], inherit: true },
    ]);
  });

  it("is false when compose fails", () => {
    expect(destroyContainers({ find: found, run: runner(1).run })).toBe(false);
  });

  it("is false, and runs nothing, when there is no docker", () => {
    const { calls, run } = runner(0);

    expect(destroyContainers({ find: missing, run })).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("startDockerDaemon", () => {
  it("opens Docker on macOS", () => {
    const { calls, run } = runner(0);

    expect(startDockerDaemon("darwin", { run })).toBe(true);
    expect(calls).toEqual([
      // Absolute, for the same reason `executable.ts` exists.
      { command: "/usr/bin/open", args: ["-a", "Docker"], inherit: false },
    ]);
  });

  it("reports failure when open does", () => {
    expect(startDockerDaemon("darwin", { run: runner(1).run })).toBe(false);
  });

  it("does not try on Linux, and runs nothing at all", () => {
    const { calls, run } = runner(0);

    // The point is not only the false — it is that nothing was spawned, so
    // nobody is prompted for a root password they did not ask to give.
    expect(startDockerDaemon("linux", { run })).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("the real spawn, which the injected one stands in for", () => {
  it("passes the child's exit status through", () => {
    // `process.execPath` is the Node running this test: guaranteed present on
    // every platform, and `-e` makes it exit on command with no side effect.
    expect(defaultRun(process.execPath, ["-e", "process.exit(0)"], { inherit: false }).status).toBe(
      0
    );
    expect(defaultRun(process.execPath, ["-e", "process.exit(3)"], { inherit: false }).status).toBe(
      3
    );
  });

  it("works with output inherited too, which skips the timeout", () => {
    expect(defaultRun(process.execPath, ["-e", ""], { inherit: true }).status).toBe(0);
  });
});

describe("the default lookup, which the injected one stands in for", () => {
  it("asks the machine for docker without being told where to look", () => {
    // Asserting the type, not the answer: whether this machine has docker is
    // not something a unit test may depend on.
    expect(typeof dockerAvailable()).toBe("boolean");
  });
});
