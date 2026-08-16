import { expect, test } from "@playwright/test";

test.describe("Team match list", () => {
  test("clicking a team name navigates to its team page and shows the match list", async ({
    page,
  }) => {
    await page.goto("/sarjataulukko");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    const teamName = await firstTeamLink.textContent();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/joukkue\/\d+/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(teamName ?? "");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Pvm" })).toBeVisible();
  });

  test("clicking a team name for a non-default competition carries kilpailu to the team page", async ({
    page,
  }) => {
    await page.goto("/sarjataulukko?kilpailu=BL1");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    const teamName = await firstTeamLink.textContent();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/joukkue\/\d+\?kilpailu=BL1/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(teamName ?? "");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bundesliga");
  });

  test("shows the not-found state for an unknown team id, with the season selector still usable", async ({
    page,
  }) => {
    await page.goto("/joukkue/999999999");

    await expect(page.getByText("Joukkuetta ei löytynyt.")).toBeVisible();
    await expect(page.getByLabel("Kausi")).toBeVisible();
  });

  test("links back to the standings for the current competition", async ({ page }) => {
    await page.goto("/sarjataulukko?kilpailu=BL1");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    await firstTeamLink.click();

    await page.getByRole("link", { name: "Sarjataulukkoon" }).click();

    await expect(page).toHaveURL(/\/sarjataulukko\?kilpailu=BL1/);
    await expect(page.getByRole("heading", { name: /Bundesliga/ })).toBeVisible();
  });
});
