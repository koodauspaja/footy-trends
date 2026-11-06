import { beforeEach, describe, expect, it, vi } from "vitest";
import { gamePlayer, gameSeasonGuess } from "@/db/schema";
import type { GameView } from "@/lib/guessing-game-store";
import { warmModules } from "../../support/warm-module";

/**
 * Arvauspeli's season guess store around its queries: placing and changing a
 * guess, the section's read, the season's answers from its tables, and
 * settling. Each query answers a queued result; the SQL runs against Postgres
 * in `tests/integration/guessing-game-season.test.ts`. The season's tables are
 * stood in for: they come from the standings page's path, with its own TASO
 * freshness rules.
 *
 * decisions/075-season-guesses.md
 */

const { state, logger, store, standings } = vi.hoisted(() => {
  const state = {
    answers: [] as unknown[],
    calls: [] as Array<{ method: string; args: unknown[] }>,
    transactionOptions: [] as unknown[],
  };
  return {
    state,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    store: {
      latestSeason: vi.fn(),
      seasonOfId: vi.fn(),
      seasonMatches: vi.fn(),
      ensureGrant: vi.fn(),
      balanceOf: vi.fn(),
    },
    standings: { getSeasonStandings: vi.fn() },
  };
});

vi.mock("@/db", () => {
  // Each statement is a chain of its own; awaiting it takes the next answer.
  function statement(kind: "select" | "insert" | "update", args: unknown[]): object {
    state.calls.push({ method: kind, args });
    const chain: object = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") {
            return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
              const answer = state.answers.shift();
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
      transaction: async (run: (tx: typeof client) => Promise<unknown>, options?: unknown) => {
        state.transactionOptions.push(options);
        return run(client);
      },
    },
  };
});
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/guessing-game-store", () => ({
  ...store,
  COMPETITION: "VL",
  FINISHED: "FINISHED",
  REGULAR_SEASON_GROUP: 1,
  seasonOf: vi.fn(() => "the season"),
}));
vi.mock("@/lib/taso-standings-service", () => standings);

const {
  pickSharesOf,
  placeSeasonGuess,
  readSeasonAnswers,
  readSeasonSection,
  readSeasonSectionOf,
  settleSeasonGuesses,
} = await import("@/lib/guessing-game-season-store");

warmModules(() => import("@/lib/guessing-game-season-store"));

