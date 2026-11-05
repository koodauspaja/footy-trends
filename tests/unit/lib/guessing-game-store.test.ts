import { beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

/**
 * Arvauspeli's store around its queries: the view a reader gets, the grant, what
 * a guess writes, and how settling counts. Each query answers a queued result;
 * the SQL runs against Postgres in `tests/integration/guessing-game.test.ts`.
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
    transactions: 0,
  };
  return { state, logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } };
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
        state.transactions += 1;
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
    kickoffAt: at(200),
    settledAt: null,
    tier: null,
    resultHomeGoals: null,
    resultAwayGoals: null,
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
  state.transactions = 0;
});

function openRow(overrides: Record<string, unknown> = {}) {
  return {
    providerMatchId: 9,
    kind: "outcome",
    outcome: "X",
    homeGoals: null,
    awayGoals: null,
    kickoffAt: at(-20),
    homeTeamName: "FC Lahti",
    awayTeamName: "AC Oulu",
    ...overrides,
  };
}

describe("openGame", () => {
  it("has no season when none is stored", async () => {
    answer([{ seasonId: null }], []);

    expect(await openGame("user-1", NOW)).toEqual({ kind: "no-season", joined: false });
  });

  it("has no season when the read finds no row at all", async () => {
    answer([], [{ joinedAt: JOINED }]);

    expect(await openGame("user-1", NOW)).toEqual({ kind: "no-season", joined: true });
  });

  it("waits for the next season once every match has a result and the split is stored", async () => {
    answer(
      [{ seasonId: 2027 }],
      [],
      [match({ groupId: 2, kickoffAt: at(-5), status: "FINISHED", homeGoals: 1, awayGoals: 0 })]
    );

    expect(await openGame("user-1", NOW)).toEqual({
      kind: "between",
      nextSeasonId: 2028,
      joined: false,
      awaiting: [],
    });
  });

  it("keeps the season open while a guess on one of its matches waits to be settled", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [match({ groupId: 2, kickoffAt: at(-5), status: "FINISHED", homeGoals: 1, awayGoals: 0 })],
      [{ balance: 990 }],
      [],
      [],
      [openRow({ seasonId: 2027, kickoffAt: at(-5) })]
    );

    expect(await openGame("user-1", NOW)).toMatchObject({
      kind: "playing",
      upcoming: [],
      awaiting: [{ providerMatchId: 9 }],
    });
  });

  it("keeps the season open while the split the previous season had is not stored yet", async () => {
    answer(
      [{ seasonId: 2027 }],
      [],
      [match({ kickoffAt: at(-5), status: "FINISHED", homeGoals: 1, awayGoals: 0 })],
      [{ count: 2 }]
    );

    // Nothing stored to come, and both split matches: 2 of 3.
    expect(await openGame("user-1", NOW)).toEqual({
      kind: "not-joined",
      seasonId: 2027,
      grant: 666,
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

  it("shows a player's waiting guesses of any season between seasons, and writes no grant", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [match({ groupId: 2, kickoffAt: at(-5), status: "FINISHED", homeGoals: 1, awayGoals: 0 })],
      [{ balance: 990 }],
      [],
      [],
      [openRow(), openRow({ providerMatchId: 10, kickoffAt: at(5) })]
    );

    expect(await openGame("user-1", NOW)).toEqual({
      kind: "between",
      nextSeasonId: 2028,
      joined: true,
      awaiting: [
        {
          providerMatchId: 9,
          kickoffAt: at(-20),
          homeTeamName: "FC Lahti",
          awayTeamName: "AC Oulu",
          guess: { kind: "outcome", outcome: "X" },
        },
      ],
    });
    expect(inserted()).toEqual([]);
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
        match({
          providerMatchId: 3,
          kickoffAt: at(-45),
          status: "FINISHED",
          homeGoals: 1,
          awayGoals: 1,
        }),
        match({
          providerMatchId: 4,
          kickoffAt: at(-30),
          status: "FINISHED",
          homeGoals: 3,
          awayGoals: 3,
        }),
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
          settledAt: at(-48),
          tier: "exact",
          resultHomeGoals: 2,
          resultAwayGoals: 1,
        }),
        guessRow({
          id: 12,
          providerMatchId: 2,
          settledAt: at(-35),
          tier: "miss",
          resultHomeGoals: 0,
          resultAwayGoals: 0,
        }),
        // Settled at the same moment as 12: the later kickoff, 12's, comes first.
        guessRow({
          id: 13,
          providerMatchId: 3,
          settledAt: at(-35),
          tier: "miss",
          resultHomeGoals: 1,
          resultAwayGoals: 1,
        }),
        // Settled with no result stored, as a refund is: listed without one.
        guessRow({ id: 14, providerMatchId: 4, settledAt: at(-25), tier: "abandoned" }),
        guessRow({ id: 15, providerMatchId: 5, free: true }),
        // A settlement time with no tier, which no write makes: not listed.
        guessRow({ id: 16, providerMatchId: 7, settledAt: at(-5) }),
      ],
      [{ guessId: 11, amount: 100 }],
      [openRow({ providerMatchId: 5, kickoffAt: at(30) })]
    );

    const view = await openGame("user-1", NOW);

    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", seasonId: 2027, amount: 1000 },
      "Arvauspeli grant written"
    );
    expect(view).toMatchObject({
      kind: "playing",
      seasonId: 2027,
      balance: 940,
      groups: 2,
      awaiting: [],
    });
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
    expect(view.settled.map((row) => [row.providerMatchId, row.settlement, row.reward])).toEqual([
      [4, "abandoned", 0],
      [2, "miss", 0],
      [3, "miss", 0],
      [1, "exact", 100],
    ]);
    expect(view.settled[0]).toMatchObject({ homeGoals: null, awayGoals: null });
    expect(view.settled[3]).toMatchObject({
      homeGoals: 2,
      awayGoals: 1,
      guess: { kind: "score", homeGoals: 2, awayGoals: 1 },
    });
    expect(view.settled[0]).not.toHaveProperty("settledAt");
  });

  it("shows the result a guess was judged against, not the match's current one", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [
        match({
          providerMatchId: 1,
          groupId: 2,
          kickoffAt: at(-50),
          status: "FINISHED",
          homeGoals: 0,
          awayGoals: 3,
        }),
        match({ providerMatchId: 2, groupId: 2 }),
      ],
      [],
      [{ balance: 1000 }],
      [
        guessRow({
          id: 11,
          providerMatchId: 1,
          settledAt: at(-45),
          tier: "outcome",
          resultHomeGoals: 1,
          resultAwayGoals: 0,
        }),
      ],
      [{ guessId: 11, amount: 30 }],
      []
    );

    const view = await openGame("user-1", NOW);

    expect(view).toMatchObject({
      settled: [{ homeGoals: 1, awayGoals: 0, settlement: "outcome", reward: 30 }],
    });
  });

  it("lists a settled guess as settled even if its match's kickoff has moved ahead", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [match({ providerMatchId: 1, groupId: 2, kickoffAt: at(100) })],
      [],
      [{ balance: 1000 }],
      [
        guessRow({
          id: 11,
          providerMatchId: 1,
          settledAt: at(-5),
          tier: "miss",
          resultHomeGoals: 0,
          resultAwayGoals: 1,
        }),
      ],
      [{ guessId: 11, amount: 0 }],
      []
    );

    const view = await openGame("user-1", NOW);

    expect(view).toMatchObject({
      upcoming: [],
      settled: [{ providerMatchId: 1, settlement: "miss" }],
    });
  });

  it("opens the floor on a match with no guess when the balance is short and nothing is open", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [match({ groupId: 2 })],
      [],
      [{ balance: null }],
      [],
      [],
      []
    );

    const view = await openGame("user-1", NOW);

    expect(logger.info).not.toHaveBeenCalled();
    expect(view).toMatchObject({ kind: "playing", balance: 0, groups: 1 });
    if (view.kind !== "playing") return;
    expect(view.upcoming).toEqual([expect.objectContaining({ floor: true, free: false })]);
  });

  it("keeps the floor closed while a guess waits in any season, a future one included", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [match({ groupId: 2 })],
      [],
      [{ balance: 0 }],
      [],
      [],
      [openRow({ kickoffAt: at(500) })]
    );

    const view = await openGame("user-1", NOW);

    expect(view).toMatchObject({ kind: "playing", awaiting: [], upcoming: [{ floor: false }] });
  });

  it("marks a row postponed once its kickoff has moved later than the guess was made against", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [
        match({ providerMatchId: 2, groupId: 2 }),
        match({ providerMatchId: 1, groupId: 2, kickoffAt: at(300) }),
      ],
      [],
      [{ balance: 100 }],
      [guessRow({ id: 11, providerMatchId: 1 }), guessRow({ id: 12, providerMatchId: 2 })],
      [],
      []
    );

    const view = await openGame("user-1", NOW);

    expect(view).toMatchObject({
      upcoming: [
        { providerMatchId: 2, postponed: false },
        { providerMatchId: 1, postponed: true },
      ],
    });
  });

  it("keeps the floor closed by a waiting guess whose match is gone, without listing it", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [match({ groupId: 2 })],
      [],
      [{ balance: 0 }],
      [],
      [],
      [openRow({ kickoffAt: null, homeTeamName: null, awayTeamName: null })]
    );

    expect(await openGame("user-1", NOW)).toMatchObject({
      awaiting: [],
      upcoming: [{ floor: false }],
    });
  });

  it("reads a missing balance row as nothing", async () => {
    answer(
      [{ seasonId: 2027 }],
      [{ joinedAt: JOINED }],
      [match({ groupId: 2 })],
      [],
      [],
      [],
      [],
      []
    );

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
      [],
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
      [match({ groupId: 2, kickoffAt: at(-5), status: "FINISHED", homeGoals: 1, awayGoals: 1 })]
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
  const clock = () => NOW;

  // The reads every accepted guess makes: the player, the match, the season shown, its
  // matches, the grant's insert, the balance, the guess on this match, and any open guess.
  function playable(balance: number, existing: unknown[] = [], anyOpen: unknown[] = []) {
    answer(
      [{ joinedAt: JOINED }],
      [vlMatch],
      [{ seasonId: 2027 }],
      [match({ groupId: 2 })],
      [],
      [{ balance }],
      existing,
      anyOpen
    );
  }

  it("refuses a reader who has not joined, and logs the refusal", async () => {
    answer([]);

    expect(await placeGuess("user-1", 1, OUTCOME, 10, clock)).toEqual({
      ok: false,
      reason: "not-joined",
    });
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", providerMatchId: 1, kind: "outcome", reason: "not-joined" },
      "Arvauspeli guess refused"
    );
  });

  it("refuses a match not stored, one that is not Veikkausliiga's, and one of another season", async () => {
    answer([{ joinedAt: JOINED }], []);
    expect(await placeGuess("user-1", 1, OUTCOME, 10, clock)).toEqual({
      ok: false,
      reason: "unknown-match",
    });

    answer([{ joinedAt: JOINED }], [{ ...vlMatch, categoryId: "M1L" }]);
    expect(await placeGuess("user-1", 1, OUTCOME, 10, clock)).toEqual({
      ok: false,
      reason: "unknown-match",
    });

    answer([{ joinedAt: JOINED }], [{ ...vlMatch, competitionCode: "spljp26" }]);
    expect(await placeGuess("user-1", 1, OUTCOME, 10, clock)).toEqual({
      ok: false,
      reason: "unknown-match",
    });

    answer([{ joinedAt: JOINED }], [vlMatch], [{ seasonId: 2028 }]);
    expect(await placeGuess("user-1", 1, OUTCOME, 10, clock)).toEqual({
      ok: false,
      reason: "unknown-match",
    });
  });

  it("refuses a match that has kicked off by the clock read once the player is locked", async () => {
    let locksBeforeClock = -1;
    answer([{ joinedAt: JOINED }], [{ ...vlMatch, kickoffAt: NOW }], [{ seasonId: 2027 }]);

    const outcome = await placeGuess("user-1", 1, OUTCOME, 10, () => {
      locksBeforeClock = state.calls.filter((call) => call.method === "for").length;
      return NOW;
    });

    expect(outcome).toEqual({ ok: false, reason: "started" });
    expect(locksBeforeClock).toBe(1);
  });

  it("writes a new guess and its cost, and logs both", async () => {
    playable(100);
    answer([{ id: 21 }], undefined);

    expect(await placeGuess("user-1", 1, SCORE, 10, clock)).toEqual({
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
    playable(5);
    answer([{ id: 22 }], undefined);

    expect(await placeGuess("user-1", 1, OUTCOME, 0, clock)).toEqual({
      ok: true,
      decision: { kind: "free" },
    });
    expect(inserted().slice(-2)).toEqual([
      expect.objectContaining({ kind: "outcome", outcome: "1", homeGoals: null, free: true }),
      { userId: "user-1", seasonId: 2027, kind: "guess", amount: 0, guessId: 22 },
    ]);
  });

  it("rewrites a changed guess and charges the change", async () => {
    playable(100, [guessRow({ id: 30, providerMatchId: 1 })], [{ id: 30 }]);
    answer(undefined, undefined);

    expect(await placeGuess("user-1", 1, SCORE, 10, clock)).toEqual({
      ok: true,
      decision: { kind: "change", price: 10, guessId: 30 },
    });
    expect(state.calls.find((call) => call.method === "set")?.args[0]).toEqual({
      kind: "score",
      outcome: null,
      homeGoals: 2,
      awayGoals: 0,
      madeAt: NOW,
      kickoffAt: at(200),
    });
    expect(inserted().at(-1)).toEqual({
      userId: "user-1",
      seasonId: 2027,
      kind: "change",
      amount: -10,
      guessId: 30,
    });
  });

  it("changes a postponed guess for nothing, and records the kickoff it is now made against", async () => {
    playable(100, [guessRow({ id: 30, providerMatchId: 1, kickoffAt: at(100) })], [{ id: 30 }]);
    answer(undefined, undefined);

    expect(await placeGuess("user-1", 1, SCORE, 0, clock)).toEqual({
      ok: true,
      decision: { kind: "change", price: 0, guessId: 30 },
    });
    expect(state.calls.find((call) => call.method === "set")?.args[0]).toMatchObject({
      kickoffAt: at(200),
    });
    const change = inserted().at(-1) as { kind: string; amount: number };
    expect(change.kind).toBe("change");
    expect(Object.is(change.amount, 0)).toBe(true);
  });

  it("writes nothing for the same guess again", async () => {
    playable(100, [guessRow({ id: 30, providerMatchId: 1 })], [{ id: 30 }]);

    expect(await placeGuess("user-1", 1, OUTCOME, 10, clock)).toEqual({
      ok: true,
      decision: { kind: "unchanged" },
    });
    expect(state.calls.some((call) => call.method === "update")).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "unchanged", price: 0 }),
      "Arvauspeli guess written"
    );
  });

  it("refuses a guess whose price is no longer the one the page showed, and writes nothing", async () => {
    playable(100);

    expect(await placeGuess("user-1", 1, OUTCOME, 15, clock)).toEqual({
      ok: false,
      reason: "price-changed",
    });
    // Only the grant every guess makes sure of; no guess and no cost.
    expect(inserted()).toEqual([expect.objectContaining({ kind: "grant" })]);
  });

  it("refuses a free guess the page showed at a price, and a paid one it showed as free", async () => {
    playable(5);
    expect(await placeGuess("user-1", 1, OUTCOME, 10, clock)).toEqual({
      ok: false,
      reason: "price-changed",
    });

    playable(100);
    expect(await placeGuess("user-1", 1, OUTCOME, 0, clock)).toEqual({
      ok: false,
      reason: "price-changed",
    });
  });

  it("changes nothing for the same guess again, whatever price the page showed", async () => {
    playable(100, [guessRow({ id: 30, providerMatchId: 1 })], [{ id: 30 }]);

    expect(await placeGuess("user-1", 1, OUTCOME, 15, clock)).toEqual({
      ok: true,
      decision: { kind: "unchanged" },
    });
  });

  it("refuses to change a guess already settled, and writes nothing", async () => {
    playable(100, [guessRow({ id: 30, providerMatchId: 1, settledAt: at(-1), tier: "miss" })]);

    expect(await placeGuess("user-1", 1, SCORE, 10, clock)).toEqual({
      ok: false,
      reason: "settled",
    });
    expect(state.calls.some((call) => call.method === "update")).toBe(false);
  });

  it("refuses a short balance's free guess while a guess waits in any season", async () => {
    playable(5, [], [{ id: 30 }]);

    expect(await placeGuess("user-1", 1, OUTCOME, 10, clock)).toEqual({
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
  // An open guess as the settling read returns it, with its match's columns.
  function settleable(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      userId: "user-1",
      seasonId: 2027,
      providerMatchId: 1,
      kind: "outcome",
      outcome: "1",
      homeGoals: null,
      awayGoals: null,
      madeAt: at(-30),
      stored: 1,
      status: "FINISHED",
      providerStatus: "Played",
      kickoffAt: at(-2),
      resultHome: 1,
      resultAway: 0,
      winner: "home",
      ...overrides,
    };
  }

  // The open guesses read first; then every update answers `updated`, every
  // other read the guess's payments, and every insert nothing.
  function settling(rows: unknown[], updated: unknown[] = [{ id: 1 }]) {
    let read = false;
    state.respond = (statement) => {
      if (statement === "select" && !read) {
        read = true;
        return rows;
      }
      if (statement === "select") return [{ paid: -25 }];
      return statement === "update" ? updated : undefined;
    };
  }

  it("pays each guess by the reward table, each match in its own transaction, and counts the paid and the missed", async () => {
    settling([
      settleable({ id: 1 }),
      settleable({ id: 2, outcome: "2" }),
      settleable({ id: 3, providerMatchId: 2 }),
    ]);

    expect(await settleGuesses(NOW)).toEqual({
      matches: 2,
      rewarded: 2,
      missed: 1,
      refunded: 0,
      voided: 0,
      failed: [],
    });
    expect(state.transactions).toBe(2);
    expect(inserted()).toEqual(
      expect.arrayContaining([
        { userId: "user-1", seasonId: 2027, kind: "reward", amount: 30, guessId: 1 },
        { userId: "user-1", seasonId: 2027, kind: "reward", amount: 0, guessId: 2 },
        { userId: "user-1", seasonId: 2027, kind: "reward", amount: 30, guessId: 3 },
      ])
    );
    expect(inserted()).toHaveLength(3);
    expect(state.calls.find((call) => call.method === "set")?.args[0]).toEqual(
      expect.objectContaining({ tier: "outcome", resultHomeGoals: 1, resultAwayGoals: 0 })
    );
    expect(logger.info).toHaveBeenCalledWith(
      { matches: 2, rewarded: 2, missed: 1, refunded: 0, voided: 0, failed: [] },
      "Arvauspeli guesses settled"
    );
  });

  it("refunds everything paid on a guess, an abandoned match's and a voided one's, with no result", async () => {
    settling([
      settleable({ id: 1, status: "Abandoned" }),
      settleable({ id: 2, providerMatchId: 2, madeAt: at(-1) }),
    ]);

    expect(await settleGuesses(NOW)).toMatchObject({ refunded: 1, voided: 1, rewarded: 0 });
    expect(inserted()).toEqual(
      expect.arrayContaining([
        { userId: "user-1", seasonId: 2027, kind: "refund", amount: 25, guessId: 1 },
        { userId: "user-1", seasonId: 2027, kind: "refund", amount: 25, guessId: 2 },
      ])
    );
    const sets = state.calls.filter((call) => call.method === "set").map((call) => call.args[0]);
    expect(sets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tier: "abandoned",
          resultHomeGoals: null,
          resultAwayGoals: null,
        }),
        expect.objectContaining({ tier: "void" }),
      ])
    );
  });

  it("refunds nothing for a guess nothing was paid on", async () => {
    settling([settleable({ status: "Abandoned" })]);
    state.respond = (
      (original) => (statement: "select" | "insert" | "update") =>
        statement === "select" && state.calls.filter((call) => call.method === "select").length > 2
          ? []
          : original?.(statement)
    )(state.respond);

    await settleGuesses(NOW);

    expect(inserted()).toEqual([expect.objectContaining({ kind: "refund", amount: 0 })]);
  });

  it("settles an awarded match by TASO's own status", async () => {
    settling([
      settleable({
        kind: "score",
        outcome: null,
        homeGoals: 0,
        awayGoals: 2,
        providerStatus: "Forfeited",
      }),
    ]);

    expect(await settleGuesses(NOW)).toMatchObject({ rewarded: 1 });
    expect(inserted()).toEqual([expect.objectContaining({ kind: "reward", amount: 100 })]);
  });

  it("locks a match's players before it updates any of its guesses", async () => {
    settling([settleable({ id: 1 }), settleable({ id: 2, userId: "user-2" })]);

    await settleGuesses(NOW);

    const order = state.calls
      .filter((call) => call.method === "for" || call.method === "update")
      .map((call) => (call.method === "for" ? call.args[0] : "update"));
    expect(order).toEqual(["share", "update", "update"]);
  });

  it("pays nothing for a guess another run settled first", async () => {
    settling([settleable()], []);

    expect(await settleGuesses(NOW)).toMatchObject({ matches: 1, rewarded: 0, missed: 0 });
    expect(inserted()).toEqual([]);
  });

  it("names a match that failed, logs it, and settles the rest", async () => {
    settling([settleable({ id: 1 }), settleable({ id: 2, providerMatchId: 2 })]);
    state.failingTransactions = 1;

    expect(await settleGuesses(NOW)).toMatchObject({ matches: 1, rewarded: 1, failed: [1] });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), providerMatchId: 1 },
      "Unable to settle Arvauspeli guesses"
    );
    expect(inserted()).toEqual([expect.objectContaining({ guessId: 2 })]);
  });

  it("names a waiting match once, when it is gone, has a status not seen before, or no result after 48 hours", async () => {
    settling([
      settleable({ id: 1, providerMatchId: 1, stored: null, status: null, kickoffAt: null }),
      settleable({ id: 2, providerMatchId: 1, stored: null, status: null, kickoffAt: null }),
      settleable({
        id: 3,
        providerMatchId: 2,
        status: "Break",
        resultHome: null,
        resultAway: null,
      }),
      settleable({
        id: 4,
        providerMatchId: 3,
        status: "SCHEDULED",
        madeAt: at(-100),
        kickoffAt: at(-48),
        resultHome: null,
        resultAway: null,
      }),
      // Still within 48 hours: waiting is ordinary.
      settleable({
        id: 5,
        providerMatchId: 4,
        status: "SCHEDULED",
        madeAt: at(-100),
        kickoffAt: at(-47),
        resultHome: null,
        resultAway: null,
      }),
    ]);

    expect(await settleGuesses(NOW)).toMatchObject({ matches: 0 });
    const warned = logger.warn.mock.calls.map(([fields]) => [
      fields.providerMatchId,
      fields.reason,
    ]);
    expect(warned).toEqual([
      [1, "not stored"],
      [2, "unknown status"],
      [3, "no result"],
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      { providerMatchId: 2, status: "Break", kickoffAt: at(-2), reason: "unknown status" },
      "Arvauspeli guesses still waiting"
    );
  });
});
