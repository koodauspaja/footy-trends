import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredMatch } from "@/lib/match-service";

/**
 * The service's decisions around its queries: the first stored season answered
 * without a prediction read, which season is in progress, a match's score
 * with the shoot-out taken out, and each failure as its own case. The joins
 * are proved against Postgres in `tests/integration/surprise.test.ts`.
 *
 * decisions/057-surprise-index.md
 * decisions/066-season-summary.md
 */

const mocks = vi.hoisted(() => ({
  seasonRows: vi.fn(),
  joined: vi.fn(),
  matchRow: vi.fn(),
  getPlayedSeasons: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        // A season's list is a join; a match's figure is one row by its key.
        // The joined table says which provider's query ran.
        innerJoin: (table: unknown) => {
          mocks.joined(table);
          return { where: () => Promise.resolve().then(mocks.seasonRows) };
        },
        where: () => ({ limit: () => Promise.resolve().then(mocks.matchRow) }),
      }),
    }),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));
vi.mock("@/lib/match-service", () => ({
  FOOTBALL_DATA_HOME_GOALS: "home",
  FOOTBALL_DATA_AWAY_GOALS: "away",
  getPlayedSeasons: mocks.getPlayedSeasons,
}));

import { matches, tasoMatches } from "@/db/schema";
import { getMatchSurprise, getSeasonSurprises, getTeamUpset } from "@/lib/surprise-service";

function predicted(overrides: Record<string, unknown> = {}) {
  return {
    providerMatchId: 1,
    kickoffAt: new Date("2026-04-04T14:00:00Z"),
    homeTeamProviderId: 10,
    homeTeamName: "Ilves",
    awayTeamProviderId: 20,
    awayTeamName: "HJK",
    homeGoals: 3,
    awayGoals: 0,
    home: 0.06,
    draw: 0.25,
    away: 0.69,
    ...overrides,
  };
}

function stored(source: "football-data" | "taso", overrides: Record<string, unknown> = {}) {
  return {
    source,
    match: {
      providerMatchId: 77,
      status: "FINISHED",
      homeGoals: 2,
      awayGoals: 1,
      penaltiesHome: null,
      penaltiesAway: null,
      ...overrides,
    },
  } as unknown as StoredMatch;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.seasonRows.mockReset();
  mocks.matchRow.mockReset();
  mocks.getPlayedSeasons.mockReset().mockResolvedValue([2023, 2024, 2025, 2026]);
});

describe("getSeasonSurprises", () => {
  it("lists a football-data season's surprises", async () => {
    mocks.seasonRows.mockResolvedValueOnce([predicted()]);

    const result = await getSeasonSurprises("football-data", "PL", 2025, 2026);

    expect(mocks.getPlayedSeasons).toHaveBeenCalledWith("football-data", "PL");
    expect(result).toMatchObject({
      status: "ok",
      inProgress: false,
      surprises: [{ providerMatchId: 1, probability: 0.06 }],
    });
  });

  it("lists a TASO season's surprises, a row without both scores dropped", async () => {
    mocks.seasonRows.mockResolvedValueOnce([
      predicted({ providerMatchId: 5 }),
      predicted({ providerMatchId: 6, homeGoals: null }),
      predicted({ providerMatchId: 7, awayGoals: null }),
    ]);

    const result = await getSeasonSurprises("taso", "VL", 2025, 2026);

    expect(mocks.getPlayedSeasons).toHaveBeenCalledWith("taso", "VL");
    expect(result.status === "ok" && result.surprises.map((s) => s.providerMatchId)).toEqual([5]);
  });

  it("marks the active season as in progress", async () => {
    mocks.seasonRows.mockResolvedValueOnce([predicted()]);

    await expect(getSeasonSurprises("taso", "VL", 2026, 2026)).resolves.toMatchObject({
      status: "ok",
      inProgress: true,
    });
  });

  it("answers the competition's first stored season without reading a prediction", async () => {
    await expect(getSeasonSurprises("football-data", "PL", 2023, 2026)).resolves.toEqual({
      status: "first-season",
    });
    expect(mocks.seasonRows).not.toHaveBeenCalled();
  });

  it("has nothing to list for a competition with nothing stored", async () => {
    mocks.getPlayedSeasons.mockResolvedValueOnce([]);
    mocks.seasonRows.mockResolvedValueOnce([]);

    await expect(getSeasonSurprises("taso", "VL", 2026, 2026)).resolves.toEqual({
      status: "empty",
      inProgress: true,
    });
  });

  it("says a season with played matches but no stored prediction has none predicted", async () => {
    mocks.seasonRows.mockResolvedValueOnce([]);

    await expect(getSeasonSurprises("taso", "VL", 2026, 2026)).resolves.toEqual({
      status: "unpredicted",
      inProgress: true,
    });
  });

  it("says a season with no played match has none played", async () => {
    mocks.getPlayedSeasons.mockResolvedValueOnce([2023, 2024]);
    mocks.seasonRows.mockResolvedValueOnce([]);

    await expect(getSeasonSurprises("taso", "VL", 2026, 2026)).resolves.toEqual({
      status: "empty",
      inProgress: true,
    });
  });

  it("turns a failed prediction read into its own case, and logs it", async () => {
    mocks.seasonRows.mockRejectedValueOnce(new Error("connection reset"));

    await expect(getSeasonSurprises("taso", "VL", 2025, 2026)).resolves.toEqual({
      status: "error",
    });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: expect.any(Error), source: "taso", code: "VL", seasonId: 2025 },
      "Unable to read the season's surprises"
    );
  });

  it("turns a failed season read into the same case", async () => {
    mocks.getPlayedSeasons.mockRejectedValueOnce(new Error("connection reset"));

    await expect(getSeasonSurprises("football-data", "PL", 2025, 2026)).resolves.toEqual({
      status: "error",
    });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
  });
});

