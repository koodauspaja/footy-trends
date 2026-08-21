import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSeasonGroups,
  getSeasonMatches,
  normalizeTasoMatch,
  seasonFromCompetitionId,
} from "@/lib/taso";

const { loggerInfoMock, loggerErrorMock } = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: loggerInfoMock, error: loggerErrorMock } }));

describe("taso mapping", () => {
  const originalApiKey = process.env.TASO_API_KEY;

  beforeEach(() => {
    vi.unstubAllEnvs();
    loggerInfoMock.mockReset();
    loggerErrorMock.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env.TASO_API_KEY = originalApiKey;
  });

  it("derives the season year from the competition_id's two-digit suffix", () => {
    expect(seasonFromCompetitionId("spljp26")).toBe(2026);
    expect(seasonFromCompetitionId("spljp15")).toBe(2015);
  });

  it("maps a played match, treating team_A as home, converting every string field to its real type", () => {
    const result = normalizeTasoMatch(
      {
        match_id: "123",
        status: "Played",
        round_id: "5",
        group_id: "1",
        group_name: "Runkosarja",
        date: "2026-05-01",
        time: "18:00:00",
        time_zone_offset: "+0300",
        team_A_id: "10",
        team_A_name: "HJK",
        team_B_id: "20",
        team_B_name: "KuPS",
        fs_A: "2",
        fs_B: "1",
      },
      "spljp26",
      2026
    );

    expect(result).toMatchObject({
      providerMatchId: 123,
      competitionCode: "spljp26",
      seasonId: 2026,
      groupId: 1,
      groupName: "Runkosarja",
      status: "FINISHED",
      matchday: 5,
      homeTeamProviderId: 10,
      homeTeamName: "HJK",
      awayTeamProviderId: 20,
      awayTeamName: "KuPS",
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  it("maps a not-yet-played fixture's empty-string score to null goals and SCHEDULED status", () => {
    const result = normalizeTasoMatch(
      {
        match_id: "456",
        status: "Fixture",
        round_id: "6",
        group_id: "1",
        group_name: "Runkosarja",
        date: "2026-05-08",
        time: "18:00:00",
        time_zone_offset: "+0300",
        team_A_id: "10",
        team_A_name: "HJK",
        team_B_id: "20",
        team_B_name: "KuPS",
        fs_A: "",
        fs_B: "",
      },
      "spljp26",
      2026
    );

    expect(result).toMatchObject({
      providerMatchId: 456,
      status: "SCHEDULED",
      homeGoals: null,
      awayGoals: null,
    });
  });

  it("passes through an unrecognized status verbatim rather than crashing, e.g. Live", () => {
    const result = normalizeTasoMatch(
      {
        match_id: "789",
        status: "Live",
        round_id: "6",
        group_id: "1",
        group_name: "Runkosarja",
        date: "2026-05-08",
        time: "18:00:00",
        time_zone_offset: "+0300",
        team_A_id: "10",
        team_A_name: "HJK",
        team_B_id: "20",
        team_B_name: "KuPS",
        fs_A: "0",
        fs_B: "0",
      },
      "spljp26",
      2026
    );

    expect(result?.status).toBe("Live");
  });

  it("maps a missing round_id to null matchday", () => {
    const result = normalizeTasoMatch(
      {
        match_id: "1",
        status: "Played",
        group_id: "4",
        group_name: "Eurolopputurnaus",
        date: "2022-11-01",
        time: "18:00:00",
        time_zone_offset: "+0200",
        team_A_id: "10",
        team_A_name: "HJK",
        team_B_id: "20",
        team_B_name: "KuPS",
        fs_A: "1",
        fs_B: "0",
      },
      "spljp22",
      2022
    );

    expect(result).toMatchObject({ matchday: null });
  });

  it("rejects matches missing required fields", () => {
    expect(normalizeTasoMatch({ status: "Played" }, "spljp26", 2026)).toBeNull();
    expect(normalizeTasoMatch({ match_id: "1" }, "spljp26", 2026)).toBeNull();
    expect(
      normalizeTasoMatch(
        { match_id: "1", status: "Played", date: "2026-05-01", time: "18:00:00" },
        "spljp26",
        2026
      )
    ).toBeNull();
    expect(
      normalizeTasoMatch(
        {
          match_id: "1",
          status: "Played",
          date: "2026-05-01",
          time: "18:00:00",
          time_zone_offset: "+0300",
          group_id: "1",
          group_name: "Runkosarja",
          team_A_id: "10",
          team_A_name: "HJK",
        },
        "spljp26",
        2026
      )
    ).toBeNull();
  });

  it("converts a Helsinki summer-time (EEST, +0300) kickoff to the correct UTC instant", () => {
    const result = normalizeTasoMatch(
      {
        match_id: "1",
        status: "Played",
        round_id: "1",
        group_id: "1",
        group_name: "Runkosarja",
        date: "2026-07-01",
        time: "18:00:00",
        time_zone_offset: "+0300",
        team_A_id: "10",
        team_A_name: "HJK",
        team_B_id: "20",
        team_B_name: "KuPS",
        fs_A: "1",
        fs_B: "0",
      },
      "spljp26",
      2026
    );

    expect(result?.kickoffAt).toEqual(new Date("2026-07-01T15:00:00Z"));
  });

  it("converts a Helsinki winter-time (EET, +0200) kickoff to the correct UTC instant", () => {
    const result = normalizeTasoMatch(
      {
        match_id: "1",
        status: "Played",
        round_id: "1",
        group_id: "1",
        group_name: "Runkosarja",
        date: "2026-02-01",
        time: "18:00:00",
        time_zone_offset: "+0200",
        team_A_id: "10",
        team_A_name: "HJK",
        team_B_id: "20",
        team_B_name: "KuPS",
        fs_A: "1",
        fs_B: "0",
      },
      "spljp26",
      2026
    );

    expect(result?.kickoffAt).toEqual(new Date("2026-02-01T16:00:00Z"));
  });

  it("handles a negative UTC offset, even though Helsinki itself is never negative", () => {
    const result = normalizeTasoMatch(
      {
        match_id: "1",
        status: "Played",
        round_id: "1",
        group_id: "1",
        group_name: "Runkosarja",
        date: "2026-07-01",
        time: "12:00:00",
        time_zone_offset: "-0100",
        team_A_id: "10",
        team_A_name: "HJK",
        team_B_id: "20",
        team_B_name: "KuPS",
        fs_A: "1",
        fs_B: "0",
      },
      "spljp26",
      2026
    );

    expect(result?.kickoffAt).toEqual(new Date("2026-07-01T13:00:00Z"));
  });

  it("throws when the kickoff date, time, or offset cannot be parsed", () => {
    expect(() =>
      normalizeTasoMatch(
        {
          match_id: "1",
          status: "Played",
          round_id: "1",
          group_id: "1",
          group_name: "Runkosarja",
          date: "not-a-date",
          time: "18:00:00",
          time_zone_offset: "+0300",
          team_A_id: "10",
          team_A_name: "HJK",
          team_B_id: "20",
          team_B_name: "KuPS",
        },
        "spljp26",
        2026
      )
    ).toThrow("Unparseable TASO kickoff");
  });

  it("normalizes matches fetched from the provider, dropping incomplete ones", async () => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          matches: [
            {
              match_id: "1",
              status: "Played",
              round_id: "1",
              group_id: "1",
              group_name: "Runkosarja",
              date: "2026-05-01",
              time: "18:00:00",
              time_zone_offset: "+0300",
              team_A_id: "10",
              team_A_name: "HJK",
              team_B_id: "20",
              team_B_name: "KuPS",
              fs_A: "2",
              fs_B: "1",
            },
            { match_id: "2", status: "Played" },
          ],
        }),
      })
    );

    const result = await getSeasonMatches("spljp26");

    expect(result).toEqual([expect.objectContaining({ providerMatchId: 1, seasonId: 2026 })]);
  });

  it("requests the season's matches scoped to the VL category, with the configured api key and required headers, and logs the call", async () => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ matches: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await getSeasonMatches("spljp26");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://spl.torneopal.net/taso/rest/getMatches?competition_id=spljp26&category_id=VL",
      {
        headers: {
          Accept: "json/test-api-key",
          Referer: "https://tulospalvelu.palloliitto.fi/",
          Origin: "https://tulospalvelu.palloliitto.fi",
          "User-Agent": expect.any(String),
        },
      }
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200 }),
      "TASO request completed"
    );
  });

  it("treats a response with no matches field as no matches", async () => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    );

    await expect(getSeasonMatches("spljp26")).resolves.toEqual([]);
  });

  it("throws when the API key is not configured", async () => {
    process.env.TASO_API_KEY = "";

    await expect(getSeasonMatches("spljp26")).rejects.toThrow("TASO_API_KEY is not configured");
  });

  it("logs and throws when the provider request fails", async () => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(getSeasonMatches("spljp26")).rejects.toThrow("TASO request failed: 403");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
      "TASO request failed"
    );
  });

  it("logs and rethrows when the fetch itself rejects", async () => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    const networkError = new Error("network unreachable");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    await expect(getSeasonMatches("spljp26")).rejects.toThrow("network unreachable");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: networkError }),
      "TASO request failed"
    );
  });

  it("requests season groups from their own endpoint, scoped to the VL category", async () => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ groups: [{ group_id: "1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const groups = await getSeasonGroups("spljp26");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://spl.torneopal.net/taso/rest/getGroups?competition_id=spljp26&category_id=VL",
      expect.any(Object)
    );
    expect(groups).toEqual([{ group_id: "1" }]);
  });

  it("treats a groups response with no groups field as no groups", async () => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    );

    await expect(getSeasonGroups("spljp26")).resolves.toEqual([]);
  });
});
