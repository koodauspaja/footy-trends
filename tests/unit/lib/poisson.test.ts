import { describe, expect, it } from "vitest";
import {
  drawFactorFor,
  fitPoisson,
  mostLikelyScore,
  outcomesOf,
  POISSON_DECAY_PER_DAY,
  POISSON_HORIZON_DAYS,
  POISSON_MAX_GOALS,
  POISSON_MODEL,
  POISSON_PRIOR_MATCHES,
  type PoissonFit,
  type PoissonMatch,
  type PoissonPrediction,
  predictPoisson,
  replayPoisson,
  scoreGrid,
  utcDay,
} from "@/lib/poisson";

/**
 * The Poisson arithmetic: the constants, the scoreline grid and what is read
 * off it, the draw factor, the fit and its window, the prediction, and the
 * replay over a history.
 *
 * decisions/055-poisson-goal-model.md
 */

const DAY_MS = 86_400_000;
/** The day every fit below is asked for: 2025-06-01. */
const TODAY = utcDay(new Date(Date.UTC(2025, 5, 1)));

let nextId = 1;
/** A match `daysAgo` days before `TODAY`, at 15:00 UTC. */
function played(
  daysAgo: number,
  homeTeam: number,
  awayTeam: number,
  homeGoals: number,
  awayGoals: number,
  overrides: Partial<PoissonMatch> = {}
): PoissonMatch {
  return {
    source: "taso",
    code: "VL",
    seasonId: 2025,
    providerMatchId: nextId++,
    kickoffAt: new Date((TODAY - daysAgo) * DAY_MS + 15 * 3_600_000),
    homeTeam,
    awayTeam,
    homeGoals,
    awayGoals,
    ...overrides,
  };
}

const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0);

/** A repeatable stream of numbers in [0, 1). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/** A Poisson draw at `expected`, from the stream. */
function goalsAt(expected: number, random: () => number): number {
  const drawn = random();
  let goals = 0;
  let probability = Math.exp(-expected);
  let cumulative = probability;
  while (drawn > cumulative) {
    goals += 1;
    probability = (probability * expected) / goals;
    cumulative += probability;
  }
  return goals;
}

/** A small league with scores of every kind, the last 30 days. */
function league(): PoissonMatch[] {
  return [
    played(30, 1, 2, 2, 0),
    played(25, 2, 3, 1, 1),
    played(20, 3, 1, 0, 3),
    played(15, 2, 1, 1, 2),
    played(10, 3, 2, 2, 2),
    played(5, 1, 3, 4, 1),
  ];
}

describe("the constants", () => {
  it("are the model's: a change to any is a new model name", () => {
    expect(POISSON_MODEL).toBe("poisson-v1");
    expect(POISSON_DECAY_PER_DAY).toBe(0.0019);
    expect(POISSON_HORIZON_DAYS).toBe(1500);
    expect(POISSON_PRIOR_MATCHES).toBe(1);
    expect(POISSON_MAX_GOALS).toBe(10);
  });
});

describe("utcDay", () => {
  it("counts whole UTC days, a day turning at midnight UTC", () => {
    expect(utcDay(new Date("1970-01-02T00:00:00Z"))).toBe(1);
    expect(utcDay(new Date("2025-05-31T23:59:59.999Z"))).toBe(TODAY - 1);
    expect(utcDay(new Date("2025-06-01T00:00:00Z"))).toBe(TODAY);
  });
});

