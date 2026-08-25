import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamSeasonSelector } from "@/components/team-season-selector";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const seasons = [
  { seasonId: 2025, label: "2025/26" },
  { seasonId: 2024, label: "2024/25" },
  { seasonId: 2023, label: "2023/24" },
];

describe("TeamSeasonSelector", () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.history.pushState({}, "", "/");
  });

  it("labels the control in Finnish and preselects the current season", () => {
    render(
      <TeamSeasonSelector
        teamProviderId={1}
        competitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2024}
      />
    );

    expect(screen.getByLabelText("Kausi")).toHaveValue("2024");
  });

  it("navigates to the same team's page for the chosen season, carrying the competition", () => {
    render(
      <TeamSeasonSelector
        teamProviderId={57}
        competitionCode="BL1"
        seasons={seasons}
        selectedSeasonId={2025}
      />
    );

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2023" } });

    expect(pushMock).toHaveBeenCalledWith("/ulkomaat/joukkue/57?kilpailu=BL1&kausi=2023");
  });

  it("preserves unrelated query params already in the URL", () => {
    window.history.pushState(
      {},
      "",
      "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2025&utm_source=newsletter"
    );

    render(
      <TeamSeasonSelector
        teamProviderId={57}
        competitionCode="PL"
        seasons={seasons}
        selectedSeasonId={2025}
      />
    );

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2024" } });

    expect(pushMock).toHaveBeenCalledWith(
      "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024&utm_source=newsletter"
    );
  });

  it("submits as a plain GET form targeting the public /ulkomaat/joukkue/:id URL, carrying kilpailu via a hidden field", () => {
    const { container } = render(
      <TeamSeasonSelector
        teamProviderId={57}
        competitionCode="BL1"
        seasons={seasons}
        selectedSeasonId={2025}
      />
    );
    const form = container.querySelector("form");

    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/ulkomaat/joukkue/57");
    expect(screen.getByLabelText("Kausi")).toHaveAttribute("name", "kausi");
    expect(form?.querySelector('input[type="hidden"][name="kilpailu"]')).toHaveValue("BL1");
    expect(container.querySelector("noscript")).not.toBeNull();
  });
});
