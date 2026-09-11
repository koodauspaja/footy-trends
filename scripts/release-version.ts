/**
 * Reads the commits a release would contain and reports the version they
 * imply. All the judgement lives in `next-version.ts`, which is unit tested;
 * this file only talks to git and to GitHub, and formats output.
 *
 * The one network call is `domainsForRelease`, and it is written so that it
 * cannot stop a release: every failure resolves to no domains, and the notes
 * publish without the `Touches:` line. Set `GH_TOKEN` to get it.
 *
 *   npm run release:version                      # origin/release..origin/main
 *   npm run release:version -- A B               # any two refs
 *   npm run release:version -- --since-last-tag  # last tag..HEAD, for post-merge use
 *   npm run release:version -- --print=version   # just the number, for scripts
 *   npm run release:version -- --print=notes     # markdown release notes
 */
import { execFileSync } from "node:child_process";
import { executablePath, overrideNameFor } from "./executable";
import {
  type Commit,
  decideVersion,
  domainsFrom,
  formatReleaseNotes,
  isStableVersionTag,
  issueRefsIn,
  labelsOfIssueResponse,
  selectPreviousTag,
} from "./next-version";

// ASCII record/unit separators: a commit body can contain anything, including
// blank lines and any punctuation a delimiter might otherwise use.
const RECORD = "\u001e";
const FIELD = "\u001f";

function git(args: string[]): string {
  // Absolute, not resolved through `PATH` — see `executable.ts`. This script
  // cuts a release, so it throws rather than degrading: a release built by
  // whatever `git` happened to be first in someone's path is not a release
  // anyone should trust.
  const binary = executablePath("git");
  if (binary === null) {
    throw new Error(
      `git not found. Set ${overrideNameFor("git")} to its absolute path if it is installed somewhere unusual.`
    );
  }
  return execFileSync(binary, args, { encoding: "utf8" }).trim();
}

// `process.stdout.write` rather than `console.log`: this is a command-line
// tool whose output is the product, and the repository lints `noConsole` as an
// error precisely so that stray debugging does not reach production code.
function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

// Sorted by version, not by date: a patch tagged after a minor must not win.
function stableTags(): string[] {
  return git(["tag", "--list", "v*", "--sort=-v:refname"]).split("\n").filter(isStableVersionTag);
}

function tagsAtHead(): string[] {
  return git(["tag", "--points-at", "HEAD"]).split("\n").filter(Boolean);
}

/** The stable version already on HEAD, if this is a rerun of a release. */
function stableTagOnHead(): string | null {
  const onHead = new Set(tagsAtHead());
  return stableTags().find((tag) => onHead.has(tag)) ?? null;
}

function latestVersionTag(): string | null {
  return stableTags()[0] ?? null;
}

function commitsBetween(from: string | null, to: string): Commit[] {
  const range = from ? `${from}..${to}` : to;
  // `--no-merges` asks git for the topology rather than guessing from the
  // subject line. A release produces a merge commit, and its subject can be
  // edited to anything, so matching on "Merge pull request" is a heuristic
  // where an authoritative answer is available.
  const raw = git(["log", "--no-merges", range, `--format=%s${FIELD}%b${RECORD}`]);
  if (!raw) return [];
  return raw
    .split(RECORD)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject = "", body = ""] = entry.split(FIELD);
      return { subject: subject.trim(), body: body.trim() };
    });
}

const API = "https://api.github.com/repos/koodauspaja/footy-trends";

/** Long enough for a slow answer, short enough that nobody waits on a release. */
const LABEL_LOOKUP_TIMEOUT_MS = 5000;

/**
 * The domain labels on every issue this release's commits reference.
 *
 * **This can never stop a release.** Everything else in this script reads git
 * and needs no network; this one call does, so every failure — no token, a
 * rate limit, a closed laptop lid — resolves to "no domains" and the notes are
 * published without the line. A version that cannot be cut because GitHub was
 * slow would be a worse trade than notes that say slightly less.
 *
 * `GH_TOKEN`/`GITHUB_TOKEN` is what CI already provides and what
 * `review-findings.ts` uses; locally, `GH_TOKEN=$(gh auth token)`.
 */
