import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `"use server"` boundary for team search, from specs/027-team-search.md.
 *
 * The gate is the point of these: a server action is a public endpoint whether
 * or not anything renders a control for it, so hiding the field is not what
 * keeps a signed-out caller out.
 */
const { currentUserId, searchTeams, logger } = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  searchTeams: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/team-search", async () => {
  // The real predicate, so the action and the query agree on what is too short.
  const actual = await vi.importActual<typeof import("@/lib/team-search")>("@/lib/team-search");
  return { ...actual, searchTeams };
});

beforeEach(() => {
  currentUserId.mockReset();
  searchTeams.mockReset();
  logger.error.mockReset();
  currentUserId.mockResolvedValue("user-1");
  searchTeams.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchTeamsAction", () => {
  it("refuses a signed-out caller without querying", async () => {
    currentUserId.mockResolvedValue(null);
    const { searchTeamsAction } = await import("@/lib/team-search-actions");

    expect(await searchTeamsAction("honka")).toEqual({ ok: false, reason: "unauthenticated" });
    expect(searchTeams).not.toHaveBeenCalled();
  });

  it("checks the session before the term, so a short term cannot probe it", async () => {
    // Answering `too-short` to a signed-out caller would confirm the endpoint
    // exists and behaves differently for them.
    currentUserId.mockResolvedValue(null);
    const { searchTeamsAction } = await import("@/lib/team-search-actions");

    expect(await searchTeamsAction("a")).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("refuses a term below the minimum without querying", async () => {
    const { searchTeamsAction } = await import("@/lib/team-search-actions");

    expect(await searchTeamsAction("a")).toEqual({ ok: false, reason: "too-short" });
    expect(searchTeams).not.toHaveBeenCalled();
  });

  it("returns what the search found", async () => {
    const team = {
      source: "taso",
      teamProviderId: 7,
      name: "FC Honka",
      region: "kotimaa",
      competitionName: "Veikkausliiga",
      seasonId: 2019,
    };
    searchTeams.mockResolvedValue([team]);
    const { searchTeamsAction } = await import("@/lib/team-search-actions");

    expect(await searchTeamsAction("honka")).toEqual({ ok: true, teams: [team] });
  });

  it("reports an empty result as a success, not as a failure", async () => {
    // "Nothing matched" and "the search broke" need different words in front of
    // the reader, so they cannot share a reason.
    const { searchTeamsAction } = await import("@/lib/team-search-actions");

    expect(await searchTeamsAction("zzzz")).toEqual({ ok: true, teams: [] });
  });

  it("maps a thrown error to a failure and logs it", async () => {
    searchTeams.mockRejectedValue(new Error("database down"));
    const { searchTeamsAction } = await import("@/lib/team-search-actions");

    expect(await searchTeamsAction("honka")).toEqual({ ok: false, reason: "failed" });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("maps a failure to read the session to a failure, not to signed-out", async () => {
    // Claiming "signed out" because the database was unreachable would tell the
    // reader something untrue about their own account.
    currentUserId.mockRejectedValue(new Error("session read failed"));
    const { searchTeamsAction } = await import("@/lib/team-search-actions");

    expect(await searchTeamsAction("honka")).toEqual({ ok: false, reason: "failed" });
  });
});
