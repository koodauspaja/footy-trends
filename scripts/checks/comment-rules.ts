import { createHash } from "node:crypto";
import ts from "typescript";

/**
 * The rules a comment is held to: what it may cite, how long it may run and how
 * it may sit. A test's name is held to the first of them.
 *
 * decisions/531-comments-say-what-code-is-for.md
 * decisions/584-test-names-carry-no-citations.md
 * decisions/839-mechanical-comment-rules.md
 */

export type Comment = {
  /** 1-based, as an editor shows it. */
  line: number;
  endLine: number;
  text: string;
  doc: boolean;
  /** The file's first doc comment, above its first declaration: what a file header is. */
  header: boolean;
  start: number;
  end: number;
};

export type Finding = { file: string; line: number; text: string };

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs"];

/**
 * An issue or pull request number, this repository's or another's, but not `&#123;`.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
const ISSUE_NUMBER = /(?<![&#])#\d+\b/;
/**
 * A decision record's path, not the tail of another path or word.
 *
 * decisions/839-mechanical-comment-rules.md
 */
const DECISION_PATH = /(?<![\w./-])decisions\/[\w.-]+\.md/g;

/**
 * What a test's name may not carry: an issue number, a spec by path or number,
 * or a spec section such as `S4`.
 *
 * decisions/584-test-names-carry-no-citations.md
 */
const NAME_CITATIONS = [ISSUE_NUMBER, /\bspecs?[/ ]\d+/, /\bS\d+\b/];
const TEST_FUNCTIONS = new Set(["it", "test", "describe", "suite"]);

/**
 * The TypeScript sources among `paths`, in order: the caller lists what git
 * tracks or would.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
export function sourceFilesAmong(paths: readonly string[]): string[] {
  return paths
    .filter((file) => SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)))
    .sort((left, right) => left.localeCompare(right, "en"));
}

function scriptKind(file: string): ts.ScriptKind {
  return file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/**
 * `"use server"`, `"use client"`: a string on its own at the top of a file.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
function isDirective(statement: ts.Statement): boolean {
  return ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
}

/**
 * Every comment in a file, in order, read from the parsed tree and not a
 * regex: a `//` inside a string, a template, JSX text or a doc comment's own
 * text is not a comment.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
export function commentsOf(file: string, source: string): Comment[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const ranges = new Map<number, ts.CommentRange>();

  const collect = (position: number) => {
    for (const range of [
      ...(ts.getLeadingCommentRanges(source, position) ?? []),
      ...(ts.getTrailingCommentRanges(source, position) ?? []),
    ]) {
      ranges.set(range.pos, range);
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) || ts.isJSDoc(node)) return;
    const children = node.getChildren(tree);
    if (children.length === 0) collect(node.pos);
    for (const child of children) visit(child);
  };
  visit(tree);

  const firstDeclaration = tree.statements.find(
    (statement) => !ts.isImportDeclaration(statement) && !isDirective(statement)
  );
  const headerEnd = firstDeclaration?.getStart(tree) ?? source.length;
  let docSeen = false;

  return [...ranges.values()]
    .sort((left, right) => left.pos - right.pos)
    .map((range) => {
      const text = source.slice(range.pos, range.end);
      const doc = text.startsWith("/**") && text !== "/**/";
      const header = doc && !docSeen && range.end <= headerEnd;
      docSeen ||= doc;
      return {
        line: tree.getLineAndCharacterOfPosition(range.pos).line + 1,
        endLine: tree.getLineAndCharacterOfPosition(range.end).line + 1,
        text,
        doc,
        header,
        start: range.pos,
        end: range.end,
      };
    });
}

function linesOf(file: string, comment: Comment): Finding[] {
  return comment.text
    .split("\n")
    .map((text, offset) => ({ file, line: comment.line + offset, text: text.trim() }));
}

