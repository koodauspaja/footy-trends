import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The size the charts' text is painted at, in both layouts. jsdom has
 * no CSS, so a unit test would pass with Tailwind emitting nothing or the `sm:`
 * rule losing. The text is inside the `viewBox`, so the sizes are user units.
 *
 * decisions/441-line-chart-text-on-a-phone.md
 * decisions/053-elo-ratings.md
 * decisions/700-legible-charts.md
 */

// Arsenal, and a completed season: every chart has its full set of points.
const TEAM = "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024";

// `text-xs`, which the charts keep from the `sm` breakpoint up.
const DESKTOP_UNITS = 12;

// Below `sm`, where the drawing is scaled down and the text with it: about
// 12 px once a 375 px screen has scaled the drawing.
const PHONE_UNITS = 23;
// The bar charts' labels and values, a 400-unit drawing, below `sm`.
const PHONE_BAR_UNITS = 14;

async function textSizes(page: Page, width: number, selector: string): Promise<number[]> {
  await page.setViewportSize({ width, height: 900 });
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  await page.goto(TEAM);
  await page.getByRole("img", { name: "Sijoitus kierroksittain" }).waitFor();

  return page.evaluate(
    (query) =>
      [...document.querySelectorAll(query)].map((text) =>
        Number.parseFloat(getComputedStyle(text).fontSize)
      ),
    selector
  );
}

const axisSizes = (page: Page, width: number) =>
  textSizes(page, width, "[data-part=x-axis], [data-part=y-axis]");
// A bar row's label and each bar's value.
const barSizes = (page: Page, width: number) =>
  textSizes(page, width, "[data-part=row] > text, [data-part=value]");

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

test.describe("Bar chart text", () => {
  test("is enlarged on a phone, on every label and value", async ({ page }) => {
    const sizes = await barSizes(page, 375);

    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.every((size) => size === PHONE_BAR_UNITS)).toBe(true);
  });

  test("keeps its usual size from the sm breakpoint up", async ({ page }) => {
    const sizes = await barSizes(page, 1280);

    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.every((size) => size === DESKTOP_UNITS)).toBe(true);
  });
});
