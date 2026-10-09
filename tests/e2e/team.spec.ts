import { expect, test } from "@playwright/test";

/**
 * A club's page under Ulkomaat, end to end.
 *
 * decisions/004-listing-matches-for-selected-team.md
 * decisions/007-back-navigation.md
 * decisions/020-context-free-team-page.md
 * decisions/022-teams-between-tiers.md
 */

test.describe("Team match list", () => {
  test("a relegated club is told where it played instead of being unknown", async ({ page }) => {
    // Whoever is in the Championship this season is not in the Premier League
    // this season — read off the app rather than assuming a club id or a year.
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=ELC");
    const firstTeam = page.locator("table tbody tr").first().getByRole("link").first();
    const clubName = (await firstTeam.textContent())?.trim() ?? "";
    await firstTeam.click();
    await expect(page).toHaveURL(/\/ulkomaat\/joukkue\/\d+/);

    const url = new URL(page.url());
    const season = url.searchParams.get("kausi") ?? "";
    await page.goto(`${url.pathname}?kilpailu=PL&kausi=${season}`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(clubName);
    await expect(
      page.locator("main").getByText("Joukkue ei pelannut tässä sarjassa tällä kaudella.")
    ).toBeVisible();

    await page.locator("main").getByRole("link", { name: "Championship", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`kilpailu=ELC&kausi=${season}`));
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("clicking a team name navigates to its team page and shows the match list", async ({
    page,
  }) => {
    await page.goto("/ulkomaat/sarjataulukko");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    const teamName = await firstTeamLink.textContent();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/ulkomaat\/joukkue\/\d+/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(teamName ?? "");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Pvm" })).toBeVisible();
  });

  test("a bare team URL renders the team, not the region's default competition", async ({
    page,
  }) => {
    // Reached by navigation, not a hardcoded id, then stripped of its parameters. It
    // need not match the parameterised page's heading: a club whose newest stored match
    // is in another competition renders that one. See team-context.test.ts.
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=BL1");
    const firstTeam = page.locator("table tbody tr").first().getByRole("link").first();
    const teamName = await firstTeam.textContent();
    await firstTeam.click();
    await expect(page).toHaveURL(/\/ulkomaat\/joukkue\/\d+/);

    const bare = new URL(page.url()).pathname;
    await page.goto(bare);

    await expect(page).toHaveURL(bare);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText(teamName ?? "");
    await expect(heading).not.toContainText("Valioliiga");
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("a season alone resolves the competition of that season's matches", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=BL1&kausi=2024");
    await page.locator("table tbody tr").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/ulkomaat\/joukkue\/\d+/);

    const bare = new URL(page.url()).pathname;
    await page.goto(`${bare}?kausi=2024`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bundesliga 2024/25");
  });

  test("an unknown team id shows the reduced not-found page", async ({ page }) => {
    await page.goto("/ulkomaat/joukkue/999999999");

    await expect(page.getByRole("heading", { level: 1, name: "Joukkue" })).toBeVisible();
    await expect(page.locator("main").getByText("Joukkuetta ei löytynyt.")).toBeVisible();
    // No selector and no standings link for a competition it never played.
    await expect(page.getByLabel("Kausi")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sarjataulukkoon" })).toHaveCount(0);
  });

  test("clicking a team name for a non-default competition carries kilpailu to the team page", async ({
    page,
  }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=BL1");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    const teamName = await firstTeamLink.textContent();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/ulkomaat\/joukkue\/\d+\?kilpailu=BL1/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(teamName ?? "");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bundesliga");
  });

  test("links back to the standings for the current competition", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=BL1");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    await firstTeamLink.click();

    await page.getByRole("link", { name: "Sarjataulukkoon" }).click();

    await expect(page).toHaveURL(/\/ulkomaat\/sarjataulukko\?kilpailu=BL1/);
    await expect(page.getByRole("heading", { name: /Bundesliga/ })).toBeVisible();
  });
});