async function domainsForRelease(decision: ReturnType<typeof decideVersion>): Promise<string[]> {
  // The first **non-empty** of the two. `??` falls back only for undefined and
  // null, so `GH_TOKEN=""` — which CI can set — would otherwise shadow a
  // perfectly good `GITHUB_TOKEN` and silently drop the line.
  const token = [process.env.GH_TOKEN, process.env.GITHUB_TOKEN].find(
    (candidate) => candidate !== undefined && candidate !== ""
  );
  const refs = issueRefsIn(decision);
  if (token === undefined || refs.length === 0) return [];

  try {
    const labels = await Promise.all(
      refs.map(async (ref) => {
        const response = await fetch(`${API}/issues/${ref}`, {
          // A connection that never settles would leave `Promise.all` pending
          // forever, and the notes would never print — the one way this could
          // still stop a release. An abort is caught like any other failure.
          signal: AbortSignal.timeout(LABEL_LOOKUP_TIMEOUT_MS),
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        // Deleted, or simply not ours: skipped rather than failing the whole
        // line. A reference that is a *pull request* answers 200 here — the
        // shape check in `labelsOfIssueResponse` is what excludes those.
        if (!response.ok) return [];
        return labelsOfIssueResponse(await response.json());
      })
    );
    return domainsFrom(labels.flat());
  } catch (error) {
    err(`Could not read issue labels, so the notes omit the domains: ${String(error)}`);
    return [];
  }
}

const args = process.argv.slice(2);
const printMode = args.find((a) => a.startsWith("--print="))?.split("=")[1] ?? "report";
const sinceLastTag = args.includes("--since-last-tag");
const positional = args.filter((a) => !a.startsWith("--"));

// Under --since-last-tag the range is read from the release branch after the
// merge, where a rerun may find HEAD already tagged. Skipping a tag that is on
// HEAD reproduces the original range, so a rerun recomputes the same version
// and can publish notes that failed to publish the first time.
const previousTag = sinceLastTag
  ? selectPreviousTag(stableTags(), tagsAtHead())
  : latestVersionTag();

// After a release merge, `origin/release..origin/main` is empty — everything is
// on release. The tagging job therefore asks for "since the last tag" instead,
// which is the same set of commits seen from the other side.
const [fromArg, toArg] = positional;
const from = sinceLastTag ? previousTag : (fromArg ?? "origin/release");
const to = sinceLastTag ? "HEAD" : (toArg ?? "origin/main");

function requireRef(ref: string): void {
  try {
    git(["rev-parse", "--verify", `${ref}^{commit}`]);
  } catch {
    err(`Unknown ref: ${ref}`);
    err("Run `git fetch origin --tags` first, or pass two refs explicitly:");
    err("  npm run release:version -- <from> <to>");
    process.exit(1);
  }
}

if (from) requireRef(from);
requireRef(to);

const commits = commitsBetween(from, to);
if (commits.length === 0) {
  if (printMode === "report")
    out(`No commits in ${from ?? "the beginning"}..${to} — nothing to release.`);
  process.exit(printMode === "report" ? 0 : 1);
}

// Established before anything else consults the override: on a rerun the
// version comes off the commit, so FIRST_RELEASE_VERSION is not read at all.
// Validating it first would let a variable changed to something invalid *after*
// the first release fail a rerun that was never going to use it.
const alreadyTagged = sinceLastTag ? stableTagOnHead() : null;

let decision: ReturnType<typeof decideVersion>;
try {
  decision = decideVersion(commits, previousTag, {
    firstReleaseVersion: alreadyTagged === null ? process.env.FIRST_RELEASE_VERSION : undefined,
  });
} catch (error) {
  // A mistyped override is an operator error, not a crash. A stack trace here
  // would bury the one line saying what to put in the variable.
  err(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

// A rerun does not compute a version: the commit already carries one. Deriving
// a second answer here is how a rerun of the first release ends up disagreeing
// with the tag sitting on the very commit it is about to publish notes for.
if (alreadyTagged !== null) {
  // The whole decision is replaced, not just the number. Leaving `previous`,
  // `isFirstRelease` and the reasons describing a derivation that was discarded
  // would have the report explain how it reached a version it is not using.
  // Only the version and the explanation change. `isFirstRelease` stays as
  // computed, because a rerun of the *first* release is still a first release —
  // forcing it false made the notes say "Changes since v0.0.0." instead of
  // "First release."
  decision = {
    ...decision,
    next: alreadyTagged,
    reasons: [`HEAD is already tagged ${alreadyTagged}: reusing it rather than deriving a version`],
  };
}

/**
 * One chain, and no `process.exit`.
 *
 * `process.exit` does not wait for a backpressured stdout to flush, and
 * `skills/release.md` pipes this into a file — `--print=notes > /tmp/notes.md`.
 * Truncated release notes would be published without anything failing. Letting
 * the process end on its own is what flushes; the branches are exclusive so
 * nothing runs twice.
 */
if (printMode === "version") {
  out(decision.next);
} else if (printMode === "notes") {
  /**
   * A promise rather than a top-level `await`: this file transforms to CommonJS,
   * where top-level await is not available. `.catch` as well as the try/catch
   * inside `domainsForRelease`, so no failure mode can leave the notes unprinted
   * — the point of this branch is that a release is always cuttable.
   */
  domainsForRelease(decision)
    .catch(() => [] as string[])
    .then((domains) => {
      out(formatReleaseNotes(decision, domains));
    });
} else {
  printReport();
}

function printReport(): void {
  out(`Range        ${from ?? "the beginning"}..${to}  (${commits.length} commits)`);
  // `Previous` and `Bump` describe a derivation. On a rerun there was none — the
  // version came off the commit — so printing them would explain how a number was
  // reached that is not the number being used.
  if (alreadyTagged === null) {
    out(`Previous     ${decision.previous}${previousTag ? "" : "  (no tags yet)"}`);
    out(`Bump         ${decision.bump}`);
  }
  for (const reason of decision.reasons) out(`             - ${reason}`);

  if (decision.isFirstRelease) {
    out(`\nNext         ${decision.next}   <- first release, chosen not derived`);
    out("             `release` already contains the whole history, so the range above");
    out("             is only what followed the branch point. Override if this is a 1.0.\n");
  } else {
    out(`\nNext         ${decision.next}\n`);
  }

  const section = (title: string, items: string[]) => {
    if (items.length === 0) return;
    out(`${title} (${items.length})`);
    for (const item of items) out(`  ${item}`);
    out();
  };
  section("Breaking", decision.breaking);
  section("Features", decision.features);
  section("Fixes", decision.fixes);
  section("Other", decision.other);

  out("The tag is created automatically once this is merged — see skills/release.md.");
}
