import { expect, type Page, test } from "@playwright/test";
import { competitionsInRegion } from "../../src/lib/competitions";
import { getDomesticCompetitionName } from "../../src/lib/domestic-competitions";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { COMPETITIONS } from "../../src/lib/goals-per-game";

/**
 * `Kotietu ja tasapelit` on a competition's standings page (specs/049), end to
 * end. Signed in the way league-position.spec.ts explains.
 *
 * Which competitions have completed seasons stored here is not fixed, so
 * nothing names a value: the rules asserted hold whatever the data — both
 * providers in one table, this page's row marked, the order by `Kotietu`.
 */

const HEADING = "Kotietu ja tasapelit";
const FOOTBALL_DATA_NAMES = new Set(
  competitionsInRegion("foreign")
    .filter((competition) => COMPETITIONS["football-data"].has(competition.code))
    .map((competition) => competition.name)
);
const TASO_NAMES = new Set([...COMPETITIONS.taso].map(getDomesticCompetitionName));

function panel(page: Page) {
  return page.getByRole("region", { name: HEADING });
}

/** `+16`, `0` or `−3` as a number. */
function points(text: string): number {
  return Number(text.replace("−", "-"));
}

test.describe("Home advantage, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  for (const [name, url] of [
    ["Veikkausliiga", "/kotimaa/sarjataulukko?kilpailu=VL"],
    ["Valioliiga", "/ulkomaat/sarjataulukko?kilpailu=PL"],
  ] as const) {
    test(`compares both providers' competitions on ${name}, its own row marked`, async ({
      page,
    }) => {
      await page.goto(url);
      await panel(page).waitFor();
      const rows = panel(page).locator("tbody tr");
      const names = await rows.locator("th").allTextContents();
      const advantages = await rows.locator("td:last-child").allTextContents();

      expect(names.some((row) => FOOTBALL_DATA_NAMES.has(row))).toBe(true);
      expect(names.some((row) => TASO_NAMES.has(row))).toBe(true);
      await expect(rows.and(page.locator("[aria-current=true]"))).toHaveCount(1);
      await expect(panel(page).locator("tr[aria-current=true] th")).toHaveText(name);
      // Strongest first (S11).
      const values = advantages.map(points);
      expect(values).toEqual(values.toSorted((left, right) => right - left));
      await expect(
        panel(page).getByText(/^Kaudet .+, kaikki tallennetut ottelut\.$/)
      ).toBeVisible();
    });
  }

  test("sits in its own group, after goals per game", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL");
    await panel(page).waitFor();
    const groups = await page
      .getByRole("region", { name: "Analyysit" })
      .getByRole("heading", { level: 3 })
      .allTextContents();

    expect(groups).toEqual(["Kausi kaudelta", "Kilpailut rinnakkain"]);
  });
});

test.describe("Home advantage, signed out", () => {
  test("carries no share in the page", async ({ page }) => {
    const response = await page.goto("/kotimaa/sarjataulukko?kilpailu=VL");
    const html = (await response?.text()) ?? "";

    await expect(page.getByText("Kirjaudu sisään nähdäksesi analyysit ja trendit.")).toBeVisible();
    expect(html).not.toContain(HEADING);
    expect(html).not.toContain("Kotivoitot");
  });
});
