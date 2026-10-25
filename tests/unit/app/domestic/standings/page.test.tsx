import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CupForecastResult } from "@/lib/knockout-simulation-service";
import type { NormalizedTasoMatch } from "@/lib/taso";
import type { GroupStandingsResult, SeasonStandingsResult } from "@/lib/taso-standings-service";
import { resetStoredSections, storedSections } from "../../../../support/page-sections";
import { warmModules } from "../../../../support/warm-module";

/**
 * A Finnish competition's standings page: league tables, split groups, the
 * cups' rounds and bracket, and where the competition's Analyysit sits.
 *
 * decisions/009-veikkausliiga.md
 * decisions/010-playoff-group-match-list.md
 * decisions/013-more-finnish-competitions.md
 * decisions/015-finnish-cups.md
 * decisions/026-favourites.md
 * decisions/043-liigacup.md
 * decisions/048-league-goals-per-game-trend.md
 * decisions/063-competition-zones.md
 * decisions/299-unit-suite-independent-of-order.md
 * decisions/419-shared-fold-marker.md
 * decisions/067-knockout-simulation.md
 * decisions/698-long-lists-start-closed.md
 * decisions/071-section-toggles.md
 */

// The favourite star in this tree calls `useSession`, and the real client must
// not load in a unit test: its cleanup timer outlives the file's jsdom. Signed
// out is what these tests assume.
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: null, refetch: vi.fn() }),
}));

const listSeasonRoundsMock = vi.fn<() => Promise<number[]>>();
const getSeasonCategoryNameMock = vi.fn<() => Promise<string | null>>();
const getSeasonStandingsMock = vi.fn<() => Promise<SeasonStandingsResult>>();

// Season discovery is mocked so these stay unit tests: the real
// `resolveTasoSeasonContext` queries `taso_matches` for its fallback, which
// would need a live database.
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

// The cup forecast's gate and read: the section's own states are
// `cup-forecast.test.tsx`'s; this file owns where it sits and when it is asked.
const canSeeAnalyticsMock = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
const getCupForecastMock = vi.hoisted(() =>
  vi.fn<(code: string, season: number, active: number) => Promise<CupForecastResult>>()
);
vi.mock("@/lib/section-choices", () => import("../../../../support/page-sections"));
vi.mock("@/lib/analytics-access", () => ({ canSeeAnalytics: canSeeAnalyticsMock }));
vi.mock("@/lib/knockout-simulation-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/knockout-simulation-service")>()),
  getCupForecast: getCupForecastMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// The competition's Analyysit stands in here with a marker: its panel, its gate
