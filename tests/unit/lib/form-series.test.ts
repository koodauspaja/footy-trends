import { describe, expect, it } from "vitest";
import { FORM_WINDOW, formSeries, type ResultMatch } from "@/lib/form-series";
import { calculateStandings, type NormalizedMatch } from "@/lib/standings";

/**
 * A finished match on `day` of September. `home` scores `homeGoals`. The day
 * is what orders them — deliberately not the order they are listed in.
 */
function result(
  day: number,
  home: number,
  away: number,
  homeGoals: number,
  awayGoals: number,
  matchday: number | null = day
): NormalizedMatch {
  return {
    providerMatchId: day * 100 + home * 10 + away,
    competitionCode: "PL",
    seasonId: 2025,
    kickoffAt: new Date(`2025-09-${String(day).padStart(2, "0")}T15:00:00Z`),
    matchday,
    homeTeamProviderId: home,
    homeTeamName: `Team ${home}`,
    awayTeamProviderId: away,
    awayTeamName: `Team ${away}`,
    homeGoals,
    awayGoals,
  };
}

/** Team 1's results, W W D L W L D W: 3 3 1 0 3 0 1 3 points. */
const season = [
  result(1, 1, 2, 2, 0),
  result(2, 3, 1, 0, 1),
  result(3, 1, 4, 1, 1),
  result(4, 5, 1, 2, 0),
  result(5, 1, 6, 3, 1),
  result(6, 1, 2, 0, 1),
  result(7, 3, 1, 2, 2),
  result(8, 4, 1, 0, 4),
];

function formOf(series: ReturnType<typeof formSeries>) {
  if (series.status !== "ok") throw new Error(`expected a series, got ${series.status}`);
  return series.points;
}

describe("formSeries", () => {
  it("is the `Vire` column's five", () => {
    expect(FORM_WINDOW).toBe(5);
  });

  it("gives points per match over each match and the four before it, from the fifth", () => {
    expect(formOf(formSeries(season, 1))).toEqual([
      { match: 5, form: (3 + 3 + 1 + 0 + 3) / 5 },
      { match: 6, form: (3 + 1 + 0 + 3 + 0) / 5 },
      { match: 7, form: (1 + 0 + 3 + 0 + 1) / 5 },
      { match: 8, form: (0 + 3 + 0 + 1 + 3) / 5 },
    ]);
  });

  it("reads the result from the away side too", () => {
    // Team 1 is the away side every time: its goals are the second number.
    const onlyAway = [
      result(1, 9, 1, 0, 2),
      result(2, 9, 1, 1, 1),
      result(3, 9, 1, 3, 0),
      result(4, 9, 1, 0, 1),
      result(5, 9, 1, 2, 2),
    ];

    expect(formOf(formSeries(onlyAway, 1))).toEqual([{ match: 5, form: (3 + 1 + 0 + 3 + 1) / 5 }]);
  });

  it("orders by kickoff, not by the order given or by round", () => {
    // Listed backwards, with rounds numbered against the calendar, as TASO's
    // Mestaruussarja is (#413): kickoff alone decides.
    const scrambled = season.map((match, index) => ({ ...match, matchday: 40 - index })).reverse();

    expect(formOf(formSeries(scrambled, 1))).toEqual(formOf(formSeries(season, 1)));
  });

  it("counts a match with no round, as `Vire` does", () => {
    const withoutRounds = season.map((match) => ({ ...match, matchday: null }));

    expect(formOf(formSeries(withoutRounds, 1))).toHaveLength(4);
  });

  it("breaks a kickoff tie by match id, so the order is stable", () => {
    // Two matches of team 1 at one kickoff cannot happen; if the data ever has
    // it, the lower id comes first whatever order they arrive in.
    const tied: ResultMatch[] = [
      result(1, 1, 2, 1, 0),
      result(2, 1, 3, 1, 0),
      result(3, 1, 4, 1, 0),
      result(4, 1, 5, 1, 0),
      { ...result(5, 1, 6, 0, 1), providerMatchId: 2 },
      { ...result(5, 1, 7, 1, 0), providerMatchId: 1 },
    ];

    expect(formOf(formSeries(tied, 1)).map((point) => point.form)).toEqual([
      (3 + 3 + 3 + 3 + 3) / 5,
      (3 + 3 + 3 + 3 + 0) / 5,
    ]);
    expect(formOf(formSeries(tied.toReversed(), 1))).toEqual(formOf(formSeries(tied, 1)));
  });

  it("ignores every other team's matches", () => {
    const withOthers = [...season, result(9, 7, 8, 5, 0), result(10, 8, 7, 0, 5)];

    expect(formOf(formSeries(withOthers, 1))).toEqual(formOf(formSeries(season, 1)));
  });

  it("has no series before the fifth match", () => {
    expect(formSeries(season.slice(0, 4), 1)).toEqual({ status: "too-few" });
    expect(formSeries([], 1)).toEqual({ status: "too-few" });
  });

  it("starts at exactly five matches", () => {
    expect(formOf(formSeries(season.slice(0, 5), 1))).toEqual([
      { match: 5, form: (3 + 3 + 1 + 0 + 3) / 5 },
    ]);
  });

  it("ends at the standings table's own `Vire`, in points", () => {
    // The property the feature rests on: the last point is what
    // `calculateStandings` shows in the Vire column, converted to points.
    const row = calculateStandings(season).find((team) => team.teamProviderId === 1);
    const points = { V: 3, T: 1, H: 0 } as const;
    const vire = (row?.form ?? []).reduce((total, entry) => total + points[entry.result], 0);

    expect(row?.form).toHaveLength(FORM_WINDOW);
    expect(formOf(formSeries(season, 1)).at(-1)?.form).toBe(vire / FORM_WINDOW);
  });
});
