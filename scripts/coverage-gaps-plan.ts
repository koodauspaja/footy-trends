/**
 * Which source files the coverage report does not mention, and what to say
 * about them.
 *
 * Pure, so the rule can be tested without running a coverage pass — the split
 * `grant-admin-plan.ts` established.
 */

export type GapReport = { ok: true; measured: number } | { ok: false; message: string };

/**
 * `vitest --coverage` only measures files some test imports. A file no test
 * touches is not reported as 0% — it is **absent**, so the summary still says
 * 100% and the gate stays green while Sonar, which indexes the source tree,
 * scores it 0%.
 *
 * This has caught the repository out three times: `admin-user-table.tsx` and
 * `app/admin/page.tsx` in #370, `generate-migration.ts` in #376, and
 * `refresh-actions.ts` in #381.
 */
export function findCoverageGaps(
  sourceFiles: readonly string[],
  excluded: ReadonlySet<string>,
  measured: ReadonlySet<string>
): GapReport {
  const missing = sourceFiles
    .map(toPosixPath)
    .filter((file) => !excluded.has(file))
    .filter((file) => !measured.has(file))
    // Ordered for a person to read down, unlike the hash ordering in
    // `refresh-diff.ts` — so locale collation is the right one here.
    .sort((left, right) => left.localeCompare(right));

  if (missing.length === 0) return { ok: true, measured: measured.size };

  const listed = missing.map((file) => `  ${file}`).join("\n");

  return {
    ok: false,
    message: [
      `No test imports these ${missing.length} file(s), so coverage does not measure them:`,
      listed,
      "",
      "vitest will still report 100% — it only measures what a test imports — while",
      "Sonar indexes the source tree and scores each of these 0%.",
      "",
      "Write a test that imports the file, or add it to sonar.coverage.exclusions",
      "with the reason, next to the runners already listed there.",
    ].join("\n"),
  };
}

const EXCLUSIONS_PREFIX = "sonar.coverage.exclusions=";

/** Reads the exclusion list out of the properties file, so there is one copy. */
export function parseSonarExclusions(properties: string): Set<string> {
  const line = properties.split("\n").find((candidate) => candidate.startsWith(EXCLUSIONS_PREFIX));
  if (line === undefined) return new Set();

  // Sliced rather than split on `=`: the line begins with the prefix, so this
  // is total. `split("=")[1] ?? ""` needed a fallback that could never run,
  // which lcov duly reported as an uncovered condition.
  return new Set(
    line
      .slice(EXCLUSIONS_PREFIX.length)
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "")
  );
}

/**
 * Branches that lcov records as never taken.
 *
 * **Not the same as vitest's branch percentage.** vitest's v8 provider and
 * lcov's `BRDA` records model branches differently, so the text summary can
 * read `Branches: 100%` while lcov — which is what Sonar consumes — still has
 * conditions with a hit count of zero. That is precisely how #381 reached Sonar
 * showing `refresh-actions.ts` at 94.4% with two uncovered conditions while the
 * local suite reported everything green.
 *
 * The two that were hiding were real: three actions each decode the competition
 * independently, and only one of them had been exercised.
 */
export function findUncoveredBranches(
  lcov: string,
  excluded: ReadonlySet<string>,
  root = ""
): string[] {
  const perFile = new Map<string, Set<number>>();
  let file = "";

  for (const line of lcov.split("\n")) {
    if (line.startsWith("SF:")) {
      file = relativeTo(root, line.slice("SF:".length).trim());
      continue;
    }
    if (!line.startsWith("BRDA:")) continue;

    // `BRDA:<line>,<block>,<branch>,<taken>` — `-` means the branch was never
    // reached at all, `0` that it was reached and never taken.
    const [lineNumber, , , taken] = line.slice("BRDA:".length).split(",");
    if (taken !== "0" && taken !== "-") continue;

    const existing = perFile.get(file) ?? new Set<number>();
    existing.add(Number(lineNumber));
    perFile.set(file, existing);
  }

  return [...perFile.entries()]
    .filter(([name]) => !excluded.has(name))
    .map(([name, lines]) => `${name}: line(s) ${[...lines].sort((a, b) => a - b).join(", ")}`)
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Separators as the exclusion list and lcov write them.
 *
 * `path.join` and `path.relative` answer with backslashes on Windows, while
 * `sonar.coverage.exclusions` and lcov both use forward slashes — so without
 * this the guard would match nothing there and report every excluded file as a
 * coverage gap. `scripts/executable.ts` documents the neighbouring trap.
 */
export function toPosixPath(file: string): string {
  return file.replaceAll("\\", "/");
}

/**
 * lcov writes absolute paths; the exclusion list is repository-relative.
 *
 * A plain prefix check rather than a regex built from the root: a checkout under
 * a directory containing `.`, `+` or `(` would make that pattern match the
 * wrong thing, and the failure would look like a coverage gap rather than like
 * a path bug.
 */
function relativeTo(root: string, file: string): string {
  const normalised = toPosixPath(file);
  const normalisedRoot = toPosixPath(root);
  // No root supplied: the paths are already relative.
  if (normalisedRoot === "") return normalised;

  /**
   * A trailing separator is stripped before one is added, because a checkout at
   * `/` or at a Windows drive root normalises to `/` or `C:/` and appending
   * another would build `//` — a prefix no lcov path starts with, so nothing
   * would be made relative and every excluded file would read as uncovered.
   *
   * Stripping it can leave nothing at all, which is the root directory itself
   * rather than "no root": that case is a prefix of one separator.
   */
  const base = normalisedRoot.replace(/\/+$/, "");
  const prefix = base === "" ? "/" : `${base}/`;
  return normalised.startsWith(prefix) ? normalised.slice(prefix.length) : normalised;
}

export function describeUncoveredBranches(entries: readonly string[]): string {
  return [
    `lcov records a condition never taken in ${entries.length} file(s):`,
    ...entries.map((entry) => `  ${entry}`),
    "",
    "vitest's own summary can still say Branches: 100% — its v8 provider and",
    "lcov model branches differently — but lcov is what Sonar reads, so these",
    "are the conditions it will report as uncovered.",
  ].join("\n");
}

/**
 * Every extension the coverage provider can instrument, so a file it would
 * measure cannot slip past the guard by being named something else.
 *
 * Only `.ts` and `.tsx` exist under `src/` and `scripts/` today. The rest are
 * here because the guard's value is that it cannot be quietly wrong: a `.mjs`
 * added later would be indexed by Sonar and scored, and a guard that did not
 * look at it would report all clear while the gate failed.
 */
const SOURCE_SUFFIXES = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** Declaration files compile to nothing, so no coverage report mentions them. */
const DECLARATION = /\.d\.(ts|mts|cts)$/;

export function isSourceFile(name: string): boolean {
  if (DECLARATION.test(name)) return false;
  return SOURCE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}
