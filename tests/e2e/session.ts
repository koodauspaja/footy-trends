import { expect, type Page } from "@playwright/test";

/**
 * A signed-in browser, without a real Google sign-in.
 *
 * Google blocks automated browsers outright, so every signed-in path is driven
 * by intercepting `/api/auth/get-session` — the technique
 * specs/023-google-oauth-login.md established and specs/024-account-settings.md
 * reuses. It reaches everything the *client* renders from the session: the
 * header, the account menu, the start-page redirect. It does not reach a page
 * that reads the session on the server, which sees no cookie and renders the
 * signed-out view; `tests/e2e/settings.spec.ts` documents that boundary.
 *
 * Shared rather than copied because it was already written twice, in
 * `auth.spec.ts` and `settings.spec.ts`, and a third copy landed in the
 * dark-mode sweep — three chances for the fake session to drift from what
 * better-auth actually answers.
 */
export async function signedInAs(
  page: Page,
  name: string,
  defaultRegion: string | null = null
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
      }),
    });
  });
}

/**
 * Waits until the session has actually resolved in the browser.
 *
 * Without this, `toHaveURL` matches on the first check — before the redirect
 * has had a chance to fire — so a test asserting "no redirect happened" passes
 * whether or not the escape hatch works. Verified: removing the suppression
 * check leaves those assertions green until this wait is added.
 */
export async function waitForSession(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /^Tili:/ })).toBeVisible();
}

/**
 * `Kirjaudu ulos` and `Asetukset` moved into the account menu in
 * specs/024-account-settings.md, so every signed-in assertion opens it first.
 */
export async function openAccountMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Tili:/ }).click();
}
