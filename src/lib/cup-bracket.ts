/**
 * Turns a cup's knockout matches into ties — one row per pairing, with the
 * two legs aggregated. See specs/014-champions-league.md.
 */

import { KNOCKOUT_STAGES } from "./cup-stages";

export type BracketSourceMatch = {
  providerMatchId: number;
  stage: string | null;
  status: string;
  kickoffAt: Date;
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  regularTimeHome: number | null;
  regularTimeAway: number | null;
  extraTimeHome: number | null;
  extraTimeAway: number | null;
  penaltiesHome: number | null;
  penaltiesAway: number | null;
};

export type BracketTeam = { teamProviderId: number; teamName: string };

export type BracketLeg = {
  providerMatchId: number;
  kickoffAt: Date;
  homeTeamProviderId: number;
  homeTeamName: string;
  awayTeamProviderId: number;
  awayTeamName: string;
  /**
   * Normal time plus extra time — **not** the provider's `fullTime`, which
   * includes the shootout. Displaying `fullTime` here would print Liverpool
   * 1-5 Paris Saint-Germain beside an aggregate of 1-1 (rp): a leg score that
   * contradicts the tie it belongs to.
   */
  homeGoals: number | null;
  awayGoals: number | null;
  /** The shootout, shown separately from the score above. Null when there was none. */
  penaltiesHome: number | null;
  penaltiesAway: number | null;
};

/** How a decided tie was settled — drives the `(ja)` / `(rp)` suffix. */
export type TieDecision = "regular" | "extra_time" | "penalties";

export type BracketTie = {
  /**
   * Stable across renders: stage, both team ids lowest-first, and the first
   * leg's match id. The match id is what keeps the key unique when an
   * over-large pairing is split into one tie per match.
   */
  key: string;
  stage: string;
  /** `home` is the first leg's home team; aggregates are stated from its side. */
  home: BracketTeam;
  away: BracketTeam;
  legs: BracketLeg[];
  /** The first leg's kickoff — a tie always has at least one leg. */
  startsAt: Date;
  /** Null until every leg has a score. */
  aggregateHome: number | null;
  aggregateAway: number | null;
  /**
   * The shootout that settled the tie, stated from the **tie's** home side
   * rather than the deciding leg's — the two differ whenever the second leg
   * is the one that went to penalties. Null when there was no shootout.
   */
  penaltiesHome: number | null;
  penaltiesAway: number | null;
  winnerTeamProviderId: number | null;
  decision: TieDecision | null;
};

export type BracketRound = { stage: string; ties: BracketTie[] };

const FINISHED_STATUS = "FINISHED";

/**
 * A leg's score for aggregation purposes: normal time plus extra time, never
 * the provider's `fullTime`.
 *
 * `fullTime` INCLUDES a penalty shootout — Liverpool "1-5" Paris Saint-Germain
 * (LAST_16, 2024/25) is really 0-1 with penalties 1-4 — so summing it would
 * report the tie wrongly. When `regularTime` is absent the match went to
 * neither extra time nor penalties, and `fullTime` *is* the normal-time score.
 */
function legScore(match: BracketSourceMatch): { home: number; away: number } | null {
  if (match.regularTimeHome !== null && match.regularTimeAway !== null) {
    return {
      home: match.regularTimeHome + (match.extraTimeHome ?? 0),
      away: match.regularTimeAway + (match.extraTimeAway ?? 0),
    };
  }
  if (match.homeGoals !== null && match.awayGoals !== null) {
    return { home: match.homeGoals, away: match.awayGoals };
  }
  return null;
}

function pairKey(left: number, right: number): string {
  return left < right ? `${left}-${right}` : `${right}-${left}`;
}

