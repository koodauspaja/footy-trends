import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { executablePath } from "../shared/executable";
import { type Console, processConsole } from "../shared/github-read";
import { type Offender, processPhrase, refusal, subjectOf } from "./commit-subject-plan";

/**
 * `npm run check:commits`: the commit-msg hook's check of one message, with
 * `--message <file>`, and CI's check of every commit in a `<base>..<head>`
 * range. Reading is injected.
 *
 * decisions/841-commit-subject-gate.md
 */

export type Deps = {
  /** A file's contents. Throws when it cannot be read. */
  readFile: (path: string) => string;
  /** git's stdout, or `null` when it fails. */
  git: (args: readonly string[]) => string | null;
};

const USAGE = "Usage: npm run check:commits -- --message <file> | <base>..<head>";

function verdict(offenders: readonly Offender[], console: Console): number {
  if (offenders.length === 0) return 0;
  console.err(refusal(offenders));
  return 1;
}

/**
 * The subject of the message git is about to commit, from the file the
 * commit-msg hook is given.
 *
 * decisions/841-commit-subject-gate.md
 */
function checkMessage(path: string, deps: Deps, console: Console): number {
  const subject = subjectOf(deps.readFile(path));
  const phrase = processPhrase(subject);
  return verdict(phrase === null ? [] : [{ commit: null, subject, phrase }], console);
}

/**
 * Every commit subject in a range, as a pull request adds them over `main`. A
 * range git cannot read is a failure, not an empty pass.
 *
 * decisions/841-commit-subject-gate.md
 */
function checkRange(range: string, deps: Deps, console: Console): number {
  const log = deps.git(["log", "--format=%H%x09%s", range]);
  if (log === null) {
    console.err(`git could not read the commits in ${range}.`);
    return 1;
  }

  const offenders = log
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [commit = "", subject = ""] = line.split("\t");
      const phrase = processPhrase(subject);
      return phrase === null ? [] : [{ commit, subject, phrase }];
    });
  return verdict(offenders, console);
}

/**
 * The command: arguments in, exit code out.
 *
 * decisions/841-commit-subject-gate.md
 */
export function runCheck(argv: readonly string[], deps: Deps, console: Console): number {
  const [first, second] = argv.slice(2);
  if (first === "--message" && second !== undefined) return checkMessage(second, deps, console);
  if (first !== undefined && /^\S+\.\.\S+$/.test(first)) return checkRange(first, deps, console);
  console.err(USAGE);
  return 1;
}

export const defaultDeps: Deps = {
  readFile: (path) => readFileSync(path, "utf8"),
  git: (args) => {
    const binary = executablePath("git");
    if (binary === null) return null;
    const result = spawnSync(binary, [...args], { encoding: "utf8", timeout: 30_000 });
    return result.status === 0 ? result.stdout : null;
  },
};

/**
 * The exit code `runWhenMain` sets: what makes git commit, or CI pass.
 *
 * decisions/841-commit-subject-gate.md
 */
export function startCheck(): Promise<number> {
  return Promise.resolve(runCheck(process.argv, defaultDeps, processConsole()));
}
