import { describe, expect, it } from "vitest";
import {
  changedBetweenStatuses,
  decideFreshness,
  describeAge,
  describeChange,
  isFullRun,
  kindFromDiffLetter,
  kindFromStatusLine,
  MAX_AGE_MS,
  missingPrerequisites,
  parseMarker,
  pathFromStatusLine,
} from "../../../scripts/e2e-freshness-plan";

const NOW = new Date("2026-08-30T12:00:00.000Z");

/** A run that finished `minutes` ago, relative to `NOW`. */
function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

const READY = { docker: true, footballDataKey: true, tasoKey: true };

function decide(overrides: Partial<Parameters<typeof decideFreshness>[0]> = {}) {
  return decideFreshness({
    marker: minutesAgo(5),
    now: NOW,
    maxAgeMs: MAX_AGE_MS,
    changedFiles: [],
    missingPrerequisites: [],
    ...overrides,
  });
}

describe("missingPrerequisites", () => {
  it("names nothing when e2e can run", () => {
    expect(missingPrerequisites(READY)).toEqual([]);
  });

  it("names each missing prerequisite", () => {
    expect(missingPrerequisites({ ...READY, docker: false })[0]).toMatch(/Docker/);
    expect(missingPrerequisites({ ...READY, footballDataKey: false })[0]).toMatch(
      /FOOTBALL_DATA_API_KEY/
    );
    expect(missingPrerequisites({ ...READY, tasoKey: false })[0]).toMatch(/TASO_API_KEY/);
  });

  it("names all three when none are available", () => {
    expect(
      missingPrerequisites({ docker: false, footballDataKey: false, tasoKey: false })
    ).toHaveLength(3);
  });
});

const MARKER_JSON =
  '{"finishedAt":"2026-08-30T11:00:00.000Z","head":"abc1234","status":[" M src/a.ts"]}';

describe("parseMarker", () => {
  it("reads what the reporter writes", () => {
    expect(parseMarker(MARKER_JSON)).toEqual({
      finishedAt: new Date("2026-08-30T11:00:00.000Z"),
      head: "abc1234",
      status: [" M src/a.ts"],
    });
  });

  it("accepts a clean tree, where the status list is empty", () => {
    expect(
      parseMarker('{"finishedAt":"2026-08-30T11:00:00.000Z","head":"abc","status":[]}')
    ).not.toBeNull();
  });

  it("tolerates the trailing newline the reporter writes", () => {
    expect(parseMarker(`${MARKER_JSON}\n`)).not.toBeNull();
  });

  // The timestamp-only format predates #220. It carries no tree state, so the
  // hook could not tell whether anything had changed — failing closed makes the
  // next run write a usable one.
  it("rejects the older timestamp-only marker rather than half-trusting it", () => {
    expect(parseMarker('{"finishedAt":"2026-08-30T11:00:00.000Z"}')).toBeNull();
  });

  it.each([
    ["a missing head", '{"finishedAt":"2026-08-30T11:00:00.000Z","status":[]}'],
    ["an empty head", '{"finishedAt":"2026-08-30T11:00:00.000Z","head":"","status":[]}'],
    ["a non-string head", '{"finishedAt":"2026-08-30T11:00:00.000Z","head":7,"status":[]}'],
    ["a missing status", '{"finishedAt":"2026-08-30T11:00:00.000Z","head":"abc"}'],
    ["a non-array status", '{"finishedAt":"2026-08-30T11:00:00.000Z","head":"abc","status":"x"}'],
    [
      "a status of non-strings",
      '{"finishedAt":"2026-08-30T11:00:00.000Z","head":"abc","status":[1]}',
    ],
  ])("rejects %s", (_label, raw) => {
    expect(parseMarker(raw)).toBeNull();
  });

  // A corrupt marker must fail closed: read as "no run recorded", never as a
  // date that happens to look fresh.
  it.each([
    ["a missing file", null],
    ["an empty file", ""],
    ["whitespace", "   \n"],
    ["a truncated write", '{"finishedAt":'],
    ["a JSON scalar", '"2026-08-30T11:00:00.000Z"'],
    ["JSON null", "null"],
    ["a missing field", "{}"],
    ["a non-string field", '{"finishedAt":123,"head":"abc","status":[]}'],
    ["an unparseable date", '{"finishedAt":"not a date","head":"abc","status":[]}'],
  ])("treats %s as no marker", (_label, raw) => {
    expect(parseMarker(raw)).toBeNull();
  });
});

