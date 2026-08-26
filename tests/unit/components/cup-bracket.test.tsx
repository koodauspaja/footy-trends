import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CupBracket } from "@/components/cup-bracket";
import type { BracketRound, BracketTie } from "@/lib/cup-bracket";

function tie(overrides: Partial<BracketTie> = {}): BracketTie {
  return {
    key: "FINAL:1-2:100",
    stage: "FINAL",
    home: { teamProviderId: 1, teamName: "Paris Saint-Germain FC" },
    away: { teamProviderId: 2, teamName: "FC Internazionale Milano" },
    legs: [
      {
        providerMatchId: 100,
        kickoffAt: new Date("2025-05-31T19:00:00Z"),
        homeTeamProviderId: 1,
        homeTeamName: "Paris Saint-Germain FC",
        awayTeamProviderId: 2,
        awayTeamName: "FC Internazionale Milano",
        homeGoals: 5,
        awayGoals: 0,
        penaltiesHome: null,
        penaltiesAway: null,
      },
    ],
    startsAt: new Date("2025-05-31T19:00:00Z"),
    aggregateHome: 5,
    aggregateAway: 0,
    penaltiesHome: null,
    penaltiesAway: null,
    winnerTeamProviderId: 1,
    decision: "regular",
    ...overrides,
  };
}

/** A listed round whose tie has two legs. */
function twoLeggedRound(stage = "LAST_16"): BracketRound {
  const base = tie({ key: `${stage}:1-2:1`, stage });
  const [leg] = base.legs;
  if (leg === undefined) throw new Error("expected a leg");
  return {
    stage,
    ties: [
      {
        ...base,
        legs: [leg, { ...leg, providerMatchId: 101, kickoffAt: new Date("2025-06-07T19:00:00Z") }],
      },
    ],
  };
}

/** A round that is listed rather than drawn. */
function listedRound(stage = "LAST_16"): BracketRound {
  return {
    stage,
    ties: [tie({ key: `${stage}:1-2:1`, stage })],
  };
}

function renderBracket(rounds: BracketRound[]) {
  render(<CupBracket rounds={rounds} teamHref={(id) => `/ulkomaat/joukkue/${id}`} />);
}

