import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { tasoMatches } from "@/db/schema";
import { calculateStandings } from "@/lib/standings";
import type { NormalizedTasoMatch } from "@/lib/taso";

vi.mock("@/lib/taso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso")>();
  return { ...actual, getSeasonMatches: vi.fn(), getSeasonGroups: vi.fn() };
});

const competitionId = "spljp990001";
const seasonId = 990001;
/** Makes `seasonId` a completed past season rather than the one being played. */
const laterActiveSeasonId = seasonId + 1;

const CATEGORY_ID = "VL";

/** Narrows to matches with a final score, mirroring standings-service.ts's own filter. */
function toFinishedMatches<T extends { homeGoals: number | null; awayGoals: number | null }>(
  rows: T[]
): Array<T & { homeGoals: number; awayGoals: number }> {
  return rows.filter(
    (row): row is T & { homeGoals: number; awayGoals: number } =>
      row.homeGoals !== null && row.awayGoals !== null
  );
}

function buildMatch(overrides: Partial<NormalizedTasoMatch> = {}): NormalizedTasoMatch {
  return {
    providerMatchId: 900001,
    competitionCode: competitionId,
    categoryId: CATEGORY_ID,
    seasonId,
    groupId: 1,
    groupName: "Runkosarja",
    status: "FINISHED",
    kickoffAt: new Date("2026-08-01T15:00:00Z"),
    matchday: 1,
    homeTeamProviderId: 9001,
    homeTeamName: "Integration United",
    awayTeamProviderId: 9002,
    awayTeamName: "Integration City",
    homeGoals: 2,
    awayGoals: 1,
    winner: null,
    ...overrides,
  };
}

/** Scoped by season + competition, so it clears every category's fixtures alike. */
async function clearFixtures() {
  await db
    .delete(tasoMatches)
    .where(and(eq(tasoMatches.seasonId, seasonId), eq(tasoMatches.competitionCode, competitionId)));
}

