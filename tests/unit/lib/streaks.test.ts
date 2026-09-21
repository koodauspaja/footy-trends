import { describe, expect, it } from "vitest";
import type { NormalizedMatch } from "@/lib/standings";
import { streaksOf } from "@/lib/streaks";

/**
 * Team 1's season, written as outcomes: `W` won, `D` drew, `L` lost. Every
 * match is against team 9, alternating home and away so both sides are read,
 * one per day so kickoff decides the order.
 */
function season(outcomes: string): NormalizedMatch[] {
  return [...outcomes].map((outcome, index) => {
    const goals = { W: [2, 0], D: [1, 1], L: [0, 2] }[outcome] ?? [0, 0];
    const [own, other] = goals;
    const home = index % 2 === 0;
    return {
      providerMatchId: index + 1,
      competitionCode: "PL",
      seasonId: 2025,
      kickoffAt: new Date(`2025-09-${String(index + 1).padStart(2, "0")}T15:00:00Z`),
      matchday: index + 1,
      homeTeamProviderId: home ? 1 : 9,
      homeTeamName: home ? "Team 1" : "Team 9",
      awayTeamProviderId: home ? 9 : 1,
      awayTeamName: home ? "Team 9" : "Team 1",
      homeGoals: (home ? own : other) ?? 0,
      awayGoals: (home ? other : own) ?? 0,
    };
  });
}

const streaks = (outcomes: string) => streaksOf(season(outcomes), 1);

describe("the current streak", () => {
  it("is the run the team is on now, counted back from its last match", () => {
    expect(streaks("LLWWW").current).toEqual({ outcome: "win", length: 3 });
  });

  it("is a run of defeats when that is what it is on", () => {
    expect(streaks("WWLL").current).toEqual({ outcome: "defeat", length: 2 });
  });

  it("is a run of draws, which is neither of the other two", () => {
    expect(streaks("WDD").current).toEqual({ outcome: "draw", length: 2 });
  });

  it("is one match after a season's first", () => {
    expect(streaks("W").current).toEqual({ outcome: "win", length: 1 });
  });

  it("does not exist before the first match", () => {
    expect(streaks("").current).toBeNull();
  });
});

describe("the longest runs", () => {
  it("counts wins, unbeaten, defeats and winless over one season", () => {
    // W W D L L D W: unbeaten is the first three, winless the middle four.
    expect(streaks("WWDLLDW").longest).toEqual({
      wins: { length: 2, from: 1, to: 2 },
      unbeaten: { length: 3, from: 1, to: 3 },
      defeats: { length: 2, from: 4, to: 5 },
      winless: { length: 4, from: 3, to: 6 },
    });
  });

  it("reports the first of two equally long runs", () => {
    // Two runs of two wins: matches 1–2 and 5–6.
    expect(streaks("WWLLWW").longest.wins).toEqual({ length: 2, from: 1, to: 2 });
  });

  it("has no run of a kind the season never had", () => {
    const perfect = streaks("WWW").longest;

    expect(perfect.defeats).toBeNull();
    expect(perfect.winless).toBeNull();
    expect(perfect.wins).toEqual({ length: 3, from: 1, to: 3 });
    // Unbeaten counts the same three matches, which is correct: they are.
    expect(perfect.unbeaten).toEqual({ length: 3, from: 1, to: 3 });
  });

  it("counts a draw into unbeaten and into winless, and out of both others", () => {
    const withDraw = streaks("WDL").longest;

    expect(withDraw.wins).toEqual({ length: 1, from: 1, to: 1 });
    expect(withDraw.unbeaten).toEqual({ length: 2, from: 1, to: 2 });
    expect(withDraw.defeats).toEqual({ length: 1, from: 3, to: 3 });
    expect(withDraw.winless).toEqual({ length: 2, from: 2, to: 3 });
  });

  it("has nothing at all before the first match", () => {
    expect(streaks("").longest).toEqual({
      wins: null,
      unbeaten: null,
      defeats: null,
      winless: null,
    });
  });

  it("spans the whole season when it never ends", () => {
    expect(streaks("DDDD").longest.unbeaten).toEqual({ length: 4, from: 1, to: 4 });
  });
});

describe("which matches count", () => {
  it("reads the team's own side, home or away", () => {
    // The fixture alternates sides; a mirror-reading would turn W into L.
    expect(streaks("WWWW").longest.wins?.length).toBe(4);
    expect(streaks("LLLL").longest.defeats?.length).toBe(4);
  });

  it("ignores every other team's matches", () => {
    const others = season("WW").map((match) => ({
      ...match,
      providerMatchId: match.providerMatchId + 100,
      homeTeamProviderId: 7,
      awayTeamProviderId: 8,
    }));

    expect(streaksOf([...season("WWL"), ...others], 1)).toEqual(streaks("WWL"));
  });

  it("orders by kickoff, not by the order given", () => {
    expect(streaksOf(season("WWL").toReversed(), 1)).toEqual(streaks("WWL"));
  });
});
