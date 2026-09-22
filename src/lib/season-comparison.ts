/**
 * The selected season set against the club's other stored seasons — the data
 * behind the team page's `Tämä kausi verrattuna` panel (specs/038).
 *
 * **Pure.** The services decide which seasons count and pass their matches in,
 * exactly as they do for the per-season panels.
 *
 * Two averaging rules live here, and they are deliberately different
 * (specs/038, S9 and S10):
 *
 * - a **rate** — points, goals or clean sheets per match — is what the club
 *   does on average, so the other seasons' matches are **pooled** and the
 *   measure computed once over the pool. A three-match season then contributes
 *   three matches' worth and no more, with no threshold to justify;
 * - a **position** is where the club stood at a moment, so it is read at the
 *   same *share of the season completed* in each other season and those are
 *   averaged. Pooling positions is not a computation that exists.
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

/** Where the club stood, and how many teams it was ranked among. */
export type SeasonPosition = { place: number; teamCount: number };

/** A finished match that also knows its round — both providers' rows satisfy it. */
export type SeasonMatch = ResultMatch & { matchday: number | null };

/** One season's whole contribution, computed from that season's own matches. */
export type SeasonSummary = {
  /** The club's counts: home and away summed, which is the standings row (specs/033). */
  stats: SideStats;
  /** Matches the club conceded nothing in. */
  cleanSheets: number;
  /** Read at the matched share of the season; `null` when the season ranks nothing. */
  position: SeasonPosition | null;
};

/** The measures the panel shows, in the order it shows them. */
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
 * units. `null` is "no value", which the panel prints as `–` and never as 0
 * (specs/033, Q7) — a club with no other season has a null baseline throughout.
 *
 * `position` is a **share of the table**, 0 to 1, where smaller is better: 3rd
 * of 12 is 0,25. A share is the only form of a rank that survives different
 * league sizes and tiers (specs/038, S5).
 */
export type ComparisonRow = { measure: Measure; selected: number | null; baseline: number | null };

const EMPTY: SideStats = { matches: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0 };

