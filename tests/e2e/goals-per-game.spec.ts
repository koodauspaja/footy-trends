import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * `Maaleja ottelua kohden` on a competition's standings page, end to end.
 * Signed in the way league-position.spec.ts explains. The stored seasons are
 * not fixed, so no value is named: only rules that hold whatever the data.
 *
 * decisions/048-league-goals-per-game-trend.md
 */

const PL = "/ulkomaat/sarjataulukko?kilpailu=PL";
const VL = "/kotimaa/sarjataulukko?kilpailu=VL";
const HEADING = "Maaleja ottelua kohden";

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

function panel(page: Page) {
  return page.getByRole("region", { name: HEADING });
}

// Each drawn point's `cx`, in order, and the one ringed.
async function drawn(page: Page) {
  const points = panel(page).locator("[data-part=points] circle:not([data-marked])");
  const ring = panel(page).locator("[data-marked]");
  return {
    xs: await points.evaluateAll((circles) => circles.map((circle) => circle.getAttribute("cx"))),
    ys: await points.evaluateAll((circles) => circles.map((circle) => circle.getAttribute("cy"))),
    ring: await ring.evaluateAll((circles) => circles.map((circle) => circle.getAttribute("cx"))),
  };
}

test.describe("Goals per game, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  for (const [name, url] of [
    ["Premier League", PL],
    ["Veikkausliiga", VL],
  ] as const) {
    test(`draws a point per stored season on ${name}, the page's own ringed`, async ({ page }) => {
      await page.goto(url);
      await panel(page).waitFor();
      const seasons = panel(page).getByRole("listitem");
      const { xs, ring } = await drawn(page);

      expect(xs.length).toBeGreaterThanOrEqual(2);
      await expect(seasons).toHaveCount(xs.length);
      await expect(seasons.first()).toHaveText(
        /^Kausi .+: \d+,\d maalia ottelua kohden, \d+ ottelua\.$/
      );
      expect(ring).toHaveLength(1);
      expect(xs).toContain(ring[0]);
      await expect(panel(page).getByText("Perustuu tallennettuihin kausiin.")).toBeVisible();
    });
  }

  test("draws the same line whichever season the page shows, moving only the ring", async ({
    page,
  }) => {
    await page.goto(PL);
    await panel(page).waitFor();
    const latest = await drawn(page);

    // The oldest drawn season: its label is the first sentence's.
    const first = await panel(page).getByRole("listitem").first().textContent();
    const season = /^Kausi (\d{4})/.exec(first ?? "")?.[1];
    await page.goto(`${PL}&kausi=${season}`);
    await panel(page).waitFor();
    const oldest = await drawn(page);

    expect(oldest.xs).toEqual(latest.xs);
    expect(oldest.ys).toEqual(latest.ys);
    expect(oldest.ring).toEqual([latest.xs[0]]);
    expect(latest.ring).not.toEqual(oldest.ring);
  });
});

test.describe("Goals per game, signed out", () => {
  test("shows the one prompt under Analyysit, and no value in the page", async ({ page }) => {
    const response = await page.goto(PL);
    const html = (await response?.text()) ?? "";
    const analytics = page.getByRole("region", { name: "Analyysit" });

    await expect(
      analytics.getByText("Kirjaudu sisään nähdäksesi analyysit ja trendit.")
    ).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    expect(html).not.toContain("maalia ottelua kohden");
    expect(html).not.toContain(HEADING);
  });
});

test.describe("Goals per game where the spec has none", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  for (const url of [
    "/maajoukkueet/sarjataulukko?kilpailu=WC",
    "/kotimaa/sarjataulukko?kilpailu=MSC",
    "/kotimaa/sarjataulukko?kilpailu=LC",
  ]) {
    test(`has no Analyysit on ${url}`, async ({ page }) => {
      await page.goto(url);
      await page.getByRole("heading", { level: 1 }).waitFor();

      await expect(page.getByRole("region", { name: "Analyysit" })).toHaveCount(0);
    });
  }
});
