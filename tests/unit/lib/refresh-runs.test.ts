import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

/**
 * The forced refresh's audit trail, from specs/029-forced-season-refresh.md.
 *
 * No real database: the CI unit job has no service containers, deliberately.
 * The mock records what was inserted so the counts an admin approved can be
 * checked for reaching the row unchanged.
 */
const { state, logger } = vi.hoisted(() => ({
  state: {
    inserted: [] as Record<string, unknown>[],
    insertThrows: false,
    rows: [] as Record<string, unknown>[],
    limit: 0,
  },
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({ logger }));

vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        if (state.insertThrows) throw new Error("insert failed");
        state.inserted.push(row);
      },
    }),
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          orderBy: () => ({
            limit: async (limit: number) => {
              state.limit = limit;
              return state.rows;
            },
          }),
        }),
      }),
    }),
  },
}));

const CREATED_AT = new Date("2026-09-13T09:00:00.000Z");

function run(overrides: Record<string, unknown> = {}) {
  return {
    run: {
      id: 1,
      source: "taso",
      competitionCode: "VL",
      seasonId: 2016,
      status: "success",
      reason: null,
      matchesInserted: 0,
      matchesUpdated: 2,
      matchesDeleted: 0,
      groupRowsInserted: 0,
      groupRowsUpdated: 1,
      groupRowsDeleted: 0,
      deductionsChanged: 1,
      runBy: "admin-1",
      createdAt: CREATED_AT,
      ...overrides,
    },
    runByName: "Miikka" as string | null,
  };
}

beforeEach(() => {
  state.inserted = [];
  state.insertThrows = false;
  state.rows = [];
  state.limit = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
});

warmModules(() => import("@/lib/refresh-runs"));

