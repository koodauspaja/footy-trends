import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  Chance,
  ForecastLayout,
  ForecastRow,
  ForecastTable,
  SeasonForecast,
} from "@/lib/season-simulation";

/**
 * The season forecast panel: its three column sets, how a chance is printed,
 * its lines and its link.
 *
 * decisions/061-season-simulation.md
 * decisions/638-forecast-names-left-out-groups.md
 * decisions/064-season-simulation-zones.md
 */

// `Ennuste`'s own link string; its component reads the models, which this panel does not.
vi.mock("@/components/match-prediction", () => ({
  QUALITY_LINK: "Kuinka hyvin ennusteet ovat osuneet?",
}));

import {
  BEFORE_SPLIT_NOTE,
  BOTTOM_THREE_HEADER,
  chanceText,
  EXPECTED_POINTS_HEADER,
  FORECAST_ERROR_MESSAGE,
  FORECAST_HEADING,
  FORECAST_NOTE,
  FORECAST_TEAM_HEADER,
  leftOutText,
  NO_FIXTURES_MESSAGE,
  NOT_SIMULATED_MESSAGE,
  REGULAR_SEASON_WIN_HEADER,
  SeasonForecastBody,
  TABLE_LAST_HEADER,
  TABLE_WIN_HEADER,
  TITLE_HEADER,
  TOP_THREE_HEADER,
  zonePositionsText,
} from "@/components/season-forecast";

const HREF = "/ennusteet?alue=kotimaa&tyyppi=jalkikateen&kilpailu=VL";
const open = (share: number): Chance => ({ share, settled: false });

function team(teamProviderId: number, overrides: Partial<ForecastRow> = {}): ForecastRow {
  return {
    teamProviderId,
    teamName: `Team ${teamProviderId}`,
    expectedPoints: 52.44,
    first: open(0.61),
    last: open(0.02),
    topThree: open(0.93),
    bottomThree: open(0.04),
    zones: [],
    ...overrides,
  };
}

function table(overrides: Partial<ForecastTable> = {}): ForecastTable {
  return {
    groupId: 1,
    groupName: null,
    decidesTitle: true,
    zones: [],
    rows: [team(1), team(2)],
    ...overrides,
  };
}

function ok(
  layout: ForecastLayout,
  tables: ForecastTable[],
  leftOut: string[] = []
): Extract<SeasonForecast, { status: "ok" }> {
  return { status: "ok", layout, tables, leftOut };
}

const headers = (container: HTMLElement = document.body) =>
  within(container)
    .getAllByRole("columnheader")
    .map((header) => header.textContent);

describe("the strings the spec agreed", () => {
  it("names the panel, its columns and its lines", () => {
    expect(FORECAST_HEADING).toBe("Kauden ennuste");
    expect([
      FORECAST_TEAM_HEADER,
      EXPECTED_POINTS_HEADER,
      TITLE_HEADER,
      TOP_THREE_HEADER,
      BOTTOM_THREE_HEADER,
      TABLE_WIN_HEADER,
      TABLE_LAST_HEADER,
      REGULAR_SEASON_WIN_HEADER,
    ]).toEqual([
      "Joukkue",
      "Odotetut pisteet",
      "Mestaruus",
      "Kolmen parhaan joukossa",
      "Kolmen huonoimman joukossa",
      "Sarjan voitto",
      "Sarjan viimeinen sija",
      "Runkosarjan voitto",
    ]);
    expect(FORECAST_NOTE).toBe(
      "Jäljellä olevat ottelut on pelattu 10 000 kertaa Poisson-mallin ennusteiden mukaan. Tasapisteissä ratkaisee nykyinen järjestys."
    );
    expect(BEFORE_SPLIT_NOTE).toBe(
      "Ennuste ulottuu runkosarjan loppuun; jatkosarjojen ottelut eivät ole vielä tiedossa."
    );
    expect(FORECAST_ERROR_MESSAGE).toBe(
      "Kauden ennustetta ei voitu laskea. Yritä myöhemmin uudelleen."
    );
    expect(NO_FIXTURES_MESSAGE).toBe("Kaudella ei ole enää pelaamattomia otteluita.");
    expect(NOT_SIMULATED_MESSAGE).toBe(
      "Kauden ennustetta ei lasketa, koska sarjataulukko näytetään Palloliiton tiedoista sellaisenaan."
    );
  });
});

