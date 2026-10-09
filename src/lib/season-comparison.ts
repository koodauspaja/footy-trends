/**
 * The selected season set against the club's other stored seasons. Pure: the
 * services pass the seasons in. A rate is pooled over the other seasons'
 * matches; a position is read at the same share of each season and averaged.
 *
 * decisions/038-season-against-history.md
 * decisions/040-cup-analytics.md
 */
import { cleanSheetSeries } from "./clean-sheets";
import type { ResultMatch } from "./form-series";
import {
  concededPerMatch,
  homeAwayStats,
  pointsPerMatch,
  type SideStats,
  scoredPerMatch,
  winPercentage,
} from "./home-away";
import { lastRoundPlayedBy, type PositionPoint } from "./position-series";

/**
 * Where the club stood, and how many teams it was ranked among.
 *
 * decisions/038-season-against-history.md
 */
export type SeasonPosition = { place: number; teamCount: number };

/**
 * A finished match that also knows its round: both providers' rows satisfy it.
 *
 * decisions/038-season-against-history.md
 */
export type SeasonMatch = ResultMatch & { matchday: number | null };

/**
 * One season's whole contribution, computed from that season's own matches.
 *
 * decisions/038-season-against-history.md
 */
export type SeasonSummary = {
  /** The club's counts, home and away summed: the standings row. */
  stats: SideStats;
  /** Matches the club conceded nothing in. */
  cleanSheets: number;
  /** Read at the matched share of the season; `null` when the season ranks nothing. */
  position: SeasonPosition | null;
};

/**
 * The measures the panel shows, in the order it shows them.
 *
 * decisions/038-season-against-history.md
 */
export const MEASURES = [
  "position",
  "points",
  "scored",
  "conceded",
  "cleanSheets",
  "winPercentage",
] as const;

export type Measure = (typeof MEASURES)[number];

/**
 * One row: the selected season's value and the baseline's, in the measure's own
 * units. `null` is no value, printed as `–` and never as 0. A position is a
 * share of the table, 0 to 1, smaller is better.
 *
 * decisions/038-season-against-history.md
 */
export type ComparisonRow = { measure: Measure; selected: number | null; baseline: number | null };

const EMPTY: SideStats = { matches: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0 };

/**
 * One season's summary from its finished matches. `position` is the caller's.
 *
 * decisions/038-season-against-history.md
 */
export function summariseSeason(
  finished: readonly ResultMatch[],
  teamId: number,
  position: SeasonPosition | null
): SeasonSummary {
  const { home, away } = homeAwayStats(finished, teamId);
  const lastPoint = cleanSheetSeries(finished, teamId).points.at(-1);

  return {
    stats: addStats(home, away),
    cleanSheets: lastPoint?.kept ?? 0,
    position,
  };
}

/**
 * Every row of the panel, from the selected season and the seasons it is compared with.
 *
 * decisions/038-season-against-history.md
 */
export function comparisonRows(
  selected: SeasonSummary,
  others: readonly SeasonSummary[],
  measures: readonly Measure[] = MEASURES
): ComparisonRow[] {
  const pooled = others.reduce((total, season) => addStats(total, season.stats), EMPTY);
  const pooledCleanSheets = others.reduce((total, season) => total + season.cleanSheets, 0);

  return measures.map((measure) => ({
    measure,
    selected: measureValue(
      measure,
      selected.stats,
      selected.cleanSheets,
      shareOf(selected.position)
    ),
    baseline: measureValue(measure, pooled, pooledCleanSheets, meanShare(others)),
  }));
}

/**
 * A season's full length in rounds: its last scheduled round, not the last one
 * played. The denominator of every share below.
 *
 * decisions/038-season-against-history.md
 */
export function seasonLength(matches: readonly { matchday: number | null }[]): number | null {
  const rounds = matches.map((match) => match.matchday).filter(isNumber);
  return rounds.length === 0 ? null : Math.max(...rounds);
}

/**
 * How far through its season the club is: rounds played over rounds scheduled.
 *
 * decisions/038-season-against-history.md
 */
