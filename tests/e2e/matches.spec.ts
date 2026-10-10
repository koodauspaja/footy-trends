import { expect, test } from "@playwright/test";

/**
 * The season-wide match list, end to end.
 *
 * decisions/005-listing-matches-for-selected-season.md
 * decisions/006-other-competitions.md
 * decisions/007-back-navigation.md
 * decisions/019-match-page.md
 * decisions/189-same-route-links.md
 */

test.describe("Season-wide match list", () => {
  test("shows the current round and navigates between rounds", async ({ page }) => {
    await page.goto("/ulkomaat/ottelut");

    await expect(page.getByRole("heading", { name: /Valioliiga/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Ottelu" })).toBeVisible();

    const heading = page.getByRole("heading", { level: 1 });
    const before = await heading.textContent();

    const nextLink = page.getByRole("link", { name: "Seuraava kierros ▶" });
    const prevLink = page.getByRole("link", { name: "◀ Edellinen kierros" });

    // Asserted, not assumed: with neither link present the test would click
    // nothing and fail on the unchanged heading, which reads as a navigation
    // bug and not as a page with no rounds to step between.
    const stepped = (await nextLink.count()) + (await prevLink.count());
    expect(stepped, "expected at least one round-navigation link").toBeGreaterThan(0);

    if (await nextLink.count()) {
      await nextLink.click();
    } else {
      await prevLink.click();
    }

    // The page must change, not just the URL. `next dev` cannot fail this: only
    // a production build can leave the page as it was.
    await expect(heading).not.toHaveText(before ?? "");
  });

  test("links a team name from the match list to its team page", async ({ page }) => {
    await page.goto("/ulkomaat/ottelut");

    // The `Ottelu` cell, not the row: the `Pvm` cell links to the match page,
    // so the row's first link is not a team.
    const firstTeamLink = page
      .locator("table tbody tr")
      .first()
      .locator("td")
      .nth(1)
      .getByRole("link")
      .first();
    const teamName = await firstTeamLink.textContent();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/ulkomaat\/joukkue\/\d+/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(teamName ?? "");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Pvm" })).toBeVisible();
  });

  test("falls back to the current round with a Finnish banner for an invalid kierros", async ({
    page,
  }) => {
    await page.goto("/ulkomaat/ottelut?kierros=999999");

    await expect(page.getByRole("status").first()).toContainText("Kierrosta ei löytynyt.");
  });

  test("shows a different competition's matches when kilpailu is set", async ({ page }) => {
    await page.goto("/ulkomaat/ottelut?kilpailu=BL1");

    await expect(page.getByRole("heading", { name: /Bundesliga/ })).toBeVisible();
  });

  test("links back to the standings for the same round", async ({ page }) => {
    await page.goto("/ulkomaat/ottelut?kierros=1");

    await page.getByRole("link", { name: "Sarjataulukkoon" }).click();

    await expect(page).toHaveURL(/\/ulkomaat\/sarjataulukko\?.*kierros=1/);
    await expect(page.getByRole("heading", { name: /Valioliiga/ })).toBeVisible();
  });
});
