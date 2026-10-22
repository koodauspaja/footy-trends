import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { dropCached } from "../support/e2e-redis";
import { testDatabaseUrl } from "../support/test-database";

/**
 * `Kausi lyhyesti`, end to end, on two clubs seeded into four Premier League
 * seasons, 2020/21 to 2023/24, so their latest has three earlier ones in the
 * same competition. Every sentence's number is read back from the panel it
 * comes from. Signed in the way league-position.spec.ts explains. The rows are
 * this suite's own and are removed afterwards, with the cached reads they reached.
 *
 * decisions/066-season-summary.md
 * decisions/069-season-summary-clean-sheets.md
 * decisions/070-season-summary-position.md
 * decisions/708-season-summary-seeds-its-table.md
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

// The club's goals and its opponent's. `won` and `lost` concede; `kept` is a
// win with a clean sheet.
type Result = "won" | "kept" | "lost";
const SCORES: Record<Result, [club: number, opponent: number]> = {
  won: [2, 1],
  kept: [1, 0],
  lost: [0, 1],
};

type Seeded = { id: number; name: string; opponent: number; opponentName: string; first: number };
const SEEDED: Seeded = {
  id: CLUB,
  name: CLUB_NAME,
  opponent: OPPONENT,
  opponentName: OPPONENT_NAME,
  first: FIRST_MATCH_ID,
};

// A season of ten: each entry is where the club played and how it went, in kickoff order.
function season(
  seasonId: number,
  results: ReadonlyArray<[atHome: boolean, Result]>,
  club: Seeded = SEEDED
) {
  return results.map(([atHome, result], index) => {
    const [clubGoals, opponentGoals] = SCORES[result];
    return {
      provider_match_id: club.first + (seasonId - 2020) * 10 + index,
      competition_code: "PL",
      season_id: seasonId,
      kickoff_at: new Date(Date.UTC(seasonId, 8, index + 1, 15)),
      matchday: index + 1,
      status: "FINISHED",
      home_team_provider_id: atHome ? club.id : club.opponent,
      home_team_name: atHome ? club.name : club.opponentName,
      away_team_provider_id: atHome ? club.opponent : club.id,
      away_team_name: atHome ? club.opponentName : club.name,
      home_goals: atHome ? clubGoals : opponentGoals,
      away_goals: atHome ? opponentGoals : clubGoals,
    };
  });
}

const five = <T>(entry: T): T[] => Array.from({ length: 5 }, () => entry);

// 2020–2022: every away match won first, then every home match lost, so no run
// crosses into the next season. 2023: every home match won, then one away win
// and four defeats: a six-win run, the club's longest, and its best home record.
// Five clean sheets in every season, 50 %, so 2023's share equals 2022's and is
// no fact.
const ROWS = [
  ...[2020, 2021, 2022].flatMap((seasonId) =>
    season(seasonId, [
      ...five<[boolean, Result]>([false, "kept"]),
      ...five<[boolean, Result]>([true, "lost"]),
    ])
  ),
  ...season(2023, [
    [true, "won"],
    ...Array.from({ length: 4 }, (): [boolean, Result] => [true, "kept"]),
    [false, "kept"],
    ...Array.from({ length: 4 }, (): [boolean, Result] => [false, "lost"]),
  ]),
];

// A second club whose block holds a record clean-sheet share (10 % before, 30 %
// in 2023) and its worst place: 2023/24 ranks it below the three E2E Kärki clubs,
// the earlier seasons among the four seeded ones.
const SHARE_CLUB: Seeded = {
  id: 999_069_001,
  name: "E2E Nolla",
  opponent: 999_069_002,
  opponentName: "E2E Vastus 2",
  first: 999_069_000,
};
const SHARE_TEAM = `/ulkomaat/joukkue/${SHARE_CLUB.id}?kilpailu=PL&kausi=2023`;
const SHARE_ROWS = [
  ...[2020, 2021, 2022].flatMap((seasonId) =>
    season(
      seasonId,
      [
        [true, "kept"],
        [true, "won"],
        [false, "won"],
        [false, "won"],
        [true, "won"],
        [true, "lost"],
        ...Array.from({ length: 3 }, (): [boolean, Result] => [false, "lost"]),
        [true, "lost"],
      ],
      SHARE_CLUB
    )
  ),
  ...season(
    2023,
    [
      [true, "kept"],
      [false, "lost"],
      [true, "kept"],
      [false, "lost"],
      [true, "kept"],
      [false, "lost"],
      [true, "lost"],
      [false, "won"],
      [true, "lost"],
      [false, "won"],
    ],
    SHARE_CLUB
  ),
];

// Three clubs that win all ten 2023/24 matches, so E2E Kausi is 4th in it and its
// place is no best, whether or not the real Premier League clubs are stored.
const BOTTOM = 999_070_009;
const RIVAL_ROWS = [1, 2, 3].flatMap((rival) =>
  season(
    2023,
    Array.from({ length: 10 }, (_, index): [boolean, Result] => [index % 2 === 0, "won"]),
    {
      id: 999_070_000 + rival,
      name: `E2E Kärki ${rival}`,
      opponent: BOTTOM,
      opponentName: "E2E Pohja",
      first: 999_070_000 + rival * 100,
    }
  )
);

// A 2024/25 match one test adds, and removes, by itself.
const LATER_MATCH_ID = FIRST_MATCH_ID + 99;
const IDS = [
  ...[...ROWS, ...SHARE_ROWS, ...RIVAL_ROWS].map((row) => row.provider_match_id),
  LATER_MATCH_ID,
];

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
  await dropCached(
    "elo:v1:football-data",
    "poisson:v1:football-data",
    ...[2020, 2021, 2022, 2023, 2024].map((seasonId) => `standings:PL:${seasonId}`),
    "forecast:v4:football-data:*",
    "quality:v3:football-data:*"
  );
}

test.beforeAll(async () => {
  await withDatabase(async (sql) => {
    await remove(sql);
    await sql`insert into matches ${sql([...ROWS, ...SHARE_ROWS, ...RIVAL_ROWS])}`;
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
  await dropCachedReads();
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

test.describe("Kausi lyhyesti's clean-sheet share and place, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  test("states the share Nollapelit shows after the season's last match", async ({ page }) => {
    await page.goto(SHARE_TEAM);

    await expect(page.getByRole("region", { name: HEADING }).locator("p")).toHaveText([
      "Paras nollapeliosuus tallennetuilla kausilla: 30 % otteluista.",
      /^Heikoin sijoitus tallennetuilla kausilla: \d+\.$/,
    ]);
    await expect(page.getByRole("region", { name: "Nollapelit" }).locator("li").last()).toHaveText(
      "Nollapelien osuus 10. ottelun jälkeen: 30 % (3/10)."
    );
  });

  test("states the place Tämä kausi verrattuna shows for the season", async ({ page }) => {
    await page.goto(SHARE_TEAM);
    // The chart's text alternative: `Sijoitus: tämä kausi 9., tavallisesti 1,7.`
    const row = page
      .getByRole("region", { name: "Tämä kausi verrattuna" })
      .locator("li", { hasText: "Sijoitus:" });
    await expect(row).toHaveText(/^Sijoitus: tämä kausi \d+\./);
    const place = /tämä kausi (\d+)\./.exec((await row.textContent()) ?? "")?.[1];

    await expect(
      page.getByRole("region", { name: HEADING }).getByText(/sijoitus tallennetuilla kausilla/)
    ).toHaveText(`Heikoin sijoitus tallennetuilla kausilla: ${place}.`);
  });
});

test("takes the block away once the club has played in a later season", async ({ page }) => {
  await signedIn(page);
  // One finished 2024/25 match: 2023/24, which has a block, becomes a past season.
  const later = { ...season(2024, [[true, "won"]])[0], provider_match_id: LATER_MATCH_ID };

  await withDatabase(async (sql) => {
    await sql`insert into matches ${sql(later)}`;
  });
  try {
    await page.goto(TEAM);
    await expect(page.getByRole("heading", { level: 3, name: "Ottelu ottelulta" })).toBeVisible();
    await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
  } finally {
    await withDatabase(
      (sql) => sql`delete from matches where provider_match_id = ${LATER_MATCH_ID}`
    );
  }
});

test("shows no block for a cup season", async ({ page }) => {
  await signedIn(page);

  await page.goto("/ulkomaat/joukkue/57?kilpailu=CL&kausi=2024");
  await expect(page.getByRole("heading", { level: 3, name: "Ottelu ottelulta" })).toBeVisible();
  await expect(page.getByRole("heading", { name: HEADING })).toHaveCount(0);
});

test("shows no block on a national team's pages", async ({ page }) => {
  await signedIn(page);

  for (const url of [
    "/maajoukkueet/joukkue/770?kilpailu=WC&kausi=2026",
    "/maajoukkueet/huuhkajat",
  ]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 2, name: "Analyysit" })).toBeVisible();
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