const NOW = new Date("2027-03-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const JOINED = new Date("2027-01-01T00:00:00Z");
const TEAMS = Array.from({ length: 12 }, (_, index) => 100 + index);
// The lock read's answer when no guess of the season has stored one.
const NO_LOCK = [{ lockAt: null }];
// The settling run's lock on the player, taken before the guess's row.
const PLAYER = [{ userId: "user-1" }];

function answer(...answers: unknown[]) {
  state.answers.push(...answers);
}

function inserted(): unknown[] {
  return state.calls.filter((call) => call.method === "values").map((call) => call.args[0]);
}

function updated(): unknown[] {
  return state.calls.filter((call) => call.method === "set").map((call) => call.args[0]);
}

// The season's fixtures as the regular season's team read answers them.
function teamRows(teams = TEAMS) {
  return teams.slice(0, teams.length / 2).map((home, index) => ({
    homeId: home,
    homeName: `Team ${home}`,
    awayId: teams[teams.length / 2 + index],
    awayName: `Team ${teams[teams.length / 2 + index]}`,
  }));
}

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

function season(seasonId: number, matches = [match()]) {
  return { seasonId, matches, splitStored: false, previousSplit: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.answers = [];
  state.calls = [];
  state.transactionOptions = [];
  store.latestSeason.mockReset().mockResolvedValue(2027);
  store.seasonOfId
    .mockReset()
    .mockImplementation(async (_client, seasonId: number) => season(seasonId));
  store.seasonMatches.mockReset().mockImplementation(async () => [match()]);
  store.ensureGrant.mockReset().mockResolvedValue(undefined);
  store.balanceOf.mockReset().mockResolvedValue(1000);
  standings.getSeasonStandings.mockReset();
});

describe("placeSeasonGuess", () => {
  const CHAMPION = { kind: "champion", teams: [100] };

  it("charges a first guess its price, writes it and logs it", async () => {
    answer([{ joinedAt: JOINED }], NO_LOCK, teamRows(), [], [{ id: 41 }], undefined);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => NOW)).toEqual({
      ok: true,
      outcome: "placed",
    });
    expect(store.ensureGrant).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      season(2027),
      JOINED
    );
    expect(inserted()).toEqual([
      {
        userId: "user-1",
        seasonId: 2027,
        kind: "champion",
        teams: [100],
        madeAt: NOW,
        lockAt: at(200),
      },
      { userId: "user-1", seasonId: 2027, kind: "season-guess", amount: -50, seasonGuessId: 41 },
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", seasonId: 2027, kind: "champion", price: 50 },
      "Arvauspeli season guess placed"
    );
  });

  it("charges a table guess 100", async () => {
    answer([{ joinedAt: JOINED }], NO_LOCK, teamRows(), [], [{ id: 42 }], undefined);

    await placeSeasonGuess("user-1", { kind: "table", teams: TEAMS }, () => NOW);

    expect(inserted()[1]).toMatchObject({ kind: "season-guess", amount: -100 });
  });

  it("refuses a first guess the balance cannot pay, writes nothing and logs it", async () => {
    store.balanceOf.mockResolvedValue(49);
    answer([{ joinedAt: JOINED }], NO_LOCK, teamRows(), []);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => NOW)).toEqual({
      ok: false,
      reason: "insufficient",
    });
    expect(inserted()).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", seasonId: 2027, kind: "champion", reason: "insufficient" },
      "Arvauspeli season guess refused"
    );
  });

  it("pays a first guess with exactly its price", async () => {
    store.balanceOf.mockResolvedValue(50);
    answer([{ joinedAt: JOINED }], NO_LOCK, teamRows(), [], [{ id: 43 }], undefined);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => NOW)).toEqual({
      ok: true,
      outcome: "placed",
    });
  });

  it("changes a guess for free, rewriting its teams and when it changed, not when it was made, and logs it", async () => {
    store.balanceOf.mockResolvedValue(0);
    answer([{ joinedAt: JOINED }], NO_LOCK, teamRows(), [{ id: 41, teams: [101] }], undefined);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => NOW)).toEqual({
      ok: true,
      outcome: "changed",
    });
    expect(updated()).toEqual([{ teams: [100], changedAt: NOW }]);
    expect(inserted()).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", seasonId: 2027, kind: "champion", price: 0 },
      "Arvauspeli season guess changed"
    );
  });

  it("writes nothing for the same guess again", async () => {
    answer([{ joinedAt: JOINED }], NO_LOCK, teamRows(), [{ id: 41, teams: [100] }]);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => NOW)).toEqual({
      ok: true,
      outcome: "unchanged",
    });
    expect(updated()).toEqual([]);
    expect(inserted()).toEqual([]);
  });

  it("refuses a reader who has not joined, before reading the season", async () => {
    answer([]);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => NOW)).toEqual({
      ok: false,
      reason: "not-joined",
    });
    expect(store.latestSeason).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", seasonId: null, kind: "champion", reason: "not-joined" },
      "Arvauspeli season guess refused"
    );
  });

  it("refuses when no season is stored, and when the season has no matches", async () => {
    store.latestSeason.mockResolvedValueOnce(null);
    answer([{ joinedAt: JOINED }]);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => NOW)).toEqual({
      ok: false,
      reason: "no-season",
    });

    store.seasonOfId.mockResolvedValueOnce(season(2027, []));
    answer([{ joinedAt: JOINED }]);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => NOW)).toEqual({
      ok: false,
      reason: "no-season",
    });
  });

  it("refuses at the season's first kickoff and after it", async () => {
    for (const now of [at(200), at(201)]) {
      answer([{ joinedAt: JOINED }], NO_LOCK);

      expect(await placeSeasonGuess("user-1", CHAMPION, () => now)).toEqual({
        ok: false,
        reason: "locked",
      });
    }
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", seasonId: 2027, kind: "champion", reason: "locked" },
      "Arvauspeli season guess refused"
    );
    expect(inserted()).toEqual([]);
  });

  it("locks at the first of the season's kickoffs", async () => {
    store.seasonOfId.mockResolvedValueOnce(
      season(2027, [match({ kickoffAt: at(-1) }), match({ kickoffAt: at(200) })])
    );
    answer([{ joinedAt: JOINED }], NO_LOCK);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => NOW)).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("locks at a lock a guess was placed under, earlier than the first kickoff now stored", async () => {
    answer([{ joinedAt: JOINED }], [{ lockAt: at(-1) }]);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => NOW)).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("locks at the first kickoff when a stored lock is later, and places a guess under it", async () => {
    answer([{ joinedAt: JOINED }], [{ lockAt: at(300) }]);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => at(250))).toEqual({
      ok: false,
      reason: "locked",
    });

    answer([{ joinedAt: JOINED }], [{ lockAt: at(300) }], teamRows(), [], [{ id: 44 }], undefined);

    expect(await placeSeasonGuess("user-1", CHAMPION, () => NOW)).toEqual({
      ok: true,
      outcome: "placed",
    });
    expect(inserted()[0]).toMatchObject({ lockAt: at(200) });
  });

  it("refuses teams that are not the season's, and logs the kind it was sent, cut short", async () => {
    answer([{ joinedAt: JOINED }], NO_LOCK, teamRows());

    expect(await placeSeasonGuess("user-1", { kind: "champion", teams: [999] }, () => NOW)).toEqual(
      { ok: false, reason: "teams" }
    );
    expect(store.ensureGrant).not.toHaveBeenCalled();

    answer([{ joinedAt: JOINED }], NO_LOCK, teamRows());
    await placeSeasonGuess("user-1", { kind: "x".repeat(40), teams: [100] }, () => NOW);

    expect(logger.info).toHaveBeenLastCalledWith(
      { userId: "user-1", seasonId: 2027, kind: "x".repeat(20), reason: "teams" },
      "Arvauspeli season guess refused"
    );
  });

  it("logs no kind for a request that is not an object", async () => {
    answer([{ joinedAt: JOINED }], NO_LOCK, teamRows());

    await placeSeasonGuess("user-1", null, () => NOW);

    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", seasonId: 2027, kind: null, reason: "teams" },
      "Arvauspeli season guess refused"
    );
  });
});

