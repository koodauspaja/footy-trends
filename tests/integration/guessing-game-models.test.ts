import { and, eq, gte, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { gameGuess, gameLedger, predictions, tasoMatches, user } from "@/db/schema";
import { readModelGuesses } from "@/lib/guessing-game-board";
import { joinGame, placeGuess, settleGuesses } from "@/lib/guessing-game-store";

/**
 * Arvauspeli against the models with a real Postgres: the models' live rows as
 * the prediction log leaves them, read back as guesses, and the reward for
 * beating them paid once, in a season of its own.
 *
 * decisions/074-against-the-models.md
 */

const SEASON = 2093;
const NOW = new Date("2093-05-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const FIRST_MATCH_ID = 9_300_000;
const OUTCOME_PLAYER = "itest-models-outcome";
const SCORE_PLAYER = "itest-models-score";
const PLAYERS = [OUTCOME_PLAYER, SCORE_PLAYER];

let nextMatchId = FIRST_MATCH_ID;
let matchId = 0;

async function storeMatch(): Promise<number> {
  nextMatchId += 1;
  await db.insert(tasoMatches).values({
    providerMatchId: nextMatchId,
    competitionCode: `spljp${SEASON % 100}`,
    categoryId: "VL",
    seasonId: SEASON,
    groupId: 1,
    groupName: "Runkosarja",
    kickoffAt: at(200),
    status: "SCHEDULED",
    homeTeamProviderId: 1,
    homeTeamName: "HJK",
    awayTeamProviderId: 2,
    awayTeamName: "KuPS",
  });
  return nextMatchId;
}

// A model's live row as the hourly log leaves it at kickoff.
function liveRow(model: string, probabilities: [number, number, number], score?: [number, number]) {
  return {
    source: "taso",
    providerMatchId: matchId,
    competitionCode: `spljp${SEASON % 100}`,
    model,
    kind: "live",
    homeProbability: probabilities[0],
    drawProbability: probabilities[1],
    awayProbability: probabilities[2],
    predictedAt: at(199),
    kickoffAt: at(200),
    predictedHomeGoals: score?.[0] ?? null,
    predictedAwayGoals: score?.[1] ?? null,
  };
}

async function finish(homeGoals: number, awayGoals: number, status = "FINISHED") {
  await db
    .update(tasoMatches)
    .set({ status, homeGoals, awayGoals })
    .where(eq(tasoMatches.providerMatchId, matchId));
}

async function modelRows() {
  return db
    .select({ userId: gameLedger.userId, amount: gameLedger.amount })
    .from(gameLedger)
    .where(and(eq(gameLedger.kind, "models"), inArray(gameLedger.userId, PLAYERS)))
    .orderBy(gameLedger.userId);
}

beforeEach(async () => {
  await db.insert(user).values(
    PLAYERS.map((id) => ({
      id,
      name: "Integration Player",
      email: `${id}@example.com`,
      emailVerified: true,
    }))
  );
  matchId = await storeMatch();
  for (const id of PLAYERS) await joinGame(id, NOW);
  await placeGuess(OUTCOME_PLAYER, matchId, { kind: "outcome", outcome: "2" }, 10, () => NOW);
  await placeGuess(
    SCORE_PLAYER,
    matchId,
    { kind: "score", homeGoals: 0, awayGoals: 1 },
    10,
    () => NOW
  );
});

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, PLAYERS));
  await db.delete(predictions).where(gte(predictions.providerMatchId, FIRST_MATCH_ID));
  await db.delete(tasoMatches).where(gte(tasoMatches.providerMatchId, FIRST_MATCH_ID));
});

describe("the models' guesses", () => {
  it("reads each model's live row as its guess, Poisson with its stored score, in the shown order", async () => {
    await db.insert(predictions).values([
      liveRow("poisson-v1", [0.5, 0.3, 0.2], [2, 0]),
      liveRow("elo-v1", [0.3, 0.3, 0.4]),
      // A backtest row and the baseline are not guesses.
      { ...liveRow("elo-form-v1", [0.6, 0.2, 0.2]), kind: "backtest" },
      liveRow("home-baseline-v1", [0.5, 0.3, 0.2]),
    ]);

    expect((await readModelGuesses(db, [matchId])).get(matchId)).toEqual([
      { model: "elo-v1", outcome: "2", score: null },
      { model: "poisson-v1", outcome: "1", score: { homeGoals: 2, awayGoals: 0 } },
    ]);
  });
});

describe("the reward for beating the models", () => {
  beforeEach(async () => {
    await db
      .insert(predictions)
      .values([
        liveRow("elo-v1", [0.5, 0.3, 0.2]),
        liveRow("elo-form-v1", [0.3, 0.4, 0.3]),
        liveRow("elo-home-v1", [0.2, 0.3, 0.5]),
        liveRow("poisson-v1", [0.5, 0.3, 0.2], [2, 1]),
      ]);
  });

  it("pays 10 for each model beaten, once, and counts it in the run", async () => {
    // 0–2: the 1X2 guess `2` beats the three models that picked `1` or `X`; the
    // score guess 0–1 has the goal difference wrong but the 1X2 right, above
    // Poisson's 2–1, which has neither.
    await finish(0, 2);

    expect(await settleGuesses(at(210))).toMatchObject({ rewarded: 2, modelWins: 2 });
    expect(await modelRows()).toEqual([
      { userId: OUTCOME_PLAYER, amount: 30 },
      { userId: SCORE_PLAYER, amount: 10 },
    ]);

    // A second run settles nothing, and pays nothing again.
    expect(await settleGuesses(at(211))).toMatchObject({ rewarded: 0, modelWins: 0 });
    expect(await modelRows()).toHaveLength(2);
  });

  it("is refused by the database a second time for the same guess", async () => {
    await finish(0, 2);
    await settleGuesses(at(210));
    const [guess] = await db
      .select({ id: gameGuess.id })
      .from(gameGuess)
      .where(eq(gameGuess.userId, OUTCOME_PLAYER));

    await expect(
      db.insert(gameLedger).values({
        userId: OUTCOME_PLAYER,
        seasonId: SEASON,
        kind: "models",
        amount: 10,
        guessId: guess?.id,
      })
    ).rejects.toThrow();
  });

  it("pays nothing when the models were right", async () => {
    // 2–1: Elo's and Poisson's `1`; the outcome player's `2` misses.
    await finish(2, 1);

    expect(await settleGuesses(at(210))).toMatchObject({ modelWins: 0 });
    expect(await modelRows()).toEqual([]);
  });

  it("pays nothing on an abandoned match", async () => {
    await finish(0, 2, "Abandoned");

    expect(await settleGuesses(at(210))).toMatchObject({ refunded: 2, modelWins: 0 });
    expect(await modelRows()).toEqual([]);
  });
});

describe("a match no model predicted", () => {
  it("pays nothing against the models", async () => {
    await finish(0, 2);

    expect(await settleGuesses(at(210))).toMatchObject({ rewarded: 2, modelWins: 0 });
    expect(await modelRows()).toEqual([]);
  });
});
