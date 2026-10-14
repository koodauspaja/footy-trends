import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CompetitionAverages,
  FootballDataMatchRow,
  HeadToHeadResult,
  NextMeeting,
  StoredMatch,
  TasoMatchRow,
  TeamForm,
} from "@/lib/match-service";
import type { MatchSource } from "@/lib/match-source";
import { MENS_TEAM } from "@/lib/national-team";

/**
 * The full head-to-head page: its sections (two signed out, four signed in, a form group while
 * the rivalry is current, and the next meeting's group when one is stored and predicted), the
 * ids it resolves, and the cases with nothing to show. The
 * record's arithmetic is `head-to-head.test.ts`'s and the row labels are `meeting-labels`'.
 *
 * decisions/042-head-to-head-view.md
 * decisions/044-scorelines-and-goal-averages.md
 * decisions/047-rivalry-page.md
 * decisions/058-rivalry-prediction.md
 * decisions/059-cup-predictions.md
 * decisions/529-one-whole-number-parser.md
 */

const getHeadToHeadHistoryMock = vi.fn<() => Promise<HeadToHeadResult>>();
const getCompetitionAveragesMock = vi.fn(
  async <Group,>(groups: readonly Group[]): Promise<CompetitionAverages<Group>> => ({
    status: "ok",
    rows: groups.map((group) => ({ ...group, competition: { home: 1.6, away: 1.25 } })),
  })
);
// Signed out unless a test says otherwise.
const canSeeAnalyticsMock = vi.fn(async () => false);

const getTeamFormMock = vi.fn(
  async (_source: MatchSource, _team: number): Promise<TeamForm> => ({ status: "too-few" })
);

const getNextMeetingMock = vi.fn(
  async (
    _source: MatchSource,
    _first: number,
    _second: number,
    _now: Date
  ): Promise<NextMeeting> => ({
    status: "ok",
    match: null,
  })
);
// `Ennuste`'s rows and lines are match-prediction.test.tsx's. Here the body
// only has to show which match and competition it was given.
const predictionBodyMock = vi.fn(
  async ({
    stored,
    competition,
  }: {
    stored: StoredMatch;
    competition: { kind: string; code: string };
  }) => <p>{`ennuste ${competition.kind} ${competition.code} ${stored.match.providerMatchId}`}</p>
);

vi.mock("@/lib/match-service", () => ({
  getHeadToHeadHistory: getHeadToHeadHistoryMock,
  getCompetitionAverages: getCompetitionAveragesMock,
  getTeamForm: getTeamFormMock,
  getNextMeeting: getNextMeetingMock,
}));

// Whether a cup tie's sides are rated is match-prediction.test.tsx's to prove.
const predictsSidesMock = vi.fn(async (_stored: StoredMatch, _competition: unknown) => true);
vi.mock("@/components/match-prediction", () => ({
  PredictionBody: predictionBodyMock,
  predictsSides: predictsSidesMock,
}));

vi.mock("@/lib/analytics-access", () => ({ canSeeAnalytics: canSeeAnalyticsMock }));
// The prompt's button and its sign-in flow are sign-in-prompt.test.tsx's. Here
// it only has to show which message it was given.
vi.mock("@/components/sign-in-prompt", () => ({
  SignInPrompt: ({ message }: { message: string }) => <p>{message}</p>,
}));

vi.mock("@/lib/taso-standings-service", () => ({
  getSeasonCategoryNameMap: vi.fn(async () => null),
}));

// Nothing mocks `@/lib/football-data`, deliberately: the page promises to make
// no provider request, and an unmocked provider module makes that testable. If
// the page reaches for one, these tests hang and do not quietly pass.

import { warmModules } from "../../support/warm-module";

const HJK = 1;
const KUPS = 2;

function meeting(over: Partial<TasoMatchRow> & { providerMatchId: number }): TasoMatchRow {
  return {
    id: over.providerMatchId,
    competitionCode: "spljp25",
    categoryId: "VL",
    seasonId: 2025,
    groupId: 1,
    groupName: "Runkosarja",
    status: "FINISHED",
    kickoffAt: new Date("2025-07-12T16:00:00Z"),
    matchday: 12,
    homeTeamProviderId: HJK,
    homeTeamName: "HJK",
    awayTeamProviderId: KUPS,
    awayTeamName: "KuPS",
    homeGoals: 2,
    awayGoals: 1,
    halfTimeHome: 1,
    halfTimeAway: 0,
    winner: "home",
    updatedAt: new Date("2025-07-13T00:00:00Z"),
    ...over,
  } as TasoMatchRow;
}

const ROUTE = {
  source: { kind: "taso", bucket: "domestic" },
  basePath: "/kotimaa",
} as const;

async function renderPage(a = String(HJK), b = String(KUPS)) {
  // Imported here rather than at the top: a static import is hoisted above the
  // mock factory, which would then read a `vi.fn` that does not exist yet.
  const { HeadToHeadPage } = await import("@/components/head-to-head-page");
  render(await HeadToHeadPage({ ...ROUTE, params: Promise.resolve({ a, b }) }));
}