describe("pickSharesOf", () => {
  it("is nothing from fewer than 3 guesses", () => {
    expect(pickSharesOf(new Map([[100, 2]]))).toBeNull();
  });

  it("names the three most picked teams, then the rest as one share", () => {
    expect(
      pickSharesOf(
        new Map([
          [100, 1],
          [101, 4],
          [102, 3],
          [103, 2],
        ])
      )
    ).toEqual({
      shares: [
        { teamProviderId: 101, percent: 40 },
        { teamProviderId: 102, percent: 30 },
        { teamProviderId: 103, percent: 20 },
        { teamProviderId: null, percent: 10 },
      ],
      total: 10,
    });
  });

  it("orders teams picked equally by their id, and has no rest with three teams or fewer", () => {
    expect(
      pickSharesOf(
        new Map([
          [102, 1],
          [100, 1],
          [101, 1],
        ])
      )
    ).toEqual({
      shares: [
        { teamProviderId: 100, percent: 33 },
        { teamProviderId: 101, percent: 33 },
        { teamProviderId: 102, percent: 33 },
      ],
      total: 3,
    });
  });
});

function guessRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    userId: "user-1",
    seasonId: 2027,
    kind: "champion",
    teams: [100],
    madeAt: NOW,
    settledAt: null,
    reward: null,
    rightCount: null,
    nearCount: null,
    ...overrides,
  };
}

