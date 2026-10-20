import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { dropCached } from "../support/e2e-redis";
import { testDatabaseUrl } from "../support/test-database";

/**
 * `Seuraava kohtaaminen` on a rivalry page, end to end. Signed in the way league-position.spec.ts
 * explains. Whether a real pair has a meeting to play depends on the time of year, so two pairs
 * are seeded with fixtures in 2099, a season nothing else stores. No probability is named.
 *
 * decisions/058-rivalry-prediction.md
 * decisions/059-cup-predictions.md
 */

const SEASON = 2099;
const HOME = 999_058_101;
const AWAY = 999_058_102;
const CUP_HOME = 999_058_103;
const CUP_AWAY = 999_058_104;
const PLAYED_ID = 999_058_001;
const NEXT_ID = 999_058_002;
const CUP_PLAYED_ID = 999_058_003;
const CUP_NEXT_ID = 999_058_004;
const CUP_LEAGUE_ID = 999_058_005;
// A third pair has met only in the cup, so the leagues have rated neither side.
const CUP_ONLY_HOME = 999_058_105;
const CUP_ONLY_AWAY = 999_058_106;
const CUP_ONLY_PLAYED_ID = 999_058_006;
const CUP_ONLY_NEXT_ID = 999_058_007;
const IDS = [
  PLAYED_ID,
  NEXT_ID,
  CUP_PLAYED_ID,
  CUP_NEXT_ID,
  CUP_LEAGUE_ID,
  CUP_ONLY_PLAYED_ID,
  CUP_ONLY_NEXT_ID,
];

const RIVALRY = `/kotimaa/kohtaamiset/${AWAY}/${HOME}`;
const CUP_RIVALRY = `/kotimaa/kohtaamiset/${CUP_HOME}/${CUP_AWAY}`;
const CUP_ONLY_RIVALRY = `/kotimaa/kohtaamiset/${CUP_ONLY_HOME}/${CUP_ONLY_AWAY}`;
const GROUP = "Seuraava kohtaaminen";
const QUALITY_LINK = "Kuinka hyvin ennusteet ovat osuneet?";
const MOVES_NOTE =
  "Ennuste perustuu tähän mennessä pelattuihin otteluihin ja muuttuu, kun uusia pelataan.";

// The ratings and the fit are cached for 15 minutes. Made by another spec
// before these fixtures were stored, they rate neither cup side, and a cup tie
// is predicted only between rated sides; so both are dropped once seeded.
async function dropModelCaches() {
  await dropCached("elo:v1:taso", "poisson:v1:taso");
}

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

// Three days ago: a meeting that gives each pair its page, and keeps the rivalry current.
const PLAYED_AT = new Date(Date.now() - 3 * 86_400_000);

function fixture(
  id: number,
  [home, away]: readonly [number, number],
  kickoffAt: Date,
  categoryId = "VL",
  goals: number | null = null
) {
  return {
    taso_match_id: id,
    competition_id: `spljp${SEASON % 100}`,
    category_id: categoryId,
    season_id: SEASON,
    group_id: 1,
    group_name: "Runkosarja",
    kickoff_at: kickoffAt,
    matchday: 1,
    status: goals === null ? "SCHEDULED" : "FINISHED",
    home_team_provider_id: home,
    home_team_name: `E2E 058 ${home % 1000}`,
    away_team_provider_id: away,
    away_team_name: `E2E 058 ${away % 1000}`,
    home_goals: goals,
    away_goals: goals,
  };
}

test.beforeAll(async () => {
  await withDatabase(async (sql) => {
    await sql`delete from taso_matches where taso_match_id in ${sql(IDS)}`;
    await sql`insert into taso_matches ${sql([
      fixture(PLAYED_ID, [AWAY, HOME], PLAYED_AT, "VL", 1),
      // 18.00 in Helsinki, in summer time.
      fixture(NEXT_ID, [HOME, AWAY], new Date(`${SEASON}-05-01T15:00:00Z`)),
      // The second pair meets in the Suomen Cup first, and in the league after it.
      fixture(CUP_PLAYED_ID, [CUP_HOME, CUP_AWAY], PLAYED_AT, "VL", 1),
      fixture(CUP_NEXT_ID, [CUP_HOME, CUP_AWAY], new Date(`${SEASON}-04-01T15:00:00Z`), "MSC"),
      fixture(CUP_LEAGUE_ID, [CUP_HOME, CUP_AWAY], new Date(`${SEASON}-05-01T15:00:00Z`)),
      fixture(CUP_ONLY_PLAYED_ID, [CUP_ONLY_HOME, CUP_ONLY_AWAY], PLAYED_AT, "MSC", 1),
      fixture(
        CUP_ONLY_NEXT_ID,
        [CUP_ONLY_HOME, CUP_ONLY_AWAY],
        new Date(`${SEASON}-04-01T15:00:00Z`),
        "MSC"
      ),
    ])}`;
  });
  await dropModelCaches();
});

