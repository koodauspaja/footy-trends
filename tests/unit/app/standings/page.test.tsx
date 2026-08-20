import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonContext } from "@/lib/football-data";
import type { StandingsResult } from "@/lib/standings-service";

const getStandingsMock = vi.fn<() => Promise<StandingsResult>>();
const getMaxMatchdayMock = vi.fn<() => Promise<number | null>>();
const getSeasonContextMock = vi.fn<() => Promise<SeasonContext>>();
const loggerErrorMock = vi.fn();

vi.mock("@/lib/standings-service", () => ({
  getStandings: getStandingsMock,
  getMaxMatchday: getMaxMatchdayMock,
}));

vi.mock("@/lib/football-data", () => ({
  getSeasonContext: getSeasonContextMock,
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
    { seasonId: 2023, label: "2023/24" },
  ],
};

const standings: StandingsResult = {
  status: "ok",
  standings: [
    {
      position: 1,
      teamProviderId: 1,
      teamName: "Arsenal FC",
      played: 3,
      won: 2,
      drawn: 1,
      lost: 0,
      goalsFor: 5,
      goalsAgainst: 2,
      goalDifference: 3,
      points: 7,
      form: [
        { matchId: 1, result: "V", label: "Voitto" },
        { matchId: 2, result: "T", label: "Tasapeli" },
      ],
    },
  ],
};

async function renderStandings(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { default: StandingsPage } = await import("@/app/standings/page");
  render(await StandingsPage({ searchParams: Promise.resolve(searchParams) }));
}

async function getMetadata(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { generateMetadata } = await import("@/app/standings/page");
  return generateMetadata({ searchParams: Promise.resolve(searchParams) });
}

describe("Standings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue(seasonContext);
    getStandingsMock.mockResolvedValue(standings);
    getMaxMatchdayMock.mockResolvedValue(10);
  });

  it("shows the Finnish heading, column labels, and calculated standings", async () => {
    await renderStandings();

    expect(screen.getByRole("heading", { name: "Valioliiga 2025/26" })).toBeInTheDocument();
    expect(screen.getByTitle("Ottelut")).toBeInTheDocument();
    expect(screen.getByTitle("Voitot")).toBeInTheDocument();
    expect(screen.getByTitle("Tasapelit")).toBeInTheDocument();
    expect(screen.getByTitle("Häviöt")).toBeInTheDocument();
    expect(screen.getByText("Arsenal FC")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByLabelText("Voitto, Tasapeli")).toBeInTheDocument();
    expect(
      screen.getByText(
        "O = ottelut, V = voitot, T = tasapelit, H = häviöt, TM = tehdyt maalit, PM = päästetyt maalit, ME = maaliero, P = pisteet."
      )
    ).toBeInTheDocument();
  });

  it("shows a zero-stats row and an empty Vire cell for a team with no finished matches", async () => {
    getStandingsMock.mockResolvedValue({
      status: "ok",
      standings: [
        ...standings.standings,
        {
          position: 2,
          teamProviderId: 2,
          teamName: "Brighton FC",
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
          form: [],
        },
      ],
    });

    await renderStandings();

    const row = screen.getByText("Brighton FC").closest("tr");
    if (!row) throw new Error("Expected the Brighton FC row to exist");

    const [positionCell, ...rest] = within(row).getAllByRole("cell");
    const formCell = rest.at(-1);
    const statCells = rest.slice(0, -1);

    expect(positionCell).toHaveTextContent("2");
    for (const cell of statCells) {
      expect(cell).toHaveTextContent("0");
    }
    expect(formCell).toHaveTextContent("");
  });

  it("shows a different competition's heading and calls getSeasonContext with its code", async () => {
    await renderStandings({ kilpailu: "BL1" });

    expect(getSeasonContextMock).toHaveBeenCalledWith("BL1");
    expect(screen.getByRole("heading", { name: "Bundesliga 2025/26" })).toBeInTheDocument();
  });

  it("defaults to Premier League without a kilpailu parameter", async () => {
    await renderStandings();

    expect(getSeasonContextMock).toHaveBeenCalledWith("PL");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("falls back to Premier League with a Finnish banner for an invalid kilpailu", async () => {
    await renderStandings({ kilpailu: "XYZ" });

    expect(getSeasonContextMock).toHaveBeenCalledWith("PL");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Kilpailua ei löytynyt. Näytetään Valioliiga."
    );
  });

  it("shows the Kilpailu selector preselected to the current competition", async () => {
    await renderStandings({ kilpailu: "BL1" });

    expect(screen.getByLabelText("Kilpailu")).toHaveValue("BL1");
  });

  it("links each team name to its team page, carrying the selected competition and season", async () => {
    await renderStandings({ kilpailu: "BL1", kausi: "2024" });

    expect(screen.getByRole("link", { name: "Arsenal FC" })).toHaveAttribute(
      "href",
      "/joukkue/1?kilpailu=BL1&kausi=2024"
    );
  });

  it("does not link team names in the empty standings state", async () => {
    getStandingsMock.mockResolvedValue({ status: "empty", standings: [] });

    await renderStandings();

    expect(screen.queryByRole("link", { name: "Arsenal FC" })).not.toBeInTheDocument();
  });

  it("links to the season-wide match list, carrying the selected competition and season", async () => {
    await renderStandings({ kilpailu: "BL1", kausi: "2024" });

    expect(screen.getByRole("link", { name: "Kaikki ottelut" })).toHaveAttribute(
      "href",
      "/ottelut?kilpailu=BL1&kausi=2024"
    );
  });

  it("carries the selected round into the season-wide match list link", async () => {
    await renderStandings({ kilpailu: "BL1", kausi: "2024", kierros: "5" });

    expect(screen.getByRole("link", { name: "Kaikki ottelut" })).toHaveAttribute(
      "href",
      "/ottelut?kilpailu=BL1&kausi=2024&kierros=5"
    );
  });

  it("shows the Kaikki ottelut link regardless of standings status", async () => {
    getStandingsMock.mockResolvedValue({ status: "error", standings: [] });

    await renderStandings();

    expect(screen.getByRole("link", { name: "Kaikki ottelut" })).toBeInTheDocument();
  });

  it("does not link team names in the error standings state", async () => {
    getStandingsMock.mockResolvedValue({ status: "error", standings: [] });

    await renderStandings();

    expect(screen.queryByRole("link", { name: "Arsenal FC" })).not.toBeInTheDocument();
  });

  it("defaults to the active season without a kausi parameter", async () => {
    await renderStandings();

    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2025,
      activeSeasonId: 2025,
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("defaults to the active season when searchParams is not provided", async () => {
    const { default: StandingsPage } = await import("@/app/standings/page");
    render(await StandingsPage({}));

    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2025,
      activeSeasonId: 2025,
    });
  });

  it("shows the season named by a valid kausi parameter", async () => {
    await renderStandings({ kausi: "2023" });

    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2023,
      activeSeasonId: 2025,
    });
    expect(screen.getByRole("heading", { name: "Valioliiga 2023/24" })).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toHaveValue("2023");
  });

  it("falls back to the active season for an unselectable kausi parameter", async () => {
    await renderStandings({ kausi: "1999" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kautta ei löytynyt. Näytetään kausi 2025/26."
    );
    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2025,
      activeSeasonId: 2025,
    });
  });

  it("falls back to the active season for a non-numeric kausi parameter", async () => {
    await renderStandings({ kausi: "abc" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kautta ei löytynyt. Näytetään kausi 2025/26."
    );
  });

  it("does not show the fallback notice for a valid season", async () => {
    await renderStandings({ kausi: "2024" });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("defaults to the whole season without a kierros parameter", async () => {
    await renderStandings();

    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2025,
      activeSeasonId: 2025,
    });
    expect(screen.getByLabelText("Kierros")).toHaveValue("");
  });

  it("shows the round named by a valid kierros parameter", async () => {
    await renderStandings({ kierros: "5" });

    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2025,
      activeSeasonId: 2025,
      round: 5,
    });
    expect(screen.getByLabelText("Kierros")).toHaveValue("5");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lists round options up to the season's highest known matchday", async () => {
    getMaxMatchdayMock.mockResolvedValue(3);

    await renderStandings();

    expect(
      Array.from(screen.getByLabelText("Kierros").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toEqual(["Koko kausi", "Kierros 1", "Kierros 2", "Kierros 3"]);
  });

  it("falls back to the whole season for a kierros parameter beyond the highest known matchday", async () => {
    getMaxMatchdayMock.mockResolvedValue(5);

    await renderStandings({ kierros: "99" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kierrosta ei löytynyt. Näytetään koko kausi."
    );
    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2025,
      activeSeasonId: 2025,
    });
    expect(screen.getByLabelText("Kierros")).toHaveValue("");
  });

  it("falls back to the whole season for a non-numeric kierros parameter", async () => {
    await renderStandings({ kierros: "abc" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kierrosta ei löytynyt. Näytetään koko kausi."
    );
    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2025,
      activeSeasonId: 2025,
    });
  });

  it("falls back to the whole season when no matches are stored for the season yet", async () => {
    getMaxMatchdayMock.mockResolvedValue(null);

    await renderStandings({ kierros: "1" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kierrosta ei löytynyt. Näytetään koko kausi."
    );
    expect(screen.getByLabelText("Kierros").querySelectorAll("option")).toHaveLength(1);
  });

  it("shows all three fallback notices when competition, season, and round are all invalid", async () => {
    getMaxMatchdayMock.mockResolvedValue(5);

    await renderStandings({ kilpailu: "XYZ", kausi: "1999", kierros: "99" });

    const notices = screen.getAllByRole("status");
    expect(notices.map((notice) => notice.textContent)).toEqual([
      "Kilpailua ei löytynyt. Näytetään Valioliiga.",
      "Kautta ei löytynyt. Näytetään kausi 2025/26.",
      "Kierrosta ei löytynyt. Näytetään koko kausi.",
    ]);
  });

  it("keeps the selectors visible in the empty state", async () => {
    getStandingsMock.mockResolvedValue({ status: "empty", standings: [] });

    await renderStandings();

    expect(screen.getByText("Sarjataulukkoa ei ole saatavilla.")).toBeInTheDocument();
    expect(screen.getByLabelText("Kilpailu")).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
    expect(screen.getByLabelText("Kierros")).toBeInTheDocument();
  });

  it("keeps the selectors visible in the error state", async () => {
    getStandingsMock.mockResolvedValue({ status: "error", standings: [] });

    await renderStandings();

    expect(
      screen.getByText("Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kilpailu")).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
    expect(screen.getByLabelText("Kierros")).toBeInTheDocument();
  });

  it("shows the error message and no selectors when the selectable seasons cannot be resolved", async () => {
    getSeasonContextMock.mockRejectedValue(new Error("provider unavailable"));

    await renderStandings();

    expect(
      screen.getByText("Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Valioliiga" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Kausi")).not.toBeInTheDocument();
    expect(getStandingsMock).not.toHaveBeenCalled();
    expect(getMaxMatchdayMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), competitionCode: "PL" }),
      "Unable to resolve the selectable seasons"
    );
  });

  it("sets the browser tab title to match the heading", async () => {
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
    expect(await getMetadata({ kausi: "2023" })).toEqual({ title: "Valioliiga 2023/24" });
  });

  it("defaults the tab title when searchParams is not provided at all", async () => {
    const { generateMetadata } = await import("@/app/standings/page");

    expect(await generateMetadata({})).toEqual({ title: "Valioliiga 2025/26" });
  });
});
