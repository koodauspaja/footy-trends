import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The team page's league-position chart (specs/030), end to end.
 *
 * **Signed in is simulated, on purpose and only here.** The chart's gate runs
 * on the server, which `session.ts`'s browser-side interception cannot reach, so
 * a spec sends the override header instead — honoured only because this server
 * runs against a `_test` database with the flag `playwright.config.ts` sets.
 * A spec that sends no header is signed out, which is how the prompt is tested
 * on the same server.
 */

const HEADING = "Sijoitus kierroksittain";
const SIGNED_OUT = "Kirjaudu sisään nähdäksesi analyysit ja trendit.";

/** Arsenal, and a completed season: every round is played, so every point exists. */
const TEAM = "/ulkomaat/joukkue/57";
const SEASON = "kilpailu=PL&kausi=2024";

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

/** The chart, found the way a screen reader would: an image named by its heading. */
function chart(page: Page) {
  return page.getByRole("img", { name: HEADING });
}

/** "Sijoitus 10. kierroksen jälkeen: 3." → 3, from the chart's text alternative. */
async function plottedPosition(page: Page, round: number): Promise<number> {
  const sentence = page.getByText(new RegExp(`^Sijoitus ${round}\\. kierroksen jälkeen: \\d+\\.$`));
  const text = (await sentence.textContent()) ?? "";
  return Number(/: (\d+)\.$/.exec(text)?.[1]);
}

test.describe("League position chart, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("draws a point for every round of a completed season", async ({ page }) => {
    await page.goto(`${TEAM}?${SEASON}`);

    await expect(page.getByRole("heading", { name: HEADING })).toBeVisible();
    await expect(chart(page)).toBeVisible();
    // 38 rounds, each listed in the text alternative as well as drawn.
    await expect(page.getByText(/^Sijoitus \d+\. kierroksen jälkeen: \d+\.$/)).toHaveCount(38);
  });

  test("plots the same position the standings page shows for that round", async ({ page }) => {
    /**
     * The property the feature rests on, checked against the page a reader would
     * compare it with: the standings table after round 10, via its own round
     * selector.
     */
    await page.goto(`${TEAM}?${SEASON}`);
    const plotted = await plottedPosition(page, 10);
    const club = (await page.getByRole("heading", { level: 1 }).textContent())?.split(" – ")[0];

    await page.goto(`/ulkomaat/sarjataulukko?${SEASON}&kierros=10`);
    const row = page.locator("table tbody tr").filter({ hasText: club ?? "" });
    const shown = Number(await row.locator("td").first().textContent());

    expect(club).toBeTruthy();
    expect(plotted).toBe(shown);
  });

  test("offers no chart for a cup, which has no league position", async ({ page }) => {
    await page.goto(`${TEAM}?kilpailu=CL&kausi=2024`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
  });

  test("draws a Finnish league's chart too", async ({ page }) => {
    // Derived from the app rather than a club id, as domestic-team.spec.ts does:
    // whoever tops a completed Veikkausliiga season played every round of it.
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2025");
    await page.locator("table tbody tr").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);

    await expect(chart(page)).toBeVisible();
    await expect(page.getByText(/^Sijoitus 1\. kierroksen jälkeen: \d+\.$/)).toHaveCount(1);
  });
});

test.describe("League position chart, signed out", () => {
  test("shows the sign-in prompt in the chart's place", async ({ page }) => {
    await page.goto(`${TEAM}?${SEASON}`);

    await expect(page.getByRole("heading", { name: HEADING })).toBeVisible();
    await expect(page.getByText(SIGNED_OUT)).toBeVisible();
    await expect(chart(page)).toHaveCount(0);
  });

  test("sends no position to a signed-out reader, not even hidden", async ({ page }) => {
    // The HTML itself, not what is visible: a chart hidden in the browser would
    // still have published its values.
    const response = await page.goto(`${TEAM}?${SEASON}`);
    const html = (await response?.text()) ?? "";

    expect(html).toContain(SIGNED_OUT);
    expect(html).not.toContain("kierroksen jälkeen");
  });
});
