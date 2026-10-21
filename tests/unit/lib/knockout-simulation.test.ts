import { describe, expect, it, vi } from "vitest";
import {
  type ChampionsLeagueInput,
  forecastChampionsLeague,
  forecastCup,
  type GoalModel,
  LEAGUE_PHASE_ZONES,
  neutralMatch,
  type Odds,
  oddsOf,
  playTie,
  type StoredTie,
  type TieInPlay,
  tieChances,
  tieInPlay,
} from "@/lib/knockout-simulation";
import { scoreGrid } from "@/lib/poisson";
import { generator, type TableRow } from "@/lib/season-simulation";

/**
 * The knockout simulation: a tie's legs, extra time and penalties, UEFA's draw
 * and tree, a cup's drawn rounds, stored rounds, and the figures counted from
 * the runs.
 *
 * decisions/067-knockout-simulation.md
 */

const SPAN = 10;

// Cumulative shares with all of the mass on one goal difference.
function certain(difference: number): number[] {
  return Array.from({ length: 2 * SPAN + 1 }, (_, index) => (index >= difference + SPAN ? 1 : 0));
}

function fixedOdds(
  leg: number,
  extraTime: number
): Odds & { extraTimeAt: Array<[number, number]> } {
  const extraTimeAt: Array<[number, number]> = [];
  return {
    extraTimeAt,
    leg: () => certain(leg),
    extraTime: (home, away) => {
      extraTimeAt.push([home, away]);
      return certain(extraTime);
    },
  };
}

const TWO_LEGS: TieInPlay = {
  first: 1,
  second: 2,
  lead: 0,
  legs: [
    { home: 1, away: 2 },
    { home: 2, away: 1 },
  ],
  decider: { home: 2, away: 1 },
  atNeutralGround: false,
};

describe("playTie", () => {
  it("sends through the side ahead on aggregate, a leg's difference read from its home side", () => {
    // Each home side wins its leg by one: level on aggregate. A home win by two
    // in the first leg and by one in the second puts the first side through.
    const odds: Odds = {
      leg: (home) => certain(home === 1 ? 2 : 1),
      extraTime: () => certain(0),
    };

    expect(playTie(TWO_LEGS, odds, Math.random)).toBe(1);
  });

  it("counts a played first leg", () => {
    // 2–0 up from the first leg, the second lost by one.
    const tie = { ...TWO_LEGS, lead: 2, legs: [{ home: 2, away: 1 }] };

    expect(playTie(tie, fixedOdds(1, 0), Math.random)).toBe(1);
    // 1–0 up, the second leg lost by two.
    expect(playTie({ ...tie, lead: 1 }, fixedOdds(2, 0), Math.random)).toBe(2);
  });

  it("plays extra time at the last leg's ground when the aggregate is level", () => {
    const odds = fixedOdds(0, 1);

    expect(playTie(TWO_LEGS, odds, Math.random)).toBe(2);
    expect(odds.extraTimeAt).toEqual([[2, 1]]);
  });

  it("settles a tie still level after extra time by a shoot-out at even odds", () => {
    const odds = fixedOdds(0, 0);

    expect(playTie(TWO_LEGS, odds, () => 0.49)).toBe(1);
    expect(playTie(TWO_LEGS, odds, () => 0.5)).toBe(2);
  });

  it("goes to extra time with no leg left when the stored legs are level", () => {
    const tie = { ...TWO_LEGS, legs: [] };

    expect(playTie(tie, fixedOdds(5, -1), Math.random)).toBe(1);
  });
});

describe("tieInPlay", () => {
  const sides = {
    home: { teamProviderId: 1, teamName: "A" },
    away: { teamProviderId: 2, teamName: "B" },
  };

  it("counts the finished legs from the tie's first side and leaves the rest to play", () => {
    const tie: StoredTie = {
      key: "k",
      ...sides,
      winner: null,
      legs: [
        { home: 1, away: 2, score: { home: 3, away: 1 } },
        { home: 2, away: 1, score: null },
      ],
    };

    expect(tieInPlay(tie)).toEqual({
      first: 1,
      second: 2,
      lead: 2,
      legs: [{ home: 2, away: 1 }],
      decider: { home: 2, away: 1 },
      atNeutralGround: false,
    });
  });

  it("reads a leg the other way round from the second side", () => {
    const tie: StoredTie = {
      key: "k",
      ...sides,
      winner: null,
      legs: [{ home: 2, away: 1, score: { home: 3, away: 0 } }],
    };

    expect(tieInPlay(tie).lead).toBe(-3);
  });
});

