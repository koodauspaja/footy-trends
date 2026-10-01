import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { matches, predictions, tasoMatches } from "@/db/schema";

// No provider request from a test: the refresh fetches nothing new, and what
// is stored is what the run logs.
vi.mock("@/lib/football-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/football-data")>()),
  getSeasonMatches: vi.fn(async () => []),
}));
vi.mock("@/lib/taso", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/taso")>()),
  getSeasonMatches: vi.fn(async () => []),
}));

import { expectedHome } from "@/lib/elo";
import { runPredictionBacktest, runPredictionLog } from "@/lib/prediction-log-service";

/**
 * The predictions log against a real Postgres (specs/052). The hourly run is
 * set in 2099 and the backtest in 1990, so each reads only this suite's rows
 * near its own dates. Every predictions row this suite causes is deleted
 * either side of each test.
 */
const IDS = Array.from({ length: 12 }, (_, index) => 985_001 + index);
const NOW = new Date("2099-06-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const immediate = {
  "football-data": <T>(work: () => Promise<T>) => work(),
  taso: <T>(work: () => Promise<T>) => work(),
};

function footballDataRow(overrides: Partial<typeof matches.$inferInsert> = {}) {
  return {
    providerMatchId: IDS[0] as number,
    competitionCode: "DED",
    seasonId: 2098,
    kickoffAt: at(5),
    matchday: 1,
    status: "TIMED",
    stage: null,
    groupName: null,
    homeTeamProviderId: 985_101,
    homeTeamName: "Integration Home",
    awayTeamProviderId: 985_102,
    awayTeamName: "Integration Away",
    homeGoals: null,
    awayGoals: null,
    ...overrides,
  };
}

function tasoRow(overrides: Partial<typeof tasoMatches.$inferInsert> = {}) {
  return {
    providerMatchId: IDS[6] as number,
    competitionCode: "spljp90",
    categoryId: "VL",
    seasonId: 1990,
    groupId: 1,
    groupName: "Runkosarja",
    kickoffAt: new Date("1990-05-01T15:00:00Z"),
    matchday: 1,
    status: "FINISHED",
    winner: null,
    homeTeamProviderId: 985_201,
    homeTeamName: "Integration Koti",
    awayTeamProviderId: 985_202,
    awayTeamName: "Integration Vieras",
    homeGoals: 1,
    awayGoals: 0,
    ...overrides,
  };
}

async function clear() {
  await db.delete(predictions).where(inArray(predictions.providerMatchId, IDS));
  await db.delete(predictions).where(eq(predictions.kind, "backtest"));
  await db.delete(matches).where(inArray(matches.providerMatchId, IDS));
  await db.delete(tasoMatches).where(inArray(tasoMatches.providerMatchId, IDS));
}

beforeEach(clear);
afterEach(clear);

function rowsFor(id: number, kind: "live" | "backtest", model = "home-baseline-v1") {
  return db
    .select()
    .from(predictions)
    .where(
      and(
        eq(predictions.providerMatchId, id),
        eq(predictions.kind, kind),
        eq(predictions.model, model)
      )
    );
}

