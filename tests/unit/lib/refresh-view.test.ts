import { describe, expect, it } from "vitest";
import {
  decodeChoice,
  encodeChoice,
  isEmptyCounts,
  isRefreshSource,
  NO_CHANGES,
  previewHasChanges,
  REFRESH_SOURCES,
  type RefreshPreview,
} from "@/lib/refresh-view";

/**
 * The client-safe half of the forced refresh, from
 * specs/029-forced-season-refresh.md.
 *
 * `decodeChoice` reads a value that arrives from the browser, so it is tested
 * from both sides: a server action is a public endpoint, and the `<select>`
 * that normally produces this value is not a guarantee of anything.
 */

function preview(overrides: Partial<RefreshPreview> = {}): RefreshPreview {
  return {
    source: "taso",
    competitionCode: "VL",
    competitionName: "Veikkausliiga",
    seasonId: 2026,
    seasonLabel: "2026",
    matches: NO_CHANGES,
    groupRows: NO_CHANGES,
    deductionChanges: [],
    removedMatches: [],
    snapshotHash: "hash",
    ...overrides,
  };
}

describe("isRefreshSource", () => {
  it.each(REFRESH_SOURCES)("accepts %s", (source) => {
    expect(isRefreshSource(source)).toBe(true);
  });

  it.each([["national-teams"], [""], ["TASO"], [null], [undefined], [42], [{}]])(
    "rejects %s",
    (value) => {
      expect(isRefreshSource(value)).toBe(false);
    }
  );
});

describe("decodeChoice", () => {
  it("round-trips every source", () => {
    for (const source of REFRESH_SOURCES) {
      expect(decodeChoice(encodeChoice({ source, code: "VL" }))).toEqual({ source, code: "VL" });
    }
  });

  it("keeps a code containing the separator intact", () => {
    // Split on the *first* separator only. No competition code contains one
    // today, and a code that did must not be silently truncated.
    expect(decodeChoice("taso:A:B")).toEqual({ source: "taso", code: "A:B" });
  });

  it.each([
    ["no separator", "taso"],
    ["unknown source", "provider:VL"],
    ["empty code", "taso:"],
    ["empty string", ""],
    ["separator first", ":VL"],
  ])("rejects %s", (_case, value) => {
    expect(decodeChoice(value)).toBeNull();
  });

  it.each([[undefined], [null], [42], [["taso:VL"]], [{}]])(
    "rejects the non-string %s",
    (value) => {
      expect(decodeChoice(value)).toBeNull();
    }
  );
});

describe("isEmptyCounts", () => {
  it("is true only when all three are zero", () => {
    expect(isEmptyCounts(NO_CHANGES)).toBe(true);
    expect(isEmptyCounts({ inserted: 1, updated: 0, deleted: 0 })).toBe(false);
    expect(isEmptyCounts({ inserted: 0, updated: 1, deleted: 0 })).toBe(false);
    expect(isEmptyCounts({ inserted: 0, updated: 0, deleted: 1 })).toBe(false);
  });
});

describe("previewHasChanges", () => {
  it("is false when nothing in either table would move", () => {
    expect(previewHasChanges(preview())).toBe(false);
  });

  it("is false for a foreign preview with no match changes", () => {
    // `groupRows: null` means the table does not exist for this provider, which
    // must not read as a change.
    expect(previewHasChanges(preview({ groupRows: null }))).toBe(false);
  });

  it("is true when matches would move", () => {
    expect(previewHasChanges(preview({ matches: { inserted: 0, updated: 2, deleted: 0 } }))).toBe(
      true
    );
  });

  it("is true when only group rows would move", () => {
    expect(previewHasChanges(preview({ groupRows: { inserted: 0, updated: 1, deleted: 0 } }))).toBe(
      true
    );
  });
});
