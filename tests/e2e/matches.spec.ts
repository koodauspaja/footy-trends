import { expect, test } from "@playwright/test";

test.describe("Season-wide match list", () => {
  test("shows the current round and navigates between rounds", async ({ page }) => {
    await page.goto("/ottelut");

    await expect(page.getByRole("heading", { name: /Valioliiga/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Ottelu" })).toBeVisible();

    const heading = page.getByRole("heading", { level: 1 });
    const before = await heading.textContent();

    const nextLink = page.getByRole("link", { name: "Seuraava kierros ▶" });
    const prevLink = page.getByRole("link", { name: "◀ Edellinen kierros" });
    if (await nextLink.count()) {
      await nextLink.click();
    } else if (await prevLink.count()) {
      await prevLink.click();
    }

    await expect(heading).not.toHaveText(before ?? "");
  });

  test("links a team name from the match list to its team page", async ({ page }) => {
    await page.goto("/ottelut");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    const teamName = await firstTeamLink.textContent();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/joukkue\/\d+/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(teamName ?? "");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Pvm" })).toBeVisible();
  });

  test("falls back to the current round with a Finnish banner for an invalid kierros", async ({
    page,
  }) => {
    await page.goto("/ottelut?kierros=999999");

    await expect(page.getByRole("status").first()).toContainText("Kierrosta ei löytynyt.");
  });

  test("shows a different competition's matches when kilpailu is set", async ({ page }) => {
    await page.goto("/ottelut?kilpailu=BL1");

    await expect(page.getByRole("heading", { name: /Bundesliga/ })).toBeVisible();
  });
});
