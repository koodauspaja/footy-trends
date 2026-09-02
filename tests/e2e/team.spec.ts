import { expect, test } from "@playwright/test";

test.describe("Team match list", () => {
  test("a relegated club is told where it played instead of being unknown", async ({ page }) => {
    // Burnley were in the Championship in 2024/25.
    await page.goto("/ulkomaat/joukkue/328?kilpailu=PL&kausi=2024");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Burnley");
    await expect(
      page.locator("main").getByText("Joukkue ei pelannut tässä sarjassa tällä kaudella.")
    ).toBeVisible();

    await page.getByRole("link", { name: "Championship", exact: true }).click();

    await expect(page).toHaveURL(/kilpailu=ELC&kausi=2024/);
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
    // Reached by navigation rather than a hardcoded id, then stripped of its
    // parameters: before specs/020 the bare URL meant "Valioliiga, active
    // season", which served 20 of 315 stored team ids.
    //
    // It deliberately does not require the same heading as the parameterised
    // page: a Bundesliga club whose newest stored match is a Champions League
    // one should render that instead, and a test demanding otherwise would fail
    // on correct behaviour. The choice itself is verified against fixtures in
    // tests/integration/team-context.test.ts.
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
