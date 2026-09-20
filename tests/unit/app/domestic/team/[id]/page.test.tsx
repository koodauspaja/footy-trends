import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CleanSheetSeries } from "@/lib/clean-sheets";
import { categoryIdForSeason, competitionIdForSeason } from "@/lib/domestic-competitions";
import type { FormSeries } from "@/lib/form-series";
import type { GoalsSeries } from "@/lib/goals-series";
import type { HomeAwaySeries } from "@/lib/home-away";
import type { PositionSeries } from "@/lib/position-series";
import type { StreaksSeries } from "@/lib/streaks";
import type { NormalizedTasoMatch } from "@/lib/taso";
import type { TeamMatchesResult } from "@/lib/taso-standings-service";
import type { TeamContextResult } from "@/lib/team-context";
import type { TeamNameResult, TeamSeasonsResult } from "@/lib/team-seasons";
import { warmModules } from "../../../../../support/warm-module";

const getTeamMatchesMock = vi.fn<() => Promise<TeamMatchesResult>>();
const getTeamPositionSeriesMock = vi.fn(
  async (..._args: unknown[]): Promise<PositionSeries> => ({ status: "no-rounds" })
);
const getTeamFormSeriesMock = vi.fn(
  async (..._args: unknown[]): Promise<FormSeries> => ({ status: "too-few" })
);
const getTeamGoalsSeriesMock = vi.fn(
  async (..._args: unknown[]): Promise<GoalsSeries> => ({ status: "ok", rolling: [], totals: [] })
);
const getTeamHomeAwaySeriesMock = vi.fn(
  async (..._args: unknown[]): Promise<HomeAwaySeries> => ({ status: "unavailable" })
);
const getTeamCleanSheetSeriesMock = vi.fn(
  async (..._args: unknown[]): Promise<CleanSheetSeries> => ({ status: "unavailable" })
);
const getTeamStreaksMock = vi.fn(
  async (..._args: unknown[]): Promise<StreaksSeries> => ({ status: "unavailable" })
);

/**
 * The Analyysit section stands in here with a marker: its panels and its
 * sign-in gate are `analytics-section.test.tsx`'s. What this file owns is the
 * page's side — whether the section is asked for at all, and with which
 * series.
 */
const analyticsSectionMock = vi.fn(
  async (_props: {
    loadPosition: () => Promise<PositionSeries>;
    loadForm: () => Promise<FormSeries>;
    loadGoals: () => Promise<GoalsSeries>;
    loadHomeAway: () => Promise<HomeAwaySeries>;
    loadCleanSheets: () => Promise<CleanSheetSeries>;
    loadStreaks: () => Promise<StreaksSeries>;
  }) => "analytics section placeholder"
);
vi.mock("@/components/analytics-section", () => ({
  AnalyticsSection: analyticsSectionMock,
}));

/**
 * Season discovery is mocked so these page tests stay pure unit tests: the
 * real `resolveTasoSeasonContext` queries `taso_matches` for its fallback,
 * which would make them depend on a live database.
 */
const resolveTasoSeasonContextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ currentSeason: 2026, defaultSeason: 2026 })
);

/**
 * Mocked for the same reason: the real one reads TASO's per-season category
 * names through Redis, which a unit test must not depend on. Returning null is
 * the "TASO could not be asked" path, so the page falls back to the configured
 * competition name — what these tests already assert.
 */
const getSeasonCategoryNameMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("@/lib/taso-standings-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso-standings-service")>();
  return {
    ...actual,
    getTeamMatches: getTeamMatchesMock,
    getTeamFormSeries: getTeamFormSeriesMock,
    getTeamGoalsSeries: getTeamGoalsSeriesMock,
    getTeamCleanSheetSeries: getTeamCleanSheetSeriesMock,
    getTeamStreaks: getTeamStreaksMock,
    getTeamHomeAwaySeries: getTeamHomeAwaySeriesMock,
    getTeamPositionSeries: getTeamPositionSeriesMock,
    getSeasonCategoryName: getSeasonCategoryNameMock,
    resolveTasoSeasonContext: resolveTasoSeasonContextMock,
  };
});

const TEAM_CONTEXT_COMPETITION = "VL";
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
/**
 * The club's other seasons, which most of these tests do not describe: an
 * unanswered lookup leaves the page on its previous behaviour, and the tests
 * that care about it set a value. See specs/022-teams-between-tiers.md.
 */
const getTeamSeasonsMock = vi.fn(async (): Promise<TeamSeasonsResult> => ({ status: "not_found" }));

const getTeamNameMock = vi.fn(async (): Promise<TeamNameResult> => ({ status: "not_found" }));

