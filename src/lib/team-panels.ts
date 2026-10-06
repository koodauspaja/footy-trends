/**
 * The six result panels of a team's `Analyysit` (form, goals, home and away,
 * clean sheets, streaks, comebacks), built from one list of the team's
 * finished matches. A provider supplies only which matches count.
 *
 * decisions/530-one-team-panel-builder.md
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
 * `unavailable` is a team with no panels at all, not an empty season; `error`
 * is a read that failed.
 *
 * decisions/031-rolling-form-trend.md
 * decisions/530-one-team-panel-builder.md
 */
export type TeamPanelMatches =
  | { status: "ok"; finished: HalfTimeMatch[] }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * The six loaders, named as `AnalyticsSection` takes them.
 *
 * decisions/530-one-team-panel-builder.md
 */
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
 * needs to find it. The team's id alone does not say which team.
 *
 * decisions/530-one-team-panel-builder.md
 */
export type TeamPanelContext = { teamProviderId: number } & Readonly<
  Record<string, string | number>
>;

/**
 * The six panels' loaders over one read of the team's matches. Thunks, so
 * nothing is read or computed until a panel is asked for. A read that fails is
 * logged once, as a failed read.
 *
 * decisions/530-one-team-panel-builder.md
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
          // The error last, so no key of the caller's can replace it.
          { ...context, err: error },
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
        logger.error({ ...context, err: error }, `Unable to compute the ${name}`);
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
