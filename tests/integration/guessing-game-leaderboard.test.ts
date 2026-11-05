import { and, eq, gte, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { gameGuess, gameLedger, tasoMatches, user } from "@/db/schema";
import { readBoard, readShares } from "@/lib/guessing-game-board";
import { joinGame, placeGuess, settleGuesses } from "@/lib/guessing-game-store";
import { nicknameKey } from "@/lib/nickname";
import { saveNickname } from "@/lib/nickname-store";

/**
 * Arvauspeli's leaderboard, shares and rarity bonus against a real Postgres:
 * six players on one match, one of them right, in a season of its own.
 *
 * decisions/073-leaderboard.md
 */

const SEASON = 2092;
const NOW = new Date("2092-05-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const FIRST_MATCH_ID = 9_200_000;
const PLAYERS = [
  "itest-board-1",
  "itest-board-2",
  "itest-board-3",
  "itest-board-4",
  "itest-board-5",
  "itest-board-6",
];
const RIGHT = "itest-board-1";
const IDLE = "itest-board-idle";
const EVERYONE = [...PLAYERS, IDLE];

let nextMatchId = FIRST_MATCH_ID;

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

async function finish(providerMatchId: number) {
  await db
    .update(tasoMatches)
    .set({ status: "FINISHED", homeGoals: 1, awayGoals: 0 })
    .where(eq(tasoMatches.providerMatchId, providerMatchId));
}

async function bonusRows() {
  return db
    .select({ userId: gameLedger.userId, amount: gameLedger.amount })
    .from(gameLedger)
    .where(and(eq(gameLedger.kind, "bonus"), inArray(gameLedger.userId, EVERYONE)));
}

let matchId = 0;

beforeEach(async () => {
  await db.insert(user).values(
    EVERYONE.map((id) => ({
      id,
      name: "Integration Player",
      email: `${id}@example.com`,
      emailVerified: true,
    }))
  );
  matchId = await storeMatch();
  for (const id of EVERYONE) await joinGame(id, NOW);
  // Five guess an away win at the earliest price, one the home win the match ends with.
  for (const id of PLAYERS) {
    const outcome = id === RIGHT ? "1" : "2";
    expect(
      await placeGuess(id, matchId, { kind: "outcome", outcome }, 10, () => NOW)
    ).toMatchObject({
      ok: true,
    });
  }
  await saveNickname(RIGHT, { nickname: "Osuja", key: nicknameKey("Osuja") });
  await saveNickname("itest-board-2", { nickname: "Aino", key: nicknameKey("Aino") });
});

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, EVERYONE));
  await db.delete(tasoMatches).where(gte(tasoMatches.providerMatchId, FIRST_MATCH_ID));
});

describe("the rarity bonus", () => {
  it("pays the one correct 1X2 of six once, on top of its reward", async () => {
    await finish(matchId);

    expect(await settleGuesses(at(210))).toMatchObject({ rewarded: 1, missed: 5, bonuses: 1 });
    expect(await bonusRows()).toEqual([{ userId: RIGHT, amount: 20 }]);

    // A second run settles nothing again, and pays no second bonus.
    expect(await settleGuesses(at(211))).toMatchObject({ rewarded: 0, bonuses: 0 });
    expect(await bonusRows()).toHaveLength(1);
  });

  it("is refused by the database a second time for the same guess", async () => {
    await finish(matchId);
    await settleGuesses(at(210));
    const [guess] = await db
      .select({ id: gameGuess.id })
      .from(gameGuess)
      .where(eq(gameGuess.userId, RIGHT));

    await expect(
      db
        .insert(gameLedger)
        .values({ userId: RIGHT, seasonId: SEASON, kind: "bonus", amount: 20, guessId: guess?.id })
    ).rejects.toThrow();
  });

  it("is not paid on an abandoned match", async () => {
    await db
      .update(tasoMatches)
      .set({ status: "Abandoned" })
      .where(eq(tasoMatches.providerMatchId, matchId));

    expect(await settleGuesses(at(210))).toMatchObject({ refunded: 6, bonuses: 0 });
    expect(await bonusRows()).toEqual([]);
  });
});

describe("the leaderboard", () => {
  it("ranks every player who guessed by balance, ties by nickname, and leaves out one who never did", async () => {
    await finish(matchId);
    await settleGuesses(at(210));

    const board = await readBoard(SEASON, "itest-board-3");

    // 1 000 − 10 + 30 + 20 for the hit; 990 for each miss.
    expect(board.players).toBe(6);
    expect(
      board.rows.map((row) => [row.rank, row.nickname, row.balance, row.settled, row.self])
    ).toEqual([
      [1, "Osuja", 1040, 1, false],
      [2, "Aino", 990, 1, false],
      // Ties without a nickname in a stable order: the reader, board-3, first of them.
      [2, null, 990, 1, true],
      [2, null, 990, 1, false],
      [2, null, 990, 1, false],
      [2, null, 990, 1, false],
    ]);
  });

  it("counts a guess before it is settled, at its cost", async () => {
    const board = await readBoard(SEASON, RIGHT);

    expect(board.rows.every((row) => row.balance === 990 && row.settled === 0)).toBe(true);
  });

  it("loses a player whose account is deleted", async () => {
    await db.delete(user).where(eq(user.id, RIGHT));

    const board = await readBoard(SEASON, RIGHT);
    expect(board.players).toBe(5);
    expect(board.rows.some((row) => row.nickname === "Osuja")).toBe(false);
  });
});

describe("the shares", () => {
  it("shows nothing before the kickoff, and every guess's 1X2 after it", async () => {
    expect(await readShares([matchId], at(199))).toEqual(new Map());
    expect(await readShares([matchId], at(201))).toEqual(
      new Map([[matchId, { "1": 17, X: 0, "2": 83, total: 6 }]])
    );
  });

  it("counts a score guess by its goals, and leaves out a guess made after the kickoff", async () => {
    await db
      .update(gameGuess)
      .set({ kind: "score", outcome: null, homeGoals: 0, awayGoals: 0 })
      .where(eq(gameGuess.userId, "itest-board-2"));
    // Made after the stored kickoff, as a kickoff moved earlier leaves one: void.
    await db
      .update(gameGuess)
      .set({ madeAt: at(250) })
      .where(eq(gameGuess.userId, "itest-board-3"));

    expect(await readShares([matchId], at(201))).toEqual(
      new Map([[matchId, { "1": 20, X: 20, "2": 60, total: 5 }]])
    );
  });

  it("counts the guesses on an awarded match, which are settled, not refunded", async () => {
    await db
      .update(tasoMatches)
      .set({ status: "FINISHED", providerStatus: "Forfeited", homeGoals: 3, awayGoals: 0 })
      .where(eq(tasoMatches.providerMatchId, matchId));
    await settleGuesses(at(210));

    expect((await readShares([matchId], at(211))).get(matchId)).toMatchObject({ total: 6 });
  });

  it("leaves out an abandoned match's guesses before the run refunds them", async () => {
    await db
      .update(tasoMatches)
      .set({ status: "Abandoned" })
      .where(eq(tasoMatches.providerMatchId, matchId));

    expect(await readShares([matchId], at(201))).toEqual(new Map());
  });

  it("leaves out refunded guesses once settled", async () => {
    await db
      .update(tasoMatches)
      .set({ status: "Abandoned" })
      .where(eq(tasoMatches.providerMatchId, matchId));
    await settleGuesses(at(210));

    expect(await readShares([matchId], at(211))).toEqual(new Map());
  });
});
