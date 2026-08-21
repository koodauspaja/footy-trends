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

    // Each split group lists only its own six teams — a continuation group
    // is calculated from its parent's matches too, so a roster bug there
    // silently shows all twelve Runkosarja teams instead.
    await expect(page.getByRole("table").nth(0).locator("tbody tr")).toHaveCount(12);
    await expect(page.getByRole("table").nth(1).locator("tbody tr")).toHaveCount(6);
    await expect(page.getByRole("table").nth(2).locator("tbody tr")).toHaveCount(6);
  });

  test("a split group's standings and positions match TASO's own published numbers", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2025");

    // 2025 Mestaruussarja's real final table, carry-over included, as TASO
    // itself reports it — the end-to-end check that our own calculation
    // reproduces the official numbers.
    const rows = page.getByRole("table").nth(1).locator("tbody tr");
    await expect(rows.nth(0)).toContainText("KuPS");
    await expect(rows.nth(0)).toContainText("67");
    await expect(rows.nth(0)).toContainText("32");
    await expect(rows.nth(5)).toContainText("IF Gnistan");
    await expect(rows.nth(5)).toContainText("33");
  });

  test("renders all five groups for 2022, with the bonus groups passed through showing – for their null stats", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2022");

    // 2022 is the widest season TASO has: Runkosarja, the two split groups,
    // plus Eurolopputurnaus and its 2-team final — an acceptance criterion
    // in specs/009-veikkausliiga.md.
    // exact: true — "Eurolopputurnaus" is otherwise a substring of
    // "Eurolopputurnausfinaali" and matches both headings.
    await expect(
      page.getByRole("heading", { name: "Eurolopputurnaus", exact: true, level: 2 })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Eurolopputurnausfinaali", exact: true, level: 2 })
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(5);

    // Eurolopputurnaus is not a points competition at all — TASO reports
    // null for every stat but matches_played, and the table must show "–"
    // rather than crashing or printing "null".
    const bonusRows = page.getByRole("table").nth(3).locator("tbody tr");
    await expect(bonusRows).toHaveCount(6);
    await expect(bonusRows.first()).toContainText("–");
    await expect(page.locator("body")).not.toContainText("null");
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
