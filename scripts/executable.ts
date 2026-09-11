import { accessSync, constants, statSync } from "node:fs";
import { isAbsolute } from "node:path";

/**
 * Where the command-line tools these scripts run actually live, from #292.
 *
 * **Why not just `spawnSync("git", …)`.** That resolves the name through
 * `PATH`, so which program runs depends on what happens to be earlier in it —
 * Sonar flags it, and is right to. A `git` dropped into a writeable directory
 * ahead of `/usr/bin` would be run by the pre-push hook with the repository
 * already in hand.
 *
 * The tools here are ordinary system installs in ordinary places, so naming
 * those places costs nothing and removes the question. When a machine keeps one
 * somewhere else — nix, asdf, a container — `GIT_EXECUTABLE` and
 * `DOCKER_EXECUTABLE` say where, and they must be absolute for the same reason.
 */

const CANDIDATES = {
  git: [
    "/usr/bin/git",
    "/usr/local/bin/git",
    "/opt/homebrew/bin/git",
    // Windows, where nobody develops this today — but a list that silently
    // excludes a platform is worse than one that covers it for two lines.
    String.raw`C:\Program Files\Git\cmd\git.exe`,
  ],
  gh: [
    "/usr/bin/gh",
    "/usr/local/bin/gh",
    "/opt/homebrew/bin/gh",
    String.raw`C:\Program Files\GitHub CLI\gh.exe`,
  ],
  docker: [
    "/usr/bin/docker",
    "/usr/local/bin/docker",
    "/opt/homebrew/bin/docker",
    // Docker Desktop on macOS, when its CLI is not linked into a bin directory.
    "/Applications/Docker.app/Contents/Resources/bin/docker",
    String.raw`C:\Program Files\Docker\Docker\resources\bin\docker.exe`,
  ],
} as const;

export type Tool = keyof typeof CANDIDATES;

/**
 * What Windows treats as runnable **and Node can actually launch**.
 *
 * `.cmd` and `.bat` are programs as far as Windows is concerned, and accepting
 * them was the obvious generalisation — a Windows git install really can put
 * `git.cmd` on the path. But `spawnSync` and `execFileSync` cannot start a
 * batch file without `{ shell: true }`, which the callers do not pass and
 * should not: the whole point of this module is that the command is a path we
 * chose, not a string a shell interprets.
 *
 * So accepting them would hand back a path that resolves and then fails to
 * spawn, which is exactly the failure this check exists to prevent.
 */
const WINDOWS_SUFFIXES = [".exe"];

/**
 * Whether a path *looks* like something we can run — a screen, not a proof.
 *
 * Existence alone is not enough: a directory named `git`, or a file without the
 * execute bit, would be returned as the binary and fail at `spawnSync` with a
 * message about the spawn rather than the path, and with the remaining
 * candidates never tried. This rules those out.
 *
 * **What it cannot do is promise the file will start**, and the name says
 * `looks` because of it. A `.exe` may be a text file with an `.exe` name; a
 * POSIX file with the execute bit may be a corrupt binary or a script with a
 * bad shebang. Neither platform's cheap check is a guarantee — reading a PE or
 * ELF header would only move the line, since a truncated binary passes that
 * too.
 *
 * The value is in the failures it does catch, which are the ones that actually
 * happen: a directory, a data file, an override pointing at the wrong thing.
 *
 * **Windows is a different question, not the same one.** `accessSync(path,
 * X_OK)` there succeeds for any readable file, so a permission check would mean
 * nothing — the name is what Windows goes on, and what `spawnSync` can start.
 */
export function looksRunnable(path: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (platform === "win32") {
      const lower = path.toLowerCase();
      return WINDOWS_SUFFIXES.some((suffix) => lower.endsWith(suffix));
    }
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    // Missing, unreadable, or not executable — all of which mean "not this one".
    return false;
  }
}

/** The environment variable that overrides the search for one tool. */
export function overrideNameFor(tool: Tool): string {
  return `${tool.toUpperCase()}_EXECUTABLE`;
}

/**
 * The absolute path to run `tool` from, or `null` when it cannot be found.
 *
 * `null` rather than a throw, because every caller already has a meaning for
 * "this tool could not answer": the freshness check warns, the docker probe
 * reports not running. A missing tool is not different in kind from a tool that
 * failed.
 */
export function executablePath(
  tool: Tool,
  {
    env = process.env,
    platform = process.platform,
    // Injected rather than mocked. `node:fs` is a builtin whose namespace does
    // not reliably take a partial module mock, and a test that silently falls
    // through to the real filesystem asserts whatever this machine happens to
    // have installed.
    exists = (candidate: string) => looksRunnable(candidate, platform),
  }: {
    env?: Record<string, string | undefined>;
    platform?: NodeJS.Platform;
    exists?: (path: string) => boolean;
  } = {}
): string | null {
  const override = env[overrideNameFor(tool)];
  if (override !== undefined && override !== "") {
    // A relative override would put the choice back in `PATH`'s hands, which is
    // the whole thing this avoids — so it is refused rather than resolved.
    return isAbsolute(override) && exists(override) ? override : null;
  }

  return CANDIDATES[tool].find((candidate) => exists(candidate)) ?? null;
}