vi.mock("@/lib/team-seasons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/team-seasons")>();
  return { ...actual, getTeamSeasons: getTeamSeasonsMock, getTeamName: getTeamNameMock };
});

vi.mock("@/lib/team-context", () => ({ getTeamContext: getTeamContextMock }));

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
    winner: null,
    ...overrides,
  };
}

async function renderTeam(
  id: string,
  searchParams: Record<string, string | string[] | undefined> = {}
) {
  const { default: DomesticTeamPage } = await import("@/app/domestic/team/[id]/page");
  render(
    await DomesticTeamPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    })
  );
}

/**
 * At file level, not inside the first `describe`.
 *
 * Mock implementations live on the module rather than on the block that set
 * them, so the `describe`s below used to start from whatever the previous one's
 * last test left behind — a failed match lookup, a competition renamed for one
 * assertion — and passed only because they are declared in that order.
 */
beforeEach(() => {
  vi.clearAllMocks();
  getTeamSeasonsMock.mockResolvedValue({ status: "not_found" });
  getTeamNameMock.mockResolvedValue({ status: "not_found" });
  getTeamContextMock.mockImplementation(defaultTeamContext);
  getTeamMatchesMock.mockResolvedValue({ status: "ok", matches: [buildMatch()] });
  /**
   * These two are set at hoist time and one test replaces them for good —
   * `clearAllMocks` clears calls, not implementations. Restored here so a
   * test inherits nothing from the one before it: without this, everything
   * declared after the Naisten Liiga case is named by that case rather than
   * by its own arrangement.
   */
  getSeasonCategoryNameMock.mockResolvedValue(null);
  resolveTasoSeasonContextMock.mockResolvedValue({ currentSeason: 2026, defaultSeason: 2026 });
});

warmModules(() => import("@/app/domestic/team/[id]/page"));

