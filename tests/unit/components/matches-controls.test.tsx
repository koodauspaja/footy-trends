import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchesControls } from "@/components/matches-controls";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const seasons = [
  { seasonId: 2025, label: "2025/26" },
  { seasonId: 2024, label: "2024/25" },
];

describe("MatchesControls", () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.history.pushState({}, "", "/ottelut");
  });

  it("labels both controls in Finnish and preselects the current season and round", () => {
    render(
      <MatchesControls
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={2}
      />
    );

    expect(screen.getByLabelText("Kausi")).toHaveValue("2025");
    expect(screen.getByLabelText("Kierros")).toHaveValue("2");
  });

  it("lists rounds 1..N with no whole-season option", () => {
    render(
      <MatchesControls
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={1}
      />
    );

    expect(
      Array.from(screen.getByLabelText("Kierros").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toEqual(["Kierros 1", "Kierros 2", "Kierros 3"]);
  });

  it("reflects a round prop change from outside the select, e.g. the page's prev/next links", () => {
    const { rerender } = render(
      <MatchesControls
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={1}
      />
    );

    rerender(
      <MatchesControls
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={2}
      />
    );

    expect(screen.getByLabelText("Kierros")).toHaveValue("2");
  });

  it("omits the round select when no round is known yet", () => {
    render(
      <MatchesControls
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[]}
        selectedRound={undefined}
      />
    );

    expect(screen.queryByLabelText("Kierros")).not.toBeInTheDocument();
  });

  it("navigates to the chosen season without a round when no round is known yet", () => {
    window.history.pushState({}, "", "/ottelut?kausi=2025&kierros=1");

    render(
      <MatchesControls
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[]}
        selectedRound={undefined}
      />
    );

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2024" } });

    expect(pushMock).toHaveBeenCalledWith("/ottelut?kausi=2024");
  });

  it("navigates to the chosen season, keeping the current round", () => {
    render(
      <MatchesControls
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={2}
      />
    );

    fireEvent.change(screen.getByLabelText("Kausi"), { target: { value: "2024" } });

    expect(pushMock).toHaveBeenCalledWith("/ottelut?kausi=2024&kierros=2");
  });

  it("navigates to the chosen round, keeping the current season", () => {
    render(
      <MatchesControls
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={1}
      />
    );

    fireEvent.change(screen.getByLabelText("Kierros"), { target: { value: "3" } });

    expect(pushMock).toHaveBeenCalledWith("/ottelut?kausi=2025&kierros=3");
  });

  it("preserves unrelated query params already in the URL", () => {
    window.history.pushState({}, "", "/ottelut?kausi=2025&kierros=1&utm_source=newsletter");

    render(
      <MatchesControls
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={1}
      />
    );

    fireEvent.change(screen.getByLabelText("Kierros"), { target: { value: "2" } });

    expect(pushMock).toHaveBeenCalledWith("/ottelut?kausi=2025&kierros=2&utm_source=newsletter");
  });

  it("submits as a plain GET form targeting /ottelut, so it works without scripting", () => {
    const { container } = render(
      <MatchesControls
        seasons={seasons}
        selectedSeasonId={2025}
        availableRounds={[1, 2, 3]}
        selectedRound={1}
      />
    );
    const form = container.querySelector("form");

    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/ottelut");
    expect(screen.getByLabelText("Kausi")).toHaveAttribute("name", "kausi");
    expect(screen.getByLabelText("Kierros")).toHaveAttribute("name", "kierros");
    expect(container.querySelector("noscript")).not.toBeNull();
  });
});
