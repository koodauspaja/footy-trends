import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonContext } from "@/lib/football-data";
import type { CupSeasonResult, TeamMatchesResult } from "@/lib/standings-service";
import type { TeamContextResult } from "@/lib/team-context";

const getSeasonContextMock = vi.fn<() => Promise<SeasonContext>>();
const getCupSeasonMock = vi.fn<() => Promise<CupSeasonResult>>();
const getTeamMatchesMock = vi.fn<() => Promise<TeamMatchesResult>>();
const getMaxMatchdayMock = vi.fn<() => Promise<number | null>>();

vi.mock("@/lib/standings-service", () => ({
  getCupSeason: getCupSeasonMock,
  getTeamMatches: getTeamMatchesMock,
  getMaxMatchday: getMaxMatchdayMock,
  getStandings: vi.fn(),
}));
vi.mock("@/lib/football-data", () => ({ getSeasonContext: getSeasonContextMock }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
const TEAM_CONTEXT_COMPETITION = "WC";
const TEAM_CONTEXT_SEASON = 2026;
/** The team exists, in the competition these tests already assume. */
async function defaultTeamContext(
  _source: unknown,
  teamProviderId: number
): Promise<TeamContextResult> {
  return Number.isInteger(teamProviderId) && teamProviderId !== 0
    ? {
        status: "ok" as const,
        context: { competitionCode: TEAM_CONTEXT_COMPETITION, seasonId: TEAM_CONTEXT_SEASON },
      }
    : { status: "not_found" as const };
}

const getTeamContextMock = vi.fn(defaultTeamContext);

// The team's own newest stored context, which the page resolves before it knows
// which competition to ask about. Mocked at the database boundary, so
// `resolveTeamDefaults`' own logic still runs. See specs/020-context-free-team-page.md.
vi.mock("@/lib/team-context", () => ({ getTeamContext: getTeamContextMock }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const seasonContext: SeasonContext = {
  activeSeasonId: 2026,
  selectableSeasons: [{ seasonId: 2026, label: "2026" }],
  spansCalendarYears: false,
};

/** Two World Cup group matches, named as the provider names them: in English. */
function englishMatch(id: number, home: [number, string], away: [number, string], stage: string) {
  return {
    providerMatchId: id,
    competitionCode: "WC",
    seasonId: 2026,
    status: "FINISHED",
    kickoffAt: new Date(`2026-06-${String(10 + id).padStart(2, "0")}T19:00:00Z`),
    matchday: stage === "GROUP_STAGE" ? 1 : null,
    stage,
    groupName: stage === "GROUP_STAGE" ? "GROUP_A" : null,
    homeTeamProviderId: home[0],
    homeTeamName: home[1],
    awayTeamProviderId: away[0],
    awayTeamName: away[1],
    homeGoals: 2,
    awayGoals: 1,
    regularTimeHome: null,
    regularTimeAway: null,
    extraTimeHome: null,
    extraTimeAway: null,
    penaltiesHome: null,
    penaltiesAway: null,
  };
}

const worldCupMatches = [
  englishMatch(1, [1, "Netherlands"], [2, "Ivory Coast"], "GROUP_STAGE"),
  englishMatch(2, [3, "United States"], [4, "Czechia"], "GROUP_STAGE"),
  englishMatch(3, [1, "Netherlands"], [3, "United States"], "FINAL"),
];

async function renderStandings(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { default: Page } = await import("@/app/national-teams/standings/page");
  render(await Page({ searchParams: Promise.resolve(searchParams) }));
}

describe("National-teams standings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTeamContextMock.mockImplementation(defaultTeamContext);
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue(seasonContext);
    getCupSeasonMock.mockResolvedValue({ status: "ok", matches: worldCupMatches });
  });

  it("shows country names in Finnish, not as the provider spells them", async () => {
    await renderStandings({ kilpailu: "WC" });

    expect(screen.getAllByText("Alankomaat").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Norsunluurannikko").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yhdysvallat").length).toBeGreaterThan(0);
    expect(screen.queryByText("Netherlands")).not.toBeInTheDocument();
    expect(screen.queryByText("Ivory Coast")).not.toBeInTheDocument();
  });

  it("offers no tournament selector, only the season", async () => {
    await renderStandings({ kilpailu: "WC" });

    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
    expect(screen.queryByLabelText("Kilpailu")).not.toBeInTheDocument();
  });

  it("labels a tournament season by its single year", async () => {
    await renderStandings({ kilpailu: "WC" });

    expect(screen.getByRole("heading", { name: "MM-kisat 2026" })).toBeInTheDocument();
  });

  it("keeps its links inside the region", async () => {
    await renderStandings({ kilpailu: "WC" });

    const link = screen.getByRole("link", { name: "Kaikki ottelut" });
    expect(link).toHaveAttribute("href", "/maajoukkueet/ottelut?kilpailu=WC&kausi=2026");
  });

  it("falls back to the World Cup for a competition from another region", async () => {
    // ?kilpailu=PL here must not render a Premier League page.
    await renderStandings({ kilpailu: "PL" });

    expect(screen.getByRole("heading", { name: "MM-kisat 2026" })).toBeInTheDocument();
    // The whole sentence, not just its opening: the notice has to name the
    // competition actually being shown, which is the region's default rather
    // than the app-wide one.
    expect(screen.getByRole("status").textContent).toBe(
      "Kilpailua ei löytynyt. Näytetään MM-kisat."
    );
  });
});

