import { expect, test } from "@playwright/test";

/**
 * Structure and labels only — scores and future fixtures change with the real
 * season, so asserting on them would make these brittle. See
 * specs/017-huuhkajat.md.
 */
test.describe("Huuhkajat", () => {
  test("reaches the page from the region picker", async ({ page }) => {
    await page.goto("/maajoukkueet");

    await page.getByRole("link", { name: /Huuhkajat$/ }).click();

    await expect(page).toHaveURL(/\/maajoukkueet\/huuhkajat$/);
    await expect(page.getByRole("heading", { level: 1, name: "Huuhkajat" })).toBeVisible();
  });

  test("lists every year at once, with no selectors", async ({ page }) => {
    await page.goto("/maajoukkueet/huuhkajat");

    await expect(page.getByLabel("Kausi")).toHaveCount(0);
    await expect(page.getByLabel("Kilpailu")).toHaveCount(0);
    // Six years are in scope; asserting "more than one" keeps this from
    // failing the January a new year is added.
    expect(await page.locator("details").count()).toBeGreaterThan(1);
  });

  test("orders the years newest first", async ({ page }) => {
    await page.goto("/maajoukkueet/huuhkajat");

    const years = await page.locator("details h2").allTextContents();
    const asNumbers = years.map(Number);
    expect(asNumbers).toEqual([...asNumbers].sort((left, right) => right - left));
  });

  test("folds a year away and back", async ({ page }) => {
    await page.goto("/maajoukkueet/huuhkajat");
    const first = page.locator("details").first();

    await expect(first).toHaveAttribute("open", "");
    await first.locator("summary").click();
    await expect(first).not.toHaveAttribute("open", "");
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
  });

  test("names each row's competition", async ({ page }) => {
    await page.goto("/maajoukkueet/huuhkajat");

    await expect(page.getByRole("columnheader", { name: "Kilpailu" }).first()).toBeVisible();
    // Nothing may keep the suffix the label is built by stripping.
    await expect(page.getByText(/ Huuhkajat/)).toHaveCount(0);
  });

  test("shows the 2021 Euro finals, which live under a competition id of another shape", async ({
    page,
  }) => {
    await page.goto("/maajoukkueet/huuhkajat");

    const section = page
      .locator("details")
      .filter({ has: page.getByRole("heading", { name: "2021" }) });
    await expect(section).toHaveCount(1);
    await expect(section.getByText("EM-lopputurnaus").first()).toBeVisible();
  });

  test("lists only Finland's matches", async ({ page }) => {
    await page.goto("/maajoukkueet/huuhkajat");

    const fixtures = await page.locator("tbody tr").allTextContents();
    expect(fixtures.length).toBeGreaterThan(0);
    for (const row of fixtures) expect(row).toContain("Suomi");
  });
});
