import { expect, test } from "@playwright/test";

/**
 * Only Finnish URLs exist. Three families of address redirect into them:
 * the top-level paths the foreign pages used to live at, the English paths
 * that answered 200 before the folder rename, and the English App Router
 * folder paths, which a Next rewrite does not block on its own.
 *
 * Asserted against a running server rather than the config, and the hop
 * count is asserted too — a chain that happens to end in the right place is
 * still a bug. See specs/012-finnish-urls-english-code.md.
 */

const MOVED = [
  ["/sarjataulukko", "/ulkomaat/sarjataulukko"],
  ["/ottelut", "/ulkomaat/ottelut"],
  ["/joukkue/57", "/ulkomaat/joukkue/57"],
] as const;

// Reachable before the rename, so a bookmark or search index can still ask
// for them. src/app/standings and src/app/kotimaa/standings are gone.
const LEGACY = [
  ["/standings", "/ulkomaat/sarjataulukko"],
  ["/matches", "/ulkomaat/ottelut"],
  ["/team/57", "/ulkomaat/joukkue/57"],
  ["/kotimaa/standings", "/kotimaa/sarjataulukko"],
  ["/kotimaa/matches", "/kotimaa/ottelut"],
  ["/kotimaa/team/57", "/kotimaa/joukkue/57"],
  ["/ulkomaat/standings", "/ulkomaat/sarjataulukko"],
  ["/ulkomaat/matches", "/ulkomaat/ottelut"],
  ["/ulkomaat/team/57", "/ulkomaat/joukkue/57"],
] as const;

const ENGLISH = [
  ["/domestic", "/kotimaa"],
  ["/domestic/standings", "/kotimaa/sarjataulukko"],
  ["/domestic/matches", "/kotimaa/ottelut"],
  ["/domestic/team/57", "/kotimaa/joukkue/57"],
  ["/foreign", "/ulkomaat"],
  ["/foreign/standings", "/ulkomaat/sarjataulukko"],
  ["/foreign/matches", "/ulkomaat/ottelut"],
  ["/foreign/team/57", "/ulkomaat/joukkue/57"],
] as const;

test.describe("URL redirects", () => {
  for (const [from, to] of [...MOVED, ...LEGACY, ...ENGLISH]) {
    test(`${from} redirects to ${to}`, async ({ request }) => {
      const response = await request.get(from, { maxRedirects: 0 });

      // 308, not 307: the move is permanent and preserves the request method.
      expect(response.status()).toBe(308);
      expect(response.headers().location).toBe(to);
    });
  }

  test("a redirect lands in one hop, not via a chain", async ({ page }) => {
    const chain: string[] = [];
    page.on("response", (response) => {
      if ([301, 302, 307, 308].includes(response.status())) chain.push(response.url());
    });

    await page.goto("/joukkue/57?kilpailu=PL");

    expect(chain).toHaveLength(1);
    await expect(page).toHaveURL(/\/ulkomaat\/joukkue\/57\?kilpailu=PL/);
  });

  test("query strings survive the redirect", async ({ request }) => {
    const response = await request.get("/domestic/standings?kausi=2023&kierros=5", {
      maxRedirects: 0,
    });

    expect(response.headers().location).toBe("/kotimaa/sarjataulukko?kausi=2023&kierros=5");
  });

  test("a Finnish URL is served directly, with no redirect at all", async ({ request }) => {
    const response = await request.get("/kotimaa/sarjataulukko", { maxRedirects: 0 });

    expect(response.status()).toBe(200);
  });
});
