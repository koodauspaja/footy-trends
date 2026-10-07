import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { getSeasonMovements } from "@/lib/standings-service";
import { getTasoSeasonMovements } from "@/lib/taso-standings-service";

/**
 * The season reads behind `Sijoitusten vaihtelu` against a real Postgres: only completed
 * seasons and stored rows, and on TASO only each season's own competition and category.
 * Codes no provider issues, because the reads span a competition's whole history.
 *
 * decisions/050-table-volatility.md
 */

const FD_CODE = "ZZ50";
const TASO_CODE = "ZZ50T";
const IDS = Array.from({ length: 20 }, (_, index) => 996001 + index);

// Four teams, three rounds. After round 2, halfway, the order is a, c, b, d;
// at the end a, b, c, d. b and c trade places: 2 places over 4 teams.
const RESULTS: Array<[number, number, number, [number, number]]> = [
  [1, 1, 2, [2, 0]],
  [1, 3, 4, [1, 0]],
  [2, 1, 3, [1, 0]],
  [2, 2, 4, [1, 0]],
  [3, 1, 4, [1, 0]],
  [3, 2, 3, [1, 0]],
];

async function clear() {
  await db.delete(matches).where(inArray(matches.providerMatchId, IDS));
  await db.delete(tasoMatches).where(inArray(tasoMatches.providerMatchId, IDS));
}

beforeEach(clear);
afterEach(clear);

describe("a foreign competition's completed seasons (specs/050)", () => {
  function row(id: number, seasonId: number, [round, home, away, score]: (typeof RESULTS)[number]) {
    return {
      providerMatchId: id,
      competitionCode: FD_CODE,
      seasonId,
      kickoffAt: new Date(`${seasonId}-09-0${round}T15:00:00Z`),
      matchday: round,
      status: "FINISHED",
      stage: "REGULAR_SEASON",
      groupName: null,
      regularTimeHome: null,
      regularTimeAway: null,
      extraTimeHome: null,
      extraTimeAway: null,
      penaltiesHome: null,
      penaltiesAway: null,
      homeTeamProviderId: 996100 + home,
      homeTeamName: `Integration ${home}`,
      awayTeamProviderId: 996100 + away,
      awayTeamName: `Integration ${away}`,
      homeGoals: score[0],
      awayGoals: score[1],
    };
  }

  it("measures each completed season from what is stored, leaving the season in progress out", async () => {
    await db.insert(matches).values([
      ...RESULTS.map((result, index) => row(IDS[index] as number, 2030, result)),
      // The season in progress: not a point.
      ...RESULTS.map((result, index) => row(IDS[index + 6] as number, 2031, result)),
    ]);

    await expect(getSeasonMovements(FD_CODE, 2031)).resolves.toEqual([
      { seasonId: 2030, movement: { total: 2, teams: 4 } },
    ]);
  });
});

describe("a domestic competition's completed seasons (specs/050)", () => {
  function row(
    id: number,
    seasonId: number,
    competitionCode: string,
    [round, home, away, score]: (typeof RESULTS)[number]
  ) {
    return {
      providerMatchId: id,
      competitionCode,
      categoryId: TASO_CODE,
      seasonId,
      groupId: 1,
      groupName: "Runkosarja",
      kickoffAt: new Date(`${seasonId}-05-0${round}T15:00:00Z`),
      matchday: round,
      status: "FINISHED",
      winner: null,
      homeTeamProviderId: 996100 + home,
      homeTeamName: `Integration ${home}`,
      awayTeamProviderId: 996100 + away,
      awayTeamName: `Integration ${away}`,
      homeGoals: score[0],
      awayGoals: score[1],
    };
  }

  it("keeps each season to its own competition, and leaves the season in progress out", async () => {
    await db.insert(tasoMatches).values([
      ...RESULTS.map((result, index) => row(IDS[index] as number, 2030, "spljp30", result)),
      // Another competition under the same category that season: a cup's
      // rounds would reorder the table if they counted.
      row(IDS[6] as number, 2030, "Liigacup30", [3, 4, 1, [9, 0]]),
      ...RESULTS.map((result, index) => row(IDS[index + 7] as number, 2031, "spljp31", result)),
    ]);

    await expect(getTasoSeasonMovements(TASO_CODE, 2031)).resolves.toEqual([
      { seasonId: 2030, movement: { total: 2, teams: 4 } },
    ]);
  });
});
