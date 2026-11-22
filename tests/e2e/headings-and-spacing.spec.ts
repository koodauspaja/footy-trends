import { expect, type Locator, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/auth/e2e-analytics";
import { dropCached } from "../support/e2e-redis";
import { openAnalytics } from "./folds";
import { activeSeason, withDatabase } from "./seeded-season";

/**
 * A heading looks like what it heads on every page, a label stays on its
 * select's line, and a panel's lines keep clear of its chart. jsdom has no
 * layout, so only a browser shows any of it.
 *
 * decisions/696-headings-and-spacing.md
 */

// A table heading on each kind of standings page: a domestic league, a domestic
// cup's group, the Champions League's phase and the World Cup's group.
const TABLE_HEADINGS: ReadonlyArray<readonly [string, string]> = [
  ["/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026", "Runkosarja"],
  ["/kotimaa/sarjataulukko?kilpailu=LC&kausi=2023", "Lohko A"],
  ["/ulkomaat/sarjataulukko?kilpailu=CL", "Liigavaihe"],
  ["/maajoukkueet/sarjataulukko?kilpailu=WC&kausi=2026", "Lohko A"],
];

function typeOf(heading: Locator) {
  return heading.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.fontSize} ${style.fontWeight}`;
  });
}

test("gives a standings table's heading one look on every page", async ({ page }) => {
  const looks: string[] = [];
  for (const [path, name] of TABLE_HEADINGS) {
    await page.goto(path);
    const heading = page.getByRole("heading", { level: 2, name, exact: true }).first();
    await expect(heading).toBeVisible();
    looks.push(await typeOf(heading));
  }
  // The same look on every page, and the agreed one: `Runkosarja`'s 20 px semibold.
  expect(looks).toEqual(TABLE_HEADINGS.map(() => "20px 600"));
});

test.describe("At 375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("keeps every label on its select's line when the row wraps", async ({ page }) => {
    await page.goto("/maajoukkueet/ottelut");
    await expect(page.getByLabel("Vaihe")).toBeVisible();

    const parted = await page.evaluate(() =>
      [...document.querySelectorAll("form label")].flatMap((label) => {
        const control = document.getElementById(label.getAttribute("for") ?? "");
        // A label that names no control cannot be checked, so it fails.
        if (control === null) return [`${label.textContent}: no control`];
        const middle = (element: Element) => {
          const box = element.getBoundingClientRect();
          return box.top + box.height / 2;
        };
        const away = Math.abs(middle(label) - middle(control));
        return away > control.getBoundingClientRect().height / 2 ? [label.textContent] : [];
      })
    );
    expect(parted).toEqual([]);
  });
});

test("keeps the season comparison's line clear of its chart", async ({ page }) => {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  await page.goto("/kotimaa/joukkue/60987");
  await openAnalytics(page);
  const panel = page.getByRole("region", { name: "Tämä kausi verrattuna" });
  await expect(panel.locator("svg").first()).toBeVisible();

  const gap = await panel.evaluate((element) => {
    const line = element.querySelector("p");
    const chart = element.querySelector("svg");
    if (line === null || chart === null) return Number.NaN;
    return chart.getBoundingClientRect().top - line.getBoundingClientRect().bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(8);
});

test("leaves space between one analytics panel and the next, and more between groups", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  await page.goto("/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026");
  await openAnalytics(page);
  await expect(page.getByRole("heading", { level: 4 }).first()).toBeVisible();

  const gaps = await page.evaluate(() => {
    // A section headed by `level`, directly or inside a folded group's summary.
    const headedBy = (element: Element | null, level: string) =>
      element?.tagName === "SECTION" &&
      element.querySelector(`:scope > ${level}, :scope > details > summary ${level}`) !== null;
    // From each such section to the next one beside it.
    const between = (level: string) =>
      [...document.querySelectorAll("section")]
        .filter((section) => headedBy(section, level))
        .flatMap((section) => {
          const next = section.nextElementSibling;
          if (next === null || !headedBy(next, level)) return [];
          return [
            {
              folded: next.querySelector(":scope > details") !== null,
              gap: next.getBoundingClientRect().top - section.getBoundingClientRect().bottom,
            },
          ];
        });
    return { panels: between("h4"), groups: between("h3") };
  });
  expect(gaps.panels.length).toBeGreaterThan(0);
  expect(Math.min(...gaps.panels.map(({ gap }) => gap))).toBeGreaterThanOrEqual(32);
  // The folded group is measured too, its heading inside its summary.
  expect(gaps.groups.some(({ folded }) => folded)).toBe(true);
  expect(Math.min(...gaps.groups.map(({ gap }) => gap))).toBeGreaterThanOrEqual(48);
});

// A forecast labels its tables only in a season with fixtures left, so one is
// seeded in the active season: two groups of four, each half played.
test.describe("a forecast's labels", () => {
  let season = 0;
  const firstId = 999_867_000;
  const team = (group: number, side: number) => 999_867_100 + group * 10 + side;
  // Every pairing of four sides once; the first three are played.
  const PAIRS: ReadonlyArray<readonly [number, number]> = [
    [1, 2],
    [3, 4],
    [1, 3],
    [2, 4],
    [1, 4],
    [2, 3],
  ];

  function rows() {
    return [901, 902].flatMap((groupId, group) =>
      PAIRS.map(([home, away], index) => {
        const played = index < 3;
        return {
          taso_match_id: firstId + group * 10 + index,
          competition_id: `spljp${season % 100}`,
          category_id: "VL",
          season_id: season,
          group_id: groupId,
          group_name: `E2E Lohko ${group + 1}`,
          kickoff_at: new Date(Date.now() + (played ? -10 + index : 10 + index) * 86_400_000),
          matchday: index + 1,
          status: played ? "FINISHED" : "SCHEDULED",
          home_team_provider_id: team(group, home),
          home_team_name: `E2E Joukkue ${group + 1}${home}`,
          away_team_provider_id: team(group, away),
          away_team_name: `E2E Joukkue ${group + 1}${away}`,
          home_goals: played ? 2 : null,
          away_goals: played ? 1 : null,
          winner: played ? "home" : null,
          // Fresh, so the page reads these rows and does not ask TASO for the season.
          updated_at: new Date(),
        };
      })
    );
  }

  // The fit and the season's forecast are cached: dropped, so the page computes
  // them from the rows stored now, and so does the next spec.
  async function dropCaches() {
    await dropCached("poisson:v1:taso", "elo:v1:taso", `forecast:v4:taso:VL:${season}`);
  }

  async function clearSeason() {
    await withDatabase(
      (sql) => sql`delete from taso_matches where category_id = 'VL' and season_id = ${season}`
    );
  }

  test.beforeAll(async ({ browser }) => {
    season = await activeSeason(browser, "VL");
    // The stored season would be read beside the seeded one. Gone, the next read
    // of it asks TASO again.
    await clearSeason();
    await withDatabase((sql) => sql`insert into taso_matches ${sql(rows())}`);
    await dropCaches();
  });

  test.afterAll(async () => {
    await clearSeason();
    await dropCaches();
  });

  test("sets a panel's heading above its labels and lines, and below its section's", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
    await page.goto(`/kotimaa/sarjataulukko?kilpailu=VL&kausi=${season}`);
    await openAnalytics(page);
    const forecast = page.getByRole("region", { name: "Kauden ennuste" });
    await expect(forecast).toBeVisible();

    const size = (locator: Locator) =>
      locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const section = await size(page.getByRole("heading", { level: 2, name: "Analyysit" }));
    const panel = await size(forecast.getByRole("heading", { level: 4 }));
    // The seeded group's, not one a live season happens to have.
    const firstLabel = forecast.getByRole("heading", { level: 5 }).first();
    await expect(firstLabel).toHaveText("E2E Lohko 1");
    const label = await size(firstLabel);
    expect(label).toBeLessThan(panel);
    expect(panel).toBeLessThan(section);

    // An empty line, such as the surprises' before any match is predicted.
    const surprises = page.getByRole("region", { name: "Kauden suurimmat yllätykset" });
    const lines = await surprises
      .locator("p")
      .evaluateAll((paragraphs) =>
        paragraphs.map((paragraph) => Number.parseFloat(getComputedStyle(paragraph).fontSize))
      );
    expect(lines.length).toBeGreaterThan(0);
    expect(Math.max(...lines)).toBeLessThan(
      await size(surprises.getByRole("heading", { level: 4 }))
    );
  });
});