warmModules(() => import("@/components/head-to-head-page"));

// Every test starts signed out, whatever the last one set: `clearAllMocks`
// keeps implementations, so without this a test would inherit the signed-in
// reader of whichever ran before it.
beforeEach(() => {
  canSeeAnalyticsMock.mockResolvedValue(false);
  // No next meeting unless a test stores one.
  getNextMeetingMock.mockResolvedValue({ status: "ok", match: null });
  // The tests of the list and the analysis describe the page with no form
  // group: in 2030 their 2024–2025 fixtures are a rivalry no longer played. The
  // rivalry's tests set their own date.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-06-01T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the window sentence's label", () => {
  it("spans calendar years abroad, and does not for a tournament", async () => {
    // `2023/24` for a league played across a winter, `2026` for one played
    // inside a summer — decided from the region rather than asked of the
    // provider, which is what keeps this page free of provider requests.
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [meeting({ providerMatchId: 1 })],
    });
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");

    render(
      await HeadToHeadPage({
        source: { kind: "football-data", region: "foreign" },
        basePath: "/ulkomaat",
        params: Promise.resolve({ a: "1", b: "2" }),
      })
    );

    expect(screen.getByText(/Perustuu kaudesta \d{4}\/\d{2} alkaen/)).toBeInTheDocument();
  });
});

describe("HeadToHeadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [
        meeting({ providerMatchId: 1 }),
        meeting({
          providerMatchId: 2,
          kickoffAt: new Date("2024-05-03T16:00:00Z"),
          seasonId: 2024,
          homeTeamProviderId: KUPS,
          homeTeamName: "KuPS",
          awayTeamProviderId: HJK,
          awayTeamName: "HJK",
          homeGoals: 0,
          awayGoals: 0,
          winner: "tie",
        }),
      ],
    });
  });

  it("asks for the pair the URL names, in that order", async () => {
    await renderPage();

    expect(getHeadToHeadHistoryMock).toHaveBeenCalledWith(ROUTE.source, HJK, KUPS);
  });

  it("heads the page with both teams", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Kohtaamiset: HJK – KuPS");
  });

  it("reads Yhteenveto then Kohtaamiset, in that order, signed out", async () => {
    await renderPage();

    const sections = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(sections).toEqual(["Yhteenveto", "Kohtaamiset"]);
  });

  it("summarises the record, the goals and each ground", async () => {
    await renderPage();

    // One win and one draw, from HJK's side; HJK hosted the win, KuPS the draw.
    expect(screen.getByText("2 ottelua, 2024–2025")).toBeInTheDocument();
    expect(screen.getByText("HJK 1 – 1 tasan – 0 KuPS")).toBeInTheDocument();
    expect(screen.getByText("Maalit 2 – 1")).toBeInTheDocument();
    expect(screen.getByText("HJK kotona 1 – 0 – 0")).toBeInTheDocument();
    expect(screen.getByText("KuPS kotona 0 – 1 – 0")).toBeInTheDocument();
  });

  it("reads the record the other way when the ids are swapped", async () => {
    await renderPage(String(KUPS), String(HJK));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Kohtaamiset: KuPS – HJK");
    expect(screen.getByText("KuPS 0 – 1 tasan – 1 HJK")).toBeInTheDocument();
  });

  it("lists every meeting, each linking to its own match page", async () => {
    await renderPage();

    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(links).toContain("/kotimaa/ottelu/1");
    expect(links).toContain("/kotimaa/ottelu/2");
  });

  it("shows the window sentence, so a count reads as ours rather than theirs", async () => {
    await renderPage();

    expect(
      screen.getByText(/Perustuu kaudesta .* alkaen tallennettuihin otteluihin\./)
    ).toBeInTheDocument();
  });

  it("is not found for a team against itself", async () => {
    await renderPage(String(HJK), String(HJK));

    expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
    expect(getHeadToHeadHistoryMock).not.toHaveBeenCalled();
  });

  // `Number()` alone would accept two of these: `0x10` as 16 and `1e3` as 1000.
  describe.each([
    ["a word", "abc"],
    ["hexadecimal, which Number() reads as 16", "0x10"],
    ["exponent notation, which Number() reads as 1000", "1e3"],
    ["a sign", "-1"],
    ["a fraction", "1.5"],
    ["a value past the column's limit", "2147483648"],
  ])("with an id that is %s", (_name, id) => {
    it("is not found when it is the first team, before any query", async () => {
      await renderPage(id, String(KUPS));

      expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
      expect(getHeadToHeadHistoryMock).not.toHaveBeenCalled();
    });

    it("is not found when it is the second team, before any query", async () => {
      await renderPage(String(HJK), id);

      expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
      expect(getHeadToHeadHistoryMock).not.toHaveBeenCalled();
    });
  });

  it("is not found for the placeholder team's id, before any query", async () => {
    // A hand-typed /kohtaamiset/0/<id>: stored placeholder matches must not
    // render as a history against "Tuntematon joukkue".
    await renderPage("0", String(KUPS));

    expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
    expect(getHeadToHeadHistoryMock).not.toHaveBeenCalled();
  });

  it("is not found when the pair has never met", async () => {
    // Reached only from a match page, so an empty history is a hand-typed URL.
    getHeadToHeadHistoryMock.mockResolvedValue({ status: "ok", matches: [] });
    await renderPage();

    expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
  });

  it("is not found when a placeholder team makes the pair unidentifiable", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({ status: "unavailable" });
    await renderPage();

    expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
  });

  it("says so when the history could not be read", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({ status: "error" });
    await renderPage();

    expect(
      screen.getByText("Kohtaamisten lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
  });
});

