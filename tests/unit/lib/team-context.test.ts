import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamPageSource } from "@/lib/team-context";

/**
 * The query is exercised against a real Postgres in
 * `tests/integration/team-context.test.ts`. These cover the decisions made
 * around it: which rows a route is allowed to resolve from, the placeholder
 * short-circuit, and the error path.
 */

const rowsMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: () => rowsMock() }) }),
      }),
    }),
  },
}));

vi.mock("@/lib/logger", () => ({ logger: { error: loggerErrorMock } }));

const DOMESTIC: TeamPageSource = { kind: "taso", bucket: "domestic" };
const FOREIGN: TeamPageSource = { kind: "football-data", region: "foreign" };
const NATIONAL_TEAMS: TeamPageSource = { kind: "football-data", region: "national-teams" };

async function load() {
  const module = await import("@/lib/team-context");
  return module.getTeamContext;
}

describe("getTeamContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("resolves a Finnish team's competition from the category its newest match was played in", async () => {
    rowsMock.mockResolvedValue([{ categoryId: "M2", seasonId: 2026 }]);
    const getTeamContext = await load();

    expect(await getTeamContext(DOMESTIC, 60496)).toEqual({
      status: "ok",
      context: { competitionCode: "M2", seasonId: 2026 },
    });
  });

  it("resolves a foreign team from the competition its newest match was played in", async () => {
    rowsMock.mockResolvedValue([{ competitionCode: "BL1", seasonId: 2026 }]);
    const getTeamContext = await load();

    expect(await getTeamContext(FOREIGN, 721)).toEqual({
      status: "ok",
      context: { competitionCode: "BL1", seasonId: 2026 },
    });
  });

  it("answers not_found when the team has no stored match", async () => {
    rowsMock.mockResolvedValue([]);
    const getTeamContext = await load();

    expect(await getTeamContext(DOMESTIC, 999999)).toEqual({ status: "not_found" });
  });

  it("refuses the placeholder id without querying at all", async () => {
    const getTeamContext = await load();

    expect(await getTeamContext(DOMESTIC, 0)).toEqual({ status: "not_found" });
    expect(rowsMock).not.toHaveBeenCalled();
  });

  it("refuses a non-integer id without querying at all", async () => {
    const getTeamContext = await load();

    expect(await getTeamContext(FOREIGN, Number.NaN)).toEqual({ status: "not_found" });
    expect(rowsMock).not.toHaveBeenCalled();
  });

  it("refuses a competition from another region without querying at all", async () => {
    // `/ulkomaat/joukkue/1?kilpailu=WC` is not a narrower question, it is a
    // different one — and answering it would render another region's page.
    const getTeamContext = await load();

    expect(await getTeamContext(FOREIGN, 57, { competitionCode: "WC" })).toEqual({
      status: "not_found",
    });
    expect(rowsMock).not.toHaveBeenCalled();
  });

  it("accepts a competition that belongs to the route's own region", async () => {
    rowsMock.mockResolvedValue([{ competitionCode: "WC", seasonId: 2026 }]);
    const getTeamContext = await load();

    expect(await getTeamContext(NATIONAL_TEAMS, 770, { competitionCode: "WC" })).toEqual({
      status: "ok",
      context: { competitionCode: "WC", seasonId: 2026 },
    });
  });

  it("narrows to the categories of a competition the URL names", async () => {
    rowsMock.mockResolvedValue([{ categoryId: "VL", seasonId: 2020 }]);
    const getTeamContext = await load();

    expect(
      await getTeamContext(DOMESTIC, 60901, { competitionCode: "VL", seasonId: 2020 })
    ).toEqual({ status: "ok", context: { competitionCode: "VL", seasonId: 2020 } });
  });

  it("narrows a foreign lookup to a season the URL names", async () => {
    rowsMock.mockResolvedValue([{ competitionCode: "PL", seasonId: 2024 }]);
    const getTeamContext = await load();

    expect(await getTeamContext(FOREIGN, 57, { seasonId: 2024 })).toEqual({
      status: "ok",
      context: { competitionCode: "PL", seasonId: 2024 },
    });
  });

  it("answers not_found when a foreign team has no stored match", async () => {
    rowsMock.mockResolvedValue([]);
    const getTeamContext = await load();

    expect(await getTeamContext(FOREIGN, 999999)).toEqual({ status: "not_found" });
  });

  it("answers not_found for a category no competition in the picker claims", async () => {
    // The registry is hand-maintained while TASO publishes more categories than
    // it lists, so a row can carry one with no page behind it.
    rowsMock.mockResolvedValue([{ categoryId: "X99", seasonId: 2026 }]);
    const getTeamContext = await load();

    expect(await getTeamContext(DOMESTIC, 60496)).toEqual({ status: "not_found" });
  });

  it("answers error, and logs, when the query throws", async () => {
    rowsMock.mockRejectedValue(new Error("connection refused"));
    const getTeamContext = await load();

    expect(await getTeamContext(DOMESTIC, 60496)).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamProviderId: 60496 }),
      "Unable to resolve the team's own context"
    );
  });
});
