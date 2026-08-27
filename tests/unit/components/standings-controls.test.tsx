import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StandingsControls } from "@/components/standings-controls";
import type { Competition } from "@/lib/competitions";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const competitions: Competition[] = [
  {
    code: "PL",
    name: "Valioliiga",
    flagUrl: "https://crests.football-data.org/770.svg",
    country: "Englanti",
    format: "league",
    region: "foreign",
  },
  {
    code: "BL1",
    name: "Bundesliga",
    flagUrl: "https://crests.football-data.org/759.svg",
    country: "Saksa",
    format: "league",
    region: "foreign",
  },
];

const seasons = [
  { seasonId: 2025, label: "2025/26" },
  { seasonId: 2024, label: "2024/25" },
  { seasonId: 2023, label: "2023/24" },
];

describe("StandingsControls", () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.history.pushState({}, "", "/ulkomaat/sarjataulukko");
  });

  it("labels all three controls in Finnish and associates them with their selects", () => {
    render(
      <StandingsControls
        basePath="/ulkomaat"
        competitions={competitions}
        selectedCompetitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={undefined}
      />
    );

    expect(screen.getByLabelText("Kilpailu")).toBe(screen.getAllByRole("combobox")[0]);
    expect(screen.getByLabelText("Kausi")).toBe(screen.getAllByRole("combobox")[1]);
    expect(screen.getByLabelText("Kierros")).toBe(screen.getAllByRole("combobox")[2]);
  });

  it("lists the seasons newest first", () => {
    render(
      <StandingsControls
        basePath="/ulkomaat"
        competitions={competitions}
        selectedCompetitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[]}
        selectedRound={undefined}
      />
    );

    const seasonOptions = screen.getAllByRole("option", { name: /\d{4}\/\d{2}/ });
    expect(seasonOptions.map((option) => option.textContent)).toEqual([
      "2025/26",
      "2024/25",
      "2023/24",
    ]);
  });

  it("lists rounds 1..N with a whole-season option first", () => {
    render(
      <StandingsControls
        basePath="/ulkomaat"
        competitions={competitions}
        selectedCompetitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={undefined}
      />
    );

    expect(screen.getByLabelText("Kierros").querySelectorAll("option")).toHaveLength(4);
    expect(
      Array.from(screen.getByLabelText("Kierros").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toEqual(["Koko kausi", "Kierros 1", "Kierros 2", "Kierros 3"]);
  });

  it("preselects the current competition, season, and round", () => {
    render(
      <StandingsControls
        basePath="/ulkomaat"
        competitions={competitions}
        selectedCompetitionCode="BL1"
        seasons={seasons}
        selectedSeasonId={2024}
        availableRounds={[1, 2, 3]}
        selectedRound={2}
      />
    );

    expect(screen.getByLabelText("Kilpailu")).toHaveValue("BL1");
    expect(screen.getByLabelText("Kausi")).toHaveValue("2024");
    expect(screen.getByLabelText("Kierros")).toHaveValue("2");
  });

  it("preselects the whole-season option when no round is selected", () => {
    render(
      <StandingsControls
        basePath="/ulkomaat"
        competitions={competitions}
        selectedCompetitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={undefined}
      />
    );

    expect(screen.getByLabelText("Kierros")).toHaveValue("");
  });

  it("navigates to the chosen competition, keeping the current season and round", () => {
    render(
      <StandingsControls
        basePath="/ulkomaat"
        competitions={competitions}
        selectedCompetitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={2}
      />
    );

    fireEvent.change(screen.getByLabelText("Kilpailu"), { target: { value: "BL1" } });

    expect(pushMock).toHaveBeenCalledWith(
      "/ulkomaat/sarjataulukko?kilpailu=BL1&kausi=2025&kierros=2"
    );
  });

  it("navigates to the chosen season, keeping the current competition and round", () => {
    render(
      <StandingsControls
        basePath="/ulkomaat"
        competitions={competitions}
        selectedCompetitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={2}
      />
    );

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2023" } });

    expect(pushMock).toHaveBeenCalledWith(
      "/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2023&kierros=2"
    );
  });

  it("navigates to the chosen round, keeping the current competition and season", () => {
    render(
      <StandingsControls
        basePath="/ulkomaat"
        competitions={competitions}
        selectedCompetitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={undefined}
      />
    );

    fireEvent.change(screen.getByLabelText("Kierros"), { target: { value: "3" } });

    expect(pushMock).toHaveBeenCalledWith(
      "/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2025&kierros=3"
    );
  });

  it("preserves unrelated query params already in the URL", () => {
    window.history.pushState(
      {},
      "",
      "/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2025&utm_source=newsletter"
    );

    render(
      <StandingsControls
        basePath="/ulkomaat"
        competitions={competitions}
        selectedCompetitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={undefined}
      />
    );

    fireEvent.change(screen.getByLabelText("Kierros"), { target: { value: "2" } });

    expect(pushMock).toHaveBeenCalledWith(
      "/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2025&utm_source=newsletter&kierros=2"
    );
  });

  it("clears the round param when switching back to whole season", () => {
    render(
      <StandingsControls
        basePath="/ulkomaat"
        competitions={competitions}
        selectedCompetitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={2}
      />
    );

    fireEvent.change(screen.getByLabelText("Kierros"), { target: { value: "" } });

    expect(pushMock).toHaveBeenCalledWith("/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2025");
  });

  it("submits as a plain GET form so it works without scripting", () => {
    const { container } = render(
      <StandingsControls
        basePath="/ulkomaat"
        competitions={competitions}
        selectedCompetitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={undefined}
      />
    );
    const form = container.querySelector("form");

    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/ulkomaat/sarjataulukko");
    expect(screen.getByLabelText("Kilpailu")).toHaveAttribute("name", "kilpailu");
    expect(screen.getByLabelText("Kausi")).toHaveAttribute("name", "kausi");
    expect(screen.getByLabelText("Kierros")).toHaveAttribute("name", "kierros");
    expect(container.querySelector("noscript")).not.toBeNull();
  });
});
