/**
 * The pure half of the match page: what a stored row *reads* as.
 *
 * Everything here works on a plain row and returns strings, so the page itself
 * stays markup and the rules below are unit-testable without a database. See
 * specs/019-match-page.md.
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
 * TASO stores a bracket slot that was never resolved to a club as a team with
 * this provider id and, usually, an empty name.
 *
 * Measured 2026-09-02: 22 such rows, 21 of them finished with a real score,
 * three of them in Suomen Cup, which the site shows. `matches` has none.
 *
 * It is not an identity, and that is the whole point: a head-to-head joined on
 * it would pair a match against every other unresolved slot that happened to
 * face the same opponent, and present the result as previous meetings.
 */
export const PLACEHOLDER_TEAM_ID = 0;

/** Shown in place of a placeholder's empty name. Finnish, like every string here. */
export const UNKNOWN_TEAM_NAME = "Tuntematon joukkue";

export type MatchTeams = {
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
};

/** A team the provider never resolved: no id worth joining on, and no name worth showing. */
export function isPlaceholderTeam(teamProviderId: number, teamName: string): boolean {
  return teamProviderId === PLACEHOLDER_TEAM_ID || teamName.trim() === "";
}

/** Whether either side is a placeholder, which is what suppresses the head-to-head. */
export function hasPlaceholderTeam(match: MatchTeams): boolean {
  return (
    isPlaceholderTeam(match.homeTeamProviderId, match.homeTeamName) ||
    isPlaceholderTeam(match.awayTeamProviderId, match.awayTeamName)
  );
}

/** The name to render, never an empty string and never a link target. */
export function teamDisplayName(teamProviderId: number, teamName: string): string {
  return isPlaceholderTeam(teamProviderId, teamName) ? UNKNOWN_TEAM_NAME : teamName;
}

const kickoffFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * `12.09.2026 klo 18.30` — the list pages' date, plus the time this page adds.
 *
 * Assembled from parts rather than a format string: `fi-FI` renders the time as
 * `18.30`, which is correct Finnish, but joins it to the date with `klo` only
 * in some runtimes. Stating the separator here makes the output the same
 * everywhere, which is also what makes it testable.
 */
export function formatKickoff(kickoffAt: Date): string {
  const parts = kickoffFormatter.formatToParts(kickoffAt);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const date = `${value("day")}.${value("month")}.${value("year")}`;
  return `${date} klo ${value("hour")}.${value("minute")}`;
}

/** The score breakdown football-data records behind a knockout tie. TASO has none. */
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
 * The score as the page shows it.
 *
 * `homeGoals`/`awayGoals` is the provider's `fullTime`, which **includes** a
 * penalty shootout — printing it raw turns a 1–1 settled on penalties into a
 * "4–3" that was never the score. Where the breakdown exists, normal time plus
 * extra time is the score, and the shootout is stated separately. This is the
 * same correction `BracketLeg` documents; the suffixes match the bracket's so
 * one match cannot read two ways on two pages.
 */
export function formatScore(match: ScoreBreakdown): string {
  const extraTime =
    match.extraTimeHome !== null &&
    match.extraTimeHome !== undefined &&
    match.extraTimeAway !== null &&
    match.extraTimeAway !== undefined;
  const regularTime =
    match.regularTimeHome !== null &&
    match.regularTimeHome !== undefined &&
    match.regularTimeAway !== null &&
    match.regularTimeAway !== undefined;

  const [home, away] =
    regularTime && extraTime
      ? [
          (match.regularTimeHome ?? 0) + (match.extraTimeHome ?? 0),
          (match.regularTimeAway ?? 0) + (match.extraTimeAway ?? 0),
        ]
      : [match.homeGoals, match.awayGoals];

  const score = formatMatchResult(home, away);
  if (score === "–") return score;

  if (match.penaltiesHome !== null && match.penaltiesHome !== undefined) {
    return `${score} (rp ${match.penaltiesHome}–${match.penaltiesAway})`;
  }
  return extraTime ? `${score} (ja)` : score;
}

/**
 * Which side the provider says went through, but only where the score cannot
 * say it itself.
 *
 * TASO settles a level cup tie on penalties it never itemises, so the score
 * alone leaves the tie looking drawn. Naming the winner is all the data
 * supports — inventing an "(rp)" suffix would assert a shootout that is not
 * recorded. football-data omits `winner` entirely, so this is null there.
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
 * The lines under the heading: where and when this match sits.
 *
 * A missing value produces no line at all. A null `matchday` is ordinary, and
 * "Kierros –" would state an absence the reader has no use for.
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
 * What the match's number means, if anything.
 *
 * It is a round in a league or group phase, a leg in a two-legged knockout
 * round, and nothing at all elsewhere — the same three cases the match lists
 * already distinguish (`fourthColumnFor` in competition-matches-page.tsx),
 * decided here from one row rather than from a round's worth of them.
 *
 * On a knockout stage, only 1 and 2 are legs. Measured across every stored
 * knockout row on 2026-09-02: Champions League and Championship carry 1–2,
 * the World Cup carries null, and the Euro carries 4–7 — its group-round
 * counter running on into the knockout, which is not a leg and must not be
 * shown as one.
 *
 * A Finnish cup round shows nothing either: TASO's `round_id` is not
 * re-indexed per competition (round 63 exists), and the series name above it
 * already names the round. The domestic standings page drops the same column
 * for the same reason.
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

/** The stages that number their matches as rounds rather than as legs. */
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
