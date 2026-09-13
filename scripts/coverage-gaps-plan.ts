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
    .filter((file) => !excluded.has(file))
    .filter((file) => !measured.has(file))
    .sort();

  if (missing.length === 0) return { ok: true, measured: measured.size };

  return {
    ok: false,
    message:
      `No test imports these ${missing.length} file(s), so coverage does not measure them:\n` +
      `${missing.map((file) => `  ${file}`).join("\n")}\n\n` +
      "vitest will still report 100% — it only measures what a test imports — while\n" +
      "Sonar indexes the source tree and scores each of these 0%.\n\n" +
      "Write a test that imports the file, or add it to sonar.coverage.exclusions\n" +
      "with the reason, next to the runners already listed there.",
  };
}

/** Reads the exclusion list out of the properties file, so there is one copy. */
export function parseSonarExclusions(properties: string): Set<string> {
  const line = properties
    .split("\n")
    .find((candidate) => candidate.startsWith("sonar.coverage.exclusions="));
  if (line === undefined) return new Set();

  return new Set(
    (line.split("=")[1] ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "")
  );
}
