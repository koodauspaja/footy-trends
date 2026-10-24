import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KnockoutRow, TieChance } from "@/lib/knockout-simulation";
import type { KnockoutForecast } from "@/lib/knockout-simulation-service";
import type { Chance, ForecastRow } from "@/lib/season-simulation";

/**
 * The Champions League's forecast panel: its two tables, the ties still to be
 * decided, how a chance is printed, its lines and its link.
 *
 * decisions/067-knockout-simulation.md
 * decisions/696-headings-and-spacing.md
 */

// `Ennuste`'s own link string; its component reads the models, which this panel does not.
vi.mock("@/components/match-prediction", () => ({
  QUALITY_LINK: "Kuinka hyvin ennusteet ovat osuneet?",
}));

import {
  KNOCKOUT_LABEL,
  KNOCKOUT_NOTE,
  KnockoutForecastBody,
  LEAGUE_PHASE_LABEL,
  TIES_HEADING,
  tieText,
} from "@/components/knockout-forecast";
import {
  EXPECTED_POINTS_HEADER,
  FORECAST_ERROR_MESSAGE,
  FORECAST_TEAM_HEADER,
  NO_FIXTURES_MESSAGE,
  TITLE_HEADER,
} from "@/components/season-forecast";

const HREF = "/ennusteet?alue=ulkomaat&tyyppi=jalkikateen&kilpailu=CL";
const open = (share: number): Chance => ({ share, settled: false });
const decided = (share: number): Chance => ({ share, settled: true });

function leagueRow(teamProviderId: number): ForecastRow {
  return {
    teamProviderId,
    teamName: `Team ${teamProviderId}`,
    expectedPoints: 16.25,
    first: open(0.1),
    last: open(0),
    topThree: open(0.2),
    bottomThree: open(0),
    zones: [open(0.64), open(0.355), decided(0)],
  };
}

function knockoutRow(teamProviderId: number, overrides: Partial<KnockoutRow> = {}): KnockoutRow {
  return {
    teamProviderId,
    teamName: `Team ${teamProviderId}`,
    reached: [decided(1), open(0.62), open(0.004), open(0.995)],
    won: open(0.18),
    ...overrides,
  };
}

const TIE: TieChance = {
  key: "LAST_16:1-2:9",
  home: { teamProviderId: 1, teamName: "Real Madrid" },
  away: { teamProviderId: 2, teamName: "Benfica" },
  homeThrough: 0.712,
};

function renderBody(forecast: Exclude<KnockoutForecast, { status: "unavailable" }>) {
  return render(<KnockoutForecastBody forecast={forecast} qualityHref={HREF} />);
}

const OK = {
  status: "ok" as const,
  leaguePhase: [leagueRow(1), leagueRow(2)],
  rows: [knockoutRow(1), knockoutRow(2)],
  ties: [TIE],
};

describe("the strings the spec agreed", () => {
  it("names the ties and says what the figures are", () => {
    expect(TIES_HEADING).toBe("Kierroksen parit");
    expect(LEAGUE_PHASE_LABEL).toBe("Liigavaihe");
    expect(KNOCKOUT_LABEL).toBe("Pudotuspelit");
    expect(KNOCKOUT_NOTE).toBe(
      "Loppukausi on pelattu 10 000 kertaa Poisson-mallin ennusteiden mukaan. Arpomattomat parit on arvottu sääntöjen mukaan, ja tasaiset ottelut on ratkaistu jatkoajalla ja rangaistuspotkuilla."
    );
  });

  it("gives a tie both sides' chances of going through", () => {
    expect(tieText(TIE)).toBe("Real Madrid – Benfica: jatkoon 71 % – 29 %");
    expect(tieText({ ...TIE, homeThrough: 0.996 })).toBe(
      "Real Madrid – Benfica: jatkoon > 99 % – < 1 %"
    );
  });
});

describe("KnockoutForecastBody", () => {
  it("shows the league phase's expected points and its three stretches of places", () => {
    renderBody(OK);
    const [league] = screen.getAllByRole("table");

    expect(
      within(league as HTMLElement)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent)
    ).toEqual([
      FORECAST_TEAM_HEADER,
      EXPECTED_POINTS_HEADER,
      "Sijat 1–8",
      "Sijat 9–24",
      "Sijat 25–36",
    ]);
    expect(within(league as HTMLElement).getAllByRole("row")[1]?.textContent).toBe(
      "Team 116,364 %36 %0 %"
    );
  });

  it("shows each side's chance of each knockout round and of winning, by the rounds' Finnish names", () => {
    renderBody(OK);
    const knockout = screen.getAllByRole("table").at(-1) as HTMLElement;

    expect(
      within(knockout)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent)
    ).toEqual([
      FORECAST_TEAM_HEADER,
      "Neljännesvälierät",
      "Puolivälierät",
      "Välierät",
      "Loppuottelu",
      TITLE_HEADER,
    ]);
    // A round reached is 100 %; an open one never prints 0 % or 100 %.
    expect(within(knockout).getAllByRole("row")[1]?.textContent).toBe(
      "Team 1100 %62 %< 1 %> 99 %18 %"
    );
  });

  it("lists the ties still to be decided under their heading, before the knockout table", () => {
    const { container } = renderBody(OK);

    expect(screen.getByRole("heading", { level: 5, name: TIES_HEADING })).toBeInTheDocument();
    expect(screen.getByRole("listitem").textContent).toBe(tieText(TIE));
    const order = [...container.querySelectorAll("table, ul")].map((element) => element.tagName);
    expect(order).toEqual(["TABLE", "UL", "TABLE"]);
  });

  it("has no league-phase table once the phase is over, and no ties' list without one", () => {
    renderBody({ ...OK, leaguePhase: null, ties: [] });

    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.queryByText(TIES_HEADING)).toBeNull();
    // A lone table needs no name to tell it from another.
    expect(screen.queryByRole("heading", { level: 5 })).toBeNull();
  });

  it("labels the league phase's table and the knockout's when both are shown", () => {
    const { container } = renderBody(OK);

    const labels = [...container.querySelectorAll("h5")].map((heading) => heading.textContent);
    expect(labels).toEqual([LEAGUE_PHASE_LABEL, TIES_HEADING, KNOCKOUT_LABEL]);
    for (const table of screen.getAllByRole("table")) {
      expect(table.closest("div.mt-2")?.querySelector("h5")).not.toBeNull();
    }
  });

  it("says what the figures are and links to the model's record", () => {
    renderBody(OK);

    expect(screen.getByText(KNOCKOUT_NOTE)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Kuinka hyvin ennusteet ovat osuneet?" })
    ).toHaveAttribute("href", HREF);
  });

  it("says nothing is left once the final is played, and shows the failure line", () => {
    const { rerender } = renderBody({ status: "no-fixtures" });
    expect(screen.getByText(NO_FIXTURES_MESSAGE)).toBeInTheDocument();

    rerender(<KnockoutForecastBody forecast={{ status: "error" }} qualityHref={HREF} />);
    expect(screen.getByText(FORECAST_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
