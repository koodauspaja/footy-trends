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
    "C:\\Program Files\\Git\\cmd\\git.exe",
  ],
  docker: [
    "/usr/bin/docker",
    "/usr/local/bin/docker",
    "/opt/homebrew/bin/docker",
    // Docker Desktop on macOS, when its CLI is not linked into a bin directory.
    "/Applications/Docker.app/Contents/Resources/bin/docker",
    "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
  ],
} as const;

export type Tool = keyof typeof CANDIDATES;

/**
 * Whether a path is something we can actually run.
 *
 * Existence is not enough: a directory named `git`, or a file without the
 * execute bit, would be returned as the binary and fail at `spawnSync` — with a
 * message about the spawn rather than about the path, and with the remaining
 * candidates never tried.
 */
function isRunnable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
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
    // Injected rather than mocked. `node:fs` is a builtin whose namespace does
    // not reliably take a partial module mock, and a test that silently falls
    // through to the real filesystem asserts whatever this machine happens to
    // have installed.
    exists = isRunnable,
  }: { env?: Record<string, string | undefined>; exists?: (path: string) => boolean } = {}
): string | null {
  const override = env[overrideNameFor(tool)];
  if (override !== undefined && override !== "") {
    // A relative override would put the choice back in `PATH`'s hands, which is
    // the whole thing this avoids — so it is refused rather than resolved.
    return isAbsolute(override) && exists(override) ? override : null;
  }

  return CANDIDATES[tool].find((candidate) => exists(candidate)) ?? null;
}
