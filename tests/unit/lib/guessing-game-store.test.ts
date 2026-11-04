import { beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

/**
 * Arvauspeli's store around its queries: which view a reader gets, when a grant
 * is written, what a guess writes, and how settling counts and survives a
 * failed match. Each awaited query answers the next queued result; the SQL
 * itself runs against Postgres in `tests/integration/guessing-game.test.ts`.
 *
 * decisions/072-match-guesses.md
 */

const { state, logger } = vi.hoisted(() => {
  const state = {
    answers: [] as unknown[],
    calls: [] as Array<{ method: string; args: unknown[] }>,
    // Answers a statement by its kind instead of the queue, for statements run at once.
    respond: null as null | ((statement: "select" | "insert" | "update") => unknown),
    // Transactions to fail as they start, before running anything.
    failingTransactions: 0,
  };
  return { state, logger: { info: vi.fn(), error: vi.fn() } };
});

vi.mock("@/db", () => {
  // Each statement is a chain of its own; awaiting it takes its answer.
  function statement(kind: "select" | "insert" | "update", args: unknown[]): object {
    state.calls.push({ method: kind, args });
    const chain: object = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") {
            return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
              const answer = state.respond === null ? state.answers.shift() : state.respond(kind);
              if (answer instanceof Error) reject(answer);
              else resolve(answer);
            };
          }
          return (...callArgs: unknown[]) => {
            state.calls.push({ method: String(property), args: callArgs });
            return chain;
          };
        },
      }
    );
    return chain;
  }
  const client = {
    select: (...args: unknown[]) => statement("select", args),
    insert: (...args: unknown[]) => statement("insert", args),
    update: (...args: unknown[]) => statement("update", args),
  };
  return {
    db: {
      ...client,
      transaction: async (run: (tx: typeof client) => Promise<unknown>) => {
        if (state.failingTransactions > 0) {
          state.failingTransactions -= 1;
          throw new Error("database down");
        }
        return run(client);
      },
    },
  };
});
vi.mock("@/lib/logger", () => ({ logger }));

const { joinGame, openGame, placeGuess, settleGuesses, single } = await import(
  "@/lib/guessing-game-store"
);

warmModules(() => import("@/lib/guessing-game-store"));

const NOW = new Date("2027-05-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const JOINED = new Date("2027-01-01T00:00:00Z");

function match(overrides: Record<string, unknown> = {}) {
  return {
    providerMatchId: 1,
    groupId: 1,
    groupName: "Runkosarja",
    kickoffAt: at(200),
    status: "SCHEDULED",
    homeTeamName: "HJK",
    awayTeamName: "KuPS",
    homeGoals: null,
    awayGoals: null,
    ...overrides,
  };
}

function guessRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    userId: "user-1",
    seasonId: 2027,
    providerMatchId: 1,
    kind: "outcome",
    outcome: "1",
    homeGoals: null,
    awayGoals: null,
    free: false,
    madeAt: NOW,
    settledAt: null,
    tier: null,
    ...overrides,
  };
}

function answer(...answers: unknown[]) {
  state.answers.push(...answers);
}

