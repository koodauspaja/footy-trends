import { beforeEach, describe, expect, it, vi } from "vitest";
import { tasoGroupTeams } from "@/db/schema";
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
 * the config is the thing under test, not the arithmetic.
 *
 * TASO's own group standings are fed in alongside the matches, which makes the
 * guard sharper than asserting numbers alone: a wrong entry no longer merely
 * produces different points, it fails to reconcile, and the group renders as
 * `pass-through` instead of `own-calculated`. Both are asserted.
 *
 * Fixtures are real TASO data captured per competition-season — every match in
 * the groups a carry-over touches, plus those groups' published points and
 * `starting_points` — so the tests are deterministic in CI with no live API
 * access. See specs/013-more-finnish-competitions.md.
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
  /** Per group: `[teamId, points, startingPoints]`, straight from `getGroups`. */
  groupTeams: Record<string, [number, number | null, number][]>;
  /** Per carry-over group: `[teamId, points, matchesPlayed]` as TASO published them. */
  expected: Record<string, [number, number, number][]>;
};

/**
 * Fixtures are keyed `categoryId/competitionId`: `competition_id` alone is the
 * season umbrella every Finnish competition shares, so Ykkönen's and
 * Veikkausliiga's 2025 fixtures would collide under a bare `spljp25`.
 */
const seasons = Object.entries(fixture as unknown as Record<string, FixtureSeason>).map(
  ([key, season]) => {
    // Sliced rather than destructured from `split`, which types both halves
    // as possibly-undefined under noUncheckedIndexedAccess.
    const separator = key.indexOf("/");
    return {
      key,
      categoryId: key.slice(0, separator),
      competitionId: key.slice(separator + 1),
      season,
    };
  }
);

/** Every fixture season is finished, so none is the active one — no refresh, no provider call. */
const ACTIVE_SEASON = 2027;

