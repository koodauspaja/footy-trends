import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  cleanSheetFactSentence,
  positionSentence,
  runSentence,
  type SeasonSummaryPanelData,
  SUMMARY_ERROR_MESSAGE,
  SUMMARY_HEADING,
  seasonSummaryPanel,
  sideSentence,
  upsetSentence,
} from "@/components/season-summary-section";
import type {
  CleanSheetFact,
  PositionFact,
  SeasonSummarySeries,
  SideFact,
  UpsetFact,
} from "@/lib/season-summary";

/**
 * `Kausi lyhyesti`: every sentence as the reader sees it, and the block's states.
 *
 * decisions/066-season-summary.md
 * decisions/069-season-summary-clean-sheets.md
 * decisions/070-season-summary-position.md
 */

function side(overrides: Partial<SideFact> = {}): SideFact {
  return {
    kind: "home",
    direction: "best",
    pointsPerMatch: 2.38,
    beaten: 4,
    everySeason: false,
    ...overrides,
  };
}

function cleanSheets(overrides: Partial<CleanSheetFact> = {}): CleanSheetFact {
  return {
    kind: "cleanSheets",
    direction: "best",
    share: 42,
    beaten: 4,
    everySeason: false,
    ...overrides,
  };
}

function position(overrides: Partial<PositionFact> = {}): PositionFact {
  return {
    kind: "position",
    direction: "best",
    place: 3,
    beaten: 4,
    everySeason: false,
    ...overrides,
  };
}

const UPSET: UpsetFact = {
  kind: "upset",
  match: {
    providerMatchId: 4242,
    kickoffAt: new Date("2026-05-01T15:00:00Z"),
    homeTeamProviderId: 2,
    homeTeamName: "KuPS",
    awayTeamProviderId: 1,
    awayTeamName: "AC Oulu",
    homeGoals: 0,
    awayGoals: 1,
    home: 0.6,
    draw: 0.24,
    away: 0.16,
    probability: 0.16,
  },
};

function joined(fact: UpsetFact): string {
  const { before, match, after } = upsetSentence(fact);
  return `${before}${match}${after}`;
}

describe("the sentences", () => {
  it("names the home and away records, both directions", () => {
    expect(sideSentence(side())).toBe("Paras kotisaldo 5 kauteen: 2,38 pistettä ottelua kohden.");
    expect(sideSentence(side({ direction: "worst", pointsPerMatch: 0.83 }))).toBe(
      "Heikoin kotisaldo 5 kauteen: 0,83 pistettä ottelua kohden."
    );
    expect(sideSentence(side({ kind: "away", pointsPerMatch: 1.94 }))).toBe(
      "Paras vierassaldo 5 kauteen: 1,94 pistettä ottelua kohden."
    );
    expect(sideSentence(side({ kind: "away", direction: "worst", pointsPerMatch: 0.57 }))).toBe(
      "Heikoin vierassaldo 5 kauteen: 0,57 pistettä ottelua kohden."
    );
  });

  it("counts the selected season with the ones it beats, printing both decimals", () => {
    expect(sideSentence(side({ beaten: 3, pointsPerMatch: 2 }))).toBe(
      "Paras kotisaldo 4 kauteen: 2,00 pistettä ottelua kohden."
    );
  });

  it("says tallennetuilla kausilla for a record over every compared season", () => {
    expect(sideSentence(side({ everySeason: true }))).toBe(
      "Paras kotisaldo tallennetuilla kausilla: 2,38 pistettä ottelua kohden."
    );
    expect(sideSentence(side({ kind: "away", direction: "worst", everySeason: true }))).toBe(
      "Heikoin vierassaldo tallennetuilla kausilla: 2,38 pistettä ottelua kohden."
    );
  });

  it("names the clean-sheet share both ways, as a whole percent with a no-break space", () => {
    expect(cleanSheetFactSentence(cleanSheets())).toBe(
      "Paras nollapeliosuus 5 kauteen: 42\u00a0% otteluista."
    );
    expect(cleanSheetFactSentence(cleanSheets({ direction: "worst", share: 8, beaten: 3 }))).toBe(
      "Heikoin nollapeliosuus 4 kauteen: 8\u00a0% otteluista."
    );
  });

  it("says tallennetuilla kausilla for a share beating every compared season", () => {
    expect(cleanSheetFactSentence(cleanSheets({ everySeason: true }))).toBe(
      "Paras nollapeliosuus tallennetuilla kausilla: 42\u00a0% otteluista."
    );
    expect(
      cleanSheetFactSentence(cleanSheets({ direction: "worst", share: 0, everySeason: true }))
    ).toBe("Heikoin nollapeliosuus tallennetuilla kausilla: 0\u00a0% otteluista.");
  });

  it("names the place both ways, with its ordinal full stop", () => {
    expect(positionSentence(position())).toBe("Paras sijoitus 5 kauteen: 3.");
    expect(positionSentence(position({ direction: "worst", place: 11, beaten: 3 }))).toBe(
      "Heikoin sijoitus 4 kauteen: 11."
    );
  });

  it("says tallennetuilla kausilla for a place beating every compared season", () => {
    expect(positionSentence(position({ everySeason: true }))).toBe(
      "Paras sijoitus tallennetuilla kausilla: 3."
    );
    expect(positionSentence(position({ direction: "worst", place: 9, everySeason: true }))).toBe(
      "Heikoin sijoitus tallennetuilla kausilla: 9."
    );
  });

  it("names each run record", () => {
    expect(runSentence({ kind: "run", run: "wins", length: 9 })).toBe(
      "Seuran pisin voittoputki tallennetuilla kausilla: 9 ottelua."
    );
    expect(runSentence({ kind: "run", run: "unbeaten", length: 14 })).toBe(
      "Seuran pisin tappioton putki tallennetuilla kausilla: 14 ottelua."
    );
    expect(runSentence({ kind: "run", run: "defeats", length: 6 })).toBe(
      "Seuran pisin tappioputki tallennetuilla kausilla: 6 ottelua."
    );
    expect(runSentence({ kind: "run", run: "winless", length: 11 })).toBe(
      "Seuran pisin voitoton putki tallennetuilla kausilla: 11 ottelua."
    );
  });

  it("counts one match in the singular", () => {
    expect(runSentence({ kind: "run", run: "defeats", length: 1 })).toBe(
      "Seuran pisin tappioputki tallennetuilla kausilla: 1 ottelu."
    );
  });

  it("names the upset's match and the figure Elo gave it", () => {
    expect(joined(UPSET)).toBe(
      "Kauden suurin yllätys: voitto ottelussa KuPS – AC Oulu, jolle Elo antoi 16 %."
    );
  });
});