describe("describeAge", () => {
  it("uses seconds below a minute", () => {
    expect(describeAge(40_000)).toBe("40 s");
  });

  it("never reports a negative age from a clock skew", () => {
    expect(describeAge(-5000)).toBe("0 s");
  });

  it("uses minutes below an hour", () => {
    expect(describeAge(12 * 60_000)).toBe("12 min");
  });

  it("uses hours and minutes above an hour", () => {
    expect(describeAge(3 * 3_600_000 + 5 * 60_000)).toBe("3 h 5 min");
  });
});

describe("isFullRun", () => {
  const full = {
    grepSource: ".*",
    hasGrepInvert: false,
    isSharded: false,
    ranFiles: ["/repo/tests/e2e/a.spec.ts", "/repo/tests/e2e/b.spec.ts"],
    availableFiles: ["/repo/tests/e2e/a.spec.ts", "/repo/tests/e2e/b.spec.ts"],
  };

  it("accepts an unfiltered run covering every spec file", () => {
    expect(isFullRun(full)).toBe(true);
  });

  it("accepts a run whose files arrive in a different order", () => {
    expect(isFullRun({ ...full, ranFiles: [...full.ranFiles].reverse() })).toBe(true);
  });

  it("rejects a --grep run", () => {
    expect(isFullRun({ ...full, grepSource: "standings" })).toBe(false);
  });

  it("rejects a --grep-invert run", () => {
    expect(isFullRun({ ...full, hasGrepInvert: true })).toBe(false);
  });

  it("rejects a sharded run, which covers only its own slice", () => {
    expect(isFullRun({ ...full, isSharded: true })).toBe(false);
  });

  it("rejects a run narrowed to one spec file on the command line", () => {
    expect(isFullRun({ ...full, ranFiles: ["/repo/tests/e2e/a.spec.ts"] })).toBe(false);
  });

  it("rejects a run that found no spec files at all", () => {
    // Otherwise `every` on an empty list would vacuously mark a suite that
    // ran nothing as fully covered.
    expect(isFullRun({ ...full, ranFiles: [], availableFiles: [] })).toBe(false);
  });
});

describe("decideFreshness", () => {
  it("passes a recent run with nothing changed since", () => {
    const verdict = decide();
    expect(verdict.kind).toBe("pass");
    expect(verdict.message).toContain("5 min ago");
  });

  it("blocks when no run has been recorded", () => {
    const verdict = decide({ marker: null });
    expect(verdict.kind).toBe("block");
    expect(verdict.message).toContain("No passing full e2e run has been recorded");
  });

  // Clock skew or a hand-edit. A negative age is never greater than the
  // window, so without its own branch this would read as fresh.
  it("blocks a marker dated in the future rather than trusting it", () => {
    const verdict = decide({ marker: new Date(NOW.getTime() + 90 * 60_000) });
    expect(verdict.kind).toBe("block");
    expect(verdict.message).toContain("1 h 30 min in the future");
    expect(verdict.message).toContain(".e2e-freshness");
  });

  it("blocks a run older than the freshness window", () => {
    const verdict = decide({ marker: minutesAgo(13 * 60) });
    expect(verdict.kind).toBe("block");
    expect(verdict.message).toContain("13 h 0 min ago");
  });

  it("passes a run just inside the window", () => {
    expect(decide({ marker: new Date(NOW.getTime() - MAX_AGE_MS) }).kind).toBe("pass");
  });

  it("blocks when watched files changed after the run", () => {
    const verdict = decide({ changedFiles: ["src/lib/taso.ts"] });
    expect(verdict.kind).toBe("block");
    expect(verdict.message).toContain("1 file(s) changed");
    expect(verdict.message).toContain("src/lib/taso.ts");
  });

  it("lists at most five changed files, and counts the rest", () => {
    const changedFiles = Array.from({ length: 8 }, (_, index) => `src/f${index}.ts`);
    const verdict = decide({ changedFiles });
    expect(verdict.message).toContain("src/f4.ts");
    expect(verdict.message).not.toContain("src/f5.ts");
    expect(verdict.message).toContain("(+3 more)");
  });

  it("names the command to run and the escape hatch when it blocks", () => {
    const verdict = decide({ marker: null });
    expect(verdict.message).toContain("npm run test:e2e");
    expect(verdict.message).toContain("git push --no-verify");
  });

  // A contributor without Docker or the provider keys is not choosing to skip
  // e2e. Blocking them would only teach them to pass --no-verify always.
  it("warns instead of blocking when e2e could not have been run here", () => {
    const verdict = decide({
      marker: null,
      missingPrerequisites: ["Docker is not running (`docker compose up -d`)"],
    });
    expect(verdict.kind).toBe("warn");
    expect(verdict.message).toContain("Not blocking the push");
    expect(verdict.message).toContain("Docker is not running");
    expect(verdict.message).toContain("npm run test:e2e");
  });

  it("still passes a fresh run when prerequisites are missing", () => {
    // Nothing to warn about: the marker is fresh, whatever is missing now.
    expect(decide({ missingPrerequisites: ["Docker is not running"] }).kind).toBe("pass");
  });
});

