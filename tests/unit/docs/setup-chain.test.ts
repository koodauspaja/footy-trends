import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `docs/setup/` is a procedure followed in one order. Its numbers are names, not
 * the order, because other documents cite them: the order is the index's table and
 * each document's Next pointer, and every document must be reached by it.
 *
 * decisions/524-setup-docs-for-two-readers.md
 */

const SETUP = path.join(process.cwd(), "docs", "setup");
const INDEX = "README.md";
// A whole filename, so `backup001-old.md` is not taken for a document.
const DOCUMENT = /^\d{3}-[a-z0-9-]+\.md$/;
// A Next pointer names its document whole, in backticks.
const POINTER = /`(\d{3}-[a-z0-9-]+\.md)`/;

const files = readdirSync(SETUP).sort();
const documents = files.filter((file) => DOCUMENT.test(file));

function nextIn(text: string): string | null {
  const next = text.slice(text.lastIndexOf("## Next"));
  return POINTER.exec(next)?.[1] ?? null;
}

function nextOf(file: string): string | null {
  return nextIn(readFileSync(path.join(SETUP, file), "utf8"));
}

function chainFrom(first: string): string[] {
  const chain: string[] = [];
  for (
    let file: string | null = first;
    file !== null && !chain.includes(file);
    file = nextOf(file)
  ) {
    chain.push(file);
  }
  return chain;
}

function indexOrder(): string[] {
  const index = readFileSync(path.join(SETUP, INDEX), "utf8");
  return [...index.matchAll(/^\| \d+ \| \[(\d{3}-[a-z0-9-]+\.md)\]/gm)].map(
    (match) => match[1] as string
  );
}

describe("docs/setup", () => {
  it("holds nothing but numbered documents and the index", () => {
    expect(files.filter((file) => !DOCUMENT.test(file))).toEqual([INDEX]);
  });

  it("takes only a whole numbered filename for a document", () => {
    expect(DOCUMENT.test("001-github-repo-setup.md")).toBe(true);
    expect(DOCUMENT.test("backup001-old.md")).toBe(false);
    expect(DOCUMENT.test("001-old.md.bak")).toBe(false);
  });

  it("reads a Next pointer only from a whole backticked filename", () => {
    expect(nextIn("## Next\n\n→ `002-github-project-board.md`")).toBe(
      "002-github-project-board.md"
    );
    expect(nextIn("## Next\n\n→ `x002-github-project-board.md`")).toBeNull();
    expect(nextIn("## Next\n\n→ see foo002-bar.md for more")).toBeNull();
    expect(nextIn("`002-github-project-board.md`\n\n## Next\n\n→ Nothing")).toBeNull();
  });

  it("has a Next section in every document", () => {
    for (const file of documents) {
      expect(readFileSync(path.join(SETUP, file), "utf8"), file).toContain("## Next");
    }
  });

  it("reaches every document once by following Next from 001", () => {
    const chain = chainFrom("001-github-repo-setup.md");

    expect([...chain].sort()).toEqual(documents);
    expect(nextOf(chain.at(-1) as string)).toBeNull();
  });

  it("lists the documents in its index in the order the chain visits them", () => {
    expect(indexOrder()).toEqual(chainFrom("001-github-repo-setup.md"));
  });

  // Every Markdown file under the given roots, as paths from the repository
  // root.
  function markdownUnder(target: string): string[] {
    const full = path.join(process.cwd(), target);
    if (!existsSync(full)) return [];
    if (!statSync(full).isDirectory()) return target.endsWith(".md") ? [target] : [];
    return readdirSync(full).flatMap((entry) => markdownUnder(path.join(target, entry)));
  }

  it("is cited by path only where the document exists", () => {
    const roots = ["docs", "skills", "specs", "decisions", "CLAUDE.md", "README.md", "INSTALL.md"];
    const missing = roots
      .flatMap(markdownUnder)
      .flatMap((file) =>
        [
          ...readFileSync(path.join(process.cwd(), file), "utf8").matchAll(
            /docs\/setup\/(\d{3}-[a-z0-9-]+\.md)/g
          ),
        ]
          .filter((match) => !existsSync(path.join(SETUP, match[1] as string)))
          .map((match) => `${file} cites ${match[1]}`)
      );

    expect(missing).toEqual([]);
  });

  it("cites its own siblings only where they exist", () => {
    // Inside docs/setup a sibling is named bare; a spec or a decision record
    // shares the NNN-name.md shape and is always named with its folder.
    const missing = documents.flatMap((file) =>
      [
        ...readFileSync(path.join(SETUP, file), "utf8").matchAll(
          /(?<![\w/])(\d{3}-[a-z0-9-]+\.md)/g
        ),
      ]
        .filter((match) => !existsSync(path.join(SETUP, match[1] as string)))
        .map((match) => `${file} cites ${match[1]}`)
    );

    expect(missing).toEqual([]);
  });
});
