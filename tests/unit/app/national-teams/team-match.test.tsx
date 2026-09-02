import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchPageData, TasoMatchRow } from "@/lib/match-service";

const getMatchPageDataMock = vi.fn<() => Promise<MatchPageData>>();
const getSeasonCategoryNameMapMock =
  vi.fn<
    (
      competitionId: string,
      seasonId: number,
      activeSeasonId: number
    ) => Promise<Record<string, string>>
  >();

vi.mock("@/lib/match-service", () => ({
  getMatchPageData: getMatchPageDataMock,
}));

vi.mock("@/lib/taso-standings-service", () => ({
  getSeasonCategoryNameMap: getSeasonCategoryNameMapMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

function row(overrides: Partial<TasoMatchRow> = {}): TasoMatchRow {
  return {
    id: 1,
    providerMatchId: 4296364,
    competitionCode: "maajp2026",
    categoryId: "UNL",
    seasonId: 2026,
    groupId: 1,
    groupName: "C-liiga lohko 1",
    kickoffAt: new Date("2026-11-15T17:30:00Z"),
    matchday: 6,
    status: "FINISHED",
    winner: null,
    homeTeamProviderId: 144368,
    homeTeamName: "Suomi",
    awayTeamProviderId: 189255,
    awayTeamName: "San Marino",
    homeGoals: 3,
    awayGoals: 0,
    createdAt: new Date("2026-11-15T20:00:00Z"),
    updatedAt: new Date("2026-11-15T20:00:00Z"),
    ...overrides,
  };
}

async function renderMensPage(id = "4296364") {
  const { default: Page } = await import("@/app/national-teams/mens-team/match/[id]/page");
  render(await Page({ params: Promise.resolve({ id }) }));
}

async function renderWomensPage(id = "4296364") {
  const { default: Page } = await import("@/app/national-teams/womens-team/match/[id]/page");
  render(await Page({ params: Promise.resolve({ id }) }));
}

describe("/maajoukkueet/huuhkajat/ottelu/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonCategoryNameMapMock.mockResolvedValue({
      UNL: "UEFA Nations League Huuhkajat",
      WUNL: "UEFA Nations League Helmarit",
    });
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: row() },
      headToHead: {
        status: "ok",
        matches: [
          row({
            providerMatchId: 4200001,
            kickoffAt: new Date("2025-10-10T18:00:00Z"),
            groupName: "MM-karsinnat lohko J",
            homeGoals: 1,
            awayGoals: 0,
          }),
        ],
      },
    });
  });

  it("names the competition without the team suffix TASO appends", async () => {
    await renderMensPage();

    expect(screen.getByText("UEFA Nations League 2026")).toBeInTheDocument();
    expect(screen.getByText("C-liiga lohko 1")).toBeInTheDocument();
  });

  it("shows both teams as plain text — neither has a team page in this region", async () => {
    await renderMensPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Suomi – San Marino" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Suomi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "San Marino" })).not.toBeInTheDocument();
  });

  it("names each previous meeting's competition, with the team suffix stripped", async () => {
    // TASO's own group names here run to "2024", "Slovakia" and "Heinäkuu"; the
    // competition names are already normalised by specs/018. See #251.
    getSeasonCategoryNameMapMock.mockResolvedValue({
      UNL: "UEFA Nations League Huuhkajat",
      WCQ: "MM-karsinnat Huuhkajat",
    });
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: row() },
      headToHead: {
        status: "ok",
        matches: [row({ providerMatchId: 4200002, categoryId: "WCQ", groupName: "Lohko J" })],
      },
    });
    await renderMensPage();

    expect(screen.getByRole("columnheader", { name: "Kilpailu" })).toBeInTheDocument();
    expect(screen.getByText("MM-karsinnat")).toBeInTheDocument();
    expect(screen.queryByText("Lohko J")).not.toBeInTheDocument();
  });

  it("reads one category map per bucket, however many rows share it", async () => {
    // `getCached` does not deduplicate in-flight misses, so a per-row lookup
    // would fetch the same map once per row on a cold cache. See #251.
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: row() },
      headToHead: {
        status: "ok",
        matches: [
          row({ providerMatchId: 4200002, categoryId: "UNL" }),
          row({ providerMatchId: 4200003, categoryId: "WCQ" }),
          row({ providerMatchId: 4200004, competitionCode: "maajp2025", categoryId: "UNL" }),
        ],
      },
    });
    await renderMensPage();

    // Two buckets across three rows — plus the displayed match's own, which is
    // the same map as the first and is cached by the request.
    const buckets = new Set(getSeasonCategoryNameMapMock.mock.calls.map((call) => call[0]));
    expect(buckets).toEqual(new Set(["maajp2026", "maajp2025"]));
    expect(getSeasonCategoryNameMapMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the series name for a row TASO cannot name", async () => {
    getSeasonCategoryNameMapMock.mockResolvedValue({});
    await renderMensPage();

    expect(screen.getByText("MM-karsinnat lohko J")).toBeInTheDocument();
  });

  it("states the window as a calendar year, not a season", async () => {
    await renderMensPage();

    expect(
      screen.getByText("Perustuu vuodesta 2018 alkaen tallennettuihin otteluihin.")
    ).toBeInTheDocument();
  });

  it("links a previous meeting under the team's own path", async () => {
    await renderMensPage();

    expect(screen.getByRole("link", { name: "10.10.2025" })).toHaveAttribute(
      "href",
      "/maajoukkueet/huuhkajat/ottelu/4200001"
    );
  });

  it("names a category the map does not know at all only by its series", async () => {
    getSeasonCategoryNameMapMock.mockResolvedValue({});
    await renderMensPage();

    expect(screen.getByText("C-liiga lohko 1")).toBeInTheDocument();
    expect(screen.queryByText(/UEFA Nations League/)).not.toBeInTheDocument();
  });

  it("leaves a category name carrying neither team's suffix alone", async () => {
    getSeasonCategoryNameMapMock.mockResolvedValue({ UNL: "Pohjoismaiden mestaruus" });
    await renderMensPage();

    expect(screen.getByText("Pohjoismaiden mestaruus 2026")).toBeInTheDocument();
  });

  it("titles the page with the teams and the competition", async () => {
    const { generateMetadata } = await import("@/app/national-teams/mens-team/match/[id]/page");

    expect(await generateMetadata({ params: Promise.resolve({ id: "4296364" }) })).toEqual({
      title: "Suomi – San Marino, UEFA Nations League 2026",
    });
  });

  it("renders the match one line shorter when the category names cannot be read", async () => {
    getSeasonCategoryNameMapMock.mockRejectedValue(new Error("TASO down"));
    await renderMensPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Suomi – San Marino" })
    ).toBeInTheDocument();
    expect(screen.getByText("C-liiga lohko 1")).toBeInTheDocument();
    expect(screen.queryByText(/UEFA Nations League/)).not.toBeInTheDocument();
  });
});

