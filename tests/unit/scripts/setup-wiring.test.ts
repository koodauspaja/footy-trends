import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
// A type, so this import is erased rather than reaching the mocked module.
import type { SetupActions } from "../../../scripts/setup-steps";
import {
  createNodePrompt,
  makeAsk,
  type NodeActions,
  nodeSetupActions,
  notRunByNpmMessage,
  npmCliFrom,
  type Prompt,
  packageManagerFrom,
  REPOSITORY_FILES,
  secret,
  startSetup,
} from "../../../scripts/setup-wiring";

/**
 * The sequence itself is `setup-steps.ts`'s to test. Mocked here so that
 * `startSetup` — the one function that reaches for the real repository — can be
 * exercised without running setup on the machine running the suite.
 */
const { runSetup } = vi.hoisted(() => ({
  runSetup: vi.fn<(actions: SetupActions) => Promise<number>>(async () => 0),
}));

vi.mock("../../../scripts/setup-steps", () => ({ runSetup }));

/** A prompt that answers as told, and records what it was asked and its closing. */
function prompt(answer: () => Promise<string>): Prompt & { asked: string[]; closes: string[] } {
  const asked: string[] = [];
  const closes: string[] = [];

  return {
    asked,
    closes,
    question: (query: string) => {
      asked.push(query);
      return answer();
    },
    close: () => {
      closes.push("closed");
    },
  };
}

describe("secret", () => {
  it("is 32 bytes of hex, which needs no escaping in a URL or an .env line", () => {
    expect(secret()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is a different one every time", () => {
    expect(secret()).not.toBe(secret());
  });
});

describe("makeAsk", () => {
  it("passes the question through and returns the answer", async () => {
    const p = prompt(async () => "typed");
    const ask = makeAsk(() => p);

    expect(await ask("Key: ")).toBe("typed");
    expect(p.asked).toEqual(["Key: "]);
  });

  it("reports no answer when input ends, rather than throwing", async () => {
    /**
     * Node's readline rejects a pending question on end of input —
     * `AbortError: Aborted with Ctrl+D`. Uncaught, that ended setup with a stack
     * trace where the prompt had just said "press Enter to skip".
     */
    const ask = makeAsk(() =>
      prompt(async () => {
        throw new Error("Aborted with Ctrl+D");
      })
    );

    await expect(ask("Key: ")).resolves.toBeNull();
  });

  it("closes the interface either way, so the process can exit", async () => {
    const answered = prompt(async () => "typed");
    const aborted = prompt(async () => {
      throw new Error("Aborted with Ctrl+D");
    });

    await makeAsk(() => answered)("Key: ");
    await makeAsk(() => aborted)("Key: ");

    expect(answered.closes).toEqual(["closed"]);
    expect(aborted.closes).toEqual(["closed"]);
  });

  it("makes a fresh interface per question, so none holds stdin while a child runs", async () => {
    let created = 0;
    const ask = makeAsk(() => {
      created += 1;
      return prompt(async () => "typed");
    });

    await ask("one: ");
    await ask("two: ");

    expect(created).toBe(2);
  });
});

describe("npmCliFrom", () => {
  it("takes npm's own path from the environment npm sets", () => {
    expect(npmCliFrom({ npm_execpath: "/usr/local/lib/node_modules/npm/bin/npm-cli.js" })).toBe(
      "/usr/local/lib/node_modules/npm/bin/npm-cli.js"
    );
  });

  it.each([{}, { npm_execpath: "" }, { npm_execpath: "   " }])(
    "reports nothing for %j, which means this was not started by npm",
    (env) => {
      expect(npmCliFrom(env)).toBeNull();
    }
  );

  it("says how to start it properly", () => {
    expect(notRunByNpmMessage()).toContain("npm run setup");
  });
});

describe("nodeSetupActions", () => {
  /** A throwaway directory, so every file this touches is its own. */
  function options(overrides: Partial<NodeActions> = {}): NodeActions {
    const dir = mkdtempSync(path.join(tmpdir(), "footy-wiring-"));
    writeFileSync(path.join(dir, ".env.example"), "FOOTBALL_DATA_API_KEY=\n");
    writeFileSync(path.join(dir, "package.json"), '{"packageManager":"npm@12.0.2"}');

    return {
      files: {
        env: path.join(dir, ".env"),
        example: path.join(dir, ".env.example"),
        packageJson: path.join(dir, "package.json"),
      },
      npmCli: "/does/not/run.js",
      env: { npm_config_user_agent: "npm/12.0.2 node/v24.16.0" },
      isTty: false,
      createPrompt: () => prompt(async () => "answer"),
      ...overrides,
    };
  }

  it("reports no .env when there is none, and its contents when there is", () => {
    const o = options();
    const actions = nodeSetupActions(o);

    expect(actions.readEnv()).toBeNull();

    writeFileSync(o.files.env, "A=1\n");
    expect(actions.readEnv()).toBe("A=1\n");
  });

  it("reads the example, and the pinned package manager", () => {
    const actions = nodeSetupActions(options());

    expect(actions.readExample()).toBe("FOOTBALL_DATA_API_KEY=\n");
    expect(actions.packageManager).toBe("npm@12.0.2");
  });

  it("writes .env readable only by its owner, since it holds both secrets", () => {
    const o = options();

    nodeSetupActions(o).writeEnv("SECRET=x\n");

    expect(readFileSync(o.files.env, "utf8")).toBe("SECRET=x\n");
    expect(statSync(o.files.env).mode & 0o777).toBe(0o600);
  });

  it("tightens .env without writing it, for the run that changes nothing", () => {
    const o = options();
    writeFileSync(o.files.env, "OLD=1\n", { mode: 0o644 });

    nodeSetupActions(o).secureEnv();

    expect(statSync(o.files.env).mode & 0o777).toBe(0o600);
    // Untouched: this path exists precisely because there was nothing to write.
    expect(readFileSync(o.files.env, "utf8")).toBe("OLD=1\n");
  });

  it("tightens an .env that already existed with looser permissions", () => {
    /**
     * `writeFileSync`'s `mode` applies only when the file is created, so a
     * `cp .env.example .env` — 0644 under a normal umask — kept world-readable
     * permissions while setup added the password and the auth secret to it.
     * Raised in review on #409.
     */
    const o = options();
    writeFileSync(o.files.env, "OLD=1\n", { mode: 0o644 });

    nodeSetupActions(o).writeEnv("SECRET=x\n");

    expect(statSync(o.files.env).mode & 0o777).toBe(0o600);
  });

  it("carries the terminal and the user agent through, and an absent agent as blank", () => {
    expect(nodeSetupActions(options({ isTty: true })).interactive).toBe(true);
    expect(nodeSetupActions(options()).userAgent).toBe("npm/12.0.2 node/v24.16.0");
    expect(nodeSetupActions(options({ env: {} })).userAgent).toBe("");
  });

  it("asks through the prompt it was given", async () => {
    const actions = nodeSetupActions(options());

    await expect(actions.ask("Key: ")).resolves.toBe("answer");
  });

  it("runs an npm script through npm's own path, not through PATH", {
    timeout: 30_000,
  }, async () => {
    /**
     * Spawned for real, with a stand-in for npm that records its arguments and
     * exits 0 — the way `docker.test.ts` exercises its spawn with a harmless
     * command. What is being pinned is that npm is run as an argument to this
     * Node, rather than resolved from `PATH`.
     */
    const dir = mkdtempSync(path.join(tmpdir(), "footy-npm-"));
    const fakeNpm = path.join(dir, "fake-npm.js");
    const log = path.join(dir, "argv.json");
    writeFileSync(
      fakeNpm,
      `require("node:fs").writeFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)));`
    );

    const code = await nodeSetupActions(options({ npmCli: fakeNpm })).runScript("db:migrate");

    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(log, "utf8"))).toEqual(["run", "db:migrate"]);
  });

  it("writes its lines to stdout and stderr, each ending a line", () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    try {
      const actions = nodeSetupActions(options());
      actions.out("said");
      actions.err("warned");

      // Asserted before restoring: `mockRestore` clears the call history too,
      // so assertions after it see a spy that was never called.
      expect(out).toHaveBeenCalledWith("said\n");
      expect(err).toHaveBeenCalledWith("warned\n");
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });

  it("hands over a secret generator rather than a fixed value", () => {
    const actions = nodeSetupActions(options());

    expect(actions.secret()).not.toBe(actions.secret());
  });
});

