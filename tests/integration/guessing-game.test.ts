import { eq, gte, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { gameGuess, gameLedger, gamePlayer, tasoMatches, user } from "@/db/schema";
import { joinGame, openGame, placeGuess, settleGuesses } from "@/lib/guessing-game-store";

/**
 * Arvauspeli against a real Postgres: joining and the grant, guesses and the
 * floor, two guesses at once, settling once, and the cascade with the user, in
 * a season far enough ahead to keep every other test's TASO rows out.
 *
 * decisions/072-match-guesses.md
 */

const SEASON = 2091;
const USER_ID = "itest-game-user";
const OTHER_ID = "itest-game-other";
const NOW = new Date("2091-05-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

const FIRST_MATCH_ID = 9_100_000;
let nextMatchId = FIRST_MATCH_ID;

function vlMatch(overrides: Partial<typeof tasoMatches.$inferInsert> = {}) {
  nextMatchId += 1;
  const seasonId = overrides.seasonId ?? SEASON;
  return {
    providerMatchId: nextMatchId,
    competitionCode: `spljp${String(seasonId % 100).padStart(2, "0")}`,
    categoryId: "VL",
    seasonId,
    groupId: 1,
    groupName: "Runkosarja",
    kickoffAt: at(200),
    status: "SCHEDULED",
    homeTeamProviderId: 1,
    homeTeamName: "HJK",
    awayTeamProviderId: 2,
    awayTeamName: "KuPS",
    homeGoals: null,
    awayGoals: null,
    ...overrides,
  };
}

async function storeMatches<const T extends ReadonlyArray<ReturnType<typeof vlMatch>>>(
  rows: T
): Promise<{ -readonly [K in keyof T]: number }> {
  await db.insert(tasoMatches).values([...rows]);
  return rows.map((row) => row.providerMatchId) as { -readonly [K in keyof T]: number };
}

async function insertUser(id: string) {
  await db
    .insert(user)
    .values({ id, name: "Integration Player", email: `${id}@example.com`, emailVerified: true });
}

async function ledger(userId = USER_ID) {
  return db
    .select({ kind: gameLedger.kind, amount: gameLedger.amount })
    .from(gameLedger)
    .where(eq(gameLedger.userId, userId))
    .orderBy(gameLedger.id);
}

async function balance(userId = USER_ID) {
  return (await ledger(userId)).reduce((total, row) => total + row.amount, 0);
}

beforeEach(async () => {
  await insertUser(USER_ID);
  await insertUser(OTHER_ID);
});

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, [USER_ID, OTHER_ID]));
  await db.delete(tasoMatches).where(gte(tasoMatches.providerMatchId, FIRST_MATCH_ID));
});

describe("joining", () => {
  it("makes a player and grants the whole balance before the season's first kickoff", async () => {
    await storeMatches([vlMatch(), vlMatch()]);

    await joinGame(USER_ID, NOW);

    expect(await ledger()).toEqual([{ kind: "grant", amount: 1000 }]);
    const view = await openGame(USER_ID, NOW);
    expect(view).toMatchObject({ kind: "playing", seasonId: SEASON, balance: 1000 });
  });

  it("grants a late joiner the share of matches still to come", async () => {
    await storeMatches([vlMatch({ kickoffAt: at(-48) }), vlMatch(), vlMatch(), vlMatch()]);

    expect(await openGame(USER_ID, NOW)).toEqual({
      kind: "not-joined",
      seasonId: SEASON,
      grant: 750,
    });
    await joinGame(USER_ID, NOW);

    expect(await balance()).toBe(750);
  });

  it("counts a split not yet stored as the previous season had it", async () => {
    await storeMatches([
      vlMatch({ seasonId: 2090, groupId: 2, groupName: "Mestaruussarja", kickoffAt: at(-9000) }),
      vlMatch({ seasonId: 2090, groupId: 3, groupName: "Karsintasarja", kickoffAt: at(-9000) }),
      vlMatch({ seasonId: 2090, kickoffAt: at(-9100) }),
      vlMatch({ kickoffAt: at(-48) }),
      vlMatch(),
    ]);

    await joinGame(USER_ID, NOW);

    // One of two stored matches to come, and both split matches: 3 of 4.
    expect(await balance()).toBe(750);
  });

  it("writes the grant once, however often the player joins or opens the page", async () => {
    await storeMatches([vlMatch()]);

    await joinGame(USER_ID, NOW);
    await joinGame(USER_ID, NOW);
    await openGame(USER_ID, NOW);

    expect(await ledger()).toEqual([{ kind: "grant", amount: 1000 }]);
  });

  it("gives a player who joined in an earlier season the next season's whole balance", async () => {
    await db
      .insert(gamePlayer)
      .values({ userId: USER_ID, joinedAt: new Date("2090-01-01T00:00:00Z") });
    await storeMatches([vlMatch({ kickoffAt: at(-48) }), vlMatch()]);

    const view = await openGame(USER_ID, NOW);

    expect(view).toMatchObject({ kind: "playing", balance: 1000 });
  });

  it("lets a reader join between seasons, with the balance granted when the season opens", async () => {
    await storeMatches([
      vlMatch({ kickoffAt: at(-48), status: "FINISHED", homeGoals: 1, awayGoals: 0 }),
    ]);

    await joinGame(USER_ID, NOW);

    expect(await openGame(USER_ID, NOW)).toEqual({
      kind: "between",
      nextSeasonId: SEASON + 1,
      joined: true,
      awaiting: [],
    });
    expect(await ledger()).toEqual([]);
  });
});

