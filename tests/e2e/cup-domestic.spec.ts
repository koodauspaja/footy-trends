import { expect, test } from "@playwright/test";

test.describe("Finnish cups", () => {
  test("lists the three cups in the competition picker", async ({ page }) => {
    await page.goto("/kotimaa");

    for (const name of ["Miesten Suomen Cup", "Naisten Suomen Cup", "Ykkösliigacup"]) {
      await expect(page.getByRole("link", { name })).toBeVisible();
    }
  });

  test("renders every round of Miesten Suomen Cup 2025, bracket first", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=MSC&kausi=2025");

    const headings = page.getByRole("heading", { level: 2 });
    await expect(headings.first()).toHaveText("Pudotuspelit");
    await expect(page.getByRole("heading", { level: 2, name: "Juuson kierros" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Loppuottelu" })).toBeVisible();
    // The tree's own columns.
    await expect(
      page.getByRole("heading", { level: 3, name: "Puolivälierät", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Välierät", exact: true })
    ).toBeVisible();
  });

  test("shows no bracket for a season that had no knockout rounds", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=MSC&kausi=2021");

    await expect(page.getByRole("heading", { name: "Pudotuspelit" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Cup-vaihe" })).toBeVisible();
  });

  test("renames Finaali to Loppuottelu in an older season", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=NSC&kausi=2015");

    await expect(page.getByRole("heading", { name: "Finaali", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Loppuottelu" })).toBeVisible();
    // The third-place match is listed, and never drawn into the tree.
    await expect(page.getByRole("heading", { level: 2, name: "Pikkufinaali" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Pikkufinaali" })).toHaveCount(0);
  });

  test("renders Ykkösliigacup's groups as tables and its placement group as matches", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=M1LCUP&kausi=2026");

    await expect(page.getByRole("heading", { level: 2, name: "Lohko A" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Lohko B" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "1-4" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pudotuspelit" })).toHaveCount(0);
  });

  test("offers only the seasons Ykkösliigacup actually has", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=M1LCUP");

    const years = await page.getByLabel("Kausi").locator("option").allTextContents();
    expect(years).toEqual(["2026", "2025", "2024"]);
  });

  test("folds a round away on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/kotimaa/sarjataulukko?kilpailu=MSC&kausi=2025");

    const open = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.evaluate(() => {
      for (const round of document.querySelectorAll("details")) round.open = false;
    });
    const closed = await page.evaluate(() => document.documentElement.scrollHeight);

    // Ten rounds, one of them 248 teams: folding them away has to matter.
    expect(closed).toBeLessThan(open / 5);
  });

  test("shows no round selector and no Kierros column on a cup", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=MSC&kausi=2025");

    await expect(page.getByLabel("Kierros")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Kierros" })).toHaveCount(0);
    await expect(page.getByLabel("Kausi")).toBeVisible();
  });

  test("does not scroll the page horizontally on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/kotimaa/sarjataulukko?kilpailu=MSC&kausi=2025");

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflows).toBe(false);
  });
});
