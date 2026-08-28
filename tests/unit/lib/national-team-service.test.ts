import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedTasoMatch } from "@/lib/taso";

const getSeasonCategoryNameMapMock =
  vi.fn<(competitionId: string, ...rest: number[]) => Promise<Record<string, string>>>();
const getSeasonMatchListMock = vi.fn();

vi.mock("@/lib/taso-standings-service", () => ({
  getSeasonCategoryNameMap: getSeasonCategoryNameMapMock,
  getSeasonMatchList: getSeasonMatchListMock,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function match(
  providerMatchId: number,
  home: string,
  away: string,
  iso = "2026-06-05T19:00:00Z"
): NormalizedTasoMatch {
  return {
    providerMatchId,
    competitionCode: "maajp2026",
    categoryId: "UNL",
    seasonId: 2026,
    groupId: 1,
    groupName: "C-liiga lohko 1",
    status: "FINISHED",
    kickoffAt: new Date(iso),
    matchday: null,
    homeTeamProviderId: 1,
    homeTeamName: home,
    awayTeamProviderId: 2,
    awayTeamName: away,
    homeGoals: 1,
    awayGoals: 0,
    winner: null,
  } as NormalizedTasoMatch;
}

/** Only 2026 has categories; every other year is empty unless a test says otherwise. */
function onlyIn2026(names: Record<string, string>) {
  getSeasonCategoryNameMapMock.mockImplementation(async (competitionId) =>
    competitionId === "maajp2026" ? names : {}
  );
}

async function load() {
  const { getNationalTeamYears } = await import("@/lib/national-team-service");
  const { MENS_TEAM } = await import("@/lib/national-team");
  return getNationalTeamYears(MENS_TEAM);
}

describe("getNationalTeamYears", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonCategoryNameMapMock.mockResolvedValue({});
    getSeasonMatchListMock.mockResolvedValue({ status: "empty" });
  });

  it("labels each row with its competition, suffix removed", async () => {
    onlyIn2026({ UNL: "UEFA Nations League Huuhkajat" });
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [match(1, "Suomi", "Albania")],
    });

    const result = await load();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.years).toHaveLength(1);
    expect(result.years[0]?.matches[0]?.competitionName).toBe("UEFA Nations League");
  });

  it("drops matches Finland did not play in", async () => {
    onlyIn2026({ ECQ: "EM-karsinnat Huuhkajat" });
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [
        match(1, "Suomi", "Malta"),
        match(2, "Kazakstan", "Slovenia"),
        match(3, "San Marino", "Pohjois-Irlanti"),
      ],
    });

    const result = await load();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.years[0]?.matches.map((m) => m.providerMatchId)).toEqual([1]);
  });

  /**
   * `maajp18`'s 2019 and 2020 categories name opponents in English, unlike
   * every later bucket. See specs/017-huuhkajat.md.
   */
  it("renders an English TASO name in Finnish", async () => {
    onlyIn2026({ ECQ: "EM-karsinnat Huuhkajat" });
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [match(1, "Suomi", "Greece"), match(2, "Italy", "Suomi")],
    });

    const result = await load();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const names = result.years[0]?.matches.flatMap((m) => [m.homeTeamName, m.awayTeamName]);
    expect(names).toContain("Kreikka");
    expect(names).toContain("Italia");
    expect(names).not.toContain("Greece");
    expect(names).not.toContain("Italy");
  });

  it("ignores categories that are not the men's A team", async () => {
    onlyIn2026({ WWCQ: "MM-karsinnat Helmarit", U21ECQ: "EM-karsinnat U21-miehet" });

    const result = await load();

    expect(result.status).toBe("empty");
    expect(getSeasonMatchListMock).not.toHaveBeenCalled();
  });

  it("omits a year whose categories hold no matches, rather than showing an empty fold", async () => {
    onlyIn2026({ UNL: "UEFA Nations League Huuhkajat" });
    getSeasonMatchListMock.mockResolvedValue({ status: "empty" });

    const result = await load();

    expect(result.status).toBe("empty");
  });

  it("treats an empty category as ordinary while another carries matches", async () => {
    onlyIn2026({ UNL: "UEFA Nations League Huuhkajat", WCQ: "MM-karsinnat Huuhkajat" });
    getSeasonMatchListMock.mockImplementation(async (categoryId: string) =>
      categoryId === "UNL"
        ? { status: "empty" }
        : { status: "ok", matches: [match(1, "Suomi", "Malta")] }
    );

    const result = await load();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.years[0]?.matches).toHaveLength(1);
  });

  it("orders years newest first and matches chronologically within one", async () => {
    getSeasonCategoryNameMapMock.mockImplementation(async (competitionId) =>
      competitionId === "maajp2026" || competitionId === "maajp18"
        ? { UNL: "UEFA Nations League Huuhkajat" }
        : {}
    );
    getSeasonMatchListMock.mockImplementation(async (_c: string, competitionId: string) =>
      competitionId === "maajp2026"
        ? {
            status: "ok",
            matches: [
              match(2, "Suomi", "Albania", "2026-10-03T19:00:00Z"),
              match(1, "San Marino", "Suomi", "2026-09-26T19:00:00Z"),
            ],
          }
        : { status: "ok", matches: [match(9, "Tanska", "Suomi", "2021-06-12T19:00:00Z")] }
    );

    const result = await load();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.years.map((y) => y.year)).toEqual([2026, 2021]);
    expect(result.years[0]?.matches.map((m) => m.providerMatchId)).toEqual([1, 2]);
  });

  /**
   * A year silently missing from a page that shows every year is invisible —
   * nothing on screen would say which one went absent.
   */
  it("fails the page only when every bucket fails", async () => {
    getSeasonCategoryNameMapMock.mockRejectedValue(new Error("TASO request failed: 500"));

    await expect(load()).resolves.toEqual({ status: "error" });
  });

  /**
   * The behaviour #180 changed. Failing everything because one of up to 28
   * queries failed blanked eight years of history in production.
   */
  it("renders the buckets that loaded when another fails, and says it is incomplete", async () => {
    getSeasonCategoryNameMapMock.mockImplementation(async (competitionId) => {
      if (competitionId === "maajp18") throw new Error("Failed query");
      return competitionId === "maajp2026" ? { UNL: "UEFA Nations League Huuhkajat" } : {};
    });
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [match(1, "Suomi", "Albania")],
    });

    const result = await load();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.years).toHaveLength(1);
    expect(result.incomplete).toBe(true);
  });

  it("is not incomplete when every bucket loaded", async () => {
    onlyIn2026({ UNL: "UEFA Nations League Huuhkajat" });
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [match(1, "Suomi", "Albania")],
    });

    const result = await load();

    // Asserting the status first: `result.status === "ok" && result.incomplete`
    // is false for `empty` and `error` too, so it would pass on exactly the
    // regressions this exists to catch.
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.incomplete).toBe(false);
  });

  /**
   * "Empty" must mean there are no matches, not that we could not read them —
   * otherwise the reader is told something false.
   */
  it("reports error, not empty, when nothing loaded and something failed", async () => {
    onlyIn2026({ UNL: "UEFA Nations League Huuhkajat", WCQ: "MM-karsinnat Huuhkajat" });
    getSeasonMatchListMock.mockImplementation(async (categoryId: string) =>
      categoryId === "UNL"
        ? { status: "error" }
        : { status: "ok", matches: [match(1, "Suomi", "Malta")] }
    );

    await expect(load()).resolves.toEqual({ status: "error" });
  });

  /**
   * `maajp18` is one bucket holding three calendar years. The page must file
   * each match under the year it was played, not under the bucket's season.
   */
  it("splits a bucket that spans calendar years into a section each", async () => {
    getSeasonCategoryNameMapMock.mockImplementation(async (competitionId) =>
      competitionId === "maajp18" ? { ECQ: "EM-karsinnat Huuhkajat" } : {}
    );
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [
        match(1, "Suomi", "Liechtenstein", "2019-09-05T19:00:00Z"),
        match(2, "Suomi", "Kreikka", "2020-10-11T19:00:00Z"),
        match(3, "Tanska", "Suomi", "2021-06-12T19:00:00Z"),
      ],
    });

    const result = await load();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.years.map((y) => y.year)).toEqual([2021, 2020, 2019]);
    expect(result.years.map((y) => y.matches.length)).toEqual([1, 1, 1]);
  });

  it("asks for each year with its own competition id", async () => {
    await load();

    const requested = getSeasonCategoryNameMapMock.mock.calls.map((call) => call[0]);
    expect(requested).toContain("maajp18");
    expect(requested).toContain("maajp2026");
    expect(requested).not.toContain("maajp2021");
  });
});