describe("oddsOf", () => {
  const model: GoalModel = (home, away) => {
    const homeGoals = home === 1 ? 2.4 : 1.2;
    const awayGoals = away === 1 ? 1.5 : 0.6;
    return { homeGoals, awayGoals, grid: scoreGrid(homeGoals, awayGoals, 1.2) };
  };
  const masses = (shares: readonly number[]) =>
    shares.map((share, index) => share - (shares[index - 1] ?? 0));
  const differences = (grid: number[][]) => {
    const mass = new Array<number>(2 * SPAN + 1).fill(0);
    grid.forEach((row, home) => {
      row.forEach((cell, away) => {
        mass[home - away + SPAN] = (mass[home - away + SPAN] as number) + cell;
      });
    });
    return mass;
  };

  it("draws a leg from the pairing's grid at the first side's ground", () => {
    const expected = differences(scoreGrid(2.4, 0.6, 1.2));
    masses(oddsOf(model).leg(1, 2, false)).forEach((share, index) => {
      expect(share).toBeCloseTo(expected[index] as number, 12);
    });
  });

  it("draws a neutral match from the mean of both sides' grounds", () => {
    const atFirst = differences(scoreGrid(2.4, 0.6, 1.2));
    const atSecond = differences(scoreGrid(1.2, 1.5, 1.2)).toReversed();
    masses(oddsOf(model).leg(1, 2, true)).forEach((share, index) => {
      expect(share).toBeCloseTo(((atFirst[index] as number) + (atSecond[index] as number)) / 2, 12);
    });
  });

  it("draws extra time from a third of the expected goals on the plain grid", () => {
    const expected = differences(scoreGrid(0.8, 0.2, 1));
    masses(oddsOf(model).extraTime(1, 2, false)).forEach((share, index) => {
      expect(share).toBeCloseTo(expected[index] as number, 12);
    });
  });

  it("asks the model once per pairing and ground", () => {
    const counted = vi.fn(model);
    const odds = oddsOf(counted);
    odds.leg(1, 2, false);
    odds.leg(1, 2, false);
    odds.leg(2, 1, false);

    expect(counted).toHaveBeenCalledTimes(2);
  });

  it("draws a goal difference where the drawn number falls", () => {
    // A single match at a neutral ground between sides the model makes equal.
    const even: GoalModel = () => ({ homeGoals: 1, awayGoals: 1, grid: scoreGrid(1, 1, 1) });
    const random = generator(5);
    let first = 0;
    for (let run = 0; run < 4000; run += 1) {
      if (playTie(neutralMatch(1, 2), oddsOf(even), random) === 1) first += 1;
    }

    expect(first / 4000).toBeGreaterThan(0.45);
    expect(first / 4000).toBeLessThan(0.55);
  });
});

// Thirty-six sides whose ids are their league-phase places, the table final.
const TABLE: TableRow[] = Array.from({ length: 36 }, (_, index) => ({
  teamProviderId: index + 1,
  teamName: `Joukkue ${index + 1}`,
  points: 100 - index,
}));

function grid(difference: number): number[][] {
  const cells = Array.from({ length: SPAN + 1 }, () => new Array<number>(SPAN + 1).fill(0));
  const row = cells[Math.max(difference, 0)] as number[];
  row[Math.max(-difference, 0)] = 1;
  return cells;
}

// The better place wins every leg by three, wherever it is played.
const betterWins: GoalModel = (home, away) => ({
  homeGoals: home < away ? 30 : 0,
  awayGoals: home < away ? 0 : 30,
  grid: grid(home < away ? 3 : -3),
});

// The later place wins every leg by three: every tie an upset.
const worseWins: GoalModel = (home, away) => betterWins(away, home);

