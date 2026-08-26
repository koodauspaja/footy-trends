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
      },
    ],
    startsAt: new Date("2025-05-31T19:00:00Z"),
    aggregateHome: 5,
    aggregateAway: 0,
    winnerTeamProviderId: 1,
    decision: "regular",
    ...overrides,
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

  it("names the round in Finnish and labels its columns", () => {
    renderBracket([{ stage: "FINAL", ties: [tie()] }]);

    expect(screen.getByRole("heading", { name: "Loppuottelu" })).toBeInTheDocument();
    expect(screen.getByText("Ottelupari")).toBeInTheDocument();
    expect(screen.getByText("Yhteistulos")).toBeInTheDocument();
    expect(screen.getByText("Osaottelut")).toBeInTheDocument();
  });

  it("marks the winner and links both teams", () => {
    renderBracket([{ stage: "FINAL", ties: [tie()] }]);

    const winner = screen.getByRole("link", { name: "Paris Saint-Germain FC" });
    const loser = screen.getByRole("link", { name: "FC Internazionale Milano" });
    expect(winner).toHaveClass("font-semibold");
    expect(loser).not.toHaveClass("font-semibold");
    expect(winner).toHaveAttribute("href", "/ulkomaat/joukkue/1");
  });

  it("shows no aggregate for a tie that is not finished", () => {
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

    // The team cell also contains a " – " separator, so target the aggregate
    // cell by position rather than by text.
    const row = screen.getByRole("row", { name: /Paris Saint-Germain FC/ });
    expect(within(row).getAllByRole("cell")[1]).toHaveTextContent("–");
  });

  it("appends (ja) for a tie settled in extra time", () => {
    renderBracket([{ stage: "FINAL", ties: [tie({ decision: "extra_time" })] }]);

    expect(screen.getByText("5–0 (ja)")).toBeInTheDocument();
  });

  it("appends (rp) for a tie settled on penalties", () => {
    renderBracket([{ stage: "FINAL", ties: [tie({ decision: "penalties" })] }]);

    expect(screen.getByText("5–0 (rp)")).toBeInTheDocument();
  });

  it("appends nothing for a tie settled in normal time", () => {
    renderBracket([{ stage: "FINAL", ties: [tie()] }]);

    expect(screen.getByText("5–0")).toBeInTheDocument();
  });

  it("shows a finished tie with no winner without a suffix", () => {
    // Level on aggregate with no shootout recorded: undecided, not a draw.
    renderBracket([
      {
        stage: "FINAL",
        ties: [
          tie({ aggregateHome: 2, aggregateAway: 2, winnerTeamProviderId: null, decision: null }),
        ],
      },
    ]);

    expect(screen.getByText("2–2")).toBeInTheDocument();
  });

  it("lists each leg with its own date and result", () => {
    renderBracket([{ stage: "FINAL", ties: [tie()] }]);

    expect(
      screen.getByText("31.05.2025 Paris Saint-Germain FC – FC Internazionale Milano 5–0")
    ).toBeInTheDocument();
  });

  it("shows a leg with no score yet as a dash", () => {
    const unplayed = tie({
      aggregateHome: null,
      aggregateAway: null,
      winnerTeamProviderId: null,
      decision: null,
    });
    const [leg] = unplayed.legs;
    if (leg === undefined) throw new Error("expected a leg");
    renderBracket([
      {
        stage: "FINAL",
        ties: [{ ...unplayed, legs: [{ ...leg, homeGoals: null, awayGoals: null }] }],
      },
    ]);

    expect(
      screen.getByText("31.05.2025 Paris Saint-Germain FC – FC Internazionale Milano –")
    ).toBeInTheDocument();
  });

  it("renders every round it is given", () => {
    renderBracket([
      { stage: "SEMI_FINALS", ties: [tie({ key: "SEMI_FINALS:1-2:1", stage: "SEMI_FINALS" })] },
      { stage: "FINAL", ties: [tie()] },
    ]);

    expect(screen.getByRole("heading", { name: "Välierät" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Loppuottelu" })).toBeInTheDocument();
  });
});
