import { expect, test } from "@playwright/test";
import { signedInAs, waitForSession } from "./session";

/**
 * Veikkausliiga's standings page, end to end: split seasons and their round
 * numbering against live data, and how a group renders against the seeded
 * season.
 *
 * decisions/009-veikkausliiga.md
 * decisions/010-playoff-group-match-list.md
 * decisions/133-split-group-round-numbering.md
 * decisions/304-test-database.md
 * decisions/063-competition-zones.md
 */

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

  // The rendering rules, against the seeded season: no live season produces a
  // knockout group without points. Seeded, the page also makes no provider
  // request, because a completed season with stored rows is never refetched.
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

  test("names what the league group's positions lead to, and rules its levels off, signed out", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2017");

    const section = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Runkosarja", level: 2 }) });
    // A level with a count and no label names no line and still takes its places.
    await expect(section.getByRole("listitem")).toHaveText([
      "Sija 1: Kultaa",
      "Sija 4: Putoaa Ykköseen",
    ]);

    // A heavier rule under the last row of each level but the one ending the table.
    const widths = await section
      .locator("tbody tr")
      .evaluateAll((rows) => rows.map((row) => getComputedStyle(row).borderBottomWidth));
    expect(widths).toEqual(["2px", "1px", "2px", "1px"]);

    // The source of the labels once on the page, after the list.
    const source = page.getByText("Sijoitusten merkitykset ovat Palloliiton tulospalvelusta.");
    await expect(source).toHaveCount(1);
    await expect(section.locator("ul + p")).toHaveText(
      "Sijoitusten merkitykset ovat Palloliiton tulospalvelusta."
    );

    // The match-list groups carry neither.
    const knockout = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Eurolopputurnaus", exact: true, level: 2 }),
    });
    await expect(knockout.getByRole("listitem")).toHaveCount(0);
  });

  test("names the same positions to a signed-in reader", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen");
    await page.goto("/kotimaa/sarjataulukko?kausi=2017");
    await waitForSession(page);

    const section = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Runkosarja", level: 2 }) });
    await expect(section.getByRole("listitem")).toHaveText([
      "Sija 1: Kultaa",
      "Sija 4: Putoaa Ykköseen",
    ]);
    await expect(
      page.getByText("Sijoitusten merkitykset ovat Palloliiton tulospalvelusta.")
    ).toHaveCount(1);
  });

  test("a knockout group renders its matches, with no standings columns", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2017");

    // Located by heading, not by `nth()`: a season with one group more or fewer
    // would silently retarget a positional index.
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
    // appears exactly when one does.
    await expect(page.getByRole("heading", { name: "Pudotuspelit", level: 2 })).toBeVisible();

    expect(consoleErrors.filter((text) => text.includes("same key"))).toEqual([]);
  });

  test("a restarted-numbering season's round filter counts one stage, not two", async ({
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

  test("a restarted-numbering season's split rounds are reachable in the selector", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2022");

    const options = page.getByLabel("Kierros").locator("option");
    await expect(options.first()).toBeAttached();

    const values = await options.evaluateAll((all) =>
      all.map((option) => (option as HTMLOptionElement).value)
    );
    const rounds = values.map(Number).filter((round) => Number.isInteger(round) && round > 0);

    // Above Runkosarja's 22: the split groups' own rounds are selectable too.
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
