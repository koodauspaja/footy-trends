import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSonarProperty } from "../../../scripts/coverage-gaps-plan";

/**
 * The comment above `sonar.coverage.exclusions` explains why each entry is
 * there, in groups, with a count for each. A count in prose is exactly the thing
 * that drifts — #389 got the same one wrong twice — and review on #411 read
 * these as wrong when they were right, which is the same problem from the other
 * side. So the counts are written in a form a test can read, and this is the
 * test (#403).
 */

const PROPERTIES = readFileSync("sonar-project.properties", "utf8");

/** Files that construct a client or migrate as soon as they are imported. */
const CONNECTS_AT_IMPORT = new Set(["src/db/index.ts", "src/db/migrate.ts", "src/lib/redis.ts"]);

function isToolingConfiguration(entry: string): boolean {
  return (
    entry.endsWith(".config.ts") || entry.endsWith(".config.mjs") || entry === "vitest.setup.ts"
  );
}

/** `#   exclusion-count: <name> <number>` lines from the comment. */
function statedCounts(): Record<string, number> {
  const stated: Record<string, number> = {};

  for (const match of PROPERTIES.matchAll(/exclusion-count:\s*([\w-]+)\s+(\d+)/g)) {
    const [, name = "", value = ""] = match;
    stated[name] = Number(value);
  }

  return stated;
}

type Group = "connects-at-import" | "tested-runner-half" | "tooling-configuration";
type Counts = Record<Group, number> & { total: number };

const GROUPS: Group[] = ["connects-at-import", "tested-runner-half", "tooling-configuration"];

function actualCounts(): Counts {
  const entries = parseSonarProperty(PROPERTIES, "sonar.coverage.exclusions");
  const configuration = entries.filter(isToolingConfiguration);
  const connecting = entries.filter((entry) => CONNECTS_AT_IMPORT.has(entry));

  return {
    total: entries.length,
    "connects-at-import": connecting.length,
    "tooling-configuration": configuration.length,
    "tested-runner-half": entries.length - configuration.length - connecting.length,
  };
}

describe("the coverage exclusion list", () => {
  it("holds as many entries as its comment says", () => {
    expect(actualCounts().total).toBe(statedCounts().total);
  });

  it.each(GROUPS)("has the number of %s entries its comment claims", (group) => {
    expect(actualCounts()[group]).toBe(statedCounts()[group]);
  });

  it("accounts for every entry, leaving none in no group at all", () => {
    const counts = actualCounts();

    const grouped = GROUPS.reduce((sum, group) => sum + counts[group], 0);

    expect(grouped).toBe(counts.total);
  });

  /**
   * The list itself, so that changing it is a deliberate act with a diff here
   * too. Counts alone let one entry be swapped for another in the same group
   * without anything noticing — raised in review on #411 — and an exclusion
   * that appears unremarked is how a file stops being measured at all.
   */
  const EXPECTED = [
    // Open a connection, or migrate, at import.
    "src/db/index.ts",
    "src/db/migrate.ts",
    "src/lib/redis.ts",
    // Runners whose decisions live in a tested `*-plan.ts` half.
    "scripts/backfill.ts",
    "scripts/backfill-run.ts",
    "scripts/e2e-freshness.ts",
    "scripts/coverage-gaps.ts",
    "scripts/generate-migration.ts",
    "scripts/release-version.ts",
    "scripts/release-pr.ts",
    "scripts/grant-admin.ts",
    "scripts/grant-admin-run.ts",
    "scripts/verify-sentry.ts",
    "scripts/review-findings.ts",
    "scripts/with-test-db.ts",
    "scripts/services-run.ts",
    "scripts/ensure-services.ts",
    "scripts/db-reset.ts",
    // The tooling's own configuration.
    "drizzle.config.ts",
    "next.config.ts",
    "playwright.config.ts",
    "postcss.config.mjs",
    "sentry.edge.config.ts",
    "sentry.server.config.ts",
    "vitest.config.ts",
    "vitest.setup.ts",
  ];

  it("excludes exactly these files, and no others", () => {
    const entries = parseSonarProperty(PROPERTIES, "sonar.coverage.exclusions");

    expect([...entries].sort()).toEqual([...EXPECTED].sort());
  });

  it("excludes nothing that no longer exists", () => {
    /**
     * #258 removed two exclusions for files that had been deleted long before.
     * A coverage exclusion for a file that does not exist is how a real gap
     * hides later: the entry looks considered, and covers nothing.
     */
    const missing = parseSonarProperty(PROPERTIES, "sonar.coverage.exclusions").filter(
      (entry) => !existsSync(entry)
    );

    expect(missing).toEqual([]);
  });

  it("states a count for each group, so a silent removal cannot pass", () => {
    // A missing line would otherwise make its assertion compare undefined with
    // undefined, which passes and proves nothing.
    expect(Object.keys(statedCounts()).sort()).toEqual([...GROUPS, "total"].sort());
  });
});
