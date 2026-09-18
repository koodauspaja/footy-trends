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

  test("continues a Kakkonen pool through its split, below that pool's upper group", async ({
    page,
  }) => {
    /**
     * Kakkonen 2026's real data: three pools, each split into its own upper and
     * lower continuation. A lower-group team's line carries on past the split,
     * at its place in its continuation plus its own pool's upper group — and
     * that must be the standings page's number for the same round.
     */
    const standings = "/kotimaa/sarjataulukko?kilpailu=M2&kausi=2026";
    const tableUnder = (name: string) =>
      page.getByRole("heading", { name, level: 2 }).locator("xpath=following::table[1]");

    await page.goto(standings);
    // Six per pool, as the 2026 regulations have it. Asserted with the
    // auto-waiting matcher, because `count()` does not wait for a page that is
    // still streaming.
    const upperSize = 6;
    await expect(tableUnder("Ylempi jatkosarja A").locator("tbody tr")).toHaveCount(upperSize);
    const leader = tableUnder("Alempi jatkosarja A").locator("tbody tr").first();
    const club = await leader.getByRole("link").first().textContent();
    await leader.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);

    const sentences = page.getByText(/^Sijoitus \d+\. kierroksen jälkeen: \d+\.$/);
    await expect(chart(page)).toBeVisible();
    const last = (await sentences.last().textContent()) ?? "";
    const [, round, plotted] = /^Sijoitus (\d+)\. kierroksen jälkeen: (\d+)\.$/.exec(last) ?? [];
    // The line did not stop at the split, so the note is absent.
    await expect(
      page.getByText("Jatkosarjan sijoituksia ei voida laskea tälle kaudelle.")
    ).toHaveCount(0);

    await page.goto(`${standings}&kierros=${round}`);
    const row = tableUnder("Alempi jatkosarja A")
      .locator("tbody tr")
      .filter({ hasText: club ?? "" });
    const shown = Number(await row.locator("td").first().textContent());

    expect(Number(round)).toBeGreaterThan(18);
    expect(Number(plotted)).toBe(shown + upperSize);
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
