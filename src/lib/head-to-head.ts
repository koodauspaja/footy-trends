/**
 * The previous meetings between two teams, and the sentence that says how far
 * back we could look.
 *
 * The selection itself is SQL — see `match-service.ts`. What lives here is the
 * part that has to be right in words rather than in rows: how deep the window
 * is per source, and how that is stated to a reader. See
 * specs/019-match-page.md.
 */

import { competitionsInRegion, earliestSeasonFor } from "./competitions";
import type { MatchSource } from "./match-source";
import { EARLIEST_NATIONAL_TEAM_YEAR } from "./national-team";
import { formatSeasonLabel, resolveEarliestSeason } from "./seasons";
import { EARLIEST_TASO_SEASON } from "./taso";

/** How many meetings the page lists. Five, per #71 — the data supports more. */
export const HEAD_TO_HEAD_LIMIT = 5;

/**
 * The window the head-to-head was drawn from.
 *
 * A season for the club game, a calendar year for the national teams — whose
 * matches are grouped by the year they were played rather than by a season at
 * all (specs/018).
 */
export type HeadToHeadWindow = { kind: "season"; label: string } | { kind: "year"; year: number };

/**
 * The window sentence, shown whether or not there are meetings to explain.
 *
 * "tallennettuihin" — stored — is load-bearing. It claims a window we looked
 * in, not a set of seasons we guarantee are complete, which is the truth: a
 * season is synced when someone browses it. The measured asymmetry is the
 * reason the sentence exists at all: 47% of football-data pairs have two
 * meetings or fewer, against 10% in Veikkausliiga, where the deepest pair has
 * 35. Without it, "2 aiempaa kohtaamista" reads as a fact about the teams
 * rather than about our data.
 */
export function headToHeadWindowSentence(window: HeadToHeadWindow): string {
  const from = window.kind === "season" ? `kaudesta ${window.label}` : `vuodesta ${window.year}`;
  return `Perustuu ${from} alkaen tallennettuihin otteluihin.`;
}

/**
 * How far back this source can reach, read from the constants that actually
 * bound it rather than repeated as a literal on the page.
 *
 * **The window is the region's, not this match's competition's.** The
 * head-to-head deliberately spans every competition in a region, so a World Cup
 * page can list a European Championship meeting — and stating the World Cup's
 * own floor (2026) under a list containing a 2024 meeting would describe a
 * window the page has just contradicted. The floor is therefore the oldest
 * season any competition the query can return reaches, which is exactly the set
 * the query scopes itself to.
 *
 * `spansCalendarYears` only shapes the label — `2023/24` for a league, `2026`
 * for a tournament played inside one summer.
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
 * Structural rather than one of the two row types, for the reason
 * `form-series.ts` takes `ResultMatch`: the arithmetic below is the same
 * whichever table the row came out of, and naming one of them here would make
 * the other a cast.
 */
export type Meeting = {
  homeTeamProviderId: number;
  awayTeamProviderId: number;
  homeGoals: number;
  awayGoals: number;
  kickoffAt: Date;
};

/** A win–draw–loss line, from the point of view of whoever it is about. */
export type SideRecord = { wins: number; draws: number; losses: number };

/**
 * The `Yhteenveto` section (specs/042, S9): everything the meetings say without
 * a new computation.
 *
 * Every figure is from the **first** team's side — the one the URL names first
 * — except `secondAtHome`, which is the second team's record at its own ground.
 * Two home lines rather than one home and one away: a reader comparing them is
 * comparing two teams at home, which is the question a rivalry's ground record
 * actually asks.
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

/** One meeting's outcome for the home side, which is the only side a row names. */
function homeOutcome(meeting: Meeting): keyof SideRecord {
  if (meeting.homeGoals > meeting.awayGoals) return "wins";
  return meeting.homeGoals === meeting.awayGoals ? "draws" : "losses";
}

/** The mirror image, for reading the same row from the away side. */
function mirror(outcome: keyof SideRecord): keyof SideRecord {
  if (outcome === "wins") return "losses";
  return outcome === "losses" ? "wins" : "draws";
}

function add(side: SideRecord, outcome: keyof SideRecord): SideRecord {
  return { ...side, [outcome]: side[outcome] + 1 };
}

