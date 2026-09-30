import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { testDatabaseUrl } from "../support/test-database";

/**
 * `Ennuste` on an upcoming match's page (specs/051), end to end. Signed in the
 * way league-position.spec.ts explains.
 *
 * Whether a real league has a match still to play depends on the time of year,
 * so the upcoming match is seeded: one Veikkausliiga fixture in 2099, a season
 * nothing else stores, deleted again afterwards. The history it is predicted
 * from is whatever the suite's database holds, so no value is named — only the
 * rules: three whole percentages, and a line naming what they rest on.
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
      // Suomen Cup: upcoming, but not a competition specs/049 compares (S5).
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

  test("an upcoming league match shows three whole percentages and what they rest on", async ({
    page,
  }) => {
    await page.goto(PATH(UPCOMING_ID));

    await expect(panel(page).getByRole("term")).toHaveText([
      "Kotivoitto",
      "Tasapeli",
      "Vierasvoitto",
    ]);
    const values = await panel(page).getByRole("definition").allTextContents();
    expect(values).toHaveLength(3);
    for (const value of values) expect(value).toMatch(/^\d{1,3} %$/);
    await expect(
      panel(page).getByText(
        /^Perustaso: kilpailun [\d ]+ ottelun tulokset kausilta \d{4}–\d{4}\. Ei huomioi joukkueita, joten ennuste on sama jokaiselle kilpailun ottelulle\.$/
      )
    ).toBeVisible();
    // Between the match's details and its meetings (S6).
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
  });
});
