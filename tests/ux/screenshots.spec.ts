import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * Every kind of page in eight views: 375 px and 1 024 px, light and dark,
 * signed in and out. Screenshots in slices a reader can see whole, and how far
 * each view scrolls sideways, under `ux-screenshots/`.
 *
 * decisions/695-ux-sweep.md
 */

const OUT = "ux-screenshots";
const SLICE = 1_600;

/** Each page by a short name; the e2e stand-in's data is on every one. */
const PAGES: ReadonlyArray<readonly [string, string]> = [
  ["front", "/"],
  ["domestic", "/kotimaa"],
  ["foreign", "/ulkomaat"],
  ["national", "/maajoukkueet"],
  ["vl-standings", "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026"],
  ["vl-2017-knockout", "/kotimaa/sarjataulukko?kausi=2017"],
  ["msc-standings", "/kotimaa/sarjataulukko?kilpailu=MSC&kausi=2025"],
  ["liigacup-standings", "/kotimaa/sarjataulukko?kilpailu=LC&kausi=2023"],
  ["pl-standings", "/ulkomaat/sarjataulukko?kilpailu=PL"],
  ["pl-2024-standings", "/ulkomaat/sarjataulukko?kilpailu=PL&kausi=2024"],
  ["cl-standings", "/ulkomaat/sarjataulukko?kilpailu=CL"],
  ["wc-standings", "/maajoukkueet/sarjataulukko?kilpailu=WC&kausi=2026"],
  ["vl-matches", "/kotimaa/ottelut?kilpailu=VL&kausi=2026"],
  ["foreign-matches", "/ulkomaat/ottelut"],
  ["inter-team", "/kotimaa/joukkue/60987"],
  ["arsenal-team", "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024"],
  ["arsenal-cl-team", "/ulkomaat/joukkue/57?kilpailu=CL&kausi=2024"],
  ["huuhkajat", "/maajoukkueet/huuhkajat"],
  ["helmarit", "/maajoukkueet/helmarit"],
  ["played-match", "/kotimaa/ottelu/4036852"],
  ["upcoming-match", "/kotimaa/ottelu/4353547"],
  ["rivalry", "/kotimaa/kohtaamiset/60901/60987"],
  ["predictions", "/ennusteet"],
  ["settings", "/asetukset"],
  ["admin", "/yllapito"],
  ["privacy", "/tietosuoja"],
  ["terms", "/kayttoehdot"],
  ["not-found", "/ei-ole-olemassa"],
];

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
    for (const [name, path] of PAGES) {
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
