import { expect, type Page, test } from "@playwright/test";

/**
 * The browser tab title follows a selector-driven change, and does not lag a
 * navigation behind it. These pin the behaviour as it is, so a Next upgrade or
 * a Suspense boundary that widens the blank-title window fails here.
 *
 * decisions/170-tab-title-follows-the-season.md
 */

// The title is `generateMetadata`'s season name and label, and the `PageShell`
// heading starts with the same string; the matches pages append `, kierros N`.
// So the prefix is asserted, not equality, which covers all four pages.
async function expectTitleToMatchHeading(page: Page) {
  await expect
    .poll(async () => {
      const title = await page.title();
      const heading = (await page.locator("h1").first().textContent()) ?? "";
      return title !== "" && heading.startsWith(title);
    })
    .toBe(true);
}

// The label of the currently selected option, e.g. `2021` or `2024/25`.
function selectedLabel(page: Page, selectId: string) {
  return page.locator(`#${selectId} option:checked`).textContent();
}

// Switches `select` to its first option that is not already selected, and
// returns that option's label. Choosing dynamically keeps the spec working as
// seasons roll over.
async function changeToAnotherOption(page: Page, selectId: string): Promise<string> {
  const current = await selectedLabel(page, selectId);
  const options = page.locator(`#${selectId} option`);
  const count = await options.count();

  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    const label = await option.textContent();
    if (label === current) continue;
    const value = await option.getAttribute("value");
    await page.selectOption(`#${selectId}`, value ?? "");
    return label ?? "";
  }

  throw new Error(`#${selectId} offered no option other than "${current}"`);
}

const seasonPages = [
  { name: "/kotimaa/sarjataulukko", url: "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026" },
  { name: "/ulkomaat/sarjataulukko", url: "/ulkomaat/sarjataulukko?kilpailu=PL" },
  { name: "/kotimaa/ottelut", url: "/kotimaa/ottelut?kilpailu=VL&kausi=2026" },
  { name: "/ulkomaat/ottelut", url: "/ulkomaat/ottelut?kilpailu=PL" },
];

test.describe("Tab title follows the selected season", () => {
  for (const { name, url } of seasonPages) {
    test(`${name} updates the title when Kausi changes`, async ({ page }) => {
      await page.goto(url);
      await expectTitleToMatchHeading(page);
      const titleBefore = await page.title();

      const newSeason = await changeToAnotherOption(page, "kausi");

      await expect(page).toHaveURL(new RegExp(`kausi=${newSeason.split("/")[0]}`));
      await expectTitleToMatchHeading(page);
      await expect(page).not.toHaveTitle(titleBefore);
      // The season the title names is the one the selector now shows.
      expect(await page.title()).toContain(newSeason);
    });
  }

  test("/ulkomaat/sarjataulukko updates the title when Kilpailu changes", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=PL");
    await expectTitleToMatchHeading(page);
    const titleBefore = await page.title();

    const newCompetition = await changeToAnotherOption(page, "kilpailu");

    await expectTitleToMatchHeading(page);
    await expect(page).not.toHaveTitle(titleBefore);
    // Both halves matter: that the control settled on the competition asked
    // for, and that the title names that same one. Asserting only that the
    // title changed would pass a navigation routed to the wrong competition.
    await expect(page.locator("#kilpailu option:checked")).toHaveText(newCompetition);
    expect(await page.title()).toContain(newCompetition);
  });
});
