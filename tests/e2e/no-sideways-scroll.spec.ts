import { expect, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { UX_PAGES } from "../support/ux-pages";

/**
 * No page scrolls sideways, at a phone's width or a laptop's, signed in, where a
 * page holds the most. A table or a bracket wider than the screen scrolls in
 * its own box instead.
 *
 * decisions/695-ux-sweep.md
 */

for (const width of [375, 1024]) {
  test.describe(`at ${width} px`, () => {
    test.use({
      viewport: { width, height: 900 },
      extraHTTPHeaders: { [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN },
    });

    for (const [name, path] of UX_PAGES) {
      test(`${name} stays within the window`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");

        const sideways = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        );
        expect(sideways).toBeLessThanOrEqual(0);
      });
    }
  });
}