describe("Domestic team page", () => {
  it("shows the team's name in the heading, alongside the competition and season", async () => {
    await renderTeam("1");

    expect(screen.getByRole("heading", { name: "HJK – Veikkausliiga 2026" })).toBeInTheDocument();
    expect(getTeamMatchesMock).toHaveBeenCalledWith("VL", "spljp26", 1, 2026, 2026);
  });

  it("resolves the team as the away side too", async () => {
    await renderTeam("2");

    expect(screen.getByRole("heading", { name: "KuPS – Veikkausliiga 2026" })).toBeInTheDocument();
  });

  it("shows every match's date, teams, result, and group name", async () => {
    await renderTeam("1");

    expect(screen.getByText("01.04.2026")).toBeInTheDocument();
    expect(screen.getByText("HJK – KuPS")).toBeInTheDocument();
    expect(screen.getByText("2–1")).toBeInTheDocument();
    expect(screen.getByText("Runkosarja")).toBeInTheDocument();
  });

  it("puts the match list in a fold that starts open, named with its count (#416)", async () => {
    await renderTeam("1");
    const details = screen.getByRole("region", { name: "Ottelut" }).querySelector("details");
    const rows = details?.querySelectorAll("tbody tr").length ?? 0;

    expect(details?.open).toBe(true);
    expect(rows).toBeGreaterThan(0);
    expect(details?.querySelector("summary")?.textContent).toBe(
      `▸Ottelut(${rows === 1 ? "1 ottelu" : `${rows} ottelua`})`
    );
  });

  it("links back to the standings page", async () => {
    await renderTeam("1", { kausi: "2020" });

    expect(screen.getByRole("link", { name: "Sarjataulukkoon" })).toHaveAttribute(
      "href",
      "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2020"
    );
  });

  it("shows the not-found message for a team that never appears in the season", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });

    await renderTeam("999");

    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
  });

  it("shows the team's own competition and season when the URL names neither", async () => {
    // Before this, a bare URL meant "Veikkausliiga, current season", which
    // served 12 of 1,315 stored Finnish team ids. See specs/020.
    getTeamContextMock.mockResolvedValue({
      status: "ok",
      context: { competitionCode: "M2", seasonId: 2019 },
    });

    await renderTeam("60496");

    expect(screen.getByRole("link", { name: "Sarjataulukkoon" })).toHaveAttribute(
      "href",
      "/kotimaa/sarjataulukko?kilpailu=M2&kausi=2019"
    );
    expect(getTeamMatchesMock).toHaveBeenCalledWith("M2", "spljp19", 60496, 2019, 2026);
  });

  it("keeps an explicit competition and season exactly as they are", async () => {
    getTeamContextMock.mockResolvedValue({
      status: "ok",
      context: { competitionCode: "M2", seasonId: 2019 },
    });

    await renderTeam("60496", { kilpailu: "VL", kausi: "2020" });

    expect(screen.getByRole("link", { name: "Sarjataulukkoon" })).toHaveAttribute(
      "href",
      "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2020"
    );
  });

  it("fills in the season from the team's newest match in a competition the URL names", async () => {
    getTeamContextMock.mockResolvedValue({
      status: "ok",
      context: { competitionCode: "M1", seasonId: 2018 },
    });

    await renderTeam("60496", { kilpailu: "M1" });

    expect(screen.getByRole("link", { name: "Sarjataulukkoon" })).toHaveAttribute(
      "href",
      "/kotimaa/sarjataulukko?kilpailu=M1&kausi=2018"
    );
  });

  it("shows the error state rather than an unknown team when the lookup fails", async () => {
    getTeamContextMock.mockResolvedValue({ status: "error" });

    await renderTeam("60496");

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Joukkuetta ei löytynyt.")).not.toBeInTheDocument();
  });

  it("says where a relegated club played instead of calling it unknown", async () => {
    // FC Haka, Ykkönen 2015–19, Veikkausliiga 2020–25, Ykkösliiga 2026. Asking
    // for its Veikkausliiga 2026 page used to answer "Joukkuetta ei löytynyt."
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });
    getTeamNameMock.mockResolvedValue({ status: "ok", name: "FC Haka" });
    getTeamSeasonsMock.mockResolvedValue({
      status: "ok",
      seasons: [
        { competitionCode: "M1L", seasonId: 2026, matches: 27 },
        { competitionCode: "MSC", seasonId: 2026, matches: 2 },
        { competitionCode: "VL", seasonId: 2025, matches: 27 },
      ],
    });

    await renderTeam("60561", { kilpailu: "VL", kausi: "2026" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("FC Haka");
    expect(
      screen.getByText("Joukkue ei pelannut tässä sarjassa tällä kaudella.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Joukkuetta ei löytynyt.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ykkösliiga" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/60561?kilpailu=M1L&kausi=2026"
    );
    expect(screen.getByRole("link", { name: "Miesten Suomen Cup" })).toBeInTheDocument();
  });

  it("offers the club's most recent season when it played nothing that year", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });
    getTeamNameMock.mockResolvedValue({ status: "ok", name: "HIFK" });
    getTeamSeasonsMock.mockResolvedValue({
      status: "ok",
      seasons: [{ competitionCode: "VL", seasonId: 2022, matches: 27 }],
    });

    await renderTeam("60808", { kilpailu: "VL", kausi: "2015" });

    // The label and the link are separate nodes, as a link inside a sentence is.
    expect(screen.getByText(/Joukkueen uusin kausi/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Veikkausliiga 2022" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/60808?kilpailu=VL&kausi=2022"
    );
  });

  it("offers the club's own seasons in the selector, not the competition's", async () => {
    // 120 of Veikkausliiga's 264 (club, season) options led nowhere.
    getTeamSeasonsMock.mockResolvedValue({
      status: "ok",
      seasons: [
        { competitionCode: "M1", seasonId: 2018, matches: 24 },
        { competitionCode: "VL", seasonId: 2017, matches: 27 },
      ],
    });

    await renderTeam("60808", { kilpailu: "VL", kausi: "2017" });

    const options = [...screen.getByLabelText("Kausi").querySelectorAll("option")].map(
      (option) => option.textContent
    );
    expect(options).toEqual(["2018", "2017"]);
  });

  it("shows the error state when the club's name could not be read", async () => {
    // Seasons read fine, the name lookup did not: rendering the explanation
    // with a blank where the club should be would hide an outage.
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });
    getTeamSeasonsMock.mockResolvedValue({
      status: "ok",
      seasons: [{ competitionCode: "M1L", seasonId: 2026, matches: 27 }],
    });
    getTeamNameMock.mockResolvedValue({ status: "error" });

    await renderTeam("60561", { kilpailu: "VL", kausi: "2026" });

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Joukkue ei pelannut tässä sarjassa tällä kaudella.")
    ).not.toBeInTheDocument();
  });

  it("does not call a club unknown when its seasons could not be read", async () => {
    // A database that could not answer is not a club that does not exist.
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });
    getTeamSeasonsMock.mockResolvedValue({ status: "error" });

    await renderTeam("60561", { kilpailu: "VL", kausi: "2026" });

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Joukkuetta ei löytynyt.")).not.toBeInTheDocument();
  });

  it("does not offer a stored season past the one the provider is on", async () => {
    // A bucket can hold a season the picker does not offer yet; a dropdown
    // entry for it sends a `kausi` the page rejects.
    getTeamSeasonsMock.mockResolvedValue({
      status: "ok",
      seasons: [
        { competitionCode: "VL", seasonId: 2027, matches: 3 },
        { competitionCode: "VL", seasonId: 2026, matches: 27 },
      ],
    });

    await renderTeam("60901", { kilpailu: "VL", kausi: "2026" });

    const options = [...screen.getByLabelText("Kausi").querySelectorAll("option")].map(
      (option) => option.textContent
    );
    expect(options).toEqual(["2026"]);
  });

  it("still calls an unknown club unknown", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });
    getTeamSeasonsMock.mockResolvedValue({ status: "not_found" });
    getTeamNameMock.mockResolvedValue({ status: "not_found" });

    await renderTeam("999999", { kilpailu: "VL", kausi: "2026" });

    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
    expect(
      screen.queryByText("Joukkue ei pelannut tässä sarjassa tällä kaudella.")
    ).not.toBeInTheDocument();
  });

  it("shows the reduced not-found page for a non-numeric id, without calling getTeamMatches", async () => {
    await renderTeam("not-a-number");

    // No competition to name, so no season selector and no standings link: the
    // page used to offer both for Veikkausliiga. See specs/020.
    expect(screen.getByRole("heading", { level: 1, name: "Joukkue" })).toBeInTheDocument();
    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sarjataulukkoon" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(getTeamMatchesMock).not.toHaveBeenCalled();
  });

  it("shows the empty message when the season truly has no matches", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "empty" });

    await renderTeam("1");

    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
  });

  it("shows the error message on a TASO failure", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "error" });

    await renderTeam("1");

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
  });

  it("shows a dash for an unplayed match's result", async () => {
    getTeamMatchesMock.mockResolvedValue({
      status: "ok",
      matches: [buildMatch({ homeGoals: null, awayGoals: null, status: "SCHEDULED" })],
    });

    await renderTeam("1");

    const cells = screen.getAllByRole("cell");
    expect(cells[2]).toHaveTextContent("–");
  });

  it("shows fallback notices for invalid kilpailu and kausi params", async () => {
    await renderTeam("1", { kilpailu: "XX", kausi: "1999" });

    const notices = screen.getAllByRole("status");
    expect(notices.map((notice) => notice.textContent)).toEqual([
      "Kilpailua ei löytynyt. Näytetään Veikkausliiga.",
      "Kautta ei löytynyt. Näytetään kausi 2026.",
    ]);
  });

  it("defaults searchParams handling when none is provided", async () => {
    const { default: DomesticTeamPage } = await import("@/app/domestic/team/[id]/page");
    render(await DomesticTeamPage({ params: Promise.resolve({ id: "1" }) }));

    expect(screen.getByRole("heading", { name: "HJK – Veikkausliiga 2026" })).toBeInTheDocument();
  });

  it("sets the browser tab title to the team's name", async () => {
    const { generateMetadata } = await import("@/app/domestic/team/[id]/page");

    expect(
      await generateMetadata({
        params: Promise.resolve({ id: "1" }),
        searchParams: Promise.resolve({}),
      })
    ).toEqual({ title: "HJK – Veikkausliiga 2026" });
  });

  it("sets the tab title to just the competition name before a team is resolved", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });
    const { generateMetadata } = await import("@/app/domestic/team/[id]/page");

    expect(
      await generateMetadata({
        params: Promise.resolve({ id: "999" }),
        searchParams: Promise.resolve({}),
      })
    ).toEqual({ title: "Veikkausliiga" });
  });

  it("titles the page after the section when the team lookup fails", async () => {
    // Not the not-found message: a database that cannot be reached is not a
    // team that does not exist.
    getTeamContextMock.mockResolvedValue({ status: "error" });
    const { generateMetadata } = await import("@/app/domestic/team/[id]/page");

    expect(
      await generateMetadata({
        params: Promise.resolve({ id: "60496" }),
        searchParams: Promise.resolve({}),
      })
    ).toEqual({ title: "Joukkue" });
  });

  it("titles a page with no team after the not-found message, without calling getTeamMatches", async () => {
    const { generateMetadata } = await import("@/app/domestic/team/[id]/page");

    expect(
      await generateMetadata({
        params: Promise.resolve({ id: "not-a-number" }),
        searchParams: Promise.resolve({}),
      })
    ).toEqual({ title: "Joukkuetta ei löytynyt." });
    expect(getTeamMatchesMock).not.toHaveBeenCalled();
  });

  it("defaults tab title searchParams handling when none is provided", async () => {
    const { generateMetadata } = await import("@/app/domestic/team/[id]/page");

    expect(await generateMetadata({ params: Promise.resolve({ id: "1" }) })).toEqual({
      title: "HJK – Veikkausliiga 2026",
    });
  });
});

