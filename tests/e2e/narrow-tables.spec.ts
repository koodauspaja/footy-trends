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
// Pages with `Wolverhampton Wanderers FC`, whose first word is wider than a
// phone leaves the flexible column.
const LONG_NAMES = [
  "/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024",
  "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024",
];

// The first header named `name`: where it starts and ends, where the box it
// scrolls in does, and whether that box scrolls.
async function headerInBox(page: Page, name: string) {
  const header = page.getByRole("columnheader", { name, exact: true }).first();
  await expect(header).toBeVisible();
  return header.evaluate((element) => {
    const box = element.closest(".overflow-x-auto");
    return {
      width: element.getBoundingClientRect().width,
      start: element.getBoundingClientRect().left,
      end: element.getBoundingClientRect().right,
      boxStart: box?.getBoundingClientRect().left ?? 0,
      boxEnd: box?.getBoundingClientRect().right ?? 0,
      scrolls: (box?.scrollWidth ?? 0) > (box?.clientWidth ?? 0),
    };
  });
}

test.describe("At 375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("a standings table shows its points without scrolling sideways", async ({ page }) => {
    await page.goto(STANDINGS);

    const { width, start, end, boxStart, boxEnd, scrolls } = await headerInBox(page, "P");
    expect(width).toBeGreaterThan(0);
    expect(start).toBeGreaterThanOrEqual(boxStart);
    expect(end).toBeLessThanOrEqual(boxEnd);
    expect(scrolls).toBe(false);
    // And the points under it, not merely the heading over them.
    const points = await page
      .getByRole("columnheader", { name: "P", exact: true })
      .first()
      .evaluate((header) => {
        const index = (header as HTMLTableCellElement).cellIndex;
        const cell = header.closest("table")?.tBodies[0]?.rows[0]?.cells[index];
        return {
          text: cell?.textContent ?? "",
          width: cell?.getBoundingClientRect().width ?? 0,
          start: cell?.getBoundingClientRect().left ?? Number.NEGATIVE_INFINITY,
          end: cell?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
          shown: cell !== undefined && getComputedStyle(cell).visibility === "visible",
        };
      });
    expect(points.text).toMatch(/^\d+$/);
    expect(points.width).toBeGreaterThan(0);
    expect(points.shown).toBe(true);
    expect(points.start).toBeGreaterThanOrEqual(boxStart);
    expect(points.end).toBeLessThanOrEqual(boxEnd);
    // The columns a phone leaves out are not merely scrolled away.
    await expect(page.getByRole("columnheader", { name: "TM", exact: true }).first()).toBeHidden();
  });

  test("a match list shows each result without scrolling sideways", async ({ page }) => {
    await page.goto(TEAM);

    // `Sarja` may scroll into view; the result is in view from the start.
    const { width, start, end, boxStart, boxEnd } = await headerInBox(page, "Tulos");
    expect(width).toBeGreaterThan(0);
    expect(start).toBeGreaterThanOrEqual(boxStart);
    expect(end).toBeLessThanOrEqual(boxEnd);
    // And each score with it, not merely the heading over them.
    const score = page.getByRole("cell", { name: /^\d+–\d+$/ }).first();
    await expect(score).toBeVisible();
    const { left, right } = await score.evaluate((cell) => cell.getBoundingClientRect().toJSON());
    expect(left).toBeGreaterThanOrEqual(boxStart);
    expect(right).toBeLessThanOrEqual(boxEnd);
  });

  for (const path of LONG_NAMES) {
    test(`lets no name overrun its cell on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText("Wolverhampton Wanderers FC").first()).toBeVisible();

      // A box whose content is wider than itself prints over its neighbour, or
      // clips what it holds: any box in the table, so a name cut short inside
      // its cell counts too. An inline box measures zero and never counts.
      const overrun = await page.evaluate(() =>
        [...document.querySelectorAll("table, table *")]
          .filter((box) => box.scrollWidth > box.clientWidth + 1)
          .map((box) => box.textContent)
      );
      expect(overrun).toEqual([]);
    });
  }

  test("a bracket wider than the screen shadows the edge it scrolls towards", async ({ page }) => {
    await page.goto(BRACKET);
    await page.getByRole("heading", { name: "Pudotuspelit" }).waitFor();

    // The tree's box holds its rounds, each a section under its own heading.
    const tree = page.locator("div.overflow-x-auto").filter({ has: page.locator("section h3") });
    await expect(tree).toHaveCount(1);

    const { overflows, background, shadow } = await tree.evaluate((element) => {
      // The browser spells the token's colour out as `rgba(…)`, however the
      // stylesheet wrote it.
      const probe = document.createElement("span");
      probe.style.color = "var(--scroll-shadow)";
      element.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return {
        overflows: element.scrollWidth > element.clientWidth,
        background: getComputedStyle(element).backgroundImage,
        shadow: colour,
      };
    });
    expect(overflows).toBe(true);
    expect(background).toContain("radial-gradient");
    // A shadow of no strength would draw nothing.
    const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(shadow)?.[1]);
    expect(alpha).toBeGreaterThan(0);
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