// 2 beats everyone; between any others, the better place wins.
const twoIsBest: GoalModel = (home, away) => {
  if (home === 2 || away === 2) return betterWins(home === 2 ? 0 : 99, away === 2 ? 0 : 99);
  return betterWins(home, away);
};

// The home side wins every leg by one, and extra time without fail.
const homeWins: GoalModel = () => ({ homeGoals: 300, awayGoals: 0, grid: grid(1) });

function recorded(model: GoalModel) {
  const met = new Set<string>();
  const recording: GoalModel = (home, away) => {
    met.add([home, away].toSorted((one, other) => one - other).join("-"));
    return model(home, away);
  };
  return { met, recording };
}

const NO_ROUNDS: ChampionsLeagueInput = { table: TABLE, fixtures: [], rounds: new Map() };

function opponentsOf(met: ReadonlySet<string>, team: number): number[] {
  return [...met]
    .map((pair) => pair.split("-").map(Number) as [number, number])
    .filter((pair) => pair.includes(team))
    .map(([one, other]) => (one === team ? other : one))
    .toSorted((one, other) => one - other);
}

describe("forecastChampionsLeague's draw", () => {
  const { met, recording } = recorded(betterWins);
  forecastChampionsLeague(NO_ROUNDS, recording, 400);

  it("pairs the play-offs 9/10 with 23/24, 11/12 with 21/22, 13/14 with 19/20, 15/16 with 17/18", () => {
    const sections: Array<[number[], number[]]> = [
      [
        [9, 10],
        [23, 24],
      ],
      [
        [11, 12],
        [21, 22],
      ],
      [
        [13, 14],
        [19, 20],
      ],
      [
        [15, 16],
        [17, 18],
      ],
    ];
    for (const [seeded, unseeded] of sections) {
      for (const team of seeded)
        expect(opponentsOf(met, team).filter((other) => other > 16)).toEqual(unseeded);
    }
  });

  it("pairs the last 16 1/2 with 15/16's winners, 3/4 with 13/14's, 5/6 with 11/12's, 7/8 with 9/10's", () => {
    const sections: Array<[number[], number[]]> = [
      [
        [1, 2],
        [15, 16],
      ],
      [
        [3, 4],
        [13, 14],
      ],
      [
        [5, 6],
        [11, 12],
      ],
      [
        [7, 8],
        [9, 10],
      ],
    ];
    for (const [seeded, winners] of sections) {
      for (const team of seeded)
        expect(opponentsOf(met, team).filter((other) => other > 8)).toEqual(winners);
    }
  });

  it("meets the 1/2 ties' winners with the 7/8 ties', the 3/4 ties' with the 5/6 ties', each at random", () => {
    // 1 and 2 meet each other too, in the final.
    expect(opponentsOf(met, 1).filter((other) => other <= 8)).toEqual([2, 3, 4, 7, 8]);
    expect(opponentsOf(met, 2).filter((other) => other <= 8)).toEqual([1, 3, 4, 7, 8]);
    for (const team of [3, 4])
      expect(opponentsOf(met, team).filter((other) => other <= 8)).toEqual([1, 2, 5, 6]);
  });

  it("keeps 1 and 2 in opposite halves until the final", () => {
    expect(opponentsOf(met, 1)).toContain(2);
    // 1 met 2 only in the final: whoever won it was 1, whom the better place beats.
    const forecast = forecastChampionsLeague(NO_ROUNDS, betterWins, 400);
    const [first, second] = forecast.rows;
    expect(first?.teamProviderId).toBe(1);
    expect(second?.teamProviderId).toBe(2);
    expect(second?.reached[3]?.share).toBe(1);
  });
});

describe("forecastChampionsLeague's seeds", () => {
  it("gives a drawn play-off's winner the seed it beat, and that seed's last 16 opponents", () => {
    // Every unseeded side wins its play-off and takes over 9 to 16: 17 and 18,
    // which beat 15 and 16, meet 1 and 2.
    const { met, recording } = recorded(worseWins);
    forecastChampionsLeague(NO_ROUNDS, recording, 100);

    expect(opponentsOf(met, 1).filter((other) => other > 8)).toEqual([17, 18]);
  });
});

