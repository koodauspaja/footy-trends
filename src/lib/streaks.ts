/**
 * A team's streaks in a season — the data behind the team page's `Putket`
 * panel (specs/035).
 *
 * Counted over exactly the matches the other result panels count, in their
 * order (`teamMatchesInOrder`); the services pass them in. Match numbers are
 * the same ones the charts plot, so "Ottelut 5–9" means the same five matches
 * there and here.
 */
import { goalsFor, type ResultMatch, teamMatchesInOrder } from "./form-series";

/** One match's outcome for this team. */
export type Outcome = "win" | "draw" | "defeat";

/** The kinds of run the panel reports a longest of (specs/035, Q2). */
export type StreakKind = "wins" | "unbeaten" | "defeats" | "winless";

/** A run of matches, by the match numbers the charts use. */
export type Streak = { length: number; from: number; to: number };

/** The run the team is on now, counted back from its last match. */
export type CurrentStreak = { outcome: Outcome; length: number };

export type Streaks = {
  /** `null` before the first match. */
  current: CurrentStreak | null;
  /** `null` for a kind the season has none of — no win, no defeat. */
  longest: Record<StreakKind, Streak | null>;
};

export type StreaksSeries =
  | ({ status: "ok" } & Streaks)
  /** No league table for this team's season, so no panel (specs/031, Q2). */
  | { status: "unavailable" }
  | { status: "error" };

/** Which outcomes each kind of run is made of. */
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

/** This team's outcome in one match, from its own side. */
function outcomeOf(match: ResultMatch, teamId: number): Outcome {
  const [own, other] = goalsFor(match, teamId);
  if (own > other) return "win";
  return own === other ? "draw" : "defeat";
}

/**
 * The run the team is on now: its last match's outcome, and how many matches
 * in a row ended that way. A draw ends a run of wins, which is what a reader
 * means by "on a run of three wins".
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
 * The longest run of the given outcomes, and which matches it spans.
 *
 * **The first of equally long runs is reported** (specs/035, Q5), so the answer
 * does not move as the season goes on.
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
