import { describe, expect, it } from "vitest";
import { FINLAND_TEAM_ID } from "@/lib/national-team";
import {
  finishedHistory,
  history,
  NATIONAL_TEAM_PERIOD_CODE,
  nationalTeamAnalytics,
  readYear,
  selectedYear,
  yearKeys,
  yearSpan,
} from "@/lib/national-team-analytics";
import type { NationalTeamMatch, NationalTeamYear } from "@/lib/national-team-service";

/**
 * The analytics behind a national-team page (specs/041).
 *
 * Two axes are under test and they are not the same: the charts read the whole
 * history, `Muut vuodet` reads calendar years. A test that only ever used one
 * year would pass for either.
 *
 * Every fixture already carries `FINLAND_TEAM_ID` on Finland's side, because
 * the read boundary put it there — `national-team.test.ts` owns that step.
 */

let nextId = 1;

function match(
  over: Partial<NationalTeamMatch> & { kickoffAt: Date; homeGoals: number | null }
): NationalTeamMatch {
  const played = over.homeGoals !== null;
  return {
    providerMatchId: nextId++,
    competitionCode: "maajp2026",
    categoryId: "Miehet-A",
    seasonId: 2026,
    groupId: 1,
    groupName: "A-maaottelut",
    status: played ? "FINISHED" : "SCHEDULED",
    matchday: null,
    homeTeamProviderId: FINLAND_TEAM_ID,
    homeTeamName: "Suomi",
    awayTeamProviderId: 99,
    awayTeamName: "Ruotsi",
    awayGoals: played ? 0 : null,
    halfTimeHome: played ? 1 : null,
    halfTimeAway: 0,
    winner: null,
    competitionName: "A-maaottelut",
    ...over,
  };
}

/** Finland at home, winning by `scored`–`conceded`. */
function home(year: number, day: number, scored: number, conceded: number): NationalTeamMatch {
  return match({
    kickoffAt: new Date(`${year}-06-${String(day).padStart(2, "0")}T18:00:00Z`),
    homeGoals: scored,
    awayGoals: conceded,
  });
}

/** Finland away, so the sentinel has to be read off the other side. */
function away(year: number, day: number, scored: number, conceded: number): NationalTeamMatch {
  return match({
    kickoffAt: new Date(`${year}-09-${String(day).padStart(2, "0")}T18:00:00Z`),
    homeTeamProviderId: 99,
    homeTeamName: "Ruotsi",
    awayTeamProviderId: FINLAND_TEAM_ID,
    awayTeamName: "Suomi",
    homeGoals: conceded,
    awayGoals: scored,
  });
}

function scheduled(year: number, day: number): NationalTeamMatch {
  return match({
    kickoffAt: new Date(`${year}-11-${String(day).padStart(2, "0")}T18:00:00Z`),
    homeGoals: null,
  });
}

/** The service's own shape: newest year first, chronological within a year. */
function years(...entries: Array<[number, NationalTeamMatch[]]>): NationalTeamYear[] {
  return entries.map(([year, matches]) => ({ year, matches }));
}

describe("history", () => {
  it("runs oldest first, across every year the page holds", () => {
    const given = years([2026, [home(2026, 1, 1, 0)]], [2025, [home(2025, 1, 2, 0)]]);

    // The page lists newest year first; a chart's x-axis runs the other way.
    expect(history(given).map((one) => one.kickoffAt.getUTCFullYear())).toEqual([2025, 2026]);
  });

  it("leaves the service's own years untouched", () => {
    const given = years([2026, [home(2026, 1, 1, 0)]], [2025, [home(2025, 1, 2, 0)]]);
    history(given);

    expect(given.map((one) => one.year)).toEqual([2026, 2025]);
  });

  it("keeps only finished matches, with their half-time score", () => {
    const given = years([2026, [home(2026, 1, 3, 1), scheduled(2026, 20)]]);
    const finished = finishedHistory(given);

    expect(finished).toHaveLength(1);
    // `Kääntyneet ottelut` reads this, so it must survive the narrowing.
    expect(finished.at(0)?.halfTimeHome).toBe(1);
  });
});

