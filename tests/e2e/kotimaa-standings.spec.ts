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

  test("renders all five groups for 2022, with the playoff groups as match lists", async ({
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

    // Eurolopputurnaus is a knockout, not a points competition, so it
    // renders its matches instead of a table. This previously asserted
    // toHaveCount(6) against a 4-team group — it was counting TASO's
    // per-bracket-slot rows, i.e. asserting the duplication as correct.
    // See specs/010-playoff-group-match-list.md.
    const playoff = page.getByRole("table").nth(3);
    await expect(playoff.locator("thead")).toContainText("Kierros");
    await expect(playoff.locator("thead")).not.toContainText("Sija");
    await expect(playoff.locator("tbody tr")).toHaveCount(3);
    await expect(page.locator("body")).not.toContainText("null");
  });

  test("a playoff group does not repeat an advancing team, and logs no duplicate-key error", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto("/kotimaa/sarjataulukko?kausi=2023");

    // 2023's Eurolopputurnaus is the worst case: TASO returns 8 slot rows
    // for 5 distinct teams, FC Honka occupying three of them. As a table
    // that produced three identical React keys.
    const playoff = page.getByRole("table").nth(3);
    await expect(playoff.locator("thead")).toContainText("Kierros");
    // Five stored matches; the sixth TASO row is the final's dateless
    // aggregate, which is never stored and must not appear as a fixture.
    await expect(playoff.locator("tbody tr")).toHaveCount(5);

    expect(consoleErrors.filter((text) => text.includes("same key"))).toEqual([]);
  });

  test("2024's Eurolopputurnaus also renders as a match list, not a table", async ({ page }) => {
    // The fourth and last season with a playoff group. Same 8-slots-for-5-
    // teams shape as 2023, and named in this feature's acceptance criteria,
    // so it is asserted directly rather than inferred from the shared path.
    await page.goto("/kotimaa/sarjataulukko?kausi=2024");

    const playoff = page.getByRole("table").nth(3);
    await expect(playoff.locator("thead")).toContainText("Kierros");
    await expect(playoff.locator("thead")).not.toContainText("Sija");
    await expect(page.locator("body")).not.toContainText("null");
  });

  test("2019's split groups stay standings tables while its playoff groups become match lists", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2019");

    // 2019 is the case that rules out "playoff = anything we can't
    // own-calculate": Mestaruussarja and Haastajasarja are real league
    // groups with real points, but have no carry-over config entry.
    const mestaruussarja = page.getByRole("table").nth(1);
    await expect(mestaruussarja.locator("thead")).toContainText("Sija");
    await expect(mestaruussarja.locator("tbody tr")).toHaveCount(6);
    await expect(mestaruussarja.locator("tbody")).toContainText("KuPS");

    // EL-lopputurnaus and EL-finaali, the same shape as Eurolopputurnaus
    // under an older name.
    await expect(page.getByRole("table").nth(3).locator("thead")).toContainText("Kierros");
    await expect(page.getByRole("table").nth(4).locator("thead")).toContainText("Kierros");
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
