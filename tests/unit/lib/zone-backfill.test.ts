import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Paced } from "@/lib/pacer";
import { backfillZones, ZONE_BACKFILL_PER_MINUTE } from "@/lib/zone-backfill";

/**
 * The zone backfill: which seasons it asks TASO for, that it writes levels
 * only, and what it reports for a season it could not read.
 *
 * decisions/063-competition-zones.md
 */

const { storedTasoSeasons, synchronizeGroupLevels, getSeasonGroups, loggerInfo } = vi.hoisted(
  () => ({
    storedTasoSeasons: vi.fn<(code: string) => Promise<Set<number>>>(),
    synchronizeGroupLevels: vi.fn<(...args: unknown[]) => Promise<void>>(),
    getSeasonGroups: vi.fn<(competitionId: string, categoryId: string) => Promise<unknown[]>>(),
    loggerInfo: vi.fn(),
  })
);

vi.mock("@/lib/logger", () => ({ logger: { info: loggerInfo, warn: vi.fn() } }));
vi.mock("@/lib/taso", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/taso")>()),
  getSeasonGroups,
}));
vi.mock("@/lib/taso-standings-service", () => ({ storedTasoSeasons, synchronizeGroupLevels }));

const LEVELLED = {
  group_id: "1",
  next_stage_levels: "1,0,0,0,0,0,0,0,0,0",
  next_stage_level_texts: ["Nousee"],
};

// A pacer that counts its turns and knows whether its work is running.
function countingPacer(): Paced & { turns: () => number; running: () => boolean } {
  let turns = 0;
  let running = false;
  const pace: Paced = async (work) => {
    turns += 1;
    running = true;
    try {
      return await work();
    } finally {
      running = false;
    }
  };
  return Object.assign(pace, { turns: () => turns, running: () => running });
}

beforeEach(() => {
  vi.clearAllMocks();
  storedTasoSeasons.mockResolvedValue(new Set());
  synchronizeGroupLevels.mockResolvedValue(undefined);
  getSeasonGroups.mockResolvedValue([LEVELLED]);
});

describe("backfillZones", () => {
  it("asks for every stored season of the five competitions, and no other", async () => {
    storedTasoSeasons.mockImplementation(async (code) =>
      code === "VL" ? new Set([2024, 2026, 2025]) : new Set(code === "N1" ? [2026] : [])
    );

    await backfillZones(countingPacer(), vi.fn());

    expect(storedTasoSeasons.mock.calls.map(([code]) => code)).toEqual([
      "VL",
      "M1L",
      "M1",
      "NL",
      "N1",
    ]);
    // Newest first, each under its own season's competition id.
    expect(getSeasonGroups.mock.calls).toEqual([
      ["spljp26", "VL"],
      ["spljp25", "VL"],
      ["spljp24", "VL"],
      ["spljp26", "N1"],
    ]);
  });

  it("writes the levels it read, through the writer that leaves the team rows alone", async () => {
    storedTasoSeasons.mockImplementation(async (code) => new Set(code === "M1L" ? [2026] : []));

    const result = await backfillZones(countingPacer(), vi.fn());

    expect(synchronizeGroupLevels.mock.calls).toEqual([
      [
        "M1L",
        "spljp26",
        2026,
        [
          {
            categoryId: "M1L",
            competitionCode: "spljp26",
            seasonId: 2026,
            groupId: 1,
            level: 1,
            teamCount: 1,
            label: "Nousee",
          },
        ],
      ],
    ]);
    expect(result).toEqual({ written: 1, skipped: 0, failed: [] });
  });

  it("paces every request to TASO", async () => {
    storedTasoSeasons.mockImplementation(
      async (code) => new Set(code === "VL" ? [2025, 2026] : [])
    );
    const pace = countingPacer();
    const pacedRequests: boolean[] = [];
    getSeasonGroups.mockImplementation(async () => {
      pacedRequests.push(pace.running());
      return [LEVELLED];
    });

    await backfillZones(pace, vi.fn());

    expect(pace.turns()).toBe(2);
    expect(pacedRequests).toEqual([true, true]);
    expect(ZONE_BACKFILL_PER_MINUTE).toBe(20);
  });

  it("counts a season with no level as skipped, and clears what was stored for it", async () => {
    storedTasoSeasons.mockImplementation(async (code) => new Set(code === "VL" ? [2016] : []));
    getSeasonGroups.mockResolvedValue([{ group_id: "1" }]);
    const report = vi.fn();

    const result = await backfillZones(countingPacer(), report);

    expect(result).toEqual({ written: 0, skipped: 1, failed: [] });
    expect(synchronizeGroupLevels).toHaveBeenCalledWith("VL", "spljp16", 2016, []);
    expect(report).toHaveBeenCalledWith("  VL 2016: no levels published, skipped");
  });

  it("reports a season TASO fails on, writes nothing for it, and goes on", async () => {
    storedTasoSeasons.mockImplementation(
      async (code) => new Set(code === "VL" ? [2025, 2024] : [])
    );
    getSeasonGroups.mockImplementation(async (competitionId) => {
      if (competitionId === "spljp25") throw new Error("TASO request failed with status 500");
      return [LEVELLED];
    });
    const report = vi.fn();

    const result = await backfillZones(countingPacer(), report);

    expect(result).toEqual({ written: 1, skipped: 0, failed: ["VL 2025"] });
    expect(report).toHaveBeenCalledWith("  VL 2025: FAILED — TASO request failed with status 500");
    expect(report).toHaveBeenCalledWith("  VL 2024: 1 levels");
    expect(synchronizeGroupLevels).toHaveBeenCalledTimes(1);
    expect(synchronizeGroupLevels).toHaveBeenCalledWith("VL", "spljp24", 2024, expect.anything());
  });

  it("takes an answer with no groups as a failure, not as a season without levels", async () => {
    storedTasoSeasons.mockImplementation(async (code) => new Set(code === "NL" ? [2026] : []));
    getSeasonGroups.mockResolvedValue([]);
    const report = vi.fn();

    const result = await backfillZones(countingPacer(), report);

    expect(result).toEqual({ written: 0, skipped: 0, failed: ["NL 2026"] });
    expect(synchronizeGroupLevels).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith("  NL 2026: FAILED — TASO returned no groups");
  });

  it("reports a write that fails, and a failure that is not an Error", async () => {
    storedTasoSeasons.mockImplementation(async (code) => new Set(code === "VL" ? [2026] : []));
    synchronizeGroupLevels.mockRejectedValue("deadlock");
    const report = vi.fn();

    const result = await backfillZones(countingPacer(), report);

    expect(result.failed).toEqual(["VL 2026"]);
    expect(report).toHaveBeenCalledWith("  VL 2026: FAILED — deadlock");
  });

  it("leaves one log line saying what it did", async () => {
    storedTasoSeasons.mockImplementation(
      async (code) => new Set(code === "VL" ? [2026, 2025, 2024] : [])
    );
    getSeasonGroups.mockImplementation(async (competitionId) => {
      if (competitionId === "spljp25") throw new Error("unavailable");
      return competitionId === "spljp24" ? [{ group_id: "1" }] : [LEVELLED];
    });

    await backfillZones(countingPacer(), vi.fn());

    expect(loggerInfo).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledWith(
      { written: 1, skipped: 1, failed: ["VL 2025"] },
      "Zone backfill finished"
    );
  });
});
