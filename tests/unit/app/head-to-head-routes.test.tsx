import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The head-to-head routes, which differ only in the source they resolve ids against and
 * the prefix their rows link back into. Getting one wrong resolves a TASO id against
 * football-data's table. What the page does is `head-to-head-page.test.tsx`'s.
 *
 * decisions/042-head-to-head-view.md
 */

const { HeadToHeadPage, headToHeadMetadata } = vi.hoisted(() => ({
  HeadToHeadPage: vi.fn(() => null),
  headToHeadMetadata: vi.fn(async () => ({ title: "Kohtaamiset" })),
}));

vi.mock("@/components/head-to-head-page", () => ({ HeadToHeadPage, headToHeadMetadata }));

beforeEach(() => {
  vi.clearAllMocks();
});

const ROUTES = [
  {
    name: "/kotimaa/kohtaamiset",
    module: () => import("@/app/domestic/head-to-head/[a]/[b]/page"),
    source: { kind: "taso", bucket: "domestic" },
    basePath: "/kotimaa",
  },
  {
    name: "/ulkomaat/kohtaamiset",
    module: () => import("@/app/foreign/head-to-head/[a]/[b]/page"),
    source: { kind: "football-data", region: "foreign" },
    basePath: "/ulkomaat",
  },
  {
    name: "/maajoukkueet/kohtaamiset",
    module: () => import("@/app/national-teams/head-to-head/[a]/[b]/page"),
    source: { kind: "football-data", region: "national-teams" },
    basePath: "/maajoukkueet",
  },
  {
    name: "/maajoukkueet/huuhkajat/kohtaamiset",
    module: () => import("@/app/national-teams/mens-team/head-to-head/[a]/[b]/page"),
    source: { kind: "taso", bucket: "national" },
    basePath: "/maajoukkueet/huuhkajat",
  },
  {
    name: "/maajoukkueet/helmarit/kohtaamiset",
    module: () => import("@/app/national-teams/womens-team/head-to-head/[a]/[b]/page"),
    source: { kind: "taso", bucket: "national" },
    basePath: "/maajoukkueet/helmarit",
  },
] as const;

// Every match route builds its link as `${basePath}/kohtaamiset/...`, so a prefix
// with no head-to-head route behind it is a link to nothing. The two national-team
// team routes are that case, which is why this list has five entries.

describe.each(ROUTES)("$name", ({ module, source, basePath }) => {
  const params = Promise.resolve({ a: "1", b: "2" });

  it("renders the page against its own source and prefix", async () => {
    const { default: Page } = await module();
    Page({ params });

    expect(HeadToHeadPage).toHaveBeenCalledWith(
      expect.objectContaining({ source, basePath, params })
    );
  });

  it("builds its metadata from the same options", async () => {
    const { generateMetadata } = await module();
    await generateMetadata({ params });

    expect(headToHeadMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ source, basePath, params })
    );
  });

  it("is rendered per request, never prerendered", async () => {
    // These pages read the database by ids from the URL; a build-time render
    // would bake one pair's history into every other pair's page.
    const { dynamic } = await module();

    expect(dynamic).toBe("force-dynamic");
  });
});
