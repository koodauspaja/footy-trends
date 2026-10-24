import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { dropCached } from "../support/e2e-redis";
import { testDatabaseUrl } from "../support/test-database";
import { openFolds } from "./folds";

/**
 * A Suomen Cup's `Cupin ennuste`, end to end, on a round of 16 in progress.
 * The recorded cups are finished, so the season in progress is seeded: eight
 * league sides who have played each other, and a round of 16 half played. No
 * value is named.
 *
 * decisions/067-knockout-simulation.md
 */

const SEASON = 2026;
const STANDINGS = `/kotimaa/sarjataulukko?kilpailu=MSC&kausi=${SEASON}`;
const HEADING = "Cupin ennuste";
const CHANCE = /^(<\s1|>\s99|\d{1,3})\s%$/;
const SHARE = String.raw`(?:[<>]\s)?\d{1,3}\s%`;
const tie = (home: number, away: number) =>
  new RegExp(`^E2E Seura ${home} – E2E Seura ${away}: jatkoon ${SHARE} – ${SHARE}$`);

// Veikkausliiga's sides, 1 to 8, and eight the fit has no league match of.
const league = (side: number) => 999_067_100 + side;
const unrated = (side: number) => 999_067_200 + side;
let nextId = 999_067_000;

function row(
  categoryId: string,
  group: { id: number; name: string },
  home: number,
  away: number,
  score: [number, number] | null,
  winner: "home" | "away" | null = null,
  daysAgo = 3
) {
  nextId += 1;
  return {
    taso_match_id: nextId,
    competition_id: `spljp${SEASON % 100}`,
    category_id: categoryId,
    season_id: SEASON,
    group_id: group.id,
    group_name: group.name,
    kickoff_at: new Date(Date.now() - daysAgo * 86_400_000),
    matchday: 1,
    status: score === null ? "SCHEDULED" : "FINISHED",
    home_team_provider_id: home,
    home_team_name: `E2E Seura ${home % 1000}`,
    away_team_provider_id: away,
    away_team_name: `E2E Seura ${away % 1000}`,
    home_goals: score?.[0] ?? null,
    away_goals: score?.[1] ?? null,
    winner,
    // Fresh, so the page reads these rows and does not ask TASO for the season.
    updated_at: new Date(),
  };
}

const SEASON_GROUP = { id: 1, name: "Runkosarja" };
const LAST_SIXTEEN = { id: 7, name: "Kierros 6" };

// Each pair once, the lower number winning by how far apart the two are.
const LEAGUE_ROWS = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((home) =>
  [1, 2, 3, 4, 5, 6, 7, 8]
    .filter((away) => away > home)
    .map((away, index) =>
      row(
        "VL",
        SEASON_GROUP,
        league(home),
        league(away),
        [Math.ceil((away - home) / 3), 0],
        null,
        10 + index
      )
    )
);

// Four ties played, one on penalties; two to play between league sides, two
// with a side the fit does not know.
const CUP_ROWS = [
  row("MSC", LAST_SIXTEEN, league(1), league(2), [2, 1], "home"),
  row("MSC", LAST_SIXTEEN, league(3), unrated(1), [3, 0], "home"),
  row("MSC", LAST_SIXTEEN, unrated(3), unrated(4), [1, 1], "away"),
  row("MSC", LAST_SIXTEEN, unrated(7), unrated(8), [0, 2], "away"),
  row("MSC", LAST_SIXTEEN, league(4), league(5), null),
  row("MSC", LAST_SIXTEEN, league(7), league(8), null),
  row("MSC", LAST_SIXTEEN, league(6), unrated(2), null),
  row("MSC", LAST_SIXTEEN, unrated(5), unrated(6), null),
];

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

// The fit, the forecast and the season's tables are cached: dropped, so the
// page computes them from the rows stored now, and so does the next spec.
async function dropCaches() {
  await dropCached("poisson:v1:taso", "elo:v1:taso", `knockout:v1:taso:MSC:${SEASON}:*`);
}

