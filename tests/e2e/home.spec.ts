import { expect, test } from "@playwright/test";

test.describe("Home page — standings", () => {
  test("loads the standings table for the default season", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Valioliigan sarjataulukko/ })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator("table tbody tr")).not.toHaveCount(0);
  });

  test("filters standings by round via the Kierros selector and updates the URL", async ({
    page,
  }) => {
    await page.goto("/");

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
    await page.goto("/?kausi=1999");

    await expect(page.getByRole("status").first()).toContainText("Kautta ei löytynyt.");
  });

  test("falls back to the whole season with a Finnish banner for an invalid kierros", async ({
    page,
  }) => {
    await page.goto("/?kierros=999999");

    await expect(page.getByRole("status").first()).toContainText("Kierrosta ei löytynyt.");
  });
});
