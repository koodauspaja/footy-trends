import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The integration files share one database, so a provider id two of them both
 * use is a fixture two of them both delete (#467).
 *
 * That is not hypothetical. `team-search.test.ts` clears a whole *range* of
 * `providerMatchId` in `beforeEach` and `afterEach` — it searches by name, so
 * it has to clear everything it might have created — and the range covered ids
 * `team-seasons.test.ts` had just inserted. Run together, the two failed four
 * or five assertions every time, with `getTeamSeasons` answering `not_found`
 * for rows it had written moments earlier.
 *
 * The suite runs serially now, which stops that happening. This test is the
 * other half: serial execution makes a shared id harmless rather than absent,
 * and the next file to reuse one should hear about it from here rather than
 * from a red run a year later.
 */

const FOLDER = "tests/integration";

/**
 * A fixture id, as these files write them: six digits starting with 9, chosen
 * to sit far above anything a provider would return.
 *
 * Underscored literals like `993_000` are matched too — `team-search.test.ts`
 * writes its range bounds that way — because a range is exactly the kind of id
 * that reaches another file's rows.
 */
const FIXTURE_ID = /(?<![0-9_])9[0-9]{2}_?[0-9]{3}(?![0-9_])/g;

function integrationFiles(): string[] {
  return readdirSync(FOLDER)
    .filter((name) => name.endsWith(".test.ts"))
    .sort();
}

function idsIn(file: string): Set<string> {
  const source = readFileSync(path.join(FOLDER, file), "utf8");
  return new Set([...source.matchAll(FIXTURE_ID)].map((match) => match[0].replace("_", "")));
}

describe("integration fixture ids", () => {
  it("are used by one file each", () => {
    const owners = new Map<string, string[]>();
    for (const file of integrationFiles()) {
      for (const id of idsIn(file)) {
        owners.set(id, [...(owners.get(id) ?? []), file]);
      }
    }

    const shared = [...owners.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([id, files]) => `${id}: ${files.join(", ")}`);

    // Named rather than counted, so the failure says which files to separate.
    expect(shared).toEqual([]);
  });

  it("finds ids at all, so an empty pass cannot be mistaken for a clean one", () => {
    // A regex that matched nothing would make the assertion above trivially
    // true — the way this check would fail silently.
    const counted = integrationFiles().reduce((total, file) => total + idsIn(file).size, 0);

    expect(counted).toBeGreaterThan(50);
  });
});