test.beforeAll(async () => {
  await withDatabase(async (sql) => {
    // The recorded cup, finished, would be read before the seeded round. Gone,
    // the next read of the season asks the stand-in for it again.
    await sql`delete from taso_matches where category_id = 'MSC' and season_id = ${SEASON}`;
    await sql`insert into taso_matches ${sql([...LEAGUE_ROWS, ...CUP_ROWS])}`;
  });
  await dropCaches();
});

test.afterAll(async () => {
  await withDatabase(
    (sql) =>
      sql`delete from taso_matches where taso_match_id between 999067000 and 999067999
        or (category_id = 'MSC' and season_id = ${SEASON})`
  );
  await dropCaches();
});

function section(page: Page) {
  return page.getByRole("region", { name: HEADING });
}

test.describe("Suomen Cup forecast, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("comes last on the cup's page, after its rounds", async ({ page }) => {
    await page.goto(STANDINGS);
    await section(page).waitFor();
    const headings = await page.getByRole("heading", { level: 2 }).allTextContents();

    // From the round of 16 the cup draws no tree yet, so its rounds come first,
    // the latest on top.
    expect(headings.at(-1)).toBe(HEADING);
    expect(headings.slice(0, -1).length).toBeGreaterThan(0);
    expect(headings.slice(0, -1)).not.toContain("Analyysit");
    // A cup page still has no Analyysit.
    await expect(page.getByRole("region", { name: "Analyysit" })).toHaveCount(0);
  });

  test("from the round of 16, gives every side left its chance of each round and of the cup", async ({
    page,
  }) => {
    await page.goto(STANDINGS);
    await openFolds(page, HEADING);
    const table = section(page).getByRole("table");

    await expect(table.getByRole("columnheader")).toHaveText([
      "Joukkue",
      "Neljännesvälierät",
      "Puolivälierät",
      "Välierät",
      "Loppuottelu",
      "Cupin voitto",
    ]);
    // Sixteen sides, four of them out.
    await expect(table.locator("tbody tr")).toHaveCount(12);
    for (const title of await table.locator("tbody tr td:last-child").allTextContents()) {
      expect(title).toMatch(CHANCE);
      expect(title).not.toMatch(/^(0|100)\s%$/);
    }
  });

  test("gives the ties between two rated sides, and none with an unrated side", async ({
    page,
  }) => {
    await page.goto(STANDINGS);
    await openFolds(page, HEADING);
    const ties = section(page).getByRole("listitem");

    // The two still to play between league sides, 4 against 5 and 7 against 8.
    await expect(ties).toHaveText([tie(104, 105), tie(107, 108)]);
  });

  test("says what the figures are, and the division an unrated side counts as", async ({
    page,
  }) => {
    await page.goto(STANDINGS);
    await openFolds(page, HEADING);

    await expect(section(page).getByText(/^Loppukilpailu on pelattu 10 000 kertaa/)).toBeVisible();
    await expect(section(page).getByText(/laskettu Kakkosen keskitasoisiksi\.$/)).toBeVisible();
  });

  test("an earlier season has no section", async ({ page }) => {
    await page.goto(`/kotimaa/sarjataulukko?kilpailu=MSC&kausi=${SEASON - 1}`);

    // The bracket the section would follow, so the page has rendered that far.
    await expect(page.getByRole("heading", { level: 2, name: "Pudotuspelit" })).toBeVisible();
    await expect(section(page)).toHaveCount(0);
  });
});

test("sends no figure to a signed-out reader", async ({ page }) => {
  const response = await page.goto(STANDINGS);
  const html = (await response?.text()) ?? "";

  expect(html).not.toContain(HEADING);
  expect(html).not.toContain("Cupin voitto");
  expect(html).not.toContain("Loppukilpailu on pelattu");
});
