import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompetitionScope } from "@/lib/head-to-head";
import type { MatchSource } from "@/lib/match-source";
import { warmModules } from "../../support/warm-module";

/**
 * The queries themselves are exercised against a real Postgres in
 * `tests/integration/match.test.ts` — that is where the SQL is proved. These
 * cover the decisions made *around* the queries in TypeScript: the scope
 * predicate applied to a returned row, the placeholder short-circuit, and the
 * two failure paths, which no integration test can trigger on demand.
 */

const selectMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => {
          const builder = {
            limit: () => selectMock(...args),
            /**
             * Every head-to-head read — the full history, and the match page's
             * five taken from it (specs/042) — ends at `.orderBy(...)`.
             */
            orderBy: () => ({
              /** A team's latest five (specs/047) end at `.orderBy(...).limit(...)`. */
              limit: () => Promise.resolve().then(() => selectMock(...args)),
              // biome-ignore lint/suspicious/noThenProperty: drizzle's query builder is itself a thenable — awaiting it is what runs the query — so a stand-in for it has to be one too
              then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
                Promise.resolve()
                  .then(() => selectMock(...args))
                  .then(resolve, reject),
            }),
            /** The competition averages (specs/044) are awaited straight after `.where(...)`. */
            // biome-ignore lint/suspicious/noThenProperty: drizzle's query builder is itself a thenable — awaiting it is what runs the query — so a stand-in for it has to be one too
            then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
              Promise.resolve()
                .then(() => selectMock(...args))
                .then(resolve, reject),
          };
          return builder;
        },
      }),
    }),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerErrorMock },
}));

const DOMESTIC: MatchSource = { kind: "taso", bucket: "domestic" };
const NATIONAL: MatchSource = { kind: "taso", bucket: "national" };
const FOREIGN: MatchSource = { kind: "football-data", region: "foreign" };

function tasoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    providerMatchId: 4036979,
    competitionCode: "spljp26",
    categoryId: "VL",
    seasonId: 2026,
    groupId: 1,
    groupName: "Mestaruussarja",
    kickoffAt: new Date("2026-08-31T16:00:00Z"),
    matchday: 22,
    status: "FINISHED",
    winner: null,
    homeTeamProviderId: 60901,
    homeTeamName: "VPS",
    awayTeamProviderId: 60969,
    awayTeamName: "FC Lahti",
    homeGoals: 2,
    awayGoals: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function footballDataRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    providerMatchId: 497001,
    competitionCode: "PL",
    seasonId: 2025,
    kickoffAt: new Date("2026-02-14T15:00:00Z"),
    matchday: 26,
    status: "FINISHED",
    stage: "REGULAR_SEASON",
    groupName: null,
    regularTimeHome: null,
    regularTimeAway: null,
    extraTimeHome: null,
    extraTimeAway: null,
    penaltiesHome: null,
    penaltiesAway: null,
    homeTeamProviderId: 57,
    homeTeamName: "Arsenal FC",
    awayTeamProviderId: 61,
    awayTeamName: "Chelsea FC",
    homeGoals: 2,
    awayGoals: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function load() {
  const module = await import("@/lib/match-service");
  return module.getMatchPageData;
}

warmModules(() => import("@/lib/match-service"));

