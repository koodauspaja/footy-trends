import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentSeason,
  getSeasonCategoryNames,
  getSeasonGroups,
  getSeasonMatches,
  normalizeGroupLevels,
  normalizeGroupTeams,
  normalizeTasoMatch,
} from "@/lib/taso";

/**
 * The TASO client: what it asks the provider, how a response is normalised and
 * validated, and how the current season is discovered.
 *
 * decisions/009-veikkausliiga.md
 * decisions/011-current-season-discovery.md
 * decisions/013-more-finnish-competitions.md
 * decisions/015-finnish-cups.md
 * decisions/036-halftime-comebacks.md
 * decisions/182-national-team-pages-not-prerendered.md
 * decisions/200-taso-read-cache.md
 * decisions/272-group-standings-endpoint.md
 * decisions/284-provider-id-validation.md
 * decisions/363-render-timeouts.md
 * decisions/063-competition-zones.md
 * decisions/672-e2e-without-the-provider.md
 * decisions/681-taso-request-signing.md
 */

const { loggerInfoMock, loggerErrorMock, loggerWarnMock, getCachedMock } = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  // Passes straight through by default, so the tests below still assert on the
  // request actually made. Individual tests override it to check the caching.
  getCachedMock: vi.fn((_key: string, _ttl: number, fetcher: () => unknown) => fetcher()),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: loggerInfoMock, error: loggerErrorMock, warn: loggerWarnMock },
}));
vi.mock("@/lib/cache", () => ({ getCached: getCachedMock }));

