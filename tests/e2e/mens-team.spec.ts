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
    // Exact on the finished seasons, which cannot gain or lose matches: a
    // missing 2022, or an unexpected extra section, both fail here. The
    // current year is filtered out rather than pinned, because the page omits
    // a year with no matches and January would otherwise fail an application
    // behaving exactly as specified.
    const years = (await page.locator("details h2").allTextContents()).map(Number);
    const currentYear = new Date().getFullYear();
    expect(years.filter((year) => year !== currentYear)).toEqual([
      2025, 2024, 2023, 2022, 2021, 2020, 2019,
    ]);
    // Present or not, the current year can only be the newest section.
    expect(years.filter((year) => year === currentYear).length).toBeLessThanOrEqual(1);
    if (years.includes(currentYear)) expect(years[0]).toBe(currentYear);
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

  test("lists only Finland's matches", async ({ page }) => {
    await page.goto("/maajoukkueet/huuhkajat");

    const fixtures = await page.locator("tbody tr").allTextContents();
    expect(fixtures.length).toBeGreaterThan(0);
    for (const row of fixtures) expect(row).toContain("Suomi");
  });
});
