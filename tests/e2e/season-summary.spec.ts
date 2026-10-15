import { expect, type Page, test } from "@playwright/test";
import Redis from "ioredis";
import postgres from "postgres";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { testDatabaseUrl } from "../support/test-database";

/**
 * `Kausi lyhyesti`, end to end, on a club seeded into four Premier League
 * seasons, 2020/21 to 2023/24, so its latest has three earlier ones in the same
 * competition. Every sentence's number is read back from the panel it comes
 * from. Signed in the way league-position.spec.ts explains. The rows are this
 * suite's own and are removed afterwards, with the cached reads they reached.
 *
 * decisions/066-season-summary.md
 */

const HEADING = "Kausi lyhyesti";
const CLUB = 999_066_001;
const OPPONENT = 999_066_002;
const CLUB_NAME = "E2E Kausi";
const OPPONENT_NAME = "E2E Vastus";
const TEAM = `/ulkomaat/joukkue/${CLUB}?kilpailu=PL&kausi=2023`;
const FIRST_MATCH_ID = 999_066_000;
// The seeded season's one away win, which Elo's backtest row gives 12 %.
const UPSET_MATCH_ID = FIRST_MATCH_ID + 3 * 10 + 5;

type Result = "won" | "lost";

// A season of ten: each entry is where the club played and how it went, in kickoff order.
function season(seasonId: number, results: ReadonlyArray<[atHome: boolean, Result]>) {
  return results.map(([atHome, result], index) => {
    const clubGoals = result === "won" ? 1 : 0;
    return {
      provider_match_id: FIRST_MATCH_ID + (seasonId - 2020) * 10 + index,
      competition_code: "PL",
      season_id: seasonId,
      kickoff_at: new Date(Date.UTC(seasonId, 8, index + 1, 15)),
      matchday: index + 1,
      status: "FINISHED",
      home_team_provider_id: atHome ? CLUB : OPPONENT,
      home_team_name: atHome ? CLUB_NAME : OPPONENT_NAME,
      away_team_provider_id: atHome ? OPPONENT : CLUB,
      away_team_name: atHome ? OPPONENT_NAME : CLUB_NAME,
      home_goals: atHome ? clubGoals : 1 - clubGoals,
      away_goals: atHome ? 1 - clubGoals : clubGoals,
    };
  });
}

const five = <T>(entry: T): T[] => Array.from({ length: 5 }, () => entry);

// 2020–2022: every away match won first, then every home match lost, so no run
// crosses into the next season. 2023: every home match won, then one away win
// and four defeats: a six-win run, the club's longest, and its best home record.
const ROWS = [
  ...[2020, 2021, 2022].flatMap((seasonId) =>
    season(seasonId, [
      ...five<[boolean, Result]>([false, "won"]),
      ...five<[boolean, Result]>([true, "lost"]),
    ])
  ),
  ...season(2023, [
    ...five<[boolean, Result]>([true, "won"]),
    [false, "won"],
    ...Array.from({ length: 4 }, (): [boolean, Result] => [false, "lost"]),
  ]),
];
const IDS = ROWS.map((row) => row.provider_match_id);

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

async function remove(sql: postgres.Sql) {
  await sql`delete from predictions where source = 'football-data' and provider_match_id in ${sql(IDS)}`;
  await sql`delete from matches where provider_match_id in ${sql(IDS)}`;
}

// Every cached read the seeded rows can reach: the replays over football-data's
// stored matches, the backtest report, and the seasons' tables.
async function dropCachedReads() {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const derived = [
      ...(await redis.keys("forecast:v4:football-data:*")),
      ...(await redis.keys("quality:v3:football-data:*")),
    ];
    await redis.del(
      "elo:v1:football-data",
      "poisson:v1:football-data",
      ...[2020, 2021, 2022, 2023].map((seasonId) => `standings:PL:${seasonId}`),
      ...derived
    );
  } finally {
    await redis.quit();
  }
}

test.beforeAll(async () => {
  await withDatabase(async (sql) => {
    await remove(sql);
    await sql`insert into matches ${sql(ROWS)}`;
    await sql`insert into predictions ${sql({
      source: "football-data",
      provider_match_id: UPSET_MATCH_ID,
      competition_code: "PL",
      model: "elo-v1",
      kind: "backtest",
      home_probability: 0.6,
      draw_probability: 0.28,
      away_probability: 0.12,
      predicted_at: new Date("2023-09-01T00:00:00Z"),
      kickoff_at: new Date(Date.UTC(2023, 8, 6, 15)),
    })}`;
  });
});

test.afterAll(async () => {
  await withDatabase(remove);
  await dropCachedReads();
});

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

test.describe("Kausi lyhyesti, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("comes first in Analyysit, above Ottelu ottelulta, with three sentences", async ({
    page,
  }) => {
    await page.goto(TEAM);
    const groups = page
      .getByRole("region", { name: "Analyysit" })
      .getByRole("heading", { level: 3 });

    await expect(groups.first()).toHaveText(HEADING);
    await expect(groups.nth(1)).toHaveText("Ottelu ottelulta");
    // Favourable first, three at most: the run, the home record, the upset. The
    // worst away record is a fourth fact, and drops.
    await expect(page.getByRole("region", { name: HEADING }).locator("p")).toHaveText([
      "Seuran pisin voittoputki tallennetuilla kausilla: 6 ottelua.",
      "Paras kotisaldo tallennetuilla kausilla: 3,00 pistettä ottelua kohden.",
      `Kauden suurin yllätys: voitto ottelussa ${OPPONENT_NAME} – ${CLUB_NAME}, jolle Elo antoi 12 %.`,
    ]);
  });

  test("states the home figure Koti- ja vierastilastot shows", async ({ page }) => {
    await page.goto(TEAM);
    // The chart's text alternative: one line per measure, both sides.
    const points = page
      .getByRole("region", { name: "Koti- ja vierastilastot" })
      .locator("ol > li", { hasText: "Pisteitä / ottelu:" });

    await expect(points).toContainText("kotona 3,00,");
  });

  test("states the winning run Ennätykset shows, set this season", async ({ page }) => {
    await page.goto(TEAM);
    const figure = page
      .getByRole("region", { name: "Ennätykset" })
      .locator("dt", { hasText: "Pisin voittoputki" })
      .locator("xpath=following-sibling::dd[1]");

    await expect(figure).toHaveText(/^6 voittoa\s*Kausi 2023\/24$/);
  });

  test("links the upset to its match, whose page gives the same Elo figure", async ({ page }) => {
    await page.goto(TEAM);
    await page
      .getByRole("region", { name: HEADING })
      .getByRole("link", { name: `${OPPONENT_NAME} – ${CLUB_NAME}` })
      .click();

    await expect(page).toHaveURL(new RegExp(`/ulkomaat/ottelu/${UPSET_MATCH_ID}$`));
    await expect(page.getByText("Elo antoi tälle tulokselle 12 %.")).toBeVisible();
  });
});

test("shows no block for a past season or a cup season", async ({ page }) => {
  await signedIn(page);

  // Arsenal has later Premier League seasons stored than 2024/25.
  for (const url of [
    "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024",
    "/ulkomaat/joukkue/57?kilpailu=CL&kausi=2024",
  ]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 3, name: "Ottelu ottelulta" })).toBeVisible();
    await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
  }
});

test("sends no sentence to a signed-out reader", async ({ page }) => {
  const response = await page.goto(TEAM);
  const html = (await response?.text()) ?? "";

  expect(html).not.toContain(HEADING);
  expect(html).not.toContain("Seuran pisin");
  expect(html).not.toContain("Kauden suurin yllätys");
});