describe("guessing", () => {
  it("pays a new guess the current price, with its ledger row", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(100) })]);
    await joinGame(USER_ID, NOW);

    const outcome = await placeGuess(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);

    expect(outcome).toEqual({ ok: true, decision: { kind: "new", price: 15 } });
    expect(await balance()).toBe(985);
    const [row] = await db.select().from(gameGuess).where(eq(gameGuess.userId, USER_ID));
    expect(row).toMatchObject({
      providerMatchId: match,
      kind: "outcome",
      outcome: "1",
      free: false,
    });
  });

  it("charges a change the current price on top, and rewrites the guess as a score", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(200) })]);
    await joinGame(USER_ID, NOW);
    await placeGuess(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);

    const outcome = await placeGuess(
      USER_ID,
      match,
      { kind: "score", homeGoals: 2, awayGoals: 1 },
      () => at(100)
    );

    expect(outcome).toMatchObject({ ok: true, decision: { kind: "change", price: 15 } });
    expect(await ledger()).toEqual([
      { kind: "grant", amount: 1000 },
      { kind: "guess", amount: -10 },
      { kind: "change", amount: -15 },
    ]);
    const rows = await db.select().from(gameGuess).where(eq(gameGuess.userId, USER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "score", outcome: null, homeGoals: 2, awayGoals: 1 });
  });

  it("refuses a guess at kickoff, and writes nothing", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: NOW })]);
    await joinGame(USER_ID, at(-1));

    expect(await placeGuess(USER_ID, match, { kind: "outcome", outcome: "X" }, () => NOW)).toEqual({
      ok: false,
      reason: "started",
    });
    expect(await ledger()).toEqual([{ kind: "grant", amount: 1000 }]);
  });

  it("refuses a reader who has not joined, and a match that is not Veikkausliiga's", async () => {
    const [match, other] = await storeMatches([vlMatch(), vlMatch({ categoryId: "M1L" })]);

    expect(await placeGuess(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
      ok: false,
      reason: "not-joined",
    });
    await joinGame(USER_ID, NOW);
    expect(await placeGuess(USER_ID, other, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
      ok: false,
      reason: "unknown-match",
    });
    expect(await placeGuess(USER_ID, 1, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
      ok: false,
      reason: "unknown-match",
    });
  });

  it("makes a short balance's 1X2 the floor's free guess, once at a time", async () => {
    const [first, second] = await storeMatches([vlMatch(), vlMatch()]);
    await joinGame(USER_ID, NOW);
    await db
      .insert(gameLedger)
      .values({ userId: USER_ID, seasonId: SEASON, kind: "change", amount: -995 });

    expect(await placeGuess(USER_ID, first, { kind: "outcome", outcome: "2" }, () => NOW)).toEqual({
      ok: true,
      decision: { kind: "free" },
    });
    expect(await placeGuess(USER_ID, second, { kind: "outcome", outcome: "2" }, () => NOW)).toEqual(
      {
        ok: false,
        reason: "insufficient",
      }
    );
    expect(await placeGuess(USER_ID, first, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
      ok: false,
      reason: "free-fixed",
    });
    expect(await balance()).toBe(5);
    const view = await openGame(USER_ID, NOW);
    expect(view).toMatchObject({ kind: "playing" });
    if (view.kind !== "playing") return;
    expect(view.upcoming.map((match) => [match.free, match.floor])).toEqual([
      [true, false],
      [false, false],
    ]);
  });

  it("decides two guesses sent at once one after the other, so they never spend the same tokens", async () => {
    const [first, second] = await storeMatches([vlMatch(), vlMatch()]);
    await joinGame(USER_ID, NOW);
    await db
      .insert(gameLedger)
      .values({ userId: USER_ID, seasonId: SEASON, kind: "change", amount: -990 });

    const outcomes = await Promise.all([
      placeGuess(USER_ID, first, { kind: "score", homeGoals: 1, awayGoals: 0 }, () => NOW),
      placeGuess(USER_ID, second, { kind: "score", homeGoals: 1, awayGoals: 0 }, () => NOW),
    ]);

    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([
      { ok: false, reason: "insufficient" },
    ]);
    expect(await balance()).toBe(0);
  });

  it("takes guesses on every group of the season, the split's included", async () => {
    const matches = await storeMatches([
      vlMatch(),
      vlMatch({ groupId: 2, groupName: "Mestaruussarja" }),
      vlMatch({ groupId: 3, groupName: "Karsintasarja" }),
    ]);
    await joinGame(USER_ID, NOW);

    for (const match of matches) {
      expect(
        await placeGuess(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW)
      ).toMatchObject({
        ok: true,
      });
    }
    expect(await balance()).toBe(970);
  });

  it("refuses a guess on a match of a season the page does not show", async () => {
    const [older] = await storeMatches([vlMatch({ seasonId: 2090 }), vlMatch()]);
    await joinGame(USER_ID, NOW);

    expect(await placeGuess(USER_ID, older, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
      ok: false,
      reason: "unknown-match",
    });
  });

  it("keeps the floor closed while a guess of an earlier season waits", async () => {
    const [older, match] = await storeMatches([
      vlMatch({ seasonId: 2090, kickoffAt: at(-9000), status: "Abandoned" }),
      vlMatch(),
    ]);
    await db
      .insert(gamePlayer)
      .values({ userId: USER_ID, joinedAt: new Date("2090-01-01T00:00:00Z") });
    await db.insert(gameGuess).values({
      userId: USER_ID,
      seasonId: 2090,
      providerMatchId: older,
      kind: "outcome",
      outcome: "1",
      madeAt: at(-9100),
    });
    await openGame(USER_ID, NOW);
    await db
      .insert(gameLedger)
      .values({ userId: USER_ID, seasonId: SEASON, kind: "change", amount: -995 });

    expect(await placeGuess(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
      ok: false,
      reason: "insufficient",
    });
    expect(await openGame(USER_ID, NOW)).toMatchObject({
      kind: "playing",
      awaiting: [expect.objectContaining({ providerMatchId: older })],
      upcoming: [expect.objectContaining({ floor: false })],
    });
  });

  it("keeps each player's balance and guesses apart", async () => {
    const [match] = await storeMatches([vlMatch()]);
    await joinGame(USER_ID, NOW);
    await joinGame(OTHER_ID, NOW);

    await placeGuess(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);

    expect(await balance(USER_ID)).toBe(990);
    expect(await balance(OTHER_ID)).toBe(1000);
  });
});

