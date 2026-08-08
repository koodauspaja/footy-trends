import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SeasonSelector } from "@/components/season-selector";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const seasons = [
  { seasonId: 2025, label: "2025/26" },
  { seasonId: 2024, label: "2024/25" },
  { seasonId: 2023, label: "2023/24" },
];

describe("SeasonSelector", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("labels the control in Finnish and associates it with the select", () => {
    render(<SeasonSelector seasons={seasons} selectedSeasonId={2025} />);

    expect(screen.getByLabelText("Kausi")).toBe(screen.getByRole("combobox"));
  });

  it("lists the seasons newest first", () => {
    render(<SeasonSelector seasons={seasons} selectedSeasonId={2025} />);

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "2025/26",
      "2024/25",
      "2023/24",
    ]);
  });

  it("preselects the current season", () => {
    render(<SeasonSelector seasons={seasons} selectedSeasonId={2024} />);

    expect(screen.getByLabelText("Kausi")).toHaveValue("2024");
  });

  it("navigates to the chosen season", () => {
    render(<SeasonSelector seasons={seasons} selectedSeasonId={2025} />);

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2023" } });

    expect(pushMock).toHaveBeenCalledWith("/?kausi=2023");
  });

  it("submits as a plain GET form so it works without scripting", () => {
    const { container } = render(<SeasonSelector seasons={seasons} selectedSeasonId={2025} />);
    const form = container.querySelector("form");

    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/");
    expect(screen.getByLabelText("Kausi")).toHaveAttribute("name", "kausi");
    expect(container.querySelector("noscript")).not.toBeNull();
  });
});
