import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { UX_PAGES } from "../support/ux-pages";

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

test("every page in every view", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const report: Record<string, unknown>[] = [];

  for (const view of VIEWS) {
    const context = await browser.newContext({
      viewport: { width: view.width, height: 900 },
      colorScheme: view.scheme,
      extraHTTPHeaders: view.signedIn ? { [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN } : {},
    });
    const page = await context.newPage();
    for (const [name, path] of UX_PAGES) {
      const response = await page.goto(path);
      await page.waitForLoadState("networkidle");
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      const file = `${name}-${view.width}-${view.scheme}-${view.signedIn ? "in" : "out"}`;
      const slices = await shoot(page, file);
      report.push({ file, path, status: response?.status(), sideways, slices });
    }
    await context.close();
  }

  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
});
