import { basename, isAbsolute, join, normalize } from "node:path";

/**
 * A Bash command line split the way the shell would split it: into the simple
 * commands it runs, each with its words unquoted and the directory a `cd`
 * before it left. Enough to recognise a command; not a shell.
 *
 * decisions/806-push-and-pr-hooks.md
 */

export type SimpleCommand = {
  words: string[];
  /** Where it runs, or `null` after a `cd` this cannot follow. */
  cwd: string | null;
  /** The files its output redirections name, as written: what it may write. */
  redirects: string[];
};

type Token =
  | { kind: "word"; value: string }
  /** `scope` marks a subshell's `(` and `)`, whose `cd` does not outlive it. */
  | { kind: "separator"; scope?: "open" | "close" }
  /** `>`, `2>&1`, `<`: the word after one is its target, not an argument. */
  | { kind: "redirect"; writes: boolean };

type Heredoc = { delimiter: string; stripTabs: boolean };

type Scan = {
  text: string;
  at: number;
  tokens: Token[];
  /** The word being read, or `null` between words. */
  word: string | null;
  /** Heredocs opened on this line, whose bodies start after it. */
  heredocs: Heredoc[];
};

/**
 * Two-character operators first, so `&&` is not read as two `&`.
 *
 * decisions/806-push-and-pr-hooks.md
 */
const SEPARATORS = ["&&", "||", ";;", ";", "|", "&", "(", ")"];

function endWord(scan: Scan): void {
  if (scan.word === null) return;
  scan.tokens.push({ kind: "word", value: scan.word });
  scan.word = null;
}

function append(scan: Scan, text: string): void {
  scan.word = (scan.word ?? "") + text;
}

/**
 * A `'…'` string: everything up to the next `'`, literally.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function readSingleQuoted(scan: Scan): void {
  const close = scan.text.indexOf("'", scan.at + 1);
  const end = close === -1 ? scan.text.length : close;
  append(scan, scan.text.slice(scan.at + 1, end));
  scan.at = end + 1;
}

/**
 * A `"…"` string. A backslash escapes only what Bash lets it escape inside
 * double quotes, and a substitution inside is kept as written.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function readDoubleQuoted(scan: Scan): void {
  let value = "";
  let at = scan.at + 1;
  while (at < scan.text.length && scan.text[at] !== '"') {
    const char = scan.text[at] as string;
    const next = scan.text[at + 1];
    if (char === "\\" && next !== undefined && '"\\$`'.includes(next)) {
      value += next;
      at += 2;
    } else if (char === "$" && next === "(") {
      const end = substitutionEnd(scan.text, at);
      value += scan.text.slice(at, end);
      at = end;
    } else {
      value += char;
      at += 1;
    }
  }
  append(scan, value);
  scan.at = at + 1;
}

/**
 * Where a `$(…)` that starts at `start` ends: after its matching `)`, by
 * counting parentheses alone. Quotes are not followed, because the usual body
 * is a heredoc of prose, where an apostrophe opens nothing.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function substitutionEnd(text: string, start: number): number {
  let depth = 0;
  let at = start + 1;
  while (at < text.length) {
    const char = text[at];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    at += 1;
    if (depth === 0) return at;
  }
  return text.length;
}

/**
 * The delimiter of a heredoc whose `<<` starts at `scan.at`, read as a word,
 * quotes removed. The body is skipped when this line ends.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function openHeredoc(scan: Scan): void {
  endWord(scan);
  scan.at += 2;
  const stripTabs = scan.text[scan.at] === "-";
  if (stripTabs) scan.at += 1;
  while (scan.text[scan.at] === " " || scan.text[scan.at] === "\t") scan.at += 1;

  // Always matches: at worst an empty delimiter, which ends at a blank line.
  // A backslash before it quotes it, as `<<\EOF` does, and is not part of it.
  const match = /^\\?(['"]?)([^\s'";&|<>()\\]*)\1/.exec(
    scan.text.slice(scan.at)
  ) as RegExpExecArray;
  scan.at += match[0].length;
  scan.heredocs.push({ delimiter: String(match[2]), stripTabs });
}

/**
 * Past the bodies of the heredocs opened on the line that just ended: each
 * runs to a line that is its delimiter alone.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function skipHeredocBodies(scan: Scan): void {
  for (const { delimiter, stripTabs } of scan.heredocs) {
    while (scan.at < scan.text.length) {
      const newline = scan.text.indexOf("\n", scan.at);
      const end = newline === -1 ? scan.text.length : newline;
      const line = scan.text.slice(scan.at, end);
      scan.at = end + 1;
      if ((stripTabs ? line.replace(/^\t+/, "") : line) === delimiter) break;
    }
  }
  scan.heredocs = [];
}

/**
 * A redirection: `>`, `>>`, `2>&1`, `&>`, `<`, `<<<`. A word of digits just
 * before it is its file descriptor, not an argument.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function readRedirect(scan: Scan): void {
  if (scan.word !== null && /^\d+$/.test(scan.word)) scan.word = null;
  endWord(scan);
  // Always matches: this is called only where a redirection starts.
  const operator = /^(&>>?|<<<|[<>]&|>>|>\||[<>])/.exec(
    scan.text.slice(scan.at)
  ) as RegExpExecArray;
  scan.at += operator[0].length;
  // `<` and `<<<` only read; `<&` duplicates a descriptor; anything with `>` writes.
  scan.tokens.push({ kind: "redirect", writes: operator[0].includes(">") });
}

/**
 * Which separators open and close a subshell.
 *
 * decisions/806-push-and-pr-hooks.md
 */
