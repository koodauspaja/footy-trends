import { afterEach, beforeEach, describe, expect, it, type UserConsoleLog } from "vitest";
import type { TestCase, TestModule, Vitest } from "vitest/node";
import StderrConsoleOutputReporter, {
  ConsoleOutputReporter,
  describeConsoleOutput,
  whereFrom,
} from "../../../../scripts/checks/console-output-reporter";

/**
 * The reporter that fails a unit run printing anything beside its results, and
 * names the test each message came from.
 *
 * decisions/847-quiet-unit-run.md
 */

const ROOT = "/repo";
const MODULE = { type: "module", moduleId: "/repo/tests/unit/a.test.ts" } as TestModule;
const TEST = {
  type: "test",
  fullName: "the panel > shows a row",
  module: MODULE,
} as unknown as TestCase;

const log = (
  content: string,
  taskId?: string,
  type: "stdout" | "stderr" = "stderr"
): UserConsoleLog => ({
  content,
  type,
  time: 0,
  size: content.length,
  ...(taskId === undefined ? {} : { taskId }),
});

describe("whereFrom", () => {
  it("names a test by its file and its full name", () => {
    expect(whereFrom(TEST, ROOT)).toBe("tests/unit/a.test.ts > the panel > shows a row");
  });

  it("names a file alone when the message came from the file, not a test", () => {
    expect(whereFrom(MODULE, ROOT)).toBe("tests/unit/a.test.ts");
  });

  it("says so when the message came from no test at all", () => {
    expect(whereFrom(undefined, ROOT)).toBe("outside any test");
  });
});

describe("describeConsoleOutput", () => {
  it("counts the messages and lists each, indented, under where it came from", () => {
    expect(
      describeConsoleOutput([
        { where: "a.test.ts > shows", type: "stderr", content: "first\nsecond\n" },
        { where: "outside any test", type: "stdout", content: "third" },
      ])
    ).toBe(
      [
        "The unit run printed 2 message(s) beside its results. Fix what prints, or silence an expected message in its test with vi.spyOn(console, …):",
        "  a.test.ts > shows (stderr):",
        "    first",
        "    second",
        "  outside any test (stdout):",
        "    third",
        "",
      ].join("\n")
    );
  });
});

describe("ConsoleOutputReporter", () => {
  let exitCode: typeof process.exitCode;

  beforeEach(() => {
    exitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = exitCode;
  });

  const reporterWith = (written: string[]) =>
    new ConsoleOutputReporter({ write: (text: string) => written.push(text) });

  it("leaves a run that printed nothing alone", () => {
    const written: string[] = [];

    reporterWith(written).onTestRunEnd();

    expect(written).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it("fails a run that printed, naming the test through Vitest's state", () => {
    const written: string[] = [];
    const reporter = reporterWith(written);
    reporter.onInit({
      config: { root: ROOT },
      state: { getReportedEntityById: (id: string) => (id === "t1" ? TEST : undefined) },
    } as unknown as Vitest);

    reporter.onUserConsoleLog(log("Encountered two children with the same key", "t1"));
    reporter.onUserConsoleLog(log("[ioredis] Unhandled error event"));
    reporter.onTestRunEnd();

    expect(written).toEqual([
      describeConsoleOutput([
        {
          where: "tests/unit/a.test.ts > the panel > shows a row",
          type: "stderr",
          content: "Encountered two children with the same key",
        },
        { where: "outside any test", type: "stderr", content: "[ioredis] Unhandled error event" },
      ]),
    ]);
    expect(process.exitCode).toBe(1);
  });

  it("still fails the run when Vitest never introduced itself", () => {
    const written: string[] = [];
    const reporter = reporterWith(written);

    reporter.onUserConsoleLog(log("hello", "t1", "stdout"));
    reporter.onTestRunEnd();

    expect(written[0]).toContain("outside any test (stdout):\n    hello");
    expect(process.exitCode).toBe(1);
  });

  it("is the reporter Vitest constructs with its options, writing to stderr", () => {
    // Vitest passes its own options to a reporter's constructor, as here.
    const reporter: StderrConsoleOutputReporter = Reflect.construct(StderrConsoleOutputReporter, [
      { print: true },
    ]);

    expect(Reflect.get(reporter, "out")).toBe(process.stderr);
  });
});
