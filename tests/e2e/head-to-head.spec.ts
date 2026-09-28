import { expect, type Page, test } from "@playwright/test";

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
