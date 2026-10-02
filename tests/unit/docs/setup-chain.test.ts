import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `docs/setup/` is a procedure followed in one order (#524). Its numbers are
 * names, not the order, because other documents cite them: the order is the
 * index's table and each document's **Next** pointer. Before #524 the chain
 * ended at 022, four documents could not be reached by following it, and one
 * pointed back at a feature spec. Nothing failed, so nobody noticed.
 */
const SETUP = path.join(process.cwd(), "docs", "setup");
const DOCUMENT = /\d{3}-[a-z0-9-]+\.md/;

const documents = readdirSync(SETUP)
  .filter((file) => DOCUMENT.test(file))
  .sort();

function nextOf(file: string): string | null {
  const text = readFileSync(path.join(SETUP, file), "utf8");
  const next = text.slice(text.lastIndexOf("## Next"));
  return DOCUMENT.exec(next)?.[0] ?? null;
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
  const index = readFileSync(path.join(SETUP, "README.md"), "utf8");
  return [...index.matchAll(/^\| \d+ \| \[(\d{3}-[a-z0-9-]+\.md)\]/gm)].map(
    (match) => match[1] as string
  );
}

describe("docs/setup (#524)", () => {
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

  /** Every Markdown file under the given roots, as paths from the repository root. */
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
