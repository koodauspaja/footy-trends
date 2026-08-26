import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StageSelect } from "@/components/stage-select";

const stages = ["LEAGUE_STAGE", "QUARTER_FINALS", "FINAL"];

function renderSelect(
  overrides: Partial<{ availableStages: string[]; selectedStage: string }> = {}
) {
  const onChange = vi.fn();
  render(
    <StageSelect
      availableStages={overrides.availableStages ?? stages}
      selectedStage={overrides.selectedStage ?? "QUARTER_FINALS"}
      onChange={onChange}
    />
  );
  return onChange;
}

describe("StageSelect", () => {
  it("labels the control in Finnish and associates it with the select", () => {
    renderSelect();

    const select = screen.getByLabelText("Vaihe");
    expect(select).toHaveAttribute("id", "vaihe");
    expect(select).toHaveAttribute("name", "vaihe");
  });

  it("lists every stage by its Finnish name, in the order given", () => {
    renderSelect();

    const options = within(screen.getByLabelText("Vaihe")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Liigavaihe",
      "Puolivälierät",
      "Loppuottelu",
    ]);
    expect(options.map((option) => option.getAttribute("value"))).toEqual(stages);
  });

  it("shows the selected stage rather than the first option", () => {
    renderSelect({ selectedStage: "FINAL" });

    expect(screen.getByLabelText("Vaihe")).toHaveValue("FINAL");
  });

  it("reports the chosen stage to its caller", () => {
    const onChange = renderSelect();

    fireEvent.change(screen.getByLabelText("Vaihe"), { target: { value: "LEAGUE_STAGE" } });

    expect(onChange).toHaveBeenCalledWith("LEAGUE_STAGE");
  });

  it("renders a single-stage season as one option", () => {
    renderSelect({ availableStages: ["FINAL"], selectedStage: "FINAL" });

    expect(within(screen.getByLabelText("Vaihe")).getAllByRole("option")).toHaveLength(1);
  });

  it("renders no options when the season has no stages", () => {
    renderSelect({ availableStages: [], selectedStage: "" });

    expect(within(screen.getByLabelText("Vaihe")).queryAllByRole("option")).toHaveLength(0);
  });

  it("shows an unmapped stage by its raw value rather than blank", () => {
    renderSelect({ availableStages: ["MYSTERY_ROUND"], selectedStage: "MYSTERY_ROUND" });

    expect(screen.getByRole("option", { name: "MYSTERY_ROUND" })).toBeInTheDocument();
  });
});
