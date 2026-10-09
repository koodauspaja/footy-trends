import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { testDatabaseUrl } from "../support/test-database";

/**
 * `Ennuste` on an upcoming match's page, end to end. Signed in the way league-position.spec.ts
 * explains. Whether a real league has a match to play depends on the time of year, so one is
 * seeded, in 2099, a season nothing else stores. No value is named.
 *
 * decisions/051-home-win-baseline.md
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/053-elo-ratings.md
 */

const HEADING = "Ennuste";
const SEASON = 2099;
const UPCOMING_ID = 999_051_001;
const FINISHED_ID = 999_051_002;
const CUP_ID = 999_051_003;
const PATH = (id: number) => `/kotimaa/ottelu/${id}`;

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

function fixture(id: number, status: string, goals: number | null, categoryId = "VL") {
  return {
    taso_match_id: id,
    competition_id: `spljp${SEASON % 100}`,
    category_id: categoryId,
    season_id: SEASON,
    group_id: 1,
    group_name: "Runkosarja",
    kickoff_at: new Date(`${SEASON}-05-01T15:00:00Z`),
    matchday: 1,
    status,
    home_team_provider_id: 999_051_101,
    home_team_name: "E2E Koti",
    away_team_provider_id: 999_051_102,
    away_team_name: "E2E Vieras",
    home_goals: goals,
    away_goals: goals,
  };
}

const IDS = [UPCOMING_ID, FINISHED_ID, CUP_ID];

test.beforeAll(async () => {
  await withDatabase(async (sql) => {
    await sql`delete from taso_matches where taso_match_id in ${sql(IDS)}`;
    await sql`insert into taso_matches ${sql([
      fixture(UPCOMING_ID, "SCHEDULED", null),
      fixture(FINISHED_ID, "FINISHED", 1),
      // Suomen Cup: upcoming, but not a competition the home-advantage table
      // compares.
      fixture(CUP_ID, "SCHEDULED", null, "MSC"),
    ])}`;
  });
});

test.afterAll(async () => {
  await withDatabase((sql) => sql`delete from taso_matches where taso_match_id in ${sql(IDS)}`);
});

function panel(page: Page) {
  return page.getByRole("region", { name: HEADING });
}

test.describe("Home-win baseline, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("an upcoming league match shows the baseline and Elo rows, and what each rests on", async ({
    page,
  }) => {
    await page.goto(PATH(UPCOMING_ID));

    await expect(panel(page).getByRole("columnheader")).toHaveText([
      "Malli",
      "Kotivoitto",
      "Tasapeli",
      "Vierasvoitto",
    ]);
    // The baseline first, then Elo, three whole percentages each.
    const rows = panel(page).getByRole("row");
    await expect(rows).toHaveCount(3);
    for (const [index, model] of [
      [1, "Perustaso"],
      [2, "Elo"],
    ] as const) {
      const cells = await rows.nth(index).locator("th, td").allTextContents();
      expect(cells[0]).toBe(model);
      for (const value of cells.slice(1)) expect(value).toMatch(/^\d{1,3}\u00a0%$/);
    }
    await expect(
      panel(page).getByText(
        /^Perustaso: kilpailun [\d\u00a0]+ ottelun tulokset kausilta \d{4}–\d{4}\. Ei huomioi joukkueita, joten ennuste on sama jokaiselle kilpailun ottelulle\.$/
      )
    ).toBeVisible();
    await expect(
      panel(page).getByText(
        /^Elo: E2E Koti \d{4}, E2E Vieras \d{4}\. Kotijoukkueelle lisätään 60 pistettä, ja tasapelin todennäköisyys on kilpailun tasapelien osuus\.$/
      )
    ).toBeVisible();
    // Between the match's details and its meetings.
    const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
    const at = headings.indexOf(HEADING);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(headings[at + 1]).toBe("Aiemmat kohtaamiset");
  });

  test("a finished match has no prediction", async ({ page }) => {
    await page.goto(PATH(FINISHED_ID));

    await expect(
      page.getByRole("heading", { level: 2, name: "Aiemmat kohtaamiset" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
  });

  test("an upcoming cup match has no prediction", async ({ page }) => {
    await page.goto(PATH(CUP_ID));

    await expect(
      page.getByRole("heading", { level: 2, name: "Aiemmat kohtaamiset" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
  });
});

test.describe("Home-win baseline, signed out", () => {
  test("carries no probability in the page", async ({ page }) => {
    const response = await page.goto(PATH(UPCOMING_ID));
    const html = (await response?.text()) ?? "";

    await expect(page.getByText("Kirjaudu sisään nähdäksesi ennusteen.")).toBeVisible();
    expect(html).not.toContain("Kotivoitto");
    expect(html).not.toContain("Perustaso");
    expect(html).not.toContain("Elo:");
  });
});
