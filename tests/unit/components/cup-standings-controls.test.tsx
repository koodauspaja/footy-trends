import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CupStandingsControls } from "@/components/cup-standings-controls";
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
    code: "CL",
    name: "Mestarien liiga",
    flagUrl: "https://crests.football-data.org/EUR.svg",
    country: "Eurooppa",
    format: "cup",
    region: "foreign",
  },
];

const seasons = [
  { seasonId: 2025, label: "2025/26" },
  { seasonId: 2024, label: "2024/25" },
  { seasonId: 2023, label: "2023/24" },
];

function renderControls() {
  render(
    <CupStandingsControls
      basePath="/ulkomaat"
      showCompetitionSelect
      competitions={competitions}
      selectedCompetitionCode="CL"
      seasons={seasons}
      selectedSeasonId={2024}
    />
  );
}

describe("CupStandingsControls", () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.history.pushState({}, "", "/ulkomaat/sarjataulukko");
  });

  it("shows competition and season, but no round selector", () => {
    renderControls();

    expect(screen.getByLabelText("Kilpailu")).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
    expect(screen.queryByLabelText("Kierros")).not.toBeInTheDocument();
  });

  it("submits as a plain GET form so it works without scripting", () => {
    renderControls();

    const form = screen.getByLabelText("Kilpailu").closest("form");
    expect(form).toHaveAttribute("action", "/ulkomaat/sarjataulukko");
    expect(form).toHaveAttribute("method", "get");
    // The no-JS submit button is inside <noscript>, which React renders empty
    // under jsdom, so its presence is not assertable here.
    expect(form?.querySelector("noscript")).toBeInTheDocument();
  });

  it("navigates when the competition changes, keeping the season", () => {
    renderControls();

    fireEvent.change(screen.getByLabelText("Kilpailu"), { target: { value: "PL" } });

    expect(pushMock).toHaveBeenCalledWith("/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024");
  });

  it("navigates when the season changes, keeping the competition", () => {
    renderControls();

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2023" } });

    expect(pushMock).toHaveBeenCalledWith("/ulkomaat/sarjataulukko?kilpailu=CL&kausi=2023");
  });

  it("drops a round carried over from a league competition", () => {
    // Switching Valioliiga -> Mestarien liiga must not leave `kierros` behind:
    // a cup page has no round selector to clear it again.
    window.history.pushState({}, "", "/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024&kierros=7");
    renderControls();

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2025" } });

    expect(pushMock).toHaveBeenCalledWith("/ulkomaat/sarjataulukko?kilpailu=CL&kausi=2025");
  });

  it("preserves a query parameter it does not own", () => {
    window.history.pushState({}, "", "/ulkomaat/sarjataulukko?kilpailu=CL&kausi=2024&muu=arvo");
    renderControls();

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2023" } });

    expect(pushMock).toHaveBeenCalledWith(
      "/ulkomaat/sarjataulukko?kilpailu=CL&kausi=2023&muu=arvo"
    );
  });
});

describe("CupStandingsControls without a competition select", () => {
  it("shows only the season, for a region of separate tournaments", () => {
    // The World Cup and the Euro are not views of one another, so a dropdown
    // between them would read as if one were a variant of the other.
    render(
      <CupStandingsControls
        basePath="/maajoukkueet"
        competitions={competitions}
        selectedCompetitionCode="WC"
        seasons={seasons}
        selectedSeasonId={2026}
        showCompetitionSelect={false}
      />
    );

    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
    expect(screen.queryByLabelText("Kilpailu")).not.toBeInTheDocument();
  });
});