describe("leftOutText", () => {
  it("names one table left out", () => {
    expect(leftOutText(["Mestaruussarja"])).toBe(
      "Mestaruussarja ei ole mukana, koska sen sarjataulukko näytetään Palloliiton tiedoista sellaisenaan."
    );
  });

  it("joins two with ja, and more with commas before it", () => {
    expect(leftOutText(["Mestaruussarja", "Haastajasarja"])).toBe(
      "Mestaruussarja ja Haastajasarja eivät ole mukana, koska niiden sarjataulukot näytetään Palloliiton tiedoista sellaisenaan."
    );
    expect(leftOutText(["Lohko A", "Lohko B", "Lohko C"])).toBe(
      "Lohko A, Lohko B ja Lohko C eivät ole mukana, koska niiden sarjataulukot näytetään Palloliiton tiedoista sellaisenaan."
    );
  });
});

describe("zonePositionsText", () => {
  it("says sija for one place and sijat with an en dash for several", () => {
    expect(zonePositionsText({ from: 2, to: 2, label: "x" })).toBe("sija 2");
    expect(zonePositionsText({ from: 3, to: 8, label: "x" })).toBe("sijat 3–8");
  });
});

describe("chanceText", () => {
  it("prints a whole percent", () => {
    expect(chanceText(open(0.614))).toBe("61 %");
    expect(chanceText(open(0.01))).toBe("1 %");
    expect(chanceText(open(0.994))).toBe("99 %");
  });

  it("prints a chance below one percent as less than one, even when no run reached it", () => {
    expect(chanceText(open(0.0099))).toBe("< 1 %");
    expect(chanceText(open(0))).toBe("< 1 %");
  });

  it("prints a chance from 99,5 percent up as more than 99, even when every run reached it", () => {
    expect(chanceText(open(0.995))).toBe("> 99 %");
    expect(chanceText(open(1))).toBe("> 99 %");
  });

  it("keeps 0 % and 100 % for a place the table has settled", () => {
    expect(chanceText({ share: 0, settled: true })).toBe("0 %");
    expect(chanceText({ share: 1, settled: true })).toBe("100 %");
  });
});

