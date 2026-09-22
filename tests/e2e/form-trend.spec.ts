import { expect, type Locator, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The team page's form chart (specs/031), end to end. Signed in the way
 * league-position.spec.ts explains: the override header, honoured only by this
 * `_test`-database server.
 */

const HEADING = "Vire otteluittain";
const SENTENCE = /^Vire (\d+)\. ottelun jälkeen: (\d),(\d) pistettä ottelua kohden\.$/;
const POINTS = { V: 3, T: 1, H: 0 } as const;

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

/** The standings row's Vire letters, e.g. "VTHVV", as points per match. */
async function vireOf(row: Locator): Promise<number> {
  const letters = ((await row.locator("td").last().textContent()) ?? "").replaceAll(/\s/g, "");
  expect(letters).toMatch(/^[VTH]{5}$/);
  const total = [...letters].reduce(
    (sum, letter) => sum + POINTS[letter as keyof typeof POINTS],
    0
  );
  return total / 5;
}

/** Every text row of the chart, as [match, form]. */
async function plotted(page: Page): Promise<Array<[number, number]>> {
  await expect(page.getByRole("img", { name: HEADING })).toBeVisible();
  const rows = await page.getByText(SENTENCE).allTextContents();
  return rows.map((row) => {
    const [, match, whole, tenth] = SENTENCE.exec(row) ?? [];
    return [Number(match), Number(`${whole}.${tenth}`)];
  });
}

test.describe("Form chart, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("ends at the Vire the standings table shows — a Premier League team", async ({ page }) => {
    // The property the feature rests on, against the page a reader compares
    // it with. Arsenal's 2024/25 season is complete: 38 matches, so points
    // from the fifth to the 38th.
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024");
    const row = page.locator("table tbody tr").filter({ hasText: "Arsenal" });
    const vire = await vireOf(row);

    await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
    const points = await plotted(page);

    expect(points.map(([match]) => match)).toEqual(Array.from({ length: 34 }, (_, i) => i + 5));
    expect(points.at(-1)?.[1]).toBe(vire);
  });

  test("ends at the Vire the standings table shows — across a Veikkausliiga split", async ({
    page,
  }) => {
    /**
     * KuPS, 2026: the Mestaruussarja table counts the regular season too, so
     * its Vire and its O span the split, as the chart does. Read from the
     * standings page rather than hardcoded, so it holds as the season goes on.
     */
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026");
    const row = page
      .getByRole("heading", { name: "Mestaruussarja", level: 2 })
      .locator("xpath=following::table[1]")
      .locator("tbody tr", { hasText: "KuPS" });
    const matchesPlayed = Number(await row.locator("td:nth-child(3)").textContent());
    const vire = await vireOf(row);
    await row.getByRole("link", { name: "KuPS" }).click();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);

    const points = await plotted(page);

    expect(points.at(-1)).toEqual([matchesPlayed, vire]);
    expect(points).toHaveLength(matchesPlayed - 4);
  });

  test("sits under Analyysit, after the position chart", async ({ page }) => {
    await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
    const section = page.getByRole("region", { name: "Analyysit" });

    // The goals charts follow it (specs/032).
    await expect(section.getByRole("heading", { level: 3 })).toHaveText([
      "Sijoitus kierroksittain",
      HEADING,
      "Maalit otteluittain",
      "Maalit yhteensä",
      "Koti- ja vierastilastot",
      "Nollapelit",
      "Putket",
      "Kääntyneet ottelut",
      "Tämä kausi verrattuna",
    ]);
  });

  test("offers no Analyysit for a cup", async ({ page }) => {
    await page.goto("/ulkomaat/joukkue/57?kilpailu=CL&kausi=2024");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Analyysit" })).toHaveCount(0);
  });
});

test.describe("Form chart, signed out", () => {
  test("shows one prompt for every chart, and no form value in the page", async ({ page }) => {
    const response = await page.goto("/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024");
    const html = (await response?.text()) ?? "";

    await expect(page.getByRole("heading", { name: "Analyysit" })).toBeVisible();
    await expect(page.getByText("Kirjaudu sisään nähdäksesi analyysit ja trendit.")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
    expect(html).not.toContain("ottelun jälkeen");
  });
});
