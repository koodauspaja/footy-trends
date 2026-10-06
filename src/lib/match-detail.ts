/**
 * The pure half of the match page: what a stored row reads as. Everything
 * works on a plain row and returns strings.
 *
 * decisions/019-match-page.md
 */

import {
  GROUP_STAGE,
  getGroupName,
  getStageName,
  LEAGUE_STAGE,
  REGULAR_SEASON,
} from "./cup-stages";
import { formatMatchResult } from "./standings";

/**
 * The provider id TASO stores for a bracket slot never resolved to a club. Not
 * an identity: nothing may be joined on it.
 *
 * decisions/019-match-page.md
 */
export const PLACEHOLDER_TEAM_ID = 0;

/**
 * Shown in place of a placeholder's empty name.
 *
 * decisions/019-match-page.md
 */
export const UNKNOWN_TEAM_NAME = "Tuntematon joukkue";

export type MatchTeams = {
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
};

/**
 * A team the provider never resolved: no id worth joining on, and no name worth showing.
 *
 * decisions/019-match-page.md
 */
export function isPlaceholderTeam(teamProviderId: number, teamName: string): boolean {
  return teamProviderId === PLACEHOLDER_TEAM_ID || teamName.trim() === "";
}

/**
 * Whether either side is a placeholder, which is what suppresses the head-to-head.
 *
 * decisions/019-match-page.md
 */
export function hasPlaceholderTeam(match: MatchTeams): boolean {
  return (
    isPlaceholderTeam(match.homeTeamProviderId, match.homeTeamName) ||
    isPlaceholderTeam(match.awayTeamProviderId, match.awayTeamName)
  );
}

/**
 * The name to render, never an empty string and never a link target.
 *
 * decisions/019-match-page.md
 */
export function teamDisplayName(teamProviderId: number, teamName: string): string {
  return isPlaceholderTeam(teamProviderId, teamName) ? UNKNOWN_TEAM_NAME : teamName;
}

const kickoffDateFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const kickoffTimeFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * `12.09.2026 klo 18.30`: the list pages' date, plus the time this page adds.
 *
 * decisions/019-match-page.md
 */
export function formatKickoff(kickoffAt: Date): string {
  return `${kickoffDateFormatter.format(kickoffAt)} klo ${kickoffTimeFormatter.format(kickoffAt)}`;
}

/**
 * A score pair, or `null` unless both halves are present.
 *
 * decisions/019-match-page.md
 */
function bothOrNeither(
  home: number | null | undefined,
  away: number | null | undefined
): [number, number] | null {
  return home === null || home === undefined || away === null || away === undefined
    ? null
    : [home, away];
}

/**
 * The score breakdown football-data records behind a knockout tie. TASO has none.
 *
 * decisions/019-match-page.md
 */
export type ScoreBreakdown = {
  homeGoals: number | null;
  awayGoals: number | null;
  regularTimeHome?: number | null;
  regularTimeAway?: number | null;
  extraTimeHome?: number | null;
  extraTimeAway?: number | null;
  penaltiesHome?: number | null;
  penaltiesAway?: number | null;
};

/**
 * The score as the page shows it: where the breakdown exists, normal time plus
 * extra time, with the shoot-out stated separately.
 *
 * decisions/019-match-page.md
 */
export function formatScore(match: ScoreBreakdown): string {
  const regular = bothOrNeither(match.regularTimeHome, match.regularTimeAway);
  const extra = bothOrNeither(match.extraTimeHome, match.extraTimeAway);
  const penalties = bothOrNeither(match.penaltiesHome, match.penaltiesAway);

  const [home, away] =
    regular !== null && extra !== null
      ? [regular[0] + extra[0], regular[1] + extra[1]]
      : [match.homeGoals, match.awayGoals];

  const score = formatMatchResult(home, away);
  if (score === "–") return score;

  // Half a shootout is not a shootout: one total without the other would print
  // "(rp 4–null)". `formatLeg` in the bracket has always required both, which
  // is what `bothOrNeither` states once for all three pairs here.
  if (penalties !== null) return `${score} (rp ${penalties[0]}–${penalties[1]})`;
  return extra !== null ? `${score} (ja)` : score;
}

/**
 * Which side the provider says went through, where the score cannot say it
 * itself. Null for football-data, which omits `winner`.
 *
 * decisions/019-match-page.md
 */
export function declaredWinnerSide(
  match: { homeGoals: number | null; awayGoals: number | null },
  winner: "home" | "away" | "tie" | null | undefined
): "home" | "away" | null {
  if (winner !== "home" && winner !== "away") return null;
  if (match.homeGoals === null || match.awayGoals === null) return null;
  return match.homeGoals === match.awayGoals ? winner : null;
}

/**
 * The lines under the heading: where and when this match sits. A missing value
 * produces no line.
 *
 * decisions/019-match-page.md
 */
export type MatchContext =
  | {
      source: "football-data";
      competitionLabel: string | null;
      matchday: number | null;
      stage: string | null;
      groupName: string | null;
    }
  | {
      source: "taso";
      competitionLabel: string | null;
      matchday: number | null;
      /** TASO's `group_name`: the series or cup round, already Finnish. */
      seriesName: string;
      /** A cup round *is* the series name — see `roundLine`. */
      isCup: boolean;
    };

/**
 * What the match's number means: a round in a league or group phase, a leg (1
 * or 2) in a two-legged knockout round, and nothing elsewhere.
 *
 * decisions/019-match-page.md
 */
function roundLine(context: MatchContext): string | null {
  if (context.matchday === null) return null;

  if (context.source === "taso") {
    return context.isCup ? null : `Kierros ${context.matchday}`;
  }

  const isKnockout =
    context.stage !== null && context.stage !== REGULAR_SEASON && !TABLE_STAGES.has(context.stage);
  if (!isKnockout) return `Kierros ${context.matchday}`;
  return context.matchday === 1 || context.matchday === 2 ? `Osaottelu ${context.matchday}` : null;
}

/**
 * The stages that number their matches as rounds, not as legs.
 *
 * decisions/019-match-page.md
 */
const TABLE_STAGES = new Set([LEAGUE_STAGE, GROUP_STAGE]);

export function matchContextLines(context: MatchContext): string[] {
  const lines: string[] = [];
  if (context.competitionLabel !== null) lines.push(context.competitionLabel);

  if (context.source === "football-data") {
    // `REGULAR_SEASON` is not a phase, it is the absence of one — every league
    // row carries it, and naming it would put a provider token on the page.
    if (context.stage !== null && context.stage !== REGULAR_SEASON) {
      lines.push(getStageName(context.stage));
    }
    if (context.groupName !== null) lines.push(getGroupName(context.groupName));
  } else if (context.seriesName !== "") {
    lines.push(context.seriesName);
  }

  const round = roundLine(context);
  if (round !== null) lines.push(round);
  return lines;
}