describe("forecastChampionsLeague's venues", () => {
  it("gives the second leg to the better place, so a level tie's extra time is at its ground", () => {
    // Every leg a home win by one: every tie level, every extra time won at
    // home. Only the better place ever goes through, until the neutral final.
    const forecast = forecastChampionsLeague(NO_ROUNDS, homeWins, 400);
    const reachedFinal = forecast.rows.filter((row) => (row.reached[3]?.share ?? 0) > 0);

    expect(reachedFinal.map((row) => row.teamProviderId)).toEqual([1, 2]);
  });

  it("plays a simulated final at a neutral ground", () => {
    const forecast = forecastChampionsLeague(NO_ROUNDS, homeWins, 2000);
    const won = (team: number) =>
      forecast.rows.find((row) => row.teamProviderId === team)?.won.share ?? 0;

    expect(won(1)).toBeGreaterThan(0.4);
    expect(won(2)).toBeGreaterThan(0.4);
  });

  it("plays a stored final with its listed home side at home", () => {
    const final: StoredTie = {
      key: "final",
      home: { teamProviderId: 2, teamName: "Joukkue 2" },
      away: { teamProviderId: 1, teamName: "Joukkue 1" },
      winner: null,
      legs: [{ home: 2, away: 1, score: null }],
    };
    const forecast = forecastChampionsLeague(
      { ...NO_ROUNDS, rounds: new Map([["FINAL", [final]]]) },
      homeWins,
      200
    );

    expect(forecast.rows.find((row) => row.teamProviderId === 2)?.won.share).toBe(1);
  });
});

function decided(stage: string, home: number, away: number, winner: number | null): StoredTie {
  return {
    key: `${stage}:${home}-${away}`,
    home: { teamProviderId: home, teamName: `Joukkue ${home}` },
    away: { teamProviderId: away, teamName: `Joukkue ${away}` },
    winner,
    legs: [
      { home, away, score: winner === null ? null : { home: 0, away: 0 } },
      { home: away, away: home, score: null },
    ],
  };
}

// The play-offs as S9 pairs them, each won by `winner(seeded, unseeded)`.
function playoffs(winner: (seeded: number, unseeded: number) => number | null): StoredTie[] {
  const pairs: Array<[number, number]> = [
    [9, 24],
    [10, 23],
    [11, 22],
    [12, 21],
    [13, 20],
    [14, 19],
    [15, 18],
    [16, 17],
  ];
  return pairs.map(([seeded, unseeded]) =>
    decided("PLAYOFFS", unseeded, seeded, winner(seeded, unseeded))
  );
}

