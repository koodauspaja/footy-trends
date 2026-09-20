import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * The team page's `Putket` panel (specs/035), end to end. Signed in the way
 * league-position.spec.ts explains.
 */

const HEADING = "Putket";
const TEAM = "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024";

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

/** The panel's figures, by their label. */
async function figures(page: Page): Promise<Record<string, string>> {
  const panel = page.getByRole("region", { name: HEADING });
  await panel.waitFor();
  const rows = await panel.locator("dl > div").all();
  const entries = await Promise.all(
    rows.map(async (row) => {
      const label = (await row.locator("dt").textContent()) ?? "";
      const value = ((await row.locator("dd").textContent()) ?? "").replace(/\s+/g, " ").trim();
      return [label, value] as const;
    })
  );
  return Object.fromEntries(entries);
}

test.describe("Streaks, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("agrees with the Vire column the standings page shows", async ({ page }) => {
    /**
     * The standings table's `Vire` is the team's last five results, oldest
     * first. The run it ends on is the run the panel calls current — the same
     * matches, read two ways.
     */
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024");
    const letters = (
      (await page
        .locator("table tbody tr")
        .filter({ hasText: "Arsenal" })
        .locator("td")
        .last()
        .textContent()) ?? ""
    ).replaceAll(/\s/g, "");
    const last = letters.at(-1) ?? "";
    const trailing = [...letters].reverse().findIndex((letter) => letter !== last);
    const runInVire = trailing === -1 ? letters.length : trailing;

    await page.goto(TEAM);
    const current = (await figures(page))["Tämänhetkinen putki"] ?? "";
    const word = { V: "voitt", T: "tasapel", H: "tappio" }[last] ?? "";

    expect(letters).toMatch(/^[VTH]{5}$/);
    expect(current).toContain(word);
    // The Vire column sees only five matches, so it is a lower bound.
    expect(Number(/^(\d+)/.exec(current)?.[1])).toBeGreaterThanOrEqual(runInVire);
  });

  test("keeps every run inside the season's matches", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024");
    const played = Number(
      await page
        .locator("table tbody tr")
        .filter({ hasText: "Arsenal" })
        .locator("td:nth-child(3)")
        .textContent()
    );

    await page.goto(TEAM);
    const shown = await figures(page);

    for (const [label, value] of Object.entries(shown)) {
      const [, length, to] = /^(\d+)[^(]*?(?:Ottelut? \d+–?(\d+)?)?$/.exec(value) ?? [];
      if (length !== undefined) expect(Number(length), label).toBeLessThanOrEqual(played);
      if (to !== undefined) expect(Number(to), label).toBeLessThanOrEqual(played);
    }
  });

  test("names all five figures, and comes last in Analyysit", async ({ page }) => {
    await page.goto(TEAM);

    expect(Object.keys(await figures(page))).toEqual([
      "Tämänhetkinen putki",
      "Pisin voittoputki",
      "Pisin tappioton putki",
      "Pisin tappioputki",
      "Pisin voitoton putki",
    ]);
    await expect(
      page.getByRole("region", { name: "Analyysit" }).getByRole("heading", { level: 3 }).last()
    ).toHaveText(HEADING);
  });

  test("shows a Finnish league's streaks too", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2025");
    await page.locator("table tbody tr").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);

    expect((await figures(page))["Pisin voittoputki"]).toMatch(/^\d+ voitto/);
  });
});

test("sends no streak to a signed-out reader", async ({ page }) => {
  const response = await page.goto(TEAM);
  const html = (await response?.text()) ?? "";

  await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
  expect(html).not.toContain("Tämänhetkinen putki");
  expect(html).not.toContain("Pisin voittoputki");
});