describe("SeasonForecastBody", () => {
  it("shows a season with one table: points, the title, top three and bottom three", () => {
    render(
      <SeasonForecastBody
        forecast={ok("single", [table({ groupName: "Ykkösliiga" })])}
        qualityHref={HREF}
      />
    );

    expect(headers()).toEqual([
      "Joukkue",
      "Odotetut pisteet",
      "Mestaruus",
      "Kolmen parhaan joukossa",
      "Kolmen huonoimman joukossa",
    ]);
    const [, first] = screen.getAllByRole("row");
    expect(
      within(first as HTMLElement)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["52,4", "61 %", "93 %", "4 %"]);
    expect(within(first as HTMLElement).getByRole("rowheader").textContent).toBe("Team 1");
    // The league's one table is the page's own: it is not named again.
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("shows each of several tables under its name, with first and last place", () => {
    render(
      <SeasonForecastBody
        forecast={{
          status: "ok",
          leftOut: [],
          layout: "several",
          tables: [
            table({ groupName: "Mestaruussarja", rows: [team(1), team(2)] }),
            table({
              groupId: 2,
              groupName: "Karsintasarja",
              decidesTitle: false,
              rows: [team(3), team(4)],
            }),
          ],
        }}
        qualityHref={HREF}
      />
    );

    expect(screen.getAllByRole("heading").map((each) => [each.tagName, each.textContent])).toEqual([
      ["H5", "Mestaruussarja"],
      ["H5", "Karsintasarja"],
    ]);
    const [upper, lower] = screen.getAllByRole("table");
    expect(headers(upper)).toEqual([
      "Joukkue",
      "Odotetut pisteet",
      "Mestaruus",
      "Sarjan viimeinen sija",
    ]);
    expect(headers(lower)).toEqual([
      "Joukkue",
      "Odotetut pisteet",
      "Sarjan voitto",
      "Sarjan viimeinen sija",
    ]);
    expect(
      within(lower as HTMLElement)
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent)
    ).toEqual(["Team 3", "Team 4"]);
    expect(
      within(within(lower as HTMLElement).getAllByRole("row")[1] as HTMLElement)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["52,4", "61 %", "2 %"]);
    expect(screen.queryByText(BEFORE_SPLIT_NOTE)).toBeNull();
  });

  it("shows a regular season before its split: points and its first place, with the line", () => {
    render(
      <SeasonForecastBody
        forecast={{
          status: "ok",
          leftOut: [],
          layout: "before-split",
          tables: [table({ groupName: "Runkosarja", decidesTitle: false })],
        }}
        qualityHref={HREF}
      />
    );

    expect(headers()).toEqual(["Joukkue", "Odotetut pisteet", "Runkosarjan voitto"]);
    expect(screen.getByRole("heading", { level: 5 }).textContent).toBe("Runkosarja");
    expect(screen.getByText(BEFORE_SPLIT_NOTE)).toBeDefined();
  });

  it("keeps first and last place within a phone's width, and lets a single table scroll", () => {
    const widths = (layout: "single" | "several" | "before-split") => {
      const { container, unmount } = render(
        <SeasonForecastBody
          forecast={ok(layout, [table({ groupName: "Lohko A" })])}
          qualityHref={HREF}
        />
      );
      const found = {
        minWidth: (container.querySelector("table") as HTMLTableElement).style.minWidth,
        columns: [...container.querySelectorAll("col")].map((col) => col.style.width),
        scrolls: container.querySelector("table")?.parentElement?.className,
      };
      unmount();
      return found;
    };

    // A phone's 375px less the page's two 16px gutters is 343px.
    expect(widths("several")).toEqual({
      minWidth: "336px",
      columns: ["", "72px", "76px", "76px"],
      scrolls: "overflow-x-auto",
    });
    expect(widths("before-split")).toEqual({
      minWidth: "280px",
      columns: ["", "72px", "96px"],
      scrolls: "overflow-x-auto",
    });
    expect(widths("single")).toEqual({
      minWidth: "472px",
      columns: ["", "72px", "96px", "96px", "96px"],
      scrolls: "overflow-x-auto",
    });
  });

  describe("a group with zones", () => {
    const zones = [
      { from: 1, to: 1, label: "Nousee Veikkausliigaan" },
      { from: 3, to: 8, label: "Säilyy / Putoaa" },
    ];
    const zoned = (overrides: Partial<ForecastTable> = {}) =>
      table({
        zones,
        rows: [
          team(1, { zones: [open(0.61), open(0.93)] }),
          team(2, { zones: [open(0.02), open(0.04)] }),
        ],
        ...overrides,
      });

    it("shows one column per zone, headed by its label and the places it covers", () => {
      render(<SeasonForecastBody forecast={ok("single", [zoned()])} qualityHref={HREF} />);

      expect(headers()).toEqual([
        "Joukkue",
        "Odotetut pisteet",
        "Nousee Veikkausliigaansija 1",
        "Säilyy / Putoaasijat 3–8",
      ]);
      const [, first] = screen.getAllByRole("row");
      expect(
        within(first as HTMLElement)
          .getAllByRole("cell")
          .map((cell) => cell.textContent)
      ).toEqual(["52,4", "61\u00a0%", "93\u00a0%"]);
      for (const gone of [TITLE_HEADER, TOP_THREE_HEADER, BOTTOM_THREE_HEADER, TABLE_LAST_HEADER]) {
        expect(screen.queryByText(gone)).toBeNull();
      }
    });

    it("prints a settled zone as 0 % or 100 %", () => {
      const settledRow = team(1, {
        zones: [
          { share: 1, settled: true },
          { share: 0, settled: true },
        ],
      });
      render(
        <SeasonForecastBody
          forecast={ok("single", [zoned({ rows: [settledRow] })])}
          qualityHref={HREF}
        />
      );

      const [, first] = screen.getAllByRole("row");
      expect(
        within(first as HTMLElement)
          .getAllByRole("cell")
          .map((cell) => cell.textContent)
      ).toEqual(["52,4", "100\u00a0%", "0\u00a0%"]);
    });

    it("uses the zones' columns in every layout, a split's regular season too", () => {
      for (const layout of ["several", "before-split"] as const) {
        const { unmount } = render(
          <SeasonForecastBody forecast={ok(layout, [zoned()])} qualityHref={HREF} />
        );
        expect(headers()).toEqual([
          "Joukkue",
          "Odotetut pisteet",
          "Nousee Veikkausliigaansija 1",
          "Säilyy / Putoaasijat 3–8",
        ]);
        unmount();
      }
    });

    it("gives the columns a width of their own and lets the table scroll", () => {
      const { container } = render(
        <SeasonForecastBody forecast={ok("single", [zoned()])} qualityHref={HREF} />
      );

      expect([...container.querySelectorAll("col")].map((col) => col.style.width)).toEqual([
        "",
        "72px",
        "112px",
        "112px",
      ]);
      expect((container.querySelector("table") as HTMLTableElement).style.minWidth).toBe("408px");
      expect(container.querySelector("table")?.parentElement?.className).toBe("overflow-x-auto");
    });

    it("keeps the team's name in view when the table scrolls", () => {
      const { container } = render(
        <SeasonForecastBody forecast={ok("single", [zoned()])} qualityHref={HREF} />
      );

      const names = [
        ...container.querySelectorAll("thead th:first-child, tbody th:first-child"),
      ] as HTMLElement[];
      expect(names).toHaveLength(3);
      expect(names.every((cell) => cell.className.includes("sticky left-0"))).toBe(true);
    });

    it("leaves a group without zones on its own columns beside one that has them", () => {
      render(
        <SeasonForecastBody
          forecast={ok("several", [
            zoned({ groupName: "Mestaruussarja" }),
            table({ groupId: 2, groupName: "Karsintasarja", decidesTitle: false }),
          ])}
          qualityHref={HREF}
        />
      );

      const [upper, lower] = screen.getAllByRole("table");
      expect(headers(upper)).toContain("Säilyy / Putoaasijat 3–8");
      expect(headers(lower)).toEqual([
        "Joukkue",
        "Odotetut pisteet",
        "Sarjan voitto",
        "Sarjan viimeinen sija",
      ]);
    });
  });

  it("says how the figures were made, and links to the model's record", () => {
    render(<SeasonForecastBody forecast={ok("single", [table()])} qualityHref={HREF} />);

    expect(screen.getByText(FORECAST_NOTE)).toBeDefined();
    expect(screen.queryByText(BEFORE_SPLIT_NOTE)).toBeNull();
    const link = screen.getByRole("link", { name: "Kuinka hyvin ennusteet ovat osuneet?" });
    expect(link.getAttribute("href")).toBe(HREF);
  });

  it("names the tables left out under the ones shown, before how the figures were made", () => {
    const { container } = render(
      <SeasonForecastBody
        forecast={ok("several", [table({ groupName: "Karsintasarja" })], ["Mestaruussarja"])}
        qualityHref={HREF}
      />
    );

    const line = screen.getByText(leftOutText(["Mestaruussarja"]));
    const following = (other: Element) =>
      line.compareDocumentPosition(other) === Node.DOCUMENT_POSITION_FOLLOWING;
    expect(following(container.querySelector("table") as Element)).toBe(false);
    expect(following(screen.getByText(FORECAST_NOTE))).toBe(true);
  });

  it("has no such line when every table of the season is shown", () => {
    const { container } = render(
      <SeasonForecastBody forecast={ok("single", [table()])} qualityHref={HREF} />
    );

    expect(container.textContent).not.toContain("mukana");
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it.each([
    ["error", FORECAST_ERROR_MESSAGE],
    ["no-fixtures", NO_FIXTURES_MESSAGE],
    ["not-simulated", NOT_SIMULATED_MESSAGE],
  ] as const)("shows only its line for %s", (status, message) => {
    const { container } = render(<SeasonForecastBody forecast={{ status }} qualityHref={HREF} />);

    expect(container.textContent).toBe(message);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("two tables under one name", () => {
  it("are told apart by their group ids, not their names", () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });
    render(
      <SeasonForecastBody
        forecast={{
          status: "ok",
          leftOut: [],
          layout: "several",
          tables: [
            table({ groupId: 4, groupName: "Lohko", rows: [team(1)] }),
            table({ groupId: 5, groupName: "Lohko", rows: [team(2)] }),
          ],
        }}
        qualityHref={HREF}
      />
    );
    spy.mockRestore();

    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(errors).toEqual([]);
  });
});
