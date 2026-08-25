import { expect, test } from "@playwright/test";

test.describe("Domestic season-wide match list (Veikkausliiga)", () => {
  test("shows the season's matches with date, teams, result, and group name columns", async ({
    page,
  }) => {
    await page.goto("/kotimaa/ottelut?kausi=2020");

    await expect(page.getByRole("heading", { name: /Veikkausliiga/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Pvm" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Ottelu" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Tulos" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Sarja" })).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("links a team name from the match list to its team page", async ({ page }) => {
    await page.goto("/kotimaa/ottelut?kausi=2020");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    const teamName = await firstTeamLink.textContent();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(teamName ?? "");
  });

  test("falls back to the latest season with a Finnish banner for an invalid kausi", async ({
    page,
  }) => {
    await page.goto("/kotimaa/ottelut?kausi=1999");

    await expect(page.getByRole("status").first()).toContainText("Kautta ei löytynyt.");
  });

  test("links back to the standings for the same season", async ({ page }) => {
    await page.goto("/kotimaa/ottelut?kausi=2020");

    await page.getByRole("link", { name: "Sarjataulukkoon" }).click();

    await expect(page).toHaveURL(/\/kotimaa\/sarjataulukko\?.*kausi=2020/);
    await expect(page.getByRole("heading", { name: /Veikkausliiga/ })).toBeVisible();
  });
});
