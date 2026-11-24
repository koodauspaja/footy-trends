import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { matches, tasoGroupTeams, tasoGroupZones, tasoMatches } from "@/db/schema";

/**
 * The daily refresh against Postgres, the providers and their cache (15 minutes,
 * an hour for a competition) mocked: every newest season is 2099, the shown one
 * 2098, a past one 1990, so the rows are this suite's.
 *
 * decisions/080-daily-refresh-of-every-competition.md
 */

const providers = vi.hoisted(() => ({
  taso: vi.fn(),
  groups: vi.fn(),
  footballData: vi.fn(),
}));

vi.mock("@/lib/taso/taso-seasons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/taso/taso-seasons")>()),
  resolveTasoSeasonCeiling: async () => ({
    currentSeason: 2099,
    newestStored: 2098,
    discoveryFailed: false,
  }),
}));
vi.mock("@/lib/taso/taso", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/taso/taso")>()),
  getSeasonMatches: providers.taso,
  getSeasonGroups: providers.groups,
}));
vi.mock("@/lib/football-data/football-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/football-data/football-data")>()),
  getSeasonContext: async () => ({ activeSeasonId: 2099, selectableSeasons: [] }),
  getSeasonMatches: providers.footballData,
}));

import { runDailyRefresh } from "@/lib/predictions/daily-refresh";
import { competitionIdForSeason } from "@/lib/taso/domestic-competitions";
import { storedTasoSeasons } from "@/lib/taso/taso-seasons";

const IDS = [988_001, 988_002, 988_003];
const TEAMS = [988_101, 988_102];
const VL_2099 = competitionIdForSeason("VL", 2099);
const immediate = {
  "football-data": <T>(work: () => Promise<T>) => work(),
  taso: <T>(work: () => Promise<T>) => work(),
};

function tasoFixture(overrides: Partial<typeof tasoMatches.$inferInsert> = {}) {
  return {
    providerMatchId: IDS[0] as number,
    competitionCode: VL_2099,
    categoryId: "VL",
    seasonId: 2099,
    groupId: 988_900,
    groupName: "Runkosarja",
    status: "SCHEDULED",
    providerStatus: null,
    kickoffAt: new Date("2099-05-01T15:00:00Z"),
    matchday: 1,
    homeTeamProviderId: TEAMS[0] as number,
    homeTeamName: "Integration Home",
    awayTeamProviderId: TEAMS[1] as number,
    awayTeamName: "Integration Away",
    homeGoals: null,
    awayGoals: null,
    halfTimeHome: null,
    halfTimeAway: null,
    winner: null,
    ...overrides,
  };
}

const footballDataFixture = {
  providerMatchId: IDS[1] as number,
  competitionCode: "DED",
  seasonId: 2099,
  status: "TIMED",
  kickoffAt: new Date("2099-08-15T18:00:00Z"),
  matchday: 1,
  stage: null,
  groupName: null,
  homeTeamProviderId: TEAMS[0] as number,
  homeTeamName: "Integration Home",
  awayTeamProviderId: TEAMS[1] as number,
  awayTeamName: "Integration Away",
  homeGoals: null,
  awayGoals: null,
};

async function clear() {
  await db.delete(matches).where(inArray(matches.providerMatchId, IDS));
  await db.delete(tasoMatches).where(inArray(tasoMatches.providerMatchId, IDS));
  await db.delete(tasoGroupTeams).where(inArray(tasoGroupTeams.seasonId, [2098, 2099]));
  await db.delete(tasoGroupZones).where(inArray(tasoGroupZones.seasonId, [2098, 2099]));
}

beforeEach(async () => {
  await clear();
  providers.taso.mockReset();
  providers.groups.mockReset();
  providers.footballData.mockReset();
  providers.taso.mockImplementation(async (_competitionId: string, categoryId: string) =>
    categoryId === "VL" ? [tasoFixture()] : []
  );
  providers.groups.mockImplementation(async (_competitionId: string, categoryId: string) =>
    categoryId === "VL"
      ? [
          {
            group_id: "988900",
            group_name: "Runkosarja",
            next_stage_levels: "1,1,0,0,0,0,0,0,0,0",
            next_stage_level_texts: ["Mestaruus", "Karsinta", "", "", "", "", "", "", "", ""],
            teams: TEAMS.map((team) => ({
              team_id: String(team),
              team_name: `Team ${team}`,
              points: "0",
            })),
          },
        ]
      : []
  );
  providers.footballData.mockImplementation(async (code: string) =>
    code === "DED" ? [footballDataFixture] : []
  );
});
afterEach(clear);

