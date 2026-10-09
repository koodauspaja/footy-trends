import { describe, expect, it } from "vitest";
import { threeWay } from "@/lib/elo";
import type { HomeBaseline } from "@/lib/home-baseline";
import {
  awaitsResult,
  eloLiveRow,
  isLoggable,
  LOG_WINDOW_HOURS,
  type LogCandidate,
  liveRow,
  RESULT_WINDOW_HOURS,
  refreshTargets,
} from "@/lib/prediction-log";

/**
 * The predictions log: its windows, which matches are logged and refreshed, and
 * the rows written.
 *
 * decisions/052-predictions-log.md
 * decisions/053-elo-ratings.md
 */

const NOW = new Date("2026-10-03T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

// A football-data match unless the overrides make it a TASO one, pair and all.
function candidate(overrides: Record<string, unknown> = {}): LogCandidate {
  return {
    source: "football-data",
    code: "PL",
    seasonId: 2026,
    providerMatchId: 1,
    kickoffAt: at(10),
    status: "TIMED",
    hasResult: false,
    ...overrides,
  } as LogCandidate;
}

describe("the windows", () => {
  it("logs 48 hours ahead and fetches results for 24 hours after kickoff", () => {
    expect(LOG_WINDOW_HOURS).toBe(48);
    expect(RESULT_WINDOW_HOURS).toBe(24);
  });
});

describe("isLoggable", () => {
  it("logs a scheduled or timed match inside the window, up to its last millisecond", () => {
    expect(isLoggable(candidate({ status: "SCHEDULED" }), NOW)).toBe(true);
    expect(isLoggable(candidate({ status: "TIMED" }), NOW)).toBe(true);
    expect(isLoggable(candidate({ kickoffAt: at(48) }), NOW)).toBe(true);
    expect(isLoggable(candidate({ kickoffAt: new Date(NOW.getTime() + 1) }), NOW)).toBe(true);
  });

  it("does not log a match beyond the window", () => {
    expect(isLoggable(candidate({ kickoffAt: new Date(at(48).getTime() + 1) }), NOW)).toBe(false);
  });

  it("never logs a passed kickoff, whatever the status says", () => {
    expect(isLoggable(candidate({ kickoffAt: NOW }), NOW)).toBe(false);
    expect(isLoggable(candidate({ kickoffAt: at(-1), status: "SCHEDULED" }), NOW)).toBe(false);
  });

  it.each(["IN_PLAY", "FINISHED", "POSTPONED", "CANCELLED", "Live"])(
    "does not log a %s match",
    (status) => {
      expect(isLoggable(candidate({ status }), NOW)).toBe(false);
    }
  );
});

describe("awaitsResult", () => {
  it("wants the result of a match that kicked off within the last 24 hours", () => {
    expect(awaitsResult(candidate({ kickoffAt: NOW, status: "IN_PLAY" }), NOW)).toBe(true);
    expect(awaitsResult(candidate({ kickoffAt: at(-3), status: "SCHEDULED" }), NOW)).toBe(true);
    expect(awaitsResult(candidate({ kickoffAt: new Date(at(-24).getTime() + 1) }), NOW)).toBe(true);
  });

  it("stops after 24 hours, before kickoff, and once the result is stored", () => {
    expect(awaitsResult(candidate({ kickoffAt: at(-24) }), NOW)).toBe(false);
    expect(awaitsResult(candidate({ kickoffAt: at(1) }), NOW)).toBe(false);
    expect(awaitsResult(candidate({ kickoffAt: at(-3), hasResult: true }), NOW)).toBe(false);
  });
});

describe("refreshTargets", () => {
  it("refreshes a competition once, whether for an upcoming match, a missing result or both", () => {
    const targets = refreshTargets(
      [
        candidate({ providerMatchId: 1, kickoffAt: at(5) }),
        candidate({ providerMatchId: 2, kickoffAt: at(-2), status: "IN_PLAY" }),
        candidate({ providerMatchId: 3, kickoffAt: at(30) }),
      ],
      NOW
    );

    expect(targets).toEqual([
      {
        source: "football-data",
        code: "PL",
        seasonId: 2026,
      },
    ]);
  });

  it("refreshes a competition with only a missing result", () => {
    expect(
      refreshTargets([candidate({ kickoffAt: at(-3), status: "FINISHED", hasResult: false })], NOW)
    ).toHaveLength(1);
  });

  it("does not refresh a competition with nothing to log and no result to fetch", () => {
    expect(
      refreshTargets(
        [
          candidate({ kickoffAt: at(-3), status: "FINISHED", hasResult: true }),
          candidate({ kickoffAt: at(60) }),
          candidate({ kickoffAt: at(-30) }),
        ],
        NOW
      )
    ).toEqual([]);
  });

  it("keeps each TASO season pair and each season apart", () => {
    const tasoMatch = (overrides: Record<string, unknown>) =>
      candidate({
        source: "taso",
        code: "P21SM",
        competitionId: "spljp26",
        categoryId: "P21SM",
        ...overrides,
      });
    const targets = refreshTargets(
      [
        tasoMatch({ providerMatchId: 1 }),
        tasoMatch({ providerMatchId: 2 }),
        tasoMatch({ providerMatchId: 3, code: "VL", categoryId: "VL" }),
        candidate({ providerMatchId: 4, seasonId: 2025 }),
        candidate({ providerMatchId: 5 }),
      ],
      NOW
    );

    expect(targets.map((target) => `${target.code}:${target.seasonId}`)).toEqual([
      "P21SM:2026",
      "VL:2026",
      "PL:2025",
      "PL:2026",
    ]);
    expect(targets[0]).toMatchObject({ competitionId: "spljp26", categoryId: "P21SM" });
  });
});

describe("liveRow", () => {
  const baseline: HomeBaseline = {
    status: "ok",
    matches: 200,
    homeShare: 45,
    drawShare: 25,
    awayShare: 30,
    seasons: { first: 2023, last: 2026 },
    spansCalendarYears: true,
  };

  it("writes the baseline's shares as probabilities, against the match's kickoff", () => {
    expect(liveRow(candidate({ providerMatchId: 7 }), baseline, "home-baseline-v1", NOW)).toEqual({
      source: "football-data",
      providerMatchId: 7,
      competitionCode: "PL",
      model: "home-baseline-v1",
      kind: "live",
      homeProbability: 0.45,
      drawProbability: 0.25,
      awayProbability: 0.3,
      predictedAt: NOW,
      kickoffAt: at(10),
    });
  });

  it("writes nothing when the baseline has no percentages or failed", () => {
    expect(liveRow(candidate(), { status: "empty" }, "home-baseline-v1", NOW)).toBeNull();
    expect(liveRow(candidate(), { status: "error" }, "home-baseline-v1", NOW)).toBeNull();
  });
});

describe("eloLiveRow", () => {
  const baseline: HomeBaseline = {
    status: "ok",
    matches: 100,
    homeShare: 45,
    drawShare: 25,
    awayShare: 30,
    seasons: { first: 2023, last: 2026 },
    spansCalendarYears: false,
  };
  const match = candidate({ homeTeam: 11, awayTeam: 22, seasonId: 2026 });

  it("predicts from the ratings at the match's season, regressed into a new one", () => {
    const ratings = new Map([[11, { rating: 1650, seasonId: 2025 }]]);

    const row = eloLiveRow(match, ratings, baseline, NOW);

    // 1650 last season is 1600 this one; 22 has never played, so 1500.
    const expected = threeWay(1600, 1500, 0.25);
    expect(row).toEqual({
      source: "football-data",
      providerMatchId: 1,
      competitionCode: "PL",
      model: "elo-v1",
      kind: "live",
      homeProbability: expect.closeTo(expected.home, 12),
      drawProbability: 0.25,
      awayProbability: expect.closeTo(expected.away, 12),
      predictedAt: NOW,
      kickoffAt: at(10),
    });
  });

  it("writes nothing without a draw share, or for a placeholder side", () => {
    expect(eloLiveRow(match, new Map(), { status: "empty" }, NOW)).toBeNull();
    expect(eloLiveRow(match, new Map(), { status: "error" }, NOW)).toBeNull();
    expect(eloLiveRow({ ...match, homeTeam: 0 }, new Map(), baseline, NOW)).toBeNull();
  });
});
