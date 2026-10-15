import { expect, test } from "@playwright/test";

/**
 * The standings page, end to end.
 *
 * decisions/001-premier-league-match-based-standings.md
 * decisions/006-other-competitions.md
 * decisions/007-back-navigation.md
 * decisions/065-foreign-league-zones.md
 */

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

test.describe("A foreign league's zones", () => {
  // Signed out: the context has no session, and the zones are not analytics.
  test("marks what the places lead to, signed out", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=PL");

    await expect(page.getByRole("table")).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: /^Sijat 18–20: Putoaa$/ })
    ).toBeVisible();
    await expect(page.getByText("Eurooppa-paikat voivat muuttua cup-tuloksilla")).toHaveCount(1);
    // The tint and the heavier rule are drawn on the rows, not only listed.
    await expect(
      page.locator("table tbody tr[class*='bg-zone-relegation-background']")
    ).toHaveCount(3);
    await expect(page.locator("table tbody tr.border-b-2")).not.toHaveCount(0);
  });

  test("tints promotion and its play-off in the Championship, without a cup line", async ({
    page,
  }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=ELC");

    await expect(page.locator("table tbody tr[class*='bg-zone-promotion-background']")).toHaveCount(
      2
    );
    await expect(
      page.locator("table tbody tr[class*='bg-zone-playoff-background']")
    ).not.toHaveCount(0);
    await expect(page.getByText(/voivat muuttua/)).toHaveCount(0);
  });

  test("shows no zones for the Champions League", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=CL");

    await expect(page.getByRole("heading", { name: /Mestarien liiga/ }).first()).toBeVisible();
    await expect(page.locator("tr[class*='bg-zone-']")).toHaveCount(0);
    await expect(page.getByText(/voivat muuttua/)).toHaveCount(0);
  });

  test.describe("at 375 px", () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test("lists the zones under the table and adds no sideways scroll to the page", async ({
      page,
    }) => {
      await page.goto("/ulkomaat/sarjataulukko?kilpailu=PL");

      await expect(
        page.getByRole("listitem").filter({ hasText: /^Sijat 18–20: Putoaa$/ })
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
});
