import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SeasonRoundSelector } from "@/components/season-round-selector";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const seasons = [
  { seasonId: 2025, label: "2025/26" },
  { seasonId: 2024, label: "2024/25" },
  { seasonId: 2023, label: "2023/24" },
];

describe("SeasonRoundSelector", () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.history.pushState({}, "", "/");
  });

  it("labels both controls in Finnish and associates them with their selects", () => {
    render(
      <SeasonRoundSelector
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={undefined}
      />
    );

    expect(screen.getByLabelText("Kausi")).toBe(screen.getAllByRole("combobox")[0]);
    expect(screen.getByLabelText("Kierros")).toBe(screen.getAllByRole("combobox")[1]);
  });

  it("lists the seasons newest first", () => {
    render(
      <SeasonRoundSelector
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
      <SeasonRoundSelector
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

  it("preselects the current season and round", () => {
    render(
      <SeasonRoundSelector
        seasons={seasons}
        selectedSeasonId={2024}
        availableRounds={[1, 2, 3]}
        selectedRound={2}
      />
    );

    expect(screen.getByLabelText("Kausi")).toHaveValue("2024");
    expect(screen.getByLabelText("Kierros")).toHaveValue("2");
  });

  it("preselects the whole-season option when no round is selected", () => {
    render(
      <SeasonRoundSelector
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={undefined}
      />
    );

    expect(screen.getByLabelText("Kierros")).toHaveValue("");
  });

  it("navigates to the chosen season, keeping the current round", () => {
    render(
      <SeasonRoundSelector
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={2}
      />
    );

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2023" } });

    expect(pushMock).toHaveBeenCalledWith("/?kausi=2023&kierros=2");
  });

  it("navigates to the chosen round, keeping the current season", () => {
    render(
      <SeasonRoundSelector
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={undefined}
      />
    );

    fireEvent.change(screen.getByLabelText("Kierros"), { target: { value: "3" } });

    expect(pushMock).toHaveBeenCalledWith("/?kausi=2025&kierros=3");
  });

  it("preserves unrelated query params already in the URL", () => {
    window.history.pushState({}, "", "/?kausi=2025&utm_source=newsletter");

    render(
      <SeasonRoundSelector
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={undefined}
      />
    );

    fireEvent.change(screen.getByLabelText("Kierros"), { target: { value: "2" } });

    expect(pushMock).toHaveBeenCalledWith("/?kausi=2025&utm_source=newsletter&kierros=2");
  });

  it("clears the round param when switching back to whole season", () => {
    render(
      <SeasonRoundSelector
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={2}
      />
    );

    fireEvent.change(screen.getByLabelText("Kierros"), { target: { value: "" } });

    expect(pushMock).toHaveBeenCalledWith("/?kausi=2025");
  });

  it("submits as a plain GET form so it works without scripting", () => {
    const { container } = render(
      <SeasonRoundSelector
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={undefined}
      />
    );
    const form = container.querySelector("form");

    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/");
    expect(screen.getByLabelText("Kausi")).toHaveAttribute("name", "kausi");
    expect(screen.getByLabelText("Kierros")).toHaveAttribute("name", "kierros");
    expect(container.querySelector("noscript")).not.toBeNull();
  });
});