describe("HeadToHeadPage on football-data", () => {
  const ENGLAND = 10;
  const WALES = 11;

  function fdMeeting(over: Partial<FootballDataMatchRow> & { providerMatchId: number }) {
    return {
      id: over.providerMatchId,
      competitionCode: "EC",
      seasonId: 2024,
      kickoffAt: new Date("2024-06-25T19:00:00Z"),
      matchday: 3,
      status: "FINISHED",
      stage: "GROUP_STAGE",
      groupName: "GROUP_C",
      homeTeamProviderId: ENGLAND,
      homeTeamName: "England",
      awayTeamProviderId: WALES,
      awayTeamName: "Wales",
      homeGoals: 2,
      awayGoals: 0,
      updatedAt: new Date("2024-06-26T00:00:00Z"),
      ...over,
    } as FootballDataMatchRow;
  }

  const ROUTE_NT = {
    source: { kind: "football-data", region: "national-teams" },
    basePath: "/maajoukkueet",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [fdMeeting({ providerMatchId: 500 })],
    });
  });

  it("names the countries in Finnish, as the rest of the region does", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        ...ROUTE_NT,
        params: Promise.resolve({ a: String(ENGLAND), b: String(WALES) }),
      })
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Kohtaamiset: Englanti – Wales"
    );
  });

  it("labels each row by the competition its code names", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        ...ROUTE_NT,
        params: Promise.resolve({ a: String(ENGLAND), b: String(WALES) }),
      })
    );

    expect(screen.getByRole("columnheader", { name: "Kilpailu" })).toBeInTheDocument();
    expect(screen.getByText("EM-kisat")).toBeInTheDocument();
  });

  it("is not found when the pair has never met, on this source too", async () => {
    // The football-data half has its own early return, and a pairing with no
    // meetings is a hand-typed URL whichever table it would have read.
    getHeadToHeadHistoryMock.mockResolvedValue({ status: "ok", matches: [] });
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        ...ROUTE_NT,
        params: Promise.resolve({ a: String(ENGLAND), b: String(WALES) }),
      })
    );

    expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
  });

  it("keeps the provider's own names outside the national-team region", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        source: { kind: "football-data", region: "foreign" },
        basePath: "/ulkomaat",
        params: Promise.resolve({ a: String(ENGLAND), b: String(WALES) }),
      })
    );

    // `/ulkomaat` is club football: a club's name is not a country to localise.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Kohtaamiset: England – Wales"
    );
  });
});

describe("headToHeadMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("titles the tab with both teams", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [meeting({ providerMatchId: 1 })],
    });
    const { headToHeadMetadata } = await import("@/components/head-to-head-page");

    expect(
      await headToHeadMetadata({ ...ROUTE, params: Promise.resolve({ a: "1", b: "2" }) })
    ).toEqual({ title: "Kohtaamiset: HJK – KuPS" });
  });

  it("falls back to the bare heading when there is no pair to name", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({ status: "ok", matches: [] });
    const { headToHeadMetadata } = await import("@/components/head-to-head-page");

    expect(
      await headToHeadMetadata({ ...ROUTE, params: Promise.resolve({ a: "1", b: "2" }) })
    ).toEqual({ title: "Kohtaamiset" });
  });
});

describe("HeadToHeadPage on a national team's own matches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [
        meeting({
          providerMatchId: 900,
          competitionCode: "maajp2025",
          categoryId: "UNL",
          seasonId: 2025,
          groupName: "C-liiga lohko 1",
          homeTeamProviderId: 1,
          homeTeamName: "Suomi",
          awayTeamProviderId: 2,
          awayTeamName: "Greece",
        }),
      ],
    });
  });

  it("renders Finland's opponents in Finnish", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        source: { kind: "taso", bucket: "national" },
        basePath: "/maajoukkueet/huuhkajat",
        nationalTeam: MENS_TEAM,
        params: Promise.resolve({ a: "1", b: "2" }),
      })
    );

    // `maajp18`'s older categories name some opponents in English, and
    // `FINNISH_TASO_TEAM_NAMES` covers those. The rest of the region localises
    // them, and a head-to-head page cannot be the one place that does not.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Kohtaamiset: Suomi – Kreikka"
    );
  });

  it("falls back to the series name when TASO cannot name the competition", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        source: { kind: "taso", bucket: "national" },
        basePath: "/maajoukkueet/huuhkajat",
        nationalTeam: MENS_TEAM,
        params: Promise.resolve({ a: "1", b: "2" }),
      })
    );

    // The category map is mocked to `null` here, which is the unreadable case.
    expect(screen.getByText("C-liiga lohko 1")).toBeInTheDocument();
  });
});

