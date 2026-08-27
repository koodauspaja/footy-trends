import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentSeason,
  getSeasonCategoryNames,
  getSeasonGroups,
  getSeasonMatches,
  normalizeGroupTeams,
  normalizeTasoMatch,
} from "@/lib/taso";

const { loggerInfoMock, loggerErrorMock, loggerWarnMock } = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: loggerInfoMock, error: loggerErrorMock, warn: loggerWarnMock },
}));

describe("taso mapping", () => {
  const originalApiKey = process.env.TASO_API_KEY;

  beforeEach(() => {
    vi.unstubAllEnvs();
    loggerInfoMock.mockReset();
    loggerErrorMock.mockReset();
    loggerWarnMock.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env.TASO_API_KEY = originalApiKey;
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
      "VL",
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
      "VL",
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
      "VL",
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
      "VL",
      2022
    );

    expect(result).toMatchObject({ matchday: null });
  });

  it("rejects matches missing required fields", () => {
    expect(normalizeTasoMatch({ status: "Played" }, "spljp26", "VL", 2026)).toBeNull();
    expect(normalizeTasoMatch({ match_id: "1" }, "spljp26", "VL", 2026)).toBeNull();
    expect(
      normalizeTasoMatch(
        { match_id: "1", status: "Played", date: "2026-05-01", time: "18:00:00" },
        "spljp26",
        "VL",
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
        "VL",
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
      "VL",
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
      "VL",
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
      "VL",
      2026
    );

    expect(result?.kickoffAt).toEqual(new Date("2026-07-01T13:00:00Z"));
  });

  it("skips a match with an empty date/time rather than throwing, so one bad row cannot break a season", () => {
    // 2022's Eurolopputurnausfinaali really has such a match: already
    // played, but TASO never gave it a kickoff. Before this was skipped it
    // threw, and the whole 2022 sync failed.
    const result = normalizeTasoMatch(
      {
        match_id: "2812547",
        status: "Played",
        round_id: "1",
        group_id: "5",
        group_name: "Eurolopputurnausfinaali",
        date: "",
        time: "",
        time_zone_offset: "+0139",
        team_A_id: "10",
        team_A_name: "FC Haka",
        team_B_id: "20",
        team_B_name: "HJK",
        fs_A: "1",
        fs_B: "0",
      },
      "spljp22",
      "VL",
      2022
    );

    expect(result).toBeNull();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: "2812547" }),
      "Skipping TASO match with an unparseable kickoff"
    );
  });

  it("skips a match whose date is present but malformed, logging it rather than throwing", () => {
    const result = normalizeTasoMatch(
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
      "VL",
      2026
    );

    expect(result).toBeNull();
    expect(loggerWarnMock).toHaveBeenCalled();
  });

  // Each of these matches the kickoff regexes but is not a real instant.
  // `Date.UTC` normalizes them all into valid-but-wrong dates, so without an
  // explicit range check the match would be stored at a kickoff it never had
  // instead of being skipped.
  it.each([
    ["an out-of-range month", "2026-99-15", "18:00:00", "+0300"],
    ["a day that does not exist in its month", "2026-02-31", "18:00:00", "+0300"],
    ["an out-of-range day", "2026-07-99", "18:00:00", "+0300"],
    ["an out-of-range hour", "2026-07-15", "25:00:00", "+0300"],
    ["an out-of-range minute", "2026-07-15", "18:99:00", "+0300"],
    ["out-of-range offset minutes", "2026-07-15", "18:00:00", "+0099"],
    ["out-of-range offset hours", "2026-07-15", "18:00:00", "+9900"],
  ])(
    "skips a match with %s rather than storing a normalized wrong kickoff",
    (_case, date, time, offset) => {
      const result = normalizeTasoMatch(
        {
          match_id: "1",
          status: "Played",
          round_id: "1",
          group_id: "1",
          group_name: "Runkosarja",
          date,
          time,
          time_zone_offset: offset,
          team_A_id: "10",
          team_A_name: "HJK",
          team_B_id: "20",
          team_B_name: "KuPS",
        },
        "spljp26",
        "VL",
        2026
      );

      expect(result).toBeNull();
      expect(loggerWarnMock).toHaveBeenCalledWith(
        expect.objectContaining({ matchId: "1" }),
        "Skipping TASO match with an unparseable kickoff"
      );
    }
  );

  it("keeps every parseable match when one sibling in the same response is unparseable", async () => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          matches: [
            { match_id: "1", status: "Played", date: "", time: "", time_zone_offset: "+0139" },
            {
              match_id: "2",
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
          ],
        }),
      })
    );

    await expect(getSeasonMatches("spljp22", "VL", 2022)).resolves.toEqual([
      expect.objectContaining({ providerMatchId: 2 }),
    ]);
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

    const result = await getSeasonMatches("spljp26", "VL", 2026);

    expect(result).toEqual([expect.objectContaining({ providerMatchId: 1, seasonId: 2026 })]);
  });

  it("requests the season's matches scoped to the VL category, with the configured api key and required headers, and logs the call", async () => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ matches: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await getSeasonMatches("spljp26", "VL", 2026);

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

    await expect(getSeasonMatches("spljp26", "VL", 2026)).resolves.toEqual([]);
  });

  it("throws when the API key is not configured", async () => {
    process.env.TASO_API_KEY = "";

    await expect(getSeasonMatches("spljp26", "VL", 2026)).rejects.toThrow(
      "TASO_API_KEY is not configured"
    );
  });

  it("logs and throws when the provider request fails", async () => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(getSeasonMatches("spljp26", "VL", 2026)).rejects.toThrow(
      "TASO request failed: 403"
    );
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
      "TASO request failed"
    );
  });

  it("logs and rethrows when the fetch itself rejects", async () => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    const networkError = new Error("network unreachable");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    await expect(getSeasonMatches("spljp26", "VL", 2026)).rejects.toThrow("network unreachable");
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

    const groups = await getSeasonGroups("spljp26", "VL");

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

    await expect(getSeasonGroups("spljp26", "VL")).resolves.toEqual([]);
  });
});