describe("forecastChampionsLeague's stored rounds", () => {
  it("uses a stored round's pairings as they are", () => {
    // 1 is stored against 9, which S9 would never draw for it.
    const lastSixteen = [
      decided("LAST_16", 9, 1, null),
      decided("LAST_16", 16, 2, null),
      ...[3, 4, 5, 6, 7, 8].map((seeded, index) =>
        decided("LAST_16", [15, 14, 13, 12, 11, 10][index] as number, seeded, null)
      ),
    ];
    const { met, recording } = recorded(betterWins);
    forecastChampionsLeague(
      {
        ...NO_ROUNDS,
        rounds: new Map([
          ["PLAYOFFS", playoffs((seeded) => seeded)],
          ["LAST_16", lastSixteen],
        ]),
      },
      recording,
      100
    );

    expect(opponentsOf(met, 1).filter((other) => other > 8)).toEqual([9]);
  });

  it("draws a round the provider holds only part of", () => {
    const { met, recording } = recorded(betterWins);
    forecastChampionsLeague(
      { ...NO_ROUNDS, rounds: new Map([["LAST_16", [decided("LAST_16", 9, 1, null)]]]) },
      recording,
      100
    );

    expect(opponentsOf(met, 1).filter((other) => other > 8)).toEqual([15, 16]);
  });

  it("puts out the loser of a decided tie and gives its winner the next round", () => {
    // The unseeded side wins every play-off.
    const forecast = forecastChampionsLeague(
      { ...NO_ROUNDS, rounds: new Map([["PLAYOFFS", playoffs((_seeded, unseeded) => unseeded)]]) },
      betterWins,
      100
    );
    const row = (team: number) =>
      forecast.rows.find((candidate) => candidate.teamProviderId === team);

    expect(row(9)).toBeUndefined();
    expect(row(24)?.reached[0]).toEqual({ share: 1, settled: true });
  });

  it("gives a play-off winner the seed it beat, and the last 16 opponent that seed has", () => {
    // 24 beat 9: it takes 9's seed and meets 7 or 8, as 9 would have.
    const { met, recording } = recorded(betterWins);
    forecastChampionsLeague(
      {
        ...NO_ROUNDS,
        rounds: new Map([
          ["PLAYOFFS", playoffs((seeded, unseeded) => (seeded === 9 ? unseeded : seeded))],
        ]),
      },
      recording,
      100
    );

    expect(opponentsOf(met, 24).filter((other) => other <= 8)).toEqual([7, 8]);
  });

  it("counts each stored, undecided tie's chance from its home side", () => {
    const forecast = forecastChampionsLeague(
      { ...NO_ROUNDS, rounds: new Map([["PLAYOFFS", playoffs(() => null)]]) },
      betterWins,
      100
    );

    expect(forecast.ties).toHaveLength(8);
    // Every tie's home side is the unseeded one, which the better place beats.
    expect(forecast.ties.every((tie) => tie.homeThrough === 0)).toBe(true);
  });

  it("has no tie chance for a decided tie", () => {
    const forecast = forecastChampionsLeague(
      { ...NO_ROUNDS, rounds: new Map([["PLAYOFFS", playoffs((seeded) => seeded)]]) },
      betterWins,
      100
    );

    expect(forecast.ties).toEqual([]);
  });

  it("uses stored semi-finals as they are", () => {
    const semiFinals = [decided("SEMI_FINALS", 4, 1, null), decided("SEMI_FINALS", 3, 2, null)];
    const { met, recording } = recorded(betterWins);
    forecastChampionsLeague(
      { ...NO_ROUNDS, rounds: new Map([["SEMI_FINALS", semiFinals]]) },
      recording,
      100
    );

    expect(opponentsOf(met, 1).filter((other) => other <= 4)).toEqual([2, 4]);
  });

  it("counts nothing for a stored side the league phase does not list", () => {
    // 99 is in no table: it wins the stored final at its own ground, with no
    // seed of its own and no row to count it in.
    const final: StoredTie = {
      ...decided("FINAL", 99, 1, null),
      legs: [{ home: 99, away: 1, score: null }],
    };
    const forecast = forecastChampionsLeague(
      { ...NO_ROUNDS, rounds: new Map([["FINAL", [final]]]) },
      homeWins,
      100
    );

    expect(forecast.rows.reduce((total, row) => total + row.won.share, 0)).toBe(0);
    expect(forecast.rows.some((row) => row.teamProviderId === 99)).toBe(false);
  });

  it("draws a two-legged round the provider holds without a return leg", () => {
    // Every play-off stored, one of them with its first leg only.
    const [first, ...rest] = playoffs(() => null) as [StoredTie, ...StoredTie[]];
    const ties = [{ ...first, legs: first.legs.slice(0, 1) }, ...rest];
    const forecast = forecastChampionsLeague(
      { ...NO_ROUNDS, rounds: new Map([["PLAYOFFS", ties]]) },
      betterWins,
      100
    );

    // Drawn, the round's ties are none of the stored ones.
    expect(forecast.ties).toEqual([]);
  });

  it("reads stored quarter-finals' halves before they are played", () => {
    // 8 has knocked out 1 and taken its seed. Read afterwards, the seeds would
    // put the 3–6 tie, listed first, beside 8 and the 2–7 tie with it.
    const quarterFinals = [
      decided("QUARTER_FINALS", 8, 1, 8),
      decided("QUARTER_FINALS", 6, 3, null),
      decided("QUARTER_FINALS", 7, 2, null),
      decided("QUARTER_FINALS", 5, 4, null),
    ];
    const { met, recording } = recorded(betterWins);
    forecastChampionsLeague(
      { ...NO_ROUNDS, rounds: new Map([["QUARTER_FINALS", quarterFinals]]) },
      recording,
      400
    );

    expect(opponentsOf(met, 8).filter((other) => other <= 4)).toEqual([3, 4]);
  });

  it("counts a stored round's own sides as the ones that reached it", () => {
    // 20 is stored in 16's place: 16 would have won its drawn play-off.
    const lastSixteen = [
      decided("LAST_16", 20, 1, null),
      ...[2, 3, 4, 5, 6, 7, 8].map((seeded, index) =>
        decided("LAST_16", [15, 14, 13, 12, 11, 10, 9][index] as number, seeded, null)
      ),
    ];
    const forecast = forecastChampionsLeague(
      { ...NO_ROUNDS, rounds: new Map([["LAST_16", lastSixteen]]) },
      betterWins,
      100
    );

    expect(forecast.rows.find((row) => row.teamProviderId === 16)?.reached[0]?.share).toBe(0);
  });

  it("places stored quarter-finals in the tree: the 1/2 ties apart, the 3/4–5/6 ties one each way", () => {
    const quarterFinals = [
      decided("QUARTER_FINALS", 8, 1, null),
      decided("QUARTER_FINALS", 7, 2, null),
      decided("QUARTER_FINALS", 6, 3, null),
      decided("QUARTER_FINALS", 5, 4, null),
    ];
    const { met, recording } = recorded(betterWins);
    forecastChampionsLeague(
      { ...NO_ROUNDS, rounds: new Map([["QUARTER_FINALS", quarterFinals]]) },
      recording,
      400
    );

    expect(opponentsOf(met, 1).filter((other) => other <= 4)).toEqual([2, 3, 4]);
    expect(opponentsOf(met, 3).filter((other) => other <= 4)).toEqual([1, 2]);
  });
});

