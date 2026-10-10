import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { matches, predictions, tasoMatches } from "@/db/schema";
import { getMatchSurprise, getSeasonSurprises } from "@/lib/surprise-service";

/**
 * The surprise reads against a real Postgres, set in 1980 and 1981 so the
 * competition's first stored season is this suite's own. `predictions.test.ts`
 * deletes every backtest row around its tests; the integration files run one
 * at a time, so these rows are this suite's for as long as it needs them.
 *
 * decisions/057-surprise-index.md
 */

const IDS = Array.from({ length: 12 }, (_, index) => 984_001 + index);
const id = (index: number) => IDS[index] as number;
const kickoff = (day: number, year = 1981) => new Date(Date.UTC(year, 4, day, 15));

function footballDataMatch(
  index: number,
  overrides: Partial<typeof matches.$inferInsert> = {}
): typeof matches.$inferInsert {
  return {
    providerMatchId: id(index),
    competitionCode: "PPL",
    seasonId: 1981,
    kickoffAt: kickoff(index + 1),
    matchday: 1,
    status: "FINISHED",
    stage: null,
    groupName: null,
    homeTeamProviderId: 984_101,
    homeTeamName: "Surprise Home",
    awayTeamProviderId: 984_102,
    awayTeamName: "Surprise Away",
    homeGoals: 1,
    awayGoals: 0,
    ...overrides,
  };
}

function tasoMatch(
  index: number,
  overrides: Partial<typeof tasoMatches.$inferInsert> = {}
): typeof tasoMatches.$inferInsert {
  return {
    providerMatchId: id(index),
    competitionCode: "spljp81",
    categoryId: "VL",
    seasonId: 1981,
    groupId: 1,
    groupName: "Runkosarja",
    kickoffAt: kickoff(index + 1),
    matchday: 1,
    status: "FINISHED",
    winner: null,
    homeTeamProviderId: 984_201,
    homeTeamName: "Yllätys Koti",
    awayTeamProviderId: 984_202,
    awayTeamName: "Yllätys Vieras",
    homeGoals: 1,
    awayGoals: 0,
    ...overrides,
  };
}

// Elo's backtest row of a match unless told otherwise: home 0,2, away 0,1.
function predicted(
  index: number,
  source: "football-data" | "taso",
  overrides: Partial<typeof predictions.$inferInsert> = {}
): typeof predictions.$inferInsert {
  return {
    source,
    providerMatchId: id(index),
    competitionCode: source === "taso" ? "VL" : "PPL",
    model: "elo-v1",
    kind: "backtest",
    homeProbability: 0.2,
    drawProbability: 0.7,
    awayProbability: 0.1,
    predictedAt: new Date(Date.UTC(2026, 0, 1)),
    kickoffAt: kickoff(index + 1),
    ...overrides,
  };
}

async function clear() {
  await db.delete(predictions).where(inArray(predictions.providerMatchId, IDS));
  await db.delete(matches).where(inArray(matches.providerMatchId, IDS));
  await db.delete(tasoMatches).where(inArray(tasoMatches.providerMatchId, IDS));
}

beforeEach(clear);
afterEach(clear);