describe("getCurrentSeason", () => {
  function mockCompetitions(competitions: unknown[]) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ competitions }),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  beforeEach(() => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
  });

  it("requests every competition, unscoped — a competition_id is a season, not a category", async () => {
    const fetchMock = mockCompetitions([
      { competition_id: "spljp26", competition_status: "published", season_id: 2026 },
    ]);

    await expect(getCurrentSeason()).resolves.toBe(2026);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://spl.torneopal.net/taso/rest/getCompetitions",
      expect.any(Object)
    );
  });

  it("picks the newest published season, so a new competition_id needs no code change", async () => {
    mockCompetitions([
      { competition_id: "spljp26", competition_status: "published", season_id: 2026 },
      { competition_id: "spljp27", competition_status: "published", season_id: 2027 },
    ]);

    await expect(getCurrentSeason()).resolves.toBe(2027);
  });

  // The regression guard for this feature's sharpest edge: spljphhl26 is a
  // different competition that shares the prefix, the status AND the season,
  // so only the exact id shape separates them. A prefix test would pass every
  // other assertion here.
  it("never picks spljphhl26, which shares the prefix, status and season_id", async () => {
    mockCompetitions([
      { competition_id: "spljphhl27", competition_status: "published", season_id: 2027 },
      { competition_id: "spljp26", competition_status: "published", season_id: 2026 },
    ]);

    await expect(getCurrentSeason()).resolves.toBe(2026);
  });

  it("ignores a competition that is not published", async () => {
    mockCompetitions([
      { competition_id: "spljp27", competition_status: "draft", season_id: 2027 },
      { competition_id: "spljp26", competition_status: "published", season_id: 2026 },
    ]);

    await expect(getCurrentSeason()).resolves.toBe(2026);
  });

  it("returns null when nothing matches, leaving the fallback to the caller", async () => {
    mockCompetitions([
      { competition_id: "spljphhl26", competition_status: "published", season_id: 2026 },
      { competition_id: "salibandy26", competition_status: "published", season_id: 2026 },
    ]);

    await expect(getCurrentSeason()).resolves.toBeNull();
  });

  it("returns null for an empty or absent competitions list", async () => {
    mockCompetitions([]);
    await expect(getCurrentSeason()).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    );
    await expect(getCurrentSeason()).resolves.toBeNull();
  });

  it("ignores an entry whose season_id is missing or non-numeric", async () => {
    mockCompetitions([
      { competition_id: "spljp27", competition_status: "published" },
      { competition_id: "spljp28", competition_status: "published", season_id: "not-a-year" },
      { competition_id: "spljp26", competition_status: "published", season_id: "2026" },
    ]);

    await expect(getCurrentSeason()).resolves.toBe(2026);
  });
});

