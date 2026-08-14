import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompetitionSelect } from "@/components/competition-select";

const competitions = [
  {
    code: "PL",
    name: "Valioliiga",
    flagUrl: "https://crests.football-data.org/770.svg",
    country: "Englanti",
  },
  {
    code: "BL1",
    name: "Bundesliga",
    flagUrl: "https://crests.football-data.org/759.svg",
    country: "Saksa",
  },
];

describe("CompetitionSelect", () => {
  it("labels the control in Finnish and lists every competition by name", () => {
    render(
      <CompetitionSelect
        competitions={competitions}
        selectedCompetitionCode="PL"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Kilpailu")).toBeInTheDocument();
    expect(
      Array.from(screen.getByLabelText("Kilpailu").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toEqual(["Valioliiga", "Bundesliga"]);
  });

  it("preselects the current competition", () => {
    render(
      <CompetitionSelect
        competitions={competitions}
        selectedCompetitionCode="BL1"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Kilpailu")).toHaveValue("BL1");
  });

  it("shows the selected competition's flag with its country as alt text", () => {
    render(
      <CompetitionSelect
        competitions={competitions}
        selectedCompetitionCode="BL1"
        onChange={vi.fn()}
      />
    );

    const flag = screen.getByRole("img");
    expect(flag).toHaveAttribute("src", "https://crests.football-data.org/759.svg");
    expect(flag).toHaveAttribute("alt", "Saksa");
  });

  it("omits the flag when the selected code isn't in the competition list", () => {
    render(
      <CompetitionSelect
        competitions={competitions}
        selectedCompetitionCode="XYZ"
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("calls onChange with the newly selected competition code", () => {
    const onChange = vi.fn();
    render(
      <CompetitionSelect
        competitions={competitions}
        selectedCompetitionCode="PL"
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText("Kilpailu"), { target: { value: "BL1" } });

    expect(onChange).toHaveBeenCalledWith("BL1");
  });
});
