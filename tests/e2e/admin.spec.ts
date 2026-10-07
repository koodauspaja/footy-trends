import { expect, test } from "@playwright/test";

/**
 * The admin area from the outside: signed out, `/yllapito` answers with the generic
 * not-found page, whose body names nothing. The suite forges no session, so what is
 * behind the gate is covered by the unit and integration tests.
 *
 * decisions/028-admin-tools-and-roles.md
 * decisions/029-forced-season-refresh.md
 */

test.describe("the admin area", () => {
  test("gives a signed-out visitor the not-found page, naming nothing", async ({ page }) => {
    await page.goto("/yllapito");

    // The body is what has to give nothing away. The status is 200, not 404:
    // Next commits it before `notFound()` is caught whenever the response
    // streams.
    const body = await page.content();
    expect(body).not.toContain("Ylläpito");
    expect(body).not.toContain("Käyttäjät");
    expect(body).not.toContain("Sähköposti");
    expect(new URL(page.url()).pathname).toBe("/yllapito");
  });

  test("does not offer the link to a signed-out visitor", async ({ page }) => {
    // The home page renders the header for everyone; a signed-out visitor sees
    // the sign-in control and no account menu at all.
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Ylläpito" })).toHaveCount(0);
  });
});

// `/yllapito/data`, from the outside only, for the same reason. Driving the
// signed-in path would also call both providers for real from a test run.
test.describe("the forced season refresh", () => {
  test("gives a signed-out visitor the not-found page, naming nothing", async ({ page }) => {
    await page.goto("/yllapito/data");

    const body = await page.content();
    expect(body).not.toContain("Kauden uudelleenhaku");
    expect(body).not.toContain("Hae muutokset");
    expect(body).not.toContain("Aiemmat päivitykset");
    expect(new URL(page.url()).pathname).toBe("/yllapito/data");
  });

  test("redirects the English spelling to the Finnish one", async ({ page }) => {
    // Paired with the rewrite, as `/admin` is: leaving the folder path
    // answering 200 would make this the one route reachable under two
    // spellings.
    await page.goto("/admin/data");

    expect(new URL(page.url()).pathname).toBe("/yllapito/data");
  });
});