describe("forecastChampionsLeague's figures", () => {
  it("settles the last 16 for a side the league phase has put in its top eight, and leaves out 25 to 36", () => {
    const forecast = forecastChampionsLeague(NO_ROUNDS, betterWins, 100);

    expect(forecast.rows).toHaveLength(24);
    expect(forecast.rows.find((row) => row.teamProviderId === 8)?.reached[0]).toEqual({
      share: 1,
      settled: true,
    });
    expect(forecast.rows.find((row) => row.teamProviderId === 9)?.reached[0]?.settled).toBe(false);
  });

  it("orders the sides by their chance of winning, then of each later round", () => {
    const forecast = forecastChampionsLeague(NO_ROUNDS, twoIsBest, 100);

    expect(forecast.rows.slice(0, 2).map((row) => row.teamProviderId)).toEqual([2, 1]);
  });

  it("shows the league phase while it has a fixture left, with its three stretches of places", () => {
    const fixtures = [
      { homeTeam: 1, awayTeam: 36, prediction: { home: 0.6, draw: 0.2, away: 0.2 } },
    ];
    const forecast = forecastChampionsLeague({ ...NO_ROUNDS, fixtures }, betterWins, 100);

    expect(forecast.leaguePhase).toHaveLength(36);
    expect(forecast.leaguePhase?.[0]?.zones).toHaveLength(LEAGUE_PHASE_ZONES.length);
    expect(forecastChampionsLeague(NO_ROUNDS, betterWins, 100).leaguePhase).toBeNull();
  });

  it("plays the knockout on from each run's own league-phase order", () => {
    // 36 level with 8th, the one fixture left between them: won, it finishes
    // sixth and goes straight to the last 16; lost, ninth, where it loses its
    // play-off to an earlier side.
    const table = TABLE.map((row) => (row.teamProviderId === 36 ? { ...row, points: 93 } : row));
    const fixtures = [{ homeTeam: 8, awayTeam: 36, prediction: { home: 0.5, draw: 0, away: 0.5 } }];
    const forecast = forecastChampionsLeague({ ...NO_ROUNDS, table, fixtures }, betterWins, 2000);
    const lastSixteen =
      forecast.rows.find((row) => row.teamProviderId === 36)?.reached[0]?.share ?? 0;

    expect(lastSixteen).toBeGreaterThan(0.45);
    expect(lastSixteen).toBeLessThan(0.55);
  });

  it("gives the same figures from the same data", () => {
    expect(forecastChampionsLeague(NO_ROUNDS, homeWins, 300)).toEqual(
      forecastChampionsLeague(NO_ROUNDS, homeWins, 300)
    );
  });
});

