import type { Locator, Page } from "@playwright/test";

/**
 * A page's folds for a spec: the `<details>` a heading names, whether it is
 * open, and opening it. A spec reading a section that starts closed opens it
 * first, as a reader would.
 *
 * decisions/071-section-toggles.md
 */

/** The `<details>` in the region a heading names. */
export function fold(page: Page, name: string): Locator {
  return page.getByRole("region", { name, exact: true }).locator(":scope > details");
}

export async function isOpen(details: Locator): Promise<boolean> {
  return details.evaluate((element) => (element as HTMLDetailsElement).open);
}

/** Opens each fold the headings name, in order, leaving an open one as it is. */
export async function openFolds(page: Page, ...names: string[]): Promise<void> {
  for (const name of names) {
    const details = fold(page, name);
    if (!(await isOpen(details))) await details.locator(":scope > summary").click();
  }
}

/** Opens every fold on the page at once, for a spec that measures all of it. */
export async function openEveryFold(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const details of document.querySelectorAll("details")) details.open = true;
  });
}

/** Opens `Analyysit` and every group inside it, for a spec reading its panels. */
export async function openAnalytics(page: Page): Promise<void> {
  await openFolds(page, "Analyysit");
  await fold(page, "Analyysit").evaluate((analytics) => {
    for (const group of analytics.querySelectorAll("details")) group.open = true;
  });
}
