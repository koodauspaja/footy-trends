import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  answer,
  emptyStandInRedis,
  loadFixture,
  mergeFixtures,
  STAND_IN_MARKER,
  standInRedisUrl,
} from "../../support/taso-stub";

/**
 * The e2e suite's stand-in for TASO: what it answers, and what it refuses.
 *
 * decisions/672-e2e-without-the-provider.md
 * decisions/674-e2e-on-an-empty-database.md
 */

const fixture = {
  categories: { maajp2025: { UNL: "UEFA Nations League Huuhkajat", WCQ: "MM-karsinnat Helmarit" } },
  matches: { maajp2025: { UNL: [{ match_id: "1" }], WCQ: [] } },
};

describe("the TASO stand-in", () => {
  it("answers the path Playwright polls", () => {
    expect(answer(fixture, "/")).toEqual({ status: 200, body: "ok" });
  });

  it("lists a known competition's categories as TASO does", () => {
    expect(answer(fixture, "/getCategories?competition_id=maajp2025")).toEqual({
      status: 200,
      body: {
        categories: [
          { category_id: "UNL", category_name: "UEFA Nations League Huuhkajat" },
          { category_id: "WCQ", category_name: "MM-karsinnat Helmarit" },
        ],
      },
    });
  });

  it("answers a category's recorded matches, an empty list included", () => {
    expect(answer(fixture, "/getMatches?competition_id=maajp2025&category_id=UNL")).toEqual({
      status: 200,
      body: { matches: [{ match_id: "1" }] },
    });
    expect(answer(fixture, "/getMatches?competition_id=maajp2025&category_id=WCQ")).toEqual({
      status: 200,
      body: { matches: [] },
    });
  });

  it("refuses a listed category whose matches are not recorded", () => {
    const unrecorded = { categories: fixture.categories, matches: { maajp2025: { UNL: [] } } };
    expect(answer(unrecorded, "/getMatches?competition_id=maajp2025&category_id=WCQ").status).toBe(
      503
    );
  });

  it("refuses a listed competition with no matches recorded at all", () => {
    const unrecorded = { categories: fixture.categories, matches: {} };
    expect(answer(unrecorded, "/getMatches?competition_id=maajp2025&category_id=UNL").status).toBe(
      503
    );
  });

  it("refuses a category its competition does not list", () => {
    expect(answer(fixture, "/getMatches?competition_id=maajp2025&category_id=EC").status).toBe(503);
  });

  it.each([
    ["a competition", "/getCategories?competition_id=constructor"],
    ["a competition's matches", "/getMatches?competition_id=toString&category_id=UNL"],
    ["a category", "/getMatches?competition_id=maajp2025&category_id=constructor"],
  ])("refuses %s named after an inherited property", (_case, path) => {
    expect(answer(fixture, path).status).toBe(503);
  });

  it("refuses what the fixture does not record: competitions, groups, a competition, a path", () => {
    expect(answer(fixture, "/getCompetitions").status).toBe(503);
    expect(answer(fixture, "/getMatches?competition_id=spljp26&category_id=VL").status).toBe(503);
    expect(answer(fixture, "/getCategory?competition_id=maajp2025&category_id=UNL").status).toBe(
      503
    );
    expect(answer(fixture, "/getGroups?competition_id=maajp2025").status).toBe(503);
  });

  const domestic = {
    competitions: [
      { competition_id: "spljp26", competition_status: "published", season_id: "2026" },
    ],
    categories: {},
    matches: { spljp26: { VL: [{ match_id: "2" }] } },
    groups: { spljp26: { VL: [{ group_id: "1", teams: [] }] } },
  };

  it("answers getCompetitions with the recorded list", () => {
    expect(answer(domestic, "/getCompetitions")).toEqual({
      status: 200,
      body: { competitions: domestic.competitions },
    });
  });

  it("answers a recorded category's matches though no names are recorded for its competition", () => {
    expect(answer(domestic, "/getMatches?competition_id=spljp26&category_id=VL")).toEqual({
      status: 200,
      body: { matches: [{ match_id: "2" }] },
    });
    expect(answer(domestic, "/getCategories?competition_id=spljp26").status).toBe(503);
  });

  it("answers a recorded category's groups as getCategory does, and refuses the rest", () => {
    expect(answer(domestic, "/getCategory?competition_id=spljp26&category_id=VL")).toEqual({
      status: 200,
      body: { category: { groups: [{ group_id: "1", teams: [] }] } },
    });
    expect(answer(domestic, "/getCategory?competition_id=spljp26&category_id=M1").status).toBe(503);
    expect(answer(domestic, "/getCategory?competition_id=constructor&category_id=VL").status).toBe(
      503
    );
  });

  it("merges the two fixtures, the domestic one's competitions and groups included", () => {
    expect(mergeFixtures(fixture, domestic)).toEqual({
      competitions: domestic.competitions,
      categories: fixture.categories,
      matches: { ...fixture.matches, ...domestic.matches },
      groups: domestic.groups,
    });
  });

  it("refuses to merge fixtures that both record a competition", () => {
    expect(() => mergeFixtures(fixture, { ...domestic, matches: fixture.matches })).toThrow(
      "Both fixtures record maajp2025"
    );
  });

  it("loads both recorded fixtures from the repository", () => {
    const loaded = loadFixture();
    expect(Object.keys(loaded.categories)).toContain("maajp2025");
    expect(answer(loaded, "/getMatches?competition_id=spljp26&category_id=VL").status).toBe(200);
    expect(answer(loaded, "/getCompetitions").status).toBe(200);
  });

  it("records a national-team match list, an empty one included, for exactly the categories it lists", () => {
    const national = JSON.parse(
      readFileSync("tests/e2e/fixtures/taso-national-teams.json", "utf8")
    ) as { categories: Record<string, object>; matches: Record<string, object> };
    const listed = (record: Record<string, object>) =>
      Object.entries(record)
        .map(([competition, categories]): [string, string[]] => [
          competition,
          Object.keys(categories).sort(),
        ])
        .sort(([a], [b]) => a.localeCompare(b));
    expect(listed(national.matches)).toEqual(listed(national.categories));
  });
});

