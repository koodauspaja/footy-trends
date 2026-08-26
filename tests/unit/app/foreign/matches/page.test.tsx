import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonContext } from "@/lib/football-data";
import type { CupSeasonResult, RoundMatchesResult } from "@/lib/standings-service";

const getSeasonContextMock = vi.fn<() => Promise<SeasonContext>>();
const getMaxMatchdayMock = vi.fn<() => Promise<number | null>>();
const getRoundMatchesMock = vi.fn<() => Promise<RoundMatchesResult>>();
const getCupSeasonMock = vi.fn<() => Promise<CupSeasonResult>>();
const loggerErrorMock = vi.fn();

vi.mock("@/lib/football-data", () => ({
  getSeasonContext: getSeasonContextMock,
}));

vi.mock("@/lib/standings-service", () => ({
  getMaxMatchday: getMaxMatchdayMock,
  getRoundMatches: getRoundMatchesMock,
  getCupSeason: getCupSeasonMock,
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
  spansCalendarYears: true,
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
      kickoffAt: new Date("2025-09-15T14:00:00Z"),
      matchday: 3,
      homeTeamProviderId: 3,
      homeTeamName: "Liverpool FC",
      awayTeamProviderId: 4,
      awayTeamName: "Everton FC",
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
    // The default fixtures are all Premier League, which never takes the cup
    // path; a cup test overrides this.
    getCupSeasonMock.mockResolvedValue({ status: "empty" });
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

function cupMatch(options: {
  id: number;
  stage: string;
  matchday: number | null;
  home: [number, string];
  away: [number, string];
  score?: [number, number];
  kickoffAt?: string;
}) {
  return {
    providerMatchId: options.id,
    competitionCode: "CL",
    seasonId: 2024,
    status: "FINISHED",
    kickoffAt: new Date(options.kickoffAt ?? "2025-04-08T19:00:00Z"),
    matchday: options.matchday,
    stage: options.stage,
    groupName: null,
    homeTeamProviderId: options.home[0],
    homeTeamName: options.home[1],
    awayTeamProviderId: options.away[0],
    awayTeamName: options.away[1],
    homeGoals: options.score?.[0] ?? null,
    awayGoals: options.score?.[1] ?? null,
    regularTimeHome: null,
    regularTimeAway: null,
    extraTimeHome: null,
    extraTimeAway: null,
    penaltiesHome: null,
    penaltiesAway: null,
  };
}

describe("Matches page, cup competitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue(seasonContext);
    getMaxMatchdayMock.mockResolvedValue(5);
    getCupSeasonMock.mockResolvedValue({
      status: "ok",
      matches: [
        cupMatch({
          id: 1,
          stage: "LEAGUE_STAGE",
          matchday: 1,
          home: [1, "Arsenal FC"],
          away: [2, "Inter"],
          score: [2, 0],
          kickoffAt: "2024-09-17T19:00:00Z",
        }),
        cupMatch({
          id: 2,
          stage: "QUARTER_FINALS",
          matchday: 1,
          home: [3, "PSG"],
          away: [4, "Aston Villa FC"],
          score: [3, 1],
        }),
        cupMatch({
          id: 3,
          stage: "QUARTER_FINALS",
          matchday: 2,
          home: [4, "Aston Villa FC"],
          away: [3, "PSG"],
          score: [3, 2],
          kickoffAt: "2025-04-15T19:00:00Z",
        }),
      ],
    });
  });

  it("offers a stage selector instead of a round selector", async () => {
    await renderMatchesPage({ kilpailu: "CL" });

    expect(screen.getByLabelText("Vaihe")).toBeInTheDocument();
    expect(screen.queryByLabelText("Kierros")).not.toBeInTheDocument();
  });

  it("lists the stages in progression order, with Finnish names", async () => {
    await renderMatchesPage({ kilpailu: "CL" });

    const options = within(screen.getByLabelText("Vaihe")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Liigavaihe", "Puolivälierät"]);
  });

  it("defaults to the last stage once the season is complete", async () => {
    await renderMatchesPage({ kilpailu: "CL" });

    expect(
      screen.getByRole("heading", { name: "Mestarien liiga 2025/26, puolivälierät" })
    ).toBeInTheDocument();
    // Both quarter-final legs are listed, so PSG appears twice.
    expect(screen.getAllByText("PSG")).toHaveLength(2);
  });

  it("shows the requested stage and labels knockout matchdays as legs", async () => {
    await renderMatchesPage({ kilpailu: "CL", vaihe: "QUARTER_FINALS" });

    expect(screen.getByText("Osaottelu")).toBeInTheDocument();
    expect(screen.queryByText("Kierros")).not.toBeInTheDocument();
  });

  it("labels the league phase's matchdays as rounds", async () => {
    await renderMatchesPage({ kilpailu: "CL", vaihe: "LEAGUE_STAGE" });

    expect(screen.getByText("Kierros")).toBeInTheDocument();
    expect(screen.queryByText("Osaottelu")).not.toBeInTheDocument();
  });

  it("falls back with a notice when the stage does not exist in this season", async () => {
    await renderMatchesPage({ kilpailu: "CL", vaihe: "LAST_32" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Vaihetta ei löytynyt. Näytetään puolivälierät."
    );
  });

  it("reports an error when the cup season could not be loaded", async () => {
    getCupSeasonMock.mockResolvedValue({ status: "error" });

    await renderMatchesPage({ kilpailu: "CL" });

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Otteluita ei ole saatavilla.")).not.toBeInTheDocument();
  });

  it("shows the empty state, and a heading without a stage, for an empty season", async () => {
    getCupSeasonMock.mockResolvedValue({ status: "empty" });

    await renderMatchesPage({ kilpailu: "CL" });

    expect(screen.getByRole("heading", { name: "Mestarien liiga 2025/26" })).toBeInTheDocument();
    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Vaihe")).not.toBeInTheDocument();
  });

  it("shows no leg column for a single-leg final", () => {
    // One match, one tie: `matchday` is not a leg number, whatever it holds.
    return (async () => {
      getCupSeasonMock.mockResolvedValue({
        status: "ok",
        matches: [
          cupMatch({
            id: 9,
            stage: "FINAL",
            matchday: 0,
            home: [1, "PSG"],
            away: [2, "Inter"],
            score: [5, 0],
            kickoffAt: "2025-05-31T19:00:00Z",
          }),
        ],
      });

      await renderMatchesPage({ kilpailu: "CL" });

      expect(screen.queryByRole("columnheader", { name: "Osaottelu" })).not.toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "Kierros" })).not.toBeInTheDocument();
    })();
  });

  it("shows no leg column when the provider reports no matchday", () => {
    // The World Cup shape: knockout `matchday` is null.
    return (async () => {
      getCupSeasonMock.mockResolvedValue({
        status: "ok",
        matches: [
          cupMatch({
            id: 9,
            stage: "FINAL",
            matchday: null,
            home: [1, "Spain"],
            away: [2, "Argentina"],
            score: [1, 0],
          }),
        ],
      });

      await renderMatchesPage({ kilpailu: "CL" });

      expect(screen.queryByRole("columnheader", { name: "Osaottelu" })).not.toBeInTheDocument();
    })();
  });

  it("blanks the leg cell when a two-legged round has no matchday", () => {
    return (async () => {
      getCupSeasonMock.mockResolvedValue({
        status: "ok",
        matches: [
          cupMatch({
            id: 1,
            stage: "SEMI_FINALS",
            matchday: null,
            home: [1, "A"],
            away: [2, "B"],
            score: [1, 0],
          }),
          cupMatch({
            id: 2,
            stage: "SEMI_FINALS",
            matchday: 0,
            home: [2, "B"],
            away: [1, "A"],
            score: [1, 0],
            kickoffAt: "2025-05-10T19:00:00Z",
          }),
        ],
      });

      await renderMatchesPage({ kilpailu: "CL", vaihe: "SEMI_FINALS" });

      expect(screen.getByRole("columnheader", { name: "Osaottelu" })).toBeInTheDocument();
      const rows = screen.getAllByRole("row").slice(1);
      for (const row of rows) {
        expect(within(row).getAllByRole("cell").at(-1)).toHaveTextContent("");
      }
    })();
  });

  it("blanks the round cell when a group-phase match has no matchday", () => {
    return (async () => {
      getCupSeasonMock.mockResolvedValue({
        status: "ok",
        matches: [
          cupMatch({
            id: 1,
            stage: "GROUP_STAGE",
            matchday: null,
            home: [1, "A"],
            away: [2, "B"],
            score: [1, 0],
          }),
        ],
      });

      await renderMatchesPage({ kilpailu: "CL", vaihe: "GROUP_STAGE" });

      expect(screen.getByRole("columnheader", { name: "Kierros" })).toBeInTheDocument();
      const row = screen.getAllByRole("row")[1];
      expect(row && within(row).getAllByRole("cell").at(-1)).toHaveTextContent("");
    })();
  });

  it("shows the leg column for a genuinely two-legged round", () => {
    return (async () => {
      getCupSeasonMock.mockResolvedValue({
        status: "ok",
        matches: [
          cupMatch({
            id: 1,
            stage: "SEMI_FINALS",
            matchday: 1,
            home: [1, "A"],
            away: [2, "B"],
            score: [1, 0],
          }),
          cupMatch({
            id: 2,
            stage: "SEMI_FINALS",
            matchday: 2,
            home: [2, "B"],
            away: [1, "A"],
            score: [1, 0],
            kickoffAt: "2025-05-10T19:00:00Z",
          }),
        ],
      });

      await renderMatchesPage({ kilpailu: "CL", vaihe: "SEMI_FINALS" });

      expect(screen.getByRole("columnheader", { name: "Osaottelu" })).toBeInTheDocument();
    })();
  });

  it("has no previous/next round links on a cup page", async () => {
    await renderMatchesPage({ kilpailu: "CL" });

    expect(screen.queryByText("◀ Edellinen kierros")).not.toBeInTheDocument();
    expect(screen.queryByText("Seuraava kierros ▶")).not.toBeInTheDocument();
  });
});
