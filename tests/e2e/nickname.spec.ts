import { randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { e2eAppPort } from "../../scripts/e2e-target";
import { SESSION_COOKIE, storeSignedInReader } from "../support/e2e-session";

/**
 * The nickname as a user meets it on `/asetukset`, and the admin clearing one.
 * Names carry the run's port and a random part, so concurrent runs never collide.
 * Messages are found by text: Next's route announcer is an empty `role="alert"`.
 *
 * decisions/077-nickname.md
 */

const PORT = e2eAppPort(process.env);

function uniqueName(prefix: string): string {
  return `${prefix}${PORT}${randomUUID().slice(0, 4)}`;
}

async function signedInPage(browser: Browser, cookie: string, baseURL: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: baseURL }]);
  return context.newPage();
}

async function saveNickname(page: Page, value: string) {
  await page.getByLabel("Nimimerkki").fill(value);
  await page.getByRole("button", { name: "Tallenna nimimerkki" }).click();
}

test.describe("the nickname on /asetukset", () => {
  let reader: Awaited<ReturnType<typeof storeSignedInReader>>;
  let rival: Awaited<ReturnType<typeof storeSignedInReader>>;

  test.beforeAll(async () => {
    reader = await storeSignedInReader("user");
    rival = await storeSignedInReader("user");
  });

  test.afterAll(async () => {
    await reader?.remove();
    await rival?.remove();
  });

  test("is set, refused, changed and removed, and kept across a reload", async ({
    browser,
    baseURL,
  }) => {
    const page = await signedInPage(browser, reader.cookie, baseURL as string);
    await page.goto("/asetukset");
    await expect(page.getByRole("heading", { name: "Nimimerkki", level: 2 })).toBeVisible();
    await expect(page.getByLabel("Nimimerkki")).toHaveValue("");

    const name = uniqueName("Kalle");
    await saveNickname(page, `  ${name}  `);
    await expect(page.getByText("Nimimerkki tallennettu.")).toBeVisible();
    await expect(page.getByLabel("Nimimerkki")).toHaveValue(name);

    await saveNickname(page, "ab");
    await expect(page.getByText("Nimimerkin pituus on 3–20 merkkiä.")).toBeVisible();
    await saveNickname(page, "Iso Paska");
    await expect(page.getByText("Valitse toinen nimimerkki.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Nimimerkki")).toHaveValue(name);

    await saveNickname(page, `${name}B`);
    await expect(page.getByText("Nimimerkki tallennettu.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Nimimerkki")).toHaveValue(`${name}B`);

    await saveNickname(page, "");
    await expect(page.getByText("Nimimerkki poistettu.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Nimimerkki")).toHaveValue("");
    await page.context().close();
  });

  test("refuses a name another user holds, in another case", async ({ browser, baseURL }) => {
    const name = uniqueName("Sama");
    const rivalPage = await signedInPage(browser, rival.cookie, baseURL as string);
    await rivalPage.goto("/asetukset");
    await saveNickname(rivalPage, name);
    await expect(rivalPage.getByText("Nimimerkki tallennettu.")).toBeVisible();

    const page = await signedInPage(browser, reader.cookie, baseURL as string);
    await page.goto("/asetukset");
    await saveNickname(page, name.toUpperCase());
    await expect(page.getByText("Nimimerkki on jo käytössä.")).toBeVisible();

    await rivalPage.context().close();
    await page.context().close();
  });
});

test.describe("the admin clearing a nickname", () => {
  let admin: Awaited<ReturnType<typeof storeSignedInReader>>;
  let reader: Awaited<ReturnType<typeof storeSignedInReader>>;

  test.beforeAll(async () => {
    admin = await storeSignedInReader("admin");
    reader = await storeSignedInReader("user");
  });

  test.afterAll(async () => {
    await admin?.remove();
    await reader?.remove();
  });

  test("shows the nickname in the user table and clears it once confirmed", async ({
    browser,
    baseURL,
  }) => {
    const name = uniqueName("Tyhj");
    const readerPage = await signedInPage(browser, reader.cookie, baseURL as string);
    await readerPage.goto("/asetukset");
    await saveNickname(readerPage, name);
    await expect(readerPage.getByText("Nimimerkki tallennettu.")).toBeVisible();

    const page = await signedInPage(browser, admin.cookie, baseURL as string);
    await page.goto("/yllapito");
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Tyhjennä nimimerkki" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Tyhjennetäänkö käyttäjän");
    await dialog.getByRole("button", { name: "Tyhjennä nimimerkki" }).click();
    await expect(page.getByText("Nimimerkki tyhjennetty.")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);

    await readerPage.reload();
    await expect(readerPage.getByLabel("Nimimerkki")).toHaveValue("");
    await readerPage.context().close();
    await page.context().close();
  });
});
