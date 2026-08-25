import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StandingsLegend, type StandingsRow, StandingsTable } from "@/components/standings-table";

function buildRow(overrides: Partial<StandingsRow> = {}): StandingsRow {
  return {
    position: 1,
    teamProviderId: 1,
    teamName: "HJK",
    played: 3,
    won: 2,
    drawn: 1,
    lost: 0,
    goalsFor: 5,
    goalsAgainst: 2,
    goalDifference: 3,
    points: 7,
    form: [{ matchId: 1, result: "V", label: "Voitto" }],
    ...overrides,
  };
}

const teamHref = (id: number) => `/ulkomaat/joukkue/${id}?kilpailu=PL&kausi=2025`;

describe("StandingsTable", () => {
  it("renders the Finnish column headers with their full-word titles", () => {
    render(<StandingsTable standings={[buildRow()]} teamHref={teamHref} />);

    expect(screen.getByText("Sija")).toBeInTheDocument();
    expect(screen.getByText("Joukkue")).toBeInTheDocument();
    expect(screen.getByText("Vire")).toBeInTheDocument();
    expect(screen.getByTitle("Ottelut")).toHaveTextContent("O");
    expect(screen.getByTitle("Maaliero")).toHaveTextContent("ME");
    expect(screen.getByTitle("Pisteet")).toHaveTextContent("P");
  });

  it("renders numeric stats as-is and links the team name via teamHref", () => {
    render(<StandingsTable standings={[buildRow()]} teamHref={teamHref} />);

    expect(screen.getByRole("link", { name: "HJK" })).toHaveAttribute(
      "href",
      "/ulkomaat/joukkue/1?kilpailu=PL&kausi=2025"
    );
    const row = screen.getByRole("link", { name: "HJK" }).closest("tr");
    if (!row) throw new Error("Expected the HJK row to exist");
    expect(
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["1", "3", "2", "1", "0", "5", "2", "3", "7", "V"]);
  });

  it('renders every null stat as "–" rather than crashing or printing null', () => {
    const nullRow = buildRow({
      played: null,
      won: null,
      drawn: null,
      lost: null,
      goalsFor: null,
      goalsAgainst: null,
      goalDifference: null,
      points: null,
      form: [],
    });

    render(<StandingsTable standings={[nullRow]} teamHref={teamHref} />);

    const row = screen.getByRole("link", { name: "HJK" }).closest("tr");
    if (!row) throw new Error("Expected the HJK row to exist");
    const cells = within(row).getAllByRole("cell");
    // Position (first) is never null; the 8 stat cells are "–"; Vire (last) is empty.
    expect(cells.slice(1, -1).map((c) => c.textContent)).toEqual(Array(8).fill("–"));
    expect(cells.at(-1)).toHaveTextContent("");
  });

  it("shows a team with no id (a pass-through group's row) as plain text, not a link", () => {
    render(
      <StandingsTable
        standings={[buildRow({ teamProviderId: 0, teamName: "Unknown" })]}
        teamHref={teamHref}
      />
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("labels the form cell with the full Finnish result words for screen readers", () => {
    render(
      <StandingsTable
        standings={[
          buildRow({
            form: [
              { matchId: 1, result: "V", label: "Voitto" },
              { matchId: 2, result: "T", label: "Tasapeli" },
            ],
          }),
        ]}
        teamHref={teamHref}
      />
    );

    expect(screen.getByLabelText("Voitto, Tasapeli")).toHaveTextContent("VT");
  });

  it("renders an empty table body for an empty standings list", () => {
    render(<StandingsTable standings={[]} teamHref={teamHref} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryAllByRole("row")).toHaveLength(1); // header row only
  });
});

describe("StandingsLegend", () => {
  it("spells out every column abbreviation in Finnish", () => {
    render(<StandingsLegend />);

    expect(
      screen.getByText(
        "O = ottelut, V = voitot, T = tasapelit, H = häviöt, TM = tehdyt maalit, PM = päästetyt maalit, ME = maaliero, P = pisteet."
      )
    ).toBeInTheDocument();
  });
});
