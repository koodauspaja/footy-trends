import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeBaseline } from "@/lib/home-baseline";

/**
 * The run's decisions around its queries: what it refreshes and through what,
 * that a failure in one competition does not stop the rest, and what it
 * writes. The SQL is proved against Postgres in
 * `tests/integration/predictions.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insertValues: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  getFootballDataSeasonMatches: vi.fn(),
  getTasoSeasonMatches: vi.fn(),
  synchronizeFootballDataMatches: vi.fn(),
  synchronizeTasoMatches: vi.fn(),
  getHomeBaseline: vi.fn<(source: string, code: string) => Promise<HomeBaseline>>(),
  loggerError: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve().then(mocks.select) }) }),
    insert: () => ({
      values: (rows: unknown) => {
        mocks.insertValues(rows);
        return { onConflictDoUpdate: mocks.onConflictDoUpdate };
      },
    }),
  },
}));
vi.mock("@/lib/football-data", () => ({
  getSeasonMatches: mocks.getFootballDataSeasonMatches,
}));
vi.mock("@/lib/taso", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/taso")>()),
  getSeasonMatches: mocks.getTasoSeasonMatches,
}));
vi.mock("@/lib/standings-service", () => ({
  synchronizeMatches: mocks.synchronizeFootballDataMatches,
}));
vi.mock("@/lib/taso-standings-service", () => ({
  synchronizeMatches: mocks.synchronizeTasoMatches,
}));
vi.mock("@/lib/match-service", () => ({
  FOOTBALL_DATA_HOME_GOALS: "home",
  FOOTBALL_DATA_AWAY_GOALS: "away",
  getHomeBaseline: mocks.getHomeBaseline,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));

import { runPredictionBacktest, runPredictionLog } from "@/lib/prediction-log-service";

const NOW = new Date("2026-10-03T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

const baseline: HomeBaseline = {
  status: "ok",
  matches: 100,
  homeShare: 50,
  drawShare: 25,
  awayShare: 25,
  seasons: { first: 2023, last: 2026 },
  spansCalendarYears: false,
};

function footballDataRow(overrides: Record<string, unknown> = {}) {
  return {
    code: "PL",
    seasonId: 2026,
    providerMatchId: 1,
    kickoffAt: at(5),
    status: "TIMED",
    homeGoals: null,
    awayGoals: null,
    ...overrides,
  };
}

function tasoRow(overrides: Record<string, unknown> = {}) {
  return {
    competitionId: "spljp26",
    categoryId: "VL",
    seasonId: 2026,
    providerMatchId: 2,
    kickoffAt: at(6),
    status: "SCHEDULED",
    homeGoals: null,
    awayGoals: null,
    ...overrides,
  };
}

/** Both reads of the run, before and after refreshing: football-data, then TASO. */
function stored(footballData: unknown[], taso: unknown[]) {
  mocks.select
    .mockResolvedValueOnce(footballData)
    .mockResolvedValueOnce(taso)
    .mockResolvedValueOnce(footballData)
    .mockResolvedValueOnce(taso);
}

const immediate = { "football-data": vi.fn((work) => work()), taso: vi.fn((work) => work()) };

function written() {
  return mocks.insertValues.mock.calls.flatMap(([rows]) => rows as Array<Record<string, unknown>>);
}