function inserted(): unknown[] {
  return state.calls.filter((call) => call.method === "values").map((call) => call.args[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.answers = [];
  state.calls = [];
  state.respond = null;
  state.failingTransactions = 0;
});

describe("openGame", () => {
  it("has no season when none is stored", async () => {
    answer([{ seasonId: null }], []);

    expect(await openGame("user-1", NOW)).toEqual({ kind: "no-season", joined: false });
  });

  it("has no season when the read finds no row at all", async () => {
    answer([], [{ joinedAt: JOINED }]);

    expect(await openGame("user-1", NOW)).toEqual({ kind: "no-season", joined: true });
  });

  it("waits for the next season once every match has a result", async () => {
    answer(
      [{ seasonId: 2027 }],
      [],
      [match({ kickoffAt: at(-5), status: "FINISHED", homeGoals: 1, awayGoals: 0 })]
    );

    expect(await openGame("user-1", NOW)).toEqual({
      kind: "between",
      nextSeasonId: 2028,
      joined: false,
    });
  });

  it("offers a reader who has not joined the grant they would get, the previous split counted", async () => {
    answer(
      [{ seasonId: 2027 }],
      [],
      [match({ kickoffAt: at(-5) }), match({ providerMatchId: 2 })],
      [{ count: 2 }]
    );

    // One of two stored to come, and two split matches: 3 of 4.
    expect(await openGame("user-1", NOW)).toEqual({
      kind: "not-joined",
      seasonId: 2027,
      grant: 750,
    });
  });

  it("counts no previous split when that season has none stored", async () => {
    answer(
      [{ seasonId: 2027 }],
      [],
      [match({ kickoffAt: at(-5) }), match({ providerMatchId: 2 })],
      []
    );

    expect(await openGame("user-1", NOW)).toMatchObject({ grant: 500 });
  });

  it("writes a returning player's grant, logs it, and shows each kind of row", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [
        match({
          providerMatchId: 1,
          kickoffAt: at(-50),
          status: "FINISHED",
          homeGoals: 2,
          awayGoals: 1,
        }),
        match({
          providerMatchId: 2,
          kickoffAt: at(-40),
          status: "FINISHED",
          homeGoals: 0,
          awayGoals: 0,
        }),
        match({ providerMatchId: 3, kickoffAt: at(-30) }),
        match({ providerMatchId: 4, kickoffAt: at(-20) }),
        match({ providerMatchId: 7, kickoffAt: at(-10) }),
        match({ providerMatchId: 6, groupId: 3, groupName: "Karsintasarja", kickoffAt: at(10) }),
        match({ providerMatchId: 5, groupId: 2, groupName: "Mestaruussarja", kickoffAt: at(30) }),
      ],
      [{ id: 99 }],
      [{ balance: 940 }],
      [
        guessRow({
          id: 11,
          providerMatchId: 1,
          kind: "score",
          outcome: null,
          homeGoals: 2,
          awayGoals: 1,
          settledAt: at(-45),
          tier: "exact",
        }),
        guessRow({ id: 12, providerMatchId: 2, settledAt: at(-35), tier: "miss" }),
        guessRow({ id: 13, providerMatchId: 3 }),
        guessRow({ id: 14, providerMatchId: 4, settledAt: at(-15), tier: "outcome" }),
        guessRow({ id: 15, providerMatchId: 5, free: true }),
        guessRow({ id: 16, providerMatchId: 404 }),
      ],
      [{ guessId: 11, amount: 100 }]
    );

    const view = await openGame("user-1", NOW);

    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", seasonId: 2027, amount: 1000 },
      "Arvauspeli grant written"
    );
    expect(view).toMatchObject({ kind: "playing", seasonId: 2027, balance: 940, groups: 2 });
    if (view.kind !== "playing") return;
    expect(view.upcoming).toEqual([
      expect.objectContaining({
        providerMatchId: 6,
        price: 30,
        nextRise: null,
        guess: null,
        floor: false,
      }),
      expect.objectContaining({
        providerMatchId: 5,
        price: 20,
        nextRise: { price: 30, at: at(6) },
        guess: { kind: "outcome", outcome: "1" },
        free: true,
      }),
    ]);
    // A settled guess whose match has lost its result waits again.
    expect(view.awaiting.map((row) => row.providerMatchId)).toEqual([3, 4]);
    expect(view.settled).toEqual([
      expect.objectContaining({ providerMatchId: 2, tier: "miss", reward: 0, homeGoals: 0 }),
      expect.objectContaining({
        providerMatchId: 1,
        tier: "exact",
        reward: 100,
        guess: { kind: "score", homeGoals: 2, awayGoals: 1 },
      }),
    ]);
  });

  it("opens the floor on a match with no guess when the balance is short and nothing is open", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [match({ groupId: 2 })],
      [],
      [{ balance: null }],
      [],
      []
    );

    const view = await openGame("user-1", NOW);

    expect(logger.info).not.toHaveBeenCalled();
    expect(view).toMatchObject({ kind: "playing", balance: 0, groups: 1 });
    if (view.kind !== "playing") return;
    expect(view.upcoming).toEqual([expect.objectContaining({ floor: true, free: false })]);
  });

  it("reads a missing balance row as nothing", async () => {
    answer([{ seasonId: 2027 }], [{ joinedAt: JOINED }], [match({ groupId: 2 })], [], [], [], []);

    expect(await openGame("user-1", NOW)).toMatchObject({ balance: 0 });
  });

  it("fails on a stored guess that is not one, rather than showing it", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [match({ groupId: 2 })],
      [],
      [{ balance: 10 }],
      [guessRow({ kind: "score", outcome: "1" })],
      []
    );

    await expect(openGame("user-1", NOW)).rejects.toThrow(
      "A stored Arvauspeli guess is not a guess"
    );
  });
});

