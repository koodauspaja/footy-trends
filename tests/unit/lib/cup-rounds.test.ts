import { describe, expect, it } from "vitest";
import {
  buildCupBracket,
  type CupRoundGroup,
  normaliseRoundName,
  selectBracketRounds,
} from "@/lib/cup-rounds";

/** Builds a season's knockout groups in TASO's own order. */
function groups(...shape: Array<[string, number]>): CupRoundGroup[] {
  return shape.map(([groupName, teamCount], index) => ({
    groupId: index + 1,
    groupName,
    teamCount,
  }));
}

describe("normaliseRoundName", () => {
  it("normalises the numbered-round form to the common one", () => {
    // 'Kierros N' outnumbers 'N. Kierros' 63 to 23 across MSC and NSC.
    expect(normaliseRoundName("1. Kierros")).toBe("Kierros 1");
    expect(normaliseRoundName("6. Kierros")).toBe("Kierros 6");
    expect(normaliseRoundName("Kierros 1")).toBe("Kierros 1");
  });

  it("normalises the final to the current era's name", () => {
    // Deliberately the less common of the two: the split is by era, not
    // popularity, and reverses as seasons accumulate.
    expect(normaliseRoundName("Finaali")).toBe("Loppuottelu");
    expect(normaliseRoundName("Loppuottelu")).toBe("Loppuottelu");
  });

  it("does not touch a name that merely contains Finaali", () => {
    // A substring replace would mangle both of these.
    expect(normaliseRoundName("Pikkufinaali")).toBe("Pikkufinaali");
    expect(normaliseRoundName("Finaali-Kakkonen")).toBe("Finaali-Kakkonen");
  });

  it("passes every other TASO name through untouched", () => {
    for (const name of [
      "Juuson kierros",
      "Tasaus",
      "Superkierros",
      "Puolivälieräkarsinnat",
      "Kierros 1B",
      "Lohko A",
      "Välierät",
    ]) {
      expect(normaliseRoundName(name)).toBe(name);
    }
  });
});

describe("selectBracketRounds", () => {
  it("picks the closing three rounds of a normal cup season", () => {
    // MSC 2025.
    const chosen = selectBracketRounds(
      groups(
        ["Juuson kierros", 248],
        ["Kierros 1", 240],
        ["Kierros 2", 120],
        ["Kierros 3", 112],
        ["Kierros 4", 56],
        ["Kierros 5", 32],
        ["Kierros 6", 16],
        ["Puolivälierät", 8],
        ["Välierät", 4],
        ["Loppuottelu", 2]
      )
    );

    expect(chosen.map((group) => group.groupName)).toEqual([
      "Puolivälierät",
      "Välierät",
      "Loppuottelu",
    ]);
  });

  it("rejects an early round that happens to have eight teams", () => {
    // MSC 2018: `Kierros 1` has 8 teams but is the first round.
    const chosen = selectBracketRounds(
      groups(
        ["Kierros 1", 8],
        ["Kierros 2", 40],
        ["Kierros 3", 20],
        ["Kierros 4", 10],
        ["Puolivälieräkarsinnat", 6],
        ["Puolivälierät", 8],
        ["Välierät", 4],
        ["Finaali", 2]
      )
    );

    expect(chosen.map((group) => group.groupName)).toEqual([
      "Puolivälierät",
      "Välierät",
      "Finaali",
    ]);
  });

  it("leaves a third-place match out of the bracket", () => {
    // NSC 2015: `Pikkufinaali` (2 teams) sits before `Finaali` (2 teams).
    const chosen = selectBracketRounds(
      groups(
        ["Kierros 1", 28],
        ["Kierros 2", 16],
        ["Puolivälierät", 8],
        ["Välierät", 4],
        ["Pikkufinaali", 2],
        ["Finaali", 2]
      )
    );

    expect(chosen.map((group) => group.groupName)).toEqual([
      "Puolivälierät",
      "Välierät",
      "Finaali",
    ]);
  });

  it("draws no bracket for a season with no knockout rounds", () => {
    // MSC 2021: the 4-team groups keep tables, so the caller never passes
    // them; what remains has no 2-team group.
    const chosen = selectBracketRounds(groups(["Kakkosen-Cup", 40], ["Cup-vaihe", 24]));

    expect(chosen).toEqual([]);
  });

  it("draws no bracket for an empty season", () => {
    expect(selectBracketRounds([])).toEqual([]);
  });

  it("draws the rounds it has when the chain is incomplete", () => {
    const chosen = selectBracketRounds(
      groups(["Kierros 1", 30], ["Välierät", 4], ["Loppuottelu", 2])
    );

    expect(chosen.map((group) => group.groupName)).toEqual(["Välierät", "Loppuottelu"]);
  });

  it("stops at the quarter-finals rather than walking the whole cup", () => {
    // A 16-team round is a valid halving of 8, and is still not drawn.
    const chosen = selectBracketRounds(
      groups(["Kierros 6", 16], ["Puolivälierät", 8], ["Välierät", 4], ["Loppuottelu", 2])
    );

    expect(chosen.map((group) => group.groupName)).not.toContain("Kierros 6");
    expect(chosen).toHaveLength(3);
  });

  it("requires each round to precede the one it feeds", () => {
    // A 4-team group only *after* the final cannot be its semi-final.
    const chosen = selectBracketRounds(groups(["Loppuottelu", 2], ["Sekalaista", 4]));

    expect(chosen.map((group) => group.groupName)).toEqual(["Loppuottelu"]);
  });
});

