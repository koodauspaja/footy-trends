import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What the e2e suite's stand-in for TASO answers, as a pure function of the
 * request's URL. It knows the national-team buckets and nothing else: any other
 * request fails, as it does against the real provider when it refuses, so a page
 * that needs data the fixture lacks falls back to what is stored.
 *
 * decisions/672-e2e-without-the-provider.md
 */

type Fixture = {
  categories: Record<string, Record<string, string>>;
  matches: Record<string, Record<string, unknown[]>>;
};

export type StubAnswer = { status: number; body: unknown };

/**
 * Recorded from the national-team rows and category names a development
 * database held, so the pages show what the provider's own answers made them
 * show. A category with no matches in it is answered with none.
 *
 * decisions/672-e2e-without-the-provider.md
 */
export function loadFixture(root: string = process.cwd()): Fixture {
  return JSON.parse(
    readFileSync(join(root, "tests/e2e/fixtures/taso-national-teams.json"), "utf8")
  ) as Fixture;
}

/**
 * The answer to one request, `path` being the URL's path and query as the app
 * sends it.
 */
export function answer(fixture: Fixture, path: string): StubAnswer {
  const url = new URL(path, "http://stub.invalid");
  // What Playwright polls to learn the server is up.
  if (url.pathname === "/") return { status: 200, body: "ok" };

  const competitionId = url.searchParams.get("competition_id") ?? "";
  const known = fixture.categories[competitionId];

  if (known === undefined) return { status: 503, body: { error: "not in the fixture" } };

  if (url.pathname === "/getCategories") {
    return {
      status: 200,
      body: {
        categories: Object.entries(known).map(([categoryId, categoryName]) => ({
          category_id: categoryId,
          category_name: categoryName,
        })),
      },
    };
  }
  if (url.pathname === "/getMatches") {
    const categoryId = url.searchParams.get("category_id") ?? "";
    return {
      status: 200,
      body: { matches: fixture.matches[competitionId]?.[categoryId] ?? [] },
    };
  }
  return { status: 503, body: { error: "not in the fixture" } };
}
