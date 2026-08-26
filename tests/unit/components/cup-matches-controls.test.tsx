import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CupMatchesControls } from "@/components/cup-matches-controls";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const seasons = [
  { seasonId: 2025, label: "2025/26" },
  { seasonId: 2024, label: "2024/25" },
];

const stages = ["LEAGUE_STAGE", "QUARTER_FINALS", "FINAL"];

function renderControls(selectedStage: string | undefined) {
  render(
    <CupMatchesControls
      competitionCode="CL"
      seasons={seasons}
      selectedSeasonId={2024}
      availableStages={stages}
      selectedStage={selectedStage}
    />
  );
}

describe("CupMatchesControls", () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.history.pushState({}, "", "/ulkomaat/ottelut?kilpailu=CL&kausi=2024");
  });

  it("labels the stage control in Finnish and lists the stages by their Finnish names", () => {
    renderControls("QUARTER_FINALS");

    const select = screen.getByLabelText("Vaihe");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["Liigavaihe", "Puolivälierät", "Loppuottelu"]);
  });

  it("carries the competition through a hidden field, with no visible competition select", () => {
    renderControls("QUARTER_FINALS");

    expect(screen.queryByLabelText("Kilpailu")).not.toBeInTheDocument();
    const form = screen.getByLabelText("Kausi").closest("form");
    expect(form?.querySelector('input[name="kilpailu"]')).toHaveValue("CL");
  });

  it("navigates when the stage changes", () => {
    renderControls("QUARTER_FINALS");

    fireEvent.change(screen.getByLabelText("Vaihe"), { target: { value: "FINAL" } });

    expect(pushMock).toHaveBeenCalledWith("/ulkomaat/ottelut?kilpailu=CL&kausi=2024&vaihe=FINAL");
  });

  it("drops the stage when the season changes", () => {
    // Seasons of a cup do not share a stage list — 2023/24 had a group stage,
    // 2024/25 a league phase — so a stage valid in one can be absent in the next.
    window.history.pushState(
      {},
      "",
      "/ulkomaat/ottelut?kilpailu=CL&kausi=2024&vaihe=QUARTER_FINALS"
    );
    renderControls("QUARTER_FINALS");

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2025" } });

    expect(pushMock).toHaveBeenCalledWith("/ulkomaat/ottelut?kilpailu=CL&kausi=2025");
  });

  it("drops a round carried over from a league competition", () => {
    window.history.pushState({}, "", "/ulkomaat/ottelut?kilpailu=PL&kausi=2024&kierros=7");
    renderControls("QUARTER_FINALS");

    fireEvent.change(screen.getByLabelText("Vaihe"), { target: { value: "FINAL" } });

    expect(pushMock).toHaveBeenCalledWith("/ulkomaat/ottelut?kilpailu=CL&kausi=2024&vaihe=FINAL");
  });

  it("hides the stage select until a stage is known", () => {
    renderControls(undefined);

    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
    expect(screen.queryByLabelText("Vaihe")).not.toBeInTheDocument();
  });

  it("hides the stage select when the season has no stages at all", () => {
    render(
      <CupMatchesControls
        competitionCode="CL"
        seasons={seasons}
        selectedSeasonId={2024}
        availableStages={[]}
        selectedStage="FINAL"
      />
    );

    expect(screen.queryByLabelText("Vaihe")).not.toBeInTheDocument();
  });
});
