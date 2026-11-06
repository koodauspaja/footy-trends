import { and, eq, gte, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { gameLedger, gameSeasonGuess, tasoMatches, user } from "@/db/schema";
import { placeSeasonGuess, settleSeasonGuesses } from "@/lib/guessing-game-season-store";
import { joinGame } from "@/lib/guessing-game-store";

/**
 * Arvauspeli's season guesses against a real Postgres: placing pays once, a
 * change is free, the lock, settling once by the season's tables, and the void
 * with the next season, in seasons of their own. The tables are the standings
 * page's, stood in for here, since reading them asks TASO.
 *
 * decisions/075-season-guesses.md
 */

const { standings } = vi.hoisted(() => ({ standings: vi.fn() }));
vi.mock("@/lib/taso-standings-service", () => ({ getSeasonStandings: standings }));

const SEASON = 2094;
const NOW = new Date("2094-03-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const FIRST_MATCH_ID = 9_400_000;
const PLAYER = "itest-season-player";
const OTHER = "itest-season-other";
const PLAYERS = [PLAYER, OTHER];
/** The season's twelve teams, TASO ids 1 to 12, the table's order by id. */
const TEAMS = Array.from({ length: 12 }, (_, index) => index + 1);

let nextMatchId = FIRST_MATCH_ID;

function vlMatch(overrides: Partial<typeof tasoMatches.$inferInsert> = {}) {
  nextMatchId += 1;
  const seasonId = overrides.seasonId ?? SEASON;
  return {
    providerMatchId: nextMatchId,
    competitionCode: `spljp${seasonId % 100}`,
    categoryId: "VL",
    seasonId,
    groupId: 1,
    groupName: "Runkosarja",
    kickoffAt: at(200),
    status: "SCHEDULED",
    homeTeamProviderId: 1,
    homeTeamName: "Joukkue 1",
    awayTeamProviderId: 2,
    awayTeamName: "Joukkue 2",
    ...overrides,
  };
}

// The regular season's fixtures: each team once, 1 v 2 to 11 v 12.
async function storeRegularSeason() {
  await db.insert(tasoMatches).values(
    [0, 2, 4, 6, 8, 10].map((index) =>
      vlMatch({
        homeTeamProviderId: index + 1,
        homeTeamName: `Joukkue ${index + 1}`,
        awayTeamProviderId: index + 2,
        awayTeamName: `Joukkue ${index + 2}`,
        kickoffAt: at(200 + index),
      })
    )
  );
}

async function finishGroup(groupId: number) {
  await db
    .update(tasoMatches)
    .set({ status: "FINISHED", homeGoals: 1, awayGoals: 0 })
    .where(and(eq(tasoMatches.seasonId, SEASON), eq(tasoMatches.groupId, groupId)));
}

function table(groupId: number, teams: readonly number[]) {
  return {
    kind: "own-calculated",
    groupId,
    groupName: `Lohko ${groupId}`,
    standings: teams.map((teamProviderId, index) => ({ position: index + 1, teamProviderId })),
  };
}

async function ledger(kind: string) {
  return db
    .select({ userId: gameLedger.userId, amount: gameLedger.amount })
    .from(gameLedger)
    .where(and(eq(gameLedger.kind, kind), inArray(gameLedger.userId, PLAYERS)))
    .orderBy(gameLedger.userId, gameLedger.amount);
}

beforeEach(async () => {
  standings.mockReset();
  await db.insert(user).values(
    PLAYERS.map((id) => ({
      id,
      name: "Integration Player",
      email: `${id}@example.com`,
      emailVerified: true,
    }))
  );
  await storeRegularSeason();
  for (const id of PLAYERS) await joinGame(id, NOW);
});

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, PLAYERS));
  await db.delete(tasoMatches).where(gte(tasoMatches.providerMatchId, FIRST_MATCH_ID));
});

