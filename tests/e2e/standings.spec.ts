import { expect, test } from "@playwright/test";

test.describe("Standings page", () => {
  test("loads the standings table for the default season", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko");

    await expect(page.getByRole("heading", { name: /Valioliiga/ })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator("table tbody tr")).not.toHaveCount(0);
  });

  test("filters standings by round via the Kierros selector and updates the URL", async ({
    page,
  }) => {
    await page.goto("/ulkomaat/sarjataulukko");

    await page.getByLabel("Kierros").selectOption("1");
    await expect(page).toHaveURL(/kierros=1/);

    const playedColumn = page.locator("table tbody tr td:nth-child(3)");
    const playedCounts = await playedColumn.allTextContents();
    for (const played of playedCounts) {
      expect(Number(played)).toBeLessThanOrEqual(1);
    }
  });

  test("falls back to the active season with a Finnish banner for an invalid kausi", async ({
    page,
  }) => {
    await page.goto("/ulkomaat/sarjataulukko?kausi=1999");

    await expect(page.getByRole("status").first()).toContainText("Kautta ei löytynyt.");
  });

  test("falls back to the whole season with a Finnish banner for an invalid kierros", async ({
    page,
  }) => {
    await page.goto("/ulkomaat/sarjataulukko?kierros=999999");

    await expect(page.getByRole("status").first()).toContainText("Kierrosta ei löytynyt.");
  });

  test("shows a different competition's standings when kilpailu is set", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=BL1");

    await expect(page.getByRole("heading", { name: /Bundesliga/ })).toBeVisible();
    await expect(page.getByLabel("Kilpailu")).toHaveValue("BL1");
  });

  test("the Etusivu link in the header returns to the region picker", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko");

    await page.getByRole("link", { name: "Etusivu" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Valitse alue" })).toBeVisible();
  });

  test("carries the selected round into the Kaikki ottelut link", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko");

    await page.getByLabel("Kierros").selectOption("1");
    await expect(page).toHaveURL(/kierros=1/);

    await page.getByRole("link", { name: "Kaikki ottelut" }).click();

    await expect(page).toHaveURL(/\/ulkomaat\/ottelut\?.*kierros=1/);
  });
});