const SCOPES: Record<string, "open" | "close"> = { "(": "open", ")": "close" };

function readSeparator(scan: Scan, separator: string): void {
  endWord(scan);
  scan.at += separator.length;
  const scope = SCOPES[separator];
  scan.tokens.push(scope === undefined ? { kind: "separator" } : { kind: "separator", scope });
}

function readNewline(scan: Scan): void {
  endWord(scan);
  scan.at += 1;
  scan.tokens.push({ kind: "separator" });
  skipHeredocBodies(scan);
}

function skipComment(scan: Scan): void {
  const newline = scan.text.indexOf("\n", scan.at);
  scan.at = newline === -1 ? scan.text.length : newline;
}

function readBlank(scan: Scan): void {
  endWord(scan);
  scan.at += 1;
}

/**
 * A backslash before a newline joins the lines; before anything else it makes
 * that character literal.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function readEscape(scan: Scan): void {
  const next = scan.text[scan.at + 1];
  if (next !== "\n") append(scan, next ?? "");
  scan.at += 2;
}

/**
 * A `$(…)` or `` `…` ``, kept in the word as written: what it prints is not
 * known until the shell runs it.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function readSubstitution(scan: Scan): void {
  const end =
    scan.text[scan.at] === "`"
      ? scan.text.indexOf("`", scan.at + 1) + 1
      : substitutionEnd(scan.text, scan.at);
  const stop = end <= scan.at ? scan.text.length : end;
  append(scan, scan.text.slice(scan.at, stop));
  scan.at = stop;
}

function readOrdinary(scan: Scan): void {
  append(scan, scan.text[scan.at] as string);
  scan.at += 1;
}

/**
 * What to do with whatever starts a scan's remaining text, tried in order.
 *
 * decisions/806-push-and-pr-hooks.md
 */
const READERS: readonly [(rest: string, scan: Scan) => boolean, (scan: Scan) => void][] = [
  [(rest) => rest.startsWith("\n"), readNewline],
  [(rest) => rest.startsWith(" ") || rest.startsWith("\t"), readBlank],
  [(rest, scan) => rest.startsWith("#") && scan.word === null, skipComment],
  [(rest) => rest.startsWith("'"), readSingleQuoted],
  [(rest) => rest.startsWith('"'), readDoubleQuoted],
  [(rest) => rest.startsWith("\\"), readEscape],
  [(rest) => rest.startsWith("$(") || rest.startsWith("`"), readSubstitution],
  [(rest) => rest.startsWith("<<") && !rest.startsWith("<<<"), openHeredoc],
  [(rest) => /^(&>|[<>])/.test(rest), readRedirect],
];

