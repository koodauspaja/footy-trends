import type { Page } from "@playwright/test";

/**
 * The newest football-data club season certainly finished, by the year it starts: a season starts
 * in August and ends by June. Always inside the four latest seasons the key may read, whenever
 * the suite runs.
 *
 * decisions/888-e2e-reads-the-greyed-out-season.md
 */
export function lastFinishedSeason(now: Date = new Date()): number {
  return now.getUTCFullYear() - (now.getUTCMonth() >= 7 ? 1 : 2);
}

/**
 * A season as the app writes a football-data one: `2025` → `2025/26`.
 *
 * decisions/888-e2e-reads-the-greyed-out-season.md
 */
export function seasonLabel(start: number): string {
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

async function clubsInTable(page: Page, season: number): Promise<string[]> {
  await page.goto(`/ulkomaat/sarjataulukko?kilpailu=CL&kausi=${season}`);
  const links = page.locator("table tbody tr").getByRole("link");
  // The tables are streamed after `load`, and `evaluateAll` does not wait for them.
  await links.first().waitFor();
  const hrefs = await links.evaluateAll((all) =>
    all.map((link) => link.getAttribute("href") ?? "")
  );
  return hrefs.flatMap((href) => /\/ulkomaat\/joukkue\/(\d+)/.exec(href)?.[1] ?? []);
}

/**
 * A club's page for a Champions League season, the club read from the tables: one that played the
 * season before too, so a comparison has a previous season. No club plays in it every year.
 *
 * decisions/888-e2e-reads-the-greyed-out-season.md
 */
export async function cupTeamPage(page: Page, season: number): Promise<string> {
  const before = new Set(await clubsInTable(page, season - 1));
  const id = (await clubsInTable(page, season)).find((club) => before.has(club));
  if (id === undefined)
    throw new Error(`No club in both Champions League ${season - 1} and ${season}`);
  return `/ulkomaat/joukkue/${id}?kilpailu=CL&kausi=${season}`;
}