describe("yearKeys", () => {
  it("runs oldest first, under one competition code", () => {
    const given = years([2026, [home(2026, 1, 1, 0)]], [2021, [home(2021, 1, 1, 0)]]);

    expect(yearKeys(given)).toEqual([
      { competitionCode: NATIONAL_TEAM_PERIOD_CODE, seasonId: 2021 },
      { competitionCode: NATIONAL_TEAM_PERIOD_CODE, seasonId: 2026 },
    ]);
  });
});

describe("selectedYear", () => {
  it("is the newest year holding a finished match", () => {
    const given = years([2026, [home(2026, 1, 1, 0)]], [2025, [home(2025, 1, 2, 0)]]);

    expect(selectedYear(given)).toBe(2026);
  });

  it("skips a newer year whose matches are all ahead of it", () => {
    // January, with the year's fixtures published and none played (specs/041, S6).
    const given = years([2026, [scheduled(2026, 20)]], [2025, [home(2025, 1, 2, 0)]]);

    expect(selectedYear(given)).toBe(2025);
  });

  it("is null when nothing has been played at all", () => {
    expect(selectedYear(years([2026, [scheduled(2026, 20)]]))).toBeNull();
  });
});

describe("yearSpan", () => {
  it("names the first and last year, with an en dash", () => {
    const given = years([2026, [home(2026, 1, 1, 0)]], [2018, [home(2018, 1, 1, 0)]]);

    expect(yearSpan(given)).toBe("2018–2026");
  });

  it("names the one year when that is the whole history", () => {
    expect(yearSpan(years([2026, [home(2026, 1, 1, 0)]]))).toBe("2026");
  });
});

describe("readYear", () => {
  it("names the period by its year, not by a competition", () => {
    const given = years([2026, [home(2026, 1, 1, 0), scheduled(2026, 20)]]);
    const key = { competitionCode: NATIONAL_TEAM_PERIOD_CODE, seasonId: 2026 };

    return readYear(given, key).then((result) => {
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      // A year here spans friendlies, qualifiers and a tournament at once, so
      // the competition cannot tell one period from another (specs/041, S8).
      expect(result.read.competition).toBe("2026");
      expect(result.read.finished).toHaveLength(1);
      // Every match, scheduled included: the comparison needs the period's length.
      expect(result.read.all).toHaveLength(2);
      // Nothing ranks anybody here, which is what drops the `Sijoitus` row.
      expect(result.read.points).toEqual([]);
    });
  });

  it("is empty for a year the page holds nothing for", async () => {
    const given = years([2026, [home(2026, 1, 1, 0)]]);

    expect(
      await readYear(given, { competitionCode: NATIONAL_TEAM_PERIOD_CODE, seasonId: 2019 })
    ).toEqual({ status: "empty" });
  });
});

