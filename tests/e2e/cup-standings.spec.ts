import { expect, test } from "@playwright/test";
import { openFolds } from "./folds";
import { lastFinishedSeason, seasonLabel } from "./football-data-season";

/**
 * The Champions League's standings and match list, end to end: the league-phase
 * table, the bracket, and a stage selector in place of rounds.
 *
 * decisions/014-champions-league.md
 * decisions/888-e2e-reads-the-greyed-out-season.md
 */

const FINISHED = lastFinishedSeason();

test.describe("Champions League standings", () => {
  test("renders one league-phase table and the knockout bracket for a finished season", async ({
    page,
  }) => {
    await page.goto(`/ulkomaat/sarjataulukko?kilpailu=CL&kausi=${FINISHED}`);

    await expect(
      page.getByRole("heading", { name: `Mestarien liiga ${seasonLabel(FINISHED)}` })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Liigavaihe" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Lohko/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Pudotuspelit" })).toBeVisible();
    await openFolds(page, "Pudotuspelit");
    await expect(page.getByRole("heading", { name: "Loppuottelu" })).toBeVisible();
  });

  test("has no round selector, unlike a league competition", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=CL");

    await expect(page.getByLabel("Kilpailu")).toBeVisible();
    await expect(page.getByLabel("Kausi")).toBeVisible();
    await expect(page.getByLabel("Kierros")).toHaveCount(0);
  });

  test("offers a stage selector on the match list, and switching updates the URL", async ({
    page,
  }) => {
    await page.goto(`/ulkomaat/ottelut?kilpailu=CL&kausi=${FINISHED}`);

    await expect(page.getByLabel("Vaihe")).toBeVisible();
    await expect(page.getByLabel("Kierros")).toHaveCount(0);

    await page.getByLabel("Vaihe").selectOption("QUARTER_FINALS");
    await expect(page).toHaveURL(/vaihe=QUARTER_FINALS/);
    await expect(page.getByRole("heading", { name: /puolivälierät/ })).toBeVisible();
  });

  test("reaches the cup from the competition picker", async ({ page }) => {
    await page.goto("/ulkomaat");

    await page.getByRole("link", { name: "Mestarien liiga" }).click();
    await expect(page).toHaveURL(/kilpailu=CL/);
    await expect(page.getByRole("heading", { name: /Mestarien liiga/ })).toBeVisible();
  });
});
