import { expect, test } from "@playwright/test";

test.describe("Domestic standings page (Veikkausliiga)", () => {
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

  /**
   * The rendering rules, against the seeded season rather than a real one
   * (#304).
   *
   * These used to assert on 2019, 2022, 2023 and 2024, and passed only on a
   * database synced before #272 — TASO omitted `points` for a knockout group
   * through the endpoint the app read then, so those groups classified as match
   * lists. `getCategory` sends points for them, so no live season produces this
   * shape any more and the assertions were describing a provider outage.
   *
   * Seeded, they also cost nothing: a completed season with stored rows is
   * never refetched, so this page makes no provider request at all.
   */
  test("renders a league group as a table and a knockout group as its matches", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2017");

    await expect(page.getByRole("heading", { name: "Runkosarja", level: 2 })).toBeVisible();
    // exact — "Eurolopputurnaus" is otherwise a substring of
    // "Eurolopputurnausfinaali" and matches both headings.
    await expect(
      page.getByRole("heading", { name: "Eurolopputurnaus", exact: true, level: 2 })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Eurolopputurnausfinaali", exact: true, level: 2 })
    ).toBeVisible();

    // The league group keeps a table: TASO reports points for it.
    const league = page.getByRole("table").first();
    await expect(league.locator("thead")).toContainText("Sija");
    await expect(league.locator("tbody tr")).toHaveCount(4);
    await expect(league.locator("tbody tr").first()).toContainText("Fixture HJK");

    await expect(page.locator("body")).not.toContainText("null");
  });

  test("a knockout group renders its matches, with no standings columns", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2017");

    /**
     * Located by heading rather than by `nth()`. The old assertions indexed
     * tables positionally, so a season with one group more or fewer silently
     * retargeted them — which is exactly how they came to assert the wrong
     * thing without anyone noticing.
     */
    const knockout = page
      .getByRole("heading", { name: "Eurolopputurnaus", exact: true, level: 2 })
      .locator("xpath=following::table[1]");

    await expect(knockout.locator("thead")).toContainText("Kierros");
    await expect(knockout.locator("thead")).not.toContainText("Sija");
    // Three matches in the fixture's knockout group.
    await expect(knockout.locator("tbody tr")).toHaveCount(3);
  });

  test("the two-legged final renders as matches too", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2017");

    const final = page
      .getByRole("heading", { name: "Eurolopputurnausfinaali", exact: true, level: 2 })
      .locator("xpath=following::table[1]");

    await expect(final.locator("thead")).toContainText("Kierros");
    await expect(final.locator("tbody tr")).toHaveCount(2);
  });

  test("draws a bracket above the groups, and logs no duplicate-key error", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto("/kotimaa/sarjataulukko?kausi=2017");

    // The bracket is built from the groups that render as match lists, so it
    // appears exactly when one does — see specs/010-playoff-group-match-list.md.
    await expect(page.getByRole("heading", { name: "Pudotuspelit", level: 2 })).toBeVisible();

    expect(consoleErrors.filter((text) => text.includes("same key"))).toEqual([]);
  });

  test("a restarted-numbering season's round filter counts one stage, not two (#133)", async ({
    page,
  }) => {
    // The issue's repro, against live data. 2022's split groups restart at
    // round 1, so before the fix "Kierros 5" combined Runkosarja rounds 1-5
    // with Mestaruussarja rounds 1-5 and showed 10 played.
    await page.goto("/kotimaa/sarjataulukko?kausi=2022&kierros=5");

    // Await the rows before reading them: allTextContents() does not
    // auto-wait, so it returns [] while the page is still streaming.
    const playedColumn = page.getByRole("table").nth(1).locator("tbody tr td:nth-child(3)");
    await expect(playedColumn.first()).toBeVisible();

    const played = await playedColumn.allTextContents();
    // Exactly 5, not "at most 5": a filter that dropped valid matches, or
    // returned an empty table, would pass a <= assertion.
    expect(played.map(Number)).toEqual([5, 5, 5, 5, 5, 5]);
  });

  test("a restarted-numbering season's split rounds are reachable in the selector (#133)", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2022");

    const options = page.getByLabel("Kierros").locator("option");
    await expect(options.first()).toBeAttached();

    const values = await options.evaluateAll((all) =>
      all.map((option) => (option as HTMLOptionElement).value)
    );
    const rounds = values.map(Number).filter((round) => Number.isInteger(round) && round > 0);

    // Previously capped at Runkosarja's 22, leaving the split groups' own
    // rounds unselectable.
    expect(Math.max(...rounds)).toBeGreaterThan(22);
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

  test("the Kotimaa entry point on the region picker reaches Veikkausliiga's standings", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /Kotimaa/ }).click();
    await page.getByRole("link", { name: /Veikkausliiga/ }).click();

    await expect(page).toHaveURL(/\/kotimaa\/sarjataulukko\?kilpailu=VL/);
    await expect(page.getByRole("heading", { name: /Veikkausliiga/ })).toBeVisible();
  });
});