describe("normalizeGroupTeams", () => {
  it("flattens groups into one row per team, parsing TASO's mixed string/number fields", () => {
    const rows = normalizeGroupTeams(
      [
        {
          group_id: "2",
          group_name: "Mestaruussarja",
          teams: [
            {
              team_id: "60731",
              team_name: "HJK",
              // getGroups sends these as native numbers, unlike getMatches'
              // all-strings convention.
              points: 67,
              matches_played: 32,
              matches_won: 20,
              matches_tied: 7,
              matches_lost: 5,
              goals_for: 60,
              goals_against: 30,
              goals_diff: 30,
              starting_points: -2,
              current_standing: 1,
              // …but final_group_standing is a string.
              final_group_standing: "1",
            },
          ],
        },
      ],
      "VL",
      "spljp25",
      2025
    );

    expect(rows).toEqual([
      {
        categoryId: "VL",
        competitionCode: "spljp25",
        seasonId: 2025,
        groupId: 2,
        teamProviderId: 60731,
        teamName: "HJK",
        startingPoints: -2,
        points: 67,
        played: 32,
        won: 20,
        drawn: 7,
        lost: 5,
        goalsFor: 60,
        goalsAgainst: 30,
        goalDifference: 30,
        currentStanding: 1,
        finalGroupStanding: 1,
      },
    ]);
  });

  it("keeps a knockout group's absent stat fields as null rather than coercing them to 0", () => {
    // TASO omits the fields entirely for a bracket. Coercing to 0 would make
    // it look like a points competition everyone lost.
    const [row] = normalizeGroupTeams(
      [{ group_id: "4", teams: [{ team_id: "1", team_name: "HJK" }] }],
      "VL",
      "spljp22",
      2022
    );

    expect(row?.points).toBeNull();
    expect(row?.startingPoints).toBeNull();
    expect(row?.played).toBeNull();
    expect(row?.finalGroupStanding).toBeNull();
  });

  it("contributes no rows for a group TASO lists with no teams", () => {
    // An unplayed qualifying match. Having no rows is what marks the group as
    // having no table at all.
    expect(normalizeGroupTeams([{ group_id: "2", teams: [] }], "VL", "spljp26", 2026)).toEqual([]);
    expect(normalizeGroupTeams([{ group_id: "2" }], "VL", "spljp26", 2026)).toEqual([]);
  });

  it("skips rows it cannot identify rather than storing them under a wrong key", () => {
    const rows = normalizeGroupTeams(
      [
        { group_name: "no group id", teams: [{ team_id: "1" }] },
        { group_id: "not-a-number", teams: [{ team_id: "1" }] },
        { group_id: "1", teams: [{ team_name: "no team id" }, { team_id: "", team_name: "" }] },
      ],
      "VL",
      "spljp25",
      2025
    );

    expect(rows).toEqual([]);
  });

  it("defaults a missing team name to an empty string, since the column is not nullable", () => {
    const [row] = normalizeGroupTeams(
      [{ group_id: "1", teams: [{ team_id: "7" }] }],
      "VL",
      "spljp25",
      2025
    );

    expect(row?.teamName).toBe("");
  });
});

describe("getSeasonCategoryNames", () => {
  function mockCategories(body: unknown) {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("maps every category in a season to the name it carried then", async () => {
    // A competition's name is not stable across seasons, so a page cannot use
    // the configured current one for a past season.
    mockCategories({
      categories: [
        { category_id: "NL", category_name: "Naisten Liiga" },
        { category_id: "VL", category_name: "Veikkausliiga" },
      ],
    });

    await expect(getSeasonCategoryNames("spljp16")).resolves.toEqual({
      NL: "Naisten Liiga",
      VL: "Veikkausliiga",
    });
  });

  it("asks for the whole season rather than one category, since one call covers all 28", async () => {
    const fetchMock = mockCategories({ categories: [] });

    await getSeasonCategoryNames("spljp26");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://spl.torneopal.net/taso/rest/getCategories?competition_id=spljp26",
      expect.any(Object)
    );
  });

  it("skips a category missing either half of the mapping", async () => {
    mockCategories({
      categories: [
        { category_name: "No id" },
        { category_id: "M1" },
        { category_id: "VL", category_name: "Veikkausliiga" },
      ],
    });

    await expect(getSeasonCategoryNames("spljp26")).resolves.toEqual({ VL: "Veikkausliiga" });
  });

  it("treats a response with no categories as no names", async () => {
    mockCategories({});
    await expect(getSeasonCategoryNames("spljp26")).resolves.toEqual({});
  });
});

describe("TASO winner", () => {
  function normalize(winner?: string) {
    return normalizeTasoMatch(
      {
        match_id: "1",
        status: "Played",
        ...(winner === undefined ? {} : { winner }),
        date: "2025-06-11",
        time: "19:00",
        time_zone_offset: "+0300",
        group_id: "1",
        group_name: "Puolivälierät",
        round_id: "1",
        team_A_id: "10",
        team_A_name: "FC Haka",
        team_B_id: "20",
        team_B_name: "KuPS",
        fs_A: "1",
        fs_B: "1",
      },
      "spljp25",
      "MSC",
      2025
    )?.winner;
  }

  it("carries TASO's verdict, lowercased", () => {
    // A cup only ever reports Home or Away: MSC 2025 returns one of the two
    // for all 419 matches, including the 55 that finished level.
    expect(normalize("Home")).toBe("home");
    expect(normalize("Away")).toBe("away");
  });

  it("carries a league draw as a tie", () => {
    // VL 2025 returns Tie for exactly its 40 level matches.
    expect(normalize("Tie")).toBe("tie");
  });

  it("has no winner before the match is played", () => {
    expect(normalize()).toBeNull();
    expect(normalize("Something else")).toBeNull();
  });
});