describe("readSeasonSection", () => {
  it("is nothing for a season with no match stored", async () => {
    answer([]);

    expect(await readSeasonSection("user-1", 2031, NOW)).toBeNull();
  });

  it("before the lock gives the teams in Finnish order and the player's guesses, no shares", async () => {
    answer(
      [{ kickoffAt: at(200) }],
      NO_LOCK,
      [guessRow()],
      [
        { homeId: 2, homeName: "Ähtäri", awayId: 1, awayName: "Oulu" },
        { homeId: 3, homeName: "Inter", awayId: 1, awayName: "Oulu" },
      ]
    );

    expect(await readSeasonSection("user-1", 2032, NOW)).toEqual({
      seasonId: 2032,
      lockAt: at(200),
      locked: false,
      teams: [
        { teamProviderId: 3, name: "Inter" },
        { teamProviderId: 1, name: "Oulu" },
        { teamProviderId: 2, name: "Ähtäri" },
      ],
      guesses: { champion: { teams: [100], settled: null } },
      shares: null,
    });
    expect(state.transactionOptions).toEqual([
      { isolationLevel: "repeatable read", accessMode: "read only" },
    ]);
  });

  it("before the lock shows a section with no guess yet", async () => {
    answer([{ kickoffAt: at(200) }], NO_LOCK, [], []);

    expect(await readSeasonSection("user-1", 2033, NOW)).toMatchObject({
      locked: false,
      guesses: {},
    });
  });

  it("after the lock is nothing for a player with no season guess while no picks are shared", async () => {
    answer([{ kickoffAt: at(-1) }], NO_LOCK, [], teamRows(), [], []);

    expect(await readSeasonSection("user-1", 2034, NOW)).toBeNull();
  });

  it("after the lock gives a player with no season guess the shares of the picks", async () => {
    answer([{ kickoffAt: at(-1) }], NO_LOCK, [], teamRows(), [{ team: 100, count: 3 }], []);

    expect(await readSeasonSection("user-1", 2034, NOW)).toMatchObject({
      locked: true,
      guesses: {},
      shares: {
        champion: { shares: [{ teamProviderId: 100, percent: 100 }], total: 3 },
        last: null,
      },
    });
  });

  it("after the lock is nothing for a player with no guess when shares alone are not asked for", async () => {
    answer([{ kickoffAt: at(-1) }], NO_LOCK, []);

    expect(await readSeasonSection("user-1", 2034, NOW, false)).toBeNull();
    expect(state.calls.filter((call) => call.method === "select")).toHaveLength(3);
  });

  it("after the lock reads the shares, and what each settled guess paid or that it was refunded", async () => {
    answer(
      [{ kickoffAt: NOW }],
      NO_LOCK,
      [
        guessRow({ settledAt: NOW, reward: 200, rightCount: 1, nearCount: 0 }),
        guessRow({ kind: "last", settledAt: NOW, reward: null }),
        guessRow({ kind: "table", settledAt: NOW, reward: 0, rightCount: null, nearCount: null }),
        guessRow({ kind: "upper" }),
      ],
      [],
      [
        { team: 100, count: 2 },
        { team: 101, count: 1 },
      ],
      [{ team: 111, count: 1 }]
    );

    expect(await readSeasonSection("user-1", 2035, NOW)).toEqual({
      seasonId: 2035,
      lockAt: NOW,
      locked: true,
      teams: [],
      guesses: {
        champion: { teams: [100], settled: { kind: "paid", reward: 200, right: 1, near: 0 } },
        last: { teams: [100], settled: { kind: "void" } },
        table: { teams: [100], settled: { kind: "paid", reward: 0, right: 0, near: 0 } },
        upper: { teams: [100], settled: null },
      },
      shares: {
        champion: {
          shares: [
            { teamProviderId: 100, percent: 67 },
            { teamProviderId: 101, percent: 33 },
          ],
          total: 3,
        },
        last: null,
      },
    });
  });
});

describe("readSeasonSection's lock", () => {
  it("shows the season locked at a lock a guess was placed under, earlier than the first kickoff", async () => {
    answer([{ kickoffAt: at(200) }], [{ lockAt: at(-1) }], [guessRow()], [], [], []);

    expect(await readSeasonSection("user-1", 2038, NOW)).toMatchObject({
      lockAt: at(-1),
      locked: true,
    });
  });

  it("keeps the first kickoff as the lock when a stored one is later", async () => {
    answer([{ kickoffAt: at(200) }], [{ lockAt: at(300) }], [], []);

    expect(await readSeasonSection("user-1", 2039, NOW)).toMatchObject({
      lockAt: at(200),
      locked: false,
    });
  });
});

