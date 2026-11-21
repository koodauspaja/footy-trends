import { homedir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import { commandWords, type SimpleCommand, simpleCommands } from "./shell-command";

/**
 * The rules Claude Code's Bash commands are held to before they run: what a
 * command asks for, and what each refusal says. Pure: `claude-bash-guard-steps.ts`
 * reads git, the body file and the issues.
 *
 * decisions/806-push-and-pr-hooks.md
 */

/**
 * Where a pull request's body comes from, as far as the command line says.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export type BodySource =
  | { kind: "text"; text: string }
  | { kind: "file"; path: string }
  | { kind: "unreadable"; reason: string };

export type PullRequestCreate = {
  cwd: string | null;
  body: BodySource;
  /** The branch `--head` names, or `null` for the checkout's own. */
  head: string | null;
};

/**
 * What a command line asks for that a rule covers.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export type Requests = {
  /** A `git add` that stages everything in the checkout. */
  addsEverything: boolean;
  pullRequests: PullRequestCreate[];
};

/**
 * Git's options that take a value as the next word, before the subcommand.
 *
 * decisions/806-push-and-pr-hooks.md
 */
const GIT_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);

/**
 * The subcommand of a `git …` command and the words after it, past git's own
 * options. `null` when the command is not git.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function gitSubcommand(words: readonly string[]): { name: string; args: string[] } | null {
  const command = commandWords(words);
  if (command[0] !== "git") return null;

  let at = 1;
  while (at < command.length && (command[at] as string).startsWith("-")) {
    at += GIT_OPTIONS_WITH_VALUE.has(command[at] as string) ? 2 : 1;
  }
  const name = command[at];
  return name === undefined ? null : { name, args: command.slice(at + 1) };
}

/**
 * Paths that name the whole checkout: from its top, as `.` is when the session
 * stands there, or from anywhere, as `:/` is. `*` is expanded by the shell
 * into everything but dotfiles.
 *
 * decisions/806-push-and-pr-hooks.md
 */
const WHOLE_CHECKOUT = new Set([".", "./", "*", "./*", ":/", ":/."]);

/**
 * Whether `git add`'s arguments stage the whole checkout: `-A`, `--all`, or
 * a `WHOLE_CHECKOUT` path. `-A` counts inside a cluster such as `-vA`, and only before
 * `--`, after which a word is a path.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function stagesEverything(words: readonly string[]): boolean {
  const git = gitSubcommand(words);
  if (git?.name !== "add") return false;

  const separator = git.args.indexOf("--");
  const options = separator === -1 ? git.args : git.args.slice(0, separator);
  const paths = separator === -1 ? git.args : git.args.slice(separator + 1);

  const all = options.some((word) => word === "--all" || /^-[^-]*A/.test(word));
  return all || paths.some((word) => WHOLE_CHECKOUT.has(word));
}

/**
 * `gh pr create`'s options that say where its body comes from, by what they
 * take.
 *
 * decisions/806-push-and-pr-hooks.md
 */
const BODY_TEXT = new Set(["--body", "-b"]);
const BODY_FILE = new Set(["--body-file", "-F"]);
const BODY_ELSEWHERE = new Set([
  "--fill",
  "--fill-first",
  "--fill-verbose",
  "-f",
  "--web",
  "-w",
  "--editor",
  "-e",
  "--template",
  "-T",
]);

