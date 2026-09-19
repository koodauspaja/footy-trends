import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The team page's two folds (#416): the match list and Analyysit, each a native
 * `<details>` that starts open and folds on its own, with no client state.
 * Signed in the way league-position.spec.ts explains.
 */

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

function summary(page: Page, heading: string) {
  return page.locator("summary", { has: page.getByRole("heading", { name: heading, level: 2 }) });
}

for (const [provider, path] of [
  ["football-data", "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024"],
  ["TASO", "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2025"],
] as const) {
  test.describe(`Team page folds, ${provider}`, () => {
    test.beforeEach(async ({ page }) => {
      await signedIn(page);
      await page.goto(path);
      if (provider === "TASO") {
        // Derived from the app, as domestic-team.spec.ts does: whoever tops a
        // completed season has matches and charts.
        await page.locator("table tbody tr").first().getByRole("link").first().click();
        await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);
      }
    });

    test("start open, the match list counted in its summary", async ({ page }) => {
      const rows = await page.locator("details").first().locator("tbody tr").count();

      await expect(summary(page, "Ottelut")).toHaveText(`▸Ottelut(${rows} ottelua)`);
      await expect(page.locator("details[open]")).toHaveCount(2);
      await expect(page.getByRole("table")).toBeVisible();
      await expect(page.getByRole("img", { name: "Vire otteluittain" })).toBeVisible();
    });

    test("fold each part away and back, independently", async ({ page }) => {
      await summary(page, "Ottelut").click();
      await expect(page.getByRole("table")).toBeHidden();
      await expect(page.getByRole("img", { name: "Vire otteluittain" })).toBeVisible();

      await summary(page, "Analyysit").click();
      await expect(page.getByRole("img", { name: "Vire otteluittain" })).toBeHidden();

      await summary(page, "Ottelut").click();
      await expect(page.getByRole("table")).toBeVisible();
      await expect(page.getByRole("img", { name: "Vire otteluittain" })).toBeHidden();
    });

    test("fold from the keyboard", async ({ page }) => {
      await summary(page, "Ottelut").focus();
      await page.keyboard.press("Enter");

      await expect(page.getByRole("table")).toBeHidden();
    });
  });
}

test("keeps no analytics value in a folded signed-out page", async ({ page }) => {
  // The gate is unchanged by the fold: the prompt sits in it, and the HTML
  // carries no chart value, folded or not.
  const response = await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
  const html = (await response?.text()) ?? "";

  await expect(summary(page, "Analyysit")).toBeVisible();
  await expect(page.getByText("Kirjaudu sisään nähdäksesi analyysit ja trendit.")).toBeVisible();
  expect(html).not.toContain("ottelun jälkeen");
});

test("a cup page folds its match list and has no Analyysit", async ({ page }) => {
  await signedIn(page);
  await page.goto("/ulkomaat/joukkue/57?kilpailu=CL&kausi=2024");

  await expect(summary(page, "Ottelut")).toBeVisible();
  await expect(summary(page, "Analyysit")).toHaveCount(0);
});
