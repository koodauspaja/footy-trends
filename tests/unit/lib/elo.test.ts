import { describe, expect, it } from "vitest";
import {
  ELO_HOME_ADVANTAGE,
  ELO_K,
  ELO_MODEL,
  ELO_REGRESSION,
  ELO_START,
  type EloMatch,
  expectedHome,
  homeScore,
  type PlayedMatch,
  predictElo,
  ratingFor,
  replayElo,
  splitThreeWay,
  threeWay,
} from "@/lib/elo";

/**
 * The Elo arithmetic: the constants, the expected score, the three-way
 * probabilities, a team's rating, the replay over a history, and the
 * prediction.
 *
 * decisions/053-elo-ratings.md
 * decisions/059-cup-predictions.md
 * decisions/060-elo-variants.md
 */

let nextId = 1;
function played(
  day: number,
  homeTeam: number,
  awayTeam: number,
  homeGoals: number,
  awayGoals: number,
  overrides: Partial<EloMatch> = {}
): EloMatch {
  return {
    source: "taso",
    code: "VL",
    seasonId: 2025,
    providerMatchId: nextId++,
    kickoffAt: new Date(Date.UTC(2025, 4, day, 15)),
    homeTeam,
    awayTeam,
    homeGoals,
    awayGoals,
    ...overrides,
  };
}

describe("the constants", () => {
  it("are the classic football values, named in the model", () => {
    expect({ ELO_MODEL, ELO_START, ELO_K, ELO_HOME_ADVANTAGE, ELO_REGRESSION }).toEqual({
      ELO_MODEL: "elo-v1",
      ELO_START: 1500,
      ELO_K: 20,
      ELO_HOME_ADVANTAGE: 60,
      ELO_REGRESSION: 1 / 3,
    });
  });
});

describe("expectedHome", () => {
  it("gives the home side its 60 points", () => {
    expect(expectedHome(1500, 1500)).toBeCloseTo(1 / (1 + 10 ** (-60 / 400)), 12);
    expect(expectedHome(1500, 1560)).toBeCloseTo(0.5, 12);
  });

  it("rises with the home side's rating and falls with the away side's", () => {
    expect(expectedHome(1600, 1500)).toBeGreaterThan(expectedHome(1500, 1500));
    expect(expectedHome(1500, 1600)).toBeLessThan(expectedHome(1500, 1500));
  });
});

describe("threeWay", () => {
  it("takes the draw share as the draw and splits the rest by the expectation", () => {
    const result = threeWay(1500, 1560, 0.25);

    expect(result.draw).toBe(0.25);
    expect(result.home).toBeCloseTo(0.375, 12);
    expect(result.away).toBeCloseTo(0.375, 12);
    expect(result.home + result.draw + result.away).toBeCloseTo(1, 12);
  });
});

describe("ratingFor", () => {
  const ratings = new Map([[7, { rating: 1650, seasonId: 2025 }]]);

  it("starts an unknown team at 1500", () => {
    expect(ratingFor(ratings, 8, 2025)).toBe(1500);
  });

  it("keeps a rating within its season, and an older season's match does not regress it", () => {
    expect(ratingFor(ratings, 7, 2025)).toBe(1650);
    expect(ratingFor(ratings, 7, 2024)).toBe(1650);
  });

  it("moves a third of the way back to 1500 at the team's first match of a later season", () => {
    expect(ratingFor(ratings, 7, 2026)).toBeCloseTo(1600, 12);
    expect(ratingFor(new Map([[7, { rating: 1350, seasonId: 2025 }]]), 7, 2027)).toBeCloseTo(
      1400,
      12
    );
  });
});