describe("National-teams matches page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTeamContextMock.mockImplementation(defaultTeamContext);
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue(seasonContext);
    getCupSeasonMock.mockResolvedValue({ status: "ok", matches: worldCupMatches });
  });

  it("shows Finnish country names and links inside the region", async () => {
    const { default: Page } = await import("@/app/national-teams/matches/page");
    render(await Page({ searchParams: Promise.resolve({ kilpailu: "WC", vaihe: "FINAL" }) }));

    expect(screen.getByRole("link", { name: "Alankomaat" })).toHaveAttribute(
      "href",
      "/maajoukkueet/joukkue/1?kilpailu=WC&kausi=2026"
    );
  });

  it("names the region's own default in the invalid-competition notice", async () => {
    const { default: Page } = await import("@/app/national-teams/matches/page");
    render(await Page({ searchParams: Promise.resolve({ kilpailu: "PL", vaihe: "FINAL" }) }));

    expect(screen.getByRole("status").textContent).toBe(
      "Kilpailua ei löytynyt. Näytetään MM-kisat."
    );
  });
});

describe("National-teams team page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTeamContextMock.mockImplementation(defaultTeamContext);
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue(seasonContext);
    getTeamMatchesMock.mockResolvedValue({ status: "ok", matches: worldCupMatches.slice(0, 1) });
  });

  it("names the team in Finnish", async () => {
    const { default: Page } = await import("@/app/national-teams/team/[id]/page");
    render(
      await Page({
        params: Promise.resolve({ id: "1" }),
        searchParams: Promise.resolve({ kilpailu: "WC" }),
      })
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Alankomaat");
  });

  it("names the region's own default in the invalid-competition notice", async () => {
    const { default: Page } = await import("@/app/national-teams/team/[id]/page");
    render(
      await Page({
        params: Promise.resolve({ id: "1" }),
        searchParams: Promise.resolve({ kilpailu: "PL" }),
      })
    );

    expect(screen.getByRole("status").textContent).toBe(
      "Kilpailua ei löytynyt. Näytetään MM-kisat."
    );
  });
});

describe("National-teams page metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTeamContextMock.mockImplementation(defaultTeamContext);
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue(seasonContext);
    getCupSeasonMock.mockResolvedValue({ status: "ok", matches: worldCupMatches });
    getTeamMatchesMock.mockResolvedValue({ status: "ok", matches: worldCupMatches.slice(0, 1) });
  });

  it("titles the standings page with the tournament and its single year", async () => {
    const { generateMetadata } = await import("@/app/national-teams/standings/page");

    await expect(
      generateMetadata({ searchParams: Promise.resolve({ kilpailu: "WC" }) })
    ).resolves.toEqual({ title: "MM-kisat 2026" });
  });

  it("titles the matches page the same way", async () => {
    const { generateMetadata } = await import("@/app/national-teams/matches/page");

    await expect(
      generateMetadata({ searchParams: Promise.resolve({ kilpailu: "WC" }) })
    ).resolves.toEqual({ title: "MM-kisat 2026" });
  });

  it("titles the team page with the team's Finnish name", async () => {
    const { generateMetadata } = await import("@/app/national-teams/team/[id]/page");

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "1" }),
      searchParams: Promise.resolve({ kilpailu: "WC" }),
    });

    expect(metadata.title).toContain("Alankomaat");
  });
});
