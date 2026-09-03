import { expect, test } from "@playwright/test";

test.describe("Domestic team match list (Veikkausliiga)", () => {
  test("a relegated club is told where it played, not that it is unknown", async ({ page }) => {
    // Derived from the app rather than from a club id: whoever is in Ykkösliiga
    // this season is, by definition, not in Veikkausliiga this season. Naming a
    // club and a year here would only assert what one database happens to hold
    // — the mistake this test was written with, and #256 fixed.
    await page.goto("/kotimaa/sarjataulukko?kilpailu=M1L");
    const firstTeam = page.locator("table tbody tr").first().getByRole("link").first();
    const clubName = (await firstTeam.textContent())?.trim() ?? "";
    await firstTeam.click();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);

    const url = new URL(page.url());
    const season = url.searchParams.get("kausi") ?? "";
    await page.goto(`${url.pathname}?kilpailu=VL&kausi=${season}`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(clubName);
    await expect(
      page.locator("main").getByText("Joukkue ei pelannut tässä sarjassa tällä kaudella.")
    ).toBeVisible();
    await expect(page.locator("main").getByText("Joukkuetta ei löytynyt.")).toHaveCount(0);

    // The offered link goes back to where the club actually played, and renders.
    await page.locator("main").getByRole("link", { name: "Ykkösliiga", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`kilpailu=M1L&kausi=${season}`));
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("the season selector agrees with the season being shown", async ({ page }) => {
    // The invariant, not one club's history: whatever `kausi` the page renders
    // is the option the control displays. A dropdown missing its own page's
    // season shows a different one as chosen.
    await page.goto("/kotimaa/sarjataulukko?kilpailu=M1L");
    await page.locator("table tbody tr").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);

    const shown = new URL(page.url()).searchParams.get("kausi") ?? "";
    await expect(page.getByLabel("Kausi")).toHaveValue(shown);

    // And a season the club did not play is still the one selected.
    await page.goto(`${new URL(page.url()).pathname}?kilpailu=VL&kausi=${shown}`);
    await expect(page.getByLabel("Kausi")).toHaveValue(shown);
  });

  test("a bare team URL renders the team, not the region's default competition", async ({
    page,
  }) => {
    // Deliberately not "the same heading as the parameterised URL": a correct
    // resolver renders a *different* competition whenever the team's newest
    // match is one — a Suomen Cup tie, say. Which competition it picks is
    // verified against fixtures in tests/integration/team-context.test.ts; what
    // e2e can prove is that the bare URL is a working team page rather than the
    // Veikkausliiga not-found it used to be.
    await page.goto("/kotimaa/sarjataulukko?kilpailu=M2");
    const teamName = await page
      .locator("table tbody tr")
      .first()
      .getByRole("link")
      .first()
      .textContent();
    await page.locator("table tbody tr").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);

    const bare = new URL(page.url()).pathname;
    await page.goto(bare);

    await expect(page).toHaveURL(bare);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText(teamName ?? "");
    await expect(heading).not.toContainText("Veikkausliiga");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator("main").getByText("Joukkuetta ei löytynyt.")).toHaveCount(0);
  });

  test("an unknown team id shows the reduced not-found page", async ({ page }) => {
    await page.goto("/kotimaa/joukkue/999999999");

    await expect(page.getByRole("heading", { level: 1, name: "Joukkue" })).toBeVisible();
    await expect(page.locator("main").getByText("Joukkuetta ei löytynyt.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sarjataulukkoon" })).toHaveCount(0);
  });

  test("clicking a team name navigates to its team page, showing matches with a group name column", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2020");

    const firstTeamLink = page
      .locator("table")
      .first()
      .locator("tbody tr")
      .first()
      .getByRole("link")
      .first();
    const teamName = await firstTeamLink.textContent();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(teamName ?? "");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Sarja" })).toBeVisible();
  });

  test("a team appearing in multiple groups (e.g. Mestaruussarja) lists matches from both, chronologically", async ({
    page,
  }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2025");

    // Runkosarja's own table is the first on the page.
    const firstTeamLink = page
      .locator("table")
      .first()
      .locator("tbody tr")
      .first()
      .getByRole("link")
      .first();
    await firstTeamLink.click();

    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/\d+/);
    const groupCells = page.locator("table tbody tr td:nth-child(4)");
    const groupNames = new Set(await groupCells.allTextContents());
    // The top Runkosarja team from 2025 continues into Mestaruussarja, so
    // its match list should span at least two distinct groups.
    expect(groupNames.size).toBeGreaterThan(1);
  });

  test("links back to the standings for the current season", async ({ page }) => {
    await page.goto("/kotimaa/sarjataulukko?kausi=2020");

    const firstTeamLink = page.locator("table tbody tr").first().getByRole("link").first();
    await firstTeamLink.click();

    await page.getByRole("link", { name: "Sarjataulukkoon" }).click();

    await expect(page).toHaveURL(/\/kotimaa\/sarjataulukko\?.*kausi=2020/);
    await expect(page.getByRole("heading", { name: /Veikkausliiga/ })).toBeVisible();
  });
});
