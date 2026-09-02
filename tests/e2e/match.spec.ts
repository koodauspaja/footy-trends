import { expect, test } from "@playwright/test";

/**
 * The match page, reached the way a reader reaches it: by clicking a row's date
 * in a match list. Every region is covered, because the routes resolve against
 * different tables — see specs/019-match-page.md.
 */

const WINDOW_SENTENCE = /Perustuu (kaudesta|vuodesta) .+ alkaen tallennettuihin otteluihin\./;

async function firstMatchLink(page: import("@playwright/test").Page) {
  return page.locator("table tbody tr").first().getByRole("link").first();
}

test.describe("Match page", () => {
  test("a Finnish match list links each row to its match page", async ({ page }) => {
    await page.goto("/kotimaa/ottelut?kausi=2025");

    const row = page.locator("table tbody tr").first();
    const teams = await row.locator("td").nth(1).textContent();
    await (await firstMatchLink(page)).click();

    await expect(page).toHaveURL(/\/kotimaa\/ottelu\/\d+/);
    // The row reads "Home – Away"; the heading names the same two teams.
    const [home] = (teams ?? "").split(" – ");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(home?.trim() ?? "");
    await expect(
      page.getByRole("heading", { level: 2, name: "Aiemmat kohtaamiset" })
    ).toBeVisible();
    await expect(page.getByText(WINDOW_SENTENCE)).toBeVisible();
  });

  test("a foreign match list links each row to its match page", async ({ page }) => {
    await page.goto("/ulkomaat/ottelut");

    await (await firstMatchLink(page)).click();

    await expect(page).toHaveURL(/\/ulkomaat\/ottelu\/\d+/);
    await expect(page.getByText(WINDOW_SENTENCE)).toBeVisible();
  });

  test("a Huuhkajat row links under the team's own path, not /maajoukkueet/ottelu", async ({
    page,
  }) => {
    await page.goto("/maajoukkueet/huuhkajat");

    await (await firstMatchLink(page)).click();

    await expect(page).toHaveURL(/\/maajoukkueet\/huuhkajat\/ottelu\/\d+/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Suomi");
  });

  test("previous meetings link on to their own match pages", async ({ page }) => {
    await page.goto("/kotimaa/ottelut?kausi=2025");
    await (await firstMatchLink(page)).click();

    await expect(page).toHaveURL(/\/kotimaa\/ottelu\/\d+/);

    const meetings = page.locator("table tbody tr");
    // A Veikkausliiga pair has met many times over the stored seasons, but the
    // page shows at most five.
    const count = await meetings.count();
    expect(count).toBeLessThanOrEqual(5);

    if (count > 0) {
      await meetings.first().getByRole("link").first().click();
      await expect(page).toHaveURL(/\/kotimaa\/ottelu\/\d+/);
      await expect(
        page.getByRole("heading", { level: 2, name: "Aiemmat kohtaamiset" })
      ).toBeVisible();
    }
  });

  test("an unknown id shows the Finnish not-found state", async ({ page }) => {
    await page.goto("/kotimaa/ottelu/999999999");

    // Scoped to the body: the page title carries the same sentence.
    await expect(page.locator("main").getByText("Ottelua ei löytynyt.")).toBeVisible();
  });

  test("a match id from another region is a not-found, not another region's match", async ({
    page,
  }) => {
    // 317 ids exist in both tables; the region is what disambiguates them.
    await page.goto("/ulkomaat/ottelu/4036979");

    // Scoped to the body: the page title carries the same sentence.
    await expect(page.locator("main").getByText("Ottelua ei löytynyt.")).toBeVisible();
  });
});