describe("the analysis sections", () => {
  const SIGN_IN = "Kirjaudu sisään nähdäksesi analyysit ja trendit.";

  // HJK 2–1 KuPS twice (once at KuPS), and a 0–0: 2024 and 2025 Veikkausliiga.
  const MEETINGS = [
    meeting({ providerMatchId: 1 }),
    meeting({
      providerMatchId: 2,
      kickoffAt: new Date("2025-05-03T16:00:00Z"),
      homeTeamProviderId: KUPS,
      homeTeamName: "KuPS",
      awayTeamProviderId: HJK,
      awayTeamName: "HJK",
      homeGoals: 1,
      awayGoals: 2,
    }),
    meeting({
      providerMatchId: 3,
      competitionCode: "spljp24",
      seasonId: 2024,
      kickoffAt: new Date("2024-06-01T16:00:00Z"),
      homeGoals: 0,
      awayGoals: 0,
    }),
  ];

  // The competition-seasons the page asked averages for, one per group.
  function scopesAsked(): unknown[] {
    const [groups] = getCompetitionAveragesMock.mock.calls[0] ?? [[]];
    return (groups as ReadonlyArray<{ scope: unknown }>).map((group) => group.scope);
  }

  function headings(): Array<string | null> {
    return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    canSeeAnalyticsMock.mockResolvedValue(true);
    getHeadToHeadHistoryMock.mockResolvedValue({ status: "ok", matches: MEETINGS });
  });

  it("reads Yhteenveto, Tulokset, Maalit kilpailuittain, Kohtaamiset when signed in", async () => {
    await renderPage();

    expect(headings()).toEqual(["Yhteenveto", "Tulokset", "Maalit kilpailuittain", "Kohtaamiset"]);
  });

  it("counts each meeting in its cell, from the first team's side", async () => {
    await renderPage();

    const grid = within(screen.getByRole("region", { name: "Tulokset" })).getByRole("table");
    const rows = within(grid).getAllByRole("row");
    // Header row, then one per HJK goal count: row 3 is HJK's 2, column 2 KuPS's 1.
    const cellsOf = (row: number) => within(rows[row] as HTMLElement).getAllByRole("cell");
    expect(cellsOf(3)[1]).toHaveTextContent("2");
    expect(cellsOf(1)[0]).toHaveTextContent("1");
    expect(cellsOf(2)[3]).toHaveTextContent("");
    expect(within(grid).getByRole("columnheader", { name: "5+" })).toBeInTheDocument();
    expect(within(grid).getByRole("columnheader", { name: "HJK ↓ / KuPS →" })).toBeInTheDocument();
    expect(screen.getByText("Yleisin tulos 2–1, 2 kertaa.")).toBeInTheDocument();
  });

  it("transposes the grid when the URL names the teams the other way", async () => {
    await renderPage(String(KUPS), String(HJK));

    const grid = within(screen.getByRole("region", { name: "Tulokset" })).getByRole("table");
    const rows = within(grid).getAllByRole("row");
    expect(within(rows[2] as HTMLElement).getAllByRole("cell")[2]).toHaveTextContent("2");
    expect(screen.getByText("Yleisin tulos 1–2, 2 kertaa.")).toBeInTheDocument();
  });

  it("compares each competition with its own average, over the seasons they met in it", async () => {
    await renderPage();

    expect(scopesAsked()).toEqual([
      {
        kind: "taso",
        seasons: [
          { competitionId: "spljp25", categoryId: "VL" },
          { competitionId: "spljp24", categoryId: "VL" },
        ],
      },
    ]);
    const table = within(screen.getByRole("region", { name: "Maalit kilpailuittain" })).getByRole(
      "table"
    );
    const row = within(table).getByRole("row", { name: /Veikkausliiga/ });
    // Home sides scored 2, 1 and 0; away sides 1, 2 and 0.
    expect(row).toHaveTextContent("3");
    expect(row).toHaveTextContent("1,0 – 1,0");
    expect(row).toHaveTextContent("1,6 – 1,3");
  });

  it("counts Liigacup 2023 and 2024 as one competition", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [
        meeting({
          providerMatchId: 7,
          competitionCode: "Liigacup24",
          categoryId: "LC",
          seasonId: 2024,
        }),
        meeting({
          providerMatchId: 8,
          competitionCode: "Liigacup23",
          categoryId: "LC2023",
          seasonId: 2023,
          kickoffAt: new Date("2023-02-01T16:00:00Z"),
        }),
      ],
    });
    await renderPage();

    expect(scopesAsked()).toEqual([
      {
        kind: "taso",
        seasons: [
          { competitionId: "Liigacup24", categoryId: "LC" },
          { competitionId: "Liigacup23", categoryId: "LC2023" },
        ],
      },
    ]);
    const averages = screen.getByRole("region", { name: "Maalit kilpailuittain" });
    expect(within(averages).getByRole("row", { name: /Liigacup/ })).toHaveTextContent("2");
  });

  it("keeps a category the registry does not claim as its own competition", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [meeting({ providerMatchId: 9, categoryId: "XYZ", groupName: "Lohko 3" })],
    });
    await renderPage();

    expect(scopesAsked()).toEqual([
      { kind: "taso", seasons: [{ competitionId: "spljp25", categoryId: "XYZ" }] },
    ]);
  });

  it("says the averages could not be computed, and still shows the grid", async () => {
    getCompetitionAveragesMock.mockResolvedValueOnce({ status: "error" });
    await renderPage();

    const section = screen.getByRole("region", { name: "Maalit kilpailuittain" });
    expect(
      within(section).getByText("Keskiarvoja ei voitu laskea. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(within(section).queryByRole("table")).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Tulokset" })).getByRole("table")
    ).toBeVisible();
  });

  it("has no sentence when every scoreline occurred once", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [meeting({ providerMatchId: 1 })],
    });
    await renderPage();

    expect(screen.queryByText(/Yleisi/)).toBeNull();
  });

  it("shades a cell by its count, with its count always printed", async () => {
    await renderPage();

    const grid = within(screen.getByRole("region", { name: "Tulokset" })).getByRole("table");
    const levels = within(grid)
      .getAllByRole("cell")
      .map((cell) => [cell.textContent, cell.getAttribute("data-level")]);
    expect(levels).toContainEqual(["2", "4"]);
    expect(levels).toContainEqual(["1", "2"]);
    expect(levels).toContainEqual(["", "0"]);
  });

  it("prints a dark cell's count in the background colour, so it stays legible", async () => {
    await renderPage();

    const cells = within(
      within(screen.getByRole("region", { name: "Tulokset" })).getByRole("table")
    ).getAllByRole("cell");
    const byLevel = (level: string) =>
      cells.find((cell) => cell.getAttribute("data-level") === level);
    // The fullest cell, level 4, is dark; a level-2 cell is light enough for the usual text.
    expect(byLevel("4")).toHaveClass("text-background");
    expect(byLevel("2")).not.toHaveClass("text-background");
  });

  it("drops the averages on a TASO national-team route, keeping the grid", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        source: { kind: "taso", bucket: "national" },
        basePath: "/maajoukkueet/huuhkajat",
        nationalTeam: MENS_TEAM,
        params: Promise.resolve({ a: "1", b: "2" }),
      })
    );

    expect(headings()).toEqual(["Yhteenveto", "Tulokset", "Kohtaamiset"]);
    expect(getCompetitionAveragesMock).not.toHaveBeenCalled();
  });

  it("keeps the averages on football-data's national-team route, by competition code", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [
        {
          id: 500,
          providerMatchId: 500,
          competitionCode: "EC",
          seasonId: 2024,
          kickoffAt: new Date("2024-06-25T19:00:00Z"),
          status: "FINISHED",
          homeTeamProviderId: 10,
          homeTeamName: "England",
          awayTeamProviderId: 11,
          awayTeamName: "Wales",
          homeGoals: 2,
          awayGoals: 0,
        } as FootballDataMatchRow,
      ],
    });
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        source: { kind: "football-data", region: "national-teams" },
        basePath: "/maajoukkueet",
        params: Promise.resolve({ a: "10", b: "11" }),
      })
    );

    expect(headings()).toContain("Maalit kilpailuittain");
    expect(scopesAsked()).toEqual([
      { kind: "football-data", competitionCode: "EC", seasonIds: [2024] },
    ]);
  });

  it("signed out, shows one prompt and computes neither section", async () => {
    canSeeAnalyticsMock.mockResolvedValue(false);
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    const { container } = render(
      await HeadToHeadPage({ ...ROUTE, params: Promise.resolve({ a: "1", b: "2" }) })
    );

    expect(screen.getAllByText(SIGN_IN)).toHaveLength(1);
    expect(headings()).toEqual(["Yhteenveto", "Kohtaamiset"]);
    expect(getCompetitionAveragesMock).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toContain("Yleisin");
    expect(container.innerHTML).not.toContain("data-level");
  });
});