describe("joinGame", () => {
  it("makes a player, logs it, and writes the open season's grant", async () => {
    answer(
      [{ userId: "user-1" }],
      [{ seasonId: 2027 }],
      [match({ groupId: 2 })],
      [{ joinedAt: NOW }],
      [{ id: 1 }]
    );

    await joinGame("user-1", NOW);

    expect(logger.info).toHaveBeenCalledWith({ userId: "user-1" }, "Arvauspeli joined");
    expect(inserted()).toEqual([
      { userId: "user-1", joinedAt: NOW },
      { userId: "user-1", seasonId: 2027, kind: "grant", amount: 1000 },
    ]);
  });

  it("logs nothing when the player and the grant exist already", async () => {
    answer([], [{ seasonId: 2027 }], [match({ groupId: 2 })], [], []);

    await joinGame("user-1", NOW);

    expect(logger.info).not.toHaveBeenCalled();
  });

  it("writes no grant when no season is stored, or between seasons", async () => {
    answer([{ userId: "user-1" }], [{ seasonId: null }]);
    await joinGame("user-1", NOW);
    answer(
      [],
      [{ seasonId: 2027 }],
      [match({ kickoffAt: at(-5), status: "FINISHED", homeGoals: 1, awayGoals: 1 })]
    );
    await joinGame("user-1", NOW);

    expect(inserted()).toEqual([
      { userId: "user-1", joinedAt: NOW },
      { userId: "user-1", joinedAt: NOW },
    ]);
  });
});

describe("placeGuess", () => {
  const OUTCOME = { kind: "outcome", outcome: "1" } as const;
  const SCORE = { kind: "score", homeGoals: 2, awayGoals: 0 } as const;
  const vlMatch = {
    seasonId: 2027,
    competitionCode: "spljp27",
    categoryId: "VL",
    kickoffAt: at(200),
  };

  // The reads every accepted guess makes: the player, the match, the season, the
  // grant's insert, the balance, and the player's guesses.
  function playable(balance: number, guesses: unknown[]) {
    answer([{ joinedAt: JOINED }], [vlMatch], [match({ groupId: 2 })], [], [{ balance }], guesses);
  }

  it("refuses a reader who has not joined, and logs the refusal", async () => {
    answer([]);

    expect(await placeGuess("user-1", 1, OUTCOME, NOW)).toEqual({
      ok: false,
      reason: "not-joined",
    });
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", providerMatchId: 1, kind: "outcome", reason: "not-joined" },
      "Arvauspeli guess refused"
    );
  });

  it("refuses a match not stored, and one that is not Veikkausliiga's", async () => {
    answer([{ joinedAt: JOINED }], []);
    expect(await placeGuess("user-1", 1, OUTCOME, NOW)).toEqual({
      ok: false,
      reason: "unknown-match",
    });

    answer([{ joinedAt: JOINED }], [{ ...vlMatch, categoryId: "M1L" }]);
    expect(await placeGuess("user-1", 1, OUTCOME, NOW)).toEqual({
      ok: false,
      reason: "unknown-match",
    });

    answer([{ joinedAt: JOINED }], [{ ...vlMatch, competitionCode: "spljp26" }]);
    expect(await placeGuess("user-1", 1, OUTCOME, NOW)).toEqual({
      ok: false,
      reason: "unknown-match",
    });
  });

  it("refuses a match that has kicked off", async () => {
    answer([{ joinedAt: JOINED }], [{ ...vlMatch, kickoffAt: NOW }]);

    expect(await placeGuess("user-1", 1, OUTCOME, NOW)).toEqual({ ok: false, reason: "started" });
  });

  it("writes a new guess and its cost, and logs both", async () => {
    playable(100, []);
    answer([{ id: 21 }], undefined);

    expect(await placeGuess("user-1", 1, SCORE, NOW)).toEqual({
      ok: true,
      decision: { kind: "new", price: 10 },
    });
    expect(inserted().slice(-2)).toEqual([
      expect.objectContaining({
        kind: "score",
        outcome: null,
        homeGoals: 2,
        awayGoals: 0,
        free: false,
      }),
      { userId: "user-1", seasonId: 2027, kind: "guess", amount: -10, guessId: 21 },
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", providerMatchId: 1, kind: "score", outcome: "new", price: 10 },
      "Arvauspeli guess written"
    );
  });

  it("writes the floor's free guess at no cost", async () => {
    playable(5, []);
    answer([{ id: 22 }], undefined);

    expect(await placeGuess("user-1", 1, OUTCOME, NOW)).toEqual({
      ok: true,
      decision: { kind: "free" },
    });
    expect(inserted().slice(-2)).toEqual([
      expect.objectContaining({ kind: "outcome", outcome: "1", homeGoals: null, free: true }),
      { userId: "user-1", seasonId: 2027, kind: "guess", amount: 0, guessId: 22 },
    ]);
  });

  it("rewrites a changed guess and charges the change", async () => {
    playable(100, [
      guessRow({ id: 30, providerMatchId: 1 }),
      guessRow({ id: 31, providerMatchId: 2 }),
    ]);
    answer(undefined, undefined);

    expect(await placeGuess("user-1", 1, SCORE, NOW)).toEqual({
      ok: true,
      decision: { kind: "change", price: 10, guessId: 30 },
    });
    expect(state.calls.find((call) => call.method === "set")?.args[0]).toEqual({
      kind: "score",
      outcome: null,
      homeGoals: 2,
      awayGoals: 0,
      madeAt: NOW,
    });
    expect(inserted().at(-1)).toEqual({
      userId: "user-1",
      seasonId: 2027,
      kind: "change",
      amount: -10,
      guessId: 30,
    });
  });

  it("writes nothing for the same guess again", async () => {
    playable(100, [guessRow({ id: 30, providerMatchId: 1 })]);

    expect(await placeGuess("user-1", 1, OUTCOME, NOW)).toEqual({
      ok: true,
      decision: { kind: "unchanged" },
    });
    expect(state.calls.some((call) => call.method === "update")).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "unchanged", price: 0 }),
      "Arvauspeli guess written"
    );
  });

  it("refuses a guess the balance cannot pay, with the reason", async () => {
    playable(5, [guessRow({ id: 30, providerMatchId: 2 })]);

    expect(await placeGuess("user-1", 1, OUTCOME, NOW)).toEqual({
      ok: false,
      reason: "insufficient",
    });
  });
});

