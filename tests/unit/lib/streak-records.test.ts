import { describe, expect, it } from "vitest";
import type { ResultMatch } from "@/lib/form-series";
import {
  hasAnyRecord,
  labelAt,
  type RecordSeason,
  recordsFor,
  seasonBlocks,
  streakRecords,
} from "@/lib/streak-records";

const TEAM = 1;
const OTHER = 2;

/** One finished match for `TEAM`, at home, in `seasonId`. */
function match(seasonId: number, day: number, scored: number, conceded: number): ResultMatch {
  return {
    providerMatchId: seasonId * 1000 + day,
    kickoffAt: new Date(Date.UTC(seasonId, 3 + Math.floor(day / 28), (day % 28) + 1)),
    homeTeamProviderId: TEAM,
    awayTeamProviderId: OTHER,
    homeGoals: scored,
    awayGoals: conceded,
  };
}

/** A season of results, each `"V"`, `"T"` or `"H"` from this team's side. */
function season(competitionCode: string, seasonId: number, results: string): RecordSeason {
  const score = { V: [1, 0], T: [0, 0], H: [0, 1] } as const;
  return {
    competitionCode,
    seasonId,
    label: String(seasonId),
    finished: [...results].map((result, index) => {
      const [scored, conceded] = score[result as keyof typeof score];
      return match(seasonId, index + 1, scored, conceded);
    }),
  };
}

function blockShape(blocks: RecordSeason[][]): string[][] {
  return blocks.map((block) => block.map((s) => `${s.competitionCode}${s.seasonId}`));
}

describe("seasonBlocks", () => {
  it("joins consecutive seasons of the same competition", () => {
    const blocks = seasonBlocks([season("VL", 2024, "V"), season("VL", 2025, "V")]);

    expect(blockShape(blocks)).toEqual([["VL2024", "VL2025"]]);
  });

  it("splits at a relegation, because the two spells are different standards", () => {
    const blocks = seasonBlocks([
      season("VL", 2024, "V"),
      season("M1", 2025, "V"),
      season("VL", 2026, "V"),
    ]);

    // Oldest block first: 2024, then 2025, then 2026.
    expect(blockShape(blocks)).toEqual([["VL2024"], ["M12025"], ["VL2026"]]);
  });

  it("does not rejoin a competition the club came back to", () => {
    // VL 2024 and VL 2026 are the same competition but not consecutive: a
    // whole Ykkönen season happened in between.
    const blocks = seasonBlocks([
      season("VL", 2024, "V"),
      season("M1", 2025, "V"),
      season("VL", 2026, "V"),
    ]);

    expect(blocks.some((block) => block.length > 1)).toBe(false);
  });

  it("splits at a promotion between consecutive years", () => {
    // The years *are* consecutive here, so only the competition test stops
    // these joining. The relegation case above sorts such that the years never
    // line up, and so cannot catch a missing competition test on its own.
    const blocks = seasonBlocks([season("M1", 2024, "V"), season("VL", 2025, "V")]);

    expect(blockShape(blocks)).toEqual([["M12024"], ["VL2025"]]);
  });

  it("splits where a season was never stored, which is not the same as not played", () => {
    // 2025 is missing entirely. Without the consecutive-years test, 2024 and
    // 2026 would look adjacent and invent a run across a season nobody has.
    const blocks = seasonBlocks([season("VL", 2024, "V"), season("VL", 2026, "V")]);

    expect(blockShape(blocks)).toEqual([["VL2024"], ["VL2026"]]);
  });

  it("orders blocks oldest first, so the most recent is last", () => {
    const blocks = seasonBlocks([
      season("VL", 2026, "V"),
      season("M1", 2020, "V"),
      season("M1", 2021, "V"),
    ]);

    expect(blockShape(blocks)).toEqual([["M12020", "M12021"], ["VL2026"]]);
  });

  it("has no blocks for no seasons", () => {
    expect(seasonBlocks([])).toEqual([]);
  });
});

describe("labelAt", () => {
  const placed = [{ label: "2024" }, { label: "2025" }];

  it("names the season a match of a run was played in", () => {
    expect(labelAt(placed, 1)).toBe("2024");
    expect(labelAt(placed, 2)).toBe("2025");
  });

  it("throws rather than naming no season at all", () => {
    // Unreachable in production — `streaksOf` numbers its runs over exactly
    // this array — but a silent "" would print as `Kausi ` and read as a
    // season. The services catch the throw and report an error.
    expect(() => labelAt(placed, 3)).toThrow("No match at position 3 of 2");
    expect(() => labelAt([], 1)).toThrow();
  });
});