function renderPanel(data: SeasonSummaryPanelData) {
  const view = seasonSummaryPanel(data);
  return { view, ...render(<div>{view}</div>) };
}

const matchHref = (id: number) => `/kotimaa/ottelu/${id}`;

function ok(overrides: Partial<Extract<SeasonSummarySeries, { status: "ok" }>> = {}) {
  return {
    series: {
      status: "ok" as const,
      facts: [side(), UPSET],
      inProgress: false,
      seasonLabel: "2025",
      ...overrides,
    },
    matchHref,
  };
}

describe("seasonSummaryPanel", () => {
  it("is headed by its group, Kausi lyhyesti", () => {
    expect(SUMMARY_HEADING).toBe("Kausi lyhyesti");
  });

  it("shows a paragraph per sentence, in the order given", () => {
    const { container } = renderPanel(ok());

    expect([...container.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "Paras kotisaldo 5 kauteen: 2,38 pistettä ottelua kohden.",
      joined(UPSET),
    ]);
  });

  it("shows the clean-sheet share's sentence among the others", () => {
    const { container } = renderPanel(ok({ facts: [side(), cleanSheets(), UPSET] }));

    expect([...container.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "Paras kotisaldo 5 kauteen: 2,38 pistettä ottelua kohden.",
      "Paras nollapeliosuus 5 kauteen: 42\u00a0% otteluista.",
      joined(UPSET),
    ]);
  });

  it("shows the place's sentence among the others", () => {
    const { container } = renderPanel(ok({ facts: [position(), side(), UPSET] }));

    expect([...container.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "Paras sijoitus 5 kauteen: 3.",
      "Paras kotisaldo 5 kauteen: 2,38 pistettä ottelua kohden.",
      joined(UPSET),
    ]);
  });

  it("links the upset's match label to its match page", () => {
    renderPanel(ok());

    expect(screen.getByRole("link", { name: "KuPS – AC Oulu" })).toHaveAttribute(
      "href",
      "/kotimaa/ottelu/4242"
    );
  });

  it("says once that the season is in progress, with its own label", () => {
    renderPanel(ok({ inProgress: true, seasonLabel: "2025/26" }));

    expect(screen.getAllByText("Kausi 2025/26 (kesken)")).toHaveLength(1);
  });

  it("says nothing about progress for a finished season", () => {
    renderPanel(ok());

    expect(screen.queryByText(/kesken/)).toBeNull();
  });

  it("shows the failure line when a read failed", () => {
    renderPanel({ series: { status: "error" }, matchHref });

    expect(screen.getByText(SUMMARY_ERROR_MESSAGE)).toBeInTheDocument();
    expect(SUMMARY_ERROR_MESSAGE).toBe(
      "Kauden yhteenvetoa ei voitu laskea. Yritä myöhemmin uudelleen."
    );
  });

  it("is no block at all when there is nothing to say, or no block on the page", () => {
    expect(renderPanel({ series: { status: "unavailable" }, matchHref }).view).toBeNull();
    expect(renderPanel({ series: { status: "unavailable" } }).view).toBeNull();
  });

  it("keys two runs of different directions apart", () => {
    // React reports a repeated key through console.error, and renders both anyway.
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = renderPanel(
      ok({
        facts: [
          { kind: "run", run: "wins", length: 9 },
          { kind: "run", run: "defeats", length: 6 },
        ],
      })
    );

    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