describe("runDailyRefresh", () => {
  it("stores a fixture only the provider has, for both providers, with no page visited", async () => {
    const report = await runDailyRefresh(immediate);

    // VL's 2099 has a fixture; the other thirteen have none, so each also
    // refreshes the 2098 its page shows.
    expect(report).toEqual({ refreshed: 24 + 13, failures: [] });
    const [taso] = await db
      .select()
      .from(tasoMatches)
      .where(eq(tasoMatches.providerMatchId, IDS[0] as number));
    expect(taso).toMatchObject({ categoryId: "VL", seasonId: 2099, status: "SCHEDULED" });
    const [footballData] = await db
      .select()
      .from(matches)
      .where(eq(matches.providerMatchId, IDS[1] as number));
    expect(footballData).toMatchObject({ competitionCode: "DED", seasonId: 2099 });
  });

  it("writes the season's group tables", async () => {
    await runDailyRefresh(immediate);

    const rows = await db
      .select()
      .from(tasoGroupTeams)
      .where(and(eq(tasoGroupTeams.categoryId, "VL"), eq(tasoGroupTeams.seasonId, 2099)));
    expect(rows.map((row) => row.teamProviderId).sort()).toEqual([...TEAMS].sort());
    const zones = await db
      .select()
      .from(tasoGroupZones)
      .where(and(eq(tasoGroupZones.categoryId, "VL"), eq(tasoGroupZones.seasonId, 2099)));
    expect(zones.map((zone) => [zone.level, zone.teamCount, zone.label]).sort()).toEqual([
      [1, 1, "Mestaruus"],
      [2, 1, "Karsinta"],
    ]);
  });

  it("stores no group rows for a season with no matches, so it does not count as stored", async () => {
    // TASO answers groups for every category; only VL's 2099 has a match.
    providers.groups.mockImplementation(async () => [
      {
        group_id: "988900",
        group_name: "Runkosarja",
        teams: TEAMS.map((team) => ({ team_id: String(team), team_name: `Team ${team}` })),
      },
    ]);

    await runDailyRefresh(immediate);

    const m1Rows = await db
      .select()
      .from(tasoGroupTeams)
      .where(and(eq(tasoGroupTeams.categoryId, "M1"), eq(tasoGroupTeams.seasonId, 2099)));
    expect(m1Rows).toEqual([]);
    expect(await storedTasoSeasons("M1")).not.toContain(2099);
    expect(await storedTasoSeasons("VL")).toContain(2099);
  });

  it("moves a stored fixture the provider has rescheduled", async () => {
    await db.insert(tasoMatches).values(tasoFixture());
    const moved = new Date("2099-05-03T15:00:00Z");
    providers.taso.mockImplementation(async (_competitionId: string, categoryId: string) =>
      categoryId === "VL" ? [tasoFixture({ kickoffAt: moved })] : []
    );

    await runDailyRefresh(immediate);

    const [row] = await db
      .select()
      .from(tasoMatches)
      .where(eq(tasoMatches.providerMatchId, IDS[0] as number));
    expect(row?.kickoffAt).toEqual(moved);
  });

  it("leaves a past season's rows as they are", async () => {
    const written = new Date("2020-01-01T00:00:00Z");
    const past = tasoFixture({
      providerMatchId: IDS[2] as number,
      competitionCode: competitionIdForSeason("VL", 1990),
      seasonId: 1990,
      status: "FINISHED",
      homeGoals: 2,
      awayGoals: 1,
    });
    await db.insert(tasoMatches).values({ ...past, updatedAt: written });

    await runDailyRefresh(immediate);

    const [row] = await db
      .select()
      .from(tasoMatches)
      .where(eq(tasoMatches.providerMatchId, IDS[2] as number));
    expect(row).toMatchObject({ homeGoals: 2, awayGoals: 1, updatedAt: written });
    expect(providers.taso.mock.calls.some(([, , seasonId]) => seasonId === 1990)).toBe(false);
  });

  it("stores the shown season's new fixture while the newest season has none", async () => {
    providers.taso.mockImplementation(
      async (_competitionId: string, categoryId: string, seasonId: number) =>
        categoryId === "M1" && seasonId === 2098
          ? [
              tasoFixture({
                providerMatchId: IDS[2] as number,
                competitionCode: competitionIdForSeason("M1", 2098),
                categoryId: "M1",
                seasonId: 2098,
              }),
            ]
          : []
    );

    await runDailyRefresh(immediate);

    const [row] = await db
      .select()
      .from(tasoMatches)
      .where(eq(tasoMatches.providerMatchId, IDS[2] as number));
    expect(row).toMatchObject({ categoryId: "M1", seasonId: 2098 });
  });
});
