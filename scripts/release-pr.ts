/**
 * Opens the release pull request: notes, domain labels, and the board card.
 *
 *   GH_TOKEN=$(gh auth token) npm run release:pr
 *   GH_TOKEN=$(gh auth token) npm run release:pr -- --dry-run
 *
 * **Why a script and not a documented shell block.** This was a sequence of
 * commands in `skills/release.md`, and review found a defect in it seven rounds
 * running — an `xargs` that runs on empty input, a `$pr` left empty by a failed
 * create, a status id remembered instead of read, a verification whose exit
 * status nothing consumed. Each fix added more shell, which added more surface.
 * A shell block in a document cannot be tested and so cannot be finished.
 *
 * Everything the release needs to decide is already in `next-version.ts`, which
 * is unit tested. This only carries it out, in one place, with real error
 * handling instead of `set -e` folklore.
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
 * Nothing here is resolved through `PATH` — the same rule as the `git` in
 * `release-version.ts`, and for the same reason: this opens a release, and a
 * release carried out by whichever binary happened to be first in somebody's
 * path is not one to trust.
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
 * running this — both absolute, neither from `PATH`.
 *
 * Spawned rather than imported because that file is a script: importing it
 * would run it, print a report, and set an exit code.
 */
function release(mode: string): string {
  const tsx = createRequire(`${process.cwd()}/`).resolve("tsx/cli");
  try {
    return execFileSync(process.execPath, [tsx, "scripts/release-version.ts", mode], {
      encoding: "utf8",
    }).trim();
  } catch {
    /**
     * A short message, because the child already wrote the real one.
     *
     * `execFileSync` forwards the child's stderr *and* repeats it inside the
     * error it throws, so rethrowing that verbatim printed the reason twice.
     * The diagnostic above this line is the child's; this only says which step
     * stopped.
     */
    throw new Error(`release-version.ts ${mode} failed — see the message above`);
  }
}

function main(): void {
  /**
   * One call, before the pull request exists.
   *
   * One because the notes and the labels must describe the same release: asking
   * separately meant two spawns and two resolutions of the same question. Before,
   * because this exits non-zero when the label lookup failed as opposed to
   * finding nothing — so a release is never opened and then labelled with
   * silence.
   */
  const plan = parseReleasePlan(release("--print=json"));
  if (plan === null) throw new Error("release-version.ts did not answer a usable release plan");
  const { version, notes, domains } = plan;

  /**
   * The board is read before anything is created, and this ordering is the
   * finding rather than an accident of it.
   *
   * Creating the pull request first meant a board whose Status options had been
   * renamed left a release opened, labelled and filed under no status — a
   * half-built release somebody then has to finish by hand. Everything that can
   * fail on configuration now fails while the only cost is running the command
   * again.
   */
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

/**
 * The failure the operator sees is the reason, not a Node stack.
 *
 * Everything below `main` fails by throwing — a missing token, a board with no
 * such column, a `gh` that exited non-zero — and an uncaught throw here printed
 * twelve lines of `node:internal/errors` with the actual cause somewhere above
 * it, if it was forwarded at all.
 */
try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