describe("replayElo", () => {
  it("moves both ratings by K times the surprise, in opposite directions", () => {
    const { ratings } = replayElo([played(1, 1, 2, 2, 0)]);
    const delta = ELO_K * (1 - expectedHome(1500, 1500));

    expect(ratings.get(1)?.rating).toBeCloseTo(1500 + delta, 12);
    expect(ratings.get(2)?.rating).toBeCloseTo(1500 - delta, 12);
  });

  it("scores a level result as half, so a draw moves the home side down", () => {
    const { ratings } = replayElo([played(1, 1, 2, 1, 1)]);

    expect(ratings.get(1)?.rating).toBeCloseTo(1500 + ELO_K * (0.5 - expectedHome(1500, 1500)), 12);
    expect(ratings.get(1)?.rating).toBeLessThan(1500);
  });

  it("replays in kickoff order, whatever order the matches arrive in", () => {
    const first = played(1, 1, 2, 3, 0);
    const second = played(2, 2, 1, 3, 0);

    const inOrder = replayElo([first, second]).ratings.get(1)?.rating;
    const reversed = replayElo([second, first]).ratings.get(1)?.rating;

    expect(reversed).toBe(inOrder);
  });

  it("rates matches at one kickoff from the ratings before any of them", () => {
    const opener = played(1, 1, 2, 4, 0);
    const together = [played(5, 1, 3, 0, 0), played(5, 2, 4, 0, 0)];
    const seen: Array<[number, number, number]> = [];

    replayElo([opener, ...together], (match, home, away) => {
      seen.push([match.providerMatchId, home, away]);
    });
    const afterOpener = replayElo([opener]).ratings;

    expect(seen.slice(1)).toEqual([
      [together[0]?.providerMatchId, afterOpener.get(1)?.rating, 1500],
      [together[1]?.providerMatchId, afterOpener.get(2)?.rating, 1500],
    ]);
  });

  it("rates even the same pairing twice at one kickoff from the ratings before either", () => {
    // Two different matches never share a team at one moment, so only a
    // stored duplicate can show the rule: neither copy informs the other.
    const seen: Array<[number, number]> = [];
    replayElo([played(1, 1, 2, 3, 0), played(1, 1, 2, 3, 0)], (_match, home, away) => {
      seen.push([home, away]);
    });

    expect(seen).toEqual([
      [1500, 1500],
      [1500, 1500],
    ]);
  });

  it("keeps both updates when one team is in two matches at one kickoff", () => {
    const { ratings, history } = replayElo([played(1, 1, 2, 3, 0), played(1, 1, 2, 3, 0)]);
    const delta = ELO_K * (1 - expectedHome(1500, 1500));

    expect(ratings.get(1)?.rating).toBeCloseTo(1500 + 2 * delta, 12);
    expect(ratings.get(2)?.rating).toBeCloseTo(1500 - 2 * delta, 12);
    expect(history.get(1)?.map((point) => point.rating)).toEqual([
      expect.closeTo(1500 + 2 * delta, 12),
      expect.closeTo(1500 + 2 * delta, 12),
    ]);
  });

  it("regresses a team at its first match of a new season, before rating it", () => {
    const seen: number[] = [];
    const lastSeason = played(1, 1, 2, 5, 0);
    const before = replayElo([lastSeason]).ratings.get(1)?.rating ?? 0;

    replayElo([lastSeason, played(2, 1, 3, 0, 0, { seasonId: 2026 })], (match, home) => {
      if (match.seasonId === 2026) seen.push(home);
    });

    expect(seen).toEqual([expect.closeTo(before + (1500 - before) / 3, 12)]);
  });

  it("never rates a placeholder side, nor its opponent from that match", () => {
    const { ratings, history } = replayElo([played(1, 0, 2, 2, 0), played(2, 1, 0, 0, 3)]);

    expect(ratings.size).toBe(0);
    expect(history.size).toBe(0);
  });

  it("keeps each team's rating after every match it played, in order", () => {
    const { history } = replayElo([played(2, 1, 3, 0, 1), played(1, 1, 2, 1, 0)]);

    expect(history.get(1)?.map((point) => point.kickoffAt.getUTCDate())).toEqual([1, 2]);
    expect(history.get(1)?.[0]).toMatchObject({ seasonId: 2025 });
    expect(history.get(3)).toHaveLength(1);
  });
});

describe("predictElo", () => {
  const ratings = new Map([
    [1, { rating: 1600, seasonId: 2025 }],
    [2, { rating: 1500, seasonId: 2025 }],
  ]);

  it("predicts from the two ratings and the draw share, naming the ratings used", () => {
    const result = predictElo(ratings, 1, 2, 2025, 0.2);

    expect(result).toEqual({
      prediction: threeWay(1600, 1500, 0.2),
      homeRating: 1600,
      awayRating: 1500,
    });
  });

  it("applies the season regression to a match of a new season", () => {
    expect(predictElo(ratings, 1, 2, 2026, 0.2)?.homeRating).toBeCloseTo(1600 - 100 / 3, 12);
  });

  it("predicts nothing for a placeholder side", () => {
    expect(predictElo(ratings, 0, 2, 2025, 0.2)).toBeNull();
    expect(predictElo(ratings, 1, 0, 2025, 0.2)).toBeNull();
  });
});