describe("getMatchPageData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns the match and its meetings", async () => {
    const meeting = tasoRow({
      id: 2,
      providerMatchId: 4000001,
      kickoffAt: new Date("2026-05-01T15:00:00Z"),
    });
    selectMock.mockResolvedValueOnce([tasoRow()]).mockResolvedValueOnce([meeting]);
    const getMatchPageData = await load();

    const result = await getMatchPageData(DOMESTIC, 4036979);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.match.source).toBe("taso");
    expect(result.headToHead).toEqual({ status: "ok", matches: [meeting], total: 1 });
  });

  it("lists five meetings before kickoff and counts the whole history they came from", async () => {
    // One read serves both: the link's count is the length of the history the
    // full page lists (specs/042, S10), and the five are taken from it.
    const at = (month: number) => new Date(Date.UTC(2026, month, 1, 15));
    const later = tasoRow({ providerMatchId: 4000009, kickoffAt: at(9) });
    const itself = tasoRow();
    const earlier = [7, 6, 5, 4, 3, 2].map((month) =>
      tasoRow({ providerMatchId: 4000000 + month, kickoffAt: at(month) })
    );
    selectMock.mockResolvedValueOnce([itself]).mockResolvedValueOnce([later, itself, ...earlier]);
    const getMatchPageData = await load();

    const result = await getMatchPageData(DOMESTIC, 4036979);

    if (result.status !== "ok") throw new Error("expected the match to render");
    expect(result.headToHead).toEqual({ status: "ok", matches: earlier.slice(0, 5), total: 8 });
    // Two calls: the lookup and the one history read. No second read to count.
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it("answers not_found when nothing is stored under that id", async () => {
    selectMock.mockResolvedValueOnce([]);
    const getMatchPageData = await load();

    expect(await getMatchPageData(DOMESTIC, 4036979)).toEqual({ status: "not_found" });
  });

  it("answers not_found for a national-team row asked for under /kotimaa", async () => {
    selectMock.mockResolvedValueOnce([tasoRow({ competitionCode: "maajp2026" })]);
    const getMatchPageData = await load();

    expect(await getMatchPageData(DOMESTIC, 4036979)).toEqual({ status: "not_found" });
  });

  it("answers not_found for a domestic row asked for under a national-team route", async () => {
    selectMock.mockResolvedValueOnce([tasoRow()]);
    const getMatchPageData = await load();

    expect(await getMatchPageData(NATIONAL, 4036979)).toEqual({ status: "not_found" });
  });

  it("answers not_found for a competition outside the route's region", async () => {
    selectMock.mockResolvedValueOnce([footballDataRow({ competitionCode: "WC" })]);
    const getMatchPageData = await load();

    expect(await getMatchPageData(FOREIGN, 497001)).toEqual({ status: "not_found" });
  });

  it("finds a football-data row inside its own region", async () => {
    selectMock.mockResolvedValueOnce([footballDataRow()]).mockResolvedValueOnce([]);
    const getMatchPageData = await load();

    const result = await getMatchPageData(FOREIGN, 497001);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.match.source).toBe("football-data");
  });

  it("skips the head-to-head for a placeholder team rather than querying", async () => {
    selectMock.mockResolvedValueOnce([tasoRow({ homeTeamProviderId: 0, homeTeamName: "" })]);
    const getMatchPageData = await load();

    const result = await getMatchPageData(DOMESTIC, 4036979);

    if (result.status !== "ok") throw new Error("expected the match to render");
    expect(result.headToHead).toEqual({ status: "unavailable" });
    // One call: the lookup. The pair query never ran.
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("queries the national bucket for a national-team match", async () => {
    const row = tasoRow({ competitionCode: "maajp2026", categoryId: "UNL" });
    selectMock.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    const getMatchPageData = await load();

    const result = await getMatchPageData(NATIONAL, 4036979);

    expect(result.status).toBe("ok");
    // Two calls: the lookup, then the pair query under the other predicate.
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it("skips a football-data head-to-head for a placeholder team too", async () => {
    // `matches` carries no such row today; the rule is the provider's, not the
    // table's, so it holds on both sides.
    selectMock.mockResolvedValueOnce([
      footballDataRow({ awayTeamProviderId: 0, awayTeamName: "" }),
    ]);
    const getMatchPageData = await load();

    const result = await getMatchPageData(FOREIGN, 497001);

    if (result.status !== "ok") throw new Error("expected the match to render");
    expect(result.headToHead).toEqual({ status: "unavailable" });
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("refuses an id too large for the column without querying at all", async () => {
    // The same door as the team page's: an out-of-range parameter fails at bind
    // time, which reaches the reader as an error rather than a not-found.
    const getMatchPageData = await load();

    expect(await getMatchPageData(DOMESTIC, 99999999999)).toEqual({ status: "not_found" });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("answers error, and logs, when the lookup throws", async () => {
    selectMock.mockRejectedValueOnce(new Error("connection refused"));
    const getMatchPageData = await load();

    expect(await getMatchPageData(DOMESTIC, 4036979)).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerMatchId: 4036979 }),
      "Unable to load the match"
    );
  });

  it("keeps the match when only the head-to-head throws", async () => {
    selectMock
      .mockResolvedValueOnce([tasoRow()])
      .mockRejectedValueOnce(new Error("connection refused"));
    const getMatchPageData = await load();

    const result = await getMatchPageData(DOMESTIC, 4036979);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.headToHead).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.anything(),
      "Unable to load the head-to-head"
    );
  });
});

/**
 * The full history behind specs/042. Its SQL is proved in
 * `tests/integration/match.test.ts`; these are the decisions made around it.
 */
describe("getHeadToHeadHistory", () => {
  it("has no history for a team against itself, and asks nothing", async () => {
    const { getHeadToHeadHistory } = await import("@/lib/match-service");

    expect(await getHeadToHeadHistory(DOMESTIC, 7, 7)).toEqual({ status: "unavailable" });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("returns the rows a source's own table holds", async () => {
    selectMock.mockReturnValue([tasoRow({ providerMatchId: 1 })]);
    const { getHeadToHeadHistory } = await import("@/lib/match-service");

    const result = await getHeadToHeadHistory(DOMESTIC, 1, 2);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.matches).toHaveLength(1);
  });

  it("reads football-data's table for a football-data source", async () => {
    selectMock.mockReturnValue([]);
    const { getHeadToHeadHistory } = await import("@/lib/match-service");

    expect(await getHeadToHeadHistory(FOREIGN, 1, 2)).toEqual({ status: "ok", matches: [] });
  });

  it("reads the national bucket without crossing into the domestic one", async () => {
    selectMock.mockReturnValue([]);
    const { getHeadToHeadHistory } = await import("@/lib/match-service");

    expect(await getHeadToHeadHistory(NATIONAL, 1, 2)).toEqual({ status: "ok", matches: [] });
  });

  it("reports a failed read as an error rather than as no meetings", async () => {
    // An empty list would claim these teams have never met.
    selectMock.mockImplementation(() => {
      throw new Error("connection lost");
    });
    const { getHeadToHeadHistory } = await import("@/lib/match-service");

    expect(await getHeadToHeadHistory(DOMESTIC, 1, 2)).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});

describe("getCompetitionAverages (specs/044)", () => {
  beforeEach(() => {
    selectMock.mockReset();
    loggerErrorMock.mockReset();
  });

  const PL = {
    key: "PL",
    scope: { kind: "football-data", competitionCode: "PL", seasonIds: [2024] },
  } satisfies { key: string; scope: CompetitionScope };
  const LC = {
    key: "LC",
    scope: {
      kind: "taso",
      seasons: [
        { competitionId: "Liigacup25", categoryId: "LC" },
        { competitionId: "Liigacup23", categoryId: "LC2023" },
      ],
    },
  } satisfies { key: string; scope: CompetitionScope };

  it("attaches each competition's own average to its group, from either provider", async () => {
    const { getCompetitionAverages } = await import("@/lib/match-service");
    selectMock
      .mockResolvedValueOnce([{ home: 1.6, away: 1.2 }])
      .mockResolvedValueOnce([{ home: 2.25, away: 0.75 }]);

    await expect(getCompetitionAverages([PL, LC])).resolves.toEqual({
      status: "ok",
      rows: [
        { ...PL, competition: { home: 1.6, away: 1.2 } },
        { ...LC, competition: { home: 2.25, away: 0.75 } },
      ],
    });
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it("reports a competition with no finished match as a failure, not as 0,0 – 0,0", async () => {
    // The pair's own meetings are in every scope; an empty one means the two
    // reads disagree about what counts.
    const { getCompetitionAverages } = await import("@/lib/match-service");
    selectMock.mockResolvedValueOnce([{ home: null, away: null }]);

    await expect(getCompetitionAverages([PL])).resolves.toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Unable to read the competition averages"
    );
  });

  it.each([
    ["no row at all", []],
    ["a row with only one side", [{ home: 1.5, away: null }]],
  ])("treats %s as the same failure", async (_name, rows) => {
    const { getCompetitionAverages } = await import("@/lib/match-service");
    selectMock.mockResolvedValueOnce(rows);

    await expect(getCompetitionAverages([LC])).resolves.toEqual({ status: "error" });
  });

  it("turns a database failure into its own case (S10)", async () => {
    const { getCompetitionAverages } = await import("@/lib/match-service");
    selectMock.mockRejectedValueOnce(new Error("connection reset"));

    await expect(getCompetitionAverages([PL])).resolves.toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});

describe("getWorstOpponents (specs/045)", () => {
  beforeEach(() => {
    selectMock.mockReset();
    loggerErrorMock.mockReset();
  });

  const CLUB = 60901;
  const KUPS = 60969;

  /** Three meetings with one opponent, the club losing each: enough to count (S2). */
  function lostThree() {
    return [1, 2, 3].map((n) =>
      tasoRow({
        providerMatchId: n,
        kickoffAt: new Date(Date.UTC(2026, 4, 10 - n)),
        homeTeamProviderId: CLUB,
        homeTeamName: "VPS",
        awayTeamProviderId: KUPS,
        awayTeamName: "KuPS",
        homeGoals: 0,
        awayGoals: 1,
      })
    );
  }

  it.each([
    ["a TASO national-team page", NATIONAL],
    ["a football-data national-team page", { kind: "football-data", region: "national-teams" }],
  ] as const)("has no panel on %s, and asks nothing (S5)", async (_name, source) => {
    const { getWorstOpponents } = await import("@/lib/match-service");

    await expect(getWorstOpponents(source, CLUB, "/maajoukkueet")).resolves.toEqual({
      status: "unavailable",
    });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("names a club's worst opponents, each linking to its head-to-head", async () => {
    const { getWorstOpponents } = await import("@/lib/match-service");
    selectMock.mockResolvedValueOnce(lostThree());

    const series = await getWorstOpponents(DOMESTIC, CLUB, "/kotimaa");

    expect(series).toMatchObject({
      status: "ok",
      rows: [
        {
          opponentProviderId: KUPS,
          opponentName: "KuPS",
          played: 3,
          losses: 3,
          pointsPerMatch: 0,
          href: `/kotimaa/kohtaamiset/${CLUB}/${KUPS}`,
        },
      ],
      windowSentence: "Perustuu kaudesta 2015 alkaen tallennettuihin otteluihin.",
    });
  });

  it("reads football-data's clubs too, stating that source's window", async () => {
    const { getWorstOpponents } = await import("@/lib/match-service");
    selectMock.mockResolvedValueOnce([]);

    const series = await getWorstOpponents(FOREIGN, CLUB, "/ulkomaat");

    expect(series).toMatchObject({ status: "ok", rows: [] });
    expect(series.status === "ok" ? series.windowSentence : "").toMatch(
      /^Perustuu kaudesta \d{4}\/\d{2} alkaen/
    );
  });

  it("turns a failed read into its own case, not an empty list", async () => {
    const { getWorstOpponents } = await import("@/lib/match-service");
    selectMock.mockRejectedValueOnce(new Error("connection reset"));

    await expect(getWorstOpponents(DOMESTIC, CLUB, "/kotimaa")).resolves.toEqual({
      status: "error",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), team: CLUB }),
      "Unable to read the club's opponents"
    );
  });
});

describe("getTeamForm (specs/047)", () => {
  beforeEach(() => {
    selectMock.mockReset();
    loggerErrorMock.mockReset();
  });

  const TEAM = 60901;

  /** Five results for TEAM, newest first as the read returns them: W D L W W, oldest first. */
  function five() {
    const scores: Array<[number, number]> = [
      [2, 0],
      [3, 1],
      [0, 1],
      [1, 1],
      [2, 1],
    ];
    return scores.map(([own, other], index) =>
      tasoRow({
        providerMatchId: 500 + index,
        kickoffAt: new Date(Date.UTC(2026, 8, 20 - index)),
        homeTeamProviderId: TEAM,
        homeGoals: own,
        awayGoals: other,
      })
    );
  }

  it("reads the team's latest five within the source and gives their form, oldest first", async () => {
    const { getTeamForm } = await import("@/lib/match-service");
    selectMock.mockResolvedValueOnce(five());

    const form = await getTeamForm(DOMESTIC, TEAM);

    expect(form.status === "ok" ? form.entries.map((e) => e.result) : []).toEqual([
      "V",
      "T",
      "H",
      "V",
      "V",
    ]);
    // 3 + 1 + 0 + 3 + 3 = 10 over five.
    expect(form).toMatchObject({ status: "ok", pointsPerMatch: 2 });
    expect(form.status === "ok" ? form.latest : null).toEqual(new Date(Date.UTC(2026, 8, 20)));
  });

  it("reads football-data's the same way", async () => {
    const { getTeamForm } = await import("@/lib/match-service");
    selectMock.mockResolvedValueOnce([]);

    await expect(getTeamForm(FOREIGN, TEAM)).resolves.toEqual({ status: "too-few" });
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("turns a failed read into its own case, never too few", async () => {
    const { getTeamForm } = await import("@/lib/match-service");
    selectMock.mockRejectedValueOnce(new Error("connection reset"));

    await expect(getTeamForm(DOMESTIC, TEAM)).resolves.toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), team: TEAM }),
      "Unable to read the team's latest matches"
    );
  });
});
