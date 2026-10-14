import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The integration files share one database, so a fixture id two of them use is a row
 * two of them delete. One file at a time makes that harmless, not absent, so it is
 * caught here. Ownership is by block: a literal `993200` would miss `993200 + index`.
 *
 * decisions/467-deterministic-integration-suite.md
 */

const FOLDER = "tests/integration";

// A fixture id: six digits starting with 9, far above anything a provider would return.
// Underscored literals like `993_000` count too: `team-search.test.ts` writes its range
// bounds that way, and a range bound is the kind of id that reaches another file's rows.
const FIXTURE_ID = /(?<![0-9_])9[0-9]{2}_?[0-9]{3}(?![0-9_])/g;

// `993001` and `993_200 + index` alike belong to block `993`.
function blockOf(id: string): string {
  return id.replace("_", "").slice(0, 3);
}

function integrationFiles(): string[] {
  return readdirSync(FOLDER)
    .filter((name) => name.endsWith(".test.ts"))
    .sort();
}

function blocksIn(file: string): Set<string> {
  const source = readFileSync(path.join(FOLDER, file), "utf8");
  return new Set([...source.matchAll(FIXTURE_ID)].map((match) => blockOf(match[0])));
}

// Which file each block belongs to, as the files themselves say.
function owners(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of integrationFiles()) {
    for (const block of blocksIn(file)) {
      found.set(block, [...(found.get(block) ?? []), file]);
    }
  }
  return found;
}

describe("integration fixture ids", () => {
  it("draw from blocks one file each owns", () => {
    const shared = [...owners().entries()]
      .filter(([, files]) => files.length > 1)
      .map(([block, files]) => `${block}xxx: ${files.join(", ")}`);

    // Named rather than counted, so a failure says which files to separate and
    // which block to move out of.
    expect(shared).toEqual([]);
  });

  it("are found where they are known to be, so an empty scan cannot pass", () => {
    // A regex that matched nothing would make the assertion above trivially
    // true. Pinned to a file that certainly has fixtures, not to a count, which
    // would fail on an unrelated day when fixtures were consolidated.
    expect(blocksIn("team-search.test.ts")).toContain("993");
    expect(blocksIn("team-seasons.test.ts")).toContain("994");
  });
});