describe("streakRecords", () => {
  it("lets a run cross a season boundary within one competition", () => {
    // Three wins to end 2024, three to start 2025: one run of six.
    const records = streakRecords([season("VL", 2024, "HVVV"), season("VL", 2025, "VVVH")], TEAM);

    expect(records.wins).toEqual({ length: 6, from: "2024", to: "2025" });
  });

  it("stops a run at a relegation, however the matches fall", () => {
    // The same six wins, but the club changed division in between.
    const records = streakRecords([season("VL", 2024, "HVVV"), season("M1", 2025, "VVVH")], TEAM);

    expect(records.wins?.length).toBe(3);
  });

  it("stops a run at a promotion, where the years are consecutive", () => {
    const records = streakRecords([season("M1", 2024, "HVVV"), season("VL", 2025, "VVVH")], TEAM);

    expect(records.wins?.length).toBe(3);
  });

  it("stops a run where a season is missing from storage", () => {
    const records = streakRecords([season("VL", 2024, "HVVV"), season("VL", 2026, "VVVH")], TEAM);

    expect(records.wins?.length).toBe(3);
  });

  it("names a record by the single season it sits in", () => {
    const records = streakRecords([season("VL", 2024, "HVVVVH")], TEAM);

    expect(records.wins).toEqual({ length: 4, from: "2024", to: "2024" });
  });

  it("takes the most recent of two equally long records", () => {
    // Two separate spells, each with a run of three. The later one is the one
    // a reader remembers, and the only one that could still be extended.
    const records = streakRecords([season("M1", 2020, "VVVH"), season("VL", 2026, "HVVV")], TEAM);

    expect(records.wins).toEqual({ length: 3, from: "2026", to: "2026" });
  });

  it("still prefers a longer record from an older spell", () => {
    const records = streakRecords([season("M1", 2020, "VVVVVH"), season("VL", 2026, "HVVV")], TEAM);

    expect(records.wins).toEqual({ length: 5, from: "2020", to: "2020" });
  });

  it("reports each kind of run separately", () => {
    const records = streakRecords([season("VL", 2024, "VVTTHHH")], TEAM);

    expect(records.wins?.length).toBe(2);
    // Wins and draws: the two wins and the two draws.
    expect(records.unbeaten?.length).toBe(4);
    expect(records.defeats?.length).toBe(3);
    // Draws and defeats.
    expect(records.winless?.length).toBe(5);
  });

  it("has no record of a kind the club has never had", () => {
    const records = streakRecords([season("VL", 2024, "VVV")], TEAM);

    expect(records.defeats).toBeNull();
    expect(records.winless).toBeNull();
    expect(records.wins?.length).toBe(3);
  });

  it("has no records at all for a club with no finished match", () => {
    const records = streakRecords([season("VL", 2024, "")], TEAM);

    expect(hasAnyRecord(records)).toBe(false);
  });

  it("counts a club's one stored season, with no special case", () => {
    const records = streakRecords([season("VL", 2024, "VV")], TEAM);

    expect(hasAnyRecord(records)).toBe(true);
    expect(records.wins).toEqual({ length: 2, from: "2024", to: "2024" });
  });

  it("ignores another team's matches in the same season", () => {
    const theirs: ResultMatch = {
      providerMatchId: 9999,
      kickoffAt: new Date(Date.UTC(2024, 4, 1)),
      homeTeamProviderId: OTHER,
      awayTeamProviderId: 3,
      homeGoals: 5,
      awayGoals: 0,
    };
    const own = season("VL", 2024, "VV");
    const records = streakRecords([{ ...own, finished: [...own.finished, theirs] }], TEAM);

    expect(records.wins?.length).toBe(2);
  });
});

describe("recordsFor", () => {
  const isLeague = (code: string) => code !== "CUP";
  const label = (year: number) => String(year);

  /** A season read carrying `results` for this team. */
  function readOf(seasonId: number, results: string) {
    return {
      status: "ok" as const,
      read: {
        competition: "Veikkausliiga",
        finished: season("VL", seasonId, results).finished.map((m) => ({ ...m, matchday: null })),
        all: [],
        points: [],
        teamCount: 0,
      },
    };
  }

  it("counts every league season the club has, the current one included", async () => {
    const result = await recordsFor(
      TEAM,
      [
        { competitionCode: "VL", seasonId: 2024 },
        { competitionCode: "VL", seasonId: 2025 },
      ],
      isLeague,
      label,
      async (key) => readOf(key.seasonId, key.seasonId === 2024 ? "HVVV" : "VVVH")
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.seasons).toBe(2);
    // The run crosses the boundary: three wins then three more.
    expect(result.records.wins).toEqual({ length: 6, from: "2024", to: "2025" });
  });

  it("leaves out a competition that is not a league", async () => {
    const result = await recordsFor(
      TEAM,
      [
        { competitionCode: "VL", seasonId: 2024 },
        { competitionCode: "CUP", seasonId: 2024 },
      ],
      isLeague,
      label,
      async (key) => readOf(key.seasonId, "VV")
    );

    expect(result.status === "ok" && result.seasons).toBe(1);
  });

  it("fails the panel when any season failed to read", async () => {
    const result = await recordsFor(
      TEAM,
      [
        { competitionCode: "VL", seasonId: 2024 },
        { competitionCode: "VL", seasonId: 2025 },
      ],
      isLeague,
      label,
      async (key) => (key.seasonId === 2024 ? readOf(2024, "VV") : { status: "error" as const })
    );

    expect(result).toEqual({ status: "error" });
  });

  it("skips a season with nothing stored, which is not a failure", async () => {
    const result = await recordsFor(
      TEAM,
      [
        { competitionCode: "VL", seasonId: 2024 },
        { competitionCode: "VL", seasonId: 2025 },
      ],
      isLeague,
      label,
      async (key) => (key.seasonId === 2024 ? readOf(2024, "VV") : { status: "empty" as const })
    );

    expect(result.status === "ok" && result.seasons).toBe(1);
  });

  it("has no panel when the club has no stored league season at all", async () => {
    const result = await recordsFor(
      TEAM,
      [{ competitionCode: "CUP", seasonId: 2024 }],
      isLeague,
      label,
      async () => readOf(2024, "VV")
    );

    expect(result).toEqual({ status: "unavailable" });
  });
});