describe("single", () => {
  it("gives the one row an insert returned", () => {
    expect(single([{ id: 1 }])).toEqual({ id: 1 });
  });

  it("fails on none or several", () => {
    expect(() => single([])).toThrow("Expected one row, got 0");
    expect(() => single([{ id: 1 }, { id: 2 }])).toThrow("Expected one row, got 2");
  });
});

describe("settleGuesses", () => {
  function settleable(overrides: Record<string, unknown> = {}) {
    return { ...guessRow(), resultHome: 1, resultAway: 0, ...overrides };
  }

  // The open guesses read first, then every update answering `updated` and every insert nothing.
  function settling(rows: unknown[], updated: unknown[] = [{ id: 1 }]) {
    let read = false;
    state.respond = (statement) => {
      if (statement === "select" && !read) {
        read = true;
        return rows;
      }
      return statement === "update" ? updated : undefined;
    };
  }

  it("pays each guess by the reward table, each match in its own transaction, and counts the paid and the missed", async () => {
    settling([
      settleable({ id: 1 }),
      settleable({ id: 2, outcome: "2" }),
      settleable({ id: 3, providerMatchId: 2 }),
    ]);

    expect(await settleGuesses(NOW)).toEqual({ matches: 2, rewarded: 2, missed: 1, failed: [] });
    expect(inserted()).toEqual(
      expect.arrayContaining([
        { userId: "user-1", seasonId: 2027, kind: "reward", amount: 30, guessId: 1 },
        { userId: "user-1", seasonId: 2027, kind: "reward", amount: 0, guessId: 2 },
        { userId: "user-1", seasonId: 2027, kind: "reward", amount: 30, guessId: 3 },
      ])
    );
    expect(inserted()).toHaveLength(3);
    expect(logger.info).toHaveBeenCalledWith(
      { matches: 2, rewarded: 2, missed: 1, failed: [] },
      "Arvauspeli guesses settled"
    );
  });

  it("pays nothing for a guess another run settled first", async () => {
    settling([settleable()], []);

    expect(await settleGuesses(NOW)).toEqual({ matches: 1, rewarded: 0, missed: 0, failed: [] });
    expect(inserted()).toEqual([]);
  });

  it("names a match that failed, logs it, and settles the rest", async () => {
    settling([settleable({ id: 1 }), settleable({ id: 2, providerMatchId: 2 })]);
    state.failingTransactions = 1;

    expect(await settleGuesses(NOW)).toEqual({ matches: 1, rewarded: 1, missed: 0, failed: [1] });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), providerMatchId: 1 },
      "Unable to settle Arvauspeli guesses"
    );
    expect(inserted()).toEqual([expect.objectContaining({ guessId: 2 })]);
  });
});
