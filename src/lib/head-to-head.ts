/**
 * The previous meetings between two teams as records, grids and sentences:
 * what has to be right in words. The selection itself is SQL, in
 * `match-service.ts`.
 *
 * decisions/019-match-page.md
 * decisions/042-head-to-head-view.md
 * decisions/044-scorelines-and-goal-averages.md
 * decisions/045-bogey-teams.md
 * decisions/047-rivalry-page.md
 */

import { competitionsInRegion, earliestSeasonFor } from "./competitions";
import { hasPlaceholderTeam } from "./match-detail";
import type { MatchSource } from "./match-source";
import { EARLIEST_NATIONAL_TEAM_YEAR, playedYear } from "./national-team";
import { formatSeasonLabel, resolveEarliestSeason } from "./seasons";
import { EARLIEST_TASO_SEASON } from "./taso";

/**
 * How many meetings the match page lists.
 *
 * decisions/019-match-page.md
 */
export const HEAD_TO_HEAD_LIMIT = 5;

/**
 * The window the head-to-head was drawn from: a season for the club game, a
 * calendar year for the national teams.
 *
 * decisions/019-match-page.md
 */
export type HeadToHeadWindow = { kind: "season"; label: string } | { kind: "year"; year: number };

/**
 * The window sentence, shown whether or not there are meetings to explain.
 *
 * decisions/019-match-page.md
 */
export function headToHeadWindowSentence(window: HeadToHeadWindow): string {
  const from = window.kind === "season" ? `kaudesta ${window.label}` : `vuodesta ${window.year}`;
  return `Perustuu ${from} alkaen tallennettuihin otteluihin.`;
}

/**
 * How far back this source can reach, read from the constants that bound it.
 * The window is the region's, not this match's competition's.
 *
 * decisions/019-match-page.md
 */
export function headToHeadWindow(
  source: MatchSource,
  spansCalendarYears: boolean
): HeadToHeadWindow {
  if (source.kind === "taso") {
    return source.bucket === "national"
      ? { kind: "year", year: EARLIEST_NATIONAL_TEAM_YEAR }
      : { kind: "season", label: String(EARLIEST_TASO_SEASON) };
  }

  const planFloor = resolveEarliestSeason(process.env.FOOTBALL_DATA_EARLIEST_SEASON);
  const earliest = Math.min(
    ...competitionsInRegion(source.region).map((competition) =>
      earliestSeasonFor(competition.code, planFloor)
    )
  );
  return { kind: "season", label: formatSeasonLabel(earliest, spansCalendarYears) };
}

/**
 * A finished meeting, as both providers' rows already satisfy it.
 *
 * decisions/042-head-to-head-view.md
 */
export type Meeting = {
  homeTeamProviderId: number;
  awayTeamProviderId: number;
  homeGoals: number;
  awayGoals: number;
  kickoffAt: Date;
};

/**
 * A win–draw–loss line, from the point of view of whoever it is about.
 *
 * decisions/042-head-to-head-view.md
 */
export type SideRecord = { wins: number; draws: number; losses: number };

/**
 * The `Yhteenveto` section. Every figure is from the first team's side, the one
 * the URL names first, except `secondAtHome`: the second team at its own ground.
 *
 * decisions/042-head-to-head-view.md
 */
export type HeadToHeadRecord = {
  played: number;
  /** The years the meetings span, for `24 ottelua, 1998–2025`. */
  from: number;
  to: number;
  /** The first team's, so `wins` and `losses` swap if the URL's order does. */
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  /** The first team's record in the meetings it hosted. */
  firstAtHome: SideRecord;
  /** The second team's record in the meetings **it** hosted. */
  secondAtHome: SideRecord;
};

const NO_SIDE: SideRecord = { wins: 0, draws: 0, losses: 0 };

/**
 * One meeting's outcome for the home side, which is the only side a row names.
 *
 * decisions/042-head-to-head-view.md
 */
function homeOutcome(meeting: Meeting): keyof SideRecord {
  if (meeting.homeGoals > meeting.awayGoals) return "wins";
  return meeting.homeGoals === meeting.awayGoals ? "draws" : "losses";
}

/**
 * The mirror image, for reading the same row from the away side.
 *
 * decisions/042-head-to-head-view.md
 */
function mirror(outcome: keyof SideRecord): keyof SideRecord {
  if (outcome === "wins") return "losses";
  return outcome === "losses" ? "wins" : "draws";
}

function add(side: SideRecord, outcome: keyof SideRecord): SideRecord {
  return { ...side, [outcome]: side[outcome] + 1 };
}