function toLeg(match: BracketSourceMatch): BracketLeg {
  // The same score the aggregate is built from, so a leg can never contradict
  // the tie above it.
  const score = legScore(match);
  return {
    providerMatchId: match.providerMatchId,
    kickoffAt: match.kickoffAt,
    homeTeamProviderId: match.homeTeamProviderId,
    homeTeamName: match.homeTeamName,
    awayTeamProviderId: match.awayTeamProviderId,
    awayTeamName: match.awayTeamName,
    homeGoals: score?.home ?? null,
    awayGoals: score?.away ?? null,
    penaltiesHome: match.penaltiesHome,
    penaltiesAway: match.penaltiesAway,
  };
}

type TieTotals = {
  aggregateHome: number;
  aggregateAway: number;
  complete: boolean;
  wentToExtraTime: boolean;
};

/**
 * Sums the legs from the tie's home side. Each leg is stated from its *own*
 * home team, so a second leg with the teams reversed contributes the other way
 * round. A leg with no score, or one not yet finished, leaves the tie
 * incomplete rather than counting as 0-0.
 */
function accumulate(legs: BracketSourceMatch[], tieHomeTeamId: number): TieTotals {
  const totals: TieTotals = {
    aggregateHome: 0,
    aggregateAway: 0,
    complete: true,
    wentToExtraTime: false,
  };

  for (const leg of legs) {
    const score = legScore(leg);
    if (score === null || leg.status !== FINISHED_STATUS) {
      totals.complete = false;
      continue;
    }
    const legHomeIsTieHome = leg.homeTeamProviderId === tieHomeTeamId;
    totals.aggregateHome += legHomeIsTieHome ? score.home : score.away;
    totals.aggregateAway += legHomeIsTieHome ? score.away : score.home;
    if (leg.extraTimeHome !== null || leg.extraTimeAway !== null) totals.wentToExtraTime = true;
  }

  return totals;
}

/**
 * Builds one tie from the legs of a single pairing. Works for one leg as well
 * as two: the World Cup and the European Championship play single-leg
 * knockouts, so an aggregate of one match is a normal case, not a half-empty
 * two-legged tie.
 */
