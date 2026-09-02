import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamPageSource } from "@/lib/team-context";

/**
 * The grouped query runs against a real Postgres in
 * `tests/integration/team-seasons.test.ts`. These cover what surrounds it: the
 * category-to-competition mapping, the short-circuits, and the ordering the
 * selector depends on.
 */
const groupedMock = vi.fn();
const newestMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: () => groupedMock(),
          orderBy: () => ({ limit: () => newestMock() }),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/logger", () => ({ logger: { error: loggerErrorMock } }));

const DOMESTIC: TeamPageSource = { kind: "taso", bucket: "domestic" };
const FOREIGN: TeamPageSource = { kind: "football-data", region: "foreign" };

async function load() {
  return import("@/lib/team-seasons");
}

describe("getTeamSeasons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    newestMock.mockResolvedValue([
      { homeTeamProviderId: 60561, homeTeamName: "FC Haka", awayTeamName: "KuPS" },
    ]);
  });

  it("maps a Finnish club's categories to competitions, newest season first", async () => {
    groupedMock.mockResolvedValue([
      { categoryId: "VL", seasonId: 2025, matches: 27 },
      { categoryId: "M1L", seasonId: 2026, matches: 27 },
      { categoryId: "MSC", seasonId: 2026, matches: 2 },
    ]);
    const { getTeamSeasons } = await load();

    const result = await getTeamSeasons(DOMESTIC, 60561);

    expect(result).toEqual({
      status: "ok",
      seasons: [
        // Within a season, the competition with more matches comes first.
        { competitionCode: "M1L", seasonId: 2026, matches: 27 },
        { competitionCode: "MSC", seasonId: 2026, matches: 2 },
        { competitionCode: "VL", seasonId: 2025, matches: 27 },
      ],
    });
  });

  it("counts a competition once when a season spans two of its category eras", async () => {
    // A competition outlives its own `category_id`; both eras are the same
    // competition to a reader.
    // `P21SM` has been published as `ASM`, `P20SM` and `P21SM` in turn — all
    // three are one competition in the picker.
    groupedMock.mockResolvedValue([
      { categoryId: "P20SM", seasonId: 2020, matches: 8 },
      { categoryId: "ASM", seasonId: 2020, matches: 4 },
    ]);
    const { getTeamSeasons } = await load();

    const result = await getTeamSeasons(DOMESTIC, 60561);

    if (result.status !== "ok") throw new Error("expected seasons");
    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]?.matches).toBe(12);
  });

  it("orders two competitions with equal match counts deterministically", async () => {
    // A club can play two cups the same season and win one match in each. The
    // order must not change between renders, so the code breaks the tie.
    groupedMock.mockResolvedValue([
      { categoryId: "NSC", seasonId: 2026, matches: 1 },
      { categoryId: "MSC", seasonId: 2026, matches: 1 },
    ]);
    const { getTeamSeasons } = await load();

    const result = await getTeamSeasons(DOMESTIC, 60561);

    if (result.status !== "ok") throw new Error("expected seasons");
    expect(result.seasons.map((season) => season.competitionCode)).toEqual(["MSC", "NSC"]);
  });

  it("skips a category no competition in the picker claims", async () => {
    groupedMock.mockResolvedValue([
      { categoryId: "X99", seasonId: 2026, matches: 5 },
      { categoryId: "VL", seasonId: 2025, matches: 27 },
    ]);
    const { getTeamSeasons } = await load();

    const result = await getTeamSeasons(DOMESTIC, 60561);

    if (result.status !== "ok") throw new Error("expected seasons");
    expect(result.seasons.map((season) => season.competitionCode)).toEqual(["VL"]);
  });

  it("answers not_found when every stored row is an unclaimed category", async () => {
    groupedMock.mockResolvedValue([{ categoryId: "X99", seasonId: 2026, matches: 5 }]);
    const { getTeamSeasons } = await load();

    expect(await getTeamSeasons(DOMESTIC, 60561)).toEqual({ status: "not_found" });
  });

  it("returns a foreign club's competitions as stored", async () => {
    groupedMock.mockResolvedValue([
      { competitionCode: "ELC", seasonId: 2024, matches: 46 },
      { competitionCode: "PL", seasonId: 2025, matches: 38 },
    ]);
    newestMock.mockResolvedValue([
      { homeTeamProviderId: 999, homeTeamName: "Arsenal FC", awayTeamName: "Burnley FC" },
    ]);
    const { getTeamSeasons } = await load();

    const result = await getTeamSeasons(FOREIGN, 328);

    // The club was the away side of its newest match, so that is its name.
    expect(result).toEqual({
      status: "ok",
      seasons: [
        { competitionCode: "PL", seasonId: 2025, matches: 38 },
        { competitionCode: "ELC", seasonId: 2024, matches: 46 },
      ],
    });
  });

  it("answers not_found for a club with nothing stored", async () => {
    groupedMock.mockResolvedValue([]);
    const { getTeamSeasons } = await load();

    expect(await getTeamSeasons(FOREIGN, 999999)).toEqual({ status: "not_found" });
  });

  it("refuses a placeholder or unstorable id without querying", async () => {
    const { getTeamSeasons } = await load();

    expect(await getTeamSeasons(DOMESTIC, 0)).toEqual({ status: "not_found" });
    expect(await getTeamSeasons(DOMESTIC, 99999999999)).toEqual({ status: "not_found" });
    expect(groupedMock).not.toHaveBeenCalled();
  });

  it("answers error, and logs, when the query throws", async () => {
    groupedMock.mockRejectedValue(new Error("connection refused"));
    const { getTeamSeasons } = await load();

    expect(await getTeamSeasons(DOMESTIC, 60561)).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamProviderId: 60561 }),
      "Unable to read a team's seasons"
    );
  });

  it("asks for a club's name separately, and only when a page needs one", async () => {
    // A page that renders matches reads the name off the first of them; this
    // lookup is the "played elsewhere" path's, and its own query.
    groupedMock.mockResolvedValue([{ categoryId: "VL", seasonId: 2025, matches: 27 }]);
    newestMock.mockResolvedValue([
      { homeTeamProviderId: 60561, homeTeamName: "FC Haka", awayTeamName: "KuPS" },
    ]);
    const { getTeamSeasons, getTeamName } = await load();

    await getTeamSeasons(DOMESTIC, 60561);
    expect(newestMock).not.toHaveBeenCalled();

    expect(await getTeamName(DOMESTIC, 60561)).toEqual({ status: "ok", name: "FC Haka" });
  });

  it("reads a foreign club's name, from whichever side it played", async () => {
    newestMock.mockResolvedValue([
      { homeTeamProviderId: 999, homeTeamName: "Arsenal FC", awayTeamName: "Burnley FC" },
    ]);
    const { getTeamName } = await load();

    expect(await getTeamName(FOREIGN, 328)).toEqual({ status: "ok", name: "Burnley FC" });
  });

  it("reports an error rather than a missing name when the lookup throws", async () => {
    // A page cannot tell an unnamed club from an outage if both are "no name".
    newestMock.mockRejectedValue(new Error("connection refused"));
    const { getTeamName } = await load();

    expect(await getTeamName(DOMESTIC, 60561)).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamProviderId: 60561 }),
      "Unable to read a team's name"
    );
  });

  it("has no name for a club nothing is stored for", async () => {
    newestMock.mockResolvedValue([]);
    const { getTeamName } = await load();

    expect(await getTeamName(DOMESTIC, 60561)).toEqual({ status: "not_found" });
    expect(await getTeamName(DOMESTIC, 0)).toEqual({ status: "not_found" });
  });
});

