import { describe, expect, it } from "vitest";
import { answer, loadFixture } from "../../support/taso-stub";

/**
 * The e2e suite's stand-in for TASO: what it answers, and what it refuses.
 *
 * decisions/672-e2e-without-the-provider.md
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

  it("refuses a request without a competition, an unknown competition and an unknown path", () => {
    expect(answer(fixture, "/getCompetitions").status).toBe(503);
    expect(answer(fixture, "/getMatches?competition_id=spljp26&category_id=VL").status).toBe(503);
    expect(answer(fixture, "/getCategory?competition_id=maajp2025&category_id=UNL").status).toBe(
      503
    );
  });

  it("loads the recorded national-team fixture from the repository", () => {
    expect(Object.keys(loadFixture().categories)).toContain("maajp2025");
  });

  it("records a match list, an empty one included, for exactly the categories it lists", () => {
    const recorded = loadFixture();
    const listed = (record: Record<string, Record<string, unknown>>) =>
      Object.entries(record)
        .map(([competition, categories]): [string, string[]] => [
          competition,
          Object.keys(categories).sort(),
        ])
        .sort(([a], [b]) => a.localeCompare(b));
    expect(listed(recorded.matches)).toEqual(listed(recorded.categories));
  });
});
