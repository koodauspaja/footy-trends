import { expect, type Locator, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * A heading looks like what it heads on every page, a label stays on its
 * select's line, and a panel's lines keep clear of its chart. jsdom has no
 * layout, so only a browser shows any of it.
 *
 * decisions/696-headings-and-spacing.md
 */

// A table heading on each kind of standings page: a domestic league, a domestic
// cup's group, the Champions League's phase and the World Cup's group.
const TABLE_HEADINGS: ReadonlyArray<readonly [string, string]> = [
  ["/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026", "Runkosarja"],
  ["/kotimaa/sarjataulukko?kilpailu=LC&kausi=2023", "Lohko A"],
  ["/ulkomaat/sarjataulukko?kilpailu=CL", "Liigavaihe"],
  ["/maajoukkueet/sarjataulukko?kilpailu=WC&kausi=2026", "Lohko A"],
];

function typeOf(heading: Locator) {
  return heading.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.fontSize} ${style.fontWeight}`;
  });
}

test("gives a standings table's heading one look on every page", async ({ page }) => {
  const looks: string[] = [];
  for (const [path, name] of TABLE_HEADINGS) {
    await page.goto(path);
    const heading = page.getByRole("heading", { level: 2, name, exact: true }).first();
    await expect(heading).toBeVisible();
    looks.push(await typeOf(heading));
  }
  expect(new Set(looks).size).toBe(1);
});

test.describe("At 375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("keeps every label on its select's line when the row wraps", async ({ page }) => {
    await page.goto("/maajoukkueet/ottelut");
    await expect(page.getByLabel("Vaihe")).toBeVisible();

    const parted = await page.evaluate(() =>
      [...document.querySelectorAll("form label")].flatMap((label) => {
        const control = document.getElementById(label.getAttribute("for") ?? "");
        if (control === null) return [];
        const middle = (element: Element) => {
          const box = element.getBoundingClientRect();
          return box.top + box.height / 2;
        };
        const away = Math.abs(middle(label) - middle(control));
        return away > control.getBoundingClientRect().height / 2 ? [label.textContent] : [];
      })
    );
    expect(parted).toEqual([]);
  });
});

test("keeps the season comparison's line clear of its chart", async ({ page }) => {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  await page.goto("/kotimaa/joukkue/60987");
  const panel = page.getByRole("region", { name: "Tämä kausi verrattuna" });
  await expect(panel.locator("svg").first()).toBeVisible();

  const gap = await panel.evaluate((element) => {
    const line = element.querySelector("p");
    const chart = element.querySelector("svg");
    if (line === null || chart === null) return Number.NaN;
    return chart.getBoundingClientRect().top - line.getBoundingClientRect().bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(8);
});