describe("runPredictionLog (specs/052)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReset();
    mocks.getHomeBaseline.mockReset().mockResolvedValue(baseline);
    mocks.getFootballDataSeasonMatches.mockReset().mockResolvedValue([{ id: "fd" }]);
    mocks.getTasoSeasonMatches.mockReset().mockResolvedValue([{ id: "taso" }]);
    mocks.onConflictDoUpdate.mockReset().mockResolvedValue(undefined);
  });

  it("refreshes each provider's competition through its paced, cached fetch and stores it", async () => {
    stored([footballDataRow()], [tasoRow()]);

    const report = await runPredictionLog(() => NOW, immediate);

    expect(immediate["football-data"]).toHaveBeenCalledTimes(1);
    expect(immediate.taso).toHaveBeenCalledTimes(1);
    expect(mocks.getFootballDataSeasonMatches).toHaveBeenCalledWith("PL", 2026);
    expect(mocks.synchronizeFootballDataMatches).toHaveBeenCalledWith([{ id: "fd" }]);
    expect(mocks.getTasoSeasonMatches).toHaveBeenCalledWith("spljp26", "VL", 2026);
    expect(mocks.synchronizeTasoMatches).toHaveBeenCalledWith([{ id: "taso" }]);
    expect(report).toEqual({ refreshed: 2, logged: 2, failures: [] });
  });

  it("logs every loggable match under the model, one baseline read per competition", async () => {
    stored(
      [footballDataRow(), footballDataRow({ providerMatchId: 3, kickoffAt: at(20) })],
      [tasoRow()]
    );

    await runPredictionLog(() => NOW, immediate);

    expect(written()).toEqual([
      expect.objectContaining({ source: "football-data", providerMatchId: 1, kind: "live" }),
      expect.objectContaining({ source: "football-data", providerMatchId: 3, kind: "live" }),
      expect.objectContaining({
        source: "taso",
        providerMatchId: 2,
        competitionCode: "VL",
        model: "home-baseline-v1",
        homeProbability: 0.5,
      }),
    ]);
    expect(mocks.getHomeBaseline).toHaveBeenCalledTimes(2);
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.any(Array) })
    );
  });

  it("refreshes a competition for a missing result, and writes nothing for it", async () => {
    stored(
      [footballDataRow({ kickoffAt: at(-3), status: "IN_PLAY", homeGoals: 1, awayGoals: 0 })],
      []
    );

    const report = await runPredictionLog(() => NOW, immediate);

    expect(mocks.getFootballDataSeasonMatches).toHaveBeenCalledTimes(1);
    expect(report).toEqual({ refreshed: 1, logged: 0, failures: [] });
  });

  it("neither refreshes nor logs a finished match with its result stored", async () => {
    stored(
      [footballDataRow({ kickoffAt: at(-3), status: "FINISHED", homeGoals: 1, awayGoals: 0 })],
      []
    );

    const report = await runPredictionLog(() => NOW, immediate);

    expect(mocks.getFootballDataSeasonMatches).not.toHaveBeenCalled();
    expect(report).toEqual({ refreshed: 0, logged: 0, failures: [] });
  });

  it("files a TASO row by its season's pair, and ignores a row no compared competition holds", async () => {
    stored(
      [],
      [tasoRow({ competitionId: "Liigacup26", categoryId: "VL" }), tasoRow({ categoryId: "MSC" })]
    );

    const report = await runPredictionLog(() => NOW, immediate);

    expect(mocks.getTasoSeasonMatches).not.toHaveBeenCalled();
    expect(report.logged).toBe(0);
  });

  it("carries on past a competition that fails to refresh, and reports it", async () => {
    stored([footballDataRow()], [tasoRow()]);
    mocks.getFootballDataSeasonMatches.mockRejectedValue(new Error("429"));

    const report = await runPredictionLog(() => NOW, immediate);

    expect(mocks.synchronizeTasoMatches).toHaveBeenCalled();
    expect(report).toEqual({
      refreshed: 1,
      logged: 2,
      failures: ["refresh football-data PL 2026"],
    });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), code: "PL" }),
      "Unable to refresh a competition for predictions"
    );
  });

  it("reports a competition whose baseline fails, and logs the others", async () => {
    stored([footballDataRow()], [tasoRow()]);
    mocks.getHomeBaseline.mockImplementation(async (source) =>
      source === "taso" ? ({ status: "error" } as const) : baseline
    );

    const report = await runPredictionLog(() => NOW, immediate);

    expect(report.failures).toEqual(["baseline taso:VL"]);
    expect(written()).toEqual([expect.objectContaining({ source: "football-data" })]);
  });

  it("writes nothing for a competition with no history yet, and does not call it a failure", async () => {
    stored([footballDataRow()], []);
    mocks.getHomeBaseline.mockResolvedValue({ status: "empty" });

    const report = await runPredictionLog(() => NOW, immediate);

    expect(report).toEqual({ refreshed: 1, logged: 0, failures: [] });
  });

  it("logs from the stored rows as they are after the refresh", async () => {
    // Before: an upcoming match. After the refresh: postponed out of the window.
    mocks.select
      .mockResolvedValueOnce([footballDataRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([footballDataRow({ status: "POSTPONED" })])
      .mockResolvedValueOnce([]);

    const report = await runPredictionLog(() => NOW, immediate);

    expect(report).toEqual({ refreshed: 1, logged: 0, failures: [] });
  });

  it("skips a match that kicked off while the run was refreshing, and stamps the write time (S5)", async () => {
    stored(
      [
        footballDataRow({ kickoffAt: at(1) }),
        footballDataRow({ providerMatchId: 3, kickoffAt: at(5) }),
      ],
      []
    );
    const clock = vi.fn().mockReturnValueOnce(NOW).mockReturnValue(at(2));

    const report = await runPredictionLog(clock, immediate);

    expect(report.logged).toBe(1);
    expect(written()).toEqual([
      expect.objectContaining({ providerMatchId: 3, predictedAt: at(2) }),
    ]);
  });

  it("fails the run when the write fails", async () => {
    stored([footballDataRow()], []);
    mocks.onConflictDoUpdate.mockRejectedValue(new Error("connection reset"));

    await expect(runPredictionLog(() => NOW, immediate)).rejects.toThrow("connection reset");
  });
});

