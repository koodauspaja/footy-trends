import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Loading from "@/app/loading";
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

async function renderHome(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { default: Home } = await import("@/app/page");
  render(await Home({ searchParams: Promise.resolve(searchParams) }));
}

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue(seasonContext);
    getStandingsMock.mockResolvedValue(standings);
    getMaxMatchdayMock.mockResolvedValue(10);
  });

  it("shows the Finnish heading, column labels, and calculated standings", async () => {
    await renderHome();

    expect(
      screen.getByRole("heading", {
        name: "Valioliigan sarjataulukko 2025/26",
      })
    ).toBeInTheDocument();
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

  it("links each team name to its team page, carrying the selected season", async () => {
    await renderHome({ kausi: "2024" });

    expect(screen.getByRole("link", { name: "Arsenal FC" })).toHaveAttribute(
      "href",
      "/joukkue/1?kausi=2024"
    );
  });

  it("does not link team names in the empty standings state", async () => {
    getStandingsMock.mockResolvedValue({ status: "empty", standings: [] });

    await renderHome();

    expect(screen.queryByRole("link", { name: "Arsenal FC" })).not.toBeInTheDocument();
  });

  it("links to the season-wide match list for the currently selected season", async () => {
    await renderHome({ kausi: "2024" });

    expect(screen.getByRole("link", { name: "Kaikki ottelut" })).toHaveAttribute(
      "href",
      "/ottelut?kausi=2024"
    );
  });

  it("shows the Kaikki ottelut link regardless of standings status", async () => {
    getStandingsMock.mockResolvedValue({ status: "error", standings: [] });

    await renderHome();

    expect(screen.getByRole("link", { name: "Kaikki ottelut" })).toBeInTheDocument();
  });

  it("does not link team names in the error standings state", async () => {
    getStandingsMock.mockResolvedValue({ status: "error", standings: [] });

    await renderHome();

    expect(screen.queryByRole("link", { name: "Arsenal FC" })).not.toBeInTheDocument();
  });

  it("defaults to the active season without a kausi parameter", async () => {
    await renderHome();

    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2025,
      activeSeasonId: 2025,
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("defaults to the active season when searchParams is not provided", async () => {
    const { default: Home } = await import("@/app/page");
    render(await Home({}));

    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2025,
      activeSeasonId: 2025,
    });
  });

  it("shows the season named by a valid kausi parameter", async () => {
    await renderHome({ kausi: "2023" });

    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2023,
      activeSeasonId: 2025,
    });
    expect(
      screen.getByRole("heading", {
        name: "Valioliigan sarjataulukko 2023/24",
      })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toHaveValue("2023");
  });

  it("falls back to the active season for an unselectable kausi parameter", async () => {
    await renderHome({ kausi: "1999" });

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
    await renderHome({ kausi: "abc" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kautta ei löytynyt. Näytetään kausi 2025/26."
    );
  });

  it("does not show the fallback notice for a valid season", async () => {
    await renderHome({ kausi: "2024" });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("defaults to the whole season without a kierros parameter", async () => {
    await renderHome();

    expect(getStandingsMock).toHaveBeenCalledWith({
      competitionCode: "PL",
      seasonId: 2025,
      activeSeasonId: 2025,
    });
    expect(screen.getByLabelText("Kierros")).toHaveValue("");
  });

  it("shows the round named by a valid kierros parameter", async () => {
    await renderHome({ kierros: "5" });

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

    await renderHome();

    expect(
      Array.from(screen.getByLabelText("Kierros").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toEqual(["Koko kausi", "Kierros 1", "Kierros 2", "Kierros 3"]);
  });

  it("falls back to the whole season for a kierros parameter beyond the highest known matchday", async () => {
    getMaxMatchdayMock.mockResolvedValue(5);

    await renderHome({ kierros: "99" });

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
    await renderHome({ kierros: "abc" });

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

    await renderHome({ kierros: "1" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kierrosta ei löytynyt. Näytetään koko kausi."
    );
    expect(screen.getByLabelText("Kierros").querySelectorAll("option")).toHaveLength(1);
  });

  it("shows both fallback notices when season and round are both invalid", async () => {
    getMaxMatchdayMock.mockResolvedValue(5);

    await renderHome({ kausi: "1999", kierros: "99" });

    const notices = screen.getAllByRole("status");
    expect(notices.map((notice) => notice.textContent)).toEqual([
      "Kautta ei löytynyt. Näytetään kausi 2025/26.",
      "Kierrosta ei löytynyt. Näytetään koko kausi.",
    ]);
  });

  it("keeps the season selector visible in the empty state", async () => {
    getStandingsMock.mockResolvedValue({ status: "empty", standings: [] });

    await renderHome();

    expect(screen.getByText("Sarjataulukkoa ei ole saatavilla.")).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
    expect(screen.getByLabelText("Kierros")).toBeInTheDocument();
  });

  it("keeps the season selector visible in the error state", async () => {
    getStandingsMock.mockResolvedValue({ status: "error", standings: [] });

    await renderHome();

    expect(
      screen.getByText("Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
    expect(screen.getByLabelText("Kierros")).toBeInTheDocument();
  });

  it("shows the error message when the selectable seasons cannot be resolved", async () => {
    getSeasonContextMock.mockRejectedValue(new Error("provider unavailable"));

    await renderHome();

    expect(
      screen.getByText("Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Kausi")).not.toBeInTheDocument();
    expect(getStandingsMock).not.toHaveBeenCalled();
    expect(getMaxMatchdayMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Unable to resolve the selectable seasons"
    );
  });
});

describe("Loading state", () => {
  it("shows the Finnish loading message", () => {
    render(<Loading />);

    expect(screen.getByText("Ladataan sarjataulukkoa...")).toBeInTheDocument();
  });
});
