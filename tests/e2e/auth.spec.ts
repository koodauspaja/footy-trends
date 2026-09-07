import { expect, type Page, test } from "@playwright/test";

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

    // Against the configured value, not merely non-empty: a truthy check passes
    // even when a different client id is wired in. `.env` is loaded by
    // global-setup, and CI sets the dummy literal from the workflow.
    expect(url.searchParams.get("client_id")).toBe(process.env.GOOGLE_CLIENT_ID);
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

/**
 * A signed-in header, without signing in.
 *
 * The session is read by the browser from `/api/auth/get-session`, so
 * intercepting that one response renders the signed-in header for real — layout
 * included. This tests **our component**, not Google's flow: nothing here
 * proves a real sign-in works, and the acceptance criteria still call for a
 * human to confirm that.
 */
async function signedInAs(page: Page, name: string) {
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
      }),
    });
  });
}

const WIDTH = 320;

test.describe("Narrow viewports", () => {
  // jsdom has no layout, so this overflow is only observable in a real browser.
  // The header used to be one non-wrapping row: a long display name pushed
  // `Kirjaudu ulos` off a phone screen entirely.
  test.use({ viewport: { width: WIDTH, height: 640 } });

  test("keeps sign-out on screen next to a long display name", async ({ page }) => {
    await signedInAs(page, "Matti-Pekka Meikäläinen-Virtanen");
    await page.goto("/maajoukkueet/sarjataulukko");

    const button = page.getByRole("button", { name: "Kirjaudu ulos" });
    await expect(button).toBeVisible();

    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    // Fully inside the viewport, not clipped at either edge.
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(WIDTH);
  });

  test("does not scroll the page sideways for a long display name", async ({ page }) => {
    await signedInAs(page, "Matti-Pekka Meikäläinen-Virtanen");
    await page.goto("/maajoukkueet/sarjataulukko");

    await expect(page.getByRole("button", { name: "Kirjaudu ulos" })).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );

    expect(overflows).toBe(false);
  });

  test("keeps the breadcrumb and sign-in on screen when signed out", async ({ page }) => {
    await page.goto("/maajoukkueet/sarjataulukko");

    await expect(page.getByRole("button", { name: "Kirjaudu sisään" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Maajoukkueet" })).toBeVisible();
  });
});

test.describe("A signed-in header", () => {
  test("shows the reader's name and offers sign-out", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen");
    await page.goto("/ulkomaat");

    await expect(page.getByText("Matti Meikäläinen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Kirjaudu ulos" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kirjaudu sisään" })).toHaveCount(0);
  });
});

/**
 * #266: after a cancelled sign-in the reader sits on `?error=auth`, and the
 * callback URL we handed Google carried that error along — so a successful
 * sign-in returned them to their own failure message.
 *
 * Asserted on the request we send, which is where the bug actually lived. The
 * round trip through Google cannot be automated, but what we ask for can.
 */
test.describe("A spent sign-in error", () => {
  async function callbackUrlFor(page: Page, path: string): Promise<string | undefined> {
    let body: { callbackURL?: string } | undefined;

    await page.route("**/api/auth/sign-in/social", async (route) => {
      body ??= route.request().postDataJSON();
      await route.abort();
    });

    await page.goto(path);
    await page.getByRole("button", { name: "Kirjaudu sisään" }).click();
    await expect.poll(() => body).not.toBeUndefined();

    return body?.callbackURL;
  }

  test("is not carried back through a successful sign-in", async ({ page }) => {
    await page.goto("/?error=auth");
    // The notice is right to be here — this attempt did fail.
    await expect(page.getByText("Kirjautuminen epäonnistui. Yritä uudelleen.")).toBeVisible();

    expect(await callbackUrlFor(page, "/?error=auth")).toBe("/");
  });

  test("is dropped without losing the page's own state", async ({ page }) => {
    const callbackURL = await callbackUrlFor(
      page,
      "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026&error=auth"
    );

    expect(callbackURL).toContain("kilpailu=VL");
    expect(callbackURL).toContain("kausi=2026");
    expect(callbackURL).not.toContain("error");
  });

  test("leaves no notice at the end of the issue's repro steps", async ({ page }) => {
    // Step 5, assembled from the two halves rather than asserted at a
    // hardcoded URL: where we actually ask Google to return the reader, then
    // that page as a signed-in reader. Navigating to a fixed "/" would pass
    // whether or not the callback still carried the error, which is the whole
    // thing under test.
    const callbackURL = await callbackUrlFor(page, "/?error=auth");
    await signedInAs(page, "Matti Meikäläinen");
    await page.goto(callbackURL ?? "/");

    await expect(page.getByRole("button", { name: "Kirjaudu ulos" })).toBeVisible();
    await expect(page.getByText(/Kirjautuminen epäonnistui/)).toHaveCount(0);
  });
});