// For every block, not one: a stubbed variable, a salt above all, must not reach
// a test that runs after it in a shuffled order.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("taso mapping", () => {
  const originalApiKey = process.env.TASO_API_KEY;

  beforeEach(() => {
    vi.unstubAllEnvs();
    loggerInfoMock.mockReset();
    loggerErrorMock.mockReset();
    loggerWarnMock.mockReset();
    getCachedMock.mockClear();
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
        hts_A: "0",
        hts_B: "1",
      },
      "spljp26",
      "VL",
      2026
    );

    expect(result).toMatchObject({
      halfTimeHome: 0,
      halfTimeAway: 1,
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

  it("tells no half-time score from a goalless first half", () => {
    // TASO sends `""` for a match it has no half-time score for — 1 of 132 in
    // Ykkönen 2025 — and "0" for one that really was goalless at the break.
    const played = (halfTime: string) => ({
      match_id: "123",
      status: "Played",
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
      hts_A: halfTime,
      hts_B: "1",
    });
    const missing = normalizeTasoMatch(played(""), "spljp26", "VL", 2026);
    const goalless = normalizeTasoMatch(played("0"), "spljp26", "VL", 2026);

    expect(missing).toMatchObject({ halfTimeHome: null });
    expect(goalless).toMatchObject({ halfTimeHome: 0 });
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

  describe("a match whose id is not an id", () => {
    // Each of these four columns is `integer NOT NULL`, and `Number` alone would answer for them
    // all: an empty or blank string as 0, `"2abc"` as NaN, a long digit string rounded. The first
    // three would fail the season's insert; the fourth would land under the wrong group or team.
    const field = (name: string, value: unknown) => ({
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
      [name]: value,
    });

    const UNUSABLE = [
      ["is empty", ""],
      ["is whitespace", "  "],
      ["begins with digits but is not a number", "2abc"],
      ["will not parse at all", "not-a-number"],
      ["is a decimal", "2.5"],
      ["is zero", "0"],
      ["is negative", "-1"],
      ["is past what an integer column holds", "99999999999999999999"],
      // The four `Number` reads as a perfectly good positive integer. These
      // are the dangerous ones: nothing fails, and the row is filed under a
      // group, team or match that exists and is not this one.
      ["is hexadecimal", "0x10"],
      ["is in exponent notation", "1e2"],
      ["carries a leading plus", "+2"],
      ["carries a leading space", " 2"],
    ] as const;

    it.each(
      ["match_id", "group_id", "team_A_id", "team_B_id"].flatMap((name) =>
        UNUSABLE.map(([label, value]) => [name, label, value] as const)
      )
    )("is skipped when %s %s", (name, _case, value) => {
      expect(normalizeTasoMatch(field(name, value), "spljp26", "VL", 2026)).toBeNull();
      expect(loggerWarnMock).toHaveBeenCalledWith(
        expect.anything(),
        "Skipping TASO match with an unusable id"
      );
    });

    it("keeps a match whose ids are all real, so the guard cannot be passing by rejecting everything", () => {
      expect(normalizeTasoMatch(field("match_id", "1"), "spljp26", "VL", 2026)).toMatchObject({
        providerMatchId: 1,
        groupId: 1,
        homeTeamProviderId: 10,
        awayTeamProviderId: 20,
      });
      expect(loggerWarnMock).not.toHaveBeenCalled();
    });

    it("costs an unusable score the score rather than the match", () => {
      // `Number("2abc")` is NaN, a value the `integer` column rejects, taking
      // the season's insert with it.
      expect(normalizeTasoMatch(field("fs_A", "2abc"), "spljp26", "VL", 2026)).toMatchObject({
        providerMatchId: 1,
        homeGoals: null,
      });
    });

    it("costs an unusable round_id the round rather than the match", () => {
      // `matchday` is nullable and is not part of any key, so "no usable
      // round" and "no round reported" are the same answer.
      expect(normalizeTasoMatch(field("round_id", "2abc"), "spljp26", "VL", 2026)).toMatchObject({
        providerMatchId: 1,
        matchday: null,
      });
    });
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
  // explicit range check the match would be stored at a kickoff it never had.
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
        // Every TASO request carries a per-attempt bound. The exact signal is
        // not assertable, being an `AbortSignal.any` of the bound and whatever
        // the caller passed, but its presence is the guarantee.
        signal: expect.any(AbortSignal),
      }
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200 }),
      "TASO request completed"
    );
  });

  it.each([
    ["the server it names", "http://localhost:3002", "http://localhost:3002"],
    [
      "the server it names, trailing slashes dropped",
      "http://localhost:3002//",
      "http://localhost:3002",
    ],
    ["the provider, when it is blank", "  ", "https://spl.torneopal.net/taso/rest"],
  ])("sends its requests, given TASO_API_BASE_URL, to %s", async (_case, override, base) => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    vi.stubEnv("TASO_API_BASE_URL", override);
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ matches: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await getSeasonMatches("spljp26", "VL", 2026);

    expect(fetchMock).toHaveBeenCalledWith(
      `${base}/getMatches?competition_id=spljp26&category_id=VL`,
      expect.anything()
    );
  });

  // The digests are SHA-256 of `getMatches?test-salt&competition_id=spljp26&category_id=VL`
  // and `getCompetitions?test-salt`, worked out once, so the shape is pinned and not
  // recomputed by the test.
  const PROVIDER = "https://spl.torneopal.net/taso/rest";
  const SEASON_QUERY = "competition_id=spljp26&category_id=VL";
  const SEASON_HASH = "017d26a9ba96689f818a6e40fc7bd6153b97cf52c7fc1888ef039b7ae87a086a";
  const COMPETITIONS_HASH = "e9037f59074685091419b8367f8dd72fd72066e15e883774feb31ea5bf1b009f";
  const seasonMatches = () => getSeasonMatches("spljp26", "VL", 2026);
  const currentSeason = () => getCurrentSeason();

  it.each([
    [
      "a request with a query, its hash appended",
      "test-salt",
      seasonMatches,
      `${PROVIDER}/getMatches?${SEASON_QUERY}&hash=${SEASON_HASH}`,
    ],
    [
      "a request without one, its hash as the query",
      "test-salt",
      currentSeason,
      `${PROVIDER}/getCompetitions?hash=${COMPETITIONS_HASH}`,
    ],
    [
      "the same, the salt's surrounding space ignored",
      "  test-salt  ",
      seasonMatches,
      `${PROVIDER}/getMatches?${SEASON_QUERY}&hash=${SEASON_HASH}`,
    ],
    ["no hash, when it is blank", "  ", seasonMatches, `${PROVIDER}/getMatches?${SEASON_QUERY}`],
  ])("signs, given TASO_HASH_SALT, %s", async (_case, salt, call, url) => {
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    vi.stubEnv("TASO_HASH_SALT", salt);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await call();

    expect(fetchMock).toHaveBeenCalledWith(url, expect.anything());
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
      json: async () => ({ category: { groups: [{ group_id: "1" }] } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const groups = await getSeasonGroups("spljp26", "VL");

    expect(fetchMock).toHaveBeenCalledWith(
      // `getCategory`, not `getGroups`: TASO refuses the latter outright.
      "https://spl.torneopal.net/taso/rest/getCategory?competition_id=spljp26&category_id=VL",
      expect.any(Object)
    );
    expect(groups).toEqual([{ group_id: "1" }]);
  });

  it("does not read a top-level groups field, which is the old endpoint's shape", async () => {
    // Guards the switch itself: reading `groups` again would silently return
    // nothing from `getCategory`.
    vi.stubEnv("TASO_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ groups: [{ group_id: "9" }] }),
      })
    );

    expect(await getSeasonGroups("spljp26", "VL")).toEqual([]);
  });

  it("treats a category response with no groups field as no groups", async () => {
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

  // `/api/health?providers=1` bounds this call. The caller's signal does not reach `fetch`
  // by identity: it is combined with the per-attempt bound by `AbortSignal.any`, so this
  // asserts what the caller depends on, that aborting theirs aborts the request.
  it("aborts the request when the caller's signal aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
          })
      )
    );
    const controller = new AbortController();
    const pending = getCurrentSeason(controller.signal);
    controller.abort(new Error("health gave up"));

    await expect(pending).rejects.toThrow("health gave up");
  });

  it("bounds a page request even though it passes no signal of its own", async () => {
    // A page render passing no signal must still be bounded: an unbounded
    // request is how one stalled provider holds every page that asks it.
    const fetchMock = mockCompetitions([]);

    await getCurrentSeason();

    expect(fetchMock.mock.calls[0]?.[1]).toHaveProperty("signal");
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

  // The sharpest edge: spljphhl26 is a different competition that shares the
  // prefix, the status and the season, so only the exact id shape separates
  // them. A prefix test would pass every other assertion here.
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

  // These are the ids the standings service also refuses to report on, and the two must
  // agree: an unusable id must not be stored. Each case carries a team, because a group
  // with no teams contributes no rows and would pass with the validation removed.
  const UNUSABLE_IDS = [
    ["is empty", ""],
    ["is whitespace", "  "],
    ["begins with digits but is not a number", "2abc"],
    ["is a decimal", "2.5"],
    ["is zero", "0"],
    ["is negative", "-1"],
    ["is past what an integer column holds", "99999999999999999999"],
    // `Number` reads each of these as a positive integer, so nothing fails —
    // the row is simply filed under a group or team that is not its own.
    ["is hexadecimal", "0x10"],
    ["is in exponent notation", "1e2"],
    ["carries a leading plus", "+2"],
    ["carries a leading space", " 2"],
  ] as const;

  it.each(UNUSABLE_IDS)(
    "stores nothing for a group whose id %s, teams and all",
    (_case, groupId) => {
      expect(
        normalizeGroupTeams(
          [{ group_id: groupId, teams: [{ team_id: "60731", team_name: "HJK", points: 67 }] }],
          "VL",
          "spljp26",
          2026
        )
      ).toEqual([]);
    }
  );

  it.each(UNUSABLE_IDS)(
    "drops only the team whose id %s, keeping the rest of the group",
    (_case, teamId) => {
      const rows = normalizeGroupTeams(
        [
          {
            group_id: "2",
            teams: [
              { team_id: teamId, team_name: "Unusable" },
              { team_id: "60731", team_name: "HJK" },
            ],
          },
        ],
        "VL",
        "spljp26",
        2026
      );

      expect(rows).toEqual([expect.objectContaining({ teamProviderId: 60731, teamName: "HJK" })]);
    }
  );

  it("reads a stat TASO sends as a decimal string, and only as a decimal string", () => {
    // `final_group_standing` really does arrive as a string, so the string
    // path is not hypothetical — and `Number` would read "1e2" as 100, a
    // standing nobody holds.
    const [row] = normalizeGroupTeams(
      [
        {
          group_id: "2",
          teams: [
            {
              team_id: "60731",
              starting_points: "-6" as unknown as number,
              final_group_standing: "3",
              points: "1e2" as unknown as number,
              goals_for: "0x10" as unknown as number,
            },
          ],
        },
      ],
      "VL",
      "spljp26",
      2026
    );

    expect(row).toMatchObject({
      startingPoints: -6,
      finalGroupStanding: 3,
      points: null,
      goalsFor: null,
    });
  });

  it("keeps a stat that is legitimately zero or negative, which no id may be", () => {
    // The id rule is stricter than the stat rule on purpose, and one function
    // reading both would quietly erase a points deduction.
    const [row] = normalizeGroupTeams(
      [
        {
          group_id: "2",
          teams: [{ team_id: "60731", team_name: "HJK", points: 0, starting_points: -6 }],
        },
      ],
      "VL",
      "spljp26",
      2026
    );

    expect(row).toMatchObject({ points: 0, startingPoints: -6 });
  });

  it("drops a stat no integer column can hold rather than failing the insert", () => {
    // Not hypothetical in kind: the same `Number` coercion that turned a long
    // id into a rounded value turns one of these into `Infinity`.
    const [row] = normalizeGroupTeams(
      [
        {
          group_id: "2",
          teams: [
            {
              team_id: "60731",
              team_name: "HJK",
              points: "1e400" as unknown as number,
              goals_for: "99999999999999999999" as unknown as number,
              goals_against: 2.5,
            },
          ],
        },
      ],
      "VL",
      "spljp26",
      2026
    );

    expect(row).toMatchObject({ points: null, goalsFor: null, goalsAgainst: null });
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

describe("taso caching", () => {
  beforeEach(() => {
    getCachedMock.mockClear();
    vi.stubEnv("TASO_API_KEY", "test-key");
  });

  it("caches a season's matches per competition and category", async () => {
    // An empty answer stores no rows, so without a cache
    // `getSyncedSeasonMatches` cannot tell "never fetched" from
    // "fetched, nothing there", and re-asks on every request.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ matches: [] }), { status: 200 }))
    );

    await getSeasonMatches("maajp2022", "EC", 2022);

    expect(getCachedMock).toHaveBeenCalledWith(
      "taso:matches:maajp2022:EC",
      900,
      expect.any(Function)
    );
  });

  it("caches a season's groups per competition and category", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ category: { groups: [] } }), { status: 200 }))
    );

    await getSeasonGroups("spljp26", "VL");

    expect(getCachedMock).toHaveBeenCalledWith(
      "taso:category:spljp26:VL",
      900,
      expect.any(Function)
    );
  });

  it("does not reach the provider when the cache answers, even with nothing", async () => {
    // The empty answer is the one that matters: it is the case the database
    // cannot remember on its own.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    getCachedMock.mockResolvedValueOnce({ matches: [] });

    const result = await getSeasonMatches("maajp2022", "EC", 2022);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("normalizeGroupLevels", () => {
  beforeEach(() => {
    loggerWarnMock.mockReset();
  });

  const TEXTS = [
    "Nousee Veikkausliigaan",
    "Jatkaa liigakarsintaan",
    "Säilyy Ykkösliigassa",
    "",
    "Karsii paikastaan Ykkösliigassa",
    "Putoaa Ykköseen",
    "",
    "",
    "",
    "",
  ];

  function levelsOf(group: Record<string, unknown>) {
    return normalizeGroupLevels([{ group_id: "7", ...group }], "M1L", "spljp26", 2026);
  }

  it("stores one row per level with a count, under TASO's own level number", () => {
    const rows = levelsOf({
      next_stage_levels: "1,1,6,0,1,1,0,0,0,0",
      next_stage_level_texts: TEXTS,
    });

    expect(rows).toEqual(
      [
        { level: 1, teamCount: 1, label: "Nousee Veikkausliigaan" },
        { level: 2, teamCount: 1, label: "Jatkaa liigakarsintaan" },
        { level: 3, teamCount: 6, label: "Säilyy Ykkösliigassa" },
        { level: 5, teamCount: 1, label: "Karsii paikastaan Ykkösliigassa" },
        { level: 6, teamCount: 1, label: "Putoaa Ykköseen" },
      ].map((row) => ({
        categoryId: "M1L",
        competitionCode: "spljp26",
        seasonId: 2026,
        groupId: 7,
        ...row,
      }))
    );
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("keeps a level with a count and no label, as a null label", () => {
    const rows = levelsOf({
      next_stage_levels: "0,0,0,4,1,1,0,0,0,0",
      next_stage_level_texts: ["", "", "", "", "Liigakarsintaan", "Ykkösliigaan", "", "", "", ""],
    });

    expect(rows.map((row) => [row.level, row.teamCount, row.label])).toEqual([
      [4, 4, null],
      [5, 1, "Liigakarsintaan"],
      [6, 1, "Ykkösliigaan"],
    ]);
  });

  it("trims a label, and takes one that is only whitespace as none", () => {
    const rows = levelsOf({
      next_stage_levels: "1,1,0,0,0,0,0,0,0,0",
      next_stage_level_texts: ["  Kultaa ", "   ", "", "", "", "", "", "", "", ""],
    });

    expect(rows.map((row) => row.label)).toEqual(["Kultaa", null]);
  });

  it("takes a missing label, or one that is not text, as none", () => {
    expect(levelsOf({ next_stage_levels: "2,0,0,0,0,0,0,0,0,0" }).map((row) => row.label)).toEqual([
      null,
    ]);
    expect(
      levelsOf({ next_stage_levels: "2,1,0,0,0,0,0,0,0,0", next_stage_level_texts: [7] }).map(
        (row) => row.label
      )
    ).toEqual([null, null]);
    expect(
      levelsOf({ next_stage_levels: "2,0,0,0,0,0,0,0,0,0", next_stage_level_texts: "Kultaa" }).map(
        (row) => row.label
      )
    ).toEqual([null]);
  });

  it.each([
    ["a count that is not a number", "1,1,x,0,0,0,0,0,0,0"],
    ["a count with a fraction", "1,1.5,0,0,0,0,0,0,0,0"],
    ["a negative count", "1,-1,0,0,0,0,0,0,0,0"],
    ["a count with a space", "1, 1,0,0,0,0,0,0,0,0"],
    ["a count no column holds", "1,99999999999,0,0,0,0,0,0,0,0"],
    ["fewer than ten counts", "1,1,6,0,1,1"],
    ["more than ten counts", "1,1,6,0,1,1,0,0,0,0,0"],
  ])("stores no level of a group with %s, and logs it once", (_case, levels) => {
    expect(levelsOf({ next_stage_levels: levels, next_stage_level_texts: TEXTS })).toEqual([]);
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { categoryId: "M1L", competitionId: "spljp26", groupId: 7 },
      "Unreadable TASO zone levels"
    );
  });

  it("reads an empty count as a level with none, as older seasons send it", () => {
    // Veikkausliiga 2022's Runkosarja.
    const rows = levelsOf({
      next_stage_levels: "6,6,0,0,0,0,,,,",
      next_stage_level_texts: ["Mestaruussarja", "Haastajasarja", "", "", "", "", "", "", "", ""],
    });

    expect(rows.map((row) => [row.level, row.teamCount, row.label])).toEqual([
      [1, 6, "Mestaruussarja"],
      [2, 6, "Haastajasarja"],
    ]);
    expect(levelsOf({ next_stage_levels: ",2,,,,,,,," }).map((row) => row.level)).toEqual([2]);
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("still takes a string of only commas that is not ten parts as unreadable", () => {
    expect(levelsOf({ next_stage_levels: ",,," })).toEqual([]);
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });

  it("logs counts that are not a string as unreadable", () => {
    expect(levelsOf({ next_stage_levels: [1, 1, 6] })).toEqual([]);
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });

  it("stores nothing, silently, for a group that publishes no counts", () => {
    expect(levelsOf({})).toEqual([]);
    expect(levelsOf({ next_stage_levels: "" })).toEqual([]);
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("keeps the readable groups beside an unreadable one", () => {
    const rows = normalizeGroupLevels(
      [
        { group_id: "1", next_stage_levels: "broken" },
        {
          group_id: "2",
          next_stage_levels: "3,0,0,0,0,0,0,0,0,0",
          next_stage_level_texts: ["Nousee"],
        },
      ],
      "VL",
      "spljp26",
      2026
    );

    expect(rows.map((row) => [row.groupId, row.level, row.label])).toEqual([[2, 1, "Nousee"]]);
  });

  it("skips a group whose id is not an id, without a log line", () => {
    expect(
      normalizeGroupLevels(
        [{ group_id: "abc", next_stage_levels: "broken" }],
        "VL",
        "spljp26",
        2026
      )
    ).toEqual([]);
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });
});
