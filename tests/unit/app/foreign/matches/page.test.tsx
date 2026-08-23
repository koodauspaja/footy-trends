import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonContext } from "@/lib/football-data";
import type { RoundMatchesResult } from "@/lib/standings-service";

const getSeasonContextMock = vi.fn<() => Promise<SeasonContext>>();
const getMaxMatchdayMock = vi.fn<() => Promise<number | null>>();
const getRoundMatchesMock = vi.fn<() => Promise<RoundMatchesResult>>();
const loggerErrorMock = vi.fn();

vi.mock("@/lib/football-data", () => ({
  getSeasonContext: getSeasonContextMock,
}));

vi.mock("@/lib/standings-service", () => ({
  getMaxMatchday: getMaxMatchdayMock,
  getRoundMatches: getRoundMatchesMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerErrorMock },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const seasonContext: SeasonContext = {
  activeSeasonId: 2025,
  selectableSeasons: [
    { seasonId: 2025, label: "2025/26" },
    { seasonId: 2024, label: "2024/25" },
  ],
};

const okResult: RoundMatchesResult = {
  status: "ok",
  round: 3,
  matches: [
    {
      providerMatchId: 1,
      competitionCode: "PL",
      seasonId: 2025,
      status: "FINISHED",
      kickoffAt: new Date("2025-09-14T14:00:00Z"),
      matchday: 3,
      homeTeamProviderId: 1,
      homeTeamName: "Arsenal FC",
      awayTeamProviderId: 2,
      awayTeamName: "Chelsea FC",
      homeGoals: 2,
      awayGoals: 1,
    },
    {
      providerMatchId: 2,
      competitionCode: "PL",
      seasonId: 2025,
      status: "SCHEDULED",
      kickoffAt: new Date("2025-09-15T14:00:00Z"),
      matchday: 3,
      homeTeamProviderId: 3,
      homeTeamName: "Liverpool FC",
      awayTeamProviderId: 4,
      awayTeamName: "Everton FC",
      homeGoals: null,
      awayGoals: null,
    },
  ],
};

async function renderMatchesPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { default: MatchesPage } = await import("@/app/foreign/matches/page");
  return render(await MatchesPage({ searchParams: Promise.resolve(searchParams) }));
}

async function getMetadata(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { generateMetadata } = await import("@/app/foreign/matches/page");
  return generateMetadata({ searchParams: Promise.resolve(searchParams) });
}

describe("Matches page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue(seasonContext);
    getMaxMatchdayMock.mockResolvedValue(5);
    getRoundMatchesMock.mockResolvedValue(okResult);
  });

  it("shows the heading with competition, season label and round, and lists both teams' matches", async () => {
    await renderMatchesPage({ kausi: "2025", kierros: "3" });

    expect(
      screen.getByRole("heading", { name: "Valioliiga 2025/26, kierros 3" })
    ).toBeInTheDocument();
    expect(screen.getByText("Arsenal FC")).toBeInTheDocument();
    expect(screen.getByText("Chelsea FC")).toBeInTheDocument();
    expect(screen.getByText("Liverpool FC")).toBeInTheDocument();
    expect(screen.getByText("Everton FC")).toBeInTheDocument();
  });

  it("shows a different competition's name in the heading and calls getSeasonContext with its code", async () => {
    await renderMatchesPage({ kilpailu: "BL1", kausi: "2025", kierros: "3" });

    expect(getSeasonContextMock).toHaveBeenCalledWith("BL1");
    expect(
      screen.getByRole("heading", { name: "Bundesliga 2025/26, kierros 3" })
    ).toBeInTheDocument();
  });

  it("shows a score for a finished match and a dash for an unplayed one", async () => {
    await renderMatchesPage();

    const finishedRow = screen.getByText("Arsenal FC").closest("tr");
    const unplayedRow = screen.getByText("Liverpool FC").closest("tr");
    if (!finishedRow || !unplayedRow) throw new Error("Expected both match rows to exist");

    expect(within(finishedRow).getAllByRole("cell").at(-1)).toHaveTextContent("2–1");
    expect(within(unplayedRow).getAllByRole("cell").at(-1)).toHaveTextContent("–");
  });

  it("links both team names in a row to their team page, carrying the competition and season", async () => {
    await renderMatchesPage({ kilpailu: "BL1", kausi: "2025" });

    expect(screen.getByRole("link", { name: "Arsenal FC" })).toHaveAttribute(
      "href",
      "/ulkomaat/joukkue/1?kilpailu=BL1&kausi=2025"
    );
    expect(screen.getByRole("link", { name: "Chelsea FC" })).toHaveAttribute(
      "href",
      "/ulkomaat/joukkue/2?kilpailu=BL1&kausi=2025"
    );
  });

  it("calls getRoundMatches with the resolved competition, season, round, and active season", async () => {
    await renderMatchesPage({ kilpailu: "BL1", kausi: "2024", kierros: "3" });

    expect(getRoundMatchesMock).toHaveBeenCalledWith("BL1", 2024, 3, 2025);
  });

  it("shows both round navigation links between the season's first and last round, carrying the competition", async () => {
    await renderMatchesPage({ kilpailu: "BL1", kausi: "2025" });

    expect(screen.getByRole("link", { name: "◀ Edellinen kierros" })).toHaveAttribute(
      "href",
      "/ulkomaat/ottelut?kilpailu=BL1&kausi=2025&kierros=2"
    );
    expect(screen.getByRole("link", { name: "Seuraava kierros ▶" })).toHaveAttribute(
      "href",
      "/ulkomaat/ottelut?kilpailu=BL1&kausi=2025&kierros=4"
    );
  });

  it("omits the previous-round link at the season's first round", async () => {
    getRoundMatchesMock.mockResolvedValue({ ...okResult, round: 1 });

    await renderMatchesPage();

    expect(screen.queryByRole("link", { name: "◀ Edellinen kierros" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Seuraava kierros ▶" })).toBeInTheDocument();
  });

  it("omits the next-round link at the season's last round", async () => {
    getRoundMatchesMock.mockResolvedValue({ ...okResult, round: 5 });

    await renderMatchesPage();

    expect(screen.getByRole("link", { name: "◀ Edellinen kierros" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Seuraava kierros ▶" })).not.toBeInTheDocument();
  });

  it("lists round options 1..N with no whole-season option", async () => {
    await renderMatchesPage();

    expect(
      Array.from(screen.getByLabelText("Kierros").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toEqual(["Kierros 1", "Kierros 2", "Kierros 3", "Kierros 4", "Kierros 5"]);
  });

  it("defaults to Premier League without a kilpailu parameter", async () => {
    await renderMatchesPage();

    expect(getSeasonContextMock).toHaveBeenCalledWith("PL");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("falls back to Premier League with a Finnish banner for an invalid kilpailu", async () => {
    await renderMatchesPage({ kilpailu: "XYZ" });

    expect(getSeasonContextMock).toHaveBeenCalledWith("PL");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Kilpailua ei löytynyt. Näytetään Valioliiga."
    );
  });

  it("falls back to the active season for an unselectable kausi parameter", async () => {
    await renderMatchesPage({ kausi: "1999" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kautta ei löytynyt. Näytetään kausi 2025/26."
    );
    expect(getRoundMatchesMock).toHaveBeenCalledWith("PL", 2025, undefined, 2025);
  });

  it("falls back to the resolved round for an invalid kierros parameter, naming it in the banner", async () => {
    await renderMatchesPage({ kierros: "99" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kierrosta ei löytynyt. Näytetään kierros 3."
    );
    expect(getRoundMatchesMock).toHaveBeenCalledWith("PL", 2025, undefined, 2025);
  });

  it("shows all fallback banners when competition, season, and round are all invalid", async () => {
    await renderMatchesPage({ kilpailu: "XYZ", kausi: "1999", kierros: "99" });

    const notices = screen.getAllByRole("status");
    expect(notices.map((notice) => notice.textContent)).toEqual([
      "Kilpailua ei löytynyt. Näytetään Valioliiga.",
      "Kautta ei löytynyt. Näytetään kausi 2025/26.",
      "Kierrosta ei löytynyt. Näytetään kierros 3.",
    ]);
  });

  it("shows the empty-season message and no round controls when nothing is stored", async () => {
    getMaxMatchdayMock.mockResolvedValue(null);
    getRoundMatchesMock.mockResolvedValue({ status: "empty" });

    await renderMatchesPage();

    expect(screen.getByRole("heading", { name: "Valioliiga" })).toBeInTheDocument();
    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
    expect(screen.queryByLabelText("Kierros")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "◀ Edellinen kierros" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Seuraava kierros ▶" })).not.toBeInTheDocument();
  });

  it("does not show the invalid-round banner when the season has no matches to name a round from", async () => {
    getMaxMatchdayMock.mockResolvedValue(null);
    getRoundMatchesMock.mockResolvedValue({ status: "empty" });

    await renderMatchesPage({ kierros: "5" });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the empty-round message for an in-range round with no matches, keeping controls visible", async () => {
    getRoundMatchesMock.mockResolvedValue({ status: "ok", round: 2, matches: [] });

    await renderMatchesPage({ kierros: "2" });

    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
    expect(screen.getByLabelText("Kierros")).toHaveValue("2");
  });

  it("shows the generic error message when loading matches fails", async () => {
    getRoundMatchesMock.mockResolvedValue({ status: "error" });

    await renderMatchesPage();

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
  });

  it("shows the error message and no season selector when the selectable seasons cannot be resolved", async () => {
    getSeasonContextMock.mockRejectedValue(new Error("provider unavailable"));

    await renderMatchesPage();

    expect(screen.getByRole("heading", { name: "Valioliiga" })).toBeInTheDocument();
    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Kausi")).not.toBeInTheDocument();
    expect(getMaxMatchdayMock).not.toHaveBeenCalled();
    expect(getRoundMatchesMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), competitionCode: "PL" }),
      "Unable to resolve the selectable seasons"
    );
  });

  it("links back to the standings for the current competition, season, and round", async () => {
    await renderMatchesPage({ kilpailu: "BL1", kausi: "2024", kierros: "3" });

    expect(screen.getByRole("link", { name: "Sarjataulukkoon" })).toHaveAttribute(
      "href",
      "/ulkomaat/sarjataulukko?kilpailu=BL1&kausi=2024&kierros=3"
    );
  });

  it("omits the round from the standings link when there is no resolved round", async () => {
    getRoundMatchesMock.mockResolvedValue({ status: "empty" });

    await renderMatchesPage({ kilpailu: "BL1", kausi: "2024" });

    expect(screen.getByRole("link", { name: "Sarjataulukkoon" })).toHaveAttribute(
      "href",
      "/ulkomaat/sarjataulukko?kilpailu=BL1&kausi=2024"
    );
  });

  it("defaults to Premier League, the active season, and current round when searchParams is not provided", async () => {
    const { default: MatchesPage } = await import("@/app/foreign/matches/page");
    render(await MatchesPage({}));

    expect(getRoundMatchesMock).toHaveBeenCalledWith("PL", 2025, undefined, 2025);
  });

  it("sets the browser tab title to the competition and season", async () => {
    expect(await getMetadata()).toEqual({ title: "Valioliiga 2025/26" });
  });

  it("sets the tab title for a different competition", async () => {
    expect(await getMetadata({ kilpailu: "BL1" })).toEqual({ title: "Bundesliga 2025/26" });
  });

  it("sets the tab title to just the competition name when the selectable seasons cannot be resolved", async () => {
    getSeasonContextMock.mockRejectedValue(new Error("provider unavailable"));

    expect(await getMetadata()).toEqual({ title: "Valioliiga" });
  });

  it("sets the tab title for a valid kausi parameter", async () => {
    expect(await getMetadata({ kausi: "2024" })).toEqual({ title: "Valioliiga 2024/25" });
  });

  it("defaults the tab title when searchParams is not provided at all", async () => {
    const { generateMetadata } = await import("@/app/foreign/matches/page");

    expect(await generateMetadata({})).toEqual({ title: "Valioliiga 2025/26" });
  });
});
