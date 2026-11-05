import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameView } from "@/lib/guessing-game-store";
import { warmModules } from "../../support/warm-module";

/**
 * Arvauspeli's reads of other players over a faked client: what the board and
 * the shares make of their rows, and that a failed read costs only itself. The
 * SQL runs against Postgres in `tests/integration/guessing-game.test.ts`.
 *
 * decisions/073-leaderboard.md
 * decisions/074-against-the-models.md
 */

const { state, logger } = vi.hoisted(() => ({
  state: {
    guessed: [] as unknown[],
    balances: [] as unknown[],
    shareRows: [] as unknown[],
    modelRows: [] as unknown[],
    failBoard: false,
    failShares: false,
    failModels: false,
    selects: 0,
    transactionOptions: [] as unknown[],
  },
  logger: { error: vi.fn() },
}));

vi.mock("@/db", () => {
  function rowsFor(shape: Record<string, unknown>): unknown[] {
    if ("settled" in shape) return state.guessed;
    if ("balance" in shape) return state.balances;
    if ("model" in shape) return state.modelRows;
    return state.shareRows;
  }
  // Each statement is a chain whose every call returns itself; awaiting it
  // takes the rows its selected shape stands for.
  function select(shape: Record<string, unknown>) {
    state.selects += 1;
    const chain: object = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") {
            return (resolve: (rows: unknown) => void, reject: (error: unknown) => void) => {
              let failing = state.failBoard;
              if ("guesses" in shape) failing = state.failShares;
              if ("model" in shape) failing = state.failModels;
              if (failing) reject(new Error("database down"));
              else resolve(rowsFor(shape));
            };
          }
          return () => chain;
        },
      }
    );
    return chain;
  }
  return {
    db: {
      select,
      transaction: async (
        run: (tx: { select: typeof select }) => Promise<unknown>,
        options: unknown
      ) => {
        state.transactionOptions.push(options);
        return run({ select });
      },
    },
  };
});
vi.mock("@/lib/logger", () => ({ logger }));

const { db } = await import("@/db");
const { readBoard, readModelGuesses, readOthers, readShares } = await import(
  "@/lib/guessing-game-board"
);

warmModules(() => import("@/lib/guessing-game-board"));

const NOW = new Date("2027-06-01T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  state.guessed = [];
  state.balances = [];
  state.shareRows = [];
  state.modelRows = [];
  state.failBoard = false;
  state.failShares = false;
  state.failModels = false;
  state.selects = 0;
  state.transactionOptions = [];
});

describe("readBoard", () => {
  it("ranks the season's players who guessed by their balance, with their nicknames", async () => {
    state.guessed = [
      { userId: "a", settled: 3, nickname: "Aino" },
      { userId: "b", settled: 1, nickname: null },
    ];
    state.balances = [
      { userId: "a", balance: 900 },
      { userId: "b", balance: 1040 },
      // A player who joined and never guessed is not on the board.
      { userId: "c", balance: 1000 },
    ];

    const board = await readBoard(2027, "a");

    expect(board.rows).toEqual([
      { nickname: null, balance: 1040, settled: 1, rank: 1, place: 1, self: false },
      { nickname: "Aino", balance: 900, settled: 3, rank: 2, place: 2, self: true },
    ]);
    expect(board.players).toBe(2);
  });

  it("reads both in one read-only snapshot", async () => {
    await readBoard(2027, "a");

    expect(state.transactionOptions).toEqual([
      { isolationLevel: "repeatable read", accessMode: "read only" },
    ]);
  });

  it("ranks a player whose ledger has no rows at 0", async () => {
    state.guessed = [{ userId: "a", settled: 0, nickname: "Aino" }];

    expect((await readBoard(2027, "a")).rows[0]?.balance).toBe(0);
  });
});

describe("readShares", () => {
  it("reads nothing for no matches", async () => {
    expect(await readShares([], NOW)).toEqual(new Map());
    expect(state.selects).toBe(0);
  });

  it("gathers each match's counts into its shares, leaving out a match with too few", async () => {
    state.shareRows = [
      { providerMatchId: 1, outcome: "1", guesses: 2 },
      { providerMatchId: 1, outcome: "2", guesses: 1 },
      { providerMatchId: 2, outcome: "X", guesses: 2 },
    ];

    expect(await readShares([1, 2], NOW)).toEqual(
      new Map([[1, { "1": 67, X: 0, "2": 33, total: 3 }]])
    );
  });
});

function prediction(overrides: Record<string, unknown> = {}) {
  return {
    providerMatchId: 7,
    model: "elo-v1",
    home: 0.5,
    draw: 0.3,
    away: 0.2,
    homeGoals: null,
    awayGoals: null,
    ...overrides,
  };
}