test.afterAll(async () => {
  await withDatabase((sql) => sql`delete from taso_matches where taso_match_id in ${sql(IDS)}`);
});

test.describe("The next meeting, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("comes first, with its kickoff, its competition and the three models' rows", async ({
    page,
  }) => {
    await page.goto(RIVALRY);

    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      GROUP,
      "Nykyinen vire",
      "Keskinäinen historia",
    ]);
    const group = page.getByRole("region", { name: GROUP });
    await expect(group.getByText("01.05.2099 klo 18.00 · Veikkausliiga")).toBeVisible();
    const rows = group.getByRole("table").first().getByRole("row");
    await expect(rows).toHaveCount(4);
    await expect(rows.locator("th[scope=row]")).toHaveText(["Perustaso", "Elo", "Poisson"]);
    // The scoreline grid under the Poisson line, the fixture's home side down.
    await expect(group.getByRole("table").nth(1).getByRole("columnheader").first()).toHaveText(
      "E2E 058 101 ↓ / E2E 058 102 →"
    );
    await expect(group.locator("td[data-marked]")).toHaveCount(1);
    await expect(group.getByText(MOVES_NOTE)).toBeVisible();
    // `Ennuste`'s own heading stays on the match page: the group names it here.
    await expect(group.getByRole("heading", { name: "Ennuste" })).toHaveCount(0);
  });

  test("names the home side first and opens the match, whose Ennuste carries the same rows", async ({
    page,
  }) => {
    await page.goto(RIVALRY);
    const group = page.getByRole("region", { name: GROUP });
    // Four rows of predictions, then the scoreline grid's seven.
    await expect(group.getByRole("row")).toHaveCount(11);
    const rows = await group.getByRole("row").allTextContents();

    // The URL names the away side first; the fixture's home side still leads.
    await group.getByRole("link", { name: "E2E 058 101 – E2E 058 102" }).click();

    await expect(page).toHaveURL(new RegExp(`/kotimaa/ottelu/${NEXT_ID}$`));
    const panel = page.getByRole("region", { name: "Ennuste" });
    await expect(panel.getByRole("row")).toHaveText(rows);
    await expect(panel.getByText(MOVES_NOTE)).toBeVisible();
    await expect(panel.getByRole("link", { name: QUALITY_LINK })).toHaveAttribute(
      "href",
      "/ennusteet?alue=kotimaa&tyyppi=jalkikateen&kilpailu=VL"
    );
  });

  test("links to the track record of the meeting's own competition", async ({ page }) => {
    await page.goto(RIVALRY);

    await page
      .getByRole("region", { name: GROUP })
      .getByRole("link", { name: QUALITY_LINK })
      .click();

    await expect(page).toHaveURL(/\/ennusteet\?alue=kotimaa&tyyppi=jalkikateen&kilpailu=VL$/);
    await expect(page.getByText("Näytetään vain kilpailu Veikkausliiga.")).toBeVisible();
  });

  test("predicts the next meeting when it is a Suomen Cup tie between rated sides", async ({
    page,
  }) => {
    await page.goto(CUP_RIVALRY);

    const group = page.getByRole("region", { name: GROUP });
    await expect(group.getByText("01.04.2099 klo 18.00 · Miesten Suomen Cup")).toBeVisible();
    await expect(
      group.getByRole("table").first().getByRole("row").locator("th[scope=row]")
    ).toContainText(["Perustaso", "Elo"]);
  });

  test("has no group when the next meeting is a cup tie between sides the leagues have not rated", async ({
    page,
  }) => {
    await page.goto(CUP_ONLY_RIVALRY);

    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "Nykyinen vire",
      "Keskinäinen historia",
    ]);
  });
});

test.describe("The next meeting, signed out", () => {
  test("is absent, and the page carries no prediction", async ({ page }) => {
    const response = await page.goto(RIVALRY);
    const html = (await response?.text()) ?? "";

    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Yhteenveto", "Kohtaamiset"]);
    expect(html).not.toContain(GROUP);
    expect(html).not.toContain("Perustaso");
    expect(html).not.toContain("Poisson");
    expect(html).not.toContain("data-marked");
  });
});
