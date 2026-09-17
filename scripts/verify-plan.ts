/**
 * What `npm run verify` runs, in what order, and how it is kept from becoming a
 * second definition of the gate (#401).
 *
 * Free of the filesystem and `process`, so the rules here are tested directly —
 * the split `services-plan.ts` established.
 */

export type Stage = {
  /** What the workflows call this step, so a failure reads the same in both places. */
  name: string;
  /** The npm script it runs. */
  script: string;
  /** Roughly how long it takes here, which is what decides the order. */
  typical: string;
};

/**
 * **Ordered by how fast a failure arrives, not by importance.**
 *
 * Measured on this machine: lint and typecheck are seconds, the unit suite about
 * 40s with coverage, the shuffled run about 30s, integration about 4s against a
 * database that is already up, and the end-to-end suite about four minutes
 * because it is serial by design (#227) and talks to the real providers.
 *
 * Running the four-minute stage first would waste the whole point of stopping at
 * the first failure.
 */
export const VERIFY_STAGES: readonly Stage[] = [
  { name: "Lint", script: "lint", typical: "~1s" },
  { name: "Typecheck", script: "typecheck", typical: "~5s" },
  { name: "Unit tests", script: "test:unit", typical: "~40s" },
  { name: "Unit tests, shuffled", script: "test:shuffle", typical: "~30s" },
  { name: "Integration tests", script: "test:integration", typical: "~5s" },
  { name: "End-to-end tests", script: "test:e2e", typical: "~4min" },
];

/**
 * The npm scripts a workflow runs that are deliberately **not** verify stages,
 * each with the reason — because "not in the list" and "nobody noticed" look
 * identical otherwise.
 */
export const NOT_A_STAGE: Readonly<Record<string, string>> = {
  "db:migrate":
    "a workflow has to migrate its own fresh service container; locally #399's preflight does it",
  "test:e2e:browser": "installs Chromium once, which `scripts/setup` already does",
  build:
    "the release gate builds before its e2e run; CI does not build, and `verify` is not the release gate",
  "release:version":
    "cuts the tag once every gate is green; it is the release itself, not a check of it",
};

const RUN_PREFIX = "npm run ";

/**
 * **Any non-space token, not a set of characters we thought of.** An npm script
 * may be named `lint.fix` or `deploy@staging`, and a pattern of `[\w:-]+` read
 * such a step as running no script at all — so CI could gain a stage and this
 * audit would stay quiet, which is the one thing it exists not to do. Raised in
 * review on #410.
 */
const RUNS_SCRIPT = /npm run \S+/g;

/**
 * Every `npm run <script>` a workflow file runs.
 *
 * The whole match is sliced rather than a capture group read, because a group is
 * typed as possibly absent and the fallback for it would be a condition no test
 * can take — which `scripts/coverage-gaps.ts` reports, rightly.
 */
export function workflowScripts(workflow: string): string[] {
  return [...workflow.matchAll(RUNS_SCRIPT)].map((match) => match[0].slice(RUN_PREFIX.length));
}

/**
 * Whether a file in `.github/workflows` is a workflow.
 *
 * Both spellings, because GitHub accepts both: a `.yaml` workflow would
 * otherwise be invisible to the audit, and invisible is exactly what a new
 * uncovered stage must not be. Raised in review on #410.
 */
export function isWorkflowFile(name: string): boolean {
  return name.endsWith(".yml") || name.endsWith(".yaml");
}

/**
 * The scripts CI runs that `verify` would not — the thing that makes a green
 * `verify` stop predicting a green CI.
 *
 * This is the answer to #401's own warning: rather than deriving the stages from
 * the workflows at runtime, which would make a broken workflow a broken local
 * command, the duplication is small and a test fails the moment the two
 * disagree.
 */
export function stagesMissingFrom(
  workflowRun: readonly string[],
  stages: readonly Stage[] = VERIFY_STAGES,
  exempt: Readonly<Record<string, string>> = NOT_A_STAGE
): string[] {
  const covered = new Set(stages.map((stage) => stage.script));

  return (
    [...new Set(workflowRun)]
      .filter((script) => !covered.has(script) && !(script in exempt))
      // Sorted so the message reads the same twice, with an explicit comparator:
      // a bare `sort()` orders by UTF-16 code unit, which is a different answer
      // from the alphabetical one it looks like (Sonar S2871).
      .sort((left, right) => left.localeCompare(right))
  );
}

/** How long a stage took, in the units a reader thinks in. */
export function humanDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

/** The line printed before a stage runs, so a long one says what it is waiting on. */
export function startingLine(stage: Stage, position: number, total: number): string {
  return `[${position}/${total}] ${stage.name} — npm run ${stage.script} (${stage.typical})`;
}

export function passedLine(stage: Stage, elapsedMs: number): string {
  return `      ${stage.name} passed in ${humanDuration(elapsedMs)}`;
}

/**
 * Names the stage, not just the exit code: the output above may be thousands of
 * lines of a test runner, and the question a reader has is which gate failed.
 */
export function failureMessage(stage: Stage, elapsedMs: number): string {
  return [
    `${stage.name} failed after ${humanDuration(elapsedMs)} — the output above says why.`,
    "",
    `Run it alone with \`npm run ${stage.script}\`. The stages after it did not run,`,
    "so a green run of this command is still the only thing that means the gate passes.",
  ].join("\n");
}

export function successMessage(stages: readonly Stage[], elapsedMs: number): string {
  return `All ${stages.length} stages passed in ${humanDuration(elapsedMs)}.`;
}
