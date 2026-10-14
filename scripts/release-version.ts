/**
 * Reads the commits a release would contain and reports the version they
 * imply. The judgement is in `next-version.ts`; this talks to git and GitHub
 * and formats output. Only `--print=json` touches the network.
 *
 * decisions/085-release-workflow.md
 * decisions/292-sonar-zero-open-issues.md
 * decisions/357-release-domains.md
 * decisions/361-release-domains-on-the-pr.md
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
  // Absolute, not resolved through `PATH`: see `executable.ts`. This cuts a
  // release, so a missing git throws.
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

/**
 * The stable version already on HEAD, if this is a rerun of a release.
 *
 * decisions/085-release-workflow.md
 */
function stableTagOnHead(): string | null {
  const onHead = new Set(tagsAtHead());
  return stableTags().find((tag) => onHead.has(tag)) ?? null;
}

function latestVersionTag(): string | null {
  return stableTags()[0] ?? null;
}

function commitsBetween(from: string | null, to: string): Commit[] {
  const range = from ? `${from}..${to}` : to;
  // `--no-merges` asks git for the topology; a merge commit's subject can be
  // edited to anything.
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

/**
 * Long enough for a slow answer, short enough that nobody waits on a release.
 *
 * decisions/357-release-domains.md
 */
const LABEL_LOOKUP_TIMEOUT_MS = 5000;

/**
 * The first non-empty of the two token variables: `GH_TOKEN=""` must not
 * shadow a good `GITHUB_TOKEN`.
 *
 * decisions/361-release-domains-on-the-pr.md
 */
function githubToken(): string | undefined {
  return [process.env.GH_TOKEN, process.env.GITHUB_TOKEN].find(
    (candidate) => candidate !== undefined && candidate !== ""
  );
}

/**
 * Every label name on the repository, following pages until one comes up
 * short. Authenticated, like the issue lookups.
 *
 * decisions/361-release-domains-on-the-pr.md
 */
async function repositoryLabels(token: string | undefined): Promise<Set<string> | null> {
  const names = new Set<string>();

  for (let page = 1; ; page++) {
    const response = await fetch(`${API}/labels?per_page=100&page=${page}`, {
      signal: AbortSignal.timeout(LABEL_LOOKUP_TIMEOUT_MS),
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      },
    });
    if (!response.ok) {
      err(`GitHub answered ${response.status} for the label list; no labels are printed.`);
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      err("The label list was not an array; no labels are printed.");
      return null;
    }
    for (const label of payload) {
      const name = (label as { name?: unknown }).name;
      if (typeof name === "string") names.add(name);
    }
    // A short page is the last page. No cap: a repository cannot have so many
    // labels that this matters, and a cap is how a real label gets called a gap.
    if (payload.length < 100) return names;
  }
}

/**
 * The subset that exists as a label on the repository. A domain with no label
 * is reported on stderr.
 *
 * decisions/361-release-domains-on-the-pr.md
 */
async function labelsThatExist(domains: string[], token: string | undefined): Promise<string[]> {
  if (domains.length === 0) return [];

  try {
    const known = await repositoryLabels(token);
    // A failed lookup is not the same as "this release touches nothing", and a
    // caller that cannot tell them apart will apply no labels and call it done.
    if (known === null) throw new Error("the repository's labels could not be read");

    for (const domain of domains) {
      if (!known.has(domain)) err(`No label named ${domain}; it is in the notes but not applied.`);
    }
    return domains.filter((domain) => known.has(domain));
  } catch (error) {
    err(`Could not read the repository's labels: ${String(error)}`);
    throw error;
  }
}

/**
 * The domain labels on every issue this release's commits reference. It throws
 * on failure, so "touches nothing" and "could not be read" stay apart.
 *
 * decisions/357-release-domains.md
 * decisions/361-release-domains-on-the-pr.md
 */
async function domainsForRelease(decision: ReturnType<typeof decideVersion>): Promise<string[]> {
  const refs = issueRefsIn(decision);
  // Nothing to look up, so nothing to fail at: a release whose commits name no
  // issue genuinely touches no resolvable domain.
  if (refs.length === 0) return [];

  // A missing token is a failure, not an empty answer.
  const token = githubToken();
  if (token === undefined) {
    // Reported before it is thrown, like every other failure in here. The
    // caller only sees an exit code, so a diagnostic nobody printed is a
    // release that stopped for no stated reason.
    const message = `GH_TOKEN or GITHUB_TOKEN is required to resolve the domains of ${refs.length} referenced issues`;
    err(message);
    throw new Error(message);
  }

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
        // A 404 is one reference that is deleted or not ours, and is skipped. Anything
        // else is the lookup failing. A pull request answers 200 here, and
        // `labelsOfIssueResponse` excludes it.
        if (response.status === 404) return [];
        if (!response.ok) throw new Error(`GitHub answered ${response.status} for issue ${ref}`);
        return labelsOfIssueResponse(await response.json());
      })
    );
    return domainsFrom(labels.flat());
  } catch (error) {
    // Thrown on, not swallowed: an empty answer has to mean "this release
    // touches nothing" and nothing else.
    err(`Could not read issue labels: ${String(error)}`);
    throw error;
  }
}

const args = process.argv.slice(2);
const printMode = args.find((a) => a.startsWith("--print="))?.split("=")[1] ?? "report";
const sinceLastTag = args.includes("--since-last-tag");
const positional = args.filter((a) => !a.startsWith("--"));

// Under --since-last-tag a rerun may find HEAD already tagged. Skipping a tag
// that is on HEAD reproduces the original range, and so the same version.
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
// version comes off the commit, and FIRST_RELEASE_VERSION is not read at all.
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
  // The whole decision is replaced, not just the number. `isFirstRelease`
  // stays as computed: a rerun of the first release is still a first release.
  decision = {
    ...decision,
    next: alreadyTagged,
    reasons: [`HEAD is already tagged ${alreadyTagged}: reusing it rather than deriving a version`],
  };
}

// One chain, and no `process.exit`, which does not wait for a backpressured
// stdout to flush. The branches are exclusive.
if (printMode === "version") {
  out(decision.next);
} else if (printMode === "json") {
  // Version, notes and domains from one resolution, for `release-pr.ts`. It
  // fails where `--print=notes` cannot: the caller applies labels.
  domainsForRelease(decision)
    .then((resolved) => labelsThatExist(resolved, githubToken()))
    .then((domains) => {
      out(
        JSON.stringify({
          version: decision.next,
          notes: formatReleaseNotes(decision),
          domains,
        })
      );
    })
    .catch(() => {
      process.exitCode = 1;
    });
} else if (printMode === "notes") {
  // No network at all: the pull request's labels name the domains, so nothing
  // here can fail and a release is always cuttable.
  out(formatReleaseNotes(decision));
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
