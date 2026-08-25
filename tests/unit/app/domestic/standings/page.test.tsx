import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedTasoMatch } from "@/lib/taso";
import type { GroupStandingsResult, SeasonStandingsResult } from "@/lib/taso-standings-service";

const listSeasonRoundsMock = vi.fn<() => Promise<number[]>>();
const getSeasonCategoryNameMock = vi.fn<() => Promise<string | null>>();
const getSeasonStandingsMock = vi.fn<() => Promise<SeasonStandingsResult>>();

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
    listSeasonRounds: listSeasonRoundsMock,
    getSeasonCategoryName: getSeasonCategoryNameMock,
    getSeasonStandings: getSeasonStandingsMock,
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

const ownCalculatedGroup: GroupStandingsResult = {
  kind: "own-calculated",
  groupId: 1,
  groupName: "Runkosarja",
  standings: [
    {
      position: 1,
      teamProviderId: 1,
      teamName: "HJK",
      played: 3,
      won: 2,
      drawn: 1,
      lost: 0,
      goalsFor: 5,
      goalsAgainst: 2,
      goalDifference: 3,
      points: 7,
      form: [{ matchId: 1, result: "V", label: "Voitto" }],
    },
  ],
};

async function renderStandings(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { default: DomesticStandingsPage } = await import("@/app/domestic/standings/page");
  render(await DomesticStandingsPage({ searchParams: Promise.resolve(searchParams) }));
}

async function getMetadata(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { generateMetadata } = await import("@/app/domestic/standings/page");
  return generateMetadata({ searchParams: Promise.resolve(searchParams) });
}