describe("readSeasonSectionOf", () => {
  const PLAYING = { kind: "playing", seasonId: 2036 } as unknown as GameView;

  it("reads the season in play", async () => {
    answer([]);

    expect(await readSeasonSectionOf(PLAYING, "user-1", NOW)).toEqual({
      current: null,
      previous: null,
    });
    expect(state.calls.filter((call) => call.method === "select")).toHaveLength(1);
  });

  it("before the lock also reads the season just finished, for a player who guessed in it", async () => {
    answer(
      [{ kickoffAt: at(10) }],
      NO_LOCK,
      [],
      teamRows(),
      [{ kickoffAt: at(-1000) }],
      NO_LOCK,
      [guessRow({ seasonId: 2035 })],
      teamRows(),
      [],
      []
    );

    expect(await readSeasonSectionOf(PLAYING, "user-1", NOW)).toMatchObject({
      current: { seasonId: 2036, locked: false },
      previous: { seasonId: 2035, locked: true },
    });
  });

  it("before the lock leaves out a season just finished the player did not guess in, shares or not", async () => {
    answer(
      [{ kickoffAt: at(10) }],
      NO_LOCK,
      [],
      teamRows(),
      [{ kickoffAt: at(-1000) }],
      NO_LOCK,
      [],
      teamRows(),
      [{ team: 100, count: 3 }],
      []
    );

    expect(await readSeasonSectionOf(PLAYING, "user-1", NOW)).toMatchObject({
      current: { seasonId: 2036 },
      previous: null,
    });
  });

  it("after the lock reads no season just finished", async () => {
    answer([{ kickoffAt: at(-1) }], NO_LOCK, [guessRow({ seasonId: 2036 })], teamRows(), [], []);

    expect(await readSeasonSectionOf(PLAYING, "user-1", NOW)).toMatchObject({
      current: { seasonId: 2036, locked: true },
      previous: null,
    });
  });

  it("between seasons reads the season just finished for a player", async () => {
    answer([{ kickoffAt: at(-1) }], NO_LOCK, [guessRow({ seasonId: 2036 })], [], [], []);

    expect(
      await readSeasonSectionOf(
        { kind: "between", nextSeasonId: 2037, joined: true, awaiting: [] },
        "user-1",
        NOW
      )
    ).toMatchObject({ current: { seasonId: 2036, locked: true }, previous: null });
  });

  it("reads nothing between seasons for a reader who has not joined, nor without a season or a player", async () => {
    for (const view of [
      { kind: "between", nextSeasonId: 2037, joined: false, awaiting: [] },
      { kind: "no-season", joined: true },
      { kind: "not-joined", seasonId: 2036, grant: 1000 },
    ] as GameView[]) {
      expect(await readSeasonSectionOf(view, "user-1", NOW)).toEqual({
        current: null,
        previous: null,
      });
    }
    expect(state.calls).toEqual([]);
  });

  it("leaves the section out, and logs it, when the read fails", async () => {
    answer(new Error("database down"));

    expect(await readSeasonSectionOf(PLAYING, "user-1", NOW)).toEqual({
      current: null,
      previous: null,
    });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), userId: "user-1" },
      "Reading Arvauspeli season guesses failed"
    );
  });
});

function rows(teams: readonly number[]) {
  return teams.map((teamProviderId, index) => ({ position: index + 1, teamProviderId }));
}

function group(groupId: number, teams: readonly number[], kind = "own-calculated") {
  return kind === "match-list"
    ? { kind, groupId, groupName: `Group ${groupId}`, matches: [] }
    : { kind, groupId, groupName: `Group ${groupId}`, standings: rows(teams) };
}

// A group's matches in today's format, every one finished.
function played(groupId: number, count: number) {
  return Array.from({ length: count }, (_, index) =>
    match({ providerMatchId: groupId * 1000 + index, groupId, status: "FINISHED" })
  );
}