describe("createNodePrompt", () => {
  it("makes a readline interface that closes cleanly", () => {
    const created = createNodePrompt();

    // Closed immediately: an open interface on stdin would keep this worker
    // alive, and nothing here is going to type an answer.
    expect(() => created.close()).not.toThrow();
  });
});

describe("startSetup", () => {
  it("runs the sequence against the repository's own files", async () => {
    const npmExecPath = process.env.npm_execpath;
    process.env.npm_execpath = "/somewhere/npm-cli.js";
    runSetup.mockResolvedValueOnce(4);

    try {
      await expect(startSetup()).resolves.toBe(4);
    } finally {
      if (npmExecPath === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = npmExecPath;
    }

    const actions = vi.mocked(runSetup).mock.calls.at(-1)?.[0];

    expect(actions?.packageManager).toBe(packageManagerFrom(readFileSync("package.json", "utf8")));
    expect(REPOSITORY_FILES.env).toBe(".env");
  });

  it("refuses, with the way to start it, when npm did not", async () => {
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const npmExecPath = process.env.npm_execpath;
    delete process.env.npm_execpath;

    try {
      await expect(startSetup()).resolves.toBe(1);
      expect(err).toHaveBeenCalledWith(expect.stringContaining("npm run setup"));
    } finally {
      err.mockRestore();
      if (npmExecPath !== undefined) process.env.npm_execpath = npmExecPath;
    }
  });
});

describe("packageManagerFrom", () => {
  it("reads this repository's own pin", () => {
    const pinned = packageManagerFrom(readFileSync("package.json", "utf8"));

    expect(pinned).toMatch(/^npm@\d+\.\d+\.\d+$/);
  });

  it("reports nothing to compare against when the field is absent", () => {
    expect(packageManagerFrom('{"name":"x"}')).toBe("");
  });
});