/**
 * The record between two teams over the meetings given, or `null` for none.
 * Pure: the service decides which meetings exist.
 *
 * decisions/042-head-to-head-view.md
 */
export function headToHeadRecord(
  meetings: readonly Meeting[],
  firstTeamProviderId: number
): HeadToHeadRecord | null {
  if (meetings.length === 0) return null;

  const years = meetings.map((meeting) => meeting.kickoffAt.getUTCFullYear());
  let record: HeadToHeadRecord = {
    played: meetings.length,
    from: Math.min(...years),
    to: Math.max(...years),
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    firstAtHome: NO_SIDE,
    secondAtHome: NO_SIDE,
  };

  for (const meeting of meetings) {
    const firstIsHome = meeting.homeTeamProviderId === firstTeamProviderId;
    const outcome = homeOutcome(meeting);
    const forFirst = firstIsHome ? outcome : mirror(outcome);
    const [scored, conceded] = firstIsHome
      ? [meeting.homeGoals, meeting.awayGoals]
      : [meeting.awayGoals, meeting.homeGoals];

    record = {
      ...record,
      [forFirst]: record[forFirst] + 1,
      goalsFor: record.goalsFor + scored,
      goalsAgainst: record.goalsAgainst + conceded,
      // Each ground's line is read from whoever hosted, so the two together
      // account for every meeting exactly once.
      firstAtHome: firstIsHome ? add(record.firstAtHome, outcome) : record.firstAtHome,
      secondAtHome: firstIsHome ? record.secondAtHome : add(record.secondAtHome, outcome),
    };
  }

  return record;
}

/**
 * The count to put on the match page's link, or `null` for no link: a count
 * that failed to read, or zero.
 *
 * decisions/042-head-to-head-view.md
 */
export function meetingsLinkCount(count: number | null): number | null {
  if (count === null) return null;
  return count === 0 ? null : count;
}

/**
 * Where the full history lives, given how many meetings there are.
 *
 * decisions/042-head-to-head-view.md
 */
export type MeetingsLink = { href: string; count: number };

/**
 * The match page's link to the full history, or `null` when there is none to
 * offer.
 *
 * decisions/042-head-to-head-view.md
 */
export function meetingsLink(
  basePath: string,
  first: number,
  second: number,
  count: number | null
): MeetingsLink | null {
  const shown = meetingsLinkCount(count);
  return shown === null ? null : { href: meetingsHref(basePath, first, second), count: shown };
}

/**
 * The head-to-head page for a pair, under a route's own prefix: the one place
 * its URL is spelled.
 *
 * decisions/042-head-to-head-view.md
 * decisions/045-bogey-teams.md
 */
export function meetingsHref(basePath: string, first: number, second: number): string {
  return `${basePath}/kohtaamiset/${first}/${second}`;
}

/**
 * The score grid's last row and column: every score from this many up. A 7–0
 * is counted against `5+`.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export const SCORE_GRID_CAP = 5;

/**
 * A final score from the first team's side, the side `Yhteenveto` reads from.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export type Scoreline = { first: number; second: number };

/**
 * The `Tulokset` section: every meeting's score counted per cell, rows down the
 * first team's goals. The most common scorelines are uncapped, and empty when
 * none occurred more than once.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export type ScoreGrid = {
  rows: Array<{ first: number; cells: Array<{ second: number; count: number }> }>;
  /** The largest count in any cell, which the shading scales against. */
  largest: number;
  mostCommon: Scoreline[];
  /** How often each of `mostCommon` occurred; 0 when `mostCommon` is empty. */
  mostCommonCount: number;
};

function scorelineFor(meeting: Meeting, firstTeamProviderId: number): Scoreline {
  return meeting.homeTeamProviderId === firstTeamProviderId
    ? { first: meeting.homeGoals, second: meeting.awayGoals }
    : { first: meeting.awayGoals, second: meeting.homeGoals };
}