describe("runPredictionBacktest (specs/052, S10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReset();
    mocks.onConflictDoUpdate.mockReset().mockResolvedValue(undefined);
  });

  const played = (day: number, home: number, away: number, overrides = {}) => ({
    providerMatchId: 100 + day,
    kickoffAt: new Date(Date.UTC(2025, 3, day, 15)),
    homeGoals: home,
    awayGoals: away,
    ...overrides,
  });

  it("writes a backtest row for every finished match with history, from both providers", async () => {
    mocks.select
      .mockResolvedValueOnce([
        { code: "PL", ...played(1, 2, 0) },
        { code: "PL", ...played(2, 1, 1) },
      ])
      .mockResolvedValueOnce([
        { competitionId: "spljp25", categoryId: "VL", seasonId: 2025, ...played(3, 0, 1) },
        { competitionId: "spljp25", categoryId: "VL", seasonId: 2025, ...played(4, 1, 0) },
        // Not a compared competition's pair.
        { competitionId: "Liigacup25", categoryId: "VL", seasonId: 2025, ...played(5, 1, 0) },
      ]);

    const count = await runPredictionBacktest(NOW);

    expect(count).toBe(2);
    expect(written()).toEqual([
      expect.objectContaining({ source: "football-data", providerMatchId: 102, kind: "backtest" }),
      expect.objectContaining({ source: "taso", providerMatchId: 104, competitionCode: "VL" }),
    ]);
  });

  it("writes in batches of a thousand", async () => {
    mocks.select
      .mockResolvedValueOnce(
        Array.from({ length: 1_501 }, (_, index) => ({
          code: "PL",
          providerMatchId: index,
          kickoffAt: new Date(Date.UTC(2024, 0, 1) + index * HOUR),
          homeGoals: 1,
          awayGoals: 0,
        }))
      )
      .mockResolvedValueOnce([]);

    await expect(runPredictionBacktest(NOW)).resolves.toBe(1_500);
    expect(mocks.insertValues.mock.calls.map(([rows]) => (rows as unknown[]).length)).toEqual([
      1_000, 500,
    ]);
  });
});