describe("settling", () => {
  it("pays each guess on a finished match by its tier, once", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(50) })]);
    await joinGame(USER_ID, NOW);
    await joinGame(OTHER_ID, NOW);
    await placeGuess(USER_ID, match, { kind: "score", homeGoals: 2, awayGoals: 1 }, () => NOW);
    await placeGuess(OTHER_ID, match, { kind: "outcome", outcome: "2" }, () => NOW);
    await db
      .update(tasoMatches)
      .set({ status: "FINISHED", homeGoals: 2, awayGoals: 1 })
      .where(eq(tasoMatches.providerMatchId, match));

    expect(await settleGuesses(at(60))).toEqual({ matches: 1, rewarded: 1, missed: 1, failed: [] });
    expect(await settleGuesses(at(61))).toEqual({ matches: 0, rewarded: 0, missed: 0, failed: [] });

    expect(await balance(USER_ID)).toBe(1000 - 20 + 100);
    expect(await balance(OTHER_ID)).toBe(1000 - 20);
    const view = await openGame(USER_ID, at(62));
    expect(view).toMatchObject({
      kind: "between",
    });
  });

  it("does not settle a guess again when the result is corrected", async () => {
    const [match, later] = await storeMatches([
      vlMatch({ kickoffAt: at(50) }),
      vlMatch({ kickoffAt: at(500) }),
    ]);
    await joinGame(USER_ID, NOW);
    await placeGuess(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);
    await db
      .update(tasoMatches)
      .set({ status: "FINISHED", homeGoals: 1, awayGoals: 0 })
      .where(eq(tasoMatches.providerMatchId, match));
    await settleGuesses(at(60));
    await db
      .update(tasoMatches)
      .set({ homeGoals: 0, awayGoals: 1 })
      .where(eq(tasoMatches.providerMatchId, match));

    await settleGuesses(at(70));

    expect(await balance()).toBe(1000 - 20 + 30);
    const view = await openGame(USER_ID, at(70));
    expect(view).toMatchObject({ kind: "playing" });
    if (view.kind !== "playing") return;
    // Shown with the result it was judged against, not the corrected one.
    expect(view.settled).toEqual([
      expect.objectContaining({
        providerMatchId: match,
        homeGoals: 1,
        awayGoals: 0,
        tier: "outcome",
        reward: 30,
      }),
    ]);
    expect(view.upcoming.map((row) => row.providerMatchId)).toEqual([later]);
  });

  it("still shows a guess waiting to be settled once every match has a result", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(50) })]);
    await joinGame(USER_ID, NOW);
    await placeGuess(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);
    await db
      .update(tasoMatches)
      .set({ status: "FINISHED", homeGoals: 1, awayGoals: 0 })
      .where(eq(tasoMatches.providerMatchId, match));

    expect(await openGame(USER_ID, at(60))).toMatchObject({
      kind: "between",
      awaiting: [expect.objectContaining({ providerMatchId: match })],
    });
  });

  it("keeps the season open while the split the previous season had is not stored", async () => {
    await storeMatches([
      vlMatch({ seasonId: 2090, groupId: 2, groupName: "Mestaruussarja", kickoffAt: at(-9000) }),
      vlMatch({ kickoffAt: at(-48), status: "FINISHED", homeGoals: 1, awayGoals: 0 }),
    ]);
    await joinGame(USER_ID, NOW);

    expect(await openGame(USER_ID, NOW)).toMatchObject({ kind: "playing", upcoming: [] });
  });

  it("leaves a guess open while its match has no result", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(50) })]);
    await joinGame(USER_ID, NOW);
    await placeGuess(USER_ID, match, { kind: "outcome", outcome: "X" }, () => NOW);
    await db
      .update(tasoMatches)
      .set({ status: "Abandoned" })
      .where(eq(tasoMatches.providerMatchId, match));

    expect(await settleGuesses(at(60))).toMatchObject({ matches: 0 });
    const view = await openGame(USER_ID, at(60));
    expect(view).toMatchObject({
      kind: "playing",
      awaiting: [expect.objectContaining({ providerMatchId: match })],
    });
  });
});

describe("the user's account", () => {
  it("takes every game row with it when it is deleted", async () => {
    const [match] = await storeMatches([vlMatch()]);
    await joinGame(USER_ID, NOW);
    await placeGuess(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);

    await db.delete(user).where(eq(user.id, USER_ID));

    expect(await db.select().from(gamePlayer).where(eq(gamePlayer.userId, USER_ID))).toEqual([]);
    expect(await db.select().from(gameGuess).where(eq(gameGuess.userId, USER_ID))).toEqual([]);
    expect(await ledger()).toEqual([]);
  });
});