/**
 * A `--name value` or `--name=value` option's value at `at`, and how many
 * words it took.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function optionAt(
  args: readonly string[],
  at: number
): { name: string; value: string | undefined; width: number } {
  const word = args[at] as string;
  const equals = word.indexOf("=");
  if (word.startsWith("--") && equals !== -1) {
    return { name: word.slice(0, equals), value: word.slice(equals + 1), width: 1 };
  }
  // `-Hbranch`: a short option with its value attached.
  if (/^-[A-Za-z]./.test(word)) return { name: word.slice(0, 2), value: word.slice(2), width: 1 };
  return { name: word, value: args[at + 1], width: 2 };
}

/**
 * A body given as text, unless the shell builds it when the command runs: a
 * substitution, or a variable such as `$BODY`.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function textSource(text: string): BodySource {
  return /\$[\w{(@*#?!$-]|`/.test(text)
    ? { kind: "unreadable", reason: "the body is built by the shell when the command runs" }
    : { kind: "text", text };
}

/**
 * Where a `gh pr create` command's body comes from. Only a body this hook can
 * read is `text` or `file`: one built by the shell, read from stdin, or left to
 * `gh` to fill is `unreadable`. A repeated option counts as gh counts it: the
 * last one given.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function bodySource(args: readonly string[], cwd: string | null): BodySource {
  let found: BodySource = { kind: "unreadable", reason: "the command gives no body" };
  for (let at = 0; at < args.length; at++) {
    const word = args[at] as string;
    if (BODY_ELSEWHERE.has(word)) {
      return { kind: "unreadable", reason: `\`${word}\` leaves the body to gh` };
    }
    const option = optionAt(args, at);
    if (option.value === undefined) continue;
    if (BODY_TEXT.has(option.name)) found = textSource(option.value);
    if (BODY_FILE.has(option.name)) found = fileSource(option.value, cwd);
  }
  return found;
}

/**
 * The branch a `gh pr create` names with `--head` or `-H`, without the
 * `owner:` gh accepts in front of it; `null` when it names none.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function headBranch(args: readonly string[]): string | null {
  let head: string | null = null;
  for (let at = 0; at < args.length; at++) {
    const { name, value } = optionAt(args, at);
    if ((name === "--head" || name === "-H") && value !== undefined) {
      head = value.replace(/^[^:]*:/, "");
    }
  }
  return head;
}

function fileSource(path: string, cwd: string | null): BodySource {
  if (path === "-") return { kind: "unreadable", reason: "the body is read from stdin" };
  if (/[$`]/.test(path)) {
    return { kind: "unreadable", reason: "the body file's path is built by the shell" };
  }
  const resolved = resolvePath(path, cwd);
  return resolved === null
    ? {
        kind: "unreadable",
        reason: "the body file is relative to a directory this hook cannot follow",
      }
    : { kind: "file", path: resolved };
}

function resolvePath(path: string, cwd: string | null): string | null {
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  if (isAbsolute(path)) return normalize(path);
  return cwd === null ? null : join(cwd, path);
}

/**
 * A body file that a redirection in the same line writes, up to and including
 * the `gh pr create` itself, is unreadable: the hook runs before the line does,
 * so it would read the file as it was.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function writtenEarlier(body: BodySource, earlier: readonly SimpleCommand[]): BodySource {
  if (body.kind !== "file") return body;
  // A target the shell builds, such as `"$F"`, may be this file.
  const written = earlier.some(({ redirects, cwd }) =>
    redirects.some((target) => /[$`]/.test(target) || resolvePath(target, cwd) === body.path)
  );
  return written
    ? {
        kind: "unreadable",
        reason: `${body.path} is written by the same command line, after this hook has run`,
      }
    : body;
}

/**
 * A `gh` command without the `-R`/`--repo` option gh accepts before `pr` and
 * between `pr` and `create`. Only those words are read: after `create` come
 * values, such as a title, that may look like an option.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function withoutRepository(words: readonly string[]): string[] {
  const kept: string[] = [];
  let at = 0;
  for (; at < words.length && kept.length < 3; at++) {
    const { name, width } = optionAt(words, at);
    if (name === "-R" || name === "--repo") {
      at += width - 1;
    } else {
      kept.push(words[at] as string);
    }
  }
  return [...kept, ...words.slice(at)];
}

function pullRequestCreate(
  command: SimpleCommand,
  earlier: readonly SimpleCommand[]
): PullRequestCreate | null {
  const words = withoutRepository(commandWords(command.words));
  const isCreate =
    words[0] === "gh" && words[1] === "pr" && (words[2] === "create" || words[2] === "new");
  if (!isCreate) return null;
  const args = words.slice(3);
  return {
    cwd: command.cwd,
    body: writtenEarlier(bodySource(args, command.cwd), earlier),
    head: headBranch(args),
  };
}

/**
 * What a Bash command line, run from `cwd`, asks for that a rule covers.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function requestsIn(command: string, cwd: string): Requests {
  const commands = simpleCommands(command, cwd);
  return {
    addsEverything: commands.some((simple) => stagesEverything(simple.words)),
    pullRequests: commands.flatMap(
      (simple, index) => pullRequestCreate(simple, commands.slice(0, index + 1)) ?? []
    ),
  };
}

/**
 * Whether the pushed head is the local one, and if not, what is wrong.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export type HeadState = { head: string | null; upstream: string | null; branch: string | null };

export function headRefusal({ head, upstream, branch }: HeadState): string | null {
  const name = branch ?? "this checkout";
  if (head === null) {
    return `Refused: \`gh pr create\` on ${name}, whose local commit git cannot read. Run it from the branch's own checkout.`;
  }
  if (upstream === null) {
    return [
      `Refused: \`gh pr create\` on ${name}, which has no upstream, so nothing says its commits are pushed.`,
      `Push first, in a command of its own: git push -u origin ${branch ?? "<branch>"}`,
    ].join("\n");
  }
  if (upstream !== head) {
    return [
      `Refused: \`gh pr create\` on ${name}, whose local HEAD ${head.slice(0, 7)} is not the pushed head ${upstream.slice(0, 7)}.`,
      "Sourcery reviews what is pushed, so a pull request opened now is reviewed on the wrong commit.",
      "Push first, in a command of its own, then open the pull request. A `git push && gh pr create`",
      "is refused too: the hook runs before the push does.",
    ].join("\n");
  }
  return null;
}

/**
 * What a `git add` of the whole checkout is refused with.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export const ADD_EVERYTHING_REFUSAL = [
  "Refused: `git add -A`, `git add --all` and `git add .` stage every change in the checkout,",
  "which has twice put the next feature's spec into the pull request being built.",
  "Stage the paths by name: git add <path> <path> …",
].join("\n");

/**
 * What a body the hook cannot read is refused with.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function unreadableBodyRefusal(reason: string): string {
  return [
    `Refused: \`gh pr create\` whose body this hook cannot read: ${reason}.`,
    "The boxes of the issues it closes are checked before it opens. Write the body to a file",
    "and pass it with --body-file <path>.",
  ].join("\n");
}

/**
 * What an issue that could not be read is refused with: an unread issue is
 * not a pass.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function unreadIssueRefusal(issue: number, problem: string): string {
  return `Refused: \`gh pr create\` closes #${issue}, whose boxes could not be read: ${problem}.`;
}

/**
 * The heading over the issue-boxes check's own report.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export const BARE_BOXES_HEADING =
  "Refused: `gh pr create` closes an issue with a box neither ticked nor explained.";
