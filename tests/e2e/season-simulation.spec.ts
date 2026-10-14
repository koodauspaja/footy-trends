import { expect, type Page, test } from "@playwright/test";
import Redis from "ioredis";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * `Kauden ennuste` on a league's standings page, end to end, on a real season
 * in progress. Signed in the way league-position.spec.ts explains. No value
 * is named: the figures move with every result.
 *
 * decisions/061-season-simulation.md
 * decisions/065-foreign-league-zones.md
 */

const STANDINGS = (code: string) => `/ulkomaat/sarjataulukko?kilpailu=${code}`;
const PL = STANDINGS("PL");
// Their seasons end at different times of year, so one of them always has
// fixtures left.
const LEAGUES = ["PL", "BSA"];
const HEADING = "Kauden ennuste";
const NO_FIXTURES = "Kaudella ei ole enää pelaamattomia otteluita.";
const CHANCE = /^(<\s1|>\s99|\d{1,3})\s%$/;

// The fit and the forecasts are cached for 15 minutes. On a database that held
// none of a league's matches when another spec had the fit made, the fit has
// no such competition and the page no panel, so both are dropped once the
// seasons are stored.
async function dropCaches() {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const forecasts = await redis.keys("forecast:v4:football-data:*");
    await redis.del("poisson:v1:football-data", ...forecasts);
  } finally {
    await redis.quit();
  }
}

function seasonsOffered(page: Page) {
  return page
    .getByLabel("Kausi")
    .locator("option")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
}

function forecastPanel(page: Page) {
  return page.getByRole("region", { name: "Tämä kausi" }).getByRole("region", { name: HEADING });
}

test.describe("Season forecast, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("a league in progress shows every team's forecast first in Tämä kausi", async ({ page }) => {
    // The first of the leagues with a fixture left to play. The second is
    // opened only when the first has none: the provider's key is shared.
    let league: string | undefined;
    for (const code of LEAGUES) {
      // Opening a season stores it: the season in progress and the one before
      // it, so the fit has the league's matches.
      await page.goto(STANDINGS(code));
      const [, previous] = await seasonsOffered(page);
      if (previous !== undefined) await page.goto(`${STANDINGS(code)}&kausi=${previous}`);
      await dropCaches();

      await page.goto(STANDINGS(code));
      await expect(forecastPanel(page)).toBeVisible();
      if ((await forecastPanel(page).getByRole("table").count()) > 0) {
        league = code;
        break;
      }
      // Without a table the panel may only be saying that nothing is left.
      await expect(forecastPanel(page).getByRole("paragraph")).toHaveText(NO_FIXTURES);
    }
    expect(league, "neither league has a fixture left to play").toBeDefined();

    const group = page.getByRole("region", { name: "Tämä kausi" });
    await expect(group.getByRole("heading", { level: 4 }).first()).toHaveText(HEADING);
    const panel = forecastPanel(page);
    // A league whose season is in the registry has a column per place it marks
    // (specs/065), the page's list under its table naming the same places. A
    // column's header is its label, then the positions it covers.
    const zoneLines = await page
      .getByRole("listitem")
      .filter({ hasText: /^Sijat? \d/ })
      .allTextContents();
    expect(zoneLines.length, "the league's zones are listed under its table").toBeGreaterThan(0);
    const zoneColumns = zoneLines.map((line) => {
      const [positions = "", label = ""] = line.split(": ");
      return `${label}${positions.replace(/^Sija/, "sija")}`;
    });
    await expect(panel.getByRole("columnheader")).toHaveText([
      "Joukkue",
      "Odotetut pisteet",
      ...zoneColumns,
    ]);
    // The standings table is the page's first: the forecast lists the same
    // teams in the same order.
    const standings = await page.locator("table").first().locator("tbody tr th").allTextContents();
    await expect(panel.getByRole("rowheader")).toHaveText(standings);
    const cells = await panel.locator("tbody tr").first().getByRole("cell").allTextContents();
    expect(cells[0]).toMatch(/^\d{1,3},\d$/);
    for (const chance of cells.slice(1)) expect(chance).toMatch(CHANCE);
    await expect(
      panel.getByText(/^Jäljellä olevat ottelut on pelattu 10 000 kertaa/)
    ).toBeVisible();

    await panel.getByRole("link", { name: "Kuinka hyvin ennusteet ovat osuneet?" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/ennusteet\\?alue=ulkomaat&tyyppi=jalkikateen&kilpailu=${league}$`)
    );
  });

  test("a finished season has no forecast", async ({ page }) => {
    await page.goto(PL);
    const [, previous] = await seasonsOffered(page);

    await page.goto(`${PL}&kausi=${previous}`);

    await expect(page.getByRole("region", { name: "Tämä kausi" })).toBeVisible();
    await expect(page.getByRole("region", { name: HEADING })).toHaveCount(0);
  });
});

test.describe("Season forecast, signed out", () => {
  test("the page carries no forecast", async ({ page }) => {
    const response = await page.goto(PL);
    const html = (await response?.text()) ?? "";

    expect(html).toContain("<h1");
    expect(html).not.toContain(HEADING);
    expect(html).not.toContain("Odotetut pisteet");
  });
});
