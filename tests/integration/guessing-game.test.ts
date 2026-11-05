import { eq, gte, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { gameGuess, gameLedger, gamePlayer, tasoMatches, user } from "@/db/schema";
import { joinGame, openGame, placeGuess, settleGuesses } from "@/lib/guessing-game-store";
import { logger } from "@/lib/logger";
import type { NormalizedTasoMatch } from "@/lib/taso";
import { synchronizeMatches } from "@/lib/taso-standings-service";

/**
 * Arvauspeli against a real Postgres: joining and the grant, guesses and the
 * floor, two guesses at once, settling once, and the cascade with the user, in
 * a season far enough ahead to keep every other test's TASO rows out.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
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

// A TASO refresh rewriting a stored match, as the hourly run writes it.
async function refresh(row: ReturnType<typeof vlMatch>, changes: Partial<NormalizedTasoMatch>) {
  await synchronizeMatches([
    {
      ...row,
      homeGoals: row.homeGoals ?? null,
      awayGoals: row.awayGoals ?? null,
      matchday: row.matchday ?? null,
      winner: row.winner ?? null,
      halfTimeHome: row.halfTimeHome ?? null,
      halfTimeAway: row.halfTimeAway ?? null,
      providerStatus: row.providerStatus ?? null,
      ...changes,
    },
  ]);
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

// A guess as the page sends it: with the price its row shows, `0` for the floor's free guess and a postponement's free change.
async function play(
  userId: string,
  providerMatchId: number,
  guess: Parameters<typeof placeGuess>[2],
  clock: () => Date
) {
  const view = await openGame(userId, clock());
  const row =
    view.kind === "playing"
      ? view.upcoming.find((match) => match.providerMatchId === providerMatchId)
      : undefined;
  const shown = row === undefined || row.floor || row.postponed ? 0 : row.price;
  return placeGuess(userId, providerMatchId, guess, shown, clock);
}

beforeEach(async () => {
  await insertUser(USER_ID);
  await insertUser(OTHER_ID);
});

afterEach(async () => {
  vi.restoreAllMocks();
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
    // What the player had left of the earlier season stays there.
    await db
      .insert(gameLedger)
      .values({ userId: USER_ID, seasonId: 2090, kind: "grant", amount: 420 });
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

    await storeMatches([vlMatch({ seasonId: SEASON + 1, kickoffAt: at(5000) })]);
    expect(await openGame(USER_ID, NOW)).toMatchObject({
      kind: "playing",
      seasonId: SEASON + 1,
      balance: 1000,
    });
  });
});

describe("guessing", () => {
  it("pays a new guess the current price, with its ledger row", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(100) })]);
    await joinGame(USER_ID, NOW);

    const outcome = await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);

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
    await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);

    const outcome = await play(USER_ID, match, { kind: "score", homeGoals: 2, awayGoals: 1 }, () =>
      at(100)
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

  it("refuses a guess whose price rose after the page showed it, and charges nothing", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(170) })]);
    await joinGame(USER_ID, NOW);

    // Shown at 10 a week out; sent three hours later, when it costs 15.
    expect(
      await placeGuess(USER_ID, match, { kind: "outcome", outcome: "1" }, 10, () => at(3))
    ).toEqual({
      ok: false,
      reason: "price-changed",
    });
    expect(await balance()).toBe(1000);
  });

  it("refuses a guess at kickoff, and writes nothing", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: NOW })]);
    await joinGame(USER_ID, at(-1));

    expect(await play(USER_ID, match, { kind: "outcome", outcome: "X" }, () => NOW)).toEqual({
      ok: false,
      reason: "started",
    });
    expect(await ledger()).toEqual([{ kind: "grant", amount: 1000 }]);
  });

  it("refuses a reader who has not joined, and a match that is not Veikkausliiga's", async () => {
    const [match, other] = await storeMatches([vlMatch(), vlMatch({ categoryId: "M1L" })]);

    expect(await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
      ok: false,
      reason: "not-joined",
    });
    await joinGame(USER_ID, NOW);
    expect(await play(USER_ID, other, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
      ok: false,
      reason: "unknown-match",
    });
    expect(await play(USER_ID, 1, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
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

    expect(await play(USER_ID, first, { kind: "outcome", outcome: "2" }, () => NOW)).toEqual({
      ok: true,
      decision: { kind: "free" },
    });
    expect(await play(USER_ID, second, { kind: "outcome", outcome: "2" }, () => NOW)).toEqual({
      ok: false,
      reason: "insufficient",
    });
    expect(await play(USER_ID, first, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
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
      play(USER_ID, first, { kind: "score", homeGoals: 1, awayGoals: 0 }, () => NOW),
      play(USER_ID, second, { kind: "score", homeGoals: 1, awayGoals: 0 }, () => NOW),
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
        await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW)
      ).toMatchObject({
        ok: true,
      });
    }
    expect(await balance()).toBe(970);
  });

  it("refuses a guess on a match of a season the page does not show", async () => {
    const [older] = await storeMatches([vlMatch({ seasonId: 2090 }), vlMatch()]);
    await joinGame(USER_ID, NOW);

    expect(await play(USER_ID, older, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
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
      kickoffAt: at(-9000),
    });
    await openGame(USER_ID, NOW);
    await db
      .insert(gameLedger)
      .values({ userId: USER_ID, seasonId: SEASON, kind: "change", amount: -995 });

    expect(await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW)).toEqual({
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

    await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);

    expect(await balance(USER_ID)).toBe(990);
    expect(await balance(OTHER_ID)).toBe(1000);
  });
});

describe("settling", () => {
  it("pays each guess on a finished match by its tier, once", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(50) })]);
    await joinGame(USER_ID, NOW);
    await joinGame(OTHER_ID, NOW);
    await play(USER_ID, match, { kind: "score", homeGoals: 2, awayGoals: 1 }, () => NOW);
    await play(OTHER_ID, match, { kind: "outcome", outcome: "2" }, () => NOW);
    await db
      .update(tasoMatches)
      .set({ status: "FINISHED", homeGoals: 2, awayGoals: 1 })
      .where(eq(tasoMatches.providerMatchId, match));

    expect(await settleGuesses(at(60))).toEqual({
      matches: 1,
      rewarded: 1,
      missed: 1,
      refunded: 0,
      voided: 0,
      failed: [],
    });
    expect(await settleGuesses(at(61))).toEqual({
      matches: 0,
      rewarded: 0,
      missed: 0,
      refunded: 0,
      voided: 0,
      failed: [],
    });

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
    await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);
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
        settlement: "outcome",
        reward: 30,
      }),
    ]);
    expect(view.upcoming.map((row) => row.providerMatchId)).toEqual([later]);
  });

  it("keeps the season open, its guess waiting, until a match with a result is settled", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(50) })]);
    await joinGame(USER_ID, NOW);
    await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);
    await db
      .update(tasoMatches)
      .set({ status: "FINISHED", homeGoals: 1, awayGoals: 0 })
      .where(eq(tasoMatches.providerMatchId, match));

    expect(await openGame(USER_ID, at(60))).toMatchObject({
      kind: "playing",
      awaiting: [expect.objectContaining({ providerMatchId: match })],
    });
    await settleGuesses(at(61));
    expect(await openGame(USER_ID, at(62))).toMatchObject({ kind: "between", awaiting: [] });
  });

  it("keeps the season open while the split the previous season had is not stored", async () => {
    await storeMatches([
      vlMatch({ seasonId: 2090, groupId: 2, groupName: "Mestaruussarja", kickoffAt: at(-9000) }),
      vlMatch({ kickoffAt: at(-48), status: "FINISHED", homeGoals: 1, awayGoals: 0 }),
    ]);
    await joinGame(USER_ID, NOW);

    expect(await openGame(USER_ID, NOW)).toMatchObject({ kind: "playing", upcoming: [] });
  });

  it("does not settle a finished match whose stored kickoff is still ahead", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(50) })]);
    await joinGame(USER_ID, NOW);
    await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);
    await db
      .update(tasoMatches)
      .set({ status: "FINISHED", homeGoals: 1, awayGoals: 0 })
      .where(eq(tasoMatches.providerMatchId, match));

    expect(await settleGuesses(at(10))).toMatchObject({ matches: 0 });
    expect(await settleGuesses(at(60))).toMatchObject({ matches: 1, rewarded: 1 });
  });

  it("leaves a guess open while its match has no result", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(50) })]);
    await joinGame(USER_ID, NOW);
    await play(USER_ID, match, { kind: "outcome", outcome: "X" }, () => NOW);
    await db
      .update(tasoMatches)
      .set({ status: "SCHEDULED" })
      .where(eq(tasoMatches.providerMatchId, match));

    expect(await settleGuesses(at(60))).toMatchObject({ matches: 0 });
    const view = await openGame(USER_ID, at(60));
    expect(view).toMatchObject({
      kind: "playing",
      awaiting: [expect.objectContaining({ providerMatchId: match })],
    });
  });
});

describe("matches that do not go as listed", () => {
  it("closes a match awarded before its kickoff to guesses, and lists it no longer", async () => {
    const row = vlMatch({ kickoffAt: at(100) });
    const [match] = await storeMatches([row]);
    await joinGame(USER_ID, NOW);
    await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);
    await refresh(row, {
      status: "FINISHED",
      providerStatus: "Forfeited",
      homeGoals: 3,
      awayGoals: 0,
    });

    expect(await openGame(USER_ID, at(1))).toMatchObject({ upcoming: [] });
    expect(
      await placeGuess(USER_ID, match, { kind: "score", homeGoals: 3, awayGoals: 0 }, 15, () =>
        at(1)
      )
    ).toEqual({
      ok: false,
      reason: "started",
    });
  });

  it("refunds everything paid on a guess, its change included, when the match is abandoned", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(100) })]);
    await joinGame(USER_ID, NOW);
    await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);
    await play(USER_ID, match, { kind: "outcome", outcome: "2" }, () => at(50));
    await db
      .update(tasoMatches)
      .set({ status: "Abandoned", providerStatus: "Abandoned", homeGoals: 1, awayGoals: 0 })
      .where(eq(tasoMatches.providerMatchId, match));

    expect(await settleGuesses(at(110))).toMatchObject({ matches: 1, refunded: 1 });

    expect(await balance()).toBe(1000);
    expect(await openGame(USER_ID, at(110))).toMatchObject({
      settled: [{ providerMatchId: match, settlement: "abandoned", reward: 35, homeGoals: null }],
    });
  });

  it("pays every score guess on an awarded match as exact, and a 1X2 by the awarded score", async () => {
    const [match] = await storeMatches([vlMatch({ kickoffAt: at(50) })]);
    await joinGame(USER_ID, NOW);
    await joinGame(OTHER_ID, NOW);
    await play(USER_ID, match, { kind: "score", homeGoals: 1, awayGoals: 1 }, () => NOW);
    await play(OTHER_ID, match, { kind: "outcome", outcome: "2" }, () => NOW);
    await db
      .update(tasoMatches)
      .set({ status: "FINISHED", providerStatus: "Forfeited", homeGoals: 0, awayGoals: 3 })
      .where(eq(tasoMatches.providerMatchId, match));

    await settleGuesses(at(60));

    expect(await balance(USER_ID)).toBe(1000 - 20 + 100);
    expect(await balance(OTHER_ID)).toBe(1000 - 20 + 30);
  });

  it("settles an awarded match with no score by TASO's winner, and refunds it when there is none", async () => {
    const [byWinner, undecided] = await storeMatches([
      vlMatch({ kickoffAt: at(50) }),
      vlMatch({ kickoffAt: at(50) }),
    ]);
    await joinGame(USER_ID, NOW);
    await play(USER_ID, byWinner, { kind: "outcome", outcome: "2" }, () => NOW);
    await play(USER_ID, undecided, { kind: "score", homeGoals: 2, awayGoals: 0 }, () => NOW);
    await db
      .update(tasoMatches)
      .set({ status: "FINISHED", providerStatus: "Forfeited", winner: "away" })
      .where(eq(tasoMatches.providerMatchId, byWinner));
    await db
      .update(tasoMatches)
      .set({ status: "FINISHED", providerStatus: "Forfeited" })
      .where(eq(tasoMatches.providerMatchId, undecided));

    expect(await settleGuesses(at(60))).toMatchObject({ matches: 2, rewarded: 1, refunded: 1 });

    expect(await balance()).toBe(1000 - 20 - 20 + 30 + 20);
    const view = await openGame(USER_ID, at(60));
    expect(view).toMatchObject({ kind: "playing" });
    if (view.kind !== "playing") return;
    expect(
      view.settled.map((guess) => [guess.providerMatchId, guess.settlement, guess.reward])
    ).toEqual(
      expect.arrayContaining([
        [byWinner, "awarded", 30],
        [undecided, "undecided", 20],
      ])
    );
  });

  it("voids and refunds a guess made after a kickoff that moved earlier, and keeps one made before it", async () => {
    const row = vlMatch({ kickoffAt: at(100) });
    const [match] = await storeMatches([row]);
    await joinGame(USER_ID, NOW);
    await joinGame(OTHER_ID, NOW);
    await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);
    await play(OTHER_ID, match, { kind: "outcome", outcome: "1" }, () => at(60));
    await refresh(row, {
      kickoffAt: at(30),
      status: "FINISHED",
      providerStatus: "Played",
      homeGoals: 1,
      awayGoals: 0,
    });

    expect(await settleGuesses(at(70))).toMatchObject({ matches: 1, rewarded: 1, voided: 1 });

    expect(await balance(USER_ID)).toBe(1000 - 15 + 30);
    expect(await balance(OTHER_ID)).toBe(1000);
  });

  it("gives a postponed guess one free change, and charges the next one", async () => {
    const row = vlMatch({ kickoffAt: at(100) });
    const [match] = await storeMatches([row]);
    await joinGame(USER_ID, NOW);
    await joinGame(OTHER_ID, NOW);
    await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);
    await refresh(row, { kickoffAt: at(400) });

    // A new guess is priced by the new kickoff: 10 at 399 h, where the old one priced 15.
    expect(await play(OTHER_ID, match, { kind: "outcome", outcome: "1" }, () => at(1))).toEqual({
      ok: true,
      decision: { kind: "new", price: 10 },
    });

    expect(await openGame(USER_ID, at(1))).toMatchObject({ upcoming: [{ postponed: true }] });
    expect(await play(USER_ID, match, { kind: "outcome", outcome: "X" }, () => at(1))).toEqual({
      ok: true,
      decision: expect.objectContaining({ kind: "change", price: 0 }),
    });
    expect(await openGame(USER_ID, at(2))).toMatchObject({ upcoming: [{ postponed: false }] });
    expect(await play(USER_ID, match, { kind: "outcome", outcome: "2" }, () => at(2))).toEqual({
      ok: true,
      decision: expect.objectContaining({ kind: "change", price: 10 }),
    });
    expect(await balance()).toBe(1000 - 15 - 0 - 10);
  });

  it("gives a second postponement one more free change", async () => {
    const row = vlMatch({ kickoffAt: at(100) });
    const [match] = await storeMatches([row]);
    await joinGame(USER_ID, NOW);
    await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);
    await refresh(row, { kickoffAt: at(400) });
    await play(USER_ID, match, { kind: "outcome", outcome: "X" }, () => at(1));
    await refresh(row, { kickoffAt: at(800) });

    expect(await play(USER_ID, match, { kind: "outcome", outcome: "2" }, () => at(2))).toEqual({
      ok: true,
      decision: expect.objectContaining({ kind: "change", price: 0 }),
    });
    expect(await balance()).toBe(1000 - 15);
  });

  it("keeps a guess whose match is no longer stored open and unlisted, and the floor closed by it", async () => {
    const [gone, next] = await storeMatches([
      vlMatch({ kickoffAt: at(50) }),
      vlMatch({ kickoffAt: at(100) }),
    ]);
    await joinGame(USER_ID, NOW);
    await db
      .insert(gameLedger)
      .values({ userId: USER_ID, seasonId: SEASON, kind: "change", amount: -995 });
    await play(USER_ID, gone, { kind: "outcome", outcome: "1" }, () => NOW);
    await db.delete(tasoMatches).where(eq(tasoMatches.providerMatchId, gone));

    expect(await settleGuesses(at(60))).toMatchObject({ matches: 0 });
    const view = await openGame(USER_ID, at(60));
    expect(view).toMatchObject({ kind: "playing", awaiting: [] });
    if (view.kind !== "playing") return;
    expect(view.upcoming).toMatchObject([{ providerMatchId: next, floor: false }]);
    const [guess] = await db
      .select({ settledAt: gameGuess.settledAt })
      .from(gameGuess)
      .where(eq(gameGuess.providerMatchId, gone));
    expect(guess).toEqual({ settledAt: null });
  });

  it("warns once per match and run about guesses still waiting, and why", async () => {
    const [unknown, late, gone] = await storeMatches([
      vlMatch({ kickoffAt: at(10) }),
      vlMatch({ kickoffAt: at(10) }),
      vlMatch({ kickoffAt: at(10) }),
    ]);
    await joinGame(USER_ID, NOW);
    await joinGame(OTHER_ID, NOW);
    for (const userId of [USER_ID, OTHER_ID]) {
      for (const match of [unknown, late, gone]) {
        await play(userId, match, { kind: "outcome", outcome: "1" }, () => NOW);
      }
    }
    await db
      .update(tasoMatches)
      .set({ status: "Break", providerStatus: "Break" })
      .where(eq(tasoMatches.providerMatchId, unknown));
    await db.delete(tasoMatches).where(eq(tasoMatches.providerMatchId, gone));
    const warn = vi.spyOn(logger, "warn");

    for (const run of [1, 2]) {
      warn.mockClear();
      await settleGuesses(at(10 + 48));

      const waiting = warn.mock.calls
        .filter(([, message]) => message === "Arvauspeli guesses still waiting")
        .map(([fields]) => [
          (fields as { providerMatchId: number }).providerMatchId,
          (fields as { reason: string }).reason,
        ]);
      expect(waiting, `run ${run}`).toEqual(
        expect.arrayContaining([
          [unknown, "unknown status"],
          [late, "no result"],
          [gone, "not stored"],
        ])
      );
      expect(waiting, `run ${run}`).toHaveLength(3);
    }
  });
});

describe("the user's account", () => {
  it("takes every game row with it when it is deleted", async () => {
    const [match] = await storeMatches([vlMatch()]);
    await joinGame(USER_ID, NOW);
    await play(USER_ID, match, { kind: "outcome", outcome: "1" }, () => NOW);

    await db.delete(user).where(eq(user.id, USER_ID));

    expect(await db.select().from(gamePlayer).where(eq(gamePlayer.userId, USER_ID))).toEqual([]);
    expect(await db.select().from(gameGuess).where(eq(gameGuess.userId, USER_ID))).toEqual([]);
    expect(await ledger()).toEqual([]);
  });
});
