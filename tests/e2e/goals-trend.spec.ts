import { expect, type Locator, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The team page's two goals charts (specs/032), end to end. Signed in the way
 * league-position.spec.ts explains: the override header, honoured only by this
 * `_test`-database server.
 */

const ROLLING = "Maalit otteluittain";
const TOTALS = "Maalit yhteensä";
const TOTAL_ROW = /^Maalit yhteensä (\d+)\. ottelun jälkeen: tehdyt (\d+), päästetyt (\d+)\.$/;
const ROLLING_ROW =
  /^Maalit (\d+)\. ottelun jälkeen: tehdyt \d,\d, päästetyt \d,\d ottelua kohden\.$/;
const FORM_ROW = /^Vire (\d+)\. ottelun jälkeen:/;

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

/** A standings row's `O`, `TM` and `PM` — Sija, Joukkue, O, V, T, H, TM, PM. */
async function tableFigures(row: Locator): Promise<[number, number, number]> {
  const cell = async (column: number) =>
    Number(await row.locator(`td:nth-child(${column})`).textContent());
  return [await cell(3), await cell(7), await cell(8)];
}

/** The last running-total row, as [match, scored, conceded]. */
async function lastTotals(page: Page): Promise<number[]> {
  await expect(page.getByRole("img", { name: TOTALS })).toBeVisible();
  const rows = await page.getByText(TOTAL_ROW).allTextContents();
  const [, ...figures] = TOTAL_ROW.exec(rows.at(-1) ?? "") ?? [];
  return figures.map(Number);
}

test.describe("Goals charts, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("end at the TM and PM the table shows — a Premier League team", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024");
    const [played, scored, conceded] = await tableFigures(
      page.locator("table tbody tr").filter({ hasText: "Arsenal" })
    );

    await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");

    expect(await lastTotals(page)).toEqual([played, scored, conceded]);
  });

  test("end at the TM and PM the table shows — across a Veikkausliiga split", async ({ page }) => {
    // KuPS, 2026: the Mestaruussarja table counts the regular season too, as
    // the running totals do. Read from the page, so it holds as the season goes on.
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026");
    const row = page
      .getByRole("heading", { name: "Mestaruussarja", level: 2 })
      .locator("xpath=following::table[1]")
      .locator("tbody tr", { hasText: "KuPS" });
    const figures = await tableFigures(row);
    await row.getByRole("link", { name: "KuPS" }).click();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);

    expect(await lastTotals(page)).toEqual(figures);
  });

  test("line the rolling chart up with the form chart, match for match", async ({ page }) => {
    await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
    await expect(page.getByRole("img", { name: ROLLING })).toBeVisible();

    const matchesOf = async (pattern: RegExp) =>
      (await page.getByText(pattern).allTextContents()).map((row) =>
        Number(/(\d+)\. ottelun/.exec(row)?.[1])
      );

    expect(await matchesOf(ROLLING_ROW)).toEqual(await matchesOf(FORM_ROW));
  });

  test("tell the lines apart by style and name them in a legend", async ({ page }) => {
    await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");

    for (const name of [ROLLING, TOTALS]) {
      const panel = page.getByRole("region", { name });
      await expect(panel.locator("[data-part=series]")).toHaveCount(2);
      await expect(panel.locator("[data-part=series][data-dashed]")).toHaveCount(1);
      // The legend is the panel's `ul`; its `ol` is the text alternative.
      await expect(panel.locator("ul > li")).toHaveText(["Tehdyt maalit", "Päästetyt maalit"]);
    }
  });

  test("sit in Analyysit after the form chart", async ({ page }) => {
    await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");

    await expect(
      page.getByRole("region", { name: "Analyysit" }).getByRole("heading", { level: 3 })
    ).toHaveText(["Sijoitus kierroksittain", "Vire otteluittain", ROLLING, TOTALS]);
  });
});

test.describe("Goals charts, signed out", () => {
  test("send no goal value, and leave one prompt", async ({ page }) => {
    const response = await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
    const html = (await response?.text()) ?? "";

    await expect(page.getByText("Kirjaudu sisään nähdäksesi analyysit ja trendit.")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: TOTALS })).toHaveCount(0);
    expect(html).not.toContain("Maalit yhteensä");
    expect(html).not.toContain("ottelun jälkeen");
  });
});