export function shareCompleted(
  lastRoundPlayed: number | null,
  length: number | null
): number | null {
  if (lastRoundPlayed === null || length === null || length <= 0) return null;
  return Math.min(1, lastRoundPlayed / length);
}

/**
 * Where the club stood at `share` of this season: its last position at or before
 * that round. `null` when it had none by then, a season it entered late.
 *
 * decisions/038-season-against-history.md
 */
export function positionAtShare(
  points: readonly PositionPoint[],
  length: number,
  share: number
): number | null {
  const target = Math.max(1, Math.round(share * length));
  const reached = points.filter((point) => point.round <= target);
  return reached.at(-1)?.position ?? null;
}

/**
 * A place as a share of its table: 3rd of 12 is 0,25, and smaller is better.
 *
 * decisions/038-season-against-history.md
 */
export function shareOf(position: SeasonPosition | null): number | null {
  if (position === null || position.teamCount <= 0) return null;
  return position.place / position.teamCount;
}

/**
 * The mean of the seasons that ranked the club at all; `null` when none did.
 *
 * decisions/038-season-against-history.md
 */
function meanShare(seasons: readonly SeasonSummary[]): number | null {
  const shares = seasons.map((season) => shareOf(season.position)).filter(isNumber);
  if (shares.length === 0) return null;

  return shares.reduce((total, share) => total + share, 0) / shares.length;
}

function measureValue(
  measure: Measure,
  stats: SideStats,
  cleanSheets: number,
  position: number | null
): number | null {
  switch (measure) {
    case "position":
      return position;
    case "points":
      return pointsPerMatch(stats);
    case "scored":
      return scoredPerMatch(stats);
    case "conceded":
      return concededPerMatch(stats);
    case "cleanSheets":
      return stats.matches === 0 ? null : (cleanSheets / stats.matches) * 100;
    default:
      return winPercentage(stats);
  }
}

/**
 * Two sides, or two seasons, added: the counts every measure is derived from.
 *
 * decisions/038-season-against-history.md
 */
function addStats(first: SideStats, second: SideStats): SideStats {
  return {
    matches: first.matches + second.matches,
    won: first.won + second.won,
    drawn: first.drawn + second.drawn,
    lost: first.lost + second.lost,
    scored: first.scored + second.scored,
    conceded: first.conceded + second.conceded,
  };
}

function isNumber(value: number | null): value is number {
  return value !== null;
}

/**
 * One season as the services read it: the club's finished matches, the whole
 * fixture list behind the share's denominator, and the per-round positions.
 *
 * decisions/038-season-against-history.md
 * decisions/040-cup-analytics.md
 */
export type SeasonRead = {
  /**
   * The competition's Finnish display name, from the registry. Never a provider
   * string and never a code.
   */
  competition: string;
  /** The club's finished matches. They carry their round, which the share needs. */
  finished: readonly SeasonMatch[];
  /** Every match of the season, scheduled included. */
  all: readonly { matchday: number | null }[];
  points: readonly PositionPoint[];
  teamCount: number;
};

/**
 * One season's read, told apart from its failures: a failed read is an error,
 * a season with nothing stored is one to leave out.
 *
 * decisions/038-season-against-history.md
 */
export type SeasonReadResult =
  | { status: "ok"; read: SeasonRead }
  /** Nothing stored for this season; not an error, just not a baseline. */
  | { status: "empty" }
  | { status: "error" };

export type SeasonComparisonSeries =
  | ({ status: "ok" } & SeasonComparison)
  /** No league table for this team's season, so no panel. */
  | { status: "unavailable" }
  | { status: "error" };

export type SeasonComparison = {
  rows: ComparisonRow[];
  /** How many other seasons the baseline covered. */
  seasons: number;
  /** The competitions they were played in, each named once, in the order met. */
  competitions: string[];
  /**
   * How many teams the selected season ranked the club among, so a share can be
   * printed as a place the reader recognises. `null` when it ranked nothing.
   */
  teamCount: number | null;
};

