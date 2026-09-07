import { expect, type Page, test } from "@playwright/test";

/**
 * The account settings page, from specs/024-account-settings.md.
 *
 * A real Google sign-in still cannot be automated, so the signed-in cases
 * intercept `/api/auth/get-session` — the same technique specs/023 established.
 * That covers what the page renders and how it behaves; it does not cover the
 * round trip through Google, which stays a human check on staging.
 */
/**
 * Waits until the session has actually resolved in the browser.
 *
 * Without this, `toHaveURL` matches on the first check — before the redirect
 * has had a chance to fire — so a test asserting "no redirect happened" passes
 * whether or not the escape hatch works. Verified: removing the suppression
 * check leaves those assertions green until this wait is added.
 */
async function waitForSession(page: Page) {
  await expect(page.getByRole("button", { name: /^Tili:/ })).toBeVisible();
}

async function signedInAs(page: Page, name: string, defaultRegion: string | null = null) {
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

test.describe("Settings, signed out", () => {
  test("explains itself instead of redirecting", async ({ page }) => {
    await page.goto("/asetukset");

    // No redirect and no middleware: the page renders and says why it is empty.
    await expect(page).toHaveURL(/\/asetukset$/);
    await expect(page.getByRole("heading", { name: "Asetukset" })).toBeVisible();
    await expect(page.getByText("Kirjaudu sisään nähdäksesi asetuksesi.")).toBeVisible();
  });

  test("shows no preferences, devices or deletion controls", async ({ page }) => {
    await page.goto("/asetukset");

    await expect(page.getByText("Aloitusnäkymä")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Poista tili" })).toHaveCount(0);
  });

  test("is reachable on the Finnish URL, and the English one redirects", async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/asetukset$/);
  });
});

/**
 * **The signed-in page body is not covered here, deliberately.**
 *
 * `/asetukset` reads its session on the *server*, so intercepting the browser's
 * `/api/auth/get-session` — the technique that works for the header — does not
 * reach it: the server sees no cookie and renders the prompt. A test written
 * that way would assert against the signed-out page while claiming to test the
 * signed-in one, which is worse than no test.
 *
 * Forging a signed session cookie is possible but would encode better-auth's
 * cookie-signing internals into the suite. So the form, the device list and the
 * deletion control are covered by
 * `tests/unit/components/settings-page.test.tsx`, and the real thing is a human
 * check on staging — the same gap specs/023 documented.
 *
 * What follows is everything that genuinely can be driven end to end: the
 * signed-out page, the account menu, and the client-side start-page redirect.
 */
test.describe("The account menu", () => {
  test("reaches the settings page", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen");
    await page.goto("/ulkomaat");

    await page.getByRole("button", { name: /^Tili:/ }).click();
    await page.getByRole("link", { name: "Asetukset" }).click();

    await expect(page).toHaveURL(/\/asetukset$/);
  });
});

test.describe("A stored start page", () => {
  test("opens the reader's region instead of the picker", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen", "kotimaa");
    await page.goto("/");

    await expect(page).toHaveURL(/\/kotimaa$/);
  });

  test("never makes the region picker unreachable", async ({ page }) => {
    // The escape hatch. Without it a reader with a start page could not reach
    // the picker by clicking at all.
    await signedInAs(page, "Matti Meikäläinen", "kotimaa");
    await page.goto("/?valitse=1");
    await waitForSession(page);

    await expect(page).toHaveURL(/\/\?valitse=1$/);
    await expect(page.getByRole("heading", { name: "Valitse alue" })).toBeVisible();
  });

  test("is reachable by clicking Etusivu, not only by typing a URL", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen", "kotimaa");
    await page.goto("/ulkomaat");

    await waitForSession(page);
    await page.getByRole("link", { name: "Etusivu" }).click();
    await waitForSession(page);

    await expect(page).toHaveURL(/valitse=1$/);
    await expect(page.getByRole("heading", { name: "Valitse alue" })).toBeVisible();
  });

  test("leaves a reader without one on the picker", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen", null);
    await page.goto("/");
    await waitForSession(page);

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Valitse alue" })).toBeVisible();
  });
});