describe("Domestic standings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSeasonRoundsMock.mockResolvedValue([1, 2]);
    getSeasonCategoryNameMock.mockResolvedValue(null);
    getSeasonStandingsMock.mockResolvedValue({ status: "ok", groups: [ownCalculatedGroup] });
  });

  it("shows the Finnish heading and calculated standings for the default (latest) season", async () => {
    await renderStandings();

    expect(screen.getByRole("heading", { name: "Veikkausliiga 2026" })).toBeInTheDocument();
    expect(getSeasonStandingsMock).toHaveBeenCalledWith("VL", "spljp26", 2026, 2026, undefined);
    expect(screen.getByText("HJK")).toBeInTheDocument();
    expect(screen.getByText("Runkosarja")).toBeInTheDocument();
  });

  it("resolves a valid kausi param to its own competition_id", async () => {
    await renderStandings({ kausi: "2015" });

    expect(listSeasonRoundsMock).toHaveBeenCalledWith("VL", "spljp15", 2015, 2026);
    expect(getSeasonStandingsMock).toHaveBeenCalledWith("VL", "spljp15", 2015, 2026, undefined);
    expect(screen.getByRole("heading", { name: "Veikkausliiga 2015" })).toBeInTheDocument();
  });

  it("shows a fallback notice for an invalid kausi param", async () => {
    await renderStandings({ kausi: "1999" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kautta ei löytynyt. Näytetään kausi 2026."
    );
  });

  it("renders every group TASO returns, in the order the service already sorted them", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [
        ownCalculatedGroup,
        { ...ownCalculatedGroup, groupId: 2, groupName: "Mestaruussarja" },
      ],
    });

    await renderStandings();

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Runkosarja", "Mestaruussarja"]);
  });

  it('displays the 2015/2018 fallback group_name "1" as "Runkosarja"', async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [{ ...ownCalculatedGroup, groupName: "1" }],
    });

    await renderStandings();

    expect(screen.getByRole("heading", { level: 2, name: "Runkosarja" })).toBeInTheDocument();
  });

  it('renders a pass-through group\'s null stat fields as "–" instead of crashing or printing null', async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [
        {
          kind: "pass-through",
          groupId: 4,
          groupName: "Eurolopputurnaus",
          standings: [
            {
              position: 1,
              teamProviderId: 1,
              teamName: "HJK",
              played: null,
              won: null,
              drawn: null,
              lost: null,
              goalsFor: null,
              goalsAgainst: null,
              goalDifference: null,
              points: null,
              form: [],
            },
          ],
        },
      ],
    });

    await renderStandings();

    const row = screen.getByText("HJK").closest("tr");
    if (!row) throw new Error("Expected the HJK row to exist");
    const cells = within(row).getAllByRole("cell");
    // First cell is "Sija" (position), last is "Vire" (always empty for a
    // pass-through group — no per-match data to derive form from); every
    // stat cell in between is "–" for a null field.
    const statCells = cells.slice(1, -1);
    expect(statCells).toHaveLength(8);
    expect(statCells.every((cell) => cell.textContent === "–")).toBe(true);
    expect(cells.at(-1)).toHaveTextContent("");
  });

  it("does not link a pass-through team's name to a team page (teamProviderId defaults to 0)", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [
        {
          kind: "pass-through",
          groupId: 4,
          groupName: "Eurolopputurnaus",
          standings: [
            {
              position: 1,
              teamProviderId: 0,
              teamName: "Unknown",
              played: null,
              won: null,
              drawn: null,
              lost: null,
              goalsFor: null,
              goalsAgainst: null,
              goalDifference: null,
              points: null,
              form: [],
            },
          ],
        },
      ],
    });

    await renderStandings();

    expect(screen.queryByRole("link", { name: "Unknown" })).not.toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("renders a playoff group as a match list, with no standings table", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [
        ownCalculatedGroup,
        {
          kind: "match-list",
          groupId: 4,
          groupName: "Eurolopputurnaus",
          matches: [
            buildMatch({
              providerMatchId: 10,
              groupId: 4,
              groupName: "Eurolopputurnaus",
              matchday: 1,
              homeTeamName: "FC Honka",
              awayTeamName: "FC Inter",
              homeGoals: 0,
              awayGoals: 0,
            }),
            buildMatch({
              providerMatchId: 11,
              groupId: 4,
              groupName: "Eurolopputurnaus",
              matchday: 2,
              homeTeamProviderId: 3,
              homeTeamName: "FC Honka",
              awayTeamProviderId: 4,
              awayTeamName: "AC Oulu",
              homeGoals: 5,
              awayGoals: 0,
            }),
            // TASO can leave round_id off a match, which normalizes to a
            // null matchday — the Kierros cell falls back to "–" rather
            // than printing nothing or "null".
            buildMatch({
              providerMatchId: 12,
              groupId: 4,
              groupName: "Eurolopputurnaus",
              matchday: null,
              homeTeamProviderId: 5,
              homeTeamName: "SJK",
              awayTeamProviderId: 6,
              awayTeamName: "VPS",
              homeGoals: 1,
              awayGoals: 1,
            }),
          ],
        },
      ],
    });

    await renderStandings();

    expect(screen.getByRole("heading", { name: "Eurolopputurnaus" })).toBeInTheDocument();
    // The league group keeps its table; the playoff group adds a match
    // list rather than a second table.
    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(2);
    const [leagueTable, playoffTable] = tables as [HTMLElement, HTMLElement];
    expect(within(playoffTable).getByText("Kierros")).toBeInTheDocument();
    expect(within(playoffTable).getByText("AC Oulu")).toBeInTheDocument();
    // A standings table always has a Sija (position) column; a match list
    // has none — this is what stops the bracket data being tabulated.
    expect(within(playoffTable).queryByText("Sija")).not.toBeInTheDocument();
    expect(within(leagueTable).getByText("Sija")).toBeInTheDocument();
    // Scoped to the Kierros cell: "–" also separates the two team names in
    // every row's Ottelu column, so a bare getByText matches many nodes.
    const noRoundRow = within(playoffTable).getByRole("row", { name: /SJK/ });
    const cells = within(noRoundRow).getAllByRole("cell");
    expect(cells).toHaveLength(4);
    expect(cells[3]).toHaveTextContent("–");
  });

  it("shows the no-matches message for a playoff group with no stored matches", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [{ kind: "match-list", groupId: 4, groupName: "Eurolopputurnaus", matches: [] }],
    });

    await renderStandings();

    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
  });

  it("links a team's name to its /kotimaa/joukkue page, carrying the season", async () => {
    await renderStandings({ kausi: "2020" });

    expect(screen.getByRole("link", { name: "HJK" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/1?kilpailu=VL&kausi=2020"
    );
  });

  it("shows the round selector and passes the selected round through to getSeasonStandings", async () => {
    await renderStandings({ kierros: "1" });

    expect(getSeasonStandingsMock).toHaveBeenCalledWith("VL", "spljp26", 2026, 2026, 1);
    expect(screen.getByLabelText("Kierros")).toHaveValue("1");
  });

  it("falls back to the whole season with a Finnish notice for a round outside the available list", async () => {
    await renderStandings({ kierros: "99" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kierrosta ei löytynyt. Näytetään koko kausi."
    );
    expect(getSeasonStandingsMock).toHaveBeenCalledWith("VL", "spljp26", 2026, 2026, undefined);
  });

  it("shows the empty message when the season has no matches at all", async () => {
    listSeasonRoundsMock.mockResolvedValue([]);
    getSeasonStandingsMock.mockResolvedValue({ status: "empty", groups: [] });

    await renderStandings();

    expect(screen.getByText("Sarjataulukkoa ei ole saatavilla.")).toBeInTheDocument();
  });

  it("shows the error message on a TASO failure", async () => {
    listSeasonRoundsMock.mockResolvedValue([]);
    getSeasonStandingsMock.mockResolvedValue({ status: "error", groups: [] });

    await renderStandings();

    expect(
      screen.getByText("Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
  });

  it("links to the season's full match list", async () => {
    await renderStandings({ kausi: "2020" });

    expect(screen.getByRole("link", { name: "Kaikki ottelut" })).toHaveAttribute(
      "href",
      "/kotimaa/ottelut?kilpailu=VL&kausi=2020"
    );
  });

  it("shows a fallback notice for an invalid kilpailu param", async () => {
    await renderStandings({ kilpailu: "XX" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kilpailua ei löytynyt. Näytetään Veikkausliiga."
    );
  });

  it("sets the browser tab title to match the heading", async () => {
    expect(await getMetadata()).toEqual({ title: "Veikkausliiga 2026" });
  });

  it("sets the tab title for a valid kausi parameter", async () => {
    expect(await getMetadata({ kausi: "2015" })).toEqual({ title: "Veikkausliiga 2015" });
  });

  it("defaults searchParams handling when none is provided", async () => {
    const { default: DomesticStandingsPage } = await import("@/app/domestic/standings/page");
    render(await DomesticStandingsPage({}));

    expect(screen.getByRole("heading", { name: "Veikkausliiga 2026" })).toBeInTheDocument();
  });

  it("defaults tab title handling when searchParams is not provided", async () => {
    const { generateMetadata } = await import("@/app/domestic/standings/page");

    expect(await generateMetadata({})).toEqual({ title: "Veikkausliiga 2026" });
  });
});

describe("Domestic standings page competition naming", () => {
  it("heads a past season with the name it carried, and says what it is called now", async () => {
    getSeasonCategoryNameMock.mockResolvedValue("Naisten Liiga");

    await renderStandings({ kilpailu: "NL", kausi: "2016" });

    expect(
      screen.getByRole("heading", { name: "Naisten Liiga 2016", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByText("nykyisin Briotech Kansallinen Liiga")).toBeInTheDocument();
  });

  it("adds no rename line when the season's name is the current one", async () => {
    getSeasonCategoryNameMock.mockResolvedValue("Briotech Kansallinen Liiga");

    await renderStandings({ kilpailu: "NL", kausi: "2026" });

    expect(screen.queryByText(/^nykyisin /)).not.toBeInTheDocument();
  });
});
