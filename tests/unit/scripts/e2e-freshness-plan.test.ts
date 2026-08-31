import { describe, expect, it } from "vitest";
import {
  changedBetweenFingerprints,
  decideFreshness,
  describeAge,
  describeChange,
  hashFromEntry,
  isFullRun,
  MAX_AGE_MS,
  missingPrerequisites,
  parseMarker,
  pathFromEntry,
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

const MARKER_JSON = '{"finishedAt":"2026-08-30T11:00:00.000Z","files":["deadbee\\tsrc/a.ts"]}';

describe("parseMarker", () => {
  it("reads what the reporter writes", () => {
    expect(parseMarker(MARKER_JSON)).toEqual({
      finishedAt: new Date("2026-08-30T11:00:00.000Z"),
      files: ["deadbee\tsrc/a.ts"],
    });
  });

  it("accepts an empty watched tree", () => {
    expect(parseMarker('{"finishedAt":"2026-08-30T11:00:00.000Z","files":[]}')).not.toBeNull();
  });

  it("tolerates the trailing newline the reporter writes", () => {
    expect(parseMarker(`${MARKER_JSON}\n`)).not.toBeNull();
  });

  // The timestamp-only format predates #220. It carries no tree state, so the
  // hook could not tell whether anything had changed — failing closed makes the
  // next run write a usable one.
  it("rejects an older-format marker rather than half-trusting it", () => {
    // The head+status shape #220 wrote, and the timestamp-only one before it.
    expect(parseMarker('{"finishedAt":"2026-08-30T11:00:00.000Z"}')).toBeNull();
    expect(
      parseMarker('{"finishedAt":"2026-08-30T11:00:00.000Z","head":"abc","status":[]}')
    ).toBeNull();
  });

  it.each([
    ["a missing files list", '{"finishedAt":"2026-08-30T11:00:00.000Z"}'],
    ["a non-array files list", '{"finishedAt":"2026-08-30T11:00:00.000Z","files":"x"}'],
    ["a files list of non-strings", '{"finishedAt":"2026-08-30T11:00:00.000Z","files":[1]}'],
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
    ["a non-string field", '{"finishedAt":123,"files":[]}'],
    ["an unparseable date", '{"finishedAt":"not a date","files":[]}'],
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

const entry = (hash: string, path: string) => `${hash}\t${path}`;

describe("pathFromEntry / hashFromEntry", () => {
  it("splits an entry at the tab", () => {
    expect(pathFromEntry(entry("abc123", "src/a.ts"))).toBe("src/a.ts");
    expect(hashFromEntry(entry("abc123", "src/a.ts"))).toBe("abc123");
  });

  // A hash cannot contain a tab, so the first one is the separator and
  // everything after it is the path — including any tabs of its own.
  it("keeps a path containing a tab intact", () => {
    expect(pathFromEntry("abc123\tsrc/od\td.ts")).toBe("src/od\td.ts");
  });
});

describe("changedBetweenFingerprints", () => {
  it("finds nothing when the content is identical", () => {
    const same = [entry("aaa", "src/a.ts"), entry("bbb", "src/b.ts")];
    expect(changedBetweenFingerprints(same, same)).toEqual([]);
  });

  it("catches an edit", () => {
    expect(
      changedBetweenFingerprints([entry("aaa", "src/a.ts")], [entry("bbb", "src/a.ts")])
    ).toEqual([{ path: "src/a.ts", kind: "modified" }]);
  });

  it("catches a new file", () => {
    expect(changedBetweenFingerprints([], [entry("aaa", "src/new.ts")])).toEqual([
      { path: "src/new.ts", kind: "added" },
    ]);
  });

  // #220: a deleted file simply stops appearing, which the modification-time
  // walk this replaced could not see at all.
  it("catches a deletion, as an entry that disappeared", () => {
    expect(changedBetweenFingerprints([entry("aaa", "src/gone.ts")], [])).toEqual([
      { path: "src/gone.ts", kind: "deleted" },
    ]);
  });

  /**
   * #242, and the whole reason this compares content.
   *
   * Committing moves bytes from the working tree into a commit and changes
   * nothing about them. The earlier `HEAD`-plus-status pair described *where*
   * content lived, so that move read as a change and blocked a push the run had
   * already covered. A hash cannot tell the difference, which is the property
   * wanted.
   */
  it("sees nothing when content is committed rather than edited", () => {
    const before = [entry("aaa", "src/a.ts")];
    const afterCommitting = [entry("aaa", "src/a.ts")];
    expect(changedBetweenFingerprints(before, afterCommitting)).toEqual([]);
  });

  it("reports every change, sorted, when several differ", () => {
    expect(
      changedBetweenFingerprints(
        [entry("aaa", "src/b.ts"), entry("ccc", "src/c.ts")],
        [entry("zzz", "src/a.ts"), entry("bbb", "src/b.ts")]
      )
    ).toEqual([
      { path: "src/a.ts", kind: "added" },
      { path: "src/b.ts", kind: "modified" },
      { path: "src/c.ts", kind: "deleted" },
    ]);
  });
});

describe("describeChange", () => {
  it("names the kind, so a deletion is not mistaken for an edit", () => {
    expect(describeChange("src/a.ts", "deleted")).toBe("src/a.ts (deleted)");
  });
});
