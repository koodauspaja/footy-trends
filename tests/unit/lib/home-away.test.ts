import { describe, expect, it } from "vitest";
import {
  concededPerMatch,
  homeAwayStats,
  pointsPerMatch,
  type SideStats,
  scoredPerMatch,
  winPercentage,
} from "@/lib/home-away";
import { calculateStandings, type NormalizedMatch } from "@/lib/standings";

function result(
  id: number,
  home: number,
  away: number,
  homeGoals: number,
  awayGoals: number
): NormalizedMatch {
  return {
    providerMatchId: id,
    competitionCode: "PL",
    seasonId: 2025,
    kickoffAt: new Date(`2025-09-${String(id).padStart(2, "0")}T15:00:00Z`),
    matchday: id,
    homeTeamProviderId: home,
    homeTeamName: `Team ${home}`,
    awayTeamProviderId: away,
    awayTeamName: `Team ${away}`,
    homeGoals,
    awayGoals,
  };
}

/**
 * Team 1 at home: 3–0 W, 1–1 D, 0–2 L, 2–1 W. Away: 1–2 (a 2–1 for the home
 * side) L, 0–0 D, 3–1 W.
 */
const season = [
  result(1, 1, 2, 3, 0),
  result(2, 1, 3, 1, 1),
  result(3, 1, 4, 0, 2),
  result(4, 1, 5, 2, 1),
  result(5, 2, 1, 2, 1),
  result(6, 3, 1, 0, 0),
  result(7, 4, 1, 1, 3),
  result(8, 2, 3, 5, 5),
];

describe("homeAwayStats", () => {
  it("counts each side from the team's own side of the fixture", () => {
    expect(homeAwayStats(season, 1)).toEqual({
      home: { matches: 4, won: 2, drawn: 1, lost: 1, scored: 6, conceded: 4 },
      away: { matches: 3, won: 1, drawn: 1, lost: 1, scored: 4, conceded: 3 },
    });
  });

  it("adds up to the standings table's row", () => {
    // The property the panel rests on: home and away are the row, split.
    const { home, away } = homeAwayStats(season, 1);
    const row = calculateStandings(season).find((team) => team.teamProviderId === 1);

    expect(home.matches + away.matches).toBe(row?.played);
    expect(home.won + away.won).toBe(row?.won);
    expect(home.drawn + away.drawn).toBe(row?.drawn);
    expect(home.lost + away.lost).toBe(row?.lost);
    expect(home.scored + away.scored).toBe(row?.goalsFor);
    expect(home.conceded + away.conceded).toBe(row?.goalsAgainst);
    expect(3 * (home.won + away.won) + home.drawn + away.drawn).toBe(row?.points);
  });

  it("ignores every other team's matches", () => {
    expect(homeAwayStats(season, 1)).toEqual(homeAwayStats(season.slice(0, 7), 1));
  });

  it("has empty sides before the first match", () => {
    const empty = { matches: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0 };

    expect(homeAwayStats([], 1)).toEqual({ home: empty, away: empty });
  });

  it("keeps the sides apart: nothing counted on one leaks into the other", () => {
    const onlyHome = homeAwayStats(season.slice(0, 4), 1);

    expect(onlyHome.away.matches).toBe(0);
    expect(onlyHome.home.matches).toBe(4);
  });
});

describe("the measures", () => {
  const home: SideStats = { matches: 4, won: 2, drawn: 1, lost: 1, scored: 6, conceded: 4 };

  it("gives points, goals scored and goals conceded per match", () => {
    expect(pointsPerMatch(home)).toBe((3 * 2 + 1) / 4);
    expect(scoredPerMatch(home)).toBe(6 / 4);
    expect(concededPerMatch(home)).toBe(4 / 4);
  });

  it("gives the share of matches won, as a percentage", () => {
    expect(winPercentage(home)).toBe(50);
  });

  it("has no value for a side with no match, not a zero", () => {
    // `–` on the page (specs/033, Q7): a 0 would read as a real zero.
    const none: SideStats = { matches: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0 };

    expect(pointsPerMatch(none)).toBeNull();
    expect(scoredPerMatch(none)).toBeNull();
    expect(concededPerMatch(none)).toBeNull();
    expect(winPercentage(none)).toBeNull();
  });

  it("gives 0 for a side that played and never won", () => {
    const winless: SideStats = { matches: 3, won: 0, drawn: 1, lost: 2, scored: 1, conceded: 5 };

    expect(winPercentage(winless)).toBe(0);
    expect(pointsPerMatch(winless)).toBe(1 / 3);
  });
});
