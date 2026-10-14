/**
 * Opens the release pull request: notes, domain labels, and the board card.
 * `GH_TOKEN=$(gh auth token) npm run release:pr`, with `-- --dry-run` to
 * create nothing.
 *
 * decisions/361-release-domains-on-the-pr.md
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { executablePath, overrideNameFor } from "./executable";
import {
  gh as argv,
  INITIAL_STATUS,
  parseReleasePlan,
  pullNumberFrom,
  selectStatusOption,
} from "./release-pr-plan";

const dryRun = process.argv.includes("--dry-run");

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Runs `gh`. Nothing here is resolved through `PATH`, as with the `git` in
 * `release-version.ts`.
 *
 * decisions/361-release-domains-on-the-pr.md
 */
function gh(args: string[], input?: string): string {
  const binary = executablePath("gh");
  if (binary === null) {
    throw new Error(
      `gh not found. Set ${overrideNameFor("gh")} to its absolute path if it is installed somewhere unusual.`
    );
  }
  return execFileSync(binary, args, {
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
  }).trim();
}

/**
 * `release-version.ts`, run through the very Node and the very `tsx` already
 * running this, both absolute. Spawned, not imported: importing a script
 * would run it.
 *
 * decisions/361-release-domains-on-the-pr.md
 */
function release(mode: string): string {
  const tsx = createRequire(`${process.cwd()}/`).resolve("tsx/cli");
  try {
    return execFileSync(process.execPath, [tsx, "scripts/release-version.ts", mode], {
      encoding: "utf8",
    }).trim();
  } catch {
    // A short message, because the child already wrote the real one.
    throw new Error(`release-version.ts ${mode} failed — see the message above`);
  }
}

function main(): void {
  // One call, before the pull request exists: the notes and the labels must
  // describe the same release, and a failed label lookup must open nothing.
  const plan = parseReleasePlan(release("--print=json"));
  if (plan === null) throw new Error("release-version.ts did not answer a usable release plan");
  const { version, notes, domains } = plan;

  // The board is read before anything is created, so everything that can fail on
  // configuration fails while the only cost is running the command again.
  const fields = JSON.parse(gh(argv.listFields()));
  const status = selectStatusOption(fields);
  if (status === null) throw new Error(`The board has no Status option named ${INITIAL_STATUS}`);
  const projectId = gh(argv.projectId());

  out(`Version   ${version}`);
  out(`Domains   ${domains.length === 0 ? "(none)" : domains.join(", ")}`);

  if (dryRun) {
    // The board has already been read by this point, so a dry run is also the
    // check that the release can be filed — without creating anything.
    out(`\nDry run: no pull request opened, nothing labelled. Board would be ${INITIAL_STATUS}.\n`);
    out(notes);
    return;
  }

  const url = gh(argv.createPullRequest(version), notes);
  out(`Opened    ${url}`);

  const number = pullNumberFrom(url);
  if (number === null) throw new Error(`gh answered with no pull request number: ${url}`);

  // One request per label. `gh` exits non-zero on failure, `execFileSync`
  // throws, and nothing below runs — which is the whole reason this is not a
  // shell loop that carries on regardless.
  for (const domain of domains) {
    gh(argv.addLabel(number, domain));
    out(`Labelled  ${domain}`);
  }

  const item = gh(argv.addToProject(url));
  gh(argv.setStatus(item, projectId, status));
  out(`Board     ${INITIAL_STATUS} (reaches Done on its own when the pull request merges)`);
}

// The failure the operator sees is the reason, not a Node stack.
try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