/**
 * Comment lines that cite an issue or pull request by number.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
export function issueCitations(file: string, comments: readonly Comment[]): Finding[] {
  return comments.flatMap((comment) =>
    linesOf(file, comment).filter((line) => ISSUE_NUMBER.test(line.text))
  );
}

/**
 * A citing line's entry in the record: a short hash of its file and text, so a
 * line that only moves keeps its key and the same words elsewhere do not.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
export function citationKey(citation: Pick<Finding, "file" | "text">): string {
  return createHash("sha256")
    .update(`${citation.file}\n${citation.text}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * The record the tree has now, sorted, as the recorded file stores it.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
export function citationRecordOf(citations: readonly Finding[]): string[] {
  return citations.map(citationKey).sort((left, right) => left.localeCompare(right, "en"));
}

/**
 * Citing lines the record does not have, and recorded keys the tree no longer
 * has. A line counts once per recorded copy, so a second identical one is new.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
export function compareCitations(
  recorded: readonly string[],
  citations: readonly Finding[]
): { added: Finding[]; removed: string[] } {
  const removed = [...recorded];
  const added = citations.filter((citation) => {
    const at = removed.indexOf(citationKey(citation));
    if (at === -1) return true;
    removed.splice(at, 1);
    return false;
  });
  return { added, removed };
}

/**
 * Each `decisions/…md` path a comment cites, with where it is cited.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
export function decisionCitations(file: string, comments: readonly Comment[]): Finding[] {
  return comments.flatMap((comment) =>
    linesOf(file, comment).flatMap((line) =>
      [...line.text.matchAll(DECISION_PATH)].map((match) => ({ ...line, text: match[0] }))
    )
  );
}

/**
 * The name a call starts from: `it` for `it.each(rows)(…)` and `test` for
 * `test.describe(…)`.
 *
 * decisions/584-test-names-carry-no-citations.md
 */
function calledFrom(expression: ts.Expression): string | null {
  let current = expression;
  while (!ts.isIdentifier(current)) {
    if (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
      current = current.expression;
    } else if (ts.isTaggedTemplateExpression(current)) {
      current = current.tag;
    } else {
      return null;
    }
  }
  return current.text;
}

/**
 * The names a file calls its test functions by: `it`, `test`, `describe` and
 * Vitest's `suite` as it imports them, under another name or not, and a constant assigned from one.
 *
 * decisions/584-test-names-carry-no-citations.md
 */
function testFunctionsOf(tree: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportSpecifier(node)) {
      if (TEST_FUNCTIONS.has((node.propertyName ?? node.name).text)) names.add(node.name.text);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const from = node.initializer === undefined ? null : calledFrom(node.initializer);
      if (from !== null && names.has(from)) names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return names;
}

function isFunction(node: ts.Node): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

type TestName = { line: number; text: string; written: boolean };

/**
 * Each test's and suite's name, read from the parsed tree: the same words in a
 * fixture string are not a name. `written` is false for one that is not a
 * string where the test is, which is a name only when a test's body follows it.
 *
 * decisions/584-test-names-carry-no-citations.md
 */
function testNamesOf(file: string, source: string): TestName[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const functions = testFunctionsOf(tree);
  const names: TestName[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && functions.has(calledFrom(node.expression) ?? "")) {
      const [name, ...rest] = node.arguments;
      if (name !== undefined) {
        const written = ts.isStringLiteralLike(name) || ts.isTemplateExpression(name);
        if (written || rest.some(isFunction)) {
          const line = tree.getLineAndCharacterOfPosition(name.getStart(tree)).line + 1;
          names.push({ line, text: name.getText(tree), written });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return names;
}

/**
 * Each `it`, `test` and `describe` name that cites an issue, a spec or a spec
 * section.
 *
 * decisions/584-test-names-carry-no-citations.md
 */
export function testNameCitations(file: string, source: string): Finding[] {
  return testNamesOf(file, source)
    .filter((name) => NAME_CITATIONS.some((citation) => citation.test(name.text)))
    .map(({ line, text }) => ({ file, line, text }));
}

/**
 * Each test name that is a variable, a call or a sum and not a string: the
 * check cannot read what it will say, so it is not allowed to say it.
 *
 * decisions/584-test-names-carry-no-citations.md
 */
export function computedTestNames(file: string, source: string): Finding[] {
  return testNamesOf(file, source)
    .filter((name) => !name.written)
    .map(({ line, text }) => ({ file, line, text }));
}

/**
 * A doc comment directly under another: the upper one sits on something it does
 * not describe. A blank line under a file's header is the one exception.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
export function stackedDocComments(
  file: string,
  source: string,
  comments: readonly Comment[]
): Finding[] {
  return comments.flatMap((comment, index) => {
    const previous = comments[index - 1];
    if (previous === undefined || !previous.doc || !comment.doc) return [];
    const between = source.slice(previous.end, comment.start);
    if (between.trim() !== "") return [];
    if (previous.header && between.split("\n").length > 2) return [];
    return [{ file, line: comment.line, text: comment.text.replace(/\n[\s\S]*/, "") }];
  });
}