/**
 * The record between two teams, over the meetings given.
 *
 * **Pure, and it counts only what it is handed.** The service decides which
 * meetings exist — finished, both scores stored, every competition in the
 * region (specs/042, S2 and S3) — so a fixture still to come cannot reach this
 * function, and the summary cannot describe a match that has not been played.
 *
 * `null` when there are no meetings: a record of nothing is not a record, and a
 * caller rendering `0 ottelua, NaN–NaN` is the failure that makes returning
 * zeroes worse than returning nothing.
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
 * The count to put on the match page's link, or `null` for no link at all
 * (specs/042, S10).
 *
 * Two different reasons for the same answer, which is why they are decided
 * here rather than inline: a `null` count is a read that failed, and a link
 * promising a number it does not have is worse than no link; a count of zero
 * is a pair with nothing to open, where the block above already shows
 * everything there is.
 */
export function meetingsLinkCount(count: number | null): number | null {
  if (count === null) return null;
  return count === 0 ? null : count;
}

/** Where the full history lives, given how many meetings there are. */
export type MeetingsLink = { href: string; count: number };

/**
 * The match page's link to the full history, or `null` when there is none to
 * offer (specs/042, S10).
 *
 * The href sits beside the rule that decides whether to show it, so a caller
 * cannot build one for a pair with nothing behind it — and both live here,
 * where a test reaches them directly rather than through a page.
 */
export function meetingsLink(
  basePath: string,
  first: number,
  second: number,
  count: number | null
): MeetingsLink | null {
  const shown = meetingsLinkCount(count);
  return shown === null
    ? null
    : { href: `${basePath}/kohtaamiset/${first}/${second}`, count: shown };
}

/**
 * The score grid's last row and column: every score from this many up
 * (specs/044). Six rows and six columns at most, which is what keeps the grid
 * legible at 375 px; a 7–0 is counted against `5+`.
 */
export const SCORE_GRID_CAP = 5;

/** A final score from the first team's side — the side `Yhteenveto` reads from (specs/044, S5). */
export type Scoreline = { first: number; second: number };

/**
 * The `Tulokset` section (specs/044): every meeting's score, counted per cell.
 *
 * `rows` runs down the first team's goals and each row's `cells` across the
 * second team's, `0` to `SCORE_GRID_CAP`, the last of each counting that many
 * and more. Every cell names its own goals, so a renderer keys on the score
 * rather than on a position. The most common scorelines are
 * **uncapped** — the sentence names a real score, not a bucket — and empty when
 * none occurred more than once, which is when the sentence says nothing the
 * grid does not (S8).
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
 * The score grid over the meetings given, from the first team's side (S5).
 *
 * Pure and counting only what it is handed, as `headToHeadRecord` is: the
 * service decides which meetings exist (specs/042, S2 and S3).
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
  // them all says nothing the grid does not (S8) — one meeting included.
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

/** An average score, home side first (specs/044, S3). */
export type ScoreAverage = { home: number; away: number };

/**
 * Where a meeting was played, precisely enough to find that competition-season
 * again — which is what the competition's average is taken over (S7).
 *
 * football-data names a season within a competition code. TASO's
 * `competition_id` is itself a season (`spljp24`, `Liigacup24`) and its
 * `category_id` the competition inside it, so the pair is the season.
 */
export type SeasonRef =
  | { kind: "football-data"; competitionCode: string; seasonId: number }
  | { kind: "taso"; competitionId: string; categoryId: string };

/**
 * A meeting as the averages read it: its score, the competition it belongs to,
 * and the name `Kohtaamiset` gives that competition.
 *
 * `competitionKey` is the competition across seasons — Liigacup's `LC2023` and
 * `LC` are one key — while `season` is this meeting's own competition-season.
 */
export type AnalysedMeeting = Meeting & {
  competitionKey: string;
  label: string;
  season: SeasonRef;
};

/** The competition-seasons one competition's average is taken over (S7). */
export type CompetitionScope =
  | { kind: "football-data"; competitionCode: string; seasonIds: number[] }
  | { kind: "taso"; seasons: Array<{ competitionId: string; categoryId: string }> };

/** One row of `Maalit kilpailuittain`, before the competition's own average is known. */
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
 * Every competition-season the meetings were played in, once each.
 *
 * A group is always within one provider — a head-to-head is (specs/042, S6) —
 * so the first meeting's kind is every meeting's.
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
 * The meetings split by competition, one group per competition and never one
 * blended average (specs/044, S4) — most meetings first, then by name.
 *
 * The meetings arrive newest first, so each group's first meeting names it: a
 * renamed competition shows once, under its current name.
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
