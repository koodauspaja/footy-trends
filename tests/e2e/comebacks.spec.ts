import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The team page's `Kääntyneet ottelut` panel (specs/036, specs/037), end to
 * end: deficits rescued and leads given away. Signed in the way
 * league-position.spec.ts explains.
 *
 * **The exact figures are asserted against the seeded 2017 season**, not
 * against a live one. Half-time scores arrive with a sync, and a past season
 * that already has stored rows is never refetched — so on one machine a live
 * season has them and on another it does not, which is no basis for an exact
 * assertion. The fixture is rewritten before every run, so its half-time
 * scores are the same everywhere. A live league still gets checked, for the
 * invariants that hold whatever it stores.
 */

const HEADING = "Kääntyneet ottelut";
/** Fixture HJK, in the seeded season — see tests/e2e/fixtures/veikkausliiga-2017.ts. */
const FIXTURE_TEAM = "/kotimaa/joukkue/990001?kilpailu=VL&kausi=2017";
/** Fixture KuPS, the same season. */
const FIXTURE_OTHER_TEAM = "/kotimaa/joukkue/990002?kilpailu=VL&kausi=2017";
/** Fixture Ilves, which surrendered two leads and never rescued a deficit. */
const FIXTURE_THIRD_TEAM = "/kotimaa/joukkue/990003?kilpailu=VL&kausi=2017";
const LIVE_TEAM = "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024";

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

/** The panel's figures, by their label. */
async function figures(page: Page): Promise<Record<string, string>> {
  const panel = page.getByRole("region", { name: HEADING });
  await panel.waitFor();
  const rows = await panel.locator("dl > div").all();
  const entries = await Promise.all(
    rows.map(async (row) => {
      const label = (await row.locator("dt").textContent()) ?? "";
      const value = ((await row.locator("dd").textContent()) ?? "").replace(/\s+/g, " ").trim();
      return [label, value] as const;
    })
  );
  return Object.fromEntries(entries);
}

test.describe("Comebacks, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("counts both directions, and says which match it cannot read", async ({ page }) => {
    /**
     * Fixture HJK's three league matches: trailed 0–1 and won, led 1–0 and won,
     * and one with no half-time score. The lead it held shows as a total with
     * neither outcome beneath it, because it did not give that lead away. The
     * knockout match it also came from behind to win is not a league match, so
     * counting it would make the first figure two.
     */
    await page.goto(FIXTURE_TEAM);

    expect(await figures(page)).toEqual({
      "Tappioasemassa puoliajalla": "1 ottelu",
      "Käännetty voitoksi": "1 ottelu",
      Tasoitettu: "0 ottelua",
      "Johdossa puoliajalla": "1 ottelu",
      "Valunut tasapeliksi": "0 ottelua",
      "Käännetty tappioksi": "0 ottelua",
    });
    await expect(
      page.getByRole("region", { name: HEADING }).getByText("Puoliaikatulos puuttuu 1 ottelusta.")
    ).toBeVisible();
  });

  test("counts a lead given away outright, and says nothing when none is missing", async ({
    page,
  }) => {
    // Fixture KuPS: led 1–0 and lost, trailed and won, trailed and drew.
    await page.goto(FIXTURE_OTHER_TEAM);

    expect(await figures(page)).toEqual({
      "Tappioasemassa puoliajalla": "2 ottelua",
      "Käännetty voitoksi": "1 ottelu",
      Tasoitettu: "1 ottelu",
      "Johdossa puoliajalla": "1 ottelu",
      "Valunut tasapeliksi": "0 ottelua",
      "Käännetty tappioksi": "1 ottelu",
    });
    await expect(
      page.getByRole("region", { name: HEADING }).getByText(/Puoliaikatulos puuttuu/)
    ).toHaveCount(0);
  });

  test("counts two leads surrendered to draws", async ({ page }) => {
    // Fixture Ilves led twice and drew both, and its one deficit it lost — so
    // the trailing trio shows a total with neither outcome beneath it.
    await page.goto(FIXTURE_THIRD_TEAM);

    expect(await figures(page)).toEqual({
      "Tappioasemassa puoliajalla": "1 ottelu",
      "Käännetty voitoksi": "0 ottelua",
      Tasoitettu: "0 ottelua",
      "Johdossa puoliajalla": "2 ottelua",
      "Valunut tasapeliksi": "2 ottelua",
      "Käännetty tappioksi": "0 ottelua",
    });
  });

  test("never counts more than the standings page played, in a live league", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024");
    const played = Number(
      await page
        .locator("table tbody tr")
        .filter({ hasText: "Arsenal" })
        .locator("td:nth-child(3)")
        .textContent()
    );

    await page.goto(LIVE_TEAM);
    const panel = page.getByRole("region", { name: HEADING });
    await panel.waitFor();
    const shown = await figures(page);
    const count = (label: string) => Number(/^(\d+)/.exec(shown[label] ?? "")?.[1]);

    if (Object.keys(shown).length === 0) {
      // Stored before the half-time columns existed, and not backfilled here.
      await expect(panel).toContainText("Puoliaikatuloksia ei ole tälle kaudelle.");
      return;
    }
    const trailed = count("Tappioasemassa puoliajalla");
    const led = count("Johdossa puoliajalla");
    expect(trailed + led).toBeLessThanOrEqual(played);
    expect(count("Käännetty voitoksi") + count("Tasoitettu")).toBeLessThanOrEqual(trailed);
    expect(count("Valunut tasapeliksi") + count("Käännetty tappioksi")).toBeLessThanOrEqual(led);
  });

  test("comes third to last in Analyysit", async ({ page }) => {
    // `Tämä kausi verrattuna` (specs/038) and `Ennätykset` (specs/039) were
    // both added after it; this was the last panel until then.
    await page.goto(FIXTURE_TEAM);
    const subheadings = page
      .getByRole("region", { name: "Analyysit" })
      .getByRole("heading", { level: 4 });

    await expect(subheadings.nth((await subheadings.count()) - 3)).toHaveText(HEADING);
  });
});

test("sends neither direction to a signed-out reader", async ({ page }) => {
  const response = await page.goto(FIXTURE_TEAM);
  const html = (await response?.text()) ?? "";

  await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
  expect(html).not.toContain("Tappioasemassa puoliajalla");
  expect(html).not.toContain("Käännetty voitoksi");
  expect(html).not.toContain("Johdossa puoliajalla");
  expect(html).not.toContain("Käännetty tappioksi");
});