describe("a cup tie in the replay", () => {
  // Teams 1 and 2 play the league; 3 has played only the cup.
  const league = [played(1, 1, 2, 2, 0), played(8, 2, 1, 1, 1)];
  const cup = (
    day: number,
    homeTeam: number,
    awayTeam: number,
    homeGoals: number,
    awayGoals: number
  ) => played(day, homeTeam, awayTeam, homeGoals, awayGoals, { code: "MSC", cup: true });

  it("moves no rating and adds nothing to any team's history", () => {
    const without = replayElo(league);
    const withCups = replayElo([...league, cup(4, 2, 1, 5, 0), cup(10, 1, 2, 0, 3)]);

    expect(withCups.ratings).toEqual(without.ratings);
    expect(withCups.history).toEqual(without.history);
  });

  it("is predicted from the ratings both sides had at its kickoff", () => {
    const tie = cup(4, 2, 1, 0, 0);
    const seen: Array<[number, number, number]> = [];
    replayElo([...league, tie], (match, home, away) => {
      seen.push([match.providerMatchId, home, away]);
    });
    const before = replayElo([league[0] as EloMatch]).ratings;

    expect(seen.find(([id]) => id === tie.providerMatchId)).toEqual([
      tie.providerMatchId,
      ratingFor(before, 2, 2025),
      ratingFor(before, 1, 2025),
    ]);
  });

  it.each([
    ["home", 3, 1],
    ["away", 1, 3],
  ] as const)(
    "is not predicted when the %s side has never played a rated match",
    (_side, home, away) => {
      const tie = cup(4, home, away, 1, 0);
      const seen: number[] = [];
      replayElo([...league, tie], (match) => seen.push(match.providerMatchId));

      expect(seen).not.toContain(tie.providerMatchId);
    }
  );

  it("is not predicted from a league match at the same kickoff", () => {
    // Team 3's first league match kicks off with the tie, so it is not yet rated.
    const tie = cup(5, 3, 1, 1, 0);
    const seen: number[] = [];
    replayElo([...league, played(5, 3, 2, 1, 0), tie], (match) => seen.push(match.providerMatchId));

    expect(seen).not.toContain(tie.providerMatchId);
  });
});

describe("expectedHome with a home advantage of its own", () => {
  it("takes the given advantage in place of 60, and 60 when given none", () => {
    expect(expectedHome(1500, 1500, 0)).toBe(0.5);
    expect(expectedHome(1500, 1600, 100)).toBe(0.5);
    expect(expectedHome(1550, 1500, 60)).toBe(expectedHome(1550, 1500));
  });
});

describe("splitThreeWay and homeScore", () => {
  it("splits a home side's expected score as threeWay does from two ratings", () => {
    expect(splitThreeWay(expectedHome(1600, 1450), 0.3)).toEqual(threeWay(1600, 1450, 0.3));
    expect(splitThreeWay(0.6, 0.25)).toEqual({ home: 0.75 * 0.6, draw: 0.25, away: 0.75 * 0.4 });
  });

  it("scores a home win 1, a draw a half and a loss 0", () => {
    expect(
      [played(1, 1, 2, 2, 1), played(1, 1, 2, 1, 1), played(1, 1, 2, 0, 3)].map(homeScore)
    ).toEqual([1, 0.5, 0]);
  });
});

describe("replayElo's onPlayed", () => {
  it("hands over each kickoff's league matches, at the ratings they were played at, in kickoff order", () => {
    const first = played(1, 1, 2, 2, 0);
    const together = [played(2, 1, 3, 1, 0), played(2, 2, 4, 0, 0)];
    const tie = played(2, 3, 4, 0, 1, { code: "MSC", cup: true });
    const kickoffs: PlayedMatch[][] = [];

    replayElo([...together, tie, first], undefined, (played) => kickoffs.push([...played]));

    const moved = ELO_K * (1 - expectedHome(1500, 1500));
    expect(kickoffs).toEqual([
      [{ match: first, home: 1500, away: 1500 }],
      [
        { match: together[0], home: 1500 + moved, away: 1500 },
        { match: together[1], home: 1500 - moved, away: 1500 },
      ],
    ]);
  });

  it("changes nothing elo-v1 rates or predicts", () => {
    const history = [
      played(3, 2, 1, 1, 1),
      played(1, 1, 2, 2, 0),
      played(2, 3, 1, 0, 2),
      played(2, 1, 3, 0, 0, { code: "MSC", cup: true }),
      played(4, 3, 2, 1, 0, { seasonId: 2026 }),
    ];
    const without: unknown[] = [];
    const withIt: unknown[] = [];

    const plain = replayElo(history, (...args) => without.push(args));
    const watched = replayElo(
      history,
      (...args) => withIt.push(args),
      () => undefined
    );

    expect(watched).toEqual(plain);
    expect(withIt).toEqual(without);
  });
});
