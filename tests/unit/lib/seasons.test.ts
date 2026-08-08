import { describe, expect, it } from "vitest";
import {
  DEFAULT_EARLIEST_SEASON,
  formatSeasonLabel,
  listSelectableSeasons,
  parseSeasonParam,
  resolveEarliestSeason,
} from "@/lib/seasons";

describe("formatSeasonLabel", () => {
  it("renders the start year and the following year's last two digits", () => {
    expect(formatSeasonLabel(2024)).toBe("2024/25");
    expect(formatSeasonLabel(2025)).toBe("2025/26");
  });

  it("zero-pads a century rollover", () => {
    expect(formatSeasonLabel(1999)).toBe("1999/00");
    expect(formatSeasonLabel(2099)).toBe("2099/00");
  });
});

describe("resolveEarliestSeason", () => {
  it("uses a configured season", () => {
    expect(resolveEarliestSeason("2020")).toBe(2020);
  });

  it("falls back to the default when unset, empty, or not a positive integer", () => {
    for (const value of [undefined, "", "  ", "abc", "0", "-5", "2023.5", "2023abc"]) {
      expect(resolveEarliestSeason(value)).toBe(DEFAULT_EARLIEST_SEASON);
    }
  });
});

describe("listSelectableSeasons", () => {
  it("lists every season from the active season down to the floor, newest first", () => {
    expect(listSelectableSeasons(2025, 2023)).toEqual([
      { seasonId: 2025, label: "2025/26" },
      { seasonId: 2024, label: "2024/25" },
      { seasonId: 2023, label: "2023/24" },
    ]);
  });

  it("offers only the active season when the floor is later than it", () => {
    expect(listSelectableSeasons(2023, 2025)).toEqual([{ seasonId: 2023, label: "2023/24" }]);
  });

  it("offers only the active season when the floor equals it", () => {
    expect(listSelectableSeasons(2025, 2025)).toEqual([{ seasonId: 2025, label: "2025/26" }]);
  });
});

describe("parseSeasonParam", () => {
  const selectable = listSelectableSeasons(2025, 2023);

  it("reports an absent parameter", () => {
    expect(parseSeasonParam(undefined, selectable)).toEqual({ kind: "absent" });
  });

  it("accepts a selectable season", () => {
    expect(parseSeasonParam("2024", selectable)).toEqual({ kind: "valid", seasonId: 2024 });
  });

  it("rejects a season outside the selectable range", () => {
    expect(parseSeasonParam("1999", selectable)).toEqual({ kind: "invalid" });
    expect(parseSeasonParam("2026", selectable)).toEqual({ kind: "invalid" });
  });

  it("rejects empty, non-numeric, and malformed values", () => {
    for (const value of ["", "  ", "abc", "2024.0", "2024abc", " 2024"]) {
      expect(parseSeasonParam(value, selectable)).toEqual({ kind: "invalid" });
    }
  });

  it("rejects a repeated parameter", () => {
    expect(parseSeasonParam(["2024", "2023"], selectable)).toEqual({ kind: "invalid" });
  });
});
