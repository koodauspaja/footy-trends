import { describe, expect, it } from "vitest";

import { executablePath, overrideNameFor } from "../../../scripts/executable";

/**
 * Where the scripts find `git` and `docker`, from #292.
 *
 * The point of the module is that the answer never comes from `PATH`, so every
 * case here is about which absolute path is chosen — and about refusing the
 * ones that would hand the decision back.
 */

/** A filesystem where only these paths exist. */
function present(...paths: string[]) {
  return (candidate: string) => paths.includes(candidate);
}

describe("executablePath", () => {
  it("finds the tool in its usual place", () => {
    const exists = present("/usr/bin/git");

    expect(executablePath("git", { exists })).toBe("/usr/bin/git");
  });

  it("prefers the first candidate that exists, not the first listed", () => {
    // A machine with Homebrew git but no /usr/bin/git still gets an answer.
    const exists = present("/opt/homebrew/bin/git");

    expect(executablePath("git", { exists })).toBe("/opt/homebrew/bin/git");
  });

  it("finds Docker Desktop's own CLI when nothing is linked into a bin directory", () => {
    const exists = present("/Applications/Docker.app/Contents/Resources/bin/docker");

    expect(executablePath("docker", { exists })).toBe(
      "/Applications/Docker.app/Contents/Resources/bin/docker"
    );
  });

  it("returns null when the tool is nowhere we look", () => {
    // Every caller already has a meaning for this: the freshness check warns,
    // the docker probe reports not running, the release script refuses to run.
    const exists = present();

    expect(executablePath("git", { exists })).toBeNull();
    expect(executablePath("docker", { exists })).toBeNull();
  });

  it("takes an absolute override, for a machine that keeps git somewhere else", () => {
    const exists = present("/nix/store/abc/bin/git");

    expect(
      executablePath("git", { exists, env: { GIT_EXECUTABLE: "/nix/store/abc/bin/git" } })
    ).toBe("/nix/store/abc/bin/git");
  });

  it("refuses a relative override, which would put PATH back in charge", () => {
    /**
     * The case the whole module exists for. `GIT_EXECUTABLE=git` looks like a
     * configuration and is a way back to name resolution — and one that would
     * be trusted more than the default, because someone set it deliberately.
     */
    const exists = present("git", "/usr/bin/git");

    expect(executablePath("git", { exists, env: { GIT_EXECUTABLE: "git" } })).toBeNull();
    expect(executablePath("git", { exists, env: { GIT_EXECUTABLE: "./git" } })).toBeNull();
  });

  it("refuses an absolute override that does not exist, rather than passing it on", () => {
    // A typo in a path would otherwise reach `spawnSync` and fail there, with a
    // message about the spawn rather than about the setting.
    const exists = present("/usr/bin/git");

    expect(executablePath("git", { exists, env: { GIT_EXECUTABLE: "/opt/typo/git" } })).toBeNull();
  });

  it("ignores an empty override and searches as usual", () => {
    // `GIT_EXECUTABLE=` in a shell profile is not a request for anything.
    const exists = present("/usr/bin/git");

    expect(executablePath("git", { exists, env: { GIT_EXECUTABLE: "" } })).toBe("/usr/bin/git");
  });

  it("names the override the error messages can quote", () => {
    expect(overrideNameFor("git")).toBe("GIT_EXECUTABLE");
    expect(overrideNameFor("docker")).toBe("DOCKER_EXECUTABLE");
  });
});

describe("what counts as runnable", () => {
  /**
   * The default check is `isRunnable`, which is not exported — these drive the
   * real one through `executablePath`'s default, using paths this machine
   * genuinely has. Existence alone is not the question: a directory exists.
   */
  it("refuses a directory that happens to be named like the tool", () => {
    expect(executablePath("git", { env: { GIT_EXECUTABLE: "/usr" } })).toBeNull();
  });

  it("refuses a regular file without the execute bit", () => {
    // Every repository has one, and `package.json` is not going anywhere.
    expect(
      executablePath("git", { env: { GIT_EXECUTABLE: `${process.cwd()}/package.json` } })
    ).toBeNull();
  });

  it("accepts the real git, which is an executable file", () => {
    // A sanity check on the other three: if this returned null, the checks
    // above would pass for the wrong reason.
    expect(executablePath("git")).toMatch(/git$/);
  });
});

describe("candidates", () => {
  it("covers Windows as well as macOS and Linux", () => {
    // Nobody develops this on Windows today. A candidate list that silently
    // excludes a platform still costs someone an afternoon when they try.
    const exists = (candidate: string) =>
      candidate === String.raw`C:\Program Files\Git\cmd\git.exe`;

    expect(executablePath("git", { exists, env: {} })).toBe(
      String.raw`C:\Program Files\Git\cmd\git.exe`
    );
  });
});
