import { expect, type Page } from "@playwright/test";

/**
 * A signed-in browser without a real Google sign-in, which Google blocks for an
 * automated browser: `/api/auth/get-session` is intercepted. That reaches what the
 * client renders from the session, and not a page that reads it on the server.
 *
 * decisions/023-google-oauth-login.md
 * decisions/024-account-settings.md
 * decisions/269-colour-roles.md
 */
export async function signedInAs(
  page: Page,
  name: string,
  defaultRegion: string | null = null,
  /**
   * The favourite keys `customSession` adds. The star is a client component, so
   * unlike `/asetukset` this interception reaches what it renders.
   */
  favourites: { teams?: string[]; competitions?: string[] } = {}
): Promise<void> {
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: {
          id: "e2e-session",
          token: "e2e-token",
          userId: "e2e-user",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
        user: {
          id: "e2e-user",
          name,
          email: "e2e@example.com",
          emailVerified: true,
          image: null,
        },
        defaultRegion,
        favoriteTeams: favourites.teams ?? [],
        favoriteCompetitions: favourites.competitions ?? [],
      }),
    });
  });
}

/**
 * Waits until the session has resolved in the browser. Without it `toHaveURL`
 * matches on the first check, before a redirect could fire, so
 * "no redirect happened" would pass whether or not the escape hatch works.
 *
 * decisions/024-account-settings.md
 */
export async function waitForSession(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /^Tili:/ })).toBeVisible();
}

/**
 * Opens the account menu, where `Kirjaudu ulos` and `Asetukset` live: every
 * signed-in assertion opens it first.
 *
 * decisions/024-account-settings.md
 * decisions/269-colour-roles.md
 */
export async function openAccountMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Tili:/ }).click();
}
