import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The team page's `Tämä kausi verrattuna` panel (specs/038), end to end. Signed
 * in the way league-position.spec.ts explains.
 *
 * The property worth checking here is the one the panel rests on: **the
 * season's own column is the season**, so it has to agree with the standings
 * page for the same team and season. The baseline is arithmetic over seasons
 * the unit tests own; what end to end can prove is that the column a reader
 * compares against is not quietly something else.
 */

const HEADING = "Tämä kausi verrattuna";
const TEAM = "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024";
const STANDINGS = "/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024";

/** `Pisteitä / ottelu: tämä kausi 2,05, tavallisesti 1,71.` */
const POINTS_ROW = /^Pisteitä \/ ottelu: tämä kausi ([\d,]+), tavallisesti (.+)\.$/;

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

/** Finnish writes a decimal comma; the tests compare numbers. */
function toNumber(text: string): number {
  return Number(text.replace(",", "."));
}

async function rows(page: Page): Promise<string[]> {
  const panel = page.getByRole("region", { name: HEADING });
  await expect(panel.getByRole("img", { name: HEADING })).toBeVisible();
  return panel.locator("ol > li").allTextContents();
}

test.describe("Season comparison, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("shows the season's own points per match, as the table has them", async ({ page }) => {
    await page.goto(STANDINGS);
    const row = page.locator("table tbody tr").filter({ hasText: "Arsenal" });
    // Sija, Joukkue, O, V, T, H, TM, PM, ME, P, Vire — so `O` is 3 and `P` is
    // 10. The last cell is `Vire`, not the points.
    const played = Number(await row.locator("td:nth-child(3)").textContent());
    const points = Number(await row.locator("td:nth-child(10)").textContent());

    await page.goto(TEAM);
    const pointsRow = (await rows(page)).find((text) => POINTS_ROW.test(text)) ?? "";
    const [, thisSeason] = POINTS_ROW.exec(pointsRow) ?? [];

    // Two decimals, as `Koti- ja vierastilastot` prints a per-match average.
    expect(toNumber(thisSeason ?? "")).toBeCloseTo(points / played, 2);
  });

  test("lists every measure as text, with a value for this season", async ({ page }) => {
    await page.goto(TEAM);
    const texts = await rows(page);

    expect(texts).toHaveLength(6);
    expect(texts[0]).toMatch(/^Sijoitus: tämä kausi \d+\./);
    // No measure of a played season is missing its own column.
    for (const text of texts) expect(text).not.toMatch(/tämä kausi –/);
  });

  test("names what it is comparing against, above the bars", async ({ page }) => {
    await page.goto(TEAM);
    const panel = page.getByRole("region", { name: HEADING });

    // The competition is pinned and the count is required to be at least one;
    // the count itself is not, because the e2e database gains seasons as other
    // specs sync them, and an exact number here fails for a reason that has
    // nothing to do with this panel. "Verrattuna 0 muuhun kauteen" would still
    // be caught, which is the claim that would mislead a reader.
    await expect(panel.getByText(/^Verrattuna [1-9]\d* muuhun kauteen: Valioliiga$/)).toBeVisible();
  });

  test("comes last in Analyysit", async ({ page }) => {
    await page.goto(TEAM);
    const headings = page
      .getByRole("region", { name: "Analyysit" })
      .getByRole("heading", { level: 3 });

    await expect(headings.last()).toHaveText(HEADING);
  });
});

test("sends no comparison value to a signed-out reader", async ({ page }) => {
  const response = await page.goto(TEAM);
  const html = (await response?.text()) ?? "";

  await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
  expect(html).not.toContain(HEADING);
  expect(html).not.toContain("Verrattuna");
});
