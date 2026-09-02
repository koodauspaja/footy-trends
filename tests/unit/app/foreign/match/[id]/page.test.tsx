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
    providerMatchId: 497001,
    competitionCode: "PL",
    seasonId: 2025,
    kickoffAt: new Date("2026-02-14T15:00:00Z"),
    matchday: 26,
    status: "FINISHED",
    stage: null,
    groupName: null,
    regularTimeHome: null,
    regularTimeAway: null,
    extraTimeHome: null,
    extraTimeAway: null,
    penaltiesHome: null,
    penaltiesAway: null,
    homeTeamProviderId: 57,
    homeTeamName: "Arsenal FC",
    awayTeamProviderId: 61,
    awayTeamName: "Chelsea FC",
    homeGoals: 2,
    awayGoals: 1,
    createdAt: new Date("2026-02-14T18:00:00Z"),
    updatedAt: new Date("2026-02-14T18:00:00Z"),
    ...overrides,
  };
}

async function renderPage(id = "497001") {
  const { default: Page } = await import("@/app/foreign/match/[id]/page");
  render(await Page({ params: Promise.resolve({ id }) }));
}

describe("/ulkomaat/ottelu/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue({
      activeSeasonId: 2025,
      selectableSeasons: [{ seasonId: 2025, label: "2025/26" }],
      spansCalendarYears: true,
    });
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "football-data", match: row() },
      headToHead: {
        status: "ok",
        matches: [
          row({
            providerMatchId: 490100,
            competitionCode: "CL",
            kickoffAt: new Date("2025-09-30T19:00:00Z"),
            homeGoals: 0,
            awayGoals: 3,
          }),
        ],
      },
    });
  });

  it("shows the competition and season, and the round", async () => {
    await renderPage();

    expect(screen.getByText("Valioliiga 2025/26")).toBeInTheDocument();
    expect(screen.getByText("Kierros 26")).toBeInTheDocument();
  });

  it("links both teams into /ulkomaat, carrying the match's own competition and season", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "Arsenal FC" })).toHaveAttribute(
      "href",
      "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2025"
    );
  });

  it("names each previous meeting's competition and links it into /ulkomaat", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "30.09.2025" })).toHaveAttribute(
      "href",
      "/ulkomaat/ottelu/490100"
    );
    expect(screen.getByText("Mestarien liiga")).toBeInTheDocument();
  });

  it("states the football-data window", async () => {
    await renderPage();

    expect(
      screen.getByText("Perustuu kaudesta 2023/24 alkaen tallennettuihin otteluihin.")
    ).toBeInTheDocument();
  });

  it("shows the shootout apart from the score, which excludes it", async () => {
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: {
        source: "football-data",
        match: row({
          competitionCode: "CL",
          stage: "SEMI_FINALS",
          homeGoals: 2,
          awayGoals: 1,
          regularTimeHome: 1,
          regularTimeAway: 1,
          extraTimeHome: 0,
          extraTimeAway: 0,
          penaltiesHome: 4,
          penaltiesAway: 3,
        }),
      },
      headToHead: { status: "ok", matches: [] },
    });
    await renderPage();

    expect(screen.getByText("1–1 (rp 4–3)")).toBeInTheDocument();
    expect(screen.getByText("Välierät")).toBeInTheDocument();
  });

  it("falls back to the bare season year when the provider cannot be reached", async () => {
    getSeasonContextMock.mockRejectedValue(new Error("provider down"));
    await renderPage();

    expect(screen.getByText("Valioliiga 2025")).toBeInTheDocument();
  });

  it("titles the page with the teams, the competition and the season", async () => {
    const { generateMetadata } = await import("@/app/foreign/match/[id]/page");

    expect(await generateMetadata({ params: Promise.resolve({ id: "497001" }) })).toEqual({
      title: "Arsenal FC – Chelsea FC, Valioliiga 2025/26",
    });
  });
});
