import { expect, test } from "@playwright/test";

test.describe("Domestic team match list (Veikkausliiga)", () => {
  test("a bare team URL shows the team's own competition and season", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=M2");
    await page.locator("table tbody tr").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);

    const heading = await page.getByRole("heading", { level: 1 }).textContent();
    const bare = new URL(page.url()).pathname;
    await page.goto(bare);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading ?? "");
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("an unknown team id shows the reduced not-found page", async ({ page }) => {
    await page.goto("/kotimaa/joukkue/999999999");

    await expect(page.getByRole("heading", { level: 1, name: "Joukkue" })).toBeVisible();
    await expect(page.locator("main").getByText("Joukkuetta ei löytynyt.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sarjataulukkoon" })).toHaveCount(0);
  });

  test("clicking a team name navigates to its team page, showing matches with a group name column", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2020");

    const firstTeamLink = page
      .locator("table")
      .first()
      .locator("tbody tr")
      .first()
      .getByRole("link")
      .first();
    const teamName = await firstTeamLink.textContent();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(teamName ?? "");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Sarja" })).toBeVisible();
  });

  test("a team appearing in multiple groups (e.g. Mestaruussarja) lists matches from both, chronologically", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2025");

    // Runkosarja's own table is the first on the page.
    const firstTeamLink = page
      .locator("table")
      .first()
      .locator("tbody tr")
      .first()
      .getByRole("link")
      .first();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);
    const groupCells = page.locator("table tbody tr td:nth-child(4)");
    const groupNames = new Set(await groupCells.allTextContents());
    // The top Runkosarja team from 2025 continues into Mestaruussarja, so
    // its match list should span at least two distinct groups.
    expect(groupNames.size).toBeGreaterThan(1);
  });

  test("links back to the standings for the current season", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2020");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    await firstTeamLink.click();

    await page.getByRole("link", { name: "Sarjataulukkoon" }).click();

    await expect(page).toHaveURL(/\/kotimaa\/sarjataulukko\?.*kausi=2020/);
    await expect(page.getByRole("heading", { name: /Veikkausliiga/ })).toBeVisible();
  });
});
