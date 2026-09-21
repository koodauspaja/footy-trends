import { describe, expect, it } from "vitest";
import { cleanSheetSeries } from "@/lib/clean-sheets";
import { formSeries } from "@/lib/form-series";
import { calculateStandings, type NormalizedMatch } from "@/lib/standings";

/** A finished match on `day` of September; the day is what orders them. */
function result(
  day: number,
  home: number,
  away: number,
  homeGoals: number,
  awayGoals: number
): NormalizedMatch {
  return {
    providerMatchId: day * 100 + home * 10 + away,
    competitionCode: "PL",
    seasonId: 2025,
    kickoffAt: new Date(`2025-09-${String(day).padStart(2, "0")}T15:00:00Z`),
    matchday: 40 - day,
    homeTeamProviderId: home,
    homeTeamName: `Team ${home}`,
    awayTeamProviderId: away,
    awayTeamName: `Team ${away}`,
    homeGoals,
    awayGoals,
  };
}

/**
 * Team 1 concedes 0, 1, 0, 2, 0 — three clean sheets in five, the last of them
 * away. Listed out of order on purpose; kickoff decides.
 */
const season = [
  result(3, 1, 4, 2, 0),
  result(1, 1, 2, 3, 0),
  result(5, 5, 1, 0, 1),
  result(2, 3, 1, 1, 1),
  result(4, 1, 6, 1, 2),
];

function shares(matches: NormalizedMatch[] = season) {
  return cleanSheetSeries(matches, 1).points.map((point) => [point.match, point.kept, point.share]);
}

describe("cleanSheetSeries", () => {
  it("keeps a running share, in kickoff order, from the first match", () => {
    expect(shares()).toEqual([
      [1, 1, 100],
      [2, 1, 50],
      [3, 2, (2 / 3) * 100],
      [4, 2, 50],
      [5, 3, 60],
    ]);
  });

  it("counts a clean sheet from the team's own side, home or away", () => {
    // Team 1's away matches are the 2nd and the 5th; the 0–1 at the 5th is a
    // clean sheet read from the away side.
    expect(cleanSheetSeries(season, 1).points.at(-1)).toEqual({ match: 5, kept: 3, share: 60 });
  });

  it("ends at the team's own clean sheets over the season", () => {
    // The property the panel rests on: the last point is the season's rate,
    // over the same matches `calculateStandings` counts.
    const row = calculateStandings(season).find((team) => team.teamProviderId === 1);
    const last = cleanSheetSeries(season, 1).points.at(-1);

    expect(last?.match).toBe(row?.played);
    expect(last?.share).toBe(((last?.kept ?? 0) / (row?.played ?? 1)) * 100);
  });

  it("numbers its matches exactly as the form chart does", () => {
    const form = formSeries(season, 1);
    if (form.status !== "ok") throw new Error("expected a form series");

    expect(cleanSheetSeries(season, 1).points.map((point) => point.match)).toContainEqual(
      form.points[0]?.match
    );
  });

  it("sits at 0 for a team that has never kept one", () => {
    const leaky = season.map((match) =>
      match.homeTeamProviderId === 1
        ? { ...match, awayGoals: match.awayGoals + 1 }
        : { ...match, homeGoals: match.homeGoals + 1 }
    );

    expect(cleanSheetSeries(leaky, 1).points.map((point) => point.share)).toEqual([0, 0, 0, 0, 0]);
  });

  it("ignores every other team's matches", () => {
    const withOthers = [...season, result(6, 7, 8, 0, 0)];

    expect(shares(withOthers)).toEqual(shares());
  });

  it("has no points before the first match", () => {
    expect(cleanSheetSeries([], 1)).toEqual({ status: "ok", points: [] });
  });
});
