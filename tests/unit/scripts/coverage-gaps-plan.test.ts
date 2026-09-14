import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeUncoveredBranches,
  findCoverageGaps,
  findUncoveredBranches,
  isPrunedDirectory,
  isSourceFile,
  matchesAnyPattern,
  parseSonarProperty,
  sonarPatternToRegExp,
  toPosixPath,
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

  it("counts what it required, not every entry in the coverage report", () => {
    // A coverage-excluded file that some test happens to import is in the
    // report too. Counting it would overstate what was checked, in the one
    // line a reader takes at face value.
    const report = findCoverageGaps(
      ["src/a.ts", "scripts/runner.ts"],
      ["scripts/**"],
      new Set(["src/a.ts", "scripts/runner.ts", "src/unrelated.ts"])
    );

    expect(report).toEqual({ ok: true, measured: 1 });
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

describe("parseSonarProperty", () => {
  const PROPERTIES =
    "sonar.sources=.\nsonar.exclusions=tests/**,**/*.ico\nsonar.coverage.exclusions=a.ts,b/c.ts, d.ts \nsonar.other=x\n";

  it("reads the list Sonar actually uses", () => {
    expect(parseSonarProperty(PROPERTIES, "sonar.coverage.exclusions")).toEqual([
      "a.ts",
      "b/c.ts",
      "d.ts",
    ]);
  });

  it("reads each of the three keys the guard needs", () => {
    expect(parseSonarProperty(PROPERTIES, "sonar.sources")).toEqual(["."]);
    expect(parseSonarProperty(PROPERTIES, "sonar.exclusions")).toEqual(["tests/**", "**/*.ico"]);
  });

  it("does not confuse one key with another that shares its prefix", () => {
    // `sonar.exclusions` and `sonar.coverage.exclusions` both end in the same
    // word; reading the wrong one would silently widen or narrow the guard.
    expect(parseSonarProperty(PROPERTIES, "sonar.exclusions")).not.toContain("a.ts");
  });

  it("answers empty when the property is absent, rather than throwing", () => {
    expect(parseSonarProperty("sonar.sources=.\n", "sonar.coverage.exclusions")).toEqual([]);
  });

  it("ignores an empty entry from a trailing comma", () => {
    expect(
      parseSonarProperty("sonar.coverage.exclusions=a.ts,\n", "sonar.coverage.exclusions")
    ).toEqual(["a.ts"]);
  });

  it("reads the repository's own properties file without finding it empty", () => {
    // The guard is worthless if this ever silently parses to nothing.
    const properties = readFileSync(path.join(process.cwd(), "sonar-project.properties"), "utf8");

    expect(parseSonarProperty(properties, "sonar.sources")).toEqual(["."]);
    expect(parseSonarProperty(properties, "sonar.exclusions").length).toBeGreaterThan(10);
    expect(parseSonarProperty(properties, "sonar.coverage.exclusions")).toContain(
      "scripts/coverage-gaps.ts"
    );
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

  it("strips an absolute root, so lcov paths match the exclusion list", () => {
    expect(
      findUncoveredBranches(
        lcov("SF:/home/me/repo/src/a.ts\nBRDA:3,0,0,0"),
        new Set(),
        "/home/me/repo"
      )
    ).toEqual(["src/a.ts: line(s) 3"]);
  });

  it.each([
    ["many trailing separators", "/repo///", "/repo/src/a.ts"],
    ["a root that is only separators", "///", "/src/a.ts"],
  ])("strips %s without scanning them repeatedly", (_case, root, file) => {
    // `/\/+$/` backtracks over a run of separators, retrying from each one —
    // quadratic on a path made of them, which `breadcrumb.ts` already documents.
    expect(
      findUncoveredBranches(`SF:${file}\nBRDA:3,0,0,0\nend_of_record`, new Set(), root)
    ).toEqual(["src/a.ts: line(s) 3"]);
  });

  it("handles a root containing regex metacharacters", () => {
    // A pattern built from the path would treat `.` and `+` as wildcards and
    // leave the filename absolute, which looks like a coverage gap rather than
    // like a path bug.
    const root = "/home/me/my.repo+v2(old)";
    expect(
      findUncoveredBranches(lcov(`SF:${root}/src/a.ts\nBRDA:3,0,0,0`), new Set(), root)
    ).toEqual(["src/a.ts: line(s) 3"]);
  });

  it("leaves a path that does not begin with the root alone", () => {
    expect(
      findUncoveredBranches(lcov("SF:src/a.ts\nBRDA:3,0,0,0"), new Set(), "/elsewhere")
    ).toEqual(["src/a.ts: line(s) 3"]);
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

describe("toPosixPath", () => {
  it("rewrites Windows separators, which the exclusion list never uses", () => {
    // `path.join` answers with backslashes there, while
    // `sonar.coverage.exclusions` and lcov both use forward slashes — so
    // without this every excluded file would read as a coverage gap.
    expect(toPosixPath("src\\lib\\a.ts")).toBe("src/lib/a.ts");
  });

  it("leaves a posix path alone", () => {
    expect(toPosixPath("src/lib/a.ts")).toBe("src/lib/a.ts");
  });
});

describe("separators, end to end", () => {
  it("matches an exclusion written with forward slashes against a Windows path", () => {
    expect(
      findCoverageGaps(["scripts\\runner.ts"], new Set(["scripts/runner.ts"]), new Set()).ok
    ).toBe(true);
  });

  it("reports a Windows path in the posix form the message should show", () => {
    const report = findCoverageGaps(["src\\lib\\a.ts"], new Set(), new Set());

    expect(report.ok).toBe(false);
    if (report.ok) return;
    expect(report.message).toContain("src/lib/a.ts");
  });

  it("strips a Windows root from an lcov path", () => {
    expect(
      findUncoveredBranches(
        "SF:C:\\repo\\src\\a.ts\nBRDA:3,0,0,0\nend_of_record",
        new Set(),
        "C:\\repo"
      )
    ).toEqual(["src/a.ts: line(s) 3"]);
  });
});

describe("isSourceFile", () => {
  it.each([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"])(
    "counts a %s file, because the coverage provider would instrument one",
    (suffix) => {
      // Only `.ts` and `.tsx` exist under src/ and scripts/ today. The rest are
      // covered because a guard that quietly ignores a file Sonar scores is
      // worse than no guard.
      expect(isSourceFile(`thing${suffix}`)).toBe(true);
    }
  );

  it.each([".d.ts", ".d.mts", ".d.cts"])("ignores a %s declaration file", (suffix) => {
    // They compile to nothing, so no coverage report can mention them.
    expect(isSourceFile(`thing${suffix}`)).toBe(false);
  });

  it.each([".css", ".ico", ".json", ".md", ""])("ignores a %s file", (suffix) => {
    expect(isSourceFile(`thing${suffix}`)).toBe(false);
  });

  it("does not mistake a name merely containing an extension", () => {
    expect(isSourceFile("ts")).toBe(false);
    expect(isSourceFile("thing.ts.bak")).toBe(false);
  });
});

describe("a checkout at a filesystem root", () => {
  it.each([
    ["posix root", "/", "/src/a.ts"],
    ["windows drive root", "C:\\", "C:\\src\\a.ts"],
    ["a root written with a trailing slash", "/repo/", "/repo/src/a.ts"],
  ])("makes an lcov path relative under a %s", (_case, root, file) => {
    // Appending a separator to a root that already ends in one builds `//` or
    // `C://`, which no lcov path starts with — so nothing would be made
    // relative and every excluded file would read as uncovered.
    expect(
      findUncoveredBranches(`SF:${file}\nBRDA:3,0,0,0\nend_of_record`, new Set(), root)
    ).toEqual(["src/a.ts: line(s) 3"]);
  });
});

/**
 * Sonar's exclusion entries are patterns, not literals. Comparing them as
 * strings made the guard and Sonar disagree about which files are excluded —
 * the guard failing a build for files Sonar deliberately ignores.
 */
describe("sonarPatternToRegExp", () => {
  const matches = (pattern: string, file: string) => sonarPatternToRegExp(pattern).test(file);

  it("matches a literal path exactly", () => {
    expect(matches("src/lib/redis.ts", "src/lib/redis.ts")).toBe(true);
    expect(matches("src/lib/redis.ts", "src/lib/redis.tsx")).toBe(false);
    expect(matches("src/lib/redis.ts", "other/src/lib/redis.ts")).toBe(false);
  });

  it("treats a dot in a literal as a dot", () => {
    // Unescaped it is a wildcard, and `drizzle.config.ts` would swallow
    // `drizzleXconfig.ts` — an exclusion quietly covering a file nobody meant.
    expect(matches("drizzle.config.ts", "drizzleXconfig.ts")).toBe(false);
    expect(matches("drizzle.config.ts", "drizzle.config.ts")).toBe(true);
  });

  it("spans directories with **", () => {
    expect(matches("tests/**", "tests/a.ts")).toBe(true);
    expect(matches("tests/**", "tests/unit/lib/a.ts")).toBe(true);
    expect(matches("tests/**", "testsuite/a.ts")).toBe(false);
  });

  it("makes a leading **/ optional, so it matches at the root too", () => {
    expect(matches("**/*.ico", "favicon.ico")).toBe(true);
    expect(matches("**/*.ico", "src/app/favicon.ico")).toBe(true);
    expect(matches("**/*.ico", "src/app/favicon.png")).toBe(false);
  });

  it("stops a single * at a separator", () => {
    expect(matches("src/*.ts", "src/a.ts")).toBe(true);
    expect(matches("src/*.ts", "src/lib/a.ts")).toBe(false);
  });

  it("matches exactly one character with ?", () => {
    expect(matches("src/a?.ts", "src/ab.ts")).toBe(true);
    expect(matches("src/a?.ts", "src/abc.ts")).toBe(false);
  });

  it("handles every pattern this repository actually uses", () => {
    const properties = readFileSync(path.join(process.cwd(), "sonar-project.properties"), "utf8");
    const patterns = [
      ...parseSonarProperty(properties, "sonar.exclusions"),
      ...parseSonarProperty(properties, "sonar.coverage.exclusions"),
    ];

    // Not an assertion about any one pattern — an assertion that none of them
    // blows up the converter, which a hand-written one could.
    for (const pattern of patterns) {
      expect(() => sonarPatternToRegExp(pattern)).not.toThrow();
    }
    expect(patterns.length).toBeGreaterThan(20);
  });
});

describe("matchesAnyPattern", () => {
  it("excludes a file covered by a wildcard entry, as Sonar would", () => {
    // The case that made this necessary: `scripts/**` excluded nothing at all
    // when entries were compared as strings.
    expect(matchesAnyPattern("scripts/runner.ts", ["scripts/**"])).toBe(true);
  });

  it("leaves a file no pattern covers", () => {
    expect(matchesAnyPattern("src/lib/a.ts", ["scripts/**", "tests/**"])).toBe(false);
  });

  it("is false for no patterns at all", () => {
    expect(matchesAnyPattern("src/lib/a.ts", [])).toBe(false);
  });
});

describe("isPrunedDirectory", () => {
  it("prunes a directory Sonar excludes wholesale", () => {
    expect(isPrunedDirectory("node_modules", ["node_modules/**"])).toBe(true);
    expect(isPrunedDirectory("tests", ["tests/**"])).toBe(true);
  });

  it("does not prune a directory that merely has excluded files in it", () => {
    // `**/*.ico` excludes icons, not the folder holding them.
    expect(isPrunedDirectory("src/app", ["**/*.ico"])).toBe(false);
  });

  it("does not prune a source directory", () => {
    expect(isPrunedDirectory("src", ["node_modules/**", "tests/**"])).toBe(false);
  });
});

describe("exclusions as patterns, end to end", () => {
  it("accepts a file covered by a wildcard coverage exclusion", () => {
    expect(findCoverageGaps(["scripts/runner.ts"], ["scripts/**"], new Set()).ok).toBe(true);
  });

  it("still reports a file no pattern covers", () => {
    const report = findCoverageGaps(["src/lib/a.ts"], ["scripts/**"], new Set());

    expect(report.ok).toBe(false);
    if (report.ok) return;
    expect(report.message).toContain("src/lib/a.ts");
  });

  it("applies the same patterns to lcov conditions", () => {
    expect(
      findUncoveredBranches("SF:scripts/runner.ts\nBRDA:3,0,0,0\nend_of_record", ["scripts/**"])
    ).toEqual([]);
  });
});
