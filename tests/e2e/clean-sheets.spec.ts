import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The team page's `Nollapelit` panel (specs/034), end to end. Signed in the way
 * league-position.spec.ts explains.
 */

const HEADING = "Nollapelit";
const ROW = /^Nollapelien osuus (\d+)\. ottelun jälkeen: (\d+)\s?% \((\d+)\/(\d+)\)\.$/;

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

/** The last text row, as [match, percent, kept, of]. */
async function lastRow(page: Page): Promise<number[]> {
  const panel = page.getByRole("region", { name: HEADING });
  await expect(panel.getByRole("img", { name: HEADING })).toBeVisible();
  const rows = await panel.locator("ol > li").allTextContents();
  const [, ...figures] = ROW.exec(rows.at(-1) ?? "") ?? [];
  return figures.map(Number);
}

test.describe("Clean sheets, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("counts every league match the table counts — a Premier League team", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024");
    const row = page.locator("table tbody tr").filter({ hasText: "Arsenal" });
    const played = Number(await row.locator("td:nth-child(3)").textContent());

    await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
    const [match, percent, kept, of] = await lastRow(page);

    expect(match).toBe(played);
    expect(of).toBe(played);
    // The share is the count, as a whole percent: the text cannot disagree with itself.
    expect(percent).toBe(Math.round(((kept ?? 0) / (of ?? 1)) * 100));
    expect(kept).toBeGreaterThan(0);
  });

  test("counts across a Veikkausliiga split", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026");
    const row = page
      .getByRole("heading", { name: "Mestaruussarja", level: 2 })
      .locator("xpath=following::table[1]")
      .locator("tbody tr", { hasText: "KuPS" });
    const played = Number(await row.locator("td:nth-child(3)").textContent());
    await row.getByRole("link", { name: "KuPS" }).click();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);

    const [match, , kept, of] = await lastRow(page);

    expect(match).toBe(played);
    expect(of).toBe(played);
    expect(kept).toBeLessThanOrEqual(played);
  });

  test("comes last in Analyysit", async ({ page }) => {
    await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");

    await expect(
      page.getByRole("region", { name: "Analyysit" }).getByRole("heading", { level: 3 }).last()
    ).toHaveText(HEADING);
  });
});

test("sends no clean-sheet value to a signed-out reader", async ({ page }) => {
  const response = await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
  const html = (await response?.text()) ?? "";

  await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
  expect(html).not.toContain("Nollapelien osuus");
  expect(html).not.toContain(HEADING);
});
