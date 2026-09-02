import { expect, test } from "@playwright/test";

test.describe("Team match list", () => {
  test("clicking a team name navigates to its team page and shows the match list", async ({
    page,
  }) => {
    await page.goto("/ulkomaat/sarjataulukko");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    const teamName = await firstTeamLink.textContent();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/ulkomaat\/joukkue\/\d+/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(teamName ?? "");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Pvm" })).toBeVisible();
  });

  test("a bare team URL shows the team's own competition, not the region's default", async ({
    page,
  }) => {
    // Reached by navigation rather than a hardcoded id, then stripped of its
    // parameters: before specs/020 the bare URL meant "Valioliiga, active
    // season", which served 20 of 315 stored team ids.
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=BL1");
    await page.locator("table tbody tr").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/ulkomaat\/joukkue\/\d+/);

    const heading = await page.getByRole("heading", { level: 1 }).textContent();
    const bare = new URL(page.url()).pathname;
    await page.goto(bare);

    await expect(page).toHaveURL(bare);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading ?? "");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bundesliga");
  });

  test("a season alone resolves the competition of that season's matches", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=BL1&kausi=2024");
    await page.locator("table tbody tr").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/ulkomaat\/joukkue\/\d+/);

    const bare = new URL(page.url()).pathname;
    await page.goto(`${bare}?kausi=2024`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bundesliga 2024/25");
  });

  test("an unknown team id shows the reduced not-found page", async ({ page }) => {
    await page.goto("/ulkomaat/joukkue/999999999");

    await expect(page.getByRole("heading", { level: 1, name: "Joukkue" })).toBeVisible();
    await expect(page.locator("main").getByText("Joukkuetta ei löytynyt.")).toBeVisible();
    // No selector and no standings link for a competition it never played.
    await expect(page.getByLabel("Kausi")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sarjataulukkoon" })).toHaveCount(0);
  });

  test("clicking a team name for a non-default competition carries kilpailu to the team page", async ({
    page,
  }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=BL1");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    const teamName = await firstTeamLink.textContent();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/ulkomaat\/joukkue\/\d+\?kilpailu=BL1/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(teamName ?? "");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bundesliga");
  });

  test("links back to the standings for the current competition", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=BL1");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    await firstTeamLink.click();

    await page.getByRole("link", { name: "Sarjataulukkoon" }).click();

    await expect(page).toHaveURL(/\/ulkomaat\/sarjataulukko\?kilpailu=BL1/);
    await expect(page.getByRole("heading", { name: /Bundesliga/ })).toBeVisible();
  });
});
