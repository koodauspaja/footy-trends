import { describe, expect, it } from "vitest";
import {
  type BracketRound,
  type BracketSourceMatch,
  type BracketTie,
  buildBracket,
} from "@/lib/cup-bracket";

let nextMatchId = 1;

type LegOptions = {
  stage?: string;
  home: [number, string];
  away: [number, string];
  kickoffAt: string;
  status?: string;
  fullTime?: [number, number];
  regularTime?: [number, number];
  extraTime?: [number, number];
  penalties?: [number, number];
};

function leg(options: LegOptions): BracketSourceMatch {
  return {
    providerMatchId: nextMatchId++,
    stage: options.stage ?? "QUARTER_FINALS",
    status: options.status ?? "FINISHED",
    kickoffAt: new Date(options.kickoffAt),
    homeTeamProviderId: options.home[0],
    homeTeamName: options.home[1],
    awayTeamProviderId: options.away[0],
    awayTeamName: options.away[1],
    homeGoals: options.fullTime?.[0] ?? null,
    awayGoals: options.fullTime?.[1] ?? null,
    regularTimeHome: options.regularTime?.[0] ?? null,
    regularTimeAway: options.regularTime?.[1] ?? null,
    extraTimeHome: options.extraTime?.[0] ?? null,
    extraTimeAway: options.extraTime?.[1] ?? null,
    penaltiesHome: options.penalties?.[0] ?? null,
    penaltiesAway: options.penalties?.[1] ?? null,
  };
}

/** Narrows away the index-access undefined that strict mode adds. */
function firstTie(rounds: BracketRound[]): BracketTie {
  const tie = rounds[0]?.ties[0];
  if (tie === undefined) throw new Error("expected the round to have at least one tie");
  return tie;
}