describe("recordSuccess", () => {
  it("writes the counts the preview reported, unchanged", async () => {
    const { recordSuccess } = await import("@/lib/refresh-runs");

    await recordSuccess(
      {
        source: "taso",
        competitionCode: "VL",
        competitionName: "Veikkausliiga",
        seasonId: 2016,
        seasonLabel: "2016",
        matches: { inserted: 1, updated: 2, deleted: 3 },
        groupRows: { inserted: 4, updated: 5, deleted: 6 },
        deductionChanges: [{ teamName: "PK-35 Vantaa", from: 0, to: -6 }],
        removedMatches: [],
        snapshotHash: "hash",
      },
      "admin-1"
    );

    expect(state.inserted).toEqual([
      {
        source: "taso",
        competitionCode: "VL",
        seasonId: 2016,
        seasonLabel: "2016",
        status: "success",
        matchesInserted: 1,
        matchesUpdated: 2,
        matchesDeleted: 3,
        groupRowsInserted: 4,
        groupRowsUpdated: 5,
        groupRowsDeleted: 6,
        deductionsChanged: 1,
        runBy: "admin-1",
      },
    ]);
  });

  it("stores null group counts for a provider that has no group standings", async () => {
    const { recordSuccess } = await import("@/lib/refresh-runs");

    await recordSuccess(
      {
        source: "football-data",
        competitionCode: "PL",
        competitionName: "Valioliiga",
        seasonId: 2025,
        seasonLabel: "2025/26",
        matches: { inserted: 1, updated: 0, deleted: 0 },
        groupRows: null,
        deductionChanges: [],
        removedMatches: [],
        snapshotHash: "hash",
      },
      "admin-1"
    );

    // Null, not zero: "this table does not exist for this provider" is a
    // different statement from "nothing changed".
    expect(state.inserted[0]).toMatchObject({
      groupRowsInserted: null,
      groupRowsUpdated: null,
      groupRowsDeleted: null,
    });
  });

  it("logs and carries on when the row cannot be written", async () => {
    // The refresh already changed the database. Losing the note of it is not a
    // reason to tell an admin their change failed.
    state.insertThrows = true;
    const { recordSuccess } = await import("@/lib/refresh-runs");

    await expect(
      recordSuccess(
        {
          source: "taso",
          competitionCode: "VL",
          competitionName: "Veikkausliiga",
          seasonId: 2016,
          seasonLabel: "2016",
          matches: { inserted: 0, updated: 0, deleted: 0 },
          groupRows: null,
          deductionChanges: [],
          removedMatches: [],
          snapshotHash: "hash",
        },
        "admin-1"
      )
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("recordFailure", () => {
  it("records the reason and leaves the counts at their defaults", async () => {
    const { recordFailure } = await import("@/lib/refresh-runs");

    await recordFailure({ source: "taso", code: "VL" }, 2016, "empty", "admin-1", "2016");

    expect(state.inserted[0]).toMatchObject({
      status: "failed",
      reason: "empty",
      seasonId: 2016,
      seasonLabel: "2016",
      runBy: "admin-1",
    });
  });

  it("stores a null label when the run failed before the range resolved", async () => {
    const { recordFailure } = await import("@/lib/refresh-runs");

    await recordFailure({ source: "football-data", code: "PL" }, 2025, "provider", "admin-1");

    expect(state.inserted[0]).toMatchObject({ seasonLabel: null });
  });

  it("logs and carries on when the row cannot be written", async () => {
    state.insertThrows = true;
    const { recordFailure } = await import("@/lib/refresh-runs");

    await expect(
      recordFailure({ source: "taso", code: "VL" }, 2016, "provider", "admin-1")
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("listRuns", () => {
  it("names the competition and the operator", async () => {
    state.rows = [run()];
    const { listRuns } = await import("@/lib/refresh-runs");

    const [row] = await listRuns();

    expect(row).toMatchObject({
      competitionName: "Veikkausliiga",
      seasonLabel: "2016",
      succeeded: true,
      runByName: "Miikka",
      deductionsChanged: 1,
      createdAt: CREATED_AT.toISOString(),
    });
    expect(row?.matches).toEqual({ inserted: 0, updated: 2, deleted: 0 });
    expect(row?.groupRows).toEqual({ inserted: 0, updated: 1, deleted: 0 });
  });

  it("shows a foreign season the way the picker spells it", async () => {
    // Stored with the run rather than derived: working it out here would mean a
    // provider call per row just to learn whether the season spans two calendar
    // years, and the row would read `2025` where the picker says `2025/26`.
    state.rows = [
      run({
        source: "football-data",
        competitionCode: "PL",
        seasonId: 2025,
        seasonLabel: "2025/26",
      }),
    ];
    const { listRuns } = await import("@/lib/refresh-runs");

    expect((await listRuns())[0]?.seasonLabel).toBe("2025/26");
  });

  it("falls back to the season id for a run that failed before the range resolved", async () => {
    state.rows = [run({ seasonLabel: null })];
    const { listRuns } = await import("@/lib/refresh-runs");

    expect((await listRuns())[0]?.seasonLabel).toBe("2016");
  });

  it("keeps a run whose operator has been deleted", async () => {
    // `run_by` is `on delete set null`, so the record outlives the account and
    // the person is no longer identifiable from it.
    state.rows = [{ ...run({ runBy: null }), runByName: null }];
    const { listRuns } = await import("@/lib/refresh-runs");

    const [row] = await listRuns();

    expect(row?.runByName).toBeNull();
    expect(row?.competitionName).toBe("Veikkausliiga");
  });

  it("reports a failure with its reason", async () => {
    state.rows = [run({ status: "failed", reason: "empty" })];
    const { listRuns } = await import("@/lib/refresh-runs");

    const [row] = await listRuns();

    expect(row?.succeeded).toBe(false);
    expect(row?.reason).toBe("empty");
  });

  it("reports a null group count as no group table rather than as zeroes", async () => {
    state.rows = [
      run({
        source: "football-data",
        competitionCode: "PL",
        groupRowsInserted: null,
        groupRowsUpdated: null,
        groupRowsDeleted: null,
      }),
    ];
    const { listRuns } = await import("@/lib/refresh-runs");

    const [row] = await listRuns();

    expect(row?.groupRows).toBeNull();
  });

  it("skips a row whose source is not one this app writes", async () => {
    // Only this module writes the column, and only from a typed union — so such
    // a row can only be hand-edited, and guessing which provider it meant would
    // put a wrong competition name in an audit log.
    state.rows = [run({ source: "sometHing-else" }), run({ id: 2 })];
    const { listRuns } = await import("@/lib/refresh-runs");

    const rows = await listRuns();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(2);
    expect(logger.warn).toHaveBeenCalled();
  });

  it.each([["empty"], ["read"], ["provider"], ["cache"], ["write"]])(
    "reads back the %s reason it wrote",
    async (reason) => {
      state.rows = [run({ status: "failed", reason })];
      const { listRuns } = await import("@/lib/refresh-runs");

      expect((await listRuns())[0]?.reason).toBe(reason);
    }
  );

  it("ignores a reason the app does not use", async () => {
    state.rows = [run({ status: "failed", reason: "gremlins" })];
    const { listRuns } = await import("@/lib/refresh-runs");

    expect((await listRuns())[0]?.reason).toBeNull();
  });

  it("asks for twenty rows", async () => {
    const { listRuns } = await import("@/lib/refresh-runs");
    await listRuns();

    expect(state.limit).toBe(20);
  });
});