describe("scoreGrid", () => {
  it("covers 0–10 goals a side and sums to 1", () => {
    const grid = scoreGrid(1.6, 1.1, 1);

    expect(grid).toHaveLength(11);
    for (const row of grid) expect(row).toHaveLength(11);
    expect(total(grid.map(total))).toBeCloseTo(1, 12);
  });

  it("is two independent Poisson counts, the home side's down the rows", () => {
    const grid = scoreGrid(1.6, 1.1, 1);
    const cell = (home: number, away: number) => (grid[home] as number[])[away] as number;

    // P(1) / P(0) is the expected count; P(2) / P(1) half of it.
    expect(cell(1, 0) / cell(0, 0)).toBeCloseTo(1.6, 12);
    expect(cell(0, 1) / cell(0, 0)).toBeCloseTo(1.1, 12);
    expect(cell(2, 3) / cell(1, 3)).toBeCloseTo(1.6 / 2, 12);
    expect(cell(0, 0)).toBeCloseTo(Math.exp(-2.7), 6);
  });

  it("spreads what lies past ten goals back in proportion", () => {
    // At 8 expected goals a side, about 18 % of each side's mass is past ten.
    const grid = scoreGrid(8, 8, 1);
    const cell = (home: number, away: number) => (grid[home] as number[])[away] as number;

    expect(total(grid.map(total))).toBeCloseTo(1, 12);
    expect(cell(0, 0)).toBeGreaterThan(Math.exp(-16) * 1.4);
    // In proportion: the ratios between cells are the untruncated ones.
    expect(cell(1, 0) / cell(0, 0)).toBeCloseTo(8, 10);
  });

  it("scales the draws by the factor and nothing else, then sums to 1 again", () => {
    const plain = scoreGrid(1.6, 1.1, 1);
    const scaled = scoreGrid(1.6, 1.1, 1.5);
    const draw = outcomesOf(plain).draw;

    expect(total(scaled.map(total))).toBeCloseTo(1, 12);
    expect(outcomesOf(scaled).draw).toBeCloseTo((1.5 * draw) / (1.5 * draw + 1 - draw), 12);
    // Home wins and away wins keep their proportion to each other.
    expect(outcomesOf(scaled).home / outcomesOf(scaled).away).toBeCloseTo(
      outcomesOf(plain).home / outcomesOf(plain).away,
      12
    );
  });
});

