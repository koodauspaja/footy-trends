import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * The rules a comment is held to: what it may cite, and how it may sit.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */

export type Comment = {
  /** 1-based, as an editor shows it. */
  line: number;
  endLine: number;
  text: string;
  doc: boolean;
  start: number;
  end: number;
};

export type Finding = { file: string; line: number; text: string };

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs"];
const PRUNED = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "out",
  "playwright-report",
  "test-results",
]);

/** An issue or pull request number, this repository's or another's, but not `&#123;`. */
const ISSUE_NUMBER = /(?<![&#])#\d+\b/;
const DECISION_PATH = /decisions\/[\w.-]+\.md/g;

/** Every TypeScript source under `root`, relative and with forward slashes. */
export function listSourceFiles(root: string, directory = "."): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = directory === "." ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) return PRUNED.has(entry.name) ? [] : listSourceFiles(root, relative);
      return SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
        ? [relative]
        : [];
    })
    .sort((left, right) => left.localeCompare(right, "en"));
}

function scriptKind(file: string): ts.ScriptKind {
  return file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/**
 * Every comment in a file, in order, read from the parsed tree rather than a
 * regex: a `//` inside a string, a template, JSX text or a doc comment's own
 * text is not a comment.
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

  return [...ranges.values()]
    .sort((left, right) => left.pos - right.pos)
    .map((range) => {
      const text = source.slice(range.pos, range.end);
      return {
        line: tree.getLineAndCharacterOfPosition(range.pos).line + 1,
        endLine: tree.getLineAndCharacterOfPosition(range.end).line + 1,
        text,
        doc: text.startsWith("/**") && text !== "/**/",
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

/** Comment lines that cite an issue or pull request by number. */
export function issueCitations(file: string, comments: readonly Comment[]): Finding[] {
  return comments.flatMap((comment) =>
    linesOf(file, comment).filter((line) => ISSUE_NUMBER.test(line.text))
  );
}

/**
 * A citing line's entry in the record: a short hash of its file and text, so a
 * line that only moves keeps its key and the same words elsewhere do not.
 */
export function citationKey(citation: Pick<Finding, "file" | "text">): string {
  return createHash("sha256")
    .update(`${citation.file}\n${citation.text}`)
    .digest("hex")
    .slice(0, 16);
}

/** The record the tree has now, sorted, as the recorded file stores it. */
export function citationRecordOf(citations: readonly Finding[]): string[] {
  return citations.map(citationKey).sort((left, right) => left.localeCompare(right, "en"));
}

/**
 * Citing lines the record does not have, and recorded keys the tree no longer
 * has. A line counts once per recorded copy, so a second identical one is new.
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

/** Each `decisions/…md` path a comment cites, with where it is cited. */
export function decisionCitations(file: string, comments: readonly Comment[]): Finding[] {
  return comments.flatMap((comment) =>
    linesOf(file, comment).flatMap((line) =>
      [...line.text.matchAll(DECISION_PATH)].map((match) => ({ ...line, text: match[0] }))
    )
  );
}

/**
 * A doc comment starting on the line after another ends: the upper one sits on
 * something it does not describe. A blank line between marks a file header.
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
    if (between.trim() !== "" || between.split("\n").length > 2) return [];
    return [{ file, line: comment.line, text: comment.text.replace(/\n[\s\S]*/, "") }];
  });
}

/** Doc comments running past `limit` lines: reported, never failed on. */
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
