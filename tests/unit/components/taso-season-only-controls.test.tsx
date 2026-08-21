import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TasoSeasonOnlyControls } from "@/components/taso-season-only-controls";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const seasons = [
  { seasonId: 2026, label: "2026" },
  { seasonId: 2025, label: "2025" },
];

describe("TasoSeasonOnlyControls", () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.history.pushState({}, "", "/kotimaa/ottelut?kilpailu=VL&kausi=2026");
  });

  it("has no round select, only a season select and a hidden competition field", () => {
    render(
      <TasoSeasonOnlyControls
        actionPath="/kotimaa/ottelut"
        competitionCode="VL"
        seasons={seasons}
        selectedSeasonId={2026}
      />
    );

    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(document.querySelector('input[name="kilpailu"]')).toHaveValue("VL");
  });

  it("navigates to the given action path with the selected season", () => {
    render(
      <TasoSeasonOnlyControls
        actionPath="/kotimaa/joukkue/123"
        competitionCode="VL"
        seasons={seasons}
        selectedSeasonId={2026}
      />
    );

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2025" } });

    expect(pushMock).toHaveBeenCalledWith("/kotimaa/joukkue/123?kilpailu=VL&kausi=2025");
  });
});
