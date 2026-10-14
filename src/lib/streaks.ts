/**
 * A team's streaks in a season: the data behind the team page's `Putket`
 * panel. Counted over the matches the other result panels count, in their
 * order, with the same match numbers the charts plot.
 *
 * decisions/035-streaks.md
 * decisions/031-rolling-form-trend.md
 */
import { goalsFor, type ResultMatch, teamMatchesInOrder } from "./form-series";

/**
 * One match's outcome for this team.
 *
 * decisions/035-streaks.md
 */
export type Outcome = "win" | "draw" | "defeat";

/**
 * The kinds of run the panel reports a longest of.
 *
 * decisions/035-streaks.md
 */
export type StreakKind = "wins" | "unbeaten" | "defeats" | "winless";

/**
 * A run of matches, by the match numbers the charts use.
 *
 * decisions/035-streaks.md
 */
export type Streak = { length: number; from: number; to: number };

/**
 * The run the team is on now, counted back from its last match.
 *
 * decisions/035-streaks.md
 */
export type CurrentStreak = { outcome: Outcome; length: number };

export type Streaks = {
  /** `null` before the first match. */
  current: CurrentStreak | null;
  /** `null` for a kind the season has none of — no win, no defeat. */
  longest: Record<StreakKind, Streak | null>;
};

export type StreaksSeries =
  | ({ status: "ok" } & Streaks)
  /** No league table for this team's season, so no panel. */
  | { status: "unavailable" }
  | { status: "error" };

/**
 * Which outcomes each kind of run is made of.
 *
 * decisions/035-streaks.md
 */
const KINDS: Record<StreakKind, readonly Outcome[]> = {
  wins: ["win"],
  unbeaten: ["win", "draw"],
  defeats: ["defeat"],
  winless: ["defeat", "draw"],
};

/**
 * Every streak figure from this team's finished matches. `finished` may hold
 * every team's matches; only this team's count, read from its own side of each
 * fixture.
 *
 * decisions/035-streaks.md
 */
export function streaksOf(finished: readonly ResultMatch[], teamId: number): Streaks {
  const outcomes = teamMatchesInOrder(finished, teamId).map((match) => outcomeOf(match, teamId));

  return {
    current: currentStreak(outcomes),
    longest: {
      wins: longestRun(outcomes, KINDS.wins),
      unbeaten: longestRun(outcomes, KINDS.unbeaten),
      defeats: longestRun(outcomes, KINDS.defeats),
      winless: longestRun(outcomes, KINDS.winless),
    },
  };
}

/**
 * This team's outcome in one match, from its own side.
 *
 * decisions/035-streaks.md
 */
function outcomeOf(match: ResultMatch, teamId: number): Outcome {
  const [own, other] = goalsFor(match, teamId);
  if (own > other) return "win";
  return own === other ? "draw" : "defeat";
}

/**
 * The run the team is on now: its last match's outcome, and how many matches
 * in a row ended that way. A draw ends a run of wins, which is what a reader
 * means by "on a run of three wins".
 *
 * decisions/035-streaks.md
 */
function currentStreak(outcomes: readonly Outcome[]): CurrentStreak | null {
  const last = outcomes.at(-1);
  if (last === undefined) return null;

  let length = 0;
  for (let index = outcomes.length - 1; index >= 0 && outcomes[index] === last; index -= 1) {
    length += 1;
  }

  return { outcome: last, length };
}

/**
 * The longest run of the given outcomes, and which matches it spans. The first
 * of equally long runs is reported.
 *
 * decisions/035-streaks.md
 */
function longestRun(outcomes: readonly Outcome[], kinds: readonly Outcome[]): Streak | null {
  let best: Streak | null = null;
  let start: number | null = null;

  outcomes.forEach((outcome, index) => {
    if (!kinds.includes(outcome)) {
      start = null;
      return;
    }
    start ??= index;
    const length = index - start + 1;
    if (best === null || length > best.length) best = { length, from: start + 1, to: index + 1 };
  });

  return best;
}
