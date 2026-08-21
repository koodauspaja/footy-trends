import { expect, test } from "@playwright/test";

test.describe("Kotimaa standings page (Veikkausliiga)", () => {
  test("loads the standings table for the default (current) season", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko");

    await expect(page.getByRole("heading", { name: /Veikkausliiga/ })).toBeVisible();
    await expect(page.getByRole("table").first()).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("shows three group tables for a season with a Runkosarja/Mestaruussarja/Karsintasarja split", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2025");

    await expect(page.getByRole("heading", { name: "Runkosarja", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mestaruussarja", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Karsintasarja", level: 2 })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(3);
  });

  test("shows a single Runkosarja table for 2015, TASO's own group_name '1' displayed as Runkosarja", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2015");

    await expect(page.getByRole("heading", { name: "Runkosarja", level: 2 })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(1);
  });

  test("filters standings by round via the Kierros selector and updates the URL", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2020");

    await page.getByLabel("Kierros").selectOption("1");
    await expect(page).toHaveURL(/kierros=1/);

    const playedColumn = page.locator("table").first().locator("tbody tr td:nth-child(3)");
    const playedCounts = await playedColumn.allTextContents();
    for (const played of playedCounts) {
      expect(Number(played)).toBeLessThanOrEqual(1);
    }
  });

  test("falls back to the latest season with a Finnish banner for an invalid kausi", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=1999");

    await expect(page.getByRole("status").first()).toContainText("Kautta ei löytynyt.");
  });

  test("falls back to the whole season with a Finnish banner for an invalid kierros", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2020&kierros=999999");

    await expect(page.getByRole("status").first()).toContainText("Kierrosta ei löytynyt.");
  });

  test("links to the season's full match list", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2020");

    await page.getByRole("link", { name: "Kaikki ottelut" }).click();

    await expect(page).toHaveURL(/\/kotimaa\/ottelut\?.*kausi=2020/);
  });

  test("Kotimaa entry point from the region picker reaches Veikkausliiga's standings", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /Kotimaa/ }).click();
    await page.getByRole("link", { name: /Veikkausliiga/ }).click();

    await expect(page).toHaveURL(/\/kotimaa\/sarjataulukko\?kilpailu=VL/);
    await expect(page.getByRole("heading", { name: /Veikkausliiga/ })).toBeVisible();
  });
});
