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
import { INITIAL_STATUS, pullNumberFrom, selectStatusOption } from "./release-pr-plan";

const PROJECT_NUMBER = "2";
const PROJECT_OWNER = "koodauspaja";

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
  return execFileSync(process.execPath, [tsx, "scripts/release-version.ts", mode], {
    encoding: "utf8",
  }).trim();
}

function main(): void {
  const version = release("--print=version");
  const notes = release("--print=notes");
  /**
   * Before the pull request exists, deliberately. `--print=domains` exits
   * non-zero when the lookup failed as opposed to finding nothing, so a release
   * is never opened and then labelled with silence.
   */
  const domains = release("--print=domains").split("\n").filter(Boolean);

  out(`Version   ${version}`);
  out(`Domains   ${domains.length === 0 ? "(none)" : domains.join(", ")}`);

  if (dryRun) {
    out("\nDry run: no pull request opened, nothing labelled.\n");
    out(notes);
    return;
  }

  const url = gh(
    [
      "pr",
      "create",
      "--base",
      "release",
      "--head",
      "main",
      "--title",
      `release: ${version}`,
      "--body-file",
      "-",
    ],
    notes
  );
  out(`Opened    ${url}`);

  const number = pullNumberFrom(url);
  if (number === null) throw new Error(`gh answered with no pull request number: ${url}`);

  // One request per label. `gh` exits non-zero on failure, `execFileSync`
  // throws, and nothing below runs — which is the whole reason this is not a
  // shell loop that carries on regardless.
  for (const domain of domains) {
    gh([
      "api",
      `repos/:owner/:repo/issues/${number}/labels`,
      "-X",
      "POST",
      "-f",
      `labels[]=${domain}`,
    ]);
    out(`Labelled  ${domain}`);
  }

  const item = gh([
    "project",
    "item-add",
    PROJECT_NUMBER,
    "--owner",
    PROJECT_OWNER,
    "--url",
    url,
    "--format",
    "json",
    "-q",
    ".id",
  ]);

  /**
   * The status ids are read, never remembered. A wrong one fails with "does not
   * belong to the field", and a command whose stderr is hidden leaves the card
   * where it was while appearing to work — which is exactly what happened to
   * several cards while this feature was being built.
   */
  // Read, never remembered — see `selectStatusOption`.
  const status = selectStatusOption(
    JSON.parse(
      gh(["project", "field-list", PROJECT_NUMBER, "--owner", PROJECT_OWNER, "--format", "json"])
    )
  );
  if (status === null) throw new Error(`The board has no Status option named ${INITIAL_STATUS}`);

  const projectId = gh([
    "project",
    "view",
    PROJECT_NUMBER,
    "--owner",
    PROJECT_OWNER,
    "--format",
    "json",
    "-q",
    ".id",
  ]);

  gh([
    "project",
    "item-edit",
    "--id",
    item,
    "--project-id",
    projectId,
    "--field-id",
    status.fieldId,
    "--single-select-option-id",
    status.optionId,
  ]);
  out(`Board     ${INITIAL_STATUS} (reaches Done on its own when the pull request merges)`);
}

main();
