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
  excluded: ReadonlySet<string> | readonly string[],
  measured: ReadonlySet<string>
): GapReport {
  // Patterns, not literals — Sonar reads both exclusion lists that way, so a
  // `scripts/**` entry must exclude what Sonar excludes rather than nothing.
  const patterns = [...excluded];
  const required = sourceFiles
    .map(toPosixPath)
    .filter((file) => !matchesAnyPattern(file, patterns));

  const missing = required
    .filter((file) => !measured.has(file))
    // Ordered for a person to read down, unlike the hash ordering in
    // `refresh-diff.ts` — so locale collation is the right one here.
    .sort((left, right) => left.localeCompare(right));

  // The count is of the files this guard *required* to be measured, not of
  // every entry in the coverage report: a coverage-excluded file that some test
  // happens to import appears there too, and counting it would overstate what
  // was checked in the one line a reader takes at face value.
  if (missing.length === 0) return { ok: true, measured: required.length };

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

/**
 * One comma-separated property, read from Sonar's own configuration file.
 *
 * General rather than one function per key, because the guard needs three of
 * them — `sonar.sources`, `sonar.exclusions` and `sonar.coverage.exclusions` —
 * and its whole purpose is to fail for the reasons Sonar fails. Any list it
 * kept separately would be free to drift from the one Sonar reads.
 *
 * Sliced rather than split on `=`: the line begins with the key, so this is
 * total. `split("=")[1] ?? ""` needed a fallback that could never run, which
 * lcov duly reported as an uncovered condition.
 */
export function parseSonarProperty(properties: string, key: string): string[] {
  const prefix = `${key}=`;
  const line = properties.split("\n").find((candidate) => candidate.startsWith(prefix));
  if (line === undefined) return [];

  return line
    .slice(prefix.length)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
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
  excluded: ReadonlySet<string> | readonly string[],
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

  const patterns = [...excluded];
  return [...perFile.entries()]
    .filter(([name]) => !matchesAnyPattern(name, patterns))
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
  // A loop rather than `/\/+$/`, which backtracks over a run of separators,
  // retrying from each one — quadratic on a path made of them. `breadcrumb.ts`
  // already documents that trap, and this is the same one.
  let base = normalisedRoot;
  while (base.endsWith("/")) base = base.slice(0, -1);
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

/**
 * One Sonar path pattern, as a regular expression.
 *
 * Sonar's exclusion entries are **patterns, not literals**: `tests/**` and
 * `**‌/*.ico` are both in this repository's `sonar.exclusions` today, and
 * `sonar.coverage.exclusions` is read with the same syntax even though every
 * entry there happens to be a literal path. Comparing them as strings meant the
 * guard and Sonar disagreed about which files are excluded — the guard failing
 * the build for files Sonar deliberately ignores.
 *
 * The syntax is small: `**` spans directories, `*` spans characters within one
 * segment, `?` is a single character. Everything else is literal, which is why
 * the escape below comes first — `drizzle.config.ts` must not match
 * `drizzleXconfig.ts`.
 *
 * Hand-written rather than reaching for `minimatch`: it is present in
 * `node_modules` only as somebody else's transitive dependency, and a build
 * gate should not rest on a package that can vanish when an unrelated tree
 * changes.
 */
const REGEXP_METACHARACTERS = new Set([
  ".",
  "+",
  "^",
  "$",
  "{",
  "}",
  "(",
  ")",
  "|",
  "[",
  "]",
  "\\",
]);

export function sonarPatternToRegExp(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] as string;

    if (character === "*") {
      const isDoubled = pattern[index + 1] === "*";
      if (isDoubled && pattern[index + 2] === "/") {
        // `**/` — any number of directories, including none.
        source += "(?:[^/]*/)*";
        index += 2;
        continue;
      }
      if (isDoubled) {
        source += ".*";
        index += 1;
        continue;
      }
      source += "[^/]*";
      continue;
    }

    if (character === "?") {
      source += "[^/]";
      continue;
    }

    source += REGEXP_METACHARACTERS.has(character) ? `\\${character}` : character;
  }

  return new RegExp(`^${source}$`);
}

export function matchesAnyPattern(file: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => sonarPatternToRegExp(pattern).test(file));
}

/**
 * Whether Sonar would prune a whole directory, so the walk can skip it.
 *
 * Asked by testing a sentinel path inside it rather than by looking for a
 * `dir/**` entry: that keeps one rule — the patterns themselves — instead of a
 * second, simpler rule that would drift from it.
 */
export function isPrunedDirectory(directory: string, patterns: readonly string[]): boolean {
  return matchesAnyPattern(`${directory}/__any__`, patterns);
}
