import type { Browser } from "@playwright/test";
import postgres from "postgres";
import { testDatabaseUrl } from "../support/test-database";

/**
 * The season a domestic competition's pages treat as active: the one its
 * standings open on, where a forecast is drawn.
 *
 * decisions/867-e2e-forecasts-seed-their-season.md
 */
export async function activeSeason(browser: Browser, code: string): Promise<number> {
  const page = await browser.newPage();
  try {
    await page.goto(`/kotimaa/sarjataulukko?kilpailu=${code}`);
    const season = Number(await page.getByLabel("Kausi").inputValue());
    if (!Number.isInteger(season)) throw new Error(`No season selected on ${code}'s standings`);
    return season;
  } finally {
    await page.close();
  }
}

/**
 * Runs against the suite's database, closing the connection after.
 *
 * decisions/867-e2e-forecasts-seed-their-season.md
 */
export async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>): Promise<void> {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}
