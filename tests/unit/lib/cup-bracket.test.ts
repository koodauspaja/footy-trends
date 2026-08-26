import { describe, expect, it } from "vitest";
import {
  type BracketRound,
  type BracketSourceMatch,
  type BracketTie,
  buildBracket,
  orderRoundsForTree,
} from "@/lib/cup-bracket";

let nextMatchId = 1;

type LegOptions = {
  stage?: string;
  declaredWinner?: "home" | "away" | null;
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
    declaredWinner: options.declaredWinner ?? null,
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

  it("uses a provider-declared winner to settle a level tie", () => {
    // The real MSC 2025 quarter-final: FC Haka 1-1 KuPS, KuPS through. TASO
    // reports `winner: "Away"` and never itemises the shootout.
    const rounds = buildBracket([
      leg({
        home: [1, "FC Haka"],
        away: [2, "KuPS"],
        kickoffAt: "2025-06-11T16:00:00Z",
        fullTime: [1, 1],
        declaredWinner: "away",
      }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.aggregateHome).toBe(1);
    expect(tie.aggregateAway).toBe(1);
    expect(tie.winnerTeamProviderId).toBe(2);
    // Not "penalties": the provider named the winner without saying how.
    expect(tie.decision).toBe("declared");
  });

  it("flips a declared winner stated from the second leg's home side", () => {
    const rounds = buildBracket([
      leg({
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2026-04-01T19:00:00Z",
        fullTime: [1, 0],
      }),
      leg({
        home: [2, "B"],
        away: [1, "A"],
        kickoffAt: "2026-04-08T19:00:00Z",
        fullTime: [1, 0],
        // Stated from B's side, and B is the tie's away team.
        declaredWinner: "home",
      }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.aggregateHome).toBe(1);
    expect(tie.aggregateAway).toBe(1);
    expect(tie.winnerTeamProviderId).toBe(2);
  });

  it("prefers an itemised shootout over a declared winner", () => {
    // Both present: the shootout is the more specific record, and says the
    // same thing here, so the label must be the specific one.
    const rounds = buildBracket([
      leg({
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2026-04-08T19:00:00Z",
        fullTime: [4, 3],
        regularTime: [1, 1],
        extraTime: [0, 0],
        penalties: [4, 3],
        declaredWinner: "home",
      }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.winnerTeamProviderId).toBe(1);
    expect(tie.decision).toBe("penalties");
  });

  it("ignores a declared winner when the aggregate already decides the tie", () => {
    const rounds = buildBracket([
      leg({
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2026-04-08T19:00:00Z",
        fullTime: [3, 0],
        declaredWinner: "home",
      }),
    ]);

    const tie = firstTie(rounds);
    expect(tie.winnerTeamProviderId).toBe(1);
    expect(tie.decision).toBe("regular");
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

  it("includes a knockout stage nobody has hardcoded", () => {
    // The round must reach the standings page on the strength of being in the
    // data, not on being in a list someone remembered to update.
    const rounds = buildBracket([
      leg({
        stage: "LAST_64",
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2026-02-01T19:00:00Z",
        fullTime: [1, 0],
      }),
      leg({
        stage: "FINAL",
        home: [3, "C"],
        away: [4, "D"],
        kickoffAt: "2026-05-31T19:00:00Z",
        fullTime: [2, 0],
      }),
    ]);

    // Sorted last rather than in its true chronological place: `STAGE_ORDER`
    // cannot rank a name it has never seen. Visible-but-last is the deliberate
    // trade — the alternative was being dropped from the page entirely.
    expect(rounds.map((round) => round.stage)).toEqual(["FINAL", "LAST_64"]);
  });

  it("omits an explicitly requested stage the season does not have", () => {
    // Only reachable through the `stages` override; the derived default never
    // names a stage with no matches behind it.
    const rounds = buildBracket(
      [
        leg({
          stage: "FINAL",
          home: [1, "A"],
          away: [2, "B"],
          kickoffAt: "2026-05-31T19:00:00Z",
          fullTime: [1, 0],
        }),
      ],
      ["SEMI_FINALS", "FINAL"]
    );

    expect(rounds.map((round) => round.stage)).toEqual(["FINAL"]);
  });

  it("leaves the table phases out of the knockout rounds", () => {
    const rounds = buildBracket([
      leg({
        stage: "LEAGUE_STAGE",
        home: [1, "A"],
        away: [2, "B"],
        kickoffAt: "2024-09-17T19:00:00Z",
        fullTime: [1, 0],
      }),
      leg({
        stage: "GROUP_STAGE",
        home: [3, "C"],
        away: [4, "D"],
        kickoffAt: "2023-09-19T19:00:00Z",
        fullTime: [1, 0],
      }),
      leg({
        stage: "FINAL",
        home: [5, "E"],
        away: [6, "F"],
        kickoffAt: "2024-06-01T19:00:00Z",
        fullTime: [1, 0],
      }),
    ]);

    expect(rounds.map((round) => round.stage)).toEqual(["FINAL"]);
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

describe("orderRoundsForTree", () => {
  /**
   * The real MSC 2026 bracket. TASO returns the quarter-finals in kickoff
   * order, which draws VPS/FC Inter's semi-final against the wrong pair.
   */
  function mscRounds() {
    const qf = [
      leg({
        stage: "QF",
        home: [1, "FC Honka"],
        away: [2, "HJK"],
        kickoffAt: "2026-04-01T16:00:00Z",
        fullTime: [1, 7],
      }),
      leg({
        stage: "QF",
        home: [3, "KuPS"],
        away: [4, "VPS"],
        kickoffAt: "2026-04-02T16:00:00Z",
        fullTime: [0, 0],
        declaredWinner: "away",
      }),
      leg({
        stage: "QF",
        home: [5, "SJK"],
        away: [6, "FC Inter"],
        kickoffAt: "2026-04-03T16:00:00Z",
        fullTime: [1, 2],
      }),
      leg({
        stage: "QF",
        home: [7, "Ilves"],
        away: [8, "FC Lahti"],
        kickoffAt: "2026-04-04T16:00:00Z",
        fullTime: [5, 2],
      }),
    ];
    const sf = [
      leg({
        stage: "SF",
        home: [4, "VPS"],
        away: [6, "FC Inter"],
        kickoffAt: "2026-05-01T16:00:00Z",
        fullTime: [2, 3],
      }),
      leg({
        stage: "SF",
        home: [2, "HJK"],
        away: [7, "Ilves"],
        kickoffAt: "2026-05-02T16:00:00Z",
        fullTime: [2, 1],
      }),
    ];
    const final = leg({
      stage: "F",
      home: [6, "FC Inter"],
      away: [2, "HJK"],
      kickoffAt: "2026-05-20T16:00:00Z",
    });
    return buildBracket([...qf, ...sf, final], ["QF", "SF", "F"]);
  }

  it("puts each tie next to the two that feed it", () => {
    const aligned = orderRoundsForTree(mscRounds());

    // VPS and FC Inter's quarter-finals come first, because their semi-final
    // is the first one; HJK's and Ilves's follow.
    expect(aligned[0]?.ties.map((tie) => `${tie.home.teamName}-${tie.away.teamName}`)).toEqual([
      "KuPS-VPS",
      "SJK-FC Inter",
      "FC Honka-HJK",
      "Ilves-FC Lahti",
    ]);
  });

  it("leaves the last round's order alone", () => {
    const rounds = mscRounds();
    const aligned = orderRoundsForTree(rounds);

    expect(aligned.at(-1)?.ties).toEqual(rounds.at(-1)?.ties);
  });

  it("keeps a tie whose winner does not appear in the next round", () => {
    // A third-place match feeds nothing, and must not be dropped.
    const rounds = buildBracket(
      [
        leg({
          stage: "SF",
          home: [1, "A"],
          away: [2, "B"],
          kickoffAt: "2026-05-01T16:00:00Z",
          fullTime: [1, 0],
        }),
        leg({
          stage: "SF",
          home: [3, "C"],
          away: [4, "D"],
          kickoffAt: "2026-05-02T16:00:00Z",
          fullTime: [1, 0],
        }),
        leg({
          stage: "PIKKU",
          home: [2, "B"],
          away: [4, "D"],
          kickoffAt: "2026-05-19T16:00:00Z",
          fullTime: [1, 0],
        }),
        leg({
          stage: "F",
          home: [1, "A"],
          away: [3, "C"],
          kickoffAt: "2026-05-20T16:00:00Z",
          fullTime: [1, 0],
        }),
      ],
      ["SF", "PIKKU", "F"]
    );

    const aligned = orderRoundsForTree(rounds);
    const stages = aligned.map((round) => round.stage);
    expect(stages).toEqual(["SF", "PIKKU", "F"]);
    expect(aligned.flatMap((round) => round.ties)).toHaveLength(4);
  });

  it("handles a single round and an empty bracket", () => {
    expect(orderRoundsForTree([])).toEqual([]);
    const single = buildBracket(
      [
        leg({
          stage: "F",
          home: [1, "A"],
          away: [2, "B"],
          kickoffAt: "2026-05-20T16:00:00Z",
          fullTime: [1, 0],
        }),
      ],
      ["F"]
    );
    expect(orderRoundsForTree(single)).toEqual(single);
  });
});