function expandMatches(
  categoryId: string,
  competitionId: string,
  season: FixtureSeason
): NormalizedTasoMatch[] {
  return season.matches.map(([groupId, homeId, awayId, homeGoals, awayGoals], index) => ({
    providerMatchId: index + 1,
    competitionCode: competitionId,
    categoryId,
    seasonId: season.seasonId,
    groupId,
    groupName: `Group ${groupId}`,
    status: homeGoals === null ? "SCHEDULED" : "FINISHED",
    winner: null,
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

function expandGroupTeams(categoryId: string, competitionId: string, season: FixtureSeason) {
  return Object.entries(season.groupTeams).flatMap(([groupId, rows]) =>
    rows.map(([teamId, points, startingPoints]) => ({
      categoryId,
      competitionCode: competitionId,
      seasonId: season.seasonId,
      groupId: Number(groupId),
      teamProviderId: teamId,
      teamName: season.teams[String(teamId)] ?? "",
      startingPoints,
      points,
      // Only points and starting_points drive the calculation and the
      // reconciliation; the rest of TASO's row is display data for the
      // fallback path, which a correct entry never reaches.
      played: null,
      won: null,
      drawn: null,
      lost: null,
      goalsFor: null,
      goalsAgainst: null,
      goalDifference: null,
      currentStanding: null,
      finalGroupStanding: null,
      updatedAt: new Date(),
    }))
  );
}

function mockStored(matches: NormalizedTasoMatch[], groupTeams: unknown[]): void {
  const stored = matches.map((row) => ({ ...row, updatedAt: new Date() }));
  const from = vi.fn().mockImplementation((table: unknown) => {
    const orderBy = vi.fn().mockResolvedValue(table === tasoGroupTeams ? groupTeams : stored);
    return { where: vi.fn().mockReturnValue({ orderBy }) };
  });
  dbMock.select.mockReturnValue({ from });
}

describe("CARRY_OVER_CONFIG validated against TASO's published standings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedMock.mockImplementation((_key, _ttl, fetcher) => fetcher());
    getSeasonGroupsMock.mockResolvedValue([]);
  });

  for (const { key, categoryId, competitionId, season } of seasons) {
    for (const [groupId, expected] of Object.entries(season.expected)) {
      it(`${key} group ${groupId}: reproduces every team's points and matches played`, async () => {
        mockStored(
          expandMatches(categoryId, competitionId, season),
          expandGroupTeams(categoryId, competitionId, season)
        );

        const result = await getSeasonStandings(
          categoryId,
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

        // Anything but own-calculated means the config entry is wrong or gone:
        // our numbers stopped reconciling with TASO's.
        expect(group?.kind, `${key} group ${groupId} did not reconcile with TASO`).toBe(
          "own-calculated"
        );
        const standings = group?.kind === "own-calculated" ? group.standings : [];

        // Only this group's teams, not the parent's full roster.
        expect(standings).toHaveLength(expected.length);

        for (const [teamProviderId, points, played] of expected) {
          const actual = standings.find((entry) => entry.teamProviderId === teamProviderId);
          const teamName = season.teams[String(teamProviderId)] ?? String(teamProviderId);
          expect(actual, `${teamName} missing from ${key} group ${groupId}`).toBeDefined();
          expect({ teamName, points: actual?.points, played: actual?.played }).toEqual({
            teamName,
            points,
            played,
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

    /**
     * Keyed by category as well as competition: five competitions now have a
     * 2022 fixture, and these assertions are about Veikkausliiga's shape.
     */
    function fixtureFor(key: string): {
      categoryId: string;
      competitionId: string;
      season: FixtureSeason;
    } {
      const [entry] = seasons.filter((candidate) => candidate.key === key);
      if (entry === undefined) throw new Error(`missing fixture for ${key}`);
      return entry;
    }

    it("shows 5 played at Kierros 5, not 10 — the issue's repro", async () => {
      const { categoryId, competitionId, season } = fixtureFor("VL/spljp22");
      mockStored(
        withRestartedRounds(expandMatches(categoryId, competitionId, season)),
        expandGroupTeams(categoryId, competitionId, season)
      );

      const result = await getSeasonStandings(categoryId, competitionId, 2022, ACTIVE_SEASON, 5);
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
      const { categoryId, competitionId, season } = fixtureFor("VL/spljp22");
      mockStored(
        withRestartedRounds(expandMatches(categoryId, competitionId, season)),
        expandGroupTeams(categoryId, competitionId, season)
      );

      // The selector reads the same funnel, so it must now offer rounds past
      // Runkosarja's 22 — it previously stopped there.
      const result = await getSeasonMatchList(categoryId, competitionId, 2022, ACTIVE_SEASON);
      const rounds =
        result.status === "ok"
          ? listSelectableTasoRounds(result.matches, new Set(result.matches.map((m) => m.groupId)))
          : [];

      expect(Math.max(...rounds)).toBe(27);
      expect(rounds).toContain(23);
    });

    it("makes 2019's own rounds reachable, which is what blocked its config entry", async () => {
      // 2019 restarts at 1-5 like 2022. Its carry-over validated all along;
      // the round filter was the only thing keeping it out of the config.
      const { categoryId, competitionId, season } = fixtureFor("VL/spljp19");
      mockStored(
        withRestartedRounds(expandMatches(categoryId, competitionId, season)),
        expandGroupTeams(categoryId, competitionId, season)
      );

      const result = await getSeasonMatchList(categoryId, competitionId, 2019, ACTIVE_SEASON);
      const rounds =
        result.status === "ok"
          ? listSelectableTasoRounds(result.matches, new Set(result.matches.map((m) => m.groupId)))
          : [];

      expect(Math.max(...rounds)).toBe(27);
    });

    it("maps an overlapping child's first round onto the parent's next, whatever it starts at", async () => {
      // Every real season restarts at exactly 1, but shifting by the
      // parent's last round alone only works for that case: a child running
      // 20-24 would land on 42-46 instead of 23-27.
      const { categoryId, competitionId, season } = fixtureFor("VL/spljp22");
      const rows = expandMatches(categoryId, competitionId, season).map((row, index) => ({
        ...row,
        matchday: row.groupId === 1 ? (index % 22) + 1 : 20 + (index % 5),
      }));
      mockStored(rows, expandGroupTeams(categoryId, competitionId, season));

      const result = await getSeasonMatchList(categoryId, competitionId, 2022, ACTIVE_SEASON);
      const splitRounds =
        result.status === "ok"
          ? result.matches
              .filter((match) => match.groupId === 2)
              .flatMap((match) => (match.matchday === null ? [] : [match.matchday]))
          : [];

      expect(Math.min(...splitRounds)).toBe(23);
      expect(Math.max(...splitRounds)).toBe(27);
    });

    it("leaves a season that already continues its numbering untouched", async () => {
      // Renumbering a correct season again would double-shift it.
      const { categoryId, competitionId, season } = fixtureFor("VL/spljp25");
      const rows = expandMatches(categoryId, competitionId, season).map((row, index) => ({
        ...row,
        matchday: row.groupId === 1 ? (index % 22) + 1 : 23 + (index % 5),
      }));
      mockStored(rows, expandGroupTeams(categoryId, competitionId, season));

      const result = await getSeasonMatchList(categoryId, competitionId, 2025, ACTIVE_SEASON);
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
    // Compared per `categoryId + competitionId + groupId` against the real config, in
    // both directions. Matching on competition alone would let a new group
    // be added to an already-fixtured season — `spljp25: { 2: 1, 3: 1, 4: 1 }`
    // — and go untested, and a count-based check would miss it too. Guarding
    // exactly this is what spec 009 asked of these tests.
    const configured = listCarryOverEntries()
      .map((entry) => `${entry.categoryId}/${entry.competitionId}:${entry.groupId}`)
      .sort();
    const fixtured = seasons
      .flatMap(({ categoryId, competitionId, season }) =>
        Object.keys(season.expected).map((groupId) => `${categoryId}/${competitionId}:${groupId}`)
      )
      .sort();

    expect(configured).toEqual(fixtured);
  });
});
