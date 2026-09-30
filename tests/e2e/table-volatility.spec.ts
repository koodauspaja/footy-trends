import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * `Sijoitusten vaihtelu` on a competition's standings page (specs/050), end to
 * end. Signed in the way league-position.spec.ts explains.
 *
 * The seasons stored here are not fixed, so no value is written down: one
 * season's figure is recomputed by hand from its own standings page — the
 * table after round ⌈R / 2⌉ and the final one — which is the property the
 * panel rests on (S1, S6, S7).
 */

const PL = "/ulkomaat/sarjataulukko?kilpailu=PL";
const HEADING = "Sijoitusten vaihtelu";

function panel(page: Page) {
  return page.getByRole("region", { name: HEADING });
}

/** Each team's position in the page's table, by name. */
async function positions(page: Page, url: string): Promise<Map<string, number>> {
  await page.goto(url);
  // The standings table is the page's first; signed in, `Analyysit` holds another.
  const rows = page.locator("table").first().locator("tbody tr");
  await expect(rows).not.toHaveCount(0);
  const cells = await rows.evaluateAll((trs) =>
    trs.map((tr) => ({
      team: tr.querySelector("th")?.textContent ?? "",
      position: Number(tr.querySelector("td")?.textContent),
    }))
  );
  return new Map(cells.map(({ team, position }) => [team, position]));
}

test.describe("Table movement, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("draws a point per completed season, after goals per game", async ({ page }) => {
    await page.goto(PL);
    await panel(page).waitFor();
    const points = panel(page).locator("[data-part=points] circle:not([data-marked])");
    const panels = await page
      .getByRole("region", { name: "Kausi kaudelta" })
      .getByRole("heading", { level: 4 })
      .allTextContents();

    expect(panels).toEqual(["Maaleja ottelua kohden", HEADING]);
    await expect(panel(page).getByRole("listitem")).toHaveCount(await points.count());
    // The season in progress is never a point (S3).
    await expect(panel(page).getByRole("listitem").filter({ hasText: "(kesken)" })).toHaveCount(0);
  });

  test("equals the standings page's own tables at halfway and at the end", async ({ page }) => {
    // Opening a season stores it, and the panel reads every stored completed
    // season — so on a fresh database, as `release.yml` starts from, there may
    // be none to read yet (#501, the class #485 fixed). Every season the page
    // offers is opened first, so the line has its points.
    await page.goto(PL);
    const seasons = await page
      .getByLabel("Kausi")
      .locator("option")
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    for (const season of seasons) {
      await page.goto(`${PL}&kausi=${season}`);
    }

    await page.goto(PL);
    await panel(page).waitFor();
    const sentence = (await panel(page).getByRole("listitem").first().textContent()) ?? "";
    const [, season, shown, teams] =
      /^Kausi (\d{4})\/\d{2}: .* keskimäärin (\d+,\d) sijaa \((\d+) joukkuetta\)\.$/.exec(
        sentence
      ) ?? [];

    const seasonUrl = `${PL}&kausi=${season}`;
    await page.goto(seasonUrl);
    const rounds = (await page.getByLabel("Kierros").locator("option").allTextContents())
      .map((option) => Number(/\d+/.exec(option)?.[0]))
      .filter((round) => !Number.isNaN(round));
    const halfway = Math.ceil(Math.max(...rounds) / 2);

    const mid = await positions(page, `${seasonUrl}&kierros=${halfway}`);
    const final = await positions(page, seasonUrl);
    const moved = [...final].map(([team, position]) =>
      Math.abs(position - (mid.get(team) ?? Number.NaN))
    );
    const mean = moved.reduce((sum, places) => sum + places, 0) / moved.length;

    expect(moved).toHaveLength(Number(teams));
    expect(mean.toFixed(1).replace(".", ",")).toBe(shown);
  });

  test("has no panel on the Champions League", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=CL");
    await page.getByRole("region", { name: "Maaleja ottelua kohden" }).waitFor();

    await expect(panel(page)).toHaveCount(0);
  });
});

test.describe("Table movement, signed out", () => {
  test("carries no figure in the page", async ({ page }) => {
    const response = await page.goto(PL);
    const html = (await response?.text()) ?? "";

    expect(html).not.toContain(HEADING);
    expect(html).not.toContain("sijoitus muuttui");
  });
});
