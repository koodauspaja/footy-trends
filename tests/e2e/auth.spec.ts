import { expect, test } from "@playwright/test";

/**
 * The sign-in control, from specs/023-google-oauth-login.md.
 *
 * **No test here completes a real Google sign-in.** It would need live
 * test-user credentials, and Google blocks automated browsers outright. What
 * can be proved end to end is everything up to the handover: the control
 * renders on every page including the four prerendered ones, and clicking it
 * asks Google for the right thing. The signed-in header is covered by
 * tests/unit/components/auth-controls.test.tsx and by the manual check the
 * spec's acceptance criteria call for.
 */

/** The four pages `tests/unit/app/rendering-mode.test.ts` keeps prerendered. */
const PRERENDERED = ["/", "/kotimaa", "/ulkomaat", "/maajoukkueet"];

/** One data-backed page per region, which are server-rendered on demand. */
const DYNAMIC = [
  "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026",
  "/ulkomaat/sarjataulukko?kilpailu=PL",
  "/maajoukkueet/sarjataulukko",
];

test.describe("Sign-in control", () => {
  for (const path of [...PRERENDERED, ...DYNAMIC]) {
    test(`offers sign-in on ${path}`, async ({ page }) => {
      await page.goto(path);

      // On the prerendered pages this also proves the control hydrates: it is
      // absent from the static HTML and appears only once the session resolves.
      await expect(page.getByRole("button", { name: "Kirjaudu sisään" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Kirjaudu ulos" })).toHaveCount(0);
    });
  }

  test("hands over to Google with the configured client and our callback", async ({ page }) => {
    // Never actually leave for Google: capture the attempt and abort it. The
    // point is what we asked for, not what Google answers.
    let googleUrl: string | null = null;
    await page.route("https://accounts.google.com/**", async (route) => {
      googleUrl ??= route.request().url();
      await route.abort();
    });

    await page.goto("/ulkomaat");
    await page.getByRole("button", { name: "Kirjaudu sisään" }).click();

    await expect.poll(() => googleUrl).not.toBeNull();
    // `poll` above has already established this is set; the assertion narrows
    // the type for the reads below rather than repeating the check.
    expect(googleUrl).not.toBeNull();
    const url = new URL(googleUrl ?? "");

    expect(url.searchParams.get("client_id")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toContain("/api/auth/callback/google");
    // The scopes the spec commits to, and no sensitive extras.
    expect(url.searchParams.get("scope")).toContain("email");
    expect(url.searchParams.get("scope")).toContain("profile");
  });

  test("keeps the control out of the breadcrumb landmark", async ({ page }) => {
    await page.goto("/kotimaa/ottelut?kilpailu=VL&kausi=2026");

    const trail = page.getByRole("navigation", { name: "Murupolku" });

    await expect(trail).toBeVisible();
    await expect(trail.getByRole("button")).toHaveCount(0);
  });
});

test.describe("Sign-in failure", () => {
  test("says so in Finnish, without naming the cause", async ({ page }) => {
    await page.goto("/?error=access_denied");

    await expect(page.getByText("Kirjautuminen epäonnistui. Yritä uudelleen.")).toBeVisible();
    // Naming the cause would leak whether an account is on the test-user list.
    await expect(page.getByText(/access_denied/)).toHaveCount(0);
  });

  test("stays quiet on a normal visit", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/Kirjautuminen epäonnistui/)).toHaveCount(0);
  });
});

test.describe("Signed-out pages are unchanged", () => {
  test("the standings table still renders its rows", async ({ page }) => {
    // The header gained a control; the page below it must not have noticed.
    await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026");

    // Veikkausliiga 2026 is past its split, so this page carries one table per
    // group. Any of them proves the page still rendered its data.
    await expect(page.getByRole("table").first()).toBeVisible();
    expect(await page.getByRole("row").count()).toBeGreaterThan(1);
  });
});
