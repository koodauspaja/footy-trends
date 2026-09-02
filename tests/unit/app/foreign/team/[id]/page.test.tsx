import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonContext } from "@/lib/football-data";
import type { TeamMatchesResult } from "@/lib/standings-service";
import type { TeamContextResult } from "@/lib/team-context";
import type { TeamSeasonsResult } from "@/lib/team-seasons";

const getSeasonContextMock = vi.fn<() => Promise<SeasonContext>>();
const getTeamMatchesMock = vi.fn<() => Promise<TeamMatchesResult>>();
const loggerErrorMock = vi.fn();

vi.mock("@/lib/football-data", () => ({
  getSeasonContext: getSeasonContextMock,
}));

vi.mock("@/lib/standings-service", () => ({
  getTeamMatches: getTeamMatchesMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerErrorMock },
}));

const TEAM_CONTEXT_COMPETITION = "PL";
const TEAM_CONTEXT_SEASON = 2025;
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

vi.mock("@/lib/team-seasons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/team-seasons")>();
  return { ...actual, getTeamSeasons: getTeamSeasonsMock };
});

vi.mock("@/lib/team-context", () => ({ getTeamContext: getTeamContextMock }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const seasonContext: SeasonContext = {
  activeSeasonId: 2025,
  selectableSeasons: [
    { seasonId: 2025, label: "2025/26" },
    { seasonId: 2024, label: "2024/25" },
  ],
  spansCalendarYears: true,
};

const okResult: TeamMatchesResult = {
  status: "ok",
  matches: [
    {
      providerMatchId: 1,
      competitionCode: "PL",
      seasonId: 2025,
      status: "FINISHED",
      kickoffAt: new Date("2025-08-15T14:00:00Z"),
      matchday: 1,
      homeTeamProviderId: 1,
      homeTeamName: "Arsenal FC",
      awayTeamProviderId: 2,
      awayTeamName: "Chelsea FC",
      homeGoals: 2,
      awayGoals: 1,
      stage: null,
      groupName: null,
      regularTimeHome: null,
      regularTimeAway: null,
      extraTimeHome: null,
      extraTimeAway: null,
      penaltiesHome: null,
      penaltiesAway: null,
    },
    {
      providerMatchId: 2,
      competitionCode: "PL",
      seasonId: 2025,
      status: "SCHEDULED",
      kickoffAt: new Date("2025-08-22T14:00:00Z"),
      matchday: 2,
      homeTeamProviderId: 3,
      homeTeamName: "Liverpool FC",
      awayTeamProviderId: 1,
      awayTeamName: "Arsenal FC",
      homeGoals: null,
      awayGoals: null,
      stage: null,
      groupName: null,
      regularTimeHome: null,
      regularTimeAway: null,
      extraTimeHome: null,
      extraTimeAway: null,
      penaltiesHome: null,
      penaltiesAway: null,
    },
  ],
};

async function renderTeamPage(
  id = "1",
  searchParams: Record<string, string | string[] | undefined> = {}
) {
  const { default: TeamPage } = await import("@/app/foreign/team/[id]/page");
  return render(
    await TeamPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    })
  );
}

async function getMetadata(
  id = "1",
  searchParams: Record<string, string | string[] | undefined> = {}
) {
  const { generateMetadata } = await import("@/app/foreign/team/[id]/page");
  return generateMetadata({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(searchParams),
  });
}

