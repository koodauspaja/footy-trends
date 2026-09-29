import { expect, type Page, test } from "@playwright/test";

/**
 * Opens the cup season and waits for its rounds to be on the page.
 *
 * `page.goto` resolves on `load`, but the standings are streamed by a React
 * Server Component and arrive afterwards, so a measurement taken straight
 * after it can read an empty document. Both geometry tests below did, and both
 * were wrong for it — in opposite directions.
 *
 * The fold test failed intermittently: `scrollHeight` was 812, exactly the
 * viewport, so `closed < open / 5` compared 812 against 162.
 *
 * The horizontal-overflow test **passed** in the same state, because an empty
 * document does not overflow. It was not flaky; it was silently vacuous, which
 * is worse — it would have reported no horizontal scroll on a page that had
 * rendered nothing at all.
 *
 * Reproduced deterministically with `waitUntil: "commit"`, which returns as
 * soon as the response begins: `{ scrollHeight: 812, overflows: false,
 * details: 0 }`. See #178.
 */
async function openCupSeason(page: Page) {
  await page.goto("/kotimaa/sarjataulukko?kilpailu=MSC&kausi=2025");

  // The rounds themselves, not merely "some element": these are what both
  // measurements are about, and waiting for them is what makes the numbers
  // mean anything.
  await expect(page.locator("details").first()).toBeVisible();
  await expect(page.locator("details table").first()).toBeVisible();
}

test.describe("Finnish cups", () => {
  test("lists the four cups in the competition picker", async ({ page }) => {
    await page.goto("/kotimaa");

    const cups = ["Miesten Suomen Cup", "Naisten Suomen Cup", "Liigacup", "Ykkösliigacup"];
    // Exact: without it "Liigacup" also matches "Ykkösliigacup".
    for (const name of cups) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }
    // In the registry's order: Liigacup between the Suomen Cups and Ykkösliigacup.
    const codes = await page
      .locator('a[href^="/kotimaa/sarjataulukko?kilpailu="]')
      .evaluateAll((links) =>
        links.map((link) => new URL((link as HTMLAnchorElement).href).searchParams.get("kilpailu"))
      );
    expect(codes.filter((code) => ["MSC", "NSC", "LC", "M1LCUP"].includes(code ?? ""))).toEqual([
      "MSC",
      "NSC",
      "LC",
      "M1LCUP",
    ]);
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

  test("renders Ykkösliigacup's groups as tables, its playoff below them", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=M1LCUP&kausi=2026");

    // Tables, not merely headings: this test only checked headings before, and
    // so passed through the whole time #272 had turned these tables into lists.
    for (const name of ["Lohko A", "Lohko B"]) {
      const section = page.locator("section").filter({
        has: page.getByRole("heading", { level: 2, name, exact: true }),
      });
      await expect(section.getByRole("table")).toBeVisible();
    }
    // specs/043 draws `1-4` only if it is two semi-finals and their winners'
    // final, and lists it otherwise. TASO's 2026 season has that shape (checked
    // 2026-09-29: KTP and KäPa won the semi-finals and met in the final), so it
    // is drawn, and not listed as well.
    await expect(page.getByRole("heading", { level: 2, name: "Pudotuspelit" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Välierät", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Loppuottelu", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "1-4" })).toHaveCount(0);
  });

  test("renders Liigacup's groups as tables and its playoff as a bracket", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=LC&kausi=2026");

    const headings = page.getByRole("heading", { level: 2 });
    await expect(headings).toHaveText(["Lohko A", "Lohko B", "Pudotuspelit"]);
    for (const name of ["Lohko A", "Lohko B"]) {
      const section = page.locator("section").filter({
        has: page.getByRole("heading", { level: 2, name, exact: true }),
      });
      await expect(section.getByRole("table")).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { level: 3, name: "Välierät", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Loppuottelu", exact: true })
    ).toBeVisible();
    // The playoff group is the tree, so it is not listed as well.
    await expect(page.getByRole("heading", { name: "1-4" })).toHaveCount(0);
  });

  test("renders Liigacup 2023, published under LC2023, the same way", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=LC&kausi=2023");

    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "Lohko A",
      "Lohko B",
      "Pudotuspelit",
    ]);
  });

  test("offers only the seasons Liigacup has since 2023", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=LC");

    const years = await page.getByLabel("Kausi").locator("option").allTextContents();
    expect(years).toEqual(["2026", "2025", "2024", "2023"]);
  });

  test("offers only the seasons Ykkösliigacup actually has", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=M1LCUP");

    const years = await page.getByLabel("Kausi").locator("option").allTextContents();
    expect(years).toEqual(["2026", "2025", "2024"]);
  });

  test("folds a round away on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openCupSeason(page);

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
    await openCupSeason(page);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflows).toBe(false);
  });
});
