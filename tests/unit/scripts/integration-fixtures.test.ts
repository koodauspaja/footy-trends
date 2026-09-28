import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The integration files share one database, so a fixture id two of them both
 * use is a row two of them both delete (#467).
 *
 * That is not hypothetical. `team-search.test.ts` clears a whole *range* of
 * `providerMatchId` in `beforeEach` and `afterEach` — it searches by name, so
 * it has to clear everything it might have created — and the range covered ids
 * `team-seasons.test.ts` had just inserted. Run together, the two failed four
 * or five assertions every time, with `getTeamSeasons` answering `not_found`
 * for rows it had written moments earlier.
 *
 * The suite runs one file at a time now, which stops that happening. This test
 * is the other half: serial execution makes a shared id harmless rather than
 * absent, and the next file to reach into another's rows should hear about it
 * here rather than from a red run a year later.
 *
 * **Ownership is by block, not by id.** A file writes ids it never spells out —
 * `team-search.test.ts` builds a row per search result as `993200 + index` —
 * so comparing literals would record the base and miss everything generated
 * from it. Blocks cover those: whatever `993200 + index` comes to, it is still
 * `team-search`'s. Raised in review on #469.
 */

const FOLDER = "tests/integration";

/**
 * A fixture id: six digits starting with 9, chosen to sit far above anything a
 * provider would return. Underscored literals like `993_000` count too —
 * `team-search.test.ts` writes its range bounds that way, and a range bound is
 * exactly the kind of id that reaches another file's rows.
 */
const FIXTURE_ID = /(?<![0-9_])9[0-9]{2}_?[0-9]{3}(?![0-9_])/g;

/** `993001` and `993_200 + index` alike belong to block `993`. */
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

/** Which file each block belongs to, as the files themselves say. */
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
    /**
     * A regex that matched nothing would make the assertion above trivially
     * true — the way this check would come to pass while checking nothing.
     * Pinned to a file that certainly has fixtures rather than to a count,
     * which would fail on an unrelated day when fixtures were consolidated.
     */
    expect(blocksIn("team-search.test.ts")).toContain("993");
    expect(blocksIn("team-seasons.test.ts")).toContain("994");
  });
});
