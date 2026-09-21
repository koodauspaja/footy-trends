import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The size the line charts' axis text is actually painted at, in both layouts.
 *
 * jsdom has no CSS, so a unit test can only assert the class attribute — it
 * would pass with Tailwind emitting nothing, or with the `sm:` rule losing to
 * the base rule. The size is the whole point of #441, so it is measured here,
 * the same reason `dark-mode.spec.ts` measures colour in a browser.
 *
 * The text lives inside the `viewBox`, so these are user units: the drawing is
 * 640 wide, and a phone scales the whole of it — text included — to about
 * 0,54x. 12 units reached the reader at roughly 6 px, which is what the larger
 * phone size fixes without narrowing the drawing.
 */

/** Arsenal, and a completed season: every chart has its full set of points. */
const TEAM = "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024";

/** `text-xs`, which the charts keep from the `sm` breakpoint up. */
const DESKTOP_UNITS = 12;

/** Below `sm`, where the drawing is scaled down and the text with it. */
const PHONE_UNITS = 19;

async function axisSizes(page: Page, width: number): Promise<number[]> {
  await page.setViewportSize({ width, height: 900 });
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  await page.goto(TEAM);
  await page.getByRole("img", { name: "Sijoitus kierroksittain" }).waitFor();

  return page.evaluate(() =>
    [...document.querySelectorAll("[data-part=x-axis], [data-part=y-axis]")].map((axis) =>
      Number.parseFloat(getComputedStyle(axis).fontSize)
    )
  );
}

test.describe("Line chart axis text", () => {
  test("is enlarged on a phone, on every axis of every chart", async ({ page }) => {
    const sizes = await axisSizes(page, 375);

    // Five charts, both axes each: the position, form, rolling-goals,
    // total-goals and clean-sheet panels.
    expect(sizes).toHaveLength(10);
    expect(sizes.every((size) => size === PHONE_UNITS)).toBe(true);
  });

  test("keeps its usual size from the sm breakpoint up", async ({ page }) => {
    const sizes = await axisSizes(page, 1280);

    expect(sizes).toHaveLength(10);
    expect(sizes.every((size) => size === DESKTOP_UNITS)).toBe(true);
  });
});
