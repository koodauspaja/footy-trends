import { expect, type Locator, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The team page's `Koti- ja vierastilastot` panel (specs/033), end to end.
 * Signed in the way league-position.spec.ts explains.
 */

const HEADING = "Koti- ja vierastilastot";

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

/** A standings row's `O`, `TM`, `PM` and `P` — Sija, Joukkue, O, V, T, H, TM, PM, ME, P. */
async function tableFigures(
  row: Locator
): Promise<Record<"played" | "scored" | "conceded" | "points", number>> {
  const cell = async (column: number) =>
    Number(await row.locator(`td:nth-child(${column})`).textContent());
  return {
    played: await cell(3),
    scored: await cell(7),
    conceded: await cell(8),
    points: await cell(10),
  };
}

/**
 * The panel's figures turned back into season totals: each side's per-match
 * value times its match count, summed. The printed values have two decimals,
 * so over 19 matches a side is off by under 0,1 — rounding recovers the total.
 */
async function panelTotals(page: Page) {
  const panel = page.getByRole("region", { name: HEADING });
  await expect(panel.getByRole("img", { name: HEADING })).toBeVisible();

  const legend = await panel.locator("ul > li").allTextContents();
  const [home, away] = legend.map((item) => Number(/\((\d+) ottelu/.exec(item)?.[1]));
  const rows = await panel.locator("ol > li").allTextContents();
  const valuesOf = (label: string) => {
    const row = rows.find((text) => text.startsWith(`${label}:`)) ?? "";
    const [, h, a] = /kotona ([\d,]+), vieraissa ([\d,]+)/.exec(row) ?? [];
    return [Number(h?.replace(",", ".")), Number(a?.replace(",", "."))];
  };
  const total = (label: string) => {
    const [h, a] = valuesOf(label);
    return Math.round((h ?? 0) * (home ?? 0) + (a ?? 0) * (away ?? 0));
  };

  return {
    played: (home ?? 0) + (away ?? 0),
    scored: total("Tehdyt maalit / ottelu"),
    conceded: total("Päästetyt maalit / ottelu"),
    points: total("Pisteitä / ottelu"),
  };
}

test.describe("Home and away panel, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("adds up to the table's row — a Premier League team", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024");
    const figures = await tableFigures(
      page.locator("table tbody tr").filter({ hasText: "Arsenal" })
    );

    await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");

    expect(await panelTotals(page)).toEqual(figures);
  });

  test("adds up to the table's row — across a Veikkausliiga split", async ({ page }) => {
    // KuPS, 2026: the Mestaruussarja row counts the regular season too.
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026");
    const row = page
      .getByRole("heading", { name: "Mestaruussarja", level: 2 })
      .locator("xpath=following::table[1]")
      .locator("tbody tr", { hasText: "KuPS" });
    const figures = await tableFigures(row);
    await row.getByRole("link", { name: "KuPS" }).click();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);

    expect(await panelTotals(page)).toEqual(figures);
  });

  test("fills home, outlines away, and names both", async ({ page }) => {
    await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
    const panel = page.getByRole("region", { name: HEADING });

    await expect(panel.locator("[data-part=row]")).toHaveCount(4);
    await expect(panel.locator("[data-part=fill]:not([data-outlined])")).toHaveCount(4);
    await expect(panel.locator("[data-part=fill][data-outlined]")).toHaveCount(4);
    await expect(panel.locator("ul > li")).toHaveText([/^Kotona \(/, /^Vieraissa \(/]);
  });

  test("comes after the goals charts in Analyysit", async ({ page }) => {
    // `Nollapelit` (specs/034) follows it; the order is asserted in full in
    // form-trend.spec.ts.
    await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
    const headings = page
      .getByRole("region", { name: "Analyysit" })
      .getByRole("heading", { level: 3 });

    await expect(headings.nth(4)).toHaveText(HEADING);
  });
});

test("sends no home or away value to a signed-out reader", async ({ page }) => {
  const response = await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
  const html = (await response?.text()) ?? "";

  await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
  expect(html).not.toContain("vieraissa");
  expect(html).not.toContain(HEADING);
});