describe("reading a club's seasons", () => {
  const seasons = [
    { competitionCode: "M1L", seasonId: 2026, matches: 27 },
    { competitionCode: "MSC", seasonId: 2026, matches: 2 },
    { competitionCode: "VL", seasonId: 2025, matches: 27 },
  ];

  it("lands on the competition with more matches that season", async () => {
    const { competitionForSeason } = await load();

    expect(competitionForSeason(seasons, 2026)).toBe("M1L");
    expect(competitionForSeason(seasons, 2025)).toBe("VL");
    expect(competitionForSeason(seasons, 2019)).toBeNull();
  });

  it("lists every competition a club played in one season", async () => {
    const { competitionsInSeason } = await load();

    expect(competitionsInSeason(seasons, 2026).map((entry) => entry.competitionCode)).toEqual([
      "M1L",
      "MSC",
    ]);
  });

  it("maps every season to the competition the selector should land on", async () => {
    const { teamSeasonsView } = await load();

    const view = teamSeasonsView(seasons, 2026, {
      season: String,
      competition: (code: string) => code,
      href: (code: string, year: number) => `/team?kilpailu=${code}&kausi=${year}`,
      selectable: () => true,
    });

    expect(view.seasonCompetitions).toEqual({ 2025: "VL", 2026: "M1L" });
  });

  it("never maps a season to a competition the page would reject", async () => {
    // The busiest competition in a season can be the unreachable one; sending
    // the selector there lands the reader on a fallback season instead.
    const { teamSeasonsView } = await load();

    const view = teamSeasonsView(
      [
        { competitionCode: "M1L", seasonId: 2026, matches: 27 },
        { competitionCode: "MSC", seasonId: 2026, matches: 2 },
      ],
      2026,
      {
        season: String,
        competition: (code: string) => code,
        href: (code: string, year: number) => `/team?kilpailu=${code}&kausi=${year}`,
        selectable: (code: string) => code !== "M1L",
      }
    );

    expect(view.seasonCompetitions).toEqual({ 2026: "MSC" });
  });
});

describe("teamSeasonsView", () => {
  const labels = {
    season: String,
    competition: (code: string) => code,
    href: (code: string, year: number) => `/team?kilpailu=${code}&kausi=${year}`,
    selectable: () => true,
  };
  const seasons = [
    { competitionCode: "M1L", seasonId: 2026, matches: 27 },
    { competitionCode: "VL", seasonId: 2025, matches: 27 },
  ];

  it("always offers the season being shown, even one the club did not play", async () => {
    // A dropdown without the current season has nothing selected, so the
    // browser shows its first option and the control contradicts the heading.
    const { teamSeasonsView } = await load();

    const view = teamSeasonsView(seasons, 2019, labels);

    expect(view.offeredSeasons.map((option) => option.seasonId)).toEqual([2026, 2025, 2019]);
  });

  it("does not offer a season the page could not render", async () => {
    // A raised season floor leaves stored rows behind; offering one sends a
    // `kausi` the page rejects and lands the reader somewhere else entirely.
    const { teamSeasonsView } = await load();

    const view = teamSeasonsView(seasons, 2026, {
      ...labels,
      selectable: (_code, year) => year >= 2026,
    });

    expect(view.offeredSeasons.map((option) => option.seasonId)).toEqual([2026]);
    expect(view.newest?.label).toBe("M1L 2026");
  });

  it("leaves nothing to offer but the current season when none is reachable", async () => {
    const { teamSeasonsView } = await load();

    const view = teamSeasonsView(seasons, 2020, { ...labels, selectable: () => false });

    expect(view.offeredSeasons.map((option) => option.seasonId)).toEqual([2020]);
    expect(view.newest).toBeNull();
    expect(view.sameSeason).toEqual([]);
  });
});
