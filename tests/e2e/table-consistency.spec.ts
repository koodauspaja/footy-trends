import { expect, test } from "@playwright/test";

/**
 * Whether sibling tables line up is a browser question, so it is asked as
 * numbers rather than screenshots: the width of every column, per table, on
 * pages that render several of them.
 *
 * Before specs/021, two match lists on one page were 20, 47, 12 and 14 pixels
 * apart column by column, and twelve World Cup group tables spread their name
 * column across 663–669px.
 */
type Layout = { headers: string; widths: string };

async function layouts(page: import("@playwright/test").Page): Promise<Layout[]> {
  // Measured after the first table is laid out: a width read too early is 0,
  // which compares equal to nothing and fails as if the columns disagreed.
  await page.locator("table").first().waitFor({ state: "visible" });
  return page.locator("table").evaluateAll((tables) =>
    tables.map((table) => {
      const head = [...table.querySelectorAll("thead th")];
      return {
        headers: head.map((cell) => cell.textContent?.trim() ?? "").join("/"),
        widths: head.map((cell) => Math.round(cell.getBoundingClientRect().width)).join(" "),
      };
    })
  );
}

/** Groups tables by their headers, so the bracket is never compared to a match list. */
function byShape(found: Layout[]): Map<string, Set<string>> {
  const shapes = new Map<string, Set<string>>();
  for (const layout of found) {
    const widths = shapes.get(layout.headers) ?? new Set<string>();
    widths.add(layout.widths);
    shapes.set(layout.headers, widths);
  }
  return shapes;
}

test.describe("Table consistency", () => {
  for (const [url, name] of [
    ["/kotimaa/sarjataulukko?kilpailu=VL&kausi=2019", "three phases and two match lists"],
    ["/maajoukkueet/sarjataulukko?kilpailu=WC&kausi=2026", "twelve group tables"],
  ] as const) {
    test(`every table of a shape has identical columns — ${name}`, async ({ page }) => {
      await page.goto(url);

      for (const [headers, widths] of byShape(await layouts(page))) {
        expect(widths.size, `${headers} rendered ${widths.size} different layouts`).toBe(1);
      }
    });
  }

  test("a match list has the same columns on every page it appears on", async ({ page }) => {
    const seen: string[] = [];
    for (const url of ["/kotimaa/ottelut?kausi=2025", "/maajoukkueet/huuhkajat"]) {
      await page.goto(url);
      const list = (await layouts(page)).find((layout) =>
        layout.headers.startsWith("Pvm/Ottelu/Tulos/")
      );
      expect(list, `no match list on ${url}`).toBeDefined();
      seen.push(list?.widths ?? "");
    }

    expect(new Set(seen).size).toBe(1);
  });

  test("a list with no fourth column keeps the same Pvm and Tulos", async ({ page }) => {
    await page.goto("/ulkomaat/ottelut");
    const [three] = (await layouts(page)).filter((l) => l.headers === "Pvm/Ottelu/Tulos");
    await page.goto("/kotimaa/ottelut?kausi=2025");
    const [four] = (await layouts(page)).filter((l) => l.headers.startsWith("Pvm/Ottelu/Tulos/"));

    const threeWidths = (three?.widths ?? "").split(" ");
    const fourWidths = (four?.widths ?? "").split(" ");
    expect(threeWidths[0]).toBe(fourWidths[0]);
    expect(threeWidths[2]).toBe(fourWidths[2]);
    // `Ottelu` is the flexible column, so it absorbs the missing fourth.
    expect(Number(threeWidths[1])).toBeGreaterThan(Number(fourWidths[1]));
  });

  test("a narrow screen scrolls the table, never the document", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2019");

    const doc = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(doc.scroll).toBe(doc.client);

    for (const [, widths] of byShape(await layouts(page))) {
      expect(widths.size).toBe(1);
    }
  });
});
