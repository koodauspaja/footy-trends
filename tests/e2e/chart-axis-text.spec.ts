import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The size the line charts' axis text is painted at, in both layouts. jsdom has
 * no CSS, so a unit test would pass with Tailwind emitting nothing or the `sm:`
 * rule losing. The text is inside the `viewBox`, so the sizes are user units.
 *
 * decisions/441-line-chart-text-on-a-phone.md
 * decisions/053-elo-ratings.md
 */

// Arsenal, and a completed season: every chart has its full set of points.
const TEAM = "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024";

// `text-xs`, which the charts keep from the `sm` breakpoint up.
const DESKTOP_UNITS = 12;

// Below `sm`, where the drawing is scaled down and the text with it.
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

    // Six charts, both axes each: the position, form, rolling-goals,
    // total-goals, clean-sheet and Elo panels.
    expect(sizes).toHaveLength(12);
    expect(sizes.every((size) => size === PHONE_UNITS)).toBe(true);
  });

  test("keeps its usual size from the sm breakpoint up", async ({ page }) => {
    const sizes = await axisSizes(page, 1280);

    expect(sizes).toHaveLength(12);
    expect(sizes.every((size) => size === DESKTOP_UNITS)).toBe(true);
  });
});
