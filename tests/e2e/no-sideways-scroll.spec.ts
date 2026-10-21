import { expect, test } from "@playwright/test";
import { SESSION_COOKIE, storeSignedInReader } from "../support/e2e-session";
import { expectedStatus, UX_PAGES } from "../support/ux-pages";

/**
 * No page scrolls sideways, at a phone's width or a laptop's, signed in, where a
 * page holds the most: a real session, an admin's for the admin page. A table
 * or a bracket wider than the screen scrolls in its own box instead.
 *
 * decisions/695-ux-sweep.md
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
        const cookie = name === "admin" ? admin.cookie : reader.cookie;
        await page
          .context()
          .addCookies([{ name: SESSION_COOKIE, value: cookie, url: baseURL as string }]);
        const response = await page.goto(path);
        await page.waitForLoadState("networkidle");

        expect(response?.status()).toBe(expectedStatus(name));
        const sideways = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(sideways).toBeLessThanOrEqual(0);
      });
    }
  });
}