/**
 * The score grid over the meetings given, from the first team's side. Pure, as
 * `headToHeadRecord` is.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export function scoreGrid(meetings: readonly Meeting[], firstTeamProviderId: number): ScoreGrid {
  const cells = new Map<string, number>();
  const byScoreline = new Map<string, { scoreline: Scoreline; count: number }>();

  for (const meeting of meetings) {
    const scoreline = scorelineFor(meeting, firstTeamProviderId);
    const cell = `${Math.min(scoreline.first, SCORE_GRID_CAP)}-${Math.min(scoreline.second, SCORE_GRID_CAP)}`;
    cells.set(cell, (cells.get(cell) ?? 0) + 1);

    const key = `${scoreline.first}-${scoreline.second}`;
    byScoreline.set(key, { scoreline, count: (byScoreline.get(key)?.count ?? 0) + 1 });
  }

  const axis = Array.from({ length: SCORE_GRID_CAP + 1 }, (_, goals) => goals);
  const rows = axis.map((first) => ({
    first,
    cells: axis.map((second) => ({ second, count: cells.get(`${first}-${second}`) ?? 0 })),
  }));
  const tallies = [...byScoreline.values()];
  const top = Math.max(0, ...tallies.map((tally) => tally.count));
  // Once is not "most common": with every scoreline occurring once, naming
  // them all says nothing the grid does not, one meeting included.
  const mostCommon =
    top > 1
      ? tallies
          .filter((tally) => tally.count === top)
          .map((tally) => tally.scoreline)
          .toSorted((left, right) => left.first - right.first || left.second - right.second)
      : [];

  return {
    rows,
    largest: Math.max(0, ...cells.values()),
    mostCommon,
    mostCommonCount: mostCommon.length > 0 ? top : 0,
  };
}

/**
 * An average score, home side first.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export type ScoreAverage = { home: number; away: number };

/**
 * Where a meeting was played, precisely enough to find that competition-season
 * again: what the competition's average is taken over.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export type SeasonRef =
  | { kind: "football-data"; competitionCode: string; seasonId: number }
  | { kind: "taso"; competitionId: string; categoryId: string };

/**
 * A meeting as the averages read it. `competitionKey` is the competition across
 * seasons; `season` is this meeting's own competition-season.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export type AnalysedMeeting = Meeting & {
  competitionKey: string;
  label: string;
  season: SeasonRef;
};

/**
 * The competition-seasons one competition's average is taken over.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export type CompetitionScope =
  | { kind: "football-data"; competitionCode: string; seasonIds: number[] }
  | { kind: "taso"; seasons: Array<{ competitionId: string; categoryId: string }> };

/**
 * One row of `Maalit kilpailuittain`, before the competition's own average is known.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export type CompetitionGroup = {
  key: string;
  /** The newest meeting's name for it, as the list shows it. */
  label: string;
  played: number;
  /** The pair's average score in these meetings. */
  average: ScoreAverage;
  scope: CompetitionScope;
};

function averageOf(meetings: readonly Meeting[]): ScoreAverage {
  const total = meetings.reduce(
    (sum, meeting) => ({ home: sum.home + meeting.homeGoals, away: sum.away + meeting.awayGoals }),
    { home: 0, away: 0 }
  );
  return { home: total.home / meetings.length, away: total.away / meetings.length };
}

/**
 * Every competition-season the meetings were played in, once each. A group is
 * within one provider, so the first meeting's kind is every meeting's.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
function scopeOf(meetings: readonly AnalysedMeeting[]): CompetitionScope {
  const footballData: Array<{ competitionCode: string; seasonId: number }> = [];
  const taso = new Map<string, { competitionId: string; categoryId: string }>();
  for (const { season } of meetings) {
    if (season.kind === "football-data") {
      footballData.push(season);
    } else {
      taso.set(`${season.competitionId}/${season.categoryId}`, {
        competitionId: season.competitionId,
        categoryId: season.categoryId,
      });
    }
  }

  const [first] = footballData;
  return first === undefined
    ? { kind: "taso", seasons: [...taso.values()] }
    : {
        kind: "football-data",
        competitionCode: first.competitionCode,
        seasonIds: [...new Set(footballData.map((season) => season.seasonId))].toSorted(
          (left, right) => left - right
        ),
      };
}

/**
 * The meetings split by competition, most meetings first, then by name. They
 * arrive newest first, so a renamed competition shows under its current name.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export function competitionGroups(meetings: readonly AnalysedMeeting[]): CompetitionGroup[] {
  // Named when first seen, which is the newest meeting in it.
  const byKey = new Map<string, { label: string; meetings: AnalysedMeeting[] }>();
  for (const meeting of meetings) {
    const group = byKey.get(meeting.competitionKey);
    if (group === undefined) {
      byKey.set(meeting.competitionKey, { label: meeting.label, meetings: [meeting] });
    } else {
      group.meetings.push(meeting);
    }
  }

  return [...byKey.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      played: group.meetings.length,
      average: averageOf(group.meetings),
      scope: scopeOf(group.meetings),
    }))
    .toSorted((left, right) => right.played - left.played || left.label.localeCompare(right.label));
}

/**
 * Whether this region's seasons cross a calendar year, for the window sentence.
 * Decided from the region, never asked of the provider.
 *
 * decisions/042-head-to-head-view.md
 * decisions/045-bogey-teams.md
 */
