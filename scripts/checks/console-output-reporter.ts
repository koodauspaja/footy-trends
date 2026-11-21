import { relative } from "node:path";
import type { UserConsoleLog } from "vitest";
import type { Reporter, TestCase, TestModule, TestSuite, Vitest } from "vitest/node";

/**
 * Fails a unit run that printed anything beside its results: each line, with
 * the test that printed it. A test expecting output silences it with a spy.
 *
 * decisions/847-quiet-unit-run.md
 */

type Printed = { where: string; type: UserConsoleLog["type"]; content: string };

/**
 * Where a log came from: the file and the test, the file alone, or neither,
 * as for a message an earlier test's connection sent after it ended.
 *
 * decisions/847-quiet-unit-run.md
 */
export function whereFrom(
  entity: TestCase | TestSuite | TestModule | undefined,
  root: string
): string {
  if (entity === undefined) return "outside any test";
  if (entity.type === "module") return relative(root, entity.moduleId);
  return `${relative(root, entity.module.moduleId)} > ${entity.fullName}`;
}

/**
 * The run's failure message: each printed message under where it came from.
 *
 * decisions/847-quiet-unit-run.md
 */
export function describeConsoleOutput(printed: readonly Printed[]): string {
  const entries = printed.map(
    ({ where, type, content }) =>
      `  ${where} (${type}):\n${content
        .trimEnd()
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n")}`
  );
  return [
    `The unit run printed ${printed.length} message(s) beside its results. Fix what prints, or silence an expected message in its test with vi.spyOn(console, …):`,
    ...entries,
    "",
  ].join("\n");
}

/**
 * Collects what a run printed, and fails the run at its end if anything was.
 *
 * decisions/847-quiet-unit-run.md
 */
export class ConsoleOutputReporter implements Reporter {
  private root = process.cwd();
  private entityOf: (taskId: string) => TestCase | TestSuite | TestModule | undefined = () =>
    undefined;
  private readonly printed: Printed[] = [];

  constructor(private readonly out: { write: (text: string) => unknown }) {}

  onInit(vitest: Vitest): void {
    this.root = vitest.config.root;
    this.entityOf = (taskId) => vitest.state.getReportedEntityById(taskId);
  }

  onUserConsoleLog(log: UserConsoleLog): void {
    const entity = log.taskId === undefined ? undefined : this.entityOf(log.taskId);
    this.printed.push({
      where: whereFrom(entity, this.root),
      type: log.type,
      content: log.content,
    });
  }

  onTestRunEnd(): void {
    if (this.printed.length === 0) return;
    this.out.write(describeConsoleOutput(this.printed));
    process.exitCode = 1;
  }
}

/**
 * The reporter `test:unit` and `test:shuffle` add beside the default one.
 * Vitest constructs it with its own options, which it has no use for.
 *
 * decisions/847-quiet-unit-run.md
 */
export default class StderrConsoleOutputReporter extends ConsoleOutputReporter {
  constructor() {
    super(process.stderr);
  }
}