describe("the stand-in's Redis", () => {
  it.each([
    ["the default server when none is configured", undefined, "redis://localhost:6379/15"],
    ["the default server when the setting is blank", "  ", "redis://localhost:6379/15"],
    [
      "the configured server, its own database replaced",
      "redis://cache:6380/0",
      "redis://cache:6380/15",
    ],
    [
      "the configured credentials",
      "redis://user:secret@cache:6379",
      "redis://user:secret@cache:6379/15",
    ],
  ])("is database 15 on %s", (_case, configured, expected) => {
    expect(standInRedisUrl(configured)).toBe(expected);
  });
});

type StandInRedis = Parameters<typeof emptyStandInRedis>[0];

describe("emptying the stand-in's Redis before a run", () => {
  function fakeRedis(keys: string[]) {
    const stored = new Set(keys);
    return {
      stored,
      dbsize: async () => stored.size,
      exists: async (key: string) => (stored.has(key) ? 1 : 0),
      flushdb: async () => {
        stored.clear();
        return "OK" as const;
      },
      set: async (key: string) => {
        stored.add(key);
        return "OK" as const;
      },
    };
  }

  it.each([
    ["empty", []],
    ["marked by an earlier run", [STAND_IN_MARKER, "taso:matches:spljp26:VL"]],
  ])("empties a database that is %s, and marks it", async (_case, keys) => {
    const redis = fakeRedis(keys);
    await emptyStandInRedis(redis as unknown as StandInRedis);
    expect([...redis.stored]).toEqual([STAND_IN_MARKER]);
  });

  it("leaves a database holding someone else's keys as it is, and stops the run", async () => {
    const redis = fakeRedis(["session:abc"]);
    await expect(emptyStandInRedis(redis as unknown as StandInRedis)).rejects.toThrow(
      "Redis database 15 holds keys no run with E2E_TASO_STUB=1 wrote"
    );
    expect([...redis.stored]).toEqual(["session:abc"]);
  });
});