/**
 * One step of the scan: whatever starts at `scan.at`, consumed.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function step(scan: Scan): void {
  const rest = scan.text.slice(scan.at);
  const reader = READERS.find(([matches]) => matches(rest, scan));
  const separator = SEPARATORS.find((candidate) => rest.startsWith(candidate));
  if (reader !== undefined) {
    reader[1](scan);
  } else if (separator !== undefined) {
    readSeparator(scan, separator);
  } else {
    readOrdinary(scan);
  }
}

function tokenize(text: string): Token[] {
  const scan: Scan = { text, at: 0, tokens: [], word: null, heredocs: [] };
  while (scan.at < text.length) step(scan);
  endWord(scan);
  return scan.tokens;
}

/**
 * The directory after `cd <target>` from `cwd`. `null` for what this cannot
 * follow: no target, `-`, `~`, or a variable.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function changeDirectory(cwd: string | null, target: string | undefined): string | null {
  if (target === undefined || target === "-" || /(^~)|\$/.test(target)) return null;
  if (isAbsolute(target)) return normalize(target);
  return cwd === null ? null : join(cwd, target);
}

/**
 * The directory after one simple command: `cd` and `pushd` move it, and
 * `popd`, whose stack this does not keep, loses it.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function directoryAfter(cwd: string | null, words: readonly string[]): string | null {
  const [name, ...args] = commandWords(words);
  // `cd -- dir` and `cd -P dir`: the options are not the directory.
  const target = args.find((arg) => arg === "-" || !arg.startsWith("-"));
  if (name === "cd" || name === "pushd") return changeDirectory(cwd, target);
  return name === "popd" ? null : cwd;
}

type Grouping = {
  commands: SimpleCommand[];
  words: string[];
  redirects: string[];
  /** Whether the next word is a redirection's target, and if so whether it is written. */
  target: "none" | "read" | "write";
  directory: string | null;
  /** The directory each open subshell started in, restored when it closes. */
  outer: (string | null)[];
};

function finish(grouping: Grouping): void {
  if (grouping.words.length > 0) {
    const { words, redirects, directory } = grouping;
    grouping.commands.push({ words, cwd: directory, redirects });
    grouping.directory = directoryAfter(directory, words);
  }
  grouping.words = [];
  grouping.redirects = [];
  grouping.target = "none";
}

function group(grouping: Grouping, token: Token): void {
  if (token.kind === "separator") {
    finish(grouping);
    if (token.scope === "open") grouping.outer.push(grouping.directory);
    if (token.scope === "close" && grouping.outer.length > 0) {
      grouping.directory = grouping.outer.pop() as string | null;
    }
  } else if (token.kind === "redirect") {
    grouping.target = token.writes ? "write" : "read";
  } else if (grouping.target !== "none") {
    if (grouping.target === "write") grouping.redirects.push(token.value);
    grouping.target = "none";
  } else {
    grouping.words.push(token.value);
  }
}

/**
 * The simple commands `command` runs, in order, from `cwd`. A redirection's
 * target is kept apart from the words, and a heredoc's body is not read as
 * commands.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function simpleCommands(command: string, cwd: string | null): SimpleCommand[] {
  const grouping: Grouping = {
    commands: [],
    words: [],
    redirects: [],
    target: "none",
    directory: cwd,
    outer: [],
  };
  for (const token of tokenize(command)) group(grouping, token);
  finish(grouping);
  return grouping.commands;
}

/**
 * Words that run the command after them: shell keywords, and the wrappers
 * `env`, `command`, `exec`, `time` and `nohup`.
 *
 * decisions/806-push-and-pr-hooks.md
 */
const PREFIXES = new Set([
  "if",
  "then",
  "elif",
  "else",
  "do",
  "while",
  "until",
  "!",
  "{",
  "env",
  "command",
  "exec",
  "time",
  "nohup",
]);

/**
 * `env`'s options that take the next word as their value.
 *
 * decisions/806-push-and-pr-hooks.md
 */
const ENV_OPTIONS_WITH_VALUE = new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]);

/**
 * How many words to skip at `at`: an assignment, a prefix, or an option of an
 * `env` or `time` already passed. Zero at the command's own name.
 *
 * decisions/806-push-and-pr-hooks.md
 */
function skipAt(words: readonly string[], at: number, wrapper: string | null): number {
  const word = words[at] as string;
  if (/^[A-Za-z_]\w*=/.test(word) || PREFIXES.has(word)) return 1;
  if (wrapper === null || !word.startsWith("-")) return 0;
  return wrapper === "env" && ENV_OPTIONS_WITH_VALUE.has(word) ? 2 : 1;
}

/**
 * The words that name the command and its arguments: past leading `NAME=value`
 * assignments, `PREFIXES` and `env`'s and `time`'s options, with the command named without
 * its directory, so `/usr/bin/git` is `git`.
 *
 * decisions/806-push-and-pr-hooks.md
 */
export function commandWords(words: readonly string[]): string[] {
  let at = 0;
  // The last wrapper passed whose options come before the command: `env -i`, `time -p`.
  let wrapper: string | null = null;
  while (at < words.length) {
    const skip = skipAt(words, at, wrapper);
    if (skip === 0) break;
    if (words[at] === "env" || words[at] === "time") wrapper = words[at] as string;
    at += skip;
  }
  if (at >= words.length) return [];
  return [basename(words[at] as string), ...words.slice(at + 1)];
}
