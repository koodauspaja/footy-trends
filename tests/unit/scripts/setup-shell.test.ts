import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * `scripts/setup` runs before Node is known to exist, so it is shell and cannot
 * be imported. It is tested by running it — in a temporary directory holding
 * nothing but the files it reads, with a `PATH` holding nothing but fakes, so
 * what this machine happens to have installed decides nothing.
 *
 * Run with `/bin/sh`, which is dash on the CI runners and not bash. That is the
 * point: the script claims POSIX sh, and this is what checks the claim.
 */

const SCRIPT = path.resolve("scripts/setup");
const created: string[] = [];

afterEach(() => {
  // Left in place on failure would be tidier to debug, but these hold a fake
  // PATH and the suite runs on developer machines too.
  created.length = 0;
});

/** A fake executable that logs how it was called and answers as told. */
function fake(bin: string, name: string, body: string): void {
  const file = path.join(bin, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

type Clone = { dir: string; bin: string; log: () => string };

/**
 * A directory with the script, a `.nvmrc` and a lockfile — and a `bin` holding
 * whichever fakes this case wants.
 */
function clone({
  node,
  docker,
  nvmrc = "24",
}: {
  node?: string;
  docker?: "working" | "no-compose";
  nvmrc?: string;
}): Clone {
  const dir = mkdtempSync(path.join(tmpdir(), "footy-setup-"));
  created.push(dir);

  mkdirSync(path.join(dir, "scripts"));
  copyFileSync(SCRIPT, path.join(dir, "scripts/setup"));
  // No trailing newline, exactly as the repository's own .nvmrc is written.
  writeFileSync(path.join(dir, ".nvmrc"), nvmrc);
  writeFileSync(path.join(dir, "package-lock.json"), "{}\n");

  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  const log = path.join(dir, "calls.log");

  if (node !== undefined) {
    fake(bin, "node", `printf '%s\\n' "${node}"`);
    fake(bin, "npm", `printf 'npm %s\\n' "$*" >> "${log}"`);
  }

  if (docker !== undefined) {
    const composeStatus = docker === "working" ? 0 : 1;
    fake(bin, "docker", `case "$1" in compose) exit ${composeStatus} ;; esac\nexit 0`);
  }

  return {
    dir,
    bin,
    log: () => {
      try {
        return readFileSync(log, "utf8");
      } catch {
        return "";
      }
    },
  };
}

/**
 * A `PATH` holding only this case's fakes, so nothing installed on the machine
 * running the suite can decide the result. `NODE_ENV` is here because Next's
 * types make it a required member of `ProcessEnv`; the script never reads it.
 */
function environment(c: Clone, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { PATH: c.bin, HOME: c.dir, NODE_ENV: "test", ...extra };
}

function run(c: Clone, extra: Record<string, string> = {}) {
  const result = spawnSync("/bin/sh", [path.join(c.dir, "scripts/setup")], {
    encoding: "utf8",
    env: environment(c, extra),
  });

  return { status: result.status, output: `${result.stdout}${result.stderr}`, calls: c.log() };
}

describe("scripts/setup prerequisites", () => {
  it("reports Node and the container runtime together, and installs nothing", () => {
    const result = run(clone({}));

    expect(result.status).toBe(1);
    expect(result.output).toContain("Node.js 24 or newer (not found)");
    expect(result.output).toContain("no `docker` command found");
    expect(result.calls).toBe("");
  });

  it("names the version it found when Node is too old", () => {
    const result = run(clone({ node: "v18.20.0", docker: "working" }));

    expect(result.status).toBe(1);
    expect(result.output).toContain("Node.js 24 or newer (found v18.20.0)");
  });

  it("accepts a Node newer than the one asked for", () => {
    const result = run(clone({ node: "v26.1.0", docker: "working" }));

    expect(result.status).toBe(0);
    expect(result.output).not.toContain("Missing prerequisites");
  });

  it("reads the major version from a .nvmrc that names a full version", () => {
    const result = run(clone({ node: "v24.16.0", docker: "working", nvmrc: "v24.16.0" }));

    expect(result.status).toBe(0);
  });

  it("stops when .nvmrc says nothing it can read", () => {
    const result = run(clone({ node: "v24.16.0", docker: "working", nvmrc: "lts/*" }));

    expect(result.status).toBe(1);
    expect(result.output).toContain("Cannot read a Node major version");
  });

  it("tells docker missing apart from `docker compose` missing", () => {
    const result = run(clone({ node: "v24.16.0", docker: "no-compose" }));

    expect(result.status).toBe(1);
    expect(result.output).toContain("`docker compose version` failed");
    expect(result.output).not.toContain("Node.js");
  });

  it("names the runtimes it will not install, rather than mandating one", () => {
    const result = run(clone({ node: "v24.16.0" }));

    expect(result.output).toContain("OrbStack");
    expect(result.output).toContain("Colima");
    expect(result.output).toContain("Podman");
  });
});

describe("scripts/setup and DOCKER_EXECUTABLE", () => {
  /**
   * INSTALL.md offers this for a docker installed somewhere unusual, and the
   * shell check runs before the TypeScript half that reads it — so without
   * support here the documented escape hatch never got a chance. Raised in
   * review on #409.
   */
  function dockerAt(c: Clone, name: string): string {
    const elsewhere = path.join(c.dir, name);
    writeFileSync(elsewhere, '#!/bin/sh\ncase "$1" in compose) exit 0 ;; esac\nexit 0\n', {
      mode: 0o755,
    });
    return elsewhere;
  }

  it("accepts a docker that is not on PATH at all", () => {
    const c = clone({ node: "v24.16.0" });
    const result = run(c, { DOCKER_EXECUTABLE: dockerAt(c, "docker-elsewhere") });

    expect(result.status).toBe(0);
    expect(result.calls).toContain("npm run setup");
  });

  it("refuses a relative override, the way executable.ts does", () => {
    // A relative path would put the choice back in `PATH`'s hands, which is the
    // whole point of having an override.
    const c = clone({ node: "v24.16.0", docker: "working" });
    const result = run(c, { DOCKER_EXECUTABLE: "docker" });

    expect(result.status).toBe(1);
    expect(result.output).toContain("must be an absolute path");
    expect(result.calls).toBe("");
  });

  it("says so when the override points at nothing runnable", () => {
    const c = clone({ node: "v24.16.0", docker: "working" });
    const result = run(c, { DOCKER_EXECUTABLE: path.join(c.dir, "not-here") });

    expect(result.status).toBe(1);
    expect(result.output).toContain("not an executable file");
  });

  it("still checks compose on the override, not only that the file exists", () => {
    const c = clone({ node: "v24.16.0" });
    const noCompose = path.join(c.dir, "docker-no-compose");
    writeFileSync(noCompose, '#!/bin/sh\ncase "$1" in compose) exit 1 ;; esac\nexit 0\n', {
      mode: 0o755,
    });

    const result = run(c, { DOCKER_EXECUTABLE: noCompose });

    expect(result.status).toBe(1);
    expect(result.output).toContain("`docker compose version` failed");
  });
});

describe("scripts/setup and a Node version manager", () => {
  it("points at an installed nvm rather than offering to install one", () => {
    const c = clone({ docker: "working" });
    mkdirSync(path.join(c.dir, ".nvm"));
    writeFileSync(path.join(c.dir, ".nvm/nvm.sh"), "# nvm\n");

    const result = run(c);

    expect(result.output).toContain("nvm is installed");
    expect(result.output).toContain("it reads .nvmrc");
    expect(result.output).not.toContain("curl");
  });

  it("points at an installed fnm the same way", () => {
    const c = clone({ docker: "working" });
    fake(c.bin, "fnm", "exit 0");

    const result = run(c);

    expect(result.output).toContain("fnm is installed");
  });

  it("prints both installers, and asks nothing, with no terminal to ask at", () => {
    const result = run(clone({ docker: "working" }));

    expect(result.output).toContain(
      "https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh"
    );
    expect(result.output).toContain("https://fnm.vercel.app/install");
    expect(result.output).not.toContain("Install one now?");
  });
});

describe("scripts/setup hand-off", () => {
  it("installs the dependencies, then runs the rest", () => {
    const result = run(clone({ node: "v24.16.0", docker: "working" }));

    expect(result.status).toBe(0);
    expect(result.calls).toBe("npm ci\nnpm run setup\n");
  });

  it("does not reinstall when the tree is newer than the lockfile", () => {
    /**
     * A second run must be safe, and `npm ci` deletes node_modules — under a dev
     * server that may well be running.
     */
    const c = clone({ node: "v24.16.0", docker: "working" });
    const installed = path.join(c.dir, "node_modules/.package-lock.json");
    mkdirSync(path.dirname(installed));
    writeFileSync(installed, "{}\n");
    const later = new Date(Date.now() + 60_000);
    utimesSync(installed, later, later);

    expect(run(c).calls).toBe("npm run setup\n");
  });

  it("reinstalls when the lockfile has moved on", () => {
    const c = clone({ node: "v24.16.0", docker: "working" });
    const installed = path.join(c.dir, "node_modules/.package-lock.json");
    mkdirSync(path.dirname(installed));
    writeFileSync(installed, "{}\n");
    const earlier = new Date(Date.now() - 60_000);
    utimesSync(installed, earlier, earlier);

    expect(run(c).calls).toBe("npm ci\nnpm run setup\n");
  });

  it("works when run from inside the scripts directory", () => {
    // `sh setup` there makes `$0` a bare name, with no directory to strip.
    const c = clone({ node: "v24.16.0", docker: "working" });
    const result = spawnSync("/bin/sh", ["setup"], {
      cwd: path.join(c.dir, "scripts"),
      encoding: "utf8",
      env: environment(c),
    });

    expect(result.status).toBe(0);
    expect(c.log()).toContain("npm run setup");
  });
});
