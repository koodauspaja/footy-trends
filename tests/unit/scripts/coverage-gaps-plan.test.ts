import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeUncoveredBranches,
  findCoverageGaps,
  findUncoveredBranches,
  parseSonarExclusions,
} from "../../../scripts/coverage-gaps-plan";

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

/**
 * The half of the guard that reads lcov rather than the JSON summary.
 *
 * It exists because vitest's v8 provider and lcov model branches differently:
 * the text summary can say `Branches: 100%` while lcov — which is what Sonar
 * consumes — still records conditions never taken. #381 shipped exactly that.
 */
describe("findUncoveredBranches", () => {
  const lcov = (body: string) => `TN:\n${body}\nend_of_record\n`;

  it("finds nothing when every branch was taken", () => {
    expect(
      findUncoveredBranches(lcov("SF:src/a.ts\nBRDA:10,0,0,3\nBRDA:10,0,1,1"), new Set())
    ).toEqual([]);
  });

  it("reports a branch reached but never taken", () => {
    expect(
      findUncoveredBranches(lcov("SF:src/a.ts\nBRDA:10,0,0,3\nBRDA:10,0,1,0"), new Set())
    ).toEqual(["src/a.ts: line(s) 10"]);
  });

  it("reports a branch never reached at all", () => {
    // `-` rather than `0`: lcov distinguishes "never taken" from "never even
    // evaluated", and both are gaps.
    expect(findUncoveredBranches(lcov("SF:src/a.ts\nBRDA:7,0,0,-"), new Set())).toEqual([
      "src/a.ts: line(s) 7",
    ]);
  });

  it("collects every line of one file into a single entry, in order", () => {
    expect(
      findUncoveredBranches(
        lcov("SF:src/a.ts\nBRDA:30,0,0,0\nBRDA:4,0,0,0\nBRDA:12,0,0,0"),
        new Set()
      )
    ).toEqual(["src/a.ts: line(s) 4, 12, 30"]);
  });

  it("does not merge two files' lines together", () => {
    const report = findUncoveredBranches(
      `${lcov("SF:src/b.ts\nBRDA:2,0,0,0")}${lcov("SF:src/a.ts\nBRDA:5,0,0,0")}`,
      new Set()
    );

    expect(report).toEqual(["src/a.ts: line(s) 5", "src/b.ts: line(s) 2"]);
  });

  it("respects the exclusion list, so a runner does not fail the suite", () => {
    expect(
      findUncoveredBranches(
        lcov("SF:scripts/runner.ts\nBRDA:3,0,0,0"),
        new Set(["scripts/runner.ts"])
      )
    ).toEqual([]);
  });

  it("ignores lines that are neither a file nor a branch record", () => {
    expect(
      findUncoveredBranches(lcov("SF:src/a.ts\nFN:1,thing\nDA:1,1\nBRF:0\nBRH:0"), new Set())
    ).toEqual([]);
  });
});

describe("describeUncoveredBranches", () => {
  it("names the files and explains why the local summary disagreed", () => {
    const message = describeUncoveredBranches(["src/a.ts: line(s) 10"]);

    expect(message).toContain("1 file(s)");
    expect(message).toContain("src/a.ts: line(s) 10");
    expect(message).toContain("lcov is what Sonar reads");
  });
});