describe("Domestic team page competition naming", () => {
  it("says what a renamed competition is called now, like the standings page does", async () => {
    // Each /kotimaa page heads with the season's own name, so each owes the
    // reader the same explanation.
    getSeasonCategoryNameMock.mockResolvedValue("Naisten Liiga");
    getTeamMatchesMock.mockResolvedValue({ status: "ok", matches: [buildMatch()] });

    await renderTeam("1", { kilpailu: "NL", kausi: "2016" });

    expect(screen.getByText("nykyisin Briotech Kansallinen Liiga")).toBeInTheDocument();
  });
});

describe("Domestic team page league position (specs/030)", () => {
  it("shows the section for a league team with matches this season", async () => {
    await renderTeam("1", { kilpailu: "VL", kausi: "2025" });

    expect(screen.getByText("analytics section placeholder")).toBeInTheDocument();
  });

  it("asks for this team's series in the season's own TASO category and competition", async () => {
    await renderTeam("1", { kilpailu: "VL", kausi: "2025" });
    const loadPosition = analyticsSectionMock.mock.calls[0]?.[0].loadPosition;

    await loadPosition?.();

    expect(getTeamPositionSeriesMock).toHaveBeenCalledWith(
      categoryIdForSeason("VL", 2025),
      competitionIdForSeason("VL", 2025),
      1,
      2025,
      2026
    );
  });

  it("asks for this team's form in the same TASO category and competition (specs/031)", async () => {
    await renderTeam("1", { kilpailu: "VL", kausi: "2025" });
    const loadForm = analyticsSectionMock.mock.calls[0]?.[0].loadForm;

    await loadForm?.();

    expect(getTeamFormSeriesMock).toHaveBeenCalledWith(
      categoryIdForSeason("VL", 2025),
      competitionIdForSeason("VL", 2025),
      1,
      2025,
      2026
    );
  });

  it("asks for this team's goals in the same TASO category and competition (specs/032)", async () => {
    await renderTeam("1", { kilpailu: "VL", kausi: "2025" });
    const loadGoals = analyticsSectionMock.mock.calls[0]?.[0].loadGoals;

    await loadGoals?.();

    expect(getTeamGoalsSeriesMock).toHaveBeenCalledWith(
      categoryIdForSeason("VL", 2025),
      competitionIdForSeason("VL", 2025),
      1,
      2025,
      2026
    );
  });

  it("asks for this team's home and away in the same TASO category and competition (specs/033)", async () => {
    await renderTeam("1", { kilpailu: "VL", kausi: "2025" });
    const loadHomeAway = analyticsSectionMock.mock.calls[0]?.[0].loadHomeAway;

    await loadHomeAway?.();

    expect(getTeamHomeAwaySeriesMock).toHaveBeenCalledWith(
      categoryIdForSeason("VL", 2025),
      competitionIdForSeason("VL", 2025),
      1,
      2025,
      2026
    );
  });

  it("asks for this team's clean sheets in the same TASO category and competition (specs/034)", async () => {
    await renderTeam("1", { kilpailu: "VL", kausi: "2025" });
    const loadCleanSheets = analyticsSectionMock.mock.calls[0]?.[0].loadCleanSheets;

    await loadCleanSheets?.();

    expect(getTeamCleanSheetSeriesMock).toHaveBeenCalledWith(
      categoryIdForSeason("VL", 2025),
      competitionIdForSeason("VL", 2025),
      1,
      2025,
      2026
    );
  });

  it("asks for this team's streaks in the same TASO category and competition (specs/035)", async () => {
    await renderTeam("1", { kilpailu: "VL", kausi: "2025" });
    const loadStreaks = analyticsSectionMock.mock.calls[0]?.[0].loadStreaks;

    await loadStreaks?.();

    expect(getTeamStreaksMock).toHaveBeenCalledWith(
      categoryIdForSeason("VL", 2025),
      competitionIdForSeason("VL", 2025),
      1,
      2025,
      2026
    );
  });

  it("offers no section for a cup, which has no league position", async () => {
    await renderTeam("1", { kilpailu: "MSC", kausi: "2025" });

    expect(analyticsSectionMock).not.toHaveBeenCalled();
  });

  it("offers no section when the team has no matches this season", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "empty" });

    await renderTeam("1", { kilpailu: "VL", kausi: "2025" });

    expect(analyticsSectionMock).not.toHaveBeenCalled();
  });
});
