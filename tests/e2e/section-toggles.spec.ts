import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { SESSION_COOKIE, storeSignedInReader } from "../support/e2e-session";
import { fold, isOpen } from "./folds";
import { waitForSession } from "./session";

/**
 * A page's sections fold, each starting as its kind of page has it, and a
 * signed-in reader's choices follow them to every page of that kind and to
 * another browser. jsdom has no `<details>` toggling, so only a browser shows it.
 *
 * decisions/071-section-toggles.md
 */

// A split season: three headed tables, so each folds.
const STANDINGS = "/kotimaa/sarjataulukko?kausi=2025";
// FC Inter, as bogey-teams.spec.ts has it.
const INTER = "/kotimaa/joukkue/60987";

// Whether each group inside `Analyysit` is open, in the page's order.
function groupsOpen(page: Page): Promise<boolean[]> {
  return fold(page, "Analyysit").evaluate((analytics) =>
    [...analytics.querySelectorAll("details")].map((group) => group.open)
  );
}

// Presses a fold's heading and waits for the server action saving its choice.
// The page has hydrated by then: a press before it is toggled by the browser
// alone, with nothing listening to save it.
async function toggleSaved(page: Page, details: Locator): Promise<void> {
  await waitForSession(page);
  const saved = page.waitForResponse(
    (response) => "next-action" in response.request().headers() && response.ok()
  );
  await details.locator(":scope > summary").click();
  await saved;
}

async function signIn(context: BrowserContext, cookie: string, url: string): Promise<void> {
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url }]);
}

// The top two clubs of the current Veikkausliiga table, read as elo.spec.ts
// reads one: each has `Muut kaudet`.
async function twoClubs(page: Page): Promise<[string, string]> {
  await page.goto("/kotimaa/sarjataulukko?kilpailu=VL");
  const rows = page.locator("table tbody tr");
  const club = async (row: number) =>
    (await rows.nth(row).getByRole("link").first().getAttribute("href")) ?? "";
  return [await club(0), await club(1)];
}

test.describe("For a reader with no stored choice", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("a standings page opens its tables and closes Analyysit, then opens only Tämä kausi", async ({
    page,
  }) => {
    await page.goto(STANDINGS);

    for (const table of ["Mestaruussarja", "Karsintasarja", "Runkosarja"]) {
      expect(await isOpen(fold(page, table)), table).toBe(true);
    }
    const analytics = fold(page, "Analyysit");
    expect(await isOpen(analytics)).toBe(false);

    await analytics.locator(":scope > summary").click();
    await expect(page.getByRole("heading", { name: "Tämä kausi", level: 3 })).toBeVisible();
    expect(await isOpen(fold(page, "Tämä kausi"))).toBe(true);
    expect(await isOpen(fold(page, "Kausi kaudelta"))).toBe(false);
    expect(await isOpen(fold(page, "Kilpailut rinnakkain"))).toBe(false);
  });

  test("a folded table hides its rows and shows them again", async ({ page }) => {
    await page.goto(STANDINGS);
    const table = fold(page, "Karsintasarja");

    await table.locator(":scope > summary").click();
    await expect(table.getByRole("table")).toBeHidden();
    await table.locator(":scope > summary").click();
    await expect(table.getByRole("table")).toBeVisible();
  });

  test("a team page opens its matches and closes Analyysit, then opens only its first group", async ({
    page,
  }) => {
    await page.goto(INTER);

    expect(await isOpen(fold(page, "Ottelut"))).toBe(true);
    const analytics = fold(page, "Analyysit");
    expect(await isOpen(analytics)).toBe(false);

    await analytics.locator(":scope > summary").click();
    const groups = await groupsOpen(page);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups).toEqual([true, ...groups.slice(1).map(() => false)]);
  });

  test("a fold opens and closes from the keyboard", async ({ page }) => {
    await page.goto(INTER);
    const analytics = fold(page, "Analyysit");

    await analytics.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => isOpen(analytics)).toBe(true);
    await page.keyboard.press("Space");
    await expect.poll(() => isOpen(analytics)).toBe(false);
  });

  test("a choice is not kept past a reload", async ({ page }) => {
    await page.goto(INTER);
    const analytics = fold(page, "Analyysit");

    await analytics.locator(":scope > summary").click();
    await expect.poll(() => isOpen(analytics)).toBe(true);

    await page.reload();
    expect(await isOpen(fold(page, "Analyysit"))).toBe(false);
  });
});

test.describe("Signed in", () => {
  let reader: Awaited<ReturnType<typeof storeSignedInReader>>;

  test.beforeEach(async () => {
    reader = await storeSignedInReader("user");
  });

  test.afterEach(async () => {
    await reader?.remove();
  });

  test("an opened Muut kaudet and a closed Ottelut hold on reload, on another club's page and in another browser", async ({
    page,
    browser,
    baseURL,
  }) => {
    const url = baseURL as string;
    await signIn(page.context(), reader.cookie, url);
    const [club, another] = await twoClubs(page);
    await page.goto(club);

    await toggleSaved(page, fold(page, "Analyysit"));
    const other = fold(page, "Muut kaudet");
    expect(await isOpen(other)).toBe(false);
    await toggleSaved(page, other);
    await toggleSaved(page, fold(page, "Ottelut"));

    const asLeft = async (on: Page) => {
      expect(await isOpen(fold(on, "Analyysit"))).toBe(true);
      expect(await isOpen(fold(on, "Muut kaudet"))).toBe(true);
      expect(await isOpen(fold(on, "Ottelut"))).toBe(false);
    };
    await page.reload();
    await asLeft(page);

    await page.goto(another);
    await asLeft(page);

    const second = await browser.newContext({ baseURL: url });
    try {
      await signIn(second, reader.cookie, url);
      const elsewhere = await second.newPage();
      await elsewhere.goto(club);
      await asLeft(elsewhere);
    } finally {
      await second.close();
    }
  });

  test("Back shows a fold as it was left, not as the page was first drawn", async ({
    page,
    baseURL,
  }) => {
    await signIn(page.context(), reader.cookie, baseURL as string);
    await page.goto(INTER);
    await toggleSaved(page, fold(page, "Analyysit"));

    await page.getByRole("link", { name: "Sarjataulukkoon" }).click();
    await expect(page).toHaveURL(/\/kotimaa\/sarjataulukko/);
    await page.goBack();
    await expect(page).toHaveURL(/\/kotimaa\/joukkue\/60987/);

    expect(await isOpen(fold(page, "Analyysit"))).toBe(true);
  });

  test("signed out again, the page starts from its defaults", async ({ page, baseURL }) => {
    const context = page.context();
    await signIn(context, reader.cookie, baseURL as string);
    await page.goto(INTER);
    await toggleSaved(page, fold(page, "Analyysit"));

    await context.clearCookies();
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
    await page.reload();

    expect(await isOpen(fold(page, "Analyysit"))).toBe(false);
  });
});
