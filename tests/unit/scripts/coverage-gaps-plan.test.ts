import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findCoverageGaps, parseSonarExclusions } from "../../../scripts/coverage-gaps-plan";

/**
 * The guard that stops a source file having no test at all.
 *
 * It exists because `vitest --coverage` cannot report such a file as 0% — it
 * never sees it, so the summary says 100% while Sonar scores it 0%. Three
 * pull requests were caught by Sonar that way before this existed.
 */

describe("findCoverageGaps", () => {
  it("passes when every source file was measured", () => {
    const report = findCoverageGaps(
      ["src/a.ts", "src/b.ts"],
      new Set(),
      new Set(["src/a.ts", "src/b.ts"])
    );

    expect(report).toEqual({ ok: true, measured: 2 });
  });

  it("fails on a file no test imports, and names it", () => {
    const report = findCoverageGaps(["src/a.ts", "src/b.ts"], new Set(), new Set(["src/a.ts"]));

    expect(report.ok).toBe(false);
    if (report.ok) return;
    expect(report.message).toContain("src/b.ts");
    expect(report.message).toContain("1 file(s)");
  });

  it("says what to do about it, rather than only that it happened", () => {
    const report = findCoverageGaps(["src/b.ts"], new Set(), new Set());

    expect(report.ok).toBe(false);
    if (report.ok) return;
    expect(report.message).toContain("sonar.coverage.exclusions");
  });

  it("accepts a file Sonar is told not to score", () => {
    // The runners cannot be imported by a test, which is why that list exists.
    const report = findCoverageGaps(
      ["scripts/runner.ts"],
      new Set(["scripts/runner.ts"]),
      new Set()
    );

    expect(report.ok).toBe(true);
  });

  it("names every gap, in a stable order", () => {
    const report = findCoverageGaps(["src/z.ts", "src/a.ts", "src/m.ts"], new Set(), new Set());

    expect(report.ok).toBe(false);
    if (report.ok) return;
    expect(report.message).toContain("  src/a.ts\n  src/m.ts\n  src/z.ts");
  });

  it("does not mind the report mentioning a file that is no longer on disk", () => {
    // A deleted file lingering in a stale report is not a coverage gap, and
    // failing on it would make the guard fire for the wrong reason.
    expect(findCoverageGaps(["src/a.ts"], new Set(), new Set(["src/a.ts", "src/gone.ts"])).ok).toBe(
      true
    );
  });
});

describe("parseSonarExclusions", () => {
  it("reads the list Sonar actually uses", () => {
    const parsed = parseSonarExclusions(
      "sonar.sources=.\nsonar.coverage.exclusions=a.ts,b/c.ts, d.ts \nsonar.other=x\n"
    );

    expect([...parsed].sort()).toEqual(["a.ts", "b/c.ts", "d.ts"]);
  });

  it("answers empty when the property is absent, rather than throwing", () => {
    expect(parseSonarExclusions("sonar.sources=.\n").size).toBe(0);
  });

  it("ignores an empty entry from a trailing comma", () => {
    expect(parseSonarExclusions("sonar.coverage.exclusions=a.ts,\n").size).toBe(1);
  });

  it("reads the repository's own properties file without finding it empty", () => {
    // The guard is worthless if this ever silently parses to nothing.
    const parsed = parseSonarExclusions(
      readFileSync(path.join(process.cwd(), "sonar-project.properties"), "utf8")
    );

    expect(parsed.size).toBeGreaterThan(10);
    expect(parsed.has("scripts/coverage-gaps.ts")).toBe(true);
  });
});
