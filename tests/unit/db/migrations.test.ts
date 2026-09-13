import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATION_TAG } from "../../../scripts/migration-name";

/**
 * The migration folder's own invariants.
 *
 * `drizzle-kit generate` names a migration after two random words —
 * `0016_young_meteorite` — unless it is given `--name`. Seven arrived that way
 * before anyone noticed, and a name like that tells a reader nothing at the one
 * moment they need to know what a migration did: reading back through a
 * production incident.
 *
 * A written-down convention is not a check, which is why this file exists — and
 * why `npm run db:generate` refuses to create one in the first place. This is
 * the second line: it catches a name that arrives by any other route.
 */

const FOLDER = path.join(process.cwd(), "drizzle/migrations");

/**
 * The rule itself lives in `scripts/migration-name.ts`, shared with the
 * generator that refuses to create a bad name. Two enforcement points, one
 * rule — a copy here would be free to drift from the one that does the
 * refusing.
 */
const NAME = MIGRATION_TAG;

type Journal = { entries: { idx: number; tag: string }[] };

function journal(): Journal {
  return JSON.parse(readFileSync(path.join(FOLDER, "meta/_journal.json"), "utf8")) as Journal;
}

function sqlFiles(): string[] {
  return readdirSync(FOLDER)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.replace(/\.sql$/, ""))
    .sort();
}

describe("migration names", () => {
  it.each(journal().entries.map((entry) => entry.tag))("%s says what it does", (tag) => {
    expect(tag).toMatch(NAME);
  });

  it("rejects the shape drizzle-kit generates without --name", () => {
    // The guard has to fail on the thing it exists to catch, or it is decoration.
    expect("0017_young_meteorite").not.toMatch(NAME);
    expect("0018_fair_captain_stacy").not.toMatch(NAME);
    expect("0019_add_refresh_runs").toMatch(NAME);
  });
});

describe("the journal and the folder agree", () => {
  it("has a file for every entry, and an entry for every file", () => {
    // The failure this catches is silent and total: the migrator locates a file
    // by its journal tag, so an entry whose file was renamed underneath it
    // throws on every deploy, and a file with no entry never runs at all.
    expect(sqlFiles()).toEqual(
      journal()
        .entries.map((entry) => entry.tag)
        .sort()
    );
  });

  it("numbers the entries contiguously, in order", () => {
    const entries = journal().entries;

    expect(entries.map((entry) => entry.idx)).toEqual(entries.map((_, index) => index));
    for (const [index, entry] of entries.entries()) {
      expect(entry.tag.startsWith(String(index).padStart(4, "0"))).toBe(true);
    }
  });
});
