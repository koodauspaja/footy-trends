import { spawnSync } from "node:child_process";
import { lstatSync, readlinkSync } from "node:fs";
import { WATCHED_DIRECTORIES } from "./e2e-freshness-plan";

/**
 * The git side of the freshness marker, shared by the reporter that writes it
 * and the pre-push hook that reads it.
 *
 * Kept apart from `e2e-freshness-plan.ts` so the decisions there stay pure and
 * unit-testable, and apart from the hook so the reporter can reuse it without
 * pulling in the hook's `docker` probe.
 *
 * `null` means git could not answer. That distinction is load-bearing: an empty
 * list and a failed command look identical otherwise, and "git failed" would
 * read as "nothing is there" — the check would pass having verified nothing.
 */

/** Enough headroom under any platform's argument limit, with room to grow. */
const HASH_BATCH = 500;

function git(args: string[]): string | null {
  const run = spawnSync("git", args, {
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return run.status === 0 ? run.stdout : null;
}

/**
 * What the path is, without following it — `lstat`, not `exists`.
 *
 * `existsSync` follows symlinks, so a tracked symlink whose target is missing
 * reports as absent and drops out of the fingerprint entirely; editing or
 * deleting it would then be invisible. `lstat` describes the link itself,
 * which is the thing git tracks.
 */
function describePath(path: string): "file" | "symlink" | "absent" {
  try {
    return lstatSync(path).isSymbolicLink() ? "symlink" : "file";
  } catch {
    return "absent";
  }
}

/**
 * A symlink's content is its target path — that is what git stores in the blob
 * — so the target is its fingerprint.
 *
 * Read directly rather than through `git hash-object`, which opens the file and
 * so fails on a dangling link. Letting that fail would take the whole
 * fingerprint with it, and one broken symlink under `src/` would then block
 * every push *and* stop a passing run recording anything. Retargeting the link
 * still shows as a change, which is the behaviour that matters.
 */
function symlinkEntry(path: string): string | null {
  try {
    return `link:${readlinkSync(path)}\t${path}`;
  } catch {
    return null;
  }
}

/**
 * Every watched file that exists on disk — tracked and untracked, with
 * `.gitignore` respected so build output and the marker itself stay out.
 *
 * `-z`, because without it git *quotes* any path needing escaping — a newline
 * in a filename comes back as the literal `"src/od\nd.ts"`, which matches no
 * file and would silently drop it. NUL-separated output is the raw bytes.
 *
 * A tracked file deleted from the working tree is simply absent, which is what
 * makes a deletion visible: its entry disappears from the fingerprint.
 */
function watchedPaths(): string[] | null {
  const out = git([
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
 * Hashes for the given paths, in order.
 *
 * Paths go as arguments rather than through `--stdin-paths`, which is
 * newline-delimited and so cannot express a filename containing one. Batched
 * only to stay clear of the platform argument limit.
 */
function hashAll(files: string[]): string[] | null {
  const hashes: string[] = [];
  for (let start = 0; start < files.length; start += HASH_BATCH) {
    const batch = files.slice(start, start + HASH_BATCH);
    const out = git(["hash-object", "--", ...batch]);
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
 * `hash<TAB>path` for every watched file, sorted — a description of the code
 * the suite ran against, and nothing else.
 *
 * Content, deliberately, rather than `HEAD` plus working-tree status. That pair
 * describes *where* content lives, so committing moved a file from one half to
 * the other and read as a change even though nothing was edited (#242). It also
 * forced special cases for a rebase or a branch switch. A content fingerprint
 * has none: identical content is identical, wherever git is keeping it.
 *
 * Cheap: 94 files in ~37ms here.
 */
export function fingerprint(): string[] | null {
  const paths = watchedPaths();
  if (paths === null) return null;

  const files: string[] = [];
  const entries: string[] = [];
  for (const path of paths) {
    const kind = describePath(path);
    // Absent means deleted from the working tree: it contributes no entry, and
    // its disappearance from the fingerprint is what makes the deletion visible.
    if (kind === "absent") continue;
    if (kind === "symlink") {
      const entry = symlinkEntry(path);
      if (entry === null) return null;
      entries.push(entry);
      continue;
    }
    files.push(path);
  }

  const hashes = hashAll(files);
  if (hashes === null) return null;
  entries.push(...files.map((file, index) => `${hashes[index]}\t${file}`));

  return entries.sort();
}
