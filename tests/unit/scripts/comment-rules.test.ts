import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Comment,
  citationKey,
  citationRecordOf,
  commentsOf,
  compareCitations,
  decisionCitations,
  describeFindings,
  type Finding,
  issueCitations,
  longDocComments,
  sourceFilesAmong,
  stackedDocComments,
} from "../../../scripts/comment-rules";
import { executablePath } from "../../../scripts/executable";

/**
 * The comment lines in this repository that cite an issue or pull request
 * number, as keys. Entries leave as files are trimmed, and none is added.
 *
 * decisions/531-comments-say-what-code-is-for.md
 */
const RECORD_PATH = "tests/unit/scripts/recorded-issue-citations.json";

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

  it("finds no comment inside a doc comment's own text", () => {
    const source = [
      "/** See {@link foo} // not a comment, and #12. */",
      "/**",
      " * @param a the // thing, see {@link https://example.com/x}",
      " */",
      "function f(a: number) {}",
    ].join("\n");

    expect(texts(commentsOf("a.ts", source))).toEqual([
      "/** See {@link foo} // not a comment, and #12. */",
      "/**\n * @param a the // thing, see {@link https://example.com/x}\n */",
    ]);
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

describe("the citation record", () => {
  const line = (file: string, text: string, at = 1): Finding => ({ file, line: at, text });

  it("keys a line by its file and text, not by where in the file it sits", () => {
    expect(citationKey(line("a.ts", "// see #12", 3))).toBe(
      citationKey(line("a.ts", "// see #12", 90))
    );
    expect(citationKey(line("a.ts", "// see #12"))).not.toBe(
      citationKey(line("a.ts", "// see #13"))
    );
    expect(citationKey(line("a.ts", "// see #12"))).not.toBe(
      citationKey(line("b.ts", "// see #12"))
    );
    expect(citationKey(line("a.ts", "// see #12"))).toMatch(/^[0-9a-f]{16}$/);
  });

  it("records the keys in order, whatever order the lines come in", () => {
    const lines = [line("b.ts", "// #2"), line("a.ts", "// #9"), line("b.ts", "// #1")];

    expect(citationRecordOf(lines)).toEqual(lines.map(citationKey).toSorted());
    expect(citationRecordOf(lines.toReversed())).toEqual(citationRecordOf(lines));
  });

  it("passes the lines it recorded, on whatever line they now sit", () => {
    const recorded = citationRecordOf([line("a.ts", "// #1", 3), line("a.ts", "// #2", 9)]);

    expect(
      compareCitations(recorded, [line("a.ts", "// #2", 40), line("a.ts", "// #1", 41)])
    ).toEqual({ added: [], removed: [] });
  });

  it("names a citation swapped for another, which a count would pass", () => {
    const recorded = citationRecordOf([line("a.ts", "// #1"), line("a.ts", "// #2")]);

    expect(compareCitations(recorded, [line("a.ts", "// #1"), line("a.ts", "// #77", 5)])).toEqual({
      added: [line("a.ts", "// #77", 5)],
      removed: [citationKey(line("a.ts", "// #2"))],
    });
  });

  it("counts a second copy of a recorded line, and the same line in another file, as new", () => {
    const recorded = citationRecordOf([line("a.ts", "// #1")]);
    const now = [line("a.ts", "// #1"), line("a.ts", "// #1", 2), line("b.ts", "// #1")];

    expect(compareCitations(recorded, now).added).toEqual([
      line("a.ts", "// #1", 2),
      line("b.ts", "// #1"),
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

  it("finds one under a doc comment whose text holds a link and a `//`", () => {
    expect(stacked("/** See {@link foo} // and more. */\n/** For f. */\nfunction f() {}")).toEqual([
      { file: "a.ts", line: 2, text: "/** For f. */" },
    ]);
  });

  it("finds two doc comments on one line", () => {
    expect(stacked("/** One. */ /** Two. */\nfunction f() {}")).toHaveLength(1);
  });

  it("passes a file header separated by a blank line, before or after the imports", () => {
    expect(stacked("/** The module. */\n\n/** For f. */\nfunction f() {}")).toEqual([]);
    expect(
      stacked('import a from "a";\n\n/** The module. */\n\n/** For f. */\nfunction f() {}')
    ).toEqual([]);
    expect(stacked('/** The module. */\n\nimport a from "a";\n')).toEqual([]);
    expect(
      stacked(
        '"use server";\n\nimport a from "a";\n\n/** The module. */\n\n/** For f. */\nfunction f() {}'
      )
    ).toEqual([]);
  });

  it("finds one behind a blank line once the file's first declaration has begun", () => {
    const source =
      "const a = 1;\n\n/** For something far below. */\n\n/** For f. */\nfunction f() {}";

    expect(stacked(source)).toEqual([{ file: "a.ts", line: 5, text: "/** For f. */" }]);
  });

  it("passes doc comments with code between them, on lines of its own or the same one", () => {
    expect(stacked("/** For a. */\nconst a = 1;\n/** For f. */\nfunction f() {}")).toEqual([]);
    expect(stacked("/** For a. */ const a = 1; /** For b. */\nconst b = 2;")).toEqual([]);
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

  it("leaves a long run of line comments alone, and a long plain block comment", () => {
    const lines = Array.from({ length: 20 }, () => "// line").join("\n");
    const block = ["/*", ...Array.from({ length: 18 }, () => " * line"), " */"].join("\n");

    expect(longDocComments("a.ts", commentsOf("a.ts", lines))).toEqual([]);
    expect(longDocComments("a.ts", commentsOf("a.ts", block))).toEqual([]);
  });
});

describe("sourceFilesAmong", () => {
  it("keeps the TypeScript sources, sorted", () => {
    expect(
      sourceFilesAmong(["src/lib/b.ts", "README.md", "src/lib.ts", "src/a.tsx", "c.mts", "d.mjs"])
    ).toEqual(["c.mts", "d.mjs", "src/a.tsx", "src/lib.ts", "src/lib/b.ts"]);
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
    // What git tracks or would: an ignored or generated file is not the repository's.
    const git = executablePath("git");
    if (git === null)
      throw new Error("git was not found, so the repository's files cannot be listed");
    const listed = execFileSync(git, ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const files = sourceFilesAmong(listed.split("\n")).filter((file) =>
      existsSync(path.join(ROOT, file))
    );
    scanned = files.map((file) => {
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

  it("cites no issue or pull request number the record does not have", () => {
    const recorded: string[] = JSON.parse(readFileSync(path.join(ROOT, RECORD_PATH), "utf8"));
    const citations = across((file, _source, comments) => issueCitations(file, comments));
    const { added, removed } = compareCitations(recorded, citations);

    expect(
      added,
      `A comment cites an issue or pull request. Move its reason into a decision record and link that instead:\n${describeFindings(added)}`
    ).toEqual([]);
    expect(
      removed,
      `Recorded citations that are gone. Replace ${RECORD_PATH} with:\n${JSON.stringify(citationRecordOf(citations), null, 2)}`
    ).toEqual([]);
  });

  it("stacks no doc comment on another", () => {
    const stacked = across(stackedDocComments);

    expect(stacked, `Doc comments stacked on another:\n${describeFindings(stacked)}`).toEqual([]);
  });
});
