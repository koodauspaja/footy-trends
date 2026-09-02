import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamContextResult, TeamPageSource } from "@/lib/team-context";

const getTeamContextMock = vi.fn<(...args: unknown[]) => Promise<TeamContextResult>>();

vi.mock("@/lib/team-context", () => ({ getTeamContext: getTeamContextMock }));

const SOURCE: TeamPageSource = { kind: "taso", bucket: "domestic" };
const NEWEST: TeamContextResult = {
  status: "ok",
  context: { competitionCode: "M2", seasonId: 2026 },
};

async function load() {
  const module = await import("@/lib/team-page-context");
  return module;
}

describe("seasonCandidate", () => {
  it("accepts a value shaped like a season", async () => {
    const { seasonCandidate } = await load();

    expect(seasonCandidate("2019")).toBe(2019);
  });

  it("rejects anything else, including a repeated parameter", async () => {
    const { seasonCandidate } = await load();

    expect(seasonCandidate(undefined)).toBeUndefined();
    expect(seasonCandidate("kausi")).toBeUndefined();
    expect(seasonCandidate("-1")).toBeUndefined();
    expect(seasonCandidate(["2019", "2020"])).toBeUndefined();
  });
});

describe("resolveTeamDefaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("uses the team's newest match when the URL says nothing", async () => {
    getTeamContextMock.mockResolvedValue(NEWEST);
    const { resolveTeamDefaults } = await load();

    expect(await resolveTeamDefaults(SOURCE, 60496, {})).toEqual({
      status: "ok",
      defaults: { competitionCode: "M2", seasonId: 2026 },
    });
  });

  it("answers not_found when the team has no stored match at all", async () => {
    getTeamContextMock.mockResolvedValue({ status: "not_found" });
    const { resolveTeamDefaults } = await load();

    expect(await resolveTeamDefaults(SOURCE, 999999, {})).toEqual({ status: "not_found" });
  });

  it("passes an error through rather than calling the team unknown", async () => {
    // A database that cannot be reached is not a team that does not exist.
    getTeamContextMock.mockResolvedValue({ status: "error" });
    const { resolveTeamDefaults } = await load();

    expect(await resolveTeamDefaults(SOURCE, 60496, {})).toEqual({ status: "error" });
  });

  it("narrows to the newest season within a competition the URL names", async () => {
    getTeamContextMock
      .mockResolvedValueOnce(NEWEST)
      .mockResolvedValueOnce({ status: "ok", context: { competitionCode: "VL", seasonId: 2019 } });
    const { resolveTeamDefaults } = await load();

    expect(await resolveTeamDefaults(SOURCE, 60496, { competitionCode: "VL" })).toEqual({
      status: "ok",
      defaults: { competitionCode: "VL", seasonId: 2019 },
    });
  });

  it("keeps the named competition even when the team never played it", async () => {
    // The page renders that competition and says the team is not in it, which
    // is what it has always done for an explicit pair.
    getTeamContextMock.mockResolvedValueOnce(NEWEST).mockResolvedValueOnce({ status: "not_found" });
    const { resolveTeamDefaults } = await load();

    expect(await resolveTeamDefaults(SOURCE, 60496, { competitionCode: "VL" })).toEqual({
      status: "ok",
      defaults: { competitionCode: "M2", seasonId: 2026 },
    });
  });

  it("takes the competition of the newest match in a season the URL names", async () => {
    getTeamContextMock
      .mockResolvedValueOnce(NEWEST)
      .mockResolvedValueOnce({ status: "ok", context: { competitionCode: "M1", seasonId: 2019 } });
    const { resolveTeamDefaults } = await load();

    expect(await resolveTeamDefaults(SOURCE, 60496, { seasonId: 2019 })).toEqual({
      status: "ok",
      defaults: { competitionCode: "M1", seasonId: 2019 },
    });
  });

  it("drops a season filter that matches nothing, keeping the team's own competition", async () => {
    // A season the team never played says nothing about which competition the
    // reader wanted. Falling back to the region's default is what served 12 of
    // 1,315 Finnish teams before this existed.
    getTeamContextMock
      .mockResolvedValueOnce(NEWEST)
      .mockResolvedValueOnce({ status: "not_found" })
      .mockResolvedValueOnce(NEWEST);
    const { resolveTeamDefaults } = await load();

    expect(await resolveTeamDefaults(SOURCE, 60496, { seasonId: 1999 })).toEqual({
      status: "ok",
      defaults: { competitionCode: "M2", seasonId: 2026 },
    });
  });

  it("keeps a competition filter while dropping the season it was paired with", async () => {
    getTeamContextMock
      .mockResolvedValueOnce(NEWEST)
      .mockResolvedValueOnce({ status: "not_found" })
      .mockResolvedValueOnce({ status: "ok", context: { competitionCode: "VL", seasonId: 2020 } });
    const { resolveTeamDefaults } = await load();

    expect(
      await resolveTeamDefaults(SOURCE, 60496, { competitionCode: "VL", seasonId: 1999 })
    ).toEqual({ status: "ok", defaults: { competitionCode: "VL", seasonId: 2020 } });
    expect(getTeamContextMock).toHaveBeenLastCalledWith(SOURCE, 60496, { competitionCode: "VL" });
  });

  it("falls back to the newest match when even the narrowed retry finds nothing", async () => {
    getTeamContextMock
      .mockResolvedValueOnce(NEWEST)
      .mockResolvedValueOnce({ status: "not_found" })
      .mockResolvedValueOnce({ status: "error" });
    const { resolveTeamDefaults } = await load();

    expect(
      await resolveTeamDefaults(SOURCE, 60496, { competitionCode: "VL", seasonId: 1999 })
    ).toEqual({ status: "ok", defaults: { competitionCode: "M2", seasonId: 2026 } });
  });
});
