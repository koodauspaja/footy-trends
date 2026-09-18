import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FullConfig, FullResult, Suite, TestCase } from "@playwright/test/reporter";
import { describe, expect, it } from "vitest";
import E2eFreshnessReporter, {
  type ReporterDeps,
  reporterDeps,
} from "../../../scripts/e2e-freshness-reporter";

/**
 * The half of the freshness mechanism that *writes* the marker the pre-push
 * hook reads. What matters is when it stays silent: a marker from a narrowed
 * run would claim a freshness it did not earn, and the hook would then wave
 * through a push whose changes were never exercised (#403).
 */

const TEST_DIR = path.resolve("tests/e2e");
const SPECS = ["one.spec.ts", "two.spec.ts"];

/** Playwright hands the reporter its config; only these fields are read. */
function config(overrides: Partial<FullConfig> = {}): FullConfig {
  return {
    projects: [{ testDir: TEST_DIR }],
    grep: /.*/,
    grepInvert: null,
    shard: null,
    ...overrides,
  } as unknown as FullConfig;
}

/** A suite that "ran" the given spec files. */
function suite(files: string[]): Suite {
  return {
    allTests: () =>
      files.map(
        (file) => ({ location: { file: path.resolve(TEST_DIR, file) } }) as unknown as TestCase
      ),
  } as unknown as Suite;
}

const passed = { status: "passed" } as FullResult;

function reporter(overrides: Partial<ReporterDeps> = {}) {
  const written: string[] = [];

  const deps: ReporterDeps = {
    readdir: () => [...SPECS, "README.md", "fixtures"],
    fingerprint: () => ["hash\tsrc/a.ts"],
    writeMarker: (contents) => written.push(contents),
    now: () => new Date("2026-09-18T07:00:00.000Z"),
    ...overrides,
  };

  return { instance: new E2eFreshnessReporter(deps), written };
}

describe("E2eFreshnessReporter", () => {
  it("writes the marker when every spec ran and the run passed", () => {
    const { instance, written } = reporter();

    instance.onBegin(config(), suite(SPECS));
    instance.onEnd(passed);

    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0] ?? "")).toEqual({
      finishedAt: "2026-09-18T07:00:00.000Z",
      files: ["hash\tsrc/a.ts"],
    });
  });

  it("ends the marker with a newline, as a line-oriented file", () => {
    const { instance, written } = reporter();

    instance.onBegin(config(), suite(SPECS));
    instance.onEnd(passed);

    expect(written[0]?.endsWith("\n")).toBe(true);
  });

  it("counts only `.spec.ts` files as specs, not a README beside them", () => {
    // `readdir` returns a README and a directory too; counting either would make
    // a complete run look partial and nothing would ever be recorded.
    const { instance, written } = reporter();

    instance.onBegin(config(), suite(SPECS));
    instance.onEnd(passed);

    expect(written).toHaveLength(1);
  });

  it.each([
    ["one spec file", () => suite(["one.spec.ts"])],
    ["no specs at all", () => suite([])],
  ])("writes nothing for a run covering %s", (_, ran) => {
    const { instance, written } = reporter();

    instance.onBegin(config(), ran());
    instance.onEnd(passed);

    expect(written).toEqual([]);
  });

  it.each([
    ["a grep", { grep: /standings/ }],
    ["an inverted grep", { grepInvert: /standings/ }],
    ["a shard", { shard: { current: 1, total: 2 } }],
  ])("writes nothing for a run narrowed by %s", (_, overrides) => {
    const { instance, written } = reporter();

    instance.onBegin(config(overrides as Partial<FullConfig>), suite(SPECS));
    instance.onEnd(passed);

    expect(written).toEqual([]);
  });

  it.each(["failed", "timedout", "interrupted"] as const)(
    "writes nothing when the run %s",
    (status) => {
      const { instance, written } = reporter();

      instance.onBegin(config(), suite(SPECS));
      instance.onEnd({ status } as FullResult);

      expect(written).toEqual([]);
    }
  );

  it("writes nothing when git could not produce a fingerprint", () => {
    /**
     * A marker the hook cannot check is worse than none: the hook would have to
     * trust it, which is the one thing the fingerprint exists to avoid.
     */
    const { instance, written } = reporter({ fingerprint: () => null });

    instance.onBegin(config(), suite(SPECS));
    instance.onEnd(passed);

    expect(written).toEqual([]);
  });

  it("writes nothing when the config has no project to read specs from", () => {
    const { instance, written } = reporter();

    instance.onBegin(config({ projects: [] } as unknown as Partial<FullConfig>), suite(SPECS));
    instance.onEnd(passed);

    expect(written).toEqual([]);
  });

  it("does not ask git for a fingerprint it is not going to write", () => {
    let asked = 0;
    const { instance } = reporter({
      fingerprint: () => {
        asked += 1;
        return ["hash\tsrc/a.ts"];
      },
    });

    instance.onBegin(config(), suite(["one.spec.ts"]));
    instance.onEnd(passed);

    expect(asked).toBe(0);
  });

  it("treats a grep Playwright did not set as no grep at all", () => {
    // Playwright's default is the `.*` RegExp, but the field is typed loosely
    // enough to arrive as something else; reading that as a filter would stop
    // every full run from ever recording one.
    const { instance, written } = reporter();

    instance.onBegin(config({ grep: undefined } as unknown as Partial<FullConfig>), suite(SPECS));
    instance.onEnd(passed);

    expect(written).toHaveLength(1);
  });

  it("uses the real filesystem and git when constructed with nothing", () => {
    // How Playwright builds it: the configured entry passes no options, so the
    // defaults are what production runs with.
    const instance = new E2eFreshnessReporter();

    // A run that covered nothing writes nothing, so this exercises the default
    // wiring without touching the marker on disk.
    instance.onBegin(config(), suite([]));

    expect(() => instance.onEnd(passed)).not.toThrow();
  });
});

describe("reporterDeps", () => {
  it("writes the marker where it is told, which is not the real one in a test", () => {
    const markerPath = path.join(
      mkdtempSync(path.join(tmpdir(), "footy-marker-")),
      ".e2e-freshness"
    );
    const deps = reporterDeps(markerPath);

    deps.writeMarker("recorded\n");

    expect(readFileSync(markerPath, "utf8")).toBe("recorded\n");
  });

  it("reads real spec files, asks git for a real fingerprint, and reads the clock", () => {
    const deps = reporterDeps();

    expect(deps.readdir("tests/e2e").some((name) => name.endsWith(".spec.ts"))).toBe(true);
    // Either a real fingerprint or `null` if git cannot answer here; both are
    // answers, and neither may throw.
    expect(() => deps.fingerprint()).not.toThrow();
    expect(deps.now().getTime()).toBeGreaterThan(0);
  });
});