const REGULAR_PLAYED = played(1, 132);
const SPLIT_ONLY = [...played(2, 30), ...played(3, 15)];
const SPLIT_PLAYED = [...REGULAR_PLAYED, ...SPLIT_ONLY];
describe("readSeasonAnswers", () => {
  it("reads no tables while neither part of the season is played", async () => {
    const matches = [match({ status: "FINISHED" }), match(), match({ groupId: 2 })];

    expect(await readSeasonAnswers(2027, 2027, matches)).toEqual({ upper: null, places: null });
    expect(await readSeasonAnswers(2027, 2027, [])).toEqual({ upper: null, places: null });
    expect(standings.getSeasonStandings).not.toHaveBeenCalled();
  });

  it("gives the six once the regular season is played, from the page's own tables", async () => {
    standings.getSeasonStandings.mockResolvedValue({
      status: "ok",
      groups: [group(1, TEAMS), group(2, TEAMS.slice(0, 6))],
      levels: [],
    });

    expect(await readSeasonAnswers(2027, 2028, REGULAR_PLAYED)).toEqual({
      upper: new Set(TEAMS.slice(0, 6)),
      places: null,
    });
    expect(standings.getSeasonStandings).toHaveBeenCalledWith(
      "VL",
      "spljp27",
      2027,
      2028,
      undefined
    );
  });

  it("gives the final places once both groups are played, from TASO's own numbers too", async () => {
    standings.getSeasonStandings.mockResolvedValue({
      status: "ok",
      groups: [
        group(1, TEAMS),
        group(2, [105, 100, 101, 102, 103, 104]),
        group(3, TEAMS.slice(6), "pass-through"),
      ],
      levels: [],
    });

    const answers = await readSeasonAnswers(2027, 2027, SPLIT_PLAYED);

    expect(answers.places?.get(105)).toBe(1);
    expect(answers.places?.get(111)).toBe(12);
    expect(answers.upper).toEqual(new Set(TEAMS.slice(0, 6)));
  });

  it("gives the places alone when only the split is played", async () => {
    standings.getSeasonStandings.mockResolvedValue({
      status: "ok",
      groups: [group(2, TEAMS.slice(0, 6)), group(3, TEAMS.slice(6))],
      levels: [],
    });
    expect(await readSeasonAnswers(2027, 2027, [match(), ...SPLIT_ONLY])).toEqual({
      upper: null,
      places: new Map(TEAMS.map((team, index) => [team, index + 1])),
    });
  });

  it("throws for a due group shown as a match list, or not among the tables", async () => {
    standings.getSeasonStandings.mockResolvedValue({
      status: "ok",
      groups: [group(1, TEAMS, "match-list"), group(2, TEAMS.slice(0, 6))],
      levels: [],
    });

    await expect(readSeasonAnswers(2027, 2027, REGULAR_PLAYED)).rejects.toThrow(
      "Season 2027's group 1 has no table"
    );
    await expect(
      readSeasonAnswers(
        2027,
        2027,
        SPLIT_PLAYED.filter((played) => played.groupId !== 1)
      )
    ).rejects.toThrow("Season 2027's group 3 has no table");
  });

  it("leaves a group with fewer finished matches than its format unplayed", async () => {
    expect(await readSeasonAnswers(2027, 2027, REGULAR_PLAYED.slice(1))).toEqual({
      upper: null,
      places: null,
    });
    expect(
      await readSeasonAnswers(2027, 2027, [...REGULAR_PLAYED.slice(1), ...SPLIT_ONLY.slice(1)])
    ).toEqual({ upper: null, places: null });
    expect(
      await readSeasonAnswers(2027, 2027, [...REGULAR_PLAYED.slice(1), ...SPLIT_ONLY.slice(0, -1)])
    ).toEqual({ upper: null, places: null });
    expect(standings.getSeasonStandings).not.toHaveBeenCalled();
  });

  it("counts a group played with its format's finished matches beside an abandoned one", async () => {
    standings.getSeasonStandings.mockResolvedValue({
      status: "ok",
      groups: [group(1, TEAMS)],
      levels: [],
    });

    expect(
      await readSeasonAnswers(2027, 2027, [
        ...REGULAR_PLAYED,
        match({ providerMatchId: 9999, status: "Abandoned" }),
      ])
    ).toEqual({ upper: new Set(TEAMS.slice(0, 6)), places: null });
  });

  it("reads no tables for a played part no open guess needs", async () => {
    expect(
      await readSeasonAnswers(2027, 2027, REGULAR_PLAYED, { upper: false, places: true })
    ).toEqual({ upper: null, places: null });
    expect(
      await readSeasonAnswers(2027, 2027, [match(), ...SPLIT_ONLY], {
        upper: true,
        places: false,
      })
    ).toEqual({ upper: null, places: null });
    expect(standings.getSeasonStandings).not.toHaveBeenCalled();
  });

  it("throws when the tables cannot be read", async () => {
    standings.getSeasonStandings.mockResolvedValue({ status: "error", groups: [] });

    await expect(readSeasonAnswers(2027, 2027, REGULAR_PLAYED)).rejects.toThrow(
      "Season 2027's tables could not be read"
    );
  });
});

function openGuess(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    userId: "user-1",
    seasonId: 2027,
    kind: "upper",
    teams: TEAMS.slice(0, 6),
    ...overrides,
  };
}

