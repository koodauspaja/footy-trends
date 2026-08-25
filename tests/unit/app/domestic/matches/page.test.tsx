import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedTasoMatch } from "@/lib/taso";
import type { SeasonMatchesResult } from "@/lib/taso-standings-service";

const getSeasonMatchListMock = vi.fn<() => Promise<SeasonMatchesResult>>();

/**
 * Season discovery is mocked so these page tests stay pure unit tests: the
 * real `resolveTasoSeasonContext` queries `taso_matches` for its fallback,
 * which would make them depend on a live database.
 */
const resolveTasoSeasonContextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ currentSeason: 2026, defaultSeason: 2026 })
);

vi.mock("@/lib/taso-standings-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso-standings-service")>();
  return {
    ...actual,
    getSeasonMatchList: getSeasonMatchListMock,
    resolveTasoSeasonContext: resolveTasoSeasonContextMock,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function buildMatch(overrides: Partial<NormalizedTasoMatch> = {}): NormalizedTasoMatch {
  return {
    providerMatchId: 1,
    competitionCode: "spljp26",
    categoryId: "VL",
    seasonId: 2026,
    groupId: 1,
    groupName: "Runkosarja",
    status: "FINISHED",
    kickoffAt: new Date("2026-04-01T14:00:00Z"),
    matchday: 1,
    homeTeamProviderId: 1,
    homeTeamName: "HJK",
    awayTeamProviderId: 2,
    awayTeamName: "KuPS",
    homeGoals: 2,
    awayGoals: 1,
    ...overrides,
  };
}

async function renderMatches(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { default: DomesticMatchesPage } = await import("@/app/domestic/matches/page");
  render(await DomesticMatchesPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("Domestic matches page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSeasonMatchListMock.mockResolvedValue({ status: "ok", matches: [buildMatch()] });
  });

  it("shows the Finnish heading and the season's matches with date, teams, result, and group name", async () => {
    await renderMatches();

    expect(screen.getByRole("heading", { name: "Veikkausliiga 2026" })).toBeInTheDocument();
    expect(screen.getByText("01.04.2026")).toBeInTheDocument();
    expect(screen.getByText("2–1")).toBeInTheDocument();
    expect(screen.getByText("Runkosarja")).toBeInTheDocument();
  });

  it("shows a dash for an unplayed match's result", async () => {
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [buildMatch({ homeGoals: null, awayGoals: null, status: "SCHEDULED" })],
    });

    await renderMatches();

    const cells = screen.getAllByRole("cell");
    expect(cells[2]).toHaveTextContent("–");
  });

  it("links each team name to its /kotimaa/joukkue page", async () => {
    await renderMatches({ kausi: "2020" });

    expect(screen.getByRole("link", { name: "HJK" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/1?kilpailu=VL&kausi=2020"
    );
    expect(screen.getByRole("link", { name: "KuPS" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/2?kilpailu=VL&kausi=2020"
    );
  });

  it("links back to the standings page", async () => {
    await renderMatches({ kausi: "2020" });

    expect(screen.getByRole("link", { name: "Sarjataulukkoon" })).toHaveAttribute(
      "href",
      "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2020"
    );
  });

  it("shows the empty message when the season truly has no matches", async () => {
    getSeasonMatchListMock.mockResolvedValue({ status: "empty" });

    await renderMatches();

    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
  });

  it("shows the error message on a TASO failure", async () => {
    getSeasonMatchListMock.mockResolvedValue({ status: "error" });

    await renderMatches();

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
  });

  it("shows a fallback notice for an invalid kausi param", async () => {
    await renderMatches({ kausi: "1999" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kautta ei löytynyt. Näytetään kausi 2026."
    );
  });

  it("shows a fallback notice for an invalid kilpailu param", async () => {
    await renderMatches({ kilpailu: "XX" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kilpailua ei löytynyt. Näytetään Veikkausliiga."
    );
  });

  it("shows the empty message for an ok result with zero matches", async () => {
    getSeasonMatchListMock.mockResolvedValue({ status: "ok", matches: [] });

    await renderMatches();

    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
  });

  it("defaults searchParams handling when none is provided", async () => {
    const { default: DomesticMatchesPage } = await import("@/app/domestic/matches/page");
    render(await DomesticMatchesPage({}));

    expect(screen.getByRole("heading", { name: "Veikkausliiga 2026" })).toBeInTheDocument();
  });

  it("defaults tab title handling when searchParams is not provided", async () => {
    const { generateMetadata } = await import("@/app/domestic/matches/page");

    expect(await generateMetadata({})).toEqual({ title: "Veikkausliiga 2026" });
  });

  it("sets the browser tab title to match the heading", async () => {
    const { generateMetadata } = await import("@/app/domestic/matches/page");

    expect(await generateMetadata({ searchParams: Promise.resolve({}) })).toEqual({
      title: "Veikkausliiga 2026",
    });
  });
});
