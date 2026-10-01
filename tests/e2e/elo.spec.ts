import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * `Joukkueen vahvuus (Elo)` on a club's page (specs/053 S9, S10), end to end.
 * Signed in the way league-position.spec.ts explains.
 *
 * The club is read off the standings rather than named, and no rating is: what
 * holds whatever the data is that the panel sits in `Muut kaudet`, draws a
 * line, explains 1500 and lists a rating per season.
 */

const HEADING = "Joukkueen vahvuus (Elo)";

async function openFirstClub(page: Page) {
  await page.goto("/kotimaa/sarjataulukko?kilpailu=VL");
  await page.locator("table tbody tr").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);
}

test.describe("Team Elo, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("a Veikkausliiga club's page charts its rating in Muut kaudet", async ({ page }) => {
    await openFirstClub(page);

    const group = page.getByRole("region", { name: "Muut kaudet" });
    const panel = group.getByRole("region", { name: HEADING });
    await expect(panel).toBeVisible();
    await expect(panel.locator("[data-part=line]")).toHaveCount(1);
    await expect(panel.getByText(/^1500 on keskitasoinen joukkue\./)).toBeVisible();
    const seasons = await panel.locator("ol li").allTextContents();
    expect(seasons.length).toBeGreaterThan(0);
    for (const season of seasons) expect(season).toMatch(/^\d{4}: \d{3,4}$/);
  });
});

test.describe("Team Elo, signed out", () => {
  test("carries no rating in the page", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL");
    const href = await page
      .locator("table tbody tr")
      .first()
      .getByRole("link")
      .first()
      .getAttribute("href");
    const response = await page.goto(href ?? "/");
    const html = (await response?.text()) ?? "";

    expect(html).not.toContain(HEADING);
    expect(html).not.toContain("Elo-luku");
  });
});
