import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * `Analyysit` on a cup team page (specs/040), end to end. Signed in the way
 * league-position.spec.ts explains.
 *
 * The property worth proving here is the separation: a cup page shows that
 * cup's figures and a league page is unchanged. Both are asserted against the
 * same club on the same day, because a rule that holds only on one page is not
 * the rule.
 */

const ARSENAL_CUP = "/ulkomaat/joukkue/57?kilpailu=CL&kausi=2024";
const ARSENAL_LEAGUE = "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024";
const POSITION = "Sijoitus kierroksittain";

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

function analytics(page: Page) {
  return page.getByRole("region", { name: "Analyysit" });
}

test.describe("Cup analytics, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("shows the panels a cup can have, and never a league position", async ({ page }) => {
    await page.goto(ARSENAL_CUP);
    await analytics(page).waitFor();
    const panels = await analytics(page).getByRole("heading", { level: 4 }).allTextContents();

    expect(panels.length).toBeGreaterThan(0);
    // A knockout has no table to rank a position in.
    expect(panels).not.toContain(POSITION);
    // The panels that need only results are all there.
    expect(panels).toContain("Vire otteluittain");
    expect(panels).toContain("Putket");
  });

  test("keeps the league page unchanged, position chart and all", async ({ page }) => {
    await page.goto(ARSENAL_LEAGUE);
    await analytics(page).waitFor();
    const panels = await analytics(page).getByRole("heading", { level: 4 }).allTextContents();

    expect(panels[0]).toBe(POSITION);
  });

  test("drops the Sijoitus row from the comparison on a cup", async ({ page }) => {
    await page.goto(ARSENAL_CUP);
    const comparison = page.getByRole("region", { name: "Tämä kausi verrattuna" });
    await comparison.waitFor();

    // Dropped rather than shown as `–`: a row that can never have a value on
    // this page is noise (specs/040, S7).
    await expect(comparison.locator("[data-part=row]", { hasText: "Sijoitus" })).toHaveCount(0);
    await expect(comparison.locator("[data-part=row]")).not.toHaveCount(0);
  });

  test("names the cup in the records it covers", async ({ page }) => {
    await page.goto(ARSENAL_CUP);
    const records = page.getByRole("region", { name: "Ennätykset" });
    await records.waitFor();

    // The panel says which competition, so a cup page's records cannot be
    // read as the club's own (specs/040, S9).
    await expect(records.getByText("Mestarien liiga")).toBeVisible();
  });
});

test.describe("Liigacup team page, signed in (specs/043)", () => {
  // FC Inter, Liigacup 2026's winner: a TASO cup published under its own
  // competition id, `Liigacup26`, rather than inside the `spljp26` umbrella.
  const INTER_LIIGACUP = "/kotimaa/joukkue/60987?kilpailu=LC&kausi=2026";

  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("renders its Analyysit as a cup team page", async ({ page }) => {
    await page.goto(INTER_LIIGACUP);
    await analytics(page).waitFor();
    const panels = await analytics(page).getByRole("heading", { level: 4 }).allTextContents();

    expect(panels).not.toContain(POSITION);
    expect(panels).toContain("Vire otteluittain");
  });

  test("compares the season against the cup's own previous one", async ({ page }) => {
    await page.goto(INTER_LIIGACUP);
    const comparison = page.getByRole("region", { name: "Tämä kausi verrattuna" });
    await comparison.waitFor();

    // It asked `spljp25` for last season until specs/043, which holds no
    // Liigacup, and so had nothing to compare.
    await expect(comparison.locator("[data-part=row]")).not.toHaveCount(0);
    await expect(comparison.locator("[data-part=row]", { hasText: "Sijoitus" })).toHaveCount(0);
  });
});

test("sends no cup analytics value to a signed-out reader", async ({ page }) => {
  const response = await page.goto(ARSENAL_CUP);
  const html = (await response?.text()) ?? "";

  // The section and its sign-in prompt are shown, as on a league page; what a
  // signed-out reader must not get is any panel or any computed value.
  await expect(page.getByRole("heading", { name: "Vire otteluittain" })).toHaveCount(0);
  expect(html).not.toContain("Vire otteluittain");
  expect(html).not.toContain("Putket");
});
