import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The team page's `Ennätykset` panel (specs/039), end to end. Signed in the way
 * league-position.spec.ts explains.
 *
 * The property worth checking here is the one a record rests on: **a record is
 * never shorter than the same run inside a single season**. `Putket` shows this
 * season's longest run, and the record book looks at every stored season, so
 * the record must be at least as long — asserted against the panel above it
 * rather than against a number typed into the test.
 */

const HEADING = "Ennätykset";
const STREAKS_HEADING = "Putket";
const TEAM = "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024";

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

/** The figure named `label` in a panel, as `[value, when]`. */
async function figure(page: Page, panel: string, label: string): Promise<string> {
  const region = page.getByRole("region", { name: panel });
  const value = region.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");
  return (await value.textContent()) ?? "";
}

/** The leading number of a figure, e.g. `9 voittoa Kaudet 2023/24–2024/25` → 9. */
function lengthOf(text: string): number {
  return Number(/^(\d+)/.exec(text.trim())?.[1]);
}

test.describe("Streak records, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("is never shorter than the same run inside one season", async ({ page }) => {
    await page.goto(TEAM);

    const thisSeason = await figure(page, STREAKS_HEADING, "Pisin tappioton putki");
    const ever = await figure(page, HEADING, "Pisin tappioton putki");

    expect(lengthOf(ever)).toBeGreaterThanOrEqual(lengthOf(thisSeason));
  });

  test("says which season or seasons a record was set in", async ({ page }) => {
    await page.goto(TEAM);
    const ever = await figure(page, HEADING, "Pisin tappioton putki");

    // A foreign league's seasons are written `2024/25`, as the selector writes
    // them — one season, or two when the run crossed a boundary.
    expect(ever).toMatch(/(Kausi \d{4}\/\d{2}|Kaudet \d{4}\/\d{2}–\d{4}\/\d{2})$/);
  });

  test("names the four runs, and no current one", async ({ page }) => {
    await page.goto(TEAM);
    const region = page.getByRole("region", { name: HEADING });

    await expect(region.locator("dt")).toHaveCount(4);
    // `Tämänhetkinen putki` belongs to `Putket`: a record book has no "now".
    await expect(region.locator("dt", { hasText: "Tämänhetkinen putki" })).toHaveCount(0);
  });

  test("comes last in Analyysit", async ({ page }) => {
    await page.goto(TEAM);
    const headings = page
      .getByRole("region", { name: "Analyysit" })
      .getByRole("heading", { level: 4 });

    await expect(headings.last()).toHaveText(HEADING);
  });
});

test("sends no record to a signed-out reader", async ({ page }) => {
  const response = await page.goto(TEAM);
  const html = (await response?.text()) ?? "";

  await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
  expect(html).not.toContain(HEADING);
  expect(html).not.toContain("Kaudet ");
});
