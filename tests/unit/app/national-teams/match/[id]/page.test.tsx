import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonContext } from "@/lib/football-data";
import type { FootballDataMatchRow, MatchPageData } from "@/lib/match-service";

const getMatchPageDataMock = vi.fn<() => Promise<MatchPageData>>();
const getSeasonContextMock = vi.fn<() => Promise<SeasonContext>>();

vi.mock("@/lib/match-service", () => ({
  getMatchPageData: getMatchPageDataMock,
}));

vi.mock("@/lib/football-data", () => ({
  getSeasonContext: getSeasonContextMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

function row(overrides: Partial<FootballDataMatchRow> = {}): FootballDataMatchRow {
  return {
    id: 1,
    providerMatchId: 537430,
    competitionCode: "WC",
    seasonId: 2026,
    kickoffAt: new Date("2026-06-20T19:00:00Z"),
    matchday: null,
    status: "FINISHED",
    stage: "GROUP_STAGE",
    groupName: "GROUP_B",
    regularTimeHome: null,
    regularTimeAway: null,
    extraTimeHome: null,
    extraTimeAway: null,
    penaltiesHome: null,
    penaltiesAway: null,
    homeTeamProviderId: 770,
    homeTeamName: "England",
    awayTeamProviderId: 792,
    awayTeamName: "Sweden",
    homeGoals: 1,
    awayGoals: 1,
    createdAt: new Date("2026-06-20T21:00:00Z"),
    updatedAt: new Date("2026-06-20T21:00:00Z"),
    ...overrides,
  };
}

async function renderPage(id = "537430") {
  const { default: Page } = await import("@/app/national-teams/match/[id]/page");
  render(await Page({ params: Promise.resolve({ id }) }));
}

describe("/maajoukkueet/ottelu/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue({
      activeSeasonId: 2026,
      selectableSeasons: [{ seasonId: 2026, label: "2026" }],
      spansCalendarYears: false,
    });
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "football-data", match: row() },
      headToHead: { status: "ok", matches: [] },
    });
  });

  it("names both countries in Finnish", async () => {
    await renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Englanti – Ruotsi" })
    ).toBeInTheDocument();
  });

  it("labels a tournament season as a single year, not a spanning one", async () => {
    await renderPage();

    expect(screen.getByText("MM-kisat 2026")).toBeInTheDocument();
    expect(screen.getByText("Lohko B")).toBeInTheDocument();
  });

  it("states the window the head-to-head can actually reach, across the region", async () => {
    // The list spans the region, so a World Cup page can show a 2024 European
    // Championship meeting. Stating the World Cup's own 2026 floor above such a
    // row would describe a window the page has just contradicted.
    await renderPage();

    expect(
      screen.getByText("Perustuu kaudesta 2024 alkaen tallennettuihin otteluihin.")
    ).toBeInTheDocument();
  });

  it("titles the page with the teams, the competition and the season", async () => {
    const { generateMetadata } = await import("@/app/national-teams/match/[id]/page");

    expect(await generateMetadata({ params: Promise.resolve({ id: "537430" }) })).toEqual({
      title: "Englanti – Ruotsi, MM-kisat 2026",
    });
  });

  it("links a previous meeting into /maajoukkueet", async () => {
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "football-data", match: row() },
      headToHead: {
        status: "ok",
        matches: [
          row({
            providerMatchId: 428742,
            competitionCode: "EC",
            seasonId: 2024,
            kickoffAt: new Date("2024-06-16T16:00:00Z"),
          }),
        ],
      },
    });
    await renderPage();

    expect(screen.getByRole("link", { name: "16.06.2024" })).toHaveAttribute(
      "href",
      "/maajoukkueet/ottelu/428742"
    );
    expect(screen.getByText("EM-kisat")).toBeInTheDocument();
  });
});
