/**
 * Turns a cup's knockout matches into ties — one row per pairing, with the
 * two legs aggregated. See specs/014-champions-league.md.
 */

import { BRACKET_STAGES } from "./cup-stages";

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

  let aggregateHome = 0;
  let aggregateAway = 0;
  let complete = true;
  let wentToExtraTime = false;

  for (const leg of ordered) {
    const score = legScore(leg);
    if (score === null || leg.status !== FINISHED_STATUS) {
      complete = false;
      continue;
    }
    // Each leg is stated from its own home side, so a second leg with the
    // teams reversed contributes the other way round.
    const legHomeIsTieHome = leg.homeTeamProviderId === home.teamProviderId;
    aggregateHome += legHomeIsTieHome ? score.home : score.away;
    aggregateAway += legHomeIsTieHome ? score.away : score.home;
    if (leg.extraTimeHome !== null || leg.extraTimeAway !== null) wentToExtraTime = true;
  }

  const shootout = ordered.find((leg) => leg.penaltiesHome !== null && leg.penaltiesAway !== null);

  return {
    key: `${stage}:${pairKey(home.teamProviderId, away.teamProviderId)}:${first.providerMatchId}`,
    stage,
    home,
    away,
    legs: ordered.map(toLeg),
    startsAt: first.kickoffAt,
    aggregateHome: complete ? aggregateHome : null,
    aggregateAway: complete ? aggregateAway : null,
    ...resolveWinner({
      complete,
      aggregateHome,
      aggregateAway,
      home,
      away,
      wentToExtraTime,
      shootout,
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
  shootout,
}: {
  complete: boolean;
  aggregateHome: number;
  aggregateAway: number;
  home: BracketTeam;
  away: BracketTeam;
  wentToExtraTime: boolean;
  shootout: BracketSourceMatch | undefined;
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
  if (
    shootout !== undefined &&
    shootout.penaltiesHome !== null &&
    shootout.penaltiesAway !== null
  ) {
    const shootoutHomeIsTieHome = shootout.homeTeamProviderId === home.teamProviderId;
    const tieHomePenalties = shootoutHomeIsTieHome
      ? shootout.penaltiesHome
      : shootout.penaltiesAway;
    const tieAwayPenalties = shootoutHomeIsTieHome
      ? shootout.penaltiesAway
      : shootout.penaltiesHome;
    if (tieHomePenalties !== tieAwayPenalties) {
      return {
        winnerTeamProviderId:
          tieHomePenalties > tieAwayPenalties ? home.teamProviderId : away.teamProviderId,
        decision: "penalties",
      };
    }
  }

  return { winnerTeamProviderId: null, decision: null };
}

/**
 * Groups a season's knockout matches into rounds of ties.
 *
 * A pairing with more than two matches cannot be a two-legged tie, so each of
 * its matches becomes its own single-match tie rather than being silently
 * folded together or dropped — a provider oddity stays visible.
 */
export function buildBracket(
  matches: BracketSourceMatch[],
  stages: string[] = BRACKET_STAGES
): BracketRound[] {
  const rounds: BracketRound[] = [];

  for (const stage of stages) {
    const stageMatches = matches.filter((match) => match.stage === stage);
    if (stageMatches.length === 0) continue;

    const pairings = new Map<string, [BracketSourceMatch, ...BracketSourceMatch[]]>();
    for (const match of stageMatches) {
      const key = pairKey(match.homeTeamProviderId, match.awayTeamProviderId);
      const existing = pairings.get(key);
      if (existing) existing.push(match);
      else pairings.set(key, [match]);
    }

    const ties: BracketTie[] = [];
    for (const legs of pairings.values()) {
      if (legs.length > 2) {
        for (const leg of legs) ties.push(buildTie(stage, [leg]));
      } else {
        ties.push(buildTie(stage, legs));
      }
    }

    ties.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
    rounds.push({ stage, ties });
  }

  return rounds;
}
