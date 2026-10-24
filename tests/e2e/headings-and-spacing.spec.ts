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
  // The same look on every page, and the agreed one: `Runkosarja`'s 20 px semibold.
  expect(looks).toEqual(TABLE_HEADINGS.map(() => "20px 600"));
});

test.describe("At 375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("keeps every label on its select's line when the row wraps", async ({ page }) => {
    await page.goto("/maajoukkueet/ottelut");
    await expect(page.getByLabel("Vaihe")).toBeVisible();

    const parted = await page.evaluate(() =>
      [...document.querySelectorAll("form label")].flatMap((label) => {
        const control = document.getElementById(label.getAttribute("for") ?? "");
        // A label that names no control cannot be checked, so it fails.
        if (control === null) return [`${label.textContent}: no control`];
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

test("leaves space between one analytics panel and the next, and more between groups", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026");
  await expect(page.getByRole("heading", { level: 4 }).first()).toBeVisible();

  const gaps = await page.evaluate(() => {
    // A section headed by `level`, directly or inside a folded group's summary.
    const headedBy = (element: Element | null, level: string) =>
      element?.tagName === "SECTION" &&
      element.querySelector(`:scope > ${level}, :scope > details > summary ${level}`) !== null;
    // From each such section to the next one beside it.
    const between = (level: string) =>
      [...document.querySelectorAll("section")]
        .filter((section) => headedBy(section, level))
        .flatMap((section) => {
          const next = section.nextElementSibling;
          if (next === null || !headedBy(next, level)) return [];
          return [
            {
              folded: next.querySelector(":scope > details") !== null,
              gap: next.getBoundingClientRect().top - section.getBoundingClientRect().bottom,
            },
          ];
        });
    return { panels: between("h4"), groups: between("h3") };
  });
  expect(gaps.panels.length).toBeGreaterThan(0);
  expect(Math.min(...gaps.panels.map(({ gap }) => gap))).toBeGreaterThanOrEqual(32);
  // The folded group is measured too, its heading inside its summary.
  expect(gaps.groups.some(({ folded }) => folded)).toBe(true);
  expect(Math.min(...gaps.groups.map(({ gap }) => gap))).toBeGreaterThanOrEqual(48);
});

test("sets a panel's heading above its labels and lines, and below its section's", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026");
  const forecast = page.getByRole("region", { name: "Kauden ennuste" });
  await expect(forecast).toBeVisible();

  const size = (locator: Locator) =>
    locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const section = await size(page.getByRole("heading", { level: 2, name: "Analyysit" }));
  const panel = await size(forecast.getByRole("heading", { level: 4 }));
  const label = await size(forecast.getByRole("heading", { level: 5 }).first());
  expect(label).toBeLessThan(panel);
  expect(panel).toBeLessThan(section);

  // An empty line, such as the surprises' before any match is predicted.
  const surprises = page.getByRole("region", { name: "Kauden suurimmat yllätykset" });
  const lines = await surprises
    .locator("p")
    .evaluateAll((paragraphs) =>
      paragraphs.map((paragraph) => Number.parseFloat(getComputedStyle(paragraph).fontSize))
    );
  expect(lines.length).toBeGreaterThan(0);
  expect(Math.max(...lines)).toBeLessThan(await size(surprises.getByRole("heading", { level: 4 })));
});
