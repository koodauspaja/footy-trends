import { expect, test } from "@playwright/test";
import { MENS_TEAM_YEARS } from "@/lib/mens-team";

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
    // Exact on the finished seasons, which cannot gain or lose matches: a
    // missing 2022, or an unexpected extra section, both fail here. The
    // current year is filtered out rather than pinned, because the page omits
    // a year with no matches and January would otherwise fail an application
    // behaving exactly as specified.
    const years = (await page.locator("details h2").allTextContents()).map(Number);

    // The only year that may legitimately be absent is the newest *configured*
    // bucket, whose season may not have started. That is deliberately not
    // `new Date().getFullYear()`: the buckets are added by hand, so in 2027
    // the newest configured year is still 2026, and filtering on the clock
    // would leave 2026 in the list below and fail a correct page.
    const newestConfigured = Math.max(...MENS_TEAM_YEARS);
    expect(years.filter((year) => year !== newestConfigured)).toEqual([
      2025, 2024, 2023, 2022, 2021, 2020, 2019,
    ]);
    // Present or not, it can only be the newest section.
    expect(years.filter((year) => year === newestConfigured).length).toBeLessThanOrEqual(1);
    if (years.includes(newestConfigured)) expect(years[0]).toBe(newestConfigured);
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

  /**
   * `maajp18` is one provider bucket holding 2019, 2020 and 2021 matches, so
   * these two years only appear if the page files a match by its own date.
   */
  test("files a bucket's matches under the year they were played", async ({ page }) => {
    await page.goto("/maajoukkueet/huuhkajat");

    const years = await page.locator("details h2").allTextContents();
    expect(years).toContain("2019");
    expect(years).toContain("2020");

    const section2019 = page
      .locator("details")
      .filter({ has: page.getByRole("heading", { name: "2019" }) });
    await expect(section2019.getByText("EM-karsinnat").first()).toBeVisible();
  });

  /**
   * TASO names opponents in English in the 2019 and 2020 categories only, so
   * these rows are the ones that regress if the mapping is dropped.
   */
  test("names every opponent in Finnish, including the English ones TASO sends", async ({
    page,
  }) => {
    await page.goto("/maajoukkueet/huuhkajat");

    // Read the rendered text rather than locating a name: a cell holds the
    // whole pairing, "Suomi – Kreikka", so no single name is its own node.
    const rendered = await page.locator("main").innerText();

    for (const english of ["Greece", "Italy", "Bosnia and Herzegovina", "Republic of Ireland"]) {
      expect(rendered).not.toContain(english);
    }
    expect(rendered).toContain("Kreikka");
    expect(rendered).toContain("Italia");
    expect(rendered).toContain("Bosnia-Hertsegovina");
    expect(rendered).toContain("Irlanti");
  });

  test("lists only Finland's matches", async ({ page }) => {
    await page.goto("/maajoukkueet/huuhkajat");

    const fixtures = await page.locator("tbody tr").allTextContents();
    expect(fixtures.length).toBeGreaterThan(0);
    for (const row of fixtures) expect(row).toContain("Suomi");
  });
});
