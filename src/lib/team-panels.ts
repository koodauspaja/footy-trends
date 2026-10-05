/**
 * The six result panels of a team's `Analyysit` — form, goals, home and away,
 * clean sheets, streaks, comebacks — built from one list of the team's finished
 * matches (#530).
 *
 * Each provider's service used to carry six wrappers of its own, twelve
 * near-identical functions: load the team's matches, answer "no matches", call
 * a pure function, log a failure. What differs between providers is only
 * *which* matches count, so that is the one thing a provider supplies:
 * `getTeamPanelMatches` in `standings-service.ts` and in
 * `taso-standings-service.ts`, and the whole stored history for a national team
 * (`national-team-analytics.ts`).
 *
 * **An empty list needs no branch of its own.** Every pure function answers
 * one as the wrappers' "no matches" branches did: no form before the fifth
 * match, empty charts, zeroed figures. `tests/unit/lib/team-panels.test.ts`
 * holds them to it.
 */
import { type CleanSheetSeries, cleanSheetSeries } from "./clean-sheets";
import { type ComebacksSeries, comebacksOf, type HalfTimeMatch } from "./comebacks";
import { type FormSeries, formSeries } from "./form-series";
import { type GoalsSeries, goalsSeries } from "./goals-series";
import { type HomeAwaySeries, homeAwayStats } from "./home-away";
import { logger } from "./logger";
import { type StreaksSeries, streaksOf } from "./streaks";

/**
 * The finished matches a team's panels count, or why there are none to count.
 *
 * `unavailable` is not an empty season: it is a team with no panels at all,
 * as a TASO team that played only in knockout groups has no league figures
 * (specs/031, Q2). `error` is a read that failed, which no panel may show as
 * "nothing played".
 */
export type TeamPanelMatches =
  | { status: "ok"; finished: HalfTimeMatch[] }
  | { status: "unavailable" }
  | { status: "error" };

/** The six loaders, named as `AnalyticsSection` takes them. */
export type TeamPanelLoaders = {
  loadForm: () => Promise<FormSeries>;
  loadGoals: () => Promise<GoalsSeries>;
  loadHomeAway: () => Promise<HomeAwaySeries>;
  loadCleanSheets: () => Promise<CleanSheetSeries>;
  loadStreaks: () => Promise<StreaksSeries>;
  loadComebacks: () => Promise<ComebacksSeries>;
};

/**
 * Whose panels these are: the team, and whatever else a failure's log line
 * needs to find it.
 *
 * **The team's id alone does not say which team.** Each provider numbers its
 * teams separately, so 57 is one club at football-data and another at TASO. A
 * caller adds what places it: the competition and the season, as the deleted
 * wrappers logged them.
 */
export type TeamPanelContext = { teamProviderId: number } & Readonly<
  Record<string, string | number>
>;

/**
 * The six panels' loaders over one read of the team's matches.
 *
 * Thunks, so nothing is read or computed until a panel is asked for: the gate
 * in `AnalyticsSection` runs before any of them. The matches are read once
 * however many panels ask.
 *
 * **A read that fails is logged once, as a failed read.** Both providers' own
 * loaders catch and log their failures, but nothing obliges the next caller
 * to; without the catch here, one rejected read would surface as six panels
 * each reporting that it could not be computed.
 */
export function teamPanelLoaders(
  context: TeamPanelContext,
  load: () => Promise<TeamPanelMatches>
): TeamPanelLoaders {
  const { teamProviderId } = context;
  let read: Promise<TeamPanelMatches> | undefined;

  // Through `then`, so a `load` that throws before returning a promise is
  // caught as well as one whose promise rejects.
  function matches(): Promise<TeamPanelMatches> {
    read ??= Promise.resolve()
      .then(load)
      .catch((error: unknown) => {
        logger.error(
          { err: error, ...context },
          "Unable to read the matches a team's panels count"
        );
        return { status: "error" as const };
      });
    return read;
  }

  function panel<T>(name: string, build: (finished: HalfTimeMatch[]) => T) {
    return async (): Promise<T | { status: "unavailable" } | { status: "error" }> => {
      const result = await matches();
      if (result.status !== "ok") return { status: result.status };
      try {
        return build(result.finished);
      } catch (error) {
        logger.error({ err: error, ...context }, `Unable to compute the ${name}`);
        return { status: "error" };
      }
    };
  }

  return {
    loadForm: panel("form series", (finished) => formSeries(finished, teamProviderId)),
    loadGoals: panel("goals series", (finished) => goalsSeries(finished, teamProviderId)),
    loadHomeAway: panel("home and away series", (finished) => ({
      status: "ok" as const,
      ...homeAwayStats(finished, teamProviderId),
    })),
    loadCleanSheets: panel("clean-sheet series", (finished) =>
      cleanSheetSeries(finished, teamProviderId)
    ),
    loadStreaks: panel("streaks", (finished) => ({
      status: "ok" as const,
      ...streaksOf(finished, teamProviderId),
    })),
    loadComebacks: panel("comebacks", (finished) => ({
      status: "ok" as const,
      ...comebacksOf(finished, teamProviderId),
    })),
  };
}