describe("the hourly run (specs/052)", () => {
  /**
   * One finished match in each competition, well before the run and outside
   * its 24-hour result window, so the baseline has history to predict from
   * whatever else the database holds. CI's starts empty; a run with no
   * history rightly writes nothing (specs/051 S9).
   */
  beforeEach(async () => {
    await db.insert(matches).values(
      footballDataRow({
        providerMatchId: IDS[10] as number,
        kickoffAt: at(-100),
        status: "FINISHED",
        homeGoals: 1,
        awayGoals: 0,
      })
    );
    await db.insert(tasoMatches).values(
      tasoRow({
        providerMatchId: IDS[11] as number,
        competitionCode: "spljp98",
        seasonId: 2098,
        kickoffAt: at(-100),
      })
    );
  });

  it("keeps one live row per match and model, overwritten by each run before kickoff", async () => {
    await db.insert(matches).values(footballDataRow());

    await runPredictionLog(() => NOW, immediate);
    await runPredictionLog(() => new Date(NOW.getTime() + HOUR), immediate);

    const rows = await rowsFor(IDS[0] as number, "live");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "football-data",
      competitionCode: "DED",
      model: "home-baseline-v1",
      kickoffAt: at(5),
      predictedAt: new Date(NOW.getTime() + HOUR),
    });
    const sum =
      (rows[0]?.homeProbability ?? 0) +
      (rows[0]?.drawProbability ?? 0) +
      (rows[0]?.awayProbability ?? 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("moves a rescheduled match's row to its new kickoff (S4)", async () => {
    await db.insert(matches).values(footballDataRow());
    await runPredictionLog(() => NOW, immediate);

    await db
      .update(matches)
      .set({ kickoffAt: at(30) })
      .where(eq(matches.providerMatchId, IDS[0] as number));
    await runPredictionLog(() => NOW, immediate);

    const rows = await rowsFor(IDS[0] as number, "live");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kickoffAt).toEqual(at(30));
  });

  it("logs elo-v1 beside the baseline, one row each (specs/053)", async () => {
    await db.insert(matches).values(footballDataRow());

    await runPredictionLog(() => NOW, immediate);
    await runPredictionLog(() => NOW, immediate);

    const [elo] = await rowsFor(IDS[0] as number, "live", "elo-v1");
    expect(await rowsFor(IDS[0] as number, "live", "elo-v1")).toHaveLength(1);
    const total =
      (elo?.homeProbability ?? 0) + (elo?.drawProbability ?? 0) + (elo?.awayProbability ?? 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("writes nothing for a passed kickoff, even one still marked scheduled (S5)", async () => {
    await db.insert(matches).values(footballDataRow({ kickoffAt: at(-1), status: "SCHEDULED" }));

    await runPredictionLog(() => NOW, immediate);

    expect(await rowsFor(IDS[0] as number, "live")).toHaveLength(0);
  });

  it("logs a TASO match under the competition its season's pair names", async () => {
    await db.insert(tasoMatches).values(
      tasoRow({
        competitionCode: "spljp99",
        seasonId: 2099,
        status: "SCHEDULED",
        kickoffAt: at(10),
        homeGoals: null,
        awayGoals: null,
      })
    );

    await runPredictionLog(() => NOW, immediate);

    expect(await rowsFor(IDS[6] as number, "live")).toEqual([
      expect.objectContaining({ source: "taso", competitionCode: "VL" }),
    ]);
  });
});

describe("the backtest (specs/052, S10, S14)", () => {
  const kickoff = (day: number) => new Date(Date.UTC(1990, 4, day, 15));

  it("predicts each match from strictly earlier ones, a shoot-out draw a draw, and is idempotent", async () => {
    await db.insert(matches).values([
      footballDataRow({
        seasonId: 1990,
        kickoffAt: kickoff(1),
        status: "FINISHED",
        homeGoals: 2,
        awayGoals: 0,
      }),
      // Stored as 5–4 with penalties 4–3: really 1–1.
      footballDataRow({
        providerMatchId: IDS[1] as number,
        seasonId: 1990,
        kickoffAt: kickoff(2),
        status: "FINISHED",
        homeGoals: 5,
        awayGoals: 4,
        penaltiesHome: 4,
        penaltiesAway: 3,
      }),
      footballDataRow({
        providerMatchId: IDS[2] as number,
        seasonId: 1990,
        kickoffAt: kickoff(3),
        status: "FINISHED",
        homeGoals: 0,
        awayGoals: 3,
      }),
    ]);

    await runPredictionBacktest(NOW);
    await runPredictionBacktest(NOW);

    expect(await rowsFor(IDS[0] as number, "backtest")).toHaveLength(0);
    expect(await rowsFor(IDS[1] as number, "backtest")).toEqual([
      expect.objectContaining({ homeProbability: 1, drawProbability: 0, awayProbability: 0 }),
    ]);
    expect(await rowsFor(IDS[2] as number, "backtest")).toEqual([
      expect.objectContaining({ homeProbability: 0.5, drawProbability: 0.5, awayProbability: 0 }),
    ]);

    // elo-v1 (specs/053): the same two teams every time, so the ratings can be
    // followed by hand. The draw is the baseline's: none, then a half.
    const first = 20 * (1 - expectedHome(1500, 1500));
    const [home1, away1] = [1500 + first, 1500 - first];
    const second = 20 * (0.5 - expectedHome(home1, away1));
    const [home2, away2] = [home1 + second, away1 - second];
    expect(await rowsFor(IDS[0] as number, "backtest", "elo-v1")).toHaveLength(0);
    expect(await rowsFor(IDS[1] as number, "backtest", "elo-v1")).toEqual([
      expect.objectContaining({
        homeProbability: expect.closeTo(expectedHome(home1, away1), 12),
        drawProbability: 0,
      }),
    ]);
    expect(await rowsFor(IDS[2] as number, "backtest", "elo-v1")).toEqual([
      expect.objectContaining({
        homeProbability: expect.closeTo(0.5 * expectedHome(home2, away2), 12),
        drawProbability: 0.5,
      }),
    ]);
  });

  it("files TASO rows by their pair, and lets no match at the same kickoff inform another", async () => {
    await db.insert(tasoMatches).values([
      tasoRow({ kickoffAt: kickoff(1), homeGoals: 0, awayGoals: 1 }),
      tasoRow({
        providerMatchId: IDS[7] as number,
        kickoffAt: kickoff(8),
        homeGoals: 2,
        awayGoals: 0,
      }),
      tasoRow({
        providerMatchId: IDS[8] as number,
        kickoffAt: kickoff(8),
        homeGoals: 2,
        awayGoals: 0,
      }),
      // The same category under a cup that season: not Veikkausliiga's.
      tasoRow({
        providerMatchId: IDS[9] as number,
        competitionCode: "Liigacup90",
        kickoffAt: kickoff(4),
        homeGoals: 3,
        awayGoals: 0,
      }),
    ]);

    await runPredictionBacktest(NOW);

    for (const id of [IDS[7], IDS[8]] as number[]) {
      expect(await rowsFor(id, "backtest")).toEqual([
        expect.objectContaining({ source: "taso", competitionCode: "VL", awayProbability: 1 }),
      ]);
    }
    expect(await rowsFor(IDS[9] as number, "backtest")).toHaveLength(0);
  });
});