describe("the rivalry: current form beside the history", () => {
  // Five finished matches for one team, oldest first, as `latestForm` returns
  // them.
  function okForm(firstId: number, results: string, latest: string): TeamForm {
    const letters = [...results] as Array<"V" | "T" | "H">;
    const labels = { V: "Voitto", T: "Tasapeli", H: "Häviö" } as const;
    return {
      status: "ok",
      entries: letters.map((result, index) => ({
        match: meeting({ providerMatchId: firstId + index }) as never,
        result,
        label: labels[result],
      })),
      pointsPerMatch:
        letters.reduce((sum, r) => sum + (r === "V" ? 3 : r === "T" ? 1 : 0), 0) / letters.length,
      latest: new Date(latest),
    };
  }

  function h2s(): Array<string | null> {
    return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
    canSeeAnalyticsMock.mockResolvedValue(true);
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [meeting({ providerMatchId: 1, kickoffAt: new Date("2025-07-12T16:00:00Z") })],
    });
    getTeamFormMock.mockImplementation(async (_source, team) =>
      team === HJK
        ? okForm(100, "VVTHV", "2026-09-21T15:00:00Z")
        : okForm(200, "HHTTV", "2026-09-20T15:00:00Z")
    );
  });

  it("puts Nykyinen vire first and the whole history under Keskinäinen historia", async () => {
    await renderPage();

    expect(h2s()).toEqual(["Nykyinen vire", "Keskinäinen historia"]);
    const history = screen.getByRole("region", { name: "Keskinäinen historia" });
    expect(
      within(history)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent)
    ).toEqual(["Yhteenveto", "Tulokset", "Maalit kilpailuittain", "Kohtaamiset"]);
  });

  it("asks for each team's form within the pair's own source", async () => {
    await renderPage();

    expect(getTeamFormMock).toHaveBeenCalledWith(ROUTE.source, HJK);
    expect(getTeamFormMock).toHaveBeenCalledWith(ROUTE.source, KUPS);
  });

  it("shows the first team's block first, and swaps with the URL", async () => {
    await renderPage();
    const blocks = () =>
      within(screen.getByRole("region", { name: "Nykyinen vire" }))
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent);
    expect(blocks()).toEqual(["HJK", "KuPS"]);

    document.body.innerHTML = "";
    await renderPage(String(KUPS), String(HJK));
    expect(blocks()).toEqual(["KuPS", "HJK"]);
  });

  it("shows five results oldest first, each linking to its match, as the Vire column spells them", async () => {
    await renderPage();
    const block = screen.getByRole("region", { name: "HJK" });
    const links = within(block).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual(["V", "V", "T", "H", "V"]);
    expect(links[0]).toHaveAttribute("href", "/kotimaa/ottelu/100");
    expect(links[0]).toHaveAttribute("title", "Voitto");
    expect(links[3]).toHaveAttribute("title", "Häviö");
    // V V T H V: 3 + 3 + 1 + 0 + 3 = 10 points over five.
    expect(within(block).getByText("2,0 pistettä ottelua kohden")).toBeInTheDocument();
    expect(within(block).getByText("Viimeisin ottelu 21.09.2026")).toBeInTheDocument();
  });

  it("says too few, or that the read failed, in that team's block only", async () => {
    getTeamFormMock.mockImplementation(async (_source, team) =>
      team === HJK ? ({ status: "too-few" } as const) : ({ status: "error" } as const)
    );
    await renderPage();

    expect(
      within(screen.getByRole("region", { name: "HJK" })).getByText(
        "Vire näytetään, kun joukkue on pelannut vähintään viisi ottelua."
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "KuPS" })).getByText(
        "Virettä ei voitu laskea. Yritä myöhemmin uudelleen."
      )
    ).toBeInTheDocument();
    // The history is untouched by either.
    expect(screen.getByRole("region", { name: "Keskinäinen historia" })).toBeInTheDocument();
  });

  it("counts a meeting in current year − 2, in Helsinki's calendar", async () => {
    // 00:30 on 1 January 2024 in Helsinki is still 31 December 2023 in UTC.
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [meeting({ providerMatchId: 1, kickoffAt: new Date("2023-12-31T22:30:00Z") })],
    });
    await renderPage();

    expect(h2s()).toEqual(["Nykyinen vire", "Keskinäinen historia"]);
  });

  it("leaves a rivalry no longer played exactly as it was, reading no form", async () => {
    // 23:30 on 31 December 2023 in Helsinki: 2023, three years back.
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [meeting({ providerMatchId: 1, kickoffAt: new Date("2023-12-31T21:30:00Z") })],
    });
    await renderPage();

    expect(h2s()).toEqual(["Yhteenveto", "Tulokset", "Maalit kilpailuittain", "Kohtaamiset"]);
    expect(getTeamFormMock).not.toHaveBeenCalled();
  });

  it("reads no form and adds no group for a signed-out reader", async () => {
    canSeeAnalyticsMock.mockResolvedValue(false);
    const { container } = render(
      await (await import("@/components/head-to-head-page")).HeadToHeadPage({
        ...ROUTE,
        params: Promise.resolve({ a: "1", b: "2" }),
      })
    );

    expect(h2s()).toEqual(["Yhteenveto", "Kohtaamiset"]);
    expect(getTeamFormMock).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toContain("pistettä ottelua kohden");
  });

  it("adds nothing on a TASO national-team route", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        source: { kind: "taso", bucket: "national" },
        basePath: "/maajoukkueet/huuhkajat",
        nationalTeam: MENS_TEAM,
        params: Promise.resolve({ a: "1", b: "2" }),
      })
    );

    expect(h2s()).toEqual(["Yhteenveto", "Tulokset", "Kohtaamiset"]);
    expect(getTeamFormMock).not.toHaveBeenCalled();
  });
});

