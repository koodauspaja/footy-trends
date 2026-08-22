import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedTasoMatch } from "@/lib/taso";
import { getSeasonStandings, listCarryOverCompetitionIds } from "@/lib/taso-standings-service";
import fixture from "../../fixtures/taso-carry-over.json";

/**
 * Guards `CARRY_OVER_CONFIG` against TASO's own published numbers.
 *
 * A wrong or missing entry fails silently in production: the table still
 * renders, with wrong points. So these run through the real
 * `getSeasonStandings` rather than calling `calculateStandings` directly —
 * the config is the thing under test, not the arithmetic. Delete any entry
 * and its group falls back to pass-through, whose standings come from a
 * `getGroups` call mocked empty here, so the assertions below fail loudly.
 *
 * Fixtures are real TASO data (matches for groups 1–3, and each split
 * group's published final standings) captured per season, so the tests are
 * deterministic in CI with no live API access.
 */

const { dbMock, getCachedMock, getSeasonGroupsMock, getSeasonMatchesMock } = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), insert: vi.fn() },
  getCachedMock: vi.fn(),
  getSeasonGroupsMock: vi.fn(),
  getSeasonMatchesMock: vi.fn(),
}));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/lib/cache", () => ({ getCached: getCachedMock }));
vi.mock("@/lib/taso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso")>();
  return {
    ...actual,
    getSeasonGroups: getSeasonGroupsMock,
    getSeasonMatches: getSeasonMatchesMock,
  };
});
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

type FixtureSeason = {
  seasonId: number;
  teams: Record<string, string>;
  /** `[groupId, homeTeamId, awayTeamId, homeGoals, awayGoals]`; goals are null when unplayed. */
  matches: [number, number, number, number | null, number | null][];
  expected: Record<
    string,
    { teamProviderId: number; teamName: string; points: number; played: number }[]
  >;
};

const seasons = Object.entries(fixture as unknown as Record<string, FixtureSeason>);

/** Every fixture season is finished, so none is the active one — no refresh, no provider call. */
const ACTIVE_SEASON = 2026;

function expandMatches(competitionId: string, season: FixtureSeason): NormalizedTasoMatch[] {
  return season.matches.map(([groupId, homeId, awayId, homeGoals, awayGoals], index) => ({
    providerMatchId: index + 1,
    competitionCode: competitionId,
    seasonId: season.seasonId,
    groupId,
    groupName: `Group ${groupId}`,
    status: homeGoals === null ? "SCHEDULED" : "FINISHED",
    kickoffAt: new Date(Date.UTC(season.seasonId, 3, 1) + index * 3_600_000),
    matchday: null,
    homeTeamProviderId: homeId,
    homeTeamName: season.teams[String(homeId)] ?? "",
    awayTeamProviderId: awayId,
    awayTeamName: season.teams[String(awayId)] ?? "",
    homeGoals,
    awayGoals,
  }));
}

function mockStoredMatches(rows: NormalizedTasoMatch[]): void {
  const stored = rows.map((row) => ({ ...row, updatedAt: new Date() }));
  const orderBy = vi.fn().mockResolvedValue(stored);
  const where = vi.fn().mockReturnValue({ orderBy });
  dbMock.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });
}

describe("CARRY_OVER_CONFIG validated against TASO's published standings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());
    // Empty on purpose: a group that still resolves via pass-through has lost
    // its config entry, and an empty table makes that unmistakable.
    getSeasonGroupsMock.mockResolvedValue([]);
  });

  for (const [competitionId, season] of seasons) {
    for (const [groupId, expected] of Object.entries(season.expected)) {
      it(`${competitionId} group ${groupId}: reproduces every team's points and matches played`, async () => {
        mockStoredMatches(expandMatches(competitionId, season));

        const result = await getSeasonStandings(
          competitionId,
          season.seasonId,
          ACTIVE_SEASON,
          undefined
        );

        expect(result.status).toBe("ok");
        const group =
          result.status === "ok"
            ? result.groups.find((entry) => entry.groupId === Number(groupId))
            : undefined;

        // Pass-through here means the config entry is gone.
        expect(group?.kind).toBe("own-calculated");
        const standings = group?.kind === "own-calculated" ? group.standings : [];

        // Only this group's teams, not the parent's full roster.
        expect(standings).toHaveLength(expected.length);

        for (const team of expected) {
          const actual = standings.find((entry) => entry.teamProviderId === team.teamProviderId);
          expect(
            actual,
            `${team.teamName} missing from ${competitionId} group ${groupId}`
          ).toBeDefined();
          expect({
            teamName: team.teamName,
            points: actual?.points,
            played: actual?.played,
          }).toEqual({
            teamName: team.teamName,
            points: team.points,
            played: team.played,
          });
        }
      });
    }
  }

  it("has a fixture for every configured season, so an entry cannot be added untested", () => {
    // Asserted against the real config, not a hardcoded list: adding a
    // season to CARRY_OVER_CONFIG without capturing TASO's numbers for it
    // is the exact gap spec 009 asked this to guard, and a list-vs-list
    // check would happily pass while it went untested.
    expect(listCarryOverCompetitionIds().sort()).toEqual(
      seasons.map(([competitionId]) => competitionId).sort()
    );
    // Both split groups per season.
    expect(seasons.flatMap(([, season]) => Object.keys(season.expected))).toHaveLength(
      listCarryOverCompetitionIds().length * 2
    );
  });
});