describe("buildBracket", () => {
  it("pairs two legs into one tie and sums the aggregate", () => {
    const rounds = buildBracket([
      leg({
        home: [1, "Arsenal FC"],
        away: [2, "Real Madrid CF"],
        kickoffAt: "2025-04-08T19:00:00Z",
        fullTime: [3, 0],
      }),
      leg({
        home: [2, "Real Madrid CF"],
        away: [1, "Arsenal FC"],
        kickoffAt: "2025-04-16T19:00:00Z",
        fullTime: [1, 2],
      }),
    ]);

    expect(rounds).toHaveLength(1);
    const tie = firstTie(rounds);
    expect(tie.home.teamName).toBe("Arsenal FC");
    expect(tie.away.teamName).toBe("Real Madrid CF");
    // 3-0 at home, then 2-1 away: 5-1 stated from Arsenal's side.
    expect(tie.aggregateHome).toBe(5);
    expect(tie.aggregateAway).toBe(1);
    expect(tie.winnerTeamProviderId).toBe(1);
    expect(tie.decision).toBe("regular");
    expect(tie.legs).toHaveLength(2);
  });

  it("does not let a penalty shootout inflate the aggregate", () => {
    // The real 2024/25 LAST_16 tie. `fullTime` reads 1-5 because it INCLUDES
    // the shootout; the tie was actually 1-1, PSG through on penalties.
    const rounds = buildBracket(
      [
        leg({
          stage: "LAST_16",
          home: [524, "Paris Saint-Germain FC"],
          away: [64, "Liverpool FC"],
          kickoffAt: "2025-03-05T20:00:00Z",
          fullTime: [0, 1],
        }),
        leg({
          stage: "LAST_16",
          home: [64, "Liverpool FC"],
          away: [524, "Paris Saint-Germain FC"],
          kickoffAt: "2025-03-11T20:00:00Z",
          fullTime: [1, 5],
          regularTime: [0, 1],
          extraTime: [0, 0],
          penalties: [1, 4],
        }),
      ],
      ["LAST_16"]
    );

    const tie = firstTie(rounds);
    expect(tie.home.teamName).toBe("Paris Saint-Germain FC");
    expect(tie.aggregateHome).toBe(1);
    expect(tie.aggregateAway).toBe(1);
    expect(tie.winnerTeamProviderId).toBe(524);
    expect(tie.decision).toBe("penalties");

    // The leg must report 0-1, not the provider's shootout-inflated 1-5, or it
    // would contradict the 1-1 aggregate directly above it.
    const secondLeg = tie.legs[1];
    expect(secondLeg?.homeGoals).toBe(0);
    expect(secondLeg?.awayGoals).toBe(1);
    expect(secondLeg?.penaltiesHome).toBe(1);
    expect(secondLeg?.penaltiesAway).toBe(4);
  });

  it("credits a shootout to the right side when the deciding leg is reversed", () => {
    const rounds = buildBracket([
      leg({
        home: [10, "Koti"],
        away: [20, "Vieras"],
        kickoffAt: "2025-04-01T19:00:00Z",
        fullTime: [1, 0],
      }),
      leg({
        home: [20, "Vieras"],
        away: [10, "Koti"],
        kickoffAt: "2025-04-08T19:00:00Z",
        fullTime: [4, 3],
        regularTime: [1, 0],
        extraTime: [0, 0],
        // Stated from the second leg's home side, which is the tie's away team.
        penalties: [5, 4],
      }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.aggregateHome).toBe(1);
    expect(tie.aggregateAway).toBe(1);
    expect(tie.winnerTeamProviderId).toBe(20);
    expect(tie.decision).toBe("penalties");
  });

  it("counts extra time toward the aggregate and labels the tie", () => {
    const rounds = buildBracket([
      leg({
        stage: "SEMI_FINALS",
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2025-04-30T19:00:00Z",
        fullTime: [3, 3],
      }),
      leg({
        stage: "SEMI_FINALS",
        home: [2, "B"],
        away: [1, "A"],
        kickoffAt: "2025-05-06T19:00:00Z",
        fullTime: [4, 3],
        regularTime: [3, 3],
        extraTime: [1, 0],
      }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.aggregateHome).toBe(6);
    expect(tie.aggregateAway).toBe(7);
    expect(tie.winnerTeamProviderId).toBe(2);
    expect(tie.decision).toBe("extra_time");
  });

  it("treats a single-leg round as a complete tie", () => {
    // The World Cup and the European Championship play single-leg knockouts.
    const rounds = buildBracket(
      [
        leg({
          stage: "FINAL",
          home: [1, "Spain"],
          away: [2, "Argentina"],
          kickoffAt: "2026-07-19T19:00:00Z",
          fullTime: [1, 0],
          regularTime: [0, 0],
          extraTime: [1, 0],
        }),
      ],
      ["FINAL"]
    );

    const tie = firstTie(rounds);
    expect(tie.legs).toHaveLength(1);
    expect(tie.aggregateHome).toBe(1);
    expect(tie.aggregateAway).toBe(0);
    expect(tie.winnerTeamProviderId).toBe(1);
    expect(tie.decision).toBe("extra_time");
  });

  it("leaves a tie undecided while a leg is unplayed", () => {
    const rounds = buildBracket([
      leg({
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2026-04-01T19:00:00Z",
        fullTime: [2, 0],
      }),
      leg({
        home: [2, "B"],
        away: [1, "A"],
        kickoffAt: "2026-04-08T19:00:00Z",
        status: "SCHEDULED",
      }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.aggregateHome).toBeNull();
    expect(tie.aggregateAway).toBeNull();
    expect(tie.winnerTeamProviderId).toBeNull();
    expect(tie.decision).toBeNull();
  });

  it("keeps every match when a pairing has more than two, rather than dropping one", () => {
    const rounds = buildBracket([
      leg({ home: [1, "A"], away: [2, "B"], kickoffAt: "2026-04-01T19:00:00Z", fullTime: [1, 0] }),
      leg({ home: [2, "B"], away: [1, "A"], kickoffAt: "2026-04-08T19:00:00Z", fullTime: [1, 0] }),
      leg({ home: [1, "A"], away: [2, "B"], kickoffAt: "2026-04-15T19:00:00Z", fullTime: [2, 0] }),
    ]);

    const ties = rounds[0]?.ties ?? [];
    expect(ties).toHaveLength(3);
    expect(ties.every((tie) => tie.legs.length === 1)).toBe(true);
    // Keys must stay unique or React would collapse the rows.
    expect(new Set(ties.map((tie) => tie.key)).size).toBe(3);
  });

  it("orders rounds by progression and omits stages the season does not have", () => {
    const rounds = buildBracket([
      leg({
        stage: "FINAL",
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2025-05-31T19:00:00Z",
        fullTime: [1, 0],
      }),
      leg({
        stage: "QUARTER_FINALS",
        home: [3, "C"],
        away: [4, "D"],
        kickoffAt: "2025-04-08T19:00:00Z",
        fullTime: [1, 0],
      }),
    ]);

    expect(rounds.map((round) => round.stage)).toEqual(["QUARTER_FINALS", "FINAL"]);
  });

  it("leaves a level tie undecided when no shootout was recorded", () => {
    const rounds = buildBracket([
      leg({
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2026-04-01T19:00:00Z",
        fullTime: [1, 1],
      }),
      leg({
        home: [2, "B"],
        away: [1, "A"],
        kickoffAt: "2026-04-08T19:00:00Z",
        fullTime: [2, 2],
      }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.aggregateHome).toBe(3);
    expect(tie.aggregateAway).toBe(3);
    expect(tie.winnerTeamProviderId).toBeNull();
    expect(tie.decision).toBeNull();
  });

  it("leaves a tie undecided when the shootout itself is level", () => {
    const rounds = buildBracket([
      leg({
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2026-04-08T19:00:00Z",
        fullTime: [4, 4],
        regularTime: [1, 1],
        extraTime: [0, 0],
        penalties: [3, 3],
      }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.aggregateHome).toBe(1);
    expect(tie.winnerTeamProviderId).toBeNull();
    expect(tie.decision).toBeNull();
  });

  it("treats a finished leg with no score as incomplete rather than 0-0", () => {
    const rounds = buildBracket([
      leg({ home: [1, "A"], away: [2, "B"], kickoffAt: "2026-04-08T19:00:00Z" }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.aggregateHome).toBeNull();
    expect(tie.winnerTeamProviderId).toBeNull();
  });

  it("finds the first leg even when the provider lists the legs out of order", () => {
    // Which team is the tie's `home` depends on the *earliest* leg, not on the
    // order the provider happened to return them in.
    const rounds = buildBracket([
      leg({
        home: [2, "B"],
        away: [1, "A"],
        kickoffAt: "2026-04-15T19:00:00Z",
        fullTime: [0, 1],
      }),
      leg({
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2026-04-08T19:00:00Z",
        fullTime: [2, 0],
      }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.home.teamName).toBe("A");
    expect(tie.startsAt).toEqual(new Date("2026-04-08T19:00:00Z"));
    expect(tie.aggregateHome).toBe(3);
    expect(tie.aggregateAway).toBe(0);
  });

  it("handles a leg reporting normal time with no extra time", () => {
    const rounds = buildBracket([
      leg({
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2026-04-08T19:00:00Z",
        fullTime: [2, 1],
        regularTime: [2, 1],
      }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.aggregateHome).toBe(2);
    expect(tie.aggregateAway).toBe(1);
    expect(tie.decision).toBe("regular");
  });

  it("orders ties within a round by their first leg's kickoff", () => {
    const rounds = buildBracket([
      leg({ home: [3, "C"], away: [4, "D"], kickoffAt: "2026-04-09T19:00:00Z", fullTime: [1, 0] }),
      leg({ home: [1, "A"], away: [2, "B"], kickoffAt: "2026-04-08T19:00:00Z", fullTime: [1, 0] }),
    ]);

    expect(rounds[0]?.ties.map((tie) => tie.home.teamName)).toEqual(["A", "C"]);
  });

  it("ignores matches outside the bracket stages", () => {
    const rounds = buildBracket([
      leg({
        stage: "LEAGUE_STAGE",
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2024-09-17T19:00:00Z",
        fullTime: [1, 0],
      }),
    ]);

    expect(rounds).toEqual([]);
  });
});
