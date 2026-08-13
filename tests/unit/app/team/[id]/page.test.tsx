import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonContext } from "@/lib/football-data";
import type { TeamMatchesResult } from "@/lib/standings-service";

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
    },
  ],
};

async function renderTeamPage(
  id = "1",
  searchParams: Record<string, string | string[] | undefined> = {}
) {
  const { default: TeamPage } = await import("@/app/team/[id]/page");
  return render(
    await TeamPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    })
  );
}

describe("Team page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue(seasonContext);
    getTeamMatchesMock.mockResolvedValue(okResult);
  });

  it("shows the team heading with the season label, and lists played and upcoming matches", async () => {
    await renderTeamPage("1", { kausi: "2025" });

    expect(screen.getByRole("heading", { name: "Arsenal FC 2025/26" })).toBeInTheDocument();
    expect(screen.getByText("Arsenal FC – Chelsea FC")).toBeInTheDocument();
    expect(screen.getByText("2–1")).toBeInTheDocument();
    expect(screen.getByText("Liverpool FC – Arsenal FC")).toBeInTheDocument();
  });

  it("shows a dash instead of a score for a not-yet-played match", async () => {
    await renderTeamPage("1", { kausi: "2025" });

    const rows = screen.getAllByRole("row");
    const upcomingRow = rows.find((row) => row.textContent?.includes("Liverpool FC"));
    expect(upcomingRow).toHaveTextContent("–");
  });

  it("derives the team name from the home side when the team's first match is at home", async () => {
    await renderTeamPage("1", { kausi: "2025" });

    expect(screen.getByRole("heading", { name: "Arsenal FC 2025/26" })).toBeInTheDocument();
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
        },
      ],
    });

    await renderTeamPage("1", { kausi: "2025" });

    expect(screen.getByRole("heading", { name: "Arsenal FC 2025/26" })).toBeInTheDocument();
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
        },
      ],
    });

    await renderTeamPage("1", { kausi: "2025" });

    const rows = screen.getAllByRole("row");
    const matchRow = rows.find((row) => row.textContent?.includes("Chelsea FC"));
    const cells = matchRow?.querySelectorAll("td") ?? [];
    expect(cells[cells.length - 1]).toHaveTextContent("");
  });

  it("defaults to the active season when searchParams is not provided at all", async () => {
    const { default: TeamPage } = await import("@/app/team/[id]/page");
    render(await TeamPage({ params: Promise.resolve({ id: "1" }) }));

    expect(getTeamMatchesMock).toHaveBeenCalledWith(1, 2025, 2025);
  });

  it("renders the season selector and calls getTeamMatches with the resolved season", async () => {
    await renderTeamPage("1", { kausi: "2024" });

    expect(screen.getByLabelText("Kausi")).toHaveValue("2024");
    expect(getTeamMatchesMock).toHaveBeenCalledWith(1, 2024, 2025);
  });

  it("submits the season selector as a plain GET form targeting the public /joukkue/:id URL", async () => {
    const { container } = await renderTeamPage("1");
    const form = container.querySelector("form");

    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/joukkue/1");
  });

  it("defaults to the active season without a kausi parameter", async () => {
    await renderTeamPage("1");

    expect(getTeamMatchesMock).toHaveBeenCalledWith(1, 2025, 2025);
  });

  it("falls back to the active season for an invalid kausi parameter", async () => {
    await renderTeamPage("1", { kausi: "1999" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kautta ei löytynyt. Näytetään kausi 2025/26."
    );
    expect(getTeamMatchesMock).toHaveBeenCalledWith(1, 2025, 2025);
  });

  it("shows the not-found message and generic heading for an unknown team id", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });

    await renderTeamPage("999");

    expect(screen.getByRole("heading", { name: "Joukkueen ottelut" })).toBeInTheDocument();
    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
  });

  it("shows the not-found message for a non-numeric team id without querying matches or a season selector", async () => {
    await renderTeamPage("abc");

    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
    expect(getTeamMatchesMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Kausi")).not.toBeInTheDocument();
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
      screen.getByText("Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
  });

  it("shows the error message and no season selector when the selectable seasons cannot be resolved", async () => {
    getSeasonContextMock.mockRejectedValue(new Error("provider unavailable"));

    await renderTeamPage("1");

    expect(
      screen.getByText("Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Kausi")).not.toBeInTheDocument();
    expect(getTeamMatchesMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Unable to resolve the selectable seasons"
    );
  });
});