describe("readModelGuesses", () => {
  it("reads nothing for no matches", async () => {
    expect(await readModelGuesses(db, [])).toEqual(new Map());
    expect(state.selects).toBe(0);
  });

  it("gives each match its models' guesses in the shown order, Poisson with its score", async () => {
    state.modelRows = [
      prediction({
        model: "poisson-v1",
        home: 0.2,
        draw: 0.3,
        away: 0.5,
        homeGoals: 0,
        awayGoals: 1,
      }),
      prediction({ model: "elo-home-v1", home: 0.3, draw: 0.4, away: 0.3 }),
      prediction(),
      prediction({ providerMatchId: 8, model: "elo-form-v1" }),
    ];

    expect(await readModelGuesses(db, [7, 8])).toEqual(
      new Map([
        [
          7,
          [
            { model: "elo-v1", outcome: "1", score: null },
            { model: "elo-home-v1", outcome: "X", score: null },
            { model: "poisson-v1", outcome: "2", score: { homeGoals: 0, awayGoals: 1 } },
          ],
        ],
        [8, [{ model: "elo-form-v1", outcome: "1", score: null }]],
      ])
    );
  });

  it("leaves out a model that is not in the game", async () => {
    state.modelRows = [prediction({ model: "home-baseline-v1" })];

    expect(await readModelGuesses(db, [7])).toEqual(new Map());
  });

  it("gives Poisson no score when only one side is stored", async () => {
    state.modelRows = [prediction({ model: "poisson-v1", homeGoals: 1, awayGoals: null })];

    expect((await readModelGuesses(db, [7])).get(7)?.[0]?.score).toBeNull();
  });
});

const PLAYING_AWAITING = [
  {
    providerMatchId: 7,
    kickoffAt: NOW,
    homeTeamName: "HJK",
    awayTeamName: "KuPS",
    guess: { kind: "outcome", outcome: "1" } as const,
  },
];

const PLAYING: GameView = {
  kind: "playing",
  seasonId: 2027,
  balance: 1000,
  upcoming: [],
  awaiting: PLAYING_AWAITING,
  settled: [],
  groups: 1,
};

describe("readOthers", () => {
  it("reads the board of the season in play, and the shares of the reader's matches", async () => {
    state.guessed = [{ userId: "me", settled: 0, nickname: "Minä" }];
    state.shareRows = [{ providerMatchId: 7, outcome: "X", guesses: 3 }];

    const others = await readOthers(PLAYING, "me", NOW);

    expect(others.board).toMatchObject({ players: 1 });
    expect(others.shares.get(7)).toEqual({ "1": 0, X: 100, "2": 0, total: 3 });
  });

  it("reads the models' guesses on the reader's kicked-off matches", async () => {
    state.modelRows = [prediction()];

    const others = await readOthers(PLAYING, "me", NOW);

    expect(others.models.get(7)).toEqual([{ model: "elo-v1", outcome: "1", score: null }]);
  });

  it("reads no models' guesses on a match the reader guessed that has not kicked off", async () => {
    state.modelRows = [prediction()];
    const upcoming = {
      providerMatchId: 7,
      kickoffAt: NOW,
      homeTeamName: "HJK",
      awayTeamName: "KuPS",
      guess: { kind: "outcome", outcome: "1" },
      groupName: "Runkosarja",
      price: 10,
      nextRise: null,
      free: false,
      postponed: false,
      floor: false,
    } as const;

    const others = await readOthers({ ...PLAYING, awaiting: [], upcoming: [upcoming] }, "me", NOW);

    expect(others.models).toEqual(new Map());
  });

  it("leaves the models' guesses out, and logs it, when they fail", async () => {
    state.failModels = true;

    const others = await readOthers(PLAYING, "me", NOW);

    expect(others.models).toEqual(new Map());
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), userId: "me" },
      "Reading the models' Arvauspeli guesses failed"
    );
  });

  it("reads the season just finished between seasons, and no board before any season", async () => {
    state.guessed = [{ userId: "me", settled: 1, nickname: null }];
    state.shareRows = [{ providerMatchId: 7, outcome: "1", guesses: 3 }];
    const between = await readOthers(
      { kind: "between", nextSeasonId: 2028, joined: true, awaiting: PLAYING_AWAITING },
      "me",
      NOW
    );
    expect(between.board).toMatchObject({ players: 1 });
    // A guess from the season before, still waiting, has its shares between seasons too.
    expect(between.shares.get(7)).toMatchObject({ total: 3 });

    const none = await readOthers({ kind: "no-season", joined: true }, "me", NOW);
    expect(none.board).toBeNull();
  });

  it("between seasons reads the board of the season just finished, not the next", async () => {
    state.failBoard = true;

    await readOthers(
      { kind: "between", nextSeasonId: 2028, joined: true, awaiting: [] },
      "me",
      NOW
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ seasonId: 2027 }),
      "Reading the Arvauspeli leaderboard failed"
    );
  });

  it("reads the board for a reader who has not joined, and no shares", async () => {
    const others = await readOthers({ kind: "not-joined", seasonId: 2027, grant: 1000 }, "me", NOW);

    expect(others.board).toEqual({ rows: [], own: null, players: 0 });
    expect(others.shares).toEqual(new Map());
  });

  it("says the board failed, and logs it, without failing the shares", async () => {
    state.failBoard = true;
    state.shareRows = [{ providerMatchId: 7, outcome: "1", guesses: 3 }];

    const others = await readOthers(PLAYING, "me", NOW);

    expect(others.board).toBe("error");
    expect(others.shares.size).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), userId: "me", seasonId: 2027 },
      "Reading the Arvauspeli leaderboard failed"
    );
  });

  it("leaves the shares out, and logs it, when they fail", async () => {
    state.failShares = true;

    const others = await readOthers(PLAYING, "me", NOW);

    expect(others.shares).toEqual(new Map());
    expect(others.board).toMatchObject({ players: 0 });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), userId: "me" },
      "Reading Arvauspeli guess shares failed"
    );
  });
});
