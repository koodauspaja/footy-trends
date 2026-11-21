import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { executablePath } from "../shared/executable";
import { type Console, processConsole } from "../shared/github-read";
import { type Offender, processPhrase, refusal, subjectOf } from "./commit-subject-plan";

/**
 * `npm run check:commits`: one message for the commit-msg hook (`--message`), and
 * for CI the pull request's title (`--subject`) and every commit in a
 * `<base>..<head>` range. Reading is injected.
 *
 * decisions/841-commit-subject-gate.md
 */

export type Deps = {
  /** A file's contents. Throws when it cannot be read. */
  readFile: (path: string) => string;
  /** git's stdout, or `null` when it fails. */
  git: (args: readonly string[]) => string | null;
};

const USAGE =
  "Usage: npm run check:commits -- --message <file> | --subject <text> | <base>..<head>";

function verdict(offenders: readonly Offender[], console: Console): number {
  if (offenders.length === 0) return 0;
  console.err(refusal(offenders));
  return 1;
}

/**
 * One subject given as text: a pull request's title, which a squash merge
 * makes the subject of the commit that lands on `main`. Not a git message, so a
 * leading `#` is part of it.
 *
 * decisions/841-commit-subject-gate.md
 */
function checkSubject(text: string, console: Console): number {
  const subject = text.trim();
  const phrase = processPhrase(subject);
  return verdict(phrase === null ? [] : [{ commit: null, subject, phrase }], console);
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
      // The subject runs from the first tab on: it may hold tabs of its own.
      const tab = line.indexOf("\t");
      const commit = line.slice(0, tab);
      const subject = line.slice(tab + 1);
      const phrase = processPhrase(subject);
      return phrase === null ? [] : [{ commit, subject, phrase }];
    });
  return verdict(offenders, console);
}

/**
 * Whether an argument is a `<base>..<head>` range: two non-empty parts, no
 * blank in either.
 *
 * decisions/841-commit-subject-gate.md
 */
function isRange(argument: string): boolean {
  const parts = argument.split("..");
  return parts.length === 2 && parts.every((part) => part !== "" && !/\s/.test(part));
}

/**
 * The command: arguments in, exit code out.
 *
 * decisions/841-commit-subject-gate.md
 */
export function runCheck(argv: readonly string[], deps: Deps, console: Console): number {
  const [first, second] = argv.slice(2);
  if (first === "--message" && second !== undefined) return checkMessage(second, deps, console);
  if (first === "--subject" && second !== undefined) return checkSubject(second, console);
  if (first !== undefined && isRange(first)) return checkRange(first, deps, console);
  console.err(USAGE);
  return 1;
}

export const defaultDeps: Deps = {
  readFile: (path) => readFileSync(path, "utf8"),
  git: (args) => {
    const binary = executablePath("git");
    if (binary === null) return null;
    const result = spawnSync(binary, [...args], {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    });
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