describe("CupBracket", () => {
  it("tells the user when the knockout rounds have not started", () => {
    renderBracket([]);

    expect(screen.getByText("Pudotuspelit eivät ole vielä alkaneet.")).toBeInTheDocument();
  });

  describe("rounds drawn as a tree", () => {
    it("names each round in Finnish, one column per round", () => {
      renderBracket([
        { stage: "QUARTER_FINALS", ties: [tie({ key: "QF:1-2:1", stage: "QUARTER_FINALS" })] },
        { stage: "SEMI_FINALS", ties: [tie({ key: "SF:1-2:2", stage: "SEMI_FINALS" })] },
        { stage: "FINAL", ties: [tie()] },
      ]);

      expect(screen.getByRole("heading", { name: "Puolivälierät" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Välierät" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Loppuottelu" })).toBeInTheDocument();
    });

    it("stacks both teams with their aggregate goals, winner in bold", () => {
      renderBracket([{ stage: "FINAL", ties: [tie()] }]);

      const winner = screen.getByRole("link", { name: "Paris Saint-Germain FC" });
      const loser = screen.getByRole("link", { name: "FC Internazionale Milano" });
      expect(winner).toHaveClass("font-semibold");
      expect(loser).not.toHaveClass("font-semibold");
      expect(winner).toHaveAttribute("href", "/ulkomaat/joukkue/1");
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument();
    });

    it("does not render a table for a drawn round", () => {
      renderBracket([{ stage: "FINAL", ties: [tie()] }]);

      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.queryByText("Ottelupari")).not.toBeInTheDocument();
    });

    it("shows dashes for a tie that has not been played", () => {
      renderBracket([
        {
          stage: "FINAL",
          ties: [
            tie({
              aggregateHome: null,
              aggregateAway: null,
              winnerTeamProviderId: null,
              decision: null,
            }),
          ],
        },
      ]);

      expect(screen.getAllByText("–")).toHaveLength(2);
    });

    it("labels a tie settled in extra time", () => {
      renderBracket([{ stage: "FINAL", ties: [tie({ decision: "extra_time" })] }]);

      expect(screen.getByText("(ja)")).toBeInTheDocument();
    });

    it("labels a tie settled on penalties", () => {
      renderBracket([{ stage: "FINAL", ties: [tie({ decision: "penalties" })] }]);

      expect(screen.getByText("(rp)")).toBeInTheDocument();
    });

    it("shows each side's shootout score beside its aggregate", () => {
      // The football convention: 1 (4) over 1 (3).
      renderBracket([
        {
          stage: "FINAL",
          ties: [
            tie({
              aggregateHome: 1,
              aggregateAway: 1,
              penaltiesHome: 4,
              penaltiesAway: 3,
              decision: "penalties",
            }),
          ],
        },
      ]);

      expect(screen.getByText("(4)")).toBeInTheDocument();
      expect(screen.getByText("(3)")).toBeInTheDocument();
      expect(screen.getAllByText("1")).toHaveLength(2);
    });

    it("labels nothing for a tie settled in normal time", () => {
      renderBracket([{ stage: "FINAL", ties: [tie()] }]);

      expect(screen.queryByText("(ja)")).not.toBeInTheDocument();
      expect(screen.queryByText("(rp)")).not.toBeInTheDocument();
    });

    it("labels nothing for a finished tie with no winner", () => {
      renderBracket([
        {
          stage: "FINAL",
          ties: [
            tie({ aggregateHome: 2, aggregateAway: 2, winnerTeamProviderId: null, decision: null }),
          ],
        },
      ]);

      expect(screen.getAllByText("2")).toHaveLength(2);
      expect(screen.queryByText("(rp)")).not.toBeInTheDocument();
    });
  });

  describe("rounds listed above the tree", () => {
    it("renders a single-leg round as date, pairing and final result", () => {
      renderBracket([listedRound("PLAYOFFS")]);

      expect(screen.getByRole("heading", { name: "Pudotuspelikarsinta" })).toBeInTheDocument();
      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getByText("Pvm")).toBeInTheDocument();
      expect(screen.getByText("Ottelupari")).toBeInTheDocument();
      // The tie *is* the match, so there is no aggregate and no per-leg column.
      expect(screen.getByText("Lopputulos")).toBeInTheDocument();
      expect(screen.queryByText("Yhteistulos")).not.toBeInTheDocument();
      expect(screen.queryByText("Osaottelut")).not.toBeInTheDocument();
    });

    it("renders a two-legged round with the aggregate and both legs", () => {
      const base = tie({ key: "L16:1-2:1", stage: "LAST_16" });
      const [leg] = base.legs;
      if (leg === undefined) throw new Error("expected a leg");
      renderBracket([
        {
          stage: "LAST_16",
          ties: [
            {
              ...base,
              legs: [
                leg,
                { ...leg, providerMatchId: 101, kickoffAt: new Date("2025-06-07T19:00:00Z") },
              ],
            },
          ],
        },
      ]);

      expect(screen.getByText("Yhteistulos")).toBeInTheDocument();
      expect(screen.getByText("Osaottelut")).toBeInTheDocument();
      expect(screen.queryByText("Lopputulos")).not.toBeInTheDocument();
    });

    it("states the shootout score on the aggregate", () => {
      renderBracket([
        {
          stage: "LAST_16",
          ties: [
            tie({
              key: "L16:1-2:1",
              stage: "LAST_16",
              aggregateHome: 1,
              aggregateAway: 1,
              penaltiesHome: 4,
              penaltiesAway: 2,
              decision: "penalties",
            }),
          ],
        },
      ]);

      expect(screen.getByText("1–1 (rp 4–2)")).toBeInTheDocument();
    });

    it("labels an extra-time tie without inventing a shootout", () => {
      renderBracket([
        {
          stage: "LAST_16",
          ties: [tie({ key: "L16:1-2:1", stage: "LAST_16", decision: "extra_time" })],
        },
      ]);

      expect(screen.getByText("5–0 (ja)")).toBeInTheDocument();
    });

    it("shows no aggregate for a tie that is not finished", () => {
      renderBracket([
        {
          stage: "LAST_16",
          ties: [
            tie({
              key: "L16:1-2:1",
              stage: "LAST_16",
              aggregateHome: null,
              aggregateAway: null,
              winnerTeamProviderId: null,
              decision: null,
            }),
          ],
        },
      ]);

      const row = screen.getByRole("row", { name: /Paris Saint-Germain FC/ });
      expect(within(row).getAllByRole("cell")[1]).toHaveTextContent("–");
    });

    it("lists each leg with its own date and result", () => {
      renderBracket([twoLeggedRound()]);

      expect(
        screen.getByText("31.05.2025 Paris Saint-Germain FC – FC Internazionale Milano 5–0")
      ).toBeInTheDocument();
    });

    it("states a shootout separately from the leg's own score", () => {
      // The per-leg column only exists on a two-legged round, and the leg score
      // must not be the provider's `fullTime`, which folds the shootout in.
      const base = twoLeggedRound();
      const [first, second] = base.ties[0]?.legs ?? [];
      if (first === undefined || second === undefined) throw new Error("expected two legs");
      renderBracket([
        {
          ...base,
          ties: [
            {
              ...(base.ties[0] as (typeof base.ties)[number]),
              legs: [
                first,
                { ...second, homeGoals: 0, awayGoals: 1, penaltiesHome: 1, penaltiesAway: 4 },
              ],
            },
          ],
        },
      ]);

      expect(
        screen.getByText(
          "07.06.2025 Paris Saint-Germain FC – FC Internazionale Milano 0–1 (rp 1–4)"
        )
      ).toBeInTheDocument();
    });

    it("shows a leg with no score yet as a dash", () => {
      const base = twoLeggedRound();
      const [first, second] = base.ties[0]?.legs ?? [];
      if (first === undefined || second === undefined) throw new Error("expected two legs");
      renderBracket([
        {
          ...base,
          ties: [
            {
              ...(base.ties[0] as (typeof base.ties)[number]),
              legs: [first, { ...second, homeGoals: null, awayGoals: null }],
            },
          ],
        },
      ]);

      expect(
        screen.getByText("07.06.2025 Paris Saint-Germain FC – FC Internazionale Milano –")
      ).toBeInTheDocument();
    });
  });

  it("lists the earlier rounds and draws the later ones in the same view", () => {
    renderBracket([
      listedRound("PLAYOFFS"),
      listedRound("LAST_16"),
      { stage: "QUARTER_FINALS", ties: [tie({ key: "QF:1-2:9", stage: "QUARTER_FINALS" })] },
      { stage: "FINAL", ties: [tie()] },
    ]);

    // Two listed rounds keep their tables; the two drawn rounds do not add any.
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Pudotuspelikarsinta" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Neljännesvälierät" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Puolivälierät" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Loppuottelu" })).toBeInTheDocument();
  });

  it("draws the tree even when the season has no listed rounds", () => {
    renderBracket([{ stage: "FINAL", ties: [tie()] }]);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Loppuottelu" })).toBeInTheDocument();
  });
});