describe("the next meeting, predicted", () => {
  const NOW = new Date("2026-09-29T12:00:00Z");

  // HJK at home to KuPS on 4 October at 17.00 in Helsinki, in Veikkausliiga.
  function next(over: Partial<TasoMatchRow> = {}): NextMeeting {
    return {
      status: "ok",
      match: {
        source: "taso",
        match: meeting({
          providerMatchId: 77,
          competitionCode: "spljp26",
          seasonId: 2026,
          status: "SCHEDULED",
          kickoffAt: new Date("2026-10-04T14:00:00Z"),
          homeGoals: null,
          awayGoals: null,
          winner: null,
          ...over,
        }),
      },
    };
  }

  function h2s(): Array<string | null> {
    return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
    canSeeAnalyticsMock.mockResolvedValue(true);
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [meeting({ providerMatchId: 1, kickoffAt: new Date("2025-07-12T16:00:00Z") })],
    });
    getNextMeetingMock.mockResolvedValue(next());
  });

  it("puts Seuraava kohtaaminen first, above the form and the history", async () => {
    await renderPage();

    expect(h2s()).toEqual(["Seuraava kohtaaminen", "Nykyinen vire", "Keskinäinen historia"]);
  });

  it("shows the kickoff as the match page formats it, the competition, and the match linking to its page", async () => {
    await renderPage();

    const group = screen.getByRole("region", { name: "Seuraava kohtaaminen" });
    expect(within(group).getByText("04.10.2026 klo 17.00 · Veikkausliiga")).toBeInTheDocument();
    expect(within(group).getByRole("link", { name: "HJK – KuPS" })).toHaveAttribute(
      "href",
      "/kotimaa/ottelu/77"
    );
  });

  it("names the home side first, whichever team the URL names first", async () => {
    getNextMeetingMock.mockResolvedValue(
      next({
        homeTeamProviderId: KUPS,
        homeTeamName: "KuPS",
        awayTeamProviderId: HJK,
        awayTeamName: "HJK",
      })
    );
    await renderPage();

    expect(screen.getByRole("link", { name: "KuPS – HJK" })).toBeInTheDocument();
  });

  it("asks for the pair's next meeting in the page's own source, as of now", async () => {
    await renderPage();

    expect(getNextMeetingMock).toHaveBeenCalledWith(ROUTE.source, HJK, KUPS, NOW);
  });

  it("shows that match's Ennuste body inside the group, for the competition the models know it by", async () => {
    await renderPage();

    const group = screen.getByRole("region", { name: "Seuraava kohtaaminen" });
    expect(within(group).getByText("ennuste taso VL 77")).toBeInTheDocument();
    expect(predictionBodyMock).toHaveBeenCalledWith({
      stored: (next() as Extract<NextMeeting, { status: "ok" }>).match,
      competition: { kind: "taso", code: "VL" },
    });
  });

  it("has no group when no meeting is stored", async () => {
    getNextMeetingMock.mockResolvedValue({ status: "ok", match: null });
    await renderPage();

    expect(h2s()).toEqual(["Nykyinen vire", "Keskinäinen historia"]);
    expect(predictionBodyMock).not.toHaveBeenCalled();
  });

  it("predicts a Suomen Cup tie as the next meeting between rated sides", async () => {
    getNextMeetingMock.mockResolvedValue(next({ categoryId: "MSC" }));
    await renderPage();

    expect(h2s()).toContain("Seuraava kohtaaminen");
    expect(predictionBodyMock).toHaveBeenCalledWith(
      expect.objectContaining({ competition: { kind: "taso", code: "MSC" } })
    );
  });

  it("has no group, and computes no prediction, when a cup tie's sides are not both rated", async () => {
    predictsSidesMock.mockResolvedValueOnce(false);
    getNextMeetingMock.mockResolvedValue(next({ categoryId: "MSC" }));
    await renderPage();

    expect(h2s()).toEqual(["Nykyinen vire", "Keskinäinen historia"]);
    expect(predictionBodyMock).not.toHaveBeenCalled();
  });

  it("has no group, and computes no prediction, when the next meeting is a cup tie the models do not cover", async () => {
    getNextMeetingMock.mockResolvedValue(next({ categoryId: "LC" }));
    await renderPage();

    expect(h2s()).toEqual(["Nykyinen vire", "Keskinäinen historia"]);
    expect(predictionBodyMock).not.toHaveBeenCalled();
  });

  it("has no group when the read fails, and keeps the rest of the page", async () => {
    getNextMeetingMock.mockResolvedValue({ status: "error" });
    await renderPage();

    expect(h2s()).toEqual(["Nykyinen vire", "Keskinäinen historia"]);
    expect(screen.getByRole("heading", { level: 3, name: "Kohtaamiset" })).toBeInTheDocument();
    expect(predictionBodyMock).not.toHaveBeenCalled();
  });

  it("heads the next meeting and the history when the rivalry's form is hidden", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [meeting({ providerMatchId: 1, kickoffAt: new Date("2023-07-12T16:00:00Z") })],
    });
    await renderPage();

    expect(h2s()).toEqual(["Seuraava kohtaaminen", "Keskinäinen historia"]);
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    ).toEqual(["Yhteenveto", "Tulokset", "Maalit kilpailuittain", "Kohtaamiset"]);
    expect(getTeamFormMock).not.toHaveBeenCalled();
  });

  it("signed out, reads no next meeting and leaves the page as it was", async () => {
    canSeeAnalyticsMock.mockResolvedValue(false);
    await renderPage();

    expect(h2s()).toEqual(["Yhteenveto", "Kohtaamiset"]);
    expect(getNextMeetingMock).not.toHaveBeenCalled();
    expect(predictionBodyMock).not.toHaveBeenCalled();
  });

  it("reads no next meeting on a TASO national-team route", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        source: { kind: "taso", bucket: "national" },
        basePath: "/maajoukkueet/huuhkajat",
        nationalTeam: MENS_TEAM,
        params: Promise.resolve({ a: "1", b: "2" }),
      })
    );

    expect(h2s()).toEqual(["Yhteenveto", "Tulokset", "Kohtaamiset"]);
    expect(getNextMeetingMock).not.toHaveBeenCalled();
  });

  describe("on football-data", () => {
    function fdRow(over: Partial<FootballDataMatchRow>): FootballDataMatchRow {
      return {
        id: 900,
        providerMatchId: 900,
        competitionCode: "PL",
        seasonId: 2026,
        kickoffAt: new Date("2025-12-06T15:00:00Z"),
        matchday: 15,
        status: "FINISHED",
        stage: "REGULAR_SEASON",
        groupName: null,
        homeTeamProviderId: 57,
        homeTeamName: "Arsenal FC",
        awayTeamProviderId: 61,
        awayTeamName: "Chelsea FC",
        homeGoals: 1,
        awayGoals: 1,
        updatedAt: new Date("2025-12-07T00:00:00Z"),
        ...over,
      } as FootballDataMatchRow;
    }

    async function renderRoute(region: "foreign" | "national-teams", basePath: string) {
      const { HeadToHeadPage } = await import("@/components/head-to-head-page");
      render(
        await HeadToHeadPage({
          source: { kind: "football-data", region },
          basePath,
          params: Promise.resolve({ a: "57", b: "61" }),
        })
      );
    }

    it("names a foreign competition from its own registry and links within the route", async () => {
      getHeadToHeadHistoryMock.mockResolvedValue({ status: "ok", matches: [fdRow({})] });
      getNextMeetingMock.mockResolvedValue({
        status: "ok",
        match: {
          source: "football-data",
          match: fdRow({
            providerMatchId: 901,
            status: "TIMED",
            kickoffAt: new Date("2027-01-16T15:00:00Z"),
            homeTeamProviderId: 61,
            homeTeamName: "Chelsea FC",
            awayTeamProviderId: 57,
            awayTeamName: "Arsenal FC",
            homeGoals: null,
            awayGoals: null,
          }),
        },
      });
      await renderRoute("foreign", "/ulkomaat");

      const group = screen.getByRole("region", { name: "Seuraava kohtaaminen" });
      expect(within(group).getByText("16.01.2027 klo 17.00 · Valioliiga")).toBeInTheDocument();
      expect(within(group).getByRole("link", { name: "Chelsea FC – Arsenal FC" })).toHaveAttribute(
        "href",
        "/ulkomaat/ottelu/901"
      );
      expect(within(group).getByText("ennuste football-data PL 901")).toBeInTheDocument();
    });

    it("has no group on the national-team route, whose competitions the models do not cover", async () => {
      getHeadToHeadHistoryMock.mockResolvedValue({
        status: "ok",
        matches: [fdRow({ competitionCode: "EC" })],
      });
      getNextMeetingMock.mockResolvedValue({
        status: "ok",
        match: {
          source: "football-data",
          match: fdRow({
            providerMatchId: 902,
            competitionCode: "WC",
            status: "SCHEDULED",
            kickoffAt: new Date("2026-11-16T15:00:00Z"),
            homeGoals: null,
            awayGoals: null,
          }),
        },
      });
      await renderRoute("national-teams", "/maajoukkueet");

      expect(
        screen.queryByRole("heading", { name: "Seuraava kohtaaminen" })
      ).not.toBeInTheDocument();
      expect(predictionBodyMock).not.toHaveBeenCalled();
    });
  });
});
