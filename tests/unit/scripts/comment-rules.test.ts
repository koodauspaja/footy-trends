import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Comment,
  commentsOf,
  decisionCitations,
  describeFindings,
  type Finding,
  issueCitations,
  listSourceFiles,
  longDocComments,
  stackedDocComments,
} from "../../../scripts/comment-rules";

/**
 * Comment lines in this repository that cite an issue or pull request number.
 * Lowered as files are trimmed, and never raised.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
const RECORDED_ISSUE_CITATIONS = 454;

const texts = (comments: readonly Comment[]) => comments.map((comment) => comment.text);

describe("commentsOf", () => {
  it("finds line and block comments with their lines, and marks doc comments", () => {
    const source = [
      "// one",
      "/** two */",
      "const a = 1; /* three */",
      "/**",
      " * four",
      " */",
      "function f() {}",
      "/**/",
    ].join("\n");

    const comments = commentsOf("a.ts", source);

    expect(texts(comments)).toEqual([
      "// one",
      "/** two */",
      "/* three */",
      "/**\n * four\n */",
      "/**/",
    ]);
    expect(comments.map((comment) => [comment.line, comment.endLine, comment.doc])).toEqual([
      [1, 1, false],
      [2, 2, true],
      [3, 3, false],
      [4, 6, true],
      [8, 8, false],
    ]);
  });

  it("ignores comment markers in strings, templates and regular expressions", () => {
    const source = [
      'const url = "https://example.com/#1";',
      "const path = `/* not // a comment */`;",
      "const pattern = /\\/\\/ not either/;",
      "// but this is",
    ].join("\n");

    expect(texts(commentsOf("a.ts", source))).toEqual(["// but this is"]);
  });

  it("reads TSX, where JSX text is not a comment and a braced one is", () => {
    const source = [
      "export const A = () => (",
      "  <p>",
      "    // text, not a comment",
      "    {/* a comment */}",
      "  </p>",
      ");",
    ].join("\n");

    expect(texts(commentsOf("a.tsx", source))).toEqual(["/* a comment */"]);
  });

  it("reads a JavaScript module", () => {
    expect(texts(commentsOf("a.mjs", "/** config */\nexport default {};"))).toEqual([
      "/** config */",
    ]);
  });
});

describe("issueCitations", () => {
  it("finds each comment line naming an issue or pull request by number", () => {
    const comments = commentsOf(
      "a.ts",
      "// see #12\n/**\n * fixed in #34 and #35\n * no number\n */"
    );

    expect(issueCitations("a.ts", comments)).toEqual([
      { file: "a.ts", line: 1, text: "// see #12" },
      { file: "a.ts", line: 3, text: "* fixed in #34 and #35" },
    ]);
  });

  it("counts another repository's issue, and not an HTML entity or a hash without a number", () => {
    const comments = commentsOf("a.ts", "// owner/repo#7\n// &#123; ##6 #x");

    expect(issueCitations("a.ts", comments)).toEqual([
      { file: "a.ts", line: 1, text: "// owner/repo#7" },
    ]);
  });
});

describe("decisionCitations", () => {
  it("names each decision record a comment cites, on its line", () => {
    const source = "/**\n * Text.\n *\n * decisions/001-a.md and decisions/002-b.md\n */";

    expect(decisionCitations("a.ts", commentsOf("a.ts", source))).toEqual([
      { file: "a.ts", line: 4, text: "decisions/001-a.md" },
      { file: "a.ts", line: 4, text: "decisions/002-b.md" },
    ]);
  });
});

describe("stackedDocComments", () => {
  const stacked = (source: string) =>
    stackedDocComments("a.ts", source, commentsOf("a.ts", source));

  it("finds a doc comment starting on the line after another ends", () => {
    expect(stacked("/** For something else. */\n/**\n * For f.\n */\nfunction f() {}")).toEqual([
      { file: "a.ts", line: 2, text: "/**" },
    ]);
  });

  it("finds two doc comments on one line", () => {
    expect(stacked("/** One. */ /** Two. */\nfunction f() {}")).toHaveLength(1);
  });

  it("passes a file header separated by a blank line", () => {
    expect(stacked("/** The module. */\n\n/** For f. */\nfunction f() {}")).toEqual([]);
  });

  it("passes doc comments with code between them", () => {
    expect(stacked("/** For a. */\nconst a = 1;\n/** For f. */\nfunction f() {}")).toEqual([]);
  });

  it("passes a doc comment beside a plain comment, either way round", () => {
    expect(stacked("// Note.\n/** For f. */\nfunction f() {}")).toEqual([]);
    expect(stacked("/** For f. */\n// Note.\nfunction f() {}")).toEqual([]);
  });
});

