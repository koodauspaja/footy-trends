import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { SESSION_COOKIE, storeSignedInReader } from "../support/e2e-session";
import { expectedStatus, isAdminPage, UX_PAGES } from "../support/ux-pages";

/**
 * Every kind of page in eight views: 375 px and 1 024 px, light and dark,
 * signed in and out. Screenshots in slices a reader can see whole, and how far
 * each view scrolls sideways, under `ux-screenshots/`.
 *
 * decisions/695-ux-sweep.md
 */

const OUT = "ux-screenshots";
const SLICE = 1_600;

const VIEWS = [375, 1024].flatMap((width) =>
  (["light", "dark"] as const).flatMap((scheme) =>
    [true, false].map((signedIn) => ({ width, scheme, signedIn }))
  )
);

async function shoot(page: Page, name: string): Promise<number> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const width = page.viewportSize()?.width ?? 0;
  const slices = Math.max(1, Math.ceil(height / SLICE));
  for (let slice = 0; slice < slices; slice += 1) {
    const y = slice * SLICE;
    await page.screenshot({
      path: join(OUT, `${name}-${String(slice + 1).padStart(2, "0")}.png`),
      fullPage: true,
      clip: { x: 0, y, width, height: Math.min(SLICE, height - y) },
    });
  }
  return slices;
}

// The admin page for the admin, every other page for a reader.
async function signIn(context: BrowserContext, cookie: string, url: string) {
  await context.clearCookies({ name: SESSION_COOKIE });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url }]);
}

test("every page in every view", async ({ browser, baseURL }) => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const url = baseURL as string;
  const report: Record<string, unknown>[] = [];
  const failed: string[] = [];
  let reader: Awaited<ReturnType<typeof storeSignedInReader>> | undefined;
  let admin: Awaited<ReturnType<typeof storeSignedInReader>> | undefined;

  try {
    reader = await storeSignedInReader("user");
    admin = await storeSignedInReader("admin");
    for (const view of VIEWS) {
      const context = await browser.newContext({
        baseURL: url,
        viewport: { width: view.width, height: 900 },
        colorScheme: view.scheme,
      });
      const page = await context.newPage();
      for (const [name, path] of UX_PAGES) {
        const file = `${name}-${view.width}-${view.scheme}-${view.signedIn ? "in" : "out"}`;
        try {
          const signedIn = (isAdminPage(name) ? admin : reader) as NonNullable<typeof reader>;
          if (view.signedIn) await signIn(context, signedIn.cookie, url);
          const response = await page.goto(path);
          await page.waitForLoadState("networkidle");
          const sideways = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          );
          const status = response?.status();
          const slices = await shoot(page, file);
          report.push({ file, path, status, sideways, slices });
          if (status !== expectedStatus(name)) failed.push(`${file}: ${status}`);
          // A signed-in view whose header does not name the reader was signed out.
          const named = await page.getByText(signedIn.name, { exact: true }).count();
          if (view.signedIn && named === 0) failed.push(`${file}: not signed in`);
        } catch (error) {
          // Recorded, and the sweep goes on to the next view.
          report.push({ file, path, error: String(error) });
          failed.push(`${file}: ${String(error)}`);
        }
      }
      await context.close();
    }
  } finally {
    writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    await reader?.remove();
    await admin?.remove();
  }

  expect(failed).toEqual([]);
});
