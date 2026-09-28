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
