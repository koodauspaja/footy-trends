import { spawnSync } from "node:child_process";
import { lstatSync, readlinkSync } from "node:fs";
import { inFixedOrder, WATCHED_DIRECTORIES } from "./e2e-freshness-plan";
import { executablePath } from "./executable";

/**
 * The git side of the freshness marker, shared by the reporter that writes it
 * and the pre-push hook that reads it. `null` means git could not answer,
 * which is not the same as an empty list.
 *
 * decisions/084-e2e-freshness-before-push.md
 * decisions/220-freshness-notices-deletions.md
 * decisions/242-freshness-compares-content.md
 * decisions/292-sonar-zero-open-issues.md
 * decisions/403-coverage-exclusions-that-earn-it.md
 */

/**
 * Enough headroom under any platform's argument limit, with room to grow.
 *
 * decisions/242-freshness-compares-content.md
 */
const HASH_BATCH = 500;

/**
 * Just enough of `spawnSync`'s result for the decisions here.
 *
 * decisions/403-coverage-exclusions-that-earn-it.md
 */
export type GitOutput = { status: number | null; stdout: string };

/**
 * The IO this module does, injected, so a test can assert which arguments git
 * is given.
 *
 * decisions/403-coverage-exclusions-that-earn-it.md
 */
export type GitDeps = {
  /** Where `git` lives, or `null` when it cannot be found. */
  find: () => string | null;
  run: (binary: string, args: readonly string[]) => GitOutput;
  /** What the path is, without following it. */
  lstat: (path: string) => { isSymbolicLink: () => boolean };
  readlink: (path: string) => string;
};

export const defaultGitDeps: GitDeps = {
  find: () => executablePath("git"),
  run: (binary, args) =>
    spawnSync(binary, [...args], {
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 32 * 1024 * 1024,
    }),
  lstat: (path) => lstatSync(path),
  readlink: (path) => readlinkSync(path),
};

function git(deps: GitDeps, args: string[]): string | null {
  // An absolute path, not a name resolved through `PATH`: see `executable.ts`.
  // Not finding git is the same answer as git failing.
  const binary = deps.find();
  if (binary === null) return null;

  const run = deps.run(binary, args);
  return run.status === 0 ? run.stdout : null;
}

/**
 * What the path is, without following it: `lstat`, not `exists`.
 *
 * decisions/242-freshness-compares-content.md
 */
function describePath(deps: GitDeps, path: string): "file" | "symlink" | "absent" {
  try {
    return deps.lstat(path).isSymbolicLink() ? "symlink" : "file";
  } catch {
    return "absent";
  }
}

/**
 * A symlink's fingerprint: its target path, which is what git stores in the
 * blob. Read directly, as `git hash-object` fails on a dangling link.
 *
 * decisions/220-freshness-notices-deletions.md
 * decisions/242-freshness-compares-content.md
 */
function symlinkEntry(deps: GitDeps, path: string): string | null {
  try {
    return `link:${deps.readlink(path)}\t${path}`;
  } catch {
    return null;
  }
}

/**
 * Every watched file that exists on disk, tracked and untracked, with
 * `.gitignore` respected. Asked with `-z`, so a path needing escaping comes
 * back as raw bytes.
 *
 * decisions/220-freshness-notices-deletions.md
 * decisions/242-freshness-compares-content.md
 */
function watchedPaths(deps: GitDeps): string[] | null {
  const out = git(deps, [
    "ls-files",
    "-z",
    "-c",
    "-o",
    "--exclude-standard",
    "--",
    ...WATCHED_DIRECTORIES,
  ]);
  if (out === null) return null;
  return out.split("\0").filter(Boolean);
}

/**
 * Hashes for the given paths, in order. Paths go as arguments, not through
 * `--stdin-paths`, and in batches.
 *
 * decisions/242-freshness-compares-content.md
 */
function hashAll(deps: GitDeps, files: string[]): string[] | null {
  const hashes: string[] = [];
  for (let start = 0; start < files.length; start += HASH_BATCH) {
    const batch = files.slice(start, start + HASH_BATCH);
    const out = git(deps, ["hash-object", "--", ...batch]);
    if (out === null) return null;
    const produced = out.split("\n").filter(Boolean);
    // A short read means some path could not be hashed. Fail closed rather
    // than fingerprint a subset and call the rest unchanged.
    if (produced.length !== batch.length) return null;
    hashes.push(...produced);
  }
  return hashes;
}

/**
 * `hash<TAB>path` for every watched file, sorted: a description of the code the
 * suite ran against, and nothing else.
 *
 * decisions/220-freshness-notices-deletions.md
 * decisions/242-freshness-compares-content.md
 */
export function fingerprint(deps: GitDeps = defaultGitDeps): string[] | null {
  const paths = watchedPaths(deps);
  if (paths === null) return null;

  const files: string[] = [];
  const entries: string[] = [];
  for (const path of paths) {
    const kind = describePath(deps, path);
    // Absent means deleted from the working tree: it contributes no entry, and
    // its disappearance from the fingerprint is what makes the deletion visible.
    if (kind === "absent") continue;
    if (kind === "symlink") {
      const entry = symlinkEntry(deps, path);
      if (entry === null) return null;
      entries.push(entry);
      continue;
    }
    files.push(path);
  }

  const hashes = hashAll(deps, files);
  if (hashes === null) return null;
  entries.push(...files.map((file, index) => `${hashes[index]}\t${file}`));

  // Ordered by `inFixedOrder`, which compares code units rather than by locale
  // — see the reasoning there. This list is compared against one another run
  // wrote, so the order has to be the same everywhere.
  return inFixedOrder(entries);
}
