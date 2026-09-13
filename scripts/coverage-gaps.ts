import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { findCoverageGaps, parseSonarExclusions } from "./coverage-gaps-plan";

/**
 * Fails the unit suite when a source file is missing from the coverage report
 * entirely — see `coverage-gaps-plan.ts` for why that is not the same as 0%.
 *
 * Run from `npm run test:unit`, so the local suite fails for the same reason
 * Sonar would, before a push rather than after one.
 */

const ROOT = process.cwd();
const SOURCE_ROOTS = ["src", "scripts"];
const SOURCE_FILE = /\.(ts|tsx)$/;
/** Type-only files compile to nothing and so appear in no coverage report. */
const TYPES_ONLY = /\.d\.ts$/;

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    if (!SOURCE_FILE.test(entry.name) || TYPES_ONLY.test(entry.name)) return [];
    return [relative];
  });
}

function measuredFiles(): Set<string> {
  const parsed = JSON.parse(
    readFileSync(path.join(ROOT, "coverage/coverage-final.json"), "utf8")
  ) as Record<string, unknown>;
  return new Set(Object.keys(parsed).map((absolute) => path.relative(ROOT, absolute)));
}

const report = findCoverageGaps(
  SOURCE_ROOTS.flatMap(sourceFiles),
  parseSonarExclusions(readFileSync(path.join(ROOT, "sonar-project.properties"), "utf8")),
  measuredFiles()
);

if (!report.ok) {
  process.stderr.write(`\n${report.message}\n`);
  process.exit(1);
}

process.stdout.write(`Coverage measures all ${report.measured} source files.\n`);
