/**
 * Which source files the coverage report does not mention, and what to say
 * about them. Pure, so the rule can be tested without running a coverage pass.
 *
 * decisions/385-untested-source-files-fail.md
 */

export type GapReport = { ok: true; measured: number } | { ok: false; message: string };

/**
 * The source files no test imports. `vitest --coverage` leaves such a file out
 * of its report where one would expect 0%, so the summary still says 100%.
 *
 * decisions/385-untested-source-files-fail.md
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

  // The count is of the files this guard required to be measured, not of every
  // entry in the coverage report.
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
 * decisions/385-untested-source-files-fail.md
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
 * Branches that lcov records as never taken. Not the same as vitest's branch
 * percentage: lcov is what Sonar consumes.
 *
 * decisions/385-untested-source-files-fail.md
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
 * Separators as the exclusion list and lcov write them: forward slashes, also
 * on Windows.
 *
 * decisions/385-untested-source-files-fail.md
 */
export function toPosixPath(file: string): string {
  return file.replaceAll("\\", "/");
}

/**
 * A path made repository-relative: lcov writes absolute paths. A plain prefix
 * check, not a regex built from the root.
 *
 * decisions/385-untested-source-files-fail.md
 */
function relativeTo(root: string, file: string): string {
  const normalised = toPosixPath(file);
  const normalisedRoot = toPosixPath(root);
  // No root supplied: the paths are already relative.
  if (normalisedRoot === "") return normalised;

  // A trailing separator is stripped before one is added, so a root of `/` or
  // `C:/` does not become `//`; nothing left means the root itself. A loop,
  // not `/\/+$/`, which backtracks over a run of separators.
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
 * decisions/385-untested-source-files-fail.md
 */
const SOURCE_SUFFIXES = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/**
 * Declaration files compile to nothing, so no coverage report mentions them.
 *
 * decisions/385-untested-source-files-fail.md
 */
const DECLARATION = /\.d\.(ts|mts|cts)$/;

export function isSourceFile(name: string): boolean {
  if (DECLARATION.test(name)) return false;
  return SOURCE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * What a Sonar path pattern escapes on its way to a regular expression: `**`
 * spans directories, `*` characters within one segment, `?` one character,
 * and everything else is literal.
 *
 * decisions/385-untested-source-files-fail.md
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
 * Whether Sonar would prune a whole directory, so the walk can skip it. Asked
 * by testing a sentinel path inside it against the patterns themselves.
 *
 * decisions/385-untested-source-files-fail.md
 */
export function isPrunedDirectory(directory: string, patterns: readonly string[]): boolean {
  return matchesAnyPattern(`${directory}/__any__`, patterns);
}
