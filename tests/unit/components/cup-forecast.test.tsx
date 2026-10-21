import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BEFORE_LAST_SIXTEEN_LINE,
  CUP_FORECAST_HEADING,
  CUP_NOTE,
  CUP_WIN_HEADER,
  CupForecastSection,
  standInLine,
} from "@/components/cup-forecast";
import { TIES_HEADING, tieText } from "@/components/knockout-forecast";
import {
  FORECAST_ERROR_MESSAGE,
  FORECAST_TEAM_HEADER,
  NO_FIXTURES_MESSAGE,
} from "@/components/season-forecast";
import type { KnockoutRow, TieChance } from "@/lib/knockout-simulation";
import type { CupForecastResult } from "@/lib/knockout-simulation-service";
import type { Chance } from "@/lib/season-simulation";

/**
 * A Suomen Cup's `Cupin ennuste`: its table from the round of 16, the ties
 * between rated sides, the lines before it and for an unrated side, and failure.
 *
 * decisions/067-knockout-simulation.md
 */

const open = (share: number): Chance => ({ share, settled: false });
const decided = (share: number): Chance => ({ share, settled: true });

function row(teamProviderId: number): KnockoutRow {
  return {
    teamProviderId,
    teamName: `Seura ${teamProviderId}`,
    reached: [decided(1), open(0.62), open(0.004), open(0.995)],
    won: open(0.18),
  };
}

const TIE: TieChance = {
  key: "2:17",
  home: { teamProviderId: 1, teamName: "HJK" },
  away: { teamProviderId: 2, teamName: "KuPS" },
  homeThrough: 0.58,
};

const OK = {
  status: "ok" as const,
  roundSizes: [16, 8, 4, 2],
  standIn: null,
  rows: [row(1), row(2)],
  ties: [TIE],
};

function renderSection(forecast: Exclude<CupForecastResult, { status: "unavailable" }>) {
  return render(<CupForecastSection forecast={forecast} />);
}

describe("the strings the spec agreed", () => {
  it("names the section and the cup's column, and says what the figures are", () => {
    expect(CUP_FORECAST_HEADING).toBe("Cupin ennuste");
    expect(CUP_WIN_HEADER).toBe("Cupin voitto");
    expect(BEFORE_LAST_SIXTEEN_LINE).toBe(
      "Cupin voittajaa ennustetaan neljännesvälieristä alkaen, kun kaikki joukkueet ovat mukana."
    );
    expect(CUP_NOTE).toBe(
      "Loppukilpailu on pelattu 10 000 kertaa Poisson-mallin ennusteiden mukaan. Seuraavien kierrosten parit on arvottu, ja tasapelit on ratkaistu jatkoajalla ja rangaistuspotkuilla."
    );
  });

  it("names the division an unrated side counts as, for each cup", () => {
    expect(standInLine("M2")).toBe(
      "Joukkueet, joiden sarjaotteluita ei ole tilastoitu, on laskettu Kakkosen keskitasoisiksi."
    );
    expect(standInLine("N1")).toBe(
      "Joukkueet, joiden sarjaotteluita ei ole tilastoitu, on laskettu Kansallisen Ykkösen keskitasoisiksi."
    );
  });
});

describe("CupForecastSection", () => {
  it("is a section named by its heading", () => {
    renderSection(OK);

    expect(screen.getByRole("region", { name: CUP_FORECAST_HEADING })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: CUP_FORECAST_HEADING })
    ).toBeInTheDocument();
  });

  it("from the round of 16, shows each side's chance of each round by its name and of the cup", () => {
    renderSection(OK);
    const table = screen.getByRole("table");

    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent)
    ).toEqual([
      FORECAST_TEAM_HEADER,
      "Neljännesvälierät",
      "Puolivälierät",
      "Välierät",
      "Loppuottelu",
      CUP_WIN_HEADER,
    ]);
    // A round reached is 100 %; an open one never prints 0 % or 100 %.
    expect(within(table).getAllByRole("row")[1]?.textContent).toBe(
      "Seura 1100 %62 %< 1 %> 99 %18 %"
    );
  });

  it("names only the rounds left once the cup is past one", () => {
    renderSection({
      ...OK,
      roundSizes: [8, 4, 2],
      rows: [{ ...row(1), reached: [decided(1), open(0.5), open(0.25)] }],
    });

    expect(
      within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent)
    ).toEqual([FORECAST_TEAM_HEADER, "Puolivälierät", "Välierät", "Loppuottelu", CUP_WIN_HEADER]);
  });

  it("lists the ties after the table, then says what the figures are", () => {
    const { container } = renderSection(OK);

    expect(screen.getByRole("heading", { level: 3, name: TIES_HEADING })).toBeInTheDocument();
    expect(screen.getByRole("listitem").textContent).toBe(tieText(TIE));
    const order = [...container.querySelectorAll("table, ul, p")].map((element) => element.tagName);
    expect(order).toEqual(["TABLE", "UL", "P"]);
    expect(screen.getByText(CUP_NOTE)).toBeInTheDocument();
  });

  it("has no ties' heading without a tie, and no division line without an unrated side", () => {
    renderSection({ ...OK, ties: [] });

    expect(screen.queryByText(TIES_HEADING)).toBeNull();
    expect(screen.queryByText(/sarjaotteluita ei ole tilastoitu/)).toBeNull();
  });

  it("names the stand-in division while an unrated side is left", () => {
    renderSection({ ...OK, standIn: "N1" });

    expect(screen.getByText(standInLine("N1"))).toBeInTheDocument();
  });

  it("before the round of 16, has the ties and the line, and no table", () => {
    renderSection({ status: "before", ties: [TIE] });

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("listitem").textContent).toBe(tieText(TIE));
    expect(screen.getByText(BEFORE_LAST_SIXTEEN_LINE)).toBeInTheDocument();
    expect(screen.queryByText(CUP_NOTE)).toBeNull();
  });

  it("before the round of 16 with no tie between rated sides, has the line only", () => {
    renderSection({ status: "before", ties: [] });

    expect(screen.queryByText(TIES_HEADING)).toBeNull();
    expect(screen.getByText(BEFORE_LAST_SIXTEEN_LINE)).toBeInTheDocument();
  });

  it("says nothing is left once the final is played, and shows the failure line", () => {
    const { rerender } = renderSection({ status: "no-fixtures" });
    expect(screen.getByText(NO_FIXTURES_MESSAGE)).toBeInTheDocument();

    rerender(<CupForecastSection forecast={{ status: "error" }} />);
    expect(screen.getByText(FORECAST_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