describe("taso integration", () => {
  beforeEach(clearFixtures);

  afterEach(async () => {
    await clearFixtures();
    vi.clearAllMocks();
  });

  it("persists synchronized matches, readable back with the same shape calculateStandings expects", async () => {
    const { synchronizeMatches } = await import("@/lib/taso-standings-service");
    const providerMatches = [buildMatch()];

    await synchronizeMatches(providerMatches);
    const stored = await db
      .select()
      .from(tasoMatches)
      .where(
        and(eq(tasoMatches.competitionCode, competitionId), eq(tasoMatches.seasonId, seasonId))
      );

    expect(stored).toHaveLength(1);
    expect(calculateStandings(toFinishedMatches(stored))).toEqual(
      calculateStandings(toFinishedMatches(providerMatches))
    );
  });

  it("does not duplicate a match when the same provider response is synchronized twice", async () => {
    const { synchronizeMatches } = await import("@/lib/taso-standings-service");
    const providerMatch = buildMatch({ homeGoals: 3, awayGoals: 0 });

    await synchronizeMatches([providerMatch]);
    await synchronizeMatches([{ ...providerMatch, homeGoals: 1, awayGoals: 1 }]);

    const stored = await db
      .select()
      .from(tasoMatches)
      .where(eq(tasoMatches.providerMatchId, providerMatch.providerMatchId));

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ homeGoals: 1, awayGoals: 1 });
  });

  // The reason `category_id` exists at all: one `competition_id` is the whole
  // season umbrella, and `group_id` is only unique *within* a category. In
  // spljp26 Veikkausliiga, Miesten Kakkonen and Ykkönen each have a group 1.
  // See specs/013-more-finnish-competitions.md.
  it("keeps two categories' identically-numbered groups apart", async () => {
    const { synchronizeMatches, getSeasonStandings, getSeasonMatchList } = await import(
      "@/lib/taso-standings-service"
    );
    const otherCategoryId = "M2";

    await synchronizeMatches([
      buildMatch({ providerMatchId: 900001, groupId: 1, groupName: "Runkosarja" }),
      buildMatch({
        providerMatchId: 900002,
        categoryId: otherCategoryId,
        groupId: 1,
        groupName: "Lohko A",
        homeTeamProviderId: 9101,
        homeTeamName: "Kakkonen Rovers",
        awayTeamProviderId: 9102,
        awayTeamName: "Kakkonen Athletic",
      }),
    ]);

    const veikkausliiga = await getSeasonStandings(
      CATEGORY_ID,
      competitionId,
      seasonId,
      seasonId,
      undefined
    );
    const kakkonen = await getSeasonStandings(
      otherCategoryId,
      competitionId,
      seasonId,
      seasonId,
      undefined
    );

    // One group each, under its own name — not one merged group 1 of four teams.
    expect(veikkausliiga.status === "ok" && veikkausliiga.groups.map((g) => g.groupName)).toEqual([
      "Runkosarja",
    ]);
    expect(kakkonen.status === "ok" && kakkonen.groups.map((g) => g.groupName)).toEqual([
      "Lohko A",
    ]);

    const veikkausliigaTeams =
      veikkausliiga.status === "ok" && veikkausliiga.groups[0]?.kind === "own-calculated"
        ? veikkausliiga.groups[0].standings.map((team) => team.teamName).sort()
        : [];
    expect(veikkausliigaTeams).toEqual(["Integration City", "Integration United"]);

    // And the match lists stay separate too, not just the tables.
    const kakkonenMatches = await getSeasonMatchList(
      otherCategoryId,
      competitionId,
      seasonId,
      seasonId
    );
    expect(kakkonenMatches.status === "ok" && kakkonenMatches.matches).toHaveLength(1);
    expect(kakkonenMatches.status === "ok" && kakkonenMatches.matches[0]?.providerMatchId).toBe(
      900002
    );
  });

  it("own-calculates the origin group from stored matches, round-filtered", async () => {
    const { synchronizeMatches, getSeasonStandings } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([
      buildMatch({ providerMatchId: 900001, matchday: 1 }),
      buildMatch({
        providerMatchId: 900002,
        matchday: 2,
        homeTeamProviderId: 9002,
        awayTeamProviderId: 9001,
        homeGoals: 0,
        awayGoals: 0,
      }),
    ]);

    const full = await getSeasonStandings(
      CATEGORY_ID,
      competitionId,
      seasonId,
      seasonId,
      undefined
    );
    const roundOne = await getSeasonStandings(CATEGORY_ID, competitionId, seasonId, seasonId, 1);

    expect(full.status).toBe("ok");
    expect(full.status === "ok" && full.groups).toHaveLength(1);
    const unitedFull =
      full.status === "ok" &&
      full.groups[0]?.kind === "own-calculated" &&
      full.groups[0].standings.find((team) => team.teamName === "Integration United");
    expect(unitedFull).toMatchObject({ played: 2 });

    const unitedRoundOne =
      roundOne.status === "ok" &&
      roundOne.groups[0]?.kind === "own-calculated" &&
      roundOne.groups[0].standings.find((team) => team.teamName === "Integration United");
    expect(unitedRoundOne).toMatchObject({ played: 1 });
  });

  it("shows a scheduled-only team as a zero-stats row via roster seeding, same as football-data.org standings", async () => {
    const { synchronizeMatches, getSeasonStandings, getTeamMatches } = await import(
      "@/lib/taso-standings-service"
    );
    const finished = buildMatch();
    const upcoming = buildMatch({
      providerMatchId: 900002,
      status: "SCHEDULED",
      homeGoals: null,
      awayGoals: null,
      matchday: 2,
      homeTeamProviderId: 9003,
      homeTeamName: "Integration Rovers",
    });

    await synchronizeMatches([finished, upcoming]);

    const standings = await getSeasonStandings(
      CATEGORY_ID,
      competitionId,
      seasonId,
      seasonId,
      undefined
    );
    expect(standings.status).toBe("ok");
    const rovers =
      standings.status === "ok" &&
      standings.groups[0]?.kind === "own-calculated" &&
      standings.groups[0].standings.find((team) => team.teamName === "Integration Rovers");
    expect(rovers).toMatchObject({ played: 0, points: 0 });

    const teamMatches = await getTeamMatches(CATEGORY_ID, competitionId, 9003, seasonId, seasonId);
    expect(teamMatches).toEqual({ status: "ok", matches: [expect.objectContaining(upcoming)] });
  });

  it("lists a team's matches chronologically across groups it appeared in", async () => {
    const { synchronizeMatches, getTeamMatches } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([
      buildMatch({
        providerMatchId: 900002,
        groupId: 2,
        groupName: "Mestaruussarja",
        matchday: 23,
        kickoffAt: new Date("2026-09-01T15:00:00Z"),
      }),
      buildMatch({
        providerMatchId: 900001,
        groupId: 1,
        groupName: "Runkosarja",
        kickoffAt: new Date("2026-08-01T15:00:00Z"),
      }),
    ]);

    const result = await getTeamMatches(CATEGORY_ID, competitionId, 9001, seasonId, seasonId);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([
      900001, 900002,
    ]);
    expect(result.status === "ok" && result.matches.map((m) => m.groupName)).toEqual([
      "Runkosarja",
      "Mestaruussarja",
    ]);
  });

  it("getSeasonMatchList returns every group's matches with group_name attached, sorted by kickoff", async () => {
    const { synchronizeMatches, getSeasonMatchList } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([
      buildMatch({
        providerMatchId: 900002,
        groupId: 2,
        groupName: "Mestaruussarja",
        matchday: 23,
        kickoffAt: new Date("2026-09-01T15:00:00Z"),
      }),
      buildMatch({ providerMatchId: 900001, kickoffAt: new Date("2026-08-01T15:00:00Z") }),
    ]);

    const result = await getSeasonMatchList(CATEGORY_ID, competitionId, seasonId, seasonId);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.matches.map((m) => m.providerMatchId)).toEqual([
      900001, 900002,
    ]);
  });

  it("backfills a season with no stored matches from the provider", async () => {
    const { getSeasonMatches } = await import("@/lib/taso");
    const providerMatches = [buildMatch()];
    vi.mocked(getSeasonMatches).mockResolvedValue(providerMatches);

    const { getSeasonStandings } = await import("@/lib/taso-standings-service");
    const result = await getSeasonStandings(
      CATEGORY_ID,
      competitionId,
      seasonId,
      laterActiveSeasonId,
      undefined
    );

    const stored = await db
      .select()
      .from(tasoMatches)
      .where(
        and(eq(tasoMatches.competitionCode, competitionId), eq(tasoMatches.seasonId, seasonId))
      );

    expect(getSeasonMatches).toHaveBeenCalledWith(competitionId, CATEGORY_ID, seasonId);
    expect(stored).toHaveLength(1);
    expect(result.status).toBe("ok");
  });

  it("never refetches a past season that already has stored matches, however stale", async () => {
    const { getSeasonMatches } = await import("@/lib/taso");
    const { synchronizeMatches, getSeasonStandings } = await import("@/lib/taso-standings-service");
    await synchronizeMatches([buildMatch()]);

    const result = await getSeasonStandings(
      CATEGORY_ID,
      competitionId,
      seasonId,
      laterActiveSeasonId,
      undefined
    );

    expect(getSeasonMatches).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
  });
});

/**
 * Carry-over config validation lives in
 * `tests/unit/lib/taso-carry-over.test.ts`, not here.
 *
 * A synthetic version of it used to sit in this file, building matches whose
 * win/draw/loss counts were engineered to total KuPS's real 67 points from
 * 32 games. That proved `calculateStandings` can add up — which its own
 * tests already cover — while proving nothing about `CARRY_OVER_CONFIG`,
 * the thing that actually fails silently when wrong. Removing an entry left
 * it green.
 *
 * The replacement drives the real `getSeasonStandings` over captured TASO
 * matches and asserts each split group against TASO's own published
 * standings, for every configured season. See #127.
 */
