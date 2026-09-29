import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The full head-to-head, end to end (specs/042).
 *
 * Driven from a real match page rather than by typing the URL, because the
 * link *is* the feature's way in (S1) — a page nothing reaches is not reachable
 * however well it renders.
 */

const MATCHES = "/kotimaa/ottelut";
const ALL_MEETINGS = /Kaikki kohtaamiset \((\d+)\)/;

/** A match page that has a head-to-head, found the way a reader would. */
async function openAMatch(page: Page): Promise<void> {
  await page.goto(MATCHES);
  const first = page.locator('a[href*="/kotimaa/ottelu/"]').first();
  await first.waitFor();
  await first.click();
  await page.getByRole("heading", { level: 2, name: "Aiemmat kohtaamiset" }).waitFor();
}

test.describe("Head-to-head", () => {
  test("opens from a match page, and the link's count is the page's length", async ({ page }) => {
    await openAMatch(page);

    const link = page.getByRole("link", { name: ALL_MEETINGS });
    const label = (await link.textContent()) ?? "";
    const promised = Number(ALL_MEETINGS.exec(label)?.[1]);
    expect(promised).toBeGreaterThan(0);

    await link.click();
    await page.getByRole("heading", { level: 1, name: /^Kohtaamiset: / }).waitFor();

    // S10: the number on the link is the number of rows behind it.
    await expect(page.locator("tbody tr")).toHaveCount(promised);
  });

  test("reads Yhteenveto then Kohtaamiset, and reconciles with its own list", async ({ page }) => {
    await openAMatch(page);
    await page.getByRole("link", { name: ALL_MEETINGS }).click();
    await page.getByRole("heading", { level: 1, name: /^Kohtaamiset: / }).waitFor();

    const sections = await page.getByRole("heading", { level: 2 }).allTextContents();
    expect(sections).toEqual(["Yhteenveto", "Kohtaamiset"]);

    // The summary's count is the list's length, which is the whole claim the
    // page makes about itself.
    const played = (await page.getByText(/^\d+ ottelua?, /).textContent()) ?? "";
    const counted = Number(/^(\d+)/.exec(played)?.[1]);
    await expect(page.locator("tbody tr")).toHaveCount(counted);
  });

  test("names a competition on every row, since the history spans them", async ({ page }) => {
    await openAMatch(page);
    await page.getByRole("link", { name: ALL_MEETINGS }).click();
    await page.getByRole("columnheader", { name: "Kilpailu" }).waitFor();

    const labels = await page.locator("tbody tr td:nth-child(4)").allTextContents();
    expect(labels.length).toBeGreaterThan(0);
    // S2 puts every competition in one list, so the column is the only thing
    // saying which one a meeting belonged to — an empty cell says nothing.
    expect(labels.every((label) => label.trim() !== "")).toBe(true);
  });

  test("says how far back it looked", async ({ page }) => {
    await openAMatch(page);
    await page.getByRole("link", { name: ALL_MEETINGS }).click();

    await expect(
      page.getByText(/Perustuu kaudesta .* alkaen tallennettuihin otteluihin\./)
    ).toBeVisible();
  });

  test("shows no unplayed fixture", async ({ page }) => {
    await openAMatch(page);
    await page.getByRole("link", { name: ALL_MEETINGS }).click();
    await page.getByRole("columnheader", { name: "Tulos" }).waitFor();

    // Every row is a result: a fixture with no score would leave this empty.
    const scores = await page.locator("tbody tr td:nth-child(3)").allTextContents();
    expect(scores.length).toBeGreaterThan(0);
    expect(scores.every((score) => /\d+\s*–\s*\d+/.test(score))).toBe(true);
  });

  test("is not found for a team against itself", async ({ page }) => {
    await page.goto("/kotimaa/kohtaamiset/60987/60987");

    await expect(page.getByText("Kohtaamisia ei löytynyt.")).toBeVisible();
  });
});

/**
 * The two analysis sections (specs/044), on a pair with meetings in more than
 * one competition: FC Inter and AC Oulu have met in Veikkausliiga and in
 * Liigacup. Signed in the way league-position.spec.ts explains.
 */