describe("settleSeasonGuesses", () => {
  const SETTLED_LINE = "Arvauspeli season guesses settled";

  it("settles nothing and reads no season with no open season guess, and logs the empty run", async () => {
    answer([]);

    expect(await settleSeasonGuesses(NOW)).toEqual({
      settled: 0,
      rewarded: 0,
      voided: 0,
      failed: [],
    });
    expect(store.latestSeason).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      { settled: 0, rewarded: 0, voided: 0, failed: [] },
      SETTLED_LINE
    );
  });

  it("pays a guess of the six once the regular season is played, and leaves the rest waiting", async () => {
    store.seasonMatches.mockResolvedValue(REGULAR_PLAYED);
    standings.getSeasonStandings.mockResolvedValue({
      status: "ok",
      groups: [group(1, [100, 101, 102, 103, 106, 107, 104, 105, 108, 109, 110, 111])],
      levels: [],
    });
    answer(
      [openGuess(), openGuess({ id: 42, kind: "champion", teams: [100] })],
      PLAYER,
      [{ id: 41 }],
      undefined,
      undefined
    );

    expect(await settleSeasonGuesses(NOW)).toEqual({
      settled: 1,
      rewarded: 1,
      voided: 0,
      failed: [],
    });
    expect(inserted()).toEqual([
      { userId: "user-1", seasonId: 2027, kind: "season-reward", amount: 60, seasonGuessId: 41 },
    ]);
    expect(updated()).toEqual([{ settledAt: NOW, reward: 60, rightCount: 4, nearCount: 0 }]);
    expect(logger.info).toHaveBeenCalledWith(
      { settled: 1, rewarded: 1, voided: 0, failed: [] },
      SETTLED_LINE
    );
  });

  it("settles the champion, the last place and the table by the final places", async () => {
    store.seasonMatches.mockResolvedValue(SPLIT_PLAYED);
    standings.getSeasonStandings.mockResolvedValue({
      status: "ok",
      groups: [group(1, TEAMS), group(2, TEAMS.slice(0, 6)), group(3, TEAMS.slice(6))],
      levels: [],
    });
    answer(
      [
        openGuess({ kind: "champion", teams: [100] }),
        openGuess({ id: 42, kind: "last", teams: [110] }),
        openGuess({ id: 43, kind: "table", teams: TEAMS }),
      ],
      ...[41, 42, 43].flatMap((id) => [PLAYER, [{ id }], undefined, undefined])
    );

    expect(await settleSeasonGuesses(NOW)).toEqual({
      settled: 3,
      rewarded: 2,
      voided: 0,
      failed: [],
    });
    expect(inserted()).toEqual([
      expect.objectContaining({ kind: "season-reward", amount: 200, seasonGuessId: 41 }),
      expect.objectContaining({ kind: "season-reward", amount: 0, seasonGuessId: 42 }),
      expect.objectContaining({ kind: "season-reward", amount: 360, seasonGuessId: 43 }),
    ]);
    expect(updated()[2]).toEqual({ settledAt: NOW, reward: 360, rightCount: 12, nearCount: 0 });
  });

  it("voids a guess still open once a later season is stored, refunding what it paid", async () => {
    store.latestSeason.mockResolvedValue(2028);
    answer(
      [openGuess({ kind: "table" })],
      PLAYER,
      [{ id: 41 }],
      [{ amount: -100 }],
      undefined,
      undefined
    );

    expect(await settleSeasonGuesses(NOW)).toEqual({
      settled: 1,
      rewarded: 0,
      voided: 1,
      failed: [],
    });
    expect(inserted()).toEqual([
      { userId: "user-1", seasonId: 2027, kind: "season-refund", amount: 100, seasonGuessId: 41 },
    ]);
    expect(updated()).toEqual([{ settledAt: NOW }]);
  });

  it("refunds nothing for a voided guess with no price paid", async () => {
    store.latestSeason.mockResolvedValue(2028);
    answer([openGuess()], PLAYER, [{ id: 41 }], [], undefined, undefined);

    await settleSeasonGuesses(NOW);

    const [refund] = inserted() as Array<{ kind: string; amount: number }>;
    expect(refund?.kind).toBe("season-refund");
    expect(refund?.amount).toBe(0);
  });

  it("leaves a guess waiting while its answer is not in and no later season is stored", async () => {
    store.latestSeason.mockResolvedValue(null);
    answer([openGuess()]);

    expect(await settleSeasonGuesses(NOW)).toEqual({
      settled: 0,
      rewarded: 0,
      voided: 0,
      failed: [],
    });
    expect(store.seasonMatches).toHaveBeenCalledWith(expect.anything(), 2027);
  });

  it("locks the player before the guess's row, as a match's settling does", async () => {
    store.latestSeason.mockResolvedValue(2028);
    answer([openGuess()], PLAYER, [{ id: 41 }], [{ amount: -50 }], undefined, undefined);

    await settleSeasonGuesses(NOW);

    const locks = state.calls.filter(
      (call) => call.method === "from" || (call.method === "for" && call.args[0] !== undefined)
    );
    const order = locks.map((call) =>
      call.method === "for" ? `for ${String(call.args[0])}` : call.args[0]
    );
    const share = order.indexOf("for share");
    const update = order.indexOf("for update");
    expect(share).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(share);
    expect(order[share - 1]).toBe(gamePlayer);
    expect(order[update - 1]).toBe(gameSeasonGuess);
  });

  it("skips a guess another run settled first", async () => {
    store.latestSeason.mockResolvedValue(2028);
    answer([openGuess()], PLAYER, []);

    expect(await settleSeasonGuesses(NOW)).toMatchObject({ settled: 0, voided: 0 });
    expect(inserted()).toEqual([]);
  });

  it("names a guess that fails to settle, logs it, and settles the others", async () => {
    store.latestSeason.mockResolvedValue(2028);
    answer(
      [openGuess(), openGuess({ id: 42 })],
      new Error("database down"),
      PLAYER,
      [{ id: 42 }],
      [{ amount: -50 }],
      undefined,
      undefined
    );

    expect(await settleSeasonGuesses(NOW)).toEqual({
      settled: 1,
      rewarded: 0,
      voided: 1,
      failed: [41],
    });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), seasonGuessId: 41 },
      "Unable to settle an Arvauspeli season guess"
    );
  });

  it("names a season's guesses when its matches cannot be read, and settles the next season", async () => {
    store.seasonMatches.mockImplementation(async (_client: unknown, seasonId: number) => {
      if (seasonId === 2026) throw new Error("database down");
      return REGULAR_PLAYED;
    });
    standings.getSeasonStandings.mockResolvedValue({
      status: "ok",
      groups: [group(1, TEAMS)],
      levels: [],
    });
    answer(
      [openGuess({ seasonId: 2026 }), openGuess({ id: 42 })],
      PLAYER,
      [{ id: 42 }],
      undefined,
      undefined
    );

    expect(await settleSeasonGuesses(NOW)).toEqual({
      settled: 1,
      rewarded: 1,
      voided: 0,
      failed: [41],
    });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), seasonId: 2026 },
      "Reading an Arvauspeli season's answers failed"
    );
  });

  it("with a later season stored and the tables unreadable, retries a due guess and voids one not due", async () => {
    store.latestSeason.mockResolvedValue(2028);
    store.seasonMatches.mockResolvedValue(REGULAR_PLAYED);
    standings.getSeasonStandings.mockResolvedValue({ status: "error", groups: [] });
    // The six are due, the regular season played; the champion is not, the split unplayed.
    answer(
      [openGuess(), openGuess({ id: 42, kind: "champion", teams: [100] })],
      PLAYER,
      [{ id: 42 }],
      [{ amount: -50 }],
      undefined,
      undefined
    );

    expect(await settleSeasonGuesses(NOW)).toEqual({
      settled: 1,
      rewarded: 0,
      voided: 1,
      failed: [41],
    });
    expect(inserted()).toEqual([
      { userId: "user-1", seasonId: 2027, kind: "season-refund", amount: 50, seasonGuessId: 42 },
    ]);
  });

  it("reads no tables when the open guesses need no part that is played", async () => {
    store.seasonMatches.mockResolvedValue(REGULAR_PLAYED);
    answer([openGuess({ kind: "champion", teams: [100] }), openGuess({ id: 42, kind: "table" })]);

    expect(await settleSeasonGuesses(NOW)).toEqual({
      settled: 0,
      rewarded: 0,
      voided: 0,
      failed: [],
    });
    expect(standings.getSeasonStandings).not.toHaveBeenCalled();
  });

  it("reads no tables for a played split when only guesses of the six are open", async () => {
    store.seasonMatches.mockResolvedValue([match(), ...SPLIT_ONLY]);
    answer([openGuess()]);

    expect(await settleSeasonGuesses(NOW)).toMatchObject({ settled: 0, failed: [] });
    expect(standings.getSeasonStandings).not.toHaveBeenCalled();
  });

  it("leaves a guess of the six waiting, not failed, when the split's tables cannot be read before the regular season is played", async () => {
    store.seasonMatches.mockResolvedValue([match(), ...SPLIT_ONLY]);
    standings.getSeasonStandings.mockResolvedValue({ status: "error", groups: [] });
    answer([openGuess(), openGuess({ id: 42, kind: "champion", teams: [100] })]);

    expect(await settleSeasonGuesses(NOW)).toEqual({
      settled: 0,
      rewarded: 0,
      voided: 0,
      failed: [42],
    });
  });

  it("names only the due guesses when the tables cannot be read, logs it, and leaves one not due waiting", async () => {
    store.seasonMatches.mockResolvedValue(REGULAR_PLAYED);
    standings.getSeasonStandings.mockResolvedValue({ status: "error", groups: [] });
    // The six are due, the regular season played; the champion is not, and
    // with no later season stored it neither fails nor settles.
    answer([openGuess(), openGuess({ id: 42, kind: "champion", teams: [100] })]);

    expect(await settleSeasonGuesses(NOW)).toEqual({
      settled: 0,
      rewarded: 0,
      voided: 0,
      failed: [41],
    });
    expect(inserted()).toEqual([]);
    expect(updated()).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), seasonId: 2027 },
      "Reading an Arvauspeli season's answers failed"
    );
  });
});
