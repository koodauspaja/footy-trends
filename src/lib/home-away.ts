/**
 * A team's season split into its home and its away matches — the data behind
 * the team page's `Koti- ja vierastilastot` panel (specs/033).
 *
 * Counted over exactly the matches the form and goals charts count; the
 * services pass them in. Home and away are the fixture's own sides, so the two
 * add up to the standings table's row.
 */
import { goalsFor, type ResultMatch } from "./form-series";

/** One side's raw counts. Every measure the panel shows is derived from these. */
export type SideStats = {
  matches: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
};

export type HomeAwaySeries =
  | { status: "ok"; home: SideStats; away: SideStats }
  /** No league table for this team's season, so no panel (specs/031, Q2). */
  | { status: "unavailable" }
  | { status: "error" };

const EMPTY: SideStats = { matches: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0 };

/** Both sides' counts from this team's finished league matches. */
export function homeAwayStats(
  finished: readonly ResultMatch[],
  teamId: number
): { home: SideStats; away: SideStats } {
  const sides = { home: { ...EMPTY }, away: { ...EMPTY } };

  for (const match of finished) {
    const side = sideOf(match, teamId, sides);
    if (side === null) continue;

    const [own, other] = goalsFor(match, teamId);
    side.matches += 1;
    side.scored += own;
    side.conceded += other;
    if (own > other) side.won += 1;
    else if (own === other) side.drawn += 1;
    else side.lost += 1;
  }

  return sides;
}

/** The side this match counts on, or `null` for another team's match. */
function sideOf(
  match: ResultMatch,
  teamId: number,
  sides: { home: SideStats; away: SideStats }
): SideStats | null {
  if (match.homeTeamProviderId === teamId) return sides.home;
  if (match.awayTeamProviderId === teamId) return sides.away;
  return null;
}

/**
 * The four measures, each `null` for a side with no match yet — shown as `–`,
 * never as a 0 that would read as a real zero (specs/033, Q7).
 */
export function pointsPerMatch(side: SideStats): number | null {
  return perMatch(side, 3 * side.won + side.drawn);
}

export function scoredPerMatch(side: SideStats): number | null {
  return perMatch(side, side.scored);
}

export function concededPerMatch(side: SideStats): number | null {
  return perMatch(side, side.conceded);
}

export function winPercentage(side: SideStats): number | null {
  const share = perMatch(side, side.won);
  return share === null ? null : share * 100;
}

function perMatch(side: SideStats, total: number): number | null {
  return side.matches === 0 ? null : total / side.matches;
}
