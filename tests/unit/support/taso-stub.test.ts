import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  footballDataCompetitionCacheKey,
  footballDataMatchesCacheKey,
} from "../../../src/lib/football-data";
import {
  answer,
  keptBetweenRuns,
  loadFixture,
  mergeFixtures,
  STAND_IN_REDIS_IMAGE,
  standInDatabaseUrl,
  standInRedis,
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

  it("refuses to merge fixtures when the national one records groups for a domestic competition", () => {
    expect(() => mergeFixtures({ ...fixture, groups: { spljp26: { VL: [] } } }, domestic)).toThrow(
      "Both fixtures record spljp26"
    );
  });

  it("keeps groups and competitions the national-team fixture records, beside the domestic ones", () => {
    const national = {
      ...fixture,
      competitions: [{ competition_id: "maajp2025" }],
      groups: { maajp2025: { UNL: [{ group_id: "9" }] } },
    };
    const merged = mergeFixtures(national, domestic);
    expect(merged.competitions).toEqual([
      { competition_id: "maajp2025" },
      ...domestic.competitions,
    ]);
    expect(merged.groups).toEqual({ maajp2025: { UNL: [{ group_id: "9" }] }, ...domestic.groups });
  });

  it("refuses to merge fixtures that both name a competition", () => {
    expect(() =>
      mergeFixtures(fixture, { ...domestic, categories: { maajp2025: { UNL: "x" } } })
    ).toThrow("Both fixtures record maajp2025");
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

describe("the stand-in run's own Redis", () => {
  it("is a container on the port asked, reachable only from this machine, its data in that port's own volume", () => {
    expect(standInRedis(6390, 3011)).toEqual({
      command:
        "docker run --rm --name footy-trends-e2e-stand-in-3011 -p 127.0.0.1:6390:6379 -v footy-trends-e2e-redis-6390:/data redis:8-alpine redis-server --save 60 1",
      url: "redis://127.0.0.1:6390",
    });
  });

  it("is named for the app port, as the stand-in database is, whatever the Redis port", () => {
    const named = (redisPort: number, appPort: number) =>
      standInRedis(redisPort, appPort).command.match(/--name (\S+)/)?.[1];

    expect(named(6390, 3011)).toBe(named(6391, 3011));
    expect(named(6390, 3011)).not.toBe(named(6390, 3012));
  });

  it("runs the Redis image docker-compose.yml runs for development", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");
    expect(compose).toContain(`\n  redis:\n    image: ${STAND_IN_REDIS_IMAGE}\n`);
  });
});

describe("the stand-in run's own database", () => {
  const testUrl = "postgresql://postgres:secret@localhost:5432/footy-trends_test";

  it("puts _stand_in and the app port before the test database's _test, keeping everything else", () => {
    expect(standInDatabaseUrl(testUrl, 3001)).toBe(
      "postgresql://postgres:secret@localhost:5432/footy-trends_stand_in_3001_test"
    );
  });

  it("gives a run on another port another database", () => {
    expect(standInDatabaseUrl(testUrl, 3011)).toBe(
      "postgresql://postgres:secret@localhost:5432/footy-trends_stand_in_3011_test"
    );
  });

  it("leaves a URL already derived for that port as it is, as each worker derives it again", () => {
    const derived = standInDatabaseUrl(testUrl, 3001);
    expect(standInDatabaseUrl(derived, 3001)).toBe(derived);
  });

  it("refuses a test database whose name does not end in _test, naming only the host", () => {
    expect(() =>
      standInDatabaseUrl("postgresql://postgres:secret@localhost:5432/footy-trends", 3001)
    ).toThrow("The test database name does not end in _test: localhost:5432");
  });
});

describe("what the stand-in run's Redis keeps between runs", () => {
  it("keeps football-data's answers, by the keys football-data.ts builds", () => {
    expect(keptBetweenRuns(footballDataMatchesCacheKey("PL", 2024))).toBe(true);
    expect(keptBetweenRuns(footballDataCompetitionCacheKey("PL"))).toBe(true);
  });

  it.each([
    "taso:matches:spljp26:VL",
    "taso:season-context:v2:VL",
    "elo:v1:taso",
    "forecast:v4:taso:VL:2025",
    "quality:v3:taso:VL",
    "poisson:v1:football-data",
    "standings:PL",
  ])("clears %s, TASO's or computed from stored rows", (key) => {
    expect(keptBetweenRuns(key)).toBe(false);
  });
});