// and which competitions have it are `competition-analytics.test.tsx`'s. This
// file owns what the page asks the section for, and where the section sits.
const competitionAnalyticsMock = vi.fn(
  async (_props: {
    kind: string;
    competitionCode: string;
    selectedSeasonId: number;
    activeSeasonId: number;
    seasonLabel: (seasonId: number) => string;
  }) => <p>competition analytics placeholder</p>
);
vi.mock("@/components/competition-analytics", () => ({
  CompetitionAnalyticsSection: competitionAnalyticsMock,
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
    halfTimeHome: null,
    halfTimeAway: null,
    winner: null,
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

// At file level, not inside the first `describe`: mock implementations live on
// the module, not on the block that set them, so every test starts from the
// same arrangement wherever it sits.
beforeEach(() => {
  vi.clearAllMocks();
  resetStoredSections();
  canSeeAnalyticsMock.mockResolvedValue(false);
  getCupForecastMock.mockResolvedValue({ status: "unavailable" });
  listSeasonRoundsMock.mockResolvedValue([1, 2]);
  getSeasonCategoryNameMock.mockResolvedValue(null);
  getSeasonStandingsMock.mockResolvedValue({
    status: "ok",
    levels: [],
    groups: [ownCalculatedGroup],
  });
});

warmModules(() => import("@/app/domestic/standings/page"));

// A cup's rounds: each a `<details>` of its own, where a section's fold sits in
// the region its heading names.
function roundFolds(): HTMLDetailsElement[] {
  return [...document.querySelectorAll("details")].filter(
    (fold) => !fold.parentElement?.matches("section[aria-labelledby]")
  );
}

describe("Domestic standings page", () => {
  it("shows the Finnish heading and calculated standings for the default (latest) season", async () => {
    await renderStandings();

    expect(screen.getByRole("heading", { name: "Veikkausliiga 2026" })).toBeInTheDocument();
    expect(getSeasonStandingsMock).toHaveBeenCalledWith(
      "VL",
      "spljp26",
      2026,
      2026,
      undefined,
      "league"
    );
    expect(screen.getByText("HJK")).toBeInTheDocument();
    expect(screen.getByText("Runkosarja")).toBeInTheDocument();
  });

  it("asks for the competition's Analyysit, a season named by its year", async () => {
    await renderStandings({ kilpailu: "VL", kausi: "2025" });

    expect(competitionAnalyticsMock).toHaveBeenCalledTimes(1);
    const props = competitionAnalyticsMock.mock.calls[0]?.[0];
    expect(props).toMatchObject({
      kind: "taso",
      competitionCode: "VL",
      selectedSeasonId: 2025,
      activeSeasonId: 2026,
    });
    expect(props?.seasonLabel(2025)).toBe("2025");
  });

  it("places the Analyysit under the tables and their legend", async () => {
    await renderStandings();

    const section = screen.getByText("competition analytics placeholder");
    expect(screen.getByRole("table").compareDocumentPosition(section)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getByText(/^O = ottelut/).compareDocumentPosition(section)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("resolves a valid kausi param to its own competition_id", async () => {
    await renderStandings({ kausi: "2015" });

    expect(listSeasonRoundsMock).toHaveBeenCalledWith("VL", "spljp15", 2015, 2026);
    expect(getSeasonStandingsMock).toHaveBeenCalledWith(
      "VL",
      "spljp15",
      2015,
      2026,
      undefined,
      "league"
    );
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
      levels: [],
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
      levels: [],
      groups: [{ ...ownCalculatedGroup, groupName: "1" }],
    });

    await renderStandings();

    expect(screen.getByRole("heading", { level: 2, name: "Runkosarja" })).toBeInTheDocument();
  });

  it('renders a pass-through group\'s null stat fields as "–" instead of crashing or printing null', async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      levels: [],
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
      levels: [],
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
      levels: [],
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
              halfTimeHome: null,
              halfTimeAway: null,
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
              halfTimeHome: null,
              halfTimeAway: null,
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
              halfTimeHome: null,
              halfTimeAway: null,
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
      levels: [],
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

    expect(getSeasonStandingsMock).toHaveBeenCalledWith("VL", "spljp26", 2026, 2026, 1, "league");
    expect(screen.getByLabelText("Kierros")).toHaveValue("1");
  });

  it("falls back to the whole season with a Finnish notice for a round outside the available list", async () => {
    await renderStandings({ kierros: "99" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kierrosta ei löytynyt. Näytetään koko kausi."
    );
    expect(getSeasonStandingsMock).toHaveBeenCalledWith(
      "VL",
      "spljp26",
      2026,
      2026,
      undefined,
      "league"
    );
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

describe("Domestic standings page, cup competitions", () => {
  // One knockout match, TASO-shaped.
  function cupMatch(
    id: number,
    home: [number, string],
    away: [number, string],
    score: [number, number],
    winner: "home" | "away",
    day: number
  ) {
    return buildMatch({
      providerMatchId: id,
      categoryId: "MSC",
      status: "FINISHED",
      kickoffAt: new Date(`2025-06-${String(day).padStart(2, "0")}T16:00:00Z`),
      homeTeamProviderId: home[0],
      homeTeamName: home[1],
      awayTeamProviderId: away[0],
      awayTeamName: away[1],
      homeGoals: score[0],
      awayGoals: score[1],
      halfTimeHome: null,
      halfTimeAway: null,
      winner,
    });
  }

  function knockoutGroup(
    groupId: number,
    groupName: string,
    matches: ReturnType<typeof cupMatch>[]
  ): GroupStandingsResult {
    return {
      kind: "match-list",
      groupId,
      groupName,
      matches: matches.map((entry) => ({ ...entry, groupId, groupName })),
    };
  }

  // The closing rounds of MSC 2025.
  const closingRounds = [
    knockoutGroup(2, "Puolivälierät", [
      cupMatch(1, [1, "HJK Klubi 04"], [2, "HJK"], [0, 4], "away", 11),
      cupMatch(2, [3, "FC Haka"], [4, "KuPS"], [1, 1], "away", 11),
      cupMatch(3, [5, "AC Oulu"], [6, "SJK"], [2, 0], "home", 12),
      cupMatch(4, [7, "EIF"], [8, "FF Jaro"], [2, 4], "away", 12),
    ]),
    knockoutGroup(3, "Välierät", [
      cupMatch(5, [2, "HJK"], [5, "AC Oulu"], [1, 0], "home", 20),
      cupMatch(6, [4, "KuPS"], [8, "FF Jaro"], [2, 0], "home", 20),
    ]),
    knockoutGroup(4, "Finaali", [cupMatch(7, [2, "HJK"], [4, "KuPS"], [1, 0], "home", 25)]),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    listSeasonRoundsMock.mockResolvedValue([]);
    getSeasonCategoryNameMock.mockResolvedValue(null);
  });

  it("puts the tree first, the rounds latest first, and Cupin ennuste last, signed in", async () => {
    canSeeAnalyticsMock.mockResolvedValue(true);
    getCupForecastMock.mockResolvedValue({ status: "no-fixtures" });
    getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

    await renderStandings({ kilpailu: "MSC", kausi: "2026" });

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Pudotuspelit",
      "Loppuottelu",
      "Välierät",
      "Puolivälierät",
      "Cupin ennuste",
    ]);
    expect(getSeasonStandingsMock).toHaveBeenCalledWith(
      "MSC",
      expect.any(String),
      2026,
      2026,
      undefined,
      "taso"
    );
    expect(getCupForecastMock).toHaveBeenCalledWith("MSC", 2026, 2026);
    expect(screen.getByRole("region", { name: "Cupin ennuste" })).toBeInTheDocument();
  });

  it("has no cup forecast for a signed-out reader, and does not read one", async () => {
    getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

    await renderStandings({ kilpailu: "MSC", kausi: "2026" });

    expect(screen.queryByText("Cupin ennuste")).toBeNull();
    expect(getCupForecastMock).not.toHaveBeenCalled();
  });

  it("has no cup forecast where the service has none", async () => {
    canSeeAnalyticsMock.mockResolvedValue(true);
    getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

    await renderStandings({ kilpailu: "NSC", kausi: "2026" });

    expect(getCupForecastMock).toHaveBeenCalledWith("NSC", 2026, 2026);
    expect(screen.queryByText("Cupin ennuste")).toBeNull();
  });

  it("asks for no cup forecast, nor the gate, on a cup without one", async () => {
    canSeeAnalyticsMock.mockResolvedValue(true);
    getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

    await renderStandings({ kilpailu: "LC", kausi: "2026" });

    expect(canSeeAnalyticsMock).not.toHaveBeenCalled();
    expect(getCupForecastMock).not.toHaveBeenCalled();
  });

  it("draws the bracket above the round lists", async () => {
    getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

    await renderStandings({ kilpailu: "MSC", kausi: "2025" });

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe("Pudotuspelit");
    // Each drawn round still keeps its own list below.
    expect(headings).toContain("Puolivälierät");
    expect(headings).toContain("Loppuottelu");
  });

  it("marks each cup round's summary as something to press", async () => {
    getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

    await renderStandings({ kilpailu: "MSC", kausi: "2025" });
    const rounds = document.querySelectorAll("details");

    expect(rounds.length).toBeGreaterThan(0);
    for (const round of rounds) {
      // The marker turns by its own details element, so it sits in its summary.
      expect(round.querySelector(":scope > summary > span[aria-hidden]")?.textContent).toBe("▸");
    }
  });

  it("opens only the latest round, each closed one still saying what it holds", async () => {
    getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

    await renderStandings({ kilpailu: "MSC", kausi: "2025" });

    const rounds = roundFolds().map((round) => ({
      name: round.querySelector("summary h2")?.textContent,
      open: round.open,
      count: round.querySelector("summary > span:not([aria-hidden])")?.textContent,
    }));
    expect(rounds).toEqual([
      { name: "Loppuottelu", open: true, count: "(1 ottelu)" },
      { name: "Välierät", open: false, count: "(2 ottelua)" },
      { name: "Puolivälierät", open: false, count: "(4 ottelua)" },
    ]);
  });

  it("normalises Finaali to Loppuottelu in both the tree and the list", async () => {
    getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

    await renderStandings({ kilpailu: "MSC", kausi: "2025" });

    expect(screen.queryByText("Finaali")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Loppuottelu" }).length).toBeGreaterThan(1);
  });

  it("marks the winner of a level tie that TASO settled", async () => {
    getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

    await renderStandings({ kilpailu: "MSC", kausi: "2025" });

    // FC Haka 1-1 KuPS, KuPS through.
    const winners = screen.getAllByRole("link", { name: "KuPS" });
    expect(winners.some((link) => link.className.includes("font-semibold"))).toBe(true);
  });

  it("shows no Pudotuspelit section for a season with no closing rounds", async () => {
    // MSC 2021: a wide knockout group and nothing that halves down to a final.
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      levels: [],
      groups: [
        knockoutGroup(
          1,
          "Cup-vaihe",
          Array.from({ length: 12 }, (_, index) =>
            cupMatch(
              index + 1,
              [index + 1, `A${index}`],
              [index + 40, `B${index}`],
              [1, 0],
              "home",
              1
            )
          )
        ),
      ],
    });

    await renderStandings({ kilpailu: "MSC", kausi: "2021" });

    expect(screen.queryByRole("heading", { name: "Pudotuspelit" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cup-vaihe" })).toBeInTheDocument();
  });

  it("puts a league's tables first, then Pudotuspelit, then its knockout lists", async () => {
    // VL 2017's shape: Runkosarja, then a knockout the tree draws.
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      levels: [],
      groups: [ownCalculatedGroup, ...closingRounds.slice(1)],
    });

    await renderStandings();

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      ownCalculatedGroup.groupName,
      "Pudotuspelit",
      "Välierät",
      "Loppuottelu",
    ]);
    expect(getSeasonStandingsMock).toHaveBeenCalledWith(
      "VL",
      "spljp26",
      2026,
      2026,
      undefined,
      "league"
    );
  });

  it("shows no Pudotuspelit section for a league competition", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      levels: [],
      groups: [ownCalculatedGroup],
    });

    await renderStandings();

    expect(screen.queryByRole("heading", { name: "Pudotuspelit" })).not.toBeInTheDocument();
  });

  it("puts a cup's group tables after its rounds", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      levels: [],
      groups: [{ ...ownCalculatedGroup, groupName: "Lohko A" }, ...closingRounds],
    });

    await renderStandings({ kilpailu: "MSC", kausi: "2025" });

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Pudotuspelit",
      "Loppuottelu",
      "Välierät",
      "Puolivälierät",
      "Lohko A",
    ]);
  });

  it("keeps Suomen Cup's layout for a season that had a group stage", async () => {
    // MSC 2018: groups, then knockout rounds. Still bracket first and every
    // group a collapsible round — the Liigacup layout never reaches it.
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      levels: [],
      groups: [
        knockoutGroup(1, "Lohko A", [
          cupMatch(10, [1, "HJK Klubi 04"], [2, "HJK"], [0, 4], "away", 1),
        ]),
        ...closingRounds,
      ],
    });

    await renderStandings({ kilpailu: "MSC", kausi: "2018" });

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe("Pudotuspelit");
    expect(headings).toContain("Lohko A");
    expect(roundFolds()).toHaveLength(4);
  });

  describe("a cup of groups then a playoff", () => {
    // Two tabled groups and the `1-4` playoff: A1 v B2, B1 v A2, then the
    // winners.
    function liigacupSeason(final = cupMatch(33, [1, "HJK"], [3, "KuPS"], [2, 1], "home", 22)) {
      return [
        { ...ownCalculatedGroup, groupId: 1, groupName: "Lohko A" },
        { ...ownCalculatedGroup, groupId: 2, groupName: "Lohko B" },
        knockoutGroup(3, "1-4", [
          cupMatch(31, [1, "HJK"], [4, "SJK"], [1, 0], "home", 15),
          cupMatch(32, [3, "KuPS"], [2, "Ilves"], [1, 1], "home", 15),
          final,
        ]),
      ];
    }

    it("puts the group tables first and Pudotuspelit below them", async () => {
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: liigacupSeason(),
      });

      await renderStandings({ kilpailu: "LC", kausi: "2026" });

      const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
      expect(headings).toEqual(["Lohko A", "Lohko B", "Pudotuspelit"]);
      expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(2);
    });

    it("draws the semi-finals feeding the final, and does not list 1-4 as well", async () => {
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: liigacupSeason(),
      });

      await renderStandings({ kilpailu: "LC", kausi: "2026" });

      expect(screen.getByRole("heading", { name: "Välierät" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Loppuottelu" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "1-4" })).not.toBeInTheDocument();
      expect(roundFolds()).toHaveLength(0);
    });

    it("lists 1-4 under Pudotuspelit while its final is still to be played", async () => {
      const unplayed = {
        ...cupMatch(33, [1, "HJK"], [3, "KuPS"], [0, 0], "home", 22),
        status: "SCHEDULED",
        homeGoals: null,
        awayGoals: null,
        winner: null,
      };
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: liigacupSeason(unplayed),
      });

      await renderStandings({ kilpailu: "LC", kausi: "2026" });

      expect(screen.getByRole("heading", { level: 3, name: "1-4" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Välierät" })).not.toBeInTheDocument();
    });

    it("lays Ykkösliigacup out the same way", async () => {
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: liigacupSeason(),
      });

      await renderStandings({ kilpailu: "M1LCUP", kausi: "2026" });

      const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
      expect(headings).toEqual(["Lohko A", "Lohko B", "Pudotuspelit"]);
    });

    it("shows no Pudotuspelit while the playoff has no matches yet", async () => {
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: liigacupSeason().slice(0, 2),
      });

      await renderStandings({ kilpailu: "LC", kausi: "2026" });

      expect(screen.queryByRole("heading", { name: "Pudotuspelit" })).not.toBeInTheDocument();
    });
  });

  describe("how its folds start", () => {
    // The fold in the region a heading names.
    const foldOf = (name: string) =>
      screen.getByRole("region", { name }).querySelector(":scope > details") as HTMLDetailsElement;

    it("opens a Suomen Cup's Pudotuspelit, its first section", async () => {
      getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

      await renderStandings({ kilpailu: "MSC", kausi: "2025" });

      expect(foldOf("Pudotuspelit").open).toBe(true);
    });

    it("opens a league's tables and closes its Pudotuspelit and knockout lists", async () => {
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: [ownCalculatedGroup, ...closingRounds.slice(1)],
      });

      await renderStandings();

      expect(foldOf(ownCalculatedGroup.groupName).open).toBe(true);
      expect(foldOf("Pudotuspelit").open).toBe(false);
      expect(foldOf("Välierät").open).toBe(false);
      expect(foldOf("Loppuottelu").open).toBe(false);
    });

    it("opens a groups-then-playoff cup's tables and closes its Pudotuspelit", async () => {
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: [
          { ...ownCalculatedGroup, groupId: 1, groupName: "Lohko A" },
          ...closingRounds.slice(1),
        ],
      });

      await renderStandings({ kilpailu: "LC", kausi: "2026" });

      expect(foldOf("Lohko A").open).toBe(true);
      expect(foldOf("Pudotuspelit").open).toBe(false);
    });

    it.each([
      ["a league's", {}],
      ["a groups-then-playoff cup's", { kilpailu: "LC", kausi: "2026" }],
    ])("opens %s Pudotuspelit when no table comes above it", async (_page, query) => {
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: closingRounds.slice(1),
      });

      await renderStandings(query);

      expect(foldOf("Pudotuspelit").open).toBe(true);
    });

    it("opens a league's first knockout list when neither a table nor a tree comes above it", async () => {
      // No final, so the lists draw no tree.
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: closingRounds.slice(0, 2),
      });

      await renderStandings();

      expect(screen.queryByRole("region", { name: "Pudotuspelit" })).toBeNull();
      expect(foldOf("Puolivälierät").open).toBe(true);
      expect(foldOf("Välierät").open).toBe(false);
    });

    it("keeps a league's knockout lists closed below a tree that opens first", async () => {
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: closingRounds.slice(1),
      });

      await renderStandings();

      expect(foldOf("Pudotuspelit").open).toBe(true);
      expect(foldOf("Välierät").open).toBe(false);
    });

    it("keeps a league's knockout lists closed below a table, with no tree", async () => {
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: [ownCalculatedGroup, ...closingRounds.slice(0, 2)],
      });

      await renderStandings();

      expect(foldOf(ownCalculatedGroup.groupName).open).toBe(true);
      expect(screen.queryByRole("region", { name: "Pudotuspelit" })).toBeNull();
      expect(foldOf("Puolivälierät").open).toBe(false);
    });

    it("starts a folded table over on another round, and keeps it folded on the same page", async () => {
      listSeasonRoundsMock.mockResolvedValue([1, 2]);
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: [ownCalculatedGroup],
      });
      const { default: DomesticStandingsPage } = await import("@/app/domestic/standings/page");
      const page = (kierros: string) =>
        DomesticStandingsPage({ searchParams: Promise.resolve({ kierros }) });
      const view = render(await page("1"));
      const table = () => foldOf(ownCalculatedGroup.groupName);
      await act(async () => {
        table().open = false;
        fireEvent(table(), new Event("toggle"));
      });

      // The same page drawn again, as starring a team does.
      view.rerender(await page("1"));
      expect(table().open).toBe(false);

      view.rerender(await page("2"));
      expect(table().open).toBe(true);
    });

    it("keeps the round selector, and the focus on it, when another round starts the folds over", async () => {
      listSeasonRoundsMock.mockResolvedValue([1, 2]);
      getSeasonStandingsMock.mockResolvedValue({
        status: "ok",
        levels: [],
        groups: [ownCalculatedGroup],
      });
      const { default: DomesticStandingsPage } = await import("@/app/domestic/standings/page");
      const page = (kierros: string) =>
        DomesticStandingsPage({ searchParams: Promise.resolve({ kierros }) });
      const view = render(await page("1"));
      const select = screen.getByLabelText("Kierros");
      select.focus();

      view.rerender(await page("2"));

      expect(screen.getByLabelText("Kierros")).toBe(select);
      expect(document.activeElement).toBe(select);
    });

    it("closes Cupin ennuste until the reader opens it", async () => {
      canSeeAnalyticsMock.mockResolvedValue(true);
      getCupForecastMock.mockResolvedValue({ status: "no-fixtures" });
      getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

      await renderStandings({ kilpailu: "MSC", kausi: "2026" });

      expect(foldOf("Cupin ennuste").open).toBe(false);
    });

    it("follows the reader's stored choices over the defaults", async () => {
      storedSections.choices = { knockout: false, "cup-forecast": true };
      canSeeAnalyticsMock.mockResolvedValue(true);
      getCupForecastMock.mockResolvedValue({ status: "no-fixtures" });
      getSeasonStandingsMock.mockResolvedValue({ status: "ok", levels: [], groups: closingRounds });

      await renderStandings({ kilpailu: "MSC", kausi: "2026" });

      expect(foldOf("Pudotuspelit").open).toBe(false);
      expect(foldOf("Cupin ennuste").open).toBe(true);
    });
  });
});