describe("getSeasonSurprises against Postgres", () => {
  it("lists a football-data season's wins by Elo's backtest row, a shoot-out left out as a draw", async () => {
    await db.insert(matches).values([
      // The season before, so 1981 is not the competition's first.
      footballDataMatch(0, { seasonId: 1980, kickoffAt: kickoff(1, 1980) }),
      footballDataMatch(1),
      footballDataMatch(2, { homeGoals: 0, awayGoals: 2 }),
      // Stored as 5–4 with penalties 4–3: 1–1, a draw.
      footballDataMatch(3, { homeGoals: 5, awayGoals: 4, penaltiesHome: 4, penaltiesAway: 3 }),
      // Won in extra time: a win, its score as stored.
      footballDataMatch(4, { homeGoals: 2, awayGoals: 1, extraTimeHome: 1, extraTimeAway: 0 }),
      // Only a live Elo row, only another model's backtest row, and no row at all.
      footballDataMatch(5),
      footballDataMatch(6),
      footballDataMatch(7),
      // In play with a score so far.
      footballDataMatch(8, { status: "IN_PLAY" }),
    ]);
    await db
      .insert(predictions)
      .values([
        predicted(0, "football-data"),
        predicted(1, "football-data"),
        predicted(2, "football-data"),
        predicted(3, "football-data"),
        predicted(4, "football-data", { homeProbability: 0.15 }),
        predicted(5, "football-data", { kind: "live", homeProbability: 0.01 }),
        predicted(6, "football-data", { model: "poisson-v1", homeProbability: 0.01 }),
        predicted(8, "football-data", { homeProbability: 0.01 }),
      ]);

    const result = await getSeasonSurprises("football-data", "PPL", 1981, 2099);

    expect(result).toMatchObject({ status: "ok", inProgress: false });
    expect(result.status === "ok" && result.surprises).toEqual([
      expect.objectContaining({
        providerMatchId: id(2),
        probability: 0.1,
        homeGoals: 0,
        awayGoals: 2,
        homeTeamName: "Surprise Home",
        awayTeamName: "Surprise Away",
        kickoffAt: kickoff(3),
      }),
      expect.objectContaining({ providerMatchId: id(4), probability: 0.15, homeGoals: 2 }),
      expect.objectContaining({ providerMatchId: id(1), probability: 0.2 }),
    ]);
  });

  it("shows no list for the competition's first stored season", async () => {
    await db
      .insert(matches)
      .values([
        footballDataMatch(0, { seasonId: 1980, kickoffAt: kickoff(1, 1980) }),
        footballDataMatch(1, { seasonId: 1980, kickoffAt: kickoff(2, 1980) }),
      ]);
    await db.insert(predictions).values(predicted(1, "football-data"));

    await expect(getSeasonSurprises("football-data", "PPL", 1980, 2099)).resolves.toEqual({
      status: "first-season",
    });
  });

  it("lists a domestic competition's groups together, by the code the prediction is filed under", async () => {
    await db.insert(tasoMatches).values([
      tasoMatch(0, { competitionCode: "spljp80", seasonId: 1980, kickoffAt: kickoff(1, 1980) }),
      tasoMatch(1),
      tasoMatch(2, { groupId: 2, groupName: "Mestaruussarja", homeGoals: 0, awayGoals: 1 }),
      tasoMatch(3, { homeGoals: 2, awayGoals: 2 }),
      // Another competition's match of the same season.
      tasoMatch(4, { categoryId: "M1" }),
      // Finished without a score.
      tasoMatch(5, { homeGoals: null, awayGoals: null }),
    ]);
    await db
      .insert(predictions)
      .values([
        predicted(1, "taso"),
        predicted(2, "taso"),
        predicted(3, "taso"),
        predicted(4, "taso", { competitionCode: "M1", homeProbability: 0.01 }),
        predicted(5, "taso", { homeProbability: 0.01 }),
      ]);

    const result = await getSeasonSurprises("taso", "VL", 1981, 1981);

    expect(result).toMatchObject({ status: "ok", inProgress: true });
    expect(
      result.status === "ok" && result.surprises.map((s) => [s.providerMatchId, s.probability])
    ).toEqual([
      [id(2), 0.1],
      [id(1), 0.2],
    ]);
  });
});

describe("getMatchSurprise against Postgres", () => {
  it("reads the match's own Elo backtest row, never a live one or another model's", async () => {
    await db.insert(matches).values(footballDataMatch(1, { homeGoals: 0, awayGoals: 1 }));
    await db.insert(predictions).values([
      predicted(1, "football-data"),
      predicted(1, "football-data", { kind: "live", awayProbability: 0.9 }),
      predicted(1, "football-data", { model: "poisson-v1", awayProbability: 0.9 }),
      // TASO's match of the same id is another match.
      predicted(1, "taso", { awayProbability: 0.9 }),
    ]);
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.providerMatchId, id(1)));

    await expect(
      getMatchSurprise({ source: "football-data", match: match as typeof matches.$inferSelect })
    ).resolves.toBe(0.1);
  });

  it("has no figure for a TASO match with only a live row", async () => {
    await db.insert(tasoMatches).values(tasoMatch(1));
    await db.insert(predictions).values(predicted(1, "taso", { kind: "live" }));
    const [match] = await db
      .select()
      .from(tasoMatches)
      .where(eq(tasoMatches.providerMatchId, id(1)));

    await expect(
      getMatchSurprise({ source: "taso", match: match as typeof tasoMatches.$inferSelect })
    ).resolves.toBeNull();
  });
});
