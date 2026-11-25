import { expect, type Page, test } from "@playwright/test";

/**
 * The browser tab title follows a selector-driven change, and does not lag a
 * navigation behind it. These pin the behaviour as it is, so a Next upgrade or
 * a Suspense boundary that widens the blank-title window fails here.
 *
 * decisions/170-tab-title-follows-the-season.md
 * decisions/888-e2e-reads-the-greyed-out-season.md
 * decisions/890-tab-title-test-waits-for-the-new-title.md
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

// Waits until the title names the option just chosen, then for the heading to
// agree. Every step retries, so neither the page before the navigation nor the
// moment its title is blank can pass for the page after it.
async function expectTitleToName(page: Page, label: string) {
  await expect.poll(() => page.title()).toContain(label);
  await expectTitleToMatchHeading(page);
}

type TitleLog = { at: number; title: string }[];

// Logs every change of the tab title from now on, in the page itself, so a
// blank lasting a few milliseconds is seen however the test polls.
async function recordTitles(page: Page) {
  await page.evaluate(() => {
    const log: TitleLog = [{ at: performance.now(), title: document.title }];
    (window as unknown as { titleLog: TitleLog }).titleLog = log;
    new MutationObserver(() => {
      if (document.title !== log.at(-1)?.title) {
        log.push({ at: performance.now(), title: document.title });
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

// The blank was measured at 1–5 ms, and at 7–17 ms on an older Next; a blank a
// reader could notice lasts far longer than this.
const LONGEST_BLANK_MS = 100;

// The title was never blank for `LONGEST_BLANK_MS` or longer since
// `recordTitles`, counting a blank still showing as lasting until now.
async function expectNoLongBlankTitle(page: Page) {
  const longest = await page.evaluate(() => {
    const log = (window as unknown as { titleLog?: TitleLog }).titleLog;
    if (log === undefined) throw new Error("recordTitles was not called before the change");
    return Math.max(
      0,
      ...log.map((entry, index) =>
        entry.title === "" ? (log[index + 1]?.at ?? performance.now()) - entry.at : 0
      )
    );
  });
  expect(longest).toBeLessThan(LONGEST_BLANK_MS);
}

// The label of the currently selected option, e.g. `2021` or `2024/25`.
function selectedLabel(page: Page, selectId: string) {
  return page.locator(`#${selectId} option:checked`).textContent();
}

// Switches `select` to its first option that is not already selected and can be
// chosen, and returns that option's label. Choosing dynamically keeps the spec
// working as seasons roll over; a greyed-out season cannot be chosen.
async function changeToAnotherOption(page: Page, selectId: string): Promise<string> {
  const current = await selectedLabel(page, selectId);
  const options = page.locator(`#${selectId} option`);
  const count = await options.count();

  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    const label = await option.textContent();
    if (label === current || (await option.isDisabled())) continue;
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
      await recordTitles(page);

      const newSeason = await changeToAnotherOption(page, "kausi");

      await expect(page).toHaveURL(new RegExp(`kausi=${newSeason.split("/")[0]}`));
      // The season the title names is the one the selector now shows: a title a
      // navigation behind is the staleness that was reported.
      await expectTitleToName(page, newSeason);
      await expectNoLongBlankTitle(page);
    });
  }

  test("/ulkomaat/sarjataulukko updates the title when Kilpailu changes", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=PL");
    await expectTitleToMatchHeading(page);
    await recordTitles(page);

    const newCompetition = await changeToAnotherOption(page, "kilpailu");

    // Both halves matter: that the control settled on the competition asked
    // for, and that the title names that same one. Asserting only that the
    // title changed would pass a navigation routed to the wrong competition.
    await expect(page.locator("#kilpailu option:checked")).toHaveText(newCompetition);
    await expectTitleToName(page, newCompetition);
    await expectNoLongBlankTitle(page);
  });
});

// A stand-in page that, like the real one, keeps the old title and heading for
// a moment after the change and then shows a blank title, held here for 500 ms,
// long enough that a check reading the title once cannot miss it.
async function openStandIn(page: Page) {
  await page.setContent(`
    <title>Alpha 2026</title>
    <h1>Alpha 2026</h1>
    <select id="kilpailu"><option value="A">Alpha</option><option value="B">Beta</option></select>
    <script>
      document.getElementById("kilpailu").addEventListener("change", () => {
        setTimeout(() => { document.title = ""; }, 200);
        setTimeout(() => {
          document.title = "Beta 2026";
          document.querySelector("h1").textContent = "Beta 2026";
        }, 700);
      });
    </script>
  `);
  await expectTitleToMatchHeading(page);
  await recordTitles(page);
}

test.describe("The tab-title checks, on a stand-in page", () => {
  test("the title check waits out the old page and a blank title", async ({ page }) => {
    await openStandIn(page);

    const newCompetition = await changeToAnotherOption(page, "kilpailu");

    await expectTitleToName(page, newCompetition);
    expect(await page.title()).toBe("Beta 2026");
  });

  test("the blank-title check fails a title left blank for 500 ms", async ({ page }) => {
    await openStandIn(page);

    const newCompetition = await changeToAnotherOption(page, "kilpailu");
    await expectTitleToName(page, newCompetition);

    await expect(expectNoLongBlankTitle(page)).rejects.toThrow(/toBeLessThan/);
  });
});