describe("Team page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTeamSeasonsMock.mockResolvedValue({ status: "not_found" });
    getTeamContextMock.mockImplementation(defaultTeamContext);
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue(seasonContext);
    getTeamMatchesMock.mockResolvedValue(okResult);
  });

  it("shows the team heading with the season label, and lists played and upcoming matches", async () => {
    await renderTeamPage("1", { kausi: "2025" });

    expect(
      screen.getByRole("heading", { name: "Arsenal FC – Valioliiga 2025/26" })
    ).toBeInTheDocument();
    expect(screen.getByText("Arsenal FC – Chelsea FC")).toBeInTheDocument();
    expect(screen.getByText("2–1")).toBeInTheDocument();
    expect(screen.getByText("Liverpool FC – Arsenal FC")).toBeInTheDocument();
  });

  it("shows the selected competition's name in the heading", async () => {
    await renderTeamPage("1", { kilpailu: "BL1", kausi: "2025" });

    expect(
      screen.getByRole("heading", { name: "Arsenal FC – Bundesliga 2025/26" })
    ).toBeInTheDocument();
  });

  it("shows a dash instead of a score for a not-yet-played match", async () => {
    await renderTeamPage("1", { kausi: "2025" });

    const rows = screen.getAllByRole("row");
    const upcomingRow = rows.find((row) => row.textContent?.includes("Liverpool FC"));
    expect(upcomingRow).toHaveTextContent("–");
  });

  it("derives the team name from the home side when the team's first match is at home", async () => {
    await renderTeamPage("1", { kausi: "2025" });

    expect(
      screen.getByRole("heading", { name: "Arsenal FC – Valioliiga 2025/26" })
    ).toBeInTheDocument();
  });

  it("derives the team name from the away side when the team's first match is away", async () => {
    getTeamMatchesMock.mockResolvedValue({
      status: "ok",
      matches: [
        {
          providerMatchId: 2,
          competitionCode: "PL",
          seasonId: 2025,
          status: "SCHEDULED",
          kickoffAt: new Date("2025-08-22T14:00:00Z"),
          matchday: 2,
          homeTeamProviderId: 3,
          homeTeamName: "Liverpool FC",
          awayTeamProviderId: 1,
          awayTeamName: "Arsenal FC",
          homeGoals: null,
          awayGoals: null,
          stage: null,
          groupName: null,
          regularTimeHome: null,
          regularTimeAway: null,
          extraTimeHome: null,
          extraTimeAway: null,
          penaltiesHome: null,
          penaltiesAway: null,
        },
      ],
    });

    await renderTeamPage("1", { kausi: "2025" });

    expect(
      screen.getByRole("heading", { name: "Arsenal FC – Valioliiga 2025/26" })
    ).toBeInTheDocument();
  });

  it("leaves the round cell blank when the matchday is unknown", async () => {
    getTeamMatchesMock.mockResolvedValue({
      status: "ok",
      matches: [
        {
          providerMatchId: 1,
          competitionCode: "PL",
          seasonId: 2025,
          status: "FINISHED",
          kickoffAt: new Date("2025-08-15T14:00:00Z"),
          matchday: null,
          homeTeamProviderId: 1,
          homeTeamName: "Arsenal FC",
          awayTeamProviderId: 2,
          awayTeamName: "Chelsea FC",
          homeGoals: 2,
          awayGoals: 1,
          stage: null,
          groupName: null,
          regularTimeHome: null,
          regularTimeAway: null,
          extraTimeHome: null,
          extraTimeAway: null,
          penaltiesHome: null,
          penaltiesAway: null,
        },
      ],
    });

    await renderTeamPage("1", { kausi: "2025" });

    const rows = screen.getAllByRole("row");
    const matchRow = rows.find((row) => row.textContent?.includes("Chelsea FC"));
    const cells = matchRow?.querySelectorAll("td") ?? [];
    expect(cells[cells.length - 1]).toHaveTextContent("");
  });

  it("defaults to Premier League and the active season when searchParams is not provided at all", async () => {
    const { default: TeamPage } = await import("@/app/foreign/team/[id]/page");
    render(await TeamPage({ params: Promise.resolve({ id: "1" }) }));

    expect(getSeasonContextMock).toHaveBeenCalledWith("PL");
    expect(getTeamMatchesMock).toHaveBeenCalledWith("PL", 1, 2025, 2025);
  });

  it("renders the season selector and calls getTeamMatches with the resolved competition and season", async () => {
    await renderTeamPage("1", { kilpailu: "BL1", kausi: "2024" });

    expect(screen.getByLabelText("Kausi")).toHaveValue("2024");
    expect(getSeasonContextMock).toHaveBeenCalledWith("BL1");
    expect(getTeamMatchesMock).toHaveBeenCalledWith("BL1", 1, 2024, 2025);
  });

  it("submits the season selector as a plain GET form targeting the public /ulkomaat/joukkue/:id URL, carrying kilpailu", async () => {
    const { container } = await renderTeamPage("1", { kilpailu: "BL1" });
    const form = container.querySelector("form");

    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/ulkomaat/joukkue/1");
    expect(form?.querySelector('input[type="hidden"][name="kilpailu"]')).toHaveValue("BL1");
  });

  it("defaults to Premier League without a kilpailu parameter", async () => {
    await renderTeamPage("1");

    expect(getSeasonContextMock).toHaveBeenCalledWith("PL");
    expect(getTeamMatchesMock).toHaveBeenCalledWith("PL", 1, 2025, 2025);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("falls back to Premier League with a Finnish banner for an invalid kilpailu", async () => {
    await renderTeamPage("1", { kilpailu: "XYZ" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kilpailua ei löytynyt. Näytetään Valioliiga."
    );
    expect(getSeasonContextMock).toHaveBeenCalledWith("PL");
  });

  it("defaults to the active season without a kausi parameter", async () => {
    await renderTeamPage("1");

    expect(getTeamMatchesMock).toHaveBeenCalledWith("PL", 1, 2025, 2025);
  });

  it("falls back to the active season for an invalid kausi parameter", async () => {
    await renderTeamPage("1", { kausi: "1999" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kautta ei löytynyt. Näytetään kausi 2025/26."
    );
    expect(getTeamMatchesMock).toHaveBeenCalledWith("PL", 1, 2025, 2025);
  });

  it("shows the not-found message and the competition name as heading for an unknown team id", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });

    await renderTeamPage("999");

    expect(screen.getByRole("heading", { name: "Valioliiga" })).toBeInTheDocument();
    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
  });

  it("shows the team's own competition when the URL names none", async () => {
    // A bare URL used to mean "Premier League, active season", which served 20
    // of 315 stored football-data team ids. See specs/020.
    getTeamContextMock.mockResolvedValue({
      status: "ok",
      context: { competitionCode: "BL1", seasonId: 2024 },
    });

    await renderTeamPage("721");

    expect(getTeamMatchesMock).toHaveBeenCalledWith("BL1", 721, 2024, 2025);
    expect(screen.getByRole("link", { name: "Sarjataulukkoon" })).toHaveAttribute(
      "href",
      "/ulkomaat/sarjataulukko?kilpailu=BL1&kausi=2024"
    );
  });

  it("fills in the season from the team's newest match in a competition the URL names", async () => {
    getTeamContextMock.mockResolvedValue({
      status: "ok",
      context: { competitionCode: "ELC", seasonId: 2023 },
    });

    await renderTeamPage("721", { kilpailu: "ELC" });

    expect(getTeamMatchesMock).toHaveBeenCalledWith("ELC", 721, 2023, 2025);
  });

  it("shows the error state rather than an unknown team when the lookup fails", async () => {
    getTeamContextMock.mockResolvedValue({ status: "error" });

    await renderTeamPage("721");

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Joukkuetta ei löytynyt.")).not.toBeInTheDocument();
  });

  it("says where a relegated club played instead of calling it unknown", async () => {
    // Burnley: Premier League 2023, Championship 2024, back up in 2025.
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });
    getTeamSeasonsMock.mockResolvedValue({
      status: "ok",
      teamName: "Burnley FC",
      seasons: [
        { competitionCode: "PL", seasonId: 2025, matches: 38 },
        { competitionCode: "ELC", seasonId: 2024, matches: 46 },
      ],
    });

    await renderTeamPage("328", { kilpailu: "PL", kausi: "2024" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Burnley FC");
    expect(
      screen.getByText("Joukkue ei pelannut tässä sarjassa tällä kaudella.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Championship" })).toHaveAttribute(
      "href",
      "/ulkomaat/joukkue/328?kilpailu=ELC&kausi=2024"
    );
  });

  it("offers the club's own seasons, labelled as the competition labels them", async () => {
    getTeamSeasonsMock.mockResolvedValue({
      status: "ok",
      teamName: "Burnley FC",
      seasons: [
        { competitionCode: "PL", seasonId: 2025, matches: 38 },
        { competitionCode: "ELC", seasonId: 2024, matches: 46 },
      ],
    });

    await renderTeamPage("328", { kilpailu: "PL", kausi: "2025" });

    const options = [...screen.getByLabelText("Kausi").querySelectorAll("option")].map(
      (option) => option.textContent
    );
    expect(options).toEqual(["2025/26", "2024/25"]);
  });

  it("shows the reduced not-found page for a non-numeric team id, and queries nothing", async () => {
    await renderTeamPage("abc");

    // The page used to name Valioliiga and offer its standings link to a team
    // that does not exist. See specs/020-context-free-team-page.md.
    expect(screen.getByRole("heading", { level: 1, name: "Joukkue" })).toBeInTheDocument();
    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
    expect(getTeamMatchesMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Kausi")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sarjataulukkoon" })).not.toBeInTheDocument();
  });

  it("links back to the standings for the current competition and season", async () => {
    await renderTeamPage("1", { kilpailu: "BL1", kausi: "2024" });

    expect(screen.getByRole("link", { name: "Sarjataulukkoon" })).toHaveAttribute(
      "href",
      "/ulkomaat/sarjataulukko?kilpailu=BL1&kausi=2024"
    );
  });

  it("shows the standings link for an unknown team id", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });

    await renderTeamPage("999", { kilpailu: "BL1", kausi: "2024" });

    expect(screen.getByRole("link", { name: "Sarjataulukkoon" })).toHaveAttribute(
      "href",
      "/ulkomaat/sarjataulukko?kilpailu=BL1&kausi=2024"
    );
  });

  it("shows the empty-season message when the team has no stored matches", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "empty" });

    await renderTeamPage("1");

    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
  });

  it("shows the generic error message when loading the team's matches fails", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "error" });

    await renderTeamPage("1");

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
  });

  it("shows the error message and no season selector when the selectable seasons cannot be resolved", async () => {
    getSeasonContextMock.mockRejectedValue(new Error("provider unavailable"));

    await renderTeamPage("1");

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Kausi")).not.toBeInTheDocument();
    expect(getTeamMatchesMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), competitionCode: "PL" }),
      "Unable to resolve the selectable seasons"
    );
  });

  it("sets the browser tab title to the team, competition, and season", async () => {
    expect(await getMetadata("1", { kausi: "2025" })).toEqual({
      title: "Arsenal FC – Valioliiga 2025/26",
    });
  });

  it("sets the tab title for a different competition", async () => {
    expect(await getMetadata("1", { kilpailu: "BL1", kausi: "2025" })).toEqual({
      title: "Arsenal FC – Bundesliga 2025/26",
    });
  });

  it("sets the tab title to just the competition name for an unknown team id", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });

    expect(await getMetadata("999")).toEqual({ title: "Valioliiga" });
  });

  it("titles a page with no team after the not-found message", async () => {
    expect(await getMetadata("abc")).toEqual({ title: "Joukkuetta ei löytynyt." });
    expect(getTeamMatchesMock).not.toHaveBeenCalled();
  });

  it("sets the tab title to just the competition name for an ok result with no matches", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "ok", matches: [] });

    expect(await getMetadata("1")).toEqual({ title: "Valioliiga" });
  });

  it("derives the tab title's team name from the away side when the team's first match is away", async () => {
    getTeamMatchesMock.mockResolvedValue({
      status: "ok",
      matches: [
        {
          providerMatchId: 2,
          competitionCode: "PL",
          seasonId: 2025,
          status: "SCHEDULED",
          kickoffAt: new Date("2025-08-22T14:00:00Z"),
          matchday: 2,
          homeTeamProviderId: 3,
          homeTeamName: "Liverpool FC",
          awayTeamProviderId: 1,
          awayTeamName: "Arsenal FC",
          homeGoals: null,
          awayGoals: null,
          stage: null,
          groupName: null,
          regularTimeHome: null,
          regularTimeAway: null,
          extraTimeHome: null,
          extraTimeAway: null,
          penaltiesHome: null,
          penaltiesAway: null,
        },
      ],
    });

    expect(await getMetadata("1", { kausi: "2025" })).toEqual({
      title: "Arsenal FC – Valioliiga 2025/26",
    });
  });

  it("sets the tab title to just the competition name when the selectable seasons cannot be resolved", async () => {
    getSeasonContextMock.mockRejectedValue(new Error("provider unavailable"));

    expect(await getMetadata("1")).toEqual({ title: "Valioliiga" });
  });

  it("sets the tab title for a valid kausi parameter", async () => {
    expect(await getMetadata("1", { kausi: "2024" })).toEqual({
      title: "Arsenal FC – Valioliiga 2024/25",
    });
  });

  it("defaults the tab title when searchParams is not provided at all", async () => {
    const { generateMetadata } = await import("@/app/foreign/team/[id]/page");

    expect(await generateMetadata({ params: Promise.resolve({ id: "1" }) })).toEqual({
      title: "Arsenal FC – Valioliiga 2025/26",
    });
  });
});
