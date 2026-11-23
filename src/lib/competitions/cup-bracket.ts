/**
 * Turns a cup's knockout matches into ties, one row per pairing with the legs
 * aggregated.
 *
 * decisions/014-champions-league.md
 * decisions/015-finnish-cups.md
 */

import { listKnockoutStages } from "./cup-stages";

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
  /**
   * The provider's verdict on who went through, from this match's home side.
   * Breaks a level tie only; TASO gives it, football-data does not.
   *
   * decisions/015-finnish-cups.md
   */
  declaredWinner?: "home" | "away" | null;
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
   * Normal time plus extra time: the provider's `fullTime` includes the shootout.
   *
   * decisions/014-champions-league.md
   */
  homeGoals: number | null;
  awayGoals: number | null;
  /** The shootout, shown separately from the score above. Null when there was none. */
  penaltiesHome: number | null;
  penaltiesAway: number | null;
};

/**
 * How a decided tie was settled, for the `(ja)` / `(rp)` suffix. `declared`:
 * the provider named the winner without saying how, so it has no suffix.
 *
 * decisions/014-champions-league.md
 * decisions/015-finnish-cups.md
 */
export type TieDecision = "regular" | "extra_time" | "penalties" | "declared";

export type BracketTie = {
  /**
   * Stage, both team ids lowest-first, and the first leg's match id, which keeps
   * the key unique when a pairing is split into one tie per match.
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
  /** The deciding shootout from the tie's home side, not the leg's. Null without one. */
  penaltiesHome: number | null;
  penaltiesAway: number | null;
  winnerTeamProviderId: number | null;
  decision: TieDecision | null;
};

export type BracketRound = { stage: string; ties: BracketTie[] };

const FINISHED_STATUS = "FINISHED";

/**
 * A leg's score to aggregate: normal time plus extra time, as `fullTime`
 * includes a shootout. Without `regularTime` there was neither, so `fullTime` is it.
 *
 * decisions/014-champions-league.md
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
 * Sums the legs from the tie's home side, flipping a leg played the other way
 * round. An unscored or unfinished leg leaves the tie incomplete, not 0-0.
 *
 * decisions/014-champions-league.md
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
 * One tie from one pairing's legs. A single leg is normal: World Cup and Euro knockouts.
 *
 * decisions/014-champions-league.md
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
  const declared = declaredWinnerId(ordered, home, away);

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
      declared,
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
  declared,
}: {
  complete: boolean;
  aggregateHome: number;
  aggregateAway: number;
  home: BracketTeam;
  away: BracketTeam;
  wentToExtraTime: boolean;
  penalties: TieScore | null;
  declared: number | null;
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
    // No itemised shootout. A provider that names the winner anyway settles it;
    // otherwise the tie genuinely has no winner to show.
    return declared === null
      ? { winnerTeamProviderId: null, decision: null }
      : { winnerTeamProviderId: declared, decision: "declared" };
  }
  return {
    winnerTeamProviderId:
      penalties.home > penalties.away ? home.teamProviderId : away.teamProviderId,
    decision: "penalties",
  };
}

/**
 * The team the provider says went through, or null when it does not say. The
 * last leg that declares one decides, flipped to the tie's home side.
 *
 * decisions/015-finnish-cups.md
 */
function declaredWinnerId(
  legs: BracketSourceMatch[],
  home: BracketTeam,
  away: BracketTeam
): number | null {
  const decider = legs.findLast(
    (leg) => leg.declaredWinner === "home" || leg.declaredWinner === "away"
  );
  if (decider === undefined) return null;

  const legHomeIsTieHome = decider.homeTeamProviderId === home.teamProviderId;
  const tieHomeWon = decider.declaredWinner === (legHomeIsTieHome ? "home" : "away");
  return tieHomeWon ? home.teamProviderId : away.teamProviderId;
}

type TieScore = { home: number; away: number };

/**
 * The shootout from the tie's home side, which the deciding leg's own home side
 * need not be. Null when there was none or only one side was recorded.
 *
 * decisions/014-champions-league.md
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
 * Groups one round's matches by the unordered pair of teams that played them.
 *
 * decisions/014-champions-league.md
 */
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
 * One round's ties, earliest first. A pairing of more than two matches becomes
 * one tie per match, so a provider oddity stays visible.
 *
 * decisions/014-champions-league.md
 */
function buildRound(stage: string, stageMatches: BracketSourceMatch[]): BracketRound {
  const ties = pairLegs(stageMatches).flatMap((legs) =>
    legs.length > 2 ? legs.map((leg) => buildTie(stage, [leg])) : [buildTie(stage, legs)]
  );

  ties.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  return { stage, ties };
}

/**
 * A season's knockout rounds as ties, in progression order, read from the
 * matches so a new stage appears unasked. `stages` overrides that order, as
 * TASO's cups supply their own.
 *
 * decisions/014-champions-league.md
 */
export function buildBracket(
  matches: BracketSourceMatch[],
  stages: string[] = listKnockoutStages(matches)
): BracketRound[] {
  return stages.flatMap((stage) => {
    const stageMatches = matches.filter((match) => match.stage === stage);
    return stageMatches.length === 0 ? [] : [buildRound(stage, stageMatches)];
  });
}

/**
 * Reorders each round's ties so the drawn tree reads as one: a tie sits beside
 * the ties that fed it, and a tie feeding nothing keeps its order at the end.
 *
 * decisions/015-finnish-cups.md
 */
export function orderRoundsForTree(rounds: BracketRound[]): BracketRound[] {
  const ordered: BracketRound[] = [];
  let later: BracketRound | undefined;

  // Backwards, so each round is aligned against the one it feeds — which has
  // itself already been aligned.
  for (const round of [...rounds].reverse()) {
    const aligned = later === undefined ? round : alignAgainst(round, later);
    ordered.unshift(aligned);
    later = aligned;
  }

  return ordered;
}

/**
 * `earlier`'s ties, reordered to follow the participants of `later`'s.
 *
 * decisions/015-finnish-cups.md
 */
function alignAgainst(earlier: BracketRound, later: BracketRound): BracketRound {
  const remaining = [...earlier.ties];
  const aligned: BracketTie[] = [];

  for (const tie of later.ties) {
    for (const teamId of [tie.home.teamProviderId, tie.away.teamProviderId]) {
      const at = remaining.findIndex(
        (candidate) =>
          candidate.home.teamProviderId === teamId || candidate.away.teamProviderId === teamId
      );
      if (at !== -1) aligned.push(...remaining.splice(at, 1));
    }
  }

  return { ...earlier, ties: [...aligned, ...remaining] };
}
