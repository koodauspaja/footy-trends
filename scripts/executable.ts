import { accessSync, constants, statSync } from "node:fs";
import { isAbsolute } from "node:path";

/**
 * Where the command-line tools these scripts run actually live: named places,
 * never a name resolved through `PATH`. `GIT_EXECUTABLE` and
 * `DOCKER_EXECUTABLE` override them, and must be absolute.
 *
 * decisions/292-sonar-zero-open-issues.md
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
 * What Windows treats as runnable and Node can actually launch: `.exe` only.
 * `spawnSync` cannot start a `.cmd` or `.bat` without a shell.
 *
 * decisions/292-sonar-zero-open-issues.md
 */
const WINDOWS_SUFFIXES = [".exe"];

/**
 * Whether a path looks like something we can run: a screen, not a proof. On
 * POSIX a file with the execute bit; on Windows the name, as `X_OK` there
 * succeeds for any readable file.
 *
 * decisions/292-sonar-zero-open-issues.md
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

/**
 * The environment variable that overrides the search for one tool.
 *
 * decisions/292-sonar-zero-open-issues.md
 */
export function overrideNameFor(tool: Tool): string {
  return `${tool.toUpperCase()}_EXECUTABLE`;
}

/**
 * The absolute path to run `tool` from, or `null` when it cannot be found.
 *
 * decisions/292-sonar-zero-open-issues.md
 */
export function executablePath(
  tool: Tool,
  {
    env = process.env,
    platform = process.platform,
    // Injected, not mocked: a partial mock of `node:fs` can fall through to the
    // real filesystem.
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
