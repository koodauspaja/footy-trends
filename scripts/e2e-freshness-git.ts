import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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

function git(args: string[], input?: string): string | null {
  const run = spawnSync("git", args, {
    encoding: "utf8",
    timeout: 15_000,
    ...(input === undefined ? {} : { input }),
    maxBuffer: 32 * 1024 * 1024,
  });
  return run.status === 0 ? run.stdout : null;
}

/**
 * Every watched file that exists on disk — tracked and untracked, with
 * `.gitignore` respected so build output and the marker itself stay out.
 *
 * A tracked file deleted from the working tree is simply absent, which is what
 * makes a deletion visible: its entry disappears from the fingerprint.
 */
function watchedFiles(): string[] | null {
  const out = git(["ls-files", "-c", "-o", "--exclude-standard", "--", ...WATCHED_DIRECTORIES]);
  if (out === null) return null;
  return out.split("\n").filter(Boolean).filter(existsSync);
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
 * One `git hash-object` process for the whole set — 94 files in ~37ms here.
 */
export function fingerprint(): string[] | null {
  const files = watchedFiles();
  if (files === null) return null;
  if (files.length === 0) return [];

  const hashed = git(["hash-object", "--stdin-paths"], `${files.join("\n")}\n`);
  if (hashed === null) return null;

  const hashes = hashed.split("\n").filter(Boolean);
  // A short read means some path could not be hashed — a file removed between
  // listing and hashing, say. Fail closed rather than fingerprint a subset.
  if (hashes.length !== files.length) return null;

  return files.map((file, index) => `${hashes[index]}\t${file}`).sort();
}
