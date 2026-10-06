import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  describeUncoveredBranches,
  findCoverageGaps,
  findUncoveredBranches,
  isPrunedDirectory,
  isSourceFile,
  matchesAnyPattern,
  parseSonarProperty,
  toPosixPath,
} from "./coverage-gaps-plan";

/**
 * Fails the unit suite when a source file is missing from the coverage report
 * entirely, or when lcov records a condition never taken. Its scope is
 * Sonar's, read from Sonar's own configuration.
 *
 * decisions/385-untested-source-files-fail.md
 */

const ROOT = process.cwd();
const PROPERTIES = readFileSync(path.join(ROOT, "sonar-project.properties"), "utf8");

const sources = parseSonarProperty(PROPERTIES, "sonar.sources");
const indexExclusions = parseSonarProperty(PROPERTIES, "sonar.exclusions");
const coverageExclusions = parseSonarProperty(PROPERTIES, "sonar.coverage.exclusions");

/**
 * `.git` is pruned regardless: Sonar never indexes it.
 *
 * decisions/385-untested-source-files-fail.md
 */
const ALWAYS_PRUNED = [".git/**"];
const prunePatterns = [...indexExclusions, ...ALWAYS_PRUNED];

function sourceFiles(directory: string): string[] {
  const absolute = directory === "." ? ROOT : path.join(ROOT, directory);

  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = toPosixPath(directory === "." ? entry.name : path.join(directory, entry.name));

    if (entry.isDirectory()) {
      return isPrunedDirectory(relative, prunePatterns) ? [] : sourceFiles(relative);
    }
    if (!isSourceFile(entry.name)) return [];
    // Indexed by Sonar at all? `sonar.exclusions` decides, and a file it never
    // looks at cannot be scored 0% by it.
    return matchesAnyPattern(relative, indexExclusions) ? [] : [relative];
  });
}

function measuredFiles(): Set<string> {
  const parsed = JSON.parse(
    readFileSync(path.join(ROOT, "coverage/coverage-final.json"), "utf8")
  ) as Record<string, unknown>;
  return new Set(Object.keys(parsed).map((absolute) => toPosixPath(path.relative(ROOT, absolute))));
}

const report = findCoverageGaps(sources.flatMap(sourceFiles), coverageExclusions, measuredFiles());

if (!report.ok) {
  process.stderr.write(`\n${report.message}\n`);
  process.exit(1);
}

const uncovered = findUncoveredBranches(
  readFileSync(path.join(ROOT, "coverage/lcov.info"), "utf8"),
  coverageExclusions,
  ROOT
);

if (uncovered.length > 0) {
  process.stderr.write(`\n${describeUncoveredBranches(uncovered)}\n`);
  process.exit(1);
}

process.stdout.write(
  `Coverage measures all ${report.measured} source files Sonar scores, with no lcov condition untaken.\n`
);