describe("/maajoukkueet/helmarit/ottelu/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonCategoryNameMapMock.mockResolvedValue({
      WUNL: "UEFA Nations League Helmarit",
    });
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: {
        source: "taso",
        match: row({ categoryId: "WUNL", homeTeamProviderId: 144367, awayTeamName: "Croatia" }),
      },
      headToHead: { status: "ok", matches: [] },
    });
  });

  it("strips its own team's suffix and links rows under its own path", async () => {
    await renderWomensPage();

    expect(screen.getByText("UEFA Nations League 2026")).toBeInTheDocument();
  });

  it("strips the other team's suffix from a category the route does not own", async () => {
    // A hand-typed id can point at the men's categories; stripping the route's
    // own suffix would leave "MM-karsinnat Huuhkajat" on the Helmarit page.
    getSeasonCategoryNameMapMock.mockResolvedValue({ WCQ: "MM-karsinnat Huuhkajat" });
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: row({ categoryId: "WCQ" }) },
      headToHead: { status: "ok", matches: [] },
    });
    await renderWomensPage();

    expect(screen.getByText("MM-karsinnat 2026")).toBeInTheDocument();
  });

  it("titles the Helmarit page from its own route", async () => {
    const { generateMetadata } = await import("@/app/national-teams/womens-team/match/[id]/page");

    expect(await generateMetadata({ params: Promise.resolve({ id: "4296364" }) })).toEqual({
      title: "Suomi – Kroatia, UEFA Nations League 2026",
    });
  });

  it("renders an opponent TASO spells in English under its Finnish name", async () => {
    await renderWomensPage();

    expect(screen.getByRole("heading", { level: 1, name: "Suomi – Kroatia" })).toBeInTheDocument();
  });
});