describe("buildCupBracket", () => {
  function knockoutMatch(
    home: [number, string],
    away: [number, string],
    score: [number, number] | null,
    winner: "home" | "away" | "tie" | null,
    day: number
  ) {
    return {
      providerMatchId: home[0] * 1000 + away[0],
      status: score === null ? "SCHEDULED" : "FINISHED",
      kickoffAt: new Date(`2025-06-${String(day).padStart(2, "0")}T16:00:00Z`),
      homeTeamProviderId: home[0],
      homeTeamName: home[1],
      awayTeamProviderId: away[0],
      awayTeamName: away[1],
      homeGoals: score?.[0] ?? null,
      awayGoals: score?.[1] ?? null,
      winner,
    };
  }

  /** The real closing rounds of MSC 2025. */
  function mscGroups() {
    return [
      {
        groupId: 1,
        groupName: "Kierros 6",
        matches: Array.from({ length: 8 }, (_, index) =>
          knockoutMatch([100 + index, `A${index}`], [200 + index, `B${index}`], [1, 0], "home", 1)
        ),
      },
      {
        groupId: 2,
        groupName: "Puolivälierät",
        matches: [
          knockoutMatch([1, "HJK Klubi 04"], [2, "HJK"], [0, 4], "away", 11),
          knockoutMatch([3, "FC Haka"], [4, "KuPS"], [1, 1], "away", 11),
          knockoutMatch([5, "AC Oulu"], [6, "SJK"], [2, 0], "home", 12),
          knockoutMatch([7, "EIF"], [8, "FF Jaro"], [2, 4], "away", 12),
        ],
      },
      {
        groupId: 3,
        groupName: "Välierät",
        matches: [
          knockoutMatch([2, "HJK"], [5, "AC Oulu"], [1, 0], "home", 20),
          knockoutMatch([4, "KuPS"], [8, "FF Jaro"], [2, 0], "home", 20),
        ],
      },
      {
        groupId: 4,
        groupName: "Finaali",
        matches: [knockoutMatch([2, "HJK"], [4, "KuPS"], [1, 0], "home", 25)],
      },
    ];
  }

  it("draws the closing three rounds under their normalised names", () => {
    const rounds = buildCupBracket(mscGroups());

    expect(rounds.map((round) => round.stage)).toEqual([
      "Puolivälierät",
      "Välierät",
      "Loppuottelu",
    ]);
    expect(rounds.map((round) => round.ties.length)).toEqual([4, 2, 1]);
  });

  it("settles a level cup tie from TASO's own winner", () => {
    // FC Haka 1-1 KuPS: level, and KuPS plays the semi-final.
    const rounds = buildCupBracket(mscGroups());
    const quarterFinals = rounds[0]?.ties ?? [];
    const haka = quarterFinals.find((tie) => tie.home.teamName === "FC Haka");

    expect(haka?.aggregateHome).toBe(1);
    expect(haka?.aggregateAway).toBe(1);
    expect(haka?.winnerTeamProviderId).toBe(4);
    expect(haka?.decision).toBe("declared");
  });

  it("names HJK the winner of the final", () => {
    const rounds = buildCupBracket(mscGroups());
    const final = rounds.at(-1)?.ties[0];

    expect(final?.winnerTeamProviderId).toBe(2);
    expect(final?.home.teamName).toBe("HJK");
  });

  it("draws nothing for a season with no closing rounds", () => {
    // MSC 2021: `Cup-vaihe` is 24 teams wide and the season simply ends there.
    expect(
      buildCupBracket([
        {
          groupId: 1,
          groupName: "Cup-vaihe",
          matches: Array.from({ length: 12 }, (_, index) =>
            knockoutMatch([index + 1, `A${index}`], [index + 20, `B${index}`], [1, 0], "home", 1)
          ),
        },
      ])
    ).toEqual([]);
  });

  it("draws a single column for a competition that is only a final", () => {
    // Two teams and nothing before them is a final by the rule, and drawing
    // one column is the honest rendering of that.
    const rounds = buildCupBracket([
      {
        groupId: 1,
        groupName: "Loppuottelu",
        matches: [knockoutMatch([1, "A"], [2, "B"], [1, 0], "home", 25)],
      },
    ]);

    expect(rounds.map((round) => round.stage)).toEqual(["Loppuottelu"]);
  });

  it("draws nothing when there are no knockout groups at all", () => {
    expect(buildCupBracket([])).toEqual([]);
  });

  it("counts teams from the matches, not from the group's rows", () => {
    // A knockout group's getGroups rows are per bracket slot; the distinct
    // teams in its own matches are what make a round 8, 4 or 2 wide.
    const rounds = buildCupBracket([
      {
        groupId: 1,
        groupName: "Välierät",
        matches: [
          knockoutMatch([1, "A"], [2, "B"], [1, 0], "home", 20),
          knockoutMatch([3, "C"], [4, "D"], [1, 0], "home", 20),
        ],
      },
      {
        groupId: 2,
        groupName: "Loppuottelu",
        matches: [knockoutMatch([1, "A"], [3, "C"], [2, 1], "home", 25)],
      },
    ]);

    expect(rounds.map((round) => round.stage)).toEqual(["Välierät", "Loppuottelu"]);
  });

  it("ignores a league-style tie verdict", () => {
    // `winner: "tie"` never occurs in a cup, but must not be mistaken for a
    // team if it ever appears.
    const rounds = buildCupBracket([
      {
        groupId: 1,
        groupName: "Loppuottelu",
        matches: [knockoutMatch([1, "A"], [2, "B"], [1, 1], "tie", 25)],
      },
    ]);

    expect(rounds[0]?.ties[0]?.winnerTeamProviderId).toBeNull();
  });
});
