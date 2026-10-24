import { expect, test } from "@playwright/test";
import { SESSION_COOKIE, storeSignedInReader } from "../support/e2e-session";
import { expectedStatus, isAdminPage, UX_PAGES } from "../support/ux-pages";

/**
 * No page scrolls sideways, at a phone's width or a laptop's, signed in, where a
 * page holds the most: a real session, an admin's for the admin page. A table
 * or a bracket wider than the screen scrolls in its own box instead.
 *
 * decisions/695-ux-sweep.md
 * decisions/698-long-lists-start-closed.md
 */

let reader: Awaited<ReturnType<typeof storeSignedInReader>>;
let admin: Awaited<ReturnType<typeof storeSignedInReader>>;

test.beforeAll(async () => {
  reader = await storeSignedInReader("user");
  admin = await storeSignedInReader("admin");
});

test.afterAll(async () => {
  await reader?.remove();
  await admin?.remove();
});

for (const width of [375, 1024]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const [name, path] of UX_PAGES) {
      test(`${name} stays within the window`, async ({ page, baseURL }) => {
        const signedIn = isAdminPage(name) ? admin : reader;
        await page
          .context()
          .addCookies([{ name: SESSION_COOKIE, value: signedIn.cookie, url: baseURL as string }]);
        const response = await page.goto(path);
        await page.waitForLoadState("networkidle");

        expect(response?.status()).toBe(expectedStatus(name));
        // Signed in for real: the header names the reader.
        await expect(page.getByText(signedIn.name, { exact: true }).first()).toBeVisible();
        // A folded section's content is laid out only once opened, so open them all.
        await page.evaluate(() => {
          for (const fold of document.querySelectorAll("details")) fold.open = true;
        });
        const sideways = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(sideways).toBeLessThanOrEqual(0);
      });
    }
  });
}
