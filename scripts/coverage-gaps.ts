import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  describeUncoveredBranches,
  findCoverageGaps,
  findUncoveredBranches,
  parseSonarExclusions,
  toPosixPath,
} from "./coverage-gaps-plan";

/**
 * Fails the unit suite when a source file is missing from the coverage report
 * entirely — see `coverage-gaps-plan.ts` for why that is not the same as 0%.
 *
 * Run from `npm run test:unit`, so the local suite fails for the same reason
 * Sonar would, before a push rather than after one.
 */

const ROOT = process.cwd();
const SOURCE_ROOTS = ["src", "scripts"];
const SOURCE_SUFFIXES = [".ts", ".tsx"];
/** Type-only files compile to nothing and so appear in no coverage report. */
const TYPES_ONLY_SUFFIX = ".d.ts";

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    const isSource = SOURCE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix));
    if (!isSource || entry.name.endsWith(TYPES_ONLY_SUFFIX)) return [];
    return [relative];
  });
}

function measuredFiles(): Set<string> {
  const parsed = JSON.parse(
    readFileSync(path.join(ROOT, "coverage/coverage-final.json"), "utf8")
  ) as Record<string, unknown>;
  // Normalised, because `path.relative` answers with backslashes on Windows
  // while the exclusion list and lcov use forward slashes.
  return new Set(Object.keys(parsed).map((absolute) => toPosixPath(path.relative(ROOT, absolute))));
}

const exclusions = parseSonarExclusions(
  readFileSync(path.join(ROOT, "sonar-project.properties"), "utf8")
);

const report = findCoverageGaps(SOURCE_ROOTS.flatMap(sourceFiles), exclusions, measuredFiles());

if (!report.ok) {
  process.stderr.write(`\n${report.message}\n`);
  process.exit(1);
}

/**
 * The second half: files are measured, but lcov may still hold a condition that
 * was never taken. lcov writes absolute paths, so the root is handed over and
 * stripped there — by prefix, never by a regex built from a filesystem path.
 */
const uncovered = findUncoveredBranches(
  readFileSync(path.join(ROOT, "coverage/lcov.info"), "utf8"),
  exclusions,
  ROOT
);

if (uncovered.length > 0) {
  process.stderr.write(`\n${describeUncoveredBranches(uncovered)}\n`);
  process.exit(1);
}

process.stdout.write(
  `Coverage measures all ${report.measured} source files, with no lcov condition untaken.\n`
);
