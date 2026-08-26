import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TasoStandingsControls } from "@/components/taso-standings-controls";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const seasons = [
  { seasonId: 2026, label: "2026" },
  { seasonId: 2025, label: "2025" },
];

describe("TasoStandingsControls", () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.history.pushState({}, "", "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026");
  });

  it("carries the competition code via a hidden field, with no visible Kilpailu select", () => {
    render(
      <TasoStandingsControls
        competitionCode="VL"
        seasons={seasons}
        selectedSeasonId={2026}
        availableRounds={[1, 2]}
        selectedRound={undefined}
      />
    );

    expect(screen.queryByLabelText("Kilpailu")).not.toBeInTheDocument();
    const hidden = document.querySelector('input[name="kilpailu"]');
    expect(hidden).toHaveValue("VL");
  });

  it("navigates to the standings page with the selected season, keeping the round", () => {
    render(
      <TasoStandingsControls
        competitionCode="VL"
        seasons={seasons}
        selectedSeasonId={2026}
        availableRounds={[1, 2]}
        selectedRound={2}
      />
    );

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2025" } });

    expect(pushMock).toHaveBeenCalledWith(
      "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2025&kierros=2"
    );
  });

  it("navigates with kierros removed when 'Koko kausi' is chosen", () => {
    render(
      <TasoStandingsControls
        competitionCode="VL"
        seasons={seasons}
        selectedSeasonId={2026}
        availableRounds={[1, 2]}
        selectedRound={2}
      />
    );

    fireEvent.change(screen.getByLabelText("Kierros"), { target: { value: "" } });

    expect(pushMock).toHaveBeenCalledWith("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026");
  });

  it("navigates with the chosen round set", () => {
    render(
      <TasoStandingsControls
        competitionCode="VL"
        seasons={seasons}
        selectedSeasonId={2026}
        availableRounds={[1, 2]}
        selectedRound={undefined}
      />
    );

    fireEvent.change(screen.getByLabelText("Kierros"), { target: { value: "1" } });

    expect(pushMock).toHaveBeenCalledWith(
      "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026&kierros=1"
    );
  });
});

describe("TasoStandingsControls with no rounds", () => {
  it("hides the round select when the season has no round-aware group", () => {
    // A cup's groups are all knockout rounds, so the select would offer only
    // "Koko kausi" and do nothing.
    render(
      <TasoStandingsControls
        competitionCode="MSC"
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[]}
        selectedRound={undefined}
      />
    );

    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
    expect(screen.queryByLabelText("Kierros")).not.toBeInTheDocument();
  });
});