function buildTie(stage: string, legs: [BracketSourceMatch, ...BracketSourceMatch[]]): BracketTie {
  const ordered = legs.toSorted(
    (left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime()
  );
  // Reduced rather than read off `ordered[0]`: `legs` is a non-empty tuple, so
  // a seedless reduce is total and needs neither a non-null assertion nor an
  // unreachable fallback. `toSorted` widens the tuple back to an array.
  const first = legs.reduce((earliest, leg) =>
    leg.kickoffAt < earliest.kickoffAt ? leg : earliest
  );
  const home: BracketTeam = {
    teamProviderId: first.homeTeamProviderId,
    teamName: first.homeTeamName,
  };
  const away: BracketTeam = {
    teamProviderId: first.awayTeamProviderId,
    teamName: first.awayTeamName,
  };

  const { aggregateHome, aggregateAway, complete, wentToExtraTime } = accumulate(
    ordered,
    home.teamProviderId
  );

  const shootout = ordered.find((leg) => leg.penaltiesHome !== null && leg.penaltiesAway !== null);
  const penalties = shootoutScore(shootout, home.teamProviderId);

  return {
    key: `${stage}:${pairKey(home.teamProviderId, away.teamProviderId)}:${first.providerMatchId}`,
    stage,
    home,
    away,
    legs: ordered.map(toLeg),
    startsAt: first.kickoffAt,
    aggregateHome: complete ? aggregateHome : null,
    aggregateAway: complete ? aggregateAway : null,
    penaltiesHome: penalties?.home ?? null,
    penaltiesAway: penalties?.away ?? null,
    ...resolveWinner({
      complete,
      aggregateHome,
      aggregateAway,
      home,
      away,
      wentToExtraTime,
      penalties,
    }),
  };
}

function resolveWinner({
  complete,
  aggregateHome,
  aggregateAway,
  home,
  away,
  wentToExtraTime,
  penalties,
}: {
  complete: boolean;
  aggregateHome: number;
  aggregateAway: number;
  home: BracketTeam;
  away: BracketTeam;
  wentToExtraTime: boolean;
  penalties: TieScore | null;
}): { winnerTeamProviderId: number | null; decision: TieDecision | null } {
  if (!complete) return { winnerTeamProviderId: null, decision: null };

  if (aggregateHome !== aggregateAway) {
    return {
      winnerTeamProviderId:
        aggregateHome > aggregateAway ? home.teamProviderId : away.teamProviderId,
      decision: wentToExtraTime ? "extra_time" : "regular",
    };
  }

  // Level on aggregate. UEFA abolished the away-goals rule in 2021, so the
  // shootout is the only tiebreaker left.
  if (penalties === null || penalties.home === penalties.away) {
    return { winnerTeamProviderId: null, decision: null };
  }
  return {
    winnerTeamProviderId:
      penalties.home > penalties.away ? home.teamProviderId : away.teamProviderId,
    decision: "penalties",
  };
}

type TieScore = { home: number; away: number };

/**
 * The shootout stated from the **tie's** home side, or null when there was
 * none or the provider recorded only one side of it.
 *
 * The deciding leg may be the one where the tie's away team played at home, so
 * its `penaltiesHome` is not necessarily the tie's home team's score.
 */
function shootoutScore(
  shootout: BracketSourceMatch | undefined,
  tieHomeTeamId: number
): TieScore | null {
  const scoredHome = shootout?.penaltiesHome ?? null;
  const scoredAway = shootout?.penaltiesAway ?? null;
  if (shootout === undefined || scoredHome === null || scoredAway === null) return null;

  const legHomeIsTieHome = shootout.homeTeamProviderId === tieHomeTeamId;
  return {
    home: legHomeIsTieHome ? scoredHome : scoredAway,
    away: legHomeIsTieHome ? scoredAway : scoredHome,
  };
}

/**
 * Groups a season's knockout matches into rounds of ties.
 *
 * A pairing with more than two matches cannot be a two-legged tie, so each of
 * its matches becomes its own single-match tie rather than being silently
 * folded together or dropped — a provider oddity stays visible.
 */
/** Groups one round's matches by the unordered pair of teams that played them. */
function pairLegs(
  stageMatches: BracketSourceMatch[]
): Array<[BracketSourceMatch, ...BracketSourceMatch[]]> {
  const pairings = new Map<string, [BracketSourceMatch, ...BracketSourceMatch[]]>();
  for (const match of stageMatches) {
    const key = pairKey(match.homeTeamProviderId, match.awayTeamProviderId);
    const existing = pairings.get(key);
    if (existing) existing.push(match);
    else pairings.set(key, [match]);
  }
  return [...pairings.values()];
}

/**
 * One round's ties, earliest first.
 *
 * A pairing with more than two matches cannot be a two-legged tie, so each of
 * its matches becomes its own single-match tie rather than being silently
 * folded together or dropped — a provider oddity stays visible.
 */
function buildRound(stage: string, stageMatches: BracketSourceMatch[]): BracketRound {
  const ties = pairLegs(stageMatches).flatMap((legs) =>
    legs.length > 2 ? legs.map((leg) => buildTie(stage, [leg])) : [buildTie(stage, legs)]
  );

  ties.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  return { stage, ties };
}

/**
 * A season's knockout rounds as ties, in progression order.
 *
 * Defaults to *every* knockout round rather than only the drawn ones: a round
 * the season has must be visible on the standings page, and the caller decides
 * which are drawn into the tree and which are listed above it.
 */
export function buildBracket(
  matches: BracketSourceMatch[],
  stages: string[] = KNOCKOUT_STAGES
): BracketRound[] {
  return stages.flatMap((stage) => {
    const stageMatches = matches.filter((match) => match.stage === stage);
    return stageMatches.length === 0 ? [] : [buildRound(stage, stageMatches)];
  });
}
