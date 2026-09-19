import { describe, expect, it } from "vitest";
import { formSeries } from "@/lib/form-series";
import { goalsSeries } from "@/lib/goals-series";
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
 * Team 1, home and away. Its own goals first: 2–0, 1–1, 0–3, 4–1, 2–2, 0–1.
 * Listed out of order on purpose; kickoff decides.
 */
const season = [
  result(4, 5, 1, 1, 4),
  result(1, 1, 2, 2, 0),
  result(6, 3, 1, 1, 0),
  result(2, 3, 1, 1, 1),
  result(5, 1, 6, 2, 2),
  result(3, 1, 4, 0, 3),
];

describe("goalsSeries", () => {
  it("keeps running totals from the first match, from the team's own side", () => {
    expect(goalsSeries(season, 1).totals).toEqual([
      { match: 1, scored: 2, conceded: 0 },
      { match: 2, scored: 3, conceded: 1 },
      { match: 3, scored: 3, conceded: 4 },
      { match: 4, scored: 7, conceded: 5 },
      { match: 5, scored: 9, conceded: 7 },
      { match: 6, scored: 9, conceded: 8 },
    ]);
  });

  it("averages each match and the four before it, from the fifth", () => {
    expect(goalsSeries(season, 1).rolling).toEqual([
      { match: 5, scored: (2 + 1 + 0 + 4 + 2) / 5, conceded: (0 + 1 + 3 + 1 + 2) / 5 },
      { match: 6, scored: (1 + 0 + 4 + 2 + 0) / 5, conceded: (1 + 3 + 1 + 2 + 1) / 5 },
    ]);
  });

  it("ends its totals at the standings table's own TM and PM", () => {
    // The property the running-total chart rests on, against
    // `calculateStandings` itself.
    const row = calculateStandings(season).find((team) => team.teamProviderId === 1);

    expect(goalsSeries(season, 1).totals.at(-1)).toMatchObject({
      scored: row?.goalsFor,
      conceded: row?.goalsAgainst,
    });
  });

  it("numbers its matches exactly as the form chart does", () => {
    // The rolling chart sits under the form chart; the same x is the same match.
    const form = formSeries(season, 1);
    if (form.status !== "ok") throw new Error("expected a form series");

    expect(goalsSeries(season, 1).rolling.map((point) => point.match)).toEqual(
      form.points.map((point) => point.match)
    );
  });

  it("ignores every other team's matches", () => {
    const withOthers = [...season, result(7, 8, 9, 6, 0)];

    expect(goalsSeries(withOthers, 1)).toEqual(goalsSeries(season, 1));
  });

  it("has totals but no rolling points before the fifth match", () => {
    const series = goalsSeries(season.slice(0, 4), 1);

    expect(series.totals).toHaveLength(4);
    expect(series.rolling).toEqual([]);
  });

  it("has neither before the first match", () => {
    expect(goalsSeries([], 1)).toEqual({ status: "ok", rolling: [], totals: [] });
  });
});