export function spansCalendarYears(source: MatchSource): boolean {
  return source.kind === "football-data" && source.region === "foreign";
}

/**
 * An opponent counts once the club has met it this many times.
 *
 * decisions/045-bogey-teams.md
 */
export const BOGEY_MINIMUM_MEETINGS = 3;

/**
 * How many opponents the panel names.
 *
 * decisions/045-bogey-teams.md
 */
export const BOGEY_ROWS = 3;

/**
 * A meeting with both teams' names, which is what an opponent is named from.
 *
 * decisions/045-bogey-teams.md
 */
export type NamedMeeting = Meeting & { homeTeamName: string; awayTeamName: string };

/**
 * One opponent's record against the club, from the club's side: the
 * head-to-head's own record over the meetings its page lists.
 *
 * decisions/045-bogey-teams.md
 */
export type OpponentRecord = {
  opponentProviderId: number;
  opponentName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** 3 for a win and 1 for a draw, over `played`. */
  pointsPerMatch: number;
  /** The latest kickoff between them, the second tie-break. */
  lastMet: Date;
};

function opponentOf(meeting: NamedMeeting, teamProviderId: number) {
  return meeting.homeTeamProviderId === teamProviderId
    ? { id: meeting.awayTeamProviderId, name: meeting.awayTeamName }
    : { id: meeting.homeTeamProviderId, name: meeting.homeTeamName };
}

/**
 * The club's worst opponents: enough meetings, fewest points per match first,
 * then more meetings, then the most recent. Never a bracket slot or the club
 * itself.
 *
 * decisions/045-bogey-teams.md
 */
export function worstOpponents(
  meetings: readonly NamedMeeting[],
  teamProviderId: number
): OpponentRecord[] {
  const byOpponent = new Map<number, { name: string; meetings: NamedMeeting[] }>();
  for (const meeting of meetings) {
    if (hasPlaceholderTeam(meeting)) continue;
    const opponent = opponentOf(meeting, teamProviderId);
    // A club is never its own opponent: the head-to-head refuses that pair.
    if (opponent.id === teamProviderId) continue;
    const seen = byOpponent.get(opponent.id);
    if (seen === undefined) {
      byOpponent.set(opponent.id, { name: opponent.name, meetings: [meeting] });
    } else {
      seen.meetings.push(meeting);
    }
  }

  return [...byOpponent.entries()]
    .filter(([, opponent]) => opponent.meetings.length >= BOGEY_MINIMUM_MEETINGS)
    .map(([id, opponent]) => {
      // Never null: the filter above leaves only opponents with meetings.
      const record = headToHeadRecord(opponent.meetings, teamProviderId) as HeadToHeadRecord;
      return {
        opponentProviderId: id,
        opponentName: opponent.name,
        played: record.played,
        wins: record.wins,
        draws: record.draws,
        losses: record.losses,
        pointsPerMatch: (3 * record.wins + record.draws) / record.played,
        lastMet: new Date(Math.max(...opponent.meetings.map((m) => m.kickoffAt.getTime()))),
      };
    })
    .toSorted(
      (left, right) =>
        left.pointsPerMatch - right.pointsPerMatch ||
        right.played - left.played ||
        right.lastMet.getTime() - left.lastMet.getTime()
    )
    .slice(0, BOGEY_ROWS);
}

/**
 * The `Vaikeimmat vastustajat` panel: its rows, each with the link to its
 * head-to-head, and the window sentence the rows are true within.
 *
 * decisions/045-bogey-teams.md
 */
export type OpponentsSeries =
  | {
      status: "ok";
      rows: Array<OpponentRecord & { href: string }>;
      windowSentence: string;
    }
  /** A page the panel is not on: a national team's. */
  | { status: "unavailable" }
  | { status: "error" };

/**
 * How many calendar years back a meeting keeps a rivalry current.
 *
 * decisions/047-rivalry-page.md
 */
const CURRENT_RIVALRY_YEARS = 3;

/**
 * Whether the pair's latest meeting keeps the rivalry current: played in
 * `current year − 2` or later, by Helsinki's calendar. `today` is passed in.
 *
 * decisions/047-rivalry-page.md
 */
export function isCurrentRivalry(latestMeeting: Date, today: Date): boolean {
  return playedYear(latestMeeting) > playedYear(today) - CURRENT_RIVALRY_YEARS;
}
