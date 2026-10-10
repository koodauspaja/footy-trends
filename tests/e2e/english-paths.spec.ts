import { expect, test } from "@playwright/test";

/**
 * An English folder path is not a URL: it redirects to the Finnish one.
 * `tests/unit/next-config.test.ts` compares the whole table; this asks a
 * running server for the eight pages that had the rewrite alone.
 *
 * decisions/012-finnish-urls-english-code.md
 * decisions/527-one-route-table.md
 */

const REDIRECTS = [
  ["/national-teams/mens-team", "/maajoukkueet/huuhkajat"],
  ["/national-teams/womens-team", "/maajoukkueet/helmarit"],
  ["/domestic/head-to-head/60987/60493", "/kotimaa/kohtaamiset/60987/60493"],
  ["/foreign/head-to-head/57/61", "/ulkomaat/kohtaamiset/57/61"],
  ["/national-teams/head-to-head/759/773", "/maajoukkueet/kohtaamiset/759/773"],
  ["/national-teams/mens-team/head-to-head/1/2", "/maajoukkueet/huuhkajat/kohtaamiset/1/2"],
  ["/national-teams/womens-team/head-to-head/1/2", "/maajoukkueet/helmarit/kohtaamiset/1/2"],
  ["/predictions", "/ennusteet"],
] as const;

test.describe("English folder paths", () => {
  for (const [english, finnish] of REDIRECTS) {
    test(`${english} redirects to ${finnish}`, async ({ request }) => {
      // Asked without following, so the answer is the redirect itself and not
      // whatever page the browser ends up on.
      const response = await request.get(english, { maxRedirects: 0 });

      expect(response.status()).toBe(308);
      expect(response.headers().location).toBe(finnish);
    });
  }

  test("keeps the query string across the redirect", async ({ request }) => {
    const response = await request.get("/national-teams/mens-team?kausi=2024", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe("/maajoukkueet/huuhkajat?kausi=2024");
  });
});