/**
 * A comment line's words, without the markers around them.
 *
 * decisions/839-mechanical-comment-rules.md
 */
function proseOf(line: string): string {
  return line
    .trim()
    .replace(/^\/\*\*?|\*\/$/g, "")
    .replace(/^\s*(\*|\/\/)/, "")
    .trim();
}

/**
 * The words of a comment's lines on one line: what a finding shows, and what
 * keys it in a record, so a comment that only moves keeps its key.
 *
 * decisions/839-mechanical-comment-rules.md
 */
function wordsOf(lines: readonly string[]): string {
  return lines
    .map(proseOf)
    .filter((line) => line !== "")
    .join(" ");
}

function citesARecord(text: string): boolean {
  return text.search(DECISION_PATH) !== -1;
}

function isDeclaration(statement: ts.Statement): boolean {
  return (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isVariableStatement(statement) ||
    ts.isModuleDeclaration(statement) ||
    ts.isExportAssignment(statement)
  );
}

/**
 * Doc comments on a file's top-level declarations that cite no decision record:
 * the header covers only a declaration with no comment of its own. A header a
 * blank line sets apart is the file's, not the declaration's.
 *
 * decisions/531-comments-say-what-code-is-for.md
 * decisions/839-mechanical-comment-rules.md
 */
export function uncitedDeclarations(
  file: string,
  source: string,
  comments: readonly Comment[]
): Finding[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));

  return tree.statements.filter(isDeclaration).flatMap((statement) => {
    const start = statement.getStart(tree);
    const doc = comments.findLast(
      (comment) => comment.doc && comment.start >= statement.pos && comment.end <= start
    );
    if (doc === undefined || citesARecord(doc.text)) return [];
    if (doc.header && /\n[ \t]*\n/.test(source.slice(doc.end, start))) return [];
    return [{ file, line: doc.line, text: wordsOf(doc.text.split("\n")) }];
  });
}

function startsItsLine(source: string, comment: Comment): boolean {
  return source.slice(source.lastIndexOf("\n", comment.start - 1) + 1, comment.start).trim() === "";
}

function continues(source: string, previous: Comment, comment: Comment): boolean {
  return (
    previous.text.startsWith("//") &&
    comment.text.startsWith("//") &&
    startsItsLine(source, previous) &&
    startsItsLine(source, comment) &&
    comment.line === previous.endLine + 1
  );
}

type Run = { line: number; lines: string[] };

/**
 * The file's comments as a reader sees them: `//` lines each on a line of their
 * own, one directly under another, are one comment.
 *
 * decisions/839-mechanical-comment-rules.md
 */
function runsOf(source: string, comments: readonly Comment[]): Run[] {
  const runs: Run[] = [];
  let current: { run: Run; last: Comment } | undefined;
  for (const comment of comments) {
    const lines = comment.text.split("\n");
    if (current !== undefined && continues(source, current.last, comment)) {
      current.run.lines.push(...lines);
    } else {
      current = { run: { line: comment.line, lines }, last: comment };
      runs.push(current.run);
    }
    current.last = comment;
  }
  return runs;
}

/**
 * Comments whose words before the first record path run over three lines, each
 * with those words as its text.
 *
 * decisions/531-comments-say-what-code-is-for.md
 * decisions/839-mechanical-comment-rules.md
 */
export function longComments(
  file: string,
  source: string,
  comments: readonly Comment[]
): Finding[] {
  return runsOf(source, comments).flatMap(({ line, lines }) => {
    const text = lines.join("\n");
    const firstPath = text.search(DECISION_PATH);
    const prose = (firstPath === -1 ? text : text.slice(0, firstPath)).split("\n");
    const proseLines = prose.filter((text) => proseOf(text) !== "").length;
    return proseLines > 3 ? [{ file, line, text: wordsOf(prose) }] : [];
  });
}

/**
 * Doc comments running past `limit` lines: reported, never failed on.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
export function longDocComments(file: string, comments: readonly Comment[], limit = 12): Finding[] {
  return comments
    .filter((comment) => comment.doc && comment.endLine - comment.line + 1 > limit)
    .map((comment) => ({
      file,
      line: comment.line,
      text: `${comment.endLine - comment.line + 1} lines`,
    }));
}

export function describeFindings(findings: readonly Finding[]): string {
  return findings.map((finding) => `  ${finding.file}:${finding.line}  ${finding.text}`).join("\n");
}