/**
 * The whole panel, from seasons the services have already read. Every other
 * season is read at the selected season's share of completion.
 *
 * decisions/038-season-against-history.md
 */
export function compareSeasons(
  teamId: number,
  selected: SeasonRead,
  others: readonly SeasonRead[],
  measures: readonly Measure[] = MEASURES
): SeasonComparison {
  const length = seasonLength(selected.all);
  const share = shareCompleted(lastRoundPlayedBy(selected.finished, teamId), length) ?? 1;

  return {
    rows: comparisonRows(
      summariseSeason(selected.finished, teamId, positionIn(selected, share)),
      others.map((season) => summariseSeason(season.finished, teamId, positionIn(season, share))),
      measures
    ),
    seasons: others.length,
    competitions: [...new Set(others.map((season) => season.competition))],
    teamCount: positionIn(selected, share)?.teamCount ?? null,
  };
}

/**
 * Where this season had the club at `share` of its own length, if it ranked it at all.
 *
 * decisions/038-season-against-history.md
 */
function positionIn(season: SeasonRead, share: number): SeasonPosition | null {
  const length = seasonLength(season.all);
  if (length === null) return null;

  const place = positionAtShare(season.points, length, share);
  return place === null ? null : { place, teamCount: season.teamCount };
}

/**
 * The least a season needs to be told from the selected one.
 *
 * decisions/038-season-against-history.md
 */
export type SeasonKey = { competitionCode: string; seasonId: number };

/**
 * The club's league seasons other than the selected one. `isLeague` is the
 * caller's.
 *
 * decisions/038-season-against-history.md
 */
export function otherLeagueSeasons<T extends SeasonKey>(
  seasons: readonly T[],
  selected: SeasonKey,
  isLeague: (competitionCode: string) => boolean
): T[] {
  return leagueSeasons(seasons, isLeague).filter(
    (season) =>
      !(
        season.competitionCode === selected.competitionCode && season.seasonId === selected.seasonId
      )
  );
}

/**
 * The club's league seasons, the selected one included.
 *
 * decisions/039-streak-records.md
 */
export function leagueSeasons<T extends SeasonKey>(
  seasons: readonly T[],
  isLeague: (competitionCode: string) => boolean
): T[] {
  return seasons.filter((season) => isLeague(season.competitionCode));
}

/**
 * The seasons to compare against, or the failure that stops the panel: any
 * failed read fails the whole comparison.
 *
 * decisions/038-season-against-history.md
 */
export function readSeasons(
  results: readonly SeasonReadResult[]
): { status: "ok"; reads: SeasonRead[] } | { status: "error" } {
  if (results.some((result) => result.status === "error")) return { status: "error" };

  return {
    status: "ok",
    reads: results.flatMap((result) => (result.status === "ok" ? [result.read] : [])),
  };
}

/**
 * The whole panel for one club and season, from a reader the caller supplies:
 * one orchestrator for both providers.
 *
 * decisions/038-season-against-history.md
 */
export async function comparisonFor<T extends SeasonKey>(
  teamId: number,
  selectedKey: SeasonKey,
  seasons: readonly T[],
  isLeague: (competitionCode: string) => boolean,
  read: (key: SeasonKey) => Promise<SeasonReadResult>,
  measures: readonly Measure[] = MEASURES
): Promise<SeasonComparisonSeries> {
  const selected = await read(selectedKey);
  if (selected.status !== "ok") {
    return selected.status === "error" ? { status: "error" } : { status: "unavailable" };
  }

  const others = readSeasons(
    await Promise.all(otherLeagueSeasons(seasons, selectedKey, isLeague).map(read))
  );
  if (others.status === "error") return { status: "error" };

  return { status: "ok", ...compareSeasons(teamId, selected.read, others.reads, measures) };
}

/**
 * The measures a page can show: every one, or every one but the position.
 *
 * decisions/040-cup-analytics.md
 */
export const RANKED_MEASURES: readonly Measure[] = MEASURES;
export const UNRANKED_MEASURES: readonly Measure[] = MEASURES.filter(
  (measure) => measure !== "position"
);
