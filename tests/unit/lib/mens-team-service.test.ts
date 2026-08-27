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
  const { getMensTeamYears } = await import("@/lib/mens-team-service");
  return getMensTeamYears();
}

describe("getMensTeamYears", () => {
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
  it("fails the whole page when a year's categories cannot be read", async () => {
    getSeasonCategoryNameMapMock.mockRejectedValue(new Error("TASO request failed: 500"));

    await expect(load()).resolves.toEqual({ status: "error" });
  });

  it("fails the whole page when one category's matches fail", async () => {
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
