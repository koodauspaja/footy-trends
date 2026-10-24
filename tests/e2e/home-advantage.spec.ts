import { expect, type Page, test } from "@playwright/test";
import { competitionsInRegion } from "../../src/lib/competitions";
import { getDomesticCompetitionName } from "../../src/lib/domestic-competitions";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { COMPETITIONS } from "../../src/lib/goals-per-game";
import { openFolds } from "./folds";

/**
 * `Kotietu ja tasapelit` on a competition's standings page, end to end. Signed in
 * the way league-position.spec.ts explains. Which competitions have completed
 * seasons here is not fixed, so no value is named: only rules that hold.
 *
 * decisions/049-home-advantage-and-draw-rate.md
 */

const HEADING = "Kotietu ja tasapelit";
const FOOTBALL_DATA_NAMES = new Set(
  competitionsInRegion("foreign")
    .filter((competition) => COMPETITIONS["football-data"].has(competition.code))
    .map((competition) => competition.name)
);
const TASO_NAMES = new Set([...COMPETITIONS.taso].map(getDomesticCompetitionName));

const GROUP = "Kilpailut rinnakkain";

function panel(page: Page) {
  return page.getByRole("region", { name: HEADING });
}

// The group's heading, which is what a reader presses to open or fold it.
function fold(page: Page) {
  return page.locator("summary").filter({ hasText: GROUP });
}

// The group starts folded, so the panel is opened before it is read.
async function openPanel(page: Page) {
  await openFolds(page, "Analyysit");
  await fold(page).click();
  await panel(page).waitFor();
}

// `+16`, `0` or `−3` as a number.
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
      await openPanel(page);
      const rows = panel(page).locator("tbody tr");
      const names = await rows.locator("th").allTextContents();
      const advantages = await rows.locator("td:last-child").allTextContents();

      expect(names.some((row) => FOOTBALL_DATA_NAMES.has(row))).toBe(true);
      expect(names.some((row) => TASO_NAMES.has(row))).toBe(true);
      await expect(rows.and(page.locator("[aria-current=true]"))).toHaveCount(1);
      await expect(panel(page).locator("tr[aria-current=true] th")).toHaveText(name);
      // Strongest first.
      const values = advantages.map(points);
      expect(values).toEqual(values.toSorted((left, right) => right - left));
      await expect(
        panel(page).getByText(/^Kaudet .+, kaikki tallennetut ottelut\.$/)
      ).toBeVisible();
    });
  }

  test("sits in its own group, after goals per game", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL");
    await openFolds(page, "Analyysit");
    await fold(page).waitFor();
    const groups = await page
      .getByRole("region", { name: "Analyysit" })
      .getByRole("heading", { level: 3 })
      .allTextContents();

    expect(groups).toEqual(["Tämä kausi", "Kausi kaudelta", "Kilpailut rinnakkain"]);
  });
});

test.describe("Kilpailut rinnakkain, folded", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL");
    await openFolds(page, "Analyysit", "Kausi kaudelta");
    await fold(page).waitFor();
  });

  test("starts folded: the heading and its marker show, the table does not", async ({ page }) => {
    await expect(fold(page)).toHaveText(`▸${GROUP}`);
    await expect(panel(page)).toBeHidden();
    // The groups above it are as they were.
    await expect(page.getByRole("region", { name: "Maaleja ottelua kohden" })).toBeVisible();
  });

  test("opens and folds from the mouse", async ({ page }) => {
    await fold(page).click();
    await expect(panel(page).locator("tbody tr").first()).toBeVisible();

    await fold(page).click();
    await expect(panel(page)).toBeHidden();
  });

  test("opens and folds from the keyboard", async ({ page }) => {
    await fold(page).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page).locator("tbody tr").first()).toBeVisible();

    await page.keyboard.press("Space");
    await expect(panel(page)).toBeHidden();
  });

  test("is folded again after a reload", async ({ page }) => {
    await fold(page).click();
    await expect(panel(page)).toBeVisible();

    await page.reload();
    await openFolds(page, "Analyysit");
    await fold(page).waitFor();
    await expect(panel(page)).toBeHidden();
  });
});

test.describe("Home advantage, signed out", () => {
  test("carries no share in the page", async ({ page }) => {
    const response = await page.goto("/kotimaa/sarjataulukko?kilpailu=VL");
    const html = (await response?.text()) ?? "";
    await openFolds(page, "Analyysit");

    await expect(page.getByText("Kirjaudu sisään nähdäksesi analyysit ja trendit.")).toBeVisible();
    expect(html).not.toContain(HEADING);
    expect(html).not.toContain("Kotivoitot");
  });
});
