import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { matches, predictions, tasoMatches } from "@/db/schema";

// No Redis in the integration job: every read reaches Postgres.
vi.mock("@/lib/cache", () => ({
  getCached: vi.fn(async (_key: string, _ttl: number, fetcher: () => Promise<unknown>) =>
    fetcher()
  ),
}));

import { getPredictionQuality } from "@/lib/prediction-quality-service";

/**
 * The prediction quality's join against a real Postgres (specs/054). Every row
 * is a `live` one on this suite's own ids: `predictions.test.ts` writes live
 * rows only for unfinished matches, which are never judged, and clears every
 * backtest row, so `live` is the kind no other suite leaves judged rows in.
 */
const IDS = Array.from({ length: 8 }, (_, index) => 986_001 + index);
const MODELS = ["home-baseline-v1", "elo-v1"] as const;

function footballDataMatch(
  id: number,
  overrides: Partial<typeof matches.$inferInsert> = {}
): typeof matches.$inferInsert {
  return {
    providerMatchId: id,
    competitionCode: "CL",
    seasonId: 2025,
    kickoffAt: new Date(Date.UTC(2025, 9, id - 986_000)),
    matchday: 1,
    status: "FINISHED",
    stage: null,
    groupName: null,
    homeTeamProviderId: 986_101,
    homeTeamName: "Quality Home",
    awayTeamProviderId: 986_102,
    awayTeamName: "Quality Away",
    homeGoals: 1,
    awayGoals: 0,
    ...overrides,
  };
}

/** Both models' live predictions for a match, each certain of a home win. */
function predicted(
  id: number,
  source: "football-data" | "taso",
  models: readonly string[] = MODELS
): Array<typeof predictions.$inferInsert> {
  return models.map((model) => ({
    source,
    providerMatchId: id,
    competitionCode: source === "taso" ? "spljp25" : "CL",
    model,
    kind: "live",
    homeProbability: 1,
    drawProbability: 0,
    awayProbability: 0,
    predictedAt: new Date(Date.UTC(2025, 0, 1)),
    kickoffAt: new Date(Date.UTC(2025, 9, 1)),
  }));
}

async function clear() {
  await db.delete(predictions).where(inArray(predictions.providerMatchId, IDS));
  await db.delete(matches).where(inArray(matches.providerMatchId, IDS));
  await db.delete(tasoMatches).where(inArray(tasoMatches.providerMatchId, IDS));
}

beforeEach(clear);
afterEach(clear);

describe("getPredictionQuality against Postgres (specs/054)", () => {
  it("judges finished football-data matches from 2023, the shoot-out taken out", async () => {
    const [won, shootOut, unfinished, early, oneModel, otherModel] = IDS as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    await db.insert(matches).values([
      footballDataMatch(won),
      // 1–1 after extra time, 5–4 on penalties: a draw, so the home pick misses.
      footballDataMatch(shootOut, {
        homeGoals: 6,
        awayGoals: 5,
        penaltiesHome: 5,
        penaltiesAway: 4,
      }),
      // In play with a score so far: not finished, so not judged.
      footballDataMatch(unfinished, { status: "IN_PLAY", homeGoals: 0, awayGoals: 1 }),
      footballDataMatch(early, { seasonId: 2022 }),
      footballDataMatch(oneModel),
      footballDataMatch(otherModel),
    ]);
    await db
      .insert(predictions)
      .values([
        ...predicted(won, "football-data"),
        ...predicted(shootOut, "football-data"),
        ...predicted(unfinished, "football-data"),
        ...predicted(early, "football-data"),
        ...predicted(oneModel, "football-data", ["elo-v1"]),
        ...predicted(otherModel, "football-data", ["elo-v1", "poisson-v1"]),
      ]);

    // A backtest row for the same match, certain of an away win: another kind, not judged here.
    await db.insert(predictions).values(
      predicted(won, "football-data").map((row) => ({
        ...row,
        kind: "backtest",
        homeProbability: 0,
        awayProbability: 1,
      }))
    );

    const report = await getPredictionQuality("football-data", "live");

    expect(report).toMatchObject({
      status: "ok",
      matches: 2,
      firstSeason: 2025,
      lastSeason: 2025,
      totals: [
        { model: "home-baseline-v1", matches: 2, accuracy: 50, brier: 1 },
        { model: "elo-v1", matches: 2, accuracy: 50, brier: 1 },
      ],
    });
  });

  it("judges TASO matches by their own table, never football-data's", async () => {
    const [won, lost] = IDS.slice(6) as [number, number];
    const taso = (id: number, homeGoals: number, awayGoals: number) => ({
      providerMatchId: id,
      competitionCode: "spljp25",
      categoryId: "VL",
      seasonId: 2025,
      groupId: 1,
      groupName: "Runkosarja",
      kickoffAt: new Date(Date.UTC(2025, 5, id - 986_000)),
      matchday: 1,
      status: "FINISHED",
      winner: null,
      homeTeamProviderId: 986_201,
      homeTeamName: "Quality Koti",
      awayTeamProviderId: 986_202,
      awayTeamName: "Quality Vieras",
      homeGoals,
      awayGoals,
    });
    await db.insert(tasoMatches).values([taso(won, 2, 0), taso(lost, 0, 1)]);
    // Logged as football-data's too: the source keeps the id spaces apart.
    await db.insert(matches).values(footballDataMatch(won));
    await db.insert(predictions).values([...predicted(won, "taso"), ...predicted(lost, "taso")]);

    const report = await getPredictionQuality("taso", "live");

    expect(report).toMatchObject({
      status: "ok",
      matches: 2,
      totals: [
        { model: "home-baseline-v1", accuracy: 50 },
        { model: "elo-v1", accuracy: 50 },
      ],
    });
    await expect(getPredictionQuality("football-data", "live")).resolves.toEqual({
      status: "empty",
    });
  });
});