// A cup tie, one match at its listed home side's ground; decided, won by one.
function cupTie(home: number, away: number, winner: number | null = null): StoredTie {
  return {
    key: `cup:${home}-${away}`,
    home: { teamProviderId: home, teamName: `Joukkue ${home}` },
    away: { teamProviderId: away, teamName: `Joukkue ${away}` },
    winner,
    legs: [
      {
        home,
        away,
        score:
          winner === null ? null : { home: Number(winner === home), away: Number(winner === away) },
      },
    ],
  };
}

// A cup's round of 16: 1 to 8 each drawn against the side eight places on, at its ground.
const CUP_LAST_SIXTEEN = Array.from({ length: 8 }, (_, index) => cupTie(index + 9, index + 1));

const cupRow = (forecast: ReturnType<typeof forecastCup>, team: number) =>
  forecast.rows.find((row) => row.teamProviderId === team);

describe("forecastCup", () => {
  it("draws a round not yet stored at random from every side left", () => {
    const { met, recording } = recorded(betterWins);
    forecastCup({ rounds: [CUP_LAST_SIXTEEN] }, recording, 300);

    // 1 to 8 go through, and any of them can be 1's next opponent.
    expect(opponentsOf(met, 1)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("plays a drawn tie at a neutral ground, and a stored one at its listed home side's", () => {
    const asked = new Set<string>();
    const recording: GoalModel = (home, away) => {
      asked.add(`${home}-${away}`);
      return betterWins(home, away);
    };
    forecastCup({ rounds: [CUP_LAST_SIXTEEN] }, recording, 50);
    const drawn = [...asked].filter((pair) => pair.split("-").every((team) => Number(team) <= 8));

    expect(asked.has("9-1")).toBe(true);
    expect(asked.has("1-9")).toBe(false);
    expect(drawn.length).toBeGreaterThan(0);
    for (const pair of drawn) {
      expect(asked.has(pair.split("-").toReversed().join("-"))).toBe(true);
    }
  });

  it("uses a stored round's ties as they are when it holds one for every two sides left", () => {
    const quarterFinals = [cupTie(1, 2), cupTie(3, 4), cupTie(5, 6), cupTie(7, 8)];
    const { met, recording } = recorded(betterWins);
    forecastCup({ rounds: [CUP_LAST_SIXTEEN, quarterFinals] }, recording, 300);

    // 2 in the quarter-finals; then 3, 5 or 7, the other winners.
    expect(opponentsOf(met, 1)).toEqual([2, 3, 5, 7, 9]);
  });

  it("keeps a part-stored round's ties and draws only the sides they leave", () => {
    const { met, recording } = recorded(betterWins);
    const forecast = forecastCup(
      { rounds: [CUP_LAST_SIXTEEN, [cupTie(1, 2), cupTie(3, 4)]] },
      recording,
      300
    );

    // 2 in the quarter-finals; then 3, or a winner of the drawn four, never 8.
    expect(opponentsOf(met, 1)).toEqual([2, 3, 5, 6, 7, 9]);
    expect(forecast.ties.map((tie) => tie.key)).toContain("cup:1-2");
  });

  it("counts a later stored tie's chance over the runs it is played in", () => {
    // 1 reaches its stored quarter-final in about half the runs, and wins it
    // whenever it does.
    const evenAgainstNine: GoalModel = (home, away) =>
      home === 9 && away === 1
        ? { homeGoals: 1, awayGoals: 1, grid: scoreGrid(1, 1, 1) }
        : betterWins(home, away);
    const forecast = forecastCup(
      { rounds: [CUP_LAST_SIXTEEN, [cupTie(1, 2)]] },
      evenAgainstNine,
      400
    );

    expect(forecast.ties.find((tie) => tie.key === "cup:1-2")?.homeThrough).toBe(1);
  });

  it("draws a stored tie's sides afresh in a run that no longer has one of them", () => {
    // 1 is stored in the quarter-finals, but the round of 16 it is still to
    // win puts it out under this model.
    const { met, recording } = recorded(worseWins);
    forecastCup({ rounds: [CUP_LAST_SIXTEEN, [cupTie(1, 2)]] }, recording, 100);

    expect(opponentsOf(met, 1)).toEqual([9]);
  });

  it("puts out a decided tie's loser and gives its winner the next round", () => {
    const lastSixteen = [cupTie(9, 1, 9), ...CUP_LAST_SIXTEEN.slice(1)];
    const forecast = forecastCup({ rounds: [lastSixteen] }, betterWins, 100);

    expect(cupRow(forecast, 1)).toBeUndefined();
    expect(cupRow(forecast, 9)?.reached.slice(0, 2)).toEqual([
      { share: 1, settled: true },
      { share: 1, settled: true },
    ]);
    expect(cupRow(forecast, 2)?.reached[1]?.settled).toBe(false);
  });

  it("gives every side left each round from the first, and one winner a run", () => {
    const forecast = forecastCup({ rounds: [CUP_LAST_SIXTEEN] }, homeWins, 400);
    const won = forecast.rows.reduce((total, row) => total + row.won.share, 0);

    expect(forecast.rows).toHaveLength(16);
    expect(forecast.rows.every((row) => row.reached.length === 4)).toBe(true);
    expect(forecast.rows.every((row) => row.reached[0]?.settled === true)).toBe(true);
    expect(won).toBeCloseTo(1, 10);
  });

  it("orders the sides by their chance of winning", () => {
    const forecast = forecastCup({ rounds: [CUP_LAST_SIXTEEN] }, twoIsBest, 100);

    expect(forecast.rows.slice(0, 2).map((row) => row.teamProviderId)).toEqual([2, 1]);
  });

  it("counts each stored, undecided tie's chance from its listed home side, and none for a decided one", () => {
    const lastSixteen = [cupTie(9, 1, 1), ...CUP_LAST_SIXTEEN.slice(1)];
    const forecast = forecastCup({ rounds: [lastSixteen] }, betterWins, 100);

    expect(forecast.ties.map((tie) => tie.key)).toEqual(
      CUP_LAST_SIXTEEN.slice(1).map((tie) => tie.key)
    );
    // Every home side is the later place, which the better one beats.
    expect(forecast.ties.every((tie) => tie.homeThrough === 0)).toBe(true);
  });

  it("gives the same figures from the same data", () => {
    expect(forecastCup({ rounds: [CUP_LAST_SIXTEEN] }, homeWins, 300)).toEqual(
      forecastCup({ rounds: [CUP_LAST_SIXTEEN] }, homeWins, 300)
    );
  });
});

describe("tieChances", () => {
  const even: GoalModel = () => ({ homeGoals: 1, awayGoals: 1, grid: scoreGrid(1, 1, 1) });

  it("plays each undecided tie on its own, its listed home side's share of going through", () => {
    expect(tieChances([cupTie(2, 1), cupTie(1, 3)], betterWins, 50)).toEqual([
      { key: "cup:2-1", home: cupTie(2, 1).home, away: cupTie(2, 1).away, homeThrough: 0 },
      { key: "cup:1-3", home: cupTie(1, 3).home, away: cupTie(1, 3).away, homeThrough: 1 },
    ]);
  });

  it("has no chance for a decided tie", () => {
    expect(tieChances([cupTie(2, 1, 2)], betterWins, 50)).toEqual([]);
  });

  it("gives an even tie about half, the same from the same seed", () => {
    const [chance] = tieChances([cupTie(1, 2)], even, 4000);

    expect(chance?.homeThrough).toBeGreaterThan(0.45);
    expect(chance?.homeThrough).toBeLessThan(0.55);
    expect(tieChances([cupTie(1, 2)], even, 4000)).toEqual([chance]);
  });
});
