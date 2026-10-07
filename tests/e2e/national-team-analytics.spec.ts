import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * `Analyysit` on a national-team page, end to end. Signed in the way league-position.spec.ts
 * explains. What unit tests cannot prove: it renders with no season and no selector, on both
 * teams, above the year list, and every string names the period this page has.
 *
 * decisions/041-national-team-analytics.md
 * decisions/046-comebacks-half-time-coverage.md
 */

const HUUHKAJAT = "/maajoukkueet/huuhkajat";
const HELMARIT = "/maajoukkueet/helmarit";
const POSITION = "Sijoitus kierroksittain";

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

function analytics(page: Page) {
  return page.getByRole("region", { name: "Analyysit" });
}

test.describe("National-team analytics, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  for (const [team, path] of [
    ["Huuhkajat", HUUHKAJAT],
    ["Helmarit", HELMARIT],
  ] as const) {
    test(`shows the panels ${team} can have, and never a league position`, async ({ page }) => {
      await page.goto(path);
      await analytics(page).waitFor();
      const panels = await analytics(page).getByRole("heading", { level: 4 }).allTextContents();

      expect(panels.length).toBeGreaterThan(0);
      // A friendly ranks nobody, so there is no table to read a position from.
      expect(panels).not.toContain(POSITION);
      expect(panels).toContain("Vire otteluittain");
      expect(panels).toContain("Putket");
    });
  }

  test("names its groups for what they cover, not for a season", async ({ page }) => {
    await page.goto(HUUHKAJAT);
    await analytics(page).waitFor();
    const groups = await analytics(page).getByRole("heading", { level: 3 }).allTextContents();

    // The middle group covers every match since 2018, so `Kausi kokonaisuutena`
    // would claim something untrue of it.
    expect(groups).toContain("Koko historia");
    expect(groups).toContain("Muut vuodet");
    expect(groups).not.toContain("Kausi kokonaisuutena");
    expect(groups).not.toContain("Muut kaudet");
  });

  test("compares a year rather than a season", async ({ page }) => {
    await page.goto(HUUHKAJAT);
    const comparison = page.getByRole("region", { name: "Tämä vuosi verrattuna" });
    await comparison.waitFor();

    // The baseline is the team's other calendar years.
    await expect(comparison.getByText(/Verrattuna \d+ muuhun vuoteen:/)).toBeVisible();
    // A page with no table can never fill this row, so it is dropped.
    await expect(comparison.locator("[data-part=row]", { hasText: "Sijoitus" })).toHaveCount(0);
    await expect(comparison.locator("[data-part=row]")).not.toHaveCount(0);
  });

  test("says how far back its records reach", async ({ page }) => {
    await page.goto(HUUHKAJAT);
    const records = page.getByRole("region", { name: "Ennätykset" });
    await records.waitFor();

    // A span of years, not a list of competitions: the records cross every
    // competition deliberately.
    await expect(records.getByText(/^\d{4}(–\d{4})?$/)).toBeVisible();
  });

  test("puts the section above the year list", async ({ page }) => {
    await page.goto(HUUHKAJAT);
    await analytics(page).waitFor();

    // The panels describe every year, so they cannot sit inside one.
    const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
    expect(headings[0]).toBe("Analyysit");
    expect(headings.slice(1).every((heading) => /^\d{4}$/.test(heading))).toBe(true);
  });

  for (const [team, path] of [
    ["Huuhkajat", HUUHKAJAT],
    ["Helmarit", HELMARIT],
  ] as const) {
    test(`shows ${team}'s comebacks as the note or the figures, never both (specs/046)`, async ({
      page,
    }) => {
      // Which one depends on how many half-time scores TASO holds for these
      // internationals, which is not this test's to know. The 40 % rule is pinned
      // by the unit tests; this proves the page shows one outcome of it, whole.
      await page.goto(path);
      const panel = analytics(page).getByRole("region", { name: "Kääntyneet ottelut" });
      await panel.waitFor();

      const note = await panel
        .getByText(
          /^Puoliaikatulos on tiedossa vain \d+ ottelusta, kun otteluita on \d+\. Kääntyneitä otteluita ei lasketa\.$/
        )
        .count();
      // The figures branch shows each direction exactly once: its total, or
      // the line saying it has no match yet. Named rather than counted, so an
      // empty or stray list cannot pass for the figures.
      const directions = [
        [/^Tappioasemassa puoliajalla\d+ ottelua?$/, "Ei vielä otteluita tappioasemasta."],
        [/^Johdossa puoliajalla\d+ ottelua?$/, "Ei vielä otteluita johtoasemasta."],
      ] as const;
      const shown = await Promise.all(
        directions.map(async ([total, none]) => {
          const totals = await panel.locator("dl > div").filter({ hasText: total }).count();
          const empties = await panel.getByText(none, { exact: true }).count();
          return totals + empties;
        })
      );

      if (note > 0) {
        // The note replaces the figures entirely.
        expect(note).toBe(1);
        expect(shown).toEqual([0, 0]);
      } else {
        expect(shown).toEqual([1, 1]);
      }
      await expect(page.getByText("tälle kaudelle")).toHaveCount(0);
    });
  }
});

test("sends no national-team analytics value to a signed-out reader", async ({ page }) => {
  const response = await page.goto(HUUHKAJAT);
  const html = (await response?.text()) ?? "";

  // The section and its sign-in prompt are shown, as on a club page; what a
  // signed-out reader must not get is any panel or any computed value.
  await expect(page.getByRole("heading", { name: "Vire otteluittain" })).toHaveCount(0);
  expect(html).not.toContain("Vire otteluittain");
  expect(html).not.toContain("Putket");
  expect(html).not.toContain("Tämä vuosi verrattuna");
});