describe("placing a season guess", () => {
  it("pays its price once, and a change before the lock is free", async () => {
    expect(await placeSeasonGuess(PLAYER, { kind: "champion", teams: [3] }, () => NOW)).toEqual({
      ok: true,
      outcome: "placed",
    });
    expect(await placeSeasonGuess(PLAYER, { kind: "champion", teams: [5] }, () => at(1))).toEqual({
      ok: true,
      outcome: "changed",
    });

    expect(await ledger("season-guess")).toEqual([{ userId: PLAYER, amount: -50 }]);
    const [row] = await db
      .select({ teams: gameSeasonGuess.teams })
      .from(gameSeasonGuess)
      .where(eq(gameSeasonGuess.userId, PLAYER));
    expect(row?.teams).toEqual([5]);
  });

  it("stays locked once the first kickoff has passed, though the first matches move later", async () => {
    await placeSeasonGuess(PLAYER, { kind: "champion", teams: [3] }, () => NOW);
    await db
      .update(tasoMatches)
      .set({ kickoffAt: at(500) })
      .where(eq(tasoMatches.seasonId, SEASON));

    expect(await placeSeasonGuess(OTHER, { kind: "champion", teams: [4] }, () => at(300))).toEqual({
      ok: false,
      reason: "locked",
    });
    const [row] = await db
      .select({ madeAt: gameSeasonGuess.madeAt, lockAt: gameSeasonGuess.lockAt })
      .from(gameSeasonGuess)
      .where(eq(gameSeasonGuess.userId, PLAYER));
    expect(row).toEqual({ madeAt: NOW, lockAt: at(200) });
  });

  it("is refused at the season's first kickoff, and with a team outside the season", async () => {
    expect(await placeSeasonGuess(PLAYER, { kind: "last", teams: [12] }, () => at(200))).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(await placeSeasonGuess(PLAYER, { kind: "last", teams: [13] }, () => NOW)).toEqual({
      ok: false,
      reason: "teams",
    });
    expect(await ledger("season-guess")).toEqual([]);
  });

  it("is refused by the database a second time for the same player, season and kind", async () => {
    await placeSeasonGuess(PLAYER, { kind: "champion", teams: [3] }, () => NOW);

    await expect(
      db.insert(gameSeasonGuess).values({
        userId: PLAYER,
        seasonId: SEASON,
        kind: "champion",
        teams: [4],
        madeAt: NOW,
        lockAt: at(200),
      })
    ).rejects.toThrow();
  });
});

describe("settling season guesses", () => {
  beforeEach(async () => {
    await placeSeasonGuess(PLAYER, { kind: "upper", teams: [1, 2, 3, 4, 5, 12] }, () => NOW);
    await placeSeasonGuess(PLAYER, { kind: "champion", teams: [1] }, () => NOW);
    await placeSeasonGuess(OTHER, { kind: "last", teams: [11] }, () => NOW);
    await placeSeasonGuess(OTHER, { kind: "table", teams: TEAMS }, () => NOW);
  });

  it("waits while the regular season is being played", async () => {
    expect(await settleSeasonGuesses(at(300))).toMatchObject({ settled: 0, failed: [] });
    expect(standings).not.toHaveBeenCalled();
  });

  it("pays the six after the regular season, and the rest after both groups, once", async () => {
    await finishGroup(1);
    standings.mockResolvedValue({ status: "ok", groups: [table(1, TEAMS)], levels: [] });

    // Five of the six reached Mestaruussarja: 5 × 15.
    expect(await settleSeasonGuesses(at(300))).toMatchObject({ settled: 1, rewarded: 1 });
    expect(await ledger("season-reward")).toEqual([{ userId: PLAYER, amount: 75 }]);

    await db
      .insert(tasoMatches)
      .values([
        vlMatch({ groupId: 2, groupName: "Mestaruussarja", status: "FINISHED" }),
        vlMatch({ groupId: 3, groupName: "Karsintasarja", status: "FINISHED" }),
      ]);
    // Team 1 champion; 11 and 12 swapped at the bottom.
    standings.mockResolvedValue({
      status: "ok",
      groups: [table(1, TEAMS), table(2, [1, 2, 3, 4, 5, 6]), table(3, [7, 8, 9, 10, 12, 11])],
      levels: [],
    });

    expect(await settleSeasonGuesses(at(400))).toMatchObject({ settled: 3, rewarded: 3 });
    // Champion 200; the last-place guess 11 finished 12th, so 200; the table ten
    // exact and two one off: 10 × 30 + 2 × 10.
    expect(await ledger("season-reward")).toEqual([
      { userId: OTHER, amount: 200 },
      { userId: OTHER, amount: 320 },
      { userId: PLAYER, amount: 75 },
      { userId: PLAYER, amount: 200 },
    ]);

    expect(await settleSeasonGuesses(at(401))).toMatchObject({ settled: 0 });
    expect(await ledger("season-reward")).toHaveLength(4);
  });

  it("voids a guess still open once the next season's first fixture is stored", async () => {
    await db.insert(tasoMatches).values(vlMatch({ seasonId: SEASON + 1, kickoffAt: at(9000) }));

    expect(await settleSeasonGuesses(at(5000))).toMatchObject({ settled: 4, voided: 4 });
    expect(await ledger("season-refund")).toEqual([
      { userId: OTHER, amount: 50 },
      { userId: OTHER, amount: 100 },
      { userId: PLAYER, amount: 50 },
      { userId: PLAYER, amount: 50 },
    ]);
  });

  it("is refused by the database a second time for the same guess", async () => {
    await finishGroup(1);
    standings.mockResolvedValue({ status: "ok", groups: [table(1, TEAMS)], levels: [] });
    await settleSeasonGuesses(at(300));
    const [guess] = await db
      .select({ id: gameSeasonGuess.id })
      .from(gameSeasonGuess)
      .where(and(eq(gameSeasonGuess.userId, PLAYER), eq(gameSeasonGuess.kind, "upper")));

    await expect(
      db.insert(gameLedger).values({
        userId: PLAYER,
        seasonId: SEASON,
        kind: "season-reward",
        amount: 75,
        seasonGuessId: guess?.id,
      })
    ).rejects.toThrow();
  });
});
