import { expect, type Locator, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/auth/e2e-analytics";
import { openAnalytics } from "./folds";
import { cupTeamPage, lastFinishedSeason } from "./football-data-season";

/**
 * The team page's form chart, end to end, and the order of the Analyysit
 * panels. Signed in the way league-position.spec.ts explains: the override
 * header, honoured only by this `_test`-database server.
 *
 * decisions/031-rolling-form-trend.md
 * decisions/032-goals-scored-vs-conceded.md
 * decisions/040-cup-analytics.md
 * decisions/424-analytics-panel-groups.md
 * decisions/888-e2e-reads-the-greyed-out-season.md
 */

const FINISHED = lastFinishedSeason();

const HEADING = "Vire otteluittain";
const SENTENCE = /^Vire (\d+)\. ottelun jälkeen: (\d),(\d) pistettä ottelua kohden\.$/;
const POINTS = { V: 3, T: 1, H: 0 } as const;

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

// The standings row's Vire letters, e.g. "VTHVV", as points per match.
async function vireOf(row: Locator): Promise<number> {
  const letters = ((await row.locator("td").last().textContent()) ?? "").replaceAll(/\s/g, "");
  expect(letters).toMatch(/^[VTH]{5}$/);
  const total = [...letters].reduce(
    (sum, letter) => sum + POINTS[letter as keyof typeof POINTS],
    0
  );
  return total / 5;
}

// Every text row of the chart, as [match, form].
async function plotted(page: Page): Promise<Array<[number, number]>> {
  await openAnalytics(page);
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
    // it with. Arsenal's season is a finished one: 38 matches, so points
    // from the fifth to the 38th.
    await page.goto(`/ulkomaat/sarjataulukko?kilpailu=PL&kausi=${FINISHED}`);
    const row = page.locator("table tbody tr").filter({ hasText: "Arsenal" });
    const vire = await vireOf(row);

    await page.goto(`/ulkomaat/joukkue/57?kilpailu=PL&kausi=${FINISHED}`);
    const points = await plotted(page);

    expect(points.map(([match]) => match)).toEqual(Array.from({ length: 34 }, (_, i) => i + 5));
    expect(points.at(-1)?.[1]).toBe(vire);
  });

  test("ends at the Vire the standings table shows — across a Veikkausliiga split", async ({
    page,
  }) => {
    // KuPS, 2022: the Mestaruussarja table counts the regular season too, so its Vire and O span
    // the split, as the chart does. Read from the standings page on a season long over: while one
    // is played, the provider's table trails its results for hours after a match.
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2022");
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
    await page.goto(`/ulkomaat/joukkue/57?kilpailu=PL&kausi=${FINISHED}`);
    await openAnalytics(page);
    const section = page.getByRole("region", { name: "Analyysit" });

    // The goals charts follow it.
    await expect(section.getByRole("heading", { level: 4 })).toHaveText([
      "Sijoitus kierroksittain",
      HEADING,
      "Maalit otteluittain",
      "Maalit yhteensä",
      "Nollapelit",
      "Koti- ja vierastilastot",
      "Putket",
      "Kääntyneet ottelut",
      "Tämä kausi verrattuna",
      "Ennätykset",
      "Joukkueen vahvuus (Elo)",
      "Vaikeimmat vastustajat",
    ]);
  });

  test("offers Analyysit for a cup, without a position chart", async ({ page }) => {
    // A cup has every panel but `Sijoitus kierroksittain`, which needs a table
    // a knockout has not got.
    await page.goto(await cupTeamPage(page, FINISHED));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await openAnalytics(page);

    await expect(page.getByRole("heading", { name: "Analyysit" })).toBeVisible();
    await expect(page.getByRole("heading", { name: HEADING })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sijoitus kierroksittain" })).toHaveCount(0);
  });
});

test.describe("Form chart, signed out", () => {
  test("shows one prompt for every chart, and no form value in the page", async ({ page }) => {
    const response = await page.goto(`/ulkomaat/joukkue/57?kilpailu=PL&kausi=${FINISHED}`);
    const html = (await response?.text()) ?? "";

    await openAnalytics(page);
    await expect(page.getByText("Kirjaudu sisään nähdäksesi analyysit ja trendit.")).toBeVisible();
    await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
    expect(html).not.toContain("ottelun jälkeen");
  });
});