describe("kindFromStatusLine", () => {
  it.each([
    [" D src/gone.ts", "deleted"],
    ["D  src/staged-delete.ts", "deleted"],
    ["?? src/new.ts", "added"],
    ["A  src/added.ts", "added"],
    [" M src/edited.ts", "modified"],
    ["M  src/staged.ts", "modified"],
    ["R  src/old.ts -> src/new.ts", "renamed"],
    ["UU src/conflict.ts", "changed"],
  ])("reads %s as %s", (line, kind) => {
    expect(kindFromStatusLine(line)).toBe(kind);
  });

  // A deletion staged *and* re-added shows as `AD`; the deletion is the part
  // that a passing run cannot vouch for.
  it("prefers deleted when a line carries both", () => {
    expect(kindFromStatusLine("AD src/x.ts")).toBe("deleted");
  });
});

describe("pathFromStatusLine", () => {
  it("reads the path", () => {
    expect(pathFromStatusLine(" M src/a.ts")).toBe("src/a.ts");
  });

  it("takes the destination of a rename, which is what exists now", () => {
    expect(pathFromStatusLine("R  src/old.ts -> src/new.ts")).toBe("src/new.ts");
  });
});

describe("kindFromDiffLetter", () => {
  it.each([
    ["A", "added"],
    ["D", "deleted"],
    ["M", "modified"],
    ["R097", "renamed"],
    ["T", "changed"],
    ["", "changed"],
  ])("reads %s as %s", (letter, kind) => {
    expect(kindFromDiffLetter(letter)).toBe(kind);
  });
});

describe("changedBetweenStatuses", () => {
  it("finds nothing when the tree is as it was", () => {
    expect(changedBetweenStatuses([" M src/a.ts"], [" M src/a.ts"])).toEqual([]);
  });

  // The bug this replaces: a walk of files that exist cannot see a deletion.
  it("catches a file deleted since the run", () => {
    expect(changedBetweenStatuses([], [" D src/gone.ts"])).toEqual([
      { path: "src/gone.ts", kind: "deleted" },
    ]);
  });

  it("catches a new file", () => {
    expect(changedBetweenStatuses([], ["?? src/new.ts"])).toEqual([
      { path: "src/new.ts", kind: "added" },
    ]);
  });

  it("catches a line whose status letters changed", () => {
    expect(changedBetweenStatuses([" M src/a.ts"], ["M  src/a.ts"])).toEqual([
      { path: "src/a.ts", kind: "modified" },
    ]);
  });

  // Reverting an edit moves the tree away from what passed, even though it
  // moves it back towards HEAD.
  it("catches a path that has left the status entirely", () => {
    expect(changedBetweenStatuses([" M src/a.ts"], [])).toEqual([
      { path: "src/a.ts", kind: "changed" },
    ]);
  });

  it("reports each path once when several changed", () => {
    const changed = changedBetweenStatuses([], [" D src/a.ts", "?? src/b.ts"]);
    expect(changed).toHaveLength(2);
  });
});

describe("describeChange", () => {
  it("names the kind, so a deletion is not mistaken for an edit", () => {
    expect(describeChange("src/a.ts", "deleted")).toBe("src/a.ts (deleted)");
  });
});
