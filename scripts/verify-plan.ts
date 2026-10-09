/**
 * What `npm run verify` runs, in what order, and how it is kept from becoming a
 * second definition of the gate. Free of the filesystem and `process`.
 *
 * decisions/401-one-command-for-the-gate.md
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
 * The stages, ordered by how fast a failure arrives, not by importance.
 *
 * decisions/401-one-command-for-the-gate.md
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
 * The npm scripts a workflow runs that are deliberately not verify stages, each
 * with the reason.
 *
 * decisions/401-one-command-for-the-gate.md
 * decisions/568-e2e-against-a-production-build.md
 */
export const NOT_A_STAGE: Readonly<Record<string, string>> = {
  "db:migrate":
    "a workflow has to migrate its own fresh service container; locally #399's preflight does it",
  "test:e2e:browser": "installs Chromium once, which `scripts/setup` already does",
  build:
    "the workflows build as a step of their own; locally `test:e2e` builds before it starts its server",
  "release:version":
    "cuts the tag once every gate is green; it is the release itself, not a check of it",
  "check:boxes":
    "reads the issues a pull request closes, so there is nothing for it to read until one exists (#463)",
};

const RUN_PREFIX = "npm run ";

/**
 * An `npm run <script>` in a workflow. Any non-space token is a script name,
 * not a set of characters we thought of.
 *
 * decisions/401-one-command-for-the-gate.md
 */
const RUNS_SCRIPT = /npm run \S+/g;

/**
 * Every `npm run <script>` a workflow file runs.
 *
 * decisions/401-one-command-for-the-gate.md
 */
export function workflowScripts(workflow: string): string[] {
  return [...workflow.matchAll(RUNS_SCRIPT)].map((match) => match[0].slice(RUN_PREFIX.length));
}

/**
 * Whether a file in `.github/workflows` is a workflow: `.yml` or `.yaml`, as
 * GitHub accepts both.
 *
 * decisions/401-one-command-for-the-gate.md
 */
export function isWorkflowFile(name: string): boolean {
  return name.endsWith(".yml") || name.endsWith(".yaml");
}

/**
 * The scripts CI runs that `verify` would not: the thing that makes a green
 * `verify` stop predicting a green CI.
 *
 * decisions/401-one-command-for-the-gate.md
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
      // Sorted so the message reads the same twice, with an explicit comparator: a
      // bare `sort()` orders by UTF-16 code unit.
      .sort((left, right) => left.localeCompare(right))
  );
}

/**
 * How long a stage took, in the units a reader thinks in.
 *
 * decisions/401-one-command-for-the-gate.md
 */
export function humanDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;

  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

/**
 * The line printed before a stage runs, so a long one says what it is waiting on.
 *
 * decisions/401-one-command-for-the-gate.md
 */
export function startingLine(stage: Stage, position: number, total: number): string {
  return `[${position}/${total}] ${stage.name} — npm run ${stage.script} (${stage.typical})`;
}

export function passedLine(stage: Stage, elapsedMs: number): string {
  return `      ${stage.name} passed in ${humanDuration(elapsedMs)}`;
}

/**
 * Names the stage, not just the exit code: the question a reader has is which
 * gate failed.
 *
 * decisions/401-one-command-for-the-gate.md
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