describe("what the positions of a league table lead to", () => {
  const SOURCE_LINE = "Sijoitusten merkitykset ovat Palloliiton tulospalvelusta.";

  function tableOf(groupId: number, groupName: string, teams: number): GroupStandingsResult {
    const [row] = ownCalculatedGroup.kind === "own-calculated" ? ownCalculatedGroup.standings : [];
    if (row === undefined) throw new Error("Expected the fixture group to have a row");
    return {
      kind: "own-calculated",
      groupId,
      groupName,
      standings: Array.from({ length: teams }, (_unused, index) => ({
        ...row,
        position: index + 1,
        teamProviderId: groupId * 100 + index + 1,
        teamName: `${groupName} ${index + 1}`,
      })),
    };
  }

  function levelsOf(groupId: number, levels: Array<[number, number, string | null]>) {
    return levels.map(([level, teamCount, label]) => ({ groupId, level, teamCount, label }));
  }

  function sectionOf(groupName: string): HTMLElement {
    const section = screen.getByRole("heading", { level: 2, name: groupName }).closest("section");
    if (!section) throw new Error(`Expected a section for ${groupName}`);
    return section;
  }

  function linesUnder(groupName: string): string[] {
    return within(sectionOf(groupName))
      .queryAllByRole("listitem")
      .map((item) => item.textContent ?? "");
  }

  // The places, counted from 1, whose row carries the heavier rule.
  function rulesIn(groupName: string): number[] {
    return within(sectionOf(groupName))
      .getAllByRole("row")
      .slice(1)
      .flatMap((row, index) => (row.classList.contains("border-b-2") ? [index + 1] : []));
  }

  const YKKOSLIIGA_LEVELS = levelsOf(1, [
    [1, 1, "Nousee Veikkausliigaan"],
    [2, 1, "Jatkaa liigakarsintaan"],
    [3, 6, "Säilyy Ykkösliigassa"],
    [5, 1, "Karsii paikastaan Ykkösliigassa"],
    [6, 1, "Putoaa Ykköseen"],
  ]);

  const VEIKKAUSLIIGA = {
    status: "ok" as const,
    groups: [
      tableOf(1, "Runkosarja", 12),
      tableOf(2, "Mestaruussarja", 6),
      tableOf(3, "Karsintasarja", 6),
    ],
    levels: [
      ...levelsOf(1, [
        [1, 6, "Mestaruussarjaan"],
        [2, 6, "Karsintasarjaan"],
      ]),
      ...levelsOf(2, [
        [1, 1, "Kultaa"],
        [2, 1, "Hopeaa"],
        [3, 1, "Pronssia"],
        [4, 3, null],
      ]),
      ...levelsOf(3, [
        [4, 4, null],
        [5, 1, "Liigakarsintaan"],
        [6, 1, "Ykkösliigaan"],
      ]),
    ],
  };

  it("lists each labelled level under the table and rules the levels off in it", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [tableOf(1, "Ykkösliiga", 10)],
      levels: YKKOSLIIGA_LEVELS,
    });

    await renderStandings({ kilpailu: "M1L", kausi: "2026" });

    expect(linesUnder("Ykkösliiga")).toEqual([
      "Sija 1: Nousee Veikkausliigaan",
      "Sija 2: Jatkaa liigakarsintaan",
      "Sijat 3–8: Säilyy Ykkösliigassa",
      "Sija 9: Karsii paikastaan Ykkösliigassa",
      "Sija 10: Putoaa Ykköseen",
    ]);
    expect(rulesIn("Ykkösliiga")).toEqual([1, 2, 8, 9]);
  });

  it("puts the list after the table, inside the group's own section", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [tableOf(1, "Ykkösliiga", 10)],
      levels: YKKOSLIIGA_LEVELS,
    });

    await renderStandings({ kilpailu: "M1L", kausi: "2026" });

    const section = sectionOf("Ykkösliiga");
    const table = within(section).getByRole("table");
    const list = within(section).getByRole("list");
    expect(table.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives each group of a split season its own levels", async () => {
    getSeasonStandingsMock.mockResolvedValue(VEIKKAUSLIIGA);

    await renderStandings();

    expect(linesUnder("Runkosarja")).toEqual([
      "Sijat 1–6: Mestaruussarjaan",
      "Sijat 7–12: Karsintasarjaan",
    ]);
    expect(rulesIn("Runkosarja")).toEqual([6]);
    expect(linesUnder("Mestaruussarja")).toEqual([
      "Sija 1: Kultaa",
      "Sija 2: Hopeaa",
      "Sija 3: Pronssia",
    ]);
    expect(rulesIn("Mestaruussarja")).toEqual([1, 2, 3]);
  });

  it("names no line for a level without a label, and still counts its places", async () => {
    getSeasonStandingsMock.mockResolvedValue(VEIKKAUSLIIGA);

    await renderStandings();

    expect(linesUnder("Karsintasarja")).toEqual([
      "Sija 5: Liigakarsintaan",
      "Sija 6: Ykkösliigaan",
    ]);
    expect(rulesIn("Karsintasarja")).toEqual([4, 5]);
  });

  it("names the source once, under the last group that has a list", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      ...VEIKKAUSLIIGA,
      groups: [...VEIKKAUSLIIGA.groups, tableOf(4, "Liigakarsinta", 2)],
      // A group whose only level leads nowhere has no list of its own.
      levels: [...VEIKKAUSLIIGA.levels, ...levelsOf(4, [[1, 1, null]])],
    });

    await renderStandings();

    expect(screen.getAllByText(SOURCE_LINE)).toHaveLength(1);
    expect(within(sectionOf("Karsintasarja")).getByText(SOURCE_LINE)).toBeInTheDocument();
    const list = within(sectionOf("Karsintasarja")).getByRole("list");
    expect(
      list.compareDocumentPosition(screen.getByText(SOURCE_LINE)) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(linesUnder("Liigakarsinta")).toEqual([]);
    expect(rulesIn("Liigakarsinta")).toEqual([]);
  });

  it("renders a season with no stored level as before: no list, no rule, no source line", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [tableOf(1, "Ykkösliiga", 10)],
      levels: [],
    });

    await renderStandings({ kilpailu: "M1L", kausi: "2026" });

    expect(linesUnder("Ykkösliiga")).toEqual([]);
    expect(screen.queryByText(SOURCE_LINE)).not.toBeInTheDocument();
    expect(rulesIn("Ykkösliiga")).toEqual([]);
  });

  it("uses only a group's own levels", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [tableOf(1, "Runkosarja", 4), tableOf(2, "Mestaruussarja", 4)],
      levels: levelsOf(2, [[1, 1, "Kultaa"]]),
    });

    await renderStandings();

    expect(linesUnder("Runkosarja")).toEqual([]);
    expect(rulesIn("Runkosarja")).toEqual([]);
    expect(linesUnder("Mestaruussarja")).toEqual(["Sija 1: Kultaa"]);
  });

  it("draws the zones of a group shown from TASO's own numbers, on TASO's order", async () => {
    const table = tableOf(1, "Ykkösliiga", 3);
    if (table.kind !== "own-calculated") throw new Error("Expected a table");
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [
        {
          kind: "pass-through",
          groupId: 1,
          groupName: "Ykkösliiga",
          standings: table.standings.map((row) => ({ ...row, form: [] as [] })),
        },
      ],
      levels: levelsOf(1, [
        [1, 1, "Nousee"],
        [2, 2, "Säilyy"],
      ]),
    });

    await renderStandings({ kilpailu: "M1L", kausi: "2026" });

    expect(linesUnder("Ykkösliiga")).toEqual(["Sija 1: Nousee", "Sijat 2–3: Säilyy"]);
    expect(rulesIn("Ykkösliiga")).toEqual([1]);
  });

  it("shows nothing for a group drawn as a match list, whatever is stored for it", async () => {
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [
        tableOf(1, "Runkosarja", 4),
        { kind: "match-list", groupId: 2, groupName: "Liigakarsinta", matches: [buildMatch()] },
      ],
      levels: levelsOf(2, [[1, 1, "Nousee"]]),
    });

    await renderStandings();

    expect(linesUnder("Liigakarsinta")).toEqual([]);
    expect(linesUnder("Runkosarja")).toEqual([]);
    expect(screen.queryByText(SOURCE_LINE)).not.toBeInTheDocument();
  });

  it("shows nothing on a cup, in either cup layout", async () => {
    const levels = [...levelsOf(1, [[1, 1, "Jatkoon"]]), ...levelsOf(2, [[1, 1, "Jatkoon"]])];
    getSeasonStandingsMock.mockResolvedValue({
      status: "ok",
      groups: [tableOf(1, "Lohko A", 4), tableOf(2, "Lohko B", 4)],
      levels,
    });

    await renderStandings({ kilpailu: "LC", kausi: "2026" });

    expect(screen.queryByText("Sija 1: Jatkoon")).not.toBeInTheDocument();
    expect(screen.queryByText(SOURCE_LINE)).not.toBeInTheDocument();
    expect(rulesIn("Lohko A")).toEqual([]);
  });
});
