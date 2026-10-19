import { describe, expect, it } from "vitest";
import { answer, loadFixture } from "../../support/taso-stub";

/**
 * The e2e suite's stand-in for TASO: what it answers, and what it refuses.
 *
 * decisions/672-e2e-without-the-provider.md
 */

const fixture = {
  categories: { maajp2025: { UNL: "UEFA Nations League Huuhkajat", WCQ: "MM-karsinnat Helmarit" } },
  matches: { maajp2025: { UNL: [{ match_id: "1" }] } },
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

  it("answers a category's matches, and a category with none with an empty list", () => {
    expect(answer(fixture, "/getMatches?competition_id=maajp2025&category_id=UNL")).toEqual({
      status: 200,
      body: { matches: [{ match_id: "1" }] },
    });
    expect(answer(fixture, "/getMatches?competition_id=maajp2025&category_id=WCQ")).toEqual({
      status: 200,
      body: { matches: [] },
    });
  });

  it("answers a competition the fixture has no matches for with an empty list", () => {
    const sparse = { categories: { maajp2024: { UNL: "x" } }, matches: {} };
    expect(answer(sparse, "/getMatches?competition_id=maajp2024&category_id=UNL")).toEqual({
      status: 200,
      body: { matches: [] },
    });
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
});
