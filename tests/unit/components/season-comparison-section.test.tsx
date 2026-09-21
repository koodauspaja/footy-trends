import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { percentText } from "@/components/charts/line-chart";
import {
  BASELINE_LABEL,
  comparisonSentence,
  measureText,
  SELECTED_LABEL,
} from "@/components/charts/season-comparison-chart";
import { NO_MATCHES_MESSAGE } from "@/components/goals-section";
import {
  baselineLine,
  COMPARISON_ERROR_MESSAGE,
  COMPARISON_HEADING,
  NO_OTHER_SEASONS_MESSAGE,
  seasonComparisonPanel,
} from "@/components/season-comparison-section";
import { MEASURES, type SeasonComparisonSeries } from "@/lib/season-comparison";

/** Every measure with a value, so a test can vary only what it is about. */
function rowsWith(selected: number | null, baseline: number | null) {
  return MEASURES.map((measure) => ({ measure, selected, baseline }));
}

function ok(over: Partial<Extract<SeasonComparisonSeries, { status: "ok" }>> = {}) {
  return render(
    <div>
      {seasonComparisonPanel({
        status: "ok",
        rows: rowsWith(0.25, 0.5),
        seasons: 3,
        competitions: ["Veikkausliiga", "Ykkönen"],
        teamCount: 12,
        ...over,
      })}
    </div>
  ).container;
}

describe("measureText", () => {
  it("prints a position as the place it is, in the season's own table", () => {
    // A quarter of the way down a 12-team table is 3rd.
    expect(measureText("position", 0.25, 12, true)).toBe("3.");
  });

  it("keeps a decimal on an average place, which no one finished in", () => {
    expect(measureText("position", 0.5, 12, false)).toBe("6,0.");
  });

  it("cannot print a place without a table to put it in", () => {
    expect(measureText("position", 0.25, null, true)).toBe("–");
  });

  it("prints a share as a whole percent", () => {
    // A no-break space before the sign, as Finnish writes it (specs/033).
    expect(measureText("cleanSheets", 40, 12, true)).toBe(percentText(40));
    expect(measureText("winPercentage", 62.4, 12, true)).toBe(percentText(62));
  });

  it("prints a per-match average with two decimals, as the home and away panel does", () => {
    expect(measureText("points", 2.05, 12, true)).toBe("2,05");
    expect(measureText("scored", 1.5, 12, true)).toBe("1,50");
  });

  it("prints no value as a dash, never as a zero", () => {
    for (const measure of MEASURES) {
      expect(measureText(measure, null, 12, true)).toBe("–");
    }
  });
});

describe("comparisonSentence", () => {
  it("names both columns in lower case, mid-sentence", () => {
    expect(comparisonSentence("Voittoprosentti", "58 %", "47 %")).toBe(
      "Voittoprosentti: tämä kausi 58 %, tavallisesti 47 %."
    );
  });

  it("does not add a second full stop after a place, which carries its own", () => {
    expect(comparisonSentence("Sijoitus", "3.", "6,0.")).toBe(
      "Sijoitus: tämä kausi 3., tavallisesti 6,0."
    );
  });
});

describe("baselineLine", () => {
  it("says how many seasons the baseline covered, and which competitions", () => {
    expect(baselineLine(11, ["Veikkausliiga", "Ykkönen"])).toBe(
      "Verrattuna 11 muuhun kauteen: Veikkausliiga, Ykkönen"
    );
  });
});

describe("seasonComparisonPanel", () => {
  it("is no panel at all when the season ranks nothing", () => {
    expect(seasonComparisonPanel({ status: "unavailable" })).toBeNull();
  });

  it("says so when the comparison cannot be computed", () => {
    render(<div>{seasonComparisonPanel({ status: "error" })}</div>);

    expect(screen.getByText(COMPARISON_ERROR_MESSAGE)).toBeInTheDocument();
  });

  it("shows the season's own values beside the baseline", () => {
    ok();

    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(COMPARISON_HEADING);
    expect(
      screen.getByText("Verrattuna 3 muuhun kauteen: Veikkausliiga, Ykkönen")
    ).toBeInTheDocument();
  });

  it("names both columns in the legend", () => {
    ok();

    expect(screen.getByText(SELECTED_LABEL)).toBeInTheDocument();
    expect(screen.getByText(BASELINE_LABEL)).toBeInTheDocument();
  });

  it("uses specs/032's line before the season's first match", () => {
    ok({ rows: rowsWith(null, 0.5) });

    expect(screen.getByText(NO_MATCHES_MESSAGE)).toBeInTheDocument();
  });

  it("still shows the season's values when there is nothing to compare with", () => {
    // The panel is not hidden: the page must not change shape as a club's
    // history grows, and this is where a reader asks whether a season is normal.
    const container = ok({ rows: rowsWith(0.25, null), seasons: 0, competitions: [] });

    expect(screen.getByText(NO_OTHER_SEASONS_MESSAGE)).toBeInTheDocument();
    expect(container.querySelectorAll("[data-part=row]")).toHaveLength(MEASURES.length);
  });

  it("leaves the baseline column empty rather than drawing it as zero", () => {
    const container = ok({ rows: rowsWith(0.25, null), seasons: 0, competitions: [] });
    const baselineBars = container.querySelectorAll("[data-bar=baseline] [data-part=value]");

    expect(baselineBars).toHaveLength(MEASURES.length);
    for (const bar of baselineBars) expect(bar.textContent).toBe("–");
  });

  it("draws no bar for one missing measure while the rest keep theirs", () => {
    // A season whose table ranks nothing still has results, so the position
    // row is empty while every rate row is not.
    const container = ok({
      rows: MEASURES.map((measure) => ({
        measure,
        selected: measure === "position" ? null : 2,
        baseline: measure === "position" ? null : 1,
      })),
    });
    const values = [...container.querySelectorAll("[data-bar=selected] [data-part=value]")].map(
      (node) => node.textContent
    );

    expect(values[0]).toBe("–");
    expect(values.slice(1).every((text) => text !== "–")).toBe(true);
  });

  it("lists every measure as text, for a reader who cannot see the bars", () => {
    const container = ok();
    const sentences = [...container.querySelectorAll("ol.sr-only li")].map((li) => li.textContent);

    expect(sentences).toHaveLength(MEASURES.length);
    expect(sentences[0]).toBe("Sijoitus: tämä kausi 3., tavallisesti 6,0.");
  });
});
