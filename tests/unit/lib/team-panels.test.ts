import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanSheetSeries } from "@/lib/clean-sheets";
import { comebacksOf, type HalfTimeMatch } from "@/lib/comebacks";
import { formSeries } from "@/lib/form-series";
import { goalsSeries } from "@/lib/goals-series";
import { homeAwayStats } from "@/lib/home-away";
import { streaksOf } from "@/lib/streaks";

const loggerErrorMock = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { error: loggerErrorMock } }));

const { teamPanelLoaders } = await import("@/lib/team-panels");

/**
 * The one builder of a team's six result panels (#530). Each provider's
 * service used to have six wrappers of its own; their tests still run, through
 * this, in `standings-service.test.ts` and `taso-standings-service.test.ts`.
 * What is here is the builder's own contract.
 */
const TEAM = 1;
const LOADERS = [
  "loadForm",
  "loadGoals",
  "loadHomeAway",
  "loadCleanSheets",
  "loadStreaks",
  "loadComebacks",
] as const;

function match(index: number, overrides: Partial<HalfTimeMatch> = {}): HalfTimeMatch {
  return {
    providerMatchId: index,
    kickoffAt: new Date(Date.UTC(2026, 3, index)),
    homeTeamProviderId: index % 2 === 0 ? TEAM : 2,
    awayTeamProviderId: index % 2 === 0 ? 2 : TEAM,
    homeGoals: index % 3,
    awayGoals: 1,
    halfTimeHome: 0,
    halfTimeAway: index % 2,
    ...overrides,
  };
}

const SEASON = Array.from({ length: 7 }, (_, index) => match(index + 1));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("teamPanelLoaders", () => {
  it("builds each panel from the team's finished matches, by that panel's own function", async () => {
    const panels = teamPanelLoaders(TEAM, async () => ({ status: "ok", finished: SEASON }));

    expect(await panels.loadForm()).toEqual(formSeries(SEASON, TEAM));
    expect(await panels.loadGoals()).toEqual(goalsSeries(SEASON, TEAM));
    expect(await panels.loadHomeAway()).toEqual({ status: "ok", ...homeAwayStats(SEASON, TEAM) });
    expect(await panels.loadCleanSheets()).toEqual(cleanSheetSeries(SEASON, TEAM));
    expect(await panels.loadStreaks()).toEqual({ status: "ok", ...streaksOf(SEASON, TEAM) });
    expect(await panels.loadComebacks()).toEqual({ status: "ok", ...comebacksOf(SEASON, TEAM) });
    // Seven matches are enough for every panel to have something to say, so
    // the comparison above is not six empty answers agreeing with each other.
    expect(await panels.loadForm()).toMatchObject({ status: "ok" });
    expect(await panels.loadStreaks()).toMatchObject({ current: expect.anything() });
  });

  it("counts for the team it was given, not for whoever is in the list", async () => {
    const panels = teamPanelLoaders(2, async () => ({ status: "ok", finished: SEASON }));

    expect(await panels.loadHomeAway()).toEqual({ status: "ok", ...homeAwayStats(SEASON, 2) });
    expect(await panels.loadHomeAway()).not.toEqual({
      status: "ok",
      ...homeAwayStats(SEASON, TEAM),
    });
  });

  it("answers a season with nothing played as the wrappers' own no-matches branches did", async () => {
    // Written out, not computed: these are the six answers the twelve deleted
    // wrappers returned for an empty season, and what each panel's empty state
    // is drawn from.
    const panels = teamPanelLoaders(TEAM, async () => ({ status: "ok", finished: [] }));
    const none = { matches: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0 };
    const noOutcomes = { matches: 0, won: 0, drew: 0, lost: 0 };

    expect(await panels.loadForm()).toEqual({ status: "too-few" });
    expect(await panels.loadGoals()).toEqual({ status: "ok", rolling: [], totals: [] });
    expect(await panels.loadHomeAway()).toEqual({ status: "ok", home: none, away: none });
    expect(await panels.loadCleanSheets()).toEqual({ status: "ok", points: [] });
    expect(await panels.loadStreaks()).toEqual({
      status: "ok",
      current: null,
      longest: { wins: null, unbeaten: null, defeats: null, winless: null },
    });
    expect(await panels.loadComebacks()).toEqual({
      status: "ok",
      trailed: noOutcomes,
      led: noOutcomes,
      missing: 0,
      known: 0,
    });
  });

  it.each(["unavailable", "error"] as const)(
    "gives every panel %s when the matches are, which is not an empty season",
    async (status) => {
      const panels = teamPanelLoaders(TEAM, async () => ({ status }));

      for (const loader of LOADERS) {
        expect(await panels[loader](), loader).toEqual({ status });
      }
      expect(loggerErrorMock).not.toHaveBeenCalled();
    }
  );

  it("reads nothing until a panel is asked for, and then once for all six", async () => {
    const load = vi.fn(async () => ({ status: "ok" as const, finished: SEASON }));
    const panels = teamPanelLoaders(TEAM, load);

    // The gate in `AnalyticsSection` runs before any loader: a signed-out
    // request must cost nothing.
    expect(load).not.toHaveBeenCalled();

    await Promise.all(LOADERS.map((loader) => panels[loader]()));

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reports an error for the panel, and logs it, when the read throws", async () => {
    const failure = new Error("database down");
    const panels = teamPanelLoaders(TEAM, async () => {
      throw failure;
    });

    expect(await panels.loadGoals()).toEqual({ status: "error" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: failure, teamProviderId: TEAM },
      "Unable to compute the goals series"
    );
  });

  it("names the panel it could not compute", async () => {
    // A match no panel can read: the failure is the builder's, not the read's.
    const broken = [null as unknown as HalfTimeMatch];
    const panels = teamPanelLoaders(TEAM, async () => ({ status: "ok", finished: broken }));

    const expected = {
      loadForm: "form series",
      loadGoals: "goals series",
      loadHomeAway: "home and away series",
      loadCleanSheets: "clean-sheet series",
      loadStreaks: "streaks",
      loadComebacks: "comebacks",
    } as const;
    for (const loader of LOADERS) {
      expect(await panels[loader](), loader).toEqual({ status: "error" });
      expect(loggerErrorMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamProviderId: TEAM }),
        `Unable to compute the ${expected[loader]}`
      );
    }
  });
});
