import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedTasoMatch } from "@/lib/taso";
import {
  getSeasonMatchList,
  getSeasonStandings,
  listCarryOverEntries,
  listSelectableTasoRounds,
} from "@/lib/taso-standings-service";
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

  // #133: 2019, 2022 and 2023 restart their split groups at round 1 instead
  // of continuing from Runkosarja's 22, while 2021/2024/2025 continue. The
  // round filter takes `matchday <= round` across parent + child, so without
  // renumbering a child round of 5 is indistinguishable from Runkosarja's 5.
  describe("split groups that restart round numbering", () => {
    /** Runkosarja pairs all 12 teams per round; a 6-team split group, 3. */
    function matchesPerRound(groupId: number): number {
      return groupId === 1 ? 6 : 3;
    }

    /** Numbers rounds the way TASO does for these seasons: the child restarts at 1. */
    function withRestartedRounds(rows: NormalizedTasoMatch[]): NormalizedTasoMatch[] {
      const seen = new Map<number, number>();
      return rows.map((row) => {
        const index = (seen.get(row.groupId) ?? 0) + 1;
        seen.set(row.groupId, index);
        return { ...row, matchday: Math.ceil(index / matchesPerRound(row.groupId)) };
      });
    }

    /** Iterating the typed entries avoids an unchecked index into the fixture. */
    function fixtureFor(competitionId: string): [string, FixtureSeason] {
      const [entry] = seasons.filter(([id]) => id === competitionId);
      expect(entry, `missing fixture for ${competitionId}`).toBeDefined();
      return entry as [string, FixtureSeason];
    }

    it("shows 5 played at Kierros 5, not 10 — the issue's repro", async () => {
      const [competitionId, season] = fixtureFor("spljp22");
      mockStoredMatches(withRestartedRounds(expandMatches(competitionId, season)));

      const result = await getSeasonStandings(competitionId, 2022, ACTIVE_SEASON, 5);
      const mestaruussarja =
        result.status === "ok" ? result.groups.find((group) => group.groupId === 2) : undefined;
      const played =
        mestaruussarja?.kind === "own-calculated"
          ? mestaruussarja.standings.map((team) => team.played)
          : [];

      // Before the fix this was [10,10,10,10,10,10]: Runkosarja rounds 1-5
      // plus Mestaruussarja rounds 1-5, two stages under one number.
      expect(played).toEqual([5, 5, 5, 5, 5, 5]);
    });

    it("puts the split group's rounds above the parent's, so they are reachable", async () => {
      const [competitionId, season] = fixtureFor("spljp22");
      mockStoredMatches(withRestartedRounds(expandMatches(competitionId, season)));

      // The selector reads the same funnel, so it must now offer rounds past
      // Runkosarja's 22 — it previously stopped there.
      const result = await getSeasonMatchList(competitionId, 2022, ACTIVE_SEASON);
      const rounds =
        result.status === "ok" ? listSelectableTasoRounds(result.matches, competitionId) : [];

      expect(Math.max(...rounds)).toBe(27);
      expect(rounds).toContain(23);
    });

    it("makes 2019's own rounds reachable, which is what blocked its config entry", async () => {
      // 2019 restarts at 1-5 like 2022. Its carry-over validated all along;
      // the round filter was the only thing keeping it out of the config.
      const [competitionId, season] = fixtureFor("spljp19");
      mockStoredMatches(withRestartedRounds(expandMatches(competitionId, season)));

      const result = await getSeasonMatchList(competitionId, 2019, ACTIVE_SEASON);
      const rounds =
        result.status === "ok" ? listSelectableTasoRounds(result.matches, competitionId) : [];

      expect(Math.max(...rounds)).toBe(27);
    });

    it("leaves a season that already continues its numbering untouched", async () => {
      // Renumbering a correct season again would double-shift it.
      const [competitionId, season] = fixtureFor("spljp25");
      const rows = expandMatches(competitionId, season).map((row, index) => ({
        ...row,
        matchday: row.groupId === 1 ? (index % 22) + 1 : 23 + (index % 5),
      }));
      mockStoredMatches(rows);

      const result = await getSeasonMatchList(competitionId, 2025, ACTIVE_SEASON);
      const splitRounds =
        result.status === "ok"
          ? result.matches
              .filter((match) => match.groupId === 2)
              .flatMap((match) => (match.matchday === null ? [] : [match.matchday]))
          : [];

      expect(Math.min(...splitRounds)).toBe(23);
      expect(Math.max(...splitRounds)).toBe(27);
    });
  });

  it("has a fixture for every configured entry, so none can be added untested", () => {
    // Compared per `competitionId + groupId` against the real config, in
    // both directions. Matching on competition alone would let a new group
    // be added to an already-fixtured season — `spljp25: { 2: 1, 3: 1, 4: 1 }`
    // — and go untested, and a count-based check would miss it too. Guarding
    // exactly this is what spec 009 asked of these tests.
    const configured = listCarryOverEntries()
      .map((entry) => `${entry.competitionId}:${entry.groupId}`)
      .sort();
    const fixtured = seasons
      .flatMap(([competitionId, season]) =>
        Object.keys(season.expected).map((groupId) => `${competitionId}:${groupId}`)
      )
      .sort();

    expect(configured).toEqual(fixtured);
  });
});
