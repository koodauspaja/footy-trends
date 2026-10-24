import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { fold, isOpen, openFolds } from "./folds";

/**
 * The team page's two folds: the match list, which starts open, and Analyysit,
 * which starts closed, each folding on its own. Signed in the way
 * league-position.spec.ts explains.
 *
 * decisions/416-team-page-folds.md
 * decisions/040-cup-analytics.md
 * decisions/045-bogey-teams.md
 * decisions/071-section-toggles.md
 */

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

// The match list's own table: Analyysit has tables of its own, so
// "the table on the page" does not mean this one. The match list is the first
// fold.
function matchTable(page: Page) {
  return page.locator("details").first().getByRole("table");
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

    test("start with the match list open, counted in its summary, and Analyysit closed", async ({
      page,
    }) => {
      const rows = await page.locator("details").first().locator("tbody tr").count();

      await expect(summary(page, "Ottelut")).toHaveText(`▸Ottelut(${rows} ottelua)`);
      expect(await isOpen(fold(page, "Ottelut"))).toBe(true);
      expect(await isOpen(fold(page, "Analyysit"))).toBe(false);
      await expect(matchTable(page)).toBeVisible();
      await expect(page.getByRole("img", { name: "Vire otteluittain" })).toBeHidden();
    });

    test("fold each part away and back, independently", async ({ page }) => {
      // The form chart's group, which is not the first where `Kausi lyhyesti` is.
      await openFolds(page, "Analyysit", "Ottelu ottelulta");
      await expect(page.getByRole("img", { name: "Vire otteluittain" })).toBeVisible();

      await summary(page, "Ottelut").click();
      await expect(matchTable(page)).toBeHidden();
      await expect(page.getByRole("img", { name: "Vire otteluittain" })).toBeVisible();

      await summary(page, "Analyysit").click();
      await expect(page.getByRole("img", { name: "Vire otteluittain" })).toBeHidden();

      await summary(page, "Ottelut").click();
      await expect(matchTable(page)).toBeVisible();
      await expect(page.getByRole("img", { name: "Vire otteluittain" })).toBeHidden();
    });

    test("fold from the keyboard", async ({ page }) => {
      await summary(page, "Ottelut").focus();
      await page.keyboard.press("Enter");

      await expect(matchTable(page)).toBeHidden();
    });
  });
}

test("keeps no analytics value in a folded signed-out page", async ({ page }) => {
  // The gate is unchanged by the fold: the prompt sits in it, and the HTML
  // carries no chart value, folded or not.
  const response = await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
  const html = (await response?.text()) ?? "";

  await expect(summary(page, "Analyysit")).toBeVisible();
  await openFolds(page, "Analyysit");
  await expect(page.getByText("Kirjaudu sisään nähdäksesi analyysit ja trendit.")).toBeVisible();
  expect(html).not.toContain("ottelun jälkeen");
});

test("a cup page folds its match list and its Analyysit", async ({ page }) => {
  // Both folds: a cup has its analytics as well as the match list.
  await signedIn(page);
  await page.goto("/ulkomaat/joukkue/57?kilpailu=CL&kausi=2024");

  await expect(summary(page, "Ottelut")).toBeVisible();
  await expect(summary(page, "Analyysit")).toBeVisible();
});
