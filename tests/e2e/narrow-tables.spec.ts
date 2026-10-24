import { expect, type Page, test } from "@playwright/test";

/**
 * Tables on a phone keep their key column in view: a standings table its
 * points, a match list its result. jsdom has no CSS, so only a browser shows a
 * column really left out and the rest inside the screen.
 *
 * decisions/699-narrow-tables.md
 */

const STANDINGS = "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026";
// Inter's team page: its `Ottelut` list, with a `Sarja` column after `Tulos`.
const TEAM = "/kotimaa/joukkue/60987";
// Veikkausliiga 2017, whose knockout bracket is wider than a phone.
const BRACKET = "/kotimaa/sarjataulukko?kausi=2017";

// The first header named `name`: where it ends, and where the box it scrolls
// in ends and whether that box scrolls.
async function headerInBox(page: Page, name: string) {
  const header = page.getByRole("columnheader", { name, exact: true }).first();
  await header.waitFor();
  return header.evaluate((element) => {
    const box = element.closest(".overflow-x-auto");
    return {
      end: element.getBoundingClientRect().right,
      boxEnd: box?.getBoundingClientRect().right ?? 0,
      scrolls: (box?.scrollWidth ?? 0) > (box?.clientWidth ?? 0),
    };
  });
}

test.describe("At 375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("a standings table shows its points without scrolling sideways", async ({ page }) => {
    await page.goto(STANDINGS);

    const { end, boxEnd, scrolls } = await headerInBox(page, "P");
    expect(end).toBeLessThanOrEqual(boxEnd);
    expect(scrolls).toBe(false);
    // The columns a phone leaves out are not merely scrolled away.
    await expect(page.getByRole("columnheader", { name: "TM", exact: true }).first()).toBeHidden();
  });

  test("a match list shows each result without scrolling sideways", async ({ page }) => {
    await page.goto(TEAM);

    // `Sarja` may scroll into view; the result is in view from the start.
    const { end, boxEnd } = await headerInBox(page, "Tulos");
    expect(end).toBeLessThanOrEqual(boxEnd);
  });

  test("a bracket wider than the screen shadows the edge it scrolls towards", async ({ page }) => {
    await page.goto(BRACKET);
    await page.getByRole("heading", { name: "Pudotuspelit" }).waitFor();

    // The tree's box holds its rounds, each a section under its own heading.
    const tree = page.locator("div.overflow-x-auto").filter({ has: page.locator("section h3") });
    await expect(tree).toHaveCount(1);

    const { overflows, background } = await tree.evaluate((element) => ({
      overflows: element.scrollWidth > element.clientWidth,
      background: getComputedStyle(element).backgroundImage,
    }));
    expect(overflows).toBe(true);
    expect(background).toContain("radial-gradient");
  });
});

test.describe("At 1 024 px", () => {
  test.use({ viewport: { width: 1024, height: 900 } });

  test("a standings table keeps every column", async ({ page }) => {
    await page.goto(STANDINGS);
    await page.getByRole("columnheader", { name: "P", exact: true }).first().waitFor();

    for (const name of ["O", "V", "T", "H", "TM", "PM", "ME", "P", "Vire"]) {
      await expect(page.getByRole("columnheader", { name, exact: true }).first()).toBeVisible();
    }
  });
});