describe("nationalTeamAnalytics", () => {
  const given = years(
    [2026, [home(2026, 1, 3, 0), away(2026, 5, 1, 0)]],
    [2025, [home(2025, 1, 0, 2), away(2025, 5, 1, 1)]],
    [2024, [home(2024, 1, 2, 1)]]
  );

  it("has no position panel, because nothing here ranks anybody", async () => {
    expect(await nationalTeamAnalytics(given).loadPosition()).toEqual({ status: "unavailable" });
  });

  it("reads Finland on both sides of the fixture, across every year", async () => {
    const result = await nationalTeamAnalytics(given).loadHomeAway();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Three at home and two away, from five matches over three years: the
    // sentinel is found on whichever side Finland played.
    expect(result.home.matches).toBe(3);
    expect(result.away.matches).toBe(2);
    expect(result.home.scored + result.away.scored).toBe(7);
  });

  it("plots every year on one axis, not the newest", async () => {
    const result = await nationalTeamAnalytics(given).loadGoals();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Five matches over three years, and the running total is the whole
    // history's: 3 + 1 + 0 + 1 + 2 scored (specs/041, S3).
    expect(result.totals).toHaveLength(5);
    expect(result.totals.at(-1)).toMatchObject({ scored: 7, conceded: 4 });
  });

  it("runs the axis oldest first, so the history reads forwards", async () => {
    const result = await nationalTeamAnalytics(given).loadStreaks();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // 2024 won, 2025 lost then drew, 2026 won twice: the run in progress is
    // the two most recent, which only holds if the order is chronological.
    expect(result.current).toMatchObject({ outcome: "win", length: 2 });
  });

  it("needs the whole history to fill one form window", async () => {
    const result = await nationalTeamAnalytics(given).loadForm();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Five matches across three years make exactly one five-match window. One
    // year alone would be `too-few`, which is the difference under test.
    expect(result.points).toHaveLength(1);
  });

  it("runs the clean-sheet share across every year", async () => {
    const result = await nationalTeamAnalytics(given).loadCleanSheets();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.points).toHaveLength(5);
    // Finland conceded nothing in the two 2026 matches and in none of the rest.
    expect(result.points.at(-1)).toMatchObject({ kept: 2 });
  });

  it("reads the half-time score from Finland's own side", async () => {
    // Home and behind at the break, winning at the end; then away and ahead at
    // the break, losing at the end. One of each, from Finland's point of view.
    const halves = years([
      2026,
      [
        match({
          kickoffAt: new Date("2026-06-01T18:00:00Z"),
          homeGoals: 2,
          awayGoals: 1,
          halfTimeHome: 0,
          halfTimeAway: 1,
        }),
        match({
          kickoffAt: new Date("2026-09-01T18:00:00Z"),
          homeTeamProviderId: 99,
          homeTeamName: "Ruotsi",
          awayTeamProviderId: FINLAND_TEAM_ID,
          awayTeamName: "Suomi",
          homeGoals: 2,
          awayGoals: 1,
          halfTimeHome: 0,
          halfTimeAway: 1,
        }),
      ],
    ]);

    const result = await nationalTeamAnalytics(halves).loadComebacks();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.known).toBe(2);
    expect(result.trailed).toMatchObject({ matches: 1, won: 1 });
    expect(result.led).toMatchObject({ matches: 1, lost: 1 });
  });

  it("compares the newest year against every earlier one, with no Sijoitus row", async () => {
    const result = await nationalTeamAnalytics(given).loadComparison();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.seasons).toBe(2);
    // The baseline's periods are named by year (specs/041, S8).
    expect(result.competitions).toEqual(["2024", "2025"]);
    // A knockout, a friendly and a qualifier rank nobody, so the row is gone
    // rather than shown as `–` (specs/041, S7).
    expect(result.rows.map((row) => row.measure)).not.toContain("position");
    expect(result.rows).not.toEqual([]);
  });

  it("has no comparison when nothing has been played", async () => {
    const result = await nationalTeamAnalytics(
      years([2026, [scheduled(2026, 20)]])
    ).loadComparison();

    expect(result).toEqual({ status: "unavailable" });
  });

  it("lets a record run across 31 December, and names the span it covers", async () => {
    const crossing = years(
      [2026, [home(2026, 1, 1, 0), away(2026, 5, 2, 0)]],
      [2025, [home(2025, 1, 3, 0)]]
    );
    const result = await nationalTeamAnalytics(crossing).loadRecords();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Three wins, and the run is not cut at the year boundary (specs/041, S4).
    expect(result.records.wins).toEqual({ length: 3, from: "2025", to: "2026" });
    // Not the competitions met: how far back the records reach (specs/041, S12).
    expect(result.scope).toBe("2025–2026");
  });
});
