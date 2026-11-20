import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every action a workflow uses is pinned to a full commit hash with its version
 * in a trailing comment, and Renovate is told to pin any action that arrives on a
 * tag.
 *
 * decisions/813-pinned-actions.md
 */

const ROOT = process.cwd();
const WORKFLOWS = ".github/workflows";

const USES = /^\s*(?:-\s+)?uses:\s*(.+?)\s*$/;
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(?:\.\d+)*$/;

// The `uses:` values in a workflow's text that are not pinned, as written.
function unpinnedUses(text: string): string[] {
  return text
    .split("\n")
    .map((line) => USES.exec(line)?.[1])
    .filter((value): value is string => value !== undefined && !PINNED.test(value));
}

function workflowFiles(): string[] {
  return readdirSync(path.join(ROOT, WORKFLOWS)).filter((name) => /\.ya?ml$/.test(name));
}

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

describe("unpinnedUses", () => {
  it("passes an action pinned to a full hash with its version after it", () => {
    expect(
      unpinnedUses(
        "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1"
      )
    ).toEqual([]);
  });

  it("names an action on a moving tag, as a list item and as a step key", () => {
    expect(
      unpinnedUses("      - uses: actions/checkout@v7\n        uses: actions/setup-node@v7")
    ).toEqual(["actions/checkout@v7", "actions/setup-node@v7"]);
  });

  it("names a pinned action whose version comment is missing", () => {
    expect(unpinnedUses("uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1")).toEqual(
      ["actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"]
    );
  });

  it("names a hash shorter than 40 characters", () => {
    expect(unpinnedUses("uses: actions/checkout@3d3c42e # v7.0.1")).toEqual([
      "actions/checkout@3d3c42e # v7.0.1",
    ]);
  });

  it("ignores a comment that mentions uses:", () => {
    expect(unpinnedUses("  # uses: actions/checkout@v7")).toEqual([]);
  });
});

describe("the workflows", () => {
  it("are found", () => {
    expect(workflowFiles()).toContain("ci.yml");
  });

  it.each(workflowFiles())("%s uses only pinned actions", (name) => {
    expect(unpinnedUses(read(`${WORKFLOWS}/${name}`))).toEqual([]);
  });
});

describe("renovate.json", () => {
  it("keeps the pinned hashes current", () => {
    const { extends: presets } = JSON.parse(read("renovate.json")) as { extends: string[] };

    expect(presets).toContain("helpers:pinGitHubActionDigests");
  });
});