describe("outcomesOf", () => {
  it("sums the cells below, on and above the diagonal", () => {
    // Rows are the home side's goals: [1][0] is a 1–0 home win.
    const outcomes = outcomesOf([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    expect(outcomes.home).toBeCloseTo(0.3, 12);
    expect(outcomes.draw).toBeCloseTo(0.5, 12);
    expect(outcomes.away).toBeCloseTo(0.2, 12);
  });
});

describe("mostLikelyScore", () => {
  it("is the largest cell, with its probability", () => {
    expect(
      mostLikelyScore([
        [0.1, 0.1, 0.05],
        [0.1, 0.15, 0.05],
        [0.35, 0.05, 0.05],
      ])
    ).toEqual({ home: 2, away: 0, probability: 0.35 });
  });

  it("takes the fewer total goals of equal cells", () => {
    expect(
      mostLikelyScore([
        [0.25, 0.25],
        [0.25, 0.25],
      ])
    ).toEqual({ home: 0, away: 0, probability: 0.25 });
    // 0–2 is met first; 1–0, met later, has fewer goals.
    expect(
      mostLikelyScore([
        [0, 0, 0.4],
        [0.4, 0, 0],
        [0, 0.2, 0],
      ])
    ).toEqual({ home: 1, away: 0, probability: 0.4 });
  });

  it("takes the fewer home goals of equal cells with equal totals", () => {
    expect(
      mostLikelyScore([
        [0.1, 0.3],
        [0.3, 0.3],
      ])
    ).toEqual({ home: 0, away: 1, probability: 0.3 });
  });
});

describe("drawFactorFor", () => {
  const scaled = (draw: number, factor: number) => (factor * draw) / (factor * draw + 1 - draw);

  it("finds the factor that makes the average scaled draw probability the share", () => {
    const draws = [0.2, 0.25, 0.32];
    const factor = drawFactorFor(draws, 0.3);

    expect(factor).toBeGreaterThan(1);
    expect(total(draws.map((draw) => scaled(draw, factor))) / 3).toBeCloseTo(0.3, 9);
  });

  it("is below 1 when the model draws too often, and 1 when it draws as often", () => {
    const draws = [0.3, 0.3];

    expect(drawFactorFor(draws, 0.2)).toBeCloseTo((0.2 * 0.7) / (0.3 * 0.8), 9);
    expect(drawFactorFor(draws, 0.3)).toBeCloseTo(1, 9);
  });

  it("is 1 when no factor can reach the share: no draw at all, or nothing else", () => {
    expect(drawFactorFor([0.25, 0.3], 0)).toBe(1);
    expect(drawFactorFor([0.25, 0.3], 1)).toBe(1);
  });
});

describe("fitPoisson", () => {
  it("recovers known strengths from generated scores", () => {
    const random = seeded(55);
    const attack = [0.4, 0.1, -0.1, -0.4];
    const defence = [-0.3, 0.2, 0, 0.1];
    const base = 0.1;
    const home = 0.3;
    const expectedGoals = (scorer: number, conceder: number, atHome: boolean) =>
      Math.exp(
        base + (atHome ? home : 0) + (attack[scorer] as number) + (defence[conceder] as number)
      );
    const history: PoissonMatch[] = [];
    for (let round = 0; round < 150; round += 1) {
      for (let homeTeam = 0; homeTeam < 4; homeTeam += 1) {
        for (let awayTeam = 0; awayTeam < 4; awayTeam += 1) {
          if (homeTeam === awayTeam) continue;
          history.push(
            played(
              1 + round,
              homeTeam + 1,
              awayTeam + 1,
              goalsAt(expectedGoals(homeTeam, awayTeam, true), random),
              goalsAt(expectedGoals(awayTeam, homeTeam, false), random)
            )
          );
        }
      }
    }

    const fit = fitPoisson(history, TODAY);

    expect(fit.home).toBeCloseTo(home, 1);
    for (let homeTeam = 0; homeTeam < 4; homeTeam += 1) {
      for (let awayTeam = 0; awayTeam < 4; awayTeam += 1) {
        if (homeTeam === awayTeam) continue;
        const prediction = predictPoisson(fit, "VL", homeTeam + 1, awayTeam + 1);
        const wanted = expectedGoals(homeTeam, awayTeam, true);
        expect(Math.abs((prediction?.homeGoals as number) / wanted - 1)).toBeLessThan(0.12);
      }
    }
  });

  it("makes the scores most likely: each strength balances its weighted goals, a one-match prior added", () => {
    const history = league();
    const fit = fitPoisson(history, TODAY);
    const base = fit.competitions.get("VL")?.base as number;
    const weight = (match: PoissonMatch) =>
      Math.exp(-0.0019 * (TODAY - match.kickoffAt.getTime() / DAY_MS));
    const attack = (team: number) => fit.attack.get(team) as number;
    const defence = (team: number) => fit.defence.get(team) as number;

    // Team 1's attack: the goals it scored, and those expected of an average
    // attack in the same matches, each with one match's worth of prior.
    let scored = 0;
    let expected = 0;
    // Team 3's defence, the same way from the goals it conceded.
    let conceded = 0;
    let expectedAgainst = 0;
    let homeGoals = 0;
    let homeExpected = 0;
    // The base rate: every goal, against what the sides would score at a rate of one.
    let allGoals = 0;
    let allExpected = 0;
    for (const match of history) {
      const w = weight(match);
      allGoals += w * (match.homeGoals + match.awayGoals);
      allExpected +=
        w *
        (Math.exp(fit.home + attack(match.homeTeam) + defence(match.awayTeam)) +
          Math.exp(attack(match.awayTeam) + defence(match.homeTeam)));
      if (match.homeTeam === 1) {
        scored += w * match.homeGoals;
        expected += w * Math.exp(base + fit.home + defence(match.awayTeam));
      }
      if (match.awayTeam === 1) {
        scored += w * match.awayGoals;
        expected += w * Math.exp(base + defence(match.homeTeam));
      }
      if (match.homeTeam === 3) {
        conceded += w * match.awayGoals;
        expectedAgainst += w * Math.exp(base + attack(match.awayTeam));
      }
      if (match.awayTeam === 3) {
        conceded += w * match.homeGoals;
        expectedAgainst += w * Math.exp(base + fit.home + attack(match.homeTeam));
      }
      homeGoals += w * match.homeGoals;
      homeExpected += w * Math.exp(base + attack(match.homeTeam) + defence(match.awayTeam));
    }

    expect(attack(1)).toBeCloseTo(Math.log((scored + 1) / (expected + 1)), 3);
    expect(defence(3)).toBeCloseTo(Math.log((conceded + 1) / (expectedAgainst + 1)), 3);
    expect(fit.home).toBeCloseTo(Math.log((homeGoals + 0.5) / (homeExpected + 0.5)), 3);
    expect(base).toBeCloseTo(Math.log((allGoals + 0.5) / (allExpected + 0.5)), 3);
  });

  it("counts a recent match for more than an old one", () => {
    // The same two scores, a year apart, in either order.
    const strongLately = fitPoisson([played(366, 1, 2, 0, 0), played(1, 1, 2, 4, 0)], TODAY);
    const strongOnce = fitPoisson([played(366, 1, 2, 4, 0), played(1, 1, 2, 0, 0)], TODAY);

    expect(strongLately.attack.get(1) as number).toBeGreaterThan(
      strongOnce.attack.get(1) as number
    );
  });

  it("reads matches up to 1 500 days back, and none older", () => {
    const fit = fitPoisson(
      [played(1500, 1, 2, 1, 0), played(1501, 3, 4, 1, 0, { code: "Y" })],
      TODAY
    );

    expect([...fit.attack.keys()]).toEqual([1, 2]);
    expect([...fit.competitions.keys()]).toEqual(["VL"]);
  });

  it("reads matches of strictly earlier UTC days: yesterday's last, none of today's", () => {
    const yesterday = played(0, 1, 2, 1, 0, {
      kickoffAt: new Date(TODAY * DAY_MS - 1),
    });
    const today = played(0, 3, 4, 1, 0, { kickoffAt: new Date(TODAY * DAY_MS) });

    const fit = fitPoisson([yesterday, today], TODAY);

    expect([...fit.attack.keys()]).toEqual([1, 2]);
  });

  it("leaves a placeholder side's match out", () => {
    const fit = fitPoisson(
      [
        played(3, 0, 2, 5, 0, { code: "Y" }),
        played(2, 1, 0, 5, 0, { code: "Y" }),
        played(1, 1, 2, 1, 0),
      ],
      TODAY
    );

    expect([...fit.attack.keys()]).toEqual([1, 2]);
    expect([...fit.competitions.keys()]).toEqual(["VL"]);
  });

  it("pulls a side with one match towards average, not onto its one score", () => {
    const debut = played(1, 9, 1, 6, 0);
    const fit = fitPoisson([...league(), debut], TODAY);
    const base = fit.competitions.get("VL")?.base as number;
    const weight = Math.exp(-0.0019 * (TODAY - debut.kickoffAt.getTime() / DAY_MS));
    // What an average attack would have been expected to score in that match.
    const average = Math.exp(base + fit.home + (fit.defence.get(1) as number));

    // Six goals once, with one average match beside it: short of six.
    expect(fit.attack.get(9) as number).toBeCloseTo(
      Math.log((weight * 6 + 1) / (weight * average + 1)),
      3
    );
    expect(fit.attack.get(9) as number).toBeLessThan(Math.log(6 / average) - 0.2);
    // It conceded none: a defence better than average, and still a finite one.
    expect(fit.defence.get(9) as number).toBeLessThan(0);
    expect(Number.isFinite(fit.defence.get(9) as number)).toBe(true);
  });

  it("stays finite when no goal has been scored at all", () => {
    const fit = fitPoisson([played(2, 1, 2, 0, 0), played(1, 2, 1, 0, 0)], TODAY);
    const prediction = predictPoisson(fit, "VL", 1, 2) as PoissonPrediction;

    expect(Number.isFinite(fit.home)).toBe(true);
    expect(Number.isFinite(prediction.homeGoals)).toBe(true);
    expect(
      prediction.prediction.home + prediction.prediction.draw + prediction.prediction.away
    ).toBeCloseTo(1, 12);
  });

  it("gives each competition its own base rate", () => {
    const fit = fitPoisson(
      [
        played(4, 1, 2, 1, 0),
        played(3, 2, 1, 0, 1),
        played(2, 3, 4, 4, 3, { code: "Y" }),
        played(1, 4, 3, 3, 4, { code: "Y" }),
      ],
      TODAY
    );

    expect(fit.competitions.get("Y")?.base as number).toBeGreaterThan(
      fit.competitions.get("VL")?.base as number
    );
  });

  it("scales each competition's draws so its fitted matches' average draw probability is their draw share", () => {
    // Two draws in six in VL; in Y, one in two.
    const history = [
      ...league(),
      played(8, 5, 6, 1, 1, { code: "Y" }),
      played(4, 6, 5, 3, 0, { code: "Y" }),
    ];
    const fit = fitPoisson(history, TODAY);
    const averageDraw = (code: string) => {
      const matches = history.filter((match) => match.code === code);
      return (
        total(
          matches.map(
            (match) =>
              predictPoisson(fit, code, match.homeTeam, match.awayTeam)?.prediction.draw as number
          )
        ) / matches.length
      );
    };

    expect(averageDraw("VL")).toBeCloseTo(2 / 6, 6);
    expect(averageDraw("Y")).toBeCloseTo(1 / 2, 6);
    expect(fit.competitions.get("Y")?.drawFactor).not.toBeCloseTo(
      fit.competitions.get("VL")?.drawFactor as number,
      3
    );
  });

  it("uses the plain grid for a competition with no draw, or with nothing else", () => {
    const fit = fitPoisson(
      [
        played(4, 1, 2, 1, 0),
        played(3, 2, 1, 0, 2),
        played(2, 3, 4, 1, 1, { code: "Y" }),
        played(1, 4, 3, 0, 0, { code: "Y" }),
      ],
      TODAY
    );

    expect(fit.competitions.get("VL")?.drawFactor).toBe(1);
    expect(fit.competitions.get("Y")?.drawFactor).toBe(1);
  });

  it("fits nothing from no matches", () => {
    const fit = fitPoisson([], TODAY);

    expect(fit.competitions.size).toBe(0);
    expect(fit.attack.size).toBe(0);
    expect(predictPoisson(fit, "VL", 1, 2)).toBeNull();
  });
});

describe("predictPoisson", () => {
  const fit: PoissonFit = {
    competitions: new Map([["VL", { base: 0.1, drawFactor: 1.2 }]]),
    home: 0.25,
    attack: new Map([
      [1, 0.3],
      [2, -0.2],
    ]),
    defence: new Map([
      [1, -0.1],
      [2, 0.15],
    ]),
  };

  it("expects goals from the base rate, the home advantage, an attack and the other side's defence", () => {
    const prediction = predictPoisson(fit, "VL", 1, 2) as PoissonPrediction;

    expect(prediction.homeGoals).toBeCloseTo(Math.exp(0.1 + 0.25 + 0.3 + 0.15), 12);
    expect(prediction.awayGoals).toBeCloseTo(Math.exp(0.1 - 0.2 - 0.1), 12);
  });

  it("reads the outcomes and the most likely score off the grid, the draw factor in it", () => {
    const prediction = predictPoisson(fit, "VL", 1, 2) as PoissonPrediction;
    const grid = scoreGrid(prediction.homeGoals, prediction.awayGoals, 1.2);

    expect(prediction.prediction).toEqual(outcomesOf(grid));
    expect(prediction.score).toEqual(mostLikelyScore(grid));
    expect(
      prediction.prediction.home + prediction.prediction.draw + prediction.prediction.away
    ).toBeCloseTo(1, 12);
  });

  it("predicts a team the fit has no match of as an average side", () => {
    const prediction = predictPoisson(fit, "VL", 7, 8) as PoissonPrediction;

    expect(prediction.homeGoals).toBeCloseTo(Math.exp(0.1 + 0.25), 12);
    expect(prediction.awayGoals).toBeCloseTo(Math.exp(0.1), 12);
  });

  it("predicts nothing for a placeholder side, home or away, or a competition the fit has no match of", () => {
    expect(predictPoisson(fit, "VL", 0, 2)).toBeNull();
    expect(predictPoisson(fit, "VL", 1, 0)).toBeNull();
    expect(predictPoisson(fit, "Y", 1, 2)).toBeNull();
  });
});

describe("replayPoisson", () => {
  function replayed(matches: readonly PoissonMatch[]) {
    const seen: Array<{ id: number; prediction: PoissonPrediction }> = [];
    replayPoisson(matches, (match, prediction) => {
      seen.push({ id: match.providerMatchId, prediction });
    });
    return seen;
  }

  it("predicts each day's matches from the fit of the days before it, as a fit asked for that day", () => {
    const history = league();
    const seen = replayed(history);

    // The first day has nothing before it.
    expect(seen.map(({ id }) => id)).toEqual(
      history.slice(1).map((match) => match.providerMatchId)
    );
    for (const match of history.slice(1)) {
      const fit = fitPoisson(history, utcDay(match.kickoffAt));
      const alone = predictPoisson(fit, "VL", match.homeTeam, match.awayTeam) as PoissonPrediction;
      const inReplay = seen.find(({ id }) => id === match.providerMatchId)?.prediction;
      // The replay starts each fit from the day before's; both settle on the same one.
      expect(inReplay?.prediction.home).toBeCloseTo(alone.prediction.home, 3);
      expect(inReplay?.prediction.draw).toBeCloseTo(alone.prediction.draw, 3);
      expect(inReplay?.homeGoals).toBeCloseTo(alone.homeGoals, 2);
    }
  });

  it("does not let matches of one day inform each other", () => {
    const earlier = [played(9, 1, 2, 2, 0), played(8, 3, 4, 1, 1)];
    const morning = (homeGoals: number) =>
      played(5, 1, 3, homeGoals, 0, {
        providerMatchId: 9_001,
        kickoffAt: new Date((TODAY - 5) * DAY_MS + 9 * 3_600_000),
      });
    const evening = played(5, 2, 4, 1, 0, { providerMatchId: 9_002 });

    const afterAOneNil = replayed([...earlier, morning(1), evening]);
    const afterASeven = replayed([...earlier, morning(7), evening]);

    expect(afterASeven.find(({ id }) => id === 9_002)).toEqual(
      afterAOneNil.find(({ id }) => id === 9_002)
    );
  });

  it("goes in kickoff order whatever order it is given, the id deciding a shared kickoff", () => {
    // The earliest match has the largest id: the order is the kickoffs', not the ids'.
    const first = played(9, 1, 2, 2, 0, { providerMatchId: 9_013 });
    const second = played(5, 3, 4, 0, 0, { providerMatchId: 9_012 });
    const third = played(5, 1, 2, 1, 0, { providerMatchId: 9_011 });

    expect(replayed([second, third, first]).map(({ id }) => id)).toEqual([9_011, 9_012]);
  });

  it("predicts nothing for a competition whose matches have all left the window", () => {
    const old = played(1600, 1, 2, 2, 0);
    const recent = played(50, 3, 4, 1, 0, { code: "Y" });
    const now = played(1, 1, 2, 1, 1, { providerMatchId: 9_021 });
    const nowInY = played(1, 3, 4, 1, 1, { code: "Y", providerMatchId: 9_022 });

    expect(replayed([old, recent, now, nowInY]).map(({ id }) => id)).toEqual([9_022]);
  });

  it("neither predicts nor learns from a placeholder side's match", () => {
    const seen = replayed([
      played(9, 1, 2, 2, 0),
      played(5, 0, 2, 9, 0, { providerMatchId: 9_031 }),
      played(1, 1, 2, 1, 0, { providerMatchId: 9_032 }),
    ]);
    const without = replayed([
      played(9, 1, 2, 2, 0),
      played(1, 1, 2, 1, 0, { providerMatchId: 9_032 }),
    ]);

    expect(seen.map(({ id }) => id)).toEqual([9_032]);
    expect(seen[0]?.prediction).toEqual(without[0]?.prediction);
  });
});