describe("longDocComments", () => {
  const doc = (lines: number) =>
    ["/**", ...Array.from({ length: lines - 2 }, () => " * line"), " */"].join("\n");

  it("reports a doc comment past twelve lines, and not one of twelve", () => {
    const source = `${doc(13)}\nconst a = 1;\n${doc(12)}\nconst b = 2;`;

    expect(longDocComments("a.ts", commentsOf("a.ts", source))).toEqual([
      { file: "a.ts", line: 1, text: "13 lines" },
    ]);
  });

  it("leaves a long run of line comments alone", () => {
    const source = Array.from({ length: 20 }, () => "// line").join("\n");

    expect(longDocComments("a.ts", commentsOf("a.ts", source))).toEqual([]);
  });
});

describe("listSourceFiles", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "comment-rules-"));
    for (const directory of ["src/lib", "node_modules/pkg", ".git"]) {
      mkdirSync(path.join(root, directory), { recursive: true });
    }
    for (const file of [
      "src/lib/b.ts",
      "src/a.tsx",
      "src/c.mts",
      "config.mjs",
      "README.md",
      "node_modules/pkg/index.ts",
      ".git/hook.ts",
    ]) {
      writeFileSync(path.join(root, file), "");
    }
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("lists TypeScript sources sorted, and skips dependencies and git", () => {
    expect(listSourceFiles(root)).toEqual(["config.mjs", "src/a.tsx", "src/c.mts", "src/lib/b.ts"]);
  });
});

describe("describeFindings", () => {
  it("prints one finding per line, as a path and line an editor opens", () => {
    expect(
      describeFindings([
        { file: "a.ts", line: 3, text: "// #1" },
        { file: "b.ts", line: 9, text: "/**" },
      ])
    ).toBe("  a.ts:3  // #1\n  b.ts:9  /**");
  });
});

describe("this repository's comments", () => {
  const ROOT = process.cwd();
  let scanned: { file: string; source: string; comments: Comment[] }[] = [];
  const across = (rule: (file: string, source: string, comments: Comment[]) => Finding[]) =>
    scanned.flatMap(({ file, source, comments }) => rule(file, source, comments));

  beforeAll(() => {
    scanned = listSourceFiles(ROOT).map((file) => {
      const source = readFileSync(path.join(ROOT, file), "utf8");
      return { file, source, comments: commentsOf(file, source) };
    });
  }, 60_000);

  afterAll(() => {
    const long = across((file, _source, comments) => longDocComments(file, comments));
    const longest = long.toSorted(
      (left, right) => Number.parseInt(right.text, 10) - Number.parseInt(left.text, 10)
    );
    process.stdout.write(
      `\n${long.length} doc comments run past twelve lines; the longest:\n${describeFindings(longest.slice(0, 10))}\n`
    );
  });

  it("cites only decision records that exist", () => {
    const missing = across((file, _source, comments) => decisionCitations(file, comments)).filter(
      (citation) => !existsSync(path.join(ROOT, citation.text))
    );

    expect(missing, `Cited, but not in decisions/:\n${describeFindings(missing)}`).toEqual([]);
  });

  it("cites exactly the recorded number of issue and pull request numbers", () => {
    const count = across((file, _source, comments) => issueCitations(file, comments)).length;

    expect(
      count,
      count > RECORDED_ISSUE_CITATIONS
        ? "A new comment cites an issue or pull request. Move its reason into a decision record and link that instead."
        : `Fewer comments cite a number than recorded: lower RECORDED_ISSUE_CITATIONS to ${count}.`
    ).toBe(RECORDED_ISSUE_CITATIONS);
  });

  it("stacks no doc comment on another", () => {
    const stacked = across(stackedDocComments);

    expect(stacked, `Doc comments stacked on another:\n${describeFindings(stacked)}`).toEqual([]);
  });
});