/**
 * Helmarit's data differs from Huuhkajat's in ways that are ordinary for it
 * and would have been anomalies for the men. See specs/018-helmarit.md.
 */
describe("getNationalTeamYears — Helmarit", () => {
  async function loadWomens() {
    const { getNationalTeamYears } = await import("@/lib/national-team-service");
    const { WOMENS_TEAM } = await import("@/lib/national-team");
    return getNationalTeamYears(WOMENS_TEAM);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonCategoryNameMapMock.mockResolvedValue({});
    getSeasonMatchListMock.mockResolvedValue({ status: "empty" });
  });

  it("selects Helmarit categories and ignores Huuhkajat sharing the bucket", async () => {
    getSeasonCategoryNameMapMock.mockImplementation(async (competitionId) =>
      competitionId === "maajp2026"
        ? { WWCQ: "MM-karsinnat Helmarit", WCQ: "MM-karsinnat Huuhkajat" }
        : {}
    );
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [match(1, "Suomi", "Ruotsi")],
    });

    await loadWomens();

    const asked = getSeasonMatchListMock.mock.calls.map((call) => call[0]);
    expect(asked).toContain("WWCQ");
    expect(asked).not.toContain("WCQ");
  });

  /**
   * `maajp2024/Naiset-A` is 3 of 3 other teams', `maajp2025/WEC` 6 of 6. A
   * category filtering down to nothing is ordinary here, not a failure.
   */
  it("treats a category with no Finland match at all as empty, not an error", async () => {
    getSeasonCategoryNameMapMock.mockImplementation(async (competitionId) =>
      competitionId === "maajp2026" ? { WEC: "EM-lopputurnaus Helmarit" } : {}
    );
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [match(1, "Ruotsi", "Norja"), match(2, "Tanska", "Islanti")],
    });

    await expect(loadWomens()).resolves.toEqual({ status: "empty" });
  });

  /** `maajp18` holds four calendar years of Helmarit matches, not three. */
  it("splits maajp18 across all four years it spans", async () => {
    getSeasonCategoryNameMapMock.mockImplementation(async (competitionId) =>
      competitionId === "maajp18" ? { "Naiset-A": "Muut A-maaottelut Helmarit" } : {}
    );
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [
        match(1, "Suomi", "Ruotsi", "2018-06-05T16:00:00Z"),
        match(2, "Norja", "Suomi", "2019-06-05T16:00:00Z"),
        match(3, "Suomi", "Tanska", "2020-09-18T16:00:00Z"),
        match(4, "Islanti", "Suomi", "2021-04-13T16:00:00Z"),
      ],
    });

    const result = await loadWomens();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.years.map((y) => y.year)).toEqual([2021, 2020, 2019, 2018]);
  });

  it("renames the friendlies TASO relabelled between buckets", async () => {
    getSeasonCategoryNameMapMock.mockImplementation(async (competitionId) =>
      competitionId === "maajp18" ? { "Naiset-A": "Muut A-maaottelut Helmarit" } : {}
    );
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [match(1, "Suomi", "Ruotsi", "2018-06-05T16:00:00Z")],
    });

    const result = await loadWomens();

    expect(result.status === "ok" && result.years[0]?.matches[0]?.competitionName).toBe(
      "A-maaottelut"
    );
  });

  it("renders an English TASO name in Finnish", async () => {
    getSeasonCategoryNameMapMock.mockImplementation(async (competitionId) =>
      competitionId === "maajp18" ? { WECQ: "EM-karsinnat Helmarit" } : {}
    );
    getSeasonMatchListMock.mockResolvedValue({
      status: "ok",
      matches: [match(1, "Suomi", "Croatia"), match(2, "Scotland", "Suomi")],
    });

    const result = await loadWomens();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const names = result.years.flatMap((y) =>
      y.matches.flatMap((m) => [m.homeTeamName, m.awayTeamName])
    );
    expect(names).toContain("Kroatia");
    expect(names).toContain("Skotlanti");
    expect(names).not.toContain("Croatia");
    expect(names).not.toContain("Scotland");
  });
});
