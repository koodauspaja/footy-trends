import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No document says a push after the first review leaves no review object
 * behind: it does, and reading it as a full review is what the gate guards
 * against.
 *
 * decisions/559-sourcery-review-kind.md
 */

const ROOT = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

// Every Markdown file under a directory, as paths from the repository root.
function markdownIn(directory: string): string[] {
  return readdirSync(path.join(ROOT, directory), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(directory, file));
}

// Decision records are left out: they are where the old claim is quoted.
const DOCUMENTS = ["CLAUDE.md", "README.md", ...markdownIn("docs"), ...markdownIn("skills")];

// "creates no new review object", "create no review object", across a line break.
const NO_REVIEW_OBJECT = /\bno\s+(?:new\s+)?review\s+object/i;

describe("the documents that describe the Sourcery gate", () => {
  it("finds the skills and the setup documents it means to read", () => {
    expect(DOCUMENTS).toContain(path.join("skills", "open-pr.md"));
    expect(DOCUMENTS).toContain(path.join("docs", "setup", "004-sourcery-setup.md"));
  });

  it.each(DOCUMENTS)("%s does not say a push leaves no review object", (file) => {
    // A boolean, so a failure names the file without printing the whole of it.
    expect(NO_REVIEW_OBJECT.test(read(file))).toBe(false);
  });

  it("recognises the sentence it exists to keep out", () => {
    expect("a light reaction creates no new review object").toMatch(NO_REVIEW_OBJECT);
    expect("deliberately light and create no new review\n   object").toMatch(NO_REVIEW_OBJECT);
    expect("Such a reaction does create a review object").not.toMatch(NO_REVIEW_OBJECT);
  });

  it("gives the first line of each kind of review where the gate is described", () => {
    const gate = read("skills/open-pr.md");

    expect(gate).toContain("`Hey - I've found N issues`");
    expect(gate).toContain("`### Sourcery assessment`");
  });
});