test.describe("Head-to-head analysis", () => {
  const INTER_OULU = "/kotimaa/kohtaamiset/60987/60493";

  /** The rows of the meeting list, not of the grid or the averages table. */
  function meetingRows(page: Page) {
    return page.getByRole("region", { name: "Kohtaamiset" }).locator("tbody tr");
  }

  test.describe("signed in", () => {
    test.beforeEach(async ({ page }) => {
      await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
      await page.goto(INTER_OULU);
      // Under `Keskinäinen historia` since specs/047: FC Inter and AC Oulu
      // met in 2026, so the page carries the form group and the history's
      // sections are `h3`.
      await page.getByRole("heading", { level: 3, name: "Tulokset" }).waitFor();
    });

    test("reads Yhteenveto, Tulokset, Maalit kilpailuittain, Kohtaamiset", async ({ page }) => {
      const history = page.getByRole("region", { name: "Keskinäinen historia" });
      await expect(history.getByRole("heading", { level: 3 })).toHaveText([
        "Yhteenveto",
        "Tulokset",
        "Maalit kilpailuittain",
        "Kohtaamiset",
      ]);
    });

    test("counts every listed meeting exactly once in the grid", async ({ page }) => {
      const cells = await page
        .getByRole("region", { name: "Tulokset" })
        .getByRole("cell")
        .allTextContents();
      const counted = cells.reduce((sum, cell) => sum + Number(cell || 0), 0);

      expect(counted).toBeGreaterThan(1);
      await expect(meetingRows(page)).toHaveCount(counted);
    });

    test("splits the meetings by competition, each with both averages", async ({ page }) => {
      const table = page.getByRole("region", { name: "Maalit kilpailuittain" }).getByRole("table");
      const rows = table.locator("tbody tr");
      // Veikkausliiga and Liigacup, never one blended row (S4).
      expect(await rows.count()).toBeGreaterThanOrEqual(2);
      await expect(table).toContainText("Liigacup");

      const played = await rows.locator("td:nth-child(2)").allTextContents();
      const total = played.reduce((sum, count) => sum + Number(count), 0);
      await expect(meetingRows(page)).toHaveCount(total);

      const averages = await rows.locator("td:nth-child(3), td:nth-child(4)").allTextContents();
      expect(averages.every((text) => /^\d+,\d – \d+,\d$/.test(text.trim()))).toBe(true);
    });
  });

  test("signed out, shows one prompt in place of both sections", async ({ page }) => {
    await page.goto(INTER_OULU);
    await page.getByRole("heading", { level: 2, name: "Kohtaamiset" }).waitFor();

    await expect(page.getByText("Kirjaudu sisään nähdäksesi analyysit ja trendit.")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Yhteenveto", "Kohtaamiset"]);
  });
});

/**
 * The rivalry (specs/047): both teams' current form above their shared
 * history, on a pair still playing each other — FC Inter and AC Oulu met in
 * 2026.
 */
test.describe("The rivalry, signed in", () => {
  const INTER_OULU = "/kotimaa/kohtaamiset/60987/60493";

  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
    await page.goto(INTER_OULU);
    await page.getByRole("heading", { level: 2, name: "Nykyinen vire" }).waitFor();
  });

  test("reads Nykyinen vire, then Keskinäinen historia", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "Nykyinen vire",
      "Keskinäinen historia",
    ]);
  });

  test("gives each team its block, first team first, with five linked results", async ({
    page,
  }) => {
    const form = page.getByRole("region", { name: "Nykyinen vire" });
    await expect(form.getByRole("heading", { level: 3 })).toHaveText(["FC Inter", "AC Oulu"]);

    const inter = form.getByRole("region", { name: "FC Inter" });
    const results = inter.getByRole("link");
    await expect(results).toHaveCount(5);
    await expect(results.first()).toHaveText(/^[VTH]$/);
    await expect(inter.getByText(/^\d,\d pistettä ottelua kohden$/)).toBeVisible();
    await expect(inter.getByText(/^Viimeisin ottelu \d{2}\.\d{2}\.\d{4}$/)).toBeVisible();

    // A result is a match: following it opens that match's page.
    await results.first().click();
    await expect(page).toHaveURL(/\/kotimaa\/ottelu\/\d+$/);
  });
});