/**
 * One season's summary from its finished matches.
 *
 * `position` is passed in rather than computed: a table is the caller's to
 * rank, for the same reason `position-series.ts` takes its ranking from the
 * caller — so a value here can never disagree with the standings page.
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

/** Every row of the panel, from the selected season and the seasons it is compared with. */
export function comparisonRows(
  selected: SeasonSummary,
  others: readonly SeasonSummary[]
): ComparisonRow[] {
  const pooled = others.reduce((total, season) => addStats(total, season.stats), EMPTY);
  const pooledCleanSheets = others.reduce((total, season) => total + season.cleanSheets, 0);

  return MEASURES.map((measure) => ({
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
 * A season's full length in rounds — its **last scheduled** round, not the last
 * one played.
 *
 * The denominator of every share below. Scheduled rather than played is what
 * makes the share mean "how far through the season", so a club 10 rounds into a
 * 27-round season reads as 0,37 rather than as finished.
 */
export function seasonLength(matches: readonly { matchday: number | null }[]): number | null {
  const rounds = matches.map((match) => match.matchday).filter(isNumber);
  return rounds.length === 0 ? null : Math.max(...rounds);
}

/** How far through its season the club is: rounds played over rounds scheduled. */
export function shareCompleted(
  lastRoundPlayed: number | null,
  length: number | null
): number | null {
  if (lastRoundPlayed === null || length === null || length <= 0) return null;
  return Math.min(1, lastRoundPlayed / length);
}

/**
 * Where the club stood at `share` of this season (specs/038, S9).
 *
 * Matching a *share* rather than a raw matchday is what lets seasons of
 * different lengths be compared: 3rd after 20 of 22 matches is nearly final
 * while 3rd after 20 of 27 is not, so the same matchday is not the same point.
 * The share is turned back into that season's own round, and the club's last
 * position at or before it is taken — its position cannot have moved in a round
 * it had not reached.
 *
 * `null` when the club had no position by then, which is a season it entered
 * late rather than an error.
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

/** A place as a share of its table: 3rd of 12 is 0,25, and smaller is better. */
export function shareOf(position: SeasonPosition | null): number | null {
  if (position === null || position.teamCount <= 0) return null;
  return position.place / position.teamCount;
}

/** The mean of the seasons that ranked the club at all; `null` when none did. */
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

/** Two sides, or two seasons, added: the counts every measure is derived from. */
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
 * fixture list behind the share's denominator, and the per-round positions the
 * provider's own ranking produced.
 */
export type SeasonRead = {
  /** The competition, as the panel names it to the reader. */
  competition: string;
  /** The club's finished matches. They carry their round, which S9 needs. */
  finished: readonly SeasonMatch[];
  /** Every match of the season, scheduled included (specs/038, S9). */
  all: readonly { matchday: number | null }[];
  points: readonly PositionPoint[];
  teamCount: number;
};

/**
 * One season's read, told apart from its failures.
 *
 * A read that **failed** and a season the app simply holds nothing for must not
 * collapse into one value: the first has to reach the reader as an error, while
 * the second is an ordinary season to leave out. Collapsing them let a failed
 * baseline read shrink the comparison silently, while the panel still said how
 * many seasons it covered.
 */
export type SeasonReadResult =
  | { status: "ok"; read: SeasonRead }
  /** Nothing stored for this season; not an error, just not a baseline. */
  | { status: "empty" }
  | { status: "error" };

export type SeasonComparisonSeries =
  | ({ status: "ok" } & SeasonComparison)
  /** No league table for this team's season, so no panel (specs/031, Q2). */
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
 * The whole panel, from seasons the services have already read.
 *
 * **Pure, and async nowhere**: the providers differ in how a season is found and
 * ranked, not in what is done with it, so the reading stays in the services and
 * the arithmetic is tested once without a database.
 *
 * Every other season is read at the **selected** season's share of completion
 * (specs/038, S9), which is what makes a club 10 rounds into a 27-round season
 * compare against where it stood a third of the way through each other season,
 * rather than against those seasons' final tables.
 */
export function compareSeasons(
  teamId: number,
  selected: SeasonRead,
  others: readonly SeasonRead[]
): SeasonComparison {
  const length = seasonLength(selected.all);
  const share = shareCompleted(lastRoundPlayedBy(selected.finished, teamId), length) ?? 1;

  return {
    rows: comparisonRows(
      summariseSeason(selected.finished, teamId, positionIn(selected, share)),
      others.map((season) => summariseSeason(season.finished, teamId, positionIn(season, share)))
    ),
    seasons: others.length,
    competitions: [...new Set(others.map((season) => season.competition))],
    teamCount: positionIn(selected, share)?.teamCount ?? null,
  };
}

/** Where this season had the club at `share` of its own length, if it ranked it at all. */
function positionIn(season: SeasonRead, share: number): SeasonPosition | null {
  const length = seasonLength(season.all);
  if (length === null) return null;

  const place = positionAtShare(season.points, length, share);
  return place === null ? null : { place, teamCount: season.teamCount };
}

/** The least a season needs to be told from the selected one. */
export type SeasonKey = { competitionCode: string; seasonId: number };

/**
 * The club's league seasons other than the selected one (specs/038, S2 and S6).
 *
 * `isLeague` is the caller's, because the two providers answer it from
 * different registries — a foreign competition carries its format, a domestic
 * one is tested against the cup list. Excluding the selected season is the part
 * that must not differ, so it lives here.
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
 * Split out because the record book (specs/039) counts every stored season
 * while the comparison excludes the one being looked at — but "which seasons
 * are league seasons" must mean the same thing to both, or the two panels would
 * disagree about what a club's history is.
 */
export function leagueSeasons<T extends SeasonKey>(
  seasons: readonly T[],
  isLeague: (competitionCode: string) => boolean
): T[] {
  return seasons.filter((season) => isLeague(season.competitionCode));
}

/**
 * The seasons to compare against, or the failure that stops the panel.
 *
 * Any failed read fails the whole comparison. A baseline quietly computed over
 * the seasons that happened to read is a plausible wrong answer, and the
 * panel's own `Verrattuna {n} muuhun kauteen` line would state the wrong `n`.
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
 * The whole panel for one club and season, from a reader the caller supplies.
 *
 * **One orchestrator, both providers.** They differ in how a season is found
 * and ranked — a `read` — and in what counts as a league, and in nothing else.
 * Written twice at first, which cost two branches no test could take; written
 * once, the failure rules below are proved once and cannot drift apart.
 *
 * Any failed read fails the comparison: a baseline quietly computed over the
 * seasons that happened to read is a plausible wrong answer, and the panel's
 * own `Verrattuna {n} muuhun kauteen` line would state the wrong `n`.
 */
export async function comparisonFor<T extends SeasonKey>(
  teamId: number,
  selectedKey: SeasonKey,
  seasons: readonly T[],
  isLeague: (competitionCode: string) => boolean,
  read: (key: SeasonKey) => Promise<SeasonReadResult>
): Promise<SeasonComparisonSeries> {
  const selected = await read(selectedKey);
  if (selected.status !== "ok") {
    return selected.status === "error" ? { status: "error" } : { status: "unavailable" };
  }

  const others = readSeasons(
    await Promise.all(otherLeagueSeasons(seasons, selectedKey, isLeague).map(read))
  );
  if (others.status === "error") return { status: "error" };

  return { status: "ok", ...compareSeasons(teamId, selected.read, others.reads) };
}