describe("getTeamUpset", () => {
  it("is the team's own win in its competition-season, read from its provider", async () => {
    mocks.seasonRows.mockResolvedValueOnce([
      predicted({ providerMatchId: 1, home: 0.3 }),
      // Lost by the team, so not its upset, however unlikely.
      predicted({ providerMatchId: 2, homeGoals: 0, awayGoals: 1, away: 0.04 }),
      predicted({ providerMatchId: 3, home: 0.12 }),
    ]);

    await expect(getTeamUpset("taso", "VL", 2025, 10)).resolves.toMatchObject({
      providerMatchId: 3,
      probability: 0.12,
    });
    expect(mocks.getPlayedSeasons).toHaveBeenCalledWith("taso", "VL");
    expect(mocks.joined).toHaveBeenCalledWith(tasoMatches);
  });

  it("reads a football-data season too", async () => {
    // Won away by team 99, at 21 %.
    mocks.seasonRows.mockResolvedValueOnce([
      predicted({ awayTeamProviderId: 99, homeGoals: 0, awayGoals: 2, away: 0.21 }),
    ]);

    await expect(getTeamUpset("football-data", "PL", 2025, 99)).resolves.toMatchObject({
      providerMatchId: 1,
      awayTeamProviderId: 99,
      probability: 0.21,
    });
    expect(mocks.getPlayedSeasons).toHaveBeenCalledWith("football-data", "PL");
    expect(mocks.joined).toHaveBeenCalledWith(matches);
  });

  it("has none in the competition's first stored season, and reads no prediction", async () => {
    await expect(getTeamUpset("taso", "VL", 2023, 10)).resolves.toBeNull();
    expect(mocks.seasonRows).not.toHaveBeenCalled();
  });

  it("throws a failed read for its caller to log", async () => {
    mocks.seasonRows.mockRejectedValueOnce(new Error("connection reset"));

    await expect(getTeamUpset("taso", "VL", 2025, 10)).rejects.toThrow("connection reset");
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});

describe("getMatchSurprise", () => {
  const row = { home: 0.08, draw: 0.25, away: 0.67 };

  it("reads the probability Elo gave a home win", async () => {
    mocks.matchRow.mockResolvedValueOnce([row]);

    await expect(getMatchSurprise(stored("taso"))).resolves.toBe(0.08);
  });

  it("reads the probability Elo gave an away win", async () => {
    mocks.matchRow.mockResolvedValueOnce([row]);

    await expect(
      getMatchSurprise(stored("football-data", { homeGoals: 0, awayGoals: 1 }))
    ).resolves.toBe(0.67);
  });

  it("has no figure for a match Elo has no row for", async () => {
    mocks.matchRow.mockResolvedValueOnce([]);

    await expect(getMatchSurprise(stored("taso"))).resolves.toBeNull();
  });

  it("reads nothing for a draw", async () => {
    await expect(
      getMatchSurprise(stored("taso", { homeGoals: 1, awayGoals: 1 }))
    ).resolves.toBeNull();
    expect(mocks.matchRow).not.toHaveBeenCalled();
  });

  it("counts a football-data shoot-out as the draw it was", async () => {
    // Stored as 5–4: 1–1 after extra time, 4–3 on penalties.
    const shootout = stored("football-data", {
      homeGoals: 5,
      awayGoals: 4,
      penaltiesHome: 4,
      penaltiesAway: 3,
    });

    await expect(getMatchSurprise(shootout)).resolves.toBeNull();
    expect(mocks.matchRow).not.toHaveBeenCalled();
  });

  it("keeps the stored score when only half a shoot-out is stored", async () => {
    mocks.matchRow.mockResolvedValue([row]);

    await expect(
      getMatchSurprise(stored("football-data", { penaltiesHome: 4, penaltiesAway: null }))
    ).resolves.toBe(0.08);
    await expect(
      getMatchSurprise(stored("football-data", { penaltiesHome: null, penaltiesAway: 4 }))
    ).resolves.toBe(0.08);
  });

  it("reads nothing for a match that is not finished, or has no score", async () => {
    await expect(getMatchSurprise(stored("taso", { status: "TIMED" }))).resolves.toBeNull();
    await expect(getMatchSurprise(stored("taso", { homeGoals: null }))).resolves.toBeNull();
    await expect(getMatchSurprise(stored("taso", { awayGoals: null }))).resolves.toBeNull();
    expect(mocks.matchRow).not.toHaveBeenCalled();
  });

  it("shows nothing when the read fails, and logs it", async () => {
    mocks.matchRow.mockRejectedValueOnce(new Error("connection reset"));

    await expect(getMatchSurprise(stored("football-data"))).resolves.toBeNull();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: expect.any(Error), source: "football-data", providerMatchId: 77 },
      "Unable to read the match's surprise"
    );
  });
});
